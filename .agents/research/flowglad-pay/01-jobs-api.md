# 01 — Jobs API Surface

Research document for the PayClaw Jobs REST API — the primary integration point for Not A Wrapper.

**Source repo**: `flowglad/provisioning-agent` (cloned to `/tmp/flowglad-pa`)

**Files read**:

| File | Purpose |
|------|---------|
| `packages/app/app/api/v1/jobs/route.ts` | POST (create) and GET (list) handlers |
| `packages/app/app/api/v1/jobs/[id]/route.ts` | GET single job by ID |
| `packages/app/lib/jobs/types.ts` | `Job`, `JobStatus`, `JobMode`, `CreateJobRequest`, `ShippingAddress` types |
| `packages/app/lib/jobs/interface.ts` | `JobService` Effect interface |
| `packages/app/lib/jobs/service.ts` | `JobServiceLive` — pg-boss send, raw SQL reads |
| `packages/app/lib/jobs/pgboss.ts` | App-side `PgBossClientLive` (module-scoped singleton) |
| `packages/app/lib/jobs/errors.ts` | `JobError`, `JobNotFoundError` tagged errors |
| `packages/agent/src/api/pg-boss-init.ts` | Agent-side queue config and init |

---

## Endpoints

### `POST /api/v1/jobs` — Create Job

Creates a provisioning job and enqueues it via pg-boss.

**Authentication**: `X-API-Key` or `Authorization: Bearer <key>` header (shared API key).

#### Request Body (Zod Schema)

```typescript
const createJobSchema = z.object({
  vendorUrl:       z.string().url(),                         // REQUIRED
  vendorName:      z.string().min(1),                        // REQUIRED
  userEmail:       z.string().email(),                       // REQUIRED (temporary — see note)
  product:         z.string().optional(),                    // optional
  maxSpend:        z.number().int().positive(),              // REQUIRED (cents)
  mode:            z.enum(['provision', 'ecommerce']).optional(), // optional
  shippingAddress: shippingAddressSchema.optional(),         // optional (REQUIRED if mode='ecommerce')
  useStaticCard:   z.boolean().optional(),                   // optional
})
```

**`shippingAddress` sub-schema**:

```typescript
const shippingAddressSchema = z.object({
  name:       z.string().min(1),       // REQUIRED
  line1:      z.string().min(1),       // REQUIRED
  line2:      z.string().optional(),   // optional
  city:       z.string().min(1),       // REQUIRED
  state:      z.string().min(1),       // REQUIRED
  postalCode: z.string().min(1),       // REQUIRED
  country:    z.string().min(1),       // REQUIRED
  phone:      z.string().optional(),   // optional
  email:      z.string().email().optional(), // optional
})
```

> **Note on `userEmail`**: This field is temporary. The route has TODO comments indicating that once per-user API keys are implemented, the job owner will be derived from the auth context and `userEmail` will be removed. Today the flow is: `userEmail` in body → `lookupUserByEmail()` → Better Auth user ID → stored as `userId` on the job.

> **Note on `mode`**: The Zod schema only accepts `'provision' | 'ecommerce'`, but the TypeScript type `JobMode` also includes `'signup'`. This is an intentional asymmetry — `'signup'` is an internal mode not exposed via the API.

**Validation rule**: If `mode === 'ecommerce'` and `shippingAddress` is not provided, the endpoint returns a 400 before reaching the Effect pipeline.

#### Response — `201 Created`

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "created"
}
```

The response is minimal — only the pg-boss job UUID and initial status. The full Job object is available via the GET endpoint.

---

### `GET /api/v1/jobs` — List Jobs

Lists jobs ordered by `created_on DESC`.

**Authentication**: Same API key header.

#### Query Parameters

| Param | Type | Default | Constraints | Description |
|-------|------|---------|-------------|-------------|
| `limit` | number | `20` | Clamped to `[1, 100]` | Max jobs to return |
| `status` | string | *(none)* | Must be a valid `JobStatus` | Filter by job state |

**Valid `status` values**: `created`, `retry`, `active`, `completed`, `failed`, `cancelled`

If an invalid status is provided, returns 400 with `{ validValues: [...] }` in `details`.

> **No per-user filtering**: The list endpoint currently returns **all** jobs regardless of user. The route has a comment: *"API keys are currently shared — no per-user filtering. Add per-user filtering before wider beta."* The `JobService.list()` interface does accept an optional `userId` parameter, but the route handler does not pass it through.

#### Response — `200 OK`

```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "startedAt": "2025-01-15T10:30:05.000Z",
      "completedAt": "2025-01-15T10:35:22.000Z",
      "vendorUrl": "https://example.com",
      "vendorName": "Example",
      "userId": "user_abc123",
      "maxSpend": 5000,
      "product": "Pro Plan",
      "mode": "provision",
      "result": {
        "success": true,
        "credentials": "credential_id_xyz",
        "skillsUsed": ["signup", "checkout"]
      },
      "steps": [
        {
          "type": "tool_call",
          "content": "Navigating to signup page",
          "timestamp": "2025-01-15T10:30:10.000Z"
        }
      ]
    }
  ]
}
```

---

### `GET /api/v1/jobs/[id]` — Get Job by ID

Retrieves a single job by its pg-boss UUID.

**Authentication**: Same API key header.

> **No ownership check**: Like the list endpoint, this does not verify the caller owns the job. Comment: *"API keys are currently shared — no per-user ownership check."*

#### Response — `200 OK`

Returns the full `Job` object directly (not wrapped in a container):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "startedAt": "2025-01-15T10:30:05.000Z",
  "vendorUrl": "https://example.com",
  "vendorName": "Example",
  "userId": "user_abc123",
  "maxSpend": 5000,
  "steps": [],
  "result": null
}
```

---

## Full `Job` Type

```typescript
interface Job {
  id: string                    // pg-boss UUID
  status: JobStatus             // 'created' | 'retry' | 'active' | 'completed' | 'failed' | 'cancelled'
  createdAt: Date
  startedAt?: Date
  completedAt?: Date

  // Input (from CreateJobRequest)
  vendorUrl: string
  vendorName: string
  userId: string                // resolved from userEmail via Better Auth
  product?: string
  maxSpend: number
  mode?: JobMode                // 'provision' | 'ecommerce' | 'signup'
  shippingAddress?: ShippingAddress
  useStaticCard?: boolean

  // Output (populated on completion)
  result?: {
    success: boolean
    credentials?: string        // credential ID, not the raw value
    productObtained?: string
    cardUsed?: string
    error?: string              // present on failure
    skillsUsed: string[]
  }

  // Step history (agent execution trace)
  steps: Array<{
    type: 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'skill_injection'
    content: string
    timestamp: Date
  }>
}
```

### Supporting Types

```typescript
type JobStatus = 'created' | 'retry' | 'active' | 'completed' | 'failed' | 'cancelled'

type JobMode = 'provision' | 'ecommerce' | 'signup'

interface ShippingAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
  email?: string
}

interface ProductOrder {
  name: string
  quantity?: number
  url?: string
  sku?: string
}

// CreateJobRequest accepts product as string | ProductOrder,
// but the service normalizes ProductOrder to just its .name string
interface CreateJobRequest {
  vendorUrl: string
  vendorName: string
  userId: string
  product?: string | ProductOrder
  maxSpend: number
  shippingAddress?: ShippingAddress
  mode?: JobMode
  useStaticCard?: boolean
}
```

---

## pg-boss Queue Contract

### Queue Name

```typescript
export const PROVISIONING_QUEUE = 'provisioning'
```

### Queue Configuration

Both the app-side (`packages/app/lib/jobs/pgboss.ts`) and agent-side (`packages/agent/src/api/pg-boss-init.ts`) declare identical queue config:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `retryLimit` | `1` | One retry attempt on failure |
| `retryDelay` | `30` | 30 seconds before retry |
| `expireInSeconds` | `600` | Job must complete within 10 minutes |
| `retentionSeconds` | `2,592,000` | Completed jobs kept for 30 days |

### How Jobs Are Created

The `create()` method calls `boss.send(PROVISIONING_QUEUE, data)` which inserts a row into `pgboss.job` with `state = 'created'`. The returned UUID becomes the job ID.

The data payload stored in `pgboss.job.data` (JSONB) contains:

```typescript
{
  vendorUrl: string,
  vendorName: string,
  userId: string,      // resolved from userEmail
  maxSpend: number,
  product?: string,    // ProductOrder normalized to its .name
  mode?: JobMode,
  shippingAddress?: ShippingAddress,
  useStaticCard?: boolean,
}
```

### How Jobs Are Read

The `get()` and `list()` methods use raw SQL directly on the `pgboss.job` table (not the pg-boss API):

```sql
SELECT j.id, j.name, j.state, j.data, j.output,
       j.created_on, j.started_on, j.completed_on,
       r.result
FROM pgboss.job j
LEFT JOIN pgboss.job_results r ON r.job_id = j.id
WHERE j.name = $1 AND j.id = $2
```

The `pgboss.job_results` table is a custom table (not built into pg-boss) created during init:

```sql
CREATE TABLE IF NOT EXISTS pgboss.job_results (
  job_id UUID PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

This is where the agent worker persists the final `result` payload (success, credentials, error, skillsUsed).

### State Mapping

pg-boss internal `state` values map **1:1** to `JobStatus`:

| pg-boss `state` | `JobStatus` | Description |
|-----------------|-------------|-------------|
| `created` | `created` | Enqueued, waiting for a worker |
| `retry` | `retry` | Failed once, waiting for retry (after 30s delay) |
| `active` | `active` | Currently being processed by the agent worker |
| `completed` | `completed` | Successfully finished |
| `failed` | `failed` | Failed after all retries exhausted |
| `cancelled` | `cancelled` | Explicitly cancelled |

There is no transformation or remapping — `rowToJob()` simply casts `row.state as Job['status']`.

### Job Steps (Output)

The `pgboss.job.output` JSONB column stores the execution trace:

```typescript
output: {
  steps: Array<{
    type: 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'skill_injection'
    content: string
    timestamp: Date | string  // ISO-8601 string in DB, converted to Date by rowToJob
  }>
}
```

---

## Error Handling

### Error Response Shape

All endpoints use a consistent error response shape:

```typescript
{
  error: string,      // human-readable message
  code: string,       // machine-readable code
  details?: object    // optional structured details
}
```

### Error Codes by HTTP Status

| HTTP Status | Code | When | `details` |
|-------------|------|------|-----------|
| `400` | `VALIDATION_ERROR` | Invalid JSON body | — |
| `400` | `VALIDATION_ERROR` | Schema validation failure | `parsed.error.flatten()` (Zod flattened errors) |
| `400` | `VALIDATION_ERROR` | `ecommerce` mode without `shippingAddress` | — |
| `400` | `VALIDATION_ERROR` | Invalid `status` query param | `{ validValues: ['created', 'retry', 'active', 'completed', 'failed', 'cancelled'] }` |
| `401` | `UNAUTHORIZED` | Invalid/missing API key | — |
| `401` | `UNAUTHORIZED` | User not found for email | `"User not found for email: ..."` in `error` field |
| `404` | `NOT_FOUND` | Job ID not found (get-by-ID only) | — |
| `500` | `INTERNAL_ERROR` | pg-boss failure or unhandled error | — |

### Effect Error Tags

The service layer uses Effect tagged errors:

| Tag | Class | Used When |
|-----|-------|-----------|
| `JobError` | `Data.TaggedError('JobError')` | pg-boss send/query failures |
| `JobNotFoundError` | `Data.TaggedError('JobNotFoundError')` | Job ID not in `pgboss.job` table |
| `UnauthorizedError` | (from credentials module) | Invalid API key or user not found |

The route handlers catch these with `Effect.catchTags()` and map them to the appropriate HTTP responses. A final `Effect.catchAll()` ensures any uncaught errors become `500 INTERNAL_ERROR`.

---

## Key Observations for Integration

### What We Need to Send (Minimal)

```typescript
{
  vendorUrl: "https://example-saas.com",
  vendorName: "Example SaaS",
  userEmail: "user@example.com",
  maxSpend: 5000  // cents
}
```

All other fields are optional. `mode` defaults to `undefined` (the agent infers behavior).

### What We Get Back

1. **Create**: `{ jobId, status: "created" }` — the UUID to poll/stream
2. **Poll**: Full `Job` object with `status`, `steps`, and `result` when done
3. **List**: Array of jobs, filterable by status

### Important Gaps

1. **No per-user filtering on list** — currently returns all jobs. We should always use get-by-ID with the jobId we created.
2. **No cancellation endpoint** — there is no `DELETE /api/v1/jobs/[id]` or `POST /api/v1/jobs/[id]/cancel`.
3. **No webhook/callback** — only polling (GET) or SSE streaming (covered in doc 03).
4. **`userEmail` is temporary** — we need to plan for when this becomes auth-context-derived.
5. **`signup` mode not exposed via API** — only `provision` and `ecommerce` are valid in the Zod schema.

### Timing Characteristics

- Jobs expire after **10 minutes** (600s) — our tool must handle this timeout
- Failed jobs retry **once** after **30 seconds**
- Completed jobs are retained for **30 days**
- Between create and active, there's a brief delay while pg-boss dequeues the job

---

## Appendix: Event Types (Preview)

The `types.ts` file also defines job event types (detailed in doc 03):

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

The `JobService.listEvents(jobId)` method reads these from a separate `public.job_events` table (via Drizzle), not from the pg-boss job row itself.
