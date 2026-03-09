import { readFromIndexedDB, writeToIndexedDB } from "@/lib/chat-store/persist"
import type { Chat, Chats } from "@/lib/chat-store/types"
import { getDefaultModelForUser } from "../../config"
import { fetchClient } from "../../fetch"

// ============================================================================
// Cache Operations (IndexedDB)
// ============================================================================

export async function getCachedChats(): Promise<Chats[]> {
  const all = await readFromIndexedDB<Chats>("chats")
  return (all as Chats[]).sort(
    (a, b) => +new Date(b.created_at || "") - +new Date(a.created_at || "")
  )
}

export async function getChat(chatId: string): Promise<Chat | null> {
  const all = await readFromIndexedDB<Chat>("chats")
  return (all as Chat[]).find((c) => c.id === chatId) || null
}

// ============================================================================
// Convex-backed Operations (via provider)
// Note: With Convex, real-time queries handle most data fetching.
// These functions primarily manage the local IndexedDB cache.
// ============================================================================

 
// These functions are no-op stubs for backward compatibility.
// With Convex, real-time queries and mutations handle data fetching.

export async function getChatsForUserInDb(_userId: string): Promise<Chats[]> {
  return await getCachedChats()
}

export async function updateChatTitleInDb(_id: string, _title: string) {
  return
}

export async function deleteChatInDb(_id: string) {
  return
}

export async function getAllUserChatsInDb(_userId: string): Promise<Chats[]> {
  return await getCachedChats()
}

export async function createChatInDb(
  _userId: string,
  _title: string,
  _model: string,
  _systemPrompt: string
): Promise<string | null> {
  return null
}

export async function fetchAndCacheChats(_userId: string): Promise<Chats[]> {
  return await getCachedChats()
}
 

export async function updateChatTitle(
  id: string,
  title: string
): Promise<void> {
  // Just update the cache - Convex provider handles the mutation
  const all = await getCachedChats()
  const updated = (all as Chats[]).map((c) =>
    c.id === id ? { ...c, title } : c
  )
  await writeToIndexedDB("chats", updated)
}

export async function deleteChat(id: string): Promise<void> {
  // Just update the cache - Convex provider handles the mutation
  const all = await getCachedChats()
  await writeToIndexedDB(
    "chats",
    (all as Chats[]).filter((c) => c.id !== id)
  )
}

 
export async function getUserChats(_userId: string): Promise<Chat[]> {
  const data = await getCachedChats()
  return data
}

export async function createChat(
  userId: string,
  title: string,
  model: string,
  systemPrompt: string
): Promise<string> {
  // With Convex, the provider handles creation via mutations
  const optimisticId = crypto.randomUUID()
  await writeToIndexedDB("chats", {
    id: optimisticId,
    title,
    model,
    user_id: userId,
    system_prompt: systemPrompt,
    created_at: new Date().toISOString(),
  })
  return optimisticId
}

export async function updateChatModel(chatId: string, model: string) {
  // With Convex, mutations are called from the provider
  // Just update the cache here
  const all = await getCachedChats()
  const updated = (all as Chats[]).map((c) =>
    c.id === chatId ? { ...c, model } : c
  )
  await writeToIndexedDB("chats", updated)
  return { success: true }
}

export async function toggleChatPin(chatId: string, pinned: boolean) {
  // With Convex, mutations are called from the provider
  const all = await getCachedChats()
  const now = new Date().toISOString()
  const updated = (all as Chats[]).map((c) =>
    c.id === chatId ? { ...c, pinned, pinned_at: pinned ? now : null } : c
  )
  await writeToIndexedDB("chats", updated)
  return { success: true }
}

export async function createNewChat(
  userId: string,
  title?: string,
  model?: string,
  isAuthenticated?: boolean,
  projectId?: string
): Promise<Chats> {
  try {
    const payload: {
      userId: string
      title: string
      model: string
      isAuthenticated?: boolean
      projectId?: string
    } = {
      userId,
      title: title || "New chat",
      model: model || getDefaultModelForUser(!!isAuthenticated),
      isAuthenticated,
    }

    if (projectId) {
      payload.projectId = projectId
    }

    const res = await fetchClient("/api/create-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const responseData = await res.json()

    if (!res.ok || !responseData.chat) {
      throw new Error(responseData.error || "Failed to create chat")
    }

    const chat: Chats = {
      id: responseData.chat.id,
      title: responseData.chat.title,
      created_at: responseData.chat.created_at,
      model: responseData.chat.model,
      user_id: responseData.chat.user_id,
      public: responseData.chat.public,
      updated_at: responseData.chat.updated_at,
      project_id: responseData.chat.project_id || null,
      pinned: responseData.chat.pinned ?? false,
      pinned_at: responseData.chat.pinned_at ?? null,
    }

    await writeToIndexedDB("chats", chat)
    return chat
  } catch (error) {
    console.error("Error creating new chat:", error)
    throw error
  }
}
