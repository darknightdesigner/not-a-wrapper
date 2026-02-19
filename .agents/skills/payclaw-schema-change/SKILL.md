---
name: payclaw-schema-change
description: Propagate PayClaw schema changes across all stack layers (Zod schemas, client, tool registration, route mapping, Convex, form payloads, drift tests). Use when adding/removing/modifying any field in ShippingAddress, PaymentMethod, Job, JobResult, or PayClawToolInput, or when type drift tests fail after an upstream sync.
---

# Propagate PayClaw Schema Change

Guide for safely adding, removing, or modifying fields that flow through the PayClaw type system — whether triggered by upstream API drift, a new product requirement, or a bug fix.

## Prerequisites

- [ ] Identify the change direction: **upstream-triggered** (drift after sync) vs. **locally-initiated** (new requirement)
- [ ] Identify the field's data-flow category (see table below)
- [ ] Read the current state of all affected files before making any changes

### Data-Flow Categories

| Category | Direction | Example Types | Layers Affected |
|----------|-----------|---------------|-----------------|
| **Input** | LLM → API | `PayClawToolInput` fields | Zod schema, tool registration, drift tests |
| **Response** | API → app | `Job`, `JobResult`, `JobEvent` fields | Zod schema, client, drift tests |
| **Bidirectional** | Both | `ShippingAddress`, `PaymentMethod` | All layers (up to 10 files) |

## Quick Reference

| Step | File | When to Touch | Key Constraint |
|------|------|---------------|----------------|
| 1 | `lib/payclaw/schemas.ts` | Always | `.describe()` on inputs; `.passthrough()` on responses |
| 2 | `convex/schema.ts` | Persisted fields | `v.*` validators; cannot import from `lib/` |
| 3 | `convex/shippingAddresses.ts` | Persisted fields | Tri-state null on `update` mutation for optional fields |
| 4 | `convex/shippingAddressPatch.ts` | Optional persisted fields | `null` = clear, `undefined` = skip, `string` = set |
| 5 | `lib/shipping-addresses/payload.ts` | User-editable fields | Form types + builder functions |
| 6 | `app/api/chat/route.ts` (field-pick) | `ShippingAddress` / `PaymentMethod` fields | Manual pick with `satisfies ShippingAddress` |
| 7 | `app/api/chat/route.ts` (`formatAddressContext`) | Fields shown in system prompt | Affects LLM awareness of user data |
| 8 | `lib/tools/platform.ts` | Fields with fallback/validation logic | Fallback chains, fail-fast checks |
| 9 | `lib/payclaw/client.ts` | Fields in request body or response handling | Uses schema `.parse()` for validation |
| 10 | `app/components/layout/settings/general/shipping-addresses.tsx` | User-editable fields | Controlled inputs, form validation |
| 11 | `lib/payclaw/__tests__/type-drift.test.ts` | Always | Bilateral or per-field `expectTypeOf` |
| 12 | `convex/shippingAddressContract.test.ts` | `ShippingAddress` fields | Zod `safeParse` at Convex→API boundary |

## Step-by-Step: Adding a Field to ShippingAddress

This is the most common and most dangerous case — a single field touches up to 10 files.

### 1. Update the Zod Schema

```typescript
// lib/payclaw/schemas.ts — shippingAddressSchema
export const shippingAddressSchema = z.object({
  // ... existing fields ...
  newField: z.string().optional().describe('What this field means to the LLM.'),
  //                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                               REQUIRED for input schemas. This is prompt
  //                               engineering, not documentation.
})
```

**Rules:**
- Input schema fields MUST have `.describe()` — it controls LLM tool-call quality
- If required: use `z.string()` (no `.optional()`)
- If optional with a default: use `z.string().default('value')`
- If optional without a default: use `z.string().optional()`

### 2. Update the Convex Table Schema

```typescript
// convex/schema.ts — shippingAddresses table
shippingAddresses: defineTable({
  // ... existing fields ...
  newField: v.optional(v.string()),  // or v.string() if required
})
```

### 3. Update Convex Mutation Validators

```typescript
// convex/shippingAddresses.ts

// In the `create` mutation args:
newField: v.optional(v.string()),

// In the `update` mutation args (tri-state for optional fields):
newField: v.optional(v.union(v.string(), v.null())),
//         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//         string = set value, null = clear, absent = skip
```

### 4. Update the Patch Builder (Optional Fields Only)

```typescript
// convex/shippingAddressPatch.ts

// Add to ShippingAddressUpdateInput type:
newField?: string | null

// Add to buildShippingAddressPatch():
if (updates.newField === null) {
  patch.newField = undefined      // Clear the field in Convex
} else if (updates.newField !== undefined) {
  patch.newField = updates.newField  // Set the field
}
```

### 5. Update Form Payload Types

```typescript
// lib/shipping-addresses/payload.ts

// Add to ShippingAddressFormData:
export type ShippingAddressFormData = {
  // ... existing fields ...
  newField: string               // All form fields are strings (controlled inputs)
}

// Add to ShippingAddressBasePayload (if required):
type ShippingAddressBasePayload = {
  // ... existing fields ...
  newField: string
}

// Or add to CreateShippingAddressPayload (if optional on create):
export type CreateShippingAddressPayload = ShippingAddressBasePayload & {
  line2?: string
  newField?: string
}

// Add to UpdateShippingAddressPayload (tri-state for optional fields):
export type UpdateShippingAddressPayload = ... & {
  newField: string | null         // null = explicit clear
}

// Update builder functions to normalize the field.
```

### 6. Update the Route Field-Pick

```typescript
// app/api/chat/route.ts (lines 423–434)
let cleanDefaultShippingAddress: ShippingAddress | undefined = defaultAddress
  ? ({
      // ... existing fields ...
      newField: defaultAddress.newField,
    } satisfies ShippingAddress)
  : undefined
//  ^^^^^^^^^^^^^^^^^^^^^^^^^
//  `satisfies` catches missing required fields at compile time.
//  If you add a required field to the schema but forget it here, tsc errors.
```

### 7. Update formatAddressContext (If Relevant to System Prompt)

```typescript
// app/api/chat/route.ts (line 125–144)
// Only add the field if the LLM needs to see it when deciding tool parameters.
// Example: phone and email are included; label is not.
```

### 8. Evaluate Tool-Level Logic

```typescript
// lib/tools/platform.ts
// Does the new field need:
//   - A default/fallback? (like country defaults to 'US')
//   - A fail-fast validation? (like phone is required for physical products)
//   - An enrichment from Clerk? (like email is backfilled from Clerk)
// If yes, add logic to the flowglad_pay_buy execute function.
```

### 9. Update the UI Form Component

```typescript
// app/components/layout/settings/general/shipping-addresses.tsx
// Add the input field, wire it to form state, add validation if needed.
```

### 10. Update Drift Tests

```typescript
// lib/payclaw/__tests__/type-drift.test.ts

// For bilateral types (ShippingAddress, PaymentMethod):
// No code change needed — the existing toEqualTypeOf check catches new fields
// automatically. If tsc passes, you're good.

// For one-way types (Job, JobResult, JobEvent) — add per-field check:
expectTypeOf<UpstreamJob["newField"]>().toEqualTypeOf<LocalJob["newField"]>()
```

### 11. Update Contract Tests

```typescript
// convex/shippingAddressContract.test.ts
// Add the field to the convexDoc fixture and the mapped object.
// Verify shippingAddressSchema.safeParse(mapped) still passes.
```

### 12. Verify

```bash
bun run typecheck && bun run lint && bun vitest run
```

## Step-by-Step: Adding a Response-Only Field

For fields on `Job`, `JobResult`, `JobEvent`, or other API-response types:

1. **Confirm `.passthrough()`** is on the response schema (it should already be)
2. **Optionally** add the field to the Zod schema if the app reads it explicitly
3. **Update drift tests** with a per-field `expectTypeOf` check
4. **Do NOT touch** Convex, form, route, or UI layers
5. Run `bun run typecheck && bun vitest run`

## Step-by-Step: Handling Upstream Drift

When `scripts/sync-payclaw-client.sh` pulls changes and `bun run typecheck` fails:

1. Read the error — it will point to `lib/payclaw/__tests__/type-drift.test.ts`
2. Diff `lib/payclaw.ts` against its previous version to identify what changed
3. Classify the change:
   - **Field added to bilateral type** → Add it to local Zod schema + all downstream layers
   - **Field added to response-only type** → Usually no-op (`.passthrough()` preserves it)
   - **Field removed** → Remove from local schema, remove from all layers
   - **Field type changed** → Update local schema, check all layers for compatibility
4. Follow the appropriate step-by-step above

## Patterns

### `.describe()` Is Prompt Engineering

```typescript
// ✅ Good — tells the LLM what to put in the field
phone: z.string().optional().describe('Recipient phone number.'),

// ❌ Bad — no describe, LLM doesn't know how to fill this
phone: z.string().optional(),

// ❌ Bad — overly technical, not helpful for the LLM
phone: z.string().optional().describe('E.164 formatted phone string, validated server-side'),
```

### `.passthrough()` Asymmetry

```typescript
// ✅ Response schemas — preserve unknown upstream fields
export const jobSchema = z.object({ ... }).passthrough()

// ✅ Input schemas — strip unknown LLM output (defense-in-depth)
export const shippingAddressSchema = z.object({ ... })
//                                   no .passthrough()
```

### Tri-State Null Contract

```typescript
// For optional fields on update mutations:
//   string  → set this value
//   null    → explicitly clear the field
//   absent  → don't change the field

// Convex validator:
phone: v.optional(v.union(v.string(), v.null()))

// Patch builder:
if (updates.phone === null) {
  patch.phone = undefined       // Convex uses undefined to clear
} else if (updates.phone !== undefined) {
  patch.phone = updates.phone
}

// Form payload builder:
phone: phone || null            // Empty string → null (clear)
```

### Route `satisfies` Pattern

```typescript
// The satisfies annotation is your compile-time safety net.
// If you add a required field to ShippingAddress but forget it here, tsc catches it.
const cleanAddr = ({
  name: doc.name,
  line1: doc.line1,
  // ... all fields ...
} satisfies ShippingAddress)
```

## Anti-Patterns

1. **Editing `lib/payclaw.ts`** — Auto-synced from upstream; overwritten on every build
2. **Importing from `@/lib/payclaw` in production code** — Only `type-drift.test.ts` imports it
3. **Importing from `lib/` inside `convex/`** — Module boundary violation; Convex has its own module system
4. **Adding `.passthrough()` to input schemas** — Allows unvalidated LLM output through to the API
5. **Removing `.passthrough()` from response schemas** — Silently strips fields the upstream API sends
6. **Removing or trivializing `.describe()` text** — Degrades LLM tool-call accuracy in production
7. **Using `string | undefined` for optional update fields** — Loses the "clear" operation; must use `string | null | undefined`
8. **Forgetting `formatAddressContext()`** — Field exists in the DB but the LLM can't see it in the system prompt
9. **Skipping contract tests** — The Convex→API boundary has no compile-time check; only `safeParse` tests catch drift

## Validation Checklist

- [ ] `bun run typecheck` passes (catches drift test failures and `satisfies` mismatches)
- [ ] `bun run lint` passes
- [ ] `bun vitest run lib/payclaw/__tests__/type-drift.test.ts` passes
- [ ] `bun vitest run convex/shippingAddressContract.test.ts` passes
- [ ] Every input schema field has a `.describe()` annotation
- [ ] Every response schema object ends with `.passthrough()`
- [ ] No production file imports from `@/lib/payclaw` (only `@/lib/payclaw/schemas` or `@/lib/payclaw/client`)
- [ ] Optional fields on `update` mutations use `v.optional(v.union(v.string(), v.null()))`
- [ ] Patch builder handles `null` (clear) and `undefined` (skip) separately

## Common Mistakes

1. **Updating only some layers** — A field added to the Zod schema but missing from Convex, the route field-pick, or the form silently vanishes at that boundary
2. **Breaking `.describe()` annotations** — Invisible at compile time, manifests as degraded tool-calling accuracy in production
3. **Homogenizing `.passthrough()`** — Adding it to input schemas or removing it from response schemas both cause data integrity issues
4. **Sharing types across the Convex boundary** — `convex/` cannot import from `lib/`; use contract tests to verify alignment
5. **Wrong tri-state semantics** — Using `undefined` where `null` is needed (or vice versa) in the update pipeline

## Reference

- `lib/payclaw.ts` — Upstream reference (read-only, auto-synced)
- `lib/payclaw/schemas.ts` — Local Zod schemas (source of truth)
- `lib/payclaw/client.ts` — Hand-written API client
- `lib/tools/platform.ts` — Tool registration and fallback logic
- `app/api/chat/route.ts` — Route integration (field-pick at lines 423–434, formatAddressContext at lines 125–144)
- `lib/shipping-addresses/payload.ts` — Form payload types and builders
- `convex/schema.ts` — Convex table schema (lines 94–110)
- `convex/shippingAddresses.ts` — Convex mutations and queries
- `convex/shippingAddressPatch.ts` — Tri-state patch builder
- `convex/shippingAddressContract.test.ts` — Boundary contract tests
- `lib/payclaw/__tests__/type-drift.test.ts` — Compile-time drift detection
- `scripts/sync-payclaw-client.sh` — Upstream sync script
