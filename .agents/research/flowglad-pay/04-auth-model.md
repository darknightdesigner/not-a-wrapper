# 04 — Auth Model and User Resolution

Research document for the PayClaw (flowglad/provisioning-agent) authentication model, API key validation, user resolution flow, and planned migration path.

**Source repo**: `https://github.com/flowglad/provisioning-agent.git`
**Date**: 2026-02-16

---

## Overview

PayClaw uses a **two-layer auth model**:

1. **API key validation** — a single shared `API_KEY` env var, verified via timing-safe comparison. Every endpoint requires it.
2. **User resolution** — the caller passes `userEmail` (in the request body or query string), which is resolved to a Better Auth user ID via Drizzle lookup. This user ID is then used for scoping (credential encryption AAD, job ownership).

There are no per-user API keys today. All callers share the same key. User identity is conveyed out-of-band via the `userEmail` parameter.

---

## 1. API Key Validation

### Header Extraction

**Source**: `packages/app/lib/api/auth.ts` → `extractApiKey()`

The API key is accepted from two headers, checked in order:

| Priority | Header | Format |
|----------|--------|--------|
| 1st | `X-API-Key` | Raw key value |
| 2nd | `Authorization` | `Bearer <key>` (prefix stripped) |

If `X-API-Key` is present, it wins. `Authorization: Bearer` is only checked as a fallback.

```typescript
function extractApiKey(headers: Headers): string | undefined {
  const xApiKey = headers.get('X-API-Key')
  if (xApiKey) return xApiKey

  const authorization = headers.get('Authorization')
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice(7)
  }

  return undefined
}
```

### Validation Logic

**Source**: `packages/app/lib/api/auth.ts` → `validateApiKey()`

The key is compared against the `API_KEY` environment variable using a timing-safe comparison:

```typescript
export const validateApiKey = (request: Request): Effect.Effect<void, UnauthorizedError> =>
  Effect.gen(function* () {
    const apiKey = extractApiKey(request.headers)
    const expectedKey = process.env['API_KEY']
    if (!apiKey || !expectedKey || !secureCompare(apiKey, expectedKey)) {
      return yield* Effect.fail(new UnauthorizedError({ message: 'Invalid or missing API key' }))
    }
  })
```

Key implementation details:

- **Single shared key**: `process.env['API_KEY']` — one key for all callers.
- **Timing-safe**: Uses `crypto.timingSafeEqual` via a `secureCompare` wrapper.
- **Length mismatch handling**: When buffer lengths differ, a dummy `timingSafeEqual(bufB, bufB)` is executed to maintain constant-time behavior before returning `false`.
- **Failure mode**: Returns `UnauthorizedError` (tagged Effect error) with message `"Invalid or missing API key"`.
- **Missing env var**: If `API_KEY` is not set in the environment, all requests are rejected (the `!expectedKey` check).

### Error Response

All endpoints catch `UnauthorizedError` uniformly:

```json
{
  "error": "Invalid or missing API key",
  "code": "UNAUTHORIZED"
}
```

HTTP status: **401**

---

## 2. User Resolution

### The `AuthDeps` Interface

**Source**: `packages/app/lib/api/auth.ts`

```typescript
export interface AuthDeps {
  getSession: (headers: Headers) => Effect.Effect<{ user?: { id: string } } | null, unknown>
  lookupUserByEmail: (email: string) => Effect.Effect<{ id: string } | undefined, UnauthorizedError>
}
```

Two capabilities:
- `getSession` — resolves a Better Auth session from request headers (currently unused by API endpoints).
- `lookupUserByEmail` — resolves an email address to a Better Auth user ID.

### Live Implementation

**Source**: `packages/app/lib/api/auth-live.ts`

```typescript
export const AuthDepsLive: Layer.Layer<AuthDepsTag> = Layer.succeed(AuthDepsTag, {
  getSession: (headers) =>
    Effect.tryPromise({
      try: () => auth.api.getSession({ headers }),
      catch: () => new Error('session lookup failed'),
    }),

  lookupUserByEmail: (email) =>
    Effect.tryPromise({
      try: () =>
        db
          .select({ id: betterAuthUser.id })
          .from(betterAuthUser)
          .where(eq(betterAuthUser.email, email))
          .then((rows) => rows[0]),
      catch: () => new UnauthorizedError({ message: 'Failed to resolve user' }),
    }),
})
```

Key details:
- `lookupUserByEmail` is a simple Drizzle `SELECT id FROM better_auth_user WHERE email = ?`.
- Returns `{ id: string } | undefined` — `undefined` means no user found.
- On DB errors, wraps as `UnauthorizedError`.
- The `getSession` method exists but is **not used by any v1 API endpoint** — all endpoints use the API key + email pattern.

### How Endpoints Use User Resolution

There are two patterns depending on the endpoint:

#### Pattern A: userEmail in request body (Jobs POST)

**Source**: `packages/app/app/api/v1/jobs/route.ts`

```typescript
// In createJobSchema:
userEmail: z.string().email(),  // required field

// In handler:
const deps = yield* AuthDepsTag
const user = yield* deps.lookupUserByEmail(userEmail)
if (!user) {
  return yield* Effect.fail(
    new UnauthorizedError({ message: `User not found for email: ${userEmail}` })
  )
}
const job = yield* service.create({
  // ...
  userId: user.id,  // resolved Better Auth user ID
})
```

The `userEmail` is a **required** field in the `createJobSchema`. It's resolved to a `userId` before the job is created. The resolved `userId` is passed to pg-boss as part of the job data.

#### Pattern B: userEmail as query param (Credentials endpoints)

**Source**: `packages/app/app/api/v1/credentials/route.ts`, `packages/app/app/api/v1/credentials/[id]/route.ts`

```typescript
// List credentials:
const userEmail = url.searchParams.get('userEmail')
// ... same resolve pattern ...
const credentials = yield* service.list(user.id)

// Get credential by ID:
const userId = yield* resolveUserFromEmail(request)  // helper function
const credential = yield* service.get(id, userId)

// Revoke (DELETE):
const userId = yield* resolveUserFromEmail(request)
yield* service.revoke(id, userId)
```

The credentials endpoints have a shared `resolveUserFromEmail` helper that extracts `userEmail` from query params and resolves it. This userId is critical because it's used as AAD (Additional Authenticated Data) in AES-256-GCM encryption — credentials can only be decrypted with the correct userId.

#### Pattern C: No user resolution (Jobs GET, Jobs GET by ID, Events)

**Source**: `packages/app/app/api/v1/jobs/route.ts` (GET), `packages/app/app/api/v1/jobs/[id]/route.ts`

```typescript
// Jobs list — no user filtering:
// "API keys are currently shared — no per-user filtering."
return validateApiKey(request).pipe(
  Effect.flatMap(() =>
    Effect.gen(function* () {
      const service = yield* JobServiceTag
      const jobs = yield* service.list({ limit, ...(statusParam ? { status: statusParam } : {}) })
      return NextResponse.json({ jobs })
    })
  ),
  // ...
)

// Jobs get by ID — no ownership check:
// "API keys are currently shared — no per-user ownership check."
const job = yield* service.get(id)
```

These endpoints only validate the API key. They do **not** resolve a user or filter by user. Any valid API key holder can list/view all jobs.

---

## 3. Better Auth Configuration

### Auth Setup

**Source**: `packages/app/lib/auth.ts`

```typescript
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.betterAuthUser,
      session: schema.betterAuthSession,
      account: schema.betterAuthAccount,
      verification: schema.betterAuthVerification,
    },
  }),
  emailAndPassword: { enabled: true },
})
```

Key details:
- Uses **Better Auth** (not Clerk, not NextAuth).
- Database adapter: **Drizzle** on PostgreSQL.
- Auth method: **email + password** only (no OAuth providers configured).
- The `auth.api.getSession()` call is available but unused by API routes.

### User Table Schema

**Source**: `packages/app/db/schema/betterAuthSchema.ts`

```typescript
export const betterAuthUser = appSchema.table('better_auth_user', {
  id: text('id').primaryKey(),           // string ID (not UUID type)
  name: text('name').notNull(),
  email: text('email').notNull().unique(), // unique constraint — safe for lookup
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  phoneNumber: text('phone_number').unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

Supporting tables:
- `better_auth_session` — session tokens with userId FK, expiration, IP/user-agent tracking.
- `better_auth_account` — linked accounts with provider IDs, OAuth tokens, passwords.
- `better_auth_verification` — email verification tokens.

All tables live in the `appSchema` (custom Drizzle schema namespace).

---

## 4. Per-Endpoint Auth Summary

| Endpoint | API Key | userEmail Source | User Resolution | User Filtering |
|----------|---------|-----------------|-----------------|----------------|
| `POST /api/v1/jobs` | Required | Body (required) | Yes → userId for job creation | Job created with userId |
| `GET /api/v1/jobs` | Required | Not used | No | **None** — returns all jobs |
| `GET /api/v1/jobs/:id` | Required | Not used | No | **None** — any key holder can view |
| `GET /api/v1/jobs/:id/events` | Required | Not used | No | None |
| `GET /api/v1/jobs/:id/events/stream` | Required | Not used | No | None |
| `GET /api/v1/credentials` | Required | Query param (required) | Yes → userId for list scoping | Filtered by userId |
| `GET /api/v1/credentials/:id` | Required | Query param (required) | Yes → userId for decryption AAD | Scoped by userId (crypto-enforced) |
| `DELETE /api/v1/credentials/:id` | Required | Query param (required) | Yes → userId for ownership | Scoped by userId |

---

## 5. TODO Markers — Per-User API Key Migration

Three TODO comments document the planned migration:

### Jobs POST (`packages/app/app/api/v1/jobs/route.ts`)

```typescript
// In createJobSchema:
// TODO: Remove userEmail once per-user API keys exist — at that point the
// job owner can be derived entirely from the auth context.

// In handler:
// Resolve userEmail → userId. Temporary: once per-user API keys exist,
// the job owner will come from the auth context instead.
```

### Credentials list (`packages/app/app/api/v1/credentials/route.ts`)

```typescript
// TODO: Remove userEmail query param once per-user API keys exist — at that
// point the credential owner can be derived entirely from the auth context.
```

### Credentials by ID (`packages/app/app/api/v1/credentials/[id]/route.ts`)

```typescript
// TODO: Remove userEmail query param once per-user API keys exist — at that
// point the credential owner can be derived entirely from the auth context.
```

### Jobs list and get-by-ID (`packages/app/app/api/v1/jobs/route.ts` GET, `packages/app/app/api/v1/jobs/[id]/route.ts`)

```typescript
// API keys are currently shared — no per-user filtering.
// Add per-user filtering before wider beta.

// API keys are currently shared — no per-user ownership check.
// Add per-user filtering before wider beta.
```

### What the Migration Means

The planned migration will:

1. **Replace shared API key** with per-user API keys (each PayClaw user gets their own key).
2. **Remove `userEmail` parameter** from all endpoints — the user identity will be derived from the API key itself ("from the auth context").
3. **Add per-user filtering** to jobs list/get endpoints — currently any API key holder sees all jobs.
4. **Timeline**: Before "wider beta" — no specific date.

---

## 6. Key Questions Answered

### Q: What header does the API key go in? Both are accepted?

**Yes, both are accepted.** The system checks `X-API-Key` first, then falls back to `Authorization: Bearer <key>`. If `X-API-Key` is present, it takes priority and `Authorization` is not checked.

**Recommendation for Not A Wrapper**: Use `X-API-Key` as the primary header — it's simpler and is what the test suite uses consistently.

### Q: How does `validateApiKey` work?

Single shared `API_KEY` environment variable. Timing-safe comparison via `crypto.timingSafeEqual`. On length mismatch, a dummy comparison is executed to prevent timing leaks. Returns an Effect `UnauthorizedError` on failure. If the `API_KEY` env var is not set, all requests fail.

### Q: How does user resolution work today?

1. Caller provides `userEmail` (in body for job creation, in query param for credentials).
2. `lookupUserByEmail(email)` executes `SELECT id FROM better_auth_user WHERE email = ?`.
3. Returns `{ id: string }` or `undefined`.
4. If `undefined`, the endpoint returns 401 with `"User not found for email: <email>"`.
5. The resolved `userId` is used downstream (job creation, credential scoping/decryption).

**Important**: The user must already exist in PayClaw's Better Auth database. There is no auto-provisioning — if a Not A Wrapper user's Clerk email doesn't have a corresponding Better Auth account, the request will fail with 401.

### Q: What are the TODO markers saying about the planned per-user API key migration?

All TODOs say the same thing: `userEmail` is a temporary parameter that will be removed once per-user API keys exist. At that point, the user identity will be derived "entirely from the auth context" — meaning the API key itself will identify the user. Jobs list/get will add per-user filtering "before wider beta."

### Q: Does the Jobs list endpoint currently filter by user?

**No.** The GET `/api/v1/jobs` endpoint only validates the API key and returns all jobs regardless of who created them. The comment explicitly states: "API keys are currently shared — no per-user filtering." The same is true for GET `/api/v1/jobs/:id` — any valid API key holder can view any job.

### Q: What user identity do we need to provide from Not A Wrapper?

We need to provide the **Clerk user's email address** as the `userEmail` parameter. This email must match an existing `better_auth_user` record in PayClaw's database.

**Identity mapping chain**:

```
Not A Wrapper (Clerk)          PayClaw (Better Auth)
─────────────────────          ─────────────────────
Clerk user.email  ───────────→ userEmail param
                               │
                               ▼
                    SELECT id FROM better_auth_user
                    WHERE email = userEmail
                               │
                               ▼
                    Better Auth userId
                    (used for job ownership,
                     credential AAD, etc.)
```

**Pre-requisite**: PayClaw users must be provisioned in Better Auth with the same email as their Clerk account. This likely requires a one-time user creation step or an onboarding flow.

---

## 7. Integration Implications for Not A Wrapper

### What We Need to Store/Configure

| Item | Where | Purpose |
|------|-------|---------|
| PayClaw API key | `PAYCLAW_API_KEY` env var | Shared key for all API calls |
| PayClaw base URL | `PAYCLAW_BASE_URL` env var | API endpoint (e.g., `https://app.payclaw.com`) |
| User's Clerk email | Runtime (from Clerk session) | Passed as `userEmail` in every request |

### Auth Flow for Our Tool Call

```
1. User triggers PayClaw tool in chat
2. Our API route extracts Clerk user email from session
3. Tool call to PayClaw:
   POST /api/v1/jobs
   X-API-Key: <PAYCLAW_API_KEY>
   Body: { userEmail: "<clerk-email>", vendorUrl: "...", ... }
4. PayClaw validates API key
5. PayClaw resolves email → Better Auth userId
6. Job created with that userId
```

### Risks and Considerations

1. **User existence**: The Clerk email must map to an existing Better Auth user in PayClaw. We need either:
   - A user provisioning API (doesn't exist yet in the public API surface).
   - A manual onboarding step.
   - An auto-registration flow on PayClaw's side.

2. **Email mismatch**: If a user changes their Clerk email, the PayClaw lookup will fail. We need to decide whether to sync email changes or use a more stable identifier.

3. **Shared key risk**: All Not A Wrapper users share the same API key. A compromised key exposes all users' jobs (though credentials are still scoped by userId via AAD encryption). The per-user key migration will mitigate this.

4. **No job filtering**: Until per-user keys land, job list/get endpoints return all jobs. We should filter client-side by the user's email/userId, or only query specific job IDs we created.

5. **Migration impact**: When PayClaw migrates to per-user API keys, we'll need to:
   - Store per-user PayClaw API keys (possibly encrypted in Convex).
   - Remove `userEmail` from request bodies/queries.
   - Update the auth header to use the user-specific key.

---

## Source File Index

| File | Lines | Key Exports |
|------|-------|-------------|
| `packages/app/lib/api/auth.ts` | 50 | `AuthDeps` interface, `AuthDepsTag`, `validateApiKey`, `extractApiKey` |
| `packages/app/lib/api/auth-live.ts` | 27 | `AuthDepsLive` layer (getSession, lookupUserByEmail) |
| `packages/app/lib/auth.ts` | 19 | `auth` (Better Auth instance) |
| `packages/app/db/schema/betterAuthSchema.ts` | 54 | `betterAuthUser`, `betterAuthSession`, `betterAuthAccount`, `betterAuthVerification` |
| `packages/app/app/api/v1/jobs/route.ts` | 196 | POST (create job), GET (list jobs) |
| `packages/app/app/api/v1/jobs/[id]/route.ts` | 50 | GET (single job) |
| `packages/app/app/api/v1/credentials/route.ts` | 57 | GET (list credentials) |
| `packages/app/app/api/v1/credentials/[id]/route.ts` | 110 | GET (single credential), DELETE (revoke) |
| `packages/app/lib/credentials/errors.ts` | 15 | `CredentialError`, `CredentialNotFoundError`, `UnauthorizedError` |
