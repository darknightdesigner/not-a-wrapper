# ADR-002: Vercel AI SDK for Multi-Provider Abstraction

## Status

**Accepted** — January 2025

## Context

The project supports 100+ AI models across 8+ providers:
- OpenAI (GPT-4, GPT-4.1)
- Anthropic (Claude 3.5, Claude 4)
- Google (Gemini)
- Mistral
- Perplexity
- xAI (Grok)
- Ollama (local)
- OpenRouter (aggregator)

Needed a unified interface that:
- Handles streaming responses consistently
- Supports tool calling across providers
- Allows runtime provider switching
- Manages API keys (server + BYOK)

## Decision

Use **Vercel AI SDK** as the multi-provider abstraction layer with a custom `openproviders` factory.

## Rationale

### Why Vercel AI SDK

| Feature | Vercel AI SDK | Direct API |
|---------|---------------|------------|
| Streaming | Unified `streamText()` | Provider-specific |
| Tool calling | Consistent interface | Different schemas |
| React hooks | `useChat`, `useCompletion` | Manual state |
| Type safety | Full TypeScript | Varies |

### Custom openproviders Layer

Created `lib/openproviders/` to:
1. Map model IDs to providers
2. Handle BYOK key injection
3. Provide consistent factory interface

```typescript
// Single interface for all providers
const model = openproviders("claude-3-5-sonnet", {}, userApiKey)
const result = streamText({ model, messages })
```

### Trade-offs Accepted

- ✅ Consistent streaming API
- ✅ Easy provider switching
- ✅ Future-proof for new models
- ❌ SDK version dependency
- ❌ Abstraction overhead

## Consequences

### Positive

- Adding new provider: ~6 files, <1 hour
- Adding new model: ~2 files, <15 minutes
- Consistent error handling
- BYOK works uniformly

### Negative

- Must track AI SDK updates
- Some provider features may not be exposed
- Extra abstraction layer to maintain

## Implementation Notes

### Key Files

- `lib/openproviders/index.ts` — Factory function
- `lib/openproviders/provider-map.ts` — Model → provider mapping
- `lib/openproviders/types.ts` — Provider type union
- `lib/models/data/*.ts` — Model configurations

### Adding New Provider

See `.agents/skills/add-ai-provider/SKILL.md`

### Streaming Pattern

```typescript
const result = streamText({
  model: modelConfig.apiSdk(apiKey, { enableSearch }),
  system: systemPrompt,
  messages,
})

return result.toDataStreamResponse({
  sendReasoning: true,
  sendSources: true,
})
```

## References

- Vercel AI SDK: https://sdk.vercel.ai
- Provider docs: https://sdk.vercel.ai/providers
- `.agents/context/api.md` for API patterns
