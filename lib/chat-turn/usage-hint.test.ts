import { describe, expect, it } from "vitest"
import {
  GUEST_USAGE_OWNER,
  readUsageHint,
  recordUsageHint,
  spendUsageHint,
} from "./usage-hint"

const at = (iso: string) => Date.parse(iso)

describe("usage hint", () => {
  it("answers only its owner and expires at 5 minutes or UTC midnight", () => {
    recordUsageHint(GUEST_USAGE_OWNER, 2, at("2027-01-15T12:00:00Z"))
    spendUsageHint(GUEST_USAGE_OWNER)
    expect(readUsageHint(GUEST_USAGE_OWNER, at("2027-01-15T12:04:59Z"))).toBe(1)
    expect(readUsageHint("user:1", at("2027-01-15T12:01:00Z"))).toBeNull()
    expect(
      readUsageHint(GUEST_USAGE_OWNER, at("2027-01-15T12:05:00Z"))
    ).toBeNull()

    // A zero seen just before midnight never blocks the new day's allowance.
    recordUsageHint(GUEST_USAGE_OWNER, 0, at("2027-01-15T23:58:00Z"))
    expect(readUsageHint(GUEST_USAGE_OWNER, at("2027-01-15T23:59:59Z"))).toBe(0)
    expect(
      readUsageHint(GUEST_USAGE_OWNER, at("2027-01-16T00:00:00Z"))
    ).toBeNull()
  })
})
