import { describe, expect, it } from "vitest"
import { classifyChatError } from "./chat-error-taxonomy"

describe("classifyChatError", () => {
  it("classifies auth errors from nested AI SDK payloads", () => {
    const wrapped = {
      message: "AI request failed",
      error: {
        statusCode: 401,
        message: "Invalid API key",
      },
    }

    expect(classifyChatError(wrapped)).toBe("auth")
  })

  it("classifies rate limits from nested error.error payloads", () => {
    const wrapped = {
      name: "APICallError",
      error: {
        statusCode: 429,
        message: "Rate limit exceeded",
      },
    }

    expect(classifyChatError(wrapped)).toBe("rate_limit")
  })

  it("classifies provider failures from nested cause payloads", () => {
    const wrapped = {
      message: "Streaming failed",
      cause: {
        statusCode: 503,
        message: "OpenAI upstream unavailable",
      },
    }

    expect(classifyChatError(wrapped)).toBe("provider_api")
  })
})
