import { describe, expect, it } from "vitest"
import { getLogicalModelInfo } from "@/lib/models"
import { getReasoningEffortLabel } from "@/lib/reasoning-effort"

describe("getReasoningEffortLabel", () => {
  it("names effort in the model maker's own words on every route", () => {
    const levels = getLogicalModelInfo("claude-sonnet-5-5")?.effortLevels ?? []
    const label = (modelId: string) =>
      levels.map((level) => getReasoningEffortLabel(level, modelId))

    // claude.ai's menu, verbatim (2026-11-11).
    const claude = ["Low", "Medium", "High", "Extra", "Max"]
    expect(label("claude-sonnet-5-5")).toEqual(claude)
    expect(label("openrouter:anthropic/claude-sonnet-5.5")).toEqual(claude)
    // Overrides are per maker, never global.
    expect(getReasoningEffortLabel("xhigh", "gpt-5.6-sol")).toBe("Extra High")
  })
})
