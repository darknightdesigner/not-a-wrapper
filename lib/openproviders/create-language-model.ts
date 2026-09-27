import type { ModelConfig } from "@/lib/models/types"
import {
  getProviderStrategy,
  type ProviderLanguageModel,
} from "./provider-strategy"

export function createLanguageModel(
  route: ModelConfig,
  apiKey?: string,
  /** Hashed actor id for providers that take it at construction. */
  safetyIdentifier?: string
): ProviderLanguageModel {
  return getProviderStrategy(route.providerId)
    .instance(apiKey)
    .languageModel(route.id, {
      ...(route.reasoning ? { reasoning: route.reasoning } : {}),
      ...(safetyIdentifier !== undefined ? { safetyIdentifier } : {}),
    })
}
