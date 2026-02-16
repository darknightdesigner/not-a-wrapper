# PayClaw Integration Research Plan

Research plan for integrating with [flowglad/provisioning-agent](https://github.com/flowglad/provisioning-agent) (PayClaw) as a tool call from Not A Wrapper.

**Goal**: Understand the PayClaw API surface deeply enough to build a Vercel AI SDK tool that creates provisioning jobs, streams progress events into the chat UI, and retrieves credentials on completion.

**Source repo**: `https://github.com/flowglad/provisioning-agent.git`

## How to Access the Source

All file paths in this plan are relative to the repo root. Clone to `/tmp` for research:

```bash
git clone --depth 1 https://github.com/flowglad/provisioning-agent.git /tmp/flowglad-pa
```

Then read files at `/tmp/flowglad-pa/<path>` (e.g. `/tmp/flowglad-pa/packages/app/app/api/v1/jobs/route.ts`).

Clean up when done:

```bash
rm -rf /tmp/flowglad-pa
```

---

## 01 — Jobs API Surface

**Scope**: Complete documentation of the Jobs REST API — the primary integration point. Covers request/response schemas, lifecycle states, query parameters, error codes, and the pg-boss queue contract that backs job creation.

**Source files to read**:

| File | Purpose |
|------|---------|
| `packages/app/app/api/v1/jobs/route.ts` | POST (create job) and GET (list jobs) handlers |
| `packages/app/app/api/v1/jobs/[id]/route.ts` | GET single job by ID |
| `packages/app/lib/jobs/types.ts` | `Job`, `JobStatus`, `JobMode`, `CreateJobRequest`, `ShippingAddress` types |
| `packages/app/lib/jobs/interface.ts` | `JobService` Effect interface (create, get, list, listEvents) |
| `packages/app/lib/jobs/service.ts` | `JobServiceLive` implementation — pg-boss send, raw SQL reads from `pgboss.job` |
| `packages/app/lib/jobs/pgboss.ts` | `PgBossClientLive` for the app server (non-scoped) |
| `packages/app/lib/jobs/errors.ts` | `JobError`, `JobNotFoundError` tagged errors |
| `packages/agent/src/api/pg-boss-init.ts` | Queue config: `PROVISIONING_QUEUE`, retryLimit, retryDelay, expireInSeconds, retentionSeconds |

**Key questions**:
- What is the exact Zod schema for `POST /api/v1/jobs` and what are the optional vs required fields?
- What does the response look like for create (201), list, and get-by-ID?
- What are the valid `status` filter values for the list endpoint and what is the default `limit`?
- How does pg-boss map its internal states (`created`, `retry`, `active`, `completed`, `failed`, `cancelled`) to the Job object we receive?
- What is the retry policy (retryLimit=1, retryDelay=30s, expireInSeconds=600)?
- What error response shape does every endpoint use (`{ error, code, details? }`)?

---

## 02 — Credentials API Surface

**Scope**: Documentation of the Credentials REST API for listing and retrieving provisioned account credentials. Covers the encryption model (AES-256-GCM with userId AAD), the credential lifecycle (created → accessed → revoked), and scoping semantics.

**Source files to read**:

| File | Purpose |
|------|---------|
| `packages/app/app/api/v1/credentials/route.ts` | GET list (requires `?userEmail=`) |
| `packages/app/app/api/v1/credentials/[id]/route.ts` | GET by ID (decrypted value) and DELETE (revoke) |
| `packages/app/lib/credentials/interface.ts` | `AppCredentialService`, `StoredCredential`, `CredentialWithValue` types |
| `packages/app/lib/credentials/service.ts` | `AppCredentialServiceLive` — list/get/revoke with encryption |
| `packages/app/lib/credentials/errors.ts` | `CredentialError`, `CredentialNotFoundError` |
| `packages/app/db/external/vaultSchema.ts` | Drizzle schema for `vault_credentials` table |
| `packages/shared/src/encryption.ts` | `EncryptionService` interface, `Aes256GcmEncryptionServiceLive`, AAD model |

**Key questions**:
- What fields does a `StoredCredential` contain (list response) vs `CredentialWithValue` (get-by-ID response)?
- How is userId used as AAD in AES-256-GCM encryption, and what does this mean for our integration (we pass userEmail, their system resolves to userId)?
- What does the revoke flow look like (soft-delete via `revokedAt` timestamp)?
- Does the list endpoint exclude revoked credentials by default?
- What does `accessedAt` tracking mean — is there an access audit trail?

---

## 03 — Job Events and Real-Time Streaming

**Scope**: Deep dive into the event system — the SSE streaming endpoint, the polling events endpoint, the event type taxonomy, and the wire format. This is critical for driving real-time UI updates in our chat.

**Source files to read**:

| File | Purpose |
|------|---------|
| `packages/app/app/api/v1/jobs/[id]/events/stream/route.ts` | SSE endpoint — Effect Stream, 250ms polling, keepalive, terminal `done` event |
| `packages/app/app/api/v1/jobs/[id]/events/route.ts` | Polling events endpoint (GET all events for a job) |
| `packages/agent/src/api/types.ts` | `JobEventType`, `JobEventDataMap`, `JobEvent` discriminated union, `SseJobEvent`, `JobDonePayload` |
| `packages/app/lib/jobs/types.ts` | App-side mirror of event types |
| `packages/agent/src/api/job-event-store.ts` | `JobEventStore` interface and PG implementation (INSERT/SELECT on `public.job_events`) |
| `packages/agent/src/api/job-executor.ts` | `processProvisioningJob` — where events are emitted, sanitized, and persisted |

**Key questions**:
- What is the complete taxonomy of `JobEventType` values and what `data` payload does each carry?
- What is the SSE wire format — how are `data:` frames structured vs the terminal `event: done` frame?
- How does the SSE stream detect terminal states (`completed`, `failed`, `cancelled`)?
- What is the keepalive strategy (`: keepalive\n\n` comment frame when no new events)?
- How are sensitive fields (card numbers, CVCs) redacted in persisted events?
- What does `SseJobEvent` look like on the wire (timestamp as ISO-8601 string, not Date)?
- What is the polling interval (250ms via `Schedule.spaced(250)`) and can we rely on it for our UI?

---

## 04 — Auth Model and User Resolution

**Scope**: Document how authentication currently works (shared API key + userEmail param), the Better Auth user lookup, and the planned migration to per-user API keys. Critical for understanding what identity we need to pass and how auth will evolve.

**Source files to read**:

| File | Purpose |
|------|---------|
| `packages/app/lib/api/auth.ts` | `validateApiKey` (timing-safe compare), `extractApiKey` (X-API-Key or Bearer), `AuthDeps` interface |
| `packages/app/lib/api/auth-live.ts` | `AuthDepsLive` — Better Auth session + `lookupUserByEmail` via Drizzle |
| `packages/app/lib/auth.ts` | Better Auth config (emailAndPassword, Drizzle adapter) |
| `packages/app/db/schema/betterAuthSchema.ts` | User, session, account, verification tables |
| `packages/app/app/api/v1/jobs/route.ts` | TODO comments about per-user API key migration |
| `packages/app/app/api/v1/credentials/route.ts` | Same TODO pattern for credential ownership |

**Key questions**:
- What header does the API key go in (`X-API-Key` or `Authorization: Bearer`)? Both are accepted?
- How does `validateApiKey` work (single shared `API_KEY` env var, timing-safe comparison)?
- How does user resolution work today (userEmail in body/query → `lookupUserByEmail` → Better Auth user ID)?
- What are the TODO markers saying about the planned per-user API key migration?
- Does the Jobs list endpoint currently filter by user or return all jobs (currently: all jobs, no per-user filtering)?
- What user identity do we need to provide from Not A Wrapper (Clerk email → PayClaw Better Auth user)?

---

## 05 — Agent Orchestration Model

**Scope**: Document the end-to-end job execution flow from API creation through the pg-boss worker to the Anthropic tool-calling loop. Covers what parameters influence execution, what primitives exist, and what feedback surfaces back through events and results.

**Source files to read**:

| File | Purpose |
|------|---------|
| `packages/agent/src/api/worker-main.ts` | Worker entry point — layer composition, ManagedRuntime, shutdown |
| `packages/agent/src/api/job-worker.ts` | `startJobWorker` — pg-boss `boss.work()`, param extraction, result persistence |
| `packages/agent/src/api/job-executor.ts` | `processProvisioningJob` — event emission, lifecycle events, result extraction |
| `packages/agent/src/agent/provisioning-service.ts` | `ProvisioningService` interface, `ProvisioningParams`, `ProvisioningResult` |
| `packages/agent/src/agent/provisioning-service-local.ts` | `LocalProvisioningService` — Anthropic loop, tool execution, skill injection |
| `packages/agent/src/agent/orchestrator/orchestrator.ts` | `PrimitiveOrchestrator` — plan → execute primitives |
| `packages/agent/src/agent/orchestrator/types.ts` | `OrchestratorContext`, `OrchestratorPlan`, `VendorSkillDirectory` |
| `packages/agent/src/agent/orchestrator/planner.ts` | LLM-based planning step |
| `packages/agent/src/agent/tool-registry.ts` | `ToolRegistry` interface (execute, getSchemas, cleanup, setJobContext) |
| `packages/agent/src/agent/tools/local-tool-registry.ts` | Concrete tool registration (browser, email, sms, credentials, issuing) |

**Key questions**:
- What is the full job lifecycle: API POST → pg-boss send → worker fetch → extractParams → processProvisioningJob → provision() → result?
- What primitives does the orchestrator plan and execute (signup, login, verify_email, verify_sms, navigate, checkout, extract_credentials)?
- What parameters in `ProvisioningParams` can we control from the API (vendorUrl, vendorName, product, maxSpend, mode, shippingAddress)?
- What does `ProvisioningResult` contain on success vs failure?
- How does mode (`provision` vs `ecommerce` vs `signup`) affect the orchestration plan?
- What is `maxSteps` and how does it bound execution?
- How do vendor skills influence the agent's behavior (URL matching, signup field hints, verification methods)?

---

## 06 — Integration Contract

**Scope**: Synthesize findings from documents 01–05 into a concrete integration specification for building a Vercel AI SDK tool. Covers the tool's parameter schema, the HTTP client contract, polling/streaming strategy, credential retrieval flow, error handling, and Zod schemas to mirror.

**Source files to read**:

| File | Purpose |
|------|---------|
| All API route files from 01–04 | Request/response contracts |
| `packages/agent/src/api/types.ts` | Canonical type definitions to mirror as Zod schemas |
| `packages/app/lib/jobs/types.ts` | App-side type definitions |
| `packages/app/lib/credentials/interface.ts` | Credential types to mirror |
| `packages/cli/src/commands/provision.ts` | CLI's job creation + SSE consumption as a reference client |
| `packages/cli/src/lib/sse-client.ts` | CLI's SSE client implementation (EventSource pattern) |

**Key questions**:
- What Zod schemas should our tool call define (input params mirroring `createJobSchema`)?
- What is the minimal happy-path flow: create job → stream/poll events → retrieve credentials?
- How should we handle long-running jobs in a chat context (SSE stream vs periodic polling)?
- What error states need specific handling (401 unauthorized, 404 job not found, 500 internal, job.failed event)?
- How do we map PayClaw job events to Vercel AI SDK tool call progress updates?
- What timeout/cancellation strategy do we need (jobs expire in 10 minutes)?
- Should we mirror the CLI's `sse-client.ts` approach or build our own EventSource consumer?
- What user identity mapping is needed between Clerk (our auth) and Better Auth (their auth)?

---

## Execution Order

| Phase | Documents | Rationale |
|-------|-----------|-----------|
| 1 | 01, 02 | API surface — what we call and what comes back |
| 2 | 03, 04 | Real-time streaming and auth — how we subscribe and authenticate |
| 3 | 05 | Agent internals — understanding what happens behind the API |
| 4 | 06 | Integration contract — synthesize into our tool specification |

Documents within each phase can be researched in parallel.
