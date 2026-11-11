"use client"

import { ChatActionsMenu } from "@/app/components/layout/chat-actions-menu"
import { useChatActions } from "@/lib/chat-store/chats/provider"
import { useWarmSelectedConversation } from "@/lib/chat-store/messages/warm"
import { useSidebarChatStatus } from "@/lib/chat-store/status/sidebar-chat-status"
import { Chat } from "@/lib/chat-store/types"
import { markChatNavigationIntent } from "@/lib/observability/chat-performance-client"
import { memo, useCallback } from "react"
import { shallow } from "zustand/shallow"
import { SidebarChatStatusIndicator } from "./sidebar-item-status"
import { SidebarRow } from "./sidebar-row"
import {
  SidebarPinnedIndicator,
  SidebarRowEndSlot,
} from "./sidebar-row-actions"

type SidebarItemProps = {
  chat: Chat
  currentChatId?: string
}

// Chat adapter over the Sidebar row module: supplies the chat href/active
// predicate, the title-rename mutation, and the status-or-pin + actions trailing.
export const SidebarItem = memo(
  function SidebarItem({ chat, currentChatId }: SidebarItemProps) {
    const { updateTitle } = useChatActions()
    const warmSelectedConversation = useWarmSelectedConversation()
    const warmChat = useCallback(
      () => warmSelectedConversation(chat.id),
      [chat.id, warmSelectedConversation]
    )
    const status = useSidebarChatStatus(chat)
    const displayTitle = chat.title || "Untitled Chat"
    return (
      <SidebarRow
        interaction={{ kind: "link", href: `/c/${chat.id}` }}
        isActive={chat.id === currentChatId}
        title={displayTitle}
        ariaLabel={chat.pinned ? `${displayTitle}, pinned` : undefined}
        renameValue={chat.title || ""}
        renameLabel="Chat title"
        onRename={(next) => updateTitle(chat.id, next)}
        // Chat-switch responsiveness anchor: the navigation intent, marked
        // before Next.js routing commits (content-free no-op unless
        // instrumentation is enabled). Chat rows only: a project route commits
        // with no chat and must never arm the thread paint pair.
        onNavigate={markChatNavigationIntent}
        onWarm={warmChat}
        trailing={({ startRename }) => (
          <SidebarRowEndSlot
            key={chat.id}
            // Live status outranks the pin mark at rest.
            status={
              status !== "idle" ? (
                <SidebarChatStatusIndicator status={status} />
              ) : chat.pinned ? (
                <SidebarPinnedIndicator />
              ) : undefined
            }
          >
            <ChatActionsMenu
              chat={chat}
              onRename={startRename}
              triggerAriaLabel={`Open chat actions for ${displayTitle}`}
            />
          </SidebarRowEndSlot>
        )}
      />
    )
  },
  (previous, next) =>
    shallow(previous.chat, next.chat) &&
    (previous.chat.id === previous.currentChatId) ===
      (next.chat.id === next.currentChatId)
)
