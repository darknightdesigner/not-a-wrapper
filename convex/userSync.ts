import type { UserIdentity } from "convex/server"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { ensureAccountDeletionJob } from "./domain/account_deletion"

// Profile facts from a signature-verified WorkOS webhook (ADR-0044). Only
// these handlers may write email, names, avatar, or `workosUpdatedAt`.
type VerifiedWorkOSUser = {
  workosUserId: string
  email: string
  firstName?: string | null
  lastName?: string | null
  profileImage?: string | null
  workosUpdatedAt?: string | null
}

function fullName(
  firstName?: string | null,
  lastName?: string | null
): string | undefined {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim()
  return name || undefined
}

function displayNameFromWorkOSUser(user: VerifiedWorkOSUser) {
  const name = fullName(user.firstName, user.lastName)
  if (name) return name

  const [localPart] = user.email.split("@")
  return localPart || user.email
}

function isOlderWorkOSUpdate(
  existingUpdatedAt?: string,
  incomingUpdatedAt?: string | null
) {
  if (!existingUpdatedAt || !incomingUpdatedAt) return false

  const existingTime = Date.parse(existingUpdatedAt)
  const incomingTime = Date.parse(incomingUpdatedAt)
  if (Number.isNaN(existingTime) || Number.isNaN(incomingTime)) return false

  return incomingTime < existingTime
}

async function findAppUser(ctx: MutationCtx, workosUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .unique()
}

/**
 * Verified `user.created` / `user.updated` sync. Never touches the lifecycle
 * flags: WorkOS deletions are permanent, so a deleted tombstone ignores every
 * later profile event instead of being repopulated or reactivated.
 */
export async function upsertAppUserFromWorkOS(
  ctx: MutationCtx,
  input: VerifiedWorkOSUser
): Promise<Id<"users">> {
  const existingUser = await findAppUser(ctx, input.workosUserId)
  if (existingUser?.deletedAt !== undefined) return existingUser._id
  if (
    existingUser &&
    isOlderWorkOSUpdate(existingUser.workosUpdatedAt, input.workosUpdatedAt)
  ) {
    return existingUser._id
  }

  const now = Date.now()
  const profile = {
    email: input.email,
    displayName: displayNameFromWorkOSUser(input),
    workosUpdatedAt:
      input.workosUpdatedAt ?? existingUser?.workosUpdatedAt ?? undefined,
    lastSyncedFromWorkOSAt: now,
    // null = WorkOS removed the picture; undefined = not in this payload.
    ...(input.profileImage !== undefined
      ? { profileImage: input.profileImage ?? undefined }
      : {}),
  }

  if (existingUser) {
    await ctx.db.patch(existingUser._id, profile)
    return existingUser._id
  }

  return await ctx.db.insert("users", {
    workosUserId: input.workosUserId,
    ...profile,
    anonymous: false,
    premium: false,
    messageCount: 0,
    dailyMessageCount: 0,
  })
}

/**
 * The public bootstrap's core: insert-only, from the verified access token.
 * Profile fields come only from claims the token actually carries (WorkOS
 * access tokens carry none by default); the verified webhook fills the rest.
 * The caller's builder has already rejected a deleted or disabled row.
 */
export async function insertAppUserFromIdentity(
  ctx: MutationCtx,
  identity: UserIdentity
): Promise<Id<"users">> {
  const existingUser = await findAppUser(ctx, identity.subject)
  if (existingUser) return existingUser._id

  return await ctx.db.insert("users", {
    workosUserId: identity.subject,
    email: identity.email,
    displayName:
      identity.name?.trim() ||
      fullName(identity.givenName, identity.familyName),
    profileImage: identity.pictureUrl,
    anonymous: false,
    premium: false,
    messageCount: 0,
    dailyMessageCount: 0,
    lastActiveAt: Date.now(),
  })
}

/**
 * Verified account deletion (WorkOS `user.deleted`, or the operator's
 * `users.deleteAccount`). Always applies: there is no older-update skip, so no
 * stored timestamp can block it. Keeps the row as a permanent tombstone so the
 * bootstrap cannot resurrect it, and schedules the owned-data drain.
 */
export async function softDeleteAppUserFromWorkOS(
  ctx: MutationCtx,
  input: { workosUserId: string; workosUpdatedAt?: string | null }
): Promise<Id<"users">> {
  const existingUser = await findAppUser(ctx, input.workosUserId)
  const now = Date.now()

  const userId = existingUser
    ? existingUser._id
    : await ctx.db.insert("users", {
        workosUserId: input.workosUserId,
        anonymous: false,
        premium: false,
        messageCount: 0,
        dailyMessageCount: 0,
      })

  await ctx.db.patch(userId, {
    deletedAt: existingUser?.deletedAt ?? now,
    disabledAt: existingUser?.disabledAt ?? now,
    lastSyncedFromWorkOSAt: now,
    workosUpdatedAt:
      input.workosUpdatedAt ?? existingUser?.workosUpdatedAt ?? undefined,
  })
  await ensureAccountDeletionJob(ctx, userId)

  return userId
}
