import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

/**
 * Get user by Clerk ID
 */
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique()
  },
})

/**
 * Get current authenticated user
 */
export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
  },
})

/**
 * Create or update user from Clerk webhook
 */
export const createOrUpdate = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    profileImage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique()

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        displayName: args.displayName,
        profileImage: args.profileImage,
        lastActiveAt: Date.now(),
      })
      return existingUser._id
    }

    // Create new user
    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      displayName: args.displayName,
      profileImage: args.profileImage,
      anonymous: false,
      premium: false,
      messageCount: 0,
      dailyMessageCount: 0,
      dailyProMessageCount: 0,
      lastActiveAt: Date.now(),
    })
  },
})

/**
 * Update user's last active timestamp
 */
export const updateLastActive = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (user) {
      await ctx.db.patch(user._id, { lastActiveAt: Date.now() })
    }
  },
})

/**
 * Update user's favorite models
 */
export const updateFavoriteModels = mutation({
  args: {
    favoriteModels: v.array(v.string()),
  },
  handler: async (ctx, { favoriteModels }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Not authenticated")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) {
      throw new Error("User not found")
    }

    await ctx.db.patch(user._id, { favoriteModels })
    return favoriteModels
  },
})

/**
 * Update user profile fields
 * Supports updating: systemPrompt, displayName
 */
export const updateProfile = mutation({
  args: {
    systemPrompt: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Not authenticated")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) {
      throw new Error("User not found")
    }

    // Build update object with only provided fields
    const updates: Record<string, string | undefined> = {}
    if (args.systemPrompt !== undefined) {
      updates.systemPrompt = args.systemPrompt
    }
    if (args.displayName !== undefined) {
      updates.displayName = args.displayName
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(user._id, updates)
    }

    return { success: true }
  },
})

/**
 * Set or clear the user's default PayClaw card ID.
 * Pass a string to set, null to clear.
 */
export const setPayClawCardId = mutation({
  args: {
    cardId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { cardId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Not authenticated")
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) {
      throw new Error("User not found")
    }

    await ctx.db.patch(user._id, {
      payClawCardId: cardId ?? undefined,
    })

    return { success: true }
  },
})
