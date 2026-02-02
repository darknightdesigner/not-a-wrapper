# Project Glossary

Domain-specific terminology for the Not A Wrapper codebase. AI assistants should reference this when encountering these terms.

## AI Model Terminology

### Model (Three Meanings)

| Context | Meaning | Example |
|---------|---------|---------|
| **ModelConfig** | Full configuration object with metadata | `{ id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "OpenAI", ... }` |
| **Model ID** | String identifier matching AI SDK | `"gpt-4.1-nano"`, `"claude-3-5-sonnet-latest"` |
| **Model Instance** | `LanguageModelV1` from AI SDK | Return value of `modelConfig.apiSdk()` |

When code says "model", determine which meaning from context:
- Database/API requests → Model ID string
- `allModels.find()` → Returns ModelConfig object
- `streamText({ model: ... })` → Model Instance

### Provider Terminology

| Term | Purpose | Example Values |
|------|---------|----------------|
| **provider** | Display name for UI | `"OpenAI"`, `"Anthropic"`, `"Mistral"` |
| **providerId** | Internal ID for filtering, API key lookups, factory routing | `"openai"`, `"anthropic"`, `"mistral"` |
| **baseProviderId** | AI SDK model prefix (for display/grouping only) | `"openai"`, `"claude"`, `"google"` |

**Important distinctions:**

- `providerId` is used in `lib/openproviders/index.ts` for factory routing (the switch/if cases)
- `baseProviderId` is metadata in `ModelConfig` for UI grouping—it does NOT affect factory routing
- Anthropic models use `providerId: "anthropic"` (factory uses `"anthropic"` case) but `baseProviderId: "claude"` (because models display as "claude-3-5-sonnet", etc.)

```typescript
// Factory routing uses providerId (via getProviderForModel)
if (provider === "anthropic") {  // ← providerId
  return anthropic(modelId)      // ← returns claude-prefixed model
}

// ModelConfig uses both
{
  providerId: "anthropic",       // ← for factory/API key lookup
  baseProviderId: "claude",      // ← for display/grouping only
}
```

### apiSdk

Factory function on `ModelConfig` that returns an AI SDK model instance.

```typescript
// Signature
apiSdk?: (apiKey?: string, opts?: { enableSearch?: boolean }) => LanguageModelV1

// Usage
const modelInstance = modelConfig.apiSdk(userApiKey, { enableSearch: true })
const result = streamText({ model: modelInstance, ... })
```

### openproviders

Unified abstraction layer over multiple AI SDK providers. Located at `lib/openproviders/index.ts`.

```typescript
// Returns LanguageModelV1 for any supported model
openproviders("gpt-4.1-nano", settings, apiKey)
openproviders("claude-3-5-sonnet-latest", settings, apiKey)
```

## Message Terminology

### parts

Array of content parts from the AI SDK. Stored in database and used for rendering rich content.

| Part Type | Purpose |
|-----------|---------|
| `text` | Plain text content |
| `tool-invocation` | Tool calls and results |
| `reasoning` | Model reasoning (o1, o3 models) |
| `source` | Citations and sources |
| `step-start` | Multi-step reasoning markers |

```typescript
// Database schema
parts: v.optional(v.any())

// Extracting sources
const sources = getSources(message.parts)
```

### message_group_id

String identifier that groups related messages together. Used in multi-model comparison to link responses from different models to the same user message.

```typescript
// All responses to the same user prompt share this ID
{ role: "assistant", model: "gpt-4", message_group_id: "abc123" }
{ role: "assistant", model: "claude-3", message_group_id: "abc123" }
```

### MessageAISDK

Type from `@ai-sdk/react` or `ai` package representing a chat message.

```typescript
type MessageAISDK = {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string | ContentPart[]
  parts?: Part[]
  experimental_attachments?: Attachment[]
}
```

## Access Control

### accessible

Boolean flag on `ModelConfig` indicating if the current user can use this model.

Determined by:
- Model is in `FREE_MODELS_IDS` list
- Model is an Ollama model (always accessible)
- User has appropriate subscription tier

### BYOK (Bring Your Own Key)

Feature allowing users to provide their own API keys for AI providers. Keys are encrypted at rest using AES-256-GCM.

Related files:
- `lib/encryption.ts` - Encryption/decryption
- `convex/userKeys.ts` - Key storage
- `app/api/user-keys/route.ts` - Key management API

## State Management

### Optimistic Operations

UI updates that happen immediately before server confirmation, with rollback on failure.

```typescript
// Pattern
let previousState = null
setChats((prev) => {
  previousState = prev  // Save for rollback
  return updated        // Apply optimistic update
})

try {
  await serverMutation()
} catch {
  if (previousState) setChats(previousState)  // Rollback
}
```

### Server State vs Optimistic State

- **Server State**: Data from Convex queries (source of truth)
- **Optimistic State**: Temporary local state before server confirms
- **Merged State**: Combination shown in UI

```typescript
const chats = useMemo(
  () => mergeWithOptimistic(serverChats, optimisticOps),
  [serverChats, optimisticOps]
)
```

## Rate Limiting

### Daily Limits

| User Type | Limit | Reset |
|-----------|-------|-------|
| Anonymous | 5 messages/day | Midnight UTC |
| Authenticated | 1000 messages/day | Midnight UTC |
| Pro Models | 500 messages/day | Midnight UTC |

### clientUserId

Identifier for anonymous users in format `"guest_<uuid>"`. Required for tracking anonymous usage.

## File Locations

| Term | Location |
|------|----------|
| Model definitions | `lib/models/data/*.ts` |
| Provider abstraction | `lib/openproviders/` |
| Database schema | `convex/schema.ts` |
| Chat state | `lib/chat-store/` |
| API routes | `app/api/` |
| Chat components | `app/components/chat/` |
