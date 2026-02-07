type CreateChatInput = {
  userId: string
  title?: string
  model: string
  isAuthenticated: boolean
  projectId?: string
}

/**
 * Create a chat using Convex
 * Note: With Convex, chat creation typically happens client-side via mutations
 * This server-side function is provided for API route compatibility
 */
export async function createChatInDb({
  userId,
  title,
  model,
  projectId,
}: Omit<CreateChatInput, "isAuthenticated">) {
  // With Convex, we return a placeholder that will be replaced by the actual Convex ID
  // The actual creation happens client-side via useMutation in ChatsProvider
  // This API route is kept for backward compatibility but the provider handles creation
  return {
    id: crypto.randomUUID(), // Temporary ID, replaced by Convex
    user_id: userId,
    title: title || "New chat",
    model,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    public: false,
    pinned: false,
    pinned_at: null,
    project_id: projectId || null,
  }
}
