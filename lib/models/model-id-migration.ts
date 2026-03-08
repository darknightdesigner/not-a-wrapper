const MODEL_ID_REPLACEMENTS: Record<string, string> = {
  // Legacy IDs with provider-routing mismatches or invalid upstream IDs.
  "deepseek-r1": "openrouter:deepseek/deepseek-r1:free",
  "deepseek-v3": "openrouter:deepseek/deepseek-r1:free",
  "codestral-latest": "codestral-2508",
  "ministral-3b-latest": "ministral-3b-2512",
  "ministral-8b-latest": "ministral-8b-2512",
  "mistral-large-latest": "mistral-large-2512",
  "mistral-small-latest": "mistral-small-2506",
  "pixtral-large-latest": "pixtral-large-2411",
  "mistral-small-2503": "mistral-small-2506",

  // Removed upstream.
  "sonar-reasoning": "sonar-reasoning-pro",
  "grok-4": "grok-4-0709",

  // OpenRouter deprecations/sunset.
  "openrouter:anthropic/claude-3.7-sonnet:thinking":
    "claude-sonnet-4-20250514",
  "openrouter:google/gemini-3-pro-preview": "gemini-2.5-pro",
  "openrouter:google/gemini-2.0-flash-001": "gemini-2.5-flash",
  "openrouter:google/gemini-2.0-flash-lite-001": "gemini-2.5-flash",
  "openrouter:anthropic/claude-sonnet-4": "claude-sonnet-4-20250514",
  "openrouter:google/gemini-2.5-pro": "gemini-2.5-pro",
  "openrouter:google/gemini-2.5-flash": "gemini-2.5-flash",
  "openrouter:openai/gpt-4.1": "gpt-4.1",
  "openrouter:openai/o4-mini": "o4-mini",
  "openrouter:perplexity/sonar": "sonar",
  "openrouter:perplexity/sonar-reasoning": "sonar-reasoning-pro",
  "openrouter:perplexity/sonar-reasoning-pro": "sonar-reasoning-pro",
  "openrouter:perplexity/sonar-pro": "sonar-pro",
  "openrouter:perplexity/sonar-deep-research": "sonar-deep-research",

  // Direct Google model sunset risk.
  "gemini-3-pro-preview": "gemini-2.5-pro",
}

export function resolveModelId(modelId: string): string {
  return MODEL_ID_REPLACEMENTS[modelId] ?? modelId
}

export function resolveModelIds(modelIds: readonly string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const modelId of modelIds) {
    const resolved = resolveModelId(modelId)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    normalized.push(resolved)
  }

  return normalized
}
