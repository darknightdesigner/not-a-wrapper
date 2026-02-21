# Sticky Header Migration: Test Plan

**Date:** 2026-02-20
**Branch:** `feat/sticky-header-solution-b`
**Migration:** Header positioning `fixed` -> `sticky`, height `56px` -> `52px`, z-index `50` -> `20`

---

## A. Scroll Behavior Test Scenarios

### A1. Header Sticking Behavior

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 1 | Header sticks on scroll down | Load chat with messages > viewport height. Scroll down. | Header stays visible at top of viewport. Content scrolls underneath it. | [ ] |
| 2 | Header at top initially | Load any page (chat, home). | Header is flush with top of page, no gap above it. | [ ] |
| 3 | Header background is opaque | Scroll content behind header. | Header has solid `bg-background` -- text/content should NOT be visible through header. | [ ] |
| 4 | Header height is 52px | Inspect header element. | `height: 52px` at all viewport sizes. | [ ] |
| 5 | No content hidden behind header | Load chat with messages. Scroll to top. | First message is fully visible, not hidden behind the sticky header. No extra padding gap. | [ ] |
| 6 | Smooth scroll behavior | Scroll up and down rapidly. | No jank, flickering, or layout shifts. Header transitions smoothly. | [ ] |
| 7 | New chat (no messages) | Navigate to home page (no conversation). | Header visible at top. Onboarding content centered correctly below header. | [ ] |

### A2. StickToBottom Auto-Scroll

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 8 | Auto-scroll on new message (user scrolled to bottom) | Be at bottom of conversation. Send a message. Wait for AI response. | View automatically scrolls to keep latest content visible as response streams in. | [ ] |
| 9 | No auto-scroll when user scrolled up | Scroll up in conversation (not at bottom). Wait for AI response. | View does NOT auto-scroll. User stays at their scroll position. | [ ] |
| 10 | Auto-scroll resumes when user returns to bottom | After scenario #9, manually scroll back to bottom. Send another message. | Auto-scroll resumes for new streaming content. | [ ] |
| 11 | StickToBottom with long streaming response | Send a prompt that generates a very long response (1000+ tokens). | View smoothly auto-scrolls as content streams in. No jumps or stuttering. | [ ] |
| 12 | Scroll anchor min-height | Send first message in new chat. | The last message element has sufficient min-height (`min-h-scroll-anchor`) to push content into scroll territory for auto-scroll to engage. | [ ] |

### A3. Scroll-to-Bottom Button

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 13 | Button appears when scrolled up | In long conversation, scroll up so bottom is not visible. | Scroll-to-bottom button appears (circle with down arrow). | [ ] |
| 14 | Button disappears at bottom | Click scroll-to-bottom button or manually scroll to bottom. | Button fades out / disappears. | [ ] |
| 15 | Button click scrolls smoothly | Click the scroll-to-bottom button. | View smoothly scrolls to the bottom of conversation. | [ ] |
| 16 | Button z-index correct | Scroll up so button appears. Verify visual layering. | Button (z-10) renders below sticky header (z-20). When scrolling, button does not appear on top of header. | [ ] |

### A4. Composer Sticky Behavior

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 17 | Composer stays at bottom | Scroll through conversation. | Composer input area remains fixed at the bottom of the viewport. | [ ] |
| 18 | Composer above scroll content | Long conversation with many messages. | Composer never gets hidden behind messages. Input is always accessible. | [ ] |
| 19 | Composer z-index above messages | Scroll so messages are near the composer. | Messages scroll behind/under the composer, not on top of it. | [ ] |

---

## B. Mobile Test Matrix

### B1. iOS Safari

| # | Device/Version | Scenario | Steps | Expected Result | Status |
|---|----------------|----------|-------|-----------------|--------|
| 20 | iPhone 13 / Safari 15 | Address bar collapse | Load chat, scroll down slowly. | Safari address bar collapses. Header stays sticky at new viewport top. No layout jump. | [ ] |
| 21 | iPhone 13 / Safari 15 | Address bar expand | Scroll up to top. | Safari address bar re-expands. Header remains in correct position. `h-svh` prevents content jump that `h-dvh` would cause. | [ ] |
| 22 | iPhone 14 / Safari 16 | Sticky header + scroll | Load long conversation, scroll up and down. | Header sticks correctly. No rubber-banding artifacts. | [ ] |
| 23 | iPhone 15 / Safari 17 | Keyboard open | Tap on composer input. | Keyboard opens. Sticky header remains visible above content (or is pushed off-screen by keyboard -- either is acceptable). No layout breakage. | [ ] |
| 24 | iPhone 15 / Safari 17 | Notch / Dynamic Island | Verify header in landscape + portrait. | Header content does not overlap with notch / Dynamic Island. Safe area insets respected. | [ ] |
| 25 | iPhone 13 / Safari 15 | Pull-to-refresh | Pull down from top of page. | Safari's native pull-to-refresh (if enabled) does not conflict with sticky header. No double-bounce. | [ ] |
| 26 | iPhone 14 / Safari 16 | Gradient mask removed | Load chat on mobile. | No leftover gradient artifacts on mobile. Content is cleanly visible below sticky header. | [ ] |

### B2. Chrome Android

| # | Device/Version | Scenario | Steps | Expected Result | Status |
|---|----------------|----------|-------|-----------------|--------|
| 27 | Pixel / Chrome latest | Address bar behavior | Scroll down in chat. | Chrome address bar collapses. Sticky header stays at viewport top. | [ ] |
| 28 | Samsung Galaxy / Chrome | Touch scroll performance | Rapidly scroll through long conversation. | Smooth 60fps scrolling. No jank when header sticks/unsticks. | [ ] |
| 29 | Pixel / Chrome latest | Keyboard interaction | Tap composer input. | Keyboard opens without layout issues. Sticky header behavior correct. | [ ] |
| 30 | Samsung Galaxy / Chrome | Dropdown in header | Tap model selector (if visible on mobile). | Dropdown opens correctly above header. Positioned properly. | [ ] |

### B3. Mobile-Specific Interactions

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 31 | Hamburger menu (sidebar trigger) | On mobile with sidebar layout, tap hamburger icon. | Sidebar opens (sheet/drawer). Closes cleanly. Header state preserved after close. | [ ] |
| 32 | Touch on header links | Tap logo, tap login/signup buttons. | Navigation works correctly. No dead zones from `pointer-events-none`. | [ ] |
| 33 | Orientation change | Rotate device portrait -> landscape -> portrait while in chat. | Layout adjusts correctly. Header remains sticky. No content overflow. | [ ] |

---

## C. Accessibility Checkpoints

### C1. Keyboard Navigation

| # | Checkpoint | Steps | Expected Result | Status |
|---|------------|-------|-----------------|--------|
| 34 | Tab order through header | Press Tab from page start. | Focus moves through header items in logical order: Logo -> (Model selector if visible) -> Action buttons (right section). | [ ] |
| 35 | Tab order: left -> center -> right | Tab through authenticated header. | Focus sequence: Logo/Sidebar trigger -> Model selector dropdown trigger -> Publish/New Chat/History/User Menu. | [ ] |
| 36 | Focus visible on all elements | Tab through header. | Each focusable element shows a visible focus indicator (outline or ring). | [ ] |
| 37 | Dropdown opens with Enter/Space | Focus on model selector trigger, press Enter or Space. | Dropdown menu opens. | [ ] |
| 38 | Dropdown closes with Escape | Open dropdown, press Escape. | Dropdown closes. Focus returns to trigger element. | [ ] |
| 39 | Dropdown arrow navigation | Open dropdown, press Arrow Down/Up. | Focus moves between menu items. | [ ] |
| 40 | No focus traps | Tab through entire page. | Focus eventually exits the header and moves to main content. No infinite tab loop within header. | [ ] |
| 41 | Skip to content | Press Tab from the very start of the page. | If a skip-to-content link exists, it works correctly with the new sticky header positioning. | [ ] |
| 42 | Keyboard scroll still works | Focus on main content area, press Page Down, Space, Arrow Down. | Content scrolls. Sticky header remains in place. | [ ] |

### C2. Screen Reader Landmarks

| # | Checkpoint | Expected Result | Status |
|---|------------|-----------------|--------|
| 43 | Header landmark | Screen reader announces `<header>` as a banner landmark. | [ ] |
| 44 | Main content landmark | `<main>` element is properly announced. Header is a sibling or child depending on architecture. | [ ] |
| 45 | Model selector aria-label | Model selector trigger has an accessible name (e.g., `aria-label="Select model"` or visible text). | [ ] |
| 46 | Dropdown items readable | Screen reader can read all dropdown menu items with their labels. | [ ] |
| 47 | Button accessible names | All icon-only buttons in header have `aria-label` or visible text (New Chat, History, User Menu, etc.). | [ ] |
| 48 | Sticky position not confusing | Navigating with screen reader (VoiceOver on macOS, NVDA on Windows) does not produce confusing announcements due to sticky positioning. | [ ] |

### C3. Color Contrast

| # | Checkpoint | Expected Result | Status |
|---|------------|-----------------|--------|
| 49 | Header text (light mode) | All text in header meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text) against `bg-background`. | [ ] |
| 50 | Header text (dark mode) | Same as above for dark mode. | [ ] |
| 51 | Focus indicators | Focus outlines/rings meet 3:1 contrast ratio against adjacent colors. | [ ] |
| 52 | Model selector text | Model name text in the center selector is readable in both themes. | [ ] |

---

## D. Visual Regression Checkpoints

### D1. Screenshot Locations

Each screenshot should be captured at the following viewports:
- **Desktop:** 1440 x 900
- **Tablet:** 768 x 1024
- **Mobile:** 400 x 844

Each viewport should be captured in both **light mode** and **dark mode**.

### D2. Screenshot Scenarios

| # | Page State | Description | What to Compare | Acceptance Criteria |
|---|------------|-------------|-----------------|---------------------|
| S1 | Home (unauthenticated) | No user logged in, onboarding visible | Header shows logo + Login/Signup. Centered "What's on your mind?" text. | Header is 52px, opaque bg, correct button layout |
| S2 | Home (authenticated, no chat) | Logged in, no active chat | Header shows logo (if no sidebar) + model selector (center) + actions (right). Onboarding visible. | 3-column layout, model selector centered |
| S3 | Chat (authenticated, with messages) | Active conversation with messages, scrolled to top | Header sticky at top, first message visible below | No content hidden behind header, no padding gap |
| S4 | Chat (scrolled down) | Same chat, scrolled partway down | Header remains at top, scroll-to-bottom button visible | Header opaque, content scrolls underneath |
| S5 | Chat (at bottom) | Same chat, scrolled to bottom | Composer at bottom, last message visible, no scroll button | Auto-scroll territory correct |
| S6 | Multi-model mode | Multi-model enabled, comparison view | Header center empty (no model selector), response cards layout correct | No layout shift in header |
| S7 | Sidebar expanded | Sidebar visible (desktop) | Header and sidebar coexist. Logo hidden in header (sidebar has its own). | Sidebar z-index correct relative to header |
| S8 | Sidebar collapsed | Sidebar collapsed to rail | Header shows correctly, sidebar rail visible | No overlap issues |

### D3. Before/After Comparison Criteria

| Aspect | Acceptable Change | Unacceptable Regression |
|--------|-------------------|------------------------|
| Header height | 56px -> 52px (expected) | Any other height change |
| Header position | Fixed -> Sticky (expected) | Header not sticking, header disappearing on scroll |
| Header background | Transparent -> Opaque (expected) | Partially transparent, wrong color |
| Content top padding | ~80px -> ~16px (expected, `pt-20` -> `pt-4` or similar) | Content hidden behind header, large empty gap |
| Mobile gradient masks | Visible -> Removed (expected) | Artifacts remaining, visual glitches |
| Z-index layering | Dropdowns/tooltips above header | Dropdowns clipped by or appearing behind header |
| Scroll behavior | Identical auto-scroll | Broken StickToBottom, jumpy scroll, no auto-scroll |
| Model selector | Not in header -> Centered in header (expected) | Off-center, cut off, not clickable |
| Layout shifts | None on scroll | Content jumping when header sticks/unsticks |

---

## E. Theme-Specific Tests

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 53 | Light mode header bg | View header in light mode. | `bg-background` renders as white/light surface. Text is dark. Clear separation from content. | [ ] |
| 54 | Dark mode header bg | View header in dark mode. | `bg-background` renders as dark surface. Text is light. Clear separation from content. | [ ] |
| 55 | Theme switch mid-session | Switch from light to dark (or vice versa) while viewing a chat. | Header background updates immediately. No flash of wrong color. No layout shift. | [ ] |

---

## F. Multi-Model Mode Tests

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 56 | Header center empty | Enable multi-model mode. Open chat. | Header center section shows nothing (model selector hidden). Left and right sections still correct. | [ ] |
| 57 | Model selectors in composer | In multi-model mode. | Each chat input column has its own model selector. Header does not duplicate this. | [ ] |
| 58 | Toggle single/multi mode | Switch from single to multi-model mode. | Header updates: model selector appears/disappears from center section. No layout jump. | [ ] |
| 59 | Multi-model conversation scroll | In multi-model mode with messages. Scroll. | Header sticks. Response cards scroll underneath. Scroll-to-bottom button works. | [ ] |

---

## G. Edge Case Tests

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 60 | Very long message (1000+ lines) | Create or navigate to a chat with an extremely long message. | Header remains sticky throughout scroll. No performance degradation. | [ ] |
| 61 | Rapid scroll | Quickly flick-scroll through long conversation. | 60fps maintained. No header flickering. | [ ] |
| 62 | Window resize | Resize browser window while viewing chat. | Layout adjusts responsively. Header remains sticky. No overflow. | [ ] |
| 63 | Sidebar toggle during scroll | Be scrolled partway down. Toggle sidebar open/close. | Header adjusts width. No layout shift in scroll position. Content does not jump. | [ ] |
| 64 | Page navigation | Navigate from one chat to another. | Header persists (it's in the layout). Scroll resets to appropriate position for new chat. | [ ] |
| 65 | Browser back/forward | Use browser back/forward buttons between chats. | Header and scroll state correct on each navigation. | [ ] |
| 66 | Empty chat with suggestions | View home page with prompt suggestions enabled. | Suggestions render correctly below header. No overlap. | [ ] |
| 67 | File upload drag-and-drop | Drag a file over the chat area. | File upload overlay (z-50) appears above the sticky header. | [ ] |
| 68 | Dialog opens from header | Click Publish button (or similar) in header. | Dialog opens (z-50, portaled). Appears above sticky header and all content. Backdrop covers everything. | [ ] |

---

## H. Performance Benchmarks

| Metric | Baseline (Before) | Target (After) | Tool |
|--------|-------------------|----------------|------|
| Time to Interactive (TTI) | Measure before | No regression (within 100ms) | Chrome DevTools / Lighthouse |
| Largest Contentful Paint (LCP) | Measure before | No regression (within 100ms) | Lighthouse |
| Cumulative Layout Shift (CLS) | Measure before | Improved or equal | Lighthouse |
| Scroll frame rate | 60fps | 60fps | Chrome DevTools Performance tab |
| Memory usage | Measure before | No increase > 5% | Chrome DevTools Memory tab |

---

## I. Test Execution Checklist

### Pre-Test Setup
- [ ] Feature branch checked out and up-to-date
- [ ] `bun install` completed
- [ ] Dev server running (`bun run dev`)
- [ ] Baseline screenshots captured (pre-migration)

### Test Execution Order
1. **Functional tests** (A1-A4) -- Core scroll and header behavior
2. **Desktop visual regression** (D1-D3) -- Screenshot comparison
3. **Keyboard accessibility** (C1) -- Tab order and focus
4. **Screen reader** (C2) -- Landmark verification
5. **Mobile Safari** (B1) -- iOS-specific behavior
6. **Mobile Chrome** (B2) -- Android-specific behavior
7. **Multi-model mode** (F) -- Feature-specific tests
8. **Edge cases** (G) -- Unusual scenarios
9. **Performance** (H) -- Benchmarks
10. **Theme tests** (E) -- Light/dark mode

### Post-Test
- [ ] All critical tests pass (A1-A4, C1, D)
- [ ] All mobile tests pass (B)
- [ ] No accessibility regressions (C)
- [ ] Performance benchmarks within targets (H)
- [ ] Screenshots captured and saved to `.agents/plans/baseline-screenshots/`
