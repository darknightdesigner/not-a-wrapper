"use client"

import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useMessages } from "@/lib/chat-store/messages/provider"
import { useChatSession } from "@/lib/chat-store/session/provider"
import type { Chat } from "@/lib/chat-store/types"
import { Pin, PinOff } from "@/lib/icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { useRouter } from "next/navigation"
import type React from "react"
import { useState } from "react"
import { DialogDeleteChat } from "./sidebar/dialog-delete-chat"

type ChatActionsMenuProps = {
  chat: Chat
  onRename?: () => void
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactElement
  contentAlign?: "start" | "center" | "end"
  contentSide?: "top" | "right" | "bottom" | "left"
}

export function ChatActionsMenu({
  chat,
  onRename,
  onOpenChange,
  trigger,
  contentAlign = "start",
  contentSide = "bottom",
}: ChatActionsMenuProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const { deleteMessages } = useMessages()
  const { deleteChat, togglePinned, updateTitle } = useChats()
  const { chatId } = useChatSession()
  const router = useRouter()
  const isMobile = useBreakpoint(768)

  const handleConfirmDelete = async () => {
    await deleteMessages()
    await deleteChat(chat.id, chatId || undefined, () => router.push("/"))
  }

  const handleRename = () => {
    if (onRename) {
      onRename()
      return
    }

    const nextTitle = window.prompt("Rename chat", chat.title || "Untitled chat")
    if (nextTitle === null) return

    const title = nextTitle.trim()
    if (!title || title === chat.title) return
    void updateTitle(chat.id, title)
  }

  const defaultTrigger = (
    <button
      className="hover:bg-secondary flex size-7 items-center justify-center rounded-md p-1"
      onClick={(e) => e.stopPropagation()}
      aria-label="Open chat actions"
    />
  )

  return (
    <>
      <DropdownMenu
        // shadcn/ui pointer-events-none issue on mobile
        modal={isMobile ? true : false}
        onOpenChange={onOpenChange}
      >
        <DropdownMenuTrigger render={trigger ?? defaultTrigger}>
          {!trigger && (
            <HugeiconsIcon icon={MoreHorizontalIcon} size={20} className="text-primary" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={contentSide}
          align={contentAlign}
          className="w-40"
          animated={false}
        >
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              togglePinned(chat.id, !chat.pinned)
            }}
          >
            {chat.pinned ? (
              <HugeiconsIcon icon={PinOff} size={16} className="mr-2" />
            ) : (
              <HugeiconsIcon icon={Pin} size={16} className="mr-2" />
            )}
            {chat.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handleRename()
            }}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={16} className="mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation()
              setIsDeleteDialogOpen(true)
            }}
          >
            <HugeiconsIcon icon={Delete01Icon} size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogDeleteChat
        isOpen={isDeleteDialogOpen}
        setIsOpen={setIsDeleteDialogOpen}
        chatTitle={chat.title || "Untitled chat"}
        onConfirmDelete={handleConfirmDelete}
      />
    </>
  )
}
