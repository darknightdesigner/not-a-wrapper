import { LanguageModelV3 } from '@ai-sdk/provider'

type ModelConfig = {
  id: string // "gpt-5-mini" // same from AI SDKs
  name: string // "GPT-4.1 Nano"
  provider: string // "OpenAI", "Mistral", etc.
  providerId: string // "openai", "mistral", etc.
  modelFamily?: string // "GPT-4", "Claude 3", etc.
  baseProviderId: string // "gemini" // same from AI SDKs

  description?: string // Short 1–2 line summary
  tags?: string[] // ["fast", "cheap", "vision", "OSS"]

  contextWindow?: number // in tokens
  maxOutput?: number // max output tokens (used for thinking budget allocation)
  inputCost?: number // USD per 1M input tokens
  outputCost?: number // USD per 1M output tokens
  priceUnit?: string // "per 1M tokens", "per image", etc.

  vision?: boolean
  tools?: boolean
  audio?: boolean
  reasoningText?: boolean
  webSearch?: boolean
  openSource?: boolean

  /**
   * Thinking mode for this model.
   *   - "adaptive" — model dynamically allocates thinking budget (Opus 4.6+)
   *   - "enabled"  — fixed budget via budgetTokens (default for older models)
   *   - undefined  — inherit from reasoningText flag (backward compat)
   */
  thinkingMode?: "adaptive" | "enabled"

  speed?: "Fast" | "Medium" | "Slow"
  intelligence?: "Low" | "Medium" | "High"

  website?: string // official website (e.g. https://openai.com)
  apiDocs?: string // official API docs (e.g. https://platform.openai.com/docs/api-reference)
  modelPage?: string // official product page (e.g. https://x.ai/news/grok-2)
  releasedAt?: string // "2024-12-01" (optional, for tracking changes)

  icon?: string // e.g. "gpt-4", "claude", "mistral", or custom string

  // apiSdk?: () => LanguageModelV3 // "openai("gpt-5-mini")"
  apiSdk?: (
    apiKey?: string,
    opts?: { enableSearch?: boolean }
  ) => LanguageModelV3

  accessible?: boolean // true if the model is accessible to the user
}

export type { ModelConfig }
