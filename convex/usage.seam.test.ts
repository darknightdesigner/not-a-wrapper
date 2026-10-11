/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AUTH_DAILY_MESSAGE_LIMIT, GUEST_TURN_LIMITS } from "../lib/config"
import { resolveToolLimitPolicy } from "../lib/tools/limit-policy"
import { api } from "./_generated/api"
import {
  signServerCallProof,
  type GuestActor,
  type GuestTurnRef,
} from "./lib/serverCallProof"
import { API_RATE_LIMIT_MAX_WINDOW_MS } from "./rateLimits"
import schema from "./schema"
import { modules } from "./test.setup"

// Seam tests (ADR-0034) for turn admission (ADR-0021, ADR-0045): the
// registered functions a browser could reach, through their real validators
// and indexes.

const SECRET = "test-chat-admission-secret-with-32-bytes"
const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>

function signed(
  purpose: "guest_turn_admit" | "guest_turn_release",
  guest: GuestActor,
  requestId: string
) {
  const issuedAt = Date.now()
  return {
    guest,
    requestId,
    issuedAt,
    proof: signServerCallProof({ purpose, guest, requestId, issuedAt }, SECRET),
  }
}

const admit = (t: T, guest: GuestActor, requestId: string) =>
  t.mutation(
    api.usage.admitGuestTurn,
    signed("guest_turn_admit", guest, requestId)
  )
const release = (t: T, guest: GuestActor, requestId: string) =>
  t.mutation(
    api.usage.releaseGuestTurn,
    signed("guest_turn_release", guest, requestId)
  )

describe("signed-in turn admission", () => {
  const seedUser = (t: T) =>
    t.run((ctx) =>
      ctx.db.insert("users", {
        workosUserId: "workos_1",
        anonymous: false,
        premium: false,
      })
    )
  const caller = (t: T) => t.withIdentity({ subject: "workos_1" })
  afterEach(() => vi.useRealTimers())

  // Every authenticated query reads the users row (ADR-0044), so an untouched
  // row means admission re-runs no subscription.
  it("counts turns without writing the users row", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const before = await t.run((ctx) => ctx.db.get(userId))

    for (const count of [1, 2]) {
      await expect(
        caller(t).mutation(api.usage.admit, {})
      ).resolves.toMatchObject({
        canSend: true,
        count,
        remaining: AUTH_DAILY_MESSAGE_LIMIT - count,
      })
    }
    expect(await t.run((ctx) => ctx.db.get(userId))).toEqual(before)
  })

  it("admits the last daily slot, then refuses without counting", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2027-01-15T23:59:00.000Z"))
    const t = makeT()
    const userId = await seedUser(t)
    const dayStart =
      Math.floor(Date.now() / API_RATE_LIMIT_MAX_WINDOW_MS) *
      API_RATE_LIMIT_MAX_WINDOW_MS
    await t.run((ctx) =>
      ctx.db.insert("apiRateLimits", {
        actorKey: `user:${userId}`,
        bucket: "user_turns_daily",
        windowStartMs: dayStart,
        count: AUTH_DAILY_MESSAGE_LIMIT - 1,
      })
    )

    await expect(
      caller(t).mutation(api.usage.admit, {})
    ).resolves.toMatchObject({ canSend: true, remaining: 0 })
    await expect(
      caller(t).mutation(api.usage.admit, {})
    ).resolves.toMatchObject({
      canSend: false,
      count: AUTH_DAILY_MESSAGE_LIMIT,
    })
    const counts = await t.run(async (ctx) =>
      (await ctx.db.query("apiRateLimits").collect()).map((row) => row.count)
    )
    expect(counts).toEqual([AUTH_DAILY_MESSAGE_LIMIT])
  })
})

describe("guest turn admission (server-proven)", () => {
  beforeEach(() => vi.stubEnv("CHAT_ADMISSION_SECRET", SECRET))
  afterEach(() => vi.unstubAllEnvs())

  it("keeps a guest limited across a new cookie and a new network", async () => {
    const t = makeT()
    const guest = { guestId: "guest_a", networkKey: "network_1" }
    for (let turn = 0; turn < GUEST_TURN_LIMITS.dailyTurnsPerGuest; turn++) {
      await expect(admit(t, guest, `request_${turn}`)).resolves.toEqual({
        kind: "admitted",
      })
      await release(t, guest, `request_${turn}`)
    }

    // A fresh cookie from the same network does not reset the allowance.
    await expect(
      admit(t, { guestId: "guest_b", networkKey: "network_1" }, "request_b")
    ).resolves.toMatchObject({ kind: "refused", reason: "network_daily_limit" })
    // Neither does the same cookie from another network.
    await expect(
      admit(t, { guestId: "guest_a", networkKey: "network_2" }, "request_c")
    ).resolves.toMatchObject({ kind: "refused", reason: "guest_daily_limit" })
  })

  it("caps running answers per guest and per network until release", async () => {
    const t = makeT()
    const first = { guestId: "guest_a", networkKey: "network_1" }
    const second = { guestId: "guest_b", networkKey: "network_1" }

    // A detached answer (ADR-0013) plus a new send both run.
    for (const requestId of ["request_1", "request_2"]) {
      await expect(admit(t, first, requestId)).resolves.toEqual({
        kind: "admitted",
      })
    }
    await expect(admit(t, first, "request_3")).resolves.toMatchObject({
      kind: "refused",
      reason: "guest_active_limit",
    })
    await expect(admit(t, second, "request_4")).resolves.toMatchObject({
      kind: "refused",
      reason: "network_active_limit",
    })

    await release(t, first, "request_1")
    await expect(admit(t, second, "request_4")).resolves.toEqual({
      kind: "admitted",
    })
  })

  it("refuses every guest once the aggregate ceiling is spent", async () => {
    vi.stubEnv("GUEST_DAILY_TURN_CEILING", "2")
    const t = makeT()
    for (const n of [1, 2]) {
      await expect(
        admit(t, { guestId: `guest_${n}`, networkKey: `network_${n}` }, `r${n}`)
      ).resolves.toEqual({ kind: "admitted" })
    }
    await expect(
      admit(t, { guestId: "guest_3", networkKey: "network_3" }, "r3")
    ).resolves.toMatchObject({ kind: "refused", reason: "guest_ceiling" })
  })

  it("keys guest tool budgets on the admitted turn's network", async () => {
    const t = makeT()
    const webSearch = resolveToolLimitPolicy("budget", "web_search", "platform")
    const consumeWebSearch = (guestTurn: GuestTurnRef, count: number) => {
      const call = {
        limitType: "budget" as const,
        toolName: "web_search",
        keyMode: "platform" as const,
        scopeCounts: [{ scopeKey: "*", count }],
        consume: true,
        guestTurn,
        issuedAt: Date.now(),
      }
      return t.mutation(api.toolLimits.checkAndConsume, {
        ...call,
        proof: signServerCallProof({ purpose: "tool_limit", ...call }, SECRET),
      })
    }

    await admit(t, { guestId: "guest_a", networkKey: "network_1" }, "r1")
    await expect(
      consumeWebSearch(
        { guestId: "guest_a", requestId: "r1" },
        webSearch.maxCount
      )
    ).resolves.toMatchObject({ allowed: true })

    // A fresh cookie on the same network inherits the spent budget.
    await admit(t, { guestId: "guest_b", networkKey: "network_1" }, "r2")
    await expect(
      consumeWebSearch({ guestId: "guest_b", requestId: "r2" }, 1)
    ).resolves.toMatchObject({ allowed: false, code: "TOOL_BUDGET_EXCEEDED" })
    // A signed call for a turn that holds no lease is refused.
    await expect(
      consumeWebSearch({ guestId: "guest_b", requestId: "r_unadmitted" }, 1)
    ).rejects.toThrow("admitted, running guest turn")
  })

  it("rejects forged proofs and direct browser calls without writing", async () => {
    const t = makeT()
    const victim = { guestId: "guest_a", networkKey: "network_1" }

    // A proof signed for one guest cannot admit another.
    await expect(
      t.mutation(api.usage.admitGuestTurn, {
        ...signed("guest_turn_admit", victim, "request_1"),
        guest: { guestId: "guest_forged", networkKey: "network_2" },
      })
    ).rejects.toMatchObject({ data: { code: "server_call_proof_invalid" } })
    // The signed-in admission has no guest path any more.
    await expect(t.mutation(api.usage.admit, {})).rejects.toThrow(
      "Not authenticated"
    )
    // Tool limits need the server proof too; a browser cannot pick the id.
    await expect(
      t.mutation(api.toolLimits.checkAndConsume, {
        limitType: "budget",
        toolName: "web_search",
        keyMode: "platform",
        scopeCounts: [{ scopeKey: "*", count: 1 }],
        consume: true,
        guestTurn: { guestId: "guest_forged", requestId: "request_1" },
        issuedAt: Date.now(),
        proof: "0".repeat(64),
      })
    ).rejects.toMatchObject({ data: { code: "server_call_proof_invalid" } })

    const writes = await t.run(async (ctx) => [
      ...(await ctx.db.query("apiRateLimits").collect()),
      ...(await ctx.db.query("guestTurnLeases").collect()),
      ...(await ctx.db.query("toolLimitBuckets").collect()),
    ])
    expect(writes).toHaveLength(0)
  })
})
