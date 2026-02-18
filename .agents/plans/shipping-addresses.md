# Shipping Addresses for Flowglad Pay

> **Status**: Planning
> **Priority**: P1
> **Updated**: February 18, 2026
> **Branch**: `AP-WHY-NOT`
> **Primary references**: `lib/payclaw/schemas.ts`, `lib/tools/platform.ts`, `app/api/chat/route.ts`

---

## Objective

Allow users to manage shipping addresses in Settings → General and automatically surface the default address during Flowglad Pay tool calls. Uses a dual-mechanism approach: system prompt injection (primary) + server-side fallback (safety net).

### Design Decisions (Pre-Agreed)

1. **Surfacing mechanism**: System prompt injection as primary, with server-side auto-fill fallback in `getPlatformTools` when the LLM omits `shippingAddress`.
2. **Scope**: Shipping addresses only. Data model is purpose-built but the prompt injection pattern is designed to generalize for future context enrichment.
3. **Geography**: US-only to start. Code comments mark extension points for international support.
4. **Default behavior**: First address added is auto-set as default. With 2+ addresses, user can change the default.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Settings UI                          │
│  (add / edit / delete / set default)                    │
│  app/components/layout/settings/general/                │
└────────────────────┬────────────────────────────────────┘
                     │ Convex mutations
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Convex: shippingAddresses table             │
│  userId, label, name, line1, line2, city, state,        │
│  postalCode, country, isDefault, createdAt              │
└────────────────────┬────────────────────────────────────┘
                     │ Convex query (server-side)
                     ▼
┌─────────────────────────────────────────────────────────┐
│              app/api/chat/route.ts                       │
│  1. Fetch addresses → inject into system prompt         │
│  2. Pass default address to getPlatformTools (fallback) │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              lib/tools/platform.ts                       │
│  getPlatformTools({ userName, defaultAddress })          │
│  → auto-fills shippingAddress if LLM omits it           │
└─────────────────────────────────────────────────────────┘
```

---

## Scope

### In Scope

| Layer | Files |
|-------|-------|
| Schema | `convex/schema.ts` |
| DB Functions | `convex/shippingAddresses.ts` (new) |
| API Route | `app/api/chat/route.ts` |
| Platform Tools | `lib/tools/platform.ts` |
| Settings UI | `app/components/layout/settings/general/shipping-addresses.tsx` (new) |
| Settings Integration | `app/components/layout/settings/settings-content.tsx` |
| Types | `lib/payclaw/schemas.ts` (reuse existing `ShippingAddress` type) |

### Out of Scope

- International address support (US-only; extension points commented)
- Billing address management
- Phone number collection
- Address verification/autocomplete APIs
- Changes to `UserProfile` type or `UserProvider` (addresses are a separate Convex table, not part of user profile)

---

## Data Model

### New Table: `shippingAddresses`

```typescript
// convex/schema.ts — addition
shippingAddresses: defineTable({
  userId: v.id("users"),
  label: v.string(),                    // "Home", "Work", "Mom's house", etc.
  name: v.string(),                     // Full name of recipient
  line1: v.string(),                    // Street address line 1
  line2: v.optional(v.string()),        // Apt, suite, floor (optional)
  city: v.string(),
  state: v.string(),                    // 2-letter US state code
  postalCode: v.string(),              // 5-digit ZIP
  country: v.string(),                  // ISO country code, default "US"
  isDefault: v.boolean(),
  createdAt: v.number(),               // Unix timestamp
})
  .index("by_user", ["userId"])
  .index("by_user_default", ["userId", "isDefault"])
```

**Why a separate table?** Shipping addresses are a 1:N relationship with users. Embedding them in the `users` table as an array would make default-toggling require full-array mutations and prevent efficient querying by default status.

**Field alignment**: Fields match `shippingAddressSchema` in `lib/payclaw/schemas.ts` exactly (`name`, `line1`, `line2`, `city`, `state`, `postalCode`, `country`) plus metadata (`label`, `isDefault`, `createdAt`).

---

## Implementation Plan

### Phase 1: Data Layer (Convex Schema + Functions)

**Goal**: Establish the database table and all CRUD operations with correct default-management logic.

#### Files

- `convex/schema.ts` — Add `shippingAddresses` table
- `convex/shippingAddresses.ts` — New file with all functions

#### Actions

1. **Add table to schema** (`convex/schema.ts`)
   - Add `shippingAddresses` table definition as specified above
   - Add indexes: `by_user` and `by_user_default`

2. **Create `convex/shippingAddresses.ts`** with these functions:

   | Function | Type | Purpose |
   |----------|------|---------|
   | `list` | `query` | Get all addresses for the authenticated user, ordered by `createdAt` |
   | `getDefault` | `query` | Get the user's default address (used by chat route) |
   | `create` | `mutation` | Add a new address. If it's the first address, force `isDefault: true`. Otherwise, respect the provided value. |
   | `update` | `mutation` | Update an existing address. Verify ownership before patching. |
   | `remove` | `mutation` | Delete an address. If the deleted address was default and others exist, promote the oldest remaining address to default. |
   | `setDefault` | `mutation` | Set a specific address as default. Clear `isDefault` on all other addresses for this user (single-default invariant). |

3. **Auth pattern** — Every function follows the Convex auth pattern from `AGENTS.md`:
   ```typescript
   const identity = await ctx.auth.getUserIdentity()
   if (!identity) throw new Error("Not authenticated")
   // lookup user by identity.subject, verify ownership, then operate
   ```

4. **Default invariant logic**:
   - `create`: Count existing addresses for user. If count === 0, force `isDefault: true` regardless of input.
   - `remove`: If removed address had `isDefault: true`, query remaining addresses ordered by `createdAt` ascending, set the first one as default.
   - `setDefault`: Transactionally clear all `isDefault` for user, then set the target address. Verify the target belongs to the authenticated user.

#### Guardrails

- Never allow a user to have zero addresses with `isDefault: true` when they have at least one address
- Never allow a user to have two addresses with `isDefault: true`
- All mutations verify `userId` ownership before operating
- `remove` must handle the "last address deleted" case (no default promotion needed)

#### Exit Criteria

- [ ] `convex/schema.ts` includes `shippingAddresses` table with both indexes
- [ ] All 6 Convex functions implemented with auth checks
- [ ] Default invariant holds across all mutation paths (create first, create subsequent, delete default, delete non-default, set default)
- [ ] `bun run typecheck` passes
- [ ] Convex dev server accepts the schema migration

---

### Phase 2: Settings UI (Shipping Address Management)

**Goal**: Build the settings UI component for managing shipping addresses in the General tab.

#### Files

- `app/components/layout/settings/general/shipping-addresses.tsx` — New component
- `app/components/layout/settings/settings-content.tsx` — Add component to General tab

#### Actions

1. **Create `shipping-addresses.tsx`** following the `McpServers` + `McpServerForm` pattern (see Appendix D):
   - Use `"use client"` directive
   - Use `useQuery(api.shippingAddresses.list) ?? []` for reactive address list (see Appendix H)
   - Use `useMutation` for create/update/remove/setDefault
   - Use `AlertDialog` for delete confirmation (matching MCP Servers pattern)
   - Use Base UI `Select` for state dropdown (see Appendix C for exact API)

2. **Component structure**:

   ```
   ShippingAddresses (main export)
   ├── Header: "Shipping addresses" label + "Add address" button
   ├── Empty state: Friendly message when no addresses exist
   ├── Address list: Map over addresses
   │   └── AddressCard (per address)
   │       ├── Default badge (if isDefault)
   │       ├── Label + formatted address display
   │       ├── "Set as default" action (if not default, only when 2+ addresses)
   │       ├── "Edit" action → opens form in edit mode
   │       └── "Delete" action → confirmation, then remove
   └── AddressForm (inline, shown on add/edit)
       ├── Label input
       ├── Name input (pre-fill from Clerk display name)
       ├── Line 1, Line 2 inputs
       ├── City input
       ├── State dropdown (US states only)
       ├── ZIP code input
       ├── Country field (hidden, hardcoded "US")
       │   // TODO: Add country selector for international support
       └── Save / Cancel buttons
   ```

3. **State management**:
   - `editingId: string | null` — Which address is being edited (null = not editing, "new" = adding)
   - Form fields as local state, reset on cancel or successful save
   - Optimistic updates via Convex reactive queries (no manual optimistic state needed — Convex handles this)

4. **Form validation** (client-side):
   - `label`: Required, max 50 characters
   - `name`: Required
   - `line1`: Required
   - `city`: Required
   - `state`: Required, must be valid 2-letter US state code
   - `postalCode`: Required, must match `/^\d{5}(-\d{4})?$/` (5-digit or ZIP+4)
   // TODO: Extend validation for international postal formats

5. **UI components** — Use existing Shadcn/Base UI primitives:
   - `Input` for text fields
   - `Select` for state dropdown
   - `Button` for actions
   - `Label` for form labels
   - `toast` for success/error feedback
   - Subtle card styling for each address (follow existing settings patterns)

6. **Integrate into settings** (`settings-content.tsx`):
   - Import `ShippingAddresses` component
   - Add between `UserProfile` and `AccountManagement` in both mobile and desktop General tab:
     ```tsx
     <TabsContent value="general" className="space-y-6">
       <UserProfile />
       <ShippingAddresses />
       <AccountManagement />
     </TabsContent>
     ```

#### Guardrails

- Do not modify any existing components beyond the import + placement in `settings-content.tsx`
- Use existing UI primitives — no new dependencies
- Follow the `McpServers` pattern for consistency (list + form state, CRUD handlers, AlertDialog delete, toast feedback)
- Form must be keyboard accessible (Tab through fields, Enter to submit)
- Keep the component self-contained — no changes to `UserProfile`, `UserProvider`, or `UserProfile` type

#### Exit Criteria

- [ ] Address list displays all user addresses with default badge
- [ ] "Add address" opens inline form, pre-fills name from Clerk user
- [ ] Form validates all required fields before save
- [ ] State dropdown shows all 50 US states + DC
- [ ] ZIP validation accepts 5-digit and ZIP+4 formats
- [ ] "Edit" opens form pre-filled with existing data
- [ ] "Delete" removes address, promotes new default if needed
- [ ] "Set as default" works when 2+ addresses exist
- [ ] First address auto-defaults (user doesn't see the toggle)
- [ ] Empty state shown when no addresses exist
- [ ] Toast notifications for all operations (success + error)
- [ ] Component renders correctly in both mobile drawer and desktop settings
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes

---

### Phase 3: System Prompt Injection (Chat Route Integration)

**Goal**: Surface the user's shipping addresses in the system prompt so the LLM can reference them during Flowglad Pay purchases.

#### Files

- `app/api/chat/route.ts` — Fetch addresses and inject into system prompt

#### Actions

1. **Fetch addresses server-side** in the chat route (see Appendix B for exact pattern):
   - Add `fetchQuery` to the existing `import { fetchMutation } from "convex/nextjs"` (line 31)
   - Only fetch when `isAuthenticated && convexToken` (same gate as platform tools)
   - Use `fetchQuery(api.shippingAddresses.list, {}, { token: convexToken })` — note the empty `{}` args (Appendix G)
   - Place fetch alongside the existing Clerk user fetch in the platform tools section (lines 380-391) for co-location
   - Wrap in try/catch — address fetch failure must log a warning but NOT break the chat route

2. **Build address context block**:
   ```typescript
   function formatAddressContext(addresses: ShippingAddress[]): string {
     if (addresses.length === 0) return ""
     
     const lines = addresses.map((addr) => {
       const prefix = addr.isDefault ? "★ Default" : "•"
       const label = addr.label ? ` (${addr.label})` : ""
       const line2 = addr.line2 ? `, ${addr.line2}` : ""
       return `${prefix}${label}: ${addr.name}, ${addr.line1}${line2}, ${addr.city}, ${addr.state} ${addr.postalCode}`
     })
     
     return [
       "\n\n---",
       "User's shipping addresses on file:",
       ...lines,
       "When the user asks to buy a physical product, use their default shipping address unless they specify otherwise.",
       "---"
     ].join("\n")
   }
   ```

3. **Inject into system prompt** (after line 206):
   ```typescript
   const effectiveSystemPrompt = systemPrompt || SYSTEM_PROMPT_DEFAULT
   
   // Append shipping address context if available
   let enrichedSystemPrompt = effectiveSystemPrompt
   if (isAuthenticated && userAddresses.length > 0) {
     enrichedSystemPrompt += formatAddressContext(userAddresses)
   }
   ```

4. **Pass `enrichedSystemPrompt` to `streamText`** instead of `effectiveSystemPrompt` (line 695).

#### Guardrails

- Do NOT fetch addresses for anonymous users
- Do NOT modify `effectiveSystemPrompt` itself — create a new variable (`enrichedSystemPrompt`) to preserve the original for any other uses
- Address fetch failure should be non-fatal (log warning, continue without addresses)
- Keep the format block concise to minimize token cost (~80 tokens per address)

#### Exit Criteria

- [ ] Addresses appear in system prompt only for authenticated users with addresses
- [ ] Default address is clearly marked with `★ Default` prefix
- [ ] System prompt remains unchanged when user has no addresses
- [ ] Address fetch failure does not break the chat route
- [ ] Anonymous users are unaffected
- [ ] `bun run typecheck` passes

---

### Phase 4: Server-Side Fallback (Platform Tools Integration)

**Goal**: Auto-fill the default shipping address in `getPlatformTools` when the LLM calls `flowglad_pay_buy` without providing a `shippingAddress`.

#### Files

- `lib/tools/platform.ts` — Accept and use default address
- `app/api/chat/route.ts` — Pass default address to `getPlatformTools`

#### Actions

1. **Extend `getPlatformTools` signature** (`lib/tools/platform.ts`):
   ```typescript
   export async function getPlatformTools(options?: {
     userName?: string
     defaultShippingAddress?: ShippingAddress
   })
   ```
   Import `ShippingAddress` from `@/lib/payclaw/schemas`.

2. **Add fallback logic** in `flowglad_pay_buy` execute function (after the existing `name` fallback at lines 37-42):
   ```typescript
   // Existing: fill in name if missing
   if (resolvedInput.shippingAddress && !resolvedInput.shippingAddress.name) {
     resolvedInput.shippingAddress = {
       ...resolvedInput.shippingAddress,
       name: options?.userName ?? config.userEmail,
     }
   }
   
   // New: fill in entire address from default if LLM omitted it
   if (!resolvedInput.shippingAddress && options?.defaultShippingAddress) {
     resolvedInput.shippingAddress = {
       ...options.defaultShippingAddress,
       name: options.defaultShippingAddress.name || options?.userName ?? config.userEmail,
     }
   }
   ```

3. **Pass default address from chat route** (`app/api/chat/route.ts`):
   - Extract the default address from the already-fetched address list:
     ```typescript
     const defaultAddress = userAddresses.find((a) => a.isDefault)
     ```
   - Pass to `getPlatformTools`:
     ```typescript
     const platformResult = await getPlatformTools({
       userName: userName || undefined,
       defaultShippingAddress: defaultAddress
         ? {
             name: defaultAddress.name,
             line1: defaultAddress.line1,
             line2: defaultAddress.line2,
             city: defaultAddress.city,
             state: defaultAddress.state,
             postalCode: defaultAddress.postalCode,
             country: defaultAddress.country,
           }
         : undefined,
     })
     ```

4. **Update tool description** in `flowglad_pay_buy` (line 25 in `platform.ts`):
   - Change: `"Extract all fields from the user message."`
   - To: `"If the user has a shipping address on file (visible in the system prompt), use it. Otherwise extract from the user message."`

#### Guardrails

- Do NOT remove the existing `name` fallback logic — it still handles the case where the LLM provides an address but omits the name
- The new fallback only fires when `shippingAddress` is entirely `undefined` (not when partially filled)
- The `defaultShippingAddress` shape must match `ShippingAddress` from `lib/payclaw/schemas.ts` exactly
- Do not pass Convex document metadata (`_id`, `_creationTime`, `userId`, `label`, `isDefault`, `createdAt`) to the platform tools — map to the clean `ShippingAddress` shape (see Appendix F)

#### Exit Criteria

- [ ] `getPlatformTools` accepts optional `defaultShippingAddress` parameter
- [ ] When LLM provides `shippingAddress`, it is used as-is (no override)
- [ ] When LLM omits `shippingAddress` and default exists, fallback fills it
- [ ] When LLM omits `shippingAddress` and no default exists, behavior is unchanged
- [ ] The `name` fallback chain still works: address.name → userName → config.userEmail
- [ ] Tool description updated to reference stored addresses
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes

---

## Recommended Execution Order

1. **Phase 1** — Data layer first (schema + Convex functions)
2. **Phase 2** — Settings UI (can be tested in isolation with Convex dev)
3. **Phase 3** — System prompt injection (requires Phase 1 data to exist)
4. **Phase 4** — Server-side fallback (requires Phase 1 + Phase 3 co-located fetch)

Reason: Each phase builds on the previous. Phase 1 is the foundation. Phase 2 gives users the ability to create data. Phase 3 makes that data visible to the LLM. Phase 4 adds the safety net.

---

## File Change Map

| File | Change Type | Phase |
|------|------------|-------|
| `convex/schema.ts` | Modify (add table) | 1 |
| `convex/shippingAddresses.ts` | **New file** | 1 |
| `app/components/layout/settings/general/shipping-addresses.tsx` | **New file** | 2 |
| `app/components/layout/settings/settings-content.tsx` | Modify (add import + component) | 2 |
| `app/api/chat/route.ts` | Modify (fetch addresses, inject prompt, pass to tools) | 3, 4 |
| `lib/tools/platform.ts` | Modify (accept + use default address) | 4 |

---

## Validation Matrix (Must Pass Before Merge)

### Data Integrity

- [ ] First address created for a user is automatically default
- [ ] Only one address can be default at a time
- [ ] Deleting the default address promotes the oldest remaining
- [ ] Deleting the last address leaves no orphan default state
- [ ] All mutations require authentication and verify ownership
- [ ] Non-owner cannot read/modify another user's addresses

### Settings UI

- [ ] Add, edit, delete flows work correctly
- [ ] "Set as default" only appears when 2+ addresses exist
- [ ] Default badge displays on the correct address
- [ ] Form validation prevents saving invalid data
- [ ] State dropdown shows all 50 US states + DC
- [ ] ZIP code validation accepts 5-digit and ZIP+4
- [ ] Renders correctly in desktop settings and mobile drawer
- [ ] Toast notifications for all success/error states

### Chat Integration

- [ ] System prompt contains address block when user has addresses
- [ ] System prompt is unmodified when user has no addresses
- [ ] Anonymous users see no change in behavior
- [ ] Address fetch failure does not break chat
- [ ] LLM can reference the default address in conversation
- [ ] LLM can reference non-default addresses when user asks

### Flowglad Pay Fallback

- [ ] Tool call with explicit address uses provided address (no override)
- [ ] Tool call without address auto-fills from default
- [ ] Tool call without address and no default behaves as before
- [ ] Name fallback chain preserved: address.name → userName → email

### Engineering

- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run build` succeeds
- [ ] No `// @ts-ignore` or `eslint-disable` added

---

## Future Considerations (Out of Scope)

These are documented for future planning but are NOT part of this implementation:

1. **International addresses**: Add country selector, dynamic state/province fields, and localized postal code validation. Extension points are marked with `// TODO` comments.
2. **Address verification**: Integrate USPS/Google Address Validation API to verify addresses on save.
3. **User context enrichment**: Generalize the system prompt injection pattern into a configurable context enrichment system. The `formatAddressContext` function establishes the pattern.
4. **Billing addresses**: Reuse the same table with a `type` discriminator field (`"shipping" | "billing"`).
5. **Per-user Flowglad Pay keys**: When implemented, associate addresses with Flowglad accounts rather than just system prompt context.

---

## Implementation Reference Appendix

> **Critical patterns extracted from the codebase.** These prevent the most common implementation errors. Agents MUST follow these exact patterns — do not improvise alternatives.

### A. Convex Auth Pattern in Shipping Address Functions

Every function in `convex/shippingAddresses.ts` must resolve the authenticated user's `_id` from Clerk's `identity.subject`. This is the exact pattern used in `convex/users.ts`:

```typescript
const identity = await ctx.auth.getUserIdentity()
if (!identity) throw new Error("Not authenticated")

const user = await ctx.db
  .query("users")
  .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
  .unique()

if (!user) throw new Error("User not found")

// Now use user._id as the userId for all operations
```

**Why this matters**: Convex mutations receive `identity.subject` (Clerk's user ID string), NOT a Convex `Id<"users">`. You must look up the user to get the Convex document `_id`. Skipping this step causes foreign key mismatches.

### B. Server-Side Convex Query in Chat Route

The chat route (`app/api/chat/route.ts`) uses `fetchMutation` from `convex/nextjs` but does NOT currently import `fetchQuery`. To fetch addresses server-side:

1. **Add `fetchQuery` to the existing import** (line 31):
   ```typescript
   import { fetchMutation, fetchQuery } from "convex/nextjs"
   ```

2. **Use the token-authenticated pattern** from `lib/user-keys.ts`:
   ```typescript
   const addresses = await fetchQuery(
     api.shippingAddresses.list,
     {},
     { token: convexToken }
   )
   ```

3. **Place the fetch inside the existing `if (isAuthenticated)` block** (lines 380-391) alongside the Clerk user fetch, using the already-available `convexToken`. Wrap in try/catch — address fetch failure must not break the chat route:
   ```typescript
   let userAddresses: Array<{...}> = []
   try {
     userAddresses = await fetchQuery(
       api.shippingAddresses.list,
       {},
       { token: convexToken }
     ) ?? []
   } catch (err) {
     console.warn("[chat] Failed to fetch shipping addresses:", err)
   }
   ```

**Why this matters**: Using `fetchQuery` without `{ token }` will fail auth checks in the Convex function. Using `fetchMutation` instead of `fetchQuery` for a read operation violates Convex conventions.

### C. Base UI Select Component API

The Select component (`components/ui/select.tsx`) uses **Base UI** (`@base-ui/react/select`), NOT Radix. The API differs. Reference the exact pattern from `mcp-server-form.tsx`:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select
  value={state}
  onValueChange={(v) => setState(v)}
  disabled={isLoading}
>
  <SelectTrigger className="w-full">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="NY">New York</SelectItem>
    <SelectItem value="CA">California</SelectItem>
  </SelectContent>
</Select>
```

**Why this matters**: Radix Select uses `onValueChange(value: string)`. Base UI Select also uses `onValueChange` but the component composition differs. Using Radix patterns (like `<SelectPrimitive.Root>` directly) or wrong prop names will cause runtime errors.

### D. Gold Standard UI Reference: MCP Servers (NOT SystemPromptSection)

The closest existing pattern for the shipping addresses UI is `app/components/layout/settings/connections/mcp-servers.tsx` + `mcp-server-form.tsx`, NOT `SystemPromptSection`. Key patterns to follow:

| Pattern | McpServers Reference | Apply To |
|---------|---------------------|----------|
| List from Convex | `useQuery(api.mcpServers.list) ?? []` | `useQuery(api.shippingAddresses.list) ?? []` |
| Mutations | `useMutation(api.mcpServers.remove)` | `useMutation(api.shippingAddresses.remove)` |
| Form state | `const [formOpen, setFormOpen] = useState(false)` | Same pattern for add/edit form |
| Edit state | `const [editingServer, setEditingServer] = useState(null)` | `const [editingAddress, setEditingAddress] = useState(null)` |
| Delete confirmation | `AlertDialog` with confirm handler | Same pattern |
| Card layout | `Card` + `CardContent` per item | Same pattern |
| Toast feedback | `toast({ title, description, status })` | Same pattern |
| Header layout | Heading + description + "Add" button | Same pattern |
| Empty state | Centered icon + text + CTA button | Same pattern |

**Why this matters**: SystemPromptSection is a simple single-field form. Shipping addresses is a CRUD list with cards, confirmations, and form state management — structurally identical to MCP Servers.

### E. US States Constant

Define the US states array inline in the shipping addresses component (it's only used there). Include all 50 states + DC, sorted alphabetically:

```typescript
const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
] as const
// TODO: Replace with international regions when adding country support
```

**Why this matters**: Hardcoding state codes without labels produces a poor UX. Including only 48 states (forgetting HI/AK or DC) is a common mistake.

### F. Convex Document Type vs ShippingAddress Type

Convex queries return documents with internal fields (`_id`, `_creationTime`). When mapping to the `ShippingAddress` type from `lib/payclaw/schemas.ts` for `getPlatformTools`, strip Convex metadata:

```typescript
// From Convex document → ShippingAddress (for platform tools)
const defaultAddress = userAddresses.find((a) => a.isDefault)
const cleanAddress = defaultAddress
  ? {
      name: defaultAddress.name,
      line1: defaultAddress.line1,
      line2: defaultAddress.line2,
      city: defaultAddress.city,
      state: defaultAddress.state,
      postalCode: defaultAddress.postalCode,
      country: defaultAddress.country,
    }
  : undefined
```

**Why this matters**: Passing `_id`, `_creationTime`, `userId`, `label`, `isDefault`, `createdAt` to the PayClaw API will cause validation failures or leak internal data.

### G. Convex Query Argument Requirements

Convex functions declared with `args: {}` (empty args object) still require an empty object `{}` when called from `fetchQuery`:

```typescript
// Correct — Convex requires the args object even when empty
await fetchQuery(api.shippingAddresses.list, {}, { token: convexToken })

// Wrong — will throw "Expected object, got undefined"
await fetchQuery(api.shippingAddresses.list, { token: convexToken })
```

For the `list` and `getDefault` queries that take no user-provided args (auth is from the token), the args validator should be `args: {}` and the call must pass `{}` as the second argument.

### H. Convex `useQuery` Null Handling

Convex `useQuery` returns `undefined` while loading and the actual result (which could be `null` or an array) when loaded. The UI must handle both:

```typescript
const addresses = useQuery(api.shippingAddresses.list) ?? []
//                                                       ^^^
// Default to empty array — handles both undefined (loading) and null
```

Follow the pattern in `mcp-servers.tsx` line 61: `const servers = useQuery(api.mcpServers.list) ?? []`

---

## Definition of Done

All four phases are implemented, all validation matrix items pass, the settings UI is responsive across mobile and desktop, the system prompt correctly surfaces addresses during chat, and the Flowglad Pay fallback auto-fills the default address when the LLM omits it. No regressions to existing chat, settings, or authentication flows.
