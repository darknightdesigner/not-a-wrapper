# 07 - Jobs API Contract Baseline

Canonical baseline for our PayClaw integration, verified against upstream source:
`flowglad/provisioning-agent` on `main`, `packages/app`.

- Last verified: 2026-02-18
- Upstream files inspected:
  - `packages/app/app/api/v1/jobs/route.ts`
  - `packages/app/app/api/v1/jobs/[id]/route.ts`
  - `packages/app/app/api/v1/jobs/[id]/events/route.ts`
  - `packages/app/app/api/v1/jobs/[id]/events/stream/route.ts`
  - `packages/app/lib/jobs/types.ts`
  - `packages/app/lib/api/auth.ts`

## Authentication

- API key required via `X-API-Key` (or `Authorization: Bearer`).
- User identity is derived server-side from the API key.
- `userEmail` is not accepted/required by `POST /api/v1/jobs`.

## Create Job Request Schema

`POST /api/v1/jobs` accepts exactly one of these shapes:

- Direct buy:
  - `url: string (url)`
  - `maxSpend: number (int, positive)`
  - `shippingAddress?: { name, line1, line2?, city, state, postalCode, country, phone?, email? }`
  - `paymentMethod?: { type: "brex", cardId: string } | { type: "wex" }`
  - `browserProvider?: "local" | "kernel" | "anchor" | "self_hosted"`
- Indirect buy:
  - `vendor: string (url)`
  - `product: string (min 1)`
  - same optional common fields as above

Notes:

- `userEmail` and `cardId` are legacy for our integration and are not part of the current route validation schema.
- Unknown keys are stripped by upstream Zod parsing, so relying on extras is fragile and should be avoided.

## Core Responses

- `POST /api/v1/jobs` -> `{ jobId: string, status: "created" }`
- `GET /api/v1/jobs/:id` -> full `Job` object
- `GET /api/v1/jobs/:id/events` -> `{ events: JobEvent[] }`
- `GET /api/v1/jobs/:id/events/stream` -> SSE frames:
  - `data: <JobEvent JSON>`
  - `: keepalive`
  - `event: done` + `data: { status, result }`
  - `event: error` + `data: { error }`

## Upstream Job Type Highlights

- Status values: `created | retry | active | completed | failed | cancelled`
- `Job.shippingAddress`, `Job.paymentMethod`, and `Job.browserProvider` are supported.
- `Job.steps` exists upstream and is an array of step history entries.

## Integration Rules for This Repo

1. Build request payloads only through one mapper in `lib/payclaw/client.ts`.
2. Never send legacy auth fields (`userEmail`, `cardId`) in job creation payloads.
3. Keep local Zod schemas aligned with this baseline and refresh this file when upstream changes.
