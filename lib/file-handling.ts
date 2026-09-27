import { isImageMediaType } from "@/lib/file/policy"
import type { ConvexReactClient } from "convex/react"

export { ACCEPTED_FILE_PICKER_TYPES, validateFile } from "@/lib/file/validation"

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

export function uploadBinaryWithProgress(
  uploadUrl: string,
  file: File,
  options: Pick<UploadFileOptions, "signal" | "onProgress"> = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()

    xhr.open("POST", uploadUrl)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.responseType = "json"
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
      })
    })
    xhr.addEventListener("load", () => {
      options.signal?.removeEventListener("abort", abort)
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Failed to upload file (${xhr.status})`))
        return
      }
      const response = xhr.response as { storageId?: unknown } | null
      if (!response || typeof response.storageId !== "string") {
        reject(new Error("Upload response did not include a storage id"))
        return
      }
      resolve(response.storageId)
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

  const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {})
  if (!uploadUrl) {
    throw new FileUploadLimitError("Daily file upload limit reached.")
  }

  const storageId = await (options.uploadBinary ?? uploadBinaryWithProgress)(
    uploadUrl,
    file,
    options
  )

  // Staging is owner-bound but deliberately independent of a chat.
  const attachmentId = await convex.mutation(api.files.saveStagedAttachment, {
    storageId:
      storageId as unknown as typeof api.files.saveStagedAttachment._args.storageId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  })
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
    this.code = "DAILY_FILE_LIMIT_REACHED"
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
