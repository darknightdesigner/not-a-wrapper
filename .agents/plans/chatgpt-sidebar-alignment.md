# ChatGPT Sidebar Alignment Implementation

> **Status**: Ready for Implementation  
> **Priority**: High  
> **Complexity**: Medium-High  
> **Estimated Changes**: 4-6 files  
> **Created**: 2026-02-01  
> **Prerequisites**: Collapsible sidebar already implemented (`collapsible="icon"` mode working)

---

## Objective

Align our sidebar implementation with ChatGPT's production sidebar patterns for improved UX, smoother animations, better accessibility, and more maintainable code. This document provides complete context for AI agents to implement these changes.

---

## Reference: ChatGPT's Collapsed Sidebar HTML

```html
<!-- ChatGPT's collapsed sidebar structure -->
<div class="border-token-border-light relative z-21 h-full shrink-0 overflow-hidden border-e max-md:hidden" 
     id="stage-slideover-sidebar" 
     style="width: var(--sidebar-rail-width); background-color: var(--sidebar-bg, var(--bg-primary));">
  <div class="relative flex h-full flex-col">
    
    <!-- Collapsed Rail (visible when collapsed) -->
    <div id="stage-sidebar-tiny-bar" 
         class="group/tiny-bar flex h-full w-(--sidebar-rail-width) cursor-e-resize flex-col items-start bg-transparent pb-1.5 motion-safe:transition-colors rtl:cursor-w-resize absolute inset-0 opacity-100 motion-safe:ease-[steps(1,start)] motion-safe:transition-opacity motion-safe:duration-150">
      
      <!-- Header with toggle button -->
      <div class="h-header-height flex items-center justify-center">
        <button class="flex h-9 w-9 items-center justify-center rounded-lg mx-2 cursor-e-resize rtl:cursor-w-resize" 
                aria-label="Open sidebar">
          <!-- Default icon (visible normally) -->
          <svg class="icon-lg -m-1 group-hover/tiny-bar:hidden group-focus-visible:hidden">...</svg>
          <!-- Hover icon (visible on hover) -->
          <svg class="icon hidden group-hover/tiny-bar:block group-focus-visible:block">...</svg>
        </button>
      </div>
      
      <!-- Menu items -->
      <div class="mt-(--sidebar-section-first-margin-top)">
        <a class="group __menu-item hoverable gap-1.5" data-sidebar-item="true" href="/">
          <div class="flex items-center justify-center icon">
            <svg class="icon" width="20" height="20">...</svg>
          </div>
        </a>
        <!-- More items... -->
      </div>
      
      <!-- Spacer -->
      <div class="pointer-events-none flex-grow"></div>
      
      <!-- Footer with user avatar -->
      <div class="mb-1">
        <div class="group __menu-item p-2" data-sidebar-item="true">
          <div class="flex items-center justify-center icon-lg">
            <img class="h-6 w-6 shrink-0 rounded-full object-cover" alt="Profile">
          </div>
        </div>
      </div>
    </div>
    
    <!-- Expanded Content (pre-rendered, hidden with opacity-0 + inert when collapsed) -->
    <div class="pointer-events-none opacity-0 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-linear h-full w-(--sidebar-width) overflow-x-clip overflow-y-auto" 
         inert="">
      <!-- Full expanded sidebar content here -->
    </div>
    
  </div>
</div>
```

---

## Key Patterns to Implement

### 1. Pre-Rendered Dual-Layer Approach

**Current approach (ours):**
- Content is conditionally hidden with `group-data-[collapsible=icon]:hidden`
- Elements pop in/out instantly

**ChatGPT approach:**
- Both collapsed AND expanded content are always rendered
- Collapsed rail: `opacity-100` when collapsed, `opacity-0` when expanded
- Expanded content: `opacity-0` + `inert` when collapsed, `opacity-100` when expanded
- Smooth crossfade animation between states

**Benefits:**
- Smoother transitions (opacity vs display toggle)
- Content dimensions are always calculated (no layout shift)
- Better perceived performance

### 2. CSS Variables for Spacing

**ChatGPT's CSS variables:**
```css
:root {
  --sidebar-width: 260px;
  --sidebar-rail-width: 52px;
  --sidebar-bg: var(--bg-primary);
  --header-height: 56px;
  --sidebar-section-first-margin-top: 8px;
  --sidebar-section-margin-top: 16px;
  --sidebar-collapsed-section-margin-bottom: 4px;
  --sidebar-expanded-section-margin-bottom: 8px;
}
```

### 3. Resize Cursor Affordance

ChatGPT uses `cursor-e-resize` (or `cursor-w-resize` for RTL) on the collapsed rail and toggle button to indicate the sidebar can be expanded by dragging/clicking.

### 4. Icon Wrapper Pattern

ChatGPT wraps icons in a container for consistent alignment:
```html
<div class="flex items-center justify-center icon">
  <svg class="icon" width="20" height="20">...</svg>
</div>
```

### 5. Compact Footer Avatar

When collapsed, avatar is 24px (`h-6 w-6`) instead of our 32px (`size-8`).

### 6. Motion-Safe Transitions

All animations are wrapped in `motion-safe:` for accessibility:
```css
motion-safe:transition-colors
motion-safe:transition-opacity
motion-safe:duration-150
motion-safe:ease-linear
```

---

## Implementation Steps

### Step 1: Add CSS Variables

**File**: `app/globals.css`

Add these CSS variables to the `:root` selector:

```css
:root {
  /* Existing variables... */
  
  /* Sidebar spacing variables */
  --sidebar-width: 16rem; /* 256px */
  --sidebar-rail-width: 3rem; /* 48px */
  --sidebar-header-height: 3.5rem; /* 56px - matches h-14 */
  --sidebar-section-first-margin-top: 0.5rem; /* 8px */
  --sidebar-section-margin-top: 1rem; /* 16px */
  --sidebar-collapsed-section-margin-bottom: 0.25rem; /* 4px */
  --sidebar-expanded-section-margin-bottom: 0.5rem; /* 8px */
  --sidebar-item-gap: 0.375rem; /* 6px - gap-1.5 */
}
```

Update `components/ui/sidebar.tsx` to use these variables:

```tsx
// Replace hardcoded values
const SIDEBAR_WIDTH = "var(--sidebar-width)"
const SIDEBAR_WIDTH_ICON = "var(--sidebar-rail-width)"
```

---

### Step 2: Update Sidebar Structure for Dual-Layer Rendering

**File**: `app/components/layout/sidebar/app-sidebar.tsx`

Restructure to have both collapsed rail and expanded content always rendered:

```tsx
"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { NawIcon } from "@/components/icons/naw"
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
import { cn } from "@/lib/utils"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Chat01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
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
      {/* 
        Dual-layer structure (ChatGPT pattern):
        - Collapsed rail: Always rendered, visible when collapsed
        - Expanded content: Always rendered, visible when expanded
        Both use opacity transitions for smooth crossfade
      */}
      
      {/* === COLLAPSED RAIL === */}
      <div
        className={cn(
          "absolute inset-0 z-10 flex h-full w-(--sidebar-rail-width) flex-col items-center",
          "cursor-e-resize bg-transparent pb-1.5 rtl:cursor-w-resize",
          "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-linear",
          // Visibility based on state
          isCollapsed 
            ? "pointer-events-auto opacity-100" 
            : "pointer-events-none opacity-0"
        )}
        aria-hidden={!isCollapsed}
      >
        {/* Header */}
        <div className="flex h-(--sidebar-header-height) w-full items-center justify-center">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md bg-transparent motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={24} />
            </button>
          ) : (
            <CollapsedHeaderToggle />
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-(--sidebar-section-first-margin-top) flex flex-col items-center gap-(--sidebar-item-gap)">
          <CollapsedMenuItem
            icon={AddCircleIcon}
            label="New Chat"
            href="/"
            shortcut="⇧⌘O"
          />
          <CollapsedMenuItem
            icon={Search01Icon}
            label="Search"
            shortcut="⌘K"
            onClick={() => {
              // Trigger search dialog
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
            }}
          />
        </div>

        {/* Spacer */}
        <div className="pointer-events-none flex-grow" />

        {/* Footer */}
        <div className="mb-1 w-full px-1">
          <CollapsedUserAvatar user={user} />
        </div>
      </div>

      {/* === EXPANDED CONTENT === */}
      <div
        className={cn(
          "flex h-full w-full flex-col",
          "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-linear",
          // Visibility based on state
          isCollapsed 
            ? "pointer-events-none opacity-0" 
            : "pointer-events-auto opacity-100"
        )}
        // `inert` prevents focus/interaction when hidden (ChatGPT pattern)
        {...(isCollapsed ? { inert: "" } : {})}
      >
        <SidebarHeader className="h-(--sidebar-header-height) px-2">
          <div className="flex h-full items-center justify-between">
            {isMobile ? (
              <button
                type="button"
                onClick={() => setOpenMobile(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md bg-transparent motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={24} />
              </button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/"
                    className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent motion-safe:transition-colors"
                    data-sidebar-item="true"
                  >
                    <NawIcon className="size-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Home</TooltipContent>
              </Tooltip>
            )}
            {/* Toggle button with resize cursor */}
            <SidebarTrigger className="cursor-w-resize rtl:cursor-e-resize" />
          </div>
        </SidebarHeader>

        <SidebarContent className="border-border/40 border-t">
          <h2 className="sr-only">Chat history</h2>
          <ScrollShadowWrapper className="h-full" viewportRef={scrollViewportRef}>
            <ScrollArea
              className="flex h-full px-3 [&>div>div]:!block"
              viewportRef={scrollViewportRef}
            >
              {/* Sticky action buttons */}
              <div className="sticky top-0 z-20 bg-sidebar pb-2 pt-(--sidebar-section-first-margin-top)">
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
                    classNameTrigger="group/menu-item hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center gap-(--sidebar-item-gap) rounded-md bg-transparent px-2 py-2 text-sm motion-safe:transition-colors"
                    icon={<HugeiconsIcon icon={Search01Icon} size={20} />}
                    label={
                      <div className="flex min-w-0 grow items-center gap-(--sidebar-item-gap)">
                        <span className="truncate">Search</span>
                        <div className="text-muted-foreground ml-auto opacity-0 motion-safe:transition-opacity group-hover/menu-item:opacity-100">
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
                {/* Bottom fade gradient */}
                <div
                  className="pointer-events-none absolute inset-x-0 -bottom-2 h-4 bg-gradient-to-b from-sidebar to-transparent"
                  aria-hidden="true"
                />
              </div>

              {/* Project and chat lists */}
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
            </ScrollArea>
          </ScrollShadowWrapper>
        </SidebarContent>

        <SidebarFooter className="border-border/40 border-t px-2 pb-1.5 pt-2">
          {isLoggedIn ? (
            <UserMenu variant="sidebar" />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/auth/login"
                  className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium motion-safe:transition-colors"
                >
                  Log in
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Log in</TooltipContent>
            </Tooltip>
          )}
        </SidebarFooter>
      </div>
    </Sidebar>
  )
}

/* ============================================
   COLLAPSED RAIL COMPONENTS
   ============================================ */

/**
 * Header toggle button for collapsed state.
 * Shows logo by default, swaps to expand arrow on hover.
 */
function CollapsedHeaderToggle() {
  const { toggleSidebar } = useSidebar()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          className="group/toggle flex h-9 w-9 items-center justify-center rounded-lg cursor-e-resize rtl:cursor-w-resize hover:bg-accent motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="Open sidebar"
        >
          {/* Default: Logo icon */}
          <NawIcon className="size-5 group-hover/toggle:hidden group-focus-visible/toggle:hidden" />
          {/* Hover: Expand arrow */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hidden group-hover/toggle:block group-focus-visible/toggle:block"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Open sidebar (⌘B)</TooltipContent>
    </Tooltip>
  )
}

/**
 * Menu item for collapsed rail.
 * Follows ChatGPT's icon wrapper pattern for alignment.
 */
function CollapsedMenuItem({
  icon,
  label,
  href,
  onClick,
  shortcut,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  href?: string
  onClick?: () => void
  shortcut?: string
}) {
  const Icon = icon
  
  const content = (
    <div className="flex items-center justify-center">
      <Icon size={20} />
    </div>
  )

  const className = cn(
    "flex h-9 w-9 items-center justify-center rounded-lg",
    "hover:bg-accent motion-safe:transition-colors",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
  )

  const tooltipContent = shortcut ? `${label} (${shortcut})` : label

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className={className} data-sidebar-item="true">
            {content}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className={className}
            data-sidebar-item="true"
          >
            {content}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{tooltipContent}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Compact user avatar for collapsed rail.
 * 24px (h-6 w-6) matching ChatGPT's pattern.
 */
function CollapsedUserAvatar({ user }: { user: { display_name?: string; profile_image?: string | null } | null }) {
  const { toggleSidebar } = useSidebar()

  if (!user) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/auth/login"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent motion-safe:transition-colors mx-auto"
          >
            <NawIcon className="size-5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Log in</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent motion-safe:transition-colors mx-auto focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label={`${user.display_name} - Open profile`}
        >
          <div className="flex items-center justify-center">
            {user.profile_image ? (
              <img
                src={user.profile_image}
                alt=""
                className="h-6 w-6 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white">
                {user.display_name?.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{user.display_name || "Account"}</TooltipContent>
    </Tooltip>
  )
}
```

---

### Step 3: Update SidebarMenuItem with Icon Wrapper

**File**: `app/components/layout/sidebar/sidebar-menu-item.tsx`

Add the icon wrapper pattern and motion-safe transitions:

```tsx
"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { forwardRef } from "react"

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

const baseClassName = cn(
  "group/menu-item relative inline-flex w-full items-center rounded-md bg-transparent text-sm",
  // Spacing using CSS variables
  "gap-(--sidebar-item-gap) px-2 py-2 pointer-coarse:py-3",
  // Colors and transitions
  "text-primary hover:bg-accent/80 hover:text-foreground",
  "motion-safe:transition-colors",
  // Focus states
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
)

/**
 * Unified sidebar menu item component.
 * 
 * Features:
 * - Icon wrapper pattern (ChatGPT style) for consistent alignment
 * - motion-safe: transitions for reduced motion support
 * - CSS variables for spacing
 * - Tooltip support when sidebar is collapsed
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
      {/* Icon wrapper (ChatGPT pattern) for consistent alignment */}
      <div className="flex items-center justify-center shrink-0">
        <HugeiconsIcon
          icon={icon}
          size={20}
          className="group-disabled/menu-item:opacity-50"
        />
      </div>
      {/* Label - hidden when collapsed */}
      <div className="flex min-w-0 grow items-center gap-(--sidebar-item-gap) group-data-[collapsible=icon]:hidden">
        <span className="truncate">{label}</span>
      </div>
      {/* Trailing content - hidden when collapsed */}
      {trailing && (
        <div className="text-muted-foreground ml-auto opacity-0 motion-safe:transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
          {trailing}
        </div>
      )}
    </>
  )

  const combinedClassName = cn(
    baseClassName,
    // Icon-only styles when collapsed
    "group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center",
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

---

### Step 4: Update UserMenu Footer Avatar Size

**File**: `app/components/layout/user-menu.tsx`

Update avatar sizing for collapsed state:

```tsx
// In the sidebar variant section, update the Avatar:
<Avatar className="size-8 group-data-[collapsible=icon]:size-6 bg-emerald-600 motion-safe:transition-[width,height]">
  <AvatarImage src={user?.profile_image ?? undefined} />
  <AvatarFallback className="bg-emerald-600 text-sm group-data-[collapsible=icon]:text-xs text-white">
    {user?.display_name?.slice(0, 2).toUpperCase()}
  </AvatarFallback>
</Avatar>
```

Also update the text container with motion-safe:

```tsx
<div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden motion-safe:transition-opacity">
  <span className="truncate font-semibold">{user?.display_name}</span>
  <span className="text-muted-foreground truncate text-xs">
    {user?.premium ? "Plus" : "Free"}
  </span>
</div>
```

---

### Step 5: Update SidebarTrigger with Resize Cursor

**File**: `components/ui/sidebar.tsx`

Update the `SidebarTrigger` component to include resize cursor:

```tsx
function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, state } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn(
        "size-9 rounded-lg",
        // Resize cursor indicates expandability
        state === "collapsed" 
          ? "cursor-e-resize rtl:cursor-w-resize" 
          : "cursor-w-resize rtl:cursor-e-resize",
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <HugeiconsIcon icon={PanelLeft} size={20} />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}
```

---

### Step 6: Update Header Toggle Visibility

**File**: `app/components/layout/header.tsx`

The header toggle should NOT show when sidebar is collapsed (since the collapsed rail has its own toggle):

```tsx
// Keep existing behavior - header toggle only shows on mobile
// The collapsed rail has its own toggle button
{hasSidebar && isMobile && <HeaderSidebarTrigger />}
```

---

## CSS Variables Reference

Add to `app/globals.css`:

```css
:root {
  /* Sidebar dimensions */
  --sidebar-width: 16rem;
  --sidebar-rail-width: 3rem;
  --sidebar-header-height: 3.5rem;
  
  /* Sidebar spacing */
  --sidebar-section-first-margin-top: 0.5rem;
  --sidebar-section-margin-top: 1rem;
  --sidebar-collapsed-section-margin-bottom: 0.25rem;
  --sidebar-expanded-section-margin-bottom: 0.5rem;
  --sidebar-item-gap: 0.375rem;
  
  /* Sidebar colors (optional - can use existing theme tokens) */
  --sidebar-bg: hsl(var(--background));
  --sidebar-border: hsl(var(--border));
}
```

---

## Tailwind Utility Classes Added

Ensure these work in your `tailwind.config.ts`:

```ts
// The following utilities use CSS variables
// gap-(--sidebar-item-gap) → gap: var(--sidebar-item-gap)
// w-(--sidebar-rail-width) → width: var(--sidebar-rail-width)
// h-(--sidebar-header-height) → height: var(--sidebar-header-height)
// mt-(--sidebar-section-first-margin-top) → margin-top: var(--sidebar-section-first-margin-top)
// pt-(--sidebar-section-first-margin-top) → padding-top: var(--sidebar-section-first-margin-top)
```

Tailwind 4 supports arbitrary values with CSS variables natively using the `(--var)` syntax.

---

## Testing Checklist

### Visual Tests

| Test | Expected |
|------|----------|
| ⬜ Collapsed rail visible at 48px width | Only icons visible |
| ⬜ Smooth opacity crossfade on toggle | ~150ms transition |
| ⬜ Avatar is 24px when collapsed | Smaller than expanded 32px |
| ⬜ Resize cursor on toggle button | `cursor-e-resize` when collapsed |
| ⬜ Icon alignment consistent | Icons centered via wrapper |
| ⬜ Footer spacing matches ChatGPT | `mb-1 pb-1.5` pattern |

### Functional Tests

| Test | Expected |
|------|----------|
| ⬜ Click collapsed rail toggle expands | Smooth transition |
| ⬜ Click expanded toggle collapses | Smooth transition |
| ⬜ Cmd+B keyboard shortcut works | Toggle state |
| ⬜ Tooltips show on collapsed items | On hover/focus |
| ⬜ `inert` attribute on hidden content | No focus trap issues |
| ⬜ Cookie persistence works | State survives reload |

### Accessibility Tests

| Test | Expected |
|------|----------|
| ⬜ `motion-safe:` respected | No animation if reduced motion |
| ⬜ `aria-hidden` on collapsed/expanded | Correct based on state |
| ⬜ Focus navigation works | Tab through visible items |
| ⬜ Screen reader announces state | "Sidebar collapsed/expanded" |

### Responsive Tests

| Test | Expected |
|------|----------|
| ⬜ Mobile uses Sheet | Overlay behavior, not rail |
| ⬜ Desktop uses dual-layer | Rail + expanded content |
| ⬜ Resize from mobile to desktop | Correct mode switch |

---

## File Change Summary

| File | Type | Description |
|------|------|-------------|
| `app/globals.css` | Add | CSS variables for sidebar spacing |
| `app/components/layout/sidebar/app-sidebar.tsx` | Major | Dual-layer structure, collapsed rail components |
| `app/components/layout/sidebar/sidebar-menu-item.tsx` | Medium | Icon wrapper, motion-safe transitions |
| `app/components/layout/user-menu.tsx` | Minor | Avatar size transition, motion-safe |
| `components/ui/sidebar.tsx` | Minor | Resize cursor on SidebarTrigger |

---

## Rollback Plan

If issues arise:

1. **Revert to hidden approach**: Replace opacity transitions with `hidden` class
2. **Remove CSS variables**: Replace `var(--*)` with hardcoded values
3. **Remove dual-layer**: Return to single content block with conditional hiding

---

## References

- ChatGPT sidebar HTML (provided in this document)
- [Shadcn Sidebar Docs](https://ui.shadcn.com/docs/components/sidebar)
- [CSS `inert` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inert)
- [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
