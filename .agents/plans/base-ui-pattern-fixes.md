# Base UI Pattern Fixes — Agent Execution Plan (Revised)

> **Status**: Pending
> **Priority**: P0 (Shadcn alignment + animation bugs) → P1 (app patterns) → P2 (cleanup)
> **Created**: February 11, 2026
> **Revised**: February 15, 2026
> **Prerequisite**: Base UI migration completed (February 9, 2026)
> **Branch**: Create `fix/base-ui-patterns` from current branch

---

## How to Use This Plan

This plan aligns the codebase with official Shadcn Base UI patterns and fixes issues left over from the Radix UI → Base UI migration. Each phase is self-contained with:

- **Context to load** — files and skills to read before starting
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete

**Permission notes**:
- All phases modify files in `components/ui/` and `app/components/` (allowed per `AGENTS.md`)
- Phase 5B removes a package from `package.json` (**Ask First** per `AGENTS.md`)
- No phases modify `convex/schema.ts`, `middleware.ts`, or `.env*` files

**Key skills to load before starting**:
- `@.agents/skills/base-ui-useRender/SKILL.md` — Migrating from asChild to render prop
- `@.agents/skills/base-ui-animation/SKILL.md` — Animation patterns (CSS transitions vs CSS animations)
- `@.agents/skills/base-ui-migration-audit/SKILL.md` — Radix → Base UI migration audit checklist
- `@.agents/skills/base-ui-styling/SKILL.md` — Styling patterns (data attributes, CSS variables)
- `@.agents/skills/base-ui-typescript/SKILL.md` — TypeScript namespace typing (Props, State, events)
- `@.agents/skills/base-ui-composition/SKILL.md` — Composition via `render` prop (nested triggers, element overrides)

---

## Official Shadcn Base UI Reference

> **Repository**: [`shadcn-ui/ui`](https://github.com/shadcn-ui/ui) (main branch)
> **Last verified**: February 15, 2026

### Registry Paths

| Path | Contents | Our target? |
|------|----------|-------------|
| `apps/v4/registry/bases/base/ui/` | **Base UI components** — structural patterns using `@base-ui/react` | **YES — this is the source of truth** |
| `apps/v4/registry/new-york-v4/ui/` | Styled components still using **Radix UI** (`radix-ui`) | No — still Radix-based, NOT Base UI |

**Important**: The `new-york-v4` registry still uses Radix UI. Only the `bases/base/ui/` registry uses `@base-ui/react`. Always reference `bases/base/ui/` for structural patterns.

### Component Reference URLs

Before modifying each component, fetch the official version from the raw GitHub URL and compare. All URLs follow this pattern:

```
https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/bases/base/ui/{component}.tsx
```

| Our Component | Official Reference | Notable Differences |
|---------------|-------------------|---------------------|
| `dialog.tsx` | [bases/base/ui/dialog.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dialog.tsx) | Gold standard — already aligned structurally |
| `dropdown-menu.tsx` | [bases/base/ui/dropdown-menu.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dropdown-menu.tsx) | No `asChild`, no deprecated props, uses `cn-*` tokens for animation |
| `tooltip.tsx` | [bases/base/ui/tooltip.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/tooltip.tsx) | Includes `TooltipPrimitive.Arrow`, uses `delay` (not `delayDuration`) |
| `popover.tsx` | [bases/base/ui/popover.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/popover.tsx) | Includes `PopoverPrimitive.Arrow` |
| `hover-card.tsx` | [bases/base/ui/hover-card.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/hover-card.tsx) | Uses `PreviewCard` primitive (`@base-ui/react/preview-card`), not `HoverCard` |
| `select.tsx` | [bases/base/ui/select.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/select.tsx) | Uses `ScrollUpButton`/`ScrollDownButton` sub-components |
| `alert-dialog.tsx` | [bases/base/ui/alert-dialog.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/alert-dialog.tsx) | `AlertDialogCancel` uses `render={<Button />}` for composition |
| `sheet.tsx` | [bases/base/ui/sheet.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sheet.tsx) | Uses `@base-ui/react/dialog` (not a separate Sheet primitive) |
| `drawer.tsx` | [bases/base/ui/drawer.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/drawer.tsx) | Uses `vaul` (not `vaul-base`) — triggers are simple pass-throughs |
| `collapsible.tsx` | [bases/base/ui/collapsible.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/collapsible.tsx) | Clean pass-through, uses `CollapsiblePrimitive.Panel` for content |
| `button.tsx` | [bases/base/ui/button.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/button.tsx) | Uses `@base-ui/react/button` directly — `render` prop is built-in |
| `badge.tsx` | [bases/base/ui/badge.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/badge.tsx) | Uses `useRender` + `mergeProps` (no Base UI primitive) |
| `breadcrumb.tsx` | [bases/base/ui/breadcrumb.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/breadcrumb.tsx) | `BreadcrumbLink` uses `useRender` + `mergeProps` |
| `sidebar.tsx` | [bases/base/ui/sidebar.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx) | `SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuSubButton` use `useRender` |
| `context-menu.tsx` | [bases/base/ui/context-menu.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/context-menu.tsx) | — |
| `menubar.tsx` | [bases/base/ui/menubar.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/menubar.tsx) | — |
| `navigation-menu.tsx` | [bases/base/ui/navigation-menu.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/navigation-menu.tsx) | No `NavigationMenuIndicator` export |

### Key Architectural Findings from Official Source

1. **`render` prop support comes from two mechanisms**:
   - **Primitive-wrapping components** (Button, Dialog triggers, etc.): The `render` prop is inherited from the Base UI primitive's `.Props` type. No `useRender` needed.
   - **Non-primitive components** (Badge, BreadcrumbLink, SidebarMenuButton, etc.): Use `useRender` hook + `mergeProps` to add `render` prop support manually.

2. **All animations are in CSS** via `cn-*` token classes. No inline `data-[starting-style]` or `style={{ transition }}` in the JSX. Since we are NOT adopting `cn-*` tokens, we inline these styles — but the animation mechanism (`data-[starting-style]`/`data-[ending-style]`) is the same underneath.

3. **HoverCard uses `PreviewCard` primitive** — `@base-ui/react/preview-card`, not a `HoverCard` API. Our wrapper still exports `HoverCard*` names for API compatibility.

4. **Official Drawer uses `vaul`**, not `vaul-base`. Our codebase may use either — verify before modifying.

### Pre-Implementation Verification

**Before starting each phase**, the implementing agent MUST:

1. **Fetch the latest official component** from the raw GitHub URL above
2. **Compare** the official structure against our component AND the plan's instructions
3. **If the official version has changed** since this plan was written (February 15, 2026), update the plan's instructions to match before proceeding
4. **Document** any discrepancies found in the verification step

This ensures the plan stays aligned with Shadcn's evolving patterns.

---

## Background

### Original Context

The project migrated from Radix UI to Base UI in February 2026. While structurally complete (all imports use `@base-ui/react`), a codebase audit found issues across three priority tiers.

### New Finding: Divergence from Official Shadcn Base UI

Research into the official Shadcn Base UI components (`shadcn-ui/ui` repo, `apps/v4/registry/bases/base/ui/`) revealed that our components diverge from official Shadcn in several key ways:

1. **Composition pattern**: Our components use an `asChild` compatibility shim (`lib/as-child-adapter.ts`). Official Shadcn uses Base UI's native `render` prop directly — no `asChild` support exists at all.

2. **Animation approach**: Our popup components use `animate-in`/`animate-out` CSS keyframe animations (Radix-era `tw-animate-css`). Official Shadcn uses CSS transitions via `data-[starting-style]`/`data-[ending-style]` — the mechanism Base UI relies on for unmount detection via `element.getAnimations()`.

3. **Deprecated Radix props**: Our `DropdownMenuContent` still accepts `forceMount`, `onCloseAutoFocus`, `onInteractOutside`. Official Shadcn has none of these.

4. **Deprecated components**: Our `NavigationMenu` exports `NavigationMenuIndicator` which has no Base UI equivalent. Official Shadcn doesn't include it.

5. **HoverCard delay bridge**: Our `HoverCard` has a custom `HoverCardDelayContext` bridge for `openDelay`/`closeDelay`. Official Shadcn passes delay props directly to the trigger.

6. **Styling approach**: Official Shadcn has moved to CSS-first styling with `cn-*` token classes (e.g., `cn-dialog-overlay`, `cn-dropdown-menu-content`). Our components use inline Tailwind utilities. **This plan does NOT migrate to `cn-*` tokens** — that would be a separate, larger undertaking. We align the component architecture, animation mechanism, and API surface while keeping our existing Tailwind styling.

### Revised Priority

Aligning `components/ui/` with official Shadcn Base UI is now the **top priority**. This ensures:
- Animations work correctly with Base UI's unmount detection (fixes flash-on-dismiss)
- Future `shadcn add` commands produce structurally compatible code
- No dead props or deprecated components accumulate
- The codebase follows the official recommended patterns

### Key Behavioral Difference: `asChild` → `render`

Official Shadcn's trigger components are simple pass-throughs:

```tsx
// Official Shadcn — no asChild, no shim
function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}
```

Composition happens at the **call site** via the native `render` prop:

```tsx
// Call site — composition via render
<DialogTrigger render={<Button variant="outline" />}>
  Open Dialog
</DialogTrigger>
```

Our current components inject an `asChild` shim that must be removed. But first, all ~49 `asChild` usages across `app/` and `components/ui/` consumers must migrate to `render` — otherwise they break.

---

## Execution Strategy — Dependency Graph

```
Batch 1 — All independent, run in parallel:
├── Track A: Phase 1 — Migrate asChild → render in app/ + ui consumers (~21 files, ~49 usages)
├── Track B: Phase 2-safe — Fix animations in components/ui/ files WITHOUT asChild shims
│   ├── select.tsx
│   ├── context-menu.tsx
│   ├── menubar.tsx
│   ├── alert-dialog.tsx
│   ├── sheet.tsx
│   └── navigation-menu.tsx  (+ remove NavigationMenuIndicator)
├── Track C: Phase 3 — Fix app-info-trigger.tsx (dead onSelect + dialog refactor)
└── Track D: Phase 4 — Add isolation: isolate to app root

Batch 2 — After Phase 1 completes:
└── Phase 2-full — Complete components/ui/ alignment (single pass per file)
    ├── dropdown-menu.tsx  (asChild + animation + deprecated props)
    ├── popover.tsx        (asChild + animation)
    ├── hover-card.tsx     (asChild + animation + delay bridge)
    ├── drawer.tsx         (asChild + overlay animation)
    ├── dialog.tsx         (asChild only — animation already correct)
    ├── tooltip.tsx        (asChild only)
    ├── collapsible.tsx    (asChild only)
    └── Slot-style components: button, badge, breadcrumb, sidebar, etc.

Batch 3 — After Batch 2:
└── Phase 5 — Final cleanup
    ├── Delete lib/as-child-adapter.ts + lib/as-child-adapter.test.ts
    └── Remove tailwindcss-animate (verify unused first)
```

### Why This Ordering

| Ordering | Reason |
|----------|--------|
| Phase 1 (groups 1–6) first | App code must use `render` before components drop `asChild` — otherwise ~40 trigger call sites break |
| Phase 1 groups 7–9 deferred | Slot-style call sites (`Button asChild`, etc.) can't migrate until Phase 2F.8 adds `render` prop support |
| Track B in Batch 1 | These files have no `asChild` shim — animation fixes are independent of Phase 1 |
| Track C in Batch 1 | App-level fix in different directory, no shared files with Tracks A/B |
| Phase 2-full after Phase 1 | Files with both `asChild` + animation changes done in a single pass to avoid redundant edits |

### Within Each Track — Internal Parallelism

All steps within a track modify different files and can run in parallel or any order.

---

## Gold Standard References

### Animation Pattern — `dialog.tsx`

`components/ui/dialog.tsx` already uses the correct Base UI animation pattern. Use it as the reference for all animation fixes.

#### Overlay/Backdrop Pattern (fade only)

```tsx
<Backdrop
  className={cn(
    "fixed inset-0 z-50 bg-black/50",
    "data-[starting-style]:opacity-0",
    "data-[ending-style]:opacity-0",
    className
  )}
  style={{ transition: "opacity 200ms ease-out" }}
  {...props}
/>
```

#### Popup/Content Pattern (fade + scale)

```tsx
<Popup
  className={cn(
    "... layout classes ...",
    "data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]",
    "data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]",
    className
  )}
  style={{
    transition: "opacity 200ms ease-out, transform 200ms ease-out",
  }}
  {...props}
/>
```

### Why This Pattern Works

1. **`data-[starting-style]` / `data-[ending-style]`** — Base UI's built-in attributes for enter/exit transitions. Base UI uses `element.getAnimations()` to detect running CSS transitions and waits for them to finish before unmounting.
2. **Inline `style` for transition** — Tailwind's `transition-[opacity,transform]` arbitrary utility may not reliably compose with custom durations. An inline `style={{ transition: "..." }}` is explicit and avoids ambiguity.
3. **`[transform:scale(0.95)]`** — Uses the legacy `transform` CSS property (not Tailwind's individual `scale-95` utility). Tailwind v4 emits `scale` as an individual CSS property, which means `transition: transform` wouldn't cover it. Using `[transform:scale(0.95)]` ensures the animation runs on the `transform` property that the transition targets.
4. **No `animate-in`/`animate-out`** — CSS animations from tw-animate cannot be smoothly cancelled mid-animation and may not be detected by `getAnimations()`.

### Structural Pattern — Official Shadcn

#### Trigger (no asChild, just pass-through)

```tsx
function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}
```

#### Close Button (render prop for composition)

```tsx
<DialogPrimitive.Close
  data-slot="dialog-close"
  render={<Button variant="ghost" size="icon-sm" />}
>
  <XIcon />
  <span className="sr-only">Close</span>
</DialogPrimitive.Close>
```

#### Slot-style Component (useRender hook)

```tsx
import { useRender } from '@base-ui/react/use-render'
import { mergeProps } from '@base-ui/react/merge-props'

function Button({ render, className, ...props }: ButtonProps) {
  return useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>({ className: cn("...", className) }, props),
  })
}
```

---

## Phase 1: Migrate `asChild` → `render` in `app/` (P0 — BLOCKING)

> **Impact**: Prerequisite for aligning `components/ui/` with official Shadcn
> **Scope**: ~49 usages across ~21 files in `app/` and `components/ui/` consumers
> **Pattern**: Replace `asChild` composition with Base UI's native `render` prop

### Context to Load

- `@.agents/skills/base-ui-useRender/SKILL.md` — render prop patterns
- `lib/as-child-adapter.ts` — The shim being replaced

### Migration Patterns

**Trigger components (TooltipTrigger, PopoverTrigger, DialogTrigger, etc.):**

```tsx
// BEFORE (asChild shim):
<TooltipTrigger asChild>
  <Button variant="ghost" size="icon">
    <SearchIcon />
  </Button>
</TooltipTrigger>

// AFTER (native render prop):
<TooltipTrigger render={<Button variant="ghost" size="icon" />}>
  <SearchIcon />
</TooltipTrigger>
```

**Nested composition:**

```tsx
// BEFORE:
<TooltipTrigger asChild>
  <DropdownMenuTrigger asChild>
    <Button>Open</Button>
  </DropdownMenuTrigger>
</TooltipTrigger>

// AFTER:
<TooltipTrigger render={<DropdownMenuTrigger render={<Button />} />}>
  Open
</TooltipTrigger>
```

**Slot-style components (Button, Badge, Sidebar):**

```tsx
// BEFORE:
<Button asChild>
  <Link href="/">Home</Link>
</Button>

// AFTER:
<Button render={<Link href="/" />}>
  Home
</Button>
```

Note: This pattern requires Button to support `render` prop (done in Phase 2-full, Step 2F.8). These call sites are **deferred to Phase 2F.8** — migrate them together with the component-side `useRender` changes. Same applies to `FileUploadTrigger asChild` and Sidebar `asChild` usages.

### Recommended Migration Order

Migrate by component type, simplest first:

**Groups 1–6: Trigger-style (can complete independently)**

1. **`TooltipTrigger asChild`** (~31 usages) — Most common, simplest
2. **`PopoverTrigger asChild`** (~6 usages)
3. **`DropdownMenuTrigger asChild`** (~4 usages)
4. **`DialogTrigger asChild`** (~1 usage)
5. **`DrawerTrigger/Close asChild`** (~3 usages)
6. **`CollapsibleTrigger asChild`** (~1 usage in `components/ui/tool.tsx`)

**Groups 7–9: Slot-style (DEFERRED — require Phase 2F.8 first)**

These call sites use `asChild` on slot-style components (`Button`, `FileUploadTrigger`, Sidebar components) that need `useRender` support before consumers can switch to `render`. Migrate these call sites **together with** Phase 2F.8.

7. **`Button asChild`** (~3 usages in `header.tsx`, `error/page.tsx`) — Needs Button `render` prop (Phase 2F.8)
8. **`FileUploadTrigger asChild`** (~1 usage in `button-file-upload.tsx`) — Needs FileUpload `render` prop (Phase 2F.8)
9. **`Sidebar components`** (~5 usages) — Needs Sidebar `render` props (Phase 2F.8)

### Files with `asChild` in `app/` and `components/ui/` consumers

```
app/components/chat-input/button-plus-menu.tsx      ← 6 usages (was missing from original plan)
app/components/chat-input/button-file-upload.tsx
app/components/chat-input/button-search.tsx
app/components/chat-input/file-items.tsx
app/components/history/command-history.tsx
app/components/history/command-footer.tsx
app/components/history/drawer-history.tsx
app/components/layout/app-info/app-info-trigger.tsx
app/components/layout/button-new-chat.tsx
app/components/layout/dialog-publish.tsx
app/components/layout/header-sidebar-trigger.tsx
app/components/layout/header.tsx
app/components/layout/settings/settings-content.tsx
app/components/layout/sidebar/app-sidebar.tsx
app/components/layout/sidebar/sidebar-item-menu.tsx
app/components/layout/sidebar/sidebar-menu-item.tsx
app/components/layout/sidebar/sidebar-project-menu.tsx
app/components/layout/user-menu.tsx
app/components/multi-chat/multi-chat-input.tsx
app/auth/error/page.tsx
components/ui/tool.tsx                               ← 1 usage (CollapsibleTrigger asChild, lives in components/ui/)
```

### Verify Phase 1

```bash
# After each file:
bun run typecheck
bun run lint

# After all trigger-style migrations (groups 1–6):
rg "asChild" app/ components/ui/tool.tsx --glob="*.tsx"
# Expected: Only slot-style usages remain (Button asChild, FileUploadTrigger asChild,
# SidebarMenu* asChild) — these are deferred to Phase 2F.8

# Verify trigger-style asChild is fully gone:
rg "TooltipTrigger asChild|PopoverTrigger asChild|DropdownMenuTrigger asChild|DialogTrigger asChild|DrawerTrigger asChild|DrawerClose asChild|CollapsibleTrigger asChild" app/ components/ui/tool.tsx --glob="*.tsx"
# Expected: No matches
```

**Note**: Groups 7–9 (`Button asChild`, `FileUploadTrigger asChild`, Sidebar `asChild`) will remain until Phase 2F.8 adds `render` prop support to those components. Phase 1 is considered complete when all trigger-style `asChild` usages (groups 1–6) are migrated.

---

## Phase 2-safe: Fix Animations in Independent Components (P0)

> **Impact**: Fixes flash-on-dismiss for popup components that don't have `asChild` shims
> **Files**: 6 component files in `components/ui/` — can run in parallel with Phase 1
> **Pattern**: Replace `animate-in`/`animate-out` CSS animations with `data-[starting-style]`/`data-[ending-style]` CSS transitions

### Context to Load

- `components/ui/dialog.tsx` — Gold standard (already correct)
- `@.agents/skills/base-ui-animation/SKILL.md` — Full animation guide

### Step 2S.1: Fix `select.tsx`

**File**: `components/ui/select.tsx`
**Component**: `SelectContent` (the `SelectPrimitive.Popup` inside it)

Replace animate-in/out classes with data-starting/ending-style + inline transition. Use the popup pattern (fade + scale, 150ms).

### Step 2S.2: Fix `context-menu.tsx`

**File**: `components/ui/context-menu.tsx`
**Components**: `ContextMenuContent` AND `ContextMenuSubContent`

Same popup pattern. Apply to BOTH popup elements.

### Step 2S.3: Fix `menubar.tsx`

**File**: `components/ui/menubar.tsx`
**Components**: `MenubarContent` AND `MenubarSubContent`

Same popup pattern. Apply to BOTH popup elements.

### Step 2S.4: Fix `alert-dialog.tsx`

**File**: `components/ui/alert-dialog.tsx`
**Components**: `AlertDialogOverlay` (Backdrop) AND `AlertDialogContent` (Popup)

**AlertDialogOverlay** — Apply the overlay pattern (fade only):

```
REMOVE from className:
  data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0

ADD to className:
  data-[starting-style]:opacity-0
  data-[ending-style]:opacity-0

ADD inline style:
  style={{ transition: "opacity 200ms ease-out" }}
```

**AlertDialogContent** — Apply the popup pattern (fade + scale):

```
REMOVE from className:
  data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 duration-200

ADD to className:
  data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]
  data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]

ADD inline style:
  style={{ transition: "opacity 200ms ease-out, transform 200ms ease-out" }}
```

### Step 2S.5: Fix `sheet.tsx`

**File**: `components/ui/sheet.tsx`
**Components**: `SheetOverlay` (Backdrop) AND `SheetContent` (Popup)

**SheetOverlay** — Apply the overlay pattern (fade only):

```
REMOVE from className:
  data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0

ADD to className:
  data-[starting-style]:opacity-0
  data-[ending-style]:opacity-0

ADD inline style:
  style={{ transition: "opacity 250ms ease-in-out" }}
```

**SheetContent** — Uses slide animations (not scale). Per-side data attributes + `translate` transitions:

```
REMOVE from className:
  data-[open]:animate-in data-[closed]:animate-out
  transition ease-in-out data-[closed]:duration-250 data-[open]:duration-250
  data-[closed]:slide-out-to-right data-[open]:slide-in-from-right (and all side variants)

ADD to className (for each side):
  Side "right":  data-[starting-style]:translate-x-full  data-[ending-style]:translate-x-full
  Side "left":   data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full
  Side "top":    data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full
  Side "bottom": data-[starting-style]:translate-y-full  data-[ending-style]:translate-y-full

ADD to all sides:
  data-[starting-style]:opacity-0 data-[ending-style]:opacity-0

ADD inline style:
  style={{ transition: "translate 250ms ease-in-out, opacity 250ms ease-in-out" }}
```

### Step 2S.6: Fix `navigation-menu.tsx` + remove `NavigationMenuIndicator`

**File**: `components/ui/navigation-menu.tsx`

**A) `NavigationMenuContent`** — Simplify to fade only (drop directional slide animations):

```
REMOVE: data-[open]:animate-in data-[closed]:animate-out and all directional slide classes
ADD:    data-[starting-style]:opacity-0 data-[ending-style]:opacity-0
ADD:    style={{ transition: "opacity 200ms ease-out" }}
```

Also fix any `group-data-[viewport=false]` prefixed animation classes the same way.

**B) `NavigationMenuViewport`** (Popup wrapper) — Replace with fade + scale:

```
REMOVE: data-[open]:animate-in data-[closed]:animate-out data-[closed]:zoom-out-95 data-[open]:zoom-in-90
ADD:    data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]
        data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]
ADD:    style={{ transition: "opacity 200ms ease-out, transform 200ms ease-out" }}
```

**C) Remove `NavigationMenuIndicator`:**

1. Scan for consumers: `rg "NavigationMenuIndicator" app/ components/ --glob="*.tsx"`. Remove/replace usage first.
2. Remove the `NavigationMenuIndicator` function and its export.

### Verify Phase 2-safe

```bash
# 1. No animate-in/animate-out in fixed files
rg "animate-in|animate-out" components/ui/select.tsx components/ui/context-menu.tsx components/ui/menubar.tsx components/ui/alert-dialog.tsx components/ui/sheet.tsx components/ui/navigation-menu.tsx
# Expected: No matches

# 2. data-starting-style present in all fixed files
rg "data-\[starting-style\]" components/ui/select.tsx components/ui/context-menu.tsx components/ui/menubar.tsx components/ui/alert-dialog.tsx components/ui/sheet.tsx components/ui/navigation-menu.tsx
# Expected: Matches in each file

# 3. NavigationMenuIndicator removed
rg "NavigationMenuIndicator" components/ui/navigation-menu.tsx
# Expected: No matches

# 4. Lint and typecheck
bun run lint
bun run typecheck
```

---

## Phase 2-full: Complete `components/ui/` Alignment (P0)

> **Impact**: Brings all Shadcn components in line with official Base UI patterns
> **Prerequisite**: Phase 1 groups 1–6 must be complete (all trigger-style `asChild` usages migrated). Groups 7–9 (slot-style) are migrated alongside Step 2F.8.
> **Pattern**: Remove `asChild` shim + fix remaining animations + remove deprecated code, all in a single pass per file

### Context to Load

- `@.agents/skills/base-ui-useRender/SKILL.md` — render prop / useRender patterns
- `lib/as-child-adapter.ts` — The shim being removed

### Step 2F.1: Fix `dropdown-menu.tsx` (asChild + animation + deprecated props)

**A) Remove `asChild` from `DropdownMenuTrigger`:**

1. Remove `asChild` and `children` from destructured params
2. Remove `adaptAsChild` import
3. Remove the `adaptAsChild` call and `adapted.render` / `adapted.children` usage
4. Simplify to pass-through:

```tsx
function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}
```

**B) Fix animation on `DropdownMenuContent` (the `MenuPrimitive.Popup`):**

```
REMOVE from className:
  data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0
  data-[closed]:zoom-out-95 data-[open]:zoom-in-95
  data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2
  data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2

ADD to className:
  data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]
  data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]

ADD inline style:
  style={{ transition: "opacity 150ms ease-out, transform 150ms ease-out" }}
```

Keep `origin-(--transform-origin)` in the className.

**C) Remove deprecated Radix props:**

1. Scan consumers: `rg "forceMount|onCloseAutoFocus|onInteractOutside" app/ --glob="*.tsx"`. Fix any found before proceeding.
2. Remove destructured params: `forceMount: _forceMount`, `onCloseAutoFocus: _onCloseAutoFocus`, `onInteractOutside: _onInteractOutside`
3. Remove the type extensions and `@deprecated` JSDoc comments

Resulting signature:

```tsx
function DropdownMenuContent({
  className,
  sideOffset = 4,
  side = "bottom",
  align = "start",
  alignOffset,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
```

### Step 2F.2: Fix `popover.tsx` (asChild + animation)

**A) Remove `asChild` from `PopoverTrigger`:** Same pattern as 2F.1A — simplify to pass-through.

**B) Fix animation on `PopoverContent`:** Same popup pattern (fade + scale, 150ms) as 2F.1B.

### Step 2F.3: Fix `hover-card.tsx` (asChild + animation + delay bridge)

> **Official reference**: [bases/base/ui/hover-card.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/hover-card.tsx)
> **Note**: Official Shadcn uses `@base-ui/react/preview-card` (`PreviewCard` primitive), not a `HoverCard` API. Our wrapper keeps the `HoverCard*` export names for API compatibility but should use `PreviewCardPrimitive` internally.

**A) Remove `asChild` from `HoverCardTrigger`:** Same pattern as 2F.1A.

**B) Fix animation on `HoverCardContent`:** Same popup pattern (fade + scale, 150ms) as 2F.1B.

**C) Remove HoverCard delay bridge:**

1. Scan consumers: `rg "openDelay|closeDelay" app/ --glob="*.tsx"`. Migrate any consumers to pass `delay`/`closeDelay` directly to `<HoverCardTrigger>` instead.
2. Remove `HoverCardDelayContext` creation and its `React.createContext` call
3. Remove the `HoverCardDelayContext.Provider` wrapper from `HoverCard`
4. Remove `openDelay`/`closeDelay` props and `@deprecated` JSDoc from `HoverCard`
5. Remove `useContext(HoverCardDelayContext)` and fallback logic in `HoverCardTrigger`
6. Let `delay`/`closeDelay` pass through naturally as `HoverCardTrigger` props

### Step 2F.4: Fix `drawer.tsx` (asChild + overlay animation)

**A) Remove `asChild` from `DrawerTrigger` and `DrawerClose`:** Same pattern as 2F.1A — simplify both to pass-throughs.

**B) Fix `DrawerOverlay` animation** — overlay pattern (fade only):

```
REMOVE from className:
  data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0

ADD to className:
  data-[starting-style]:opacity-0
  data-[ending-style]:opacity-0

ADD inline style:
  style={{ transition: "opacity 200ms ease-out" }}
```

Note: `DrawerContent` uses `vaul`/`vaul-base` for its own slide/drag animation. Do NOT modify `DrawerContent`.

> **Official reference**: [bases/base/ui/drawer.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/drawer.tsx) — uses `vaul` (not `vaul-base`). Verify which package our codebase uses before modifying.

### Step 2F.5: Fix `dialog.tsx` (asChild only — animation already correct)

Remove `asChild` from `DialogTrigger`:

1. Remove `asChild` and `children` from destructured params
2. Remove `adaptAsChild` import
3. Simplify to pass-through:

```tsx
function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}
```

No animation changes needed — `dialog.tsx` is already the gold standard.

### Step 2F.6: Fix `tooltip.tsx` (asChild only)

Remove `asChild` from `TooltipTrigger`:

1. Remove `asChild` and `children` from destructured params
2. Remove `adaptAsChild` import
3. Simplify to pass-through:

```tsx
function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}
```

### Step 2F.7: Fix `collapsible.tsx` (asChild only)

Remove `asChild` from `CollapsibleTrigger`: same pass-through pattern.

**Companion migration**: `components/ui/tool.tsx` has a `CollapsibleTrigger asChild` usage at line 138. This is a **consumer** (not a component definition), but it lives in `components/ui/` rather than `app/`. If not already migrated in Phase 1 (group 6), migrate it here alongside the component-side change:

```tsx
// BEFORE:
<CollapsibleTrigger asChild>
  <Button ...>...</Button>
</CollapsibleTrigger>

// AFTER:
<CollapsibleTrigger render={<Button ... />}>
  ...
</CollapsibleTrigger>
```

### Step 2F.8: Remove `asChild` from slot-style components

These components use `adaptSlotAsChild` (not `adaptAsChild`) for polymorphic rendering. There are **two migration strategies** depending on whether a Base UI primitive exists for the component.

> **Official references** — fetch and compare before implementing:
> - [bases/base/ui/button.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/button.tsx) — uses `@base-ui/react/button` directly
> - [bases/base/ui/badge.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/badge.tsx) — uses `useRender` + `mergeProps`
> - [bases/base/ui/breadcrumb.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/breadcrumb.tsx) — `BreadcrumbLink` uses `useRender`
> - [bases/base/ui/sidebar.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx) — `SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuSubButton` use `useRender`

#### Strategy A: Primitive-wrapping — use Base UI primitive directly

**Applies to**: `button.tsx`

When a Base UI primitive exists (`@base-ui/react/button`), wrap it directly. The `render` prop is inherited from the primitive's `.Props` type — no `useRender` needed.

```tsx
// BEFORE (adaptSlotAsChild shim):
import { adaptSlotAsChild } from "@/lib/as-child-adapter"

function Button({ asChild, children, className, variant, size, ...props }: ButtonProps) {
  const adapted = adaptSlotAsChild(asChild, children, "button")
  // ... uses adapted.render and adapted.children
}

// AFTER (Base UI primitive — official Shadcn pattern):
import { Button as ButtonPrimitive } from "@base-ui/react/button"

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
```

The `render` prop is automatically available via `ButtonPrimitive.Props`. No type extension needed.

#### Strategy B: Non-primitive — use `useRender` + `mergeProps`

**Applies to**: `badge.tsx`, `breadcrumb.tsx` (`BreadcrumbLink`), `sidebar.tsx` (`SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuSubButton`), `file-upload.tsx`, `morphing-popover.tsx`, `prompt-input.tsx`, `source.tsx`, `message.tsx`

When no Base UI primitive exists, use `useRender` + `mergeProps` to add `render` prop support manually.

```tsx
// BEFORE (adaptSlotAsChild shim):
import { adaptSlotAsChild } from "@/lib/as-child-adapter"

function Badge({ asChild, children, className, variant, ...props }: BadgeProps) {
  const adapted = adaptSlotAsChild(asChild, children, "span")
  // ... uses adapted.render and adapted.children
}

// AFTER (useRender — official Shadcn pattern):
import { useRender } from "@base-ui/react/use-render"
import { mergeProps } from "@base-ui/react/merge-props"

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ className, variant })) },
      props
    ),
    render,
    state: { slot: "badge", variant },
  })
}
```

**Type change**: Replace `asChild?: boolean` with the appropriate type:
- Strategy A: No change needed — `render` comes from `ButtonPrimitive.Props`
- Strategy B: Use `useRender.ComponentProps<'span'>` (or appropriate tag) as the base props type

See `@.agents/skills/base-ui-useRender/SKILL.md` for full `useRender` patterns.

#### Files and their strategy

| File | Component(s) | Strategy |
|------|-------------|----------|
| `components/ui/button.tsx` | `Button` | **A** — use `@base-ui/react/button` |
| `components/ui/badge.tsx` | `Badge` | **B** — `useRender` |
| `components/ui/breadcrumb.tsx` | `BreadcrumbLink` | **B** — `useRender` |
| `components/ui/sidebar.tsx` | `SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuSubButton` | **B** — `useRender` |
| `components/ui/file-upload.tsx` | `FileUploadTrigger` | **B** — `useRender` |
| `components/ui/morphing-popover.tsx` | TBD | **B** — `useRender` |
| `components/ui/prompt-input.tsx` | TBD | **B** — `useRender` |
| `components/ui/source.tsx` | TBD | **B** — `useRender` |
| `components/ui/message.tsx` | TBD | **B** — `useRender` |

**Companion call-site migrations** (deferred from Phase 1 groups 7–9): When migrating each slot-style component, also update its consumers in `app/`:

- **`button.tsx`** → Migrate `Button asChild` in `app/components/layout/header.tsx` (~2) and `app/auth/error/page.tsx` (~1)
- **`file-upload.tsx`** → Migrate `FileUploadTrigger asChild` in `app/components/chat-input/button-file-upload.tsx` (~1)
- **`sidebar.tsx`** → Migrate `SidebarMenu* asChild` usages in `app/components/layout/sidebar/` (~5)

**Note on `file-upload.tsx` animation**: This file has `animate-in fade-in-0 slide-in-from-bottom-10 zoom-in-90` classes on its **dropzone overlay** (the full-screen drag-and-drop indicator). This is intentionally **NOT migrated** to `data-[starting-style]`/`data-[ending-style]` because:
- It's not a Base UI popup/portal — it's a custom overlay triggered by drag events
- It doesn't use Base UI's unmount detection (`getAnimations()`) so the flash-on-dismiss issue doesn't apply
- The `animate-in` classes work correctly for this use case

If `tailwindcss-animate` is removed in Phase 5B, revisit this animation and replace with an equivalent CSS transition or Tailwind v4 animation.

### Verify Phase 2-full

```bash
# 1. No asChild in any components/ui/ file
rg "asChild" components/ui/ --glob="*.tsx"
# Expected: No matches

# 2. No asChild remaining in app/ (slot-style call sites migrated alongside 2F.8)
rg "asChild" app/ --glob="*.tsx"
# Expected: No matches

# 3. No adaptAsChild/adaptSlotAsChild imports
rg "adaptAsChild|adaptSlotAsChild" components/ --glob="*.{ts,tsx}"
# Expected: No matches

# 4. No animate-in/animate-out in popup components
rg "animate-in|animate-out" components/ui/dropdown-menu.tsx components/ui/popover.tsx components/ui/hover-card.tsx components/ui/drawer.tsx
# Expected: No matches
# NOTE: components/ui/file-upload.tsx still has animate-in on its dropzone overlay — intentional (see Step 2F.8 note)

# 5. Deprecated props removed
rg "forceMount|onCloseAutoFocus|onInteractOutside" components/ui/dropdown-menu.tsx
# Expected: No matches

# 6. HoverCard delay bridge removed
rg "HoverCardDelayContext|openDelay" components/ui/hover-card.tsx
# Expected: No matches

# 7. Lint and typecheck
bun run lint
bun run typecheck
```

**Manual verification**: Open the app, interact with every popup type (dropdown menus, tooltips, popovers, dialogs, sheets, hover cards, drawers). Confirm:
- Smooth enter/exit animations with no flash-on-dismiss
- All trigger composition still works (buttons open popups correctly)
- Keyboard navigation and accessibility preserved

---

## Phase 3: Fix App-Level Anti-Patterns (P1)

> **Impact**: Fixes broken menu item behavior and prevents dialog-inside-dropdown bugs
> **Files**: `app/components/layout/app-info/app-info-trigger.tsx`

### Context to Load

- `app/components/layout/user-menu.tsx` — Gold standard for dialog-outside-dropdown pattern
- `app/components/layout/settings/settings-trigger.tsx` — Gold standard for separated trigger/dialog
- `app/components/layout/feedback/feedback-trigger.tsx` — Gold standard for separated trigger/dialog
- `@.agents/skills/base-ui-customization/SKILL.md` — Base UI event customization (`eventDetails.cancel()`, controlled components). Useful for edge cases where you need to prevent specific state changes without fully controlling the component.

### Step 3.1: Refactor `app-info-trigger.tsx`

The current `AppInfoTrigger` renders a Dialog/Drawer root wrapping a DropdownMenuItem with the dead Radix `onSelect={(e) => e.preventDefault()}` pattern. The Dialog/Drawer tree would be inside DropdownMenuContent — causing flash-and-disappear.

**Refactor to the separated pattern** (matching `settings-trigger.tsx` and `feedback-trigger.tsx`):

1. Split into two exports:
   - `AppInfoMenuItem` — A `DropdownMenuItem` that accepts an `onClick` prop
   - `AppInfoDialog` — A controlled Dialog/Drawer with `open` and `onOpenChange` props

2. Remove `onSelect={(e) => e.preventDefault()}` entirely — it does nothing in Base UI.

3. The consuming component renders:

```tsx
// In the parent component:
const [appInfoOpen, setAppInfoOpen] = useState(false)

// Inside DropdownMenuContent:
<AppInfoMenuItem onClick={() => setAppInfoOpen(true)} />

// OUTSIDE DropdownMenu tree (sibling):
<AppInfoDialog open={appInfoOpen} onOpenChange={setAppInfoOpen} />
```

### Verify Phase 3

```bash
# 1. No onSelect in app-info-trigger.tsx
rg "onSelect" app/components/layout/app-info/app-info-trigger.tsx
# Expected: No matches

# 2. No Dialog/Drawer root inside DropdownMenuContent anywhere
# Manual: Review that Dialog/Drawer roots are always siblings of DropdownMenu, never children

# 3. Lint and typecheck
bun run lint
bun run typecheck
```

---

## Phase 4: Add `isolation: isolate` to App Root (P1)

> **Impact**: Prevents z-index interference with portaled popups (Base UI recommendation)
> **Files**: `app/layout.tsx`

### Context to Load

- `app/layout.tsx`
- Base UI Quick Start: https://base-ui.com/react/overview/quick-start (portals section)

### Step 4.1: Add isolation to root

Add `isolation: isolate` to the app root so portaled popups (rendered outside the app root via `<Portal>`) don't compete with the app's z-index stacking context.

**Preferred approach** — add the Tailwind class to `<body>` in `app/layout.tsx`:

```tsx
<body className={cn("... existing classes ...", "isolate")}>
```

### Verify Phase 4

Visual check: Open the app, open a dropdown menu, tooltip, or dialog. Confirm they render above all other content without z-index issues.

---

## Phase 5: Final Cleanup (P2)

> **Prerequisite**: Phases 1, 2-safe, and 2-full must all be complete

### Step 5A: Delete `as-child-adapter`

1. Verify no remaining imports:

```bash
rg "as-child-adapter|adaptAsChild|adaptSlotAsChild" --glob="*.{ts,tsx}" --glob="!node_modules/**"
# Expected: No matches
```

2. Delete the files:
   - `lib/as-child-adapter.ts`
   - `lib/as-child-adapter.test.ts`

### Step 5B: Remove `tailwindcss-animate` (**Ask First**)

1. Verify it's unused:

```bash
rg "tailwindcss-animate" --glob="*.{css,ts,mjs,json}" --glob="!bun.lock" --glob="!node_modules/**"
```

Expected: Only in `package.json`. If it appears anywhere else (e.g., CSS imports), do NOT remove.

**Important**: `components/ui/file-upload.tsx` uses `animate-in` classes on its dropzone overlay (see Step 2F.8 note). If removing `tailwindcss-animate`, replace those classes with an equivalent CSS transition first.

2. Remove:

```bash
bun remove tailwindcss-animate
```

3. Verify:

```bash
bun run build
# Ensure build succeeds
```

### Step 5C: Update documentation

Update `.agents/` documentation to reflect the completed alignment:
- Mark this plan as Complete
- Update `components/CLAUDE.md` to remove references to `asChild` shim and `adaptAsChild`
- Update the "asChild Compatibility Shim" section to note it was removed
- Update code examples to use `render` prop pattern

---

## Summary Checklist

### Batch 1 — Run in Parallel

| Track | Phase | Priority | Files | Status |
|-------|-------|----------|-------|--------|
| A | 1 (asChild → render in app/ + ui consumers) | P0 | ~21 files, ~49 usages (groups 1–6 only; 7–9 deferred to 2F.8) | Pending |
| B | 2-safe (animations, no asChild) | P0 | 6 files in `components/ui/` | Pending |
| C | 3 (app-info-trigger refactor) | P1 | `app-info-trigger.tsx` + consumer | Pending |
| D | 4 (isolation: isolate) | P1 | `app/layout.tsx` | Pending |

### Batch 2 — After Phase 1

| Track | Phase | Priority | Files | Status |
|-------|-------|----------|-------|--------|
| — | 2-full (complete component alignment) | P0 | 7 trigger + 9 slot-style files in `components/ui/` + deferred app/ call sites (~9 usages) | Pending |

### Batch 3 — After Batch 2

| Track | Phase | Priority | Files | Status |
|-------|-------|----------|-------|--------|
| — | 5 (cleanup) | P2 | `lib/as-child-adapter.*`, `package.json`, docs | Pending |

---

## Appendix A: Animation Pattern Quick Reference

### Popup (fade + scale) — Menus, Popovers, Selects, HoverCards

```
className: data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]
           data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]
style:     transition: opacity 150ms ease-out, transform 150ms ease-out
```

### Overlay/Backdrop (fade only) — Dialogs, AlertDialogs, Sheets, Drawers

```
className: data-[starting-style]:opacity-0
           data-[ending-style]:opacity-0
style:     transition: opacity 200ms ease-out
```

### Dialog/AlertDialog Content (fade + scale, centered)

```
className: data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]
           data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]
style:     transition: opacity 200ms ease-out, transform 200ms ease-out
```

### Sheet Content (fade + slide, directional)

```
className: data-[starting-style]:opacity-0 data-[starting-style]:translate-x-full  (right)
           data-[ending-style]:opacity-0 data-[ending-style]:translate-x-full      (right)
style:     transition: translate 250ms ease-in-out, opacity 250ms ease-in-out
```

### Timing Guidelines

| Component Type | Duration | Easing |
|---------------|----------|--------|
| Menus, Popovers, Selects, HoverCards | 150ms | ease-out |
| Tooltips | 100ms | ease-out |
| Dialogs, AlertDialogs | 200ms | ease-out |
| Sheets, Drawers | 250ms | ease-in-out |
| Overlays/Backdrops | Match their content's duration | ease-out |

---

## Appendix B: Radix → Base UI Quick Mapping

| Radix/tw-animate Pattern | Base UI Equivalent |
|--------------------------|----------------------------------|
| `data-[open]:animate-in data-[closed]:animate-out` | Remove entirely (replaced by CSS transition) |
| `data-[open]:fade-in-0 data-[closed]:fade-out-0` | `data-[starting-style]:opacity-0 data-[ending-style]:opacity-0` |
| `data-[open]:zoom-in-95 data-[closed]:zoom-out-95` | `data-[starting-style]:[transform:scale(0.95)] data-[ending-style]:[transform:scale(0.95)]` |
| `data-[open]:slide-in-from-top-2` (etc.) | `data-[starting-style]:[transform:translateY(-0.5rem)]` (etc.) |
| `data-[closed]:slide-out-to-right` (etc.) | `data-[ending-style]:translate-x-full` (etc.) |
| `duration-200` | `style={{ transition: "... 200ms ..." }}` |
| `asChild` + child element (on triggers) | `render={<ChildElement />}` with children as content |
| `Slot` / `adaptSlotAsChild` (on Button) | Wrap `@base-ui/react/button` directly — `render` prop is built-in (Strategy A) |
| `Slot` / `adaptSlotAsChild` (on Badge, etc.) | `useRender` hook with `mergeProps` (Strategy B — no Base UI primitive) |
| `onSelect={(e) => e.preventDefault()}` | Remove (use `onClick` for item actions) |
| `forceMount` / `onCloseAutoFocus` / `onInteractOutside` | Remove (no Base UI equivalent) |

---

## Appendix C: Future Consideration — `cn-*` CSS Token Styling

Official Shadcn has moved to a CSS-first approach where component styling is defined via `cn-*` CSS token classes (e.g., `cn-dialog-overlay`, `cn-dropdown-menu-content`) rather than inline Tailwind utilities. This means:

- All visual styling (colors, spacing, borders, shadows, animations) is in CSS files
- Components are thinner — just structure and `cn-*` class references
- Themes can be swapped by changing CSS, not TSX

**This plan intentionally does NOT adopt `cn-*` tokens.** Reasons:
1. It would require setting up Shadcn's CSS theme infrastructure
2. All custom styling across `components/ui/` would need to be reimplemented in CSS
3. The scope would triple — this is a separate project

**When to consider it:**
- When Shadcn ships a migration tool for `cn-*` tokens
- When starting a major UI refresh
- When the team wants zero-friction `shadcn add` updates

The architectural alignment done in this plan (animations, `render` prop, clean APIs) makes a future `cn-*` migration significantly easier since the component structure will already match.
