"use client"

import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogImage,
  MorphingDialogTrigger,
} from "@/components/motion-primitives/morphing-dialog"
import {
  MessageAction,
  MessageActions,
  Message as MessageContainer,
  MessageContent,
} from "@/components/ui/message"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { isConvexId } from "@/lib/chat-store/types"
import { cn } from "@/lib/utils"
import { UIMessage as MessageType } from "@ai-sdk/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Tick02Icon,
  Copy01Icon,
  PencilEdit01Icon,
  PencilEdit02Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import Image from "next/image"
import React, { useEffect, useRef, useState } from "react"
import { useScrollRoot } from "@/components/ui/scroll-root"

const getTextFromDataUrl = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1]
  return base64
}

// Attachment type for backward compatibility with v4 format
type MessageAttachment = {
  name: string
  contentType: string
  url: string
}

export type MessageUserProps = {
  attachments?: MessageAttachment[]
  children: string
  copied: boolean
  copyToClipboard: () => void
  id: string
  className?: string
  onReload?: () => void
  onEdit?: (id: string, newText: string) => void
  messageGroupId?: string | null
  isUserAuthenticated?: boolean
}

export function MessageUser({
  attachments,
  children,
  copied,
  copyToClipboard,
  id,
  className,
  onEdit,
  messageGroupId,
  isUserAuthenticated,
}: MessageUserProps) {
  const [editInput, setEditInput] = useState(children)
  const [isEditing, setIsEditing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const savedScrollTopRef = useRef<number | null>(null)
  const { stopScroll, scrollRef } = useScrollRoot()

  const handleEditCancel = () => {
    setIsEditing(false)
    setEditInput(children)
  }

  const handleSave = async () => {
    if (!editInput.trim()) return

    try {
      // Valid IDs: optimistic (pending sync) or Convex IDs (synced)
      const isValidId = id.startsWith("optimistic-") || isConvexId(id)
      if (id && !isValidId) {
        // Message ID is in an unexpected format — likely failed to sync
        toast({
          title: "Oops, something went wrong",
          description: "Please refresh your browser and try again.",
          status: "error",
        })
        return
      }
      onEdit?.(id, editInput)
    } catch {
      setEditInput(children) // Reset on failure
    } finally {
      setIsEditing(false)
    }
  }

  const handleEditStart = () => {
    savedScrollTopRef.current = scrollRef.current?.scrollTop ?? null
    setIsEditing(true)
    setEditInput(children)
  }

  // Auto-resize textarea on content change
  useEffect(() => {
    if (!isEditing) return
    const editTextarea = textareaRef.current
    if (!editTextarea) return
    editTextarea.style.height = "auto"
    editTextarea.style.height = `${editTextarea.scrollHeight}px`
  }, [editInput, isEditing])

  // Focus textarea and preserve scroll position when entering edit mode
  useEffect(() => {
    if (!isEditing) return
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true })
      stopScroll()
      const scrollEl = scrollRef.current
      if (scrollEl && savedScrollTopRef.current !== null) {
        scrollEl.scrollTop = savedScrollTopRef.current
        savedScrollTopRef.current = null
      }
    })
  }, [isEditing, stopScroll, scrollRef])

  const isMultiline = children.includes('\n')

  return (
    <MessageContainer
      className={cn(
        "group/message flex w-full max-w-[var(--thread-content-max-width,48rem)] flex-col items-end gap-0.5 px-[var(--thread-content-margin,1.5rem)] pb-2",
        className
      )}
      data-turn="user"
      data-message-id={id}
      tabIndex={-1}
    >
      <span className="sr-only">You said:</span>
      {attachments?.map((attachment, index) => (
        <div
          className="flex flex-row gap-2"
          key={`${attachment.name}-${index}`}
        >
          {attachment.contentType?.startsWith("image") ? (
            <MorphingDialog
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}
            >
              <MorphingDialogTrigger className="z-10">
                <Image
                  className="mb-1 w-40 rounded-md"
                  key={attachment.name}
                  src={attachment.url}
                  alt={attachment.name || "Attachment"}
                  width={160}
                  height={120}
                />
              </MorphingDialogTrigger>
              <MorphingDialogContainer>
                <MorphingDialogContent className="relative rounded-lg">
                  <MorphingDialogImage
                    src={attachment.url}
                    alt={attachment.name || ""}
                    className="max-h-[90vh] max-w-[90vw] object-contain"
                  />
                </MorphingDialogContent>
                <MorphingDialogClose className="text-primary" />
              </MorphingDialogContainer>
            </MorphingDialog>
          ) : attachment.contentType?.startsWith("text") ? (
            <div className="text-primary mb-3 h-24 w-40 overflow-hidden rounded-md border p-2 text-xs">
              {getTextFromDataUrl(attachment.url)}
            </div>
          ) : null}
        </div>
      ))}
      {isEditing ? (
        <div
          className="bg-accent relative flex w-full max-w-xl min-w-[180px] flex-col gap-2 rounded-[18px] px-4 py-2"
          style={{
            width: contentRef.current?.offsetWidth,
          }}
        >
          <textarea
            ref={textareaRef}
            className="w-full resize-none bg-transparent outline-none"
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSave()
              }
              if (e.key === "Escape") {
                handleEditCancel()
              }
            }}
            style={{
              maxHeight: "50vh",
              overflowY: "auto",
            }}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={handleEditCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!editInput.trim()}>
              Send
            </Button>
          </div>
        </div>
      ) : (
        <MessageContent
          className={cn(
            "bg-accent prose relative max-w-[var(--user-chat-width,70%)] rounded-[18px] px-4",
            isMultiline ? "py-3" : "py-1.5"
          )}
          markdown={true}
          ref={contentRef}
          components={{
            code: ({ children }) => <React.Fragment>{children}</React.Fragment>,
            pre: ({ children }) => <React.Fragment>{children}</React.Fragment>,
            h1: ({ children }) => <p>{children}</p>,
            h2: ({ children }) => <p>{children}</p>,
            h3: ({ children }) => <p>{children}</p>,
            h4: ({ children }) => <p>{children}</p>,
            h5: ({ children }) => <p>{children}</p>,
            h6: ({ children }) => <p>{children}</p>,
            p: ({ children }) => <p>{children}</p>,
            li: ({ children }) => (
              <div className="flex gap-2">
                <span className="shrink-0">-</span>
                <div className="min-w-0">{children}</div>
              </div>
            ),
            ul: ({ children }) => <React.Fragment>{children}</React.Fragment>,
            ol: ({ children }) => <React.Fragment>{children}</React.Fragment>,
          }}
        >
          {children}
        </MessageContent>
      )}
      <MessageActions className="invisible flex gap-0 opacity-0 transition-opacity group-hover/message:visible group-hover/message:opacity-100">
        <MessageAction tooltip={copied ? "Copied!" : "Copy text"} side="bottom">
          <button
            className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg bg-transparent transition"
            aria-label="Copy text"
            onClick={copyToClipboard}
            type="button"
          >
{copied ? (
              <HugeiconsIcon icon={Tick02Icon} size={20} className="size-5" />
            ) : (
              <HugeiconsIcon icon={Copy01Icon} size={20} className="size-5" />
            )}
          </button>
        </MessageAction>
        {messageGroupId === null && isUserAuthenticated && (
          // Enabled if NOT multi-model chat & user is Authenticated
          <MessageAction
            tooltip={isEditing ? "Cancel edit" : "Edit message"}
            side="bottom"
            delay={0}
          >
            <button
              className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg bg-transparent transition"
              aria-label={isEditing ? "Cancel edit" : "Edit message"}
              onClick={isEditing ? handleEditCancel : handleEditStart}
              type="button"
            >
              {isEditing ? (
                <HugeiconsIcon icon={PencilEdit02Icon} size={20} className="size-5" />
              ) : (
                <HugeiconsIcon icon={PencilEdit01Icon} size={20} className="size-5" />
              )}
            </button>
          </MessageAction>
        )}
      </MessageActions>
    </MessageContainer>
  )
}
