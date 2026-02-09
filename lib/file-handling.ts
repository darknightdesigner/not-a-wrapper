import { toast } from "@/components/ui/toast"
import type { ConvexReactClient } from "convex/react"
import * as fileType from "file-type"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]

/**
 * MIME type → file extensions mapping for the HTML file picker accept attribute.
 * Browsers need both MIME types and extensions for reliable filtering.
 */
const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "text/csv": [".csv"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
}

/**
 * Comma-separated accept string for HTML `<input type="file" accept="...">`.
 * Derived from ALLOWED_FILE_TYPES so the file picker stays in sync with validation.
 */
export const ACCEPTED_FILE_PICKER_TYPES = ALLOWED_FILE_TYPES.flatMap((mime) => [
  mime,
  ...(MIME_TO_EXTENSIONS[mime] ?? []),
]).join(",")

export type Attachment = {
  name: string
  contentType: string
  url: string
}

export async function validateFile(
  file: File
): Promise<{ isValid: boolean; error?: string }> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
    }
  }

  const buffer = await file.arrayBuffer()
  const type = await fileType.fileTypeFromBuffer(
    Buffer.from(buffer.slice(0, 4100))
  )

  if (!type || !ALLOWED_FILE_TYPES.includes(type.mime)) {
    return {
      isValid: false,
      error: "File type not supported or doesn't match its extension",
    }
  }

  return { isValid: true }
}

// ============================================================================
// Convex File Operations
// ============================================================================

/**
 * Upload a file to Convex storage
 * 1. Generate an upload URL
 * 2. Upload the file directly to Convex storage
 * 3. Save attachment metadata in the database
 */
export async function uploadFileToConvex(
  convex: ConvexReactClient,
  file: File,
  chatId: string
): Promise<string> {
  // Import dynamically to avoid circular imports
  const { api } = await import("@/convex/_generated/api")

  // 1. Generate upload URL
  const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {})

  // 2. Upload file to Convex storage
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  })

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`)
  }

  const { storageId } = await response.json()

  // 3. Save attachment metadata
  await convex.mutation(api.files.saveAttachment, {
    chatId: chatId as unknown as typeof api.files.saveAttachment._args.chatId,
    storageId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  })

  // 4. Get the public URL for the file
  const fileUrl = await convex.query(api.files.getUrl, { storageId })
  if (!fileUrl) {
    throw new Error("Failed to get file URL after upload")
  }

  return fileUrl
}

// ============================================================================
// Common Operations
// ============================================================================

export function createAttachment(file: File, url: string): Attachment {
  return {
    name: file.name,
    contentType: file.type,
    url,
  }
}

/**
 * Process files for upload using Convex
 * @param files Files to process
 * @param chatId Chat ID for attaching files
 * @param convex Convex client for uploads
 */
export async function processFiles(
  files: File[],
  chatId: string,
  convex: ConvexReactClient
): Promise<Attachment[]> {
  const attachments: Attachment[] = []

  for (const file of files) {
    const validation = await validateFile(file)
    if (!validation.isValid) {
      console.warn(`File ${file.name} validation failed:`, validation.error)
      toast({
        title: "File validation failed",
        description: validation.error,
        status: "error",
      })
      continue
    }

    try {
      const url = await uploadFileToConvex(convex, file, chatId)
      attachments.push(createAttachment(file, url))
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error)
      toast({
        title: "File upload failed",
        description: `Failed to upload ${file.name}`,
        status: "error",
      })
    }
  }

  return attachments
}

export class FileUploadLimitError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.code = "DAILY_FILE_LIMIT_REACHED"
  }
}

/**
 * Check file upload limit using Convex
 */
export async function checkFileUploadLimit(
  convex: ConvexReactClient
): Promise<number> {
  const { api } = await import("@/convex/_generated/api")
  const result = await convex.query(api.files.checkUploadLimit, {})

  if (!result.canUpload) {
    throw new FileUploadLimitError("Daily file upload limit reached.")
  }

  return result.count
}
