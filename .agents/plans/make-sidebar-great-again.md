# Make Sidebar Great Again

> **Status**: Planning
> **Priority**: P1
> **Updated**: February 17, 2026
> **Primary references**: `.agents/context/sidebar/chatgpt-expanded-html.md`, `.agents/context/sidebar/chatgpt-collapsed-html.md`

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

## Current Gaps (Observed vs ChatGPT Reference)

1. **Collapsed avatar click currently toggles sidebar** in `app-sidebar.tsx`; ChatGPT opens profile menu.
2. **ARIA parity incomplete** on toggle controls (missing strict state reflection contract).
3. **Transition easing mismatch**:
   - rail hidden state should use `steps(1,end)` rather than linear fade
   - expanded panel should remain linear both directions
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

### Files

- `app/components/layout/sidebar/app-sidebar.tsx`

### Actions

1. Implement asymmetrical rail timing:
   - visible: `steps(1,start)`
   - hidden: `steps(1,end)`
2. Keep expanded panel fade linear in both directions.
3. Ensure hidden layer has both:
   - `pointer-events-none`
   - `inert`
4. Verify rapid toggle does not produce overlapping hit targets.

### Guardrails

- No JS timing hacks; use deterministic class composition from state.
- Do not introduce animation jitter via conflicting transition classes.

### Exit Criteria

- [ ] Rail appears instantly when collapsing
- [ ] Rail disappears only at end of expansion
- [ ] Expanded panel always linearly fades
- [ ] Hidden layer cannot receive click/focus

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
2. Keep row title truncation and clickable area stable.
3. Make options trigger accessible:
   - clear `aria-label` (e.g. "Open conversation options")
   - menu semantics preserved from dropdown primitives
4. Preserve inline rename mode and click-outside save/cancel behavior.

### Guardrails

- Do not regress rename keyboard behavior (`Enter`, `Escape`).
- Do not block row navigation because of trailing controls.
- Keep mobile behavior where menu is always reachable.

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
   - tertiary text tone
   - lighter hierarchy than row items
2. Ensure section label uses heading semantics where appropriate.
3. Update chevron behavior:
   - compact size
   - hover/state-driven visibility parity
4. Preserve localStorage persistence and animation behavior.

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
- [ ] No hidden hitboxes intercepting clicks
- [ ] Title truncation does not overlap trailing controls
- [ ] Header spacing/chevron behavior visually matches reference captures

### Engineering

- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes

---

## Definition of Done

All parity contracts hold in both collapsed and expanded states, all validation matrix items pass, and sidebar behavior remains stable on desktop and mobile without regressions to rename/menu/project flows.
