import { describe, expect, it } from "vitest"
import {
  extractTextFromMessageParts,
  isActiveGenerationRunStatus,
  isAwaitingApprovalStatus,
  isTerminalGenerationRunStatus,
  isTerminalMessageStatus,
} from "./message_facts"

describe("message facts", () => {
  it("classifies the shared lifecycle states", () => {
    expect(isTerminalMessageStatus("completed")).toBe(true)
    expect(isTerminalMessageStatus("streaming")).toBe(false)
    expect(isTerminalGenerationRunStatus("failed")).toBe(true)
    expect(isActiveGenerationRunStatus("queued")).toBe(true)
    expect(isActiveGenerationRunStatus("awaiting_approval")).toBe(true)
    expect(isActiveGenerationRunStatus("pending")).toBe(false)
    expect(isAwaitingApprovalStatus("awaiting_approval")).toBe(true)
  })

  it("extracts only ordered, valid text parts", () => {
    expect(
      extractTextFromMessageParts([
        { type: "text", text: "hello" },
        { type: "reasoning", text: "hidden" },
        { type: "text", text: " world" },
        { type: "file", filename: "receipt.pdf" },
        { type: "text", text: 123 },
        null,
      ])
    ).toBe("hello world")
    expect(extractTextFromMessageParts(undefined)).toBe("")
    expect(extractTextFromMessageParts({ type: "text", text: "ignored" })).toBe(
      ""
    )
  })
})
