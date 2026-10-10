import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider"
import { wrapLanguageModel } from "ai"

/**
 * Longest provider silence tolerated while a model call is writing its answer
 * (text or tool input). Reasoning, provider-run tools (hosted web search), and
 * the wait before the answer starts are legitimately silent, so they pause the
 * clock and stay bounded by the provider deadline (ADR-0039).
 */
export const ANSWER_STALL_TIMEOUT_MS = 60_000

/** The provider stopped producing mid-answer on a healthy connection. */
export class ProviderStallError extends Error {
  constructor(timeoutMs: number) {
    super(`Provider stream stalled: no output for ${timeoutMs}ms mid-answer`)
    this.name = "ProviderStallError"
  }
}

/**
 * Wrap each provider call so a mid-answer stall ends it with a stream `error`
 * part, like any provider error, and cancels the provider body. The turn then
 * settles through the normal failure path (ADR-0011). Per model call, so tool
 * execution and approval pauses between steps never count.
 */
export function withAnswerStallTimeout(
  model: LanguageModelV4,
  timeoutMs = ANSWER_STALL_TIMEOUT_MS
): LanguageModelV4 {
  return wrapLanguageModel({
    model,
    middleware: {
      wrapStream: async ({ doStream }) => {
        const result = await doStream()
        return {
          ...result,
          stream: guardAnswerStall(result.stream, timeoutMs),
        }
      },
    },
  })
}

/** Answer output arms the clock; reasoning and provider-run tools pause it. */
function isAnswering(
  part: LanguageModelV4StreamPart,
  answering: boolean
): boolean {
  switch (part.type) {
    case "text-delta":
    case "tool-input-delta":
      return true
    case "reasoning-start":
    case "reasoning-delta":
      return false
    case "tool-call":
      return part.providerExecuted ? false : answering
    default:
      return answering
  }
}

function guardAnswerStall(
  source: ReadableStream<LanguageModelV4StreamPart>,
  timeoutMs: number
): ReadableStream<LanguageModelV4StreamPart> {
  const reader = source.getReader()
  let answering = false
  let closed = false

  return new ReadableStream<LanguageModelV4StreamPart>({
    async pull(controller) {
      // The clock runs only while a provider read is pending, so downstream
      // backpressure never reads as provider silence.
      const timer = answering
        ? setTimeout(() => {
            closed = true
            const error = new ProviderStallError(timeoutMs)
            controller.enqueue({ type: "error", error })
            controller.close()
            // The pending read resolves done; the cancel outcome is moot.
            reader.cancel(error).catch(() => {})
          }, timeoutMs)
        : undefined
      let next: ReadableStreamReadResult<LanguageModelV4StreamPart>
      try {
        next = await reader.read()
      } finally {
        clearTimeout(timer)
      }
      if (closed) return
      if (next.done) {
        closed = true
        controller.close()
        return
      }
      answering = isAnswering(next.value, answering)
      controller.enqueue(next.value)
    },
    cancel(reason) {
      closed = true
      return reader.cancel(reason)
    },
  })
}
