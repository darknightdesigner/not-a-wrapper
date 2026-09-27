# 44. Account lifecycle: rejected accounts at the auth boundary, tombstone, and deletion drain

- Status: accepted
- Date: 2026-09-27
- Extends: ADR-0003 (authenticated handler seam), ADR-0014 (deletion jobs)
- Preserves: ADR-0021 (usage ledger), ADR-0033 (client-minted chat identity)

## Context

A WorkOS `user.deleted` webhook set `users.deletedAt` and `disabledAt`, but
nothing read them. The Convex auth helpers resolved any row matching the JWT
subject, so a deleted account kept full access until its access token expired,
and its chats, share links, keys, and MCP servers stayed forever. The public
`users.createOrUpdate` bootstrap made it worse: it patched existing rows,
cleared both flags, and stored the browser-sent email, avatar, and
`workosUpdatedAt`. A planted far-future `workosUpdatedAt` made the webhook's
older-update skip ignore every later `user.updated` and `user.deleted` event.

References: the installed AuthKit component lets only signature-verified
webhooks write its user mirror and applies `user.deleted` with no timestamp
check. LibreChat's JWT strategy rejects a user whose row carries a deletion
fence (`ACCOUNT_DELETION_IN_PROGRESS`), then cascades over every owned
collection; its OpenID strategy takes email and profile only from verified
claims.

## Decision

**Rejected account.** A users row with `deletedAt` or `disabledAt` is a
rejected account. `getOptionalAuth` in `convex/lib/auth.ts` is the one caller
resolution every builder uses, and it throws `ConvexError({ code:
"account_rejected" })` for a rejected row, even with a valid JWT. So
authenticated, owned, maybe, optional, readable-chat, and identity builders all
deny it, and optional paths can never turn it into a guest: "no identity" is a
guest, "identity of a rejected account" is a denial. HTTP actions have no
`db`; they only check the identity and rely on the mutations they call.

**Account as chat ancestor.** `isChatActive` now also reads the chat owner's
row and fails closed when it is missing or rejected, the same way a
tombstoned Project hides its Chats. Share links and every other chat-bound
read die at the moment of deletion, with no fan-out writes.

**Insert-only bootstrap.** `users.createOrUpdate` is replaced by
`users.ensureCurrent`, which takes no arguments. It inserts a row only when
none exists, from the verified access token (email, name, and picture only
when the token carries them; WorkOS access tokens carry none by default), and
never patches. Because its builder rejects a rejected row, it cannot clear the
flags or resurrect a tombstone. It is deliberately not `authKit.getAuthUser`:
that mirror is filled by the same webhook the bootstrap exists to not wait
for.

**Verified lifecycle writers.** Only the signature-verified webhook
(`upsertAppUserFromWorkOS`) writes email, names, avatar, and
`workosUpdatedAt`, and it never touches the lifecycle flags. `deletedAt` is
permanent: WorkOS deletions are permanent and ids are never reused, so a
later `user.updated` for a deleted id can only be a replay, and the webhook
ignores it entirely. `disabledAt` has no writer besides deletion today; a
future operator disable or enable must be an internal mutation, never the
bootstrap or a webhook. `softDeleteAppUserFromWorkOS` always applies (no
older-update skip) and is reached from `user.deleted` or the operator's
`users.deleteAccount` internal mutation.

**Tombstone and drain.** Deletion keeps the users row as a tombstone and
starts one `deletionJobs` row with `targetKind: "account"` (ADR-0014
machinery: one bounded page per scheduled mutation, idempotent, restart-safe,
blocked on invariant or storage failure, never auto-resumed). Phases:

1. `chats`: every owned Chat, one at a time, through the Chat phases. Live
   runs are closed through the supersede path first and share links revoked in
   the same commit, as in direct Chat deletion.
2. `projects`: every owned Project root. An unfinished Project job for it is
   marked complete (superseded) so it never blocks on the missing root.
3. `accountAttachments`: staged attachments, with the `by_storage`
   exclusivity check before deleting a blob.
4. `userKeys`, `mcpToolApprovals`, `mcpServers`, `userPreferences`,
   `feedback`, `toolCallLog` (new `by_user` index), `toolLimitBuckets`
   (`user:<WorkOS subject>`), `apiRateLimits` (`user:<users id>`).
5. `accountRoot`: delete the profile image blob unless an attachment still
   references it, then scrub the tombstone's personal fields (email, names,
   avatar, system prompt, favorite models). The row keeps `workosUserId`, the
   lifecycle timestamps, and counters.

The job refuses to run unless the account is deleted, so it can never drain a
live account.

**Kept on purpose.** `usageBuckets`, `usageReservations`, and
`usageLedgerEntries` stay: ADR-0021 makes the ledger append-only, the rows are
content-free accounting, and the tombstone keeps their foreign keys valid.
Pending reservations keep settling through their receipt or deadline
reconciler. `deletionJobs` rows stay as the content-free trail. In-flight
worker grants are not revoked at the tombstone: a run already streaming for a
deleted account may finish and settle normally (bounded by the execution
budget), and the drain closes any run still live when it reaches that Chat.

**Clients.** The UserProvider wraps the app in a boundary that catches
`account_rejected` from any per-user read or the bootstrap and ends the
session (clear local stores, WorkOS sign-out) instead of crashing or acting as
a guest. The chat route maps the rejection to a 403 `ACCOUNT_REJECTED`; other
Next routes fail closed through the same Convex calls.

## Alternatives considered

- **Maybe and optional builders return `null` for a rejected account.** A
  gentler client, but a rejected identity would then look exactly like a
  guest to every optional path, and one future handler that writes on `null`
  would reopen the hole. Rejected.
- **Delete the users row.** A later bootstrap from the still-valid token
  would recreate it. The tombstone is what makes deletion stick.
- **Tombstone every Chat at deletion.** Unbounded fan-out in one mutation.
  The owner-ancestor read gives the same immediacy for one extra point read.
- **Amend ADR-0014 only.** The rejected-account rule changes the ADR-0003
  builder contract and the bootstrap contract, which is more than a deletion
  policy, so it gets its own record.

## Consequences

- A deleted account loses access on its next request, including open
  subscriptions, not when its token expires.
- Every chat-bound access reads the owner row. Owner paths already read it,
  so the new cost is one point read on public share reads and reapers.
  Reapers skip a deleted account's chats; the drain owns them.
- A row created by the bootstrap has no email, name, or avatar until the
  verified webhook arrives. The client shows the WorkOS session's own name
  and picture meanwhile.
- The AuthKit component returns early on `user.deleted` when its own mirror
  row is missing, before our handler runs. For such accounts, run the
  operator mutation below.

## Runbook

Delete an account WorkOS already deleted but our handler never saw:

```bash
bunx convex run users:deleteAccount '{"workosUserId":"user_..."}'
```

A blocked account job resumes like any deletion job (ADR-0014). Never clear
`deletedAt`.
