// convex/chatToolState.ts
// Canonical payment state ledger for pay_purchase / pay_status lifecycle.
// One row per chat, upserted idempotently by tool handlers.

import { v } from "convex/values"
import { query, mutation } from "./_generated/server"

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve the authenticated user's Convex _id from their Clerk identity.
 * Throws on unauthenticated or unknown users.
 */
async function resolveUser(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; db: any }) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique()

  if (!user) throw new Error("User not found")
  return user
}

/**
 * Verify the caller owns the given chat. Returns the chat document.
 */
async function verifyOwnership(ctx: { db: any }, chatId: any, userId: any) {
  const chat = await ctx.db.get(chatId)
  if (!chat) throw new Error("Chat not found")
  if (chat.userId !== userId) throw new Error("Not authorized")
  return chat
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Get the canonical payment state for a chat.
 * Returns null if no state exists yet.
 */
export const getByChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) return null

    // Verify ownership
    const chat = await ctx.db.get(chatId)
    if (!chat || chat.userId !== user._id) return null

    return await ctx.db
      .query("chatToolState")
      .withIndex("by_chat", (q: any) => q.eq("chatId", chatId))
      .unique()
  },
})

// =============================================================================
// Mutations
// =============================================================================

/**
 * Upsert payment state when pay_purchase executes.
 *
 * - Creates or updates the canonical row for this chat.
 * - Sets activePurchaseJobId and latestPurchaseJobId to jobId.
 * - Resets latestStatus and latestStatusIsTerminal (new purchase = new lifecycle).
 * - IDEMPOTENT: if lastMutationKey matches, skip the write.
 * - Rejects if incoming chatVersion < existing chatVersion (stale write).
 */
export const upsertFromPurchase = mutation({
  args: {
    chatId: v.id("chats"),
    jobId: v.string(),
    url: v.string(),
    chatVersion: v.number(),
    sourceMessageTimestamp: v.optional(v.number()),
    mutationKey: v.string(),
    toolCallId: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx)
    await verifyOwnership(ctx, args.chatId, user._id)

    const existing = await ctx.db
      .query("chatToolState")
      .withIndex("by_user_chat", (q: any) =>
        q.eq("userId", user._id).eq("chatId", args.chatId)
      )
      .unique()

    // Idempotency: skip if same mutation already applied
    if (existing?.lastMutationKey === args.mutationKey) {
      return existing._id
    }

    // Stale-write guard: reject if incoming version is behind
    if (existing && args.chatVersion < existing.chatVersion) {
      throw new Error(
        `Stale write rejected: incoming chatVersion ${args.chatVersion} < existing ${existing.chatVersion}`
      )
    }

    const now = Date.now()

    if (existing) {
      await ctx.db.patch(existing._id, {
        chatVersion: args.chatVersion,
        activePurchaseJobId: args.jobId,
        latestPurchaseJobId: args.jobId,
        latestPurchaseUrl: args.url,
        // Reset status fields — new purchase starts a new lifecycle
        latestStatus: undefined,
        latestStatusIsTerminal: undefined,
        sourceMessageTimestamp: args.sourceMessageTimestamp,
        lastMutationKey: args.mutationKey,
        lastToolCallId: args.toolCallId,
        lastRequestId: args.requestId,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert("chatToolState", {
      chatId: args.chatId,
      userId: user._id,
      chatVersion: args.chatVersion,
      activePurchaseJobId: args.jobId,
      latestPurchaseJobId: args.jobId,
      latestPurchaseUrl: args.url,
      sourceMessageTimestamp: args.sourceMessageTimestamp,
      lastMutationKey: args.mutationKey,
      lastToolCallId: args.toolCallId,
      lastRequestId: args.requestId,
      updatedAt: now,
    })
  },
})

/**
 * Upsert payment state when pay_status returns results.
 *
 * - Sets latestStatus and latestStatusIsTerminal.
 * - If isTerminal, clears activePurchaseJobId (job is done).
 * - IDEMPOTENT: if lastMutationKey matches, skip the write.
 * - Rejects if incoming chatVersion < existing chatVersion (stale write).
 */
export const upsertFromStatus = mutation({
  args: {
    chatId: v.id("chats"),
    jobId: v.string(),
    status: v.string(),
    isTerminal: v.boolean(),
    chatVersion: v.number(),
    mutationKey: v.string(),
    toolCallId: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx)
    await verifyOwnership(ctx, args.chatId, user._id)

    const existing = await ctx.db
      .query("chatToolState")
      .withIndex("by_user_chat", (q: any) =>
        q.eq("userId", user._id).eq("chatId", args.chatId)
      )
      .unique()

    // Idempotency: skip if same mutation already applied
    if (existing?.lastMutationKey === args.mutationKey) {
      return existing._id
    }

    // Stale-write guard: reject if incoming version is behind
    if (existing && args.chatVersion < existing.chatVersion) {
      throw new Error(
        `Stale write rejected: incoming chatVersion ${args.chatVersion} < existing ${existing.chatVersion}`
      )
    }

    const now = Date.now()

    if (existing) {
      await ctx.db.patch(existing._id, {
        chatVersion: args.chatVersion,
        latestStatus: args.status,
        latestStatusIsTerminal: args.isTerminal,
        // Clear active job if terminal — the purchase lifecycle is complete
        activePurchaseJobId: args.isTerminal ? undefined : existing.activePurchaseJobId,
        lastMutationKey: args.mutationKey,
        lastToolCallId: args.toolCallId,
        lastRequestId: args.requestId,
        updatedAt: now,
      })
      return existing._id
    }

    // No existing row — create one (status arrived before purchase, edge case but safe)
    return await ctx.db.insert("chatToolState", {
      chatId: args.chatId,
      userId: user._id,
      chatVersion: args.chatVersion,
      latestPurchaseJobId: args.jobId,
      activePurchaseJobId: args.isTerminal ? undefined : args.jobId,
      latestStatus: args.status,
      latestStatusIsTerminal: args.isTerminal,
      lastMutationKey: args.mutationKey,
      lastToolCallId: args.toolCallId,
      lastRequestId: args.requestId,
      updatedAt: now,
    })
  },
})

/**
 * Truncate payment state during edit/resend.
 *
 * If existing state's chatVersion >= minVersion, delete the row entirely.
 * This ensures stale payment state from truncated message branches is cleaned up.
 */
export const truncateFromVersion = mutation({
  args: {
    chatId: v.id("chats"),
    minVersion: v.number(),
  },
  handler: async (ctx, { chatId, minVersion }) => {
    const user = await resolveUser(ctx)
    await verifyOwnership(ctx, chatId, user._id)

    const existing = await ctx.db
      .query("chatToolState")
      .withIndex("by_user_chat", (q: any) =>
        q.eq("userId", user._id).eq("chatId", chatId)
      )
      .unique()

    if (!existing) return null

    if (existing.chatVersion >= minVersion) {
      await ctx.db.delete(existing._id)
      return existing._id
    }

    return null
  },
})
