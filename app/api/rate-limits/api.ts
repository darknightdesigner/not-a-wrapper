import { api } from "@/convex/_generated/api"
import {
  signServerCallProof,
  type GuestActor,
} from "@/convex/lib/serverCallProof"
import { fetchQuery } from "convex/nextjs"

export type UsageResult = {
  dailyCount: number
  dailyLimit: number
  remaining: number
}

/**
 * The guest's daily usage for the composer's typing-time hint (ADR-0045).
 * Signed-in users have no pre-send read: `/api/chat` admission is their only
 * per-send check.
 */
export async function getGuestUsage(guest: GuestActor): Promise<UsageResult> {
  const issuedAt = Date.now()
  const usage = await fetchQuery(api.usage.checkGuestUsage, {
    guest,
    issuedAt,
    proof: signServerCallProof({
      purpose: "guest_usage_read",
      guest,
      issuedAt,
    }),
  })
  return {
    dailyCount: usage.count,
    dailyLimit: usage.limit,
    remaining: usage.remaining,
  }
}
