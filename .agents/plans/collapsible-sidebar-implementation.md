# Collapsible Sidebar Implementation Plan

> **Status**: Ready for Implementation  
> **Priority**: High  
> **Complexity**: Medium  
> **Estimated Changes**: 6-8 files  
> **Last Reviewed**: 2026-02-01

---

## Review Summary

### Identified Issues (Resolved)

| Issue | Resolution |
|-------|------------|
| **Naming collision**: Custom `SidebarMenuItem` vs Shadcn's `SidebarMenuItem` | Keep both - they serve different purposes. Custom one is for action items, Shadcn's is a list wrapper. Rename custom to `SidebarActionItem` in future refactor (out of scope). |
| **UserMenu inner content won't auto-hide** | Add explicit `group-data-[collapsible=icon]:hidden` to text elements inside `SidebarMenuButton`. |
| **SidebarProject not addressed** | Hide entirely when collapsed (simple approach). |
| **Empty state looks broken at 48px** | Hide empty state when collapsed. |
| **Dual HistoryTrigger is verbose** | Accepted trade-off. Refactoring HistoryTrigger is out of scope. |
| **Step ordering confusing** | Renumbered to match execution order. |

### Open Questions (Answered)

| Question | Decision |
|----------|----------|
| What icon for Home link? | Use `NawIcon` (app logo) for brand consistency |
| SidebarProject behavior? | Hide when collapsed - projects need context |
| Empty state when collapsed? | Hide - show only action buttons |
| Touch targets at 48px? | 36px buttons (h-9 w-9) are acceptable; rely on tooltips |
| Animation easing? | Keep `ease-linear` for now; revisit if jarring |
| Header toggle needed? | Yes, for discoverability when collapsed |

### Already Working (No Changes Needed)

- ✅ Cookie persistence (SidebarProvider handles this)
- ✅ Keyboard shortcut Cmd+B (already implemented)
- ✅ Width CSS variables defined
- ✅ TooltipProvider wrapping (Shadcn sidebar includes it)

---

## Objective

Implement a ChatGPT-style collapsible sidebar that **minimizes to an icon rail** instead of completely hiding. When collapsed, the sidebar shows only icons (with tooltips on hover) at ~48px width. When expanded, it shows full labels at ~256px width.

## Current State

### What We Have
- Shadcn sidebar component with `collapsible="offcanvas"` mode
- This completely hides the sidebar off-screen when collapsed
- No icon-only state exists
- Mobile uses Sheet component (this stays the same)

### Key Files
```
components/ui/sidebar.tsx              # Shadcn base component (already supports "icon" mode!)
app/components/layout/sidebar/
├── app-sidebar.tsx                    # Main sidebar component
├── sidebar-menu-item.tsx              # Individual menu items
├── sidebar-item.tsx                   # Chat list items
├── sidebar-list.tsx                   # Section lists
└── sidebar-project.tsx                # Project section
```

## Implementation Steps

### Step 1: Change Collapsible Mode

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

Change the `Sidebar` component's `collapsible` prop:

```tsx
// BEFORE:
<Sidebar
  collapsible="offcanvas"
  variant="sidebar"
  className="border-border/40 border-r bg-transparent"
>

// AFTER:
<Sidebar
  collapsible="icon"
  variant="sidebar"
  className="border-border/40 border-r bg-transparent"
>
```

### Step 2: Add Sidebar Toggle Button

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

Add a toggle button in the header that works on desktop:

```tsx
import { useSidebar, SidebarTrigger } from "@/components/ui/sidebar"

// Inside SidebarHeader, update the content:
<SidebarHeader className="h-14 px-2">
  <div className="flex h-full items-center justify-between">
    {/* Logo/Home link - visible in both states */}
    <Link
      href="/"
      className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
      data-sidebar-item="true"
    >
      <HugeiconsIcon icon={Home01Icon} size={20} />
    </Link>
    
    {/* Toggle button - hidden when collapsed (icon mode shows tooltip instead) */}
    <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
  </div>
</SidebarHeader>
```

### Step 3: Update SidebarMenuItem for Icon Mode

**File**: `app/components/layout/sidebar/sidebar-menu-item.tsx`

The component needs to:
1. Hide the label when collapsed
2. Show a tooltip with the label when collapsed

```tsx
"use client"

import { cn } from "@/lib/utils"
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { forwardRef } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSidebar } from "@/components/ui/sidebar"

type SidebarMenuItemProps = {
  icon: IconSvgElement
  label: string
  href?: string
  onClick?: () => void
  trailing?: React.ReactNode
  testId?: string
  className?: string
  isActive?: boolean
}

const baseClassName =
  "group/menu-item hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center gap-2 rounded-md bg-transparent px-2 py-2 pointer-coarse:py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// Icon-only styles when sidebar is collapsed
const collapsedClassName =
  "group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"

export const SidebarMenuItem = forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  SidebarMenuItemProps
>(function SidebarMenuItem(
  { icon, label, href, onClick, trailing, testId, className, isActive },
  ref
) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const content = (
    <>
      <HugeiconsIcon
        icon={icon}
        size={20}
        className="shrink-0 group-disabled/menu-item:opacity-50"
      />
      {/* Hide label and trailing when collapsed */}
      <div className="flex min-w-0 grow items-center gap-1.5 group-data-[collapsible=icon]:hidden">
        <span className="truncate">{label}</span>
      </div>
      {trailing && (
        <div className="text-muted-foreground ml-auto opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
          {trailing}
        </div>
      )}
    </>
  )

  const combinedClassName = cn(
    baseClassName,
    collapsedClassName,
    isActive && "bg-accent",
    className
  )

  const itemElement = href ? (
    <Link
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={href}
      className={combinedClassName}
      data-testid={testId}
      data-sidebar-item="true"
      prefetch
    >
      {content}
    </Link>
  ) : (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={combinedClassName}
      data-testid={testId}
      data-sidebar-item="true"
    >
      {content}
    </button>
  )

  // Wrap in tooltip when collapsed
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{itemElement}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return itemElement
})
```

### Step 4 & 5: Hide Content When Collapsed (Simplified)

> **Updated Approach**: Instead of modifying `sidebar-item.tsx` and `sidebar-list.tsx` individually, we wrap all collapsible content in a single div with `group-data-[collapsible=icon]:hidden`.

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

Wrap `SidebarProject`, chat lists, and empty state in a hidden-when-collapsed div:

```tsx
{/* Hide project and chat lists when collapsed */}
<div className="group-data-[collapsible=icon]:hidden">
  <SidebarProject />
  {isLoading ? (
    <div className="h-full" />
  ) : hasChats ? (
    <div className="space-y-4">
      {pinnedChats.length > 0 && (
        <SidebarList ... />
      )}
      {groupedChats?.map((group) => (
        <SidebarList ... />
      ))}
    </div>
  ) : (
    <div className="flex py-20 flex-col items-center justify-center">
      {/* Empty state */}
    </div>
  )}
</div>
```

**Benefits of this approach**:
- No changes needed to `sidebar-item.tsx`, `sidebar-list.tsx`, or `sidebar-project.tsx`
- Single point of control
- Easier to test and revert

**Original approach** (kept for reference if per-component control is needed later):

<details>
<summary>Individual component modifications</summary>

**sidebar-item.tsx**:
```tsx
import { useSidebar } from "@/components/ui/sidebar"

// Inside the component:
const { state } = useSidebar()
if (state === "collapsed") return null
```

**sidebar-list.tsx**:
```tsx
import { useSidebar } from "@/components/ui/sidebar"

// Inside component:
const { state } = useSidebar()
if (state === "collapsed") return null
```
</details>

### Step 6: Update Sticky Actions Area

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

The sticky top section needs adjustments for collapsed state:

```tsx
{/* Sticky action buttons - always visible */}
<div className="sticky top-0 z-20 bg-sidebar pb-2 pt-3 group-data-[collapsible=icon]:pt-2 group-data-[collapsible=icon]:pb-0">
  <div className="flex w-full flex-col items-start gap-0 group-data-[collapsible=icon]:items-center">
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
    {/* Search trigger - hide in collapsed mode or show icon-only */}
    <div className="group-data-[collapsible=icon]:hidden">
      <HistoryTrigger
        hasSidebar={false}
        classNameTrigger="..."
        icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
        label={...}
        hasPopover={false}
      />
    </div>
    {/* Icon-only search button for collapsed state */}
    <div className="hidden group-data-[collapsible=icon]:block">
      <HistoryTrigger
        hasSidebar={false}
        classNameTrigger="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
        icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
        hasPopover={false}
      />
    </div>
  </div>
  {/* Bottom fade gradient - hide when collapsed */}
  <div
    className="pointer-events-none absolute inset-x-0 -bottom-2 h-4 bg-gradient-to-b from-sidebar to-transparent group-data-[collapsible=icon]:hidden"
    aria-hidden="true"
  />
</div>
```

### Step 7: Update SidebarFooter for Icon Mode

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

The user menu in the footer needs collapsed state handling:

```tsx
<SidebarFooter className="border-border/40 border-t p-2 group-data-[collapsible=icon]:p-1">
  {isLoggedIn ? (
    <UserMenu variant="sidebar" collapsed={state === "collapsed"} />
  ) : (
    <Link
      href="/auth/login"
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
        "h-9 w-full px-4",
        "group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:p-0"
      )}
    >
      <span className="group-data-[collapsible=icon]:hidden">Log in</span>
      <HugeiconsIcon 
        icon={Login01Icon} 
        size={20} 
        className="hidden group-data-[collapsible=icon]:block" 
      />
    </Link>
  )}
</SidebarFooter>
```

### Step 8: Update UserMenu Component

**File**: `app/components/layout/user-menu.tsx`

The UserMenu uses `SidebarMenuButton` which handles button sizing automatically (`group-data-[collapsible=icon]:size-8!`). However, the **inner content** (text, icon) does NOT auto-hide. We must explicitly add hiding classes.

**Changes needed:**

1. Add `tooltip` prop to `SidebarMenuButton` for collapsed hover
2. Add `group-data-[collapsible=icon]:hidden` to the text div and arrow icon

```tsx
// In the sidebar variant section (~line 104):
<SidebarMenuButton 
  size="lg" 
  className="w-full"
  tooltip={user?.display_name || "Account"}  // Shows on hover when collapsed
>
  <Avatar className="size-8 bg-emerald-600">
    <AvatarImage src={user?.profile_image ?? undefined} />
    <AvatarFallback className="bg-emerald-600 text-sm text-white">
      {user?.display_name?.slice(0, 2).toUpperCase()}
    </AvatarFallback>
  </Avatar>
  {/* IMPORTANT: Must explicitly hide - SidebarMenuButton only handles outer sizing */}
  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
    <span className="truncate font-semibold">{user?.display_name}</span>
    <span className="text-muted-foreground truncate text-xs">
      {user?.premium ? "Plus" : "Free"}
    </span>
  </div>
  <HugeiconsIcon 
    icon={ArrowUpDownIcon} 
    size={16} 
    className="text-muted-foreground ml-auto group-data-[collapsible=icon]:hidden" 
  />
</SidebarMenuButton>
```

**Why this matters**: Without explicit hiding, the text gets clipped/squished instead of cleanly hidden, causing visual artifacts.

### Step 9: Update Header Toggle Button

**File**: `app/components/layout/header.tsx`

The header already has a `HeaderSidebarTrigger` component for mobile. Update it to also show when sidebar is collapsed on desktop:

```tsx
import { useSidebar } from "@/components/ui/sidebar"

export function Header({ hasSidebar }: { hasSidebar: boolean }) {
  const isMobile = useBreakpoint(768)
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"
  
  // ... existing code

  return (
    <header className="...">
      <div className="...">
        <div className="-ml-0.5 flex flex-1 items-center gap-2 lg:-ml-2.5">
          <div className="flex flex-1 items-center gap-2">
            <Link href="/" className="...">
              <NawIcon className="mr-1 size-4" />
              {APP_NAME}
            </Link>
            {/* Show toggle on mobile OR when collapsed on desktop */}
            {hasSidebar && (isMobile || isCollapsed) && <HeaderSidebarTrigger />}
          </div>
        </div>
        {/* ... rest of header */}
      </div>
    </header>
  )
}
```

**Note**: The `HeaderSidebarTrigger` component likely calls `useSidebar().toggleSidebar()`. Verify it works for both mobile (opens Sheet) and desktop (expands rail).

## CSS Considerations

### Existing Support in sidebar.tsx

The Shadcn sidebar component already has these classes that activate in icon mode:

```css
/* Gap collapses */
group-data-[collapsible=icon]:w-(--sidebar-width-icon)

/* Container width */
group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+...)]

/* Content overflow hidden */
group-data-[collapsible=icon]:overflow-hidden

/* Labels hidden */
group-data-[collapsible=icon]:-mt-8
group-data-[collapsible=icon]:opacity-0

/* Buttons become square */
group-data-[collapsible=icon]:size-8!
group-data-[collapsible=icon]:p-2!
```

### Width Variables

Already defined in `components/ui/sidebar.tsx`:
```tsx
const SIDEBAR_WIDTH = "16rem"      // 256px expanded
const SIDEBAR_WIDTH_ICON = "3rem"  // 48px collapsed
```

## Testing Checklist

### Functional Tests

| Test | Priority | Notes |
|------|----------|-------|
| ⬜ Toggle button collapses sidebar to icon rail | P0 | Core functionality |
| ⬜ Toggle button expands sidebar | P0 | Core functionality |
| ⬜ Tooltips appear on hover when collapsed | P0 | Verify on: Home, New Chat, Search, User |
| ✅ Keyboard shortcut (Cmd+B) toggles sidebar | P1 | Already implemented - just verify |
| ✅ State persists in cookie across page loads | P1 | Already implemented - just verify |
| ⬜ New Chat button navigates to `/` in both states | P0 | |
| ⬜ Search button opens CommandHistory dialog | P0 | Test both expanded and collapsed |
| ⬜ User menu dropdown opens in both states | P1 | |
| ⬜ Login link works when collapsed | P2 | Only for logged-out users |

### Visual Tests

| Test | Priority | Notes |
|------|----------|-------|
| ⬜ Smooth transition animation (200ms) | P1 | No jarring jumps |
| ⬜ Icons centered in collapsed state (48px rail) | P0 | Verify alignment |
| ⬜ No layout shift in main content area | P0 | Content shouldn't jump |
| ⬜ Proper spacing in both states | P1 | Check padding, gaps |
| ⬜ Hover states work correctly | P1 | Background color change |
| ⬜ Active chat state visible when expanded | P2 | |
| ⬜ Gradient fade hidden when collapsed | P2 | |

### Responsive Tests

| Test | Priority | Notes |
|------|----------|-------|
| ⬜ Mobile (< 768px) uses Sheet behavior | P0 | Swipe from left, full overlay |
| ⬜ Desktop (≥ 768px) uses icon rail | P0 | 48px collapsed width |
| ⬜ Resize from desktop to mobile | P1 | Should switch modes smoothly |

### Accessibility Tests

| Test | Priority | Notes |
|------|----------|-------|
| ⬜ Screen reader announces "Sidebar collapsed/expanded" | P1 | Via `aria-label` or live region |
| ⬜ Focus visible on all interactive elements | P0 | Tab through collapsed state |
| ⬜ Keyboard navigation works (Tab, Enter, Escape) | P0 | |
| ⬜ Tooltips accessible via keyboard focus | P1 | Should appear on focus, not just hover |

### Edge Cases

| Test | Priority | Notes |
|------|----------|-------|
| ⬜ Empty state (no chats) - collapsed looks okay | P2 | Should just show action buttons |
| ⬜ Many chats (50+) - scroll works when expanded | P2 | |
| ⬜ Long chat titles - no overflow issues | P2 | |
| ⬜ User with no profile image - avatar fallback | P2 | |

## Potential Issues & Solutions

### Issue 1: HistoryTrigger Component

**Problem**: `HistoryTrigger` can't easily switch between expanded/collapsed modes internally.

**Solution**: Create two instances with CSS visibility toggling.

```tsx
// Expanded version (has label)
<div className="w-full group-data-[collapsible=icon]:hidden">
  <HistoryTrigger
    hasSidebar={false}
    classNameTrigger="..."
    icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
    label={<span>Search</span>}
    hasPopover={false}
  />
</div>

// Collapsed version (icon only with tooltip)
<Tooltip>
  <TooltipTrigger asChild>
    <div className="hidden group-data-[collapsible=icon]:block">
      <HistoryTrigger
        hasSidebar={false}
        classNameTrigger="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
        icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
        hasPopover={false}
      />
    </div>
  </TooltipTrigger>
  <TooltipContent side="right">Search (⌘K)</TooltipContent>
</Tooltip>
```

**Trade-off**: Verbose, but avoids refactoring `HistoryTrigger`. Consider refactoring in a future PR.

---

### Issue 2: useSidebar Hook Context

**Problem**: Components using `useSidebar()` will throw if rendered outside `SidebarProvider`.

**Impact**: Tests, Storybook, or standalone usage will fail.

**Solution**: The layout wraps everything in `SidebarProvider`, so this works for production. For tests:

```tsx
// In test files, wrap with provider:
import { SidebarProvider } from "@/components/ui/sidebar"

render(
  <SidebarProvider>
    <SidebarMenuItem icon={HomeIcon} label="Home" />
  </SidebarProvider>
)
```

---

### Issue 3: Tooltip Provider Nesting

**Problem**: Shadcn sidebar wraps content in `TooltipProvider`. Our custom tooltips might conflict.

**Solution**: The Shadcn `TooltipProvider` has `delayDuration={0}` set. Nested `<Tooltip>` components work fine - they share the same provider context. No action needed.

---

### Issue 4: Cookie Persistence & Hydration

**Problem**: Cookie-based state could cause hydration mismatches.

**Solution**: Already handled by Shadcn. The `getSidebarStateFromCookie()` function only runs client-side (`if (typeof document === "undefined") return undefined`). Initial render uses `defaultOpen`, then syncs from cookie on mount.

---

### Issue 5: Mobile Behavior

**Problem**: We want Sheet (offcanvas) on mobile, icon-rail on desktop.

**Solution**: Already handled by Shadcn. The `Sidebar` component checks `isMobile` internally:

```tsx
// From components/ui/sidebar.tsx line 196:
if (isMobile) {
  return <Sheet>...</Sheet>  // Mobile uses Sheet
}
return <div data-collapsible={...}>...</div>  // Desktop uses icon mode
```

The `collapsible="icon"` prop only affects desktop behavior.

---

### Issue 6: ScrollArea Padding in Collapsed Mode

**Problem**: `px-3` padding looks odd at 48px width.

**Solution**: Reduce padding when collapsed:

```tsx
<ScrollArea className="flex h-full px-3 group-data-[collapsible=icon]:px-1 ...">
```

---

### Issue 7: SidebarRail as Alternative Toggle

**Problem**: Plan doesn't leverage `SidebarRail` component for edge-hover toggling.

**Decision**: Out of scope for initial implementation. The `SidebarRail` provides a resize-cursor hover zone at the sidebar edge. Can be added later for power users:

```tsx
// Future enhancement:
<Sidebar collapsible="icon">
  {/* ... content ... */}
  <SidebarRail />  {/* Adds hover-to-resize/toggle behavior */}
</Sidebar>
```

## File Change Summary

| File | Change Type | Lines Changed | Description |
|------|-------------|---------------|-------------|
| `app/components/layout/sidebar/app-sidebar.tsx` | **Major** | ~80 | Change collapsible mode, add header with Home/toggle, wrap content in collapse-hide divs, update footer |
| `app/components/layout/sidebar/sidebar-menu-item.tsx` | **Medium** | ~30 | Add `useSidebar()`, collapsed styles, tooltip wrapping |
| `app/components/layout/user-menu.tsx` | **Minor** | ~10 | Add `group-data-[collapsible=icon]:hidden` to text elements |
| `app/components/layout/header.tsx` | **Minor** | ~5 | Add `useSidebar()`, show trigger when collapsed |

### Files NOT Changed (Simplified Approach)

| File | Reason |
|------|--------|
| `sidebar-item.tsx` | Entire chat list hidden via parent div wrapper |
| `sidebar-list.tsx` | Entire section hidden via parent div wrapper |
| `sidebar-project.tsx` | Hidden via parent div wrapper |

> **Note**: The original plan modified `sidebar-item.tsx` and `sidebar-list.tsx` individually. The revised approach wraps all collapsible content in a single `group-data-[collapsible=icon]:hidden` div in `app-sidebar.tsx`, reducing the number of files changed.

## Implementation Order

> Steps renumbered to match execution order (not document order).

| Order | Step | File(s) | Risk |
|-------|------|---------|------|
| 1 | Change `collapsible="icon"` | `app-sidebar.tsx` | Low - immediate visual change |
| 2 | Update `SidebarMenuItem` | `sidebar-menu-item.tsx` | Medium - core functionality |
| 3 | Add toggle button + Home link | `app-sidebar.tsx` | Low |
| 4 | Hide `SidebarProject` when collapsed | `app-sidebar.tsx` | Low |
| 5 | Hide chat lists + empty state | `app-sidebar.tsx` | Low |
| 6 | Update sticky actions (Search) | `app-sidebar.tsx` | Medium - dual instances |
| 7 | Update footer + login link | `app-sidebar.tsx` | Low |
| 8 | Update `UserMenu` content hiding | `user-menu.tsx` | Low |
| 9 | Add header toggle when collapsed | `header.tsx` | Low |
| 10 | **Test** | - | Run through testing checklist |

### Verification After Each Step

After steps 1-3, the sidebar should be functional in collapsed mode. Steps 4-9 are polish.

## Complete Code Examples

### app-sidebar.tsx (Full Updated File)

```tsx
"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useUser } from "@/lib/user-store/provider"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Chat01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { NawIcon } from "@/components/icons/naw"
import { AddCircleIcon } from "@hugeicons-pro/core-bulk-rounded"
import { Pin } from "@/lib/icons"
import { useParams } from "next/navigation"
import { useMemo, useRef } from "react"
import { HistoryTrigger } from "../../history/history-trigger"
import { UserMenu } from "../user-menu"
import { ScrollShadowWrapper } from "./scroll-shadow-wrapper"
import { SidebarList } from "./sidebar-list"
import { SidebarMenuItem } from "./sidebar-menu-item"
import { SidebarProject } from "./sidebar-project"

export function AppSidebar() {
  const isMobile = useBreakpoint(768)
  const { setOpenMobile, state } = useSidebar()
  const isCollapsed = state === "collapsed"
  const { chats, pinnedChats, isLoading } = useChats()
  const { user } = useUser()
  const params = useParams<{ chatId: string }>()
  const currentChatId = params.chatId
  const isLoggedIn = !!user

  const scrollViewportRef = useRef<HTMLDivElement>(null)

  const groupedChats = useMemo(() => {
    const result = groupChatsByDate(chats, "")
    return result
  }, [chats])
  const hasChats = chats.length > 0

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="border-border/40 border-r bg-transparent"
    >
      <SidebarHeader className="h-14 px-2">
        <div className="flex h-full items-center justify-between">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md bg-transparent focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={24} />
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/"
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
                  data-sidebar-item="true"
                >
                  <NawIcon className="size-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Home</TooltipContent>
            </Tooltip>
          )}
          {/* Toggle button - hidden when in icon mode */}
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent className="border-border/40 border-t">
        <h2 className="sr-only">Chat history</h2>
        <ScrollShadowWrapper className="h-full" viewportRef={scrollViewportRef}>
          <ScrollArea
            className="flex h-full px-3 group-data-[collapsible=icon]:px-1 [&>div>div]:!block"
            viewportRef={scrollViewportRef}
          >
            {/* Sticky action buttons - always visible */}
            <div className="sticky top-0 z-20 bg-sidebar pb-2 pt-3 group-data-[collapsible=icon]:pb-0 group-data-[collapsible=icon]:pt-2">
              <div className="flex w-full flex-col items-start gap-0 group-data-[collapsible=icon]:items-center">
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
                {/* Search - expanded version */}
                <div className="w-full group-data-[collapsible=icon]:hidden">
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
                {/* Search - collapsed version (icon only) */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="hidden group-data-[collapsible=icon]:block">
                      <HistoryTrigger
                        hasSidebar={false}
                        classNameTrigger="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
                        icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
                        hasPopover={false}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">Search (⌘K)</TooltipContent>
                </Tooltip>
              </div>
              {/* Bottom fade gradient - hide when collapsed */}
              <div
                className="pointer-events-none absolute inset-x-0 -bottom-2 h-4 bg-gradient-to-b from-sidebar to-transparent group-data-[collapsible=icon]:hidden"
                aria-hidden="true"
              />
            </div>

            {/* Hide project and chat lists when collapsed */}
            <div className="group-data-[collapsible=icon]:hidden">
              <SidebarProject />
              {isLoading ? (
                <div className="h-full" />
              ) : hasChats ? (
                <div className="space-y-4">
                  {pinnedChats.length > 0 && (
                    <SidebarList
                      key="pinned"
                      title="Pinned"
                      icon={<HugeiconsIcon icon={Pin} size={12} />}
                      items={pinnedChats}
                      currentChatId={currentChatId}
                      collapsible={false}
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
                </div>
              ) : (
                <div className="flex py-20 flex-col items-center justify-center">
                  <HugeiconsIcon
                    icon={Chat01Icon}
                    size={24}
                    className="text-muted-foreground mb-1 opacity-40"
                  />
                  <div className="text-muted-foreground text-center">
                    <p className="mb-1 text-base font-medium">No chats yet</p>
                    <p className="text-sm opacity-70">Start a new conversation</p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </ScrollShadowWrapper>
      </SidebarContent>
      <SidebarFooter className="border-border/40 border-t p-2 group-data-[collapsible=icon]:p-1">
        {isLoggedIn ? (
          <UserMenu variant="sidebar" />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/auth/login"
                className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:p-0"
              >
                <span className="group-data-[collapsible=icon]:hidden">Log in</span>
                <NawIcon className="size-5 hidden group-data-[collapsible=icon]:block" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="hidden group-data-[collapsible=icon]:block">
              Log in
            </TooltipContent>
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
```

### sidebar-menu-item.tsx (Full Updated File)

```tsx
"use client"

import { cn } from "@/lib/utils"
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { forwardRef } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSidebar } from "@/components/ui/sidebar"

type SidebarMenuItemProps = {
  /** Icon component from Hugeicons */
  icon: IconSvgElement
  /** Label text */
  label: string
  /** Navigation href - renders as Link if provided */
  href?: string
  /** Click handler - used when no href (e.g., opens modal) */
  onClick?: () => void
  /** Trailing content (keyboard shortcuts, badges, etc.) */
  trailing?: React.ReactNode
  /** Test ID for e2e testing */
  testId?: string
  /** Additional className */
  className?: string
  /** Whether item is currently active */
  isActive?: boolean
}

const baseClassName =
  "group/menu-item hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center gap-2 rounded-md bg-transparent px-2 py-2 pointer-coarse:py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// Icon-only styles when sidebar is collapsed
const collapsedClassName =
  "group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"

/**
 * Unified sidebar menu item component with icon mode support.
 *
 * - Uses <Link> for navigation items (SEO, prefetch, right-click menu)
 * - Uses <button> for interactive items (modals, actions)
 * - Shows tooltip with label when sidebar is collapsed
 * - Consistent icon sizing (20x20)
 */
export const SidebarMenuItem = forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  SidebarMenuItemProps
>(function SidebarMenuItem(
  { icon, label, href, onClick, trailing, testId, className, isActive },
  ref
) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const content = (
    <>
      <HugeiconsIcon
        icon={icon}
        size={20}
        className="shrink-0 group-disabled/menu-item:opacity-50"
      />
      {/* Hide label when collapsed */}
      <div className="flex min-w-0 grow items-center gap-1.5 group-data-[collapsible=icon]:hidden">
        <span className="truncate">{label}</span>
      </div>
      {/* Hide trailing when collapsed */}
      {trailing && (
        <div className="text-muted-foreground ml-auto opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
          {trailing}
        </div>
      )}
    </>
  )

  const combinedClassName = cn(
    baseClassName,
    collapsedClassName,
    isActive && "bg-accent",
    className
  )

  const itemElement = href ? (
    <Link
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={href}
      className={combinedClassName}
      data-testid={testId}
      data-sidebar-item="true"
      prefetch
    >
      {content}
    </Link>
  ) : (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={combinedClassName}
      data-testid={testId}
      data-sidebar-item="true"
    >
      {content}
    </button>
  )

  // Wrap in tooltip when collapsed
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{itemElement}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return itemElement
})
```

### header.tsx (Updated Portion)

```tsx
// Add import at top:
import { useSidebar } from "@/components/ui/sidebar"

// Inside the component:
export function Header({ hasSidebar }: { hasSidebar: boolean }) {
  const isMobile = useBreakpoint(768)
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"
  // ... rest of existing variables

  return (
    <header className="...">
      {/* ... existing structure ... */}
      <div className="flex flex-1 items-center gap-2">
        <Link href="/" className="...">
          <NawIcon className="mr-1 size-4" />
          {APP_NAME}
        </Link>
        {/* Updated: Show on mobile OR when collapsed on desktop */}
        {hasSidebar && (isMobile || isCollapsed) && <HeaderSidebarTrigger />}
      </div>
      {/* ... rest of header */}
    </header>
  )
}
```

## Tailwind Classes Reference

### Key Group Data Selectors

| Selector | When Applied |
|----------|--------------|
| `group-data-[collapsible=icon]:*` | Sidebar is in collapsed (icon) mode |
| `group-data-[state=collapsed]:*` | Alternative selector for collapsed state |
| `group-data-[state=expanded]:*` | Sidebar is expanded |

### Common Patterns

```css
/* Hide element when collapsed */
.group-data-[collapsible=icon]:hidden

/* Show element only when collapsed */
.hidden .group-data-[collapsible=icon]:block

/* Make square button when collapsed */
.group-data-[collapsible=icon]:w-9 
.group-data-[collapsible=icon]:h-9 
.group-data-[collapsible=icon]:p-0 
.group-data-[collapsible=icon]:justify-center

/* Reduce padding when collapsed */
.group-data-[collapsible=icon]:px-1
.group-data-[collapsible=icon]:p-1
```

## Architecture Decisions

### Why Wrap Content vs Modify Each Component

**Decision**: Wrap collapsible content in a single `group-data-[collapsible=icon]:hidden` div rather than modifying `sidebar-item.tsx`, `sidebar-list.tsx`, and `sidebar-project.tsx` individually.

**Pros**:
- Fewer files changed (4 vs 6)
- Single point of control
- Easier to revert if needed
- No risk of forgetting a component

**Cons**:
- Entire sections disappear rather than graceful degradation
- No per-item collapsed representation (e.g., showing chat icons)

**Future Alternative**: For a richer collapsed experience (like showing recent chat icons), you'd need to modify each component to have a collapsed variant.

---

### Why Keep Custom SidebarMenuItem

**Decision**: Keep the custom `SidebarMenuItem` in `app/components/layout/sidebar/` rather than refactoring to use Shadcn's `SidebarMenuButton`.

**Rationale**:
- Custom component is tailored for action items (New Chat, Search)
- Has specific styling (larger touch targets, keyboard shortcut trailing)
- Shadcn's `SidebarMenuButton` is designed for menu items within `SidebarMenu`/`SidebarMenuItem` wrappers
- Refactoring would require changing the HTML structure

**Future**: Consider consolidating in a larger sidebar refactor.

---

## Future Enhancements

| Enhancement | Effort | Value |
|-------------|--------|-------|
| Add `SidebarRail` for edge-hover toggle | Low | Medium |
| Refactor `HistoryTrigger` to support collapsed prop | Medium | Medium |
| Show recent chat icons when collapsed | High | High |
| Rename custom `SidebarMenuItem` to `SidebarActionItem` | Low | Low |
| Add animation polish (stagger, spring) | Low | Low |

---

## References

- [Shadcn Sidebar Docs](https://ui.shadcn.com/docs/components/sidebar)
- ChatGPT Sidebar HTML analysis (provided by user)
- Existing implementation in `components/ui/sidebar.tsx`

## Implementation Notes

- The Shadcn sidebar component already has excellent support for icon mode
- Most of the work is updating app-specific components to respect the collapsed state
- Use `group-data-[collapsible=icon]:` prefix for collapsed-state styling
- The `useSidebar()` hook provides `state: "expanded" | "collapsed"`
- The `HeaderSidebarTrigger` component already uses `toggleSidebar()` which works for both modes
- Mobile continues to use Sheet (offcanvas) behavior - this is handled automatically by Shadcn

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-01 | Added review summary, resolved open questions, renumbered steps, updated UserMenu guidance, added architecture decisions |
| 2026-01-XX | Initial plan created |
