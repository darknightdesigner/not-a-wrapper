export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
] as const

export const ALLOWED_PROFILE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const

export function normalizeFileMimeType(mimeType: string | null | undefined) {
  return mimeType?.split(";")[0]?.trim().toLowerCase() ?? ""
}

export function isAllowedFileMimeType(mimeType: string | null | undefined) {
  return (ALLOWED_FILE_TYPES as readonly string[]).includes(
    normalizeFileMimeType(mimeType)
  )
}

const TEXTUAL_APPLICATION_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "application/json",
  "application/xml",
  "application/csv",
])

/**
 * Types whose bytes are already text. The server inlines these into the
 * prompt instead of sending a file part, which most provider SDKs reject
 * (LibreChat `isNativelyReadableText`, HuggingChat `TEXT_MIME_ALLOWLIST`).
 */
export function isTextLikeMediaType(mediaType: string | null | undefined) {
  const normalized = normalizeFileMimeType(mediaType)
  return (
    normalized.startsWith("text/") ||
    TEXTUAL_APPLICATION_MEDIA_TYPES.has(normalized)
  )
}

export function isImageMediaType(mediaType: string | null | undefined) {
  return normalizeFileMimeType(mediaType).startsWith("image/")
}

export function isPdfMediaType(mediaType: string | null | undefined) {
  return normalizeFileMimeType(mediaType) === "application/pdf"
}

/**
 * Whether a model route takes this file as a file part. Text-like files are
 * inlined as text first; images and PDFs need a vision route; any other file
 * is sent as a short note instead (app/api/chat/file-part-lowering.ts).
 */
export function routeTakesFile(
  mediaType: string | null | undefined,
  route: { vision?: boolean }
) {
  return (
    route.vision === true &&
    (isImageMediaType(mediaType) || isPdfMediaType(mediaType))
  )
}

export function isAllowedProfileImageMimeType(
  mimeType: string | null | undefined
) {
  return (ALLOWED_PROFILE_IMAGE_TYPES as readonly string[]).includes(
    normalizeFileMimeType(mimeType)
  )
}

/** Bytes needed to prefilter every ALLOWED_PROFILE_IMAGE_TYPES signature. */
export const PROFILE_IMAGE_SNIFF_BYTES = 12

function bytesAt(bytes: Uint8Array, offset: number, signature: number[]) {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * Magic-byte prefilter limited to the profile-image formats. This rejects
 * obvious mismatches cheaply; the server must still fully decode the image
 * before committing it because a signature alone does not prove validity.
 */
export function sniffProfileImageMimeType(bytes: Uint8Array): string | null {
  if (bytesAt(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (bytesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  // "GIF87a" or "GIF89a"
  if (
    bytesAt(bytes, 0, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif"
  }
  // "RIFF" <size> "WEBP"
  if (
    bytesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    bytesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp"
  }
  return null
}

/** Carries the URI-encoded file name to the attachment upload action. */
export const ATTACHMENT_NAME_HEADER = "X-Attachment-Name"

/** Marks a daily-limit 429 from the upload action, apart from a burst 429. */
export const DAILY_FILE_LIMIT_CODE = "DAILY_FILE_LIMIT_REACHED"
