import { UIMessage as MessageType } from "@ai-sdk/react"
import { isStaticToolUIPart, getStaticToolName } from "ai"
import React, { useState } from "react"
import { MessageAssistant } from "./message-assistant"
import { MessageUser } from "./message-user"

// Attachment type for file parts
type MessageAttachment = {
  name: string
  contentType: string
  url: string
}

type MessageProps = {
  variant: MessageType["role"]
  children: string
  id: string
  attachments?: MessageAttachment[]
  isLast?: boolean
  onDelete: (id: string) => void
  onEdit: (id: string, newText: string) => Promise<void> | void
  onReload: () => void
  hasScrollAnchor?: boolean
  parts?: MessageType["parts"]
  status?: "streaming" | "ready" | "submitted" | "error"
  className?: string
  onQuote?: (text: string, messageId: string) => void
  messageGroupId?: string | null
  isUserAuthenticated?: boolean
  finishReason?: string
}

// --- Content-based equality helpers for React.memo ---

function getTextContent(parts: MessageType["parts"] | undefined): string {
  if (!parts) return ""
  let text = ""
  for (const part of parts) {
    if (part.type === "text") text += part.text
  }
  return text
}

function getReasoningContent(parts: MessageType["parts"] | undefined): string {
  if (!parts) return ""
  let text = ""
  for (const part of parts) {
    if (part.type === "reasoning") text += part.text
  }
  return text
}

function getToolSignature(parts: MessageType["parts"] | undefined): string {
  if (!parts) return ""
  let sig = ""
  for (const part of parts) {
    if (isStaticToolUIPart(part)) {
      sig += getStaticToolName(part) + ":" + part.state + ";"
    }
  }
  return sig
}

function areMessagesEqual(prev: MessageProps, next: MessageProps): boolean {
  if (prev.variant !== next.variant) return false
  if (prev.id !== next.id) return false

  // Content comparisons via parts
  if (getTextContent(prev.parts) !== getTextContent(next.parts)) return false
  if (getReasoningContent(prev.parts) !== getReasoningContent(next.parts)) return false
  if (getToolSignature(prev.parts) !== getToolSignature(next.parts)) return false

  // Fallback: if parts are both empty/undefined, compare children directly
  if (!prev.parts?.length && !next.parts?.length) {
    if (prev.children !== next.children) return false
  }
  // If parts matched but children diverged (shouldn't happen, but safety net)
  if (prev.children !== next.children) return false

  if (prev.isLast !== next.isLast) return false
  if (prev.status !== next.status) return false
  if (prev.finishReason !== next.finishReason) return false
  if (prev.hasScrollAnchor !== next.hasScrollAnchor) return false
  if (prev.className !== next.className) return false
  if (prev.messageGroupId !== next.messageGroupId) return false
  if (prev.isUserAuthenticated !== next.isUserAuthenticated) return false

  // Attachments: compare all rendered fields
  const prevLen = prev.attachments?.length ?? 0
  const nextLen = next.attachments?.length ?? 0
  if (prevLen !== nextLen) return false
  if (prev.attachments && next.attachments) {
    for (let i = 0; i < prevLen; i++) {
      const p = prev.attachments[i]
      const n = next.attachments[i]
      if (p.url !== n.url || p.name !== n.name || p.contentType !== n.contentType) return false
    }
  }

  return true
}

// --- Component ---

function MessageInner({
  variant,
  children,
  id,
  attachments,
  isLast,
  onEdit,
  onReload,
  hasScrollAnchor,
  parts,
  status,
  className,
  onQuote,
  messageGroupId,
  isUserAuthenticated,
  finishReason,
}: MessageProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 500)
  }

  if (variant === "user") {
    return (
      <MessageUser
        copied={copied}
        copyToClipboard={copyToClipboard}
        onReload={onReload}
        onEdit={onEdit}
        id={id}
        hasScrollAnchor={hasScrollAnchor}
        attachments={attachments}
        className={className}
        messageGroupId={messageGroupId}
        isUserAuthenticated={isUserAuthenticated}
      >
        {children}
      </MessageUser>
    )
  }

  if (variant === "assistant") {
    return (
      <MessageAssistant
        copied={copied}
        copyToClipboard={copyToClipboard}
        onReload={onReload}
        isLast={isLast}
        hasScrollAnchor={hasScrollAnchor}
        parts={parts}
        status={status}
        className={className}
        messageId={id}
        onQuote={onQuote}
        finishReason={finishReason}
      >
        {children}
      </MessageAssistant>
    )
  }

  return null
}

const MemoizedMessage = React.memo(MessageInner, areMessagesEqual)
export { MemoizedMessage as Message }
