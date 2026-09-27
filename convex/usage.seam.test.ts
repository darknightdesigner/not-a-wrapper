/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GUEST_TURN_LIMITS } from "../lib/config"
import { api } from "./_generated/api"
import { signServerCallProof, type GuestActor } from "./lib/serverCallProof"
import schema from "./schema"
import { modules } from "./test.setup"

// Seam tests (ADR-0034) for guest turn admission (ADR-0045): the registered
// functions a browser could reach, through their real validators and indexes.

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
    const third = { guestId: "guest_c", networkKey: "network_1" }

    await expect(admit(t, first, "request_1")).resolves.toEqual({
      kind: "admitted",
    })
    await expect(admit(t, first, "request_2")).resolves.toMatchObject({
      kind: "refused",
      reason: "guest_active_limit",
    })
    await expect(admit(t, second, "request_3")).resolves.toEqual({
      kind: "admitted",
    })
    await expect(admit(t, third, "request_4")).resolves.toMatchObject({
      kind: "refused",
      reason: "network_active_limit",
    })

    await release(t, first, "request_1")
    await expect(admit(t, third, "request_4")).resolves.toEqual({
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
        guestId: "guest_forged",
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
