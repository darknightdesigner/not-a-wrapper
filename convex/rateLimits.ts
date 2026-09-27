import { v } from "convex/values"
import {
  EXTRACT_CONTENT_DOMAIN_WINDOW_MS,
  TOOL_BUDGET_WINDOW_MS,
  TOOL_LIMIT_BUCKET_SIZE_MS,
} from "../lib/config"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { authenticatedMutation } from "./lib/authedFunctions"

/**
 * Per-identity fixed-window rate limiter for expensive API routes and guest
 * turn admission.
 *
 * Distinct from `toolLimits` (a sliding-window, tool/domain/budget-scoped
 * limiter for in-chat tool calls): this is a simple request throttle keyed to
 * a server-derived actor, for HTTP endpoints that do real work per call — the
 * MCP "test connection" route opens an outbound socket every time, so it needs a
 * ceiling that can't be lifted by a client-supplied key.
 *
 * The public `consume` derives its actor key from `ctx.user` (never a client
 * argument), so a caller cannot throttle-evade by spoofing an id. Policy is
 * resolved by allowlisted bucket on the server, so public mutation callers
 * cannot reset allowance by choosing a different limit or window. Guest turn
 * windows (convex/usage.ts) use the same table through `readFixedWindow` /
 * `commitFixedWindow`. Stale buckets are swept on write, and the
 * `sweepExpiredLimiterRows` cron removes rows whose actor never returns.
 */

export const API_RATE_LIMIT_POLICIES = {
  mcp_test: { limit: 10, windowMs: 60_000 },
  profile_image_upload: { limit: 10, windowMs: 60_000 },
} as const

export type RateLimitBucket = keyof typeof API_RATE_LIMIT_POLICIES

const rateLimitBucketValidator = v.union(
  v.literal("mcp_test"),
  v.literal("profile_image_upload")
)

export function getRateLimitPolicy(bucket: RateLimitBucket): {
  limit: number
  windowMs: number
} {
  return API_RATE_LIMIT_POLICIES[bucket]
}

/** The longest window any `apiRateLimits` bucket may use (guest days). */
export const API_RATE_LIMIT_MAX_WINDOW_MS = 24 * 60 * 60 * 1000

export type WindowBucket<Id> = {
  _id: Id
  windowStartMs: number
  count: number
}

export type FixedWindowDecision<Id> = {
  windowStartMs: number
  allowed: boolean
  remaining: number
  retryAfterMs: number
  /** Buckets from prior windows that can be deleted. */
  staleBucketIds: Id[]
  /** The current window's bucket, if one already exists. */
  currentBucketId: Id | null
  currentCount: number
}

/**
 * Pure fixed-window decision over a set of buckets for one actor+bucket. Kept
 * separate from the Convex I/O so the throttle arithmetic is unit-testable.
 */
export function evaluateFixedWindow<Id>(
  buckets: WindowBucket<Id>[],
  { now, limit, windowMs }: { now: number; limit: number; windowMs: number }
): FixedWindowDecision<Id> {
  if (limit <= 0 || windowMs <= 0) {
    throw new Error("Invalid rate-limit configuration")
  }

  const windowStartMs = Math.floor(now / windowMs) * windowMs
  const staleBucketIds = buckets
    .filter((b) => b.windowStartMs < windowStartMs)
    .map((b) => b._id)

  const current = buckets.find((b) => b.windowStartMs === windowStartMs)
  const currentCount = current?.count ?? 0

  if (currentCount >= limit) {
    return {
      windowStartMs,
      allowed: false,
      remaining: 0,
      retryAfterMs: windowStartMs + windowMs - now,
      staleBucketIds,
      currentBucketId: current?._id ?? null,
      currentCount,
    }
  }

  return {
    windowStartMs,
    allowed: true,
    remaining: limit - currentCount - 1,
    retryAfterMs: 0,
    staleBucketIds,
    currentBucketId: current?._id ?? null,
    currentCount,
  }
}

export type FixedWindowRead = FixedWindowDecision<Id<"apiRateLimits">> & {
  actorKey: string
  bucket: string
}

/** Read one actor+bucket window inside the caller's transaction. */
export async function readFixedWindow(
  ctx: Pick<QueryCtx, "db">,
  args: {
    actorKey: string
    bucket: string
    limit: number
    windowMs: number
    now: number
  }
): Promise<FixedWindowRead> {
  const { actorKey, bucket, ...policy } = args
  const buckets = await ctx.db
    .query("apiRateLimits")
    .withIndex("by_actor_bucket_window", (q) =>
      q.eq("actorKey", actorKey).eq("bucket", bucket)
    )
    .collect()
  return { ...evaluateFixedWindow(buckets, policy), actorKey, bucket }
}

/**
 * Count one admission against an allowed read and sweep that actor's stale
 * windows. Callers commit only after every window they read has allowed.
 */
export async function commitFixedWindow(
  ctx: Pick<MutationCtx, "db">,
  read: FixedWindowRead
): Promise<void> {
  if (!read.allowed) throw new Error("Cannot commit a refused window")
  await Promise.all(read.staleBucketIds.map((id) => ctx.db.delete(id)))
  if (read.currentBucketId) {
    await ctx.db.patch(read.currentBucketId, { count: read.currentCount + 1 })
    return
  }
  await ctx.db.insert("apiRateLimits", {
    actorKey: read.actorKey,
    bucket: read.bucket,
    windowStartMs: read.windowStartMs,
    count: 1,
  })
}

export const consume = authenticatedMutation({
  args: {
    bucket: rateLimitBucketValidator,
  },
  handler: async (ctx, { bucket }) => {
    const read = await readFixedWindow(ctx, {
      actorKey: `user:${ctx.user._id}`,
      bucket,
      ...getRateLimitPolicy(bucket),
      now: Date.now(),
    })

    if (!read.allowed) {
      await Promise.all(read.staleBucketIds.map((id) => ctx.db.delete(id)))
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: read.retryAfterMs,
      }
    }

    await commitFixedWindow(ctx, read)
    return {
      allowed: true,
      remaining: read.remaining,
      retryAfterMs: 0,
    }
  },
})

/** Rows deleted per table per sweep transaction. */
export const LIMITER_SWEEP_BATCH = 200

/** A tool bucket older than this can no longer fall inside any tool window. */
export const TOOL_LIMIT_ROW_RETENTION_MS =
  Math.max(TOOL_BUDGET_WINDOW_MS, EXTRACT_CONTENT_DOMAIN_WINDOW_MS) +
  TOOL_LIMIT_BUCKET_SIZE_MS

export type LimiterSweepResult = {
  toolLimitBuckets: number
  apiRateLimits: number
  guestTurnLeases: number
  anonymousUsage: number
  continued: boolean
}

/**
 * Delete limiter rows that can no longer affect a decision: tool buckets past
 * the longest tool window, rate windows past the longest window, expired guest
 * turn leases, and the retired `anonymousUsage` counters (ADR-0045 replaced
 * them; nothing reads or writes the table). Bounded per transaction; a full
 * batch schedules an immediate continuation so a backlog drains.
 */
export async function sweepExpiredLimiterRowsHandler(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  now = Date.now()
): Promise<LimiterSweepResult> {
  const toolBuckets = await ctx.db
    .query("toolLimitBuckets")
    .withIndex("by_updated_at", (q) =>
      q.lt("updatedAt", now - TOOL_LIMIT_ROW_RETENTION_MS)
    )
    .take(LIMITER_SWEEP_BATCH)
  const rateWindows = await ctx.db
    .query("apiRateLimits")
    .withIndex("by_window_start", (q) =>
      q.lt("windowStartMs", now - API_RATE_LIMIT_MAX_WINDOW_MS)
    )
    .take(LIMITER_SWEEP_BATCH)
  const leases = await ctx.db
    .query("guestTurnLeases")
    .withIndex("by_expires", (q) => q.lt("expiresAt", now))
    .take(LIMITER_SWEEP_BATCH)
  const retiredCounters = await ctx.db
    .query("anonymousUsage")
    .take(LIMITER_SWEEP_BATCH)

  const batches = [toolBuckets, rateWindows, leases, retiredCounters]
  await Promise.all(
    batches.flatMap((rows) => rows.map((row) => ctx.db.delete(row._id)))
  )

  const continued = batches.some((rows) => rows.length === LIMITER_SWEEP_BATCH)
  if (continued) {
    await ctx.scheduler.runAfter(
      0,
      internal.rateLimits.sweepExpiredLimiterRows,
      {}
    )
  }
  return {
    toolLimitBuckets: toolBuckets.length,
    apiRateLimits: rateWindows.length,
    guestTurnLeases: leases.length,
    anonymousUsage: retiredCounters.length,
    continued,
  }
}

export const sweepExpiredLimiterRows = internalMutation({
  args: {},
  handler: (ctx): Promise<LimiterSweepResult> =>
    sweepExpiredLimiterRowsHandler(ctx),
})
