import type { Id } from "../_generated/dataModel"
import { serverKeyedDigest } from "./serverCallProof"
import { timingSafeEqualHex } from "./sha256"

/**
 * Attachment upload tickets (ADR-0046). `files.generateUploadUrl` signs the
 * caller's users id and an expiry; the `/attachments` HTTP action stores a
 * blob only under a valid ticket and stages it for that user. The browser
 * never names a storage id, so it cannot claim a blob it did not upload.
 * Same shape as the guest cookie (ADR-0045): `id.time.signature`.
 */

export const ATTACHMENT_UPLOAD_PATH = "/attachments"
/** Covers a slow 10 MB transfer; reuse stays bounded by the daily limit. */
export const UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000
const UPLOAD_TICKET_TAG = "attachment-upload-v1"

export function signUploadTicket(
  userId: Id<"users">,
  now = Date.now(),
  secret?: string
): string {
  const expiresAt = now + UPLOAD_TICKET_TTL_MS
  const signature = serverKeyedDigest(
    UPLOAD_TICKET_TAG,
    [userId, expiresAt],
    secret
  )
  return `${userId}.${expiresAt}.${signature}`
}

/** The ticket's users id, or null for a missing, forged, or expired ticket. */
export function verifyUploadTicket(
  ticket: string | undefined,
  options: { secret?: string; now?: number } = {}
): Id<"users"> | null {
  const [userId, expiresAtText, signature, ...rest] = ticket?.split(".") ?? []
  if (
    rest.length > 0 ||
    !userId ||
    !signature ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) {
    return null
  }
  const expiresAt = Number(expiresAtText)
  if (!Number.isSafeInteger(expiresAt)) return null
  if (expiresAt <= (options.now ?? Date.now())) return null
  const expected = serverKeyedDigest(
    UPLOAD_TICKET_TAG,
    [userId, expiresAt],
    options.secret
  )
  // Only this deployment's secret signs a users id into a ticket.
  return timingSafeEqualHex(expected, signature)
    ? (userId as Id<"users">)
    : null
}
