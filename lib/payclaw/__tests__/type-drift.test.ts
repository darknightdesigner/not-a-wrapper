// lib/payclaw/__tests__/type-drift.test.ts
//
// Compile-time assertions detecting structural drift between the auto-synced
// upstream types (lib/payclaw.ts) and local Zod schemas (lib/payclaw/schemas.ts).
//
// Runs during both `bun run typecheck` and `bun run test`.
// When this file fails to compile, `scripts/sync-payclaw-client.sh` pulled
// upstream changes that require updating the local Zod schemas.

import { describe, it, expectTypeOf } from "vitest"

import type {
  ShippingAddress as UpstreamShippingAddress,
  PaymentMethod as UpstreamPaymentMethod,
  JobStatus as UpstreamJobStatus,
  JobResult as UpstreamJobResult,
  Job as UpstreamJob,
  JobEvent as UpstreamJobEvent,
} from "@/lib/payclaw"

import type {
  ShippingAddress as LocalShippingAddress,
  PaymentMethod as LocalPaymentMethod,
  JobStatus as LocalJobStatus,
  JobResult as LocalJobResult,
  Job as LocalJob,
  JobEvent as LocalJobEvent,
} from "@/lib/payclaw/schemas"

// ---------------------------------------------------------------------------
// Bilateral checks — types that cross trust boundaries in BOTH directions.
// Uses toEqualTypeOf for strict structural equality. Catches:
//   - Field added to either side (including optional fields)
//   - Field removed from either side
//   - Field type changed on either side
// ---------------------------------------------------------------------------

describe("bilateral type drift (app ↔ API)", () => {
  it("ShippingAddress: local ↔ upstream are structurally equivalent", () => {
    expectTypeOf<LocalShippingAddress>().toEqualTypeOf<UpstreamShippingAddress>()
  })

  it("PaymentMethod: local ↔ upstream are structurally equivalent", () => {
    expectTypeOf<LocalPaymentMethod>().toEqualTypeOf<UpstreamPaymentMethod>()
  })

  it("JobStatus: local ↔ upstream are structurally equivalent", () => {
    expectTypeOf<LocalJobStatus>().toEqualTypeOf<UpstreamJobStatus>()
  })
})

// ---------------------------------------------------------------------------
// One-way checks — types that flow FROM the API only (responses).
// Local schemas are intentionally more permissive (extra optional fields,
// nullable wrappers, .passthrough() index signatures). We check that
// upstream's shape is parseable by our schema, not the reverse.
// ---------------------------------------------------------------------------

describe("one-way type drift (API → app responses)", () => {
  it("JobResult: upstream is assignable to local (local is optional wrapper)", () => {
    // Local wraps upstream with .optional() for defensive parsing.
    // Upstream's shape must be accepted by local's parser.
    expectTypeOf<UpstreamJobResult>().toMatchTypeOf<NonNullable<LocalJobResult>>()
  })

  it("JobEvent: upstream is assignable to local", () => {
    expectTypeOf<UpstreamJobEvent>().toMatchTypeOf<LocalJobEvent>()
  })

  // Job has intentional deviations:
  // - Local omits 6 fields: vendorId, vendorSlug, targetUrl, shippingAddress,
  //   paymentMethod, browserProvider (preserved at runtime via .passthrough())
  // - Local makes steps optional (upstream declares required)
  // Full structural match is intentionally NOT checked. Per-field checks on
  // shared fields catch type changes and removals.
  it("Job: shared fields are type-compatible", () => {
    expectTypeOf<UpstreamJob["id"]>().toEqualTypeOf<LocalJob["id"]>()
    expectTypeOf<UpstreamJob["status"]>().toEqualTypeOf<LocalJob["status"]>()
    expectTypeOf<UpstreamJob["createdAt"]>().toEqualTypeOf<LocalJob["createdAt"]>()
    expectTypeOf<UpstreamJob["vendorUrl"]>().toEqualTypeOf<LocalJob["vendorUrl"]>()
    expectTypeOf<UpstreamJob["vendorName"]>().toEqualTypeOf<LocalJob["vendorName"]>()
    expectTypeOf<UpstreamJob["maxSpend"]>().toEqualTypeOf<LocalJob["maxSpend"]>()
  })
})

// ---------------------------------------------------------------------------
// Structural inventory — documents intentional deviations.
// Review this section when upstream types change.
// ---------------------------------------------------------------------------
// Upstream Job fields NOT in local jobSchema (preserved via .passthrough()):
//   - vendorId?: string
//   - vendorSlug?: string
//   - targetUrl?: string
//   - shippingAddress?: ShippingAddress
//   - paymentMethod?: PaymentMethod
//   - browserProvider?: string
//
// Upstream Job.steps is required (AgentStep[]); local is optional.
// Kept optional for defensive parsing — API sometimes omits steps.
//
// Local JobResult wraps upstream with .optional() for defensive parsing.
// No extra fields beyond upstream (as of Feb 19, 2026).
//
// Local PayClawApiError (lib/payclaw/client.ts:27–38) is an independent
// reimplementation of upstream FgpApiError (lib/payclaw.ts:148–158).
// Different name casing, different fields. This is intentional — the local
// client owns its own error contract.
