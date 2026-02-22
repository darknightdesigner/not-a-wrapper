import { ScrollRootContent } from "@/components/ui/scroll-root"
import { Message as MessageContainer } from "@/components/ui/message"
import { ThinkingBar } from "@/components/ui/thinking-bar"
import { ExtendedMessageAISDK } from "@/lib/chat-store/messages/api"
import { UIMessage as MessageType } from "@ai-sdk/react"
import { Message } from "./message"

// v6 helper: Extract text content from all text parts in order.
// Tool-enabled responses can interleave multiple assistant text parts across
// steps; using only the first part makes responses appear truncated.
function getMessageText(message: MessageType): string {
  if (!message.parts || message.parts.length === 0) return ""

  let text = ""
  for (const part of message.parts) {
    if (part.type === "text" && "text" in part) {
      text += part.text
    }
  }
  return text
}

// Extract file attachments from parts array
function getMessageAttachments(
  message: MessageType
): Array<{ name: string; contentType: string; url: string }> | undefined {
  const fileParts = message.parts?.filter((p) => p.type === "file")
  if (!fileParts || fileParts.length === 0) return undefined
  return fileParts.map((p) => ({
    name: (p as { filename?: string }).filename || "file",
    contentType: (p as { mediaType?: string }).mediaType || "application/octet-stream",
    url: (p as { url?: string }).url || "",
  }))
}

type ConversationProps = {
  messages: MessageType[]
  status?: "streaming" | "ready" | "submitted" | "error"
  onDelete: (id: string) => void
  onEdit: (id: string, newText: string) => void
  onReload: () => void
  onStop?: () => void
  onQuote?: (text: string, messageId: string) => void
  isUserAuthenticated?: boolean
  lastFinishReason?: string
}

export function Conversation({
  messages,
  status = "ready",
  onDelete,
  onEdit,
  onReload,
  onStop,
  onQuote,
  isUserAuthenticated,
  lastFinishReason,
}: ConversationProps) {
  if (!messages || messages.length === 0)
    return <div className="w-full flex-1"></div>

  return (
    <ScrollRootContent className="relative flex w-full flex-1 flex-col items-center pt-4 pb-24">
      <div
        aria-hidden="true"
        data-edge="top"
        className="pointer-events-none absolute top-0 h-px w-px"
      />
      {messages?.map((message, index) => {
        const isLast =
          index === messages.length - 1 && status !== "submitted"

        return (
          <Message
            key={message.id}
            id={message.id}
            variant={message.role}
            attachments={getMessageAttachments(message)}
            isLast={isLast}
            onDelete={onDelete}
            onEdit={onEdit}
            onReload={onReload}
            onStop={isLast && status === "streaming" ? onStop : undefined}
            parts={message.parts}
            metadata={message.metadata as Record<string, unknown> | undefined}
            status={status}
            onQuote={onQuote}
            messageGroupId={
              (message as ExtendedMessageAISDK).message_group_id ?? null
            }
            isUserAuthenticated={isUserAuthenticated}
            finishReason={isLast ? lastFinishReason : undefined}
          >
            {getMessageText(message)}
          </Message>
        );
      })}
      {status === "submitted" &&
        messages.length > 0 &&
        messages[messages.length - 1].role === "user" && (
          <MessageContainer className="flex w-full max-w-[var(--thread-content-max-width,40rem)] flex-1 items-start gap-4 px-[var(--thread-content-margin,1rem)] pb-2">
            <div className="relative flex min-w-full flex-col gap-2">
              <ThinkingBar text="Thinking" onStop={onStop} />
            </div>
          </MessageContainer>
        )}
      <div
        aria-hidden="true"
        data-edge="bottom"
        className="pointer-events-none absolute bottom-0 h-px w-px"
      />
    </ScrollRootContent>
  );
}
