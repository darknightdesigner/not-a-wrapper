# Make Sidebar Great Again

> **Status**: Planning
> **Priority**: P1
> **Updated**: February 17, 2026
> **Primary references**: `.agents/context/research/sidebar/chatgpt-expanded-html.md`, `.agents/context/research/sidebar/chatgpt-collapsed-html.md`, `.agents/context/research/sidebar/chatgpt-styles-reference.md`

---

## Objective

Rebuild sidebar behavior and interaction details so Not A Wrapper matches ChatGPT as closely as possible while staying stable, accessible, and easy to implement without regressions.

This version of the plan is implementation-safe by design:
- exact parity contracts per feature
- file-level change map
- explicit "do not break" guardrails
- pass/fail validation checklist before merge

---

## Source-of-Truth Parity Contracts

These contracts must hold in final implementation:

1. **Two-layer sidebar model**
   - Collapsed rail and expanded panel are both mounted.
   - Visibility is controlled by opacity + pointer-events + `inert`.
2. **Open/close semantics**
   - Open control: `aria-label="Open sidebar"`, `aria-expanded="false"` when collapsed, `aria-controls` points to sidebar container id.
   - Close control: `aria-label="Close sidebar"`, `aria-expanded` mirrors expanded/collapsed state, same `aria-controls`.
3. **Collapsed avatar behavior**
   - Clicking avatar opens profile menu (not sidebar expansion).
4. **Chat row trailing pair**
   - Row includes options trigger + active indicator slot (active row only).
5. **Section header rhythm**
   - Header spacing/weight/chevron visibility follow ChatGPT compact pattern.

If a change conflicts with these contracts, treat it as incorrect even if it "looks close."

---

## Reference Dimensions & Tokens

Extracted from ChatGPT's computed styles (see `chatgpt-styles-reference.md`).

### Layout

| Token | Value | Computed |
|---|---|---|
| `--sidebar-width` | `260px` | 260px |
| `--sidebar-rail-width` | `calc(13 * var(--spacing))` | 3.25rem / 52px |
| `--header-height` | `calc(13 * var(--spacing))` | 3.25rem / 52px |
| `--menu-item-height` | `calc(var(--spacing) * 9)` | 2.25rem / 36px |
| `--sidebar-section-margin-top` | `1.25rem` | 20px |
| `--sidebar-section-first-margin-top` | `.5rem` | 8px |
| `--sidebar-expanded-section-margin-bottom` | `1.25rem` | 20px |
| `--sidebar-collapsed-section-margin-bottom` | `.75rem` | 12px |

### Sidebar Colors (Dark Mode)

| Token | Value | Notes |
|---|---|---|
| `--bg-elevated-secondary` | `#181818` | Expanded sidebar background |
| `--bg-primary` | `#212121` | Collapsed sidebar (rail) background |
| `--sidebar-title-primary` | `#f0f0f080` | Section headers — 50% opacity white |
| `--sidebar-body-primary` | `#ededed` | Chat item text |
| `--sidebar-icon` | `#a4a4a4` | Icon default color |
| `--sidebar-surface` | `#2b2b2b` | Intermediate surface |
| `--surface-hover` | `#ffffff26` | Hover overlay (15% white) |
| `--border-light` | `#ffffff0d` | Sidebar right border |
| `--scrollbar-color` | `#ffffff1a` | Scrollbar track |
| `--scrollbar-color-hover` | `#fff3` | Scrollbar track on hover |

### Interactive States (Secondary Tier — Sidebar Items)

| State | Background |
|---|---|
| Default | `#fff0` (transparent) |
| Hover | `#ffffff1a` (10% white) |
| Press | `#ffffff0d` (5% white) |
| Selected | `#ffffff1a` (same as hover) |

### Typography (Likely Section Header)

| Token | Size | Line Height | Weight |
|---|---|---|---|
| `--text-footnote-medium` | `.8125rem` (13px) | `1.25rem` | 500 |
| `--text-body-small-regular` | `.875rem` (14px) | `1.125rem` | 400 |
| `--text-caption-regular` | `.75rem` (12px) | `1rem` | 400 |

### Easing & Spring Animations

The sidebar uses **two distinct animation layers**:

1. **Opacity crossfade** (rail ↔ panel): `duration-150` with `steps(1,start)`/`steps(1,end)` for rail, `ease-linear` for panel.
2. **Width + background-color transition** (root container): Uses a spring or `--easing-common` curve at ~`.667s`.

Key spring variables available in ChatGPT's CSS:

| Variable | Duration | Character |
|---|---|---|
| `--spring-fast` | `.667s` | Quick, no overshoot |
| `--spring-common` / `--spring-standard` | `.667s` | General-purpose |
| `--spring-bounce` | `.833s` | Visible overshoot |
| `--easing-spring-elegant` | `.58171s` | Refined spring (100+ stops) |
| `--easing-common` | — | Extremely granular curve (100+ stops) |

The `--default-transition-duration` is `.15s` with `cubic-bezier(.4,0,.2,1)` (ease-in-out) for non-animated property changes.

### Touch Targets

| Token | Value |
|---|---|
| `--tap-padding-pointer` | `32px` |
| `--tap-padding-mobile` | `44px` |

HTML confirms `touch:h-10 touch:w-10` (40px) on toggle buttons.

---

## Scope

### In Scope

- `app/components/layout/sidebar/app-sidebar.tsx`
- `components/ui/sidebar.tsx`
- `app/components/layout/sidebar/sidebar-item.tsx`
- `app/components/layout/sidebar/sidebar-item-menu.tsx`
- `app/components/layout/chat-actions-menu.tsx`
- `components/ui/collapsible-section.tsx`
- `app/components/layout/sidebar/sidebar-list.tsx` (header composition impact)
- `app/components/layout/user-menu.tsx` (if needed to reuse menu trigger behavior safely)

### Out of Scope

- Replacing sidebar architecture with a new system
- Adding/removing product features unrelated to ChatGPT parity
- Backend/data model changes

---

## Implementation Patterns (Observed from ChatGPT Reference)

These patterns are visible across the HTML and CSS references. They aren't behavior contracts but are architecture choices worth adopting for parity and maintainability.

### Tailwind Group Scoping

ChatGPT uses named Tailwind groups to scope hover/focus visibility of child elements:

| Group Name | Scope | Drives |
|---|---|---|
| `group/tiny-bar` | Collapsed rail container | Rail toggle icon swap (logo ↔ arrow on hover) |
| `group/sidebar-expando-section` | Each collapsible section wrapper | Chevron visibility on section hover |
| `group/scrollport` | Chat history `<nav>` | Scroll shadow visibility via `data-scrolled-from-top` / `data-scrolled-from-end` |

These enable child elements to react to parent hover state without JavaScript.

### Data Attribute Hooks

ChatGPT uses data attributes as both styling hooks and behavioral markers:

| Attribute | Purpose | Used On |
|---|---|---|
| `data-active` | Marks the currently active chat row | `<a>` chat item |
| `data-trailing-button` | Identifies trailing action button (ellipsis) | `<button>` in trailing pair |
| `data-fill` | Marks items that fill available width | All sidebar items |
| `data-sidebar-item="true"` | Generic sidebar item marker | All interactive sidebar items |
| `data-no-spacing="true"` | Removes default heading spacing | Section `<h2>` labels |
| `data-size="large"` | Large item variant (avatar row) | Profile menu trigger |
| `data-state="closed"` | Radix-style popover/menu state | Tooltip/menu wrappers |

### Class Abstraction Layer

ChatGPT has a shared BEM-like class layer alongside Tailwind:

| Class | Purpose |
|---|---|
| `__menu-item` | Base sidebar row — standardizes height, padding, hover behavior |
| `__menu-item-trailing-btn` | Trailing action button inside a row |
| `__menu-label` | Section header label (paired with `data-no-spacing`) |
| `hoverable` | Adds hover interaction styling to any sidebar item |
| `trailing` | Trailing slot container (right side of row) |
| `trailing-pair` | Two-slot trailing layout (action button + indicator) |
| `trailing highlight` | Trailing slot that shows on hover/focus |

This suggests a component-level CSS layer that we should consider mapping to our own utility classes or Tailwind `@apply` rules.

### Scroll Edge Shadow Pattern

The sidebar uses a scroll-position-aware shadow system:

1. `<nav>` has `data-scrolled-from-top` and `data-scrolled-from-end` attributes (set by JS on scroll)
2. Sticky header uses `short:group-data-scrolled-from-top/scrollport:shadow-sharp-edge-top` to show a top shadow when scrolled
3. A bottom spacer element uses `group-data-scrolled-from-top/scrollport:opacity-100` for a fade mask
4. The footer separator uses `mask-image: linear-gradient(to top, transparent 25%, white 75%)` for a soft edge

### Sticky Nav Behavior

The primary nav (New Chat, Search, Images) uses height-aware stickiness:

- `tall:sticky tall:top-header-height tall:z-20` — only sticky on tall viewports
- `not-tall:relative` — falls back to normal flow on short viewports
- `[--sticky-spacer:6px]` — a small spacer below the sticky area that fades in when scrolled

---

## Current Gaps (Observed vs ChatGPT Reference)

1. **Collapsed avatar click currently toggles sidebar** in `app-sidebar.tsx`; ChatGPT opens profile menu.
2. **ARIA parity incomplete** on toggle controls (missing strict state reflection contract).
3. **Transition easing mismatch**:
   - rail hidden state should use `steps(1,end)` rather than linear fade
   - expanded panel should remain linear both directions
   - sidebar root width + background-color transition likely uses a spring/`--easing-common` curve (~.667s), not accounted for in current implementation
4. **Chat rows use absolute overlay menu** instead of explicit trailing-pair layout.
5. **Section headers are heavier and tighter to row styling** than ChatGPT’s subtle expando header style.

---

## Implementation Plan (Execution Safe)

## Phase 0: Baseline + Safety Harness

### Actions

1. Capture baseline behavior from current branch:
   - collapsed toggle behavior
   - expanded toggle behavior
   - avatar click behavior
   - row hover/focus/menu behavior
   - section collapse/expand persistence
2. Record explicit invariants that must not break:
   - mobile close behavior
   - rename flow
   - pin/unpin/delete actions
   - keyboard accessibility (Tab/Enter/Escape)

### Exit Criteria

- [ ] Baseline matrix documented in this file (checklist ready before edits)
- [ ] No planned change relies on assumptions not verified in current code

---

## Phase 1: Toggle Semantics + Container Contract

### Files

- `app/components/layout/sidebar/app-sidebar.tsx`
- `components/ui/sidebar.tsx`

### Actions

1. Add a stable sidebar container id on desktop sidebar root (for `aria-controls` reference).
2. Make open and close controls emit explicit state:
   - `Open sidebar` control mirrors collapsed state
   - `Close sidebar` control mirrors expanded state
3. Ensure labels are explicit and unique for assistive tech.
4. Keep tooltip text aligned with control behavior (no semantic mismatch).

### Guardrails

- Do not break existing keyboard shortcut `cmd/ctrl + b`.
- Do not remove existing mobile-sheet behavior.

### Exit Criteria

- [ ] `aria-controls` points to real id
- [ ] `aria-expanded` values are correct in both states
- [ ] screen-reader labels match action intent

---

## Phase 2: Transition Timing Fidelity

The sidebar has **two coordinated animation layers** that must work together:

1. **Root container** (`#stage-slideover-sidebar`): animates `width` (260px ↔ 52px) and `background-color` (#181818 ↔ #212121). Uses a spring/easing curve at ~.667s duration.
2. **Inner layers** (rail + panel): cross-fade with `opacity` at 150ms. Rail uses asymmetric `steps()` timing; panel uses `linear`.

### Files

- `app/components/layout/sidebar/app-sidebar.tsx`
- `components/ui/sidebar.tsx` (if root width transition lives here)

### Actions

1. **Root width + background-color transition**:
   - Animate `width` between `var(--sidebar-width)` and `var(--sidebar-rail-width)`
   - Animate `background-color` between `var(--bg-elevated-secondary)` and `var(--bg-primary)`
   - Use a spring-like easing curve (approximate `--easing-common` or `--spring-standard` at ~.667s). Start with `cubic-bezier(.4,0,.2,1)` at `.3s` as a practical first pass; refine toward the `linear()` spring curve if needed.
2. **Asymmetrical rail opacity timing**:
   - Appearing (collapse): `steps(1,start)` — rail visible instantly
   - Disappearing (expand): `steps(1,end)` — rail hidden only at transition end
3. **Expanded panel opacity**: `ease-linear` at 150ms in both directions.
4. Ensure hidden layer has both:
   - `pointer-events-none`
   - `inert`
5. Verify rapid toggle does not produce overlapping hit targets.

### Guardrails

- No JS timing hacks; use deterministic class composition from state.
- Do not introduce animation jitter via conflicting transition classes.
- Width transition and opacity crossfade durations should be coordinated so the panel content fades out before the container finishes shrinking (opacity at 150ms finishes well before width at ~667ms).

### Exit Criteria

- [ ] Sidebar root smoothly animates width between expanded and collapsed
- [ ] Background color transitions between expanded (#181818) and collapsed (#212121)
- [ ] Rail appears instantly when collapsing
- [ ] Rail disappears only at end of expansion
- [ ] Expanded panel always linearly fades
- [ ] Hidden layer cannot receive click/focus
- [ ] No visual gap or flash during the width transition

---

## Phase 3: Collapsed Avatar = Profile Menu Trigger

### Files

- `app/components/layout/sidebar/app-sidebar.tsx`
- `app/components/layout/user-menu.tsx` (if trigger extraction/reuse needed)

### Actions

1. Replace collapsed avatar `toggleSidebar` behavior with profile menu trigger behavior.
2. Reuse existing `UserMenu` semantics to avoid divergence:
   - `aria-haspopup="menu"`
   - state-reflective `aria-expanded`
3. Keep tooltip label in collapsed rail.
4. Keep header toggle as only sidebar expansion affordance.

### Guardrails

- Avoid creating a second menu implementation with drift risk.
- No behavior where avatar both opens menu and toggles sidebar.

### Exit Criteria

- [ ] Collapsed avatar opens profile menu directly
- [ ] Sidebar remains collapsed on avatar click
- [ ] Account menu behavior matches expanded footer menu

---

## Phase 4: Chat Row Trailing Pair Refactor

### Files

- `app/components/layout/sidebar/sidebar-item.tsx`
- `app/components/layout/sidebar/sidebar-item-menu.tsx`
- `app/components/layout/chat-actions-menu.tsx`
- `app/components/layout/sidebar/project-chat-item.tsx` (for consistency where appropriate)

### Actions

1. Refactor row structure to explicit trailing pair container:
   - trailing action button (ellipsis)
   - trailing active indicator slot
2. Target row height of `--menu-item-height` (2.25rem / 36px). Trailing pair must fit within this constraint.
3. Keep row title truncation and clickable area stable.
4. Make options trigger accessible:
   - clear `aria-label` (e.g. "Open conversation options")
   - menu semantics preserved from dropdown primitives
5. Preserve inline rename mode and click-outside save/cancel behavior.

### Guardrails

- Do not regress rename keyboard behavior (`Enter`, `Escape`).
- Do not block row navigation because of trailing controls.
- Keep mobile behavior where menu is always reachable.
- Trailing pair layout must not exceed the 36px row height or cause vertical overflow.

### Exit Criteria

- [ ] Trailing pair is visible/usable without layout overlap
- [ ] Active row indicator appears only for active row
- [ ] Rename and menu states do not conflict
- [ ] Overflow masking still prevents text collision with trailing controls

---

## Phase 5: Section Header Typography + Chevron Rhythm

### Files

- `components/ui/collapsible-section.tsx`
- `app/components/layout/sidebar/sidebar-list.tsx`

### Actions

1. Tune header trigger spacing and typography to ChatGPT style:
   - `px-4 py-1.5`
   - Section header text color: `--sidebar-title-primary` (`#f0f0f080` — 50% opacity white). This is distinctly lighter than body text, creating clear hierarchy.
   - Typography: likely `--text-footnote-medium` (`.8125rem` / 13px, weight 500) or similar compact heading style.
   - Body text reference: `--sidebar-body-primary` (`#ededed`), icon reference: `--sidebar-icon` (`#a4a4a4`).
2. Ensure section label uses `<h2>` heading semantics with `__menu-label` class (matches ChatGPT).
3. Update chevron behavior:
   - compact size (`h-3 w-3` / 12px)
   - collapsed sections: chevron visible on group hover (`group-hover/sidebar-expando-section:block`)
   - expanded sections: chevron `invisible` by default, `visible` on group hover
4. Section margin rhythm:
   - Collapsed sections: `mb-[var(--sidebar-collapsed-section-margin-bottom)]` (0.75rem)
   - Expanded sections: `mb-[var(--sidebar-expanded-section-margin-bottom)]` (1.25rem)
5. Preserve localStorage persistence and animation behavior.

### Guardrails

- No breaking change to existing `storageKey` behavior.
- Keep focus ring and keyboard operability intact.

### Exit Criteria

- [ ] Header rhythm matches ChatGPT reference
- [ ] Chevron behavior matches state + hover expectations
- [ ] Section expand/collapse persistence still works

---

## Recommended Execution Order

1. Phase 1 (semantics/container contract)
2. Phase 2 (timing model)
3. Phase 3 (avatar behavior)
4. Phase 4 (chat row structure)
5. Phase 5 (section rhythm)

Reason: semantic/state correctness first, then visual/structural refinements.

---

## Validation Matrix (Must Pass Before Merge)

### Behavioral

- [ ] Collapsed open control opens sidebar
- [ ] Expanded close control closes sidebar
- [ ] Collapsed avatar opens account menu (not sidebar)
- [ ] Chat row menu opens from trailing control
- [ ] Active row indicator appears only on active row
- [ ] Section collapse state persists after refresh

### Accessibility

- [ ] Open/close controls expose valid `aria-controls` + correct `aria-expanded`
- [ ] Menu triggers have meaningful accessible names
- [ ] Hidden layer cannot be focused while inert
- [ ] Keyboard flow: Tab + Enter + Escape works for toggles, rows, menus, rename

### Visual/Interaction

- [ ] No flicker on rapid sidebar toggle
- [ ] Sidebar width animates smoothly (no instant jump)
- [ ] Background color transitions between states
- [ ] No hidden hitboxes intercepting clicks
- [ ] Title truncation does not overlap trailing controls
- [ ] Header spacing/chevron behavior visually matches reference captures
- [ ] Section header text uses 50%-opacity style (not same weight as body text)
- [ ] Scrollbar color matches reference (`#ffffff1a` default, `#fff3` hover) if visible

### Engineering

- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes

---

## Definition of Done

All parity contracts hold in both collapsed and expanded states, all validation matrix items pass, and sidebar behavior remains stable on desktop and mobile without regressions to rename/menu/project flows.
