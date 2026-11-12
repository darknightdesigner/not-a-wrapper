"use client"

import { DialogCloseButton } from "@/components/ui/dialog"
import type { Chats } from "@/lib/chat-store/types"
import { cn } from "@/lib/utils"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { RiAddLine, RiChat3Line, RiSearchLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"
import { HistoryAuthPrompt } from "./history-auth-prompt"
import { useInfiniteScroll, type HistoryView } from "./use-history-view"
import { type ChatGroup } from "./utils"

type DesktopSearchModalProps = {
  history: HistoryView
  currentChatId?: string | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isAuthenticated: boolean
}

const desktopSearchSurfaceClassName =
  "border-modal-search-border bg-modal-search text-modal-search-foreground shadow-modal-search rounded-(--modal-search-radius) border bg-clip-padding"

type FlatRow =
  | {
      type: "new-chat"
      key: string
      href: "/"
    }
  | {
      type: "chat"
      key: string
      href: string
      chat: Chats
    }

const listboxId = "desktop-search-modal-listbox"

function getRowId(index: number) {
  return `desktop-search-modal-row-${index}`
}

function getChatTitle(chat: Chats) {
  return chat.title || "Untitled Chat"
}

export function DesktopSearchModal({
  history,
  currentChatId,
  isOpen,
  onOpenChange,
  isAuthenticated,
}: DesktopSearchModalProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Search results + browse groups come from the history surface's own reads
  // (server search + paginated browse), not useChats().chats.
  const { query, setQuery, view, loadMore, canLoadMore } = history

  useInfiniteScroll(scrollRef, canLoadMore, loadMore)

  const visibleGroups = useMemo<ChatGroup[]>(() => {
    if (view.isSearching) {
      return view.results.length
        ? [{ name: "Search results", chats: view.results }]
        : []
    }

    const groups: ChatGroup[] = []

    if (view.pinned.length > 0) {
      groups.push({ name: "Pinned", chats: view.pinned })
    }

    groups.push(...view.groups)
    return groups
  }, [view])

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = []

    if (!view.isSearching) {
      rows.push({ type: "new-chat", key: "new-chat", href: "/" })
    }

    for (const group of visibleGroups) {
      for (const chat of group.chats) {
        rows.push({
          type: "chat",
          key: chat.id,
          href: `/c/${chat.id}`,
          chat,
        })
      }
    }

    return rows
  }, [view.isSearching, visibleGroups])

  const clampedActiveIndex =
    flatRows.length === 0 ? 0 : Math.min(activeIndex, flatRows.length - 1)
  const activeRow = flatRows[clampedActiveIndex]

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // The provider clears the search term on close; reset local nav state.
      if (!open) {
        setActiveIndex(0)
      }

      onOpenChange(open)
    },
    [onOpenChange]
  )

  const selectRow = useCallback(
    (row: FlatRow | undefined) => {
      if (!row) return

      handleOpenChange(false)

      if (row.type === "chat" && row.chat.id === currentChatId) {
        return
      }

      router.push(row.href)
    },
    [currentChatId, handleOpenChange, router]
  )

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (flatRows.length === 0) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex(Math.min(clampedActiveIndex + 1, flatRows.length - 1))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex(Math.max(clampedActiveIndex - 1, 0))
      } else if (event.key === "Home") {
        event.preventDefault()
        setActiveIndex(0)
      } else if (event.key === "End") {
        event.preventDefault()
        setActiveIndex(flatRows.length - 1)
      } else if (event.key === "Enter") {
        event.preventDefault()
        selectRow(activeRow)
      }
    },
    [activeRow, clampedActiveIndex, flatRows.length, selectRow]
  )

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || flatRows.length === 0) return

    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${clampedActiveIndex}"]`
    )
    row?.scrollIntoView({ block: "nearest" })
  }, [clampedActiveIndex, flatRows.length, isOpen])

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-(--modal-centered-scrim) transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
          onClick={() => handleOpenChange(false)}
        />
        <DialogPrimitive.Popup
          className={cn(
            "pointer-events-none fixed inset-0 z-50 outline-none",
            "grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)]",
            "md:grid-rows-[minmax(20px,18dvh)_auto_minmax(20px,1fr)]"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {isAuthenticated ? "Search chats" : "Log in to search chats"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {isAuthenticated
              ? "Search your saved chat history."
              : "Saved chat history is available after you log in or create an account."}
          </DialogPrimitive.Description>

          {isAuthenticated ? (
            <div
              className={cn(
                "pointer-events-auto col-start-2 row-start-2 mx-auto flex h-[448px] max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden",
                desktopSearchSurfaceClassName,
                "max-w-md md:max-w-[720px] md:min-w-[720px]"
              )}
            >
              <div className="flex h-14 shrink-0 items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Search chats..."
                  aria-label="Search chats"
                  aria-controls={listboxId}
                  aria-activedescendant={
                    activeRow ? getRowId(clampedActiveIndex) : undefined
                  }
                  aria-autocomplete="list"
                  aria-expanded={isOpen}
                  role="combobox"
                  className={cn(
                    "text-foreground h-full w-full border-none bg-transparent px-[18px] text-[15px]",
                    "placeholder:text-placeholder focus:ring-0 focus:outline-none"
                  )}
                />
              </div>

              <div
                ref={scrollRef}
                className="min-h-0 grow overflow-y-auto pb-2.5"
              >
                <div
                  ref={listRef}
                  id={listboxId}
                  role="listbox"
                  aria-label="Chats"
                  className="mx-2.5"
                >
                  {!view.isSearching && (
                    <SearchRow
                      id={getRowId(0)}
                      index={0}
                      active={clampedActiveIndex === 0}
                      href="/"
                      label="New chat"
                      icon={
                        <RiAddLine className="size-4 shrink-0" aria-hidden />
                      }
                      onClick={() => handleOpenChange(false)}
                      onMouseEnter={() => setActiveIndex(0)}
                    />
                  )}

                  {visibleGroups.map((group) => (
                    <div key={group.name}>
                      <div
                        className="relative mt-3 mb-1 px-2.5 text-sm leading-6 font-medium text-[var(--text-tertiary)]"
                        aria-hidden="true"
                      >
                        {group.name}
                      </div>
                      {group.chats.map((chat) => {
                        const index = flatRows.findIndex(
                          (row) =>
                            row.type === "chat" && row.chat.id === chat.id
                        )

                        return (
                          <SearchRow
                            key={chat.id}
                            id={getRowId(index)}
                            index={index}
                            active={index === clampedActiveIndex}
                            href={`/c/${chat.id}`}
                            label={getChatTitle(chat)}
                            icon={
                              <RiChat3Line
                                className="size-4 shrink-0"
                                aria-hidden
                              />
                            }
                            onClick={(event) => {
                              if (chat.id === currentChatId) {
                                event.preventDefault()
                              }

                              handleOpenChange(false)
                            }}
                            onMouseEnter={() => {
                              if (index >= 0) setActiveIndex(index)
                            }}
                          />
                        )
                      })}
                    </div>
                  ))}

                  {flatRows.length === 0 && (
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <RiSearchLine className="size-6 opacity-60" />
                      <span className="text-sm">No chat history found.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "pointer-events-auto col-start-2 row-start-2 mx-auto w-[calc(100vw-20px)] max-w-[388px] overflow-hidden",
                desktopSearchSurfaceClassName
              )}
            >
              <header className="flex min-h-12 items-start justify-end p-2.5 pb-0">
                <DialogCloseButton className="shrink-0" />
              </header>
              <HistoryAuthPrompt />
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

type SearchRowProps = {
  id: string
  index: number
  active: boolean
  href: string
  label: string
  icon: ReactNode
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void
  onMouseEnter: () => void
}

function SearchRow({
  id,
  index,
  active,
  href,
  label,
  icon,
  onClick,
  onMouseEnter,
}: SearchRowProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      id={id}
      data-row-index={index}
      role="option"
      aria-selected={active}
      className="block cursor-pointer no-underline"
    >
      <div
        className={cn(
          "group text-foreground relative flex h-10 items-center rounded-xl px-2.5",
          "hover:bg-modal-search-row-active hover:text-foreground active:bg-modal-search-row-active",
          active && "bg-modal-search-row-active text-foreground"
        )}
      >
        {icon}
        <div className="relative min-w-0 grow overflow-hidden ps-2.5 whitespace-nowrap">
          <div className="truncate text-sm">{label}</div>
        </div>
      </div>
    </Link>
  )
}
