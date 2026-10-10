# ADR-0027: Split the selected-conversation subscription

**Status:** Accepted 2026-08-28; rollback removed 2026-08-30 after production
verification; amended 2026-10-10 (live tail)
**Date:** 2026-08-28

## Context

The former `messages.getSelectedConversation` subscription returned the
selected visible path and linked run state in one query. It was introduced as
atomic because "content and run state can never tear," but its measured cost
profile was excessive:

- Convex invalidation is read-set based. The atomic query reads every message
  in the chat, so EVERY write in the chat invalidates it — including writes
  that change nothing it projects.
- During a streaming turn the run doc is patched on every snapshot beat
  (`lastSnapshotSequence`/`lastProgressAt`, even when content dedupes),
  every heartbeat (10 s cadence), every tool step, and every approval
  transition. Each of those run-doc-only writes re-executed the full message
  collect and re-delivered the whole selected path (~23 KB measured) to every
  subscriber — per tab.
- Real conversations are dominated by exactly those content-free windows:
  thinking pauses, tool waits, approval waits.

The obvious alternative — indexing selected messages so the path query reads
fewer rows — is structurally unsafe and rejected: legacy chats have no branch
fields, `selected: undefined` messages are path-eligible, role-scoped
deselection leaves stale `selected: true` flags off-path, and sibling
ordering/descriptors need the whole order group. The path derivation must
remain the branch-context collect.

## Decision

Split the subscription into two queries on the same `readableChatQuery`
builder, both keyed by `chatId` alone:

1. **`getSelectedPath`** — the selected visible path, derived by the shared
   collect + `createBranchContext` code, plus a derived `pathVersion`
   fingerprint. Read set:
   chats/projects/users/messages only — run-doc writes no longer touch it.
2. **`getSelectedRunState`** — the tiny per-beat run facts
   (`SelectedRunProjection`, ~177 B measured). Owner-only. Its read set
   excludes the messages table entirely while the run is live (see the
   points-back trim below), so content beats no longer re-execute it either.

The §7 validation gauntlet splits across the seam:

- **Server-side** (in `getSelectedRunState`): run↔chat linkage, ownership,
  and points-back. Points-back short-circuits on
  `run.activeStreamId === run.assistantMessageId` — stamped at stream start,
  cleared on terminal transitions — which is decidable from the run doc
  alone. Only a settled run falls back to reading the linked message's
  `generationRunId` stamp (the doc is no longer written per beat then).
  When the short-circuit hits, the linked message's *existence* is not
  verified; a dangling id can never appear in the delivered path, so the
  client-side check below nulls exactly those cases.
- **Client-side** (messages provider): the on-selected-path check. The
  provider nulls the run unless its `assistantMessageId` is present in the
  DELIVERED path — the same predicate the atomic query evaluated
  server-side, applied to the same data.

### Why the client-side half does not reintroduce tearing

The historical warning — "do NOT wrap `getForChat` with an independent run
subscription" — was about subscriptions whose *arguments* derive from another
query's *result* (a second round trip against a moved database). That is
still forbidden. The split pair is different: one `ConvexReactClient` applies
every subscribed query's updates from a single transition atomically
(`browser/sync/remote_query_set`), and both queries take only `chatId`. Two
same-client, same-argument-source queries can never deliver values from
different database timestamps. The provider's on-path check therefore always
compares a run and a path from ONE transaction view — which is precisely why
the check could move client-side without weakening it.

This basis is Convex-client-scoped: it does NOT license split subscriptions
across different Convex clients, across argument-dependent queries, or
through any cache that decouples the two deliveries.

### Projection slimming

`SelectedRunProjection` drops `lastSnapshotSequence`, `lastProgressAt`, and
`activeToolNames` (zero production consumers; the first two forced a
re-delivery on every beat by construction), and `pendingApproval` shrinks to
`{expiresAt}` — presence and expiry are all the client reads; approval UI is
driven from message parts. No time-derived fields cross the wire: Convex
queries re-execute on data changes, never on wall-clock time, so freshness
classification stays client-side.

## Consequences

- Run-doc-only events (heartbeats, deduped beats, tool steps, approval
  bookkeeping) cost one ~177 B run-state delivery per subscriber instead of a
  ~23 KB path re-collect + re-delivery. Content beats still re-execute the
  path query — per-execution read cost is untouched by this ADR (that is
  Experiment 2b, range-bounded settled-history pagination, gated on
  prefix-derivability property tests). The live-tail amendment below shipped
  Experiment 2b as a narrower cut: checkpoints under a stamped tail no longer
  re-execute history, but each history execution still reads every message
  before the tail, so paginating settled history remains separate work.
- Tests pin owner and non-owner projection rules, server-side points-back
  validation, client-side on-path validation, and the live run query's narrow
  read set.
- The pause-heavy benchmark measured 98.6% less pause-window delivery
  (24 × 12.7 KB path re-collects became 24 × 177 B run-state deliveries),
  zero pause-caused path executions, live run-state reads shrinking from
  13 KB to 2 KB, and no meaningful durable-suite regression.
- On 2026-08-30, production verification found multiple Ready deployments
  after adoption and no `NEXT_PUBLIC_SPLIT_SELECTED_QUERY` production
  override. The deployed frontend already used the split pair, so the flag,
  atomic query, helper, and rollback-only tests were removed.
- 2026-09-27: `getSelectedPath` still reads every message in the chat,
  branches included, on each execution, so a chat's total message bytes stay
  bounded by Convex's 16 MiB per-function read limit. `prepareGeneration` now
  reads the chat once per turn (it read it about eight times, which failed
  from ~2 MiB chats) and each message is capped at 896 KiB (`capMessagePayload`,
  CONTEXT.md "Message payload cap"), so both sides hit that bound at the same
  ~16 MiB.

## Amendment 2026-10-10: the live tail (Experiment 2b)

**Problem.** The live assistant message sat inside `getSelectedPath`'s
message range, so every 750 ms checkpoint re-ran it and re-sent the whole
path. A 45 s answer in an 18-message chat sent 36 path frames of 509 to
597 KB (19.6 MB); the live message was 6.3% of those bytes. Convex sends a
re-run's full value and skips only identical results.

**Decision.** While a run streams, the path is two queries keyed by a
server-only pointer on the chat, `chats.liveTail`
(`{ messageId, orderId, parentMessageId }`):

- **History** (`getSelectedPath` with `splitLiveTail: true`) reads
  `by_chat_order` with `orderId < liveTail.orderId`. It checks itself: when
  its walk does not end on `liveTail.parentMessageId` it re-reads the whole
  path and returns `liveMessageId: null`; otherwise `liveMessageId` names the
  live message.
- **Opt-in.** Without the flag, `getSelectedPath` returns the whole path with
  `liveMessageId: null`, as before the split. A client from before it keeps
  the live message on its path: a tab left open across a deploy, and the
  paired perf base arm (and the weekly pair's `HEAD^`) on the one shared
  deployment. A flag-free history would break them: the run would never be
  on their delivered path while it streams, so Stop would abort only locally
  and the old resume route would return 404.
- **Live** (`getLiveMessage`) reads the chat, the live message and its
  `by_chat_parent` sibling range, and returns the message with its branch
  descriptor, or null when it is gone, moved, deselected or not yet visible.
- **Client.** `MessagesProvider` appends the live message only when its id
  equals `liveMessageId`, so it is never duplicated or misplaced, and maps
  history and live separately. `isLoading` waits for all three queries. The
  same-transition basis above covers them unchanged: three queries keyed by
  one `chatId`, one client. A warm-cache entry that was evicted and
  re-subscribed still receives values at the client's current timestamp.
- **Stamp.** Prepare resolves `resolveLiveTail(messages, liveId)`
  (`convex/domain/message_branches.ts`) in every branch (send and edit,
  regenerate, approval continuation) from the messages it already holds, and
  writes it with the slot claim; an unresolved tail clears a stale one. It
  resolves only when the live message has the highest `orderId`, the walk
  without it ends on its explicit parent, the full walk is that walk plus the
  live message, and every sibling names that parent explicitly. Legacy or
  stale `selected` flags and inferred parents fail, so those chats keep the
  full read.
- **Clear.** The run-scoped status projection clears it on completed, failed
  and aborted (an approval pause keeps it), so a superseded run's late
  terminal cannot clear a newer run's tail. `selectBranch` clears it too.
- **Resume route.** `getResumeSelection` returns run state and the whole path,
  live message included, from one snapshot (it also removes the route's old
  two-fetch race).
- **Hidden pointer.** `toClientChat` strips `liveTail` from every chat read,
  so it never reaches the sidebar, the persisted window (ADR-0048) or
  `getById`.
- **Field trim.** Both queries return `vSelectedMessage` through a `returns`
  validator: only the fields the client adapter reads, with `content` omitted
  when it equals the text parts (the adapter derives it with the same
  `extractTextFromMessageParts`). `pathVersion` had no reader and is gone.

| Query | Reads | Written by a checkpoint |
| --- | --- | --- |
| History | users row, chat, owner, project, messages before the tail | No |
| Live | chat, live message, its sibling range | Yes, the live message |
| Run state | unchanged | Yes, the run (deduped unless the projection changes) |

**Consequences.**

- A checkpoint re-sends only the live message: 2,585 B in the 120-turn
  fixture, against the whole path (645,851 B before the trim, 424,814 B
  after). Budgets in ADR-0049.
- History still re-runs on chat-doc and users-row writes (title, approval
  pause), deduped and unsent; its result changes only at prepare, terminal
  and branch select.
- The warm cache cap is 48 (16 chats times 3). Eviction is per entry, so a
  chat can lose one of its three and then opens in a loading state like any
  miss.
- Deploys ship the backend first, so older clients meet the new backend and
  the opt-in keeps them whole. A client newer than its backend fails on the
  missing `getLiveMessage` and `getResumeSelection`, so the paired perf run
  needs the branch's functions on its deployment
  (`benchmarks/chat-performance/browser/README.md`).
- Proof: `convex/selectedPathSplit.seam.test.ts`. A flow test runs the real
  prepare for sends, a regenerate, a branch switch, a mid-path edit, an
  approval pause and continuation, a supersede and a Stop; after every real
  checkpoint the merged path equals the whole path, the write set is exactly
  the live message and the run, and neither version of either falls in
  history's recorded read set. A property loop over 120 seeded branch trees
  with legacy rows and stale flags (35 refused at stamp, 78 bounded, 7
  self-check fallbacks) finds the merged path equal to the whole path in all.
  Both check that the flag-free read is that whole path.
