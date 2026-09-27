import * as fileType from "file-type"
import {
  ALLOWED_FILE_TYPES,
  isAllowedFileMimeType,
  isTextLikeMediaType,
  MAX_FILE_SIZE,
} from "./policy"

export { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "./policy"

/**
 * Browsers need MIME types and extensions for reliable picker filtering.
 * Keyed by the allowed types, so the two lists cannot drift.
 */
export const MIME_TO_EXTENSIONS: Record<
  (typeof ALLOWED_FILE_TYPES)[number],
  readonly string[]
> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "text/csv": [".csv"],
}

/** Derived from validation policy so picker filtering cannot drift. */
export const ACCEPTED_FILE_PICKER_TYPES = ALLOWED_FILE_TYPES.flatMap((mime) => [
  mime,
  ...MIME_TO_EXTENSIONS[mime],
]).join(",")

export type FileValidationResult = {
  isValid: boolean
  error?: string
}

function isLikelyText(header: Uint8Array): boolean {
  return header.every(
    (byte) => byte === 0x09 || byte === 0x0a || byte === 0x0d || byte >= 0x20
  )
}

export async function validateFile(file: File): Promise<FileValidationResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
    }
  }

  const header = new Uint8Array(await file.slice(0, 4100).arrayBuffer())
  const type = await fileType.fileTypeFromBuffer(header)

  if (type && isAllowedFileMimeType(type.mime)) {
    return { isValid: true }
  }

  const canUseTextFallback =
    !type &&
    isAllowedFileMimeType(file.type) &&
    isTextLikeMediaType(file.type) &&
    isLikelyText(header)

  if (!canUseTextFallback) {
    return {
      isValid: false,
      error: "File type not supported or doesn't match its extension",
    }
  }

  return { isValid: true }
}
