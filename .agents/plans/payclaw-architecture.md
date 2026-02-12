# PayClaw Architecture — AI-Powered Purchase Agent

> **Status**: Architecture Draft (v2 — revised with actual PayClaw API)
> **Date**: February 12, 2026
> **Team**: PayClaw Engineering
> **Integration Target**: Not A Wrapper (multi-AI chat platform)
> **PayClaw Service**: External API at `/v1/jobs`
> **Card Providers**: Stripe Issuing (dynamic) / Mercury (static)
> **Execution Model**: Fully autonomous — AI "buy button"

---

## Executive Summary

PayClaw is an **external service** that handles virtual card provisioning and browser-based checkout. Not A Wrapper's role is to be the **AI-powered front door**: the AI model interprets user purchase intent, calls a tool that hits PayClaw's Jobs API, and streams status updates back to chat.

Not A Wrapper does NOT handle browser automation, card provisioning, or checkout logic. PayClaw owns all of that. NAW owns:
1. **Tool definition** — Zod schema mapping user intent to PayClaw API params
2. **Shipping address management** — Convex-backed user profile with address
3. **Job orchestration** — POST to create, SSE to stream progress
4. **Audit + history** — Convex records of PayClaw jobs for the chat UI

---

## Table of Contents

1. [Revised User Flow](#1-revised-user-flow)
2. [Architecture Overview](#2-architecture-overview)
3. [PayClaw API Reference](#3-payclaw-api-reference)
4. [API Feedback & Recommendations](#4-api-feedback--recommendations)
5. [Not A Wrapper Integration Layer](#5-not-a-wrapper-integration-layer)
6. [Shipping Address Management](#6-shipping-address-management)
7. [Tool Definitions](#7-tool-definitions)
8. [SSE Job Streaming Strategy](#8-sse-job-streaming-strategy)
9. [Database Schema (Convex)](#9-database-schema-convex)
10. [Security Architecture](#10-security-architecture)
11. [Demo Scope](#11-demo-scope)
12. [Open Questions & Risks](#12-open-questions--risks)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Revised User Flow

```
User: "Buy me this keyboard from Amazon — here's the link: amazon.com/dp/B0C..."
  │
  ▼
AI Model recognizes purchase intent, extracts:
  - vendorUrl: "https://amazon.com/dp/B0C..."
  - vendorName: "Amazon"
  - product: "mechanical keyboard"
  - maxSpend: 7500 (user said "under $75" or AI infers from product)
  │
  ▼
AI calls `payclaw_buy` tool
  │
  ▼
Tool execute() — runs in Not A Wrapper's API route:
  ├── 1. Look up user's shipping address from Convex
  ├── 2. Look up user's email from Clerk auth
  ├── 3. POST /v1/jobs to PayClaw API
  │      {
  │        vendorUrl: "https://amazon.com/dp/B0C...",
  │        vendorName: "Amazon",
  │        userEmail: "user@example.com",
  │        maxSpend: 7500,
  │        product: "mechanical keyboard",
  │        mode: "ecommerce",
  │        shippingAddress: { name, line1, city, state, postalCode, country }
  │      }
  ├── 4. Receive job ID back
  ├── 5. Connect to SSE stream: GET /v1/jobs/:id/events/stream
  ├── 6. Wait for terminal status (completed | failed | cancelled)
  └── 7. Return structured receipt to AI model
  │
  ▼
AI: "Done! I placed your order for the mechanical keyboard on Amazon.
     Job ID: abc-123. PayClaw handled the checkout with a virtual card.
     Status: completed."
```

### Key Difference from v1

PayClaw is **not a product search engine**. The user provides the vendor URL (a product link or a store page), and PayClaw navigates the checkout. The AI's job is to extract the purchase intent and construct the API call — not to search for the product itself.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       NOT A WRAPPER — Chat UI                       │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Chat Thread                                                   │ │
│  │                                                               │ │
│  │  [User]  Buy this for me: amazon.com/dp/B0C...               │ │
│  │          Keep it under $75                                    │ │
│  │                                                               │ │
│  │  [AI]    Using PayClaw to purchase...                        │ │
│  │          ┌──────────────────────────────────┐                │ │
│  │          │ PayClaw Job: abc-123              │                │ │
│  │          │ → Job created                    │                │ │
│  │          │ → Card provisioned               │                │ │
│  │          │ → Navigating checkout             │                │ │
│  │          │ → Order placed                   │                │ │
│  │          │ ✓ Completed — $67.99             │                │ │
│  │          └──────────────────────────────────┘                │ │
│  │          Your order has been placed! PayClaw used a virtual  │ │
│  │          card to complete checkout on Amazon for $67.99.     │ │
│  └───────────────────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   │  POST /api/chat (streamText with tools)
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    app/api/chat/route.ts                             │
│                                                                     │
│  Tool Layers:                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────────────┐ │
│  │ Layer 1  │ │ Layer 2  │ │ Layer 3  │ │ Layer 4: PayClaw       │ │
│  │ Provider │ │ Third-   │ │ MCP      │ │                         │ │
│  │ Search   │ │ Party    │ │ Tools    │ │ payclaw_buy             │ │
│  │ Tools    │ │ (Exa)    │ │          │ │ payclaw_job_status      │ │
│  │          │ │          │ │          │ │ payclaw_jobs_list       │ │
│  └─────────┘ └─────────┘ └─────────┘ └────────────┬────────────┘ │
└────────────────────────────────────────────────────┬────────────────┘
                                                     │
           ┌─────────────────────────────────────────┤
           │                                         │
           ▼                                         ▼
┌────────────────────────┐            ┌────────────────────────────────┐
│  Convex Database       │            │  PayClaw External API          │
│                        │            │  (separate service)            │
│  shippingAddresses     │            │                                │
│  payclawJobs           │            │  POST   /v1/jobs               │
│  payclawUserSettings   │            │  GET    /v1/jobs               │
│                        │            │  GET    /v1/jobs/:id           │
└────────────────────────┘            │  GET    /v1/jobs/:id/events    │
                                      │  GET    /v1/jobs/:id/events/   │
           ┌──────────────────────────│         stream (SSE)           │
           │  PayClaw handles all:    │                                │
           │  • Card provisioning     ├────────────────────────────────┘
           │    (Stripe Issuing /     │
           │     Mercury static)      │
           │  • Browser automation    │
           │  • Checkout navigation   │
           │  • Order placement       │
           │  • Event logging         │
           └──────────────────────────┘
```

### Responsibility Split

| Responsibility | Owner | Notes |
|---------------|-------|-------|
| Purchase intent extraction | AI model (in NAW) | Parse user message into vendor URL, product, max spend |
| Shipping address storage | Not A Wrapper (Convex) | User profile with address CRUD |
| API call to PayClaw | Not A Wrapper (tool execute) | POST /v1/jobs with assembled params |
| Job status streaming | Not A Wrapper (tool execute) | SSE /v1/jobs/:id/events/stream |
| Virtual card provisioning | PayClaw service | Stripe Issuing or Mercury |
| Browser-based checkout | PayClaw service | Headless browser, form filling |
| Order placement | PayClaw service | Final checkout execution |
| Event history | PayClaw service | GET /v1/jobs/:id/events |
| Audit trail (NAW side) | Not A Wrapper (Convex) | Job ID references, user context |

---

## 3. PayClaw API Reference

### POST `/v1/jobs` — Create a job

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `vendorUrl` | `string` | Yes | Must be a valid URL (product page or store) |
| `vendorName` | `string` | Yes | Non-empty (e.g., "Amazon", "Best Buy") |
| `userEmail` | `string` | Yes | Valid email, resolved to userId internally by PayClaw |
| `maxSpend` | `number` | Yes | Positive integer (units TBD — see feedback) |
| `product` | `string` | No | Product name/description for PayClaw's search |
| `mode` | `'provision' \| 'ecommerce'` | No | Defaults to `provision` |
| `shippingAddress` | `ShippingAddress` | No | **Required** if `mode='ecommerce'` |
| `useStaticCard` | `boolean` | No | `true` = Mercury static card, `false` = Stripe Issuing |

**ShippingAddress** fields: `name`, `line1`, `city`, `state`, `postalCode`, `country` (all required), plus optional `line2`, `phone`, `email`.

### GET `/v1/jobs` — List jobs

| Query Param | Type | Required | Notes |
|-------------|------|----------|-------|
| `limit` | `number` | No | Default: 20 |
| `status` | `string` | No | One of: `created`, `retry`, `active`, `completed`, `failed`, `cancelled` |

### GET `/v1/jobs/:id` — Get job by ID

Path param `id` (UUID) only.

### GET `/v1/jobs/:id/events` — Get job events

Path param `id` only. Returns the event history for the job.

### GET `/v1/jobs/:id/events/stream` — SSE stream

Path param `id` only. Streams events via Server-Sent Events, polling every 1s until the job reaches a terminal status.

### Job Status Lifecycle

```
created → active → completed
   │         │
   │         ├──→ failed
   │         │
   │         └──→ cancelled
   │
   └──→ retry → active → ...
```

---

## 4. API Feedback & Recommendations

Based on integrating this into Not A Wrapper's AI tool-calling system, here are recommendations for the PayClaw API:

### 4.1 Clarify `maxSpend` Units

> **Issue**: `maxSpend` is described as "positive integer" but the unit is ambiguous.
>
> **Recommendation**: Document explicitly whether this is **cents** (1500 = $15.00) or **dollars** (15 = $15.00). Cents is the industry standard for payment APIs (Stripe, Rain, Lithic all use cents) and avoids floating-point errors. If currently dollars, consider migrating to cents.
>
> **Impact on NAW**: The AI model needs to know the unit to convert user intent ("under $75") into the correct integer. The tool description must be explicit.

### 4.2 Add `externalId` or `idempotencyKey` Parameter

> **Issue**: If the AI tool `execute()` fails mid-flight (network timeout, serverless restart) after POST succeeds, a retry could create a duplicate job.
>
> **Recommendation**: Accept an optional `idempotencyKey` (UUID) on POST `/v1/jobs`. If a job with the same key already exists, return the existing job instead of creating a new one.
>
> **Implementation**: NAW would generate a UUID per tool call and pass it, making retries safe.

### 4.3 Consider `callbackUrl` or Webhook Support

> **Issue**: The SSE stream is great for real-time, but in a serverless environment (Vercel), maintaining a long-lived SSE connection inside a tool `execute()` may hit the 60s `maxDuration` limit.
>
> **Recommendation**: Add an optional `callbackUrl` parameter on POST `/v1/jobs`. When the job reaches a terminal status, PayClaw POSTs the result to the callback URL. This lets NAW's tool `execute()` return immediately with the job ID, and a webhook handler picks up the final result.
>
> **Alternative**: The current SSE approach works if most jobs complete within ~30s. NAW can poll as a fallback.

### 4.4 Strengthen `product` for Ecommerce Mode

> **Issue**: `product` is optional even in `ecommerce` mode. If the vendor URL is a store homepage (e.g., `https://amazon.com`) rather than a product page, PayClaw needs the product description to know what to buy.
>
> **Recommendation**: Either (a) make `product` required when `mode='ecommerce'`, or (b) validate that `vendorUrl` points to a specific product page (not a homepage) when `product` is omitted.
>
> **Impact on NAW**: The AI tool description should guide the model to always extract a product name when the URL is a store homepage vs. a direct product link.

### 4.5 Add `userId` as Alternative to `userEmail`

> **Issue**: In a server-to-server integration, NAW already has the user ID from Clerk auth. Looking up the email just to pass it to PayClaw (which then resolves it back to a user ID) adds unnecessary round-trips.
>
> **Recommendation**: Accept either `userEmail` or `userId` (PayClaw's internal ID). For first-time users, `userEmail` triggers user creation; for returning users, `userId` is more efficient.
>
> **Alternative**: A one-time user registration endpoint that maps NAW's Clerk userId to PayClaw's userId, then use the PayClaw userId going forward.

### 4.6 Return `estimatedDuration` on Job Creation

> **Issue**: NAW's tool `execute()` needs to know how long to wait for the SSE stream before timing out. Different merchants may take different amounts of time.
>
> **Recommendation**: Include `estimatedDurationMs` in the POST response, so NAW can set an appropriate timeout on the SSE listener.

### 4.7 Event Schema Standardization

> **Issue**: The events endpoint returns history, but the event schema is not documented.
>
> **Recommendation**: Document the event types and their payloads. For NAW's tool result, we need to know which event fields to surface to the AI model (e.g., `event.type`, `event.message`, `event.amountCharged`).
>
> Suggested event types:
> ```
> job.created      → { jobId, vendorName, maxSpend }
> card.provisioned → { cardLast4, cardType }
> checkout.started → { vendorUrl }
> checkout.progress → { step, message }  // "Filling shipping form", "Entering payment"
> order.placed     → { orderId, amountCharged, productName }
> job.completed    → { orderId, amountCharged, receipt }
> job.failed       → { errorCode, errorMessage, retryable }
> job.cancelled    → { reason }
> ```

---

## 5. Not A Wrapper Integration Layer

### 5.1 Directory Structure

```
lib/payclaw/
├── index.ts              # Public API exports
├── client.ts             # PayClaw API client (typed HTTP calls)
├── tools.ts              # AI tool definitions (Zod schemas + execute functions)
├── types.ts              # TypeScript types mirroring PayClaw API
└── __tests__/
    ├── client.test.ts    # API client unit tests
    └── tools.test.ts     # Tool definition tests

convex/
├── shippingAddresses.ts  # User shipping address CRUD
├── payclawJobs.ts        # Job reference storage (NAW-side audit)
└── payclawSettings.ts    # User PayClaw preferences

app/
├── api/payclaw/
│   └── webhook/route.ts  # (Future) PayClaw callback webhook handler
└── components/
    └── payclaw/
        ├── shipping-address-form.tsx   # Address entry/edit UI
        └── job-status-card.tsx         # In-chat job progress rendering
```

### 5.2 PayClaw API Client (`lib/payclaw/client.ts`)

```typescript
// lib/payclaw/client.ts

import type {
  CreateJobParams,
  CreateJobResponse,
  Job,
  JobEvent,
  ListJobsParams,
} from "./types"

/**
 * Typed HTTP client for the PayClaw Jobs API.
 *
 * All browser automation, card provisioning, and checkout logic
 * lives in the PayClaw service. This client is a thin wrapper
 * over fetch() with type safety and error handling.
 */
export class PayClawClient {
  private baseUrl: string
  private apiKey: string

  constructor(config: { baseUrl: string; apiKey: string }) {
    this.baseUrl = config.baseUrl
    this.apiKey = config.apiKey
  }

  /**
   * Create a purchase job.
   * PayClaw provisions a virtual card and executes checkout.
   */
  async createJob(params: CreateJobParams): Promise<CreateJobResponse> {
    const res = await fetch(`${this.baseUrl}/v1/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`PayClaw createJob failed (${res.status}): ${body}`)
    }
    return res.json()
  }

  /**
   * Get a job by ID.
   */
  async getJob(jobId: string): Promise<Job> {
    const res = await fetch(`${this.baseUrl}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    if (!res.ok) throw new Error(`PayClaw getJob failed (${res.status})`)
    return res.json()
  }

  /**
   * List jobs with optional filters.
   */
  async listJobs(params?: ListJobsParams): Promise<Job[]> {
    const query = new URLSearchParams()
    if (params?.limit) query.set("limit", String(params.limit))
    if (params?.status) query.set("status", params.status)

    const res = await fetch(`${this.baseUrl}/v1/jobs?${query}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    if (!res.ok) throw new Error(`PayClaw listJobs failed (${res.status})`)
    return res.json()
  }

  /**
   * Get event history for a job.
   */
  async getJobEvents(jobId: string): Promise<JobEvent[]> {
    const res = await fetch(`${this.baseUrl}/v1/jobs/${jobId}/events`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    if (!res.ok) throw new Error(`PayClaw getJobEvents failed (${res.status})`)
    return res.json()
  }

  /**
   * Stream job events via SSE until terminal status.
   *
   * Returns the final event (completed/failed/cancelled) once the
   * stream closes. Throws on timeout.
   *
   * @param jobId - Job UUID
   * @param options.timeoutMs - Max time to wait (default: 55s for serverless)
   * @param options.onEvent - Optional callback for real-time progress
   */
  async streamJobUntilDone(
    jobId: string,
    options: {
      timeoutMs?: number
      onEvent?: (event: JobEvent) => void
    } = {}
  ): Promise<Job> {
    const { timeoutMs = 55_000, onEvent } = options

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`PayClaw job ${jobId} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )

      const eventSource = new EventSource(
        `${this.baseUrl}/v1/jobs/${jobId}/events/stream`,
        // Note: EventSource doesn't support custom headers natively.
        // May need to use a polyfill or fetch-based SSE for auth.
        // See section 8 for alternatives.
      )

      eventSource.onmessage = (event) => {
        try {
          const parsed: JobEvent = JSON.parse(event.data)
          onEvent?.(parsed)

          // Check for terminal status
          if (["completed", "failed", "cancelled"].includes(parsed.status)) {
            clearTimeout(timeout)
            eventSource.close()
            // Fetch final job state for complete data
            this.getJob(jobId).then(resolve).catch(reject)
          }
        } catch (err) {
          // Non-fatal: log and continue listening
          console.warn("[PayClaw] Failed to parse SSE event:", err)
        }
      }

      eventSource.onerror = () => {
        clearTimeout(timeout)
        eventSource.close()
        // Fallback: poll the job status
        this.getJob(jobId).then(resolve).catch(reject)
      }
    })
  }
}
```

### 5.3 Types (`lib/payclaw/types.ts`)

```typescript
// lib/payclaw/types.ts

/** Mirrors PayClaw POST /v1/jobs request body */
export interface CreateJobParams {
  vendorUrl: string
  vendorName: string
  userEmail: string
  maxSpend: number             // Units TBD (cents recommended)
  product?: string
  mode?: "provision" | "ecommerce"
  shippingAddress?: ShippingAddress
  useStaticCard?: boolean
}

export interface ShippingAddress {
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

export type JobStatus =
  | "created"
  | "retry"
  | "active"
  | "completed"
  | "failed"
  | "cancelled"

/** PayClaw job object */
export interface Job {
  id: string                   // UUID
  vendorUrl: string
  vendorName: string
  userEmail: string
  maxSpend: number
  product?: string
  mode: "provision" | "ecommerce"
  status: JobStatus
  // Fields populated on completion:
  amountCharged?: number
  orderId?: string
  errorMessage?: string
  createdAt: string            // ISO 8601
  updatedAt: string
}

export interface CreateJobResponse {
  id: string
  status: JobStatus
}

export interface JobEvent {
  type: string                 // Event type (e.g., "card.provisioned", "order.placed")
  status: JobStatus            // Current job status at time of event
  message?: string             // Human-readable description
  data?: Record<string, unknown>
  timestamp: string            // ISO 8601
}

export interface ListJobsParams {
  limit?: number
  status?: JobStatus
}
```

---

## 6. Shipping Address Management

Not A Wrapper must manage shipping addresses because PayClaw expects them in the API call. This is a new user-facing feature in NAW.

### 6.1 User Flow

1. User navigates to **Settings > Shipping Address** (new section)
2. User enters/edits their shipping address
3. Address is saved to Convex (`shippingAddresses` table)
4. When the AI calls `payclaw_buy`, the address is fetched from Convex and included in the job

### 6.2 Convex Schema

```typescript
// convex/schema.ts — addition

shippingAddresses: defineTable({
  userId: v.string(),          // Clerk user ID
  label: v.string(),           // "Home", "Work", "Other"
  isDefault: v.boolean(),      // Default address for PayClaw
  name: v.string(),
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  postalCode: v.string(),
  country: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_default", ["userId", "isDefault"]),
```

### 6.3 Address Validation

Before submitting a job with `mode: 'ecommerce'`, the tool must verify:

```typescript
// In tool execute():
const address = await getDefaultShippingAddress(userId, convexToken)
if (!address) {
  throw new Error(
    "No shipping address on file. Please add a shipping address " +
    "in Settings before making purchases."
  )
}
```

---

## 7. Tool Definitions

```typescript
// lib/payclaw/tools.ts

import { z } from "zod"
import { tool, type ToolSet } from "ai"
import type { ToolMetadata, ToolResultEnvelope } from "@/lib/tools/types"
import { PayClawClient } from "./client"
import type { ShippingAddress } from "./types"
import { fetchQuery } from "convex/nextjs"
import { api } from "@/convex/_generated/api"

type PayClawToolsConfig = {
  userId: string
  userEmail: string
  convexToken: string
}

type PayClawToolsResult = {
  tools: ToolSet
  metadata: Map<string, ToolMetadata>
}

export async function getPayClawTools(
  config: PayClawToolsConfig
): Promise<PayClawToolsResult> {
  const client = new PayClawClient({
    baseUrl: process.env.PAYCLAW_API_URL!,
    apiKey: process.env.PAYCLAW_API_KEY!,
  })

  const tools: ToolSet = {
    // ─────────────────────────────────────────────────────────
    // payclaw_buy — The core "buy button" tool
    // ─────────────────────────────────────────────────────────
    payclaw_buy: tool({
      description:
        "Purchase a product using PayClaw, an AI-powered checkout agent. " +
        "PayClaw provisions a virtual card and completes checkout on the " +
        "vendor's website. Provide the vendor URL (product page or store), " +
        "vendor name, and maximum spend amount. Use mode 'ecommerce' for " +
        "physical goods that need shipping. Use mode 'provision' for " +
        "digital goods, subscriptions, or services.",
      parameters: z.object({
        vendorUrl: z
          .string()
          .url()
          .describe(
            "The vendor's URL — ideally a direct product page link. " +
            "Example: 'https://amazon.com/dp/B0C...' or 'https://bestbuy.com/product/...'"
          ),
        vendorName: z
          .string()
          .min(1)
          .describe("Vendor/merchant name (e.g., 'Amazon', 'Best Buy')"),
        maxSpend: z
          .number()
          .int()
          .positive()
          .describe(
            "Maximum amount to spend in cents. " +
            "Example: 7500 for a $75 budget. Must be a positive integer."
          ),
        product: z
          .string()
          .optional()
          .describe(
            "Product name or description. Helps PayClaw identify the " +
            "correct item if the URL is a store page rather than a direct " +
            "product link. Example: 'Logitech MX Keys keyboard'"
          ),
        mode: z
          .enum(["provision", "ecommerce"])
          .default("ecommerce")
          .describe(
            "'ecommerce' for physical goods (requires shipping address). " +
            "'provision' for digital goods, subscriptions, or SaaS."
          ),
      }),
      execute: async ({
        vendorUrl,
        vendorName,
        maxSpend,
        product,
        mode,
      }): Promise<ToolResultEnvelope> => {
        const startMs = Date.now()

        // Resolve shipping address for ecommerce mode
        let shippingAddress: ShippingAddress | undefined
        if (mode === "ecommerce") {
          const address = await fetchQuery(
            api.shippingAddresses.getDefault,
            {},
            { token: config.convexToken }
          )
          if (!address) {
            throw new Error(
              "No shipping address on file. Please add a shipping address " +
              "in your account settings before making purchases."
            )
          }
          shippingAddress = {
            name: address.name,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country,
            phone: address.phone,
            email: address.email,
          }
        }

        // Create the PayClaw job
        const job = await client.createJob({
          vendorUrl,
          vendorName,
          userEmail: config.userEmail,
          maxSpend,
          product,
          mode,
          shippingAddress,
        })

        // Stream events until job reaches terminal status.
        // If SSE times out, fall back to polling.
        let finalJob
        try {
          finalJob = await client.streamJobUntilDone(job.id, {
            timeoutMs: 50_000,  // 50s (buffer for 60s serverless limit)
          })
        } catch {
          // Timeout or SSE failure — poll once for final status
          finalJob = await client.getJob(job.id)
        }

        const durationMs = Date.now() - startMs

        // Job may still be in progress if we timed out
        if (finalJob.status === "completed") {
          return {
            ok: true,
            data: {
              jobId: finalJob.id,
              status: finalJob.status,
              vendorName: finalJob.vendorName,
              product: finalJob.product,
              amountCharged: finalJob.amountCharged,
              orderId: finalJob.orderId,
            },
            error: null,
            meta: {
              tool: "payclaw_buy",
              source: "payclaw",
              durationMs,
            },
          }
        }

        if (finalJob.status === "failed") {
          throw new Error(
            `PayClaw purchase failed: ${finalJob.errorMessage ?? "Unknown error"}. ` +
            `Job ID: ${finalJob.id}`
          )
        }

        // Job still in progress (timeout scenario)
        return {
          ok: true,
          data: {
            jobId: finalJob.id,
            status: finalJob.status,
            message:
              "Purchase is still in progress. You can check the status " +
              "using the job ID. PayClaw is handling the checkout.",
          },
          error: null,
          meta: {
            tool: "payclaw_buy",
            source: "payclaw",
            durationMs,
          },
        }
      },
    }),

    // ─────────────────────────────────────────────────────────
    // payclaw_job_status — Check status of a specific job
    // ─────────────────────────────────────────────────────────
    payclaw_job_status: tool({
      description:
        "Check the status of a PayClaw purchase job. " +
        "Use when a previous purchase is still in progress " +
        "or the user asks about a specific order.",
      parameters: z.object({
        jobId: z.string().uuid().describe("The PayClaw job UUID"),
      }),
      execute: async ({ jobId }): Promise<ToolResultEnvelope> => {
        const startMs = Date.now()
        const job = await client.getJob(jobId)
        const events = await client.getJobEvents(jobId)

        return {
          ok: true,
          data: {
            jobId: job.id,
            status: job.status,
            vendorName: job.vendorName,
            product: job.product,
            amountCharged: job.amountCharged,
            orderId: job.orderId,
            errorMessage: job.errorMessage,
            recentEvents: events.slice(-5).map((e) => ({
              type: e.type,
              message: e.message,
              timestamp: e.timestamp,
            })),
          },
          error: null,
          meta: {
            tool: "payclaw_job_status",
            source: "payclaw",
            durationMs: Date.now() - startMs,
          },
        }
      },
    }),

    // ─────────────────────────────────────────────────────────
    // payclaw_jobs_list — Recent purchase history
    // ─────────────────────────────────────────────────────────
    payclaw_jobs_list: tool({
      description:
        "List recent PayClaw purchase jobs. " +
        "Shows recent orders with their status and amounts.",
      parameters: z.object({
        limit: z.number().int().min(1).max(20).default(5),
        status: z
          .enum(["created", "retry", "active", "completed", "failed", "cancelled"])
          .optional()
          .describe("Filter by job status"),
      }),
      execute: async ({ limit, status }): Promise<ToolResultEnvelope> => {
        const startMs = Date.now()
        const jobs = await client.listJobs({ limit, status })

        return {
          ok: true,
          data: jobs.map((job) => ({
            jobId: job.id,
            status: job.status,
            vendorName: job.vendorName,
            product: job.product,
            amountCharged: job.amountCharged,
            orderId: job.orderId,
            createdAt: job.createdAt,
          })),
          error: null,
          meta: {
            tool: "payclaw_jobs_list",
            source: "payclaw",
            durationMs: Date.now() - startMs,
            resultCount: jobs.length,
          },
        }
      },
    }),
  }

  const metadata = new Map<string, ToolMetadata>([
    ["payclaw_buy", {
      displayName: "PayClaw Buy",
      source: "third-party",
      serviceName: "PayClaw",
      icon: "wrench",
      readOnly: false,   // WRITE — creates a job, charges a card
    }],
    ["payclaw_job_status", {
      displayName: "PayClaw Job Status",
      source: "third-party",
      serviceName: "PayClaw",
      readOnly: true,    // READ — safe at any step
    }],
    ["payclaw_jobs_list", {
      displayName: "PayClaw Jobs List",
      source: "third-party",
      serviceName: "PayClaw",
      readOnly: true,    // READ — safe at any step
    }],
  ])

  return { tools, metadata }
}
```

---

## 8. SSE Job Streaming Strategy

### 8.1 The Timeout Challenge

PayClaw's SSE endpoint streams events until the job reaches a terminal status. But Not A Wrapper runs on Vercel serverless with `maxDuration = 60`. The tool `execute()` must return within this window.

### 8.2 Strategy: Stream with Fallback to Poll

```
Tool execute() called
  │
  ├── POST /v1/jobs → get jobId           ~1-2s
  │
  ├── Connect SSE /v1/jobs/:id/events/stream
  │   └── Listen for events, timeout at 50s
  │       │
  │       ├── Terminal event received ─────→ Return final result
  │       │   (completed/failed/cancelled)
  │       │
  │       └── Timeout at 50s ──────────────→ Fall back to GET /v1/jobs/:id
  │                                           └── Return current status
  │                                               (may be "active" — still in progress)
  │
  └── AI model receives result
      ├── If completed: "Your order has been placed!"
      ├── If failed: "The purchase failed because..."
      └── If still active: "Purchase is in progress, job ID: abc-123.
                            I can check the status again if you'd like."
```

### 8.3 EventSource Auth Issue

The standard `EventSource` API does **not** support custom headers (no `Authorization`). Options:

| Approach | Pros | Cons |
|----------|------|------|
| **Query param token**: `/events/stream?token=xxx` | Simple, works with EventSource | Token in URL (logged, cached) |
| **Fetch-based SSE**: Parse `ReadableStream` manually | Full header control | More code, no auto-reconnect |
| **Cookie auth**: Set auth cookie before SSE | Works with EventSource | Requires cookie setup flow |

**Recommendation**: Use fetch-based SSE (parse the readable stream) since this runs server-side in the tool `execute()`. No browser involved.

```typescript
// Fetch-based SSE reader (server-side)
async function* streamSSE(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop()!
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        yield JSON.parse(line.slice(6))
      }
    }
  }
}
```

---

## 9. Database Schema (Convex)

```typescript
// convex/schema.ts — additions

// Shipping addresses (managed by Not A Wrapper)
shippingAddresses: defineTable({
  userId: v.string(),
  label: v.string(),            // "Home", "Work", etc.
  isDefault: v.boolean(),
  name: v.string(),
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  postalCode: v.string(),
  country: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_default", ["userId", "isDefault"]),

// PayClaw job references (NAW-side audit trail)
// The source of truth for job data is PayClaw's API.
// This table stores references for fast local lookups and chat history.
payclawJobs: defineTable({
  userId: v.string(),
  chatId: v.id("chats"),
  toolCallId: v.string(),
  payclawJobId: v.string(),     // PayClaw job UUID
  vendorName: v.string(),
  vendorUrl: v.string(),
  product: v.optional(v.string()),
  maxSpend: v.number(),
  mode: v.union(v.literal("provision"), v.literal("ecommerce")),
  lastKnownStatus: v.string(),  // Cached status from last API call
  amountCharged: v.optional(v.number()),
  orderId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_chat", ["chatId"])
  .index("by_payclaw_job", ["payclawJobId"]),

// PayClaw user settings
payclawSettings: defineTable({
  userId: v.string(),
  enabled: v.boolean(),
  defaultMaxSpend: v.number(),  // Default maxSpend when user doesn't specify
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"]),
```

---

## 10. Security Architecture

### 10.1 What Changed from v1

PayClaw-as-a-service means **Not A Wrapper never handles card data**. The security boundary moved:

| Concern | v1 (NAW handles cards) | v2 (PayClaw service) |
|---------|------------------------|----------------------|
| Card numbers | In NAW's execute() boundary | Never touches NAW |
| PCI scope | NAW may need SAQ assessment | NAW is out of PCI scope |
| Browser automation | NAW manages Browserbase sessions | PayClaw manages internally |
| Card provisioning | NAW calls Rain.xyz/Stripe directly | PayClaw provisions cards |

### 10.2 NAW's Security Responsibilities

| Responsibility | Implementation |
|---------------|---------------|
| **PayClaw API key security** | Stored as env var, never exposed to client or AI model |
| **User authentication** | Gate PayClaw tools on `isAuthenticated` |
| **Shipping address encryption** | Convex handles at-rest encryption |
| **No PII in AI context** | Tool result contains only job status, no shipping details |
| **Spend limits** | Validate `maxSpend` against user's configured limits before calling API |
| **Audit trail** | Log job references to Convex `payclawJobs` table |

### 10.3 Data the AI Model Sees

```
✅  jobId, status, vendorName, product, amountCharged, orderId
✅  "Your order is being processed" (event messages)

❌  Shipping address details (only used in API call, not returned)
❌  Card numbers, CVV, expiry (PayClaw handles internally)
❌  PayClaw API keys
❌  User email (used in API call, not in tool result)
```

---

## 11. Demo Scope

### 11.1 MVP for Demo

| Feature | Included | Notes |
|---------|----------|-------|
| `payclaw_buy` tool definition | Yes | Zod schema, execute with API call |
| `payclaw_job_status` tool | Yes | Check existing job |
| `payclaw_jobs_list` tool | Yes | Recent history |
| PayClaw API client | Yes | Typed HTTP client |
| Shipping address in Convex | Yes | Simple form + Convex storage |
| SSE job streaming | Yes | With timeout fallback |
| Tool injection in route.ts | Yes | Layer 4, gated on auth |
| `payment` capability flag | Yes | In `ToolCapabilities` |

### 11.2 NOT in Demo

| Feature | Phase | Notes |
|---------|-------|-------|
| Shipping address entry UI | Post-demo | Pre-seed address via Convex dashboard for demo |
| PayClaw webhook handler | Post-demo | SSE + poll is sufficient for demo |
| User-configurable spend limits | Post-demo | Hard-code defaults |
| Job progress rendering in chat UI | Post-demo | Standard tool-call card is fine |
| Multiple shipping addresses | Post-demo | Single default address |

### 11.3 Demo Script

```markdown
## Demo: PayClaw Buy Button in Not A Wrapper

### Pre-Demo Setup
1. PayClaw API URL + key in .env
2. User's shipping address pre-seeded in Convex shippingAddresses table
3. PayClaw settings enabled for demo user
4. Select a tool-capable model (Claude Sonnet, GPT-4o, etc.)

### Demo Flow
1. Open Not A Wrapper chat
2. Type: "I want to buy this from Amazon: [paste product URL]. Keep it under $50."
3. AI recognizes purchase intent → calls payclaw_buy tool
4. Tool hits PayClaw API → streams job events → returns result
5. AI responds: "Your order has been placed via PayClaw! [details]"
6. Follow up: "What's the status of my last purchase?"
7. AI calls payclaw_job_status → returns current state

### If PayClaw Job Takes Too Long (>50s)
AI responds: "I've started the purchase (Job ID: abc-123). PayClaw is
still processing the checkout. Would you like me to check the status?"
```

---

## 12. Open Questions & Risks

### 12.1 Revised Open Questions

| # | Question | Impact | Notes |
|---|----------|--------|-------|
| 1 | **`maxSpend` units** — cents or dollars? | Tool schema description, AI conversion logic | See API feedback section 4.1 |
| 2 | **SSE auth mechanism** — How does the stream endpoint authenticate? | Client implementation | See section 8.3 |
| 3 | **Event schema** — What fields do SSE events contain? | Tool result formatting | See API feedback section 4.7 |
| 4 | **Idempotency** — Can we safely retry a failed POST /v1/jobs? | Error recovery in tool execute() | See API feedback section 4.2 |
| 5 | **Job timeout** — How long do typical jobs take? | SSE timeout calibration | Need benchmarks from PayClaw team |
| 6 | **Multi-user isolation** — Does listing jobs filter by `userEmail`? | Security — user A shouldn't see user B's jobs | Need API confirmation |
| 7 | **`useStaticCard`** — When should NAW choose Mercury vs Stripe Issuing? | Tool parameter or auto-decided by PayClaw? | Clarify with team |

### 12.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Serverless timeout** — job exceeds 60s | Medium | Medium | SSE with 50s timeout + poll fallback + "still processing" UX |
| **PayClaw API downtime** | Low | High | Graceful error message, don't crash chat |
| **No shipping address on file** | Medium | Low | Clear error message guiding user to settings |
| **AI hallucinates vendor URL** | Medium | Medium | Zod `.url()` validation catches invalid URLs; PayClaw validates server-side |
| **Double purchase** — retry creates duplicate job | Low | High | Recommend idempotency key (section 4.2) |
| **Cost transparency** — user doesn't know actual charge amount | Medium | Medium | Return `amountCharged` in tool result for AI to report |

---

## 13. Implementation Phases

### Phase 1: Foundation (3-4 days)

- [ ] Create `lib/payclaw/` directory structure
- [ ] Implement `PayClawClient` (`client.ts`) with typed API calls
- [ ] Implement `types.ts` mirroring PayClaw API
- [ ] Implement `tools.ts` with three tool definitions
- [ ] Add `payment` flag to `ToolCapabilities` in `lib/tools/types.ts`
- [ ] Add PayClaw tool injection block in `app/api/chat/route.ts`
- [ ] Add Convex schema: `shippingAddresses`, `payclawJobs`, `payclawSettings`
- [ ] Add environment variables to `.env.example`

### Phase 2: Shipping Address (2-3 days)

- [ ] Convex functions: `shippingAddresses.create`, `shippingAddresses.getDefault`
- [ ] Basic settings UI for shipping address entry (or seed via Convex dashboard for demo)
- [ ] Validation: ensure address exists before creating ecommerce jobs

### Phase 3: SSE + Integration (2-3 days)

- [ ] Implement fetch-based SSE reader in `client.ts`
- [ ] Wire `streamJobUntilDone()` into `payclaw_buy` execute
- [ ] Implement timeout + poll fallback
- [ ] Add NAW-side audit logging (`payclawJobs` table)
- [ ] End-to-end test: chat → tool call → PayClaw API → result in chat

### Phase 4: Polish + Demo (2 days)

- [ ] Error messages for all failure modes
- [ ] `prepareStep` threshold consideration for PayClaw flows
- [ ] Demo script walkthrough
- [ ] PostHog events for PayClaw tool calls (leverages existing `tool_call` event)

---

## Environment Variables

```bash
# PayClaw API
PAYCLAW_API_URL=            # PayClaw service base URL (e.g., https://api.payclaw.com)
PAYCLAW_API_KEY=            # PayClaw API key for server-to-server auth
```

---

## Key Takeaways for the Team

1. **PayClaw is an external service — NAW is the AI glue layer.** NAW defines tools, manages shipping addresses, calls the PayClaw API, and reports results to the user in chat. All browser automation and card logic lives in PayClaw.

2. **Three tools, not one.** `payclaw_buy` (write), `payclaw_job_status` (read), and `payclaw_jobs_list` (read). The read tools survive the `prepareStep` restriction and let the AI check on purchases at any point.

3. **SSE streaming is the real-time backbone.** PayClaw's `/events/stream` endpoint gives NAW live progress updates during checkout. The 50s timeout with poll fallback handles the serverless constraint.

4. **NAW never touches card data.** The security boundary is the PayClaw API. NAW sends a job request; PayClaw handles cards internally. NAW is out of PCI scope.

5. **Shipping addresses are a new NAW feature.** This is the one piece of user data NAW needs to manage. A simple Convex table + settings UI covers it.

6. **The API needs a few improvements before production.** See section 4 — idempotency keys, `maxSpend` unit clarification, event schema docs, and SSE auth are the critical items.

---

*Architecture v2 — revised with actual PayClaw Jobs API.*
*Previous version (v1) assumed NAW handled browser automation directly.*
