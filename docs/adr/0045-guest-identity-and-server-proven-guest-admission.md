# 45. Guest identity and server-proven guest admission

- Status: accepted
- Date: 2026-09-27
- Context: TODO "Guest abuse and spending limits"; audit
  `docs/audits/2026-09-26-open-source-reference-gaps.md#tool-limit-rows-are-never-deleted`
- Related: ADR-0003 (Authenticated handlers), ADR-0010 (HTTP trust boundary),
  ADR-0020 (admission proof), ADR-0021 (platform usage allowance; its guest
  row said "anonymous ids are client-controlled"), ADR-0034 (Convex seam tests)

## Context

Guests (signed-out visitors) get five turns a day on `gpt-5-mini`, paid with
the platform key. Every guest limit keyed off one value: an id the browser
mints, keeps in localStorage, and sends in the `/api/chat` body. Clearing
storage reset the limit. Worse, both limiters were public Convex mutations
that trusted their arguments:

- `usage.admit({ anonymousId })` counted whatever id the caller named;
- `toolLimits.checkAndConsume` took the guest id **and** the window policy
  (`windowMs`, `maxCount`, `bucketSizeMs`) from the caller.

Nothing limited guests per network, capped how many guest answers could run
at once, or bounded total guest spend. `anonymousUsage` and `toolLimitBuckets`
rows were never deleted.

## Options considered

**Guest identity**

1. Keep the client id. Resettable by design. Rejected.
2. Anonymous auth accounts (a real WorkOS/Convex session per guest). Heavy,
   fills `users` with throwaway rows, and ADR-0021 already rejects cash-like
   anonymous wallets. Rejected.
3. A server-signed httpOnly cookie minted in `proxy.ts` on guest page loads
   (Vercel Chatbot signs every visitor in as a guest in its proxy). Mints for
   crawlers and signed-in users too, and wraps the WorkOS proxy. Rejected.
4. **The same signed cookie, minted lazily by the first guest API call that
   needs it** (`/api/chat`, `/api/rate-limits`). Chosen: one helper, no proxy
   change, only real guests get one.

A cookie alone is not an abuse boundary: a script can drop it. So every guest
limit is keyed on the cookie **and** on the client network.

**How Convex knows the server made the call**

1. Public mutations trusting their arguments (status quo). Forgeable.
2. A Convex HTTP action with a shared Bearer secret dispatching to internal
   mutations. Sends the raw secret on every call and adds a second wire.
3. **A public mutation that verifies an HMAC server-call proof before its
   trusted core runs.** Chosen: the exact shape of the ADR-0020 admission
   proof and the ADR-0021 reservation authorization (same secret, domain
   tagged, 60 s lifetime).
4. A limiter in the Next layer (Vercel Chatbot's Redis IP counter). A second
   store, and Vercel Chatbot's check fails open whenever Redis is down.
   Rejected.

**Counters and concurrency**

Reuse `apiRateLimits` fixed windows (`evaluateFixedWindow`, ADR-0010) for
every daily guest counter instead of a parallel table; a one-day fixed window
starts at UTC midnight, the same day boundary as before. Concurrency uses one
lease row per running answer, like LibreChat's pending-request counter but as
rows with an expiry, checked in the same transaction as the counters, so a
crashed function cannot leak a slot and nothing fails open.

## Decision

### Guest identity (`lib/guest-identity.ts`)

- Cookie `naw_guest` = `guestId.issuedAt.signature`, where the signature is
  `HMAC(CHAT_ADMISSION_SECRET, ["guest-cookie-v1", guestId, issuedAt])`.
  httpOnly, Secure, SameSite=Lax, 30 days, and the server re-checks the age.
  A missing, forged, or expired cookie is replaced by a fresh one.
- No new secret: `CHAT_ADMISSION_SECRET` is already required (32+ bytes) in
  Next and Convex; every use carries its own tag, so a digest for one purpose
  never verifies as another. A missing secret throws, so guest turns fail
  closed.
- Network: only on Vercel (`VERCEL=1`) is `x-real-ip` trusted, because the
  Vercel edge sets it and overwrites a client-sent value. IPv6 counts per /64.
  Elsewhere (local dev, other hosts) the header is caller-controlled, so it is
  ignored and all guests share one network bucket: stricter, never chosen by
  the caller. The network is stored only as
  `HMAC(secret, ["guest-network-v1", network])`.
- The body's `userId` is ignored for limits. The route threads the trusted
  guest id through the runtime's existing `anonymousId` field (tool limits,
  telemetry).

### Server-call proofs (`convex/lib/serverCallProof.ts`)

`HMAC(CHAT_ADMISSION_SECRET, ["server-call-v1", purpose, ...args, issuedAt])`
for four purposes: `guest_turn_admit`, `guest_turn_release`,
`guest_usage_read`, and `tool_limit`. The Next server signs immediately before
each call; the proof never reaches the browser. `requireServerCallProof`
rejects before the handler reads or writes (`server_call_proof_invalid`).

### Guest turn admission (`convex/usage.ts`)

`usage.admitGuestTurn` checks, in one transaction, and writes nothing on a
refusal:

| Limit                         | Key            | Default                                                                        |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Daily turns per guest         | cookie id      | 5                                                                              |
| Daily turns per network       | network key    | 5 (equal, so a new cookie never resets it)                                     |
| Running answers per guest     | cookie id      | 1                                                                              |
| Running answers per network   | network key    | 2                                                                              |
| Daily turns across all guests | one shared row | 1,000; Convex env `GUEST_DAILY_TURN_CEILING` overrides, 0 turns guest chat off |

Limits live in `GUEST_TURN_LIMITS` (`lib/config.ts`). An admitted turn writes
a `guestTurnLeases` row (expiry = route budget + settlement reserve). The route
registers `after(release)` before admitting, so the slot frees when the
response ends (completion, client disconnect, which also stops a guest
provider stream, or any error). A request id is admitted at most once.

The aggregate ceiling counts turns, not dollars. Guests have one model, a
five-step tool cap, and no allowance reservation, so turns times the per-turn
bound is the spend ceiling; a dollar estimate would add a second pricing path
for no stronger bound.

Refusals map to public errors: daily limits to 403 `DAILY_LIMIT_REACHED`,
running answers to 429 `TOO_MANY_ACTIVE_ANSWERS`, the ceiling to 429
`GUEST_CAPACITY_REACHED`.

`usage.admit` and `usage.checkUsage` are now signed-in only; guests read their
remaining turns through `usage.checkGuestUsage` (proof-gated).

### Tool limits (`convex/toolLimits.ts`)

`checkAndConsume` requires a `tool_limit` proof and resolves its window policy
by tool name (`resolveToolLimitPolicy`, `lib/tools/limit-policy.ts`), like
`API_RATE_LIMIT_POLICIES`. The actor is the Convex identity for signed-in
callers or the signed guest id for guests, never both.

### Fail closed

A failed admission call, a missing secret, or an invalid proof refuses the
turn. Mid-turn, a tool-limit outage keeps the existing bounded request-local
soft cap (a few calls per tool, then blocked); the turn itself was already
admitted by a working store.

### Cleanup

`toolLimitBuckets.by_updated_at`, `apiRateLimits.by_window_start`, and
`guestTurnLeases.by_expires` serve one cron, `sweepExpiredLimiterRows`, every
10 minutes: tool buckets older than the longest tool window plus one bucket,
fixed windows older than a day, expired leases, and the retired
`anonymousUsage` table. 200 rows per table per run; a full batch schedules its
own continuation.

## Consequences

- Clearing storage, rotating the body id, or dropping the cookie no longer
  resets a guest's allowance; a script needs new networks, and the aggregate
  ceiling bounds even that.
- Guests behind one shared address (office NAT, carrier NAT) share five turns
  a day. Sign-in lifts it. Tune `dailyTurnsPerNetwork` if that bites.
- Off Vercel, every guest shares one network bucket. A self-hosted deploy
  behind a trusted proxy needs a trusted-header setting before guests are
  usable at scale.
- The ceiling row is written by every guest admission. Convex retries the
  write conflicts; shard it only if guest volume grows.
- Deploy window: while one side runs the old build, guest turns fail (the old
  Next calls the removed guest path of `usage.admit`, or the new Next calls a
  `usage.admitGuestTurn` that does not exist yet) and tool-limit calls fail
  argument validation, which the runtime treats as a store outage (bounded
  soft cap). Signed-in admission is compatible both ways.
- `anonymousUsage` is retired: nothing reads or writes it, the sweep drains
  it, and a later change removes it from the schema once production is empty.
- The wire contract still requires a guest `userId`; it is now vestigial and
  can be dropped with the client builder.
- Follow-ups: per-request provider `safetyIdentifier` for guests can hash the
  trusted `anonymousId`; Vercel BotID can sit in front of guest admission.
