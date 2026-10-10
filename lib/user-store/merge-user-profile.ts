import type { CurrentUser } from "@/convex/users"
import type { UserProfile } from "@/lib/user/types"

type ConvexUserProfileFields = Pick<
  CurrentUser,
  | "_creationTime"
  | "premium"
  | "anonymous"
  | "favoriteModels"
  | "systemPrompt"
  | "displayName"
  | "profileImage"
  | "profileImageOverride"
>

export function mergeUserProfileWithConvexFields(
  user: UserProfile | null,
  convexUser: ConvexUserProfileFields | null | undefined,
  pendingProfileImage?: string
): UserProfile | null {
  if (!user || !convexUser) return user

  return {
    ...user,
    display_name: convexUser.displayName ?? user.display_name,
    // The session's own WorkOS picture covers a row the verified webhook has
    // not synced yet; the bootstrap no longer copies browser profile fields.
    profile_image:
      pendingProfileImage ??
      convexUser.profileImageOverride ??
      convexUser.profileImage ??
      user.profile_image,
    anonymous: convexUser.anonymous ?? user.anonymous,
    premium: convexUser.premium ?? user.premium,
    created_at: String(convexUser._creationTime),
    favorite_models: convexUser.favoriteModels ?? user.favorite_models ?? [],
    system_prompt: convexUser.systemPrompt ?? user.system_prompt,
  }
}
