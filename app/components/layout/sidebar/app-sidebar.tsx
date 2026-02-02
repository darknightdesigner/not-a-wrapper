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
  useSidebar,
} from "@/components/ui/sidebar"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useUser } from "@/lib/user-store/provider"
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
      collapsible="offcanvas"
      variant="sidebar"
      className="border-border/40 border-r bg-transparent"
    >
      <SidebarHeader className="h-14 pl-3">
        <div className="flex justify-between">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md bg-transparent focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={24} />
            </button>
          ) : (
            <div className="h-full" />
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="border-border/40 border-t">
        <h2 className="sr-only">Chat history</h2>
        <ScrollShadowWrapper className="h-full" viewportRef={scrollViewportRef}>
          <ScrollArea
            className="flex h-full px-3 [&>div>div]:!block"
            viewportRef={scrollViewportRef}
          >
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
      <SidebarFooter className="border-border/40 border-t p-2">
        {isLoggedIn ? (
          <UserMenu variant="sidebar" />
        ) : (
          <Link
            href="/auth/login"
            className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors"
          >
            Log in
          </Link>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
