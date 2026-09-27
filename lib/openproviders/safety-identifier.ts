import { hmacSha256Hex } from "@/convex/lib/sha256"

/**
 * The actor a provider request is attributed to: a WorkOS subject, or the
 * server-signed guest id from the guest cookie (ADR-0045). Never the id a
 * browser sends in the body.
 */
export type ProviderSafetyActor = { kind: "user" | "guest"; id: string }

/**
 * The opaque per-actor id providers receive for abuse attribution (OpenAI
 * `safety_identifier`, Anthropic `metadata.user_id`, OpenRouter `user`;
 * ADR-0021). A domain-separated HMAC of the actor kind and id under the
 * server-only CHAT_ADMISSION_SECRET, so it is stable per actor, never the
 * email, cannot be reversed or recomputed without the secret, and a guest can
 * never share a user's id. 32 hex characters stays inside every provider's
 * length limit. A missing or short secret sends no identifier: attribution
 * never fails a turn.
 */
export function deriveProviderSafetyIdentifier(
  actor: ProviderSafetyActor,
  secret = process.env.CHAT_ADMISSION_SECRET
): string | undefined {
  if (!actor.id || !secret || new TextEncoder().encode(secret).length < 32) {
    return undefined
  }
  return hmacSha256Hex(
    secret,
    JSON.stringify(["provider-safety-identifier-v1", actor.kind, actor.id])
  ).slice(0, 32)
}
