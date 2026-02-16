# 03 — Job Events and Real-Time Streaming

Research document for the PayClaw event system — SSE streaming endpoint, polling events endpoint, event type taxonomy, and wire format. Critical for driving real-time UI updates in our chat.

**Source repo**: `https://github.com/flowglad/provisioning-agent.git`
**Date**: 2026-02-16

---

## Source Files Reviewed

| File | Purpose |
|------|---------|
| `packages/app/app/api/v1/jobs/[id]/events/stream/route.ts` | SSE endpoint — Effect Stream, 250ms polling, keepalive, terminal `done` event |
| `packages/app/app/api/v1/jobs/[id]/events/route.ts` | Polling events endpoint (GET all events for a job) |
| `packages/agent/src/api/types.ts` | `JobEventType`, `JobEventDataMap`, `JobEvent` discriminated union, `SseJobEvent`, `JobDonePayload` |
| `packages/app/lib/jobs/types.ts` | App-side mirror of event types |
| `packages/agent/src/api/job-event-store.ts` | `JobEventStore` interface and PG implementation (INSERT/SELECT on `public.job_events`) |
| `packages/agent/src/api/job-executor.ts` | `processProvisioningJob` — where events are emitted, sanitized, and persisted |

---

## 1. Event Type Taxonomy

### Complete `JobEventType` Union

```typescript
type JobEventType =
  | 'job.started'
  | 'job.progress'
  | 'card.issued'
  | 'page.navigated'
  | 'form.submitted'
  | 'payment.completed'
  | 'email.received'
  | 'verification.completed'
  | 'credentials.extracted'
  | 'job.completed'
  | 'job.failed'
```

11 event types total. Both the agent package (`packages/agent/src/api/types.ts`) and the app package (`packages/app/lib/jobs/types.ts`) define identical unions.

### Event Data Payloads

The type system uses a discriminated union with `JobEventDataMap`. Events are split into two categories:

**Events WITH structured `data` payload** (8 types):

| Event Type | Data Payload | Description |
|------------|-------------|-------------|
| `job.started` | `{ vendorUrl: string; vendorName: string; product?: string; mode?: string }` | Emitted when job processing begins |
| `job.progress` | `{ stage: string }` | Intermediate progress updates |
| `card.issued` | `{ last4: string; limit: number }` | Virtual card created (last4 only — full number redacted) |
| `page.navigated` | `{ url: string }` | Browser navigation event |
| `form.submitted` | `{ url: string }` | Form submission event |
| `credentials.extracted` | `{ hasCredentials: boolean }` | Credentials found (value NOT included — retrieved separately via Credentials API) |
| `job.completed` | `{ stepCount: number; eventCount: number; skillsUsed: string[]; hasCredentials: boolean }` | Terminal success event |
| `job.failed` | `{ error: string; stepCount: number; eventCount: number }` | Terminal failure event |

**Events WITHOUT `data` payload** (3 types):

| Event Type | Description |
|------------|-------------|
| `payment.completed` | Payment transaction finished |
| `email.received` | Verification email received |
| `verification.completed` | Email/SMS verification step done |

These are typed as `JobEventWithoutData` — they carry only `type`, `timestamp`, and `message` (no `data` field).

### TypeScript Discriminated Union

```typescript
type JobEventWithData = {
  [K in keyof JobEventDataMap]: {
    type: K
    timestamp: Date
    message: string
    data: JobEventDataMap[K]
  }
}[keyof JobEventDataMap]

type JobEventWithoutData = {
  type: Exclude<JobEventType, keyof JobEventDataMap>
  timestamp: Date
  message: string
}

type JobEvent = JobEventWithData | JobEventWithoutData
```

Every event has `type`, `timestamp` (Date in-memory, ISO-8601 string on the wire), and `message` (human-readable string). The `data` field is present only for the 8 mapped types.

---

## 2. SSE Wire Format

### Endpoint

```
GET /api/v1/jobs/{id}/events/stream
```

Headers: `X-API-Key` or `Authorization: Bearer <key>`

Response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Frame Types

The SSE stream emits four distinct frame types:

#### a) Regular Event Frame

Each new event is sent as a `data:` frame with JSON payload:

```
data: {"type":"job.started","timestamp":"2025-01-15T10:30:00.000Z","message":"Provisioning job started for Acme","data":{"vendorUrl":"https://acme.com","vendorName":"Acme","mode":"provision"}}\n\n
```

The JSON matches the `SseJobEvent` interface:

```typescript
interface SseJobEvent {
  type: string           // event type from JobEventType union
  timestamp: string      // ISO-8601 string (NOT a Date object)
  message: string        // human-readable description
  data?: Record<string, unknown>  // optional typed payload
}
```

**Key detail**: `timestamp` is serialized as an ISO-8601 string by `JSON.stringify()` (since the in-memory `Date` gets `.toISOString()`'d). Consumers must parse with `new Date(event.timestamp)`.

#### b) Terminal `done` Frame

When the job reaches a terminal state, a named event frame is sent:

```
event: done
data: {"status":"completed","result":{"success":true,"credentials":"cred_abc123","skillsUsed":["signup","checkout"]}}\n\n
```

The payload matches `JobDonePayload`:

```typescript
interface JobDonePayload {
  status: string                   // 'completed' | 'failed' | 'cancelled'
  result?: Record<string, unknown> // job.result (null if no result yet)
}
```

**Important**: The `done` frame uses SSE named events (`event: done`), not just `data:`. Standard `EventSource` clients need `.addEventListener('done', ...)` to capture it — the default `onmessage` handler won't fire for named events.

#### c) Error Frame

If an internal error occurs during polling:

```
event: error
data: {"error":"Internal server error"}\n\n
```

This is also a named event (`event: error`) and terminates the stream.

#### d) Keepalive Comment Frame

When a poll cycle finds no new events:

```
: keepalive\n\n
```

This is a standard SSE comment (line starting with `:`). It keeps the connection alive but is ignored by `EventSource` clients. Since polling happens every 250ms, keepalive frames are emitted at most every 250ms during idle periods.

### Frame Sequence Example

```
data: {"type":"job.started","timestamp":"...","message":"Provisioning job started for Acme","data":{...}}\n\n
: keepalive\n\n
: keepalive\n\n
data: {"type":"card.issued","timestamp":"...","message":"Virtual card issued","data":{"last4":"4242","limit":100}}\n\n
data: {"type":"page.navigated","timestamp":"...","message":"Navigated to signup page","data":{"url":"https://acme.com/signup"}}\n\n
: keepalive\n\n
data: {"type":"form.submitted","timestamp":"...","message":"Submitted signup form","data":{"url":"https://acme.com/signup"}}\n\n
data: {"type":"credentials.extracted","timestamp":"...","message":"Credentials extracted","data":{"hasCredentials":true}}\n\n
data: {"type":"job.completed","timestamp":"...","message":"Provisioning completed successfully","data":{"stepCount":12,"eventCount":6,"skillsUsed":["signup"],"hasCredentials":true}}\n\n
event: done\ndata: {"status":"completed","result":{"success":true,"credentials":"cred_abc"}}\n\n
```

---

## 3. Terminal State Detection

The SSE stream detects terminal states through job status polling:

```typescript
const terminalStatuses: JobStatus[] = ['completed', 'failed', 'cancelled']
```

Each poll cycle (every 250ms):

1. Fetches the current job via `service.get(id)` to check status
2. Lists all events via `service.listEvents(id)` and sends only new ones (tracks sent count via `Ref<number>`)
3. If `terminalStatuses.includes(job.status)`:
   - Sends the terminal `event: done` frame with `{ status, result }` 
   - Returns `{ done: true }` which triggers `Stream.takeUntil` to close

The stream structure:

```typescript
const sseStream = Stream.fromEffect(Ref.make(0)).pipe(
  Stream.flatMap((ref) =>
    Stream.repeatEffectWithSchedule(pollAndEmit(ref), Schedule.spaced(250))
  ),
  Stream.takeUntil(({ done }) => done),          // stop after terminal
  Stream.flatMap(({ frames }) => Stream.fromIterable(frames))
)
```

**Connection cleanup**: The `ReadableStream` attaches an abort listener to `request.signal`. When the client disconnects, the Effect Fiber is interrupted, cleanly stopping the stream.

```typescript
request.signal.addEventListener('abort', () => {
  Effect.runFork(Fiber.interrupt(fiber))
})
```

### Job existence check

Before starting the stream, the endpoint verifies the job exists:

```typescript
const jobCheck = await Effect.gen(function* () {
  const service = yield* JobServiceTag
  yield* service.get(id)
  return { ok: true as const }
}).pipe(/* ... catch JobNotFoundError → 404 */)
```

If the job doesn't exist, a `404` JSON response is returned instead of opening an SSE stream.

---

## 4. Keepalive Strategy

```typescript
if (newEvents.length === 0) {
  frames.push(': keepalive\n\n')
}
```

- **Format**: SSE comment frame (`: keepalive\n\n`)
- **Frequency**: Sent every poll cycle (250ms) when no new events exist
- **Purpose**: Prevents proxy/load-balancer timeouts by sending periodic data
- **Client impact**: `EventSource` ignores comment frames — no application-level handling needed
- **Guarantees**: The client receives at least one frame every 250ms (either an event or a keepalive), which is aggressive enough to keep any proxy connection alive

---

## 5. Sensitive Field Redaction

Events are sanitized **before** persistence to the database. The `sanitizeJobEvent()` function in `job-executor.ts` handles this:

### Redacted Fields

| Key (camelCase) | Key (snake_case) | Replacement Placeholder |
|-----------------|------------------|------------------------|
| `cardNumber` | `card_number` | `{{CARD_NUMBER}}` |
| `cardCvc` | `card_cvc` | `{{CARD_CVC}}` |
| `cardExpiry` | `card_expiry` | `{{CARD_EXPIRY}}` |

### How Redaction Works

1. `toCanonical(key)` normalizes both camelCase and snake_case to camelCase:
   ```typescript
   function toCanonical(key: string): string {
     return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
   }
   ```
2. `redactValue(value)` recursively traverses the data object:
   - Arrays → recursed element-by-element
   - Objects → each key checked against `SENSITIVE_KEYS` after canonicalization
   - Matching keys → replaced with placeholder string
   - Non-matching keys → recursed deeper
   - Primitives → passed through unchanged
3. `sanitizeJobEvent(event)` wraps this: if the event has no `data` field, returns it unchanged; otherwise returns a copy with sanitized data.

### Emission Pipeline

```typescript
const emitEvent = (event: JobEvent) => {
  Effect.runSync(Ref.update(eventCountRef, (n) => n + 1))
  Effect.runFork(options.persistEvent(sanitizeJobEvent(event)).pipe(Effect.ignore))
}
```

Events are:
1. Sanitized (`sanitizeJobEvent`)
2. Persisted fire-and-forget (`Effect.runFork` + `.pipe(Effect.ignore)`)
3. The in-memory event count is incremented synchronously

**Implication for our integration**: We will never see raw card numbers on the wire. The `card.issued` event only exposes `last4` and `limit` by design. The redaction layer is an additional defense for any tool result data that might contain full card details.

---

## 6. Event Persistence (Database Schema)

### Table: `public.job_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | (auto-increment) | Used for `ORDER BY id ASC` to maintain chronological order |
| `job_id` | string | Foreign reference to the job |
| `type` | string | Event type from `JobEventType` union |
| `message` | string | Human-readable description |
| `data` | jsonb (nullable) | Typed payload, stored as `NULL` for events without data |
| `timestamp` | string/timestamp | Stored as ISO-8601 string |

### Insert (from agent)

```typescript
sql`
  INSERT INTO public.job_events (job_id, type, message, data, timestamp)
  VALUES (${jobId}, ${event.type}, ${event.message}, ${data}::jsonb, ${event.timestamp.toISOString()})
`
```

The `data` column receives `JSON.stringify(event.data)` cast to `jsonb`, or `null` for events without a data payload.

### Select (from app SSE endpoint)

```typescript
sql`
  SELECT type, message, data, timestamp
  FROM public.job_events
  WHERE job_id = ${jobId}
  ORDER BY id ASC
`
```

Results are mapped back to `JobEvent` objects with timestamp parsing:

```typescript
timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp as string)
```

### In-Memory Implementation

An `InMemoryJobEventStore` exists for unit tests, backed by a `Map<string, JobEvent[]>`.

---

## 7. Polling Events Endpoint (Non-Streaming)

### Endpoint

```
GET /api/v1/jobs/{id}/events
```

Headers: `X-API-Key` or `Authorization: Bearer <key>`

### Response

```json
{
  "events": [
    {
      "type": "job.started",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "message": "Provisioning job started for Acme",
      "data": { "vendorUrl": "https://acme.com", "vendorName": "Acme" }
    },
    ...
  ]
}
```

### Behavior

- Returns **all** events for the given job, ordered chronologically (by `id ASC`)
- No pagination — all events in a single response
- No filtering by event type
- Simple auth check via `validateApiKey`
- Error responses: `401 UNAUTHORIZED`, `500 INTERNAL_ERROR`
- Does **not** check for `404` explicitly (unlike the stream endpoint) — a missing job returns an empty events array via the service layer

---

## 8. Event Emission Flow (job-executor.ts)

The `processProvisioningJob` function is the central orchestrator for event emission:

### Lifecycle

```
1. Job starts → emit 'job.started' with vendor/product/mode data
2. Agent executes → provisioning service calls onEvent() for each intermediate event
3. Agent completes →
   a. If success → emit 'job.completed' with stepCount, eventCount, skillsUsed, hasCredentials
   b. If failure → emit 'job.failed' with error, stepCount, eventCount
```

### Event Sources

Events come from two sources:

1. **Lifecycle events** — emitted directly by `processProvisioningJob`:
   - `job.started` (always first)
   - `job.completed` or `job.failed` (always last)

2. **Agent events** — emitted by the provisioning service via the `onEvent` callback:
   - `card.issued`, `page.navigated`, `form.submitted`, `payment.completed`, `email.received`, `verification.completed`, `credentials.extracted`, `job.progress`

### Callbacks

```typescript
const result = yield* provisioningService.provision(params, { onStep, onEvent })
```

- `onStep`: Accumulates `AgentStep` objects in memory (not persisted as events)
- `onEvent`: Sanitizes and fire-and-forget persists each event to the DB

### Error Handling

If the provisioning service throws, the error is caught and mapped to a failure result:

```typescript
Effect.catchAll((error) =>
  Effect.succeed({
    success: false as const,
    error: formatEffectError(error),
    steps: [] as AgentStep[],
    skillsUsed: [] as string[],
  })
)
```

This ensures `job.failed` is always emitted, even for unexpected errors.

---

## Key Questions — Answers

### Q1: What is the complete taxonomy of `JobEventType` values and what `data` payload does each carry?

11 event types total. 8 carry typed `data` payloads via `JobEventDataMap`, 3 are message-only (`payment.completed`, `email.received`, `verification.completed`). Full table in Section 1 above.

### Q2: What is the SSE wire format — how are `data:` frames structured vs the terminal `event: done` frame?

- **Regular events**: `data: {JSON}\n\n` — unnamed SSE events containing `SseJobEvent` JSON
- **Terminal frame**: `event: done\ndata: {JSON}\n\n` — named SSE event containing `JobDonePayload`
- **Error frame**: `event: error\ndata: {"error":"..."}\n\n` — named SSE event
- **Keepalive**: `: keepalive\n\n` — SSE comment, ignored by clients

Named events (`done`, `error`) require `addEventListener('done', ...)` — they do NOT trigger `EventSource.onmessage`.

### Q3: How does the SSE stream detect terminal states (`completed`, `failed`, `cancelled`)?

Each 250ms poll cycle fetches the job status. When `status ∈ ['completed', 'failed', 'cancelled']`, the stream sends an `event: done` frame with the final status and result, then `Stream.takeUntil` closes the stream. The `cancelled` status is a terminal state even though no `job.cancelled` event type exists — the stream terminates but the last event may be any type.

### Q4: What is the keepalive strategy?

SSE comment frame `: keepalive\n\n` emitted every 250ms poll cycle when no new events exist. Aggressive enough for any proxy timeout. Clients ignore comment frames automatically.

### Q5: How are sensitive fields (card numbers, CVCs) redacted in persisted events?

Three fields redacted via `SENSITIVE_KEYS`: `cardNumber → {{CARD_NUMBER}}`, `cardCvc → {{CARD_CVC}}`, `cardExpiry → {{CARD_EXPIRY}}`. Both camelCase and snake_case are matched via `toCanonical()` normalization. Redaction is recursive — works on nested objects and arrays. Applied **before** persistence (fire-and-forget write to `public.job_events`). The `card.issued` event only exposes `last4` and `limit` by design.

### Q6: What does `SseJobEvent` look like on the wire?

```typescript
interface SseJobEvent {
  type: string           // event type string
  timestamp: string      // ISO-8601 (NOT Date — serialized by JSON.stringify)
  message: string        // human-readable
  data?: Record<string, unknown>  // optional typed payload
}
```

Consumers must parse `timestamp` with `new Date(event.timestamp)` to get a Date object. The `data` field is only present for events in `JobEventDataMap`.

### Q7: What is the polling interval (250ms) and can we rely on it for our UI?

The **server-side** polling interval is `Schedule.spaced(250)` (250ms). This is internal to the SSE endpoint — our client simply reads the stream. Key characteristics:

- **Latency**: Events appear on the wire within ~250ms of being persisted to the database
- **Batching**: Multiple events from one poll cycle are sent as separate frames in the same batch
- **Keepalive**: At least one frame every 250ms (event or comment) — no connection staleness
- **Terminal detection**: Within ~250ms of status change to completed/failed/cancelled

**For our chat UI**: This is excellent — 250ms latency is well within acceptable UX thresholds for real-time streaming updates. We receive events as a standard SSE stream and can map them directly to UI state updates. No need for client-side polling; the server handles it.

---

## Integration Implications

### For our Vercel AI SDK tool

1. **SSE consumption**: Connect to `GET /api/v1/jobs/{id}/events/stream` after creating a job. Use `EventSource` or a fetch-based SSE reader.

2. **Named events matter**: The terminal `done` event uses SSE named events — a raw `EventSource` won't fire `onmessage` for it. Use `.addEventListener('done', ...)` or parse the raw stream manually.

3. **Event-to-UI mapping**: The 11 event types map cleanly to chat progress indicators:
   - `job.started` → "Starting provisioning for {vendorName}..."
   - `job.progress` → "Stage: {stage}"
   - `card.issued` → "Virtual card issued (****{last4})"
   - `page.navigated` → "Navigating to {url}"
   - `form.submitted` → "Submitting form at {url}"
   - `payment.completed` → "Payment completed"
   - `email.received` → "Verification email received"
   - `verification.completed` → "Verification completed"
   - `credentials.extracted` → "Credentials extracted"
   - `job.completed` → "Provisioning complete! ({stepCount} steps, {skillsUsed})"
   - `job.failed` → "Provisioning failed: {error}"

4. **Credential retrieval**: The `credentials.extracted` event only signals presence — actual credentials must be fetched via the separate Credentials API (see doc 02).

5. **Fallback polling**: The non-streaming `GET /api/v1/jobs/{id}/events` endpoint is available if SSE isn't viable (e.g., serverless function timeout constraints). Returns all events in one response.

6. **No client-side polling needed**: The 250ms server-side poll is internal. Our client just holds the SSE connection open and processes frames as they arrive.

7. **Security**: Card details are redacted before persistence. We'll never see raw card numbers, CVCs, or expiry dates in events.

---

## Zod Schemas to Mirror

For our integration layer, we should define these Zod schemas:

```typescript
// Event types
const jobEventTypeSchema = z.enum([
  'job.started', 'job.progress', 'card.issued', 'page.navigated',
  'form.submitted', 'payment.completed', 'email.received',
  'verification.completed', 'credentials.extracted',
  'job.completed', 'job.failed',
])

// SSE event (wire format)
const sseJobEventSchema = z.object({
  type: jobEventTypeSchema,
  timestamp: z.string(),  // ISO-8601
  message: z.string(),
  data: z.record(z.unknown()).optional(),
})

// Terminal done payload
const jobDonePayloadSchema = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']),
  result: z.record(z.unknown()).optional(),
})

// Polling endpoint response
const eventsResponseSchema = z.object({
  events: z.array(sseJobEventSchema),
})
```
