# Open-Source Patterns for Provider-Aware History Adaptation

> **Status**: Complete
> **Date**: February 13, 2026
> **Researcher**: AI Assistant
> **Scope**: Survey of how major open-source multi-model chat apps handle cross-provider message history replay
> **Related**: `provider-aware-history-adaptation.md` (parent research), `openai-replay-invariants.md` (OpenAI specifics)
> **Projects Surveyed**: LibreChat, LobeChat, Open WebUI, Chatbot UI, Jan

---

## Executive Summary

1. **No project has a production-grade provider-aware history adapter.** Every surveyed project either standardizes on a single output format (OpenAI Chat Completions) or delegates format differences to polymorphic client classes — none handle the reasoning–tool pairing invariants that the OpenAI Responses API enforces.

2. **Our proposed Option A is architecturally novel in this space.** Per-provider adapters that enforce replay invariants at the `UIMessage[]` level (before `convertToModelMessages()`) do not exist in any surveyed codebase. This is both a risk (no reference implementations) and an opportunity (we'd be solving a problem others haven't addressed).

3. **The "OpenAI format as lingua franca" pattern dominates.** LobeChat, Open WebUI, Jan, and Chatbot UI all use OpenAI Chat Completions `{ role, content }` format as their canonical/output format. Provider differences are handled at the parameter level, not the message content level.

4. **LibreChat comes closest to our architecture** with per-endpoint client classes that each implement `buildMessages()`, effectively doing per-provider message construction. But it pre-dates the OpenAI Responses API's strict pairing rules and doesn't handle reasoning–tool invariants.

5. **The Vercel AI SDK has a gap here.** `convertToModelMessages()` and `pruneMessages` are provider-agnostic. Issue #11036 confirms `pruneMessages` breaks OpenAI reasoning models — the exact class of bug we're solving. No official middleware or adapter exists for this.

6. **Open Responses** (openresponses.org) is an emerging specification backed by NVIDIA, Vercel, OpenAI, and Hugging Face that could standardize cross-provider message interoperability long-term, but it's too early-stage to adopt now.

---

## 1. LibreChat

> **Repo**: [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) (33.8K stars)
> **Stack**: Node.js, Express, MongoDB, Langchain (partial)

### Storage Format

- **Single unified format** in MongoDB via `TMessage` type
- Messages have `content` field that can be `string` or `ContentPart[]` (array of content blocks with types like `text`, `think`, `image_url`)
- Rich metadata stored alongside: `tokenCount`, `model`, `endpoint`, `sender`
- No provider-specific replay views — all messages stored once in canonical form

### Adaptation Strategy

**Polymorphic client classes** — the closest analog to our Option A:

```
api/app/clients/
├── BaseClient.js          # Abstract base: loadHistory(), buildMessages(), sendCompletion()
├── OllamaClient.js        # Ollama-specific message building
└── ...

api/server/services/Endpoints/
├── openAI/initialize.js   # OpenAI-specific initialization
├── anthropic/initialize.js # Anthropic-specific initialization  
├── google/initialize.js    # Google-specific initialization
├── agents/                 # Agent framework endpoints
├── assistants/             # OpenAI Assistants integration
└── index.js               # Provider config map: providerId → init function
```

Each client subclass implements `buildMessages()` to transform the stored `TMessage[]` into the provider's expected input format. The `BaseClient` provides:
- `getMessagesWithinTokenLimit()` — context window management
- `handleContextStrategy()` — summarization when messages exceed limits
- `addInstructions()` — system prompt injection
- `loadHistory()` — load message tree from DB

**Key code**: `providerConfigMap` in `api/server/services/Endpoints/index.js`:
```javascript
const providerConfigMap = {
  [Providers.XAI]: initCustom,      // xAI → OpenAI-compatible custom init
  [Providers.DEEPSEEK]: initCustom,  // DeepSeek → OpenAI-compatible custom init
  [Providers.OPENROUTER]: initCustom,
  [EModelEndpoint.openAI]: initOpenAI,
  [EModelEndpoint.google]: initGoogle,
  [EModelEndpoint.anthropic]: initAnthropic,
  [EModelEndpoint.bedrock]: getBedrockOptions,
}
```

### Tool Artifact Handling

- **Known issue** (GitHub #5985): `message.content` not being a string causes failures when switching between providers that expect different content structures
- Tool calls stored with provider-specific format (OpenAI `tool_calls` array format)
- **No explicit reasoning–tool pairing logic** — pre-dates OpenAI Responses API strict invariants
- `truncateToolCallOutputs()` exists for token management but not invariant enforcement

### Relevance to Our Design

| Aspect | LibreChat | Our Approach |
|--------|-----------|--------------|
| Adaptation point | `buildMessages()` per client subclass | `adaptMessages()` per provider adapter |
| Adaptation target | Provider-specific wire format | Still `UIMessage[]` (pre-conversion) |
| Invariant enforcement | None (pre-Responses API) | Per-provider replay invariants |
| Observability | Token counting per message | Structured logging of parts dropped/transformed |
| Architecture | OOP inheritance (BaseClient → subclasses) | Functional adapters (pure functions, registered in map) |

**Verdict**: LibreChat validates the per-provider transformation pattern but doesn't solve the specific invariant problem we face. Their OOP approach is heavier than our functional adapter design.

---

## 2. LobeChat

> **Repo**: [lobehub/lobe-chat](https://github.com/lobehub/lobe-chat) (72K stars)
> **Stack**: Next.js, TypeScript, Zustand, `@lobechat/context-engine`

### Storage Format

- **`UIChatMessage[]`** — rich UI messages with content, tool calls, metadata
- Single canonical format — no provider-specific views
- Messages stored in local DB or server-side with full fidelity

### Adaptation Strategy

**Context engineering pipeline** — a sophisticated preprocessing chain, but NOT provider-specific content adaptation:

```
UIChatMessage[] 
    → contextEngineering() 
        → MessagesEngine.process() 
            → OpenAIChatMessage[]
                → getChatCompletion()
                    → fetchSSE(API_ENDPOINTS.chat(provider))
```

The `contextEngineering()` function (in `src/services/chat/mecha/contextEngineering.ts`) handles:
- System role injection
- Input template processing
- History count/summarization
- User memory injection
- Tool manifest injection
- File/knowledge base context
- Agent builder context

But it converts ALL messages to **OpenAI Chat Completions format** (`OpenAIChatMessage[]`) regardless of target provider. The `MessagesEngine` (from `@lobechat/context-engine` package) is the workhorse:

```typescript
const engine = new MessagesEngine({
  enableHistoryCount,
  historyCount,
  historySummary,
  inputTemplate,
  systemRole,
  capabilities: { isCanUseFC, isCanUseVideo, isCanUseVision },
  messages,
  model,
  provider,
  // ... more config
});
const result = await engine.process();  // Returns OpenAIChatMessage[]
```

**Provider differences handled at parameter level**, not message content level:
- `modelParamsResolver.ts` — resolves model-specific parameters
- `agentConfigResolver.ts` — resolves agent configuration per provider
- `resolveRuntimeProvider()` — maps provider to SDK type
- `apiMode: 'responses' | 'chatCompletion'` — toggles OpenAI API mode

### Tool Artifact Handling

- Tool calls included in messages when `isCanUseFC()` returns true for the provider
- No reasoning–tool pairing logic
- No stripping of provider-specific artifacts on provider switch
- The `MessagesEngine` processes tool calls as part of the general message flow

### Relevance to Our Design

| Aspect | LobeChat | Our Approach |
|--------|----------|--------------|
| Output format | Single format (OpenAI Chat Completions) for all providers | Per-provider adapted `UIMessage[]` → SDK conversion |
| Provider awareness | Parameter-level only | Message content + parameter level |
| Reasoning handling | Not specifically addressed | Per-provider reasoning–tool pair enforcement |
| Tool artifact replay | Included if model supports FC | Adapted per provider invariants |
| Key abstraction | `MessagesEngine` (context engineering) | `ProviderHistoryAdapter` (replay invariants) |

**Verdict**: LobeChat's context engineering is sophisticated but orthogonal to our problem. They don't face our bug because they standardize on OpenAI Chat Completions format, which has looser replay rules than the Responses API. Their `MessagesEngine` is a good reference for the preprocessing pipeline, but not for provider-specific content adaptation.

---

## 3. Open WebUI

> **Repo**: [open-webui/open-webui](https://github.com/open-webui/open-webui) (124K stars)
> **Stack**: Python (FastAPI), Svelte frontend

### Storage Format

- **OpenAI Chat Completions format** as canonical: `{ role, content }` messages
- Content can be string or array of content parts (text, image_url)
- Stored in SQLite/PostgreSQL via internal models

### Adaptation Strategy

**Explicit format converters** in `backend/open_webui/utils/payload.py`:

1. **`convert_messages_openai_to_ollama()`** — Converts OpenAI message format to Ollama format:
   - Handles text content (string → string)
   - Handles multimodal content (content arrays → Ollama images array)
   - Handles tool calls (OpenAI `tool_calls` → Ollama `tool_calls` with parsed arguments)
   - Ensures empty string content for tool call messages (Ollama requirement)

2. **`convert_payload_openai_to_ollama()`** — Full payload conversion:
   - Message conversion via above function
   - Parameter remapping: `max_tokens` → `num_predict`
   - Options nesting (Ollama uses `options` object for model params)
   - `response_format` → `format` remapping

3. **`apply_model_params_to_body_openai()`** / **`apply_model_params_to_body_ollama()`** — Provider-specific parameter application

### Tool Artifact Handling

- Tool calls converted between OpenAI and Ollama formats (index, id, function name/arguments)
- **No reasoning content handling** — no concept of reasoning parts
- **No cross-provider tool pairing validation** — tool calls forwarded as-is
- No handling of orphaned tool calls or missing results

### Relevance to Our Design

| Aspect | Open WebUI | Our Approach |
|--------|-----------|--------------|
| Adaptation scope | Payload format (OpenAI → Ollama) | Message content + replay invariants |
| Provider count | 2 formats (OpenAI, Ollama) | 7+ provider-specific adapters |
| Tool handling | Format conversion only | Pairing validation + orphan detection |
| Reasoning handling | None | Per-provider reasoning preservation/stripping |
| Architecture | Explicit converter functions | Adapter interface with registry |

**Verdict**: Open WebUI's explicit converter functions validate the pattern of having dedicated conversion logic per provider, but their scope is much narrower (format conversion, not invariant enforcement). The `convert_messages_openai_to_ollama()` function is a simple example of what our adapters need to do at a much deeper level.

---

## 4. Chatbot UI

> **Repo**: [mckaywrigley/chatbot-ui](https://github.com/mckaywrigley/chatbot-ui) (33K stars)
> **Stack**: Next.js, TypeScript, Supabase

### Storage Format

- Messages stored in **Supabase (PostgreSQL)**
- Standard message format with role/content
- Recently rebuilt as v2.0 — simpler architecture

### Adaptation Strategy

- **No explicit provider-aware history adaptation found**
- Multi-provider support planned but limited in current v2.0
- Messages sent as-is to whichever provider is selected
- No transformation layer between storage and provider API

### Tool Artifact Handling

- No tool call handling across providers documented
- Focus is on basic chat functionality

### Relevance to Our Design

**Minimal relevance.** Chatbot UI is a simpler application that hasn't needed to solve cross-provider replay invariants. No patterns to adopt.

---

## 5. Jan

> **Repo**: [janhq/jan](https://github.com/janhq/jan) (27K stars)
> **Stack**: TypeScript/Electron, local + cloud providers

### Storage Format

- **OpenAI-compatible message format** as canonical
- Stored locally with conversation metadata
- Model definitions in standardized JSON format

### Adaptation Strategy

- **Extension-based provider system** — providers implemented as extensions
- **OpenRouter integration** (Issue #3452) acts as multi-provider proxy
- Messages standardized to OpenAI format before sending
- Provider extensions handle API-specific differences at the transport level

### Tool Artifact Handling

- Not explicitly documented
- Focus on model-level features (multimodal, quantization) rather than message content adaptation

### Relevance to Our Design

**Low relevance.** Jan standardizes on OpenAI format and delegates provider differences to extensions or proxy services (OpenRouter). No message content adaptation patterns to adopt.

---

## 6. Vercel AI SDK — Official Guidance

> **Source**: [sdk.vercel.ai](https://sdk.vercel.ai), GitHub issues, SDK source

### What the SDK Provides

| Feature | Purpose | Provider-Aware? |
|---------|---------|-----------------|
| `convertToModelMessages()` | UIMessage[] → ModelMessage[] | No — provider-agnostic conversion |
| `validateUIMessages()` | Validate stored messages against tool schemas | No — schema validation only |
| `pruneMessages()` | Reduce message count by removing reasoning/tools | **Broken for OpenAI reasoning** (Issue #11036) |
| Language Model Middleware | `transformParams`, `wrapGenerate`, `wrapStream` | Generic hooks — no built-in provider adapters |
| `wrapLanguageModel()` | Apply middleware to model | Composable but requires custom implementation |

### What the SDK Does NOT Provide

1. **No provider-aware message adaptation** — `convertToModelMessages()` is a one-size-fits-all conversion
2. **No reasoning–tool pairing validation** — The SDK trusts the caller to provide valid message structure
3. **No cross-provider replay middleware** — No built-in middleware for adapting messages when switching providers
4. **No fix planned for `pruneMessages` pairing** — Issue #11036 is open with no assignee (as of Feb 2026). The maintainer acknowledged that OpenAI's message signing makes independent pruning difficult

### `pruneMessages` — The Exact Same Bug Class

From [Issue #11036](https://github.com/vercel/ai/issues/11036):

> "OpenAI's API requires both reasoning and tool call parts to be present together — removing either one independently causes validation errors."

Two specific failure modes documented:
1. Stripping reasoning while keeping tool calls → `'function_call' was provided without its required 'reasoning' item`
2. Stripping tool calls while keeping reasoning → `'reasoning' was provided without its required following item`

**This is exactly our production bug.** The SDK's own utility has this problem and there's no fix.

### Language Model Middleware — Could We Use It?

The `transformParams` hook in Language Model Middleware intercepts at the `ModelMessage[]` level (after conversion). This is **too late** for our needs — we want to adapt at the `UIMessage[]` level (before conversion) to stay within the SDK's conversion pipeline.

However, `transformParams` could be used as a secondary safety net:

```typescript
const providerSafetyMiddleware: LanguageModelV3Middleware = {
  transformParams: async ({ params }) => {
    // Post-conversion validation: ensure no orphaned reasoning/tool items
    // This runs AFTER convertToModelMessages, as a last-resort check
    return validateModelMessagePairing(params);
  },
};
```

This is complementary to our Option A adapters, not a replacement.

### `validateUIMessages` — Validation, Not Adaptation

The SDK's `validateUIMessages()` validates messages against tool definitions and data schemas. It catches schema mismatches (e.g., a stored tool call referencing a tool that no longer exists) but does NOT:
- Validate provider-specific replay invariants
- Strip or transform provider-specific artifacts
- Handle reasoning–tool pairing

---

## 7. Emerging Standards

### Open Responses (openresponses.org)

A new open specification for multi-provider LLM interoperability, backed by NVIDIA, Vercel, OpenAI, Anthropic, and Hugging Face.

**Core concepts**:
- **Items** as atomic units (model output, tool invocation, reasoning state) — similar to OpenAI Responses API items
- **Semantic events** for streaming
- **State machines** for lifecycle management
- `POST /v1/responses` endpoint matching OpenAI's Responses API

**Relevance**: If widely adopted, Open Responses could become the standard message format that eliminates the need for per-provider adapters. But it's too early (2025 launch, spec still evolving) to bet on. Our adapter architecture should be compatible with a future migration to Open Responses.

### Microsoft Semantic Kernel — ChatHistoryReducer

Multi-provider history reduction via truncation or summarization. Available in .NET and Python.

**Key features**:
- `target_count` / `threshold_count` for message count management
- Automatic reduction when enabled
- Works across OpenAI, Anthropic, Google providers

**Relevance**: Reduces message *count*, not message *content*. Orthogonal to our problem — we need to transform message parts, not just truncate the conversation. However, their multi-provider pattern of applying reduction strategies is a useful reference.

---

## 8. Pattern Comparison Table

| Project | Storage Format | Adaptation Strategy | Tool Artifact Handling | Reasoning Handling | Provider Adapters? |
|---------|---------------|--------------------|-----------------------|-------------------|-------------------|
| **LibreChat** | Unified `TMessage[]` in MongoDB | Per-client `buildMessages()` (OOP polymorphism) | Format conversion, no pairing validation | Not addressed (pre-Responses API) | Yes (client classes) |
| **LobeChat** | `UIChatMessage[]` | `MessagesEngine` → single OpenAI format | Included if FC supported | Not addressed | No (single output format) |
| **Open WebUI** | OpenAI Chat Completions format | `convert_*_openai_to_ollama()` functions | Format conversion only | Not addressed | Partial (2 format converters) |
| **Chatbot UI** | Supabase messages | None | None | None | No |
| **Jan** | OpenAI-compatible | Extension/proxy-based | Not documented | Not addressed | No (delegated to proxy) |
| **Vercel AI SDK** | `UIMessage[]` recommended | `convertToModelMessages()` (provider-agnostic) | `pruneMessages` breaks pairing | `pruneMessages` breaks pairing | No (gap acknowledged) |
| **Semantic Kernel** | Provider-specific | `ChatHistoryReducer` (count-based) | Not addressed | Not addressed | No (count reduction only) |
| **Our Proposal** | `UIMessage[]` (canonical) | Per-provider adapters (functional) | Atomic pairing validation | Per-provider preserve/strip/transform | **Yes (Option A)** |

---

## 9. Alignment with Our Options A / B / C

### Option A: Sanitize-on-Send with Provider Adapters ← Proposed

**Ecosystem alignment**: Partial

- **LibreChat validates the per-provider pattern** — their `buildMessages()` per client is the OOP equivalent of our functional adapters. But they operate at a different level (constructing wire format, not adapting UIMessage parts).
- **Open WebUI validates explicit converter functions** — `convert_messages_openai_to_ollama()` is a simpler version of what our adapters do.
- **No project has the invariant enforcement** that our adapters add (reasoning–tool pairing, atomic units, ID stripping).
- **The Vercel AI SDK's gap confirms the need** — if the SDK's own `pruneMessages` has this bug, application-level adapters are the right solution.

**Risk**: No reference implementation exists. We're pioneering this specific pattern.
**Mitigation**: The individual pieces are validated (per-provider transformation + contract tests), just not combined in this way.

### Option B: Dual-Track History Model

**Ecosystem alignment**: None

No surveyed project stores provider-specific replay views alongside canonical history. This confirms Option B's complexity concern — if nobody else does it, it's likely over-engineered.

### Option C: Provider-Specific Transcript Builders

**Ecosystem alignment**: Partial (LibreChat)

LibreChat's per-client `buildMessages()` is essentially a transcript builder — but it still uses the SDK's message format rather than a custom AST. No project uses an intermediate AST representation.

---

## 10. Reusable Code or Libraries

### Nothing directly reusable for our core problem.

However, some patterns and utilities from the ecosystem are worth noting:

| Source | What to Adopt | How |
|--------|--------------|-----|
| **LibreChat** `providerConfigMap` | Registry pattern: `providerId → handler` | Already in our `lib/openproviders/provider-map.ts` |
| **LobeChat** `MessagesEngine` | Context engineering pipeline (history counting, summarization, template injection) | Separate concern from adaptation; could complement our adapters |
| **Open WebUI** `convert_messages_openai_to_ollama()` | Explicit message format converters as named functions | Pattern match for our adapter functions |
| **Vercel AI SDK** `wrapLanguageModel()` + middleware | Secondary safety net for post-conversion validation | Could add `transformParams` middleware as backup |
| **Vercel AI SDK** `validateUIMessages()` | Schema validation for stored messages | Already available; use alongside our adapters |
| **Open Responses** specification | Items-based message model | Future migration target; design adapters to be compatible |

### Libraries That Could Help

| Library | Purpose | Relevance |
|---------|---------|-----------|
| `@ai-sdk/openai` | OpenAI provider with Responses API support | Already in our stack; understanding its conversion is critical |
| `zod` | Runtime type validation | Use for adapter input/output validation |
| `vitest` | Testing framework | Already in our stack; use for contract tests |
| `@lobechat/context-engine` | Message processing engine | Too tightly coupled to LobeChat; not extractable |

---

## 11. Key Takeaways for Our Design

### 1. We're solving a problem nobody else has solved yet

The OpenAI Responses API (with strict reasoning–tool pairing) is relatively new. Most chat apps either:
- Don't support the Responses API yet (use Chat Completions only)
- Don't support provider switching mid-conversation
- Don't preserve reasoning/tool artifacts in history

Our combination of all three is what creates the invariant problem. This means we have no reference implementation to copy, but also means our solution could become a reference for others.

### 2. The "single output format" pattern doesn't scale

LobeChat, Open WebUI, and Jan all standardize on OpenAI Chat Completions format. This works as long as:
- You only use Chat Completions API (not Responses API)
- You don't preserve reasoning traces
- You don't need provider-specific tool artifact handling

As the ecosystem moves toward richer message formats (Responses API, Anthropic thinking blocks, Gemini thought summaries), the single-format approach will break.

### 3. Functional adapters are the right abstraction level

LibreChat's OOP approach (BaseClient → subclasses) works but couples message building with API communication. Our functional adapter approach is cleaner:
- Adapters are pure functions (testable, composable)
- Adapters operate on `UIMessage[]` (staying within the SDK pipeline)
- Adapters are registered in a map (extensible without inheritance)

### 4. The Vercel AI SDK middleware API is complementary, not sufficient

`transformParams` operates at the `ModelMessage[]` level (post-conversion), which is too late for our primary adaptation. But it's valuable as a secondary safety net. Consider adding a `providerSafetyMiddleware` that validates model messages after conversion as a defense-in-depth measure.

### 5. Contract tests are our main differentiator

No surveyed project has provider-specific replay invariant tests. Our contract test suite (per-provider, per-scenario) would be the most rigorous approach in the ecosystem. This is where the quality advantage lies.

### 6. Design for Open Responses compatibility

The Open Responses specification is emerging as a potential standard for cross-provider interoperability. Our adapter interface should be designed so that a future "Open Responses adapter" can be added alongside provider-specific ones, enabling a gradual migration if the standard gains traction.

### 7. The canonical storage decision is validated

Every surveyed project stores messages in a single canonical format and adapts at send time. No project stores provider-specific replay views. This confirms our Option A approach: store rich `UIMessage[]`, adapt on send.

---

## Sources

| Source | Type | URL |
|--------|------|-----|
| LibreChat GitHub | Repository | https://github.com/danny-avila/LibreChat |
| LibreChat BaseClient.js | Source code | https://github.com/danny-avila/LibreChat/blob/main/api/app/clients/BaseClient.js |
| LibreChat Endpoints index | Source code | https://github.com/danny-avila/LibreChat/blob/main/api/server/services/Endpoints/index.js |
| LobeChat GitHub | Repository | https://github.com/lobehub/lobe-chat |
| LobeChat ChatService | Source code | https://github.com/lobehub/lobehub/blob/main/src/services/chat/index.ts |
| LobeChat contextEngineering | Source code | https://github.com/lobehub/lobehub/blob/main/src/services/chat/mecha/contextEngineering.ts |
| Open WebUI GitHub | Repository | https://github.com/open-webui/open-webui |
| Open WebUI payload.py | Source code | https://github.com/open-webui/open-webui/blob/main/backend/open_webui/utils/payload.py |
| Chatbot UI GitHub | Repository | https://github.com/mckaywrigley/chatbot-ui |
| Jan GitHub | Repository | https://github.com/janhq/jan |
| Vercel AI SDK — Message Persistence | Documentation | https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence |
| Vercel AI SDK — Middleware | Documentation | https://sdk.vercel.ai/docs/ai-sdk-core/middleware |
| Vercel AI SDK — pruneMessages Issue | GitHub Issue | https://github.com/vercel/ai/issues/11036 |
| Vercel AI SDK — convertToModelMessages | Documentation | https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages |
| Open Responses Specification | Specification | https://www.openresponses.org/specification |
| Semantic Kernel ChatHistoryReducer | Sample code | https://github.com/microsoft/semantic-kernel/blob/main/dotnet/samples/Concepts/ChatCompletion/MultipleProviders_ChatHistoryReducer.cs |

---

*This document should be updated when new projects or patterns emerge in the multi-provider chat ecosystem, or when the Open Responses specification matures.*
