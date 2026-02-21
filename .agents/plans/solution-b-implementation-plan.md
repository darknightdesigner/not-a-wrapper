# Solution B: Hybrid Sticky Header — Implementation Plan

**Target:** ChatGPT-aligned sticky header with preserved StickToBottom auto-scroll
**Timeline:** 5-6 days
**Risk Level:** Medium
**Agent Model:** Opus 4.6 for all agents

---

## Executive Summary

This plan implements ChatGPT's sticky header architecture while preserving Not A Wrapper's existing StickToBottom auto-scroll functionality. The work is divided into 5 phases with clear verification gates between each phase.

**Key Changes:**
1. Header positioning: `fixed` → `sticky`
2. Header layout: 2-section → 3-column with centered model selector
3. Header background: `transparent` → `opaque`
4. Header height: `56px` → `52px`
5. Viewport unit: `h-dvh` → `h-svh`
6. Container naming: `@container` → `@container/main`
7. Z-index: `50` → `20`

**Verification Strategy:**
- Type checking after each file change
- Visual regression testing at phase boundaries
- Mobile testing (iOS Safari, Chrome Android)
- Accessibility audit (keyboard nav, screen readers)
- Multi-model mode testing

---

## Phase 0: Pre-Implementation (Preparation)

**Duration:** 2 hours
**Agent:** Plan Agent (research & setup)

### Tasks

1. **Create Feature Branch**
   ```bash
   git checkout -b feat/sticky-header-solution-b
   ```

2. **Baseline Capture**
   - Screenshot current header at 1440px, 768px, 400px (light + dark mode)
   - Record scroll behavior (video or detailed notes)
   - Document z-index hierarchy (all fixed/absolute elements)
   - List all components that depend on header height or positioning

3. **Dependency Analysis**
   - Find all uses of `--spacing-app-header` CSS variable
   - Find all uses of `h-app-header` class
   - Find all components with `z-index` > 20
   - Find all scroll offset calculations
   - Find all components that render in portals (dialogs, tooltips, dropdowns)

4. **Test Plan Creation**
   - Define test scenarios for scroll behavior
   - Define mobile test matrix (devices, browsers)
   - Define accessibility checkpoints
   - Define visual regression checkpoints

### Verification

- [ ] Feature branch created and pushed
- [ ] Baseline screenshots saved to `.agents/plans/baseline-screenshots/`
- [ ] Dependency analysis documented
- [ ] Test plan approved

### Deliverables

- `baseline-screenshots/` directory with 6 images (3 viewports × 2 modes)
- `dependency-analysis.md` with findings
- `test-plan.md` with detailed test scenarios

---

## Phase 1: CSS Foundation (Non-Breaking Changes)

**Duration:** 4 hours
**Agent:** Code Agent (CSS specialist)
**Scope:** globals.css, Tailwind config

### Tasks

#### 1.1 Update CSS Variables

**File:** `app/globals.css`

```css
/* BEFORE */
--spacing-app-header: 56px;

/* AFTER */
--spacing-app-header: 52px;
```

**Additional Changes:**
```css
/* Add new variables for sticky header */
--header-z-index: 20;
--scroll-padding-top: 0px; /* No longer need fixed header compensation */

/* Update scroll area calculation */
--spacing-scroll-area: calc(
  -1 * (var(--spacing-input-area) + 0px) /* Remove header height */
);
```

#### 1.2 Add Container Query Support

**File:** `app/globals.css`

Add to `@theme` block:
```css
/* Scrollbar gutter responsive classes */
.scrollbar-gutter-stable {
  scrollbar-gutter: stable;
}

@media (min-width: 640px) {
  .scrollbar-gutter-stable-both {
    scrollbar-gutter: stable both-edges;
  }
}
```

#### 1.3 Update Viewport Height Utilities

**File:** `app/globals.css` (if not already present)

```css
/* Ensure h-svh is available */
@utilities {
  .h-svh {
    height: 100svh;
  }
}
```

### Verification

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] CSS builds without errors
- [ ] No visual regressions (changes not applied to components yet)

### Git Checkpoint

```bash
git add app/globals.css
git commit -m "feat: update CSS variables for 52px sticky header"
```

---

## Phase 2: Layout Architecture (Breaking Changes)

**Duration:** 6 hours
**Agent:** Code Agent (React specialist)
**Scope:** layout-app.tsx, header.tsx

### Tasks

#### 2.1 Update Layout Root

**File:** `app/components/layout/layout-app.tsx`

**Changes:**
1. Change `h-dvh` → `h-svh`
2. Change `@container` → `@container/main`
3. Update main element classes

```tsx
// BEFORE
<div className="bg-background flex h-dvh w-full overflow-hidden">
  {hasSidebar && <AppSidebar />}
  <main className="@container relative h-dvh w-0 flex-shrink flex-grow overflow-y-auto">
    <Header hasSidebar={hasSidebar} />
    {children}
  </main>
</div>

// AFTER
<div className="bg-background flex h-svh w-full overflow-hidden">
  {hasSidebar && <AppSidebar />}
  <main className="@container/main relative h-svh w-0 flex-shrink flex-grow overflow-y-auto">
    <Header hasSidebar={hasSidebar} />
    {children}
  </main>
</div>
```

**Note:** Header positioning change happens in Phase 2.2, not here.

#### 2.2 Update Header Component

**File:** `app/components/layout/header.tsx`

**Major Changes:**

1. **Position: fixed → sticky**
2. **z-index: 50 → 20**
3. **Background: transparent → opaque**
4. **Layout: 2-section → 3-column**

```tsx
// BEFORE
<header className="h-app-header pointer-events-none fixed top-0 right-0 left-0 z-50">
  <div className="relative mx-auto flex h-full max-w-full items-center justify-between bg-transparent px-4 lg:bg-transparent">
    <div className="flex flex-1 items-center justify-between">
      <div className="-ml-0.5 flex flex-1 items-center gap-2 lg:-ml-2.5">
        {/* LEFT SECTION */}
      </div>
      <div /> {/* EMPTY CENTER */}
      {/* RIGHT SECTION */}
    </div>
  </div>
</header>

// AFTER
<header className="sticky top-0 z-20 h-app-header pointer-events-none bg-background">
  <div className="relative mx-auto flex h-full max-w-full items-center justify-between px-2">
    {/* LEFT SECTION */}
    <div className="flex flex-1 items-center gap-2">
      {(!hasSidebar || isMobile) && (
        <Link href="/" className="pointer-events-auto inline-flex items-center text-lg font-medium tracking-tight">
          <NawIcon className="mr-1 size-4" />
          {APP_NAME}
        </Link>
      )}
      {hasSidebar && isMobile && <HeaderSidebarTrigger />}
    </div>

    {/* CENTER SECTION (NEW) */}
    <div className="pointer-events-auto flex flex-1 items-center justify-center">
      {isLoggedIn && !isMultiModelEnabled && (
        <ModelSelectorHeader />
      )}
    </div>

    {/* RIGHT SECTION */}
    <div className="pointer-events-auto flex flex-1 items-center justify-end gap-2">
      {!isLoggedIn ? (
        <>
          <Button variant="outline" render={<Link href="/auth/login" />}>Login</Button>
          <Button render={<Link href="/auth/sign-up" />}>Sign up</Button>
        </>
      ) : (
        <>
          {!isMultiModelEnabled && <DialogPublish />}
          <ButtonNewChat />
          {!hasSidebar && <HistoryTrigger hasSidebar={hasSidebar} />}
          {!hasSidebar && <UserMenu />}
        </>
      )}
    </div>
  </div>
</header>
```

**Padding Change:** `px-4` → `px-2` (8px padding like ChatGPT)

#### 2.3 Extract Model Selector Component

**New File:** `app/components/layout/model-selector-header.tsx`

```tsx
"use client"

import { useModel } from "@/app/components/chat/use-model"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MODELS } from "@/lib/config"
import { ChevronDownIcon } from "@radix-ui/react-icons"

export function ModelSelectorHeader() {
  const { selectedModel, handleModelChange } = useModel()

  const currentModel = MODELS.find(m => m.id === selectedModel)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="gap-1 text-lg font-normal"
          />
        }
      >
        {currentModel?.name || "Select Model"}
        <ChevronDownIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {MODELS.map(model => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleModelChange(model.id)}
          >
            {model.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Note:** This component needs access to model state. May need to refactor `use-model.ts` to work outside chat context, or lift state to layout level.

#### 2.4 Update Container Query Classes

**Find and replace across codebase:**
- `@w-sm:` → `@w-sm/main:`
- `@w-md:` → `@w-md/main:`
- `@w-lg:` → `@w-lg/main:`
- `@w-xl:` → `@w-xl/main:`

**Files likely affected:**
- `app/components/chat/conversation.tsx`
- `app/components/chat/message.tsx`
- `components/ui/chat-container.tsx`

### Verification

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] Header renders in correct position (sticky, not fixed)
- [ ] Header has opaque background
- [ ] Header shows 3 columns in authenticated state
- [ ] Model selector appears in center (single-model mode only)
- [ ] No console errors
- [ ] No hydration mismatches

### Git Checkpoint

```bash
git add app/components/layout/
git commit -m "feat: implement sticky header with 3-column layout"
```

---

## Phase 3: Scroll Compensation Removal

**Duration:** 4 hours
**Agent:** Code Agent (React specialist)
**Scope:** conversation.tsx, chat.tsx, and any components with fixed header compensation

### Tasks

#### 3.1 Update Conversation Component

**File:** `app/components/chat/conversation.tsx`

**Changes:**
1. Remove top padding for fixed header (`pt-20` → `pt-0` or appropriate value)
2. Remove gradient masks for mobile (no longer needed with sticky header)

```tsx
// BEFORE
<div className="relative flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto">
  <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 mx-auto flex w-full flex-col justify-center">
    <div className="h-app-header bg-background flex w-full lg:hidden lg:h-0" />
    <div className="h-app-header bg-background flex w-full mask-b-from-4% mask-b-to-100% lg:hidden" />
  </div>
  <ChatContainerRoot className="relative w-full">
    <ChatContainerContent className="flex w-full flex-col items-center pt-20 pb-4" ...>

// AFTER
<div className="relative flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto">
  {/* Gradient masks removed */}
  <ChatContainerRoot className="relative w-full">
    <ChatContainerContent className="flex w-full flex-col items-center pt-4 pb-4" ...>
```

**Rationale:** Header is now sticky inside scroll context, so no need for compensation or masks.

#### 3.2 Update Chat Component (if needed)

**File:** `app/components/chat/chat.tsx`

Check for any layout adjustments needed now that header is sticky. Likely no changes required, but verify.

#### 3.3 Search for Other Compensation Logic

**Search for:**
- Uses of `--spacing-app-header` in calculations
- Fixed header compensation classes like `pt-[var(--spacing-app-header)]`
- Any scroll offset logic that accounts for fixed header

**Files to check:**
- `components/ui/scroll-button.tsx`
- Any custom scroll hooks
- Mobile-specific layout components

### Verification

- [ ] `bun run typecheck` passes
- [ ] No scroll compensation artifacts visible
- [ ] Content scrolls smoothly under sticky header
- [ ] No layout shifts when scrolling
- [ ] Gradient masks removed on mobile
- [ ] StickToBottom auto-scroll still works

### Git Checkpoint

```bash
git add app/components/chat/
git commit -m "refactor: remove fixed header scroll compensation"
```

---

## Phase 4: Z-Index Audit & Portal Fixes

**Duration:** 4 hours
**Agent:** Code Agent (UI specialist)
**Scope:** All components with z-index, portal-based UI

### Tasks

#### 4.1 Z-Index Hierarchy Documentation

**Create:** `.agents/plans/z-index-hierarchy.md`

Document all z-index values in the app:
```markdown
# Z-Index Hierarchy

## Current State (Post-Sticky Header)

| Layer | z-index | Component | Notes |
|-------|---------|-----------|-------|
| Modals/Dialogs | 50 | Dialog, Drawer | Radix/Base UI default |
| Tooltips/Popovers | 50 | Tooltip, Popover | Base UI default |
| Dropdowns | 50 | DropdownMenu, Select | Base UI default |
| Toast | 100 | Sonner toasts | Default from library |
| Header (sticky) | 20 | Header | Inside scroll context |
| Sidebar | 10-21 | AppSidebar | ChatGPT uses z-21 |
| Scroll button | 10 | ChatContainerScrollButton | Inside scroll context |
| Thread content | 0 | Messages, etc. | Default |

## Potential Conflicts

- ✅ Header (20) < Dropdowns (50) — Dropdowns appear above header
- ✅ Header (20) < Tooltips (50) — Tooltips appear above header
- ⚠️ Sidebar (21) > Header (20) — Sidebar may overlap header on mobile
```

#### 4.2 Test Portal-Based Components

**Components to test:**
1. Model selector dropdown (new in header)
2. User menu dropdown
3. Dialog components (publish, auth, settings)
4. Tooltips (button tooltips, etc.)
5. Toast notifications

**Test scenarios:**
- Open dropdown with header scrolled to top
- Open dropdown with header scrolled down (verify sticky behavior)
- Open dialog → verify it appears above header
- Trigger toast → verify it appears above everything

#### 4.3 Fix Any Z-Index Issues

If dropdowns or tooltips are clipped by scroll container or appear behind header:

**Option 1:** Increase z-index of portal containers
**Option 2:** Adjust header z-index
**Option 3:** Use portal with container={document.body} for problematic components

**Example fix for dropdown:**
```tsx
<DropdownMenuContent
  container={document.body} // Portal to body if needed
  className="z-50" // Explicit z-index
>
```

### Verification

- [ ] All dropdowns appear above header
- [ ] All tooltips appear above header
- [ ] All dialogs appear above header
- [ ] Model selector dropdown works in header
- [ ] No clipping or layering issues
- [ ] Mobile: hamburger menu works correctly
- [ ] Toast notifications appear above all content

### Git Checkpoint

```bash
git add .
git commit -m "fix: adjust z-index hierarchy for sticky header"
```

---

## Phase 5: Mobile & Responsive Testing

**Duration:** 6 hours
**Agent:** Test Agent (mobile specialist)
**Scope:** Mobile browsers, responsive behavior, accessibility

### Tasks

#### 5.1 Mobile Browser Testing

**Devices/Browsers:**
1. iOS Safari (iPhone 13/14/15)
2. iOS Chrome (iPhone)
3. Android Chrome (Pixel, Samsung)
4. Android Firefox (Pixel)

**Test Scenarios:**

**A. Address Bar Behavior (Safari)**
- Scroll down → address bar collapses
- Scroll up → address bar expands
- Verify: No layout shift, sticky header stays in place
- Verify: `h-svh` prevents content jump

**B. Safe Area Insets**
- iPhone notch handling
- Home indicator area
- Verify: Content not cut off
- Verify: Header respects safe areas

**C. Scroll Performance**
- Smooth scrolling
- No jank when header sticks/unsticks
- No rubber-banding issues
- StickToBottom auto-scroll works

**D. Touch Interactions**
- Tap model selector → dropdown opens
- Tap hamburger → sidebar opens
- Tap message actions → no scroll interference
- Pull to refresh (if enabled) doesn't conflict

#### 5.2 Responsive Breakpoint Testing

**Viewports:**
- 400px (mobile small)
- 768px (mobile large / tablet small)
- 1024px (tablet)
- 1440px (desktop)

**Per viewport, verify:**
1. Header height: 52px at all breakpoints
2. Header padding: 8px at all breakpoints
3. Header layout: correct column visibility
4. Model selector: visible or hidden appropriately
5. Hamburger: visible or hidden appropriately
6. No horizontal scroll
7. No layout overflow

#### 5.3 Accessibility Testing

**Keyboard Navigation:**
- [ ] Tab through header items (logo → model selector → actions)
- [ ] Tab order is logical (left → center → right)
- [ ] Focus visible on all interactive elements
- [ ] Dropdowns open with Enter/Space
- [ ] Dropdowns close with Escape
- [ ] No focus traps

**Screen Reader Testing:**
- [ ] Header announced as landmark (should be `<header>` tag)
- [ ] Model selector has appropriate aria-label
- [ ] Dropdown items are readable
- [ ] Sticky positioning doesn't confuse navigation

**Color Contrast:**
- [ ] Header text readable on background (WCAG AA)
- [ ] Model selector readable
- [ ] Focus indicators visible (3:1 contrast minimum)

#### 5.4 Multi-Model Mode Testing

**Verify:**
- [ ] Header center section empty in multi-model mode
- [ ] Model selectors still in composer per-chat-input
- [ ] No layout issues
- [ ] Switching between single/multi-model modes works

### Verification

- [ ] All mobile browsers tested, no issues
- [ ] All breakpoints tested, layout correct
- [ ] Accessibility audit passed
- [ ] Multi-model mode works correctly
- [ ] No regressions in existing functionality

### Git Checkpoint

```bash
git add .
git commit -m "test: verify mobile, responsive, and accessibility"
```

---

## Phase 6: Integration Testing & Polish

**Duration:** 4 hours
**Agent:** Test Agent (integration specialist)
**Scope:** End-to-end flows, edge cases

### Tasks

#### 6.1 Core User Flows

**Flow 1: New User Signup → First Chat**
1. Land on homepage (unauthenticated)
2. Header shows: logo, login, signup
3. Click signup → navigate to auth
4. Complete signup
5. Redirect to chat
6. Header shows: logo, model selector, new chat, user menu
7. Send first message
8. Verify sticky header during scroll

**Flow 2: Authenticated User Chat Session**
1. Login
2. Navigate to existing chat
3. Scroll through messages
4. Verify header sticks at top
5. Click model selector → change model
6. Send new message with new model
7. Verify message appears correctly

**Flow 3: Multi-Model Mode**
1. Enable multi-model in settings
2. Navigate to chat
3. Verify header center section empty
4. Verify model selectors in each chat input
5. Send messages to different models
6. Verify layout correct

**Flow 4: Mobile Navigation**
1. Open on mobile
2. Tap hamburger → sidebar opens
3. Navigate to different chat
4. Close sidebar
5. Scroll messages
6. Verify sticky header behavior

#### 6.2 Edge Cases

**Case 1: Very Long Messages**
- Create message with 1000+ lines
- Scroll through it
- Verify header remains sticky
- Verify no performance issues

**Case 2: Rapid Model Switching**
- Rapidly switch models in header selector
- Verify no race conditions
- Verify state updates correctly

**Case 3: Keyboard Navigation Only**
- Navigate entire app using only keyboard
- Verify all interactive elements reachable
- Verify logical tab order

**Case 4: Sidebar Collapsed/Expanded**
- Toggle sidebar multiple times
- Verify header layout adapts
- Verify no layout shifts

**Case 5: Theme Switching**
- Switch between light/dark mode
- Verify header background updates
- Verify all colors have sufficient contrast

#### 6.3 Performance Testing

**Metrics to check:**
- [ ] Time to Interactive (TTI) not regressed
- [ ] Largest Contentful Paint (LCP) not regressed
- [ ] Cumulative Layout Shift (CLS) improved (sticky vs fixed)
- [ ] Frame rate during scroll ≥ 60fps
- [ ] No memory leaks

**Tools:**
- Chrome DevTools Performance tab
- Lighthouse audit
- React DevTools Profiler

#### 6.4 Visual Regression Testing

**Compare before/after screenshots:**
- [ ] Desktop: 1440px, light mode
- [ ] Desktop: 1440px, dark mode
- [ ] Tablet: 768px, light mode
- [ ] Mobile: 400px, dark mode

**Check for:**
- Layout shifts
- Color changes
- Spacing changes
- Font rendering
- Icon alignment

### Verification

- [ ] All user flows completed successfully
- [ ] All edge cases handled correctly
- [ ] Performance metrics within acceptable range
- [ ] Visual regression approved
- [ ] No console errors or warnings

### Git Checkpoint

```bash
git add .
git commit -m "test: complete integration testing and polish"
```

---

## Phase 7: Code Review & Documentation

**Duration:** 3 hours
**Agent:** Review Agent (senior engineer)
**Scope:** Code quality, documentation, best practices

### Tasks

#### 7.1 Code Review Checklist

**Architecture:**
- [ ] Sticky header implementation matches design doc
- [ ] Scroll architecture preserved (StickToBottom still works)
- [ ] No unnecessary complexity introduced
- [ ] Component boundaries logical and maintainable

**Code Quality:**
- [ ] No TypeScript errors or `any` types
- [ ] No ESLint warnings
- [ ] Consistent code style
- [ ] No dead code or commented-out blocks
- [ ] No console.log statements

**Performance:**
- [ ] No unnecessary re-renders
- [ ] Memoization used appropriately
- [ ] No blocking operations in render
- [ ] Event listeners cleaned up

**Accessibility:**
- [ ] Semantic HTML used
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Focus management correct

**Testing:**
- [ ] All existing tests pass
- [ ] No flaky tests introduced
- [ ] Test coverage maintained or improved

#### 7.2 Update Documentation

**Files to update:**

**1. CLAUDE.md (root)**
```markdown
## Recent Changes

### Sticky Header Migration (2026-02-20)

The header has been migrated from `position: fixed` to `position: sticky` to align with ChatGPT's architecture.

**Key Changes:**
- Header is now inside the scroll context (`<main>`)
- Z-index reduced from 50 to 20
- Height reduced from 56px to 52px
- Layout changed from 2-section to 3-column
- Model selector moved to header center (single-model mode only)

**For Developers:**
- Header no longer requires scroll compensation (`pt-20` removed)
- Use `--spacing-app-header` (52px) for header-related calculations
- Container queries now use `@container/main` namespace
```

**2. app/components/layout/CLAUDE.md**
```markdown
## Header Component

The header uses a 3-column layout:
- **Left:** Logo (when sidebar hidden) + Hamburger (mobile with sidebar)
- **Center:** Model selector (single-model mode only)
- **Right:** Actions (publish, new chat, history, user menu)

**Positioning:** `sticky` — inside scroll context, sticks to top
**Z-Index:** 20 — low enough to allow dropdowns/tooltips to appear above

**Multi-Model Mode:** Center section empty, model selectors remain in composer
```

**3. .agents/plans/solution-b-implementation-plan.md**
```markdown
## Implementation Complete

✅ All phases completed on [DATE]
✅ Deployed to [ENVIRONMENT]

See `.agents/plans/solution-b-retrospective.md` for lessons learned.
```

#### 7.3 Create Migration Guide

**File:** `.agents/plans/sticky-header-migration-guide.md`

```markdown
# Sticky Header Migration Guide

For developers working on this codebase after the sticky header migration.

## What Changed

1. **Header Position:** Fixed → Sticky
2. **Header Height:** 56px → 52px
3. **Viewport Unit:** h-dvh → h-svh
4. **Container Naming:** @container → @container/main
5. **Z-Index:** 50 → 20

## Breaking Changes

- Removed scroll compensation (`pt-20` on conversation)
- Removed mobile gradient masks
- Changed CSS variables for scroll calculations

## How to Work with the New Header

### Adding Header Content
[Examples...]

### Adjusting Z-Index
[Guidelines...]

### Testing
[Checklist...]
```

### Verification

- [ ] Code review completed, all feedback addressed
- [ ] Documentation updated
- [ ] Migration guide created
- [ ] CHANGELOG.md updated (if exists)
- [ ] README.md updated (if needed)

### Git Checkpoint

```bash
git add .
git commit -m "docs: update documentation for sticky header"
```

---

## Phase 8: Deployment & Monitoring

**Duration:** 2 hours
**Agent:** DevOps Agent
**Scope:** Merge, deploy, monitor

### Tasks

#### 8.1 Pre-Merge Checklist

- [ ] All tests pass (`bun run test`)
- [ ] Type check passes (`bun run typecheck`)
- [ ] Lint passes (`bun run lint`)
- [ ] Build succeeds (`bun run build`)
- [ ] No TypeScript errors
- [ ] No console warnings in production build
- [ ] Bundle size acceptable (check with `bun run analyze` if available)

#### 8.2 Create Pull Request

**Title:** `feat: implement sticky header with 3-column layout (Solution B)`

**Description Template:**
```markdown
## Summary

Implements ChatGPT-aligned sticky header architecture while preserving StickToBottom auto-scroll functionality.

## Changes

- **Header positioning:** `fixed` → `sticky` inside scroll context
- **Header layout:** 2-section → 3-column with centered model selector
- **Header height:** 56px → 52px
- **Z-index:** 50 → 20
- **Viewport unit:** `h-dvh` → `h-svh`
- **Container queries:** Namespaced to `@container/main`

## Testing

- ✅ Desktop (Chrome, Firefox, Safari)
- ✅ Mobile (iOS Safari, Chrome Android)
- ✅ Accessibility (keyboard nav, screen reader)
- ✅ Multi-model mode
- ✅ Performance metrics

## Screenshots

[Attach before/after screenshots]

## Migration Notes

See `.agents/plans/sticky-header-migration-guide.md` for developer guidance.

## Breaking Changes

- Removed scroll compensation logic
- Changed header height affects layout calculations

## Closes

Closes #[ISSUE_NUMBER]
```

#### 8.3 Merge Strategy

**Recommended:** Squash and merge

**Commit Message:**
```
feat: implement sticky header with 3-column layout

Migrates header from fixed to sticky positioning to align with ChatGPT's
architecture. Preserves StickToBottom auto-scroll functionality.

Key changes:
- Header: fixed → sticky (z-index 50 → 20)
- Layout: 2-section → 3-column with centered model selector
- Height: 56px → 52px
- Viewport: h-dvh → h-svh
- Container queries: namespaced to @container/main

Tested on desktop and mobile browsers. Accessibility audit passed.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

#### 8.4 Deploy to Staging

1. Merge to `main`
2. Deploy to staging environment
3. Run smoke tests on staging
4. Verify no regressions

**Smoke Test Checklist:**
- [ ] Homepage loads
- [ ] Login/signup works
- [ ] Chat interface loads
- [ ] Send message works
- [ ] Model selector works
- [ ] Sidebar toggle works
- [ ] Mobile view works

#### 8.5 Monitor Production (if deployed)

**Metrics to watch (first 24 hours):**
- Error rate (should not increase)
- Page load time (should not regress)
- Bounce rate (watch for UX issues)
- User feedback (support tickets, Discord, etc.)

**Rollback Plan:**
If critical issues discovered:
1. Revert merge commit
2. Deploy reverted main to production
3. Create hotfix branch to address issues
4. Re-deploy after fixes

### Verification

- [ ] PR created and approved
- [ ] Merged to main
- [ ] Deployed to staging
- [ ] Smoke tests passed
- [ ] Production monitoring active (if applicable)
- [ ] No critical errors in first 24 hours

---

## Success Criteria

✅ **Functional Requirements:**
- Header uses sticky positioning inside scroll context
- Header has 3-column layout with centered model selector
- Model selector visible in single-model mode, hidden in multi-model mode
- Header height is 52px (consistent across all breakpoints)
- Opaque background (not transparent)
- Z-index is 20 (not 50)

✅ **Non-Functional Requirements:**
- StickToBottom auto-scroll still works
- No visual regressions
- No performance regressions
- No accessibility regressions
- Mobile browsers work correctly
- No console errors or warnings

✅ **Quality Gates:**
- All tests pass
- Type checking passes
- Lint passes
- Code review approved
- Documentation updated
- Deployment successful

---

## Rollback Plan

If critical issues are discovered post-deployment:

### Immediate Rollback (< 1 hour)

```bash
# Revert the merge commit
git revert [MERGE_COMMIT_SHA] -m 1

# Push to main
git push origin main

# Deploy reverted version
[deployment command]
```

### Analyze & Fix (1-24 hours)

1. Create hotfix branch: `hotfix/sticky-header-issue`
2. Reproduce issue locally
3. Fix issue
4. Test fix
5. Create new PR with fix
6. Merge and re-deploy

### Escalation Path

- **Minor issues:** Fix in next sprint
- **Major UX issues:** Hotfix within 24 hours
- **Critical bugs:** Immediate rollback + hotfix

---

## Agent Assignment Summary

| Phase | Agent Type | Model | Duration | Parallelizable |
|-------|-----------|-------|----------|----------------|
| 0: Preparation | Plan | Opus 4.6 | 2h | N/A |
| 1: CSS Foundation | Code | Opus 4.6 | 4h | No |
| 2: Layout Architecture | Code | Opus 4.6 | 6h | No |
| 3: Scroll Compensation | Code | Opus 4.6 | 4h | No |
| 4: Z-Index Audit | Code | Opus 4.6 | 4h | Yes (with Phase 5) |
| 5: Mobile Testing | Test | Opus 4.6 | 6h | Yes (with Phase 4) |
| 6: Integration Testing | Test | Opus 4.6 | 4h | No |
| 7: Code Review | Review | Opus 4.6 | 3h | No |
| 8: Deployment | DevOps | Opus 4.6 | 2h | No |

**Total Sequential Time:** ~35 hours (~4.5 days at 8h/day)
**With Parallelization:** ~30 hours (~4 days)

**Notes:**
- Phases 4 and 5 can run in parallel after Phase 3 completes
- Each phase has clear verification gates
- All agents use Opus 4.6 for maximum quality
- Rollback plan available at each checkpoint

---

## End of Plan

**Next Step:** Deploy agents to begin execution starting with Phase 0.
