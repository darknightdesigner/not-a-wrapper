# 05 — Agent Orchestration Model

Research document covering the end-to-end job execution flow from API creation through the pg-boss worker to the Anthropic tool-calling loop. Documents what parameters influence execution, what primitives exist, and what feedback surfaces back through events and results.

**Source repo**: `flowglad/provisioning-agent` (cloned to `/tmp/flowglad-pa`)

---

## Table of Contents

1. [End-to-End Job Lifecycle](#1-end-to-end-job-lifecycle)
2. [Worker Architecture](#2-worker-architecture)
3. [Parameter Extraction & Validation](#3-parameter-extraction--validation)
4. [Job Executor & Event Emission](#4-job-executor--event-emission)
5. [Provisioning Service Interface](#5-provisioning-service-interface)
6. [Local Provisioning Service (Anthropic Loop)](#6-local-provisioning-service-anthropic-loop)
7. [Primitive Orchestrator](#7-primitive-orchestrator)
8. [LLM Planner](#8-llm-planner)
9. [Primitive Types & Step Budgets](#9-primitive-types--step-budgets)
10. [Primitive Evaluator](#10-primitive-evaluator)
11. [Tool Registry](#11-tool-registry)
12. [Vendor Skills System](#12-vendor-skills-system)
13. [Key Questions Answered](#13-key-questions-answered)

---

## 1. End-to-End Job Lifecycle

The complete flow from API request to result:

```
API POST /api/v1/jobs
    │
    ▼
pg-boss.send(PROVISIONING_QUEUE, jobData)  ← app server enqueues
    │
    ▼
pg-boss.work() poll  ← worker-main.ts polls queue
    │
    ▼
extractParams(job.data)  ← validate & type-narrow from Record<string,unknown>
    │
    ▼
processProvisioningJob(provisioningService, params, { persistEvent })
    │
    ├── emit job.started event
    │
    ├── provisioningService.provision(params, { onStep, onEvent })
    │   │
    │   ├── Load prompts from PromptStore (S3 or filesystem)
    │   ├── Match vendor skill by URL pattern
    │   ├── Set job context (userId) for credential tools
    │   ├── Generate dynamic credentials (email via Mailgun, password, phone via Twilio)
    │   ├── Register secrets in SecretRegistry
    │   ├── Fetch & register card details via Brex PAN API
    │   ├── Create OrchestratorContext
    │   ├── PrimitiveOrchestrator.execute(context, onStep)
    │   │   │
    │   │   ├── resolveVendorState() — check vault for existing credentials
    │   │   ├── planPrimitives() — LLM plans ordered primitive sequence
    │   │   └── For each primitive:
    │   │       ├── Load vendor skill content for this primitive
    │   │       ├── buildPrimitiveTaskDescription()
    │   │       ├── runScopedLoop() — Anthropic tool-calling loop
    │   │       │   ├── Anthropic claude-sonnet-4 messages.create()
    │   │       │   ├── Execute tool calls (browser, email, sms, credentials)
    │   │       │   ├── Emit business events (page.navigated, form.submitted, etc.)
    │   │       │   └── Loop until end_turn or maxSteps
    │   │       └── evaluatePrimitiveResult() — heuristic + LLM fallback
    │   │
    │   └── toolRegistry.cleanup() (via Effect.ensuring)
    │
    ├── emit job.completed or job.failed event
    │
    └── INSERT result INTO pgboss.job_results
```

### Failure Semantics

The worker distinguishes two failure modes:

| Failure Type | Behavior | Retry? |
|---|---|---|
| **Agent flow failure** (ProvisioningError caught) | Handler returns `success: false` normally → pg-boss marks `completed` | No — controlled failure, no retry |
| **Infrastructure crash** (thrown error) | Handler throws → pg-boss marks `failed` | Yes — retries once (per queue config) |

---

## 2. Worker Architecture

**File**: `packages/agent/src/api/worker-main.ts`

The worker is a standalone Node.js process (no HTTP server). Key characteristics:

- **Effect ManagedRuntime**: Keeps layer resources alive (pg-boss, PG pools, credential vault). Disposal triggers `acquireRelease` finalizers automatically.
- **Layer composition**: Composes `ProvisioningServiceTag` from `LocalProvisioningServiceLive` ← `LocalToolRegistryLive` ← services (vault, email store, SMS store, event store, SQL).
- **Credential vault**: Prefers `EncryptedPgCredentialVaultLive` with AES-256-GCM encryption; falls back to in-memory vault if PG init fails.
- **Graceful shutdown**: SIGTERM/SIGINT → `workerRuntime.dispose()` → boss.stop(graceful, timeout=100s) + PG pool cleanup.

### Layer Dependency Graph

```
ManagedRuntime
├── PgBossClientScoped(databaseUrl)
├── ProvisioningServiceTag (LocalProvisioningServiceLive)
│   ├── ToolRegistryTag (LocalToolRegistryLive)
│   │   ├── CredentialVaultService
│   │   ├── EmailStoreService
│   │   └── SmsStoreService
│   ├── CredentialVaultService (EncryptedPgCredentialVaultLive or InMemory)
│   │   ├── AppSqlLive
│   │   └── EncryptionServiceLive
│   └── PromptStoreLive
├── JobEventStoreLive
│   └── AppSqlLive
└── AppSqlLive(databaseUrl)
```

---

## 3. Parameter Extraction & Validation

**File**: `packages/agent/src/api/job-worker.ts`

The `extractParams` function validates raw `Record<string, unknown>` from pg-boss job data into typed `ProvisioningParams`:

### Required Fields

| Field | Type | Validation |
|---|---|---|
| `vendorUrl` | `string` | Non-empty string |
| `vendorName` | `string` | Non-empty string |
| `maxSpend` | `number` | Positive number |
| `userId` | `string` | Non-empty string |

### Optional Fields (passed through if present)

| Field | Type | Validation |
|---|---|---|
| `product` | `string` | Cast, no validation |
| `mode` | `JobMode` | Cast (`'provision'`, `'ecommerce'`, `'signup'`) |
| `maxSteps` | `number` | Cast, no validation |
| `shippingAddress` | `ShippingAddress` | Cast, no validation |
| `cardProvider` | `'brex'` | Validated against `VALID_CARD_PROVIDERS` set (`{'brex'}`) |
| `cardId` | `string` | Non-empty string if present |

Validation failures produce `JobDataValidationError` with a `message` and `field` property.

---

## 4. Job Executor & Event Emission

**File**: `packages/agent/src/api/job-executor.ts`

The `processProvisioningJob` function wraps the provisioning service call with lifecycle event management:

### Event Flow

1. **`job.started`** — Emitted immediately with `{ vendorUrl, vendorName, product?, mode? }`
2. **Business events** — Emitted by the agent loop (page.navigated, form.submitted, credentials.extracted, etc.)
3. **Terminal event** — Either:
   - **`job.completed`** with `{ stepCount, eventCount, skillsUsed, hasCredentials }`
   - **`job.failed`** with `{ error, stepCount, eventCount }`

### Sensitive Data Redaction

Events are sanitized before persistence. The following keys are replaced with placeholders:

| Key (camelCase or snake_case) | Placeholder |
|---|---|
| `cardNumber` / `card_number` | `{{CARD_NUMBER}}` |
| `cardCvc` / `card_cvc` | `{{CARD_CVC}}` |
| `cardExpiry` / `card_expiry` | `{{CARD_EXPIRY}}` |

Redaction is recursive — nested objects and arrays are traversed.

### Event Persistence

Events are persisted fire-and-forget via `eventStore.add(jobId, sanitizedEvent)`. Failures are caught and ignored (`Effect.catchAll(() => Effect.void)`) to avoid blocking the main execution flow.

### Result Storage

After provisioning completes, the result (excluding step history) is written to `pgboss.job_results` via an upsert:

```sql
INSERT INTO pgboss.job_results (job_id, result)
VALUES ($jobId, $resultJson::jsonb)
ON CONFLICT (job_id) DO UPDATE SET result = $resultJson::jsonb
```

---

## 5. Provisioning Service Interface

**File**: `packages/agent/src/agent/provisioning-service.ts`

### `ProvisioningParams`

```typescript
interface ProvisioningParams {
  vendorUrl: string         // Target vendor URL
  vendorName: string        // Vendor name for display/matching
  product?: string          // Product to provision/purchase
  maxSpend: number          // Spending limit (in cents)
  maxSteps?: number         // Override default step limit
  shippingAddress?: ShippingAddress  // For physical goods
  mode?: JobMode            // 'provision' | 'ecommerce' | 'signup'
  cardProvider?: 'brex'     // Only 'brex' supported
  cardId?: string           // Specific card ID to use
  userId: string            // Better Auth user ID (for vault scoping)
}
```

### `ProvisioningResult`

```typescript
interface ProvisioningResult {
  success: boolean
  credentials?: string       // Comma-separated key-value pairs
  credentialIds?: string[]   // Vault credential IDs
  orderNumber?: string       // For e-commerce orders
  productObtained?: string   // Product description
  cardUsed?: string          // Card identifier used
  accountEmail?: string      // Email used for signup
  usedVendorPrompt?: boolean // Whether a vendor skill was matched
  error?: string             // Error message on failure
  steps: AgentStep[]         // Full execution trace
  skillsUsed: string[]       // Vendor skill names used
}
```

### `AgentStep` (Execution Trace)

```typescript
interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'skill_injection'
  content: string
  timestamp: Date
}
```

### Callbacks

```typescript
interface ProvisioningCallbacks {
  onStep?: (step: AgentStep) => void | Promise<void>
  onEvent?: (event: JobEvent) => void | Promise<void>
}
```

---

## 6. Local Provisioning Service (Anthropic Loop)

**File**: `packages/agent/src/agent/provisioning-service-local.ts`

### Setup Phase (Steps 0–5 in `provision()`)

The provisioning method executes a multi-step setup before orchestration:

| Step | Action | Detail |
|---|---|---|
| 0 | Load prompts | From PromptStore (S3 or filesystem). Prompts are reset per-job to get fresh versions. |
| 0 | Match vendor skill | `matchVendorSkill(vendorUrl, skills)` — regex match against `urlPattern` |
| 0.5 | Set job context | `toolRegistry.setJobContext({ userId })` — scopes credential tools to user |
| 1 | Generate dynamic credentials | Email via Mailgun, password via `randomBytes(16)`, phone via Twilio — based on vendor skill's `signupFields` |
| 2 | Merge credentials | Config env vars take precedence over dynamic generation |
| 3 | Register secrets | Account credentials registered in SecretRegistry for redaction |
| 4 | Register shipping address | API params take precedence over env var config |
| 5 | Create card program | Brex PAN API — fails gracefully (warn + continue) |

### `runScopedLoop()` — The Core Agent Loop

This is the inner Anthropic tool-calling loop that executes a single primitive:

1. **Skill injection**: At each step, checks current browser URL for matching tech skills. Injects `[System Note]` user message with new guidance.
2. **Anthropic API call**: `claude-sonnet-4-20250514`, max_tokens=4096, with system prompt + message history + tool schemas.
3. **Text blocks**: Recorded as `thinking` steps; last text becomes `finalText`.
4. **Tool calls**: Executed sequentially via `toolRegistry.execute()`.
   - Success: Result truncated to 10,000 chars to avoid context overflow.
   - Failure: Error message passed back as `is_error: true`.
5. **Business events**: Emitted on successful tool execution:
   - `browser` + `action: navigate` → `page.navigated`
   - `browser` + `action: click` on submit-like selector → `form.submitted`
   - `storeCredential` → `credentials.extracted`
6. **Termination**: Loop ends when no tool calls returned with `stop_reason: 'end_turn'`. If `stop_reason: 'max_tokens'`, continues with "Continue." prompt.
7. **Cleanup**: `toolRegistry.cleanup()` runs via `Effect.ensuring` regardless of success/failure.

### Model

All agent interactions use **`claude-sonnet-4-20250514`** (Claude Sonnet 4).

---

## 7. Primitive Orchestrator

**File**: `packages/agent/src/agent/orchestrator/orchestrator.ts`

The `PrimitiveOrchestrator` coordinates the full provisioning job by planning and executing a sequence of atomic primitives.

### Execution Flow

1. **Resolve vendor state**: Query credential vault for existing credentials for this user + vendor.
   - On vault error: fail-open with `hasCredentials: false` (agent will try signup).
2. **Plan primitives**: LLM-based planning via `planPrimitives()` (see [Section 8](#8-llm-planner)).
3. **Record plan**: The plan summary is logged as a `thinking` step (e.g., `"signup → verify_email → navigate:api_keys → extract_credentials"`).
4. **Execute each primitive sequentially**:
   a. Load vendor skill content (per-primitive `.md` file + common guidance).
   b. Build task description from prompt template + skill content + vendor state.
   c. Call `runScopedLoop()` with the primitive's `maxSteps` budget.
   d. Evaluate result via `evaluatePrimitiveResult()`.
   e. **If failed**: Abort remaining primitives immediately (`Effect.fail`).
5. **Combine results**: Aggregate all primitive results into a single `ProvisioningResult`.
   - Credentials extracted from `extract_credentials` primitive results.
   - Order information from `extract_order_confirmation` results.
   - Account email from `signup` results.

### Vendor State Resolution

**File**: `packages/agent/src/agent/orchestrator/state-resolver.ts`

```typescript
interface VendorState {
  hasCredentials: boolean      // Whether vault has credentials for this vendor
  credentialLabels: string[]   // Labels (e.g., ["api_key", "account_id"])
  credentialIds: string[]      // Vault credential IDs
  vendorName: string           // Normalized vendor name
  vendorUrl: string            // Vendor base URL
}
```

The state resolver:
- Queries `vault.listByVendor(userId, vendorName)`.
- Filters out revoked credentials (those with `revokedAt` set).
- On error, returns safe default (`hasCredentials: false`) to allow signup flow.

### Mid-Execution Replanning

Currently **not implemented** (TODO comment in source). The MVP executes the full initial plan without mid-flow adjustments.

---

## 8. LLM Planner

**File**: `packages/agent/src/agent/orchestrator/planner.ts`

### How Planning Works

The planner makes a **single structured output call** to the Anthropic API using `tool_choice: { type: 'tool', name: 'plan_primitives' }` to force JSON output.

### Planner Input

The prompt includes:

1. **Task description**: Vendor name, URL, product, maxSpend.
2. **Vendor metadata** (if skill matched): `vendorType`, `requiresAccount`, `createResources`, `availablePrimitives`.
3. **Credential vault state**: Whether credentials already exist and their labels.
4. **Available primitives**: Descriptions from `prompts.primitiveDescriptions`.
5. **Planning guidance**: Soft rules from `prompts.planningRules` (SaaS patterns, ecommerce patterns, etc.).

### Planner Tool Schema

```typescript
{
  name: 'plan_primitives',
  input_schema: {
    type: 'object',
    properties: {
      reasoning: { type: 'string' },  // 1-3 sentence justification
      primitives: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              enum: ['signup', 'login', 'verify_email', 'verify_sms',
                     'navigate', 'create', 'extract_credentials',
                     'shop', 'checkout', 'extract_order_confirmation']
            },
            params: {
              type: 'object',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['name']
        }
      }
    },
    required: ['reasoning', 'primitives']
  }
}
```

### Plan Validation

- Unknown primitive names are **skipped** (not fatal) — forward-compatible with new primitives.
- If no valid primitives remain after filtering, a `PlanningError` is raised.
- Each valid primitive gets its default step budget from `DEFAULT_STEP_BUDGETS`.

### Planner Model

Uses **`claude-sonnet-4-20250514`** (same as the agent loop), configurable via parameter.

---

## 9. Primitive Types & Step Budgets

**File**: `packages/agent/src/agent/primitives/types.ts`

### Complete Primitive Taxonomy

| Primitive | Purpose | Default maxSteps | Parameterized? |
|---|---|---|---|
| `signup` | Create a new account on the vendor site | 15 | No |
| `login` | Log in with existing credentials | 10 | No |
| `verify_email` | Complete email verification flow | 8 | No |
| `verify_sms` | Complete SMS verification flow | 8 | No |
| `navigate` | Navigate to a specific section of the vendor app | 5 | Yes: `{ target: string }` |
| `create` | Create a resource (database, API key, etc.) | 12 | Yes: `{ resource: string }` |
| `extract_credentials` | Find and store API keys/tokens/secrets | 5 | No |
| `shop` | Find and add products to cart | 30 | No |
| `checkout` | Complete purchase with payment | 25 | No |
| `extract_order_confirmation` | Extract order number and details | 5 | No |

### Step Budget Interpretation

Each "step" is one iteration of the Anthropic tool-calling loop:
1. Send messages to Anthropic → get response
2. Process text blocks and tool calls
3. Execute tools and collect results
4. Append to message history

The total agent steps across all primitives is the sum of their individual budgets. For a typical SaaS provisioning flow (`signup → verify_email → navigate → extract_credentials`), that's 15 + 8 + 5 + 5 = **33 steps maximum**.

### Primitive Spec

```typescript
interface PrimitiveSpec {
  name: PrimitiveName
  params?: Record<string, string>  // For navigate/create
  maxSteps: number                 // From DEFAULT_STEP_BUDGETS
}
```

### Primitive Result

```typescript
interface PrimitiveResult {
  primitive: PrimitiveName
  success: boolean
  data?: Record<string, string>   // Extracted data (credentials, order number)
  agentSummary: string            // Agent's final text response
  finalPageType?: PageType        // Page classification after completion
  stepsUsed: number               // Actual steps consumed
}
```

---

## 10. Primitive Evaluator

**File**: `packages/agent/src/agent/primitives/evaluator.ts`

Each primitive result is evaluated using a two-tier system:

### Tier 1: Heuristic Evaluation

Per-primitive evaluators check:
- **Page type** from browser perception (dashboard, success, verification, etc.)
- **Text indicators** in the agent's final response (keywords like "account created", "verified", etc.)
- **Error indicators** (error messages, failure keywords)

Each heuristic returns a **confidence score** (0.0–1.0):
- ≥ 0.7 → Result accepted directly
- < 0.7 → Falls through to LLM fallback

### Tier 2: LLM Fallback

When confidence is low and an Anthropic client is available:
- Makes a classification call using `claude-sonnet-4-20250514`
- Uses `tool_choice: { type: 'tool', name: 'classify_result' }` for structured output
- Returns `{ success: boolean, extractedData?: Record<string, string> }`

### Per-Primitive Heuristic Signals

| Primitive | High-Confidence Success | High-Confidence Failure |
|---|---|---|
| `signup` | Page type: dashboard/success/verification/account/settings | Text: "error", "failed", "already exists" |
| `login` | Page type: dashboard/account/settings | Text: "invalid password", "invalid credentials" |
| `verify_email` | Success indicators on page, text: "verified" | Text: "unverified", "verify your email" |
| `verify_sms` | Text: "verified", "code accepted", page left verification | Text: "invalid code", error messages |
| `navigate` | URL contains expected path, page type matches | — |
| `create` | Text: "created", "added", success indicators | Text: "error", "failed" |
| `extract_credentials` | Text contains credential keywords + regex match | Text: "not found", "unable to find" |
| `shop` | Page type: cart/checkout, text: "added to cart" | Text: "out of stock", "unavailable" |
| `checkout` | Page type: success, text: "order confirmation" | Payment errors, text: "card declined" |
| `extract_order_confirmation` | Regex match for order number/total | — |

---

## 11. Tool Registry

### Interface

**File**: `packages/agent/src/agent/tool-registry.ts`

```typescript
interface ToolRegistry {
  execute(name: string, args: unknown): Promise<Exit<unknown, unknown>>
  getSchemas(): Anthropic.Tool[]
  cleanup(): Effect.Effect<void, never>
  getCurrentSession(): BrowserSession | null
  setJobContext(ctx: { userId: string; jobId?: string }): void
}
```

### Local Tool Registry

**File**: `packages/agent/src/agent/tools/local-tool-registry.ts`

The `LocalToolRegistryLive` registers 6 tools:

| Tool | Schema Name | Purpose | Dependencies |
|---|---|---|---|
| `browser` | `browserToolSchema` | Navigate, click, type, screenshot, extract page content | BrowserService, PagePerception, SecretRegistry, ScreenshotStore |
| `email` | `emailToolSchema` | Get/create Mailgun email address, wait for verification emails | EmailResolver, SecretRegistry |
| `sms` | `smsToolSchema` | Get/create Twilio phone number, wait for SMS codes | SmsResolver, SecretRegistry |
| `storeCredential` | `credentialToolSchema` | Store credentials in encrypted vault | CredentialVault (requires jobContext) |
| `retrieveCredential` | `retrieveCredentialToolSchema` | Retrieve credentials from vault by ID | CredentialVault (requires jobContext) |
| `listCredentials` | `listCredentialsToolSchema` | List credentials for current user + vendor | CredentialVault (requires jobContext) |

### Credential Tool Scoping

All credential tools (`storeCredential`, `retrieveCredential`, `listCredentials`) require `jobContext` to be set before execution. This ensures credentials are scoped to the correct user. Without `jobContext`, they return a `ToolExecutionError`.

### Unified Runtime

All tools share a single `ManagedRuntime` with a unified layer providing:
- `BrowserServiceTag` — Browser automation (Playwright/Kernel)
- `PagePerceptionService` — Hybrid (Anthropic LLM + heuristic) or basic page perception
- `SecretRegistryService` — Centralized secret tracking for redaction
- `ScreenshotStoreService` — File-based screenshot storage
- `EmailResolverService` — Mailgun or no-op
- `SmsResolverService` — Twilio or no-op
- `CredentialVaultService` — Encrypted credential storage

### Browser Session Management

- Sessions are created lazily on first `browser` tool call.
- If a browser session crashes, it's automatically restarted on the next call.
- Cleanup closes the browser scope and disposes the runtime with a 5-second timeout.

### Page Perception Strategy

Configured via `PAGE_PERCEPTION_STRATEGY` env var:
- `'hybrid'` (default) — Uses Anthropic LLM + heuristics for page understanding
- Otherwise — Basic heuristic-only perception

---

## 12. Vendor Skills System

**File**: `packages/agent/src/agent/skills/skill-loader.ts`

### Skill Directory Structure

Each vendor has a directory in the PromptStore under `vendors/`:

```
vendors/
├── supabase/
│   ├── meta.json           # Vendor metadata
│   ├── common.md           # Shared guidance for all primitives
│   ├── signup.md           # Signup-specific guidance
│   ├── navigate--api_keys.md  # Parameterized: navigate to API keys
│   ├── create--database.md    # Parameterized: create database
│   └── extract_credentials.md
├── stripe/
│   ├── meta.json
│   └── ...
```

### `meta.json` Schema

```typescript
interface VendorSkillMeta {
  name: string                          // "Supabase"
  urlPattern: string                    // Regex: "supabase\\.com"
  vendorType: 'saas' | 'ecommerce'     // Affects planning heuristics
  requiresAccount: boolean              // Whether signup is needed
  createResources?: string[]            // ["database", "api_key"]
  signupFields?: SignupField[]          // ["email", "password"]
  verificationMethods?: VerificationMethod[]  // ["email"]
}
```

### Skill Matching

Skills are matched by URL against `vendorSkill.urlPattern` (compiled to RegExp, case-insensitive). The first match wins.

### Skill Injection

Two levels of skill injection:

1. **Vendor skills**: Loaded at planning time and provided per-primitive as task description guidance.
2. **Tech skills**: Injected dynamically during the agent loop based on the current page URL (e.g., detecting Cloudflare Turnstile, Google reCAPTCHA).

### Dynamic Credential Generation

Vendor skills' `signupFields` array controls what credentials are dynamically generated:
- `'email'` in signupFields → Generate Mailgun address via email tool
- `'password'` in signupFields → Generate 16-char random password
- `'phone'` in signupFields → Get Twilio phone number via SMS tool

Config env vars (`SIGNUP_EMAIL`, etc.) override dynamic generation.

---

## 13. Key Questions Answered

### Q1: What is the full job lifecycle?

**API POST → pg-boss send → worker fetch → extractParams → processProvisioningJob → provision() → result**

Specifically:
1. **API POST /api/v1/jobs** — App server validates request, resolves userId from email, sends job to `PROVISIONING_QUEUE` via `pgboss.send()`.
2. **Worker poll** — `worker-main.ts` starts `boss.work()` with `batchSize: 1`. Worker dequeues one job at a time.
3. **Param extraction** — `extractParams()` validates required fields (vendorUrl, vendorName, maxSpend, userId) and passes through optional fields.
4. **Job processing** — `processProvisioningJob()` emits lifecycle events and delegates to `provisioningService.provision()`.
5. **Provisioning** — Setup (prompts, skills, credentials, card) → `PrimitiveOrchestrator.execute()` → plan → execute primitives sequentially.
6. **Result persistence** — Final result written to `pgboss.job_results` table. Events already persisted fire-and-forget during execution.

### Q2: What primitives does the orchestrator plan and execute?

Ten primitives organized by purpose:

**Account lifecycle**: `signup`, `login`, `verify_email`, `verify_sms`
**Navigation & creation**: `navigate` (parameterized with `target`), `create` (parameterized with `resource`)
**Credential extraction**: `extract_credentials`
**E-commerce**: `shop`, `checkout`, `extract_order_confirmation`

The LLM planner selects and orders these based on vendor metadata, existing credentials, and planning rules.

### Q3: What parameters in `ProvisioningParams` can we control from the API?

All of them. The `CreateJobRequest` maps directly:

| API Field | ProvisioningParams Field | Required? | Notes |
|---|---|---|---|
| `vendorUrl` | `vendorUrl` | Yes | Target vendor URL |
| `vendorName` | `vendorName` | Yes | Display name |
| `maxSpend` | `maxSpend` | Yes | In cents |
| `userId` | `userId` | Yes (resolved from userEmail) | Better Auth user ID |
| `product` | `product` | No | String or `ProductOrder` object |
| `mode` | `mode` | No | `'provision'` (default), `'ecommerce'`, `'signup'` |
| `shippingAddress` | `shippingAddress` | No | For physical goods |
| `cardProvider` | `cardProvider` | No | Only `'brex'` supported |
| `cardId` | `cardId` | No | Specific card ID |

**Note**: `maxSteps` is accepted by `extractParams` but is **not in the API schema** — it's an internal override. The actual per-primitive step budgets come from `DEFAULT_STEP_BUDGETS`.

### Q4: What does `ProvisioningResult` contain on success vs failure?

**On success** (`success: true`):
```typescript
{
  success: true,
  steps: AgentStep[],           // Full execution trace
  skillsUsed: ["supabase"],     // Vendor skills matched
  usedVendorPrompt: true,
  // Optionally:
  credentials: "api_key: sk-..., account_id: abc123",
  credentialIds: ["cred_123", "cred_456"],
  orderNumber: "ORD-789",       // E-commerce only
  accountEmail: "user@mailgun.domain.com"
}
```

**On failure** (`success: false`):
```typescript
{
  success: false,
  error: "Primitive signup failed evaluation. Account creation form not found.",
  steps: AgentStep[],           // Partial trace up to failure point
  skillsUsed: [],
}
```

Failure can come from:
- `ProvisioningError` in the service → caught, formatted as `{ success: false, error: "..." }`
- Primitive evaluation failure → orchestrator raises `ProvisioningError`
- Fatal `runScopedLoop` error (Anthropic API failure, etc.)

### Q5: How does mode affect the orchestration plan?

The `mode` field (`'provision'`, `'ecommerce'`, `'signup'`) influences the LLM planner's decisions through:

1. **Prompt context**: The mode is passed in the `job.started` event data and available to the planner.
2. **Planning rules**: `prompts.planningRules` contains soft guidance for each mode pattern (e.g., "for ecommerce: shop → checkout → extract_order_confirmation").
3. **Vendor metadata**: `vendorType: 'saas' | 'ecommerce'` in the skill directory further guides primitive selection.

Typical flows by mode:

| Mode | Typical Primitive Sequence |
|---|---|
| `provision` (default) | `signup → verify_email → navigate → create → extract_credentials` |
| `ecommerce` | `signup → verify_email → shop → checkout → extract_order_confirmation` |
| `signup` | `signup → verify_email` (minimal — just create the account) |

The planner is not hard-coded to these sequences — it adapts based on vendor state (e.g., skips signup if credentials exist, skips verify_email if vendor doesn't require it).

### Q6: What is `maxSteps` and how does it bound execution?

`maxSteps` controls the number of Anthropic API call iterations in `runScopedLoop()`. Each primitive gets its own budget:

```typescript
DEFAULT_STEP_BUDGETS = {
  signup: 15,     login: 10,     verify_email: 8,
  verify_sms: 8,  navigate: 5,   create: 12,
  extract_credentials: 5,  shop: 30,
  checkout: 25,   extract_order_confirmation: 5,
}
```

- The loop runs `for (step = 0; step < maxSteps; step++)`.
- Each iteration: one Anthropic API call → process response → execute tools.
- If `max_tokens` truncation occurs, the loop continues without counting as a new step (adds "Continue." prompt).
- When maxSteps is exhausted, the loop exits and the current `finalText` is evaluated.

The **overall job** is bounded by:
- **Sum of primitive step budgets** (varies by plan, typically 30–50 steps).
- **pg-boss expireInSeconds = 600** (10 minutes hard timeout at queue level).
- **pg-boss retryLimit = 1** with 30-second delay (infrastructure crashes only).

### Q7: How do vendor skills influence the agent's behavior?

Vendor skills influence execution at three levels:

1. **Planning**: The `meta.json` metadata (vendorType, requiresAccount, availablePrimitives, createResources) is passed to the LLM planner to inform primitive selection.

2. **Credential generation**: `signupFields` in meta.json controls which credentials are dynamically generated (email, password, phone).

3. **Primitive execution**: Per-primitive `.md` files provide vendor-specific guidance injected into the task description. For example:
   - `signup.md` might describe the exact form fields and button selectors.
   - `navigate--api_keys.md` might describe the navigation path to the API keys page.
   - `common.md` provides general vendor-wide tips (e.g., "wait for Cloudflare challenge").

4. **URL matching**: `urlPattern` is compiled to a RegExp and matched against the vendor URL. The first skill directory with a matching pattern is used. Skills are loaded once per job from S3/filesystem and cached.

5. **Tech skill injection**: Separate from vendor skills, tech skills are matched against the current page URL during the agent loop and injected as `[System Note]` messages. These detect technology-specific patterns (e.g., CAPTCHAs, specific frameworks).

---

## Summary for Integration

For our integration (calling PayClaw from a Vercel AI SDK tool), the key takeaways are:

1. **We don't need to understand orchestration internals** — we only interact with the Jobs API. The entire orchestration (planning, primitives, tools) happens behind the API.

2. **What we control**: `vendorUrl`, `vendorName`, `maxSpend`, `userId` (required) + `product`, `mode`, `shippingAddress`, `cardProvider`, `cardId` (optional).

3. **What we observe**: Job events via SSE stream (see doc 03) and final result via job GET endpoint.

4. **Timing expectations**:
   - Jobs expire after **10 minutes** (hard limit).
   - A typical SaaS provisioning flow uses ~33 steps across 4 primitives.
   - Each step involves an Anthropic API call + browser tool execution = roughly 5–15 seconds per step.
   - Expected wall-clock time: **2–8 minutes** for a full provisioning flow.

5. **Failure modes we'll see through events**:
   - `job.failed` — Agent-level failure (controlled, no retry).
   - Job stuck in `active` past expiry → pg-boss marks `failed` → retried once.
   - `job.completed` with `success: false` in result — provisioning attempted but failed.

6. **Mode selection guidance**: For most SaaS API key provisioning, use `mode: 'provision'` (default). For purchases, use `mode: 'ecommerce'` with `shippingAddress` if physical goods. For account-only setup, use `mode: 'signup'`.
