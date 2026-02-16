import { describe, expect, it } from "vitest"
import { resolveComposerPrimaryActionState } from "./primary-action-state"

describe("resolveComposerPrimaryActionState", () => {
  it("returns enabled send action when send preconditions pass", () => {
    const action = resolveComposerPrimaryActionState({
      isStreaming: false,
      isAbortable: false,
      canSend: true,
    })

    expect(action.mode).toBe("send")
    expect(action.disabled).toBe(false)
    expect(action.ariaLabel).toBe("Send message")
    expect(action.tooltip).toBe("Send")
    expect(action.intent).toBe("send")
  })

  it("returns disabled send action when send preconditions fail", () => {
    const action = resolveComposerPrimaryActionState({
      isStreaming: false,
      isAbortable: false,
      canSend: false,
    })

    expect(action.mode).toBe("send")
    expect(action.disabled).toBe(true)
  })

  it("returns enabled stop action even when send preconditions fail", () => {
    const action = resolveComposerPrimaryActionState({
      isStreaming: true,
      isAbortable: true,
      canSend: false,
    })

    expect(action.mode).toBe("stop")
    expect(action.disabled).toBe(false)
    expect(action.ariaLabel).toBe("Stop")
    expect(action.tooltip).toBe("Stop")
    expect(action.intent).toBe("stop")
  })

  it("returns disabled stop action only when stream is not abortable", () => {
    const action = resolveComposerPrimaryActionState({
      isStreaming: true,
      isAbortable: false,
      canSend: true,
    })

    expect(action.mode).toBe("stop")
    expect(action.disabled).toBe(true)
  })
})
