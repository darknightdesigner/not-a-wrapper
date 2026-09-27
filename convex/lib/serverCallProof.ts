import { ConvexError } from "convex/values"
import { hmacSha256Hex, timingSafeEqualHex } from "./sha256"

/**
 * Server-call proofs (ADR-0045): the Next.js server's HMAC attestation that it,
 * not a browser, made a Convex call and derived its actor. Same shape as the
 * chat admission proof (ADR-0020): `CHAT_ADMISSION_SECRET`, a domain-tagged
 * JSON tuple, 60 s lifetime. The proof never leaves the server process, so a
 * browser can reach these mutations only with arguments it cannot sign.
 */

export const SERVER_CALL_PROOF_MAX_AGE_MS = 60_000
const SERVER_CALL_PROOF_MAX_FUTURE_SKEW_MS = 10_000

/**
 * The server-derived guest actor: the id from the signed guest cookie plus a
 * keyed hash of the client network. Never taken from a request body.
 */
export type GuestActor = { guestId: string; networkKey: string }

export type ToolLimitProofScope = { scopeKey: string; count: number }

export type ServerCallProofPayload =
  | {
      purpose: "guest_turn_admit" | "guest_turn_release"
      guest: GuestActor
      requestId: string
      issuedAt: number
    }
  | { purpose: "guest_usage_read"; guest: GuestActor; issuedAt: number }
  | {
      purpose: "tool_limit"
      /** Null for signed-in callers, whose actor is their Convex identity. */
      guestId: string | null
      limitType: "domain" | "budget"
      toolName: string
      keyMode: "platform" | "byok"
      scopeCounts: readonly ToolLimitProofScope[]
      consume: boolean
      issuedAt: number
    }

type DigestPart = string | number | boolean | null | readonly DigestPart[]

function requireServerSecret(secret: string | undefined): string {
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error("CHAT_ADMISSION_SECRET must be at least 32 bytes")
  }
  return secret
}

/**
 * HMAC over a domain-tagged tuple with the shared server secret. Every use
 * carries its own tag, so a digest minted for one purpose never verifies as
 * another (the cookie signature, the network key, and each call proof).
 */
export function serverKeyedDigest(
  tag: string,
  parts: readonly DigestPart[],
  secret = process.env.CHAT_ADMISSION_SECRET
): string {
  return hmacSha256Hex(
    requireServerSecret(secret),
    JSON.stringify([tag, ...parts])
  )
}

function serializePayload(payload: ServerCallProofPayload): DigestPart[] {
  switch (payload.purpose) {
    case "guest_turn_admit":
    case "guest_turn_release":
      return [
        payload.purpose,
        payload.guest.guestId,
        payload.guest.networkKey,
        payload.requestId,
        payload.issuedAt,
      ]
    case "guest_usage_read":
      return [
        payload.purpose,
        payload.guest.guestId,
        payload.guest.networkKey,
        payload.issuedAt,
      ]
    case "tool_limit":
      return [
        payload.purpose,
        payload.guestId,
        payload.limitType,
        payload.toolName,
        payload.keyMode,
        payload.scopeCounts.map((scope) => [scope.scopeKey, scope.count]),
        payload.consume,
        payload.issuedAt,
      ]
  }
}

export function signServerCallProof(
  payload: ServerCallProofPayload,
  secret = process.env.CHAT_ADMISSION_SECRET
): string {
  return serverKeyedDigest("server-call-v1", serializePayload(payload), secret)
}

export function verifyServerCallProof(
  payload: ServerCallProofPayload,
  proof: string,
  options: { secret?: string; now?: number } = {}
): boolean {
  if (!Number.isSafeInteger(payload.issuedAt)) return false
  const age = (options.now ?? Date.now()) - payload.issuedAt
  if (
    age < -SERVER_CALL_PROOF_MAX_FUTURE_SKEW_MS ||
    age > SERVER_CALL_PROOF_MAX_AGE_MS
  ) {
    return false
  }
  if (!/^[0-9a-f]{64}$/.test(proof)) return false
  return timingSafeEqualHex(
    signServerCallProof(
      payload,
      options.secret ?? process.env.CHAT_ADMISSION_SECRET
    ),
    proof
  )
}

/** The Convex-side gate: refuse before the handler reads or writes anything. */
export function requireServerCallProof(
  payload: ServerCallProofPayload,
  proof: string
): void {
  if (!verifyServerCallProof(payload, proof)) {
    throw new ConvexError({
      code: "server_call_proof_invalid",
      message: "Server call proof is invalid or expired",
    })
  }
}
