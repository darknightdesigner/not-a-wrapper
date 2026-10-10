import { fetchGuestUsage } from "@/lib/api"

/**
 * Usage hint (ADR-0045): the guest's remaining daily turns, read while they
 * type so Send can gate a known zero without a round trip. A plain module
 * value, not React state or a store, so nothing subscribes or re-renders.
 * Keyed by owner: a value read for one owner never answers for another, and
 * only guests read one. A hint only; `/api/chat` admission enforces.
 */

export const GUEST_USAGE_OWNER = "guest"

// Fresh until the earlier of this or the next UTC midnight (when allowances
// reset), so a stale zero never blocks a new day.
const HINT_TTL_MS = 5 * 60_000
const DAY_MS = 86_400_000

type UsageHint = { ownerKey: string; remaining: number; observedAt: number }

let hint: UsageHint | null = null
let pendingRead: Promise<number | null> | null = null
let lastPrefetchAt = Number.NEGATIVE_INFINITY

/** The owner's fresh remaining turns, or null when none is known. */
export function readUsageHint(
  ownerKey: string,
  now = Date.now()
): number | null {
  if (hint?.ownerKey !== ownerKey) return null
  const nextUtcMidnight = (Math.floor(hint.observedAt / DAY_MS) + 1) * DAY_MS
  const expiresAt = Math.min(hint.observedAt + HINT_TTL_MS, nextUtcMidnight)
  return now < expiresAt ? hint.remaining : null
}

export function recordUsageHint(
  ownerKey: string,
  remaining: number,
  now = Date.now()
): void {
  hint = { ownerKey, remaining, observedAt: now }
}

/** One admitted turn spent. The expiry stays tied to the server read. */
export function spendUsageHint(ownerKey: string): void {
  if (hint?.ownerKey !== ownerKey) return
  hint = { ...hint, remaining: Math.max(0, hint.remaining - 1) }
}

/** Reads the guest's usage now, sharing one in-flight read. Null on failure:
 * a failed read never blocks a send. */
export function loadGuestUsageHint(): Promise<number | null> {
  pendingRead ??= fetchGuestUsage()
    .then((remaining) => {
      recordUsageHint(GUEST_USAGE_OWNER, remaining)
      return remaining
    })
    .catch(() => null)
    .finally(() => {
      pendingRead = null
    })
  return pendingRead
}

/** The typing-time read: at most one per TTL whatever its outcome, so a
 * failing route is never retried per keystroke. */
export function prefetchGuestUsageHint(now = Date.now()): void {
  if (now - lastPrefetchAt < HINT_TTL_MS) return
  lastPrefetchAt = now
  void loadGuestUsageHint()
}
