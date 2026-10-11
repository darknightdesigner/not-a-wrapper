"use client"

import { api } from "@/convex/_generated/api"
import { useWarmPerUserQuery } from "@/lib/convex/query-cache"
import { useCallback } from "react"

/**
 * Warms the selected-conversation queries — `getSelectedPath`,
 * `getSelectedRunState` and `getLiveMessage` with the exact args
 * `MessagesProvider` subscribes with — for a chat the user is about to open,
 * so the route commit finds all three delivered instead of loading. A guest's
 * chats live in IndexedDB (ADR-0033) and have no server read to warm; the warm
 * is gated on Convex auth, so it is already a no-op for them.
 */
export function useWarmSelectedConversation(): (chatId: string) => void {
  const warm = useWarmPerUserQuery()
  return useCallback(
    (chatId: string) => {
      // Cache keys are key-order sensitive: mirror the provider's literals.
      warm(api.messages.getSelectedPath, { chatId, splitLiveTail: true })
      warm(api.messages.getSelectedRunState, { chatId })
      warm(api.messages.getLiveMessage, { chatId })
    },
    [warm]
  )
}
