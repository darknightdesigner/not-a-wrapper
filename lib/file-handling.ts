import {
  ATTACHMENT_NAME_HEADER,
  DAILY_FILE_LIMIT_CODE,
  isImageMediaType,
} from "@/lib/file/policy"
import type { ConvexReactClient } from "convex/react"

export {
  ACCEPTED_FILE_PICKER_TYPES,
  TEXT_FILE_PICKER_TYPES,
  validateFile,
} from "@/lib/file/validation"

/** A staged image that never commits fails its upload instead of blocking Send. */
const STAGED_IMAGE_READY_TIMEOUT_MS = 60_000
const UPLOAD_FAILED_MESSAGE = "Upload failed. Please try again."
/** The server drops a staged image it cannot resize (files.rejectStagedImage). */
const IMAGE_REJECTED_MESSAGE = "This image is too large or can't be read."

export type Attachment = {
  name: string
  contentType: string
  url: string
  attachmentId?: string
}

export type FileUploadProgress = {
  loaded: number
  total: number
  percent: number
}

export type UploadFileOptions = {
  signal?: AbortSignal
  onProgress?: (progress: FileUploadProgress) => void
  uploadBinary?: typeof uploadBinaryWithProgress
}

/** An upload target from `files.generateUploadUrl`, bound to its caller. */
export type AttachmentUploadTarget = { url: string; ticket: string }

/**
 * Upload one file to the attachment upload action, which stores and stages it
 * in one request (ADR-0046). Resolves its attachment id, or null when the
 * server refuses it over the daily limit. A cancel after the body is sent
 * no longer aborts: the server stages the file anyway, so the id still
 * resolves and the caller releases it.
 */
export function uploadBinaryWithProgress(
  target: AttachmentUploadTarget,
  file: File,
  options: Pick<UploadFileOptions, "signal" | "onProgress"> = {}
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let bodySent = false
    const abort = () => {
      if (!bodySent) xhr.abort()
    }

    xhr.open("POST", target.url)
    xhr.setRequestHeader("Authorization", `Bearer ${target.ticket}`)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.setRequestHeader(ATTACHMENT_NAME_HEADER, encodeURIComponent(file.name))
    xhr.responseType = "json"
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
      })
    })
    xhr.upload.addEventListener("load", () => {
      bodySent = true
    })
    xhr.addEventListener("load", () => {
      options.signal?.removeEventListener("abort", abort)
      const response = xhr.response as {
        attachmentId?: unknown
        code?: unknown
      } | null
      if (xhr.status === 429 && response?.code === DAILY_FILE_LIMIT_CODE) {
        resolve(null)
        return
      }
      if (xhr.status === 429) {
        reject(new Error("Too many uploads. Try again in a minute."))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Failed to upload file (${xhr.status})`))
        return
      }
      if (!response || typeof response.attachmentId !== "string") {
        reject(new Error("Upload response did not include an attachment id"))
        return
      }
      resolve(response.attachmentId)
    })
    xhr.addEventListener("error", () => {
      options.signal?.removeEventListener("abort", abort)
      reject(new Error("File upload failed"))
    })
    xhr.addEventListener("abort", () => {
      options.signal?.removeEventListener("abort", abort)
      reject(new DOMException("Upload cancelled", "AbortError"))
    })

    if (options.signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"))
      return
    }
    options.signal?.addEventListener("abort", abort, { once: true })
    xhr.send(file)
  })
}

export async function uploadStagedFile(
  convex: ConvexReactClient,
  file: File,
  options: UploadFileOptions = {}
): Promise<{ fileUrl: string; attachmentId: string }> {
  // Dynamic import avoids the file/Convex API cycle.
  const { api } = await import("@/convex/_generated/api")

  const target = await convex.mutation(api.files.generateUploadUrl, {})
  if (!target) {
    throw new FileUploadLimitError("Daily file upload limit reached.")
  }

  // Staging is owner-bound but deliberately independent of a chat. The
  // server stages the file it stored, so the browser never names a blob.
  const attachmentId = await (options.uploadBinary ?? uploadBinaryWithProgress)(
    target,
    file,
    options
  )
  if (!attachmentId) {
    throw new FileUploadLimitError("Daily file upload limit reached.")
  }
  // The server resizes staged images before they can be bound to a turn.
  if (isImageMediaType(file.type)) {
    try {
      await waitForStagedAttachment(convex, attachmentId, options.signal)
    } catch (error) {
      // Cancelled or failed: release the row and its daily upload slot.
      void deleteUploadedAttachment(convex, attachmentId).catch(() => {})
      throw error
    }
  }

  // Preview through a same-origin owner-checked route. The canonical storage
  // URL is returned only after the staged set is bound to a chat at Send.
  const fileUrl = `/api/files/${attachmentId}/preview`

  return { fileUrl, attachmentId }
}

async function waitForStagedAttachment(
  convex: ConvexReactClient,
  attachmentId: string,
  signal?: AbortSignal
): Promise<void> {
  const { api } = await import("@/convex/_generated/api")
  const watch = convex.watchQuery(api.files.getStagedAttachmentStatus, {
    attachmentId:
      attachmentId as unknown as typeof api.files.getStagedAttachmentStatus._args.attachmentId,
  })

  await new Promise<void>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    const settle = (error?: Error) => {
      unsubscribe?.()
      clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () =>
      settle(new DOMException("Upload cancelled", "AbortError"))
    const timeout = setTimeout(
      () => settle(new Error(UPLOAD_FAILED_MESSAGE)),
      STAGED_IMAGE_READY_TIMEOUT_MS
    )
    const check = () => {
      try {
        const status = watch.localQueryResult()
        if (status === "ready") settle()
        else if (status === null) settle(new Error(IMAGE_REJECTED_MESSAGE))
      } catch {
        settle(new Error(UPLOAD_FAILED_MESSAGE))
      }
    }

    if (signal?.aborted) return onAbort()
    signal?.addEventListener("abort", onAbort, { once: true })
    unsubscribe = watch.onUpdate(check)
    check()
  })
}

export async function attachStagedFilesToChat(
  convex: ConvexReactClient,
  chatId: string,
  attachmentIds: string[]
): Promise<Attachment[]> {
  if (attachmentIds.length === 0) return []
  const { api } = await import("@/convex/_generated/api")
  return await convex.mutation(api.files.attachStagedFiles, {
    chatId,
    attachmentIds:
      attachmentIds as unknown as typeof api.files.attachStagedFiles._args.attachmentIds,
  })
}

export async function deleteUploadedAttachment(
  convex: ConvexReactClient,
  attachmentId: string
): Promise<void> {
  const { api } = await import("@/convex/_generated/api")
  await convex.mutation(api.files.deleteFile, {
    attachmentId:
      attachmentId as unknown as typeof api.files.deleteFile._args.attachmentId,
  })
}

export class FileUploadLimitError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.code = DAILY_FILE_LIMIT_CODE
  }
}

export async function checkFileUploadLimit(
  convex: ConvexReactClient
): Promise<{ count: number; limit: number | null; canUpload: boolean }> {
  const { api } = await import("@/convex/_generated/api")
  const result = await convex.query(api.files.checkUploadLimit, {})

  if (!result.canUpload) {
    throw new FileUploadLimitError("Daily file upload limit reached.")
  }

  return {
    count: result.count ?? 0,
    limit: result.limit,
    canUpload: result.canUpload,
  }
}
