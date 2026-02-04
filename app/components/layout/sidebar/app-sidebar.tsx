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
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react"
import {
  Chat01Icon,
  Cancel01Icon,
  PencilEdit02Icon,
  Search01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { Pin, PanelLeft } from "@/lib/icons"
import { useParams } from "next/navigation"
import React, { useMemo, useRef } from "react"
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
          // Stepped easing: appear instantly at END of collapse animation
          "motion-safe:transition-opacity motion-safe:duration-150",
          isCollapsed 
            ? "motion-safe:ease-[steps(1,end)]" 
            : "motion-safe:ease-linear",
          // Visibility based on state
          isCollapsed 
            ? "pointer-events-auto opacity-100" 
            : "pointer-events-none opacity-0"
        )}
        aria-hidden={!isCollapsed}
        inert={!isCollapsed ? true : undefined}
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
        <div className="mt-(--sidebar-section-first-margin-top) flex flex-col items-center gap-0">
          <CollapsedMenuItem
            icon={<HugeiconsIcon icon={PencilEdit02Icon} size={20} />}
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
        <div className="mb-1 w-full px-1.5">
          <CollapsedUserAvatar user={user} />
        </div>
      </div>

      {/* === EXPANDED CONTENT === */}
      <div
        className={cn(
          "flex h-full flex-col",
          // Fixed width + clipping prevents text reflow during animation (ChatGPT pattern)
          "w-(--sidebar-width) overflow-x-clip whitespace-nowrap",
          // Stepped easing: disappear instantly at START of collapse animation
          "motion-safe:transition-opacity motion-safe:duration-150",
          isCollapsed 
            ? "motion-safe:ease-[steps(1,start)]" 
            : "motion-safe:ease-linear",
          // Visibility based on state
          isCollapsed 
            ? "pointer-events-none opacity-0" 
            : "pointer-events-auto opacity-100"
        )}
        // `inert` prevents focus/interaction when hidden (ChatGPT pattern)
        inert={isCollapsed ? true : undefined}
      >
        <SidebarHeader className="h-(--sidebar-header-height) px-1.5">
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
              className="flex h-full px-1.5 [&>div>div]:!block"
              viewportRef={scrollViewportRef}
            >
              {/* Sticky action buttons */}
              <div className="sticky top-0 z-20 bg-sidebar pb-2 pt-(--sidebar-section-first-margin-top)">
                <div className="flex w-full flex-col items-start gap-0">
                  <SidebarMenuItem
                    icon={<HugeiconsIcon icon={PencilEdit02Icon} size={20} />}
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

        <SidebarFooter className="border-border/40 border-t px-1.5 pb-1.5 pt-2">
          {isLoggedIn ? (
            <UserMenu variant="sidebar" />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/auth/login"
                  className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-9 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium motion-safe:transition-colors"
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
          {/* Hover: Sidebar icon */}
          <HugeiconsIcon
            icon={PanelLeft}
            size={20}
            className="hidden group-hover/toggle:block group-focus-visible/toggle:block"
          />
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
  icon: IconSvgElement | React.ReactNode
  label: string
  href?: string
  onClick?: () => void
  shortcut?: string
}) {
  // Check if icon is a React element (custom icon) vs Hugeicons IconSvgElement
  const isCustomIcon = React.isValidElement(icon)

  const content = (
    <div className="flex items-center justify-center">
      {isCustomIcon ? icon : <HugeiconsIcon icon={icon as IconSvgElement} size={20} />}
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
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent motion-safe:transition-colors mx-auto"
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
