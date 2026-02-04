import { getLastMessagesFromDb } from "@/lib/chat-store/messages/api"
import { writeToIndexedDB } from "@/lib/chat-store/persist"
import type { UIMessage } from "ai"

// Extended UIMessage type for app compatibility (includes createdAt)
type ExtendedUIMessage = UIMessage & { createdAt?: Date }

export async function syncRecentMessages(
  chatId: string,
  setMessages: (
    updater: (prev: ExtendedUIMessage[]) => ExtendedUIMessage[]
  ) => void,
  count: number = 2
): Promise<void> {
  const lastFromDb = await getLastMessagesFromDb(chatId, count)
  if (!lastFromDb || lastFromDb.length === 0) return

  setMessages((prev) => {
    if (!prev || prev.length === 0) return prev

    const updated = [...prev]
    let changed = false

    // Track which local indices have been updated to avoid assigning
    // the same DB ID to multiple local messages
    const updatedIndices = new Set<number>()

    // Pair from the end; for each DB message (last to first),
    for (let d = lastFromDb.length - 1; d >= 0; d--) {
      const dbMsg = lastFromDb[d]
      if (!dbMsg) continue
      const dbRole = dbMsg.role

      for (let i = updated.length - 1; i >= 0; i--) {
        // Skip indices that have already been updated
        if (updatedIndices.has(i)) continue

        const local: ExtendedUIMessage | undefined = updated[i]
        if (!local || local.role !== dbRole) continue

        if (String(local.id) !== String(dbMsg.id)) {
          updated[i] = {
            ...local,
            id: String(dbMsg.id),
            createdAt: dbMsg.createdAt,
          }
          changed = true
        }
        updatedIndices.add(i)
        break
      }
    }

    if (changed) {
      writeToIndexedDB("messages", { id: chatId, messages: updated })
      return updated
    }

    return prev
  })
}
