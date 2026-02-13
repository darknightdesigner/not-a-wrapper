import type { UIMessage } from "ai"
import { anthropicAdapter } from "./anthropic"
import { defaultAdapter } from "./default"
import { googleAdapter } from "./google"
import { openaiCompatibleAdapter } from "./openai-compatible"
import { openaiAdapter } from "./openai"
import { textOnlyAdapter } from "./text-only"
import type {
  AdaptationContext,
  AdaptationResult,
  AdapterRegistry,
  ProviderHistoryAdapter,
} from "./types"

const KNOWN_UNDERLYING_PROVIDERS = ["anthropic", "openai", "google", "xai", "mistral"] as const

function extractUnderlyingProvider(modelId: string): (typeof KNOWN_UNDERLYING_PROVIDERS)[number] | null {
  const [prefix] = modelId.split("/")
  if (!prefix) return null

  return KNOWN_UNDERLYING_PROVIDERS.includes(prefix as (typeof KNOWN_UNDERLYING_PROVIDERS)[number])
    ? (prefix as (typeof KNOWN_UNDERLYING_PROVIDERS)[number])
    : null
}

export const registry: AdapterRegistry = new Map<string, ProviderHistoryAdapter>()

registry.set("openai", openaiAdapter)
registry.set("anthropic", anthropicAdapter)
registry.set("google", googleAdapter)
registry.set("xai", openaiCompatibleAdapter)
registry.set("mistral", openaiCompatibleAdapter)
registry.set("perplexity", textOnlyAdapter)

export async function adaptHistoryForProvider(
  messages: readonly UIMessage[],
  providerId: string,
  context: AdaptationContext,
): Promise<AdaptationResult> {
  let adapter: ProviderHistoryAdapter

  if (providerId === "openrouter") {
    const underlyingProvider = extractUnderlyingProvider(context.targetModelId)
    adapter = (underlyingProvider ? registry.get(underlyingProvider) : null) ?? defaultAdapter
  } else {
    adapter = registry.get(providerId) ?? defaultAdapter
  }

  return adapter.adaptMessages(messages, context)
}
