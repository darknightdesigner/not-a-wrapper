---
name: add-ai-provider
description: Add a new AI provider to the openproviders abstraction layer. Use when integrating a new AI service (e.g., Cohere, AI21, Fireworks) or when asked to "add support for [provider]".
---

# Add AI Provider

Guide for integrating a new AI provider into the Not A Wrapper codebase.

## Prerequisites

- [ ] Provider has a Vercel AI SDK package (`@ai-sdk/[provider]`)
- [ ] You have the provider's model IDs
- [ ] You know the provider's pricing and capabilities

## Quick Reference

| Step | File | Action |
|------|------|--------|
| 1 | `package.json` | Install `@ai-sdk/[provider]` |
| 2 | `lib/openproviders/types.ts` | Add to `Provider` union |
| 3 | `lib/openproviders/index.ts` | Add case in factory |
| 4 | `lib/openproviders/provider-map.ts` | Map model IDs |
| 5 | `lib/openproviders/env.ts` | Add env var handling |
| 6 | `lib/models/data/[provider].ts` | Create model configs |
| 7 | `lib/models/index.ts` | Export models |

## Step-by-Step

### 1. Install SDK Package

```bash
bun add @ai-sdk/[provider]
```

### 2. Add Provider Type

```typescript
// lib/openproviders/types.ts
export type Provider =
  | "openai"
  | "mistral"
  | "anthropic"
  | "[new-provider]"  // Add here
  // ...

export type ProviderWithoutOllama = Exclude<Provider, "ollama">
```

### 3. Add Factory Case

```typescript
// lib/openproviders/index.ts
import { create[Provider] } from "@ai-sdk/[provider]"

// Inside openproviders function, add case:
case "[new-provider]":
  return create[Provider]({
    apiKey: apiKey || process.env.[PROVIDER]_API_KEY,
    ...settings,
  })(modelId)
```

### 4. Map Model IDs

```typescript
// lib/openproviders/provider-map.ts
export const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  // Add all model IDs for this provider
  "[model-id-1]": "[new-provider]",
  "[model-id-2]": "[new-provider]",
  // ...
}

// Or add pattern matching in getProviderForModel():
if (modelId.startsWith("[provider-prefix]")) return "[new-provider]"
```

### 5. Add BYOK Support

Two files need updates for Bring Your Own Key support:

**a) Update `lib/openproviders/env.ts`** for key aggregation:

```typescript
// lib/openproviders/env.ts
export function createEnvWithUserKeys(userKeys: UserKeys) {
  return {
    // Add:
    [PROVIDER]_API_KEY: userKeys["[new-provider]"] || process.env.[PROVIDER]_API_KEY,
  }
}
```

**b) Add to `.env.example`**:

```bash
[PROVIDER]_API_KEY=  # Optional: [Provider] API key
```

> **Note:** The API key injection happens in the factory case you added in step 3. The `env.ts` file aggregates user keys with environment keys for BYOK support.

### 6. Create Model Definitions

```typescript
// lib/models/data/[provider].ts
import { openproviders } from "@/lib/openproviders"
import type { ModelConfig } from "../types"

export const [PROVIDER]_MODELS: ModelConfig[] = [
  {
    id: "[model-id]",
    name: "[Display Name]",
    provider: "[Provider Name]",      // UI display
    providerId: "[new-provider]",     // Internal ID
    baseProviderId: "[sdk-prefix]",   // AI SDK prefix
    modelFamily: "[Family]",
    
    description: "Brief description",
    tags: ["fast", "cheap"],          // Optional
    
    contextWindow: 128000,
    inputCost: 0.50,                  // Per 1M tokens
    outputCost: 1.50,
    
    vision: false,
    tools: true,
    reasoning: false,
    
    speed: "Fast",
    intelligence: "Medium",
    
    icon: "[provider]",
    
    apiSdk: (apiKey, opts) => 
      openproviders("[model-id]", {}, apiKey),
  },
]
```

### 7. Export Models

```typescript
// lib/models/index.ts
import { [PROVIDER]_MODELS } from "./data/[provider]"

export const STATIC_MODELS: ModelConfig[] = [
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS,
  ...[PROVIDER]_MODELS,  // Add here
  // ...
]
```

## Validation Checklist

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] Provider appears in model selector
- [ ] Can send message with new provider's model
- [ ] BYOK works (user can add their own key)

## Common Mistakes

1. **Missing model mappings** - Every model ID must be in `MODEL_PROVIDER_MAP`
2. **Wrong baseProviderId** - Check what the AI SDK actually uses (for display only)
3. **Missing apiSdk function** - Each model needs this factory
4. **Forgetting env.ts** - BYOK won't work without this

## Aggregator Providers (Special Case)

Aggregator providers like **OpenRouter** use a different pattern:

1. Model IDs are prefixed: `"openrouter:anthropic/claude-3.5-sonnet"`
2. Use pattern matching instead of explicit mapping:

```typescript
// lib/openproviders/provider-map.ts
export function getProviderForModel(model: SupportedModel): Provider {
  // Aggregators use prefix matching
  if (model.startsWith("openrouter:")) {
    return "openrouter"
  }
  // ... rest of function
}
```

3. The factory case extracts the actual model ID from the prefix

## Reference

For detailed checklist, see `references/provider-checklist.md`
