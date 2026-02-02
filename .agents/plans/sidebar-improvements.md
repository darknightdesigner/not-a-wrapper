# Sidebar Improvements Implementation Plan

> **Based on**: ChatGPT sidebar analysis  
> **Priority**: High-impact UX improvements  
> **Total Phases**: 10 (Phase 8 already complete = 9 to implement)
> **Created**: 2026-02-01  
> **Updated**: 2026-02-01 (added visual parity phases)
> **Reviewed**: 2026-02-01 (issues identified and fixed)
> **Plan Location**: `.agents/plans/sidebar-improvements.md`

---

## Quick Reference (TL;DR)

| Phase | What | Key Change | Commit Message |
|-------|------|------------|----------------|
| 1 | A11y heading | Add `<h2 className="sr-only">` | `feat(sidebar): add screen reader heading` |
| 2 | Drag/RTL | Add `draggable={false}`, `dir="auto"` | `feat(sidebar): prevent drag and add RTL support` |
| 3 | Touch targets | Add `pointer-coarse:py-3` | `feat(sidebar): add touch device optimizations` |
| 4 | Motion | Add `motion-safe:` prefix | `feat(sidebar): add reduced motion support` |
| 5 | Component | Create `CollapsibleSection` | `feat(ui): create CollapsibleSection component` |
| 6 | Use component | Update `SidebarList` | `feat(sidebar): implement collapsible sections` |
| 7 | Scroll shadow | Create `ScrollShadowWrapper` | `feat(sidebar): add scroll shadow indicators` |
| 8 | Kbd hiding | **SKIP** - already done | N/A |
| **9** | **Visual parity** | Update spacing, sizing, layout | `feat(sidebar): align styling with ChatGPT patterns` |
| **10** | **Sticky actions** | Make New Chat/Search sticky | `feat(sidebar): make action buttons sticky` |

---

## ⚠️ Review Notes (2026-02-01)

This plan was reviewed and several issues were identified. **Read this section before implementing.**

### Critical Issues Fixed

| Phase | Issue | Fix Applied |
|-------|-------|-------------|
| 5 | CSS `h-0` to `auto` won't animate | Use Radix `Collapsible` primitive |
| 5 | Hydration mismatch with localStorage | Use `useEffect` for client-side sync |
| 7+10 | Scroll container conflicts | Wrap `ScrollArea` instead of replacing |
| 10 | Gradient direction reversed | Fixed to `from-sidebar to-transparent` |

### Moderate Issues Fixed

| Phase | Issue | Fix Applied |
|-------|-------|-------------|
| 4 | Redundant `motion-safe:duration-*` | Removed prefix from duration |
| 6 | Duplicated content rendering | Fixed code sample |
| 9.2 | CSS variables defined but unused | Removed (use Tailwind classes directly) |

### Coordination Required

- **Phase 7 and 10** both modify the scroll container structure
- Execute them together or verify sticky behavior after Phase 7
- The recommended execution order has been updated to reflect this

---

## Agent Instructions

### Before Starting

1. **Read this entire plan first** to understand scope
2. **Run pre-flight checks** (see below) to verify starting state
3. **Execute phases sequentially** - some have dependencies
4. **Commit after each phase** - enables easy rollback
5. **Stop and report** if any verification fails

### Pre-Flight Checks

```bash
# Verify clean git state
git status

# Ensure dependencies are installed
bun install

# Verify project builds
bun run typecheck
```

### Context Files to Load

Before starting, read these files for context:

```
@AGENTS.md                                    # Project conventions
@app/components/layout/sidebar/app-sidebar.tsx  # Main sidebar
@app/components/layout/sidebar/sidebar-item.tsx # Chat item component
@app/components/layout/sidebar/sidebar-list.tsx # Section list
@app/globals.css                              # Existing CSS utilities
@components/ui/kbd.tsx                        # Keyboard shortcut component
```

### Existing Utilities (Already Implemented)

The project already has these utilities - **do not recreate**:

| Utility | Location | Usage |
|---------|----------|-------|
| `pointer-coarse:*` | `globals.css` line 10 | Touch device variant (replaces `touch:`) |
| `pointer-fine:*` | `globals.css` line 11 | Non-touch device variant |
| `KbdGroup` hiding | `kbd.tsx` line 51 | Already has `pointer-coarse:hidden` |

---

## Overview

This plan implements sidebar improvements inspired by ChatGPT's patterns. Each phase is independent and can be committed separately.

### Files to Modify

| File | Changes | Phase |
|------|---------|-------|
| `app/components/layout/sidebar/app-sidebar.tsx` | Add sr-only heading, collapsible sections, sticky actions | 1, 6, 7, 9, 10 |
| `app/components/layout/sidebar/sidebar-item.tsx` | Add `draggable`, `dir`, touch targets, padding | 2, 3, 9 |
| `app/components/layout/sidebar/sidebar-list.tsx` | Convert to collapsible section, header styling | 6, 9 |
| `app/components/layout/sidebar/sidebar-menu-item.tsx` | Add touch targets, reduce gap | 3, 9 |
| `components/ui/collapsible-section.tsx` | **New component** (uses Radix Collapsible) | 5 |
| `app/globals.css` | Add collapsible animations | 5 |
| `app/components/layout/sidebar/scroll-shadow-wrapper.tsx` | **New component** (wraps ScrollArea) | 7 |
| `components/ui/sidebar.tsx` | Add motion-safe prefixes | 4 |

### Phase Dependencies

```
Phase 1 (a11y heading)       → Independent
Phase 2 (drag/RTL)           → Independent
Phase 3 (touch targets)      → Independent
Phase 4 (reduced motion)     → Independent
Phase 5 (CollapsibleSection) → Independent (requires adding CSS animations)
Phase 6 (use collapsible)    → Requires Phase 5
Phase 7 (scroll shadows)     → Should coordinate with Phase 10 ⚠️
Phase 8 (kbd hiding)         → ALREADY COMPLETE ✓
Phase 9 (visual parity)      → Independent
Phase 10 (sticky actions)    → Should coordinate with Phase 7 ⚠️
```

### Recommended Execution Order

For best results, execute in this order:
1. **Phases 1-4** (quick wins, independent)
2. **Phases 5-6** (collapsible sections + CSS animations)
3. **Phase 9** (visual foundation)
4. **Phases 7+10 together** (scroll shadows + sticky actions — both modify scroll container)

> **⚠️ Coordination Note**: Phases 7 and 10 both affect the scroll container in `app-sidebar.tsx`. 
> Test sticky behavior after implementing scroll shadows to ensure they work together.

---

## Phase 1: Accessibility - Screen Reader Heading

### Goal
Add visually hidden heading for screen readers to announce "Chat history" when navigating the sidebar.

### Current State (line 69 of app-sidebar.tsx)
```tsx
<SidebarContent className="border-border/40 border-t">
  <ScrollArea className="flex h-full px-3 [&>div>div]:!block">
```

### Steps

1. **Edit** `app/components/layout/sidebar/app-sidebar.tsx`

Use StrReplace with:
- **old_string**: `<SidebarContent className="border-border/40 border-t">\n        <ScrollArea`
- **new_string**: `<SidebarContent className="border-border/40 border-t">\n        <h2 className="sr-only">Chat history</h2>\n        <ScrollArea`

### Verification

```bash
# Check for lint errors
bun run lint app/components/layout/sidebar/app-sidebar.tsx

# Verify the heading exists
grep -n "sr-only" app/components/layout/sidebar/app-sidebar.tsx
# Expected: line ~70 with "Chat history"
```

### Success Criteria
- [ ] `<h2 className="sr-only">Chat history</h2>` exists before ScrollArea
- [ ] No lint errors
- [ ] `bun run typecheck` passes

### Commit
```bash
git add app/components/layout/sidebar/app-sidebar.tsx
git commit -m "feat(sidebar): add screen reader heading for accessibility"
```

---

## Phase 2: Sidebar Item - Drag Prevention & RTL Support

### Goal
Prevent accidental drag operations and support RTL text direction.

### Current State (lines 182-193 of sidebar-item.tsx)
```tsx
          <Link
            href={`/c/${chat.id}`}
            className="block w-full"
            prefetch
            onClick={handleLinkClick}
          >
            <div
              className="text-primary relative line-clamp-1 mask-r-from-80% mask-r-to-85% px-2 py-2 text-sm text-ellipsis whitespace-nowrap"
              title={displayTitle}
            >
              {displayTitle}
            </div>
          </Link>
```

### Steps

1. **Edit** `app/components/layout/sidebar/sidebar-item.tsx` - Add draggable={false}

Use StrReplace:
- **old_string**:
```tsx
          <Link
            href={`/c/${chat.id}`}
            className="block w-full"
            prefetch
            onClick={handleLinkClick}
          >
```
- **new_string**:
```tsx
          <Link
            href={`/c/${chat.id}`}
            className="block w-full"
            prefetch
            draggable={false}
            onClick={handleLinkClick}
          >
```

2. **Edit** `app/components/layout/sidebar/sidebar-item.tsx` - Add dir="auto"

Use StrReplace:
- **old_string**:
```tsx
              title={displayTitle}
            >
              {displayTitle}
            </div>
```
- **new_string**:
```tsx
              title={displayTitle}
            >
              <span dir="auto">{displayTitle}</span>
            </div>
```

### Verification

```bash
bun run lint app/components/layout/sidebar/sidebar-item.tsx
bun run typecheck

# Verify changes
grep -n "draggable" app/components/layout/sidebar/sidebar-item.tsx
grep -n 'dir="auto"' app/components/layout/sidebar/sidebar-item.tsx
```

### Success Criteria
- [ ] `draggable={false}` on Link (around line 186)
- [ ] `dir="auto"` wrapping displayTitle (around line 192)
- [ ] No lint/type errors

### Commit
```bash
git add app/components/layout/sidebar/sidebar-item.tsx
git commit -m "feat(sidebar): prevent drag and add RTL support to items"
```

---

## Phase 3: Touch Target Sizing

### Goal
Increase tap targets on mobile devices for better touch UX.

### Important: Use Existing Variant
The project already has `pointer-coarse:` variant defined in `globals.css` (line 10).
Use `pointer-coarse:py-3` instead of `touch:py-3`.

### Current State

**sidebar-item.tsx (line 189)**:
```tsx
className="text-primary relative line-clamp-1 mask-r-from-80% mask-r-to-85% px-2 py-2 text-sm text-ellipsis whitespace-nowrap"
```

**sidebar-menu-item.tsx (line 27-28)**:
```tsx
const baseClassName =
  "group/menu-item hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center gap-2 rounded-md bg-transparent px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
```

### Steps

1. **Edit** `app/components/layout/sidebar/sidebar-item.tsx` - Add pointer-coarse class

Use StrReplace:
- **old_string**: `mask-r-from-80% mask-r-to-85% px-2 py-2 text-sm`
- **new_string**: `mask-r-from-80% mask-r-to-85% px-2 py-2 pointer-coarse:py-3 text-sm`

2. **Edit** `app/components/layout/sidebar/sidebar-menu-item.tsx` - Add pointer-coarse class

Use StrReplace:
- **old_string**: `rounded-md bg-transparent px-2 py-2 text-sm transition-colors`
- **new_string**: `rounded-md bg-transparent px-2 py-2 pointer-coarse:py-3 text-sm transition-colors`

### Verification

```bash
bun run lint app/components/layout/sidebar/sidebar-item.tsx app/components/layout/sidebar/sidebar-menu-item.tsx
bun run typecheck

# Verify changes
grep -n "pointer-coarse:py-3" app/components/layout/sidebar/sidebar-item.tsx
grep -n "pointer-coarse:py-3" app/components/layout/sidebar/sidebar-menu-item.tsx
```

### Success Criteria
- [ ] sidebar-item.tsx has `pointer-coarse:py-3` class
- [ ] sidebar-menu-item.tsx has `pointer-coarse:py-3` class
- [ ] No lint/type errors
- [ ] On touch devices (Chrome DevTools), items are taller

### Commit
```bash
git add app/components/layout/sidebar/sidebar-item.tsx app/components/layout/sidebar/sidebar-menu-item.tsx
git commit -m "feat(sidebar): add touch device optimizations for larger tap targets"
```

---

## Phase 4: Reduced Motion Support

### Goal
Respect user's reduced motion preferences for accessibility.

### Important Note
Tailwind CSS 4 has built-in `motion-safe:` and `motion-reduce:` variants.
No custom CSS needed - just use the variant prefix on transition classes.

### Current State (components/ui/sidebar.tsx)
Search for `transition-` classes that need `motion-safe:` prefix:
- Line 234: `transition-[width] duration-200`
- Line 245: `transition-[left,right,width] duration-200`

### Steps

1. **Edit** `components/ui/sidebar.tsx` - Add motion-safe prefix to sidebar gap

Use StrReplace:
- **old_string**: `"relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",`
- **new_string**: `"relative w-(--sidebar-width) bg-transparent motion-safe:transition-[width] duration-200 ease-linear",`

> **Note**: Only prefix `transition-*`, not `duration-*`. Duration only applies when transition is active.

2. **Edit** `components/ui/sidebar.tsx` - Add motion-safe prefix to sidebar container

Use StrReplace:
- **old_string**: `"fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",`
- **new_string**: `"fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) motion-safe:transition-[left,right,width] duration-200 ease-linear md:flex",`

### Verification

```bash
bun run lint components/ui/sidebar.tsx
bun run typecheck

# Verify changes
grep -n "motion-safe:" components/ui/sidebar.tsx
# Should find at least 2 occurrences
```

### Success Criteria
- [ ] Sidebar gap div has `motion-safe:transition-[width] motion-safe:duration-200`
- [ ] Sidebar container has `motion-safe:transition-[left,right,width] motion-safe:duration-200`
- [ ] No lint/type errors

### Commit
```bash
git add components/ui/sidebar.tsx
git commit -m "feat(sidebar): add reduced motion support for accessibility"
```

---

## Phase 5: Collapsible Section Component

### Goal
Create a reusable collapsible section component for organizing sidebar content.

### ⚠️ Important Design Decisions

1. **Use Radix Collapsible**: CSS cannot animate `height: 0` to `height: auto`. Using Radix's `Collapsible` primitive provides smooth animations.
2. **Hydration Safety**: Initialize with `defaultOpen`, then sync from localStorage in `useEffect` to avoid SSR/client mismatch.

### Steps

1. **Create** `components/ui/collapsible-section.tsx`:

```tsx
"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { cn } from "@/lib/utils"

type CollapsibleSectionProps = {
  /** Section title */
  title: string
  /** Optional icon before title */
  icon?: React.ReactNode
  /** Section content */
  children: React.ReactNode
  /** Initial expanded state */
  defaultOpen?: boolean
  /** localStorage key for persistence */
  storageKey?: string
  /** Additional className for the container */
  className?: string
}

export function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  storageKey,
  className,
}: CollapsibleSectionProps) {
  // Initialize with defaultOpen to match SSR
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  // Sync from localStorage on mount (client-only) to avoid hydration mismatch
  React.useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        setIsOpen(stored === "true")
      }
    }
  }, [storageKey])

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open)
      if (storageKey) {
        localStorage.setItem(storageKey, String(open))
      }
    },
    [storageKey]
  )

  return (
    <CollapsiblePrimitive.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn("group/collapsible-section", className)}
    >
      <CollapsiblePrimitive.Trigger
        className={cn(
          "flex w-full items-center gap-1 px-2 py-1.5",
          "text-xs font-semibold text-muted-foreground",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
        )}
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          className={cn(
            "shrink-0 motion-safe:transition-transform duration-150",
            isOpen && "rotate-90"
          )}
        />
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
      </CollapsiblePrimitive.Trigger>

      <CollapsiblePrimitive.Content
        className={cn(
          "overflow-hidden",
          "data-[state=open]:animate-collapsible-down",
          "data-[state=closed]:animate-collapsible-up"
        )}
      >
        <div className="space-y-0.5 pt-1">{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}
```

2. **Add animations to `app/globals.css`** (after the `@theme` block):

```css
@keyframes collapsible-down {
  from {
    height: 0;
    opacity: 0;
  }
  to {
    height: var(--radix-collapsible-content-height);
    opacity: 1;
  }
}

@keyframes collapsible-up {
  from {
    height: var(--radix-collapsible-content-height);
    opacity: 1;
  }
  to {
    height: 0;
    opacity: 0;
  }
}

@theme {
  --animate-collapsible-down: collapsible-down 200ms ease-out;
  --animate-collapsible-up: collapsible-up 200ms ease-out;
}
```

> **Note**: Radix provides `--radix-collapsible-content-height` CSS variable automatically, enabling smooth height animation.

### Verification

```bash
bun run lint components/ui/collapsible-section.tsx
bun run typecheck

# Verify file exists and has expected exports
grep -n "export function CollapsibleSection" components/ui/collapsible-section.tsx

# Verify CSS animations added
grep -n "collapsible-down" app/globals.css
```

### Success Criteria
- [ ] File created at `components/ui/collapsible-section.tsx`
- [ ] Component exports `CollapsibleSection`
- [ ] Uses Radix `CollapsiblePrimitive` for smooth height animation
- [ ] Uses `useEffect` for localStorage sync (avoids hydration mismatch)
- [ ] CSS animations `collapsible-down` and `collapsible-up` added to `globals.css`
- [ ] No lint/type errors

### Commit
```bash
git add components/ui/collapsible-section.tsx app/globals.css
git commit -m "feat(ui): create CollapsibleSection component with Radix and localStorage persistence"
```

---

## Phase 6: Update Sidebar List to Use Collapsible Sections

> **Dependency**: Requires Phase 5 (CollapsibleSection component) to be complete.

### Goal
Replace static section headers with collapsible sections.

### Steps

1. **Read** `app/components/layout/sidebar/sidebar-list.tsx`

2. **Edit** - Convert to use CollapsibleSection:

```tsx
import { Chat } from "@/lib/chat-store/types"
import { ReactNode } from "react"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { SidebarItem } from "./sidebar-item"

type SidebarListProps = {
  title: string
  icon?: ReactNode
  items: Chat[]
  currentChatId: string
  /** Whether section is collapsible (default: true for > 3 items) */
  collapsible?: boolean
  /** localStorage key for persistence */
  storageKey?: string
}

export function SidebarList({
  title,
  icon,
  items,
  currentChatId,
  collapsible,
  storageKey,
}: SidebarListProps) {
  // Auto-collapse for sections with many items
  const shouldCollapse = collapsible ?? items.length > 3

  // Shared content renderer
  const renderItems = () =>
    items.map((chat) => (
      <SidebarItem key={chat.id} chat={chat} currentChatId={currentChatId} />
    ))

  if (!shouldCollapse) {
    return (
      <div>
        <h3 className="flex items-center gap-1 overflow-hidden px-3 py-1.5 text-xs font-medium text-muted-foreground break-all text-ellipsis">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
        <div className="space-y-0.5">{renderItems()}</div>
      </div>
    )
  }

  return (
    <CollapsibleSection
      title={title}
      icon={icon}
      defaultOpen={true}
      storageKey={storageKey}
      className="pt-2"
    >
      {renderItems()}
    </CollapsibleSection>
  )
}
```

> **Note**: Using `renderItems()` function avoids duplicating the mapping logic.

3. **Edit** `app/components/layout/sidebar/app-sidebar.tsx` - Add storage keys:

```tsx
{pinnedChats.length > 0 && (
  <SidebarList
    key="pinned"
    title="Pinned"
    icon={<HugeiconsIcon icon={Pin} size={12} />}
    items={pinnedChats}
    currentChatId={currentChatId}
    collapsible={false}  // Pinned always visible
  />
)}
{groupedChats?.map((group) => (
  <SidebarList
    key={group.name}
    title={group.name}
    items={group.chats}
    currentChatId={currentChatId}
    storageKey={`sidebar-section-${group.name.toLowerCase().replace(/\s+/g, "-")}`}
  />
))}
```

### Verification

```bash
bun run lint app/components/layout/sidebar/
bun run typecheck

# Manual: 
# 1. Sections should have chevron icons
# 2. Clicking header collapses/expands content
# 3. Refresh page - collapsed state should persist
```

### Success Criteria
- [ ] SidebarList imports CollapsibleSection
- [ ] Pinned section has `collapsible={false}`
- [ ] Date sections have `storageKey` prop
- [ ] Collapse state persists across page refresh
- [ ] No lint/type errors

### Commit
```bash
git add app/components/layout/sidebar/sidebar-list.tsx app/components/layout/sidebar/app-sidebar.tsx
git commit -m "feat(sidebar): implement collapsible date sections with persistence"
```

---

## Phase 7: Scroll Shadow Indicators

### Goal
Add visual shadows when content is scrollable to indicate more content above/below.

### ⚠️ Important: Preserve ScrollArea

Do NOT replace `ScrollArea` — it provides cross-browser scrollbar styling and accessibility features.
Instead, wrap `ScrollArea` with shadow indicators.

### Steps

1. **Create** `app/components/layout/sidebar/scroll-shadow-wrapper.tsx`:

```tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type ScrollShadowWrapperProps = {
  children: React.ReactNode
  className?: string
  /** Ref to the scrollable viewport element (from ScrollArea) */
  viewportRef?: React.RefObject<HTMLDivElement>
}

export function ScrollShadowWrapper({
  children,
  className,
  viewportRef,
}: ScrollShadowWrapperProps) {
  const [scrollState, setScrollState] = React.useState({
    top: false,
    bottom: false,
  })

  React.useEffect(() => {
    const viewport = viewportRef?.current
    if (!viewport) return

    const updateScrollState = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      setScrollState({
        top: scrollTop > 10,
        bottom: scrollTop + clientHeight < scrollHeight - 10,
      })
    }

    updateScrollState()
    viewport.addEventListener("scroll", updateScrollState, { passive: true })

    // ResizeObserver for dynamic content
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(viewport)

    return () => {
      viewport.removeEventListener("scroll", updateScrollState)
      resizeObserver.disconnect()
    }
  }, [viewportRef])

  return (
    <div className={cn("relative", className)}>
      {/* Top shadow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-4",
          "bg-gradient-to-b from-sidebar to-transparent",
          "motion-safe:transition-opacity duration-150",
          scrollState.top ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      />

      {children}

      {/* Bottom shadow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4",
          "bg-gradient-to-t from-sidebar to-transparent",
          "motion-safe:transition-opacity duration-150",
          scrollState.bottom ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      />
    </div>
  )
}
```

2. **Edit** `app/components/layout/sidebar/app-sidebar.tsx` - Wrap ScrollArea:

```tsx
import { useRef } from "react"
import { ScrollShadowWrapper } from "./scroll-shadow-wrapper"

// Inside component:
const scrollViewportRef = useRef<HTMLDivElement>(null)

// Wrap ScrollArea (don't replace it):
<ScrollShadowWrapper className="h-full" viewportRef={scrollViewportRef}>
  <ScrollArea className="flex h-full px-3 [&>div>div]:!block">
    <div ref={scrollViewportRef}>
      {/* existing content */}
    </div>
  </ScrollArea>
</ScrollShadowWrapper>
```

> **Note**: If accessing ScrollArea's internal viewport is tricky, an alternative is to use CSS-only shadows with `background-attachment: local` (works in modern browsers).

### Verification

```bash
bun run lint app/components/layout/sidebar/
bun run typecheck

# Manual:
# 1. Add many chats to sidebar
# 2. Scroll down - top shadow should appear
# 3. Scroll up - bottom shadow should appear
# 4. At top - no top shadow; at bottom - no bottom shadow
# 5. Verify ScrollArea scrollbar styling still works
```

### Success Criteria
- [ ] ScrollShadowWrapper component created at `app/components/layout/sidebar/scroll-shadow-wrapper.tsx`
- [ ] app-sidebar.tsx wraps ScrollArea with ScrollShadowWrapper (not replaces)
- [ ] Shadows appear/disappear based on scroll position
- [ ] Uses `motion-safe:` for transitions
- [ ] ScrollArea features preserved (scrollbar styling, accessibility)
- [ ] No lint/type errors

### Commit
```bash
git add app/components/layout/sidebar/scroll-shadow-wrapper.tsx app/components/layout/sidebar/app-sidebar.tsx
git commit -m "feat(sidebar): add scroll shadow indicators for better UX feedback"
```

---

## Phase 8: Keyboard Shortcuts - Touch Device Hiding

### ✅ ALREADY COMPLETE - SKIP THIS PHASE

This feature is already implemented in `components/ui/kbd.tsx`:

```tsx
// Line 47-57 of kbd.tsx
export function KbdGroup({ children, className }: KbdGroupProps) {
  return (
    <div
      className={cn(
        "text-muted-foreground pointer-coarse:hidden inline-flex whitespace-pre",
        className
      )}
    >
      {children}
    </div>
  )
}
```

The `pointer-coarse:hidden` class already hides keyboard shortcuts on touch devices.

### Verification (Optional)
```bash
# Confirm the class exists
grep -n "pointer-coarse:hidden" components/ui/kbd.tsx
# Expected output: line 51 with "pointer-coarse:hidden"
```

### No Action Required
Proceed to Phase 9.

---

## Phase 9: Visual Parity - Spacing, Sizing, and Layout

### Goal
Align our sidebar's visual styling with ChatGPT's patterns for a more polished, consistent feel.

### Analysis: ChatGPT vs Current

| Element | ChatGPT | Current | Change |
|---------|---------|---------|--------|
| Menu item icon-text gap | `gap-1.5` (6px) | `gap-2` (8px) | Reduce gap |
| Menu item padding | `px-2 py-2` | `px-2 py-2` | ✓ Same |
| Section header padding | `px-4 py-1.5` | `px-2 pt-3 pb-2` | More horizontal |
| Section spacing | `--sidebar-section-margin-top` | `space-y-5` | Use CSS vars |
| Chat item structure | `trailing-pair` (2 slots) | Single slot | Add badge slot |
| Footer profile | Larger with `gap-2` | Standard | Enhance |

### Steps

#### Step 9.1: Update Menu Item Gap

**File**: `app/components/layout/sidebar/sidebar-menu-item.tsx`

Use StrReplace:
- **old_string**: `"flex min-w-0 grow items-center gap-2"`
- **new_string**: `"flex min-w-0 grow items-center gap-1.5"`

#### ~~Step 9.2: Add CSS Variables for Sidebar Spacing~~ (REMOVED)

> **Skipped**: CSS variables were defined but never used. Using Tailwind classes directly is simpler and more consistent with the codebase.

#### Step 9.2: Update Sidebar List Section Headers

**File**: `app/components/layout/sidebar/sidebar-list.tsx`

Update the `<h3>` styling:

Use StrReplace:
- **old_string**: `"flex items-center gap-1 overflow-hidden px-2 pt-3 pb-2 text-xs font-semibold break-all text-ellipsis"`
- **new_string**: `"flex items-center gap-1 overflow-hidden px-3 py-1.5 text-xs font-medium text-muted-foreground break-all text-ellipsis"`

#### Step 9.3: Update Chat Item Padding

**File**: `app/components/layout/sidebar/sidebar-item.tsx`

Use StrReplace:
- **old_string**: `"text-primary relative line-clamp-1 mask-r-from-80% mask-r-to-85% px-2 py-2 text-sm"`
- **new_string**: `"text-primary relative line-clamp-1 mask-r-from-80% mask-r-to-85% px-2.5 py-2 text-sm"`

#### Step 9.4: Update Section Spacing

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

Use StrReplace:
- **old_string**: `<div className="space-y-5">`
- **new_string**: `<div className="space-y-4">`

And update pinned section:
- **old_string**: `<div className="space-y-5">\n                  <SidebarList`
- **new_string**: `<SidebarList`

(Remove the extra wrapper div around pinned)

### Verification

```bash
bun run lint app/components/layout/sidebar/
bun run typecheck

# Visual check - compare spacing:
# - Menu items should feel slightly tighter
# - Section headers should have more horizontal padding
# - Overall sidebar should feel more compact
```

### Success Criteria
- [ ] Menu item gap reduced to `gap-1.5`
- [ ] Section headers use `px-3 py-1.5`
- [ ] Chat items use `px-2.5 py-2`
- [ ] Section spacing is `space-y-4`
- [ ] No lint/type errors

### Commit
```bash
git add app/components/layout/sidebar/
git commit -m "feat(sidebar): align spacing and sizing with ChatGPT patterns"
```

---

## Phase 10: Sticky Action Buttons

### Goal
Make New Chat and Search buttons sticky at the top of the sidebar, always accessible without scrolling.

### ChatGPT Pattern
```html
<aside class="pt-(--sidebar-section-first-margin-top) sticky top-header-height z-20 bg-(--sidebar-mask-bg)">
  <a>New chat</a>
  <div>Search chats</div>
  <a>Images</a>
  <!-- gradient fade at bottom -->
</aside>
```

### Steps

#### Step 10.1: Create Sticky Action Section

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

Replace the action buttons section (lines 71-102):

Use StrReplace:
- **old_string**:
```tsx
          <div className="mt-3 mb-5 flex w-full flex-col items-start gap-0">
            <SidebarMenuItem
              icon={AddCircleIcon}
              label="New Chat"
              href="/"
              testId="new-chat-button"
              trailing={
                <KbdGroup>
                  <Kbd label="Shift">⇧</Kbd>
                  <Kbd label="Command">⌘</Kbd>
                  <Kbd>O</Kbd>
                </KbdGroup>
              }
            />
            <HistoryTrigger
              hasSidebar={false}
              classNameTrigger="group/menu-item hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center gap-2 rounded-md bg-transparent px-2 py-2 text-sm transition-colors"
              icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
              label={
                <div className="flex min-w-0 grow items-center gap-2">
                  <span className="truncate">Search</span>
                  <div className="text-muted-foreground ml-auto opacity-0 transition-opacity group-hover/menu-item:opacity-100">
                    <KbdGroup>
                      <Kbd label="Command">⌘</Kbd>
                      <Kbd>K</Kbd>
                    </KbdGroup>
                  </div>
                </div>
              }
              hasPopover={false}
            />
          </div>
```

- **new_string**:
```tsx
          {/* Sticky action buttons - always visible */}
          <div className="sticky top-0 z-20 bg-sidebar pb-2 pt-3">
            <div className="flex w-full flex-col items-start gap-0">
              <SidebarMenuItem
                icon={AddCircleIcon}
                label="New Chat"
                href="/"
                testId="new-chat-button"
                trailing={
                  <KbdGroup>
                    <Kbd label="Shift">⇧</Kbd>
                    <Kbd label="Command">⌘</Kbd>
                    <Kbd>O</Kbd>
                  </KbdGroup>
                }
              />
              <HistoryTrigger
                hasSidebar={false}
                classNameTrigger="group/menu-item hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center gap-1.5 rounded-md bg-transparent px-2 py-2 text-sm transition-colors"
                icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
                label={
                  <div className="flex min-w-0 grow items-center gap-1.5">
                    <span className="truncate">Search</span>
                    <div className="text-muted-foreground ml-auto opacity-0 transition-opacity group-hover/menu-item:opacity-100">
                      <KbdGroup>
                        <Kbd label="Command">⌘</Kbd>
                        <Kbd>K</Kbd>
                      </KbdGroup>
                    </div>
                  </div>
                }
                hasPopover={false}
              />
            </div>
            {/* Bottom fade gradient - solid at top, fades to transparent */}
            <div 
              className="pointer-events-none absolute inset-x-0 -bottom-2 h-4 bg-gradient-to-b from-sidebar to-transparent"
              aria-hidden="true"
            />
          </div>
```

> **Note**: Gradient direction fixed. `from-sidebar to-transparent` with `bg-gradient-to-b` creates a fade-out effect below the sticky header.

### Verification

```bash
bun run lint app/components/layout/sidebar/app-sidebar.tsx
bun run typecheck

# Manual test:
# 1. Add many chats to sidebar
# 2. Scroll down - New Chat and Search should stay visible
# 3. The sticky header should have a subtle fade at bottom
```

### Success Criteria
- [ ] Action buttons are in sticky container
- [ ] Container has `bg-sidebar` for solid background
- [ ] Bottom gradient fades into content
- [ ] Buttons stay visible when scrolling chat list
- [ ] No lint/type errors

### Commit
```bash
git add app/components/layout/sidebar/app-sidebar.tsx
git commit -m "feat(sidebar): make action buttons sticky at top"
```

---

## Final Verification

After completing all phases:

```bash
# Full lint and type check
bun run lint
bun run typecheck

# Build to catch any SSR issues
bun run build

# Start dev server for manual testing
bun run dev
```

### Automated Checks

```bash
# Verify all changes are in place
echo "=== Phase 1: A11y Heading ==="
grep -n "sr-only.*Chat history" app/components/layout/sidebar/app-sidebar.tsx

echo "=== Phase 2: Drag/RTL ==="
grep -n "draggable={false}" app/components/layout/sidebar/sidebar-item.tsx
grep -n 'dir="auto"' app/components/layout/sidebar/sidebar-item.tsx

echo "=== Phase 3: Touch Targets ==="
grep -n "pointer-coarse:py-3" app/components/layout/sidebar/sidebar-item.tsx
grep -n "pointer-coarse:py-3" app/components/layout/sidebar/sidebar-menu-item.tsx

echo "=== Phase 4: Reduced Motion ==="
grep -n "motion-safe:" components/ui/sidebar.tsx | head -3

echo "=== Phase 5: CollapsibleSection ==="
ls -la components/ui/collapsible-section.tsx

echo "=== Phase 7: ScrollShadowWrapper ==="
ls -la app/components/layout/sidebar/scroll-shadow-wrapper.tsx

echo "=== Phase 9: Visual Parity ==="
grep -n "gap-1.5" app/components/layout/sidebar/sidebar-menu-item.tsx
grep -n "px-3 py-1.5" app/components/layout/sidebar/sidebar-list.tsx

echo "=== Phase 10: Sticky Actions ==="
grep -n "sticky top-0" app/components/layout/sidebar/app-sidebar.tsx
```

### Manual Testing Checklist

#### Accessibility (Phases 1, 4)
- [ ] VoiceOver/NVDA announces "Chat history" heading
- [ ] Reduced motion: Animations disabled when OS preference set

#### Touch & Interaction (Phases 2, 3, 8)
- [ ] Tap targets are ~44-48px on mobile (use Chrome DevTools)
- [ ] Can't accidentally drag chat items
- [ ] Keyboard shortcuts hidden on touch devices

#### Visual & Layout (Phases 9, 10)
- [ ] Menu item spacing feels tighter (6px gap vs 8px)
- [ ] Section headers have consistent padding
- [ ] New Chat/Search buttons stay visible when scrolling
- [ ] Sticky header has subtle bottom fade

#### Collapsible Sections (Phases 5, 6)
- [ ] Chevron icon rotates on expand/collapse
- [ ] Click section header to toggle visibility
- [ ] Refresh page - collapsed state persists

#### Scroll Behavior (Phase 7)
- [ ] Top shadow appears when scrolled from top
- [ ] Bottom shadow appears when more content below
- [ ] Shadows fade smoothly

#### RTL Support (Phase 2)
- [ ] Test with Arabic/Hebrew text - direction is correct

### Browser Testing Matrix

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✓ Required | ✓ Required |
| Firefox | ✓ Required | Optional |
| Safari | ✓ Required | ✓ Required (iOS) |
| Edge | Optional | Optional |

### Performance Check

```bash
# Check bundle size impact (before vs after)
bun run build 2>&1 | grep -A5 "Route"
```

---

## Commit Strategy

Commit after each phase for clean git history:

```
feat(sidebar): add screen reader heading for accessibility
feat(sidebar): prevent drag and add RTL support to items
feat(sidebar): add touch device optimizations
feat(sidebar): add reduced motion support
feat(sidebar): create CollapsibleSection component
feat(sidebar): implement collapsible date sections
feat(sidebar): add scroll shadow indicators
feat(sidebar): hide keyboard shortcuts on touch devices
```

---

## Error Recovery Guide

### Common Errors and Solutions

#### Lint Error: "Component is not exported"
```bash
# Check the export statement
grep -n "export" components/ui/collapsible-section.tsx
# Ensure it's: export function CollapsibleSection
```

#### Type Error: "Cannot find module"
```bash
# Ensure file path is correct
ls -la components/ui/collapsible-section.tsx
# Check import path uses @/ alias correctly
```

#### Type Error: "Property 'X' does not exist"
```bash
# Re-read the component props interface
# Ensure you're passing the correct prop names
```

#### Build Error: SSR/Hydration mismatch
```
# Likely caused by localStorage in initial state
# Solution: Use lazy initialization with typeof window check
const [state, setState] = useState(() => {
  if (typeof window !== "undefined") {
    return localStorage.getItem(key) ?? defaultValue
  }
  return defaultValue
})
```

#### Runtime Error: "ResizeObserver loop limit exceeded"
```
# This is a benign error in development
# Safe to ignore or add debounce to ResizeObserver callback
```

### Rollback Commands

```bash
# Revert last commit (keeps changes staged)
git reset --soft HEAD~1

# Revert last commit (discards changes)
git reset --hard HEAD~1

# Revert a specific phase commit
git log --oneline -10  # Find commit hash
git revert <commit-hash>

# Discard all uncommitted changes
git checkout -- .
```

### If Build Fails After All Phases

```bash
# 1. Check for circular dependencies
bun run typecheck 2>&1 | head -50

# 2. Ensure all imports are correct
grep -r "from.*collapsible-section" app/

# 3. Clear build cache and rebuild
rm -rf .next
bun run build
```

---

## Rollback Plan

Each phase is independent. If issues arise:

1. Revert the specific commit using `git revert <hash>`
2. Or comment out the feature with `// TODO: fix [issue]`
3. Document the issue in NOTES.md for follow-up

---

## Future Improvements (Out of Scope)

These were identified but deferred:

- [ ] Rail/collapsed icon-only mode
- [ ] Resizable sidebar via drag
- [ ] Drag & drop chat reordering
- [ ] Print styles (`print:hidden`)

---

## Visual Reference: ChatGPT CSS Patterns

### CSS Variables Used by ChatGPT

```css
/* Sidebar dimensions */
--sidebar-width: 260px;
--sidebar-rail-width: 56px;  /* collapsed mode */

/* Spacing */
--sidebar-section-margin-top: 1rem;
--sidebar-section-first-margin-top: 0.5rem;
--sidebar-collapsed-section-margin-bottom: 0.25rem;
--sidebar-expanded-section-margin-bottom: 0.5rem;

/* Colors */
--sidebar-bg: var(--bg-elevated-secondary);
--sidebar-mask-bg: var(--bg-elevated-secondary);  /* for sticky/gradient */
```

### ChatGPT Menu Item Structure

```html
<!-- Standard menu item -->
<a class="group __menu-item hoverable" data-sidebar-item="true">
  <div class="flex min-w-0 items-center gap-1.5">
    <div class="icon"><!-- 20x20 SVG --></div>
    <div class="flex min-w-0 grow items-center gap-2.5">
      <div class="truncate">Label</div>
    </div>
  </div>
  <div class="trailing highlight">
    <!-- keyboard shortcuts or action -->
  </div>
</a>

<!-- Chat item with trailing-pair -->
<a class="group __menu-item hoverable" draggable="false">
  <div class="flex min-w-0 grow items-center gap-2.5">
    <div class="truncate" title="Full Title">
      <span dir="auto">Chat Title</span>
    </div>
  </div>
  <div class="trailing-pair">
    <div class="trailing highlight"><!-- options button --></div>
    <div class="trailing"><!-- badges/timestamp --></div>
  </div>
</a>
```

### ChatGPT Section Header

```html
<div class="group/sidebar-expando-section">
  <button aria-expanded="true" class="flex w-full items-center justify-start gap-0.5 px-4 py-1.5">
    <h2 class="__menu-label">Section Name</h2>
    <svg class="h-3 w-3 group-hover:block"><!-- chevron --></svg>
  </button>
  <div id="section-content">
    <!-- items -->
  </div>
</div>
```

### Key Tailwind Classes

| ChatGPT Class | Tailwind Equivalent | Purpose |
|---------------|---------------------|---------|
| `icon-lg` | `w-5 h-5` (20px) | Standard icon |
| `icon-sm` | `w-4 h-4` (16px) | Small icon |
| `icon` | `w-5 h-5` | Alias for lg |
| `__menu-item` | Custom component | Menu item base |
| `hoverable` | `hover:bg-accent` | Hover state |
| `trailing` | `ml-auto` | Right-aligned |
| `trailing-pair` | `flex gap-1` | Two trailing slots |

---

## Changelog

| Date | Phase | Status | Notes |
|------|-------|--------|-------|
| 2026-02-01 | Plan created | ✓ | Initial 8-phase plan |
| 2026-02-01 | Phase 8 | ✓ | Already implemented (pointer-coarse:hidden) |
| 2026-02-01 | Phases 9-10 added | ✓ | Visual parity and sticky actions |
| 2026-02-01 | Visual reference added | ✓ | ChatGPT CSS patterns documented |
| 2026-02-01 | **Plan reviewed** | ✓ | Fixed: animation, hydration, gradient, removed unused CSS vars |
