import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import useClickOutside from "@/app/hooks/use-click-outside"
import { useChats } from "@/lib/chat-store/chats/provider"
import { Chat } from "@/lib/chat-store/types"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, Cancel01Icon } from "@hugeicons-pro/core-stroke-rounded"
import Link from "next/link"
import { useCallback, useMemo, useRef, useState } from "react"
import { SidebarItemMenu } from "./sidebar-item-menu"

type SidebarItemProps = {
  chat: Chat
  currentChatId: string
}

export function SidebarItem({ chat, currentChatId }: SidebarItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(chat.title || "")
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [prevChatTitle, setPrevChatTitle] = useState(chat.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const { updateTitle } = useChats()
  const isMobile = useBreakpoint(768)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // React 19 pattern: sync during render instead of useEffect
  if (!isEditing && chat.title !== prevChatTitle) {
    setPrevChatTitle(chat.title)
    setEditTitle(chat.title || "")
  }

  const handleStartEditing = useCallback(() => {
    setIsEditing(true)
    setEditTitle(chat.title || "")

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    })
  }, [chat.title])

  const handleSave = useCallback(async () => {
    setIsEditing(false)
    setIsMenuOpen(false)
    await updateTitle(chat.id, editTitle)
  }, [chat.id, editTitle, updateTitle])

  const handleCancel = useCallback(() => {
    setEditTitle(chat.title || "")
    setIsEditing(false)
    setIsMenuOpen(false)
  }, [chat.title])

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setIsMenuOpen(open)
  }, [])

  const handleClickOutside = useCallback(() => {
    if (isEditing) {
      handleSave()
    }
  }, [isEditing, handleSave])

  useClickOutside(containerRef, handleClickOutside)

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditTitle(e.target.value)
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSave()
      } else if (e.key === "Escape") {
        e.preventDefault()
        handleCancel()
      }
    },
    [handleSave, handleCancel]
  )

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) {
        e.stopPropagation()
      }
    },
    [isEditing]
  )

  const handleSaveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      handleSave()
    },
    [handleSave]
  )

  const handleCancelClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      handleCancel()
    },
    [handleCancel]
  )

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // Memoize computed values
  const isCurrentChat = useMemo(
    () => chat.id === currentChatId,
    [chat.id, currentChatId]
  )

  const isActive = useMemo(
    () => isCurrentChat || isEditing || isMenuOpen,
    [isCurrentChat, isEditing, isMenuOpen]
  )

  const displayTitle = useMemo(
    () => chat.title || "Untitled Chat",
    [chat.title]
  )

  const containerClassName = useMemo(
    () =>
      cn(
        "group/sidebar-row relative w-full rounded-(--sidebar-history-row-radius)",
        "text-sm text-primary",
        "hover:bg-accent/80 hover:text-foreground",
        "focus-within:bg-accent/80 focus-within:text-foreground",
        isActive && "bg-accent text-foreground hover:bg-accent"
      ),
    [isActive]
  )

  const menuClassName = useMemo(
    () =>
      cn(
        "flex items-center justify-center transition-opacity",
        isMobile || isMenuOpen
          ? "opacity-100"
          : "opacity-0 group-hover/sidebar-row:opacity-100 group-focus-within/sidebar-row:opacity-100"
      ),
    [isMobile, isMenuOpen]
  )

  return (
    <div
      className={containerClassName}
      onClick={handleContainerClick}
      ref={containerRef}
    >
      {isEditing ? (
        <div className="flex h-(--sidebar-history-row-height) items-center gap-1 rounded-(--sidebar-history-row-radius) bg-accent px-(--sidebar-history-row-padding-x)">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={handleInputChange}
            className="max-h-full w-full bg-transparent text-sm leading-5 focus:outline-none"
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="flex items-center gap-(--sidebar-history-row-trailing-gap)">
            <button
              onClick={handleSaveClick}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/70 flex h-(--sidebar-history-row-trailing-size) w-(--sidebar-history-row-trailing-size) items-center justify-center rounded-md p-1"
              type="button"
            >
              <HugeiconsIcon icon={Tick02Icon} size={16} />
            </button>
            <button
              onClick={handleCancelClick}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/70 flex h-(--sidebar-history-row-trailing-size) w-(--sidebar-history-row-trailing-size) items-center justify-center rounded-md p-1"
              type="button"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-(--sidebar-history-row-trailing-gap) pl-(--sidebar-history-row-padding-x) pr-[calc(var(--sidebar-history-row-padding-x)-1px)]">
          <Link
            href={`/c/${chat.id}`}
            className="flex h-(--sidebar-history-row-height) min-w-0 flex-1 items-center rounded-[calc(var(--sidebar-history-row-radius)-2px)]"
            prefetch
            draggable={false}
            onClick={handleLinkClick}
          >
            <div
              className="truncate pr-1 text-sm leading-5"
              title={displayTitle}
            >
              <span dir="auto">{displayTitle}</span>
            </div>
          </Link>

          <div
            className={cn(
              "flex h-(--sidebar-history-row-height) shrink-0 items-center",
              isCurrentChat ? "gap-(--sidebar-history-row-trailing-gap)" : "gap-0"
            )}
            key={chat.id}
          >
            <div className={menuClassName}>
              <SidebarItemMenu
                chat={chat}
                onStartEditing={handleStartEditing}
                onMenuOpenChange={handleMenuOpenChange}
              />
            </div>
            <div
              className={cn(
                "flex h-(--sidebar-history-row-trailing-size) items-center justify-center overflow-hidden transition-[width,opacity] duration-150",
                isCurrentChat ? "w-4 opacity-100" : "w-0 opacity-0"
              )}
              aria-hidden="true"
            >
              {isCurrentChat ? (
                <span className="bg-foreground/60 block h-1.5 w-1.5 rounded-full" />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
