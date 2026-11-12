import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { Icon } from "@/components/ui/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Chat } from "@/lib/chat-store/types"
import { RiAddLine } from "@remixicon/react"
import Link from "next/link"
import { useState, type ReactNode } from "react"
import { SidebarCollection, SidebarCollectionItem } from "./sidebar-collection"
import { SidebarItem } from "./sidebar-item"
import { SidebarMenuItem } from "./sidebar-menu-item"

/** Rows revealed at first and per "Show more" press. */
export const SIDEBAR_LIST_STEP = 5

type SidebarListProps = {
  title: string
  items: Chat[]
  currentChatId?: string
  defaultOpen?: boolean
  storageKey?: string
  showHeaderActions?: boolean
  onNewChat?: () => void
  /** More rows exist past the loaded window (ADR-0005). */
  canLoadMore?: boolean
  /** A window page is in flight; keeps "Show more" mounted (and focused). */
  isLoadingMore?: boolean
  onLoadMore?: () => void
}

export function SidebarList({
  title,
  items,
  currentChatId,
  defaultOpen = true,
  storageKey,
  showHeaderActions = false,
  onNewChat,
  canLoadMore = false,
  isLoadingMore = false,
  onLoadMore,
}: SidebarListProps) {
  const [revealedCount, setRevealedCount] = useState(SIDEBAR_LIST_STEP)
  // The open chat is never hidden behind "Show more": round up to its step.
  const currentIndex = items.findIndex((chat) => chat.id === currentChatId)
  const visibleCount = Math.max(
    revealedCount,
    Math.ceil((currentIndex + 1) / SIDEBAR_LIST_STEP) * SIDEBAR_LIST_STEP
  )
  const visibleItems = items.slice(0, visibleCount)
  const hasMore = items.length > visibleCount || canLoadMore || isLoadingMore
  const showMore = () => {
    const next = visibleCount + SIDEBAR_LIST_STEP
    setRevealedCount(next)
    // Fetch the next window page before the reveal runs past what's loaded.
    if (canLoadMore && next + SIDEBAR_LIST_STEP > items.length) onLoadMore?.()
  }

  const headerActions = showHeaderActions ? (
    <SidebarChatGroupActions onNewChat={onNewChat} />
  ) : null

  return (
    <CollapsibleSection
      title={title}
      defaultOpen={defaultOpen}
      storageKey={storageKey}
      variant="sidebar"
      headerActions={headerActions}
    >
      <SidebarCollection>
        {visibleItems.map((chat) => (
          <SidebarCollectionItem key={chat.id}>
            <SidebarItem chat={chat} currentChatId={currentChatId} />
          </SidebarCollectionItem>
        ))}
        {hasMore && (
          <SidebarCollectionItem>
            <SidebarMenuItem label="Show more" tone="muted" onClick={showMore} />
          </SidebarCollectionItem>
        )}
      </SidebarCollection>
    </CollapsibleSection>
  )
}

const headerActionClassName =
  "sidebar-group-header-action text-[var(--text-tertiary)] hover:text-foreground active:text-foreground focus-visible:text-foreground data-popup-open:text-foreground flex h-9 w-[34px] shrink-0 items-center -my-2 -ms-1 -me-2.5 rounded-e-(--sidebar-row-radius) ps-1 pe-1.5 opacity-0 group-hover/sidebar-expando-section-header:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 outline-none pointer-coarse:opacity-100"

function SidebarHeaderActionChip({ children }: { children: ReactNode }) {
  return (
    <span className="sidebar-group-header-action-chip flex size-6 items-center justify-center rounded-(--sidebar-action-chip-radius)">
      {children}
    </span>
  )
}

export function SidebarChatGroupActions({
  onNewChat,
  onNewProject,
}: {
  onNewChat?: () => void
  onNewProject?: () => void
}) {
  const isProjectAction = onNewProject != null

  return (
    <div className="flex shrink-0 items-center pe-2.5 text-[var(--text-tertiary)]">
      <Tooltip disableHoverablePopup>
        <TooltipTrigger
          render={
            isProjectAction ? (
              <button
                type="button"
                onClick={onNewProject}
                className={headerActionClassName}
                aria-label="New Project"
              />
            ) : (
              <Link
                href="/"
                onClick={onNewChat}
                className={headerActionClassName}
                aria-label="New chat"
              />
            )
          }
        >
          <SidebarHeaderActionChip>
            <Icon icon={RiAddLine} slotSize={16} glyphInset={0} />
          </SidebarHeaderActionChip>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={-6} variant="outline">
          {isProjectAction ? "New Project" : "New chat"}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
