"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useUser } from "@/lib/user-store/provider"
import { HugeiconsIcon } from "@hugeicons/react"
import { User02Icon } from "@hugeicons-pro/core-stroke-rounded"

export function UserProfile() {
  const { user } = useUser()

  if (!user) return null

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-balance">Profile</h3>
      <div className="flex items-center space-x-4">
        <div className="bg-muted flex items-center justify-center overflow-hidden rounded-full">
          {user?.profile_image ? (
            <Avatar className="size-12">
              <AvatarImage src={user.profile_image} className="object-cover" />
              <AvatarFallback>{user?.display_name?.charAt(0)}</AvatarFallback>
            </Avatar>
          ) : (
            <HugeiconsIcon icon={User02Icon} size={48} className="size-12 text-muted-foreground" />
          )}
        </div>
        <div>
          <h4 className="text-sm font-medium text-balance">{user?.display_name}</h4>
          <p className="text-muted-foreground text-sm">{user?.email}</p>
        </div>
      </div>
    </div>
  )
}
