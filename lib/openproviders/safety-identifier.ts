import { hmacSha256Hex } from "@/convex/lib/sha256"

/**
 * The opaque per-actor id providers receive for abuse attribution (OpenAI
 * `safety_identifier`, Anthropic `metadata.user_id`, OpenRouter `user`;
 * ADR-0021). A domain-separated HMAC of the WorkOS subject under the
 * server-only CHAT_ADMISSION_SECRET, so it is stable per user, never the
 * email, and cannot be reversed or recomputed without the secret. 32 hex
 * characters stays inside every provider's length limit. A missing or short
 * secret sends no identifier: attribution never fails a turn.
 */
export function deriveProviderSafetyIdentifier(
  subject: string,
  secret = process.env.CHAT_ADMISSION_SECRET
): string | undefined {
  if (!subject || !secret || new TextEncoder().encode(secret).length < 32) {
    return undefined
  }
  return hmacSha256Hex(
    secret,
    JSON.stringify(["provider-safety-identifier-v1", subject])
  ).slice(0, 32)
}
