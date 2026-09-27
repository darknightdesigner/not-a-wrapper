import { describe, expect, it } from "vitest"
import { deriveProviderSafetyIdentifier } from "./safety-identifier"

const SECRET = "s".repeat(32)

describe("deriveProviderSafetyIdentifier", () => {
  it("keys guests and users apart, and sends none without a usable secret", () => {
    const user = deriveProviderSafetyIdentifier(
      { kind: "user", id: "a" },
      SECRET
    )
    const guest = deriveProviderSafetyIdentifier(
      { kind: "guest", id: "a" },
      SECRET
    )
    expect(user).toMatch(/^[0-9a-f]{32}$/)
    expect(guest).toMatch(/^[0-9a-f]{32}$/)
    expect(guest).not.toBe(user)
    expect(
      deriveProviderSafetyIdentifier({ kind: "guest", id: "a" }, "short")
    ).toBeUndefined()
  })
})
