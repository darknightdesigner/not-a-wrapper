import { describe, expect, it } from "vitest"
import { getAllModels } from "../models"
import { getProviderForModel } from "./provider-map"

describe("getProviderForModel", () => {
  it("resolves migrated legacy IDs before provider lookup", () => {
    expect(getProviderForModel("deepseek-r1")).toBe("openrouter")
    expect(getProviderForModel("mistral-small-2503")).toBe("mistral")
    expect(getProviderForModel("sonar-reasoning")).toBe("perplexity")
    expect(getProviderForModel("grok-4")).toBe("xai")
  })

  it("resolves deduped OpenRouter aliases to direct providers", () => {
    expect(
      getProviderForModel("openrouter:google/gemini-2.0-flash-lite-001")
    ).toBe("google")
    expect(getProviderForModel("openrouter:openai/gpt-4.1")).toBe("openai")
  })

  it("routes canonical and fast non-reasoning Grok IDs", () => {
    expect(getProviderForModel("grok-4-0709")).toBe("xai")
    expect(getProviderForModel("grok-4-1-fast-non-reasoning")).toBe("xai")
  })

  it("keeps model catalog IDs routable through provider map", async () => {
    const models = await getAllModels()

    for (const model of models) {
      expect(getProviderForModel(model.id)).toBe(model.providerId)
    }
  })
})
