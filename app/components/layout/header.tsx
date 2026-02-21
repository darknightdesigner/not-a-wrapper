"use client"

import { HistoryTrigger } from "@/app/components/history/history-trigger"
import { ButtonNewChat } from "@/app/components/layout/button-new-chat"
import { ModelSelectorHeader } from "@/app/components/layout/model-selector-header"
import { UserMenu } from "@/app/components/layout/user-menu"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { NawIcon } from "@/components/icons/naw"
import { Button } from "@/components/ui/button"
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
  const isMultiModelEnabled = preferences.multiModelEnabled

  const isLoggedIn = !!user

  return (
    <header className="bg-background pointer-events-none sticky top-0 z-20 h-app-header shrink-0">
      <div className="relative mx-auto flex h-full max-w-full items-center justify-between px-2">
        {/* LEFT SECTION - natural width, not flex-1 */}
        <div className="flex items-center gap-2">
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

        {/* CENTER SECTION - flex-1 to fill remaining space */}
        <div className="pointer-events-auto flex flex-1 items-center">
          {isLoggedIn && !isMultiModelEnabled && <ModelSelectorHeader />}
        </div>

        {/* RIGHT SECTION - natural width, not flex-1 */}
        <div className="pointer-events-auto flex items-center justify-end gap-2">
          {!isLoggedIn ? (
            <>
              <Button variant="outline" render={<Link href="/auth/login" />}>
                Login
              </Button>
              <Button render={<Link href="/auth/sign-up" />}>
                Sign up
              </Button>
            </>
          ) : (
            <>
              {!isMultiModelEnabled && <DialogPublish />}
              <ButtonNewChat />
              {!hasSidebar && <HistoryTrigger hasSidebar={hasSidebar} />}
              {!hasSidebar && <UserMenu />}
            </>
          )}
        </div>
      </div>
    </header>
  )
}
