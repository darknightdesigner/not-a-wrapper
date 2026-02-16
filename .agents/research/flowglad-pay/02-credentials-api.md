# 02 — Credentials API Surface

Research document for the PayClaw Credentials REST API. Covers the list/get/revoke endpoints, the AES-256-GCM encryption model with userId AAD, credential lifecycle, database schema, and agent-side credential tooling.

**Source repo**: `https://github.com/flowglad/provisioning-agent.git`

---

## REST Endpoints

### GET `/api/v1/credentials?userEmail=<email>`

List all active (non-revoked) credentials for a user.

| Aspect | Detail |
|--------|--------|
| Auth | API key via `X-API-Key` header or `Authorization: Bearer <key>` |
| Required | `userEmail` query parameter |
| Response | `{ credentials: StoredCredential[] }` |

**Flow**:

1. `validateApiKey(request)` — timing-safe compare against shared `API_KEY` env var
2. Extract `userEmail` from query params — fail 401 if missing
3. `lookupUserByEmail(userEmail)` — resolve to Better Auth `userId` — fail 401 if not found
4. `service.list(userId)` — query `vault.credentials` WHERE `user_id = $userId AND revoked_at IS NULL`
5. Return `{ credentials }` — array of `StoredCredential` (no encrypted values)

**Error responses**:

| Status | Body | Trigger |
|--------|------|---------|
| 401 | `{ error: string, code: "UNAUTHORIZED" }` | Missing `userEmail`, user not found in Better Auth |
| 500 | `{ error: "Internal server error", code: "INTERNAL_ERROR" }` | DB error, unexpected failure |

---

### GET `/api/v1/credentials/:id?userEmail=<email>`

Retrieve a single credential with its **decrypted value**.

| Aspect | Detail |
|--------|--------|
| Auth | API key + `userEmail` query parameter |
| Response | `CredentialWithValue` (flat JSON, not wrapped) |
| Side effect | Updates `accessed_at` to `NOW()` |

**Flow**:

1. Validate API key
2. Resolve `userEmail` → `userId` via Better Auth
3. Fetch credential row by ID (full row including `encrypted_value`)
4. **Ownership check**: `credential.userId !== userId` → 404 (not 403, intentional)
5. **Revocation check**: `credential.revokedAt` is set → 404
6. **Decrypt**: `encryption.decrypt(credential.encryptedValue, { userId })` — userId is AAD
7. **Update access timestamp**: `SET accessed_at = NOW()` on the row
8. Return `CredentialWithValue` (all `StoredCredential` fields + `value`)

**Error responses**:

| Status | Body | Trigger |
|--------|------|---------|
| 401 | `{ error: string, code: "UNAUTHORIZED" }` | Missing `userEmail`, user not found |
| 404 | `{ error: "Credential not found", code: "NOT_FOUND" }` | Wrong ID, wrong user, or revoked |
| 500 | `{ error: "Internal server error", code: "INTERNAL_ERROR" }` | Decryption failure, DB error |

> **Note**: The GET-by-ID response is returned **flat** (`NextResponse.json(credential)`), not wrapped in `{ credential }`. This differs from the list endpoint which wraps in `{ credentials }`.

---

### DELETE `/api/v1/credentials/:id?userEmail=<email>`

Revoke (soft-delete) a credential.

| Aspect | Detail |
|--------|--------|
| Auth | API key + `userEmail` query parameter |
| Response | `{ success: true }` |
| Side effect | Sets `revoked_at` to `NOW()` |

**Flow**:

1. Validate API key
2. Resolve `userEmail` → `userId` via Better Auth
3. Fetch credential by ID (only `id`, `userId`, `revokedAt` columns)
4. **Ownership check**: `credential.userId !== userId` → 404
5. **Already revoked?**: If `revokedAt` is set, return early (idempotent, still returns success)
6. `UPDATE vault.credentials SET revoked_at = NOW() WHERE id = $id`
7. Return `{ success: true }`

**Error responses**: Same as GET-by-ID (401, 404, 500).

> **Idempotency note**: The app-side service silently succeeds if the credential is already revoked. The agent-side vault returns `CredentialNotFoundError` for already-revoked credentials. The API endpoint uses the app-side behavior.

---

## Data Types

### `StoredCredential` (list response shape)

Returned by the list endpoint. Never includes the encrypted or decrypted value.

```typescript
interface StoredCredential {
  id: string              // format: "cred_<nanoid(16)>"
  userId: string          // Better Auth user ID (owner)
  jobId: string | null    // associated provisioning job ID
  vendorName: string      // e.g., "Stripe", "AWS"
  vendorUrl: string | null
  label: string           // human-readable, e.g., "Stripe Live API Key"
  metadata: Record<string, string> | null
  createdAt: Date         // ISO-8601 when serialized
  accessedAt: Date | null // last time value was decrypted
  expiresAt: Date | null  // optional TTL
  revokedAt: Date | null  // soft-delete timestamp
}
```

### `CredentialWithValue` (get-by-ID response shape)

Extends `StoredCredential` with the decrypted credential value.

```typescript
interface CredentialWithValue extends StoredCredential {
  value: string  // the decrypted plaintext credential
}
```

### `StoreCredentialParams` (agent-side store input)

Used by the agent's `storeCredential` tool when the LLM extracts a credential during provisioning.

```typescript
interface StoreCredentialParams {
  userId: string
  jobId?: string
  vendorName: string
  vendorUrl?: string
  value: string          // plaintext — encrypted before storage
  label: string
  metadata?: Record<string, unknown>
  expiresAt?: Date
}
```

---

## Database Schema

**Table**: `vault.credentials` (separate Postgres `vault` schema, managed by the agent package)

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `text` | PK | — | Format: `cred_<nanoid(16)>` |
| `user_id` | `text` | NOT NULL | — | Better Auth user ID |
| `job_id` | `text` | nullable | — | Links to provisioning job |
| `vendor_name` | `text` | NOT NULL | — | e.g., "Stripe" |
| `vendor_url` | `text` | nullable | — | e.g., "https://stripe.com" |
| `encrypted_value` | `text` | NOT NULL | — | Base64-encoded ciphertext |
| `label` | `text` | NOT NULL | — | Human-readable label |
| `metadata` | `jsonb` | nullable | — | `Record<string, string>` |
| `created_at` | `timestamp` | NOT NULL | `NOW()` | Creation time |
| `accessed_at` | `timestamp` | nullable | — | Last decryption time |
| `expires_at` | `timestamp` | nullable | — | Optional TTL |
| `revoked_at` | `timestamp` | nullable | — | Soft-delete marker |

> **Schema ownership**: The `vault` schema is created and migrated by the **agent** package. The **app** package has a read-only Drizzle reference (`db/external/vaultSchema.ts`) placed intentionally outside `db/schema/` to avoid being picked up by drizzle-kit migrations.

---

## Encryption Model

### Overview

Credentials are encrypted at rest using symmetric encryption with userId as AAD (Additional Authenticated Data). Two implementations exist behind the same `EncryptionService` interface:

| Implementation | Use Case | Key Source | Library |
|---------------|----------|------------|---------|
| **AES-256-GCM** | Local dev / testing | `CREDENTIAL_VAULT_LOCAL_DEV_KEY` env var (64 hex chars = 32 bytes) | `node:crypto` |
| **KMS** | Production | `CREDENTIAL_VAULT_KMS_KEY_ARN` (AWS KMS key ARN) | `@aws-crypto/client-node` |

The agent auto-selects: KMS if `CREDENTIAL_VAULT_KMS_KEY_ARN` is set, otherwise AES-256-GCM.

### AES-256-GCM Wire Format

```
base64( [12-byte IV] [ciphertext] [16-byte auth tag] )
```

- IV: 12 random bytes per encryption
- Auth tag: 16 bytes
- Key: 32-byte AES-256 key from `CREDENTIAL_VAULT_LOCAL_DEV_KEY`

### AAD (Additional Authenticated Data)

Both implementations bind `{ userId }` as encryption context:

```typescript
// On encrypt (agent stores credential):
encryption.encrypt(params.value, { userId: params.userId })

// On decrypt (app retrieves credential):
encryption.decrypt(credential.encryptedValue, { userId })
```

The AAD is serialized deterministically:

```typescript
function buildAad(context?: EncryptionContext): Buffer | undefined {
  if (!context || Object.keys(context).length === 0) return undefined
  return Buffer.from(JSON.stringify(Object.entries(context).sort()))
}
// { userId: "abc123" } → JSON.stringify([["userId","abc123"]])
```

**Security implication**: If the wrong `userId` is supplied during decryption, the GCM auth tag verification fails and decryption throws an `EncryptionError`. This cryptographically binds each credential to its owner — even if an attacker gains read access to the DB, they cannot decrypt credentials for other users without knowing the correct userId to supply as AAD.

### KMS Envelope Encryption (Production)

In production, the AWS Encryption SDK performs envelope encryption:

1. A data key is generated and encrypted with the KMS master key
2. Plaintext is encrypted with the data key
3. Encryption context (`{ userId }`) is bound to the envelope header
4. On decrypt, the context is verified from the message header before returning plaintext

---

## Credential Lifecycle

```
┌──────────┐     storeCredential tool     ┌─────────┐
│ Agent     │ ──────────────────────────── │ created │
│ extracts  │     (during provisioning)    │         │
│ credential│                              └────┬────┘
└──────────┘                                    │
                                                │  GET /credentials/:id
                                                ▼
                                          ┌──────────┐
                                          │ accessed  │  (accessedAt updated)
                                          └────┬─────┘
                                               │
                                               │  repeated GET calls
                                               │  update accessedAt each time
                                               ▼
                                          ┌──────────┐
                                          │ accessed  │  (accessedAt = latest)
                                          └────┬─────┘
                                               │
                                               │  DELETE /credentials/:id
                                               ▼
                                          ┌──────────┐
                                          │ revoked   │  (revokedAt set, excluded
                                          │           │   from list, 404 on get)
                                          └──────────┘
```

### States

| State | Indicator | Visible in list? | GET-by-ID returns value? |
|-------|-----------|-----------------|-------------------------|
| **Created** | `createdAt` set, `accessedAt` null | Yes | Yes |
| **Accessed** | `accessedAt` not null | Yes | Yes (updates `accessedAt`) |
| **Expired** | `expiresAt` < NOW() | Yes (no auto-filter) | Yes (no enforcement) |
| **Revoked** | `revokedAt` not null | **No** (filtered out) | **No** (returns 404) |

> **Important**: `expiresAt` is stored but **not enforced** by the API. Both list and get queries filter only on `revokedAt IS NULL`. Expiration enforcement would need to be added application-side if needed.

---

## Access Tracking

The `accessedAt` column is a **last-access timestamp**, not a full audit trail.

**On every GET-by-ID** (decryption):

```sql
-- App-side (Drizzle)
UPDATE vault.credentials SET accessed_at = NOW() WHERE id = $id

-- Agent-side (raw SQL, identical)
UPDATE vault.credentials SET accessed_at = NOW() WHERE id = $id
```

This overwrites the previous value — there is **no history of all accesses**, only the most recent one.

The agent's `retrieveCredential` tool accepts a `purpose` string parameter (e.g., "Login to Stripe dashboard"), but it is currently unused (`_purpose` parameter in the vault interface). This appears designed for future audit logging but is not yet implemented.

---

## Agent-Side Credential Tools

The provisioning agent has three LLM-callable tools that interact with the credential vault during job execution:

### `storeCredential`

Called by the LLM when it extracts a credential from a provisioned account.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `value` | string | yes | Raw value or secret ref like `{{PASSWORD}}` |
| `label` | string | yes | Human-readable label |
| `vendorName` | string | yes | Vendor name |
| `vendorUrl` | string | no | Vendor URL |

**Behavior**: Resolves secret references via `SecretRegistry`, encrypts with `{ userId }` AAD, stores in `vault.credentials`. Returns `{ success: true, credentialId, label, message }`.

### `retrieveCredential`

Called by the LLM when it needs to use a stored credential (e.g., entering a password in the browser).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `credentialId` | string | yes | Credential ID from store/list |
| `purpose` | string | yes | Why it's being retrieved (audit) |

**Behavior**: Decrypts credential, registers in `SecretRegistry`, returns a **secret reference** (e.g., `{{SECRET_1}}`) — the raw value never reaches the LLM. The LLM uses the reference in browser `type` commands, and the tool registry resolves it to the actual value.

### `listCredentials`

Called by the LLM to find existing credentials for a vendor.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vendorName` | string | yes | Vendor to filter by |

**Behavior**: Returns metadata only (no values) — `{ credentials: [{ credentialId, label, vendorName, createdAt }] }`.

---

## Error Types

Three tagged errors using Effect's `Data.TaggedError`:

```typescript
class CredentialError extends Data.TaggedError('CredentialError')<{
  message: string
  cause?: unknown
}>

class CredentialNotFoundError extends Data.TaggedError('CredentialNotFoundError')<{
  credentialId: string
}>

class UnauthorizedError extends Data.TaggedError('UnauthorizedError')<{
  message: string
}>
```

**Error mapping at API boundary**:

| Tagged Error | HTTP Status | Response Code |
|-------------|-------------|---------------|
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `CredentialNotFoundError` | 404 | `NOT_FOUND` |
| `CredentialError` | 500 | `INTERNAL_ERROR` |
| Any other | 500 | `INTERNAL_ERROR` |

> The shared `EncryptionError` is caught by the service layer and wrapped as `CredentialError` before reaching the API boundary.

---

## Key Questions — Answers

### 1. What fields does `StoredCredential` contain vs `CredentialWithValue`?

**`StoredCredential`** (list response): `id`, `userId`, `jobId`, `vendorName`, `vendorUrl`, `label`, `metadata`, `createdAt`, `accessedAt`, `expiresAt`, `revokedAt`. Notably excludes `encryptedValue` — the select in `list()` explicitly enumerates columns, omitting it.

**`CredentialWithValue`** (get-by-ID response): All of `StoredCredential` plus `value: string` (the decrypted plaintext). The `encryptedValue` is never exposed — it's used internally for decryption then stripped from the response.

### 2. How is userId used as AAD in AES-256-GCM, and what does this mean for our integration?

The userId is passed as `EncryptionContext` (`{ userId }`) to both encrypt and decrypt calls. It's serialized as `JSON.stringify([["userId","<id>"]])` and bound to the ciphertext as GCM AAD.

**For our integration**: We provide `userEmail` as a query parameter. The PayClaw app resolves `userEmail → userId` via Better Auth's `lookupUserByEmail`. The userId is then used for:
1. **Row ownership check**: `credential.userId === userId` (application-level)
2. **Decryption AAD**: Must match the userId used during encryption (cryptographic-level)

We never need to know or manage the userId directly — we just provide the Clerk user's email, and PayClaw handles the mapping.

### 3. What does the revoke flow look like?

Soft-delete via `revokedAt` timestamp:

1. Client sends `DELETE /api/v1/credentials/:id?userEmail=<email>`
2. App resolves email → userId, fetches credential
3. Ownership verified (`credential.userId === userId`)
4. If already revoked → return early with `{ success: true }` (idempotent)
5. `UPDATE vault.credentials SET revoked_at = NOW() WHERE id = $id`
6. Return `{ success: true }`

The encrypted value is **not deleted** — it remains in the DB but is inaccessible: list queries filter `revoked_at IS NULL`, and get-by-ID checks `revokedAt` before decrypting.

### 4. Does the list endpoint exclude revoked credentials by default?

**Yes.** Both the app-side and agent-side implementations filter with `revoked_at IS NULL`:

- App-side: `.where(and(eq(vaultCredentials.userId, userId), isNull(vaultCredentials.revokedAt)))`
- Agent-side: `findAllBy('user_id', StoredCredentialSchema, 'revoked_at IS NULL')`

There is no query parameter to include revoked credentials — they are always excluded from list results.

### 5. What does `accessedAt` tracking mean — is there an access audit trail?

`accessedAt` is a **last-access-only timestamp**, not an audit trail. It's updated to `NOW()` on every GET-by-ID (decryption) call, overwriting the previous value.

There is no access history table or log. The `purpose` parameter on `retrieveCredential` is accepted but unused (`_purpose`), suggesting audit logging is planned but not yet implemented.

The tracking is useful for:
- Showing when a credential was last used
- Identifying stale/unused credentials (where `accessedAt` is old or null)
- Future: could drive credential rotation reminders

---

## Integration Implications for Not A Wrapper

1. **User identity mapping**: We send the Clerk user's email as `?userEmail=`. PayClaw resolves to its own Better Auth user. We may need to ensure the user exists in Better Auth before calling credential endpoints.

2. **Credential retrieval after job completion**: Once a provisioning job completes, credentials are available via `GET /api/v1/credentials?userEmail=`. We can list all credentials or filter by the job ID from the response `jobId` field.

3. **No expiration enforcement**: The API stores `expiresAt` but doesn't enforce it. If we need TTL behavior, we must implement it client-side.

4. **Value exposure**: The decrypted `value` is only returned on `GET /api/v1/credentials/:id`. The list endpoint is safe to call frequently — it never exposes secret values.

5. **Error handling**: Ownership failures return 404 (not 403), so we can't distinguish "credential doesn't exist" from "credential belongs to another user". This is intentional to prevent credential enumeration.

---

*Source files analyzed*:
- `packages/app/app/api/v1/credentials/route.ts`
- `packages/app/app/api/v1/credentials/[id]/route.ts`
- `packages/app/lib/credentials/interface.ts`
- `packages/app/lib/credentials/service.ts`
- `packages/app/lib/credentials/errors.ts`
- `packages/app/db/external/vaultSchema.ts`
- `packages/shared/src/encryption.ts`
- `packages/agent/src/lib/encryption.ts` (KMS implementation)
- `packages/agent/src/lib/credential-vault.ts` (agent-side vault interface)
- `packages/agent/src/lib/credential-vault-pg.ts` (agent-side PG vault)
- `packages/agent/src/agent/tools/credentials.ts` (agent LLM tools)
