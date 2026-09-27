import {
  serverKeyedDigest,
  type GuestActor,
} from "@/convex/lib/serverCallProof"
import { timingSafeEqualHex } from "@/convex/lib/sha256"
import { createGuestUserId } from "@/lib/chat-store/identity"
import { cookies } from "next/headers"

/**
 * Guest identity (ADR-0045). The server mints and verifies a signed, httpOnly
 * guest cookie; its id is the trusted guest actor for limits. The anonymous id
 * a browser keeps in localStorage and sends in the body is never trusted.
 * Minted lazily by the first guest API call that needs it (`/api/chat`,
 * `/api/rate-limits`), so signed-in visitors and page crawlers never get one.
 */

export const GUEST_COOKIE_NAME = "naw_guest"
export const GUEST_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
// Tolerates small clock differences between server instances.
const GUEST_COOKIE_MAX_FUTURE_SKEW_MS = 60_000
const GUEST_ID_PATTERN = /^guest_[0-9a-f-]{36}$/

export function signGuestCookie(
  guestId: string,
  issuedAt: number,
  secret?: string
): string {
  const signature = serverKeyedDigest(
    "guest-cookie-v1",
    [guestId, issuedAt],
    secret
  )
  return `${guestId}.${issuedAt}.${signature}`
}

/** The cookie's guest id, or null for a missing, forged, or expired cookie. */
export function verifyGuestCookie(
  value: string | undefined,
  options: { secret?: string; now?: number } = {}
): string | null {
  const [guestId, issuedAtText, signature, ...rest] = value?.split(".") ?? []
  if (
    rest.length > 0 ||
    !guestId ||
    !GUEST_ID_PATTERN.test(guestId) ||
    !signature ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) {
    return null
  }
  const issuedAt = Number(issuedAtText)
  if (!Number.isSafeInteger(issuedAt)) return null
  const age = (options.now ?? Date.now()) - issuedAt
  if (age < -GUEST_COOKIE_MAX_FUTURE_SKEW_MS || age > GUEST_COOKIE_MAX_AGE_MS) {
    return null
  }
  const expected = serverKeyedDigest(
    "guest-cookie-v1",
    [guestId, issuedAt],
    options.secret
  )
  return timingSafeEqualHex(expected, signature) ? guestId : null
}

/**
 * The network one address belongs to: IPv4 as is, IPv6 as its /64 (the block
 * one host normally controls, so address rotation inside it stays one bucket).
 */
export function networkPrefix(ip: string): string {
  const address = (ip.replace(/^\[|\]$/g, "").split("%")[0] ?? "").toLowerCase()
  if (!address.includes(":")) return address

  // A dotted IPv4 tail becomes its two hex groups, so every spelling of one
  // address expands to the same eight groups.
  const toGroups = (part: string) =>
    part
      ? part.split(":").flatMap((group) => {
          const octets = group.split(".").map(Number)
          if (octets.length !== 4) return [group]
          const [a = 0, b = 0, c = 0, d = 0] = octets
          return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)]
        })
      : []
  const [head = "", tail] = address.split("::")
  const headGroups = toGroups(head)
  const tailGroups = toGroups(tail ?? "")
  const groups = (
    tail === undefined
      ? headGroups
      : [
          ...headGroups,
          ...Array<string>(
            Math.max(0, 8 - headGroups.length - tailGroups.length)
          ).fill("0"),
          ...tailGroups,
        ]
  ).map((group) => Number.parseInt(group, 16) || 0)

  // IPv4-mapped (::ffff:a.b.c.d in any spelling) is the IPv4 address itself.
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    const [high = 0, low = 0] = groups.slice(6)
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`
}

/**
 * The client network, or null when no trustworthy source exists. Only on
 * Vercel is `x-real-ip` set by the platform edge, which overwrites any
 * client-sent value; anywhere else the header is caller-controlled, so it is
 * ignored and every guest shares one network bucket (stricter, never chosen
 * by the caller).
 */
export function resolveClientNetwork(
  headers: Headers,
  env: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  if (env.VERCEL !== "1") return null
  const ip = headers.get("x-real-ip")?.trim()
  return ip ? networkPrefix(ip) : null
}

/** Keyed hash, so Convex stores no raw client address. */
export function guestNetworkKey(
  network: string | null,
  secret?: string
): string {
  return serverKeyedDigest(
    "guest-network-v1",
    [network ?? "unattributed"],
    secret
  )
}

/**
 * Resolve the trusted guest actor for this request, minting the guest cookie
 * when it is missing or invalid. Throws when the server secret is missing, so
 * guest turns fail closed instead of running unlimited.
 */
export async function resolveGuestIdentity(req: Request): Promise<GuestActor> {
  const cookieStore = await cookies()
  const now = Date.now()
  let guestId = verifyGuestCookie(cookieStore.get(GUEST_COOKIE_NAME)?.value, {
    now,
  })
  if (!guestId) {
    guestId = createGuestUserId()
    cookieStore.set(GUEST_COOKIE_NAME, signGuestCookie(guestId, now), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE_MS / 1000,
    })
  }
  return {
    guestId,
    networkKey: guestNetworkKey(resolveClientNetwork(req.headers)),
  }
}
