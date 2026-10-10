import type { UserProfile } from "@/lib/user/types"
import {
  createGuestUserId,
  GUEST_USER_STORAGE_KEY,
} from "./chat-store/identity"

/** The guest's remaining daily turns (ADR-0045): a hint, never the gate. */
export async function fetchGuestUsage(): Promise<number> {
  const res = await fetch("/api/rate-limits")
  const { remaining }: { remaining?: unknown } = await res.json()
  if (!res.ok || typeof remaining !== "number") {
    throw new Error(`Guest usage read failed: ${res.status}`)
  }
  return remaining
}

export const getOrCreateGuestUserId = async (
  user: UserProfile | null
): Promise<string | null> => {
  if (user?.id) return user.id

  const existingGuestId = localStorage.getItem(GUEST_USER_STORAGE_KEY)
  if (existingGuestId) {
    return existingGuestId
  }

  const newGuestId = createGuestUserId()
  localStorage.setItem(GUEST_USER_STORAGE_KEY, newGuestId)

  return newGuestId
}
