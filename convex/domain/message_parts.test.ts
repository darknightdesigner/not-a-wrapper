import { describe, expect, it } from "vitest"
import { capMessagePayload, extractTextFromMessageParts } from "./message_parts"

describe("capMessagePayload", () => {
  it("omits a part no cut can shrink instead of growing a short answer", () => {
    const file = {
      type: "file",
      mediaType: "image/png",
      url: `data:image/png;base64,${"A".repeat(1024 * 1024)}`,
    }
    const answer = { type: "text", text: "a" }

    const capped = capMessagePayload("a", [file, answer])

    expect(capped.parts).toEqual([
      {
        type: "text",
        text: expect.stringContaining("[Omitted to fit the message size limit"),
      },
      answer,
    ])
    expect(capped.content).toBe(extractTextFromMessageParts(capped.parts))
    expect(capped.omittedBytes).toBeGreaterThan(1024 * 1024 - 896 * 1024)
  })
})
