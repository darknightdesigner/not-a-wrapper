# Make Sidebar Great Again

> **Status**: Integration validation complete (manual browser confirmations pending)
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

### Baseline Matrix (Current Branch, Pre-Phase-1)

| Behavior | Current observed in Not A Wrapper | ChatGPT reference signal | Delta risk to manage |
|---|---|---|---|
| Collapsed toggle behavior | Collapsed header button uses `toggleSidebar()` (`CollapsedHeaderToggle`), label is "Open sidebar", but no explicit `aria-controls` / state-reflective `aria-expanded` on trigger. Collapsed rail currently uses `steps(1,start)` when visible and linear when hidden. | Collapsed trigger exposes `aria-label="Open sidebar"`, `aria-expanded="false"`, and `aria-controls` to sidebar container id; hidden rail uses `steps(1,end)` with `pointer-events-none` + `inert`. | Semantic drift on assistive state + transition mismatch during expand. |
| Expanded toggle behavior | Expanded header uses `SidebarTrigger` with sr-only text "Toggle Sidebar"; behavior closes/opens correctly via shared context; mobile close button calls `setOpenMobile(false)`. | Expanded close control is explicit (`aria-label="Close sidebar"`) and state-reflective (`aria-expanded="true"` when expanded) with shared `aria-controls`. | Functional parity mostly present; ARIA contract still weaker than reference. |
| Avatar click behavior | Collapsed avatar button (`CollapsedUserAvatar`) calls `toggleSidebar()` and expands sidebar; does not open account menu directly. | Collapsed avatar is a profile menu trigger (`aria-haspopup="menu"`), opening account menu without expanding sidebar. | High parity gap; interaction intent differs. |
| Row hover / focus / menu behavior | `SidebarItem` uses link row + absolutely positioned right menu container (`opacity-0`, visible on hover/mobile). Active when current/editing/menu-open. Inline rename saves on click-outside and Enter, cancels on Escape. Menu actions are in `ChatActionsMenu` (pin/unpin, rename, delete). | Rows present explicit trailing pair (options button + active indicator slot), options trigger has clear conversation-options labeling and menu semantics. | Overlay layout can conflict with text/hover rhythm; focus order and hit-target interactions must stay stable. |
| Section collapse persistence | `CollapsibleSection` persists `isOpen` by `storageKey` in `localStorage`; reads on mount and writes on open change; default from `defaultOpen` for SSR-safe initial render. | Section expand/collapse persists across sessions; trigger semantics and chevron behavior are stable. | Must preserve storage contract while tuning header rhythm. |

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

### No-Regression Invariants (Must Hold Across Phases 1-5)

- [x] Mobile close behavior remains deterministic:
  - header close on mobile always calls `setOpenMobile(false)`
  - no desktop-only toggle path leaks into mobile sheet closing
- [x] Rename flow is unchanged:
  - `Enter` saves title edits
  - `Escape` cancels edits and restores prior title
  - click-outside while editing saves (current behavior contract)
- [x] Chat actions remain intact:
  - Pin/Unpin still toggles pinned state from row menu
  - Delete still opens confirm dialog and performs delete flow
  - Rename action from menu still enters rename path (inline or prompt fallback)
- [ ] Keyboard navigation/focus order remains usable (manual browser verification pending):
  - Tab order reaches row link and row menu trigger predictably
  - Enter activates focused actionable controls
  - Escape closes transient states (rename/menu/dialog) without trapping focus

### Exit Criteria

- [x] Baseline matrix documented in this file (checklist ready before edits)
- [x] No planned change relies on assumptions not verified in current code

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

- [x] `aria-controls` points to real id
- [x] `aria-expanded` values are correct in both states
- [x] screen-reader labels match action intent

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

- [x] Rail appears instantly when collapsing
- [x] Rail disappears only at end of expansion
- [x] Expanded panel always linearly fades
- [x] Hidden layer cannot receive click/focus

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

- [x] Collapsed avatar opens profile menu directly
- [x] Sidebar remains collapsed on avatar click
- [x] Account menu behavior matches expanded footer menu

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

- [x] Trailing pair is visible/usable without layout overlap
- [x] Active row indicator appears only for active row
- [x] Rename and menu states do not conflict
- [x] Overflow masking still prevents text collision with trailing controls

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

- [x] Header rhythm matches ChatGPT reference
- [x] Chevron behavior matches state + hover expectations
- [x] Section expand/collapse persistence still works

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

- [x] Collapsed open control opens sidebar
- [x] Expanded close control closes sidebar
- [x] Collapsed avatar opens account menu (not sidebar)
- [x] Chat row menu opens from trailing control
- [x] Active row indicator appears only on active row
- [ ] Section collapse state persists after refresh (manual browser verification pending)

### Accessibility

- [x] Open/close controls expose valid `aria-controls` + correct `aria-expanded`
- [x] Menu triggers have meaningful accessible names
- [x] Hidden layer cannot be focused while inert
- [ ] Keyboard flow: Tab + Enter + Escape works for toggles, rows, menus, rename (manual browser verification pending)

### Visual/Interaction

- [ ] No flicker on rapid sidebar toggle (manual browser verification pending)
- [ ] No hidden hitboxes intercepting clicks (manual browser verification pending)
- [x] Title truncation does not overlap trailing controls
- [ ] Header spacing/chevron behavior visually matches reference captures (manual browser verification pending)

### Engineering

- [x] `bun run lint` passes
- [x] `bun run typecheck` passes

---

## Definition of Done

All parity contracts hold in both collapsed and expanded states, all validation matrix items pass, and sidebar behavior remains stable on desktop and mobile without regressions to rename/menu/project flows.
