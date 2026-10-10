import { api } from "@/convex/_generated/api"
import {
  signServerCallProof,
  type GuestActor,
} from "@/convex/lib/serverCallProof"
import { fetchQuery } from "convex/nextjs"

/**
 * The guest's remaining daily turns for the composer's typing-time hint
 * (ADR-0045), the one field `fetchGuestUsage` reads. Signed-in users have no
 * pre-send read: `/api/chat` admission is their only per-send check.
 */
export async function getGuestUsage(
  guest: GuestActor
): Promise<{ remaining: number }> {
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
  return { remaining: usage.remaining }
}
