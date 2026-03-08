import { describe, expect, it } from "vitest"
import { getModelInfo } from "./index"
import { resolveModelId, resolveModelIds } from "./model-id-migration"

describe("model ID migration", () => {
  it("maps legacy and deprecated IDs to supported replacements", () => {
    expect(resolveModelId("deepseek-v3")).toBe(
      "openrouter:deepseek/deepseek-r1:free"
    )
    expect(resolveModelId("mistral-small-2503")).toBe("mistral-small-2506")
    expect(resolveModelId("mistral-large-latest")).toBe("mistral-large-2512")
    expect(resolveModelId("sonar-reasoning")).toBe("sonar-reasoning-pro")
    expect(resolveModelId("grok-4")).toBe("grok-4-0709")
    expect(resolveModelId("openrouter:google/gemini-2.0-flash-001")).toBe(
      "gemini-2.5-flash"
    )
    expect(resolveModelId("openrouter:openai/gpt-4.1")).toBe("gpt-4.1")
  })

  it("normalizes arrays and de-duplicates in stable order", () => {
    expect(
      resolveModelIds([
        "deepseek-r1",
        "openrouter:deepseek/deepseek-r1:free",
        "sonar-reasoning",
        "sonar-reasoning-pro",
      ])
    ).toEqual([
      "openrouter:deepseek/deepseek-r1:free",
      "sonar-reasoning-pro",
    ])
  })

  it("keeps catalog lookups backward compatible for migrated IDs", () => {
    expect(getModelInfo("grok-4")?.id).toBe("grok-4-0709")
    expect(getModelInfo("grok-4-1-fast-non-reasoning")?.id).toBe(
      "grok-4-1-fast-non-reasoning"
    )
  })
})
