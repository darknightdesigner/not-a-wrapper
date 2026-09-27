import * as fileType from "file-type"
import {
  ALLOWED_FILE_TYPES,
  isAllowedFileMimeType,
  isTextLikeMediaType,
  MAX_FILE_SIZE,
  normalizeFileMimeType,
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

export type FileValidationResult =
  | {
      isValid: true
      /** The file to upload, typed by its content rather than the browser. */
      file: File
      error?: never
    }
  | { isValid: false; error: string }

const UNSUPPORTED_TYPE_ERROR =
  "File type not supported or doesn't match its extension"

function isLikelyText(header: Uint8Array): boolean {
  return header.every(
    (byte) => byte === 0x09 || byte === 0x0a || byte === 0x0d || byte >= 0x20
  )
}

/**
 * The allowed text-like type for a file with no binary signature. Browsers
 * report these inconsistently (Windows with Excel reports .csv as
 * application/vnd.ms-excel, and .md is often empty), so the extension wins
 * over the reported type (LibreChat `inferMimeType`).
 */
function textMediaTypeFor(file: File): string | undefined {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
  const byExtension =
    extension &&
    ALLOWED_FILE_TYPES.find(
      (mime) =>
        isTextLikeMediaType(mime) &&
        MIME_TO_EXTENSIONS[mime].includes(extension)
    )
  if (byExtension) return byExtension
  const reported = normalizeFileMimeType(file.type)
  return isAllowedFileMimeType(reported) && isTextLikeMediaType(reported)
    ? reported
    : undefined
}

function withMediaType(file: File, mediaType: string): File {
  return file.type === mediaType
    ? file
    : new File([file], file.name, {
        type: mediaType,
        lastModified: file.lastModified,
      })
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
  if (type) {
    return isAllowedFileMimeType(type.mime)
      ? { isValid: true, file: withMediaType(file, type.mime) }
      : { isValid: false, error: UNSUPPORTED_TYPE_ERROR }
  }

  const textType = textMediaTypeFor(file)
  return textType && isLikelyText(header)
    ? { isValid: true, file: withMediaType(file, textType) }
    : { isValid: false, error: UNSUPPORTED_TYPE_ERROR }
}
