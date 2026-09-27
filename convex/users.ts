import { v } from "convex/values"
import {
  isAllowedProfileImageMimeType,
  MAX_FILE_SIZE,
  normalizeFileMimeType,
} from "../lib/file/policy"
import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation, type MutationCtx } from "./_generated/server"
import {
  deleteStorageIfUnreferenced,
  isStorageReferenced,
} from "./domain/storage_refs"
import { isRejectedAccount } from "./lib/auth"
import {
  authenticatedMutation,
  identityMutation,
  identityQuery,
  maybeAuthMutation,
  maybeAuthQuery,
} from "./lib/authedFunctions"
import {
  insertAppUserFromIdentity,
  softDeleteAppUserFromWorkOS,
} from "./userSync"

export function isProfileImageMetadataValid(
  metadata: { size: number; contentType?: string | null } | null,
  declaredType: string
): boolean {
  if (!metadata || metadata.size > MAX_FILE_SIZE) return false

  const storedType = normalizeFileMimeType(metadata.contentType)
  return (
    isAllowedProfileImageMimeType(storedType) &&
    storedType === normalizeFileMimeType(declaredType)
  )
}

type CommitProfileImageCtx = MutationCtx & {
  user: Doc<"users">
}

export async function commitProfileImageHandler(
  ctx: CommitProfileImageCtx,
  { storageId, fileType }: { storageId: Id<"_storage">; fileType: string }
) {
  // A blob is bound once (ADR-0046), even though the upload action always
  // passes one it just stored.
  if (await isStorageReferenced(ctx, storageId)) {
    throw new Error("Stored file is already in use")
  }
  const metadata = await ctx.db.system.get("_storage", storageId)
  if (!isProfileImageMetadataValid(metadata, fileType)) {
    throw new Error("Profile image failed server validation")
  }

  const profileImageUrl = await ctx.storage.getUrl(storageId)
  if (!profileImageUrl) throw new Error("Failed to get profile image URL")

  const previousStorageId = ctx.user.profileImageStorageId
  await ctx.db.patch(ctx.user._id, {
    profileImageOverride: profileImageUrl,
    profileImageStorageId: storageId,
  })

  if (previousStorageId && previousStorageId !== storageId) {
    await deleteStorageIfUnreferenced(ctx, previousStorageId)
  }

  return profileImageUrl
}

/**
 * Get the authenticated caller by WorkOS user ID. Self-identity-match: the
 * caller may only read their own record.
 */
export const getByWorkosUserId = identityQuery({
  args: { workosUserId: v.string() },
  handler: async (ctx, { workosUserId }) => {
    if (ctx.identity.subject !== workosUserId) {
      throw new Error("Cannot read a different user")
    }
    return ctx.user
  },
})

export const getCurrent = maybeAuthQuery({
  args: {},
  handler: async (ctx) => ctx.user,
})

/**
 * Insert-only bootstrap for a signed-in caller whose row does not exist yet
 * (the verified webhook has not arrived). Takes nothing from the browser:
 * identity and any profile claims come from the verified access token. An
 * existing row is returned untouched, and a deleted or disabled row is
 * rejected by the builder, so this can never clear lifecycle flags or
 * resurrect a tombstone (ADR-0044).
 */
export const ensureCurrent = identityMutation({
  args: {},
  handler: async (ctx) =>
    ctx.user?._id ?? (await insertAppUserFromIdentity(ctx, ctx.identity)),
})

/**
 * Operator account deletion, for accounts WorkOS deleted without our webhook
 * handler running. Same path as the verified `user.deleted` event.
 */
export const deleteAccount = internalMutation({
  args: { workosUserId: v.string() },
  handler: async (ctx, { workosUserId }) =>
    await softDeleteAppUserFromWorkOS(ctx, { workosUserId }),
})

export const updateLastActive = maybeAuthMutation({
  args: {},
  handler: async (ctx) => {
    if (ctx.user) {
      await ctx.db.patch(ctx.user._id, { lastActiveAt: Date.now() })
    }
  },
})

export const updateFavoriteModels = authenticatedMutation({
  args: {
    favoriteModels: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { favoriteModels }) => {
    await ctx.db.patch(ctx.user._id, { favoriteModels })
    return favoriteModels
  },
})

export const updateProfile = authenticatedMutation({
  args: {
    systemPrompt: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, string | undefined> = {}
    if (args.systemPrompt !== undefined) {
      updates.systemPrompt = args.systemPrompt
    }
    if (args.displayName !== undefined) {
      updates.displayName = args.displayName
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(ctx.user._id, updates)
    }

    return { success: true }
  },
})

/**
 * Bind a profile image created inside the authenticated HTTP upload action.
 * Internal-only so clients can never nominate an arbitrary storage id.
 */
export const commitUploadedProfileImage = internalMutation({
  args: {
    workosUserId: v.string(),
    storageId: v.id("_storage"),
    fileType: v.string(),
  },
  handler: async (ctx, { workosUserId, storageId, fileType }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
      .unique()
    if (!user) throw new Error("User not found")
    // The HTTP action checked only the identity; the row decides.
    if (isRejectedAccount(user)) throw new Error("Account rejected")

    return await commitProfileImageHandler(
      { ...ctx, user },
      { storageId, fileType }
    )
  },
})
