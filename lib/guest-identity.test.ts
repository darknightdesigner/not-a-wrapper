import { describe, expect, it } from "vitest"
import {
  GUEST_COOKIE_MAX_AGE_MS,
  resolveClientNetwork,
  signGuestCookie,
  verifyGuestCookie,
} from "./guest-identity"

const SECRET = "test-chat-admission-secret-with-32-bytes"
const GUEST_ID = "guest_3f2c6c1e-8b0d-4a3f-9a6e-1c2b3d4e5f60"
const OTHER_GUEST_ID = "guest_9a6e1c2b-8b0d-4a3f-9a6e-3f2c6c1e5f60"

describe("guest identity (ADR-0045)", () => {
  it("accepts only an unexpired cookie this server signed", () => {
    const now = Date.UTC(2026, 8, 27)
    const cookie = signGuestCookie(GUEST_ID, now, SECRET)
    const verify = (value: string | undefined, at = now) =>
      verifyGuestCookie(value, { secret: SECRET, now: at })

    expect(verify(cookie)).toBe(GUEST_ID)
    // A caller cannot claim another id, or mint one without the secret.
    expect(verify(cookie.replace(GUEST_ID, OTHER_GUEST_ID))).toBeNull()
    expect(
      verify(
        signGuestCookie(GUEST_ID, now, "another-secret-with-at-least-32-bytes")
      )
    ).toBeNull()
    expect(verify(cookie, now + GUEST_COOKIE_MAX_AGE_MS + 1)).toBeNull()
    expect(verify(undefined)).toBeNull()
  })

  it("trusts the client address only where the platform sets it", () => {
    const network = (ip: string, env: Record<string, string>) =>
      resolveClientNetwork(new Headers({ "x-real-ip": ip }), env)

    // Off Vercel the header is caller-controlled: every guest shares a bucket.
    expect(network("203.0.113.7", {})).toBeNull()
    expect(network("203.0.113.7", { VERCEL: "1" })).toBe("203.0.113.7")
    // One IPv6 host rotates inside its /64; that is still one network.
    expect(network("2001:db8:1:2::1", { VERCEL: "1" })).toBe(
      network("2001:0db8:1:2:abcd::9", { VERCEL: "1" })
    )
    expect(network("2001:db8:1:3::1", { VERCEL: "1" })).not.toBe(
      network("2001:db8:1:2::1", { VERCEL: "1" })
    )
    // Every spelling of an IPv4-mapped address is the IPv4 address.
    for (const mapped of [
      "::ffff:192.0.2.1",
      "::ffff:c000:201",
      "0:0:0:0:0:ffff:c000:0201",
    ]) {
      expect(network(mapped, { VERCEL: "1" })).toBe("192.0.2.1")
    }
  })
})
