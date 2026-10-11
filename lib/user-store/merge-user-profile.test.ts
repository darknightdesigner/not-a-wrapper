import type { UserProfile } from "@/lib/user/types"
import { describe, expect, it } from "vitest"
import { mergeUserProfileWithConvexFields } from "./merge-user-profile"

describe("mergeUserProfileWithConvexFields", () => {
  it("prefers an app-managed profile image over the WorkOS image", () => {
    const user = {
      id: "workos-user-1",
      email: "user@example.com",
      display_name: "User",
      profile_image: "https://workos.test/avatar.png",
      anonymous: false,
      premium: false,
      created_at: null,
      favorite_models: [],
      system_prompt: null,
    } satisfies UserProfile
    const convexUser = {
      _creationTime: 1,
      profileImageOverride: "https://images.test/avatar.png",
    }

    expect(
      mergeUserProfileWithConvexFields(user, convexUser)?.profile_image
    ).toBe("https://images.test/avatar.png")
  })

  it("restores the WorkOS image when an app-managed override is cleared", () => {
    const user = {
      id: "workos-user-1",
      email: "user@example.com",
      display_name: "User",
      profile_image: "https://images.test/avatar.png",
      anonymous: false,
      premium: false,
      created_at: null,
      favorite_models: [],
      system_prompt: null,
    } satisfies UserProfile
    const convexUser = {
      _creationTime: 1,
      profileImage: "https://workos.test/avatar.png",
    }

    expect(
      mergeUserProfileWithConvexFields(user, convexUser)?.profile_image
    ).toBe("https://workos.test/avatar.png")
  })

  it("preserves a pending upload while the Convex profile image is stale", () => {
    const user = {
      id: "workos-user-1",
      email: "user@example.com",
      display_name: "User",
      profile_image: "https://images.test/new-avatar.png",
      anonymous: false,
      premium: false,
      created_at: null,
      favorite_models: [],
      system_prompt: null,
    } satisfies UserProfile
    const convexUser = {
      _creationTime: 1,
      profileImage: "https://workos.test/avatar.png",
    }

    expect(
      mergeUserProfileWithConvexFields(
        user,
        convexUser,
        "https://images.test/new-avatar.png"
      )?.profile_image
    ).toBe("https://images.test/new-avatar.png")
  })
})
