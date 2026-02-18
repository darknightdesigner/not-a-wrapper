import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"

async function getAuthenticatedUserOrThrow(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique()

  if (!user) throw new Error("User not found")
  return user
}

function byCreatedAtAsc<T extends { createdAt: number }>(a: T, b: T) {
  return a.createdAt - b.createdAt
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUserOrThrow(ctx)

    const addresses = await ctx.db
      .query("shippingAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    return addresses.sort(byCreatedAtAsc)
  },
})

export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUserOrThrow(ctx)

    const defaults = await ctx.db
      .query("shippingAddresses")
      .withIndex("by_user_default", (q) =>
        q.eq("userId", user._id).eq("isDefault", true)
      )
      .collect()

    if (defaults.length === 0) return null
    return defaults.sort(byCreatedAtAsc)[0]
  },
})

export const create = mutation({
  args: {
    label: v.string(),
    name: v.string(),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    country: v.string(),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUserOrThrow(ctx)

    const existingAddresses = await ctx.db
      .query("shippingAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    const shouldBeDefault =
      existingAddresses.length === 0 ? true : (args.isDefault ?? false)

    // Single-default invariant: if this one becomes default, clear all others first.
    if (shouldBeDefault) {
      for (const address of existingAddresses) {
        if (address.isDefault) {
          await ctx.db.patch(address._id, { isDefault: false })
        }
      }
    }

    return await ctx.db.insert("shippingAddresses", {
      userId: user._id,
      label: args.label,
      name: args.name,
      line1: args.line1,
      line2: args.line2,
      city: args.city,
      state: args.state,
      postalCode: args.postalCode,
      country: args.country,
      isDefault: shouldBeDefault,
      createdAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: {
    addressId: v.id("shippingAddresses"),
    label: v.optional(v.string()),
    name: v.optional(v.string()),
    line1: v.optional(v.string()),
    line2: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, { addressId, ...updates }) => {
    const user = await getAuthenticatedUserOrThrow(ctx)

    const address = await ctx.db.get(addressId)
    if (!address || address.userId !== user._id) {
      throw new Error("Address not found")
    }

    const patch: Record<string, string | undefined> = {}
    if (updates.label !== undefined) patch.label = updates.label
    if (updates.name !== undefined) patch.name = updates.name
    if (updates.line1 !== undefined) patch.line1 = updates.line1
    if (updates.line2 !== undefined) patch.line2 = updates.line2
    if (updates.city !== undefined) patch.city = updates.city
    if (updates.state !== undefined) patch.state = updates.state
    if (updates.postalCode !== undefined) patch.postalCode = updates.postalCode
    if (updates.country !== undefined) patch.country = updates.country

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(addressId, patch)
    }

    return addressId
  },
})

export const remove = mutation({
  args: { addressId: v.id("shippingAddresses") },
  handler: async (ctx, { addressId }) => {
    const user = await getAuthenticatedUserOrThrow(ctx)

    const address = await ctx.db.get(addressId)
    if (!address || address.userId !== user._id) {
      throw new Error("Address not found")
    }

    await ctx.db.delete(addressId)

    if (!address.isDefault) {
      return
    }

    const remainingAddresses = await ctx.db
      .query("shippingAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    if (remainingAddresses.length === 0) {
      return
    }

    const oldestRemaining = remainingAddresses.sort(byCreatedAtAsc)[0]
    await ctx.db.patch(oldestRemaining._id, { isDefault: true })
  },
})

export const setDefault = mutation({
  args: { addressId: v.id("shippingAddresses") },
  handler: async (ctx, { addressId }) => {
    const user = await getAuthenticatedUserOrThrow(ctx)

    const address = await ctx.db.get(addressId)
    if (!address || address.userId !== user._id) {
      throw new Error("Address not found")
    }

    const allAddresses = await ctx.db
      .query("shippingAddresses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    // Clear all defaults first, then set the requested address as default.
    for (const item of allAddresses) {
      if (item.isDefault) {
        await ctx.db.patch(item._id, { isDefault: false })
      }
    }

    await ctx.db.patch(addressId, { isDefault: true })
    return addressId
  },
})
