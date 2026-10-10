import type { LanguageModelV4StreamPart } from "@ai-sdk/provider"
import { MockLanguageModelV4 } from "ai/test"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  ProviderStallError,
  withAnswerStallTimeout,
} from "./provider-stall-timeout"

const TIMEOUT_MS = 1_000

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it("lets reasoning stay silent past the window, then fails a mid-answer stall", async () => {
  let push: (part: LanguageModelV4StreamPart) => void = () => {}
  let cancelReason: unknown
  const provider = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          push = (part) => controller.enqueue(part)
        },
        cancel(reason) {
          cancelReason = reason
        },
      }),
    }),
  })
  const { stream } = await withAnswerStallTimeout(
    provider,
    TIMEOUT_MS
  ).doStream({ prompt: [] })
  const received: LanguageModelV4StreamPart[] = []
  const reader = stream.getReader()
  const drained = (async () => {
    for (let next = await reader.read(); !next.done; next = await reader.read())
      received.push(next.value)
  })()

  push({ type: "reasoning-start", id: "r1" })
  await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 3)
  push({ type: "reasoning-delta", id: "r1", delta: "Thinking." })
  push({ type: "reasoning-end", id: "r1" })
  push({ type: "text-start", id: "t1" })
  push({ type: "text-delta", id: "t1", delta: "Partial" })
  await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1)
  expect(received.some((part) => part.type === "error")).toBe(false)

  await vi.advanceTimersByTimeAsync(1)
  await drained

  expect(received.at(-2)).toMatchObject({
    type: "text-delta",
    delta: "Partial",
  })
  expect(received.at(-1)).toMatchObject({ type: "error" })
  expect(cancelReason).toBeInstanceOf(ProviderStallError)
})
