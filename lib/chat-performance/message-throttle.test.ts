/** @vitest-environment jsdom */
import { Chat } from "@ai-sdk/react"
import { expect, it, vi } from "vitest"
import { holdStreamingPaint } from "./interaction-priority"
import { subscribeToFrameAlignedMessages } from "./message-throttle"

it("defers streaming publications while a popup holds paint, never terminal ones", () => {
  let now = 0
  let nextFrame = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.spyOn(performance, "now").mockImplementation(() => now)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
  const paint = () => {
    now += 16
    const batch = [...frames.values()]
    frames.clear()
    batch.forEach((callback) => callback(now))
  }

  const chat = new Chat({ id: "held" })
  const status = vi.spyOn(chat, "status", "get").mockReturnValue("streaming")
  const statusCallbacks: Array<() => void> = []
  vi.spyOn(chat, "~registerStatusCallback").mockImplementation((callback) => {
    statusCallbacks.push(callback)
    return () => undefined
  })
  const onChange = vi.fn()
  const unsubscribe = subscribeToFrameAlignedMessages(chat, onChange)

  // Held: the frame passes without publishing; the next one publishes.
  const release = holdStreamingPaint()
  chat.messages = []
  paint()
  expect(onChange).not.toHaveBeenCalled()
  release()
  paint()
  expect(onChange).toHaveBeenCalledOnce()

  // A hold that is never released expires at its cap.
  holdStreamingPaint()
  chat.messages = []
  paint()
  expect(onChange).toHaveBeenCalledOnce()
  now += 300
  paint()
  expect(onChange).toHaveBeenCalledTimes(2)

  // A terminal transition publishes synchronously even while held.
  holdStreamingPaint()
  chat.messages = []
  status.mockReturnValue("ready")
  statusCallbacks.forEach((callback) => callback())
  expect(onChange).toHaveBeenCalledTimes(3)
  unsubscribe()
  vi.unstubAllGlobals()
})
