import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

/**
 * Account-owned tables outside the account's Chats and Projects, drained by
 * the account deletion job after every Chat and Project is gone (ADR-0044).
 * Tool approvals go before their servers. Usage buckets, reservations, and
 * ledger entries are deliberately absent: ADR-0021 keeps that content-free
 * accounting evidence append-only, and the retained account tombstone keeps
 * its foreign keys valid.
 */
export const ACCOUNT_TABLE_PHASES = [
  "userKeys",
  "mcpToolApprovals",
  "mcpServers",
  "userPreferences",
  "feedback",
  "toolCallLog",
  "toolLimitBuckets",
  "apiRateLimits",
] as const

export type AccountTablePhase = (typeof ACCOUNT_TABLE_PHASES)[number]

type AccountTablePageOptions = {
  cursor: null
  numItems: number
  maximumRowsRead: number
  maximumBytesRead: number
}

/** One destructive page (always from the head) of an account-owned table. */
export async function paginateAccountTable(
  ctx: MutationCtx,
  phase: AccountTablePhase,
  account: Doc<"users">,
  options: AccountTablePageOptions
) {
  const userId = account._id
  switch (phase) {
    case "userKeys":
      return await ctx.db
        .query("userKeys")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate(options)
    case "mcpToolApprovals":
      return await ctx.db
        .query("mcpToolApprovals")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate(options)
    case "mcpServers":
      return await ctx.db
        .query("mcpServers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate(options)
    case "userPreferences":
      return await ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate(options)
    case "feedback":
      return await ctx.db
        .query("feedback")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate(options)
    case "toolCallLog":
      return await ctx.db
        .query("toolCallLog")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate(options)
    // Actor keys mirror their writers: toolLimits.checkAndConsume keys by the
    // WorkOS subject, rateLimits.consume by the users row id.
    case "toolLimitBuckets":
      return await ctx.db
        .query("toolLimitBuckets")
        .withIndex("by_actor_limit_scope_bucket", (q) =>
          q.eq("actorKey", `user:${account.workosUserId}`)
        )
        .paginate(options)
    case "apiRateLimits":
      return await ctx.db
        .query("apiRateLimits")
        .withIndex("by_actor_bucket_window", (q) =>
          q.eq("actorKey", `user:${userId}`)
        )
        .paginate(options)
  }
}

/** Personal fields cleared from the tombstone once its data is drained. */
export const ACCOUNT_TOMBSTONE_SCRUB = {
  email: undefined,
  displayName: undefined,
  profileImage: undefined,
  profileImageOverride: undefined,
  profileImageStorageId: undefined,
  systemPrompt: undefined,
  favoriteModels: undefined,
} satisfies Partial<Doc<"users">>

/**
 * Start the deleted account's owned-data drain, idempotently: an unfinished
 * job (including a blocked one) is reused, never duplicated, so a replayed
 * deletion cannot start a second batch chain.
 */
export async function ensureAccountDeletionJob(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Id<"deletionJobs">> {
  const unfinished = await ctx.db
    .query("deletionJobs")
    .withIndex("by_kind_user", (q) =>
      q.eq("targetKind", "account").eq("userId", userId)
    )
    .filter((q) => q.neq(q.field("state"), "complete"))
    .first()
  if (unfinished) return unfinished._id

  const now = Date.now()
  const jobId = await ctx.db.insert("deletionJobs", {
    targetKind: "account",
    userId,
    state: "pending",
    phase: "chats",
    version: 1,
    batchesProcessed: 0,
    documentsDeleted: 0,
    bytesObserved: 0,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.scheduler.runAfter(0, internal.deletionCleanup.runDeletionBatch, {
    jobId,
  })
  return jobId
}
