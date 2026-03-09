# Background Worker Upgrade

## Status

Draft proposal for a background-job upgrade to the chat execution architecture.

This document is intentionally provisional. An AI agent should conduct research before implementation and then revise this document by deleting outdated assumptions, updating the proposed solution, and tightening the migration plan.

## 1. Core Problem We Are Trying To Solve

The current chat architecture is request-bound and stream-bound:

- a user action starts a long-lived `POST /api/chat` request
- model generation, tool execution, and research all happen inside that single request lifecycle
- the browser and UI remain coupled to the health of that open stream
- timeouts, disconnects, refreshes, retries, and tool-heavy research all become request-lifecycle problems

This causes several concrete problems:

- Long research runs can outlive normal browser or UX tolerance.
- Client-side timeouts can fire even when the backend is still working.
- Cancellation is not a first-class, durable state transition.
- Refresh and reconnect are fragile because work is attached to an in-flight request rather than a durable job.
- Retry safety is unclear because the same user action can accidentally create duplicate work.
- Observability is request-centric, which makes it hard to distinguish:
  - provider slowness
  - tool slowness
  - post-tool continuation stalls
  - client disconnects
  - true job failure

At a higher level, the application needs a durable execution model for AI-heavy work, especially for research, tool calling, and multi-step workflows that do not fit cleanly inside a single streaming HTTP request.

### Desired Outcome

We want a system where:

- a user action creates durable work
- work can continue independently of the original browser request
- progress survives refresh, reconnect, and temporary disconnects
- cancellation, retry, deduplication, and timeout behavior are explicit
- observability is job-aware rather than only request-aware
- the first version preserves a good enough streaming feel without introducing unnecessary storage cost or architectural complexity

## 2. Proposed Solution

### Summary

Move long-running chat generation, especially research-heavy and tool-heavy work, from a request-bound execution model to a durable background job architecture.

In this architecture:

- the initial request validates input and creates a durable job
- a worker executes the job asynchronously
- progress is persisted in durable state
- the UI reads job state and subscribes to updates
- the final assistant message is produced from durable job output rather than from a single fragile request stream

### High-Level Direction

The first version should optimize for reliability and operability over perfect token-by-token replay.

The recommended starting point is:

- durable background jobs
- milestone-based progress updates
- bounded partial content persistence only if needed
- explicit job lifecycle states
- strong idempotency and deduplication
- job-centric observability

This means the first version should not assume token-level persistence is required.

### Proposed Architectural Model

#### A. Request Phase

The initial user action should do only lightweight synchronous work:

- validate auth and request payload
- normalize the model and tool configuration
- compute an idempotency key for the user action
- create or reuse a durable generation job
- append the user message durably if it is not already persisted
- return immediately with:
  - `jobId`
  - `chatId`
  - accepted job status
  - any existing deduplicated job reference

This request should not own the entire generation lifecycle.

#### B. Durable Job Record

Introduce a canonical job entity, conceptually something like `chat_generation_jobs`.

Suggested fields:

- `jobId`
- `chatId`
- `messageGroupId`
- `requestId` for the originating request
- `userActionId` or idempotency key
- `userId`
- `status`
- `phase`
- `attempt`
- `leaseOwner`
- `leaseExpiresAt`
- `heartbeatAt`
- `lastProgressAt`
- `startedAt`
- `completedAt`
- `cancelledAt`
- `failedAt`
- `provider`
- `model`
- `toolSummary`
- `progressSummary`
- `partialOutput`
- `finalOutput`
- `errorSummary`
- `observabilityContext`

Suggested statuses:

- `queued`
- `running`
- `awaiting_tools`
- `synthesizing`
- `completed`
- `failed`
- `cancel_requested`
- `cancelled`
- `timed_out`

Suggested phases:

- `prepare`
- `research`
- `tool_execution`
- `synthesis`
- `persisting`
- `done`

#### C. Worker Phase

A background worker should own job execution.

The worker should:

- acquire a lease for the job
- mark the job `running`
- execute the workflow in explicit phases
- heartbeat while healthy
- update `lastProgressAt` whenever meaningful progress occurs
- persist milestone updates
- finalize the assistant output
- write durable completion or failure state
- release or expire the lease

The worker must be able to resume safely after crashes or restarts.

#### D. UI Phase

The UI should move from “I am attached to one request stream” to “I am observing a durable generation.”

The chat UI should:

- optimistically render the user message
- display job status for the assistant response
- subscribe to durable progress updates
- show states like:
  - `Researching sources`
  - `Running tools`
  - `Synthesizing answer`
  - `Waiting to retry`
  - `Cancelled`
  - `Timed out`
- reconcile partial and final content from durable job state

### Partial Streaming Strategy

The first version should preserve the feeling of progress without forcing token-level persistence.

#### Recommended v1

Use milestone-based updates:

- job accepted
- research started
- sources discovered
- tools running
- synthesis started
- final answer ready

Optionally, also allow coarse partial content updates during synthesis:

- append larger text chunks only every few seconds or after size thresholds
- avoid storing every token

#### Why this is the recommended first version

- It is cheaper to persist.
- It is easier to make idempotent.
- It is easier to replay after refresh.
- It reduces storage churn and write amplification.
- It keeps the architecture simple while still improving UX dramatically.

#### Not recommended for v1

Do not start with token-level persistence unless research proves it is necessary.

Token-level persistence may be:

- too expensive
- noisy to observe
- harder to deduplicate
- harder to replay correctly
- difficult to scale with many concurrent jobs

### Idempotency and Deduplication

The background-worker design must make duplicate execution extremely hard.

#### Proposed v1 strategy

Create a canonical `userActionId` or idempotency key derived from the user action, not from the request transport.

Potential components:

- `chatId`
- `messageGroupId`
- normalized user message identifier
- edit/regenerate mode
- authenticated `userId`

The initial request should:

- check whether a live or recently completed job already exists for that idempotency key
- reuse it if found
- only create a new job if no valid prior job exists

#### Separate IDs by responsibility

- `requestId`: a transport-level request correlation ID
- `jobId`: the durable execution identity
- `chatId`: the conversation identity
- `messageGroupId`: the message-turn identity
- `toolCallId`: the tool invocation identity
- `userActionId` or idempotency key: the deduplication identity

This separation is important. The current system overuses request lifecycle concepts for work that should survive past the request.

### Refresh and Retry Safety

The new architecture should treat refresh and retry as normal behavior.

#### Refresh-safe behavior

On refresh:

- the UI reloads the current chat
- it queries for any active job attached to the latest message turn
- it resumes displaying progress from durable state

#### Retry-safe behavior

Retry should be explicit:

- `retry job` means re-run the same semantic work under a new attempt
- `retry message` means create a new user action and therefore a new idempotency context

This distinction should be designed clearly in the data model.

### Timeout Strategy

The new architecture should replace one implicit timeout with layered, explicit timeouts.

#### Recommended layers

- worker-level timeout
- provider-level timeout
- tool-level timeout
- per-phase timeout
- global max job age

#### Suggested conceptual policy

- provider-level timeout:
  - protects individual upstream model calls
- tool-level timeout:
  - protects external tools and MCP integrations
- per-phase timeout:
  - bounds research, synthesis, and persistence independently
- worker-level timeout:
  - bounds one worker attempt
- global max job age:
  - prevents zombie jobs from living forever across retries

The exact numbers should be determined by research and observed workload patterns.

### Stall Detection and Recovery

The new job system should assume stalls can happen and should recover automatically.

#### Recommended mechanisms

- `heartbeatAt`
- `lastProgressAt`
- worker lease expiration
- no-progress window detection
- controlled retry policy

#### Proposed recovery model

- If heartbeat stops and lease expires, another worker can reclaim the job.
- If heartbeat continues but `lastProgressAt` does not move for too long, mark the job as stalled.
- Stalled jobs should either:
  - be retried automatically if safe
  - move to `failed` or `timed_out`
  - require user intervention, depending on phase and failure class

### Observability Model

Observability must become job-centric.

#### Current problem

Today many warnings are request-level:

- `chat_slow_request`
- `chat_client_abort`
- `chat_stalled_continuation`

Those are useful now, but a background-job architecture requires a richer lifecycle model.

#### Proposed observability direction

Retain request-level signals for ingress health, but introduce job-level signals for execution health.

Request-level events should cover:

- request accepted
- deduplicated request reused existing job
- request rejected
- request cancelled before job creation

Job-level events should cover:

- `chat_job_created`
- `chat_job_started`
- `chat_job_heartbeat_missed`
- `chat_job_stalled`
- `chat_job_retry_scheduled`
- `chat_job_cancel_requested`
- `chat_job_cancelled`
- `chat_job_timed_out`
- `chat_job_failed`
- `chat_job_completed`
- `chat_job_duplicate_prevented`

Phase-level events should cover:

- research started
- research completed
- tool phase started
- tool phase stalled
- synthesis started
- synthesis completed

Tool-level events should remain correlated to the job, not only the request.

### Canonical Correlation Strategy

Every lifecycle record should be correlated through stable identifiers:

- request logs and request warnings should include `requestId`, `chatId`, and `jobId` once created
- job events should include `jobId`, `chatId`, `messageGroupId`, `userActionId`
- tool traces should include `jobId`, `chatId`, `toolCallId`, `phase`, and `attempt`
- final assistant messages should record which `jobId` produced them

This should make Sentry, logs, and application state tell the same story.

### Migration Strategy

Suggested staged rollout:

#### Phase 0

Improve observability in the current request-bound model.

This is already underway and should continue until diagnosis is reliable.

#### Phase 1

Introduce durable job records and request-to-job creation, but keep current synchronous generation as fallback.

#### Phase 2

Move research-heavy generations to worker execution behind a feature flag.

#### Phase 3

Adopt milestone-based progress updates in the UI.

#### Phase 4

Decide whether chunk-level or token-level partial persistence is worth the cost.

#### Phase 5

Retire request-bound long-running generation for the selected traffic classes.

## 3. Open Research Questions That Still Need Answering

The questions below should drive pre-implementation research. The goal is not just to confirm the current proposal, but to challenge it and revise it where needed.

### A. Industry Standards and Competitive Patterns

1. What is the current industry-standard architecture for long-running AI research workflows in chat applications?
2. How do leading AI-focused applications handle background jobs for:
   - research
   - tool execution
   - browsing
   - multi-step agent loops
3. Which products keep work request-bound, and which move it to durable jobs?
4. How do products like ChatGPT, Claude, Perplexity, Cursor, or other agentic systems represent long-running work in the UI?
5. What best practices exist for cancellation, retry, refresh recovery, and progress display in AI agent products?
6. Are there public engineering writeups, architecture blogs, talks, or SDK examples that describe durable AI job orchestration?

### B. Convex and AI SDK Documentation

1. What Convex documentation, examples, or patterns are relevant to:
   - background jobs
   - scheduled work
   - durable workflows
   - optimistic UI with durable status updates
   - lease-based processing
2. Does Convex recommend a canonical pattern for queues, workers, retries, and idempotency?
3. Are there Convex constraints that change the proposed design?
4. What Vercel AI SDK documentation is relevant to:
   - streaming outside a single request
   - background model execution
   - resumable streams
   - partial output persistence
   - tool-calling workflows in durable systems
5. Does the AI SDK provide any built-in primitives for resumable or recoverable generation that could reduce custom infrastructure?
6. Are there examples combining AI SDK streaming with durable application state?

### C. Partial Streaming and Update Granularity

1. How can partial streaming be preserved in a background model?
2. Do we need token-level updates?
3. Would chunk-level persistence be too expensive?
4. Would milestone-based updates be sufficient for the first version?
5. What is the best user experience trade-off between:
   - cost
   - storage churn
   - freshness
   - implementation complexity
6. If partial content is persisted, what is the best update policy?
   - time-based flush
   - size-based flush
   - phase-based flush
   - hybrid flush
7. How do other AI apps preserve a streaming feel without storing every token?

### D. Idempotency and Duplicate Prevention

1. What is the best idempotency strategy for chat generation jobs?
2. How do we avoid duplicate jobs for the same user action?
3. What should the canonical idempotency key be composed from?
4. Should deduplication happen:
   - at request creation time
   - at worker lease acquisition time
   - both
5. How do industry systems distinguish:
   - retrying the same job
   - rerunning the same user message intentionally
   - regenerating an answer
   - editing and resubmitting a message

### E. Refresh, Retry, and Canonical IDs

1. How do we make refresh safe?
2. How do we make retry safe?
3. What identifiers should become canonical across the system?
4. Should `jobId`, `chatId`, `messageGroupId`, and `userActionId` all exist as separate first-class identities?
5. Should `requestId` remain purely transport-scoped, or should it ever be elevated into durable state?
6. How should a final assistant message reference the job that produced it?

### F. Timeout Architecture

1. What is the best timeout strategy in the new architecture?
2. What should the worker-level timeout be?
3. What should the provider-level timeout be?
4. What should the tool-level timeout be?
5. What should the per-phase timeout be?
6. What should the global max job age be?
7. Which timeouts should fail fast, and which should schedule retries?
8. Which timeouts should surface as user-visible states versus internal operational states?

### G. Stall Detection and Recovery

1. How should stalled jobs be detected and recovered?
2. Should heartbeat timestamp be required for every active job?
3. Should no-progress window detection be phase-specific?
4. Should worker lease expiration be the primary recovery mechanism?
5. What is the correct automatic retry policy?
6. Which failure classes are safe to retry automatically?
7. How should the system distinguish:
   - worker crash
   - provider hang
   - tool hang
   - progressless but still active synthesis
8. Should stalled jobs be resumed, restarted from phase boundaries, or failed terminally?

### H. Observability and Sentry

1. How should observability change in a job-based architecture?
2. Which current Sentry warnings should become job-level warnings instead of request-level warnings?
3. What new lifecycle events should be tracked?
4. How should we correlate request IDs, job IDs, chat IDs, and tool calls?
5. Which events belong in:
   - request logs
   - job logs
   - span traces
   - warning events
   - error events
6. What should the new bounded tag taxonomy be for job-level observability?
7. How should Sentry dashboards and alerts change for the job architecture?

### I. Persistence and Cost

1. What is the expected write amplification of:
   - token-level persistence
   - chunk-level persistence
   - milestone-only persistence
2. What is the likely Convex cost impact of each update strategy?
3. What storage retention policy should apply to:
   - partial output
   - progress logs
   - tool results
   - final outputs
4. Which data should be persisted durably versus reconstructed from logs or traces?

### J. UX and Product Semantics

1. What is the minimum progress UX needed for v1?
2. Is milestone-based feedback enough to feel responsive?
3. Should users be able to close the tab and come back later to a completed answer?
4. How should cancellation appear in the UI if the job is already in synthesis?
5. How should retries appear if a job partially completed before failure?
6. Should a background job ever append partial assistant content to the permanent chat transcript before completion?

## Initial Recommendation Before Research

Unless research strongly contradicts it, the likely best starting point is:

- durable background jobs
- milestone-based progress updates
- no token-level persistence in v1
- explicit idempotency using a user-action key
- canonical `jobId` distinct from `requestId`
- lease plus heartbeat stall recovery
- layered timeout policy
- job-level observability added alongside request-level ingress observability

This recommendation is intentionally defeasible. If research shows a better industry-standard pattern, this document should be updated accordingly.
