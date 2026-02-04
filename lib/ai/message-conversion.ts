/**
 * AI SDK Message Format Conversion Utilities
 *
 * Provides runtime conversion between v4 (content string) and v5+ (parts array)
 * message formats to enable migration without database changes.
 *
 * Note: These utilities prepare for the v5 migration. The types will be updated
 * during the package upgrade when UIMessage changes to require parts instead of content.
 */

import type { UIMessage } from "ai"

// v4 message shape (what we currently have in storage)
interface V4Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt?: Date
  /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
  experimental_attachments?: Array<{
    name: string
    contentType: string
    url: string
  }>
}

/**
 * Type guard: Check if message has parts array (v5+ format)
 */
export function hasPartsArray(
  message: unknown
): message is UIMessage & { parts: NonNullable<UIMessage["parts"]> } {
  return (
    typeof message === "object" &&
    message !== null &&
    "parts" in message &&
    Array.isArray((message as UIMessage).parts) &&
    (message as UIMessage).parts!.length > 0
  )
}

/**
 * Convert v4 message format to v5 UIMessage format
 *
 * In v4: UIMessage extends Message which requires `content: string`
 * In v5: UIMessage will have `parts` as the primary format, with `content` derived
 *
 * This function creates the parts array structure that v5 expects.
 */
export function convertV4ToV5Message(v4Message: V4Message): UIMessage {
  const parts: UIMessage["parts"] = []

  // Convert content string to text part
  if (v4Message.content) {
    parts.push({ type: "text", text: v4Message.content })
  }

  // Convert experimental_attachments to file parts
  // In v4, FileUIPart uses { mimeType, data } not { mediaType, url }
  // We'll store as text placeholder since file format differs between versions
  /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
  if (v4Message.experimental_attachments?.length) {
    /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
    for (const att of v4Message.experimental_attachments) {
      // Store file metadata as a text marker for now
      // The actual attachment handling is done via experimental_attachments
      parts.push({
        type: "text",
        text: `[Attachment: ${att.name}]`,
      })
    }
  }

  /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
  return {
    id: v4Message.id,
    role: v4Message.role,
    content: v4Message.content, // Required in v4, will be derived in v5
    parts,
    createdAt: v4Message.createdAt,
    experimental_attachments: v4Message.experimental_attachments,
  };
}

/**
 * Batch convert messages, handling mixed formats gracefully
 *
 * If messages already have parts, they pass through unchanged.
 * If messages only have content, parts are created from content.
 */
export function ensureV5Format(messages: unknown[]): UIMessage[] {
  return messages.map((msg) => {
    const message = msg as V4Message | UIMessage

    // Already has valid parts array
    if (hasPartsArray(message)) {
      return message as UIMessage
    }

    // Needs conversion from v4 format
    return convertV4ToV5Message(message as V4Message)
  })
}

/**
 * Convert v4 attachments to the format expected by sendMessage in v5
 *
 * In v5, files are passed directly to sendMessage instead of experimental_attachments.
 * This prepares attachments for the v5 API.
 */
export function convertAttachmentsToFiles(
  attachments?: Array<{ name: string; contentType: string; url: string }>
): Array<{
  type: "file"
  filename: string
  mediaType: string
  url: string
}> | undefined {
  if (!attachments?.length) return undefined
  return attachments.map((att) => ({
    type: "file" as const,
    filename: att.name,
    mediaType: att.contentType,
    url: att.url,
  }))
}

/**
 * Extract text content from parts array
 *
 * Useful for backward compatibility when code expects message.content
 */
export function getTextFromParts(parts?: UIMessage["parts"]): string {
  if (!parts?.length) return ""
  return parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("")
}
