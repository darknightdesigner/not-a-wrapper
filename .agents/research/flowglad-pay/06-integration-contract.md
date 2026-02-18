# 06 — Integration Contract

Synthesis of research documents 01–05 into a concrete integration specification for building a Vercel AI SDK tool that calls the PayClaw (flowglad/provisioning-agent) API.

**Source repo**: `https://github.com/flowglad/provisioning-agent.git`
**Date**: 2026-02-16
**Contract baseline**: `.agents/research/flowglad-pay/07-jobs-api-contract-baseline.md` (last verified 2026-02-18)

> **Important contract note (2026-02-18)**: For Jobs API create requests (`POST /api/v1/jobs`), top-level `userEmail` and `cardId` are legacy and invalid. Canonical request shapes are direct (`url`) or indirect (`vendor` + `product`) plus common optional fields.

---

## Table of Contents

1. [API Evolution Notes](#1-api-evolution-notes)
2. [Zod Schemas to Define](#2-zod-schemas-to-define)
3. [Happy-Path Flow](#3-happy-path-flow)
4. [HTTP Client Contract](#4-http-client-contract)
5. [SSE Streaming Strategy](#5-sse-streaming-strategy)
6. [Credential Retrieval Flow](#6-credential-retrieval-flow)
7. [Error Handling](#7-error-handling)
8. [Timeout and Cancellation](#8-timeout-and-cancellation)
9. [Event-to-UI Mapping](#9-event-to-ui-mapping)
10. [User Identity Mapping](#10-user-identity-mapping)
11. [Environment Configuration](#11-environment-configuration)
12. [Key Questions Answered](#12-key-questions-answered)

---

## 1. API Evolution Notes

**Important**: The live codebase has evolved since documents 01–05 were written. The following changes were discovered by reading the current source files directly:

### Changed: Job Creation Schema

The `createJobSchema` is now a **Zod discriminated union** with two shapes:

| Shape | Fields | When to Use |
|-------|--------|-------------|
| **Direct** | `url` (product page URL) + common fields | Specific product URL known |
| **Indirect** | `vendor` (origin URL) + `product` (search term) + common fields | Vendor known, product described |

The old flat schema (`vendorUrl`, `vendorName`, `mode`) is replaced. The server infers `BuyRequest.type` from which fields are present.

### Changed: Legacy Client Fields Removed

`POST /api/v1/jobs` no longer validates legacy client-supplied identity/payment fields at the route boundary. The canonical request shapes are direct/indirect buy with common fields (`maxSpend`, optional `shippingAddress`, optional `paymentMethod`, optional `browserProvider`).

### Changed: `mode` Field Removed

The `mode` field (`'provision' | 'ecommerce' | 'signup'`) no longer appears in the API schema. The buy type (direct vs indirect) replaces it. The agent's internal orchestrator still has mode concepts, but they're derived from the buy request, not a client-supplied field.

### Changed: `vendorName` Derived Server-Side

The CLI derives `vendorName` from the URL hostname. The server resolves it from the `BuyRequest`. It is no longer a client-supplied field.

### Changed: `job.started` Event Payload

Now includes `buyType: 'direct' | 'indirect'` instead of the old `mode` field:

```typescript
'job.started': {
  vendorUrl: string
  vendorName: string
  product?: string
  buyType: 'direct' | 'indirect'
}
```

### Added: Auto-Populated Shipping Address

The server auto-populates `shippingAddress` from the user's profile (Better Auth user record) when not provided and the profile has all required fields. This means we can omit shipping for users who have profiles set up.

### Unchanged

- SSE streaming endpoint, wire format, and event taxonomy — identical to doc 03.
- Credentials API — identical to doc 02.
- API key auth header format (`X-API-Key` / Bearer fallback) — identical to doc 04.
- pg-boss queue config (10min expiry, 1 retry) — identical to doc 01.

---

## 2. Zod Schemas to Define

These are the Zod schemas our integration layer should define, mirroring the PayClaw API exactly.

### Tool Input Schema (What the LLM Provides)

```typescript
import { z } from 'zod'

// Our tool's input schema — what the LLM fills in from user intent.
// We normalize this to the PayClaw API's discriminated union internally.
const payClawToolSchema = z.object({
  // Required
  url: z.string().url().describe(
    'The vendor URL. If this is a specific product page, a direct buy is created. ' +
    'If this is a vendor homepage/origin, combine with `product` for an indirect buy.'
  ),
  maxSpend: z.number().int().positive().describe(
    'Maximum spend in cents (e.g., 1500 = $15.00)'
  ),

  // Optional
  product: z.string().optional().describe(
    'Product search description. When provided with a vendor origin URL, triggers ' +
    'indirect buy mode where the agent searches for the product.'
  ),
  shippingAddress: z.object({
    name: z.string().min(1),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }).optional().describe(
    'Shipping address for physical goods. Required for e-commerce purchases.'
  ),
})
```

### PayClaw API Request Schemas (Internal)

```typescript
// Direct buy: specific product page URL
const directBuySchema = z.object({
  url: z.string().url(),
  maxSpend: z.number().int().positive(),
  shippingAddress: shippingAddressSchema.optional(),
  paymentMethod: z.discriminatedUnion('type', [
    z.object({ type: z.literal('brex'), cardId: z.string().min(1) }),
    z.object({ type: z.literal('wex') }),
  ]).optional(),
  browserProvider: z.enum(['local', 'kernel', 'anchor', 'self_hosted']).optional(),
})

// Indirect buy: vendor origin + product search
const indirectBuySchema = z.object({
  vendor: z.string().url(),
  product: z.string().min(1),
  maxSpend: z.number().int().positive(),
  shippingAddress: shippingAddressSchema.optional(),
  paymentMethod: z.discriminatedUnion('type', [
    z.object({ type: z.literal('brex'), cardId: z.string().min(1) }),
    z.object({ type: z.literal('wex') }),
  ]).optional(),
  browserProvider: z.enum(['local', 'kernel', 'anchor', 'self_hosted']).optional(),
})

// The actual API accepts either shape
const createJobApiSchema = z.union([directBuySchema, indirectBuySchema])
```

### API Response Schemas

```typescript
// POST /api/v1/jobs → 201
const createJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal('created'),
})

// GET /api/v1/jobs/:id → 200
const jobStatusSchema = z.enum([
  'created', 'retry', 'active', 'completed', 'failed', 'cancelled',
])

const jobResultSchema = z.object({
  success: z.boolean(),
  credentials: z.string().optional(),
  productObtained: z.string().optional(),
  cardUsed: z.string().optional(),
  error: z.string().optional(),
  skillsUsed: z.array(z.string()),
}).optional()

const jobSchema = z.object({
  id: z.string(),
  status: jobStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  vendorUrl: z.string(),
  vendorName: z.string(),
  product: z.string().optional(),
  maxSpend: z.number(),
  result: jobResultSchema,
  steps: z.array(z.object({
    type: z.enum(['thinking', 'tool_call', 'tool_result', 'error', 'skill_injection']),
    content: z.string(),
    timestamp: z.string(),
  })),
})
```

### SSE Event Schemas

```typescript
const jobEventTypeSchema = z.enum([
  'job.started', 'job.progress', 'card.issued', 'page.navigated',
  'form.submitted', 'payment.completed', 'email.received',
  'verification.completed', 'credentials.extracted',
  'job.completed', 'job.failed',
])

const sseJobEventSchema = z.object({
  type: jobEventTypeSchema,
  timestamp: z.string(),  // ISO-8601
  message: z.string(),
  data: z.record(z.unknown()).optional(),
})

const jobDonePayloadSchema = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']),
  result: z.record(z.unknown()).optional(),
})
```

### Credential Schemas

```typescript
const storedCredentialSchema = z.object({
  id: z.string(),
  userId: z.string(),
  jobId: z.string().nullable(),
  vendorName: z.string(),
  vendorUrl: z.string().nullable(),
  label: z.string(),
  metadata: z.record(z.string()).nullable(),
  createdAt: z.string(),
  accessedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
})

const credentialWithValueSchema = storedCredentialSchema.extend({
  value: z.string(),
})

const credentialsListResponseSchema = z.object({
  credentials: z.array(storedCredentialSchema),
})
```

### API Error Schema

```typescript
const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
})
```

---

## 3. Happy-Path Flow

The minimal happy-path flow for our Vercel AI SDK tool:

```
User prompt: "Sign up for Supabase and get me API keys"
    │
    ▼
1. LLM invokes our PayClaw tool with:
   { url: "https://supabase.com", maxSpend: 1500 }
    │
    ▼
2. Our tool handler:
   a. Determine buy type: no `product` field → direct buy
   b. Build canonical payload from tool input
   d. POST /api/v1/jobs
      X-API-Key: <PAYCLAW_API_KEY>
      Body: { url: "https://supabase.com", maxSpend: 1500 }
    │
    ▼
3. Receive: { jobId: "550e8400-...", status: "created" }
    │
    ▼
4. Connect to SSE stream:
   GET /api/v1/jobs/550e8400-.../events/stream
   X-API-Key: <PAYCLAW_API_KEY>
    │
    ▼
5. Stream events → map to tool call progress updates:
   job.started      → "Starting provisioning for supabase.com..."
   card.issued      → "Virtual card issued (****4242)"
   page.navigated   → "Navigating to signup page"
   form.submitted   → "Submitting signup form"
   email.received   → "Verification email received"
   verification.completed → "Email verification completed"
   credentials.extracted  → "Credentials found!"
   job.completed    → "Provisioning complete (12 steps)"
    │
    ▼
6. On `event: done` with status "completed":
   a. Parse result for credentialIds
   b. GET /api/v1/credentials?userEmail=user@example.com
   c. Filter credentials by jobId matching our job
   d. GET /api/v1/credentials/:id?userEmail=user@example.com for each
   e. Return credential values to the LLM as tool result
    │
    ▼
7. LLM formats and presents credentials to the user
```

### Indirect Buy Flow

```
User prompt: "Buy me a Pro plan subscription on Notion"
    │
    ▼
LLM invokes: { url: "https://notion.so", product: "Pro plan", maxSpend: 2000 }
    │
    ▼
Tool sends: POST /api/v1/jobs
  Body: { vendor: "https://notion.so", product: "Pro plan", maxSpend: 2000 }
    │
    ▼
(same streaming + credential flow)
```

---

## 4. HTTP Client Contract

### Base Configuration

```typescript
interface PayClawConfig {
  apiKey: string        // PAYCLAW_API_KEY env var
  appBaseUrl: string    // PAYCLAW_APP_URL — Next.js app (jobs, credentials)
}
```

### Endpoints Used

| Operation | Method | URL | Auth | Body/Query |
|-----------|--------|-----|------|------------|
| Create job | `POST` | `{appBaseUrl}/api/v1/jobs` | `X-API-Key` | JSON body |
| Get job status | `GET` | `{appBaseUrl}/api/v1/jobs/{id}` | `X-API-Key` | — |
| Stream events | `GET` | `{appBaseUrl}/api/v1/jobs/{id}/events/stream` | `X-API-Key` | — |
| Poll events | `GET` | `{appBaseUrl}/api/v1/jobs/{id}/events` | `X-API-Key` | — |
| List credentials | `GET` | `{appBaseUrl}/api/v1/credentials?userEmail={email}` | `X-API-Key` | — |
| Get credential | `GET` | `{appBaseUrl}/api/v1/credentials/{id}?userEmail={email}` | `X-API-Key` | — |

### Request Headers

```typescript
const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': config.apiKey,
}
```

All endpoints accept the API key via `X-API-Key` header (preferred) or `Authorization: Bearer <key>` (fallback). Use `X-API-Key` consistently.

---

## 5. SSE Streaming Strategy

### Recommended Approach: Fetch-Based SSE Reader

The CLI uses `node:http`/`node:https` because Bun's `fetch()` buffers response bodies. In our Next.js API route context, we have two viable options:

#### Option A: Fetch with ReadableStream (Recommended)

Node.js `fetch()` (undici) supports streaming natively. This is simpler than the CLI's raw `http.get()` approach and works well in Next.js API routes:

```typescript
async function* consumeSSE(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`SSE connect failed: ${response.status}`)

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      if (!frame.trim()) continue

      // Terminal done event
      if (frame.startsWith('event: done')) {
        const dataLine = frame.split(/\r?\n/).find(l => l.startsWith('data: '))
        if (dataLine) {
          yield { type: 'done' as const, payload: JSON.parse(dataLine.slice(6)) as JobDonePayload }
        }
        return
      }

      // Error event
      if (frame.startsWith('event: error')) {
        const dataLine = frame.split(/\r?\n/).find(l => l.startsWith('data: '))
        if (dataLine) {
          throw new Error(JSON.parse(dataLine.slice(6)).error)
        }
        return
      }

      // Regular data event (skip keepalive comments)
      if (frame.startsWith('data: ')) {
        yield { type: 'event' as const, event: JSON.parse(frame.slice(6)) as SseJobEvent }
      }
    }
  }
}
```

#### Option B: Polling Fallback

If SSE streaming is problematic (e.g., serverless function timeout constraints), use the polling endpoint:

```typescript
async function pollEvents(jobId: string, headers: Record<string, string>) {
  const events: SseJobEvent[] = []
  let lastSeenCount = 0

  while (true) {
    // Check job status
    const job = await fetchJob(jobId, headers)

    // Get all events, yield only new ones
    const allEvents = await fetchEvents(jobId, headers)
    for (let i = lastSeenCount; i < allEvents.length; i++) {
      events.push(allEvents[i])
    }
    lastSeenCount = allEvents.length

    // Check for terminal state
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return { status: job.status, result: job.result, events }
    }

    await new Promise(r => setTimeout(r, 2000)) // 2s poll interval
  }
}
```

### Recommendation

**Use Option A (SSE streaming)** as the primary strategy. The PayClaw SSE stream has aggressive 250ms keepalives, which means the connection stays alive through proxies. SSE provides near-real-time event delivery for the chat UI.

**Keep Option B (polling) as a fallback** for environments where SSE doesn't work.

### Integration with Vercel AI SDK Tool Calls

In a Vercel AI SDK tool, we can't hold a long-running SSE connection during a synchronous tool execution. Two strategies:

#### Strategy 1: Fire-and-Forget with Background Polling

```typescript
// In the tool's execute function:
// 1. Create the job
// 2. Return the jobId immediately as the tool result
// 3. Use a separate mechanism (client-side polling, or a webhook) to track progress
```

#### Strategy 2: Streaming Tool with Progress Updates

If the Vercel AI SDK supports streaming tool results (v6+), we can pipe SSE events as progress updates:

```typescript
// In the tool's execute function:
// 1. Create the job
// 2. Connect to SSE stream
// 3. Yield progress updates as events arrive
// 4. Return final result when job.completed arrives
```

**Recommendation**: Strategy 2 is preferred because it gives the user real-time feedback. The tool execution can take 2–8 minutes (typical provisioning), which is within Vercel's function timeout if configured (max 300s on Pro plan). If we exceed the timeout, fall back to Strategy 1.

---

## 6. Credential Retrieval Flow

After job completion, credentials are retrieved separately from the Credentials API.

### When to Retrieve

1. The SSE stream emits `credentials.extracted` event with `{ hasCredentials: true }`.
2. The terminal `event: done` frame arrives with `status: 'completed'`.
3. The job `result` object may contain `credentials` (a credential ID reference string).

### Retrieval Sequence

```typescript
async function retrieveCredentials(
  userEmail: string,
  jobId: string,
  headers: Record<string, string>
): Promise<CredentialWithValue[]> {
  // 1. List all credentials for the user
  const listUrl = `${baseUrl}/api/v1/credentials?userEmail=${encodeURIComponent(userEmail)}`
  const { credentials } = await fetch(listUrl, { headers }).then(r => r.json())

  // 2. Filter by jobId
  const jobCredentials = credentials.filter(c => c.jobId === jobId)

  // 3. Retrieve decrypted values for each
  const withValues = await Promise.all(
    jobCredentials.map(async (cred) => {
      const getUrl = `${baseUrl}/api/v1/credentials/${cred.id}?userEmail=${encodeURIComponent(userEmail)}`
      return fetch(getUrl, { headers }).then(r => r.json()) as Promise<CredentialWithValue>
    })
  )

  return withValues
}
```

### Security Considerations

- Decrypted credential values are returned by the GET-by-ID endpoint. **Never log or persist these values** in our system.
- The `accessedAt` timestamp is updated on every GET-by-ID call — the credential owner can see when their credentials were last accessed.
- Credential values should be presented to the user in the chat and then discarded from memory. Do not store them in Convex or any other persistence layer.
- The AAD encryption means even if our API key is compromised, an attacker needs the correct `userId` to decrypt — but they could derive it from the `userEmail`, so the API key is the primary security boundary.

---

## 7. Error Handling

### HTTP Error Matrix

| HTTP Status | Code | Trigger | Our Response |
|-------------|------|---------|--------------|
| `400` | `VALIDATION_ERROR` | Invalid request body, bad params | Show validation details to user; fix tool input |
| `401` | `UNAUTHORIZED` | Bad API key or unknown userEmail | Log error; inform user of auth issue. Check PAYCLAW_API_KEY and user registration. |
| `404` | `NOT_FOUND` | Job ID not found, credential not found | Stale reference; re-query or inform user |
| `500` | `INTERNAL_ERROR` | pg-boss failure, DB error | Retry once after 5s; if still failing, inform user |

### SSE Stream Error Handling

| Error | Detection | Response |
|-------|-----------|----------|
| Connection refused | `fetch()` throws | Retry once after 2s; fall back to polling |
| Non-200 status | Response status check | Parse error body; handle per HTTP error matrix |
| Parse error | JSON.parse throws | Log malformed frame; skip and continue |
| `event: error` frame | Named SSE event | Extract error message; terminate stream; report to user |
| Connection dropped | Stream ends without `done` | Fall back to polling with GET /events |

### Job-Level Failure States

| State | How Detected | User-Facing Message |
|-------|-------------|---------------------|
| `job.failed` event | SSE event with `data.error` | "Provisioning failed: {error}" |
| Job status `failed` | Done frame or status poll | "The provisioning job failed. {result.error}" |
| Job status `cancelled` | Done frame or status poll | "The provisioning job was cancelled." |
| Job expired (10min) | Status becomes `failed` after expiry | "The job timed out after 10 minutes." |
| `result.success === false` | Job completed but with failure result | "Provisioning completed but was unsuccessful: {result.error}" |

### Error Response Shape

All PayClaw endpoints return errors in this shape:

```typescript
interface ApiError {
  error: string        // human-readable message
  code: string         // machine-readable code: VALIDATION_ERROR, UNAUTHORIZED, NOT_FOUND, INTERNAL_ERROR
  details?: unknown    // optional structured details (e.g., Zod flattened errors)
}
```

---

## 8. Timeout and Cancellation

### Job Timeout

- Jobs expire after **600 seconds (10 minutes)** via pg-boss `expireInSeconds`.
- When expired, pg-boss marks the job as `failed`.
- Failed jobs are retried **once** after a 30-second delay (`retryLimit: 1`, `retryDelay: 30`).
- Total maximum wall-clock time: **~10.5 minutes** (10min + 30s retry delay + 10min retry).

### Our Tool's Timeout Strategy

```typescript
const TOOL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes — match job expiry

async function executeWithTimeout(jobId: string, signal: AbortSignal) {
  const timeout = setTimeout(() => signal.abort(), TOOL_TIMEOUT_MS)
  try {
    // ... SSE consumption loop
  } finally {
    clearTimeout(timeout)
  }
}
```

### Cancellation

**There is no cancellation endpoint** in the PayClaw API. If the user wants to cancel:

1. We can disconnect from the SSE stream (our side only — the job continues running).
2. We should inform the user: "The provisioning job is still running on the server. There is no way to cancel it once started."
3. The job will either complete or expire after 10 minutes.

### Vercel Function Timeout Considerations

| Plan | Max Duration | Fits? |
|------|-------------|-------|
| Hobby | 60s | No — most jobs take 2–8 min |
| Pro | 300s (5 min) | Marginal — covers fast jobs |
| Enterprise | 900s (15 min) | Yes — covers all jobs |

**Recommendation**: For Pro plan, use a background job pattern (create job → return jobId → client polls). For Enterprise, the streaming tool approach works directly.

---

## 9. Event-to-UI Mapping

### Chat Progress Messages

Map each `SseJobEvent.type` to a user-facing progress message for the chat UI:

```typescript
function eventToProgressMessage(event: SseJobEvent): string {
  switch (event.type) {
    case 'job.started': {
      const d = event.data as { vendorName: string; product?: string }
      return d.product
        ? `Starting provisioning for ${d.vendorName} — ${d.product}...`
        : `Starting provisioning for ${d.vendorName}...`
    }
    case 'job.progress':
      return `${(event.data as { stage: string }).stage}`
    case 'card.issued': {
      const d = event.data as { last4: string; limit: number }
      return `Virtual card issued (****${d.last4}, limit: $${(d.limit / 100).toFixed(2)})`
    }
    case 'page.navigated':
      return `Navigating to ${(event.data as { url: string }).url}`
    case 'form.submitted':
      return `Submitting form at ${(event.data as { url: string }).url}`
    case 'payment.completed':
      return 'Payment completed'
    case 'email.received':
      return 'Verification email received'
    case 'verification.completed':
      return 'Verification completed'
    case 'credentials.extracted':
      return (event.data as { hasCredentials: boolean }).hasCredentials
        ? 'Credentials extracted successfully'
        : 'Checking for credentials...'
    case 'job.completed': {
      const d = event.data as { stepCount: number; skillsUsed: string[]; hasCredentials: boolean }
      return d.hasCredentials
        ? `Provisioning complete! (${d.stepCount} steps) — credentials available`
        : `Provisioning complete (${d.stepCount} steps)`
    }
    case 'job.failed':
      return `Provisioning failed: ${(event.data as { error: string }).error}`
    default:
      return event.message
  }
}
```

### Event Categories for UI Rendering

| Category | Events | UI Treatment |
|----------|--------|-------------|
| **Lifecycle** | `job.started`, `job.completed`, `job.failed` | Bold/prominent, different colors |
| **Navigation** | `page.navigated`, `form.submitted` | Dim/subtle, real-time progress |
| **Financial** | `card.issued`, `payment.completed` | Yellow/highlight, important info |
| **Verification** | `email.received`, `verification.completed` | Standard progress |
| **Result** | `credentials.extracted` | Green/success indicator |
| **Progress** | `job.progress` | Intermediate status updates |

---

## 10. User Identity Mapping

### Identity Chain

```
Not A Wrapper (Clerk)          PayClaw (Better Auth)
─────────────────────          ─────────────────────
Clerk user.email  ───────────→ userEmail param (body or query)
                               │
                               ▼
                    lookupUserByEmail(email)
                    SELECT id FROM better_auth_user
                    WHERE email = userEmail
                               │
                               ▼
                    Better Auth userId
                    (job ownership, credential AAD)
```

### Prerequisites

1. **User must exist in PayClaw's Better Auth database**. There is no auto-provisioning API. If the user's Clerk email doesn't match a Better Auth account, the request fails with `401 UNAUTHORIZED: "User not found for email: ..."`.

2. **Email must match exactly**. The lookup is `WHERE email = ?` — case sensitivity depends on the DB collation (typically case-insensitive for PostgreSQL).

3. **Email stability**. If a user changes their Clerk email, the PayClaw lookup breaks. We should use the primary email from the Clerk user object.

### Onboarding Gap

Before a user can use PayClaw through Not A Wrapper, they need a Better Auth account with the same email. Options to address:

| Option | Approach | Complexity |
|--------|----------|------------|
| **Manual** | User creates a PayClaw account separately | Low — but bad UX |
| **Registration API** | We call a PayClaw registration endpoint | Medium — endpoint doesn't exist yet |
| **Shared DB** | We write to Better Auth user table directly | Bad — tight coupling |
| **JWT federation** | PayClaw trusts Clerk JWTs | Complex — requires PayClaw changes |

**Current recommendation**: For the initial integration, assume users have pre-existing PayClaw accounts. Track the per-user API key migration TODOs — when that lands, the identity model will change and the `userEmail` parameter will be removed.

### Per-User API Key Migration (Planned)

When PayClaw migrates to per-user API keys:

1. `userEmail` is removed from all endpoints.
2. Each user has their own API key that identifies them.
3. We'll need to store per-user PayClaw API keys in Convex (encrypted with our AES-256-GCM key).
4. The `X-API-Key` header will carry the user-specific key instead of the shared key.
5. Job list/get endpoints will add per-user filtering.

---

## 11. Environment Configuration

### Required Environment Variables

```bash
# PayClaw API key — shared key for all API calls
PAYCLAW_API_KEY=sk_...

# PayClaw app base URL — Next.js app serving the REST API
PAYCLAW_APP_URL=https://app.payclaw.example.com
```

### Configuration Resolution in Our Tool

```typescript
function getPayClawConfig(): PayClawConfig {
  const apiKey = process.env.PAYCLAW_API_KEY
  if (!apiKey) throw new Error('PAYCLAW_API_KEY not configured')

  const appBaseUrl = process.env.PAYCLAW_APP_URL
  if (!appBaseUrl) throw new Error('PAYCLAW_APP_URL not configured')

  return {
    apiKey,
    appBaseUrl: appBaseUrl.replace(/\/$/, ''),
  }
}
```

---

## 12. Key Questions Answered

### Q1: What Zod schemas should our tool call define?

**See Section 2 above for complete schemas.** The key insight is that the PayClaw API now uses a discriminated union (direct vs indirect buy), not a flat schema. Our tool's LLM-facing schema should be simpler — just `url`, `maxSpend`, and optional `product` + `shippingAddress`. We normalize to the API's shape internally by:

- If `product` is provided → indirect buy (`vendor` = URL origin, `product` = search term)
- If `product` is omitted → direct buy (`url` = full URL)

### Q2: What is the minimal happy-path flow?

**Create job → SSE stream events → retrieve credentials.** See Section 3. Minimum 3 API calls:

1. `POST /api/v1/jobs` — create the job
2. `GET /api/v1/jobs/{id}/events/stream` — consume the SSE stream until `event: done`
3. `GET /api/v1/credentials?userEmail={email}` + `GET /api/v1/credentials/{id}?userEmail={email}` — retrieve credentials (only if `hasCredentials: true` in the done result)

### Q3: How should we handle long-running jobs in a chat context?

**SSE streaming is preferred** (see Section 5). The 250ms server-side poll interval provides excellent real-time UX. Two strategies depending on Vercel plan:

- **Pro plan (300s limit)**: Return jobId immediately, use client-side polling via a separate API route.
- **Enterprise (900s limit)**: Stream events directly through the tool execution.

For our current setup, **Strategy 1 (fire-and-forget + background tracking)** is safest. The tool creates the job and returns the jobId. A separate client-side mechanism polls for updates and displays them in the chat.

### Q4: What error states need specific handling?

**Four categories** (see Section 7):

1. **HTTP errors**: 400 (fix input), 401 (check API key/user), 404 (stale reference), 500 (retry once)
2. **SSE errors**: Connection failure (retry → poll fallback), parse errors (skip frame), error event (report)
3. **Job failures**: `job.failed` event, expired job, `result.success === false`
4. **Timeout**: Our tool should timeout at 10 minutes (matching pg-boss expiry)

### Q5: How do we map PayClaw job events to Vercel AI SDK tool call progress updates?

**See Section 9.** Each of the 11 event types maps to a human-readable progress message. The `message` field on each event already provides a description, but we can produce better messages by interpreting the typed `data` payload.

For Vercel AI SDK integration, events can be forwarded as:
- **Tool streaming progress** (if the SDK supports it in our tool implementation)
- **Separate data stream annotations** sent alongside the main AI response
- **Client-side polling results** rendered as status updates in the chat

### Q6: What timeout/cancellation strategy do we need?

**Timeout**: 10 minutes, matching pg-boss `expireInSeconds`. See Section 8.

**Cancellation**: Not available — no cancel endpoint exists. If the user asks to cancel, we disconnect from the SSE stream but the job continues server-side until completion or 10-minute expiry.

### Q7: Should we mirror the CLI's sse-client.ts approach or build our own?

**Build our own using `fetch()` with `ReadableStream`** (see Section 5, Option A). The CLI uses `node:http` because Bun's `fetch()` buffers — but Node.js `fetch()` (undici) in our Next.js runtime streams correctly. Our approach is simpler and more idiomatic for a Next.js environment.

The key parsing logic from the CLI's `sse-client.ts` should be adapted:
- Split on `\r?\n\r?\n` for frame boundaries
- Check for `event: done` named events (terminal)
- Check for `event: error` named events
- Parse `data: ` prefix for JSON payloads
- Skip keepalive comments (`: keepalive`)

### Q8: What user identity mapping is needed between Clerk and Better Auth?

**See Section 10.** We pass the Clerk user's email as `userEmail`. PayClaw resolves it to a Better Auth `userId` via a simple DB lookup. The user must already exist in PayClaw's Better Auth database — there's no auto-provisioning.

**Key risk**: If the Clerk email doesn't match a Better Auth user, the request fails with 401. We need to handle this gracefully and potentially implement a registration flow in the future.

---

## Appendix: Reference Client Analysis (CLI)

The CLI (`packages/cli/src/cli.ts`) serves as the canonical reference client. Key patterns extracted:

### Job Creation Pattern

```typescript
// Determine buy type from user input
const body = {
  userEmail,
  cardId,
  maxSpend,
  ...(shippingAddress ? { shippingAddress } : {}),
}
if (product) {
  body.vendor = new URL(vendorUrl).origin  // indirect: vendor origin
  body.product = product
} else {
  body.url = vendorUrl  // direct: full URL
}

const result = await apiRequest('POST', '/v1/jobs', body)
// result: { jobId: string, status: string }
```

### SSE Consumption Pattern

```typescript
const status = await consumeJobEventStream(
  `${endpoint}/v1/jobs/${jobId}/events/stream`,
  { 'X-API-Key': apiKey },
  {
    onEvent: (event) => { /* process event */ },
    onDone: (payload) => { /* terminal — job finished */ },
  }
)
// status: 'completed' | 'failed' | 'cancelled' | 'unknown'
```

### Credential Retrieval Pattern

```typescript
// CLI uses a separate base URL for credentials (Next.js app, not agent API)
// Includes userEmail as query parameter
const credentials = await appApiRequest('GET', '/api/v1/credentials')
// For specific credential:
const credential = await appApiRequest('GET', `/api/v1/credentials/${id}`)
```

### Two API Base URLs

The CLI distinguishes between:
1. **Agent API** (`endpoint`): For jobs and events (`/v1/jobs/...`)
2. **App API** (`appEndpoint`): For credentials (`/api/v1/credentials/...`)

In the current architecture, both are served by the same Next.js app, but the CLI maintains the distinction. **For our integration, we can use a single base URL** (`PAYCLAW_APP_URL`) for all endpoints since the Next.js app serves both jobs and credentials APIs.

---

## Summary: What We Need to Build

### Files to Create

| File | Purpose |
|------|---------|
| `lib/payclaw/config.ts` | Configuration: env vars, base URLs, API key |
| `lib/payclaw/client.ts` | HTTP client: job creation, status polling, credential retrieval |
| `lib/payclaw/sse.ts` | SSE consumer: fetch-based stream reader |
| `lib/payclaw/schemas.ts` | Zod schemas mirroring PayClaw API types |
| `lib/payclaw/tool.ts` | Vercel AI SDK tool definition |
| `app/api/payclaw/status/route.ts` | Status polling endpoint for client-side updates (if needed) |

### Integration Points

| Our Code | PayClaw API | Protocol |
|----------|------------|----------|
| Tool execute → | POST /api/v1/jobs | HTTPS + JSON |
| SSE reader → | GET /api/v1/jobs/{id}/events/stream | SSE |
| Polling fallback → | GET /api/v1/jobs/{id} | HTTPS + JSON |
| Credential fetch → | GET /api/v1/credentials | HTTPS + JSON |
| Credential get → | GET /api/v1/credentials/{id} | HTTPS + JSON |

### Authentication Flow

```
PAYCLAW_API_KEY env var → pass as X-API-Key header
```

---

*Source files analyzed for this document*:
- `packages/agent/src/api/types.ts` — Canonical type definitions (Job, JobEvent, SseJobEvent, JobDonePayload)
- `packages/app/lib/jobs/types.ts` — App-side types (BuyRequest, CreateJobRequest, ShippingAddress)
- `packages/app/lib/credentials/interface.ts` — Credential types (StoredCredential, CredentialWithValue)
- `packages/app/app/api/v1/jobs/route.ts` — Job creation and list endpoint (current discriminated union schema)
- `packages/cli/src/cli.ts` — CLI reference client (buy command, SSE streaming, credential retrieval)
- `packages/cli/src/sse-client.ts` — SSE consumer implementation (node:http streaming)
- `packages/cli/src/types.ts` — CLI-side type definitions (SseJobEvent, JobDonePayload, SseConnectionError)
- All source files from documents 01–05 (synthesized into this contract)
