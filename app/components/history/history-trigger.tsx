"use client"

import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useMessages } from "@/lib/chat-store/messages/provider"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { SearchList01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { useRouter } from "next/navigation"
import {
  cloneElement,
  isValidElement,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react"
import { CommandHistory } from "./command-history"
import { DrawerHistory } from "./drawer-history"

type HistoryTriggerElementProps = {
  onClick?: (event: MouseEvent<HTMLElement>) => void
  "aria-label"?: string
  tabIndex?: number
}

type HistoryTriggerProps = {
  hasSidebar: boolean
  trigger?: ReactElement<HistoryTriggerElementProps>
  classNameTrigger?: string
  icon?: React.ReactNode
  label?: React.ReactNode | string
  trailing?: React.ReactNode
  hasPopover?: boolean
}

export function HistoryTrigger({
  hasSidebar,
  trigger,
  classNameTrigger,
  icon,
  label,
  trailing,
  hasPopover = true,
}: HistoryTriggerProps) {
  const isMobile = useBreakpoint(768)
  const router = useRouter()
  const { chats, updateTitle, deleteChat } = useChats()
  const { deleteMessages } = useMessages()
  const [isOpen, setIsOpen] = useState(false)
  const { chatId } = useChatSession()

  const handleSaveEdit = async (id: string, newTitle: string) => {
    await updateTitle(id, newTitle)
  }

  const handleConfirmDelete = async (id: string) => {
    if (id === chatId) {
      setIsOpen(false)
    }
    await deleteMessages()
    await deleteChat(id, chatId!, () => router.push("/"))
  }

  const handleOpen = () => setIsOpen(true)
  const hasCustomTriggerClass = !!classNameTrigger
  const defaultTrigger = trigger && isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: (event: MouseEvent<HTMLElement>) => {
          if (typeof trigger.props.onClick === "function") {
            trigger.props.onClick(event)
          }
          handleOpen()
        },
        "aria-label": trigger.props["aria-label"] ?? "Search",
        tabIndex: isMobile ? -1 : trigger.props.tabIndex,
      })
    : (
      <button
        className={cn(
          !hasCustomTriggerClass &&
            "text-muted-foreground hover:text-foreground hover:bg-muted bg-background pointer-events-auto rounded-full p-1.5",
          hasSidebar ? "hidden" : "block",
          classNameTrigger
        )}
        type="button"
        onClick={handleOpen}
        aria-label="Search"
        tabIndex={isMobile ? -1 : 0}
      >
        {icon || <HugeiconsIcon icon={SearchList01Icon} size={24} className="size-6" />}
        {label}
        {trailing}
      </button>
    )

  if (isMobile) {
    return (
      <DrawerHistory
        chatHistory={chats}
        onSaveEdit={handleSaveEdit}
        onConfirmDelete={handleConfirmDelete}
        trigger={defaultTrigger}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    )
  }

  return (
    <CommandHistory
      chatHistory={chats}
      onSaveEdit={handleSaveEdit}
      onConfirmDelete={handleConfirmDelete}
      trigger={defaultTrigger}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onOpenChange={setIsOpen}
      hasPopover={hasPopover}
    />
  )
}
