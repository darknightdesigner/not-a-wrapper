/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "./_generated/api"
import {
  API_RATE_LIMIT_MAX_WINDOW_MS,
  TOOL_LIMIT_ROW_RETENTION_MS,
} from "./rateLimits"
import schema from "./schema"
import { modules } from "./test.setup"

describe("sweepExpiredLimiterRows", () => {
  it("deletes only rows that can no longer affect a limit", async () => {
    const t = convexTest(schema, modules)
    const now = Date.now()
    const minute = 60_000
    await t.run(async (ctx) => {
      const toolBucket = (updatedAt: number) => ({
        actorKey: "guest:guest_a",
        limitType: "budget" as const,
        toolName: "web_search",
        scopeKey: "*",
        keyMode: "platform" as const,
        bucketStartMs: updatedAt,
        count: 1,
        updatedAt,
      })
      await ctx.db.insert(
        "toolLimitBuckets",
        toolBucket(now - TOOL_LIMIT_ROW_RETENTION_MS - minute)
      )
      await ctx.db.insert("toolLimitBuckets", toolBucket(now - minute))

      const window = (windowStartMs: number) => ({
        actorKey: "network:network_1",
        bucket: "guest_network_turns_daily",
        windowStartMs,
        count: 1,
      })
      await ctx.db.insert(
        "apiRateLimits",
        window(now - API_RATE_LIMIT_MAX_WINDOW_MS - minute)
      )
      await ctx.db.insert("apiRateLimits", window(now - minute))

      const lease = (requestId: string, expiresAt: number) => ({
        requestId,
        guestId: "guest_a",
        networkKey: "network_1",
        expiresAt,
      })
      await ctx.db.insert("guestTurnLeases", lease("expired", now - minute))
      await ctx.db.insert("guestTurnLeases", lease("running", now + minute))

      await ctx.db.insert("anonymousUsage", {
        anonymousId: "guest_legacy",
        dailyMessageCount: 1,
        dailyReset: now,
      })
    })

    await t.mutation(internal.rateLimits.sweepExpiredLimiterRows, {})

    const remaining = await t.run(async (ctx) => ({
      toolUpdatedAt: (await ctx.db.query("toolLimitBuckets").collect()).map(
        (row) => row.updatedAt
      ),
      windowStarts: (await ctx.db.query("apiRateLimits").collect()).map(
        (row) => row.windowStartMs
      ),
      leases: (await ctx.db.query("guestTurnLeases").collect()).map(
        (row) => row.requestId
      ),
      retiredCounters: (await ctx.db.query("anonymousUsage").collect()).length,
    }))
    expect(remaining).toEqual({
      toolUpdatedAt: [now - minute],
      windowStarts: [now - minute],
      leases: ["running"],
      retiredCounters: 0,
    })
  })
})

describe("consume", () => {
  it("refuses at the daily window without counting the minute window", async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        workosUserId: "workos_1",
        anonymous: false,
        premium: false,
      })
    )
    const day = API_RATE_LIMIT_MAX_WINDOW_MS
    await t.run((ctx) =>
      ctx.db.insert("apiRateLimits", {
        actorKey: `user:${userId}`,
        bucket: "prompt_autocomplete:1",
        windowStartMs: Math.floor(Date.now() / day) * day,
        count: 2_000,
      })
    )

    const result = await t
      .withIdentity({ subject: "workos_1" })
      .mutation(api.rateLimits.consume, { bucket: "prompt_autocomplete" })

    expect(result.allowed).toBe(false)
    const rows = await t.run((ctx) => ctx.db.query("apiRateLimits").collect())
    expect(rows.map((row) => [row.bucket, row.count])).toEqual([
      ["prompt_autocomplete:1", 2_000],
    ])
  })
})
