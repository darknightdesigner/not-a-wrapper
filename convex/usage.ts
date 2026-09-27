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
import { optionalAuthMutation, optionalAuthQuery } from "./lib/authedFunctions"
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
 * Signed-in counters live on the user row and are keyed by the Convex
 * identity. Guest turns (ADR-0045) are admitted only through server-proven
 * calls: the Next server verifies the signed guest cookie, derives the client
 * network, and signs the call; windows are keyed by that server-derived actor,
 * never by a client-sent id.
 *
 * The retired pro-model fields stay optional in the schema only until
 * production preflight proves older user rows can be contracted safely.
 */

const USAGE_ERROR_CODES = {
  USER_NOT_FOUND: "USER_NOT_FOUND",
} as const

function getStartOfDayMs(): number {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  return startOfDay.getTime()
}

type AbuseAdmissionCtx = Pick<MutationCtx, "db"> & {
  identity: Awaited<ReturnType<MutationCtx["auth"]["getUserIdentity"]>>
  user: Doc<"users"> | null
}

/** Check whether the signed-in caller has reached their daily limit. */
export const checkUsage = optionalAuthQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.identity) {
      throw new Error("Not authenticated")
    }

    const user = ctx.user

    if (!user) {
      return {
        canSend: false,
        remaining: 0,
        limit: 0,
        error: "User not found",
        errorCode: USAGE_ERROR_CODES.USER_NOT_FOUND,
      }
    }

    const startOfDayMs = getStartOfDayMs()
    const limit = user.anonymous
      ? NON_AUTH_DAILY_MESSAGE_LIMIT
      : AUTH_DAILY_MESSAGE_LIMIT
    const lastReset = user.dailyReset ?? 0
    const isNewDay = lastReset < startOfDayMs
    const count = isNewDay ? 0 : (user.dailyMessageCount ?? 0)
    const remaining = Math.max(0, limit - count)

    return {
      canSend: count < limit,
      remaining,
      limit,
      count,
      isAnonymous: user.anonymous,
    }
  },
})

export async function admitUsageHandler(ctx: AbuseAdmissionCtx) {
  // Guests are admitted only through `admitGuestTurn` (server-proven).
  if (!ctx.identity) {
    throw new Error("Not authenticated")
  }

  const user = ctx.user

  if (!user) {
    return {
      canSend: false,
      remaining: 0,
      limit: 0,
      error: "User not found",
      errorCode: USAGE_ERROR_CODES.USER_NOT_FOUND,
    }
  }

  const startOfDayMs = getStartOfDayMs()
  const now = Date.now()
  const limit = user.anonymous
    ? NON_AUTH_DAILY_MESSAGE_LIMIT
    : AUTH_DAILY_MESSAGE_LIMIT
  const lastReset = user.dailyReset ?? 0
  const isNewDay = lastReset < startOfDayMs
  const count = isNewDay ? 0 : (user.dailyMessageCount ?? 0)
  if (count >= limit) {
    return {
      canSend: false,
      remaining: 0,
      limit,
      count,
      isAnonymous: user.anonymous,
    }
  }

  const nextCount = count + 1

  await ctx.db.patch(user._id, {
    messageCount: (user.messageCount ?? 0) + 1,
    dailyMessageCount: nextCount,
    dailyReset: isNewDay ? startOfDayMs : user.dailyReset,
    lastActiveAt: now,
  })

  return {
    canSend: true,
    remaining: limit - nextCount,
    limit,
    count: nextCount,
    isAnonymous: user.anonymous,
  }
}

export const admit = optionalAuthMutation({
  args: {},
  handler: admitUsageHandler,
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

/** The guest's remaining daily turns, for the composer's pre-send hint. */
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
