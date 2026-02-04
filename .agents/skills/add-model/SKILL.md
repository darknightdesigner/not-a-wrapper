---
name: add-model
description: Add a new AI model to an existing provider. Use when adding new models like "GPT-5" or "Claude 4" to providers already integrated, or when a provider releases new model versions.
---

# Add Model to Existing Provider

Guide for adding a new model to an existing AI provider in the registry.

## Prerequisites

- [ ] Provider already integrated (if not, use `add-ai-provider` skill)
- [ ] You have the exact model ID from the provider's API
- [ ] You know the model's pricing and capabilities

## Quick Reference

| Step | File | Action |
|------|------|--------|
| 1 | `lib/models/data/[provider].ts` | Add ModelConfig |
| 2 | `lib/openproviders/provider-map.ts` | Add model ID mapping |
| 3 | (Optional) `lib/openproviders/types.ts` | Add to model type union |

## Step-by-Step

### 1. Add Model Configuration

```typescript
// lib/models/data/[provider].ts
export const [PROVIDER]_MODELS: ModelConfig[] = [
  // Existing models...
  
  // Add new model:
  {
    id: "[exact-model-id]",         // From provider API docs
    name: "[Display Name]",          // Human-readable
    provider: "[Provider]",          // e.g., "OpenAI"
    providerId: "[provider-id]",     // e.g., "openai"
    baseProviderId: "[sdk-prefix]",  // e.g., "openai"
    modelFamily: "[Family]",         // e.g., "GPT-5"
    
    description: "Brief capability description",
    tags: ["fast", "vision", "reasoning"],
    
    contextWindow: 128000,
    inputCost: 2.50,                 // USD per 1M tokens
    outputCost: 10.00,
    
    vision: true,
    tools: true,
    audio: false,
    reasoning: true,
    webSearch: false,
    openSource: false,
    
    speed: "Medium",
    intelligence: "High",
    
    icon: "[provider]",
    releasedAt: "2025-01-15",
    
    apiSdk: (apiKey, opts) => 
      openproviders("[exact-model-id]", {}, apiKey),
  },
]
```

### 2. Add Model ID Mapping

```typescript
// lib/openproviders/provider-map.ts
export const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  // Existing mappings...
  "[exact-model-id]": "[provider-id]",  // Add this
}
```

### 3. (Optional) Add to Type Union

Only if `lib/openproviders/types.ts` has explicit model type unions:

```typescript
export type OpenAIModel = 
  | "gpt-4.1-nano"
  | "[new-model-id]"  // Add here
```

## ModelConfig Fields Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Exact model ID from provider API |
| `name` | string | Display name in UI |
| `provider` | string | Provider display name |
| `providerId` | string | Internal provider ID |
| `baseProviderId` | string | AI SDK provider prefix |
| `apiSdk` | function | Factory returning LanguageModelV3 |

### Capability Flags

| Field | Type | Description |
|-------|------|-------------|
| `vision` | boolean | Can process images |
| `tools` | boolean | Supports function calling |
| `audio` | boolean | Can process audio |
| `reasoning` | boolean | Has extended thinking mode |
| `webSearch` | boolean | Can search the web |
| `openSource` | boolean | Weights publicly available |

### Performance Indicators

| Field | Values | Description |
|-------|--------|-------------|
| `speed` | "Fast" \| "Medium" \| "Slow" | Response latency |
| `intelligence` | "Low" \| "Medium" \| "High" | Capability level |

### Pricing

| Field | Type | Description |
|-------|------|-------------|
| `contextWindow` | number | Max tokens in context |
| `inputCost` | number | USD per 1M input tokens |
| `outputCost` | number | USD per 1M output tokens |

## Validation

```bash
bun run typecheck  # No type errors
bun run lint       # No lint errors
bun run dev        # Model appears in selector
```

## Common Mistakes

1. **Wrong model ID** - Must match exactly what the provider API expects
2. **Missing provider-map entry** - Causes "provider not found" errors
3. **Wrong baseProviderId** - Causes SDK initialization failures
4. **Missing apiSdk function** - Model won't be usable

## Finding Model Information

- **OpenAI**: https://platform.openai.com/docs/models
- **Anthropic**: https://docs.anthropic.com/en/docs/models
- **Google**: https://ai.google.dev/models
- **Mistral**: https://docs.mistral.ai/getting-started/models
