import { v } from "convex/values"
import { resolveToolLimitPolicy } from "../lib/tools/limit-policy"
import { optionalAuthMutation } from "./lib/authedFunctions"
import { requireServerCallProof } from "./lib/serverCallProof"

const MAX_SCOPE_ITEMS = 25

function sanitizeScopeCount(count: number): number {
  if (!Number.isFinite(count)) return 1
  const normalized = Math.trunc(count)
  return normalized > 0 ? normalized : 1
}

function toRetryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000))
}

function formatDomainLimitCode(
  toolName: string
): `${string}_DOMAIN_LIMIT_EXCEEDED` {
  const normalizedToolName = toolName
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()

  return `${normalizedToolName || "TOOL"}_DOMAIN_LIMIT_EXCEEDED`
}

/**
 * Sliding-window tool budget and domain limits (Tool budget, CONTEXT.md).
 *
 * Callable only by the Next server (ADR-0045): every call carries a
 * server-call proof over its arguments, the window policy is resolved here by
 * tool name, and the actor is the caller's Convex identity or, for guests, the
 * cookie-verified guest id the server signed. A browser cannot reach it with
 * a chosen id or policy.
 */
export const checkAndConsume = optionalAuthMutation({
  args: {
    limitType: v.union(v.literal("domain"), v.literal("budget")),
    toolName: v.string(),
    keyMode: v.union(v.literal("platform"), v.literal("byok")),
    scopeCounts: v.array(
      v.object({
        scopeKey: v.string(),
        count: v.number(),
      })
    ),
    consume: v.boolean(),
    /** Guests only: the cookie-verified id, bound by the proof. */
    guestId: v.optional(v.string()),
    issuedAt: v.number(),
    proof: v.string(),
  },
  handler: async (ctx, args) => {
    const {
      limitType,
      toolName,
      keyMode,
      scopeCounts,
      consume,
      guestId,
      issuedAt,
      proof,
    } = args
    // Bound the payload before hashing it.
    if (scopeCounts.length > MAX_SCOPE_ITEMS) {
      throw new Error(
        `Too many scopes (${scopeCounts.length}); max ${MAX_SCOPE_ITEMS}`
      )
    }
    requireServerCallProof(
      {
        purpose: "tool_limit",
        guestId: guestId ?? null,
        limitType,
        toolName,
        keyMode,
        scopeCounts,
        consume,
        issuedAt,
      },
      proof
    )

    // Signed-in callers are their Convex identity; the server never signs a
    // guest id alongside a user token.
    const identity = ctx.identity
    let actorKey: string
    if (identity && !guestId) {
      actorKey = `user:${identity.subject}`
    } else if (!identity && guestId) {
      actorKey = `guest:${guestId}`
    } else {
      throw new Error("Tool limits need exactly one signed-in or guest actor")
    }

    const { windowMs, maxCount, bucketSizeMs } = resolveToolLimitPolicy(
      limitType,
      toolName,
      keyMode
    )

    if (scopeCounts.length === 0) {
      return { allowed: true, remaining: maxCount }
    }

    const now = Date.now()
    const currentBucketStartMs = Math.floor(now / bucketSizeMs) * bucketSizeMs
    const windowStartMs = now - windowMs + 1
    const firstBucketStartMs =
      Math.floor(windowStartMs / bucketSizeMs) * bucketSizeMs

    const normalizedScopes = scopeCounts.map((scope) => ({
      scopeKey: scope.scopeKey,
      count: sanitizeScopeCount(scope.count),
    }))

    const scopedTotals: Array<{
      scopeKey: string
      total: number
      projected: number
      count: number
      oldestBucketStartMs?: number
    }> = []

    for (const scope of normalizedScopes) {
      const buckets = await ctx.db
        .query("toolLimitBuckets")
        .withIndex("by_actor_limit_scope_bucket", (q) =>
          q
            .eq("actorKey", actorKey)
            .eq("limitType", limitType)
            .eq("toolName", toolName)
            .eq("scopeKey", scope.scopeKey)
            .eq("keyMode", keyMode)
            .gte("bucketStartMs", firstBucketStartMs)
            .lte("bucketStartMs", currentBucketStartMs)
        )
        .collect()

      const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
      const projected = total + scope.count
      const oldestBucketStartMs = buckets
        .filter((bucket) => bucket.count > 0)
        .sort((a, b) => a.bucketStartMs - b.bucketStartMs)[0]?.bucketStartMs

      scopedTotals.push({
        scopeKey: scope.scopeKey,
        total,
        projected,
        count: scope.count,
        oldestBucketStartMs,
      })
    }

    const denied = scopedTotals.find((scope) => scope.projected > maxCount)
    if (denied) {
      const retryAfterMs = denied.oldestBucketStartMs
        ? Math.max(
            1_000,
            denied.oldestBucketStartMs + bucketSizeMs + windowMs - now
          )
        : windowMs

      if (limitType === "domain") {
        return {
          allowed: false,
          code: formatDomainLimitCode(toolName),
          message: `Too many "${toolName}" requests for domain "${denied.scopeKey}" in the active window.`,
          retryAfterSeconds: toRetryAfterSeconds(retryAfterMs),
          scopeKey: denied.scopeKey,
          remaining: Math.max(0, maxCount - denied.total),
        }
      }

      return {
        allowed: false,
        code: "TOOL_BUDGET_EXCEEDED",
        message: `Tool budget exceeded for "${toolName}" (${keyMode} key mode) in the active window.`,
        retryAfterSeconds: toRetryAfterSeconds(retryAfterMs),
        scopeKey: denied.scopeKey,
        remaining: Math.max(0, maxCount - denied.total),
      }
    }

    if (consume) {
      for (const scope of scopedTotals) {
        const existing = await ctx.db
          .query("toolLimitBuckets")
          .withIndex("by_actor_limit_scope_bucket", (q) =>
            q
              .eq("actorKey", actorKey)
              .eq("limitType", limitType)
              .eq("toolName", toolName)
              .eq("scopeKey", scope.scopeKey)
              .eq("keyMode", keyMode)
              .eq("bucketStartMs", currentBucketStartMs)
          )
          .unique()

        if (existing) {
          await ctx.db.patch(existing._id, {
            count: existing.count + scope.count,
            updatedAt: now,
          })
        } else {
          await ctx.db.insert("toolLimitBuckets", {
            actorKey,
            limitType,
            toolName,
            scopeKey: scope.scopeKey,
            keyMode,
            bucketStartMs: currentBucketStartMs,
            count: scope.count,
            updatedAt: now,
          })
        }
      }
    }

    const remaining = scopedTotals.reduce(
      (min, scope) => Math.min(min, maxCount - scope.projected),
      maxCount
    )

    return { allowed: true, remaining: Math.max(0, remaining) }
  },
})
