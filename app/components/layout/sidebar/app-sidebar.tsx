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
  const { setOpenMobile } = useSidebar()
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
            <>
              {/*
                Hover-swap effect for collapsed sidebar:
                - Default: Show logo (home link)
                - On hover: Swap to toggle button
                This provides quick access to both functions in the minimal collapsed state.
                The overlay trigger is removed from tab order to prevent focus on invisible element.
              */}
              <div className="group/header-swap relative">
                {/* Logo - visible by default, fades out on hover when collapsed */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/"
                      className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent group-data-[collapsible=icon]:group-hover/header-swap:opacity-0"
                      data-sidebar-item="true"
                    >
                      <NawIcon className="size-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">Home</TooltipContent>
                </Tooltip>
                {/* Toggle button overlay - only visible when collapsed, appears on hover */}
                <SidebarTrigger
                  aria-hidden
                  tabIndex={-1}
                  className={cn(
                    // Hidden when expanded
                    "hidden",
                    // Collapsed state: show as overlay on logo
                    "group-data-[collapsible=icon]:block",
                    "group-data-[collapsible=icon]:absolute",
                    "group-data-[collapsible=icon]:inset-0",
                    "group-data-[collapsible=icon]:opacity-0",
                    // Collapsed + hover: reveal and make interactive
                    "group-data-[collapsible=icon]:group-hover/header-swap:opacity-100",
                    // Pointer events: disabled by default, enabled on hover
                    "group-data-[collapsible=icon]:pointer-events-none",
                    "group-data-[collapsible=icon]:group-hover/header-swap:pointer-events-auto"
                  )}
                />
              </div>
              {/* Toggle button - shown normally when expanded */}
              <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
            </>
          )}
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
                <NawIcon className="hidden size-5 group-data-[collapsible=icon]:block" />
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
