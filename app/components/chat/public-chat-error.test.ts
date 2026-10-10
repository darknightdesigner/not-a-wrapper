import { describe, expect, it } from "vitest"
import {
  hasPublicChatErrorCode,
  presentChatStreamError,
} from "./public-chat-error"

const guest = { isAuthenticated: false }

describe("presentChatStreamError", () => {
  it("swallows a lost approval-continuation race by structured code", () => {
    const error = new Error(
      JSON.stringify({
        error: "Approval continuation already dispatched",
        code: "APPROVAL_CONTINUATION_CONFLICT",
      })
    )
    expect(presentChatStreamError(error, guest)).toEqual({
      kind: "swallow",
      reason: "approval-continuation-lost-race",
    })
  })

  it("surfaces an unresolved approval with the server's actionable message", () => {
    const error = new Error(
      JSON.stringify({
        error: "Your approval decision was not recorded. Approve or deny it again.",
        code: "APPROVAL_UNRESOLVED",
      })
    )
    expect(presentChatStreamError(error, guest)).toEqual({
      kind: "toast",
      title: "Your approval decision was not recorded. Approve or deny it again.",
    })
  })

  it("offers a guest at the daily limit or guest capacity sign-in, not a toast", () => {
    const error = new Error(
      JSON.stringify({
        error: "Daily message limit reached (5). Sign in to keep chatting.",
        code: "DAILY_LIMIT_REACHED",
      })
    )
    expect(presentChatStreamError(error, guest)).toEqual({ kind: "sign-in" })
    expect(
      presentChatStreamError(error, { isAuthenticated: true })
    ).toMatchObject({ kind: "toast" })
    const atCapacity = new Error(
      JSON.stringify({
        error: "Guest messages are at capacity for today. Sign in to keep chatting.",
        code: "GUEST_CAPACITY_REACHED",
      })
    )
    expect(presentChatStreamError(atCapacity, guest)).toEqual({
      kind: "sign-in",
    })
    // Presented here, so the turn runner adds no second, generic toast.
    expect(hasPublicChatErrorCode(error)).toBe(true)
    expect(hasPublicChatErrorCode(new Error("fetch failed"))).toBe(false)
  })

  it("falls back to a generic title for opaque transport errors", () => {
    expect(presentChatStreamError(new Error("fetch failed"), guest)).toEqual({
      kind: "toast",
      title: "Something went wrong. Please try again.",
    })
    expect(presentChatStreamError(new Error("Failed to fetch"), guest)).toEqual(
      {
        kind: "toast",
        title: "Something went wrong. Please try again.",
      }
    )
    expect(
      presentChatStreamError(new Error("Rate limit exceeded"), guest)
    ).toEqual({
      kind: "toast",
      title: "Rate limit exceeded",
    })
  })
})
