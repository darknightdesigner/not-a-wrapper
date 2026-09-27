import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Doc } from "./_generated/dataModel"
import { admitUsageHandler } from "./usage"

type AdmissionCtx = Parameters<typeof admitUsageHandler>[0]

describe("admitUsageHandler", () => {
  const now = Date.UTC(2026, 7, 30, 12)
  const dayStart = Date.UTC(2026, 7, 30)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => vi.useRealTimers())

  it("increments the authenticated total and daily counters together", async () => {
    const user = {
      _id: "user-1",
      anonymous: false,
      messageCount: 9,
      dailyMessageCount: 4,
      dailyReset: dayStart,
    } as Doc<"users">
    const patch = vi.fn()
    const ctx = {
      identity: { subject: "workos-user-1" },
      user,
      db: { patch },
    } as unknown as AdmissionCtx

    await expect(admitUsageHandler(ctx)).resolves.toMatchObject({
      canSend: true,
      count: 5,
      remaining: 995,
    })
    expect(patch).toHaveBeenCalledWith("user-1", {
      messageCount: 10,
      dailyMessageCount: 5,
      dailyReset: dayStart,
      lastActiveAt: now,
    })
  })
})
