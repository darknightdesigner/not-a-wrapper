import { fetchGuestUsage } from "@/lib/api"

/**
 * Guest usage hint (ADR-0045): the guest's remaining daily turns, read while
 * they type so Send can gate a known zero without a round trip. A plain module
 * value, not React state or a store, so nothing subscribes or re-renders.
 * Guest-only: `runSendTurn` never consults it for a signed-in send. A hint
 * only; `/api/chat` admission enforces.
 */

// Fresh until the earlier of this or the next UTC midnight (when allowances
// reset), so a stale zero never blocks a new day.
const HINT_TTL_MS = 5 * 60_000
const DAY_MS = 86_400_000

let hint: { remaining: number; observedAt: number } | null = null
// Bumped on every write, so a read that started earlier never overwrites it.
let revision = 0
let pendingRead: Promise<number | null> | null = null
let lastPrefetchAt = Number.NEGATIVE_INFINITY

/** The guest's fresh remaining turns, or null when none is known. */
export function readGuestUsageHint(now = Date.now()): number | null {
  if (!hint) return null
  const nextUtcMidnight = (Math.floor(hint.observedAt / DAY_MS) + 1) * DAY_MS
  const expiresAt = Math.min(hint.observedAt + HINT_TTL_MS, nextUtcMidnight)
  return now < expiresAt ? hint.remaining : null
}

export function recordGuestUsageHint(
  remaining: number,
  now = Date.now()
): void {
  hint = { remaining, observedAt: now }
  revision++
}

/** One admitted turn spent. The expiry stays tied to the server read. */
export function spendGuestUsageHint(): void {
  if (!hint) return
  hint = { ...hint, remaining: Math.max(0, hint.remaining - 1) }
  revision++
}

/** Reads the guest's usage now, sharing one in-flight read. Null on failure:
 * a failed read never blocks a send. */
export function loadGuestUsageHint(): Promise<number | null> {
  const startedAt = revision
  pendingRead ??= fetchGuestUsage()
    .then((remaining) => {
      // A refusal or spend recorded meanwhile is newer than this read.
      if (revision !== startedAt) return readGuestUsageHint()
      recordGuestUsageHint(remaining)
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
