import type { UserPreferences } from "../user-preference-store/utils"

// Profile facts only. Usage and other per-send state never live here: every
// change re-renders each `useUser()` consumer.
export type UserProfile = {
  id: string
  email: string
  display_name: string
  profile_image: string | null

  anonymous: boolean | null
  premium: boolean | null
  created_at: string | null

  favorite_models: string[] | null
  system_prompt: string | null
  preferences?: UserPreferences
}
