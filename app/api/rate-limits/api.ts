import { api } from "@/convex/_generated/api"
import {
  signServerCallProof,
  type GuestActor,
} from "@/convex/lib/serverCallProof"
import {
  AUTH_DAILY_MESSAGE_LIMIT,
  NON_AUTH_DAILY_MESSAGE_LIMIT,
} from "@/lib/config"
import { fetchQuery } from "convex/nextjs"

export type UsageResult = {
  dailyCount: number
  dailyLimit: number
  remaining: number
}

export type UsageActor =
  | { kind: "user"; token: string | undefined }
  /** Cookie-verified guest (ADR-0045); never a client-sent id. */
  | { kind: "guest"; guest: GuestActor }

async function readUsage(actor: UsageActor): Promise<UsageResult> {
  if (actor.kind === "guest") {
    const issuedAt = Date.now()
    const usage = await fetchQuery(api.usage.checkGuestUsage, {
      guest: actor.guest,
      issuedAt,
      proof: signServerCallProof({
        purpose: "guest_usage_read",
        guest: actor.guest,
        issuedAt,
      }),
    })
    return {
      dailyCount: usage.count,
      dailyLimit: usage.limit,
      remaining: usage.remaining,
    }
  }
  const usage = await fetchQuery(
    api.usage.checkUsage,
    {},
    { token: actor.token }
  )
  return {
    dailyCount: usage.count ?? 0,
    dailyLimit: usage.limit,
    remaining: usage.remaining,
  }
}

/** Daily message usage for the composer's pre-send hint. */
export async function getMessageUsage(actor: UsageActor): Promise<UsageResult> {
  try {
    return await readUsage(actor)
  } catch (error) {
    console.error("Error fetching usage from Convex:", error)
    // A hint only: /api/chat admission is the enforcing, fail-closed gate, so
    // a failed lookup must not block the send that admission will judge.
    const defaultLimit =
      actor.kind === "user"
        ? AUTH_DAILY_MESSAGE_LIMIT
        : NON_AUTH_DAILY_MESSAGE_LIMIT
    return {
      dailyCount: 0,
      dailyLimit: defaultLimit,
      remaining: defaultLimit,
    }
  }
}
