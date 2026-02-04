/**
 * AI SDK Message Format Conversion Utilities
 *
 * Provides runtime conversion between v4 (content string) and v6+ (parts array)
 * message formats to enable migration without database changes.
 *
 * Note: These utilities keep content-only messages compatible with parts-based
 * rendering and storage.
 */

import type { UIMessage } from "ai"

// v4 message shape (content-only messages)
interface V4Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt?: Date
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
 * Convert v4 message format to UIMessage parts format
 *
 * In v4: UIMessage extends Message which requires `content: string`
 * In v6: UIMessage uses `parts` as the primary format, with `content` derived
 *
 * This function creates the parts array structure that v5 expects.
 */
export function convertV4ToV5Message(v4Message: V4Message): UIMessage {
  const parts: UIMessage["parts"] = []

  // Convert content string to text part
  if (v4Message.content) {
    parts.push({ type: "text", text: v4Message.content })
  }

  // In v6, UIMessage has parts instead of content. The extended types in
  // lib/chat-store/messages/api.ts add optional content for compatibility,
  // but the core UIMessage only needs parts.
  return {
    id: v4Message.id,
    role: v4Message.role,
    parts,
    createdAt: v4Message.createdAt,
  } as UIMessage;
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
 * Convert attachments to the format expected by sendMessage
 *
 * In v6, files are passed directly to sendMessage as file parts.
 * This prepares attachments for the sendMessage API.
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
