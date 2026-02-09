"use client"

import { toast } from "@/components/ui/toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { UIMessage } from "ai"
import { useMutation, useQuery } from "convex/react"
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { writeToIndexedDB } from "../persist"
import { useChatSession } from "../session/provider"

// Extended UIMessage type for app compatibility (includes optional properties from v4)
export type ExtendedUIMessage = UIMessage & {
  createdAt?: Date
  content?: string
  model?: string
  messageGroupId?: string
}

type StoredAttachment = {
  name: string
  contentType: string
  url: string
}

function normalizeStoredAttachments(
  attachments?: unknown[] | null
): StoredAttachment[] | undefined {
  if (!attachments || !Array.isArray(attachments)) return undefined
  const normalized = attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") return null
      const record = attachment as {
        name?: string
        contentType?: string
        url?: string
      }
      if (!record.url) return null
      return {
        name: record.name || "file",
        contentType: record.contentType || "application/octet-stream",
        url: record.url,
      }
    })
    .filter((attachment): attachment is StoredAttachment => Boolean(attachment))
  return normalized.length > 0 ? normalized : undefined
}

function getAttachmentsFromParts(
  parts?: UIMessage["parts"]
): StoredAttachment[] | undefined {
  if (!parts?.length) return undefined
  const fileParts = parts.filter((part) => part.type === "file")
  if (fileParts.length === 0) return undefined
  return fileParts.map((part) => ({
    name: (part as { filename?: string }).filename || "file",
    contentType:
      (part as { mediaType?: string }).mediaType || "application/octet-stream",
    url: (part as { url?: string }).url || "",
  }))
}

interface MessagesContextType {
  messages: ExtendedUIMessage[]
  isLoading: boolean
  setMessages: React.Dispatch<React.SetStateAction<ExtendedUIMessage[]>>
  refresh: () => Promise<void>
  saveAllMessages: (messages: ExtendedUIMessage[]) => Promise<void>
  /** Cache message locally and persist to Convex. Pass overrideChatId to handle stale closures during chat creation. */
  cacheAndAddMessage: (message: ExtendedUIMessage, overrideChatId?: string) => Promise<void>
  resetMessages: () => Promise<void>
  deleteMessages: () => Promise<void>
  deleteMessagesFromTimestamp: (timestamp: number) => Promise<void>
}

const MessagesContext = createContext<MessagesContextType | null>(null)

export function useMessages() {
  const context = useContext(MessagesContext)
  if (!context)
    throw new Error("useMessages must be used within MessagesProvider")
  return context
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { chatId } = useChatSession()

  // Only query if chatId is a valid Convex ID (not optimistic or local guest chat)
  const isValidConvexId = Boolean(chatId && !chatId.startsWith("optimistic-") && !chatId.startsWith("local-"))

  // Convex real-time query for messages
  const convexMessages = useQuery(
    api.messages.getForChat,
    isValidConvexId ? { chatId: chatId as Id<"chats"> } : "skip"
  )

  // Convex mutations
  const addMessageMutation = useMutation(api.messages.add)
  const addBatchMutation = useMutation(api.messages.addBatch)
  const clearMessagesMutation = useMutation(api.messages.clearForChat)
  const deleteFromTimestampMutation = useMutation(api.messages.deleteFromTimestamp)

  // Convert Convex messages to AI SDK format
  const serverMessages: ExtendedUIMessage[] = useMemo(() => {
    if (!convexMessages) return []
    return convexMessages.map((msg): ExtendedUIMessage => {
      const baseParts =
        (msg.parts as ExtendedUIMessage["parts"]) ??
        (msg.content ? [{ type: "text", text: msg.content }] : [])
      const hasFileParts = baseParts.some((part) => part.type === "file")
      const storedAttachments = normalizeStoredAttachments(
        msg.attachments as unknown[] | null
      )
      const parts =
        !hasFileParts && storedAttachments && storedAttachments.length > 0
          ? [
              ...baseParts,
              ...storedAttachments.map((att) => ({
                type: "file" as const,
                filename: att.name,
                mediaType: att.contentType,
                url: att.url,
              })),
            ]
          : baseParts

      return {
        id: msg._id,
        // v5 UIMessage supports user, assistant, system roles
        role: (msg.role === "data" ? "system" : msg.role) as "user" | "assistant" | "system",
        content: msg.content ?? "",
        createdAt: new Date(msg._creationTime),
        parts,
        model: msg.model ?? undefined,
        messageGroupId: msg.messageGroupId ?? undefined,
      }
    })
  }, [convexMessages])

  const isLoading = convexMessages === undefined && isValidConvexId

  // Track optimistic messages per chat (keyed by chatId for natural isolation)
  const [optimisticMessagesMap, setOptimisticMessagesMap] = useState<Map<string, ExtendedUIMessage[]>>(new Map())

  // Get optimistic messages for current chat (memoized to prevent unnecessary re-renders)
  const optimisticMessages = useMemo(
    () => (chatId ? (optimisticMessagesMap.get(chatId) ?? []) : []),
    [chatId, optimisticMessagesMap]
  )

  // Derive displayed messages from server data + optimistic messages
  const messages = useMemo(() => {
    // If chatId is null, return empty
    if (chatId === null) return []

    // Merge server messages with optimistic messages for this chat
    const serverIds = new Set(serverMessages.map((m) => m.id))
    const pendingMessages = optimisticMessages.filter((m) => !serverIds.has(m.id))

    return [...serverMessages, ...pendingMessages]
  }, [serverMessages, optimisticMessages, chatId])

  // Helper to update optimistic messages for current chat
  const updateOptimisticMessages = useCallback((updater: (prev: ExtendedUIMessage[]) => ExtendedUIMessage[]) => {
    if (!chatId) return
    setOptimisticMessagesMap((prevMap) => {
      const newMap = new Map(prevMap)
      const current = newMap.get(chatId) ?? []
      newMap.set(chatId, updater(current))
      return newMap
    })
  }, [chatId])

  const refresh = useCallback(async () => {
    // With Convex, data is real-time, so refresh is a no-op
  }, [])

  const cacheAndAddMessage = useCallback(async (message: ExtendedUIMessage, overrideChatId?: string) => {
    // Use overrideChatId to handle stale closures during chat creation flow
    const effectiveChatId = overrideChatId || chatId
    if (!effectiveChatId) return

    // Optimistic update - add to pending messages (use effectiveChatId for map key)
    if (effectiveChatId === chatId) {
      // Only update optimistic state if we're in the same chat context
      updateOptimisticMessages((prev) => [...prev, message])
    }

    // Cache locally (works for both guest and authenticated users)
    // Deduplicate by ID to prevent duplicate key errors when optimistic messages
    // overlap with server messages that have been assigned Convex IDs
    const allMessages = [...serverMessages, ...optimisticMessages, message]
    const seenIds = new Set<string>()
    const updated = allMessages.filter((m) => {
      if (seenIds.has(m.id)) return false
      seenIds.add(m.id)
      return true
    })
    writeToIndexedDB("messages", { id: effectiveChatId, messages: updated })

    // Persist to Convex for authenticated users (valid Convex IDs only)
    // Guest users will silently skip this (auth required for mutations)
    if (!effectiveChatId.startsWith("optimistic-") && !effectiveChatId.startsWith("local-")) {
      try {
        // Extract content from parts for storage (v5 compatibility)
        const textContent = message.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("") || message.content || ""

        await addMessageMutation({
          chatId: effectiveChatId as Id<"chats">,
          role: message.role as "user" | "assistant" | "system",
          content: textContent,
          parts: message.parts,
          attachments: getAttachmentsFromParts(message.parts),
          model: message.model,
          messageGroupId: message.messageGroupId
            ?? (message as unknown as { message_group_id?: string }).message_group_id,
        })
      } catch (error) {
        // Silently fail for guests (no auth) - they only get local storage
        // For authenticated users, log the error but don't block the UI
        // The optimistic update keeps the UI responsive
        console.debug("Message persistence skipped:", error)
      }
    }
  }, [chatId, serverMessages, optimisticMessages, updateOptimisticMessages, addMessageMutation])

  const saveAllMessages = useCallback(async (newMessages: ExtendedUIMessage[]) => {
    if (!chatId || chatId.startsWith("optimistic-") || chatId.startsWith("local-")) return

    try {
      // Find new messages that need to be saved
      const existingIds = new Set(serverMessages.map((m) => m.id))
      const messagesToSave = newMessages.filter((m) => !existingIds.has(m.id))

      if (messagesToSave.length > 0) {
        await addBatchMutation({
          chatId: chatId as Id<"chats">,
          messages: messagesToSave.map((msg) => {
            // Extract content from parts for storage (v5 compatibility)
            const textContent = msg.parts
              ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("") || msg.content || ""

            return {
              role: msg.role as "user" | "assistant" | "system",
              content: textContent,
              parts: msg.parts,
              attachments: getAttachmentsFromParts(msg.parts),
              model: msg.model,
              messageGroupId: msg.messageGroupId
                ?? (msg as unknown as { message_group_id?: string }).message_group_id,
            }
          }),
        })
      }

      // Update optimistic messages to match what was saved
      updateOptimisticMessages(() => newMessages.filter((m) => !existingIds.has(m.id)))

      // Also cache locally
      await writeToIndexedDB("messages", { id: chatId, messages: newMessages })
    } catch (error) {
      console.error("Failed to save messages:", error)
      toast({ title: "Failed to save messages", status: "error" })
    }
  }, [chatId, serverMessages, addBatchMutation, updateOptimisticMessages])

  const deleteMessages = useCallback(async () => {
    if (!chatId || chatId.startsWith("optimistic-") || chatId.startsWith("local-")) return

    // Clear optimistic messages immediately
    updateOptimisticMessages(() => [])

    try {
      await clearMessagesMutation({ chatId: chatId as Id<"chats"> })
      await writeToIndexedDB("messages", { id: chatId, messages: [] })
    } catch (error) {
      console.error("Failed to delete messages:", error)
      toast({ title: "Failed to delete messages", status: "error" })
    }
  }, [chatId, clearMessagesMutation, updateOptimisticMessages])

  const resetMessages = useCallback(async () => {
    updateOptimisticMessages(() => [])
  }, [updateOptimisticMessages])

  const deleteMessagesFromTimestamp = useCallback(async (timestamp: number) => {
    if (!chatId || chatId.startsWith("optimistic-") || chatId.startsWith("local-")) return

    await deleteFromTimestampMutation({
      chatId: chatId as Id<"chats">,
      timestamp,
    })
    // Local state is already trimmed by useChatCore, Convex will reactively update
    // Errors propagate to submitEdit which handles rollback and user notification
  }, [chatId, deleteFromTimestampMutation])

  // setMessages for backward compatibility - updates optimistic messages
  const setMessages = useCallback((action: React.SetStateAction<ExtendedUIMessage[]>) => {
    if (typeof action === "function") {
      updateOptimisticMessages((prev) => {
        const allMessages = [...serverMessages, ...prev]
        const newMessages = action(allMessages)
        // Keep only messages not in server data
        const serverIds = new Set(serverMessages.map((m) => m.id))
        return newMessages.filter((m) => !serverIds.has(m.id))
      })
    } else {
      // Direct set - keep only messages not in server data
      const serverIds = new Set(serverMessages.map((m) => m.id))
      updateOptimisticMessages(() => action.filter((m) => !serverIds.has(m.id)))
    }
  }, [serverMessages, updateOptimisticMessages])

  return (
    <MessagesContext.Provider
      value={{
        messages,
        isLoading,
        setMessages,
        refresh,
        saveAllMessages,
        cacheAndAddMessage,
        resetMessages,
        deleteMessages,
        deleteMessagesFromTimestamp,
      }}
    >
      {children}
    </MessagesContext.Provider>
  )
}
