"use client"

import { HistoryTrigger } from "@/app/components/history/history-trigger"
import { ButtonNewChat } from "@/app/components/layout/button-new-chat"
import { UserMenu } from "@/app/components/layout/user-menu"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { NawIcon } from "@/components/icons/naw"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { APP_NAME } from "@/lib/config"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import Link from "next/link"
import { DialogPublish } from "./dialog-publish"
import { HeaderSidebarTrigger } from "./header-sidebar-trigger"

export function Header({ hasSidebar }: { hasSidebar: boolean }) {
  const isMobile = useBreakpoint(768)
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"
  const isMultiModelEnabled = preferences.multiModelEnabled

  const isLoggedIn = !!user

  return (
    <header className="h-app-header pointer-events-none fixed top-0 right-0 left-0 z-50">
      <div className="relative mx-auto flex h-full max-w-full items-center justify-between bg-transparent px-4 lg:bg-transparent">
        <div className="flex flex-1 items-center justify-between">
          <div className="-ml-0.5 flex flex-1 items-center gap-2 lg:-ml-2.5">
            <div className="flex flex-1 items-center gap-2">
              {/* Hide logo/text when sidebar is present on desktop (sidebar has its own home link) */}
              {(!hasSidebar || isMobile) && (
                <Link
                  href="/"
                  className="pointer-events-auto inline-flex items-center text-lg font-medium tracking-tight"
                >
                  <NawIcon className="mr-1 size-4" />
                  {APP_NAME}
                </Link>
              )}
              {/* Show toggle only on mobile (collapsed rail has its own toggle on desktop) */}
              {hasSidebar && isMobile && <HeaderSidebarTrigger />}
            </div>
          </div>
          <div />
          {!isLoggedIn ? (
            <div className="pointer-events-auto flex flex-1 items-center justify-end gap-2">
              <Button variant="outline" render={<Link href="/auth/login" />}>
                Login
              </Button>
              <Button render={<Link href="/auth/sign-up" />}>
                Sign up
              </Button>
            </div>
          ) : (
            <div className="pointer-events-auto flex flex-1 items-center justify-end gap-2">
              {!isMultiModelEnabled && <DialogPublish />}
              <ButtonNewChat />
              {!hasSidebar && <HistoryTrigger hasSidebar={hasSidebar} />}
              {!hasSidebar && <UserMenu />}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
