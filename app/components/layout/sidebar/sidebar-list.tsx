import { Chat } from "@/lib/chat-store/types"
import { ReactNode } from "react"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { SidebarItem } from "./sidebar-item"

type SidebarListProps = {
  title: string
  icon?: ReactNode
  items: Chat[]
  currentChatId: string
  /** Whether section is collapsible (default: true for > 3 items) */
  collapsible?: boolean
  /** localStorage key for persistence */
  storageKey?: string
}

export function SidebarList({
  title,
  icon,
  items,
  currentChatId,
  collapsible,
  storageKey,
}: SidebarListProps) {
  // Auto-collapse for sections with many items
  const shouldCollapse = collapsible ?? items.length > 3

  // Shared content renderer
  const renderItems = () =>
    items.map((chat) => (
      <SidebarItem key={chat.id} chat={chat} currentChatId={currentChatId} />
    ))

  if (!shouldCollapse) {
    return (
      <div>
        <h3 className="flex items-center gap-1 overflow-hidden px-3 py-1.5 text-xs font-medium text-muted-foreground break-all text-ellipsis">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
        <div className="space-y-0.5">{renderItems()}</div>
      </div>
    )
  }

  return (
    <CollapsibleSection
      title={title}
      icon={icon}
      defaultOpen={true}
      storageKey={storageKey}
      className="pt-2"
    >
      {renderItems()}
    </CollapsibleSection>
  )
}
