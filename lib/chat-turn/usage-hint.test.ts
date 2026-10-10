import { describe, expect, it, vi } from "vitest"
import {
  loadGuestUsageHint,
  readGuestUsageHint,
  recordGuestUsageHint,
  spendGuestUsageHint,
} from "./usage-hint"

const fetchGuestUsage = vi.hoisted(() => vi.fn<() => Promise<number>>())
vi.mock("@/lib/api", () => ({ fetchGuestUsage }))

const at = (iso: string) => Date.parse(iso)

describe("guest usage hint", () => {
  it("expires at 5 minutes or UTC midnight", () => {
    recordGuestUsageHint(2, at("2027-01-15T12:00:00Z"))
    spendGuestUsageHint()
    expect(readGuestUsageHint(at("2027-01-15T12:04:59Z"))).toBe(1)
    expect(readGuestUsageHint(at("2027-01-15T12:05:00Z"))).toBeNull()

    // A zero seen just before midnight never blocks the new day's allowance.
    recordGuestUsageHint(0, at("2027-01-15T23:58:00Z"))
    expect(readGuestUsageHint(at("2027-01-15T23:59:59Z"))).toBe(0)
    expect(readGuestUsageHint(at("2027-01-16T00:00:00Z"))).toBeNull()
  })

  it("keeps a zero recorded while an older read is in flight", async () => {
    let resolveRead: (remaining: number) => void = () => {}
    fetchGuestUsage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve
      })
    )
    const read = loadGuestUsageHint()
    recordGuestUsageHint(0)
    resolveRead(3)
    expect(await read).toBe(0)
    expect(readGuestUsageHint()).toBe(0)
  })

  it("expires a zero read before UTC midnight that lands after it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      let resolveRead: (remaining: number) => void = () => {}
      fetchGuestUsage.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRead = resolve
        })
      )
      vi.setSystemTime(at("2027-01-15T23:59:59.900Z"))
      const read = loadGuestUsageHint()
      vi.setSystemTime(at("2027-01-16T00:00:00.100Z"))
      resolveRead(0)
      expect(await read).toBeNull()
      expect(readGuestUsageHint()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
