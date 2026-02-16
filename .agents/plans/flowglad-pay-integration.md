# Flowglad Pay Integration — Demo Implementation Plan

> **Status**: Ready for Implementation
> **Priority**: P2 — Experimental / Demo
> **Scope**: Minimal demo of a Flowglad Pay tool call buying a product in chat
> **Date**: February 16, 2026
> **Research**: `.agents/research/flowglad-pay/` (documents 00–06)
> **Architecture Reference**: `.agents/plans/flowglad-pay-architecture.md`
> **Tool Infrastructure Reference**: `.agents/plans/tool-calling-infrastructure.md`
> **Gold Standard**: `app/api/chat/route.ts`, `lib/tools/third-party.ts`

---

## How to Use This Plan

This plan is structured for AI agent step-by-step execution. Each phase is self-contained with:

- **Context to load** — files to read before starting the phase
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete
- **Rollback** — how to reverse the phase cleanly

Phases must be executed in order (0 → 1 → 2 → 3 → 4). Each phase is independently testable and shippable.

**This is an experimental integration.** Every change must be:
1. Minimal — avoid touching core infrastructure unless necessary
2. Reversible — documented rollback instructions per phase
3. Isolated — contained in `lib/payclaw/` where possible

---

## Guiding Principles

1. **Demo-first**: The goal is a working demo showing a Flowglad Pay tool call in chat. Not production-grade.
2. **No Convex changes**: Avoid modifying `convex/schema.ts` or adding Convex functions. All state is ephemeral.
3. **Follow industry standards**: The tool integrates as a standard Vercel AI SDK `tool()` call, fitting into our existing multi-tool Layer architecture (Layers 1-3 are search/MCP; this is Layer 4: Platform Tools).
4. **Hardcoded auth**: Use the `user_name` environment variable for the PayClaw `userEmail` parameter. This is temporary and will change when per-user API keys land.
5. **Expect breakage**: The PayClaw API is experimental and evolving. Our schemas track `main` as source of truth and should be easy to update.

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth model | Hardcoded `user_name` env var | Temporary — per-user keys coming later |
| API schema tracking | Track `main` branch of `flowglad/provisioning-agent` | Source of truth; expect breaking changes |
| Convex changes | None | Demo scope — avoid schema churn |
| Credential display | Return in tool result, render in chat | Simplest path; credentials are ephemeral |
| Progress UX | Summarize SSE stream every ~30 seconds | Balance between real-time and noise |
| Long-running jobs | Open research question | Needs deeper analysis (see Open Questions) |
| Cancellation | Not supported (no API endpoint) | Inform user; job runs until completion or 10-min expiry |
| Partial failure | Report what succeeded + what failed in plain language | Demo-friendly; don't over-engineer error states |
| Credential expiration | Skip enforcement | `expiresAt` stored but not enforced by PayClaw; acceptable for demo |
| Rate limits | None known | Single-user demo; revisit if scaling |
| Max spend control | User-configurable via tool params | Flowglad Pay enforces the limit on their side |

---

## Environment Variables

Already stubbed in `.env.example` (lines 93-96):

```bash
# Experimental Flowglad Pay API (Agentic Payments)
# user_name=           # Email for PayClaw userEmail param (hardcoded for demo)
# ApiKey=              # Shared PayClaw API key
```

We will add two more:

```bash
# PAYCLAW_APP_URL=     # PayClaw app base URL (e.g., https://app.payclaw.example.com)
# PAYCLAW_CARD_ID=     # Default card ID for provisioning jobs (required by API)
```

> **Rollback**: Remove the env vars from `.env.local` and revert any `.env.example` additions.

---

## Architecture: How This Fits Into Our Tool Infrastructure

Our tool system has three existing layers, coordinated by `app/api/chat/route.ts`:

```
Layer 1 — Built-in Provider Tools    (lib/tools/provider.ts)    — Search via AI SDK providers
Layer 2 — Third-Party Tools          (lib/tools/third-party.ts) — Exa search fallback
Layer 3 — MCP Tools                  (lib/mcp/load-tools.ts)    — User-configured MCP servers
```

Flowglad Pay adds a new layer:

```
Layer 4 — Platform Tools             (lib/tools/platform.ts)    — Flowglad Pay (experimental)
```

**Coordination model** (identical to Layers 1-3):
- `route.ts` imports and merges Layer 4 tools into `allTools` for `streamText()`
- Layer 4 tools follow the same `tool()` + `ToolMetadata` pattern as Layer 2 (Exa)
- Layer 4 is gated on: `isAuthenticated && capabilities.platformTools` (new capability flag)
- No changes to Layers 1-3 or MCP infrastructure

**Merge order** in `route.ts`:
```typescript
const allTools = { ...searchTools, ...mcpTools, ...platformTools } as ToolSet
```

Platform tools have lowest priority (MCP wins on collision). This is intentional — user-configured MCP tools should always override platform tools.

---

## Open Questions (Requiring Further Research)

### Long-Running Job Handling
> **Status**: Needs deeper analysis before Phase 3

PayClaw provisioning jobs take 2-8 minutes. Our `maxDuration = 60` in `route.ts` (Vercel function timeout) is far too short to hold an SSE connection for the full duration.

**This is the critical architectural question for this integration.** We need to research how to handle long-running async tool results within the Vercel AI SDK without breaking industry standards.

Possible approaches to investigate:
- **Vercel AI SDK `experimental_toolCallStreaming`** — can tools stream partial results?
- **Two-phase tool pattern** — tool returns immediately with a "job started" message; a separate mechanism updates the chat with progress
- **Background functions** — Vercel Background Functions or a dedicated worker process
- **Client-side polling** — a `useEffect` hook polls a status API route every N seconds
- **Convex real-time subscription** — if we allow a Convex table, Convex's reactivity could push updates

**For the demo**: We will use a pragmatic approach — the tool creates the job and immediately returns a confirmation. Progress updates are handled via a periodic summary mechanism (every ~30 seconds) that the user sees in the chat stream. The exact implementation depends on the research outcome.

**Action item**: Research this before starting Phase 3. Write findings to `.agents/context/research/long-running-tool-calls.md`.

### Per-User API Key Migration
> **Status**: Follow up with Flowglad team

PayClaw plans to migrate from a shared `API_KEY` to per-user API keys. When this happens:
- `userEmail` parameter will be removed from all endpoints
- User identity will be derived from the API key itself
- We'll need to store per-user PayClaw API keys (encrypted in Convex)

**Action item**: Follow up with the Flowglad team periodically as the product evolves. No specific timeline exists.

### User Provisioning
> **Status**: Deferred (demo uses pre-existing account)

For the demo, we assume our `user_name` email maps to an existing Better Auth account in PayClaw. If the email doesn't exist, the API returns 401. We should verify this early in Phase 1.

---

## Phase 0: Schemas, Types, and Configuration

**Goal**: Establish the contract layer. Pure types, zero runtime behavior.

**Context to load**:
- `.agents/research/flowglad-pay/06-integration-contract.md` — Sections 2 (Zod Schemas) and 11 (Environment Config)
- `.agents/research/flowglad-pay/01-jobs-api.md` — Request/response shapes
- `lib/config.ts` — Pattern for centralized constants
- `.env.example` — Existing env var stubs

### Steps

#### 0.1 Create `lib/payclaw/config.ts`

Configuration loader for PayClaw environment variables. Follows the pattern in `lib/config.ts`.

```typescript
// lib/payclaw/config.ts

/**
 * PayClaw (Flowglad Pay) configuration.
 *
 * EXPERIMENTAL: This integration is a demo. The API is in active development
 * and breaking changes are expected. Track `main` at:
 * https://github.com/flowglad/provisioning-agent
 *
 * Auth model: Shared API key + hardcoded userEmail (from `user_name` env var).
 * This will change when per-user API keys are implemented.
 *
 * TEMPORARY: The `user_name` env var is a hardcoded email for demo purposes.
 * When per-user API keys land, this will be replaced with auth-context-derived
 * user identity. See: .agents/plans/flowglad-pay-integration.md (Open Questions).
 */

export interface PayClawConfig {
  apiKey: string
  appBaseUrl: string
  cardId: string
  userEmail: string
}

/**
 * Load and validate PayClaw configuration from environment variables.
 *
 * Returns null if any required variable is missing — allows graceful
 * degradation (tool simply isn't registered) rather than crashing the app.
 */
export function getPayClawConfig(): PayClawConfig | null {
  const apiKey = process.env.ApiKey
  const appBaseUrl = process.env.PAYCLAW_APP_URL
  const cardId = process.env.PAYCLAW_CARD_ID
  const userEmail = process.env.user_name

  if (!apiKey || !appBaseUrl || !cardId || !userEmail) {
    return null
  }

  return {
    apiKey,
    appBaseUrl: appBaseUrl.replace(/\/$/, ''), // strip trailing slash
    cardId,
    userEmail,
  }
}
```

> **Note on env var names**: `ApiKey` and `user_name` are the existing variable names in `.env.example` (lines 95-96). They use non-standard casing because they match what the Flowglad team provided. We keep them as-is to avoid confusion during the experimental phase.

#### 0.2 Create `lib/payclaw/schemas.ts`

Zod schemas mirroring the PayClaw API contracts. Based on doc 06 Section 2, updated for the current discriminated union API.

```typescript
// lib/payclaw/schemas.ts

import { z } from 'zod'

// ── Tool Input Schema (what the LLM fills in) ──────────────

export const payClawToolInputSchema = z.object({
  url: z.string().url().describe(
    'The vendor URL. If this is a specific product page, a direct buy is created. ' +
    'If this is a vendor homepage/origin, combine with `product` for an indirect buy.'
  ),
  maxSpend: z.number().int().positive().describe(
    'Maximum spend in cents (e.g., 1500 = $15.00). Flowglad Pay will ensure ' +
    'the agent stays within this budget.'
  ),
  product: z.string().optional().describe(
    'Product search description. When provided with a vendor origin URL, triggers ' +
    'indirect buy mode where the agent searches for the product.'
  ),
})

// ── API Request Schemas (internal — sent to PayClaw) ────────

export const shippingAddressSchema = z.object({
  name: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
})

// Direct buy: specific product page URL
export const directBuyRequestSchema = z.object({
  url: z.string().url(),
  userEmail: z.string().email(),
  cardId: z.string().min(1),
  maxSpend: z.number().int().positive(),
  shippingAddress: shippingAddressSchema.optional(),
})

// Indirect buy: vendor origin + product search
export const indirectBuyRequestSchema = z.object({
  vendor: z.string().url(),
  product: z.string().min(1),
  userEmail: z.string().email(),
  cardId: z.string().min(1),
  maxSpend: z.number().int().positive(),
  shippingAddress: shippingAddressSchema.optional(),
})

// ── API Response Schemas ────────────────────────────────────

export const createJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal('created'),
})

export const jobStatusValues = [
  'created', 'retry', 'active', 'completed', 'failed', 'cancelled',
] as const

export const jobStatusSchema = z.enum(jobStatusValues)

export const jobResultSchema = z.object({
  success: z.boolean(),
  credentials: z.string().optional(),
  productObtained: z.string().optional(),
  cardUsed: z.string().optional(),
  error: z.string().optional(),
  skillsUsed: z.array(z.string()),
}).nullable().optional()

export const jobSchema = z.object({
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
})

// ── SSE Event Schemas ───────────────────────────────────────

export const jobEventTypes = [
  'job.started', 'job.progress', 'card.issued', 'page.navigated',
  'form.submitted', 'payment.completed', 'email.received',
  'verification.completed', 'credentials.extracted',
  'job.completed', 'job.failed',
] as const

export const jobEventTypeSchema = z.enum(jobEventTypes)

export const sseJobEventSchema = z.object({
  type: jobEventTypeSchema,
  timestamp: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
})

export const jobDonePayloadSchema = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']),
  result: z.record(z.unknown()).optional(),
})

// ── Credential Schemas ──────────────────────────────────────

export const storedCredentialSchema = z.object({
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

export const credentialWithValueSchema = storedCredentialSchema.extend({
  value: z.string(),
})

export const credentialsListResponseSchema = z.object({
  credentials: z.array(storedCredentialSchema),
})

// ── API Error Schema ────────────────────────────────────────

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
})

// ── Inferred Types ──────────────────────────────────────────

export type PayClawToolInput = z.infer<typeof payClawToolInputSchema>
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>
export type JobStatus = z.infer<typeof jobStatusSchema>
export type Job = z.infer<typeof jobSchema>
export type SseJobEvent = z.infer<typeof sseJobEventSchema>
export type JobDonePayload = z.infer<typeof jobDonePayloadSchema>
export type CredentialWithValue = z.infer<typeof credentialWithValueSchema>
export type StoredCredential = z.infer<typeof storedCredentialSchema>
export type ApiError = z.infer<typeof apiErrorSchema>
export type ShippingAddress = z.infer<typeof shippingAddressSchema>
```

#### 0.3 Update `.env.example`

Add the two new env vars to the existing Flowglad Pay section.

```bash
# Experimental Flowglad Pay API (Agentic Payments)
# user_name=                    # Email for PayClaw userEmail param (hardcoded for demo)
# ApiKey=                       # Shared PayClaw API key
# PAYCLAW_APP_URL=              # PayClaw app base URL (e.g., https://app.payclaw.example.com)
# PAYCLAW_CARD_ID=              # Default card ID for provisioning jobs
```

### Verify

- `bun run typecheck` passes
- `bun run lint` passes
- No runtime behavior — purely additive types

### Rollback

```bash
rm -rf lib/payclaw/
# Revert .env.example changes (restore lines 93-96 to original)
```

---

## Phase 1: HTTP Client

**Goal**: A thin, tested HTTP client that can create jobs, poll status, and retrieve credentials.

**Context to load**:
- `lib/payclaw/config.ts` (Phase 0)
- `lib/payclaw/schemas.ts` (Phase 0)
- `.agents/research/flowglad-pay/01-jobs-api.md` — Job endpoint contracts
- `.agents/research/flowglad-pay/02-credentials-api.md` — Credential endpoint contracts
- `.agents/research/flowglad-pay/04-auth-model.md` — Auth header format
- `lib/tools/third-party.ts` — Gold standard for HTTP calls in tools (Exa pattern)

### Steps

#### 1.1 Create `lib/payclaw/client.ts`

HTTP client with methods for each PayClaw endpoint. Uses standard `fetch()`.

Key behaviors:
- All methods accept a `PayClawConfig` (from Phase 0) — no singleton, no global state
- Responses are validated through Zod schemas (parse, not safeParse — throw on invalid)
- Error responses are parsed into structured `ApiError` objects
- The client normalizes our tool input (flat `url` + optional `product`) into PayClaw's discriminated union (direct vs indirect buy)
- `userEmail` and `cardId` are injected from config, never exposed to the LLM

```typescript
// lib/payclaw/client.ts — sketch of the public API

import type { PayClawConfig } from './config'
import type { PayClawToolInput, CreateJobResponse, Job, SseJobEvent, CredentialWithValue } from './schemas'

/** Standard headers for all PayClaw API calls */
function makeHeaders(config: PayClawConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
  }
}

/** Create a provisioning job. Returns { jobId, status: 'created' }. */
export async function createJob(
  input: PayClawToolInput,
  config: PayClawConfig,
): Promise<CreateJobResponse> { /* ... */ }

/** Get a job by ID. Returns the full Job object. */
export async function getJob(
  jobId: string,
  config: PayClawConfig,
): Promise<Job> { /* ... */ }

/** Get all events for a job (polling endpoint). */
export async function getJobEvents(
  jobId: string,
  config: PayClawConfig,
): Promise<SseJobEvent[]> { /* ... */ }

/** List credentials for the configured user, optionally filtered by jobId. */
export async function listCredentials(
  config: PayClawConfig,
  jobId?: string,
): Promise<CredentialWithValue[]> { /* ... */ }
```

**Direct vs Indirect buy logic** (inside `createJob`):

```typescript
// If product is provided → indirect buy (vendor origin + search)
// If product is omitted → direct buy (full URL)
const body = input.product
  ? {
      vendor: new URL(input.url).origin,
      product: input.product,
      userEmail: config.userEmail,
      cardId: config.cardId,
      maxSpend: input.maxSpend,
    }
  : {
      url: input.url,
      userEmail: config.userEmail,
      cardId: config.cardId,
      maxSpend: input.maxSpend,
    }
```

**Error handling pattern** (matching `lib/tools/third-party.ts`):

```typescript
export class PayClawApiError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, body: ApiError) {
    super(body.error)
    this.name = 'PayClawApiError'
    this.statusCode = statusCode
    this.code = body.code
    this.details = body.details
  }
}
```

#### 1.2 Verify email passes through

Before proceeding, manually test that the configured `user_name` email resolves correctly in PayClaw:

```bash
curl -X POST "${PAYCLAW_APP_URL}/api/v1/jobs" \
  -H "X-API-Key: ${ApiKey}" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","userEmail":"'${user_name}'","cardId":"'${PAYCLAW_CARD_ID}'","maxSpend":100}'
```

Expected: `201 Created` with `{ jobId, status: "created" }`.
If `401 UNAUTHORIZED: "User not found for email: ..."` — the email doesn't have a Better Auth account in PayClaw. Coordinate with the Flowglad team to create one.

### Verify

- `bun run typecheck` passes
- `bun run lint` passes
- Manual curl test returns 201 (or documented 401 with clear next steps)

### Rollback

```bash
rm lib/payclaw/client.ts
# Phase 0 files remain (harmless types)
```

---

## Phase 2: SSE Consumer

**Goal**: A fetch-based SSE reader that consumes PayClaw's event stream and yields typed events.

**Context to load**:
- `.agents/research/flowglad-pay/03-events-and-streaming.md` — SSE wire format, frame types, keepalive
- `.agents/research/flowglad-pay/06-integration-contract.md` — Section 5 (SSE Strategy)
- `lib/payclaw/schemas.ts` — `sseJobEventSchema`, `jobDonePayloadSchema`

### Steps

#### 2.1 Create `lib/payclaw/sse.ts`

Async generator that consumes the PayClaw SSE stream. Based on the reference implementation in doc 06 Section 5.

Key behaviors:
- Uses `fetch()` with `ReadableStream` (not `EventSource` — we need named event support)
- Parses four SSE frame types: `data:` (regular), `event: done` (terminal), `event: error`, `: keepalive` (skip)
- Yields a discriminated union: `{ type: 'event', event: SseJobEvent } | { type: 'done', payload: JobDonePayload }`
- Respects `AbortSignal` for cancellation (passed via `fetch` options)
- Frame boundary: split on `\r?\n\r?\n` (per SSE spec)
- Validates each event through `sseJobEventSchema` with `safeParse` (skip malformed frames, don't crash)

```typescript
// lib/payclaw/sse.ts — public API sketch

export type SseFrame =
  | { type: 'event'; event: SseJobEvent }
  | { type: 'done'; payload: JobDonePayload }

export async function* consumeJobStream(
  jobId: string,
  config: PayClawConfig,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame, void, undefined> { /* ... */ }
```

#### 2.2 Create event-to-message mapper

A pure function that maps SSE events to human-readable progress messages for the chat UI. Based on doc 06 Section 9.

```typescript
// lib/payclaw/events.ts

export function eventToProgressMessage(event: SseJobEvent): string {
  switch (event.type) {
    case 'job.started':
      return `Starting provisioning for ${event.data?.vendorName ?? 'vendor'}...`
    case 'job.progress':
      return `${(event.data as { stage?: string })?.stage ?? 'Processing...'}`
    case 'card.issued': {
      const d = event.data as { last4?: string } | undefined
      return `Virtual card issued${d?.last4 ? ` (****${d.last4})` : ''}`
    }
    case 'page.navigated':
      return `Navigating to ${(event.data as { url?: string })?.url ?? 'page'}`
    case 'form.submitted':
      return 'Submitting form...'
    case 'payment.completed':
      return 'Payment completed'
    case 'email.received':
      return 'Verification email received'
    case 'verification.completed':
      return 'Verification completed'
    case 'credentials.extracted':
      return 'Credentials extracted'
    case 'job.completed': {
      const d = event.data as { stepCount?: number; hasCredentials?: boolean } | undefined
      return d?.hasCredentials
        ? `Provisioning complete (${d?.stepCount ?? '?'} steps) — credentials available`
        : `Provisioning complete (${d?.stepCount ?? '?'} steps)`
    }
    case 'job.failed':
      return `Provisioning failed: ${(event.data as { error?: string })?.error ?? 'unknown error'}`
    default:
      return event.message
  }
}

/**
 * Summarize a batch of events into a concise progress string.
 * Used for periodic (~30s) progress updates in the chat stream.
 */
export function summarizeEvents(events: SseJobEvent[]): string {
  if (events.length === 0) return 'Waiting for updates...'
  const lastEvent = events[events.length - 1]
  const types = [...new Set(events.map(e => e.type))]
  return `[${types.length} events] Latest: ${eventToProgressMessage(lastEvent)}`
}
```

### Verify

- `bun run typecheck` passes
- `bun run lint` passes
- Unit tests pass (mock ReadableStream with sample frames from doc 03 Section 2)

### Rollback

```bash
rm lib/payclaw/sse.ts lib/payclaw/events.ts
```

---

## Phase 3: Tool Definition + Route Integration

**Goal**: A Vercel AI SDK `tool()` that the LLM can invoke to buy products via Flowglad Pay. Integrated into `app/api/chat/route.ts` as Layer 4.

**Prerequisite**: Resolve the long-running job question (see Open Questions above). The implementation below assumes a **fire-and-forget** pattern where the tool returns immediately after creating the job. If the research reveals a better pattern, adjust accordingly.

**Context to load**:
- `app/api/chat/route.ts` — Gold standard API route; study how Layers 1-3 are loaded and merged
- `lib/tools/third-party.ts` — Gold standard for custom `tool()` wrappers (Exa pattern)
- `lib/tools/types.ts` — `ToolMetadata`, `ToolSource`, `ToolCapabilities`
- `lib/tools/mcp-wrapper.ts` — Envelope pattern, trace collector
- `lib/config.ts` — Constants pattern
- `lib/payclaw/client.ts` (Phase 1)
- `lib/payclaw/schemas.ts` (Phase 0)
- `lib/payclaw/config.ts` (Phase 0)

### Steps

#### 3.1 Create `lib/tools/platform.ts`

The Layer 4 tool loader. Follows the exact pattern of `lib/tools/third-party.ts`.

```typescript
// lib/tools/platform.ts — sketch

import { tool } from "ai"
import type { ToolSet } from "ai"
import type { ToolMetadata } from "./types"
import { getPayClawConfig } from "@/lib/payclaw/config"
import { payClawToolInputSchema } from "@/lib/payclaw/schemas"
import { createJob } from "@/lib/payclaw/client"

export async function getPlatformTools(): Promise<{
  tools: ToolSet
  metadata: Map<string, ToolMetadata>
}> {
  const tools: Record<string, unknown> = {}
  const metadata = new Map<string, ToolMetadata>()

  const config = getPayClawConfig()
  if (!config) {
    // PayClaw not configured — skip silently (graceful degradation)
    return { tools: tools as ToolSet, metadata }
  }

  tools.flowglad_pay_buy = tool({
    description:
      'Buy a product or provision a service account using Flowglad Pay. ' +
      'Provide the vendor URL and maximum spend in cents. ' +
      'The agent will navigate the vendor site, handle checkout, ' +
      'and return credentials or order confirmation.',
    inputSchema: payClawToolInputSchema,
    execute: async (input) => {
      const startMs = Date.now()
      try {
        const result = await createJob(input, config)
        return {
          ok: true,
          data: {
            jobId: result.jobId,
            status: result.status,
            message: `Provisioning job created for ${input.url}. ` +
              `Job ID: ${result.jobId}. The agent is now working on this — ` +
              `it typically takes 2-8 minutes.`,
          },
          error: null,
          meta: {
            tool: 'Flowglad Pay',
            source: 'platform',
            durationMs: Date.now() - startMs,
          },
        }
      } catch (err) {
        console.error(
          `[tools/platform] Flowglad Pay failed after ${Date.now() - startMs}ms:`,
          err instanceof Error ? err.message : String(err),
        )
        throw err
      }
    },
  })

  metadata.set('flowglad_pay_buy', {
    displayName: 'Flowglad Pay',
    source: 'third-party', // Reuse existing ToolSource — no type changes needed
    serviceName: 'Flowglad Pay',
    icon: 'wrench',
    readOnly: false, // This tool has side effects (creates jobs, spends money)
  })

  return { tools: tools as ToolSet, metadata }
}
```

> **Design note**: We use `source: 'third-party'` instead of adding a new `'platform'` ToolSource. This avoids modifying `lib/tools/types.ts` and keeps changes minimal. The `serviceName: 'Flowglad Pay'` distinguishes it in logs and PostHog.

#### 3.2 Add `platformTools` capability to `ToolCapabilities`

**File**: `lib/tools/types.ts`

Add one optional field to `ToolCapabilities`:

```typescript
export type ToolCapabilities = {
  search?: boolean
  code?: boolean
  mcp?: boolean
  platformTools?: boolean  // NEW: Flowglad Pay and future platform tools
}
```

Update `resolveToolCapabilities` to include it:

```typescript
export function resolveToolCapabilities(
  tools: boolean | ToolCapabilities | undefined
): Required<ToolCapabilities> {
  if (tools === false) return { search: false, code: false, mcp: false, platformTools: false }
  if (tools === true || tools === undefined) return { search: true, code: true, mcp: true, platformTools: true }
  return {
    search: tools.search !== false,
    code: tools.code !== false,
    mcp: tools.mcp !== false,
    platformTools: tools.platformTools !== false,
  }
}
```

#### 3.3 Integrate into `app/api/chat/route.ts`

Add a new loading section between MCP tools and the merge. This follows the exact pattern of the existing Layer 2 loading (lines 293-324 in `route.ts`).

**Insert after the MCP tool loading section** (after `mcpTools` is populated, before the merge):

```typescript
// -----------------------------------------------------------------------
// Platform Tool Loading (Layer 4 — Experimental)
// Flowglad Pay: AI-powered purchase agent.
// Gated on: auth + model capability.
// NOT loaded for anonymous users (has side effects — spends money).
//
// EXPERIMENTAL: This entire section can be removed to disable Flowglad Pay.
// See: .agents/plans/flowglad-pay-integration.md (Rollback instructions)
// -----------------------------------------------------------------------
let platformTools: ToolSet = {} as ToolSet
let platformToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

if (isAuthenticated && capabilities.platformTools) {
  const { getPlatformTools } = await import("@/lib/tools/platform")
  const platformResult = await getPlatformTools()
  platformTools = platformResult.tools
  platformToolMetadata = platformResult.metadata
}
```

**Update the tool merge** (modify the existing merge line):

```typescript
// Before:
const allTools = { ...searchTools, ...mcpTools } as ToolSet

// After:
const allTools = { ...searchTools, ...platformTools, ...mcpTools } as ToolSet
```

> **Merge order**: `platformTools` before `mcpTools` so MCP tools win on collision (user-configured tools take priority over platform tools).

**Update the metadata merge** for `allToolMetadata`:

```typescript
// Before:
const allToolMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata])

// After (in prepareStep scope):
const allToolMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata, ...platformToolMetadata])
```

**Update the non-MCP audit log section** to include platform tool metadata:

```typescript
// Before:
const nonMcpMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata])

// After:
const nonMcpMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata, ...platformToolMetadata])
```

#### 3.4 Add dev-mode collision detection for platform tools

In the existing collision detection block (lines 391-398 in `route.ts`), extend to include platform tools:

```typescript
if (process.env.NODE_ENV !== "production") {
  const searchKeys = new Set(Object.keys(searchTools))
  const platformKeys = new Set(Object.keys(platformTools))
  for (const key of Object.keys(mcpTools)) {
    if (searchKeys.has(key)) {
      console.warn(`[tools] Key collision: "${key}" exists in both search and MCP tools. MCP wins.`)
    }
    if (platformKeys.has(key)) {
      console.warn(`[tools] Key collision: "${key}" exists in both platform and MCP tools. MCP wins.`)
    }
  }
}
```

### Verify

- `bun run typecheck` passes
- `bun run lint` passes
- `bun run dev` starts without errors
- With PayClaw env vars set: the `flowglad_pay_buy` tool appears in the model's tool list
- Without PayClaw env vars: no errors, tool simply not registered (graceful degradation)
- A chat message like "Buy me a subscription to Supabase" triggers the tool call (with a model that supports tool use)

### Rollback

To completely remove the Flowglad Pay integration:

```bash
# 1. Remove all PayClaw files
rm -rf lib/payclaw/
rm lib/tools/platform.ts

# 2. Revert route.ts changes
#    - Remove the "Platform Tool Loading (Layer 4)" section
#    - Revert the tool merge line: { ...searchTools, ...mcpTools }
#    - Revert the metadata merge lines (remove ...platformToolMetadata)
#    - Revert the collision detection block

# 3. Revert lib/tools/types.ts
#    - Remove `platformTools` from ToolCapabilities
#    - Remove `platformTools` from resolveToolCapabilities

# 4. Revert .env.example (remove PAYCLAW_APP_URL and PAYCLAW_CARD_ID lines)

# 5. Remove env vars from .env.local
```

---

## Phase 4: Progress Updates + Credential Display

**Goal**: After the tool creates a job, provide periodic progress summaries in the chat and display credentials on completion.

**Prerequisite**: The long-running job research question must be resolved before finalizing this phase. The approach below is a pragmatic starting point.

**Context to load**:
- `lib/payclaw/sse.ts` (Phase 2)
- `lib/payclaw/events.ts` (Phase 2)
- `lib/payclaw/client.ts` (Phase 1)
- `.agents/research/flowglad-pay/03-events-and-streaming.md` — Event taxonomy
- `.agents/research/flowglad-pay/02-credentials-api.md` — Credential retrieval
- `.agents/research/flowglad-pay/06-integration-contract.md` — Section 6 (Credential Retrieval Flow)
- Research findings: `.agents/context/research/long-running-tool-calls.md` (from Open Questions)

### Approach: Polling Status Route

Create a lightweight API route that the client can poll for job progress. This avoids Convex changes and keeps the integration contained.

#### 4.1 Create `app/api/payclaw/status/route.ts`

A GET endpoint that polls PayClaw for job status and events.

```typescript
// app/api/payclaw/status/route.ts — sketch

import { auth } from "@clerk/nextjs/server"
import { getPayClawConfig } from "@/lib/payclaw/config"
import { getJob, getJobEvents, listCredentials } from "@/lib/payclaw/client"

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const config = getPayClawConfig()
  if (!config) return new Response('PayClaw not configured', { status: 503 })

  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId')
  if (!jobId) return new Response('Missing jobId', { status: 400 })

  const job = await getJob(jobId, config)
  const events = await getJobEvents(jobId, config)

  const isTerminal = ['completed', 'failed', 'cancelled'].includes(job.status)

  // On completion with credentials, fetch them
  let credentials = undefined
  if (isTerminal && job.result?.credentials) {
    credentials = await listCredentials(config, jobId)
  }

  return Response.json({ job, events, credentials, isTerminal })
}
```

#### 4.2 Progress display strategy

The tool result from Phase 3 includes the `jobId`. The chat UI should:

1. Detect the `flowglad_pay_buy` tool result in the message stream
2. Start polling `/api/payclaw/status?jobId=<id>` every ~30 seconds
3. Display a progress summary using `summarizeEvents()` from Phase 2
4. On terminal state, display the final result (credentials or error)

**For the demo**, this can be as simple as a `useEffect` in the chat message component that checks for Flowglad Pay tool results and polls accordingly. The exact UI implementation depends on how we render tool results in chat today.

#### 4.3 Credential display

When the job completes with `hasCredentials: true`:

1. The status route fetches credentials via `listCredentials()`
2. Credentials are returned in the polling response
3. The chat UI renders them as plain text in the message

**For the demo**, we display credentials directly in the chat message. No copy-to-clipboard, no hide/reveal, no encryption. This is the simplest approach and acceptable for an experimental demo.

> **Security note**: Credential values are transient — they exist only in the API response and the rendered chat message. They are never persisted in Convex or any other storage on our side.

#### 4.4 Partial failure messaging

If provisioning fails partway (e.g., signup succeeded but credential extraction failed):

- The `job.failed` event includes an `error` field describing what went wrong
- The `job.result` may contain partial data (e.g., `accountEmail` from a successful signup)
- Display both: "Provisioning partially completed: [what succeeded]. Failed: [error message]"

For the demo, a simple message is sufficient:

```
"The provisioning job encountered an issue: {error}. 
Some steps may have completed. Job ID: {jobId} for reference."
```

### Verify

- `bun run typecheck` passes
- `bun run lint` passes
- End-to-end: ask the model to buy something → tool fires → job created → status route returns progress → terminal state shows result
- Without PayClaw env vars: tool doesn't load, no errors

### Rollback

```bash
rm -rf app/api/payclaw/
# Client-side polling code in chat components (revert specific changes)
```

---

## File Inventory

All files created by this integration, for easy cleanup:

| File | Phase | Purpose |
|------|-------|---------|
| `lib/payclaw/config.ts` | 0 | Configuration loader |
| `lib/payclaw/schemas.ts` | 0 | Zod schemas (API contract) |
| `lib/payclaw/client.ts` | 1 | HTTP client |
| `lib/payclaw/sse.ts` | 2 | SSE consumer |
| `lib/payclaw/events.ts` | 2 | Event-to-message mapping |
| `lib/tools/platform.ts` | 3 | Layer 4 tool loader |
| `app/api/payclaw/status/route.ts` | 4 | Status polling endpoint |

Files **modified** (not created):

| File | Phase | Change | Revert |
|------|-------|--------|--------|
| `.env.example` | 0 | Added `PAYCLAW_APP_URL`, `PAYCLAW_CARD_ID` | Remove those lines |
| `lib/tools/types.ts` | 3 | Added `platformTools` to `ToolCapabilities` | Remove the field |
| `app/api/chat/route.ts` | 3 | Added Layer 4 loading + merge | Remove the section, revert merge lines |

---

## Complete Rollback Instructions

To remove the entire Flowglad Pay integration and return the codebase to its previous state:

```bash
# 1. Delete all new files
rm -rf lib/payclaw/
rm -f lib/tools/platform.ts
rm -rf app/api/payclaw/

# 2. Revert modified files (use git)
git checkout -- lib/tools/types.ts
git checkout -- app/api/chat/route.ts
git checkout -- .env.example

# 3. Remove env vars from .env.local
# (manual: remove ApiKey, user_name, PAYCLAW_APP_URL, PAYCLAW_CARD_ID)

# 4. Verify clean state
bun run typecheck
bun run lint
```

---

## Tracking & Follow-Up Items

| Item | Status | Notes |
|------|--------|-------|
| Long-running job pattern | **Research needed** | How to update chat with async tool results (industry-standard approach) |
| Per-user API key migration | **Watch** | Follow up with Flowglad team; no timeline yet |
| PayClaw API schema changes | **Watch** | Track `main` at `flowglad/provisioning-agent`; expect breaking changes |
| `user_name` hardcoded email | **Temporary** | Replace when per-user auth lands |
| Convex integration | **Deferred** | Add `payclawJobs` table only if demo requires persistence |
| Credential expiration | **Skipped** | `expiresAt` not enforced by PayClaw; acceptable for demo |
| Rate limits | **Unknown** | No known limits; single-user demo scope |
| Cancellation | **Not available** | No PayClaw cancel endpoint; jobs run until completion or 10-min expiry |
| Production security hardening | **Deferred** | Shared API key, plaintext credentials in chat — all acceptable for demo |

---

*This plan references research from `.agents/research/flowglad-pay/` (documents 00–06) and follows patterns established in `.agents/plans/tool-calling-infrastructure.md`.*
