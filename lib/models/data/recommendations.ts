import type { ModelRecommendationPolicy } from "../types"

/**
 * Exact default portfolios explicitly chosen by product. Models omitted from
 * a maker's policy remain selectable as Legacy models.
 */
export const MODEL_RECOMMENDATION_POLICIES = [
  {
    vendorId: "claude",
    currentModelIds: [
      "claude-fable-5-2",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ],
    verifiedAt: "2026-11-09",
  },
  {
    vendorId: "gemini",
    currentModelIds: [
      "gemini-4-argon",
      "gemini-3.8-flash",
      "openrouter:google/gemini-3.5-flash-lite",
    ],
    verifiedAt: "2026-11-09",
  },
  {
    vendorId: "openai",
    currentModelIds: [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6.1-terra",
      "gpt-6-luna",
    ],
    verifiedAt: "2026-11-09",
  },
] as const satisfies readonly ModelRecommendationPolicy[]
