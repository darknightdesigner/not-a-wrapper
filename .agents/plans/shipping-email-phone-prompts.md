# Shipping Address: Email + Phone Implementation Prompts

4 prompts for AI agents. Execute in order: **1 → (2 ∥ 3) → 4**.

---

## Prompt 1: Database Schema + Types + Payload Layer

You are a senior full-stack engineer working in the "Not A Wrapper" codebase (Next.js 16 + React 19 + TypeScript + Convex). You are adding `email` and `phone` fields to shipping addresses at the data layer.

### Context

Shipping addresses are stored in Convex and flow through 4 type-definition layers that must stay in sync. Currently neither `email` nor `phone` exists in the DB schema, Convex mutations, patch builder, or form payload types — only in the Payclaw Zod schema (`lib/payclaw/schemas.ts:5-15`) which is the tool-calling contract.

Convex functions run in their own runtime and can only import from within the `convex/` directory. Do NOT create shared modules in `lib/` that Convex functions would need to import.

### Files to modify (read each before editing)

1. **`convex/schema.ts` (lines 94-108)** — Add `email` and `phone` as optional fields to the `shippingAddresses` table. They MUST be `v.optional(v.string())` because existing rows don't have them and Convex has no default-value migrations.

2. **`convex/shippingAddresses.ts`** — Two changes:
   - `create` mutation (line 55): Add `email: v.optional(v.string())` and `phone: v.optional(v.string())` to args. In the handler, add a defense-in-depth guard: if `phone` is provided but trims to empty string, throw `"Phone number is required for new addresses"`. Include both fields in the `db.insert` call.
   - `update` mutation (line 105): Add `email: v.optional(v.union(v.string(), v.null()))` and `phone: v.optional(v.union(v.string(), v.null()))` to args. These follow the same tri-state PATCH contract as `line2` (string = set, null = clear, undefined = no change).

3. **`convex/shippingAddressPatch.ts`** — Add `email` and `phone` to the `ShippingAddressUpdateInput` type and `buildShippingAddressPatch` function. Follow the exact same null-clearing pattern used for `line2` (lines 23-27).

4. **`lib/shipping-addresses/payload.ts`** — Four changes:
   - Add `email: string` and `phone: string` to `ShippingAddressFormData`.
   - Add `email: string` and `phone: string` to `ShippingAddressBasePayload`.
   - In `buildBasePayload`: add `email: normalizeFormValue(form.email)` and `phone: normalizeFormValue(form.phone)`.
   - In `buildCreateShippingAddressPayload`: add `email: email || undefined` (same pattern as `line2`).
   - In `buildUpdateShippingAddressPayload`: add `email: email || null` and `phone: phone || null` (same pattern as `line2`).

### Acceptance criteria

- `bun run typecheck` passes with zero new errors.
- Existing `line2` tri-state behavior is unchanged.
- No `@ts-ignore` or `eslint-disable` added.
- No changes to files outside the 4 listed above.

---

## Prompt 2: UI Form, Validation, and Autofill

You are a senior full-stack engineer working in the "Not A Wrapper" codebase. You are adding `email` and `phone` fields to the shipping address form UI with validation and autofill.

### Context

Prompt 1 already added `email` and `phone` to `ShippingAddressFormData` in `lib/shipping-addresses/payload.ts`, the Convex schema, and mutations. Your job is the UI layer only.

The existing autofill pattern: when adding a new address, `startAdd()` prefills `name` from `user?.display_name`. The `user` object comes from `useUser()` (imported from `@/lib/user-store/provider`) and has an `email` field populated from Clerk (`user?.email`).

### File to modify (read fully before editing)

**`app/components/layout/settings/general/shipping-addresses.tsx`**

### Changes required

1. **`EMPTY_FORM` (line 103):** Add `email: ""` and `phone: ""`.

2. **`validateForm` (line 113):** Add after the name check (line 125):
   - `email`: trim; if non-empty, validate format with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Error: `"Please enter a valid email address."`. Email is NOT required — it autofills from Clerk, but users may clear it.
   - `phone`: trim; required. Error: `"Phone number is required."`. If non-empty, validate: strip all non-digit characters except `+`, check 7-15 digits remain. Error: `"Please enter a valid phone number."`. Use a permissive check — do not reject international formats.

3. **`toFormData` (line 144):** Add `email: address.email ?? ""` and `phone: address.phone ?? ""`. The `?? ""` handles legacy addresses without these fields (same pattern as `line2` on line 149).

4. **`startAdd` (line 389):** Autofill email: `email: user?.email ?? ""`. Do NOT autofill phone.

5. **Form fields in `ShippingAddressForm` (line 248):** Add two new field blocks directly below the "Recipient name" block (after line 280, before the "Address line 1" block at line 282):
   - **Email field:** Label `"Email"`, placeholder `"jane@example.com"`, input type `"email"`.
   - **Phone field:** Label `"Phone"`, placeholder `"+1 (555) 123-4567"`, input type `"tel"`. Add a subtle hint below the input or in the label: `"Required for deliveries"`.
   - Both fields follow the exact same pattern as the existing name/line1 inputs (controlled via `onFormChange`).

6. **Address card display (line 546):** After the existing `<p className="text-sm">{address.name}</p>`, add a line showing email and/or phone when present. Use muted text styling consistent with `formatAddressLine`.

### Acceptance criteria

- Field order in form: Label → Recipient name → Email → Phone → Address line 1 → ...
- New address: name and email autofill from user; phone is empty.
- Empty phone blocks save with toast error.
- Invalid email blocks save with toast error.
- Editing a legacy address (no email/phone) loads safely with empty fields.
- `bun run lint` and `bun run typecheck` pass.
- No `@ts-ignore` or `eslint-disable` added.
- No changes to files other than `shipping-addresses.tsx`.

---

## Prompt 3: API Route + Tool Fallback + System Prompt

You are a senior full-stack engineer working in the "Not A Wrapper" codebase. You are propagating `email` and `phone` through the chat route's system prompt, the server-side address fallback, and the tool execution fail-fast logic.

### Context

Prompt 1 already added `email` and `phone` to the Convex schema and mutations. The `ShippingAddress` type from `lib/payclaw/schemas.ts` already has optional `phone` and `email` fields (lines 13-14). The current chat route builds a `cleanDefaultShippingAddress` object (lines 421-431) that manually picks 7 fields, deliberately excluding `phone` and `email` — this is a silent data-loss boundary.

The current tool execution in `lib/tools/platform.ts` only logs a `console.warn` when phone/email are missing (lines 73-83). This is insufficient — a Payclaw job takes 2-8 minutes and will fail at checkout without phone. There is already a fail-fast precedent for missing payment method at lines 63-71 of the same file.

The signed-in user's email is available in the chat route via `clerkUser` (already fetched at lines 414-418). Use this as a fallback when the stored address has no email.

### Files to modify (read each before editing)

1. **`app/api/chat/route.ts`** — Two changes:

   **a) `formatAddressContext` (lines 125-142):** Update the address line format to include email and phone when present. Append contact info in brackets after the address. Example output:
   ```
   ★ Default (Home): John Doe, 123 Main St, Apt 4B, New York, NY 10001 [john@example.com, +1 555-123-4567]
   ```
   Only show the bracket section when at least one contact field exists. Keep the existing format unchanged when neither is present.

   **b) `cleanDefaultShippingAddress` (lines 420-431):** Add `phone` and `email` to the object. Use `satisfies ShippingAddress` to make TypeScript catch any future field omissions:
   ```typescript
   const cleanDefaultShippingAddress: ShippingAddress | undefined = defaultAddress
     ? ({
         name: defaultAddress.name,
         line1: defaultAddress.line1,
         line2: defaultAddress.line2,
         city: defaultAddress.city,
         state: defaultAddress.state,
         postalCode: defaultAddress.postalCode,
         country: defaultAddress.country,
         phone: defaultAddress.phone,
         email: defaultAddress.email,
       } satisfies ShippingAddress)
     : undefined
   ```

   **c) Email fallback from Clerk:** After building `cleanDefaultShippingAddress`, if the address exists but has no email, fill it from the Clerk user:
   ```typescript
   if (cleanDefaultShippingAddress && !cleanDefaultShippingAddress.email && clerkUser?.primaryEmailAddress?.emailAddress) {
     cleanDefaultShippingAddress.email = clerkUser.primaryEmailAddress.emailAddress
   }
   ```
   This requires changing `const` to `let` for the address variable, or restructuring slightly. The `clerkUser` is already available from lines 414-415.

2. **`lib/tools/platform.ts`** — One change:

   **Replace the `console.warn` block (lines 73-84) with a fail-fast return when `phone` is missing.** Follow the exact pattern of the payment-method check at lines 63-71. Keep the email check as a warning only (email is nice-to-have for checkout, phone is critical):

   ```typescript
   const isLikelyPhysical = resolvedInput.shippingAddress !== undefined
   if (isLikelyPhysical) {
     const addr = resolvedInput.shippingAddress!
     if (!addr.phone) {
       return {
         ok: false,
         data: null,
         error:
           "Shipping address is missing a phone number, which most vendor checkouts require. " +
           "Ask the user for their phone number and include it in the shippingAddress.",
         meta: { tool: "Flowglad Pay", source: "platform", durationMs: Date.now() - startMs },
       }
     }
     if (!addr.email) {
       console.warn("[tools/platform] Shipping address missing email — some checkouts may require it")
     }
   }
   ```

### Reference files (read-only, do not modify)

- `lib/payclaw/schemas.ts` — `ShippingAddress` type definition with `phone?` and `email?`
- `lib/payclaw/client.ts` — `createJob` already spreads the full `shippingAddress` object into the API payload, so phone/email propagate to Payclaw automatically once present

### Acceptance criteria

- System prompt address lines include `[email, phone]` when those fields exist on the address.
- `cleanDefaultShippingAddress` includes `phone` and `email` from the DB document.
- Missing email on stored address falls back to Clerk user email.
- Tool execution returns structured `ok: false` error when phone is missing (does NOT call `createJob`).
- Missing email is a `console.warn`, not a hard block.
- `bun run typecheck` passes. The `satisfies` annotation must be present.
- No `@ts-ignore` or `eslint-disable` added.
- No changes to files other than `route.ts` and `platform.ts`.

---

## Prompt 4: Cross-Layer Verification

You are a senior full-stack engineer verifying the shipping address email+phone implementation across the "Not A Wrapper" codebase. Prompts 1-3 have already been applied. Your job is to verify correctness, fix any issues, and confirm zero regressions.

### Step 1: Typecheck and lint

Run both commands. Fix any errors introduced by the prior prompts. Do NOT add `@ts-ignore`, `eslint-disable`, or weaken any lint rules.

```bash
bun run typecheck
bun run lint
```

### Step 2: Verify type consistency across boundaries

Read these files and confirm the `email`/`phone` fields are consistent:

| File | Expected shape |
|------|---------------|
| `convex/schema.ts` | `email: v.optional(v.string())`, `phone: v.optional(v.string())` |
| `convex/shippingAddresses.ts` create args | `email: v.optional(v.string())`, `phone: v.optional(v.string())` |
| `convex/shippingAddresses.ts` update args | `email: v.optional(v.union(v.string(), v.null()))`, `phone: v.optional(v.union(v.string(), v.null()))` |
| `convex/shippingAddressPatch.ts` type | `email?: string \| null`, `phone?: string \| null` |
| `convex/shippingAddressPatch.ts` function | Null-clearing pattern identical to `line2` |
| `lib/shipping-addresses/payload.ts` FormData | `email: string`, `phone: string` |
| `lib/shipping-addresses/payload.ts` create | `email` omitted when empty (like `line2`) |
| `lib/shipping-addresses/payload.ts` update | `email` and `phone` set to `null` when empty (like `line2`) |
| `shipping-addresses.tsx` EMPTY_FORM | `email: ""`, `phone: ""` |
| `shipping-addresses.tsx` toFormData | `email: address.email ?? ""`, `phone: address.phone ?? ""` |
| `shipping-addresses.tsx` startAdd | `email: user?.email ?? ""` (autofill), no phone autofill |
| `shipping-addresses.tsx` validateForm | phone required + format check, email optional + format check |
| `app/api/chat/route.ts` cleanDefault | includes `phone`, `email`, has `satisfies ShippingAddress` |
| `app/api/chat/route.ts` formatAddressContext | includes contact info in bracket notation |
| `app/api/chat/route.ts` email fallback | fills from Clerk when stored address has no email |
| `lib/tools/platform.ts` | fail-fast `ok: false` when phone missing, `console.warn` for email |

If any row doesn't match, fix the file to match the expected shape.

### Step 3: Backward compatibility check

Confirm these scenarios are safe by reading the code (no runtime test needed):

1. A Convex query returning an address WITHOUT `email`/`phone` fields — does `toFormData` handle it? (should use `?? ""`)
2. The `cleanDefaultShippingAddress` built from an address without `email`/`phone` — does it pass `satisfies ShippingAddress`? (yes, because both are optional in the Zod schema)
3. The `buildShippingAddressPatch` function receiving `email: undefined` and `phone: undefined` — does it skip them? (should, matching `line2` pattern)

### Step 4: Regression test cases (essential only)

Provide a concise checklist of 10 test cases that cover the critical paths. Group as unit/integration/manual:

**Unit (5):**
1. `validateForm` rejects empty phone → error message
2. `validateForm` rejects phone with <7 digits → error message
3. `validateForm` accepts phone `"+1 (555) 123-4567"` → null (valid)
4. `validateForm` accepts empty email → null (optional)
5. `validateForm` rejects email `"notanemail"` → error message

**Integration (2):**
6. Create address with email+phone via Convex, query back, both fields present
7. `cleanDefaultShippingAddress` from a DB doc with phone+email includes both

**Manual (3):**
8. New address form: name and email autofill, phone empty, field order correct
9. Buy physical product with complete default address: job created, no errors
10. Buy with legacy address (no phone): tool returns structured error, LLM asks for phone

### Acceptance criteria

- `bun run typecheck` and `bun run lint` both pass with zero errors.
- All 16 rows in the type consistency table are confirmed correct.
- All 3 backward-compat scenarios are confirmed safe.
- No `@ts-ignore`, `eslint-disable`, or lint rule changes.
