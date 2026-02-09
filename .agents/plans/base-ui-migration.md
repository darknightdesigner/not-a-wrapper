# Base UI Migration — Execution Guide

> **Status**: Ready for Implementation
> **Decision**: Approach C — shadcn Registry Reference + Compatibility Shim Layer
> **Priority**: P1 — Strategic alignment with shadcn/ui ecosystem direction
> **Date**: February 9, 2026 | Revised: February 9, 2026 (CLI verification + registry research)

---

## How to Use This Plan

This plan is structured for AI agent step-by-step execution. Each phase is self-contained with:

- **Context to load** — files to read before starting the phase
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete
- **Decision gates** — questions that must be answered before proceeding

Phases can be resumed independently. An agent starting at Phase 3 only needs to read Phase 3's context files, not the entire plan.

**Permission notes**:
- Phase 1 runs `bun add @base-ui/react` (package addition — **Ask First** per `AGENTS.md`)
- Phase 5 (Cleanup) removes 26 `@radix-ui/*` packages from `package.json` (**Ask First**)
- All phases modify files in `components/ui/` (allowed per `AGENTS.md`)
- No phases modify `convex/schema.ts`, `middleware.ts`, or `.env*` files

---

## Decision Summary

**Implementing Approach C: shadcn Registry Reference + Compatibility Shim.** Use shadcn/ui's official Base UI registry (`https://ui.shadcn.com/r/styles/base-vega/{component}.json`) as reference implementations to rewrite all standard `components/ui/` wrapper files, add a thin `asChildAdapter` utility that preserves the `asChild` prop interface (translating it to Base UI's `render` prop internally), and manually migrate the 2 custom components (`collapsible-section.tsx`, `sidebar.tsx`).

**Why Approach C**: Minimizes risk to the ~38 `asChild` usages across 19 files in `app/` by maintaining backward-compatible props. Uses shadcn/ui's battle-tested Base UI reference implementations (available via registry at `https://ui.shadcn.com/r/styles/base-vega/{component}.json`) rather than hand-writing 32 component rewrites from scratch. Replaces 26 `@radix-ui/*` packages with a single `@base-ui/react` package. Aligns with shadcn/ui's January 2026 "Same Abstraction, Different Primitives" direction and the `components.json` `base-*` style system.

**Evolution path**: v1 (this plan — full migration with asChild shim) → v1.1 (deprecate asChild shim, migrate all app/ call sites to `render` prop) → v1.2 (update `components.json` style from `"new-york"` to `"base-vega"` so future `shadcn add` commands pull Base UI variants automatically) → v2 (adopt new Base UI-only components: Autocomplete, Combobox, NumberField, Toast).

**Supporting research**: `.agents/context/research/radix-to-base-ui-css-variables.md` — CSS custom property mapping (`--radix-*` → Base UI equivalents). 14 variables, 12 direct renames, 2 requiring architectural adjustment (navigation-menu viewport).

**CLI mechanism (verified 2026-02-09)**: shadcn/ui does NOT have a `--base-ui` CLI flag. Instead, the `style` field in `components.json` controls which primitive library is used. Setting it to a `base-*` value (e.g., `base-vega`) causes `shadcn add` to pull Base UI variants from the registry. The project currently uses `"style": "new-york"` (legacy Radix). The eventual cutover will update this to `"style": "base-vega"` so future `shadcn add` commands automatically pull Base UI variants. See "Research Findings" section below for full details.

---

## Research Findings (CLI Verification — February 9, 2026)

> This section documents verified facts about the shadcn CLI and Base UI registry.
> All claims are backed by actual CLI output or fetched documentation.

### shadcn CLI Subcommands

The CLI (`shadcn@latest`) provides these subcommands (source: https://ui.shadcn.com/docs/cli):

| Subcommand | Purpose |
|---|---|
| `init` | Initialize config and dependencies |
| `add` | Add components to project |
| `create` | Scaffold a new project (interactive wizard) |
| `view` | View registry items before installing |
| `search` / `list` | Search/list items from registries |
| `build` | Generate registry JSON files |
| `migrate` | Run migrations (icons, radix, rtl) |

**No `--base-ui` flag exists on any subcommand.** The `init` flags are: `--template`, `--base-color`, `--yes`, `--force`, `--cwd`, `--silent`, `--src-dir`, `--css-variables`, `--no-base-style`, `--rtl`. The `add` flags are: `--yes`, `--overwrite`, `--cwd`, `--all`, `--path`, `--silent`, `--src-dir`, `--css-variables`. The `create` command is an **interactive wizard** that presents a "Component Library" picker (Radix UI vs Base UI) — it is not scriptable with a `--base-ui` flag.

### components.json Style Mechanism

The `style` field in `components.json` determines which primitive library the CLI uses. The schema at `https://ui.shadcn.com/schema.json` defines these valid values:

```
"enum": [
  "default", "new-york",
  "radix-vega", "radix-nova", "radix-maia", "radix-lyra", "radix-mira",
  "base-vega", "base-nova", "base-maia", "base-lyra", "base-mira"
]
```

- **`base-vega`** — Classic shadcn/ui look, rebuilt on Base UI
- **`base-nova`** — Reduced padding/margins for compact layouts
- **`base-maia`** — Soft/rounded with generous spacing
- **`base-lyra`** — Boxy/sharp, pairs with mono fonts
- **`base-mira`** — Compact, for dense interfaces

When `shadcn add separator` is run, the CLI reads `components.json`, checks the `style` field, and fetches the matching variant from the registry. For example:
- `"style": "new-york"` → `https://ui.shadcn.com/r/styles/new-york/separator.json` (Radix)
- `"style": "base-vega"` → `https://ui.shadcn.com/r/styles/base-vega/separator.json` (Base UI)

**This project currently uses `"style": "new-york"` (legacy Radix).**

### Registry URL Pattern (Verified)

Base UI component source can be fetched directly from the registry without scaffolding:

```
https://ui.shadcn.com/r/styles/{style}/{component}.json
```

Example verified URLs:
- `https://ui.shadcn.com/r/styles/base-vega/separator.json` — returns Base UI Separator source
- `https://ui.shadcn.com/r/styles/base-nova/tooltip.json` — returns Base UI Tooltip source

Each JSON response contains a `files` array with `content` fields holding the full TypeScript source.

### Confirmed Component Patterns (from Registry JSON)

**Separator (Base UI)**:
- Imports from `@base-ui/react/separator`
- Uses `SeparatorPrimitive.Props` type (not `React.ComponentPropsWithoutRef`)
- Function component pattern (not `React.forwardRef` — Base UI handles refs internally)
- No `decorative` prop (Radix-specific)

**Tooltip (Base UI)**:
- Imports from `@base-ui/react/tooltip`
- Uses `TooltipPrimitive.Positioner` wrapper (Positioner pattern confirmed)
- `TooltipProvider` still exists (wraps `TooltipPrimitive.Provider`)
- `TooltipContent` internally combines `Positioner` + `Popup` + `Arrow`
- `side` and `sideOffset` props are on the Positioner, not the Popup
- **`asChild` is fully replaced by `render` prop** — the shim IS required

### Decision Gate Answer (Pre-resolved)

The shadcn Base UI components use the `render` prop pattern exclusively. The `asChild` prop does not appear anywhere in the Base UI registry output. **The shim approach (Approach C) is validated.** Phase 1 should proceed with the `asChildAdapter` utility.

### Alternative Resources

| Resource | Status | Notes |
|---|---|---|
| basecn.dev | Active, but recommends official shadcn/ui + Base UI | Community project; namespaced registry via `@basecn` |
| shadcn/ui Base UI docs | Official, complete (Jan 2026) | `/docs/components/base/{component}` |
| Base UI official docs | https://base-ui.com | API reference for all primitives |

---

## Constants Reference

No new constants required in `lib/config.ts`. The migration is a dependency swap with no runtime configuration.

**Package changes:**
```
# Add
@base-ui/react@^1.1.0

# Remove (after all phases complete)
@radix-ui/react-accordion
@radix-ui/react-alert-dialog
@radix-ui/react-aspect-ratio
@radix-ui/react-avatar
@radix-ui/react-checkbox
@radix-ui/react-collapsible
@radix-ui/react-context-menu
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-hover-card
@radix-ui/react-label
@radix-ui/react-menubar
@radix-ui/react-navigation-menu
@radix-ui/react-popover
@radix-ui/react-progress
@radix-ui/react-radio-group
@radix-ui/react-scroll-area
@radix-ui/react-select
@radix-ui/react-separator
@radix-ui/react-slider
@radix-ui/react-slot
@radix-ui/react-switch
@radix-ui/react-tabs
@radix-ui/react-toggle
@radix-ui/react-toggle-group
@radix-ui/react-tooltip
```

---

## asChild Usage Map

All `asChild` usages in `app/` that target Radix-based components. The shim must preserve compatibility for all of these.

| Component | Count | Files |
|-----------|-------|-------|
| `TooltipTrigger asChild` | 26 | `app-sidebar.tsx` (6), `command-history.tsx` (8), `button-file-upload.tsx` (3), `header-sidebar-trigger.tsx` (1), `drawer-history.tsx` (1), `dialog-publish.tsx` (1), `file-items.tsx` (1), `user-menu.tsx` (1), `button-new-chat.tsx` (1), `multi-chat-input.tsx` (1), `command-footer.tsx` (1), `sidebar-menu-item.tsx` (1) |
| `PopoverTrigger asChild` | 4 | `button-search.tsx` (1), `button-file-upload.tsx` (2), `multi-chat-input.tsx` (1) |
| `Button asChild` | 3 | `header.tsx` (2), `auth/error/page.tsx` (1) |
| `DropdownMenuTrigger asChild` | 3 | `sidebar-item-menu.tsx` (1), `sidebar-project-menu.tsx` (1), `user-menu.tsx` (1) |
| `DialogTrigger asChild` | 2 | `feedback-trigger.tsx` (1), `settings-trigger.tsx` (1) |
| **Total** | **38** | **19 unique files** |

**Not affected** (non-Radix): `DrawerTrigger asChild` (3, vaul-based), `DrawerClose asChild` (1, vaul-based), `FileUploadTrigger asChild` (1, custom).

**Internal usages in `components/ui/`** (will work once wrappers support the shim): `sidebar.tsx` (`TooltipTrigger asChild`), `tool.tsx` (`CollapsibleTrigger asChild`), `prompt-input.tsx`, `message.tsx` (`TooltipTrigger asChild`), `source.tsx` (`HoverCardTrigger asChild`).

---

## Component Difficulty Classification

### Trivial — 12 files

| File | Radix Package | Notes |
|------|---------------|-------|
| `aspect-ratio.tsx` | `react-aspect-ratio` | Replace with CSS `aspect-ratio`; near-zero logic |
| `avatar.tsx` | `react-avatar` | Direct mapping, standard wrapper |
| `checkbox.tsx` | `react-checkbox` | Direct mapping, indicator pattern same |
| `collapsible.tsx` | `react-collapsible` | Direct mapping, pass-through wrapper |
| `label.tsx` | `react-label` | Maps to Field.Label or standalone |
| `separator.tsx` | `react-separator` | Direct mapping, standard wrapper |
| `switch.tsx` | `react-switch` | Direct mapping, standard wrapper |
| `tabs.tsx` | `react-tabs` | Minor naming: TabsTrigger still works |
| `toggle.tsx` | `react-toggle` | Direct mapping with CVA variants |
| `progress.tsx` | `react-progress` | Direct mapping, indicator pattern |
| `badge.tsx` | `react-slot` | Slot → useRender, simple CVA pattern |
| `breadcrumb.tsx` | `react-slot` | Slot → useRender, mostly native HTML |

### Moderate — 14 files

| File | Radix Package | Key Change |
|------|---------------|------------|
| `accordion.tsx` | `react-accordion` | `type`/`collapsible` → `multiple` boolean; `defaultValue` as array |
| `alert-dialog.tsx` | `react-alert-dialog` | Positioner, Content → Popup; Action/Cancel → Close |
| `button.tsx` | `react-slot` | Slot → useRender; asChild → render with shim |
| `dialog.tsx` | `react-dialog` | Portal/Overlay changes; Content → Popup |
| `dropdown-menu.tsx` | `react-dropdown-menu` | Renamed to Menu; add Positioner |
| `hover-card.tsx` | `react-hover-card` | Renamed to PreviewCard; add Positioner |
| `popover.tsx` | `react-popover` | Add Positioner wrapper |
| `radio-group.tsx` | `react-radio-group` | Root renders `<span>` instead of `<button>` |
| `scroll-area.tsx` | `react-scroll-area` | CSS variable placement on Viewport |
| `select.tsx` | `react-select` | Positioner, Icon asChild, scroll buttons, 4 CSS var remaps |
| `slider.tsx` | `react-slider` | Values as arrays; onValueChange returns array |
| `tooltip.tsx` | `react-tooltip` | Add Positioner; Provider pattern |
| `toggle-group.tsx` | `react-toggle-group` | `type` → `multiple`; defaultValue as array |
| `sheet.tsx` | `react-dialog` (aliased) | Same Dialog migration; side-specific animations |

### Complex — 4 files

| File | Radix Package(s) | Why Complex |
|------|-------------------|-------------|
| `context-menu.tsx` | `react-context-menu` | 15 exports → 16; Positioner wrapper, no ItemIndicator equivalent, 3 naming changes (Sub→SubmenuRoot, SubTrigger→SubmenuTrigger, Label→GroupLabel), CSS var remapping |
| `menubar.tsx` | `react-menubar` | 16 primitives; heavy sub-component structure |
| `navigation-menu.tsx` | `react-navigation-menu` | Custom viewport logic, CVA trigger style, indicator arrow |
| `form.tsx` | `react-label`, `react-slot` | Deep react-hook-form integration; 2 contexts; Slot for aria forwarding |

### Custom — 2 files

| File | Radix Package | Why Custom |
|------|---------------|------------|
| `collapsible-section.tsx` | `react-collapsible` | localStorage persistence, hydration-safe state, controlled open |
| `sidebar.tsx` | `react-slot` | SidebarContext, cookie persistence, keyboard shortcuts, mobile Sheet, 5 Slot usages |

---

## File Map

Every file to create or modify, organized by phase. Use as a progress tracker.

| Phase | File | Action |
|-------|------|--------|
| 0 | `components/ui/separator.tsx` | Modify — spike test with simplest component |
| 0 | `components/ui/tooltip.tsx` | Modify — spike test with Positioner pattern |
| 1 | `package.json` | Modify — add `@base-ui/react` (**Ask First**) |
| 1 | `lib/as-child-adapter.ts` | Create — asChild-to-render compatibility shim |
| 2 | `components/ui/aspect-ratio.tsx` | Modify — replace with CSS aspect-ratio |
| 2 | `components/ui/avatar.tsx` | Modify — swap to Base UI Avatar |
| 2 | `components/ui/checkbox.tsx` | Modify — swap to Base UI Checkbox |
| 2 | `components/ui/collapsible.tsx` | Modify — swap to Base UI Collapsible |
| 2 | `components/ui/label.tsx` | Modify — swap to Base UI Field.Label or standalone |
| 2 | `components/ui/separator.tsx` | Modify — swap to Base UI Separator |
| 2 | `components/ui/switch.tsx` | Modify — swap to Base UI Switch |
| 2 | `components/ui/tabs.tsx` | Modify — swap to Base UI Tabs |
| 2 | `components/ui/toggle.tsx` | Modify — swap to Base UI Toggle |
| 2 | `components/ui/progress.tsx` | Modify — swap to Base UI Progress |
| 2 | `components/ui/badge.tsx` | Modify — Slot → useRender with asChild shim |
| 2 | `components/ui/breadcrumb.tsx` | Modify — Slot → useRender with asChild shim |
| 3 | `components/ui/accordion.tsx` | Modify — type/collapsible → multiple |
| 3 | `components/ui/alert-dialog.tsx` | Modify — add Positioner, Content → Popup |
| 3 | `components/ui/button.tsx` | Modify — Slot → useRender with asChild shim |
| 3 | `components/ui/dialog.tsx` | Modify — Portal/Overlay changes |
| 3 | `components/ui/dropdown-menu.tsx` | Modify — Menu rename, Positioner |
| 3 | `components/ui/hover-card.tsx` | Modify — PreviewCard rename, Positioner |
| 3 | `components/ui/popover.tsx` | Modify — add Positioner |
| 3 | `components/ui/radio-group.tsx` | Modify — structural changes |
| 3 | `components/ui/scroll-area.tsx` | Modify — CSS variable changes |
| 3 | `components/ui/slider.tsx` | Modify — array values |
| 3 | `components/ui/tooltip.tsx` | Modify — add Positioner |
| 3 | `components/ui/toggle-group.tsx` | Modify — type → multiple |
| 3 | `components/ui/sheet.tsx` | Modify — Dialog-based migration |
| 3 | `components/ui/select.tsx` | Modify — Positioner, Icon asChild, scroll buttons, 4 CSS var remaps |
| 4 | `components/ui/context-menu.tsx` | Modify — dedicated `@base-ui/react/context-menu` import; Positioner wrappers, no ItemIndicator, 3 naming changes, CSS var remap, +1 new export |
| 4 | `components/ui/menubar.tsx` | Modify — full rewrite with Positioner |
| 4 | `components/ui/navigation-menu.tsx` | Modify — viewport logic rewrite |
| 4 | `components/ui/form.tsx` | Modify — Slot → useRender for FormControl |
| 4 | `components/ui/collapsible-section.tsx` | Modify — manual Base UI Collapsible migration |
| 4 | `components/ui/sidebar.tsx` | Modify — 5 Slot → useRender conversions + Sheet dependency |
| 5 | `package.json` | Modify — remove 26 `@radix-ui/*` packages (**Ask First**) |
| 5 | `components.json` | Modify — change `style` from `"new-york"` to `"base-vega"` |
| 5 | `components/CLAUDE.md` | Modify — update Radix references to Base UI |

---

## Phase 0: Spike — Validate Approach

> **Goal**: Confirm that (a) the shadcn Base UI registry serves compatible component source, (b) the asChild compatibility shim works, and (c) Base UI + Tailwind 4 + Next.js 16 have no conflicts.
> **Dependencies**: None.
> **Can run in parallel with**: Nothing — this gates all subsequent phases.
>
> **Note**: The "Research Findings" section above pre-resolves most of this phase's questions.
> The registry has been verified, the `render` prop pattern confirmed, and the shim validated
> as necessary. This phase now focuses on the remaining runtime verification steps.

### Context to Load

- `components/ui/separator.tsx` — simplest Radix wrapper (1 primitive, no asChild)
- `components/ui/tooltip.tsx` — representative Positioner-pattern component (used with asChild in 26 app/ locations)
- `package.json` — current dependency versions
- `lib/utils.ts` — location of the `cn()` utility
- Research Findings section of this plan — pre-resolved CLI and registry verification

### Steps

1. **Obtain Base UI reference implementations.** Fetch the official shadcn Base UI
   component source directly from the registry (no scaffold project needed):

   ```bash
   # Separator reference
   curl -s https://ui.shadcn.com/r/styles/base-vega/separator.json | jq '.files[0].content'

   # Tooltip reference
   curl -s https://ui.shadcn.com/r/styles/base-vega/tooltip.json | jq '.files[0].content'

   # For any other component during later phases:
   curl -s https://ui.shadcn.com/r/styles/base-vega/{component}.json | jq '.files[0].content'
   ```

   The `base-vega` style is the classic shadcn/ui look rebuilt on Base UI.
   All `base-*` styles use the same Base UI primitives with different visual styling.

   Alternative methods:
   - `npx shadcn@latest view separator tooltip` — displays component source in terminal (uses the style from `components.json`)
   - Browse https://ui.shadcn.com/docs/components/base/separator and https://ui.shadcn.com/docs/components/base/tooltip for docs + examples

   > **Why not `npx shadcn create`?** The `create` command is an interactive wizard for scaffolding
   > new projects. It cannot be scripted with a `--base-ui` flag. For an existing project like this
   > one, fetching individual component source from the registry is the correct approach.

2. **Analyze the fetched reference files.** Read the fetched `separator` and `tooltip` source. Confirm (pre-verified findings):
   - Import paths: `@base-ui/react/separator`, `@base-ui/react/tooltip` (confirmed)
   - `asChild` is NOT in the exported API — replaced with `render` prop (confirmed — shim required)
   - `data-state` selectors replaced with `data-[open]`/`data-[closed]` (confirmed)
   - `TooltipProvider` still part of the pattern — wraps `Tooltip.Provider` (confirmed)
   - Function component pattern used (not `React.forwardRef` — Base UI handles refs internally)
   - Separator has no `decorative` prop (Radix-specific, dropped)

3. **Test the asChild shim concept.** Write a minimal utility that translates:
   ```typescript
   // Concept — validate this works with Base UI's useRender
   import { useRender } from "@base-ui/react/use-render"
   import { Children, isValidElement, type ReactNode, type ReactElement } from "react"

   export function asChildAdapter(
     asChild: boolean | undefined,
     children: ReactNode,
     defaultElement: ReactElement = <span />
   ): { render: ReactElement; children: ReactNode } | { render?: undefined; children: ReactNode } {
     if (!asChild) return { children }
     const child = Children.only(children)
     if (!isValidElement(child)) return { children }
     return { render: child as ReactElement, children: child.props.children }
   }
   ```
   Verify this compiles and that the returned `render` prop is accepted by Base UI components.

4. **Verify environment compatibility.** Confirm:
   - `@base-ui/react@1.1.0` installs cleanly alongside existing `@radix-ui/*` packages (dual dependency is OK during transition)
   - No React version conflicts (Base UI supports React 17+, project uses React 19)
   - No Next.js 16 SSR issues with Base UI (v1.0.0-beta.5 fixed a Next.js 16 `render.props.ref` crash)

### Verify

- The registry serves Base UI component source that can be adapted
- The asChild shim concept compiles with TypeScript
- `@base-ui/react` installs without peer dependency errors
- `bun run typecheck` passes (no new errors from installing the package)

### Decision Gate (Pre-resolved)

**Shim API shape**: Resolved by research — shadcn Base UI components use the `render` prop exclusively. The `asChild` prop does not appear. **The shim is required.** Proceed with the adapter pattern in Phase 1.

**Report findings to user before proceeding.** (This step is satisfied by the Research Findings section.)

---

## Phase 1: Foundation — Install Dependencies and Create Shim

> **Goal**: Install `@base-ui/react`, create the `asChildAdapter` utility, and establish the migration pattern with clear before/after examples.
> **Dependencies**: Phase 0 (decision gate must be resolved).

### Context to Load

- Phase 0 spike results — which shim approach was validated
- `lib/utils.ts` — existing utility file with `cn()` function
- `components/ui/button.tsx` — representative Slot-using component (pattern reference)
- `components/ui/tooltip.tsx` — representative Trigger-accepting-asChild component

### Steps

1. **Install `@base-ui/react`** (**Ask First**):
   ```bash
   bun add @base-ui/react
   ```

2. **Create the asChild compatibility adapter** at `lib/as-child-adapter.ts`:
   ```typescript
   // lib/as-child-adapter.ts
   // Compatibility shim: translates Radix-style asChild prop to Base UI render prop.
   // This allows all existing app code using <Component asChild> to continue working
   // while the underlying primitives migrate from Radix to Base UI.
   //
   // Deprecation plan: remove this file once all app/ call sites migrate to render prop.

   import {
     Children,
     isValidElement,
     type ReactElement,
     type ReactNode,
   } from "react"

   /**
    * Converts an asChild + children pair into a Base UI render prop.
    *
    * Usage in wrapper components:
    * ```tsx
    * function MyTrigger({ asChild, children, ...props }) {
    *   const adapted = adaptAsChild(asChild, children)
    *   return <BaseUI.Trigger render={adapted.render} {...props}>{adapted.children}</BaseUI.Trigger>
    * }
    * ```
    *
    * When asChild is false/undefined: returns { children } unchanged (no render prop).
    * When asChild is true: extracts the single child element as render, passes its children through.
    */
   export function adaptAsChild(
     asChild: boolean | undefined,
     children: ReactNode,
   ): { render?: ReactElement; children: ReactNode } {
     if (!asChild) {
       return { children }
     }
     const child = Children.only(children)
     if (!isValidElement(child)) {
       return { children }
     }
     // Base UI's render prop accepts a ReactElement.
     // The child's own children become the content rendered inside.
     return {
       render: child as ReactElement,
       children: (child.props as { children?: ReactNode }).children,
     }
   }

   /**
    * For components that use Slot for polymorphic rendering (Button, Badge, etc.).
    * Replaces the `const Comp = asChild ? Slot : "element"` pattern.
    *
    * Usage:
    * ```tsx
    * function Button({ asChild, children, ...props }) {
    *   return useRender({
    *     render: asChild ? (Children.only(children) as ReactElement) : <button />,
    *     props: { ...props, children: asChild ? (Children.only(children) as ReactElement).props.children : children },
    *   })
    * }
    * ```
    */
   export function adaptSlotAsChild(
     asChild: boolean | undefined,
     children: ReactNode,
     defaultTag: keyof JSX.IntrinsicElements = "button",
   ): { render: ReactElement; children: ReactNode } {
     if (asChild) {
       const child = Children.only(children)
       if (isValidElement(child)) {
         return {
           render: child as ReactElement,
           children: (child.props as { children?: ReactNode }).children,
         }
       }
     }
     // Create the default element — useRender will apply props to it
     const DefaultElement = defaultTag
     return {
       render: (<DefaultElement />) as ReactElement,
       children,
     }
   }
   ```

3. **Write unit tests for the shim utility.** Create `lib/as-child-adapter.test.ts` using Vitest. The shim is load-bearing for all `asChild` usages in `app/` — it must be tested before any component migration begins.

   Test cases for `adaptAsChild`:
   - `asChild=undefined` → returns `{ children }` unchanged (no render prop)
   - `asChild=false` → returns `{ children }` unchanged (no render prop)
   - `asChild=true` with a single valid React element child → returns `{ render: <child>, children: child's children }`
   - `asChild=true` with a non-element child (string/number) → returns `{ children }` unchanged (graceful fallback via `Children.only` throwing)
   - `asChild=true` with multiple children → throws (via `Children.only`)

   Test cases for `adaptSlotAsChild`:
   - `asChild=false` → returns `{ render: <defaultTag />, children }` with the default element
   - `asChild=true` with a valid element → returns `{ render: <child>, children: child's children }`
   - Custom `defaultTag` (e.g., `"a"`, `"span"`) → returned render element uses the correct tag
   - `asChild=true` with a non-element child → falls through to default element

   ```bash
   bun run test lib/as-child-adapter.test.ts  # All tests pass
   ```

4. **Document the two migration patterns.** These are the canonical before/after transformations:

   **Pattern A: Trigger/Content components accepting asChild (e.g., TooltipTrigger)**
   ```typescript
   // BEFORE (Radix)
   // components/ui/tooltip.tsx
   import * as TooltipPrimitive from "@radix-ui/react-tooltip"

   function TooltipTrigger({
     ...props
   }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
     return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
   }
   // App usage: <TooltipTrigger asChild><Button>Hover</Button></TooltipTrigger>

   // AFTER (Base UI + shim)
   import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip"
   import { adaptAsChild } from "@/lib/as-child-adapter"

   function TooltipTrigger({
     asChild,
     children,
     ...props
   }: React.ComponentProps<typeof BaseTooltip.Trigger> & { asChild?: boolean }) {
     const adapted = adaptAsChild(asChild, children)
     return (
       <BaseTooltip.Trigger data-slot="tooltip-trigger" render={adapted.render} {...props}>
         {adapted.children}
       </BaseTooltip.Trigger>
     )
   }
   // App usage stays identical: <TooltipTrigger asChild><Button>Hover</Button></TooltipTrigger>
   ```

   **Pattern B: Slot-using components (e.g., Button)**
   ```typescript
   // BEFORE (Radix Slot)
   import { Slot } from "@radix-ui/react-slot"

   function Button({ asChild = false, className, variant, size, ...props }) {
     const Comp = asChild ? Slot : "button"
     return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
   }

   // AFTER (Base UI useRender)
   import { useRender } from "@base-ui/react/use-render"

   function Button({ asChild = false, className, variant, size, children, ...props }) {
     const adapted = adaptSlotAsChild(asChild, children, "button")
     return useRender({
       render: adapted.render,
       props: {
         className: cn(buttonVariants({ variant, size }), className),
         "data-slot": "button",
         ...props,
         children: adapted.children,
       },
     })
   }
   ```

### Verify

```bash
bun run typecheck  # No new errors from @base-ui/react or the adapter
bun run lint       # Clean
```

Confirm `lib/as-child-adapter.ts` has no lint errors and exports are importable.

---

## Phase 2: Trivial Components (12 files)

> **Goal**: Migrate all 12 trivial-difficulty components to Base UI. These have direct 1:1 mappings with minimal API changes.
> **Dependencies**: Phase 1 (shim utility must exist).
> **Can run in parallel with**: Phase 3 (different files).

### Context to Load

- `lib/as-child-adapter.ts` — the shim utility from Phase 1
- `lib/utils.ts` — `cn()` utility
- Each component file listed below (read before modifying)
- shadcn Base UI registry (fetch via `curl -s https://ui.shadcn.com/r/styles/base-vega/{component}.json | jq '.files[0].content'`)

### Step 2.1: CSS-Only Components (No Base UI primitive needed)

**`components/ui/aspect-ratio.tsx`**

1. Read current file. It wraps `@radix-ui/react-aspect-ratio Root`.
2. Replace with a CSS-only implementation. Base UI does not ship an aspect-ratio primitive — use the native CSS `aspect-ratio` property:
   ```typescript
   // components/ui/aspect-ratio.tsx
   import { cn } from "@/lib/utils"

   function AspectRatio({
     ratio = 1,
     className,
     style,
     ...props
   }: React.ComponentProps<"div"> & { ratio?: number }) {
     return (
       <div
         data-slot="aspect-ratio"
         className={cn(className)}
         style={{ aspectRatio: String(ratio), ...style }}
         {...props}
       />
     )
   }

   export { AspectRatio }
   ```

**Verify**: `bun run typecheck`

### Step 2.2: Standard Wrapper Components (8 files)

For each of these 8 files, apply the same process:
1. Read the current file
2. Read the equivalent shadcn Base UI reference file
3. Replace the Radix import with the Base UI import
4. Update primitive names to match Base UI's API
5. Re-apply project customizations (Hugeicons, cn() classes, data-slot attributes)
6. Update any `data-[state=open]` / `data-[state=closed]` Tailwind selectors to `data-[open]` / `data-[closed]`

| File | Radix Import | Base UI Import |
|------|-------------|----------------|
| `avatar.tsx` | `@radix-ui/react-avatar` | `@base-ui/react/avatar` |
| `checkbox.tsx` | `@radix-ui/react-checkbox` | `@base-ui/react/checkbox` |
| `collapsible.tsx` | `@radix-ui/react-collapsible` | `@base-ui/react/collapsible` |
| `label.tsx` | `@radix-ui/react-label` | `@base-ui/react/field` (use `Field.Label`) or `@base-ui/react/label` |
| `separator.tsx` | `@radix-ui/react-separator` | `@base-ui/react/separator` |
| `switch.tsx` | `@radix-ui/react-switch` | `@base-ui/react/switch` |
| `tabs.tsx` | `@radix-ui/react-tabs` | `@base-ui/react/tabs` |
| `toggle.tsx` | `@radix-ui/react-toggle` | `@base-ui/react/toggle` |

**Key per-component notes:**

- **`separator.tsx`**: Verified from registry — uses function component pattern (not `React.forwardRef`), imports from `@base-ui/react/separator`, uses `SeparatorPrimitive.Props` type. No `decorative` prop (Radix-specific, dropped). Simplest migration in the project.
- **`checkbox.tsx`**: Radix renders root as `<button>`, Base UI renders as `<span>`. Verify Hugeicons `Tick02Icon` indicator still works in the new `Checkbox.Indicator` part.
- **`collapsible.tsx`**: Minimal pass-through wrapper. Base UI uses `Collapsible.Root`, `Collapsible.Trigger`, `Collapsible.Panel` (not `Content`). Export `CollapsibleContent` as alias for `CollapsiblePanel` for backward compatibility.
- **`label.tsx`**: Base UI may use `Field.Label`. If the project doesn't use Field context, use a simple `<label>` with the existing styling. Verify form.tsx integration still works.
- **`tabs.tsx`**: Base UI uses `Tabs.Tab` instead of `Tabs.Trigger`, and `Tabs.Panel` instead of `Tabs.Content`. Export `TabsTrigger` and `TabsContent` as aliases for backward compatibility.
- **`toggle.tsx`**: Preserve CVA variant definitions (`default`, `outline`) and sizes (`default`, `sm`, `lg`).

**Verify**: `bun run typecheck` after each file. All 8 files should compile cleanly.

### Step 2.3: Slot-to-useRender Components (2 files)

**`components/ui/badge.tsx`**

1. Read current file. Uses `Slot` from `@radix-ui/react-slot` with `const Comp = asChild ? Slot : "span"`.
2. Replace with useRender + adaptSlotAsChild pattern:
   ```typescript
   // components/ui/badge.tsx
   import { cn } from "@/lib/utils"
   import { cva, type VariantProps } from "class-variance-authority"
   import { useRender } from "@base-ui/react/use-render"
   import { adaptSlotAsChild } from "@/lib/as-child-adapter"

   const badgeVariants = cva(/* ... keep existing CVA definition unchanged ... */)

   function Badge({
     className,
     variant,
     asChild = false,
     children,
     ...props
   }: React.ComponentProps<"span"> &
     VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
     const adapted = adaptSlotAsChild(asChild, children, "span")
     return useRender({
       render: adapted.render,
       props: {
         "data-slot": "badge",
         className: cn(badgeVariants({ variant }), className),
         ...props,
         children: adapted.children,
       },
     })
   }

   export { Badge, badgeVariants }
   ```

**`components/ui/breadcrumb.tsx`**

1. Read current file. `BreadcrumbLink` uses `Slot` with `const Comp = asChild ? Slot : "a"`.
2. Apply same pattern as Badge but with `"a"` as the default element.
3. All other exports (`Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`) are native HTML — no Radix dependency. Only change `BreadcrumbLink`.
4. Preserve Hugeicons (`ArrowRight01Icon`, `MoreHorizontalIcon`).

**Verify**: `bun run typecheck`

### Step 2.4: Progress Component

**`components/ui/progress.tsx`**

1. Read current file. Uses `Root` and `Indicator` from `@radix-ui/react-progress`.
2. Base UI Progress uses `Progress.Root`, `Progress.Track`, `Progress.Indicator`.
3. Note: Base UI adds a `Track` part that Radix doesn't have. The current Root IS the track visually. Restructure:
   ```typescript
   // The existing Root + Indicator pattern becomes Root > Track > Indicator
   <Progress.Root data-slot="progress" {...props}>
     <Progress.Track className={cn("...", className)}>
       <Progress.Indicator
         className="..."
         style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
       />
     </Progress.Track>
   </Progress.Root>
   ```

**Verify**: `bun run typecheck`

### Phase 2 Final Verify

```bash
bun run typecheck  # No errors
bun run lint       # Clean
```

Manually verify: if the dev server is running, spot-check any page that uses Avatar, Checkbox, Tabs, or Badge to confirm they render correctly.

---

## Phase 3: Moderate Components (14 files)

> **Goal**: Migrate all 14 moderate-difficulty components. These require structural changes (Positioner pattern, prop renames, asChild shim on Triggers).
> **Dependencies**: Phase 1 (shim utility).
> **Can run in parallel with**: Phase 2 (different files).

### Context to Load

- `lib/as-child-adapter.ts` — the shim utility
- `lib/utils.ts` — `cn()` utility
- Each component file listed below (read before modifying)
- shadcn Base UI registry (fetch via `curl -s https://ui.shadcn.com/r/styles/base-vega/{component}.json | jq '.files[0].content'`)
- basecn.dev migration guide: https://basecn.dev/docs/get-started/migrating-from-radix-ui (community reference; official shadcn docs preferred)

### Step 3.1: Button (Slot → useRender)

**`components/ui/button.tsx`**

1. Read current file thoroughly. This is the most-used component in the project.
2. Replace Slot import with useRender + shim:
   ```typescript
   import { useRender } from "@base-ui/react/use-render"
   import { adaptSlotAsChild } from "@/lib/as-child-adapter"
   ```
3. Replace the component body. **Preserve all CVA variants and sizes exactly.**
4. The `asChild` prop MUST continue to work — 3 usages in `app/` depend on it.
5. Preserve `data-variant` and `data-size` attributes.
6. Preserve the exported `buttonVariants` — used by `alert-dialog.tsx` and other consumers.

**Verify**: `bun run typecheck` — then search for `<Button asChild` in app/ and verify the pattern still compiles.

### Step 3.2: Popup Components with Positioner (8 files)

These all follow the same structural pattern: wrap the Content/Popup inside a Positioner, and add `asChild` shim to the Trigger.

**For each of these files**, apply:

1. Replace Radix import with Base UI import
2. Add Positioner wrapper inside the Content/Popup component:
   ```typescript
   // BEFORE (Radix pattern)
   function PopoverContent({ side = "bottom", align = "center", ...props }) {
     return (
       <PopoverPrimitive.Portal>
         <PopoverPrimitive.Content side={side} align={align} {...props} />
       </PopoverPrimitive.Portal>
     )
   }

   // AFTER (Base UI pattern)
   function PopoverContent({ side = "bottom", align = "center", className, ...props }) {
     return (
       <BasePopover.Portal>
         <BasePopover.Positioner side={side} align={align}>
           <BasePopover.Popup data-slot="popover-content" className={cn("...", className)} {...props} />
         </BasePopover.Positioner>
       </BasePopover.Portal>
     )
   }
   ```
   **Key**: `side` and `align` move from Content to Positioner. The exported prop API stays the same.

3. Add `asChild` shim to all Trigger exports:
   ```typescript
   function PopoverTrigger({
     asChild,
     children,
     ...props
   }: React.ComponentProps<typeof BasePopover.Trigger> & { asChild?: boolean }) {
     const adapted = adaptAsChild(asChild, children)
     return (
       <BasePopover.Trigger data-slot="popover-trigger" render={adapted.render} {...props}>
         {adapted.children}
       </BasePopover.Trigger>
     )
   }
   ```

4. Update all `data-[state=open]` → `data-[open]` and `data-[state=closed]` → `data-[closed]` in className strings.

5. **Update `--radix-*` CSS custom properties.** Replace component-specific Radix variable names with Base UI's unnamespaced equivalents in Tailwind className strings. See the "CSS Custom Property Migration" pattern in Critical Implementation Patterns for the complete mapping. Example:
   ```
   # Before
   origin-(--radix-popover-content-transform-origin)
   # After
   origin-(--transform-origin)
   ```
   This applies to `transform-origin` and `available-height` variables in all popup/menu components, plus `trigger-width`/`trigger-height` in Select.

| File | Base UI Import | Positioner Needed | Trigger asChild Shim |
|------|---------------|-------------------|---------------------|
| `tooltip.tsx` | `@base-ui/react/tooltip` | Yes | Yes (26 app/ usages) |
| `popover.tsx` | `@base-ui/react/popover` | Yes | Yes (4 app/ usages) |
| `dialog.tsx` | `@base-ui/react/dialog` | No (modal) | Yes (2 app/ usages) |
| `alert-dialog.tsx` | `@base-ui/react/alert-dialog` | No (modal) | No (not used with asChild in app/) |
| `dropdown-menu.tsx` | `@base-ui/react/menu` | Yes | Yes (3 app/ usages) |
| `hover-card.tsx` | `@base-ui/react/preview-card` | Yes | No (not used with asChild in app/) |
| `sheet.tsx` | `@base-ui/react/dialog` | No (modal, side-anchored) | No (not used with asChild in app/) |

**Per-component notes:**

- **`tooltip.tsx`**: The highest-impact migration. 26 `<TooltipTrigger asChild>` usages in app/. The shim MUST work. **Verified from registry**: Base UI tooltip uses `TooltipPrimitive.Provider` (so `TooltipProvider` remains), `Positioner` wraps `Popup` + `Arrow` inside `TooltipContent`, and `side`/`sideOffset`/`align`/`alignOffset` props move to the Positioner. Base UI handles arrows via `Tooltip.Arrow`. Preserve `hideArrow` prop by conditionally rendering the Arrow.

- **`dialog.tsx`**: Base UI Dialog uses `Dialog.Backdrop` instead of Radix's `Dialog.Overlay`. `Dialog.Popup` replaces `Dialog.Content`. Preserve the custom `showCloseButton` prop. Preserve `DialogHeader`/`DialogFooter` (plain `<div>` wrappers, no Radix dependency).

- **`dropdown-menu.tsx`**: Base UI calls this `Menu`, not `DropdownMenu`. **Keep all exported names as `DropdownMenu*`** for backward compatibility — only the internal imports change. Update `onSelect` → `onClick` on items if Base UI uses a different callback name. Preserve custom `variant` prop (`default`/`destructive`) and `inset` prop.

- **`hover-card.tsx`**: Base UI calls this `PreviewCard`. **Keep exported names as `HoverCard*`** for backward compatibility.

- **`sheet.tsx`**: Currently aliases `@radix-ui/react-dialog` as `SheetPrimitive`. Switch to Base UI `Dialog` aliased as `Sheet`. Preserve custom `side` prop with conditional slide animations. This is one of the trickier moderate components due to the side-specific animation classes.

**Verify after each file**: `bun run typecheck`

### Step 3.3: Non-Popup Moderate Components (4 files)

**`components/ui/accordion.tsx`**

1. Read current file. Uses `type` enum and `collapsible` boolean.
2. Base UI changes:
   - `type="multiple"` → `multiple={true}` (or just `multiple`)
   - `type="single"` → remove (it's the default)
   - `collapsible` → removed (Base UI accordions are always collapsible)
   - `defaultValue` must be an array: `defaultValue="item-1"` → `defaultValue={["item-1"]}`
3. Internal: `AccordionContent` → `Accordion.Panel`. Export `AccordionContent` as alias.
4. Preserve Hugeicons `ArrowDown01Icon` for chevron.

**`components/ui/radio-group.tsx`**

1. Base UI `Radio` root renders `<span>` not `<button>`. Adjust classes if needed.
2. Preserve Hugeicons `CircleIcon` for indicator.

**`components/ui/slider.tsx`**

1. Base UI Slider uses array values: `value={50}` → `value={[50]}`.
2. The current code already has `useMemo` to compute `_values` array — this aligns well with Base UI.
3. Verify `onValueChange` callback receives array.

**`components/ui/toggle-group.tsx`**

1. `type="multiple"` → `multiple` boolean prop.
2. `defaultValue` must be an array.
3. Preserve `ToggleGroupContext` for sharing variant/size/spacing.
4. Preserve `toggleVariants` import from `toggle.tsx`.

### Step 3.4: Select Component (dedicated — high complexity within moderate tier)

**`components/ui/select.tsx`**

This component gets its own step due to unique patterns not shared by other popup components: internal `asChild` usage on `SelectPrimitive.Icon`, scroll button sub-components, `position="item-aligned"` mode, 4 Radix-specific CSS custom properties, and 10 exported components.

1. Read the entire file (192 lines, 10 exports). Note the key patterns:
   - `SelectTrigger` contains `<SelectPrimitive.Icon asChild>` internally — this is NOT the same as an app-level `asChild` usage. It uses Slot to render the Hugeicon arrow as the icon element.
   - `SelectContent` uses `position="item-aligned"` by default and `position="popper"` as an option. Verify Base UI Select supports both positioning modes.
   - `SelectScrollUpButton` and `SelectScrollDownButton` are scroll affordances — verify Base UI Select has equivalents or if scroll behavior is handled differently.
   - `SelectValue` is a display component — verify Base UI equivalent.

2. Replace import: `@radix-ui/react-select` → `@base-ui/react/select`

3. **CSS custom property remapping** (4 variables — most of any single file):
   - `origin-(--radix-select-content-transform-origin)` → `origin-(--transform-origin)`
   - `max-h-(--radix-select-content-available-height)` → `max-h-(--available-height)`
   - `h-(--radix-select-trigger-height)` → `h-(--anchor-height)`
   - `min-w-(--radix-select-trigger-width)` → `min-w-(--anchor-width)`

4. **`SelectPrimitive.Icon asChild` migration**: This internal pattern wraps a Hugeicon as the select's dropdown arrow. Base UI may use a different mechanism for the trigger icon (e.g., a `Select.Icon` sub-component or manual rendering). Check the Base UI Select API and the shadcn registry reference (`curl -s https://ui.shadcn.com/r/styles/base-vega/select.json | jq '.files[0].content'`) for the correct pattern.

5. **Positioner pattern**: Add `Select.Positioner` between Portal and Popup. Move `side`/`align`/`sideOffset` props to the Positioner.

6. **Scroll buttons**: Verify if Base UI Select provides `ScrollUpButton`/`ScrollDownButton` equivalents. If not, implement scroll affordances manually or rely on Base UI's built-in overflow scrolling.

7. Preserve custom `size` prop on `SelectTrigger` (`"sm" | "default"`).
8. Preserve all Hugeicons (`Tick02Icon`, `ArrowDown01Icon`, `ArrowUp01Icon`).
9. **Keep all 10 exported names identical.**

**Verify**: `bun run typecheck` — then test the model selector dropdown to confirm items render and are selectable.

### Phase 3 Final Verify

```bash
bun run typecheck  # No errors
bun run lint       # Clean
```

Critical manual tests:
- [ ] Open any page with tooltips — hover triggers should work
- [ ] Open a dropdown menu — items should be clickable
- [ ] Open a dialog — overlay, close button, escape key should work
- [ ] Select component — options should render and be selectable

---

## Phase 4: Complex + Custom Components (6 files)

> **Goal**: Migrate the 4 complex Shadcn components and 2 custom components. These require significant structural rework and careful testing.
> **Dependencies**: Phase 2 AND Phase 3 (sidebar depends on Button, Tooltip, Sheet, Separator, Skeleton from earlier phases).
> **This is the critical integration phase** — read each file thoroughly before modifying.

### Context to Load

- `lib/as-child-adapter.ts` — the shim utility
- `lib/utils.ts` — `cn()` utility
- Each component file listed below (read **entire file** before modifying)
- All Phase 2/3 migrated components (sidebar depends on them)
- shadcn Base UI registry (fetch via `curl -s https://ui.shadcn.com/r/styles/base-vega/{component}.json | jq '.files[0].content'`)
- basecn.dev migration guide: https://basecn.dev/docs/get-started/migrating-from-radix-ui (community reference)

### Step 4.1: Context Menu

**`components/ui/context-menu.tsx`**

> **Research confirmed (2026-02-09):** Base UI has a dedicated `ContextMenu` component at `@base-ui/react/context-menu` with built-in right-click/long-press trigger behavior. No manual `onContextMenu` handler needed. Docs: https://base-ui.com/react/components/context-menu
> **Reference implementation:** basecn.dev registry at https://basecn.dev/r/context-menu.json

1. Read the entire file. This currently exports 15 components using Radix primitives.
2. Change import: `import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"` → `import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"`
3. Primitive name changes (internal only — exported names stay identical):
   - `ContextMenuPrimitive.Content` → `ContextMenuPrimitive.Popup`
   - `ContextMenuPrimitive.Sub` → `ContextMenuPrimitive.SubmenuRoot`
   - `ContextMenuPrimitive.SubTrigger` → `ContextMenuPrimitive.SubmenuTrigger`
   - `ContextMenuPrimitive.SubContent` → `ContextMenuPrimitive.Popup` (inside its own Positioner)
   - `ContextMenuPrimitive.Label` → `ContextMenuPrimitive.GroupLabel`
4. Structural changes:
   - Add `ContextMenuPositioner` wrapper around `ContextMenuContent` (Popup must be inside Positioner)
   - Add `ContextMenuPositioner` wrapper around `ContextMenuSubContent`
   - **`ItemIndicator` has NO Base UI equivalent.** Replace with manual conditional rendering — a `<span>` that shows/hides the icon based on the `checked` prop. basecn.dev uses this pattern.
   - `CheckboxItem` and `RadioItem` are both **confirmed supported** as `ContextMenuPrimitive.CheckboxItem` and `ContextMenuPrimitive.RadioItem`
   - Keep `ContextMenuShortcut` (plain `<span>`, no Radix dependency)
5. CSS variable remapping:
   - `--radix-context-menu-content-transform-origin` → `--transform-origin` (on Positioner)
   - `--radix-context-menu-content-available-height` → `--available-height` (on Positioner)
   - Update any Tailwind classes using `origin-(--radix-context-menu-*)` or `max-h-(--radix-context-menu-*)`
6. Event handler change: `onSelect` → `onClick` on items (affects consumer call sites, not just the wrapper)
7. Preserve custom `variant` prop (`default`/`destructive`) on `ContextMenuItem`
8. Preserve custom `inset` prop on SubTrigger, Item, and Label
9. Preserve Hugeicons (`Tick02Icon`, `ArrowRight01Icon`, `CircleIcon`)
10. Add new export: `ContextMenuPositioner` (16th export, needed for consumers who compose manually)
11. **Keep all 15 existing exported names identical.** Add `ContextMenuPositioner` as the 16th.
12. Note: Base UI `ContextMenu.Trigger` renders a `<div>` by default (Radix renders no wrapper element). This is a behavioral difference but should not affect consumers.
13. Type changes: Use `ContextMenuPrimitive.*.Props` pattern (e.g., `ContextMenuPrimitive.Root.Props`, `ContextMenuPrimitive.Item.Props`) instead of `React.ComponentProps<typeof ContextMenuPrimitive.*>`.

**Verify**: `bun run typecheck`

### Step 4.2: Menubar

**`components/ui/menubar.tsx`**

1. Read the entire file. This uses 16 Radix primitives — the most of any file.
2. Base UI import: `@base-ui/react/menubar`
3. Structurally similar to context-menu migration (Step 4.1). Apply the same patterns: Positioner wrappers, manual indicator rendering (no ItemIndicator), `onSelect` → `onClick`, Sub→SubmenuRoot/SubmenuTrigger naming, Label→GroupLabel, CSS var remapping (`--radix-menubar-*` → `--transform-origin`/`--available-height`).
4. Preserve all custom props and Hugeicons.
5. **Keep all exported names identical.**

**Verify**: `bun run typecheck`

### Step 4.3: Navigation Menu

**`components/ui/navigation-menu.tsx`**

1. Read the entire file thoroughly. This has the most custom logic of any Shadcn wrapper:
   - Custom `viewport` boolean prop
   - CVA `navigationMenuTriggerStyle`
   - Hugeicons `ArrowDown01Icon` for trigger chevron
   - `NavigationMenuIndicator` with rotated arrow `<div>`
   - `NavigationMenuContent` with `group-data-[viewport=false]` conditional styling
2. Base UI import: `@base-ui/react/navigation-menu`
3. Verify Base UI's NavigationMenu has equivalent parts: Root, List, Item, Trigger, Content, Viewport, Link, Indicator.
4. The viewport conditional rendering logic (`viewport` prop) is custom — must be preserved manually.
5. The `navigationMenuTriggerStyle` CVA export is used by consumers — preserve it.
6. **CSS custom property restructuring** — this is a structural change, not just a rename:
   - The current code applies `h-(--radix-navigation-menu-viewport-height)` and `md:w-(--radix-navigation-menu-viewport-width)` to the **Viewport** element for animation.
   - Base UI's `NavigationMenu.Viewport` does **NOT** expose CSS custom properties (confirmed by API reference — only `className`, `style`, and `render` props, no CSS Variables table).
   - Instead, the **Popup** element exposes `--popup-height` and `--popup-width`.
   - **Action**: Move the dimension Tailwind classes from the Viewport element to the Popup element:
     ```
     # Before (on Viewport element)
     h-(--radix-navigation-menu-viewport-height) md:w-(--radix-navigation-menu-viewport-width)

     # After (on Popup element)
     h-(--popup-height) md:w-(--popup-width)
     ```
   - Alternative: the Positioner exposes `--positioner-height` and `--positioner-width` which could also be used.
   - The official Base UI NavigationMenu CSS Module examples use CSS transitions on the Popup's width/height properties directly, confirming this is the intended approach.

   > **Research source**: `.agents/context/research/radix-to-base-ui-css-variables.md` — Section 4 "Navigation Menu Viewport Dimensions"

**Verify**: `bun run typecheck`

### Step 4.4: Form

**`components/ui/form.tsx`**

1. Read the entire file. This is deeply integrated with react-hook-form:
   - `FormFieldContext` and `FormItemContext` via `React.createContext`
   - `useFormField` custom hook computing field state, error state, accessible IDs
   - `FormControl` uses `<Slot>` to forward `id`, `aria-describedby`, `aria-invalid` to its child
   - `Form` is a re-export of react-hook-form's `FormProvider`
   - Type import: `import type * as LabelPrimitive from "@radix-ui/react-label"`
2. **Two Radix dependencies to remove**:
   - `@radix-ui/react-slot` → replace `<Slot>` in FormControl with `useRender`
   - `@radix-ui/react-label` → replace type import with Base UI equivalent or inline type
3. **FormControl migration** — the trickiest part:
   ```typescript
   // BEFORE (Radix Slot)
   function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
     const { formItemId, formDescriptionId, formMessageId, error } = useFormField()
     return (
       <Slot
         id={formItemId}
         aria-describedby={...}
         aria-invalid={!!error}
         {...props}
       />
     )
   }

   // AFTER (Base UI useRender)
   function FormControl({ children, ...props }: React.ComponentProps<"div"> & { children: React.ReactNode }) {
     const { formItemId, formDescriptionId, formMessageId, error } = useFormField()
     const child = Children.only(children)
     if (!isValidElement(child)) return <>{children}</>
     return useRender({
       render: child as ReactElement,
       props: {
         id: formItemId,
         "aria-describedby": !error
           ? formDescriptionId
           : `${formDescriptionId} ${formMessageId}`,
         "aria-invalid": !!error,
         ...props,
       },
     })
   }
   ```
4. **FormLabel migration**: Replace `React.ComponentProps<typeof LabelPrimitive.Root>` with `React.ComponentProps<typeof Label>` (using the already-migrated Label component from Phase 2).
5. `Form`, `FormField`, `FormItem`, `FormDescription`, `FormMessage` have NO Radix dependency — they only use react-hook-form and React contexts. No changes needed.

**Verify**: `bun run typecheck` — then test a page with a form to ensure validation messages and accessible IDs still work.

### Step 4.5: Collapsible Section (Custom)

**`components/ui/collapsible-section.tsx`**

1. Read the entire file. This is a **non-Shadcn** component with significant custom logic:
   - localStorage persistence via `storageKey` prop
   - Hydration-safe `useState`/`useEffect` pattern
   - Controlled open state with `handleOpenChange` callback
   - Custom props: `title`, `icon`, `defaultOpen`
   - Animated chevron with rotate/opacity transitions
   - Collapsible animation via `animate-collapsible-down`/`animate-collapsible-up`
2. Replace Radix Collapsible imports:
   ```typescript
   // BEFORE
   import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

   // AFTER
   import { Collapsible } from "@base-ui/react/collapsible"
   ```
3. Update primitive usage:
   - `CollapsiblePrimitive.Root` → `Collapsible.Root`
   - `CollapsiblePrimitive.Trigger` → `Collapsible.Trigger`
   - `CollapsiblePrimitive.Content` → `Collapsible.Panel`
4. Update `data-[state=open]` / `data-[state=closed]` Tailwind selectors to `data-[open]` / `data-[closed]`.
5. **Verify animation keyframe definitions.** The classes `animate-collapsible-down` and `animate-collapsible-up` are defined in the Tailwind config or CSS (likely via `tailwindcss-animate` or `tw-animate-css`). These animations may be triggered by CSS selectors that reference `data-[state=open]` / `data-[state=closed]`. Check the animation source:
   ```bash
   rg "collapsible-down\|collapsible-up" --type css
   rg "collapsible-down\|collapsible-up" tailwind.config.* app.css app/globals.css
   ```
   If the keyframe definitions use `data-[state=*]` selectors as triggers, update them to `data-[open]` / `data-[closed]`. If they use only the class name (most common with `tailwindcss-animate`), no change is needed — only the Tailwind utility classes in the component file need updating.
6. Preserve ALL custom logic (localStorage, hydration, controlled state) unchanged.

**Verify**: `bun run typecheck` — then expand/collapse a section and verify localStorage persistence.

### Step 4.6: Sidebar (Custom — Most Complex)

**`components/ui/sidebar.tsx`**

1. Read the **entire file** thoroughly. This is the most complex file in the migration:
   - `SidebarContext` + `useSidebar()` hook
   - `SidebarProvider` with cookie persistence (`sidebar_state`), keyboard shortcut (`Cmd/Ctrl+B`), mobile Sheet integration, responsive behavior via `useIsMobile()`
   - 5 components use `const Comp = asChild ? Slot : "element"`:
     - `SidebarGroupLabel` (default: `"div"`)
     - `SidebarGroupAction` (default: `"button"`)
     - `SidebarMenuButton` (default: `"button"`)
     - `SidebarMenuAction` (default: `"button"`)
     - `SidebarMenuSubButton` (default: `"a"`)
   - Internal `asChild` usages: `<TooltipTrigger asChild>` in `SidebarMenuButton`
   - CVA for `sidebarMenuButtonVariants`
   - `SidebarMenuSkeleton` with deterministic widths
   - CSS custom properties (`--sidebar-width`, `--sidebar-width-icon`)
   - Composes: `Button`, `Input`, `Separator`, `Sheet`, `Skeleton`, `Tooltip`

2. **Replace Slot import**:
   ```typescript
   // BEFORE
   import { Slot } from "@radix-ui/react-slot"

   // AFTER
   import { useRender } from "@base-ui/react/use-render"
   import { adaptSlotAsChild, adaptAsChild } from "@/lib/as-child-adapter"
   ```

3. **Migrate each of the 5 Slot-using components** to use `adaptSlotAsChild`:
   ```typescript
   // Example: SidebarMenuButton
   // BEFORE
   function SidebarMenuButton({ asChild = false, ...props }) {
     const Comp = asChild ? Slot : "button"
     return <Comp className={cn(sidebarMenuButtonVariants({ variant, size }), className)} {...props} />
   }

   // AFTER
   function SidebarMenuButton({ asChild = false, children, ...props }) {
     const adapted = adaptSlotAsChild(asChild, children, "button")
     return useRender({
       render: adapted.render,
       props: {
         "data-slot": "sidebar-menu-button",
         className: cn(sidebarMenuButtonVariants({ variant, size }), className),
         ...props,
         children: adapted.children,
       },
     })
   }
   ```

4. **Update `data-[state=open]` selectors in sidebar components.** Two components reference `data-[state=open]` for styling when child popup components (e.g., dropdown menus) are open:
   - `SidebarMenuButton` (line ~504): `data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground` → `data-[open]:hover:bg-sidebar-accent data-[open]:hover:text-sidebar-accent-foreground`
   - `SidebarMenuAction` (line ~599): `data-[state=open]:opacity-100` → `data-[open]:opacity-100`

   These selectors respond to data attributes set by child components (DropdownMenu, Popover, etc.) on their triggers. Since the migrated Base UI components use `data-open` instead of `data-state="open"`, these selectors must be updated to match.

5. **Update internal `TooltipTrigger asChild` usage**: Since `tooltip.tsx` was migrated in Phase 3 with the asChild shim, the `<TooltipTrigger asChild>` on line 564 will continue to work unchanged.

6. **Sheet dependency**: `SidebarProvider` renders `<Sheet>` for mobile. Since `sheet.tsx` was migrated in Phase 3, this should work. Verify the Sheet's `side="left"` prop and open/close animations.

7. **Preserve all other logic unchanged**: SidebarContext, cookie persistence, keyboard shortcut, useIsMobile(), CSS custom properties, all div-based components (SidebarContent, SidebarFooter, SidebarHeader, SidebarRail, SidebarInset, etc.).

8. Do NOT touch any component that doesn't import from `@radix-ui/*`. Most sidebar sub-components are plain HTML wrappers.

**Verify**: `bun run typecheck` — then test:
- [ ] Sidebar opens/closes on desktop
- [ ] Sidebar collapse (icon mode) works
- [ ] Keyboard shortcut (Cmd/Ctrl+B) toggles sidebar
- [ ] Mobile: sidebar opens as Sheet
- [ ] Sidebar menu items with `asChild` render correctly (check `app/components/layout/sidebar/app-sidebar.tsx`)

### Phase 4 Final Verify

```bash
bun run typecheck  # No errors
bun run lint       # Clean
```

At this point, **all 32 Radix-importing files** in `components/ui/` have been migrated.

---

## Phase 5: Cleanup & Validation

> **Goal**: Remove all Radix dependencies, update documentation, run full build, and perform comprehensive regression testing.
> **Dependencies**: All previous phases (every component must be migrated).

### Context to Load

- `package.json` — to remove Radix packages
- `components/CLAUDE.md` — documentation to update
- All migrated files (spot-check imports for any remaining `@radix-ui/*` references)

### Step 5.1: Verify No Remaining Radix References

1. Search the entire codebase for any remaining `@radix-ui` imports:
   ```bash
   rg "from ['\"]@radix-ui" -t ts
   ```
   Note: `-t ts` matches both `.ts` and `.tsx` files in ripgrep.
2. Search for any remaining `--radix-*` CSS custom property references:
   ```bash
   rg "\-\-radix-" components/ui/
   ```
   There should be **zero matches**. The 14 unique `--radix-*` variables across 8 files should all have been replaced during Phases 3 and 4. If any remain:
   - `origin-(--radix-*-transform-origin)` → replace with `origin-(--transform-origin)`
   - `max-h-(--radix-*-available-height)` → replace with `max-h-(--available-height)`
   - `h-(--radix-select-trigger-height)` → replace with `h-(--anchor-height)`
   - `min-w-(--radix-select-trigger-width)` → replace with `min-w-(--anchor-width)`
   - `h-(--radix-navigation-menu-viewport-height)` → replace with `h-(--popup-height)` (on Popup)
   - `w-(--radix-navigation-menu-viewport-width)` → replace with `w-(--popup-width)` (on Popup)
3. If any Radix imports remain, they are either:
   - Missed migrations → go back to the relevant phase
   - Non-`components/ui/` files → these should not exist (verified at project start), but fix if found

### Step 5.2: Remove Radix Packages (**Ask First**)

1. Remove all 26 `@radix-ui/*` packages:
   ```bash
   bun remove @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip
   ```

**Transitive dependency note**: After removal, some `@radix-ui/*` packages may still appear in `node_modules/` as transitive dependencies of other packages. This is expected and correct:
- `cmdk` (Command component) depends on `@radix-ui/react-dialog` internally
- `vaul` (Drawer component) depends on `@radix-ui/react-dialog` internally

These packages manage their own Radix dependencies. Our code does not import from Radix directly — the wrappers in `components/ui/` now import from `@base-ui/react`. The presence of Radix packages in `node_modules/` via transitive deps is not a sign of incomplete migration. Do NOT add these back as direct dependencies.

### Step 5.3: Full Build Verification

```bash
bun run typecheck  # No errors
bun run lint       # Clean
bun run build      # Production build succeeds
bun run test       # All tests pass
```

If any step fails, diagnose and fix before proceeding. Common issues:
- Leftover Radix type references (e.g., `React.ComponentProps<typeof RadixPrimitive.Something>`)
- Missing Base UI exports (verify import paths)
- Tailwind `data-[state=*]` selectors that weren't updated to `data-[open]`/`data-[closed]`
- Leftover `--radix-*` CSS custom properties in Tailwind classes (e.g., `origin-(--radix-*-transform-origin)` → `origin-(--transform-origin)`)
- Navigation menu dimension classes still on Viewport instead of Popup (`--radix-navigation-menu-viewport-*` → `--popup-*` on Popup element)

### Step 5.4: Update Configuration and Documentation

1. Update `components.json` — change `"style": "new-york"` to `"style": "base-vega"`:
   ```json
   {
     "style": "base-vega"
   }
   ```
   This ensures future `npx shadcn@latest add` commands pull Base UI variants automatically.

2. Update `components/CLAUDE.md`:
   - Replace references to "Radix primitives" with "Base UI primitives"
   - Update code examples to use `render` prop instead of `asChild` (or note the shim)
   - Add note about `lib/as-child-adapter.ts` and its deprecation plan

### Step 5.5: Regression Test Checklist

Run these manual tests against the dev server:

**Core interactions:**
- [ ] Chat page loads — sidebar, chat input, message display all render
- [ ] Tooltip hover works on all sidebar icons
- [ ] Dropdown menus open on click (user menu, sidebar item menus)
- [ ] Dialog opens and closes (settings, publish, feedback)
- [ ] Sheet opens on mobile (sidebar as Sheet)
- [ ] Select components open and items are selectable (model selector)
- [ ] Popover opens on chat input buttons (search, file upload)
- [ ] Accordion expands/collapses (settings sections)
- [ ] Tabs switch correctly
- [ ] Checkbox/Switch/Radio toggle state
- [ ] Scroll areas scroll with custom scrollbars
- [ ] Context menu opens on right-click (if used)

**Keyboard accessibility:**
- [ ] Tab navigation through interactive elements works
- [ ] Escape closes dialogs/popovers/menus
- [ ] Enter/Space activates buttons and triggers
- [ ] Arrow keys navigate menu items

**Animations:**
- [ ] Dialog overlay fade-in/out
- [ ] Sheet slide-in/out (all 4 sides)
- [ ] Collapsible section expand/collapse animation
- [ ] Tooltip appear/disappear
- [ ] Dropdown menu open/close transitions

**Animation keyframes:**
- [ ] Verify no CSS keyframe definitions reference stale `data-[state=*]` selectors — search: `rg "data-\[state=" --type css`
- [ ] Confirm `animate-collapsible-down` / `animate-collapsible-up` still trigger on open/close
- [ ] Confirm `animate-in` / `animate-out` still trigger on `data-[open]` / `data-[closed]` (used by dialog, sheet, dropdown, select, popover, hover-card, context-menu, menubar)

### Verify

```bash
bun run typecheck  # No errors
bun run lint       # Clean
bun run build      # Production build succeeds
bun run test       # All tests pass
```

**All Radix packages removed. Single `@base-ui/react` dependency in place.**

---

## Rollback Plan

If the migration encounters a blocking issue at any phase:

1. **Per-component rollback**: Each file can be individually reverted via `git checkout -- components/ui/[file].tsx`. Since both `@radix-ui/*` and `@base-ui/react` are installed during the transition, reverting a single file restores Radix behavior.

2. **Full rollback**: `git checkout -- components/ui/ lib/as-child-adapter.ts package.json && bun install`. This restores all components to Radix and removes Base UI.

3. **Partial migration state is stable**: Because both libraries coexist during the transition, the app works correctly with a mix of migrated and unmigrated components. There is no point of no return until Phase 5 (Radix package removal).

---

## Critical Implementation Patterns

### Pattern: asChild Shim for Trigger Components

Every Trigger export that accepts `asChild` in the current Radix-based code must use this pattern:

```typescript
import { adaptAsChild } from "@/lib/as-child-adapter"

function SomeTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof BasePrimitive.Trigger> & { asChild?: boolean }) {
  const adapted = adaptAsChild(asChild, children)
  return (
    <BasePrimitive.Trigger render={adapted.render} {...props}>
      {adapted.children}
    </BasePrimitive.Trigger>
  )
}
```

**Applies to**: TooltipTrigger, PopoverTrigger, DialogTrigger, DropdownMenuTrigger, AlertDialogTrigger, and any other Trigger exported with `asChild` support.

### Pattern: Slot Replacement for Polymorphic Components

Every component that uses `const Comp = asChild ? Slot : "element"` must use this pattern:

```typescript
import { useRender } from "@base-ui/react/use-render"
import { adaptSlotAsChild } from "@/lib/as-child-adapter"

function PolymorphicComponent({ asChild = false, children, className, ...props }) {
  const adapted = adaptSlotAsChild(asChild, children, "button") // default element
  return useRender({
    render: adapted.render,
    props: { className, ...props, children: adapted.children },
  })
}
```

**Applies to**: Button, Badge, BreadcrumbLink, SidebarGroupLabel, SidebarGroupAction, SidebarMenuButton, SidebarMenuAction, SidebarMenuSubButton.

### Pattern: Data Attribute Update

Search and replace within each migrated file's className strings:

| Radix | Base UI |
|-------|---------|
| `data-[state=open]` | `data-[open]` |
| `data-[state=closed]` | `data-[closed]` |
| `data-[state=checked]` | `data-[checked]` |
| `data-[state=unchecked]` | `data-[unchecked]` |
| `data-[state=indeterminate]` | `data-[indeterminate]` |
| `data-[state=active]` | `data-[active]` |
| `data-[state=inactive]` | `data-[inactive]` |
| `data-[state=on]` | `data-[pressed]` |
| `data-[state=off]` | (no attribute) |

### Pattern: CSS Custom Property Migration (`--radix-*` → Base UI)

> **Full research**: `.agents/context/research/radix-to-base-ui-css-variables.md`

Base UI uses **unnamespaced** CSS variables instead of Radix's component-specific prefixed names. All positioned components share the same variable names on their Positioner and Popup elements.

**14 unique `--radix-*` variables** exist across 8 files in `components/ui/`. Apply these find-and-replace patterns within each migrated file's Tailwind className strings:

**Transform origin** (8 usages across 7 files — all direct renames):

| Radix | Base UI | Files |
|-------|---------|-------|
| `origin-(--radix-tooltip-content-transform-origin)` | `origin-(--transform-origin)` | `tooltip.tsx` |
| `origin-(--radix-dropdown-menu-content-transform-origin)` | `origin-(--transform-origin)` | `dropdown-menu.tsx` |
| `origin-(--radix-context-menu-content-transform-origin)` | `origin-(--transform-origin)` | `context-menu.tsx` |
| `origin-(--radix-menubar-content-transform-origin)` | `origin-(--transform-origin)` | `menubar.tsx` |
| `origin-(--radix-popover-content-transform-origin)` | `origin-(--transform-origin)` | `popover.tsx` |
| `origin-(--radix-hover-card-content-transform-origin)` | `origin-(--transform-origin)` | `hover-card.tsx` |
| `origin-(--radix-select-content-transform-origin)` | `origin-(--transform-origin)` | `select.tsx` |

**Available height** (3 usages across 3 files — all direct renames):

| Radix | Base UI | Files |
|-------|---------|-------|
| `max-h-(--radix-dropdown-menu-content-available-height)` | `max-h-(--available-height)` | `dropdown-menu.tsx` |
| `max-h-(--radix-context-menu-content-available-height)` | `max-h-(--available-height)` | `context-menu.tsx` |
| `max-h-(--radix-select-content-available-height)` | `max-h-(--available-height)` | `select.tsx` |

**Select trigger dimensions** (2 usages in 1 file — rename with semantic change):

| Radix | Base UI | File |
|-------|---------|------|
| `h-(--radix-select-trigger-height)` | `h-(--anchor-height)` | `select.tsx` |
| `min-w-(--radix-select-trigger-width)` | `min-w-(--anchor-width)` | `select.tsx` |

**Navigation menu viewport** (2 usages in 1 file — **requires element restructuring**):

| Radix | Base UI | File |
|-------|---------|------|
| `h-(--radix-navigation-menu-viewport-height)` | `h-(--popup-height)` (move to Popup element) | `navigation-menu.tsx` |
| `w-(--radix-navigation-menu-viewport-width)` | `w-(--popup-width)` (move to Popup element) | `navigation-menu.tsx` |

> **Important**: The navigation menu viewport variables cannot be a simple find-and-replace. Base UI's `NavigationMenu.Viewport` does NOT expose CSS custom properties. The `--popup-height`/`--popup-width` variables live on the Popup element. The dimension classes must move from the Viewport to the Popup. See Phase 4.3 for details.

**Base UI Positioner CSS Variables reference** (shared across all positioned components):

| Variable | Description |
|----------|-------------|
| `--transform-origin` | Anchor coordinates for animations |
| `--available-height` | Available height between trigger and viewport edge |
| `--available-width` | Available width between trigger and viewport edge |
| `--anchor-height` | The trigger/anchor element's height |
| `--anchor-width` | The trigger/anchor element's width |
| `--positioner-height` | Fixed height of the positioner element |
| `--positioner-width` | Fixed width of the positioner element |

**Base UI Popup CSS Variables reference**:

| Variable | Description |
|----------|-------------|
| `--popup-height` | Fixed height of the popup element |
| `--popup-width` | Fixed width of the popup element |

### Error Propagation

| Failure Point | Behavior |
|---------------|----------|
| `@base-ui/react` install fails | Abort — check React version compatibility |
| asChild shim returns incorrect render | Component renders wrong element — revert file, debug shim |
| Positioner not wrapping Content | Popup appears at wrong position — add Positioner |
| data-attribute mismatch | Tailwind styles don't apply — search for stale `data-[state=*]` selectors |
| `--radix-*` CSS variable not renamed | Transform-origin, max-height, or trigger sizing broken — search for `--radix-` in className strings and replace per CSS Custom Property Migration pattern |
| Navigation menu viewport sizing broken | Viewport doesn't animate dimensions — dimension classes must move from Viewport to Popup element (see Phase 4.3 step 6) |
| Animation classes break | Open/close transitions missing — verify Base UI data attributes trigger CSS |
| Form aria forwarding fails | Screen readers miss error messages — verify FormControl useRender output |

---

## Architecture Reference

### Current State

| Component | Package Count | Status |
|-----------|--------------|--------|
| Radix UI primitives | 26 packages | Active — all used in `components/ui/` |
| Direct Radix imports in app/ | 0 files | Clean — all abstracted through wrappers |
| asChild usages in app/ | 38 instances in 19 files | Must be preserved by shim |
| Custom non-Shadcn components | 2 files | Require manual migration |

### Approach A: shadcn CLI Re-scaffold (Not Chosen)

**Architecture**: Change `components.json` style to `"base-vega"`, then re-add all 32 components with `npx shadcn@latest add --all --overwrite`, manually port customizations back.

**Pros**: Maximally aligned with shadcn/ui. Single-package dependency. Battle-tested.
**Cons**: Risk of losing customizations (Hugeicons, variants). Requires app-level asChild→render changes (38 call sites). Not incremental — wholesale file replacement.
**Complexity**: Medium.

### Approach B: Manual In-Place Migration (Not Chosen)

**Architecture**: Hand-rewrite each component file, replacing Radix imports with Base UI.

**Pros**: Fully incremental. Full control. Deep understanding.
**Cons**: Highest effort. Error-prone. Diverges from shadcn/ui. Extended dual-dependency.
**Complexity**: High.

### Approach C: Registry Reference + Compatibility Shim (Chosen)

**Architecture**: Use shadcn's official Base UI registry (`https://ui.shadcn.com/r/styles/base-vega/{component}.json`) as reference implementations. Manually adapt each component file, preserving customizations while swapping primitives. Add `asChildAdapter` shim to preserve backward compatibility for all 38 `asChild` usages in app/. Manually migrate 2 custom components. After migration, update `components.json` style to `"base-vega"` for future CLI compatibility.

**Pros**:
1. Zero app-level code changes on day one
2. Aligned with shadcn/ui's official Base UI implementations
3. Phased rollout by difficulty tier with typecheck gates
4. Smallest blast radius — each component independently revertible
5. Shim provides gradual deprecation path for asChild

**Cons**:
1. Shim adds temporary complexity (must eventually be removed)
2. Still requires porting customizations (Hugeicons, variants)
3. Dual dependency during transition window

**Complexity**: Medium.

### Comparison Matrix

| Dimension | A: CLI Re-scaffold | B: Manual In-Place | C: Registry + Shim (Chosen) |
|-----------|-------------------|-------------------|----------------------|
| Complexity | Medium | High | Medium |
| Risk level | Medium | High | **Low–Medium** |
| App code changes | Yes (asChild→render) | Yes (asChild→render) | **None (shim)** |
| shadcn alignment | **Best** | Weak | Good |
| Incremental | Partial | **Best** | Good (phased) |
| v1 viability | Good | Risky | **Best** |

---

*Plan produced February 9, 2026. Revised February 9, 2026 (CLI verification + registry research). Optimized for AI agent execution. Based on: @base-ui/react v1.1.0, shadcn/ui January 2026 Base UI support (components.json `base-*` styles), 26 @radix-ui/* packages, 32 Radix-importing files in components/ui/, 38 asChild usages in 19 app/ files, React 19, Next.js 16, Tailwind 4. CLI verification confirmed: no `--base-ui` flag exists; use registry URLs or `components.json` style field instead.*
