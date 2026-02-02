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
import { ArrowUpDownIcon, Logout01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { useState } from "react"
import { toast } from "@/components/ui/toast"
import { AppInfoTrigger } from "./app-info/app-info-trigger"
import { FeedbackTrigger } from "./feedback/feedback-trigger"
import { SettingsTrigger } from "./settings/settings-trigger"

interface UserMenuProps {
  variant?: "header" | "sidebar"
}

export function UserMenu({ variant = "header" }: UserMenuProps) {
  const { user } = useUser()
  const { signOut } = useClerk()
  const { resetChats } = useChats()
  const { resetMessages } = useMessages()
  const [isMenuOpen, setMenuOpen] = useState(false)
  const [isSettingsOpen, setSettingsOpen] = useState(false)

  if (!user) return null

  const isSidebar = variant === "sidebar"

  const handleSettingsOpenChange = (isOpen: boolean) => {
    setSettingsOpen(isOpen)
    if (!isOpen) {
      setMenuOpen(false)
    }
  }

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
      <DropdownMenuItem className="flex flex-col items-start gap-0 no-underline hover:bg-transparent focus:bg-transparent">
        <span>{user?.display_name}</span>
        <span className="text-muted-foreground max-w-full truncate">
          {user?.email}
        </span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <SettingsTrigger onOpenChange={handleSettingsOpenChange} />
      <FeedbackTrigger />
      <AppInfoTrigger />
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

  // Sidebar variant using Shadcn SidebarMenu primitives
  if (isSidebar) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu
            open={isMenuOpen}
            onOpenChange={setMenuOpen}
            modal={false}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="w-full"
                tooltip={user?.display_name || "Account"}
              >
                <Avatar className="size-8 bg-emerald-600">
                  <AvatarImage src={user?.profile_image ?? undefined} />
                  <AvatarFallback className="bg-emerald-600 text-sm text-white">
                    {user?.display_name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {/* IMPORTANT: Must explicitly hide - SidebarMenuButton only handles outer sizing */}
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">
                    {user?.display_name}
                  </span>
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
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-(--radix-popper-anchor-width)"
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if (isSettingsOpen) {
                  e.preventDefault()
                  return
                }
                setMenuOpen(false)
              }}
            >
              {menuContent}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  // Header variant (original implementation)
  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setMenuOpen} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger>
            <Avatar className="bg-background hover:bg-muted">
              <AvatarImage src={user?.profile_image ?? undefined} />
              <AvatarFallback>{user?.display_name?.charAt(0)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Profile</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-56"
        align="end"
        forceMount
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (isSettingsOpen) {
            e.preventDefault()
            return
          }
          setMenuOpen(false)
        }}
      >
        {menuContent}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
