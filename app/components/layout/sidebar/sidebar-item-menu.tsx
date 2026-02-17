import { ChatActionsMenu } from "@/app/components/layout/chat-actions-menu"
import type { Chat } from "@/lib/chat-store/types"

type SidebarItemMenuProps = {
  chat: Chat
  onStartEditing: () => void
  onMenuOpenChange?: (open: boolean) => void
}

export function SidebarItemMenu({
  chat,
  onStartEditing,
  onMenuOpenChange,
}: SidebarItemMenuProps) {
  return (
    <ChatActionsMenu
      chat={chat}
      onRename={onStartEditing}
      onOpenChange={onMenuOpenChange}
      triggerAriaLabel="Open conversation options"
      contentSide="bottom"
      contentAlign="start"
    />
  )
}
