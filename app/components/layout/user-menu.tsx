"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useMessages } from "@/lib/chat-store/messages/provider"
import { clearAllIndexedDBStores } from "@/lib/chat-store/persist"
import { useUser } from "@/lib/user-store/provider"
import { useClerk } from "@clerk/nextjs"
import { HugeiconsIcon } from "@hugeicons/react"
import { UnfoldLessIcon, Logout01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { useState } from "react"
import { toast } from "@/components/ui/toast"
import { AppInfoDialog, AppInfoMenuItem } from "./app-info/app-info-trigger"
import { FeedbackMenuItem, FeedbackDialog } from "./feedback/feedback-trigger"
import { SettingsMenuItem, SettingsDialog } from "./settings/settings-trigger"

interface UserMenuProps {
  variant?: "header" | "sidebar"
}

export function UserMenu({ variant = "header" }: UserMenuProps) {
  const { user } = useUser()
  const { signOut } = useClerk()
  const { resetChats } = useChats()
  const { resetMessages } = useMessages()
  const [isMenuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [appInfoOpen, setAppInfoOpen] = useState(false)

  if (!user) return null

  const isSidebar = variant === "sidebar"

  const handleSignOut = async () => {
    try {
      await resetMessages()
      await resetChats()
      await clearAllIndexedDBStores()
      await signOut({ redirectUrl: "/" })
    } catch (e) {
      console.error("Sign out failed:", e)
      toast({ title: "Failed to sign out", status: "error" })
    }
  }

  // Shared dropdown menu content
  const menuContent = (
    <>
      <DropdownMenuItem className="flex items-start gap-0 no-underline hover:bg-transparent focus:bg-transparent">
        <span className="text-muted-foreground max-w-full truncate">
          {user?.email}
        </span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <SettingsMenuItem onClick={() => setSettingsOpen(true)} />
      <FeedbackMenuItem onClick={() => setFeedbackOpen(true)} />
      <AppInfoMenuItem onClick={() => setAppInfoOpen(true)} />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={handleSignOut}
        className="flex items-center gap-2"
      >
        <HugeiconsIcon icon={Logout01Icon} size={16} />
        <span>Sign out</span>
      </DropdownMenuItem>
    </>
  )

  // Dialogs rendered outside the dropdown so they persist when the menu closes
  const dialogs = (
    <>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <AppInfoDialog open={appInfoOpen} onOpenChange={setAppInfoOpen} />
    </>
  )

  // Sidebar variant using Shadcn SidebarMenu primitives
  if (isSidebar) {
    return (
      <>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu
              open={isMenuOpen}
              onOpenChange={setMenuOpen}
              modal={false}
            >
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="w-full"
                    tooltip={user?.display_name || "Account"}
                  />
                }
              >
                <Avatar className="size-6 bg-emerald-600">
                  <AvatarImage src={user?.profile_image ?? undefined} />
                  <AvatarFallback className="bg-emerald-600 text-xs text-white">
                    {user?.display_name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {/* IMPORTANT: Must explicitly hide - SidebarMenuButton only handles outer sizing */}
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden motion-safe:transition-opacity">
                  <span className="truncate font-semibold">
                    {user?.display_name}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user?.premium ? "Plus" : "Free"}
                  </span>
                </div>
                <HugeiconsIcon
                  icon={UnfoldLessIcon}
                  size={16}
                  className="text-muted-foreground ml-auto group-data-[collapsible=icon]:hidden"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-(--anchor-width)"
              >
                {menuContent}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        {dialogs}
      </>
    )
  }

  // Header variant (original implementation)
  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setMenuOpen} modal={false}>
        <Tooltip>
          <TooltipTrigger render={<DropdownMenuTrigger />}>
            <Avatar className="bg-background hover:bg-muted">
              <AvatarImage src={user?.profile_image ?? undefined} />
              <AvatarFallback>{user?.display_name?.charAt(0)}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>Profile</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          className="w-56"
          align="end"
        >
          {menuContent}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  )
}
