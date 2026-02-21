# Sticky Header Migration: Dependency Analysis

**Date:** 2026-02-20
**Branch:** `feat/sticky-header-solution-b`
**Purpose:** Identify all code dependencies affected by the fixed-to-sticky header migration

---

## A. Uses of `--spacing-app-header` CSS Variable

| File | Line | Usage | Notes |
|------|------|-------|-------|
| `app/globals.css` | 50 | `--spacing-app-header: 56px;` | **Definition** in `@theme` block. Will change to `52px`. |
| `app/globals.css` | 202-203 | `--spacing-scroll-area: calc(-1 * (var(--spacing-input-area) + var(--spacing-app-header)))` | Scroll area calculation. Uses header height in the formula. **Must be updated** when header becomes sticky (header no longer takes space from scroll area in the same way). |
| `app/globals.css` | 205-208 | `--spacing-scroll-anchor: calc(var(--spacing-scroll-area) - var(--spacing-scroll-anchor-offset) + 100dvh)` | Derived from `--spacing-scroll-area`. Indirectly depends on header height. Used for message scroll anchor positioning. |

**Impact Summary:** Only `app/globals.css` references this variable directly. The scroll-area calculation is the critical dependency -- with a sticky header inside the scroll context, the header no longer needs to be subtracted from the viewport height for scroll calculations.

---

## B. Uses of `h-app-header` Tailwind Class

| File | Line | Usage Context | Impact |
|------|------|---------------|--------|
| `app/components/layout/header.tsx` | 28 | `<header className="h-app-header pointer-events-none fixed top-0 right-0 left-0 z-50">` | **Primary target.** Will change to `sticky top-0 z-20`. |
| `app/components/chat/conversation.tsx` | 73 | `<div className="h-app-header bg-background flex w-full lg:hidden lg:h-0" />` | **Gradient mask spacer.** Part of the fixed-header compensation. Will be **removed** with sticky header. |
| `app/components/chat/conversation.tsx` | 74 | `<div className="h-app-header bg-background flex w-full mask-b-from-4% mask-b-to-100% lg:hidden" />` | **Gradient mask overlay.** Mobile-only visual fix for fixed header. Will be **removed** with sticky header. |
| `app/share/[chatId]/header.tsx` | 6 | `<header className="h-app-header fixed top-0 right-0 left-0 z-50">` | **Share page header.** Separate page, not part of the main app layout. **May or may not be updated** depending on scope. |
| `app/share/[chatId]/header.tsx` | 7 | `<div className="h-app-header top-app-header bg-background pointer-events-none absolute left-0 z-50 ...">` | Share page gradient mask. Same scope consideration as above. |

**Impact Summary:** The main header and conversation component are the critical files. The share page has its own independent header that may be updated separately or left as-is (it uses a different layout pattern).

---

## C. All Components with Z-Index Values

### Application Components (Source Code)

| Component | File | Z-Index | Current Purpose | Conflicts with Header z-20? |
|-----------|------|---------|-----------------|----------------------------|
| **Header** | `app/components/layout/header.tsx:28` | `z-50` | Fixed header above all content | **Will change to z-20** |
| **Conversation gradient masks** | `app/components/chat/conversation.tsx:72` | `z-10` | Gradient overlay on mobile | No (will be removed) |
| **Chat input container** | `app/components/chat/chat.tsx:288` | `z-50` | Composer above scroll content | No -- inside scroll context, z-50 is fine relative to messages |
| **Multi-chat input container** | `app/components/multi-chat/multi-chat.tsx:742` | `z-50` | Multi-model composer | No -- same context as above |
| **Project view input container** | `app/p/[projectId]/project-view.tsx:499` | `z-50` | Project chat composer | No -- same context as above |
| **Feedback widget** | `app/components/chat/feedback-widget.tsx:38` | `z-50` (fixed) | Help button bottom-right corner | No -- fixed to viewport, independent |
| **Quote button** | `app/components/chat/quote-button.tsx:42` | `z-50` | Floating quote action on text selection | No -- absolute positioned within message |
| **Share page header** | `app/share/[chatId]/header.tsx:6-7` | `z-50` | Fixed header on share pages | No -- separate page |
| **Share page CTA** | `app/share/[chatId]/article.tsx:61` | `z-50` (fixed) | "Try it" button on share pages | No -- separate page |
| **Multi-chat input PromptInput** | `app/components/multi-chat/multi-chat-input.tsx:138` | `z-10` | PromptInput surface | No |
| **Chat input PromptInput** | `app/components/chat-input/chat-input.tsx:231` | `z-10` | PromptInput surface | No |
| **File remove button** | `app/components/chat-input/file-items.tsx:103` | `z-10` | Close button on file attachment | No |
| **Message image trigger** | `app/components/chat/message-user.tsx:159` | `z-10` | MorphingDialogTrigger on image | No |

### Sidebar Components

| Component | File | Z-Index | Current Purpose | Conflicts with Header z-20? |
|-----------|------|---------|-----------------|----------------------------|
| **Sidebar container** | `components/ui/sidebar.tsx:256` | `z-10` | Fixed sidebar container | No -- below header |
| **Sidebar rail** | `components/ui/sidebar.tsx:329` | `z-20` | Resize handle between sidebar and main | Potential overlap with header. Both at z-20 but in different DOM contexts (sidebar vs main). |
| **Collapsed rail overlay** | `app/components/layout/sidebar/app-sidebar.tsx:80` | `z-10` | Collapsed sidebar rail | No |
| **Sidebar sticky header** | `app/components/layout/sidebar/app-sidebar.tsx:180` | `z-30` | Sticky header inside sidebar nav | No -- inside sidebar scroll context |
| **Sidebar sticky actions** | `app/components/layout/sidebar/app-sidebar.tsx:224` | `z-20` | Action buttons in sidebar | No -- inside sidebar scroll context |
| **Sidebar footer separator** | `app/components/layout/sidebar/app-sidebar.tsx:320` | `z-40` | Fade line above footer | No -- inside sidebar scroll context |
| **Sidebar sticky footer** | `app/components/layout/sidebar/app-sidebar.tsx:339` | `z-30` | User menu in sidebar | No -- inside sidebar scroll context |
| **Scroll shadow top** | `app/components/layout/sidebar/scroll-shadow-wrapper.tsx:53` | `z-10` | Scroll fade indicator | No |
| **Scroll shadow bottom** | `app/components/layout/sidebar/scroll-shadow-wrapper.tsx:66` | `z-10` | Scroll fade indicator | No |

### UI Library Components (Shadcn/Base UI Primitives)

| Component | File | Z-Index | Purpose | Conflicts with Header z-20? |
|-----------|------|---------|---------|----------------------------|
| **Dialog overlay** | `components/ui/dialog.tsx:47` | `z-50` (fixed) | Modal backdrop | No -- portaled to body, above everything |
| **Dialog content** | `components/ui/dialog.tsx:73` | `z-50` (fixed) | Modal content | No -- portaled to body |
| **AlertDialog overlay** | `components/ui/alert-dialog.tsx:39` | `z-50` (fixed) | Alert backdrop | No -- portaled to body |
| **AlertDialog content** | `components/ui/alert-dialog.tsx:60` | `z-50` (fixed) | Alert content | No -- portaled to body |
| **Sheet overlay** | `components/ui/sheet.tsx:40` | `z-50` (fixed) | Side panel backdrop | No -- portaled to body |
| **Sheet content** | `components/ui/sheet.tsx:63` | `z-50` (fixed) | Side panel content | No -- portaled to body |
| **Drawer overlay** | `components/ui/drawer.tsx:44` | `z-50` (fixed) | Drawer backdrop | No -- portaled to body |
| **Drawer content** | `components/ui/drawer.tsx:66` | `z-50` (fixed) | Drawer content | No -- portaled to body |
| **DropdownMenu positioner** | `components/ui/dropdown-menu.tsx:52` | `z-50` | Dropdown positioning layer | No -- portaled via Base UI |
| **DropdownMenu content** | `components/ui/dropdown-menu.tsx:57` | `z-50` | Dropdown menu items | No -- portaled via Base UI |
| **Select positioner** | `components/ui/select.tsx:80` | `z-50` | Select positioning layer | No -- portaled via Base UI |
| **Select content** | `components/ui/select.tsx:85` | `z-50` | Select options | No -- portaled via Base UI |
| **ContextMenu content** | `components/ui/context-menu.tsx:107,128` | `z-50` | Right-click menu | No -- portaled via Base UI |
| **Tooltip positioner** | `components/ui/tooltip.tsx:69` | `z-50` | Tooltip positioning | No -- portaled via Base UI |
| **Tooltip content** | `components/ui/tooltip.tsx:74` | `z-50` | Tooltip text | No -- portaled via Base UI |
| **Tooltip arrow** | `components/ui/tooltip.tsx:81` | `z-50` | Tooltip arrow | No -- portaled via Base UI |
| **Popover positioner** | `components/ui/popover.tsx:37` | `z-50` | Popover positioning | No -- portaled via Base UI |
| **Popover content** | `components/ui/popover.tsx:42` | `z-50` | Popover content | No -- portaled via Base UI |
| **HoverCard positioner** | `components/ui/hover-card.tsx:36` | `z-50` | Hover card positioning | No -- portaled via Base UI |
| **HoverCard content** | `components/ui/hover-card.tsx:41` | `z-50` | Hover card content | No -- portaled via Base UI |
| **Menubar content** | `components/ui/menubar.tsx:94,267` | `z-50` | Menubar dropdowns | No -- portaled via Base UI |
| **NavigationMenu** | `components/ui/navigation-menu.tsx:118` | `z-50` | Nav menu positioning | No -- portaled via Base UI |
| **FileUpload overlay** | `components/ui/file-upload.tsx:173` | `z-50` (fixed) | Drag-and-drop overlay | No -- portaled to body via createPortal |
| **MorphingDialog** | `components/ui/morphing-dialog.tsx:257` | `z-50` (fixed) | Morphing dialog overlay | No -- portaled to body via createPortal |
| **MorphingDialog (motion)** | `components/motion-primitives/morphing-dialog.tsx:257` | `z-50` (fixed) | Motion morphing dialog | No -- portaled to body via createPortal |
| **Cursor** | `components/motion-primitives/cursor.tsx:103` | `z-50` (fixed) | Animated cursor | No -- fixed positioned |
| **ChatContainerScrollButton** | `components/ui/chat-container.tsx:78` | `z-10` | Scroll-to-bottom button | No -- inside scroll context, below header z-20 |
| **Resizable handle** | `components/ui/resizable.tsx:49` | `z-10` | Panel resize handle | No |
| **AnimatedBackground** | `components/motion-primitives/animated-background.tsx:92` | `z-10` | Background animation layer | No |
| **ToggleGroup focus** | `components/ui/toggle-group.tsx:73` | `z-10` | Focus ring elevation | No |
| **Model selector sticky** | `components/common/model-selector/base.tsx:492` | `z-10` | Sticky search header in selector | No -- inside popover |
| **Multi-model selector sticky** | `components/common/multi-model-selector/base.tsx:421` | `z-10` | Sticky search header in selector | No -- inside popover |

### Z-Index Hierarchy Summary (Post-Migration)

```
z-50  Modals (Dialog, AlertDialog, Sheet, Drawer, MorphingDialog)
z-50  File upload overlay (portaled to body)
z-50  Feedback widget (fixed, bottom-right)
z-50  Tooltips, Popovers, Dropdowns, Selects (portaled via Base UI)
z-50  Chat input containers (relative within main scroll context)
z-50  Quote button (absolute within message)
z-20  Header (STICKY -- inside main scroll context) [NEW]
z-20  Sidebar rail (absolute, different DOM context)
z-10  Scroll-to-bottom button (inside scroll context)
z-10  PromptInput surface
z-0   Default content (messages, etc.)
```

**Potential Issues:**
1. The ChatContainerScrollButton at `z-10` will render below the sticky header at `z-20`, which is correct -- scroll button should not overlap the header.
2. The sidebar rail at `z-20` is in a sibling DOM context to the header. They do not overlap visually since the sidebar is a separate fixed-positioned container.
3. All portal-based components (dropdowns, tooltips, dialogs) render at `z-50` via portals to `document.body`, so they will always appear above the sticky header.

---

## D. Scroll Offset Calculations

### CSS Variable-Based Calculations

| File | Lines | Calculation | Purpose | Impact |
|------|-------|-------------|---------|--------|
| `app/globals.css` | 202-203 | `--spacing-scroll-area: calc(-1 * (var(--spacing-input-area) + var(--spacing-app-header)))` | Calculates negative offset for scroll area height. Subtracts both input area and header from viewport. | **Must update.** With sticky header inside the scroll context, the header height should no longer be subtracted here. |
| `app/globals.css` | 205-208 | `--spacing-scroll-anchor: calc(var(--spacing-scroll-area) - var(--spacing-scroll-anchor-offset) + 100dvh)` | Scroll anchor min-height for auto-scroll behavior. Depends on `--spacing-scroll-area`. | **Cascading update** from scroll-area change. Also `100dvh` should become `100svh` per plan. |

### JavaScript Scroll Logic

| File | Lines | Logic | Purpose | Impact |
|------|-------|-------|---------|--------|
| `app/hooks/use-scroll-attributes.ts` | 35-45 | `scrollTop`, `scrollHeight`, `clientHeight` comparisons | Zero-rerender scroll state tracking for sidebar CSS indicators | No impact -- used only in sidebar scroll context |
| `app/components/layout/sidebar/scroll-shadow-wrapper.tsx` | 28-31 | Same scroll position tracking | Scroll shadow fade indicators | No impact -- sidebar only |
| `app/components/history/chat-preview-panel.tsx` | 215 | `scrollTop = scrollHeight` | Auto-scroll to bottom of preview | No impact -- history panel only |
| `app/components/chat/message-user.tsx` | 107, 129 | `savedScrollTopRef / scrollTop` preservation | Preserves scroll position during message edit | Potential impact -- if scroll container changes, scroll position save/restore may need adjustment. **Verify during testing.** |

### Scroll Compensation (Padding for Fixed Header)

| File | Line | Compensation | Impact |
|------|------|--------------|--------|
| `app/components/chat/conversation.tsx` | 78 | `pt-20` (80px top padding) | **Must be removed or reduced.** Currently compensates for the fixed header overlapping content. With sticky header inside scroll flow, this padding is unnecessary. |
| `app/components/multi-chat/multi-conversation.tsx` | 156 | `pt-20` (80px top padding) | **Must be removed or reduced.** Same compensation for multi-model conversation view. |
| `app/components/chat/conversation.tsx` | 72-75 | Gradient mask divs with `h-app-header` | **Must be removed.** These mobile gradient overlays compensate for fixed header. No longer needed with sticky header. |

---

## E. Portal-Based UI Components

All portal-based components render outside the main scroll context (typically to `document.body`), so they are not affected by the sticky header change. However, they must be verified to ensure they still appear above the header.

### Components Using Base UI Portal

| Component | File | Portal Method | Z-Index | Potential Conflict? |
|-----------|------|---------------|---------|---------------------|
| Dialog | `components/ui/dialog.tsx` | `DialogPrimitive.Portal` | z-50 (fixed) | No -- always above header |
| AlertDialog | `components/ui/alert-dialog.tsx` | `AlertDialogPrimitive.Portal` | z-50 (fixed) | No |
| Sheet | `components/ui/sheet.tsx` | `SheetPrimitive.Portal` | z-50 (fixed) | No |
| Drawer | `components/ui/drawer.tsx` | `DrawerPrimitive.Portal` | z-50 (fixed) | No |
| DropdownMenu | `components/ui/dropdown-menu.tsx` | `MenuPrimitive.Portal` | z-50 | No |
| Select | `components/ui/select.tsx` | `SelectPrimitive.Portal` | z-50 | No |
| ContextMenu | `components/ui/context-menu.tsx` | `ContextMenuPrimitive.Portal` | z-50 | No |
| Tooltip | `components/ui/tooltip.tsx` | `TooltipPrimitive.Portal` | z-50 | No |
| Popover | `components/ui/popover.tsx` | `PopoverPrimitive.Portal` | z-50 | No |
| HoverCard | `components/ui/hover-card.tsx` | `HoverCardPrimitive.Portal` | z-50 | No |
| Menubar | `components/ui/menubar.tsx` | `MenuPrimitive.Portal` | z-50 | No |
| NavigationMenu | `components/ui/navigation-menu.tsx` | `isolate z-50` | z-50 | No |

### Components Using `createPortal` (React DOM)

| Component | File | Portal Target | Z-Index | Potential Conflict? |
|-----------|------|---------------|---------|---------------------|
| FileUpload overlay | `components/ui/file-upload.tsx:186` | `document.body` | z-50 (fixed) | No |
| MorphingDialog | `components/ui/morphing-dialog.tsx:246` | `document.body` | z-50 (fixed) | No |
| MorphingDialog (motion) | `components/motion-primitives/morphing-dialog.tsx:246` | `document.body` | z-50 (fixed) | No |

### Toast Notifications (Sonner)

| Component | File | Rendering | Z-Index | Potential Conflict? |
|-----------|------|-----------|---------|---------------------|
| Toaster | `components/ui/sonner.tsx` | Rendered in `app/layout.tsx` with `position="top-center"` | Sonner default (9999 inline style) | No -- always on top |

**Conclusion:** All portal-based components use z-50 or higher and render via portals to `document.body`. They will all appear above the sticky header at z-20. No conflicts expected.

---

## F. Container Query Dependencies

| File | Line | Class | Notes |
|------|------|-------|-------|
| `app/components/layout/layout-app.tsx` | 14 | `@container` (unnamed) | **Will change to `@container/main`** to support named container queries |
| `app/components/chat/chat.tsx` | 256 | `@container/main` | Already uses named container -- no change needed |
| `app/components/multi-chat/multi-chat.tsx` | 705 | `@container/main` | Already uses named container -- no change needed |
| `components/ui/card.tsx` | 23 | `@container/card-header` | Separate named container, unrelated |

**Impact:** Only `layout-app.tsx` needs updating from `@container` to `@container/main`. No `@w-sm:`, `@w-md:`, etc. container query breakpoint classes were found in any source files, so no breakpoint class renaming is needed.

---

## G. Viewport Height Dependencies

| File | Line | Class/Value | Impact |
|------|------|-------------|--------|
| `app/components/layout/layout-app.tsx` | 12 | `h-dvh` (outer div) | **Will change to `h-svh`** |
| `app/components/layout/layout-app.tsx` | 14 | `h-dvh` (main element) | **Will change to `h-svh`** |
| `app/globals.css` | 207 | `100dvh` in scroll-anchor calc | **Should change to `100svh`** for consistency |
| `app/auth/login/.../page.tsx` | 5 | `min-h-dvh` | Auth page, independent layout. **No change needed.** |
| `app/auth/sign-up/.../page.tsx` | 5 | `min-h-dvh` | Auth page, independent layout. **No change needed.** |
| `app/components/history/drawer-history.tsx` | 302 | `h-dvh` | History drawer. Independent of header change. **No change needed.** |
| `components/ui/sidebar.tsx` | 164 | `min-h-svh` | Already uses svh. No change needed. |
| `components/ui/sidebar.tsx` | 256 | `h-svh` | Already uses svh. No change needed. |

---

## H. Risk Assessment

### High Risk (Must Verify)

1. **Scroll anchor calculations** (`--spacing-scroll-area`, `--spacing-scroll-anchor`) -- These determine the auto-scroll behavior via StickToBottom. Incorrect values will break the "stick to bottom" experience.
2. **`pt-20` removal** in conversation components -- Removing top padding must not cause content to render behind or overlapping with the sticky header on any viewport.
3. **Mobile gradient mask removal** -- Must verify no visual artifacts remain on mobile Safari after removing the gradient masks.

### Medium Risk (Should Verify)

4. **Scroll position preservation in message-user.tsx** -- The edit flow saves/restores scrollTop. If the scroll container relationship changes, this may need adjustment.
5. **Multi-model conversation `pt-20`** -- Same as #2 but for multi-model view.

### Low Risk (Verify During Testing)

6. **Share page header** -- Independent layout, but should be considered for eventual consistency.
7. **Container query naming** -- Only one file needs updating; low risk of regression.
8. **Viewport height `dvh` to `svh`** -- Only affects the main app shell; auth pages and drawers are independent.

---

## I. Files That Will Be Modified (Summary)

| Phase | File | Changes |
|-------|------|---------|
| Phase 1 | `app/globals.css` | Update `--spacing-app-header: 52px`, update scroll calculations, change `100dvh` to `100svh` |
| Phase 2 | `app/components/layout/layout-app.tsx` | `h-dvh` -> `h-svh`, `@container` -> `@container/main` |
| Phase 2 | `app/components/layout/header.tsx` | `fixed` -> `sticky`, `z-50` -> `z-20`, opaque background, 3-column layout |
| Phase 3 | `app/components/chat/conversation.tsx` | Remove gradient masks, change `pt-20` to appropriate value |
| Phase 3 | `app/components/multi-chat/multi-conversation.tsx` | Change `pt-20` to appropriate value |
| Phase 2 | `app/components/layout/model-selector-header.tsx` | **New file** -- extracted model selector for header center |

### Files That Should NOT Be Modified

- `app/share/[chatId]/header.tsx` -- Separate layout, out of scope
- `app/auth/*/page.tsx` -- Independent layout, uses `min-h-dvh` appropriately
- All `components/ui/*.tsx` portal components -- Already work correctly with z-50
- Sidebar components -- Independent scroll context, not affected
