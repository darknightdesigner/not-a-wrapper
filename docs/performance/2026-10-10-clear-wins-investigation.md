# Clear wins investigation, 2026-10-10

**Status: shipped.** All five wins shipped together in PR #213, not one PR per
win. This document is the investigation record from before implementation.
"Needs the user", "Recommended order" and "Decisions for the user" below are
historical; the decisions taken were:

- **PostHog privacy:** recordings mask all text in client code
  (`lib/analytics/deferred-analytics.ts`), not as a project setting
  (ADR-0050).
- **Recorders:** both Sentry Replay and PostHog session recording stay
  (ADR-0050).
- **Win 2:** the chosen guest-at-limit design shipped and the signed-in
  998th-message toast was dropped (ADR-0045 amendment).
- **Win 5:** visible code first with no fade (ADR-0016, "Visible code
  first"). Its browser count ratchet (PR 2 below) is deferred: it needs a
  perf-only fixture page the paired base build does not have.
- **Win 3:** the signed-in browser census is deferred; the seam test is the
  ratchet (ADR-0049).
- **Win 1:** the live-tail split is opt-in (`getSelectedPath` with
  `splitLiveTail`), so clients from before it keep the whole path (ADR-0027
  amendment).

Five candidate chat performance wins, investigated before any implementation.
Each one got a benchmark that shows the problem, a scratch prototype, and an
adversarial review. The investigation changed no product code. It was written
as the hand-off to implementation agents: one PR per win, in the order at the
end.

## Summary

| Win | Verdict | Headline evidence | Needs the user (historical) |
| --- | --- | --- | --- |
| 1. Stop re-sending the whole conversation on every checkpoint | Go with changes | A 45 s answer in an 18-message chat pushed 36 full-path frames of 509 to 597 KB (19.6 MB). After the split, each checkpoint carries only the live message (0.7 to 75 KB). | No |
| 2. Remove the pre-send `/api/rate-limits` round trip | Go with changes | The round trip is 65 to 68% of click-to-request (guest). Removing it cut click-to-first-text by 28 to 34 ms, and by 134 ms on the constrained profile. | Yes: guest-at-limit flow, the 998th-message toast |
| 3. Stop the app-wide re-render on every signed-in send | Go with changes | One users-row patch per send re-runs about 10 live and up to 32 parked subscriptions and re-renders 280 components per context publish (two publishes per send). Memoized: 1 render. | No |
| 4. Get analytics off the critical path | Go with changes | Initial JS drops 327.6 to 224.4 KB gz. Hydration and first live data arrive 716 ms sooner at 4x CPU on the constrained network. | Yes: PostHog privacy and which recorder to keep |
| 5. Highlight visible code first | Go with changes | On a realistic chat (8 code blocks) visible code is colored about 2x sooner (1,284 to 582 ms at 4x). On a 135-block chat, 4 blocks are highlighted at open instead of 133. | Yes: the far-jump flash and the fade |

**Urgent at investigation time, independent of performance.** PostHog session
recording is on for 100% of production sessions with no text masking. In a
scratch build using the live production remote config, streamed chat text
appeared in clear in the recording payload in 5 of 5 runs, and in 0 of 5 with
`maskTextSelector: "*"`. Masking is a PostHog project setting and costs no
measurable CPU. See win 4.

## Method and conditions

- **Base.** `38c53967`, which is `a54720bb` (origin/main, PR #209 merged) plus
  five harness-only commits under `benchmarks/chat-performance/browser/`.
  Product code is identical.
- **Builds.** Scratch copies of the tracked tree with `node_modules` cloned and
  `.env.local` symlinked, built with `next build` (never `bun run build`).
  Perf builds used `NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION=true
  NEXT_DIST_DIR=.next-perf`. Win 4 built without the flag, because the flag
  disables the recorders it measures.
- **Browser.** Headless Chromium 151 through Playwright, one Apple M4 Max,
  fresh context per run, arms interleaved, CDP CPU throttling. The constrained
  profile is the harness's 150 ms latency, 1.6 Mbps down, 0.75 Mbps up.
- **Live capture.** Win 1's WebSocket capture used the user's signed-in Chrome
  on the `localhost:3000` dev server with GPT-5 Mini (2 sends, hidden tab).
- **Guest cap.** The per-network guest cap (ADR-0045) was spent. Win 2 used a
  scratch-only overlay that skips guest admission identically in both arms.
- **Signed-in paths.** `PERF_AUTH_PASSWORD` is unset locally, so wins 2, 3, 4
  and 5 have guest or synthetic numbers only. Per PR #209, each PR's paired
  signed-in CI run is the acceptance gate, not these numbers.
- **Prototypes and raw data** live in the session scratchpad
  (`/private/tmp/claude-501/.../scratchpad/win{1..5}`, `review/review.md`).
  They are temporary. Everything an implementer needs is restated here.

---

## Win 1: Stop re-sending the whole conversation on every checkpoint

### 1. Verdict

**Go with changes.** Split the selected path into a history query and a small
live-message query, keyed by a `chats.liveTail` pointer that prepare stamps only
when the path is provably "history, then the live message". Ship the field trim
in the same PR. Checkpoint writes then never re-run or re-send history.

### 2. Evidence

**Facts verified** (line numbers at `a54720bb`):

- The 750 ms checkpoint throttle is `app/api/chat/durable-turn-runtime.ts:731`.
  The writer is `updateAssistantSnapshotForChat` (`convex/chatRuntime.ts:2536`,
  worker op `convex/chatRuntimeWorker.ts:138`). It patches the message at
  `:2615` (only when content changed) and the run at `:2623` and `:2633`. It
  never writes the chat doc. A seam test that diffs every table around a real
  checkpoint shows the write set is exactly {live message, run}.
- `getSelectedPath` reads `users.by_workos_user_id`
  (`convex/lib/auth.ts:117-121`), `chats.by_public_id` (`:188-196`),
  `get(owner)` and `get(project)` (`:69-79`), then the whole
  `messages.by_chat_order` range for the chat (`convex/messages.ts:58-65,131`).
  The live message is inside that range, so every content checkpoint re-runs it.
- The sending tab ignores deliveries while streaming at
  `app/components/chat/use-chat-core.ts:774-780` (not 777). Observer tabs,
  reloaded tabs and the ADR-0039 two-second handoff
  (`lib/chat-stream/resumable-chat.ts:25,452-458`) do use every checkpoint, so
  checkpoints must keep flowing. `lib/chat-store/messages/provider.tsx:131-136`
  re-maps every message on every delivery.
- 645,851 B at 120 turns reproduced exactly (`convex/payloadBudgets.seam.test.ts:18`).

**Does Convex send full results, and skip unchanged ones?** Answered.

- Full value, no diffs: `QueryUpdated` carries the whole value
  (`node_modules/convex/src/browser/sync/protocol.ts:236-243`, convex 1.44.0).
  The client rebuilds it with `jsonToConvex` (`remote_query_set.ts:43-56`) and
  compares by reference (`optimistic_updates_impl.ts:173-181`), so every update
  re-renders its subscribers.
- The backend skips unchanged results: it hashes each re-run's result plus log
  lines and sends nothing when the hash matches (`get-convex/convex-backend`,
  `crates/sync/src/state.rs`, `complete_fetch` and `udf_result_sha256`).
  Invalidation is by index range (`crates/database/src/reads.rs`,
  `writes_overlap_by_index`). All re-run queries for one client go out in one
  Transition (`crates/sync/src/worker.rs`, `finish_update_queries`).
- Caveat: log lines are part of the hash, so a sampled `chat_perf_convex` log
  line (`convex/messages.ts:134-149`, only when `CHAT_PERF_CONVEX_SAMPLE_RATE`
  is above 0) forces a send.
- Live proof from the frame capture: `getSelectedRunState` re-runs on every
  checkpoint (the run doc changes) but was sent only 9 times in a 45 s answer,
  as 469 B heartbeat frames.

**Frame capture** (user's Chrome, dev server, hidden tab, 18-message chat,
GPT-5 Mini, 2 sends):

| Measurement | Value |
| --- | --- |
| Open | 491,850 B path frame |
| Send 2 (about 45 s) | 36 full-path frames, 508,752 to 597,212 B each, 19,631,411 B total; 34 were checkpoints |
| Live-message bytes over those 34 checkpoints | 1,239,772 B (6.3% of what was sent) |
| `content` equal to the concatenated text parts | 18 of 18 messages (207,263 B of about 582 KB) |

**Cost per delivery, production engine** (headless Chromium, bundled adapter
code, JSON parse plus `jsonToConvex` plus the provider map, 5 rounds of 41,
React render not included):

| Delivery at 120 turns | Bytes | 1x | 4x CPU |
| --- | ---: | ---: | ---: |
| Full path today | 645,985 | 1.0 ms | 4.7 ms |
| Full path, trimmed | 424,906 | 0.8 ms | 3.6 ms |
| Live message only | 2,698 to 4,305 | under 0.1 ms | under 0.1 ms |

At 4x, 34 checkpoints cost about 160 ms of parse and map at 120 turns, against
under 4 ms after the split. The dev-build, hidden-tab task time from the capture
(8.9 ms median per delivery, n=36) is an upper bound only. React render cost on
the signed-in production tree is **unverified**.

**Network.** About 545 KB every 750 ms is about 727 KB/s, against the 200 KB/s
constrained profile, so on slow networks the socket cannot keep up. Arithmetic
only; WebSocket compression is **unverified**.

**`convex-test` cannot observe query re-runs** (0.0.56 has no subscriptions).
The proof instead records every `get` id and `withIndex` range the history
query makes and checks each checkpoint write against them, the same rule the
backend uses.

**References.** `@convex-dev/persistent-text-streaming` keeps the streaming text
in its own `streams`/`chunks` tables, so history never sees it. T3 Code bounds
cold opens to about 75 rows and resumes with deltas
(`../T3Code/docs/internals/performance-regressions.md`). HuggingChat resumes
from a `materializedSeq` on the saved message (as cited in ADR-0039; not
re-read here).

### 3. Chosen design and alternatives

**Chosen: a read-set split keyed by a chat-doc pointer, plus the trim.** The
prototype passes the full convex suite (42 files, 546 tests) and, with the
route and client store tests, 54 files and 643 tests; `tsc` and ESLint are
clean.

1. **`resolveLiveTail(messages, liveId)`** (new, `convex/domain/message_branches.ts`)
   returns `{ messageId, orderId, parentMessageId }` only when all hold:
   - the live message has the highest `orderId`;
   - the walk without it ends on its explicit parent;
   - the full walk equals that walk plus the live message;
   - every sibling of the live message names that parent explicitly.

   Legacy or stale `selected` flags and inferred parents fail these checks, so
   those chats keep today's full read.
2. **Stamp in every prepare branch**: send and edit (the writer's messages),
   regenerate (`applyRegenerationIntentForGeneration` returns the list its
   writer already holds), approval continuation (reuses the list it reads for
   model history). The stamp rides on the existing slot-claim
   `patchChatActivity` (`convex/chatRuntime.ts:2286`), which also clears a stale
   pointer. No extra chat read.
3. **Clear the pointer** in `chatStatusProjection` on completed, failed and
   aborted (awaiting keeps it), and in `selectBranchForChat`. The projection is
   run-scoped (`chatRuntime.ts:739-760`), so a superseded run's late terminal
   cannot clear the new run's pointer.
4. **History query** (`getSelectedPath`, same name, args and cache keys). With a
   pointer it reads `by_chat_order` with `orderId < liveTail.orderId`. It
   checks itself: if its walk does not end on `liveTail.parentMessageId`, it
   re-reads the whole range and returns `liveMessageId: null`; otherwise it
   returns `liveMessageId: liveTail.messageId`.
5. **Live query** (new `messages.getLiveMessage`, `chatId` only): reads the
   chat, `get(liveTail.messageId)` and the `by_chat_parent` sibling range for
   the branch descriptor. Returns null when the message is not visible.
6. **Client merge** (`provider.tsx`): append the live message only when
   `live._id === history.liveMessageId`, so it is never duplicated or
   misplaced. History and live map in separate memos. `isLoading` waits for all
   three queries (path, live, run state), all keyed by `chatId` on one client,
   so ADR-0027's same-transition guarantee holds.
7. **Resume route** (`app/api/chat/[chatId]/stream/route.ts`): one owner query,
   `getResumeSelection`, returns run state plus the unbounded path from one
   snapshot. This is mandatory: without it every resume 404s while a pointer is
   set. It also fixes today's two-fetch race.
8. **Hide the pointer**: `toClientChat` strips `liveTail` from the six chat-doc
   reads (`getById`, pinned, recent window, paginated list, search, project
   directory), which also keeps it out of the ADR-0048 persisted window.
9. **Cache (ADR-0031)**: raise `QUERY_CACHE_MAX_IDLE_ENTRIES` from 32 to 48 (16
   chats times 3) and warm the trio together. convex-helpers can drop one entry
   of a trio at the idle cap; that chat then opens in a loading state like any
   other miss. Accepted; per-chat eviction would need a fork.
10. **Trim**: a typed `returns` validator. Drop `_creationTime`, `chatId`,
    `orderId`, `userId`, `parentMessageId`, `branchIndex`, `selected`,
    `regenerationSourceMessageId`, `updatedAt` and the unread `pathVersion`.
    Drop `content` only when it equals `extractTextFromMessageParts(parts)`,
    using the shared `convex/domain/message_facts.ts` helper the client adapter
    already falls back to. Model history is built server-side from documents
    (`chatRuntime.ts:2253,2265`), so it is unaffected. 645,851 to 424,793 B
    (-34%) at 120 turns.

**Read and write sets with the pointer set:**

| Query | Reads | Written by a checkpoint? |
| --- | --- | --- |
| History | `users.by_workos_user_id`, `chats.by_public_id`, owner user doc, project doc, `messages.by_chat_order` with `orderId < liveTail.orderId` | No |
| Live | chat doc, live message doc, `by_chat_parent` sibling range | Yes, the live message |
| Run state | unchanged (ADR-0027) | Yes, the run doc (deduped unless the projection changes) |

History still re-runs, deduped and unsent, on chat-doc writes (title, approval
pause) and users-row writes (the per-send admission patch until win 3 lands).
Its result changes only at prepare and terminal transitions.

**Alternatives:**

- **Trim only.** -34% per delivery but still a full delivery per checkpoint.
  Kept as part of this PR.
- **Value split** (history reads everything but omits live content, relying on
  the dedupe). Exact with no invariant, but re-runs the whole chat read every
  750 ms in the same Transition as the live update. Fallback if the invariant
  proves fragile.
- **Separate streaming-content table** (persistent-text-streaming style). Exact
  by construction but touches Stop, the reaper, continuation, model history and
  shares. Rejected for blast radius.
- **Boundary as a query argument.** An argument-dependent subscription
  (forbidden by ADR-0027) that re-downloads history every turn. Rejected.
- **Bounded history window** ("load earlier"). Orthogonal and out of scope; the
  split keeps the door open, since a window is one more `gte orderId` bound on
  the same index.

### 4. Benchmark and ratchet plan

- **Payload budgets** (`convex/payloadBudgets.seam.test.ts`, ADR-0049). Re-set
  `selectedPathSettled` to the trimmed open (about 424.8 KB, plus 21 B for
  `liveMessageId`), and add `selectedPathDuringRun` (history with a stamped
  tail, about 422 KB) and `liveMessage` (the per-checkpoint bytes, about 2.6 KB
  in the fixture). Run state stays 175/173.
- **Re-run proof** (`convex/selectedPathSplit.seam.test.ts`, two tests).
  - Flow test with the real `prepareGenerationForChat` for two sends, a
    regenerate, a mid-path edit, an approval pause and continuation, and a
    supersede (the old run's late completion is ignored, its late checkpoint
    returns `lost`). After every real checkpoint and terminal it asserts merged
    path equals the unbounded path, the write set is exactly {live message,
    run}, and neither version of those docs falls inside the history read set.
  - Property loop over 120 seeded random branch trees with legacy and stale
    flags: 113 stamped (96 stayed bounded, 17 fell back), 7 refused at stamp
    time, merged equals unbounded in all 120. This is the prefix-derivability
    property test ADR-0027 asked for.
  - The tests catch real breakage: removing the fallback, widening the range to
    include the live message, or stamping on highest `orderId` alone each fails
    at least one test. The prototype file is 401 lines; trim it in the PR.
- **Bytes track wall clock.** Per-delivery engine cost scales with bytes (1.0 /
  4.7 ms at 646 KB against under 0.1 ms at 2.7 KB). Report, not gate, the
  signed-in CI journey's `subscription_updates_per_turn`
  (`docs/performance/metric-dictionary.md:195`) until it proves stable.

### 5. Regressions

| Risk | Mitigation | Test |
| --- | --- | --- |
| Merged path differs from today (legacy or stale flags, later sibling, inferred parent) | Exact stamp check, query-time self-check with full-read fallback, `liveMessageId` handshake | Flow test and property loop |
| Live answer missing for a frame (`isSelectedPathDivergent` sees it as removed) | `isLoading` waits for all three; one Transition; terminal writes the message and clears the pointer in one mutation (`chatRuntime.ts:2757,2794`) | Flow test, after every completion |
| ADR-0039 reload resume (`hasVisiblePrefix` at `resumable-chat.ts:60`, two-second handoff, no-rewind) | Route reads the full path in one snapshot; `resumable-chat.ts` untouched; observers and handoff tabs see the same merged list | `stream/route.test.ts` (updated, passing in prototype) |
| Branch switch, edit, regenerate, approvals, stop, supersede | All stamp or clear through prepare, branch select or the run-scoped projection | Flow test |
| Deep links and shares | Deep links use the same query; shares read `listMessagesByChatOrder` directly (`convex/shares.ts:39,107`) and are untouched | None new |
| Hover warming (ADR-0031) | Warm the trio; cap 48 | Existing `query-cache.test.tsx` |
| Pointer leaks into the sidebar or persisted window | `toClientChat` on all six reads | Typecheck |
| Priority inversion (PR #209) | Convex's `useQuery` uses `useState`, not `useSyncExternalStore`; same number of deliveries, far less work each | `bench:counts` unchanged |

### 6. ADR

Amend **ADR-0027** (this is its deferred "Experiment 2b": the live-tail split,
the `resolveLiveTail` invariant, the self-check and handshake, the read sets,
the property test). Amend **ADR-0049** (budgets). Add "Live tail" to
`CONTEXT.md`. Point the `TODO.md` item "Bound the selected-path read" at the new
seam.

### 7. File ownership and sequencing

One PR, two commits: trim, then split.

- Convex: `convex/schema.ts` (optional `chats.liveTail`, safe for production
  rows), `convex/domain/message_branches.ts`, `convex/chatRuntime.ts` (prepare
  branches, `applyRegenerationIntentForGeneration` return,
  `chatStatusProjection`), `convex/messages.ts`, `convex/chats.ts`,
  `convex/messages.test.ts`, `convex/payloadBudgets.seam.test.ts`, new
  `convex/selectedPathSplit.seam.test.ts`.
- Client: `lib/chat-store/messages/provider.tsx`, `lib/chat-store/messages/warm.ts`,
  `lib/convex/query-cache.tsx`, `lib/chat-messages/ui-message-adapter.ts`.
- Route: `app/api/chat/[chatId]/stream/route.ts` and its test.
- Docs: ADR-0027, ADR-0049, `CONTEXT.md`, `TODO.md`, the metric dictionary.

**Collisions.** No hands-off file is edited. But `stream/route.ts` is where the
Redis-replay work plugs in (it calls `readRetainedChatStream` from
`lib/chat-stream/server.ts`), and the route edit is mandatory. Land after the
Redis-replay PR or agree the route edit with its owner first. Shares
`provider.tsx` and `warm.ts` with win 3; land win 3 first. Codegen must not push
to the dev deployment that the user's `bun dev` owns.

---

## Win 2: Remove the pre-send `/api/rate-limits` round trip

### 1. Verdict

**Go with changes.** The awaited pre-check is most of click-to-request, but
deleting it outright breaks the guest-at-limit experience. Replace it with an
instant local check for guests, and skip it entirely for signed-in users (it
never blocks them).

### 2. Evidence

**Facts verified** (at `a54720bb`):

- Send (`lib/chat-turn/chat-turn-controller.ts:410`) and edit (`:688`) await
  `checkLimitsAndNotify` (`app/components/chat/use-chat-operations.ts:129`).
  On send it runs after the route commit and optimistic row (`:346-372`) and
  before chat creation (`:415`) and dispatch.
- Its only blocking case is a guest at zero (`:133-135`, opens `DialogAuth`).
  Signed-in users at zero pass through, and `/api/chat` refuses them
  (`app/api/chat/api.ts:89-94`). Its other effect is a toast at
  `remaining === 2` (`lib/config.ts:3`), which for signed-in users (1,000 per
  day) fires on the 998th message.
- On fetch failure the catch at `:149-150` returns false and the send is
  silently dropped (console only). The server side never causes that for a
  Convex error, since `app/api/rate-limits/api.ts:62` treats the check as "a
  hint only".
- `/api/chat` already enforces: `DAILY_LIMIT_REACHED` (`app/api/chat/api.ts:91-94`),
  guest refusals (`:101-121`), `ACCOUNT_REJECTED` 403 (`:71-75`).
- Edits are signed-in only (`lib/chat-turn/turn-store.ts:36-41`), so the edit
  path's `limit-denied` reject (`chat-turn-controller.ts:691`) can fire only on
  a fetch failure or a rejected account, never on the limit.
- No client code handles `DAILY_LIMIT_REACHED`; a refusal shows as a toast
  through `app/components/chat/public-chat-error.ts`, plus a second generic
  "Failed to send message" toast (`chat-turn-controller.ts:567`).

**Measured** (guest, scratch production builds, deterministic provider, real
Convex usage read, fresh context per run, one discarded warmup, p50). Arm A is
today; arm B skips the pre-check. Both carry the same cap-skipping overlay.

| Metric (ms) | A, block 1 (n=8) | B, block 1 (n=8) | A, block 2 (n=8) | B, block 2 (n=8) | A, constrained (n=6) | B, constrained (n=6) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/api/rate-limits` duration | 39.6 | none | 38.0 | none | 157.6 | none |
| Click to request dispatched | 58.9 | 29.5 | 56.9 | 23.6 | 231.6 | 98.0 |
| Click to first visible text | 148.9 | 120.9 | 142.0 | 108.5 | 462.0 | 327.9 |

The round trip is 65 to 68% of click-to-request. The first-text saving equals
the dispatch saving in every block, so it reaches the user in full.

**Signed-in number: unverified.** CI artifacts (runs 38043849735, 38043302452)
have no mark around this check and no network events in traces. Upper bound:
`followup-warm` click-to-request p50 is 44 to 62 ms across four captures, all of
which includes this round trip. The PR's paired CI run will measure it.

**What a guest at their limit sees** (headless, real spent cap, frames at
0 to 2,500 ms):

- **Today:** the route flips to `/c/<id>` and a fake thread with "Thinking"
  shows for about 100 ms, then rolls back and the sign-in dialog opens with the
  draft restored.
- **Pre-check simply deleted:** an empty thread, the draft lost, two toasts, no
  dialog, and an empty local chat left behind. Rules out "just drop it".
- **Chosen design:** the dialog is open 34 ms after the click, the page never
  changes, the draft stays. Strictly better than today.

**References.** Vercel Chatbot, HuggingChat and LibreChat have no client
pre-check; the server refusal drives the UI, and LibreChat refreshes balance
after the stream ends. HuggingChat gates sign-in with a synchronous local check
(`requireAuthUser()`), the same shape as the chosen gate. T3 Code shows limits
from server-pushed snapshots and awaits nothing before send. ChatGPT notifies at
the limit (server-driven); its exact UI and T3 Chat's are **unverified**.

### 3. Chosen design and alternatives

**Chosen: a guest-only usage hint read synchronously at Send.**

1. **Hint module** (new `lib/chat-turn/usage-hint.ts`): a plain module value
   `{ ownerKey, remaining, observedAt }`, not React state and not a store, so
   nothing re-renders and there is no SyncLane work. Keyed by owner so a guest
   value can never gate a signed-in user.
2. **Guest prefetch** of `GET /api/rate-limits` on the first trusted typed input
   (keydown or beforeinput), never on focus: `PromptInput` autofocuses on load
   (`components/ui/prompt-input.tsx:612`), so a focus prefetch would mint guest
   cookies on every page load, crawlers included, which ADR-0045 avoids. The
   call must not set React state in the input path.
3. **Updates:** decrement by one on each accepted guest send; set to 0 on a
   `DAILY_LIMIT_REACHED` refusal. The hint expires at the earlier of 5 minutes
   or the next UTC midnight, so a stale zero never blocks a reset allowance.
4. **At Send** (before `firstTurn.begin()`, next to the prompt-size guard):
   guest with a fresh known zero opens `DialogAuth` and returns (no route
   commit, no row, draft kept); guest at the threshold shows today's toast;
   otherwise proceed with no await. A guest with no hint yet (for example a
   `?prompt=` auto-send) awaits a read, which is today's cost, never worse.
5. **Signed-in users skip the pre-check entirely.** It never blocked them.
6. **Backstop:** `presentChatStreamError` maps a guest `DAILY_LIMIT_REACHED` to
   the sign-in dialog instead of a toast, and the controller skips its generic
   toast when a refusal carries a public code (fixes today's double toast).
7. **Edit:** remove the pre-check and the `limit-denied` reason; the server
   refusal already restores the last good path (`chat-turn-controller.ts:671-676`).
8. **Delete** `checkLimitsAndNotify`. `/api/rate-limits` keeps only its guest
   branch for the prefetch; its signed-in branch and `api.usage.checkUsage` lose
   their last caller and can be deleted (coordinate with win 3, below).

**Alternatives:**

- **Subscribe signed-in users to `api.usage.checkUsage`.** Rejected. Its result
  changes on every send, so it lands a React commit exactly as the stream
  starts (the PR #209 window), to serve a gate that never blocks signed-in users
  and a toast on the 998th message. It also cannot serve guests
  (`checkGuestUsage` needs a server-signed proof).
- **Return `x-usage-remaining` from `/api/chat`** so signed-in users keep the
  998th-message toast and a known-zero gate. Works, but adds a wire contract
  through the route, `chat-turn-runtime.ts:2472` and the transport's `fetch`
  for a toast almost nobody sees. Not chosen for v1; the user can ask for it.
- **Guest prefetch alone, check still awaited after the route commit.** Keeps
  signed-in users paying and keeps the 100 ms fake-thread flash.
- **Drop the pre-check and rely on the refusal.** Measured regression above.
- **Run the check in parallel with dispatch.** Same guest regression as dropping
  it, plus a wasted request.

### 4. Benchmark and ratchet plan

- **Count: `preDispatchApiRequests`**, same-origin `/api/*` requests started
  after the Send click and before the `/api/chat` POST, recorded per run in the
  harness (`benchmarks/chat-performance/browser/harness.ts`, which already
  watches `/api/chat` with `page.on("request")`, plus `result-schema.ts`,
  `result-contract.ts`). Gate zero-tolerance in `compare-results.ts`. Today 1 in
  every signed-in journey; target 0. Typing-time prefetches fall outside the
  window by construction.
- **Proof it tracks wall clock:** in the A/B, 1 to 0 removed 29 to 33 ms (134 ms
  constrained) from click-to-first-text. Requests in this window are awaited
  serially, so the count is the number of round trips added to click-to-request.
- **Wall clock (existing, not gated):** `sendToRequestDispatchedMs` and
  `inputToFirstTextFrameMs` in the paired signed-in responsiveness suite.
- **Guests:** covered by one controller unit test, since guest sends burn the
  per-network cap.

### 5. Regressions

| Risk | Mitigation | Test |
| --- | --- | --- |
| Guest at zero no longer sees the dialog | Synchronous known-zero gate before `begin()`; refusal backstop opens the dialog | Controller test: guest with hint 0 opens the dialog and never calls `begin`, `ensureChatExists` or the transport (replaces the `limit-denied` test at `chat-turn-controller.test.ts:244`) |
| Stale positive hint (other tab, shared network, capacity ceiling) lets a refused guest turn commit a local chat | Refusal opens the dialog and sets the hint to 0. The empty local chat is the same class as today's `TOO_MANY_ACTIVE_ANSWERS` refusal | `public-chat-error.test.ts`: guest `DAILY_LIMIT_REACHED` maps to sign-in |
| Stale zero after the UTC reset | Expiry at 5 minutes or UTC midnight | One case in a usage-hint unit test |
| Orphaned first-turn chat holding only a user message | Guests: unchanged (the first message persists only on acceptance). Signed-in users at zero: exists today and stays (1,000 per day); not a regression | Existing retry-token tests |
| Threshold warning | Guests: same moment as today. Signed-in: the 998th-message toast is dropped (user decision below) | None |
| Edit `limit-denied` reject removed | It never fired on the limit | Typecheck finds consumers |
| Deleted or rejected account (ADR-0044) | Today the pre-check 403 drops the send silently. After: `createWithFirstTurn` throws `account_rejected` with a toast, or `/api/chat` returns 403 "This account is no longer active" | None new |
| Guest cookie minted earlier | On first typed input instead of first send; still interactive guests only | ADR text |
| Priority inversion | The hint is a module value; nothing subscribes | `bench:counts` unchanged |

### 6. ADR

Amend **ADR-0045**: the pre-send usage read becomes a typing-time guest
prefetch, the per-send gate is a local hint, `/api/chat` admission is the only
per-send check. Amend **ADR-0049** with the `preDispatchApiRequests` count. No
new ADR. Update the metric dictionary and the `checkGuestUsage` comments.

### 7. File ownership and sequencing

- `lib/chat-turn/chat-turn-controller.ts` and its test, new `lib/chat-turn/usage-hint.ts`.
- `app/components/chat/use-chat-operations.ts` and its test,
  `app/components/chat/use-chat-core.ts`, `app/components/chat/chat.tsx`,
  `app/components/chat/public-chat-error.ts` and its test.
- The composer input call site for the guest prefetch; `lib/api.ts`.
- `app/api/rate-limits/*` (drop the signed-in branch) and, if unused after this
  PR, `api.usage.checkUsage` in `convex/usage.ts`.
- Harness (from the newer harness at `38c53967`): `harness.ts`,
  `result-schema.ts`, `result-contract.ts`, `compare-results.ts`.
- Docs: ADR-0045, ADR-0049, the metric dictionary.

Land after win 3 (both touch `convex/usage.ts`; win 3 rewrites `checkUsage`
internals that this PR may then delete). Needs the user's sign-off on the
guest-at-limit screenshots first.

---

## Win 3: Stop the app-wide re-render on every signed-in send

### 1. Verdict

**Go with changes.** The one per-send write to the users row is the root cause.
Move the signed-in daily counter into an `apiRateLimits` window (the mechanism
guests already use) instead of a new table, stop writing `lastActiveAt` and
`messageCount` (no readers), memoize the user context, and narrow
`users.getCurrent`.

### 2. Evidence

**The write.** `convex/usage.ts:133` patches `messageCount`,
`dailyMessageCount`, `dailyReset` and `lastActiveAt` on every admitted
signed-in send, from `app/api/chat/route.ts:247` through `app/api/chat/api.ts:64-67`.
No other mutation writes the row per send. `users.updateLastActive`
(`convex/users.ts:116`) has no caller.

**Who reads the row.** Every query builder in `convex/lib/authedFunctions.ts`
resolves the caller through `getOptionalAuth`, which reads
`users.by_workos_user_id` (`convex/lib/auth.ts:117-143`). So every signed-in
subscription re-runs on each send: about 10 live ones (`users.getCurrent`,
`userPreferences.get`, `userKeys.getProviderStatus`, `mcpServers.list`,
`projects.getForCurrentUser`, pinned and recent sidebar windows, `chats.getById`,
`getSelectedPath`, `getSelectedRunState`) plus up to 32 parked ADR-0031 cache
entries, including a full `getSelectedPath` per open or parked chat. Server cost
is **unverified** (needs Convex insights).

**What reaches the browser.** Convex sends only changed results (win 1), so per
send only `users.getCurrent` arrives, because it returns the whole row
(`convex/users.ts:87-90`).

**The fan-out.** Each delivery publishes the user context twice: the inline
context value (`lib/user-store/provider.tsx:309`) and then the merge effect
(`:230-251`), whose merge always allocates (`lib/user-store/merge-user-profile.ts:36-60`).
All 14 `useUser()` sites re-render, `ModelProvider` recomputes `models`
(`lib/model-store/provider.tsx:271`) and republishes an inline value, and every
memoized sidebar row re-renders through `useWarmSelectedConversation()`
(`lib/chat-store/messages/warm.ts:19`), whose `useUser()` read is redundant
because `useWarmPerUserQuery` already gates on Convex auth
(`lib/convex/query-cache.tsx:89-93`). `MessagesProvider`
(`lib/chat-store/messages/provider.tsx:93`) also reads `useUser()` only to
derive `isAuthenticated`.

**Guests are unaffected:** they have no users row and no `getCurrent`
subscription, so this cannot be measured on guest sends.

**Measured** (guest proxy: a scratch overlay re-renders `UserStateProvider` on
demand; idle guest home page, ADR-0049 count probe, 20 ticks per block, n=5 per
throttle):

| Per provider re-render | Fresh value (today) | Memoized |
| --- | ---: | ---: |
| Component renders | 280 (every run, both throttles) | 1 |
| Hooks | 4,466 | 26 |
| Context reads | 403 | 7 |
| Script time, 1x | 2.31 ms (2.21 to 2.61) | 0.10 ms |
| Script time, 4x | 9.52 ms (8.78 to 10.25) | 0.34 ms |

Renders track script time in the same capture (280x fewer renders, 23x to 28x
less script). This is a lower bound: guests skip the `models` recompute, the
sidebar rows and `UserMenu`. The signed-in estimate (at least 560 renders,
about 4.6 ms at 1x and 19 ms at 4x per send, inside the time-to-first-token
window) is **unverified**.

**Counter inventory.** Writers: `convex/usage.ts:133` (per send),
`convex/userSync.ts:94-95,121-123,146-147` (zeros on insert), the dead
`convex/users.ts:120`. Readers: `checkUsage` and `admit` (`convex/usage.ts:80-82,118-120`)
and copies into `UserProfile` (`merge-user-profile.ts:9-12,47-57`,
`provider.tsx:216-219`, `lib/user/types.ts:12-16`, `lib/user/api.ts:37-40`).
No UI reads any of the four fields. Other `getCurrent` readers:
`use-favorite-models.ts:13-21` (optimistic spread, needs `favoriteModels`) and
`lib/mcp/load-tools.ts:212-217` (needs `workosUserId`).

**References.** LibreChat keeps credits in a separate `Balance` collection.
Vercel Chatbot counts messages at admission. T3 Code keeps usage-limit state
out of its settings snapshot. OpenWebUI writes `last_active_at` per request but
has no live per-user subscription; in a reactive store the same write
invalidates everything.

**Prototype.** A seam test "admits a signed-in turn without writing the users
row" fails on today's code and passes on the prototype, alongside the existing
usage, account-lifecycle and rate-limit seam tests (4 files, 11 tests).

### 3. Chosen design and alternatives

**Chosen (root cause plus client hardening):**

1. `convex/usage.ts`: `admit` reads, decides and commits an `apiRateLimits`
   fixed window in one transaction, bucket `user_turns_daily`, actor key
   `user:${user._id}`, 24 h window. `evaluateFixedWindow` floors to UTC
   midnight, identical to today's `getStartOfDayMs`. `checkUsage` (while it
   still has a caller) reads the window, computing `remaining` from the current
   count, with an unchanged return shape. Keep the policy private, not in the
   public `API_RATE_LIMIT_POLICIES`. Account deletion
   (`convex/domain/account_deletion.ts:99-104`) and the sweep
   (`convex/rateLimits.ts:219-262`) already cover these rows.
2. Stop writing `messageCount` and `lastActiveAt`, delete
   `users.updateLastActive`, stop seeding counters in `convex/userSync.ts`. Keep
   all four fields optional in `convex/schema.ts` (they exist on production
   rows), so no schema change and no preflight risk.
3. Memoize the `UserContext` value (`provider.tsx:309`).
4. Drop the `useUser()` read in `warm.ts` and in `MessagesProvider`.
5. Narrow `users.getCurrent` to a typed projection (`_id`, `_creationTime`,
   `workosUserId`, `displayName`, `profileImage`, `profileImageOverride`,
   `anonymous`, `premium`, `favoriteModels`, `systemPrompt`), exported and used
   for `ConvexUserProfileFields`. Remove the four counter fields from
   `UserProfile`. This also stops shipping email, lifecycle flags and storage
   ids to the live subscription.
6. Keep the users-row reads: ADR-0044 relies on them to cut off a rejected
   account's open subscriptions. Only the hot write goes.

**Alternatives:**

| Option | Server re-runs per send | `getCurrent` deliveries | Context fan-outs | Notes |
| --- | --- | --- | --- | --- |
| Today | all users-row readers | 1 | 2 | |
| New `userUsage` table | 0 | 0 | 0 | Same effect, but a parallel system: new table, new deletion drain, duplicated day logic. Rejected |
| Narrow `getCurrent` plus memoize only | all (deduped) | 0 | 0 | Fixes the client; the server still re-reads every open and parked path per send |
| Memoize only | all | 1 | 2 | Does not help sends: the merged object changes every delivery |
| **Window move plus narrow plus memoize (chosen)** | **0** | **0** | **0** | Removes the cause and makes "hot fields never reach the client" a type fact |

### 4. Benchmark and ratchet plan

1. **Primary, exact, runs in `bun run test`:** one case in
   `convex/usage.seam.test.ts`: admit twice, `checkUsage` reports 2, the users
   doc is deep-equal before and after. Since every subscription reads the
   users row, "per-send mutations leave the users row untouched" is exactly
   "admission invalidates no subscription". Add one case that the limit still
   refuses.
2. **Signed-in send census (CI only):** a `signed-in-send` interaction in
   `counts.ts` and `count-probe.ts` (sign in as `composer-shell.ts` does, open
   `/`, send `[[perf:short-prose:30:fixed]] hi` with
   `CHAT_PERF_DETERMINISTIC_PROVIDER=1`, which `counts.ts` already sets and which
   swaps only the model call, so admission still runs). Count WebSocket
   `QueryUpdated` per `udfPath` (counts only, never values). Gate:
   `users:getCurrent` deliveries per send (1 today, 0 after) and zero
   deliveries of the profile-independent reads. Report, do not gate, renders,
   hooks and sidebar row renders across the send (streaming makes them vary,
   ADR-0049). Record CDP script time from Enter to the first content frame in
   the same capture to show the counts track wall clock. CI already has
   `PERF_AUTH_PASSWORD` (`.github/workflows/perf-benchmark.yml:174-197`).
3. **Payload budget (secondary):** add `users.getCurrent` to
   `convex/payloadBudgets.seam.test.ts` to catch the projection drifting back
   to the whole row.

### 5. Regressions

| Risk | Mitigation | Test |
| --- | --- | --- |
| Daily limit stops enforcing or double-counts | Reuse `readFixedWindow` and `commitFixedWindow` in one mutation | New seam cases (count, refusal at limit) |
| Counts restart at 0 on deploy day | Accepted pre-launch; abuse limit, not billing (ADR-0021) | None |
| `/api/rate-limits` contract drift | Return shape unchanged | Existing route tests |
| Window rows outlive a deleted account | Already drained by `user:${userId}` | Existing account-deletion seam tests |
| Rejected account admitted | `admit` stays on `optionalAuthMutation` | `convex/accountLifecycle.seam.test.ts:92` |
| Someone later removes users-row reads "for speed" | ADR-0044 amendment: reads stay, hot or per-turn writes are banned | ADR text |
| Narrowed `getCurrent` breaks favorites or MCP auth | Projection keeps `favoriteModels` and `workosUserId` | Existing `load-tools`, `merge-user-profile`, `provider` tests (fixture edits) |
| Memoized context hides an update | Every field is a memo dependency | Existing `provider.test.ts` |
| Win 2 reintroduces the fan-out | Never put usage in the user context or `UserProfile` | Send census |
| Priority inversion (PR #209) | No new store; `useQuery` is `useState`-based | None |

Favorite toggles still patch the users row (one invalidation of every
subscription per toggle). That is user-initiated and acceptable.

### 6. ADR

No new ADR. Amend **ADR-0021** "Existing counters" (signed-in admission counts
in an `apiRateLimits` window; `messageCount` and `lastActiveAt` no longer
written, kept optional until production cleanup). Amend **ADR-0044**
Consequences (every subscription reads the owner row, so the row takes no hot
or per-turn writes). Add the send census to **ADR-0049** once it proves stable.

### 7. File ownership and sequencing

`convex/usage.ts` (`admit` and `checkUsage` internals), `convex/usage.test.ts`,
`convex/usage.seam.test.ts`, `convex/users.ts`, `convex/userSync.ts`,
`lib/user-store/provider.tsx`, `lib/user-store/merge-user-profile.ts`,
`lib/user/types.ts`, `lib/user/api.ts`, `lib/chat-store/messages/warm.ts`,
`lib/chat-store/messages/provider.tsx` (the `useUser` read only), fixtures
(`lib/user-store/provider.test.ts`, `lib/user-store/merge-user-profile.test.ts`,
`app/components/chat/use-chat-core.test.tsx`,
`app/components/chat/use-chat-core.ai-sdk-seam.test.tsx`,
`app/components/layout/settings/general/fixtures/user-profile.fixture.ts`),
optionally `convex/payloadBudgets.seam.test.ts`, docs ADR-0021 and ADR-0044.
Census in a follow-up commit: `counts.ts`, `count-probe.ts`.

Land first: it is small, it is the root cause, and it removes the per-send
re-run of win 1's history query (so win 1's server baseline is clean). Shares
`warm.ts` and `provider.tsx` with win 1 and `convex/usage.ts` with win 2.

---

## Win 4: Get analytics off the critical path

### 1. Verdict

**Go with changes.** Keep `Sentry.init` eager, but load Sentry Replay and
PostHog only after the composer editor takes over from the pre-hydration
fallback (the ADR-0047 handoff), then at idle. Initial JS falls 32%, and
hydration and first live data arrive about 0.7 s sooner on the constrained
network.

### 2. Evidence

**What records in production** (read-only GETs of www.not-a-wrapper.com and
PostHog's public remote config, 2026-10-10 12:58 UTC):

| Recorder | Deployed config | Effect |
| --- | --- | --- |
| Sentry Replay | `replaysSessionSampleRate` 0.1, `replaysOnErrorSampleRate` 1 (`instrumentation-client.ts:23-31`) | rrweb starts at init in 100% of sessions (buffer mode for on-error), full recording in 10%. Masks all text, inputs and media |
| PostHog session recording | Remote: enabled, `sampleRate: null` (100%), canvas at 3 fps, console logs, network timing, `masking: null`. Client init (`instrumentation-client.ts:35-45`) does not disable it outside benchmark builds | 100% of sessions load the recorder and record |

So two rrweb recorders run in every production session.

**Privacy, verified on scratch with the production remote config.** Decoded
PostHog snapshot payloads contained the streamed probe text in clear in 5 of 5
runs, and in 0 of 5 with `masking.maskTextSelector: "*"`. PostHog's default
masks only form inputs; the repo has no `.ph-mask` or `maskTextSelector`. Chat
messages and AI answers in production are almost certainly recorded in clear.
No production recording was viewed.

**Bytes before hydration** (`build-manifest.json` `rootMainFiles`, gzip):

| Build | Initial JS gz | Analytics in the initial set |
| --- | ---: | --- |
| Current main, production config | 327.6 KB | Sentry core, Replay, posthog-js |
| Benchmark build (perf flag on) | 287.9 KB | Sentry core, posthog-js (Replay already off) |
| **Chosen (D3)** | **224.4 KB** | Sentry core only |
| No analytics at all | 132.8 KB | none |

The task's size estimates were low for Sentry: PostHog is about 69 KB gz, but
Sentry is about 130 KB gz (about 90 KB core and tracing, 39.8 KB Replay).
Production chunk sizes match the current-main build. The benchmark suites never
shipped Replay, so ADR-0037 runs never measured it. The CI Build job
(`.github/workflows/ci-cd.yml:79-101`) and the Vercel production build both
build without the perf flag; CI-style rebuilds gave 321.0 KiB (main) and
219.1 KiB (D3), the same as normal builds.

**Timing, cold guest `/`, 4x CPU, 1280x800, interleaved, non-bot profile**
(PostHog drops all capture for `navigator.webdriver` or a HeadlessChrome UA,
`posthog-js/lib/src/utils/blocked-uas.js:30`, so runs use a normal UA,
`webdriver` false and a mouse move; first-round bot-profile numbers understated
main's cost and were discarded):

| Constrained network, n=10 per arm | Main | D3 | Change (95% CI) |
| --- | ---: | ---: | ---: |
| Typeable (fallback visible) | 2,001 | 1,936 | -76 |
| First key accepted (fallback) | 2,104 | 2,091 | -25 (-64 to 2) |
| Editor editable = `navigationToComposerInputMs` | 7,822 | 7,141 | **-716 (-1,037 to -644)** |
| First live data (first Convex Transition) | 7,967 | 7,289 | **-715 (-1,003 to -615)** |
| Total blocking time before editor | 1,078 | 769 | -269 |
| Total blocking time after editor | 0 | 165 | +165 (moved after readiness) |

- Analytics never started before editor editable in 42 of 42 D3 loads (four
  runs), starting 64 to 84 ms after it, even though `load` fired before editor
  editable in most constrained loads.
- Local network: bot-profile run (n=12) gave -117 ms editor editable (CI -157 to
  -88) and -236 ms first live data. A non-bot local rerun (n=10) was
  inconclusive (CI -278 to +188) because the host was loaded by other agents.
- The composer's first keystroke does not move (ADR-0047 fallback). Everything
  that needs hydration moves: Send, editor features, drafts, live data.
- **Bytes track wall clock:** at 1.6 Mbps, 106 KB fewer bytes predicts about
  530 ms; measured 597 ms (`load` trigger) and 716 ms (D3, which also removes
  PostHog's pre-hydration work). Removing the eager Sentry core too predicts
  437 ms and measured 452 ms.

**CPU after deferral, per cold load at 4x** (bot profile, so PostHog's capture
is excluded): Replay about 206 ms, PostHog about 290 ms. Work is moved, not
removed.

**Steady state during a synthetic stream** (120 DOM mutations over 6 s at 4x,
D3 build, non-bot, n=5; not React streaming):

| Arm | Extra main-thread time per 6 s | Chat text in clear |
| --- | ---: | --- |
| Both recorders, production config | +659 ms | 5 of 5 |
| PostHog text masking on | +638 ms (no measurable change) | 0 of 5 |
| PostHog sampled out (`sampleRate` 0) | +530 ms (recorder still runs, nothing sent) | not sent |
| Sentry Replay only | +90 ms | n/a |

Deferral does not change this. Only turning PostHog recording off removes its
cost; sampling cuts quota and exposure, not CPU.

### 3. Chosen design and alternatives

**Chosen (D3):**

1. `instrumentation-client.ts` keeps an eager `Sentry.init` (errors, scrubbing,
   `tracesSampler`, `onRouterTransitionStart`, the INP and web-vitals source
   ADR-0037 uses) with `integrations: []` and the 0.1 and 1 replay rates.
2. **Trigger: the ADR-0047 handoff.** The editor mount hides the server fallback
   (`components/ui/prompt-input.tsx:1067`). New `lib/analytics/deferred-analytics.ts`
   waits for `textarea.composer-fallback-textarea` to become `hidden` (a
   `MutationObserver` on that attribute), then `requestIdleCallback` with a
   2 s timeout. Routes with no composer are ready at parse; a 20 s cap starts
   analytics even if the composer never hydrates. No edit to the UI primitive.
3. **Replay:** `Sentry.addIntegration(replayIntegration({ maskAllText,
   maskAllInputs, blockAllMedia }))` through a one-line split point,
   `lib/analytics/sentry-replay.ts` (`export { replayIntegration } from
   "@sentry/nextjs"`): 39.8 KB async, against 102.9 KB for
   `import("@sentry/nextjs")`.
4. **PostHog:** `import("posthog-js")` then `init` with the same options; drop
   `posthog-js/react`, which pulls posthog-js into the initial set.
5. **Pageview:** queue `$pageview` until PostHog is ready, passing
   `$current_url`, `$pathname`, `$host` and the route-commit `timestamp`
   explicitly (user properties win, `posthog-core.js:1278`). PostHog always
   sets `title` and `$prev_pageview_*` at send time (`:1262`), so a view queued
   across a client navigation gets the newer title. Accepted.
6. Benchmark builds keep disabling both recorders (ADR-0037).

**Alternatives:**

| Alternative | Outcome |
| --- | --- |
| `load` plus idle | Rejected: `load` fired before hydration in most constrained runs |
| Root-provider `useEffect` | Rejected: selective hydration can run it before the composer segment hydrates |
| Calling the trigger from `prompt-input.tsx` | Works, but couples a UI primitive to analytics; the `hidden` attribute is already the ADR-0047 contract |
| Sentry `lazyLoadIntegration` | Rejected: loads from `browser.sentry-cdn.com`, which the CSP in `next.config.ts` blocks |
| Defer `Sentry.init` too | Worth up to 452 ms more on the constrained network, but loses hydration-time errors and early vitals without a buffering shim (a parallel system). Revisit only with a trimmed tracing config |
| Keep one recorder, or turn PostHog recording off | A user decision, below |

### 4. Benchmark and ratchet plan

- **Ratchet:** new `scripts/check-initial-js.ts`, run after `bun run build:next`
  in the CI Build job (production-equivalent env). It fails when initial JS gzip
  exceeds 225 KiB (D3 is 219.2 KiB) or any initial file contains `rrweb` (either
  recorder) or `persistence_name` (posthog-js core). It fails current main
  (321 KiB) and passes D3. Bytes in this set track hydration time (above).
  Lower the budget as other wins shrink the set.
- **Wall-clock diagnostic, not a gate:** cold guest `/` at 4x on the constrained
  network with a non-bot profile, reporting editor editable, first live data,
  total blocking time before editor, and editor-to-analytics start. Invariant:
  analytics start strictly after editor editable.
- **Steady-state probe:** diagnostic only; the ADR-0037 suites run with the
  perf flag and cannot see recorders.

### 5. Regressions

| Risk | Mitigation | Test |
| --- | --- | --- |
| Errors before Replay attaches get no replay (hydration errors and everything until about 0.1 to 0.4 s after editor editable; seconds on slow networks). Session replays miss page load | Accept and record in the ADR. The Sentry error itself is still captured | `instrumentation-client.test.ts`: `init` has `integrations: []` and the rates; `addIntegration` only after the handoff |
| PostHog `$pageview` lost if the tab closes before PostHog loads (editor to first PostHog request: about 0.46 s local, 0.89 s constrained) | Queue with explicit properties and timestamp. Share of sessions affected is **unverified** (no PostHog access): check session-duration percentiles before shipping | One `deferred-analytics` unit test: start waits for `fallback.hidden`, capture keeps properties and timestamp, the 20 s cap fires |
| Composer never hydrates | 20 s cap | Same test |
| `onRouterTransitionStart`, chat-perf observer | Unchanged: eager Sentry core; the observer is an independent dynamic import (`instrumentation-client.ts:68`) | Existing tests |
| Signed-in path | Same root chunks, same bytes. Timing **unverified** (guest `/` only) | The PR's paired signed-in CI run |

### 6. ADR

New **ADR-0050** "Analytics load after the composer handoff" (eager Sentry
core; the trigger and why `load` and root effects fail; the split points; the
pageview rule and title drift; the lost-replay and lost-pageview trade-offs;
the privacy finding). Amend **ADR-0049** (initial-JS ratchet), **ADR-0037**
("production replay remains unchanged" points to ADR-0050) and **ADR-0047**
(`fallback.hidden` is also the analytics readiness signal). Add `initial_js_gz`
to the metric dictionary.

### 7. File ownership and sequencing

`instrumentation-client.ts`, new `lib/analytics/deferred-analytics.ts`, new
`lib/analytics/sentry-replay.ts`, `app/providers/posthog-provider.tsx`,
`app/providers/posthog-pageview.tsx`, `instrumentation-client.test.ts`, one new
`deferred-analytics` test, new `scripts/check-initial-js.ts`, a step in
`.github/workflows/ci-cd.yml`, the docs above. No `lib/observability/*` or
`components/ui/*` change. Independent of the other wins. The PostHog privacy fix
is a project setting and can ship today with no code.

---

## Win 5: Highlight visible code first

### 1. Verdict

**Go with changes.** Highlight a code block only when its content-visibility
wrapper comes within two screens of the view, and run the highlight queue
newest-first. On a realistic chat the visible code is colored about 2x sooner.
Long code-heavy chats also skip highlighting blocks the reader never views.

### 2. Evidence

**Facts verified** (at `a54720bb`):

- The queue is first-in, first-out: `enqueueHighlight` chains every block onto
  one promise (`lib/markdown/shiki-client.ts:233-254`). Order is document order
  (top first), bunched by grammar arrival (`:273-282`).
- Every stable code block requests a highlight on mount, visible or not
  (`components/ui/code-block.tsx:84-107`). Theme is an effect dependency
  (`:107`), so a theme toggle re-highlights every mounted block.
- The cache is an in-memory `Map` (`lib/markdown/highlight-cache.ts:26`), capped
  at 200 variants and 2M characters (`:15-16`).
- `content-visibility: auto` (`app/globals.css:2021-2026`) applies to every code
  block's wrapper (`.markdown-code-block`, `components/ui/markdown.tsx:214`) but
  skips only layout and paint. Base still tokenized every block.
- Highlight tasks are not covered by the interaction-priority hold
  (`lib/chat-performance/interaction-priority.ts`).
- Copy and find-in-page do not depend on highlighting: `ButtonCopy` takes the
  raw code (`components/ui/markdown.tsx:223,229`) and the plain path renders
  the full text (`code-block.tsx:142-146`).

**Method.** A scratch-only route renders fixed chats through the real
`MessageContent`, `Markdown`, `RenderedCodeBlock` and `CodeBlockCode` path, so
the real Shiki service, cache, queue and content-visibility CSS all apply. It
mounts after hydration and scrolls to the bottom as `thread-scroll.tsx:413-428`
does. It lacks the sidebar, composer hydration, the Convex path delivery and the
ADR-0031 cache commit, so absolute times are lower bounds; the signed-in CI pair
on `/c/[id]` decides the quoted gain. TTVH (time to visible highlight) runs from
thread mount to the first frame where every code block in view is highlighted.
Later runs shared the machine with other jobs; compare arms only within one
table.

**Realistic chat** (25 turns, 8 code blocks, 12 KB of code; n=10 per arm per
throttle; open, then scroll everything at reading speed):

| Metric | Base | Chosen |
| --- | ---: | ---: |
| TTVH 1x | 252 ms (215 to 290) | 133 ms (126 to 164) |
| TTVH 4x | 1,284 ms (1,020 to 1,319) | 582 ms (563 to 816) |
| Highlights before the visible block, 1x / 4x | 5 / 8 | 1 / 1 |
| Highlights at open | 8 | 4 |
| Total highlight time after the full scroll, 1x / 4x | 235 / 1,045 ms | 239 / 1,085 ms |
| Blocks seen plain while scrolling | 0 | 0 |

The work saving is only for blocks never viewed; once everything is visited,
total work equals base.

**Worst case** (120 turns, 135 code blocks, 245 KB of code; n=10 per arm per
throttle; reading-speed scroll then a jump to the top):

| Metric | Base | Newest-first only | Gate only | Chosen |
| --- | ---: | ---: | ---: | ---: |
| TTVH 1x | 750 ms | 314 ms | 340 ms | 314 ms |
| TTVH 4x | 3,036 ms (paired) | 1,576 ms | 1,672 ms | 1,417 ms |
| Highlights at open | 133 | 133 | 4 | 4 |
| Total highlight time incl. scroll, 4x | 3,515 ms | 3,576 ms | 2,015 ms | 2,022 ms |
| DOM nodes at end | 45,990 | 45,990 | 8,961 | 8,961 |
| Jump to top: blocks seen plain | 0 | 0 | 3 | 3 |

The new floor is the first use of the TypeScript grammar: about 250 ms at 1x
and 1.0 to 1.1 s at 4x, as one task. Precompiled grammars or a worker would
address it; that is a separate win of unmeasured size.

**Observe target.** Observing the code element inside the content-visibility
wrapper caps the lookahead. Observing the wrapper itself (fast fling, 2,000 px
per 100 ms, n=8 and n=6 in two sessions):

| | Inner code element | Wrapper (chosen) |
| --- | ---: | ---: |
| Blocks seen plain in a fling | 6 | 1 |
| Longest plain, 1x / 4x | 42 / 155 ms | 5 / 40 ms |
| Highlights over the fling | 19 | 27 |
| Jump to top: time to colored, 1x / 4x | 93 / 290 ms | 143 / about 600 ms |

The wrapper nearly removes fling flashes but makes far jumps slower (3 blocks
plain either way). A "real viewport first" tier did not help the jump and was
dropped. A one-screen margin was clearly worse than two (10 against 6 blocks
plain in a fling, n=5).

**Revisits** (counts identical in every run): base highlights all 133 blocks at
open and then nothing; the gate highlights 4 at open, 129 on the first trip up,
then 0 on remount and 0 on a second trip. Each block is highlighted once, at
first view. No block was seen plain at reading speed in either arm. This holds
while the session fits the 2M-character cache (the worst case uses 1.69M).
Remounts with only the bottom viewed were faster gated (41 against 50 ms at 1x,
157 against 195 ms at 4x) because less cached HTML lands in the commit; no
remount ever flashed.

**Theme toggle** (worst case, n=4): base re-highlights all 133 blocks top first,
so the visible block stays plain for 318 ms (1x) and 1,332 ms (4x). Gated: 1
highlight, the visible block recolors in 36 ms and 102 ms, and offscreen blocks
stay plain until scrolled near (0 seen plain in a 9,000 px reading scroll).

**References.** Theo suggests a short fade when highlighting lands (see
`.agents/skills/make-chat-faster/references/theo-transcript.md`).

### 3. Chosen design and alternatives

1. **One shared observer helper**, `lib/dom/scroll-root-intersection.ts`, moved
   as-is from `app/components/chat/thread-scroll.tsx:83-168,195-197`:

   ```ts
   export function createScrollRootIntersectionObserver(options: {
     rootMargin: string
     threshold: number
     /** No [data-scroll-root] ancestor: "intersecting" reports true once
      * (today's turn behavior); "viewport" observes against the viewport. */
     withoutScrollRoot?: "intersecting" | "viewport"
   }): {
     observe: (target: Element, onChange: (intersecting: boolean) => void) => () => void
     disconnect: () => void
   }
   export function closestScrollRoot(el: Element | null): HTMLElement | null
   ```

   One observer per root, today's stale-callback guard, and no-op `true` when
   `IntersectionObserver` is missing (jsdom). Migrate thread-scroll in the same
   PR (`TurnIntersectionObserver` stays as a type alias, so `conversation.tsx`
   needs no edit). Shipping a second helper would be the parallel system
   AGENTS.md forbids.
2. **Gate** (`components/ui/code-block.tsx`): `CodeBlock` (the content-visibility
   box) provides its element through a small context. On a cache miss,
   `CodeBlockCode` observes that box (or itself when used standalone) with one
   module-level observer (`rootMargin: "200% 0px"`, `threshold: 0`,
   `withoutScrollRoot: "viewport"`), unobserves on the first `true` or on abort,
   then calls `highlightCode`. Cache hits stay synchronous through
   `peekCachedHighlight`, unobserved. Abort on unmount unobserves, so unmounted
   blocks never load grammars.
3. **Newest-first queue** (`lib/markdown/shiki-client.ts`): a pending list with
   a sequence number assigned when `highlightCode` is called. The drain takes
   the highest sequence after its two `MessageChannel` hops and drops aborted
   entries without tokenizing or yielding. With the gate, "newest" is the block
   that just came near the view or just settled in a stream.
4. **Interaction priority** (about 3 lines): before each pick, wait one frame
   while `isStreamingPaintHeld()` is true (holds expire at 300 ms). This delays
   a task's start only; the first-use grammar compile cannot be split, so the
   PR #209 popup risk is reduced, not removed.
5. **Fade**: only if the user picks it. A one-shot 160 ms opacity 0.4 to 1 when
   highlighted HTML replaces painted plain code; never on cache hits, never
   looping.

**Alternatives:**

- **Newest-first alone (no observer).** Same TTVH, but still highlights every
  block (133 tasks, 46k DOM nodes on the worst case), so the cost moves after
  the visible block where it competes with typing. Kept as the queue order only.
- **Gate with first-in, first-out.** Almost as good; margin blocks above can
  still tokenize before the visible one.
- **Observe the inner code element.** Lookahead capped; 6x more fling flashes.
- **Background drain of everything after the visible blocks.** Removes the
  far-jump flash but restores the full CPU and DOM cost. Only if the user
  dislikes the flash.
- **Rely on content-visibility.** Already shipped; it does not stop Shiki.
- **Worker or precompiled grammars.** Targets the new floor, not order.
  Separate follow-up.

### 4. Benchmark and ratchet plan

- **Exact counts** (identical in every run at 1x and 4x, so ADR-0049 grade):
  highlights at open (133 against 4 worst case, 8 against 4 realistic),
  highlights after a theme toggle (133 against 1), DOM nodes after open. They
  move with wall clock: the low-count arm colors the view about 2x sooner and,
  after a toggle, 9x to 13x sooner.
- **Diagnostic, not gated:** "highlights before the visible block" tracks TTVH
  (r = 0.994 and 0.987 worst case, 0.979 and 0.977 realistic) but varies run to
  run with grammar arrival.
- **PR 1 unit tests:** the moved observer tests plus the `"viewport"` case
  (`lib/dom/scroll-root-intersection.test.ts`); one gate test in
  `components/ui/code-block.test.tsx` (only the intersecting block highlights; a
  cache hit renders highlighted on first commit without observing); one order
  test in `lib/markdown/shiki-client-cancellation.test.ts` (newest first, an
  aborted request never tokenizes).
- **PR 2 count ratchet:** a perf-only fixture page `app/test/code-thread/page.tsx`
  (`notFound()` unless `NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION === "true"`;
  precedent `app/test/thinking-states`) rendering a fixed realistic code chat,
  and an `open-code-thread` interaction in `counts.ts` and `count-probe.ts`
  recording `shiki_highlight` marks and the DOM node delta for open and for a
  theme toggle. TTVH reported alongside, not gated.
- **Wall clock:** the signed-in CI pair on a seeded code chat at `/c/[id]`.

### 5. Regressions

| Risk | Mitigation | Test |
| --- | --- | --- |
| Far-jump flash: 3 blocks plain for about 0.15 s (1x) to 0.6 s (4x) after a jump to the top | User's taste call, optional fade | Recordings; counts scenario |
| Fling flash | Wrapper target and 200% margin: 1 block, 5 to 40 ms | Counts scenario |
| Theme toggle leaves offscreen blocks plain until scrolled near (never seen at reading speed) | Accept; toggling back is a cache hit | Toggle count in the counts scenario |
| Never-viewed blocks print plain | Accept; plain code is readable | None |
| Collapsed reasoning (`display: none`) never highlights until opened | Accept; that work was wasted before | None |
| A block that settles mid-stream waits one observer frame | Newest-first puts it ahead of any backlog | Harness `code-block` scenario timing in the CI pair (not measured here) |
| ADR-0039 replayed answers | Same stable-mount path as the fixture; the replayed bottom answer now highlights first | One refresh in the signed-in CI pair (not measured here) |
| Highlight cache | Hits stay synchronous; 0 remount flashes in every run | Gate unit test |
| Abort before yield | Aborted entries are dropped before tokenizing | Order unit test |
| Popup starvation (PR #209) | 4 tasks at open instead of 133; optional hold check | `interact-constrained` plus-menu journey in the CI pair |
| thread-scroll behavior after the helper move | `withoutScrollRoot: "intersecting"` keeps today's behavior | Moved observer tests; `thread-scroll.test.tsx` and `conversation.test.tsx` unchanged |
| Scrollers without `data-scroll-root` (activity panel, share page) | Viewport root; highlight on entry | None |

### 6. ADR

Amend **ADR-0016** "Lazy Shiki" with "Visible code first (2026-10-10)": the gate
on the content-visibility box and the 200% margin, the newest-first queue
(superseding the first-in, first-out bullet of the 2026-10-09 amendment), the
tables above, the observe-target finding, revisit and theme behavior, the
first-use grammar compile as the new floor, the shared observer helper, and the
fade decision. Add the count rows to **ADR-0049** with PR 2.

### 7. File ownership and sequencing

- **PR 1 (product):** new `lib/dom/scroll-root-intersection.ts` and test,
  `app/components/chat/thread-scroll.tsx` and its test (observer tests move
  out), `components/ui/code-block.tsx` and its test,
  `lib/markdown/shiki-client.ts`, `lib/markdown/shiki-client-cancellation.test.ts`,
  `app/globals.css` (fade keyframes only if chosen), ADR-0016.
- **PR 2 (ratchet):** `app/test/code-thread/page.tsx` and its fixture,
  `benchmarks/chat-performance/browser/counts.ts` and `count-probe.ts`,
  ADR-0049. After wins 2 and 3, which also touch the harness.

Independent of wins 1 to 4 in product files.

---

## Cross-win notes

- **Shared files.**
  - `lib/chat-store/messages/provider.tsx` and `warm.ts`: wins 1 and 3.
  - `convex/usage.ts`: wins 3 and 2.
  - Harness `counts.ts` and `count-probe.ts`: wins 3 and 5. `harness.ts` and
    the result schema: win 2. Build on the harness at `38c53967` or later.
  - `docs/adr/0049`: wins 1, 2, 3, 4 and 5 (each adds a row; rebase
    conflicts are trivial). Metric dictionary: wins 1, 2 and 4.
  - Only win 4 needs a new ADR (0050).
- **Baselines.** Win 3 removes a per-send re-run of every open and parked
  `getSelectedPath`, including win 1's history query, so measure win 1 on top
  of win 3.
- **No double counting.** Wins 2 and 3 both sit inside click-to-first-text;
  wins 1 and 5 both touch thread open. Their savings add only when measured in
  one paired run. Do not add numbers from different fixtures.
- **Signed-in evidence.** Every wall-clock number for wins 2 to 5 is guest or
  synthetic. Each PR's paired signed-in CI run is its acceptance gate.

## Recommended order (historical)

1. **PostHog text masking (no code, today).** A PostHog project setting; fixes
   the privacy exposure at no measurable cost. The user decides (below).
2. **Win 3.** Small, root cause, cleans the baselines for wins 1 and 2.
3. **Win 4.** Independent; the largest cold-load win.
4. **Win 1.** The largest streaming win; after win 3, and after or together with
   the Redis-replay PR because of the resume route.
5. **Win 2.** After win 3 and the user's sign-off on the guest-at-limit flow.
6. **Win 5.** After the user's taste call on the flash and the fade. Independent
   of wins 1 to 4, so it can run in parallel with any of them.

## Decisions for the user (historical)

Decided as listed in the status note at the top.

1. **PostHog privacy.** Production records chat text in clear. Options, all
   PostHog project settings: turn on text masking (recommended minimum; no
   performance cost), sample recordings (cuts quota and exposure, not CPU), or
   turn PostHog recording off (the only option that also removes its CPU cost,
   about +570 ms per 6 s of streaming at 4x in the synthetic probe).
2. **Keep one recorder or both.** Data only, no recommendation:

   | | Sentry Replay | PostHog session recording |
   | --- | --- | --- |
   | Gives | Error-linked replays (60 s buffer in every session) plus 10% full sessions, next to stack traces | Every session, with console logs, network timing and canvas, next to product events and funnels |
   | Masking today | All text, inputs, media | Inputs only; chat text in clear |
   | Bytes | 39.8 KB gz (async after win 4) | 68.8 KB gz SDK (async after win 4) plus 50.6 KB gz recorder from PostHog's CDN |
   | Steady state, synthetic stream at 4x | +90 ms per 6 s | about +570 ms per 6 s |
   | Quota | About 10% of sessions plus error replays | 100% of sessions |

   Plan and quota costs were not checked (no account access).
3. **Win 2, guest at the limit.** Today a fake thread flashes for about 100 ms
   before the sign-in dialog. The chosen design opens the dialog in about 34 ms
   with no flash. Screenshots: before, naive drop, and chosen design.
4. **Win 2, signed-in 998th-message toast.** Recommended: drop it (it fires once
   per 1,000 messages and keeping it needs a new response header). Say if you
   want it kept.
5. **Win 5, highlighting.** Accept a brief uncolored flash on far jumps (3
   blocks for about 0.15 s at normal speed, up to 0.6 s on a slow CPU) in
   exchange for colored code about 2x sooner on open, and decide whether to add
   Theo's one-shot fade. Also accept that never-viewed blocks print plain and
   stay plain offscreen right after a theme toggle (not visible while
   scrolling). The recordings were made before the wrapper change, so their
   fling flashes overstate the chosen design.
