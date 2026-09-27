import { isTextLikeMediaType } from "@/lib/file/policy"
import type { UIMessage } from "ai"

const MAX_TEXT_FILE_MODEL_INPUT_BYTES = 128 * 1024
const MAX_TEXT_FILE_MODEL_INPUT_FILES = 4
const MAX_TEXT_FILE_MODEL_INPUT_TOTAL_BYTES = 256 * 1024
const TEXT_FILE_FETCH_TIMEOUT_MS = 5_000
const TEXT_FILE_CONVERSION_TIMEOUT_MS = 8_000

type MessagePart = UIMessage["parts"][number]

export type TextFileModelInputResult = {
  messages: UIMessage[]
  convertedCount: number
  failedCount: number
  truncatedCount: number
  skippedCount: number
}

export type TextFilePartReference = {
  attachmentId?: string
  url?: string
}

export type TrustedTextFileAttachment = {
  attachmentId: string
  url: string
  filename?: string
  mediaType?: string
  size?: number
}

type FetchTextFileOptions = {
  fetchImpl?: typeof fetch
  maxBytes?: number
  maxFiles?: number
  maxTotalBytes?: number
  timeoutMs?: number
  overallTimeoutMs?: number
  trustedAttachments?: readonly TrustedTextFileAttachment[]
}

type ResolvedFetchTextFileOptions = Required<FetchTextFileOptions>

function isTextLikeFilePart(part: MessagePart): boolean {
  return part.type === "file" && isTextLikeMediaType(part.mediaType)
}

function getFileName(part: MessagePart): string {
  const filename = (part as { filename?: unknown }).filename
  return typeof filename === "string" && filename.trim().length > 0
    ? filename.trim()
    : "attached text file"
}

function getFileUrl(part: MessagePart): string | null {
  const url = (part as { url?: unknown }).url
  return typeof url === "string" && url.length > 0 ? url : null
}

function getAttachmentId(part: MessagePart): string | null {
  const attachmentId = (part as { attachmentId?: unknown }).attachmentId
  return typeof attachmentId === "string" && attachmentId.length > 0
    ? attachmentId
    : null
}

function findTrustedAttachment(
  part: MessagePart,
  trustedAttachments: readonly TrustedTextFileAttachment[]
): TrustedTextFileAttachment | null {
  const attachmentId = getAttachmentId(part)
  if (attachmentId) {
    const match = trustedAttachments.find(
      (attachment) => attachment.attachmentId === attachmentId
    )
    if (match) return match
  }

  const url = getFileUrl(part)
  if (!url) return null

  return trustedAttachments.find((attachment) => attachment.url === url) ?? null
}

export function getTextFilePartReferences(
  messages: readonly UIMessage[]
): TextFilePartReference[] {
  return getFilePartReferences(messages, isTextLikeMediaType)
}

/** Lookup keys for the file parts whose media type `include` selects. */
export function getFilePartReferences(
  messages: readonly UIMessage[],
  include: (mediaType: string) => boolean
): TextFilePartReference[] {
  const references: TextFilePartReference[] = []

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "file" || !include(part.mediaType)) continue

      const attachmentId = getAttachmentId(part)
      const url = getFileUrl(part)
      if (!attachmentId && !url) continue

      references.push({
        ...(attachmentId ? { attachmentId } : {}),
        ...(url ? { url } : {}),
      })
    }
  }

  return references
}

function getLatestUserMessageIndex(messages: readonly UIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index
  }
  return -1
}

function decodeUtf8WithoutPartialTrailingCharacter(
  bytes: Uint8Array,
  maxBytes: number
): string {
  const slice = bytes.slice(0, maxBytes)
  const decoder = new TextDecoder("utf-8", { fatal: true })

  for (let trim = 0; trim <= 3; trim += 1) {
    const end = slice.length - trim
    if (end < 0) break
    try {
      return decoder.decode(slice.slice(0, end))
    } catch {
      // Try dropping one more trailing byte in case the cap split a code point.
    }
  }

  return new TextDecoder().decode(slice)
}

async function readResponseBytes(
  response: Response,
  maxBytes: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const contentLength = response.headers.get("content-length")
  const expectedBytes = contentLength ? Number(contentLength) : null
  const expectedTruncated =
    expectedBytes !== null &&
    Number.isFinite(expectedBytes) &&
    expectedBytes > maxBytes

  if (!response.body) {
    if (
      expectedBytes === null ||
      !Number.isFinite(expectedBytes) ||
      expectedBytes > maxBytes
    ) {
      throw new Error("Text attachment response is not streamable")
    }
    const buffer = new Uint8Array(await response.arrayBuffer())
    return {
      bytes: buffer.slice(0, maxBytes),
      truncated: buffer.byteLength > maxBytes || expectedTruncated,
    }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let truncated = expectedTruncated
  const readLimit = maxBytes + 1

  try {
    while (totalBytes < readLimit) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      const remaining = readLimit - totalBytes
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining))
        totalBytes += remaining
        truncated = true
        break
      }

      chunks.push(value)
      totalBytes += value.byteLength
    }
  } finally {
    if (totalBytes >= readLimit) {
      truncated = true
      await reader.cancel().catch(() => {})
    }
  }

  const combined = new Uint8Array(Math.min(totalBytes, readLimit))
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    bytes: combined.slice(0, maxBytes),
    truncated,
  }
}

async function readPlainTextFile(
  url: string,
  options: Pick<
    ResolvedFetchTextFileOptions,
    "fetchImpl" | "maxBytes" | "timeoutMs"
  >
): Promise<{ text: string; truncated: boolean; byteLength: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const response = await options.fetchImpl(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Failed to fetch text attachment (${response.status})`)
    }

    const { bytes, truncated } = await readResponseBytes(
      response,
      options.maxBytes
    )
    return {
      text: decodeUtf8WithoutPartialTrailingCharacter(bytes, options.maxBytes),
      truncated,
      byteLength: bytes.byteLength,
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Timed out reading text attachment")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function skippedTextFilePartToPromptText(filename: string): string {
  return `Attached text file "${filename}" was provided earlier in the conversation and was not re-read for this turn.`
}

function textFilePartToPromptText(args: {
  filename: string
  text?: string
  truncated?: boolean
  error?: string
  maxBytes: number
}): string {
  if (args.error) {
    return `Attached text file "${args.filename}" could not be read for model input: ${args.error}`
  }

  const truncationNote = args.truncated
    ? `\n\n[File content truncated to ${args.maxBytes} bytes for model input.]`
    : ""

  return `Attached text file "${args.filename}":\n\n${args.text ?? ""}${truncationNote}`
}

/**
 * Inline every text-like file part as text. The file, byte, and time budgets
 * are spent newest message first so the current turn's files always fit; an
 * older file that no longer fits gets a short "not re-read" note instead of
 * an error. The output keeps the original message order.
 */
export async function prepareTextFilePartsForModelInput(
  messages: readonly UIMessage[],
  options: FetchTextFileOptions = {}
): Promise<TextFileModelInputResult> {
  const resolvedOptions: ResolvedFetchTextFileOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    maxBytes: options.maxBytes ?? MAX_TEXT_FILE_MODEL_INPUT_BYTES,
    maxFiles: options.maxFiles ?? MAX_TEXT_FILE_MODEL_INPUT_FILES,
    maxTotalBytes:
      options.maxTotalBytes ?? MAX_TEXT_FILE_MODEL_INPUT_TOTAL_BYTES,
    timeoutMs: options.timeoutMs ?? TEXT_FILE_FETCH_TIMEOUT_MS,
    overallTimeoutMs:
      options.overallTimeoutMs ?? TEXT_FILE_CONVERSION_TIMEOUT_MS,
    trustedAttachments: options.trustedAttachments ?? [],
  }
  let convertedCount = 0
  let failedCount = 0
  let truncatedCount = 0
  let skippedCount = 0
  let fetchedFileCount = 0
  let remainingTotalBytes = Math.max(0, resolvedOptions.maxTotalBytes)
  const latestUserMessageIndex = getLatestUserMessageIndex(messages)
  const deadlineMs = Date.now() + resolvedOptions.overallTimeoutMs

  const failed = (filename: string, error: string): string => {
    failedCount += 1
    return textFilePartToPromptText({
      filename,
      error,
      maxBytes: resolvedOptions.maxBytes,
    })
  }

  const convert = async (
    part: MessagePart,
    isCurrentTurn: boolean
  ): Promise<string> => {
    const filename = getFileName(part)
    const remainingTimeMs = deadlineMs - Date.now()
    const exhaustedBudget =
      fetchedFileCount >= resolvedOptions.maxFiles
        ? `text attachment limit exceeded (${resolvedOptions.maxFiles} files per request)`
        : remainingTotalBytes <= 0
          ? `text attachment byte budget exceeded (${resolvedOptions.maxTotalBytes} bytes per request)`
          : remainingTimeMs <= 0
            ? "Text attachment conversion deadline exceeded"
            : null

    if (exhaustedBudget && !isCurrentTurn) {
      skippedCount += 1
      return skippedTextFilePartToPromptText(filename)
    }

    convertedCount += 1
    if (exhaustedBudget) return failed(filename, exhaustedBudget)

    const trustedAttachment = findTrustedAttachment(
      part,
      resolvedOptions.trustedAttachments
    )
    if (!trustedAttachment) {
      return failed(filename, "attachment is not available for model input")
    }

    try {
      fetchedFileCount += 1
      const maxBytes = Math.min(resolvedOptions.maxBytes, remainingTotalBytes)
      const { text, truncated, byteLength } = await readPlainTextFile(
        trustedAttachment.url,
        {
          fetchImpl: resolvedOptions.fetchImpl,
          maxBytes,
          timeoutMs: Math.min(resolvedOptions.timeoutMs, remainingTimeMs),
        }
      )
      remainingTotalBytes -= byteLength
      if (truncated) truncatedCount += 1
      return textFilePartToPromptText({ filename, text, truncated, maxBytes })
    } catch (error) {
      return failed(
        filename,
        error instanceof Error && error.message.length > 0
          ? error.message
          : "unknown error"
      )
    }
  }

  const replacements = new Map<string, string>()
  for (const [index, message] of [...messages.entries()].reverse()) {
    for (const [partIndex, part] of message.parts.entries()) {
      if (!isTextLikeFilePart(part)) continue
      replacements.set(
        `${index}:${partIndex}`,
        await convert(part, index === latestUserMessageIndex)
      )
    }
  }

  return {
    messages: messages.map((message, index) =>
      message.parts.some(isTextLikeFilePart)
        ? {
            ...message,
            parts: message.parts.map((part, partIndex) => {
              const text = replacements.get(`${index}:${partIndex}`)
              return text === undefined ? part : { type: "text" as const, text }
            }),
          }
        : message
    ),
    convertedCount,
    failedCount,
    truncatedCount,
    skippedCount,
  }
}
