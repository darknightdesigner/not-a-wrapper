import { v } from "convex/values"
import { CHAT_TURN_EXECUTION_BUDGET } from "../lib/chat-turn/execution-budget"
import {
  AUTH_DAILY_MESSAGE_LIMIT,
  GUEST_TURN_LIMITS,
  NON_AUTH_DAILY_MESSAGE_LIMIT,
} from "../lib/config"
import type { Doc } from "./_generated/dataModel"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { optionalAuthMutation } from "./lib/authedFunctions"
import { requireServerCallProof, type GuestActor } from "./lib/serverCallProof"
import {
  API_RATE_LIMIT_MAX_WINDOW_MS,
  commitFixedWindow,
  readFixedWindow,
} from "./rateLimits"

/**
 * Daily message counters — ABUSE RATE LIMITS ONLY (ADR-0021).
 *
 * These counters protect the application from request abuse; they are NOT the
 * economic admission system. Platform-funded spend is admitted by the atomic
 * allowance reservation in convex/usageAllowance.ts, and BYOK messages bypass
 * allowance entirely while still counting here as ordinary requests.
 *
 * Every counter is an `apiRateLimits` fixed window over a UTC day. Signed-in
 * windows are keyed by the caller's users row id and never write that row:
 * every authenticated query reads it (ADR-0044), so a per-send write there
 * would re-run them all. Guest turns (ADR-0045) are admitted only through
 * server-proven calls: the Next server verifies the signed guest cookie,
 * derives the client network, and signs the call; windows are keyed by that
 * server-derived actor, never by a client-sent id.
 *
 * The retired users-row counters (`messageCount`, `dailyMessageCount`,
 * `dailyReset`, `lastActiveAt`) and pro-model fields stay optional in the
 * schema only until production preflight proves older user rows can be
 * contracted safely.
 */

const USAGE_ERROR_CODES = {
  USER_NOT_FOUND: "USER_NOT_FOUND",
} as const

export const admit = optionalAuthMutation({
  args: {},
  handler: async (ctx) => {
    // Guests are admitted only through `admitGuestTurn` (server-proven).
    if (!ctx.identity) {
      throw new Error("Not authenticated")
    }

    const { user } = ctx
    if (!user) {
      return {
        canSend: false,
        remaining: 0,
        limit: 0,
        error: "User not found",
        errorCode: USAGE_ERROR_CODES.USER_NOT_FOUND,
      }
    }

    // The signed-in daily window is a private policy, not a `consume` bucket.
    // Check and count in one transaction, so concurrent sends cannot both pass
    // the final slot. A refusal writes nothing.
    const limit = user.anonymous
      ? NON_AUTH_DAILY_MESSAGE_LIMIT
      : AUTH_DAILY_MESSAGE_LIMIT
    const daily = await readFixedWindow(ctx, {
      actorKey: `user:${user._id}`,
      bucket: "user_turns_daily",
      limit,
      windowMs: API_RATE_LIMIT_MAX_WINDOW_MS,
      now: Date.now(),
    })
    if (!daily.allowed) {
      return {
        canSend: false,
        remaining: 0,
        limit,
        count: daily.currentCount,
        isAnonymous: user.anonymous,
      }
    }

    await commitFixedWindow(ctx, daily)
    return {
      canSend: true,
      remaining: daily.remaining,
      limit,
      count: daily.currentCount + 1,
      isAnonymous: user.anonymous,
    }
  },
})

// ---------------------------------------------------------------------------
// Guest turn admission (ADR-0045)
// ---------------------------------------------------------------------------

// Daily guest windows are UTC days: fixed windows of this length start at UTC
// midnight. The limiter sweep keeps rows for exactly this long.
const GUEST_WINDOW_MS = API_RATE_LIMIT_MAX_WINDOW_MS

// A running guest answer holds its lease at most for the route budget; the
// route releases it when the response ends, and expiry frees a crashed slot.
export const GUEST_TURN_LEASE_MS =
  CHAT_TURN_EXECUTION_BUDGET.routeMaxMs +
  CHAT_TURN_EXECUTION_BUDGET.settlementReserveMs

const guestActorValidator = v.object({
  guestId: v.string(),
  networkKey: v.string(),
})

export type GuestTurnRefusal =
  | "guest_daily_limit"
  | "network_daily_limit"
  | "guest_active_limit"
  | "network_active_limit"
  | "guest_ceiling"

export type GuestTurnAdmission =
  | { kind: "admitted" }
  | { kind: "refused"; reason: GuestTurnRefusal; retryAfterMs: number }

/**
 * The aggregate ceiling, overridable per deployment through the Convex env
 * `GUEST_DAILY_TURN_CEILING` (0 turns guest chat off). A malformed value keeps
 * the committed default rather than lifting the ceiling.
 */
export function resolveGuestTurnCeiling(
  raw = process.env.GUEST_DAILY_TURN_CEILING
): number {
  const parsed = raw?.trim() ? Number(raw) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : GUEST_TURN_LIMITS.dailyTurnsAllGuests
}

async function readGuestWindows(
  ctx: Pick<QueryCtx, "db">,
  guest: GuestActor,
  now: number
) {
  const ceiling = resolveGuestTurnCeiling()
  const [guestDaily, networkDaily, allGuests] = await Promise.all([
    readFixedWindow(ctx, {
      actorKey: `guest:${guest.guestId}`,
      bucket: "guest_turns_daily",
      limit: GUEST_TURN_LIMITS.dailyTurnsPerGuest,
      windowMs: GUEST_WINDOW_MS,
      now,
    }),
    readFixedWindow(ctx, {
      actorKey: `network:${guest.networkKey}`,
      bucket: "guest_network_turns_daily",
      limit: GUEST_TURN_LIMITS.dailyTurnsPerNetwork,
      windowMs: GUEST_WINDOW_MS,
      now,
    }),
    // One shared row for every guest. Guest volume is small enough that its
    // write contention is cheaper than a sharded counter.
    ceiling > 0
      ? readFixedWindow(ctx, {
          actorKey: "guests",
          bucket: "guest_ceiling_daily",
          limit: ceiling,
          windowMs: GUEST_WINDOW_MS,
          now,
        })
      : null,
  ])
  return { guestDaily, networkDaily, allGuests }
}

function refuse(
  reason: GuestTurnRefusal,
  retryAfterMs: number,
  requestId: string
): GuestTurnAdmission {
  console.log(JSON.stringify({ _tag: "guest_turn_refused", reason, requestId }))
  return { kind: "refused", reason, retryAfterMs: Math.max(0, retryAfterMs) }
}

/**
 * Admit one guest turn atomically: every window and concurrency check passes
 * before any counter moves, and a refusal writes nothing. Trusted core; the
 * registration verifies the server-call proof first.
 */
export async function admitGuestTurnHandler(
  ctx: Pick<MutationCtx, "db">,
  { guest, requestId }: { guest: GuestActor; requestId: string },
  now = Date.now()
): Promise<GuestTurnAdmission> {
  // The request id is server-minted per turn, so a replay never counts twice.
  const existing = await ctx.db
    .query("guestTurnLeases")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .unique()
  if (existing) {
    if (existing.guestId !== guest.guestId) {
      throw new Error("Guest turn request id belongs to another guest")
    }
    return { kind: "admitted" }
  }

  const windows = await readGuestWindows(ctx, guest, now)
  if (!windows.guestDaily.allowed) {
    return refuse(
      "guest_daily_limit",
      windows.guestDaily.retryAfterMs,
      requestId
    )
  }
  if (!windows.networkDaily.allowed) {
    return refuse(
      "network_daily_limit",
      windows.networkDaily.retryAfterMs,
      requestId
    )
  }

  const [guestActive, networkActive] = await Promise.all([
    ctx.db
      .query("guestTurnLeases")
      .withIndex("by_guest_expires", (q) =>
        q.eq("guestId", guest.guestId).gt("expiresAt", now)
      )
      .take(GUEST_TURN_LIMITS.activeTurnsPerGuest),
    ctx.db
      .query("guestTurnLeases")
      .withIndex("by_network_expires", (q) =>
        q.eq("networkKey", guest.networkKey).gt("expiresAt", now)
      )
      .take(GUEST_TURN_LIMITS.activeTurnsPerNetwork),
  ])
  const soonestExpiry = (leases: Doc<"guestTurnLeases">[]) =>
    Math.min(...leases.map((lease) => lease.expiresAt)) - now
  if (guestActive.length >= GUEST_TURN_LIMITS.activeTurnsPerGuest) {
    return refuse("guest_active_limit", soonestExpiry(guestActive), requestId)
  }
  if (networkActive.length >= GUEST_TURN_LIMITS.activeTurnsPerNetwork) {
    return refuse(
      "network_active_limit",
      soonestExpiry(networkActive),
      requestId
    )
  }

  if (!windows.allGuests?.allowed) {
    return refuse(
      "guest_ceiling",
      windows.allGuests?.retryAfterMs ?? 0,
      requestId
    )
  }

  await commitFixedWindow(ctx, windows.guestDaily)
  await commitFixedWindow(ctx, windows.networkDaily)
  await commitFixedWindow(ctx, windows.allGuests)
  await ctx.db.insert("guestTurnLeases", {
    requestId,
    guestId: guest.guestId,
    networkKey: guest.networkKey,
    expiresAt: now + GUEST_TURN_LEASE_MS,
  })
  return { kind: "admitted" }
}

export const admitGuestTurn = mutation({
  args: {
    guest: guestActorValidator,
    requestId: v.string(),
    issuedAt: v.number(),
    proof: v.string(),
  },
  handler: async (
    ctx,
    { guest, requestId, issuedAt, proof }
  ): Promise<GuestTurnAdmission> => {
    requireServerCallProof(
      { purpose: "guest_turn_admit", guest, requestId, issuedAt },
      proof
    )
    return admitGuestTurnHandler(ctx, { guest, requestId })
  },
})

/** Free the guest's concurrency slot when its response ends. Idempotent. */
export const releaseGuestTurn = mutation({
  args: {
    guest: guestActorValidator,
    requestId: v.string(),
    issuedAt: v.number(),
    proof: v.string(),
  },
  handler: async (ctx, { guest, requestId, issuedAt, proof }) => {
    requireServerCallProof(
      { purpose: "guest_turn_release", guest, requestId, issuedAt },
      proof
    )
    const lease = await ctx.db
      .query("guestTurnLeases")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .unique()
    if (lease?.guestId === guest.guestId) {
      await ctx.db.delete(lease._id)
    }
    return null
  },
})

/** The guest's remaining daily turns, for the composer's typing-time hint. */
export const checkGuestUsage = query({
  args: {
    guest: guestActorValidator,
    issuedAt: v.number(),
    proof: v.string(),
  },
  handler: async (ctx, { guest, issuedAt, proof }) => {
    requireServerCallProof(
      { purpose: "guest_usage_read", guest, issuedAt },
      proof
    )
    const { guestDaily, networkDaily, allGuests } = await readGuestWindows(
      ctx,
      guest,
      Date.now()
    )
    const remaining = allGuests?.allowed
      ? Math.max(
          0,
          Math.min(
            GUEST_TURN_LIMITS.dailyTurnsPerGuest - guestDaily.currentCount,
            GUEST_TURN_LIMITS.dailyTurnsPerNetwork - networkDaily.currentCount
          )
        )
      : 0
    return {
      count: Math.max(guestDaily.currentCount, networkDaily.currentCount),
      limit: GUEST_TURN_LIMITS.dailyTurnsPerGuest,
      remaining,
    }
  },
})
