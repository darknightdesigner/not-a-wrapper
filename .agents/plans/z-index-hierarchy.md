# Z-Index Hierarchy (Post-Sticky Header Migration)

**Last Updated:** 2026-02-20
**Branch:** `feat/sticky-header-solution-b`
**Commit:** `daad2bd`

---

## Overview

After migrating the header from `position: fixed; z-index: 50` to `position: sticky; z-index: 20`, this document maintains the complete z-index hierarchy for the application. The header was intentionally lowered to z-20 so that all portal-based UI (dropdowns, tooltips, dialogs) renders above it at z-50 without any conflicts.

**Key invariant:** All portal-based components render to `document.body` via Base UI primitives or React `createPortal`, placing them outside the main scroll context and above the sticky header.

---

## Current Hierarchy

### Layer 1: Toast Notifications (z-9999)

| Component | File | z-index | Position Context | Portal Method |
|-----------|------|---------|------------------|---------------|
| Sonner Toaster | `components/ui/sonner.tsx` | 9999 (inline style, Sonner default) | `document.body` (rendered in `app/layout.tsx`) | Sonner internal |

### Layer 2: Modals & Full-Screen Overlays (z-50, fixed)

| Component | File | z-index | Position Context | Portal Method |
|-----------|------|---------|------------------|---------------|
| Dialog overlay | `components/ui/dialog.tsx:47` | z-50 (fixed) | `document.body` | `DialogPrimitive.Portal` |
| Dialog content | `components/ui/dialog.tsx:73` | z-50 (fixed) | `document.body` | `DialogPrimitive.Portal` |
| AlertDialog overlay | `components/ui/alert-dialog.tsx:39` | z-50 (fixed) | `document.body` | `AlertDialogPrimitive.Portal` |
| AlertDialog content | `components/ui/alert-dialog.tsx:60` | z-50 (fixed) | `document.body` | `AlertDialogPrimitive.Portal` |
| Sheet overlay | `components/ui/sheet.tsx:40` | z-50 (fixed) | `document.body` | `SheetPrimitive.Portal` |
| Sheet content | `components/ui/sheet.tsx:63` | z-50 (fixed) | `document.body` | `SheetPrimitive.Portal` |
| Drawer overlay | `components/ui/drawer.tsx:44` | z-50 (fixed) | `document.body` | `DrawerPrimitive.Portal` |
| Drawer content | `components/ui/drawer.tsx:66` | z-50 (fixed) | `document.body` | `DrawerPrimitive.Portal` |
| MorphingDialog container | `components/ui/morphing-dialog.tsx:257` | z-50 (fixed) | `document.body` | `createPortal(content, document.body)` |
| MorphingDialog (motion) | `components/motion-primitives/morphing-dialog.tsx:257` | z-50 (fixed) | `document.body` | `createPortal(content, document.body)` |
| FileUpload overlay | `components/ui/file-upload.tsx:173` | z-50 (fixed) | `document.body` | `createPortal(content, document.body)` |

### Layer 3: Floating UI -- Dropdowns, Tooltips, Popovers, Selects (z-50, portaled)

| Component | File | z-index | Position Context | Portal Method |
|-----------|------|---------|------------------|---------------|
| DropdownMenu positioner | `components/ui/dropdown-menu.tsx:52` | z-50 (isolate) | `document.body` | `MenuPrimitive.Portal` |
| DropdownMenu popup | `components/ui/dropdown-menu.tsx:57` | z-50 | `document.body` | `MenuPrimitive.Portal` |
| Select positioner | `components/ui/select.tsx:80` | z-50 (isolate) | `document.body` | `SelectPrimitive.Portal` |
| Select popup | `components/ui/select.tsx:85` | z-50 | `document.body` | `SelectPrimitive.Portal` |
| Popover positioner | `components/ui/popover.tsx:37` | z-50 (isolate) | `document.body` | `PopoverPrimitive.Portal` |
| Popover popup | `components/ui/popover.tsx:42` | z-50 | `document.body` | `PopoverPrimitive.Portal` |
| Tooltip positioner | `components/ui/tooltip.tsx:69` | z-50 (isolate) | `document.body` | `TooltipPrimitive.Portal` |
| Tooltip popup | `components/ui/tooltip.tsx:74` | z-50 | `document.body` | `TooltipPrimitive.Portal` |
| Tooltip arrow | `components/ui/tooltip.tsx:81` | z-50 | `document.body` | `TooltipPrimitive.Portal` |
| HoverCard positioner | `components/ui/hover-card.tsx:36` | z-50 (isolate) | `document.body` | `HoverCardPrimitive.Portal` |
| HoverCard popup | `components/ui/hover-card.tsx:41` | z-50 | `document.body` | `HoverCardPrimitive.Portal` |
| ContextMenu content | `components/ui/context-menu.tsx:128` | z-50 | `document.body` | `ContextMenuPrimitive.Portal` |
| ContextMenu sub-content | `components/ui/context-menu.tsx:107` | z-50 | `document.body` | `ContextMenuPrimitive.Portal` |
| Menubar content | `components/ui/menubar.tsx:94,267` | z-50 | `document.body` | `MenuPrimitive.Portal` |
| NavigationMenu | `components/ui/navigation-menu.tsx:118` | z-50 (isolate) | In-flow | N/A |

### Layer 4: Fixed Application Widgets (z-50, fixed)

| Component | File | z-index | Position Context | Notes |
|-----------|------|---------|------------------|-------|
| Feedback widget | `app/components/chat/feedback-widget.tsx:38` | z-50 (fixed) | Viewport bottom-right | Independent of scroll context |
| Cursor (motion) | `components/motion-primitives/cursor.tsx:103` | z-50 (fixed) | Viewport | Animated cursor overlay |
| Share page CTA | `app/share/[chatId]/article.tsx:61` | z-50 (fixed) | Viewport | Separate page, out of scope |

### Layer 5: In-Flow z-50 Components (inside scroll context)

| Component | File | z-index | Position Context | Notes |
|-----------|------|---------|------------------|-------|
| Chat input container | `app/components/chat/chat.tsx:288` | z-50 | Inside main scroll context | Relative; above messages, below portals |
| Multi-chat input container | `app/components/multi-chat/multi-chat.tsx:742` | z-50 | Inside main scroll context | Same as above |
| Project view input container | `app/p/[projectId]/project-view.tsx:499` | z-50 | Inside main scroll context | Same as above |
| Quote button | `app/components/chat/quote-button.tsx:42` | z-50 | Absolute within message | Text selection action |

### Layer 6: Sidebar Layers (isolated DOM context)

| Component | File | z-index | Position Context | Notes |
|-----------|------|---------|------------------|-------|
| Sidebar footer separator | `app/components/layout/sidebar/app-sidebar.tsx:320` | z-40 | Inside sidebar scroll | Fade line above footer |
| Sidebar sticky header | `app/components/layout/sidebar/app-sidebar.tsx:180` | z-30 | Inside sidebar scroll | Sticky within sidebar nav |
| Sidebar sticky footer | `app/components/layout/sidebar/app-sidebar.tsx:339` | z-30 | Inside sidebar scroll | User menu area |
| Sidebar rail | `components/ui/sidebar.tsx:329` | z-20 | Absolute on sidebar edge | Resize handle; sibling DOM context to header |
| Sidebar sticky actions | `app/components/layout/sidebar/app-sidebar.tsx:224` | z-20 | Inside sidebar scroll | Action buttons |
| Sidebar container | `components/ui/sidebar.tsx:256` | z-10 | Fixed, separate from main | Sidebar shell |
| Collapsed rail overlay | `app/components/layout/sidebar/app-sidebar.tsx:80` | z-10 | Inside sidebar | Collapsed state |
| Scroll shadow top | `app/components/layout/sidebar/scroll-shadow-wrapper.tsx:53` | z-10 | Inside sidebar scroll | Fade indicator |
| Scroll shadow bottom | `app/components/layout/sidebar/scroll-shadow-wrapper.tsx:66` | z-10 | Inside sidebar scroll | Fade indicator |

### Layer 7: Sticky Header (z-20)

| Component | File | z-index | Position Context | Notes |
|-----------|------|---------|------------------|-------|
| **Header (sticky)** | `app/components/layout/header.tsx:26` | **z-20** | Inside `<main>` scroll context | Sticks to top of scrollable main area |

### Layer 8: In-Flow Elevated Components (z-10)

| Component | File | z-index | Position Context | Notes |
|-----------|------|---------|------------------|-------|
| ChatContainerScrollButton | `components/ui/chat-container.tsx:78` | z-10 | Inside chat scroll | Correctly below header z-20 |
| PromptInput (chat) | `app/components/chat-input/chat-input.tsx:231` | z-10 | Inside input container | Surface elevation |
| PromptInput (multi-chat) | `app/components/multi-chat/multi-chat-input.tsx:138` | z-10 | Inside input container | Surface elevation |
| File remove button | `app/components/chat-input/file-items.tsx:103` | z-10 | Inside file attachment | Close button |
| Message image trigger | `app/components/chat/message-user.tsx:159` | z-10 | Inside message | MorphingDialogTrigger |
| Resizable handle | `components/ui/resizable.tsx:49` | z-10 | Panel boundary | Resize handle |
| AnimatedBackground | `components/motion-primitives/animated-background.tsx:92` | z-10 | Background layer | Animation |
| ToggleGroup focus | `components/ui/toggle-group.tsx:73` | z-10 | Focus ring | UI detail |
| Model selector sticky search | `components/common/model-selector/base.tsx:492` | z-10 | Inside popover/dropdown | Sticky search header |
| Multi-model selector sticky search | `components/common/multi-model-selector/base.tsx:421` | z-10 | Inside popover/dropdown | Sticky search header |

### Layer 9: Base Content (z-0 / default)

Messages, thread content, page elements -- no explicit z-index.

---

## Hierarchy Summary (Visual)

```
z-9999  Toasts (Sonner)
  |
z-50    Modals (Dialog, AlertDialog, Sheet, Drawer, MorphingDialog)
z-50    FileUpload drag overlay (portaled to body)
z-50    Floating UI (DropdownMenu, Select, Popover, Tooltip, HoverCard, ContextMenu)
z-50    Fixed widgets (Feedback, Cursor)
z-50    In-flow composers (relative, inside scroll -- no visual conflict with portals)
  |
z-40    Sidebar footer separator (sidebar context only)
z-30    Sidebar sticky header/footer (sidebar context only)
  |
z-20    STICKY HEADER (inside <main> scroll context)
z-20    Sidebar rail (absolute, sibling DOM context -- no overlap)
z-20    Sidebar sticky actions (sidebar context only)
  |
z-10    Scroll-to-bottom button (inside chat scroll)
z-10    PromptInput surfaces, file buttons, animations
z-10    Sidebar container, scroll shadows
  |
z-0     Default content (messages, page elements)
```

---

## Conflict Analysis

### Verified Non-Conflicts

| Relationship | Reasoning |
|-------------|-----------|
| Header (z-20) vs Dropdowns (z-50) | Dropdowns portal to `document.body`, completely outside the main scroll stacking context. z-50 > z-20 guaranteed. |
| Header (z-20) vs Tooltips (z-50) | Same portal mechanism as dropdowns. Always above header. |
| Header (z-20) vs Dialogs (z-50 fixed) | Dialogs use `position: fixed` with portals. Always above everything in-flow. |
| Header (z-20) vs Toasts (z-9999) | Sonner uses inline style z-index 9999. Renders at root layout level. Always topmost. |
| Header (z-20) vs Sidebar rail (z-20) | Both at z-20 but in sibling DOM contexts. The sidebar is a `fixed` element separate from `<main>`. They never visually overlap because they occupy different screen regions. |
| Header (z-20) vs Scroll button (z-10) | Scroll button at z-10 correctly renders below sticky header at z-20. Desired behavior -- scroll button should not overlap header. |
| Header (z-20) vs Chat input containers (z-50) | Input containers are z-50 but relative within the same scroll context. Since the input is at the bottom of the scroll area and the header sticks to the top, they do not overlap. If they did, the input (z-50) would correctly layer above the header (z-20). |

### Share Page (Out of Scope)

The share page header at `app/share/[chatId]/header.tsx` still uses `fixed top-0 z-50`. This is a separate layout context and was intentionally left unchanged in this migration.

---

## Test Results

Tested on 2026-02-20 at commit `daad2bd`

### Portal Component Verification

| Component | Expected z-index | Portal Target | Layering Relative to Header | Status |
|-----------|-----------------|---------------|---------------------------|--------|
| Model selector dropdown (DropdownMenu) | z-50 | `document.body` via `MenuPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| Model selector drawer (mobile) | z-50 | `document.body` via `DrawerPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| User menu (DropdownMenu) | z-50 | `document.body` via `MenuPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| Dialog (publish, auth, settings) | z-50 fixed | `document.body` via `DialogPrimitive.Portal` | Above header (fixed z-50 > sticky z-20) | PASS |
| AlertDialog (confirmations) | z-50 fixed | `document.body` via `AlertDialogPrimitive.Portal` | Above header (fixed z-50 > sticky z-20) | PASS |
| Sheet (panels) | z-50 fixed | `document.body` via `SheetPrimitive.Portal` | Above header (fixed z-50 > sticky z-20) | PASS |
| Drawer (mobile panels) | z-50 fixed | `document.body` via `DrawerPrimitive.Portal` | Above header (fixed z-50 > sticky z-20) | PASS |
| Tooltip (button hints) | z-50 | `document.body` via `TooltipPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| Popover (auth fallback) | z-50 | `document.body` via `PopoverPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| Select (form selects) | z-50 | `document.body` via `SelectPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| ContextMenu (right-click) | z-50 | `document.body` via `ContextMenuPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| HoverCard | z-50 | `document.body` via `HoverCardPrimitive.Portal` | Above header (z-50 > z-20) | PASS |
| FileUpload overlay | z-50 fixed | `document.body` via `createPortal` | Above header (fixed z-50 > sticky z-20) | PASS |
| MorphingDialog | z-50 fixed | `document.body` via `createPortal` | Above header (fixed z-50 > sticky z-20) | PASS |
| Sonner toasts | z-9999 | Root layout body | Above everything | PASS |

### Structural Verification (Code Audit)

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Header uses `sticky top-0 z-20` | `sticky top-0 z-20` | `sticky top-0 z-20` in `header.tsx:26` | PASS |
| Header background is opaque | `bg-background` | `bg-background` in `header.tsx:26` | PASS |
| All Base UI portals render to body | Default portal behavior | All use `.Portal` without custom container | PASS |
| All `createPortal` calls target body | `document.body` | `file-upload.tsx:186`, `morphing-dialog.tsx:246,257` | PASS |
| No dropdown/tooltip clipping by scroll container | Portals escape scroll context | Portals render outside `<main>` overflow | PASS |
| Scroll button (z-10) below header (z-20) | z-10 < z-20 | `chat-container.tsx:78` uses z-10 | PASS |
| Sidebar and header in separate stacking contexts | Different DOM parents | Sidebar is fixed sibling; header is sticky inside `<main>` | PASS |

### Model Selector Header (New Component) Verification

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Uses shared `ModelSelector` component | Inherits dropdown portal behavior | Imports from `components/common/model-selector/base.tsx` | PASS |
| Desktop: DropdownMenu portals to body | z-50 via `MenuPrimitive.Portal` | Uses `DropdownMenuContent` which wraps `MenuPrimitive.Portal` | PASS |
| Mobile: Drawer portals to body | z-50 via `DrawerPrimitive.Portal` | Uses `DrawerContent` which wraps `DrawerPrimitive.Portal` | PASS |
| Auth fallback: Popover portals to body | z-50 via `PopoverPrimitive.Portal` | Uses `PopoverContentAuth` which wraps portal | PASS |
| No custom portal container needed | Default behavior sufficient | No `container` prop overrides | PASS |

---

## Known Issues

**None detected.** All portal-based components correctly render above the sticky header. No z-index conflicts exist between the header and any other UI layer.

---

## Maintenance Guidelines

### When Adding New UI Components

1. **Portal-based components (dialogs, dropdowns, tooltips, popovers):**
   - Use the Base UI primitive's default `.Portal` -- it renders to `document.body` automatically.
   - Use `z-50` for the positioner/popup (consistent with all existing floating UI).
   - No special handling needed to layer above the sticky header.

2. **In-flow overlays (inside the main scroll context):**
   - Check against the header at z-20.
   - If the overlay should appear above the header, use z-30 or higher.
   - If it should appear below, use z-10 or lower.

3. **Fixed-position widgets:**
   - Use z-50 for viewport-fixed elements (matches existing feedback widget pattern).
   - These are independent of the scroll context and always above the sticky header.

4. **Sidebar components:**
   - Sidebar uses its own isolated stacking context (z-10 to z-40).
   - Sidebar and main content do not share stacking contexts, so z-index values are independent.

### When Changing Header z-index

If the header z-index needs to change from 20:
- **Increasing to z-30+:** Check sidebar rail (z-20) for overlap at the boundary.
- **Increasing to z-50:** This would conflict with portal-based floating UI. Avoid this.
- **Decreasing below z-10:** Scroll button and PromptInput surfaces (z-10) would layer above the header.

### Document Updates

Add new z-index entries to this document when:
- A new component with an explicit z-index is created.
- An existing component's z-index changes.
- A new portal-based component is added.
- A new fixed-position widget is added.
