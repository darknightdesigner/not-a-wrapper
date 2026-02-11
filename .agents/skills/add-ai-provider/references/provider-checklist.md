# Provider Integration Checklist

Detailed checklist for adding a new AI provider.

## Pre-Integration Research

- [ ] Verify Vercel AI SDK support: https://sdk.vercel.ai/providers
- [ ] Get official model IDs from provider documentation
- [ ] Document pricing (input/output per 1M tokens)
- [ ] Document capabilities per model:
  - [ ] Context window size
  - [ ] Vision support
  - [ ] Tool/function calling
  - [ ] Streaming support
  - [ ] Reasoning/thinking mode

## File Changes Checklist

### 1. Package Installation
```bash
bun add @ai-sdk/[provider]
```

Verify in `package.json`:
```json
{
  "dependencies": {
    "@ai-sdk/[provider]": "^x.x.x"
  }
}
```

### 2. Types (`lib/openproviders/types.ts`)

Add to Provider union:
```typescript
export type Provider =
  | "openai"
  | "mistral"
  | "perplexity"
  | "google"
  | "anthropic"
  | "xai"
  | "openrouter"
  | "[new-provider]"  // ← Add
```

### 3. Factory (`lib/openproviders/index.ts`)

Add import:
```typescript
import { create[Provider] } from "@ai-sdk/[provider]"
```

Add case in switch:
```typescript
case "[new-provider]":
  return create[Provider]({
    apiKey: apiKey || process.env.[PROVIDER]_API_KEY,
    ...settings,
  })(modelId)
```

### 4. Model Mapping (`lib/openproviders/provider-map.ts`)

Option A - Explicit mapping (preferred for few models):
```typescript
export const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  "[model-id-1]": "[new-provider]",
  "[model-id-2]": "[new-provider]",
}
```

Option B - Pattern matching (for many models):
```typescript
export function getProviderForModel(modelId: string): Provider {
  // Add before the MAP lookup:
  if (modelId.startsWith("[provider-prefix]")) return "[new-provider]"
  
  return MODEL_PROVIDER_MAP[modelId] || "openai"
}
```

### 5. Environment (`lib/openproviders/env.ts`)

Add to `createEnvWithUserKeys`:
```typescript
export function createEnvWithUserKeys(userKeys: UserKeys) {
  return {
    OPENAI_API_KEY: userKeys.openai || process.env.OPENAI_API_KEY,
    // ... existing
    [PROVIDER]_API_KEY: userKeys["[new-provider]"] || process.env.[PROVIDER]_API_KEY,
  }
}
```

### 6. Model Definitions (`lib/models/data/[provider].ts`)

Create new file with all models:
```typescript
import { openproviders } from "@/lib/openproviders"
import type { ModelConfig } from "../types"

export const [PROVIDER]_MODELS: ModelConfig[] = [
  {
    // Required fields
    id: "[exact-model-id]",           // Must match provider's API
    name: "[Human Readable Name]",
    provider: "[Provider Display]",    // e.g., "Cohere"
    providerId: "[new-provider]",      // e.g., "cohere"
    baseProviderId: "[sdk-id]",        // What AI SDK uses
    
    // Capabilities
    contextWindow: 128000,
    inputCost: 0.50,
    outputCost: 1.50,
    
    vision: false,
    tools: true,
    audio: false,
    reasoning: false,
    webSearch: false,
    openSource: false,
    
    // Performance indicators
    speed: "Fast",        // "Fast" | "Medium" | "Slow"
    intelligence: "High", // "Low" | "Medium" | "High"
    
    // Metadata
    description: "Brief description of model capabilities",
    tags: ["fast", "cheap", "vision"],
    icon: "[provider]",
    
    // Links (optional)
    website: "https://...",
    apiDocs: "https://...",
    modelPage: "https://...",
    releasedAt: "2025-01-15",
    
    // Factory function (REQUIRED)
    apiSdk: (apiKey, opts) => 
      openproviders("[exact-model-id]", {}, apiKey),
  },
  // Add more models...
]
```

### 7. Export (`lib/models/index.ts`)

Add import:
```typescript
import { [PROVIDER]_MODELS } from "./data/[provider]"
```

Add to STATIC_MODELS:
```typescript
export const STATIC_MODELS: ModelConfig[] = [
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS,
  ...[PROVIDER]_MODELS,  // ← Add
  // ...
]
```

### 8. Environment Example (`.env.example`)

Add documentation:
```bash
# [Provider Name]
[PROVIDER]_API_KEY=  # Optional: Your [Provider] API key for BYOK
```

## Post-Integration Testing

### Type Check
```bash
bun run typecheck
```

### Lint
```bash
bun run lint
```

### Manual Testing

1. **Model appears in selector**
   - Start dev server: `bun run dev`
   - Open model selector
   - Verify new models appear

2. **Send test message**
   - Select a new model
   - Send "Hello, respond with one word"
   - Verify streaming response works

3. **BYOK test**
   - Go to Settings → API Keys
   - Add provider API key
   - Verify model works with user key

4. **Error handling**
   - Test with invalid API key
   - Verify user-friendly error message

## Troubleshooting

### Model not appearing
- Check `lib/models/index.ts` exports the models
- Verify `accessible` isn't explicitly `false`

### "Provider not found" error
- Check `MODEL_PROVIDER_MAP` includes the model ID
- Check `getProviderForModel()` pattern matching

### Streaming not working
- Verify AI SDK package supports streaming
- Check factory function returns correct instance

### BYOK not working
- Check `env.ts` includes the provider
- Verify `providerId` matches key in `createEnvWithUserKeys`
