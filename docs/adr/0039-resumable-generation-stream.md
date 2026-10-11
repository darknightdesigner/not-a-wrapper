# 39. Reconnect to an execution's retained UI stream

- Status: implemented; no-rewind restoration verified in production
- Date: 2026-09-05
- Supersedes: ADR-0008's exclusion of stream resumption
- Preserves: ADR-0011 settlement, ADR-0013 navigation ownership, ADR-0016 immediate rendering

## Decision

Retain ordered AI SDK UI message chunks in a short-lived Redis Stream per generation run. Convex remains authoritative for ownership, selected branch, Stop, approvals, checkpoints and terminal messages. Redis holds replay data, not a second generation lifecycle. Reconnection is an authenticated read of the currently selected, owned run and never starts generation.

The initial browser keeps its direct HTTP stream. A concurrently consumed copy writes replay data independently of that browser. This preserves initial token latency, with the explicit tradeoff that a sudden producer failure can lose output not yet retained or checkpointed. Checkpoints remain enabled. A missing replay never silently starts the model again.

A refreshed browser starts an authenticated reconnect before its Convex WebSocket subscription hydrates. The same owner-checked route resolves the selected run and supplies its selected message path. This removes the client-auth/subscription waterfall without weakening the subscription auth gate or introducing a second lifecycle authority.

The refreshed document restores the selected saved messages immediately, without clearing the assistant's parts. The retained stream reconstructs the SDK state silently from its immutable starting state; the caught-up fence publishes the restored answer once, then live chunks publish at their arrival cadence. Historical output has no pacing or typewriter animation. A subscription checkpoint already displayed, or a transient reconnect's visible prefix, is never replaced with a shorter prefix. Replay does not execute client tools, auto-submit approvals, or call initiating-turn finish handlers.

Checkpoint adoption compares log positions, not content (see "Checkpoint stream cursor (2026-10-11)"). The route numbers the final UI chunk stream once: chunk `n` is Redis entry `0-n`, the browser's n-th chunk, and the position the durable checkpoint reducer stamps on each Convex checkpoint as `streamCursor`. A cursor is an upper bound: the checkpoint's parts are contained in the log's reduction through it, and an absent cursor means the position is unknown. Replay may replace a displayed message only once it has applied at least that entry of the same run's log. Step boundaries, opaque provider metadata, text phase, tool states and data parts therefore need no comparison rules. ADR-0040 extends new checkpoints to preserve SDK structure and text phase for inline work history; legacy aggregate checkpoints remain readable.

An ephemeral exact assistant identity bypasses Markdown decay during reconstruction. It never enters message metadata or persistence. Incremental parsing and the existing live-stream paint treatment remain in place.

Conversation scroll placement is armed by local submission or preflight, never by streaming status alone. The exact submitted user turn stays armed through its native stream and first-send URL adoption; settlement or another chat clears it. A resumed GET therefore cannot re-pin the prompt after the reader scrolls into the answer.

The Markdown offscreen-layout optimization excludes semantic list roots and blocks containing lists, including blockquotes. A partial next item can briefly parse as a sibling paragraph, which previously switched a long list into first-time containment with a 3rem fallback. Chrome then clamped the scroll position as the apparent content height collapsed. The exclusion persists after settlement so a concluding paragraph cannot trigger the same transition. Blocks without lists retain containment; offscreen lists trade that optimization for correct geometry.

A displayed copy without a known position (a checkpoint written before cursors, the final full-parts snapshot, a Stop prefix) hands the turn to Convex checkpoints at once: the observer disconnects but keeps the run marked as seen. A log still behind the displayed cursor after 2 seconds (slow Redis appends let checkpoints run ahead) does the same. Checkpoints then drive the rest of that turn instead of a frozen answer; they only ever replace a checkpoint, so the prefix rule holds.

Each observer keeps one ordered SDK reducer across connections. A reconnect sends its last applied entry id as `after`, together with its `runId`; the route rejects a cursor without one. The server resends the immutable base, sends only newer entries, and sends a new caught-up fence. The client ignores the repeated base and any entry at or before its cursor. Idle readers send a `heartbeat` frame after 2.5 seconds without a frame (about every 3 seconds) and write nothing to Redis. Heartbeats are opt-in (`heartbeat=1`), because tabs loaded before they existed reject unknown frames. A connection that delivers nothing for 10 seconds, response headers included, is replaced from its cursor. That stall counts toward the same five-failure budget as other transport failures, with checkpoints shown while it retries, so a route that never delivers falls back to checkpoints instead of polling all turn. A visible tab, `online`, or a back/forward-cache `pageshow` replaces at once a connection that has delivered nothing for 5 seconds (two missed heartbeats), and ends a retry backoff early (the shared Connection wake Module, ADR-0024). A connection still receiving heartbeats is healthy and is kept.

A durable run outlives its initiating request. On the same wake signals, a direct request that has not changed the message for 10 seconds is ended, and the next sync resumes from the retained stream. It ends as a transport handoff: its response stream closes as if the server had ended it, so abort cleanup never removes the in-flight assistant. The direct request has no heartbeats, so it gets no silence watchdog; the 330-second client stream budget remains its outer backstop.

Successful server completion does not cut an exact retained reader while its historical output is still reaching the screen. The shared presentation resolver keeps that reader active until it drains. Stop, branch changes and new Send/regenerate commands disconnect it immediately. Terminal content and generation ownership remain authoritative in Convex.

Approval continuations reuse messages but create new runs: the Redis key belongs to the run, never the assistant message alone. An approval pause closes the execution; the next execution gets a new replay log and starting message.

## Alternatives

- Snapshot smoothing retains the coarse transport cadence. Rejected in favor of replaying retained structured chunks.
- Visibly paced replay of the entire history was tried and rejected by the user: refresh should restore existing text and continue from there. Earlier comparison observations were insufficient grounds to make replay-from-the-start the product behavior.
- Bare Redis Pub/Sub with producer-memory replay is smaller, but drops replay when the producer dies and cannot recover missed publications by cursor.
- Durable Streams has a suitable protocol but its published AI SDK adapter targets SDK 6; this project uses SDK 7 and does not already operate its production service.

The official Redis client is the one new dependency. Redis Streams supply cursor-based history and live reads without a separate Pub/Sub attachment race. Redis is optional for existing deployments; configure `CHAT_STREAM_REDIS_URL` to enable replay. Development defaults to a loopback Redis instance. Production has no implicit Redis address.

## Verification requirements

Prove refresh during real model output in authenticated Chrome; restore the retained prefix without replaying it from the beginning, resume granular updates and reach the final saved answer. Preserve the visible prefix on transient reconnects within the same document. Cover replay ordering, cancellation, preparation/completion races, approval baseline and authorization with focused tests. Do not claim worker-crash continuation: the existing lease and checkpoint lifecycle handles interrupted execution.

### No-rewind restoration verification (2026-09-05)

The user rejected replay-from-the-start after directly testing localhost:3002.
The receiver now restores selected messages intact and silently reconstructs
retained history, then publishes live updates. The [earlier experiments](../performance/2026-09-05-stream-resumption-verification.md)
are historical and do not define the acceptance criterion.

Authenticated Chrome, optimized localhost:3002, GPT-5.6 Luna/Off: 4,987 rendered
characters before full reload; first sampled restored text was 5,317 characters
at 931 ms, followed by live growth to 10,797. No sampled restored prefix was
shorter than the pre-reload answer. The completed 21,950-character answer matched
exactly after another full reload. Raw timestamped screenshots, DOM samples and
completion equality are in `output/playwright/stream-parity-polish/wrapper-no-rewind/`.

Focused validation passed 66 tests, targeted ESLint, typecheck and optimized
Next.js build. Independent installed-SDK probes covered text, metadata and
partial tool JSON at the catch-up boundary. The [before/after video](https://drive.google.com/file/d/1HHeqTFCWfx6DFbl2luawIqPNQhs9SkEL/view)
labels the old paced replay and the corrected restoration behavior; timing is preserved.
This browser verification preceded production deployment.

### Hosted Redis and PR verification

The production Vercel project now has a dedicated Upstash Redis instance in
`iad1`, on the free plan with automatic paid upgrades disabled. Its TLS URL is
configured as the server-only `CHAT_STREAM_REDIS_URL` secret. Local Redis remains
separate. The hosted service exposed a request-size constraint absent locally:
records and starting state now have a 1 MiB preflight cap, and the existing
16 MiB total limit is checked before sending as well as atomically in Redis.
Oversized retained output falls back to checkpoints without poisoning the client.
All five Redis integration tests pass against the hosted instance.

### Production checkpoint handoff correction (2026-09-06)

The first production verification after PR #181 restored 9,766 characters from
a pre-reload 9,472-character answer, but then froze until terminal persistence.
Redis continued receiving chunks and the authenticated retained route returned
200. The SDK reconstructed `[step-start, text]` while the live checkpoint held
`[text]`; comparing part indexes rejected every replay publication. Local browser
evidence therefore did not establish production acceptance. Production-shaped
SDK frames reproduce this failure and cover the corrected adoption rule above.
The [fresh production acceptance](../performance/2026-09-06-stream-restoration-acceptance.md)
on corrected deployment `5ed93b1f` passed: two live reloads preserved the sampled
prefix and resumed granular updates before completion. The completed rendered
answer matched exactly after another reload. A focused SDK receiver test covers
same-document transport interruption and prefix-preserving retry separately.

### Local refresh correction (2026-09-08)

The localhost regression had two causes: Redis was not running, so refresh used
roughly 750 ms checkpoint batches; and the new structured-checkpoint guard could
reject valid replay when opaque provider metadata changed. The guard now preserves
visible text and explicit phase without requiring opaque metadata equality.
The local Redis service was restored and registered to start at login.

Authenticated Chrome full-document reloads on GPT-5.6 Luna/Low preserved every
sampled text prefix: 5,678 characters restored as 6,000 at 985 ms, and a second
reload restored 13,662 as 13,882 at 604 ms. Both continued with granular updates.
The final 14,851-character answer matched exactly after another reload. Continuous
60 fps recordings and timestamped DOM data are retained under
`output/thinking-ui-parity-20260908/hard-refresh/`. This verifies the local flow;
it is not a new production or provider-matrix acceptance claim.

### Stall recovery and checkpoint handoff (2026-09-27)

Two freezes remained. First, when the replayed copy differed from the displayed
checkpoint in a way the prefix guard does not model, every replay update was
rejected while streaming status paused checkpoint projection, so the answer froze
until the run ended. HuggingChat avoids the comparison: each saved message records
the log sequence it contains (`materializedSeq`) and resume starts there. Doing
that here means stamping the retained cursor on Convex checkpoints, which changes
the schema and the durable checkpoint writer. The 2-second handoff removes the
freeze without that change. Within one document, reconnects now continue one
reducer from a cursor, so no reconnect replays the log from the start.

Second, a sleeping phone or network switch could leave a reader that never
errors, and the only guard was the 330-second client budget. The recovery above
follows HuggingChat's `reattachStream.ts`: a 10-second stall window over server
heartbeats, resubscription from the client's own last sequence, and reactions to
visibility, `online` and `pageshow`. A provider that stops producing on a healthy
connection is a server concern. Implemented (2026-10-10) in
`app/api/chat/provider-stall-timeout.ts`: a provider call that goes 60 seconds
without a stream part while writing its answer ends with a stream `error` part,
so the turn settles failed through the normal error path; reasoning,
provider-run tools and the pre-answer wait pause the clock and stay bounded by
the provider deadline (60 s matches LobeHub's relay `idleMs`). AI SDK 7
`timeout: { firstChunkMs, chunkMs }` was rejected because it settles as an abort
(like Stop) and, in ai@7.0.73, `chunkMs` keeps counting while client tools run
inside a step.

Review corrections: a stall counts as a failure, so a route that never delivers
cannot keep the answer frozen behind endless 10-second reconnects; a wake keeps a
connection that is still receiving heartbeats; a direct-request handoff closes the
response stream instead of aborting it; and heartbeats are sent only to readers
that ask, so a tab loaded before this change never receives a frame it rejects.
HuggingChat's SSE readers ignore unknown events, so it needs no such opt-in.

Focused tests cover the stall reconnect with its cursor, heartbeat keepalive, the
stall failure budget, and the handoff. Live acceptance: a refresh during a long
answer keeps growing; a response body that stops delivering reconnects with
`after` within about 10 seconds and resumes; after 5 seconds of silence, `online`,
`visibilitychange` and `pageshow` reconnect at once, while a connection still
receiving heartbeats is kept.

### Checkpoint stream cursor (2026-10-11)

This answers the 2026-09-27 deferral. The prefix guard needed a new rule for
every part shape it mis-modeled (`step-start` parts, opaque provider metadata,
text phase changes), and tools and data still relied on heuristics. Following
HuggingChat's `materializedSeq` (`huggingface/chat-ui@8e696f8`, `Message.ts`
L24-30, `writer.ts` L207-294), every checkpoint now records the log position it
contains. LibreChat pairs its resume snapshot with an emission frontier the
same way.

Server: `sequenceUIMessageChunks` numbers the final response stream (after
metadata, the title merge and the perf observer) before the Redis tee, and
Redis entries use explicit ids `0-n` instead of `*`. The checkpoint tracker now
reduces those same sequenced UI chunks from the same starting message; it used
to convert `streamText` parts itself, without message metadata, so no shared
position existed. Each throttled checkpoint carries `streamCursor`, the last
sequence observed when the write is issued, which is at or ahead of the reduced
parts. Convex writes the cursor in the same patch as `content`/`parts`; a
deduplicated write keeps the stored cursor, and the `lastSnapshotSequence`
guard rejects stale pairs. A new placeholder and an approval continuation's
relinked message start at `0-0` (that content is the new run's base). The final
full-parts snapshot, the completion write and a Stop observed-text prefix clear
it: their content can lead the log or is not a reduction of it. The wire format
is unchanged, so tabs loaded earlier keep working.

Client: while a connection's gate is closed, each network read and the
caught-up fence write a metadata probe into the reducer. The SDK merges message
metadata and yields after every non-null `message-metadata` chunk, so each
yield carries a lower bound of what it has applied. A yield replaces the
displayed copy only when that bound reaches the copy's cursor: no visible parts
count as `0-0`; this tab's own direct request counts as `0-<delivered chunks>`
while its parts are still displayed; a previous run's content counts as `0-0`;
a stamped cursor counts as itself. Anything else hands the turn to checkpoints
at once. Published replay states carry their own cursor, and the selected-path
projection moves a cursor only together with the parts it adopts or with a
relink to another run.

SDK deviation: AI SDK 7's reducer cannot start from a saved message partway
through a part. `readUIMessageStream` throws `UIMessageStreamError` on a
`text-delta`, `text-end` or `tool-input-delta` whose start it has not seen
(verified in `ai@7.0.73`, `dist/index.js` text cases near L7006). Replay
therefore still starts from the immutable base; the cursor decides when replay
may replace the checkpoint, not where it starts. First-connection bandwidth is
unchanged.

Deviations from the implementation plan:

- At the caught-up fence, the probe waits for its own yield and then publishes
  the exact restored state before reconstruction ends, instead of deferring to
  the next live yield. This keeps restored text out of the live paint treatment
  and never publishes lagging intermediate snapshots.
- The tracker no longer closes or drains its input on flush: the sequenced
  stream closes only after settlement returns, so that wait would deadlock.
  Flush writes a metadata barrier into the tracker's own reducer and waits
  (bounded) for it, so it persists every chunk already observed. Chunks still
  in transit before the sequencing transform when a server abort or provider
  failure flushes are not included. Those paths write the run terminal before
  settlement, which then rejects the final full-parts snapshot, so the stored
  message can end a few chunks short of what the browser received.
- The completion write also clears the cursor. Its parts come from the response
  message; a cursor left by a failed final snapshot would understate them for a
  connection retrying in backoff.
- The direct-request rule matches the parts array the request left displayed,
  captured when the SDK settles its status, so parts a later projection
  replaced cannot borrow the delivered count. It runs before the previous-run
  and stamped-cursor rules and does not compare run ids: a direct stream stamps
  neither, so both can still describe the run an approval continuation resumed,
  and a later run on the same message starts from a base that already holds
  those parts.
- The selected-path projection also adopts the server's cursor when a
  message's `generationRunId` changes (an approval continuation relink), since
  the parts did not change. Otherwise an observer in a second tab compared the
  relinked run's log against no cursor and fell back to checkpoints.

Focused tests cover the gate (a checkpoint ahead of the log, no cursor, a
previous run's content, the direct-request count), the tracker cursor and final
clear, explicit Redis ids with `after` resume, the Convex pairing and
continuation reset, and the projection pairing.

Local verification (2026-10-11): authenticated Chrome on the localhost:3000 dev
server with local Redis. The tab was hidden, which freezes the paced DOM reveal,
so samples read the chat's message state through its messages callback from
about 0.4 s after each full navigation. GPT-5 Mini/Low: a reload at 16,658
answer characters first showed 16,714 at 503 ms (replay cursor `0-3099`), then
2,315 updates of a median 6 characters, none shorter than before the reload,
while the retained request stayed open past 12 s. Another reload at 10,728
characters resumed at 13,700. Completed answers matched the stored content
exactly after another reload. Haiku 4.5 web search: a reload during three
running searches resumed at 621 ms with the searches completing, and a reload at
1,222 characters resumed at 1,240 after 571 ms. GPT-5 Mini/Medium: two reloads
during reasoning resumed without a freeze (1,725 reasoning characters resumed as
1,753 after 586 ms). Ending the direct request as the wake handoff does, after
1,385 delivered chunks (7,699 characters), published the replay 188 ms later at
7,837 characters (`0-1406`). Convex cursors advanced as `0-n` during every run
and were cleared at completion; all 11 runs ended terminal (10 completed, one
Stop). No console errors. Approval continuation and stopped Redis were not run
live; unit tests and the existing fallback cover them.

## References

- [Theo's Redis resumption explanation](https://www.youtube.com/watch?v=gZ4Tdwz1L7k&t=3294s)
- [Redis Streams reads](https://redis.io/docs/latest/commands/xread/)
- [AI SDK stream reader](https://ai-sdk.dev/docs/reference/ai-sdk-ui/read-ui-message-stream)
