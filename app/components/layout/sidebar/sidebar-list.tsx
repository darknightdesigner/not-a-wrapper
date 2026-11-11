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
import type { ReactNode } from "react"
import { SidebarCollection, SidebarCollectionItem } from "./sidebar-collection"
import { SidebarItem } from "./sidebar-item"

type SidebarListProps = {
  title: string
  items: Chat[]
  currentChatId?: string
  defaultOpen?: boolean
  storageKey?: string
  showHeaderActions?: boolean
  onNewChat?: () => void
}

export function SidebarList({
  title,
  items,
  currentChatId,
  defaultOpen = true,
  storageKey,
  showHeaderActions = false,
  onNewChat,
}: SidebarListProps) {
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
        {items.map((chat) => (
          <SidebarCollectionItem key={chat.id}>
            <SidebarItem chat={chat} currentChatId={currentChatId} />
          </SidebarCollectionItem>
        ))}
      </SidebarCollection>
    </CollapsibleSection>
  )
}

const headerActionClassName =
  "sidebar-group-header-action text-[var(--text-tertiary)] hover:text-foreground active:text-foreground focus-visible:text-foreground data-popup-open:text-foreground flex h-9 w-[34px] shrink-0 items-center -my-2 -ms-1 -me-2.5 rounded-e-(--sidebar-row-radius) ps-1 pe-1.5 opacity-0 transition-opacity duration-150 group-hover/sidebar-expando-section-header:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 outline-none pointer-coarse:opacity-100"

function SidebarHeaderActionChip({ children }: { children: ReactNode }) {
  return (
    <span className="sidebar-group-header-action-chip flex size-6 items-center justify-center rounded-[8px]">
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
                aria-label="New project"
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
          {isProjectAction ? "New project" : "New chat"}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
