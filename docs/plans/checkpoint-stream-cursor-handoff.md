# Checkpoint stream cursor: deterministic replay handoff

Research date: 2026-10-10. Branch `claude/redis-vs-convex-streaming-fl7ire` at `34d4a79`.
Audience: the coding agent that implements this. Self-contained.
Related: ADR-0039 (retained stream), ADR-0011 (settlement), ADR-0008 (`lastSnapshotSequence`).

## 1. Goal

Stamp every Convex checkpoint with the retained-stream position it contains, so a
refreshed client knows exactly when its replay covers the checkpoint it is showing.
This replaces the text-prefix guess (`hasVisiblePrefix`) and the 2-second
`CHECKPOINT_HANDOFF_MS` fallback with a cursor comparison.

User-visible problem: after a refresh, the answer can freeze for 2 s (or until the
run ends, before 2026-09-27) when the replayed message differs from the checkpoint
in a way the prefix guard does not model. This happened three times in production:
`step-start` parts, opaque provider metadata, and text phase changes. Each needed a
new rule. Tool and data parts still depend on heuristics (`containsValue`,
`toolProgress`).

### Invariant (the whole design)

> A message's `streamCursor` C is an **upper bound**: its parts are contained in
> `reduce(base, log[1..C])`. Writers may overstate C, never understate it. An
> absent cursor means the position is unknown.
>
> A replay state S may replace a displayed message D only when S has reduced at
> least through D's cursor: `lowerBound(S) >= upperBound(D)`, both in the same run's log.

## 2. Reference design (HuggingChat)

Pinned to `huggingface/chat-ui@8e696f8`.

- Each assistant message stores `materializedSeq`, the highest event-log sequence
  folded into its saved content ([Message.ts L24-30](https://github.com/huggingface/chat-ui/blob/8e696f8877ca39c1525ce82b3b1f8906cfa76825/src/lib/types/Message.ts#L24-L30)).
- The writer that appends the event log also materializes the message. It captures
  `seq` and the snapshot in one synchronous block and flushes pending events
  before stamping, so a reader never resumes past an unwritten event
  ([writer.ts L207-242, L280-294](https://github.com/huggingface/chat-ui/blob/8e696f8877ca39c1525ce82b3b1f8906cfa76825/src/lib/server/generation/writer.ts#L207-L242)).
  `currentSeq()` seals the coalescing tail so later tokens cannot extend an
  event the snapshot claims to cover (L259-267). The full-conversation save stamps
  from the same instant ([+server.ts L455-461](https://github.com/huggingface/chat-ui/blob/8e696f8877ca39c1525ce82b3b1f8906cfa76825/src/routes/conversation/%5Bid%5D/%2Bserver.ts#L455-L461)).
- On load, the client reattaches with `fromSeq = materializedSeq` and applies
  only later events onto the saved message. This works only on a freshly
  loaded snapshot. Later reconnects use the subscription's own last sequence
  ([+page.svelte L516-534](https://github.com/huggingface/chat-ui/blob/8e696f8877ca39c1525ce82b3b1f8906cfa76825/src/routes/conversation/%5Bid%5D/%2Bpage.svelte#L516-L534),
  [reattachStream.ts L36-44, L61-101](https://github.com/huggingface/chat-ui/blob/8e696f8877ca39c1525ce82b3b1f8906cfa76825/src/lib/utils/reattachStream.ts#L36-L101)).
- Edge cases:
  - **Missing turn:** a turn with no generation gets `end: gone`.
  - **Sequence gaps:** a gap holds the reader up to 10 s, then is skipped as a permanent hole.
  - **Caught-up marker:** a hole may delay `caughtUp` by at most 1 s ([stream/+server.ts L30-42, L94-149](https://github.com/huggingface/chat-ui/blob/8e696f8877ca39c1525ce82b3b1f8906cfa76825/src/routes/conversation/%5Bid%5D/stream/%2Bserver.ts#L30-L149)).
  - **Retention:** events expire after 24 h and generations 7 days after they end ([database.ts L347-372](https://github.com/huggingface/chat-ui/blob/8e696f8877ca39c1525ce82b3b1f8906cfa76825/src/lib/server/database.ts#L347-L372)).
  - **Resumed producers:** they continue from `max(materializedSeq, max log seq)`. A writer that fails to register reports that floor, never 0 (writer.ts L119-158).
  - **Stopped runs:** the content is clamped back to what the user saw, the one documented case where content and cursor disagree.
- LibreChat (`danny-avila/LibreChat@e1dfc10`) pairs a server-built resume snapshot with an exact
  emission-sequence frontier. Events at or below the frontier count as already in the snapshot. Later events are
  sent as `pendingEvents` in one `sync` frame
  ([GenerationJobManager.ts L6096, L6199-6210](https://github.com/danny-avila/LibreChat/blob/e1dfc10449ff713faffacd60273fddcfe2c0a698/packages/api/src/stream/GenerationJobManager.ts#L6199-L6210),
  [agents/index.js L353-364](https://github.com/danny-avila/LibreChat/blob/e1dfc10449ff713faffacd60273fddcfe2c0a698/api/server/routes/agents/index.js#L353-L364)).
  Both projects use the same idea: a snapshot is only meaningful together with the sequence it covers.

**Deviation we must make:** the AI SDK 7 reducer cannot start from a saved message
partway through a part. `readUIMessageStream` throws `UIMessageStreamError` on a
`text-delta`, `text-end` or `tool-input-delta` whose start it has not seen
(`node_modules/ai/dist/index.js` ~L7006, ~L7157, ai@7.0.73). We therefore keep
replaying from the immutable base, as today, and use the cursor only to decide
**when** the replay may replace the checkpoint. Bandwidth on the first connection
is unchanged, and same-document reconnects already resume from `after`.

## 3. Decision

- **Chosen:** sequence the final UI chunk stream once on the server. The Redis
  entry for chunk `n` gets the explicit id `0-n`. The checkpoint tracker reduces
  the same sequenced chunks and stamps `streamCursor` on each checkpoint. The
  client adopts replay by cursor comparison. Trade-off: one schema field, a
  tracker input change and a small client probe; no heuristics remain.
- **Alternative considered:** keep Redis auto ids (`*`) and have the producer report
  the XADD ids back. Trade-off: the tracker and the Redis producer read different
  pipelines today, so a reported id cannot be tied to checkpoint content without
  a mapping table and async coordination. Rejected.
- **Alternative considered:** a true HuggingChat-style resume from the cursor.
  Trade-off: it saves replay bandwidth but needs a forked SDK reducer, since the
  stock one cannot be seeded partway through a part. Rejected.
- **Alternative considered:** keep tuning the prefix guard. Trade-off: no schema
  change, but every new part shape needs another rule. Rejected.

**Correction to the task brief:** the Redis tee and the checkpoint writer do **not**
consume the same stream today.

- The tracker is fed `TextStreamPart`s from `streamText({ onChunk })` (`app/api/chat/chat-turn-runtime.ts` ~L1699-1735). It runs upstream of the UI conversion and converts them itself, without `messageMetadata` (`durable-turn-runtime.ts` ~L762-772).
- Redis reads a tee of the final response stream, after metadata, the title merge and the perf observer (`chat-turn-runtime.ts` ~L2412-2431).
- No shared position exists. Step 3 creates one.

## 4. Changes (in order)

Coordinate first: another agent is editing the reader loop in `lib/chat-stream/server.ts`,
and a second agent is editing `app/api/chat/**` and ADR-0039 for the provider stall
timeout. Land this change after theirs, or rebase onto them. Section 4 only touches the
producer half of `server.ts` (`APPEND`, `consume`) and the tee block of `chat-turn-runtime.ts`.

### Step 1. Convex field and writes

- `convex/schema.ts`, `messages`: add `streamCursor: v.optional(v.string())`,
  with a comment that cites the invariant. This is an optional field, so the
  production preflight stays compatible and no migration is needed.
- `convex/chatRuntime.ts`, `generationRunWriteArgs.updateAssistantSnapshot`: add
  `streamCursor: v.optional(v.union(v.string(), v.null()))`. `null` clears the
  cursor. The worker (`convex/chatRuntimeWorker.ts`) and the HTTP dispatch
  (`convex/http.ts`) inherit this argument by spread, so they need no logic.
- `updateAssistantSnapshotForChat` (~L2536):
  - Write `streamCursor` in the **same** `ctx.db.patch(args.messageId, …)` as
    `content`/`parts`. A string sets it and `null` unsets it.
  - Validate the format (`^\d+-\d+$`, at most 64 characters). Treat an invalid
    value as `null`.
  - The `lastSnapshotSequence` guard already rejects stale writes, so no separate
    cursor-monotonic guard is needed.
  - On the `contentUnchanged` dedupe path, keep the stored cursor. It still
    overstates the unchanged content, which is safe. Only skip the message patch
    when the write is not a `null` clear of an existing cursor.
- Set `streamCursor: "0-0"` where a run takes ownership of a message:
  - `writeAssistantPlaceholder` in `convex/domain/message_branch_writes.ts`
    (~L572), which covers both callers in `chatRuntime.ts` (~L1134, ~L2257).
  - The approval-continuation patch in `prepareGeneration` (`chatRuntime.ts`
    ~L2245), which relinks `generationRunId`. The message content there equals
    the new log's base: `identity()` returns the durable `originalMessages`,
    which is also the retained `baseMessage`.
- `stopGenerationRunForChat` (~L3153): when the observed-text patch applies, also
  unset `streamCursor`. That content is no longer a reduction of the log.

### Step 2. Redis producer with explicit ids (`lib/chat-stream/server.ts`, producer only)

- Add to `lib/chat-stream/protocol.ts`:
  - `type SequencedUIMessageChunk = { seq: number; chunk: UIMessageChunk }`
  - `retainedCursorForSeq(seq) => \`0-${seq}\``
  - The reader, `after`, `highWater` and `compareRetainedCursors` stay unchanged. The wire format stays `^\d+-\d+$`, so tabs loaded before the change keep working.
- `consume(stream: ReadableStream<SequencedUIMessageChunk>)`: batch `[id, json]`
  pairs.
- `APPEND` Lua: replace the `XADD … '*'` loop with
  `for i = 6, #ARGV, 2 do redis.call('XADD', KEYS[2], ARGV[i], 'chunk', ARGV[i + 1]) end`.
  Byte accounting stays the same. Count only JSON bytes, as today.
- Give the synthetic interruption `error` entry the id `0-${lastSeq + 1}`.
- Export a tiny `sequenceUIMessageChunks(onChunk)` `TransformStream<UIMessageChunk, SequencedUIMessageChunk>`
  that assigns `seq` from 1 and calls `onChunk(chunk, seq)` synchronously before enqueueing.

### Step 3. One sequenced stream feeds the client response, Redis and checkpoints

- `app/api/chat/chat-turn-runtime.ts`, in the `if (streamRunId)` tee block (~L2412):
  ```ts
  const sequenced = observedResponseStream.pipeThrough(
    sequenceUIMessageChunks((chunk, seq) => lifecycle.envelope.observe(chunk, seq))
  )
  const [responseBranch, retainedBranch] = sequenced.tee()
  observedResponseStream = responseBranch.pipeThrough(/* map ({chunk}) => chunk */)
  // retainedBranch → retained.consume(retainedBranch) | consumeStream
  ```
  Ordering: the tracker sees chunk `n` before the tee hands it to Redis. A checkpoint
  can lead the log by one Redis batch (≤20 ms plus round trip), never by a chunk
  that has no `seq`. The browser's direct response carries the same chunk order,
  so the n-th chunk the browser receives is `seq n`.
- `app/api/chat/durable-turn-runtime.ts`, `createDurableSnapshotTracker` (~L687):
  - Replace the `TextStreamPart` input and its private `toUIMessageStream` with
    `observe(chunk: UIMessageChunk, seq: number)`. That method writes into
    `readUIMessageStream({ message: initialMessage, stream })` and records `fedSeq = seq`.
  - `persist()` adds `streamCursor: retainedCursorForSeq(fedSeq)`, read when the
    write is issued. `fedSeq` is at or ahead of the reduced parts, which keeps the
    cursor an upper bound.
  - `flush()` keeps writing the tracker's own `(parts, cursor)` pair.
  - `flushFinal(finalText, finalParts)` sends `streamCursor: null`. `responseMessage`
    can lead the tracker: `onEnd` runs in the SDK's `flush`, upstream of the sequencing
    transform. It must **not** wait for the tracker to drain the sequenced stream,
    because that stream closes only after `onEnd` returns (deadlock).
  - Close the tracker input from the sequencing transform's `flush`. Settlement
    no longer closes it.
  - `noteWorkSummary` and `stream.onChunk` stay on `streamText`'s `onChunk`
    (ADR-0041 C5). `onChunk` stops feeding content.
- `DurableStreamBinding.envelope` gains `observe(chunk, seq)`; the guest adapter's
  version is a no-op. It sits on `envelope.*` because it is a `toUIMessageStream`-side position (ADR-0011 grouping).

### Step 4. Carry the cursor to the client, paired with parts

- `lib/chat-messages/metadata.ts`:
  - Add a typed accessor `getStreamCursor(metadata)`.
  - Stamp `metadata.streamCursor` from the doc in `stampServerFields` in
    `extended` mode only. The selection frame and the subscription both use
    `extended`; model history uses `runtime` and must not see it.
  - Do **not** add it to `DURABLE_FIELD_MAP`: `adoptServerOwned` adopts those
    keys on their own, and a cursor adopted without its parts would break the invariant.
- `lib/chat-store/turns/selected-path.ts`, `reconcileSelectedPath` (~L139): when
  `partsChanged`, set `metadata.streamCursor` to the server message's value, or
  remove it. Never change the cursor without changing the parts.
- The cursor is client-only display metadata. Confirm that the persistence
  projector never writes client metadata keys to Convex.

### Step 5. Client adoption by cursor (`lib/chat-stream/resumable-chat.ts`)

- `RetainedReplay`:
  - In `consume`, set `this.cursor = frame.id` **before** `await this.input.write(chunk)`.
    `this.cursor` is then always an upper bound of what the reducer has seen. It
    stays the reconnect `after`.
  - **Lower-bound probe:** while the gate is closed, after each network read's
    frames and at `caught-up`, write
    `{ type: "message-metadata", messageMetadata: { replayedThrough: this.cursor } }`
    into the reducer pipe, only when the cursor has advanced since the last probe.
    The SDK merges metadata and always yields after a non-null
    `message-metadata` chunk (`index.js` ~L7410), so every later yield carries a
    lower bound of what it has reduced. A missing `replayedThrough` reads as `0-0`.
  - At `caught-up`, do not publish `this.restored` immediately. It can lag the
    writes. Mark the connection live and let the next gated yield publish.
  - On publish: strip `replayedThrough` and set `metadata.streamCursor = this.cursor`
    (the upper bound) on the published message.
- `ResumableChat.receive` publish callback: replace `hasVisiblePrefix` and the handoff timer with:
  ```ts
  const proof = displayedCursor(previous, run.runId) // string | null
  if (proof === null) { disconnectObserver(); return } // no proof: checkpoints drive now
  if (compareRetainedCursors(replayedThrough(message), proof) < 0) return // wait for the log
  gateOpen = true // stops probing for this connection
  ```
  `displayedCursor(previous, runId)`:
  1. No visible parts: `"0-0"`.
  2. `generationRunId` differs from `runId`: `"0-0"`. This is the approval
     continuation case; the old run's content is the new log's base.
  3. Otherwise `getStreamCursor(previous.metadata)`.
  4. If that is absent and `previous` came from this tab's direct request for
     `runId`: `0-${direct.delivered}`.
  5. Otherwise `null`.

  Re-check the gate on each connection's first publication. Projection can install a newer
  checkpoint during retry backoff (status `ready`).
- Direct transport wrapper (constructor ~L268): count delivered chunks as
  `direct.delivered`, and remember the run id it served. This keeps the direct
  handoff path (ADR-0039 "A durable run outlives its initiating request") on replay
  instead of dropping to checkpoints. It is an upper bound because the n-th wire chunk is `seq n`.

## 5. Deleted or simplified

- `lib/chat-stream/resumable-chat.ts`:
  - Delete `containsValue`, `toolProgress`, `hasVisiblePrefix` (L29-113),
    `CHECKPOINT_HANDOFF_MS` (L23-25), the `handoff` timer (L446, L455-464, L566)
    and the per-connection `adopted` flag (replaced by `gateOpen`).
  - Remove the `isToolUIPart` and `readTextPhase` imports.
- `app/api/chat/durable-turn-runtime.ts`: delete the tracker's private
  `toUIMessageStream` conversion and the `TextStreamPart` writer chain (~L762-835),
  and drop `onChunk`'s content-feed role.
- `lib/chat-stream/resumable-chat.test.ts`: delete
  "hands the turn to checkpoints when replay cannot extend the displayed copy"
  (L306) and the prefix-shape `it.each` matrices (~L600-880: encrypted reasoning,
  opaque metadata, phase reclassification, phased final text). Their concern
  becomes impossible by construction.
- **Kept:**
  - The single ordered reducer per observer; reconnect from `after`; the `caught-up` fence.
  - Opt-in heartbeats, the 10 s stall watchdog, wake handling and the five-failure budget.
  - The direct-request handoff and the selection frame.
  - "Never replace a displayed prefix with a shorter one", now guaranteed by construction.
  - The `projectSelectedPath` text-length heuristic. Out of scope; it could use cursors later.

## 6. Edge cases

| Case | Handling |
|---|---|
| Redis not configured or unreachable at init | Unchanged: the route returns 503 for live runs, the client gives up after 5 failures, and checkpoints drive. Cursors are still written; they are cheap and unused. |
| Redis fails mid-run, or the log is oversized (>16 MiB total or a >1 MiB record) | Unchanged: the producer marks the log `unavailable`, the reader sends `unavailable`, and the client falls back after its failure budget. The gate is not involved. |
| Log expired (1 h active, 10 min completed) or missing | The reader returns null, so checkpoints drive. A cursor never forces a read. (HuggingChat equivalent: `end: gone`.) |
| Checkpoint ahead of the log (Redis batch lag) | The gate waits. The next live chunk reaches the cursor within milliseconds. There is no timer: the tracker is upstream of the Redis tee, so a log that cannot reach C has failed and will send `unavailable`. |
| Producer process dies after a checkpoint | The display holds the checkpoint, which is the best content anyway, until the lease reaper ends the run and `syncRun` detaches the observer. |
| Approval continuation (new run, reused message) | Prepare resets the cursor to `0-0` in the same patch that relinks `generationRunId`. The Redis key is per run. The client compares cursors only within the same run; an older run's content counts as `0-0`. |
| Legacy checkpoint without a cursor (runs in flight across the deploy) | `proof === null`: the observer disconnects at once and checkpoints drive, the same as today's fallback without the 2 s wait. The DB is disposable, so there is no backfill. |
| Stale or out-of-order checkpoint writes | `lastSnapshotSequence` rejects them before persistence. The cursor is written in the same patch as the content, so a pair can never be mixed. A deduped write keeps the older, still-overstated cursor. |
| Final full-parts snapshot (ADR-0011) | Clears the cursor. A tab that reloads during settlement disconnects its observer, and the checkpoints show the complete answer until the run reaches its terminal state. |
| Stop with observed text (ADR-0011, Sep 7 amendment) | Clears the cursor. The run is terminal, so no client resumes it. |
| Payload capping (`capMessagePayload`) | Capped content is a subset of the reduction, so the cursor is still a valid upper bound. |
| Projection during retry backoff | The cursor moves only together with the parts it describes (Step 4), so the next connection's gate compares against the right cursor. |
| Old tabs and old servers | The wire format is unchanged. Old tabs ignore the new metadata key and keep their prefix guard. |

## 7. Tests (essential only)

1. `lib/chat-stream/resumable-chat.test.ts`:
   - A checkpoint `[text]` with `streamCursor: "0-3"` and a log of `[step-start, text]` shape with `highWater` `0-2`: nothing publishes at `caught-up`. The first publication follows chunk `0-3`. No published text is shorter than the checkpoint.
   - A checkpoint without a cursor for the selected run detaches the observer at once (no fake-timer advance).
   - Extend "restores an approval baseline…" so the displayed message belongs to the previous run and is adopted at `caught-up`.
   - Extend "recovers a failed original transport…" so the resume gates on the direct-request delivered count.
2. `app/api/chat/durable-turn-runtime.internals.test.ts`: after observing N chunks, the persisted `streamCursor` is `0-N` and the parts reflect at most those chunks. `flushFinal` sends `null`.
3. `lib/chat-stream/server.test.ts` (Redis integration, `CHAT_STREAM_TEST_REDIS_URL`): extend "replays a fixed prefix…" to assert that entry ids are `0-<seq>` and that `after=0-k` resumes at `k+1`.
4. `convex/chatRuntime.test.ts`, `updateAssistantSnapshotForChat` describe (~L4701): the cursor lands with the content, and a stale sequence leaves both unchanged. One prepare case: the continuation resets the cursor to `0-0`.
5. `lib/chat-store/turns/selected-path.test.ts`: the cursor changes only when the parts are adopted.

Then run `bun run typecheck`, `bun run lint`, `bun run test` and `bun run build:next`. Never run `bun run build`.

## 8. Verification (authenticated Chrome, ADR-0039 style)

Use the optimized local build on localhost:3002 with local Redis running. Read
`docs/convex-access.md` before inspecting Convex.

1. **Long answer** (GPT-5.6 Luna/Low): reload during output at least twice and sample DOM text every 50 ms. No sample may be shorter than the text before the reload. Granular updates resume. The final answer matches exactly after another reload.
2. **Tool turn** (web search) and a **reasoning turn with phase changes**: reload while the tool or reasoning parts are streaming. These are the shapes the old guard mis-modeled. Expect no freeze, and in DevTools the `/stream` request should stay open past 2 s, because there is no handoff.
3. **Approval continuation:** reload after approving and confirm that the replay is adopted.
4. **Direct handoff:** with DevTools offline for more than 10 s and then `online`, the answer continues from replay, not at the 750 ms checkpoint cadence.
5. **Redis stopped:** refresh during output shows the answer advancing in 750 ms checkpoint steps, with no errors.
6. **Convex dashboard:** the assistant message's `streamCursor` advances (`0-n`) while the run is live, and is cleared after the final snapshot.

Record timestamped samples under `output/` and summarize the numbers in the ADR amendment.

## 9. Docs to update

- `docs/adr/0039-resumable-generation-stream.md`:
  - Rewrite the Decision paragraphs that state the current rule: "Checkpoint adoption compares visible content…", "Text and reasoning adoption guards…", and "If replay cannot extend the displayed checkpoint… 2 seconds".
  - Add a dated amendment "Checkpoint stream cursor (2026-10-xx)" that cites HuggingChat `materializedSeq` and the SDK reducer deviation.
  - Leave the historical sections as they are. The 2026-09-27 section's deferral is answered by the new amendment.
- `docs/adr/0011-durable-turn-settlement.md`: add a short amendment. The tracker now reads the sequenced UI chunk stream; snapshots carry `streamCursor`; the final full-parts snapshot clears it.
- `docs/adr/0041-provider-reasoning-boundary.md` L15 and `CONTEXT.md` L220: remove "the replay prefix guard" from the list of `readTextPhase` callers.
- `CONTEXT.md` L341 (**Retained generation stream**): replace "A replay that cannot extend the displayed checkpoint within 2 s hands that turn to checkpoints" with the cursor rule.
- Convention: dated amendments inside the existing ADR, as 0011 and 0039 already do. If a reviewer prefers a separate record, the next free number is 0050.

## 10. Open questions for a human

1. Accept that the first reconnect still replays the log from its base? A true resume from the cursor would need a forked AI SDK reducer. Recommended: accept.
2. Keep the `ms-seq` wire format with explicit `0-n` ids, which is compatible with loaded tabs (recommended)? The alternative is switching cursors to plain integers everywhere, which is cleaner but breaks cursors held by tabs across the deploy.
3. Legacy checkpoints without a cursor: fall back to checkpoints at once (recommended, pre-launch)? The alternative is publishing at `caught-up` unguarded.
4. Amend ADR-0039 (recommended) or write ADR-0050?
