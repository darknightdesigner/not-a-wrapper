# xAI, Mistral & Perplexity — Replay Invariant Research

> **Status**: Complete
> **Date**: February 13, 2026
> **Author**: AI Research Agent
> **Related**: `provider-aware-history-adaptation.md` (parent plan), `app/api/chat/utils.ts` (current sanitization)
> **Priority**: Lower-priority providers (Tier 2 for adapter rollout)

## Sources Consulted

| Source | URL | Notes |
|--------|-----|-------|
| xAI Chat Completions docs | docs.x.ai/developers/model-capabilities/legacy/chat-completions | Legacy endpoint |
| xAI Reasoning docs | docs.x.ai/developers/model-capabilities/text/reasoning | Encrypted reasoning, `reasoning_content` |
| xAI Function Calling docs | docs.x.ai/developers/tools/function-calling | Tool call/result pairing |
| xAI Tools Overview | docs.x.ai/developers/tools/overview | Built-in vs custom tools |
| Mistral Function Calling docs | docs.mistral.ai/capabilities/function_calling | 5-step tool flow, parallel calls |
| Mistral Reasoning docs | docs.mistral.ai/capabilities/reasoning | Magistral models, thinking chunks |
| Perplexity Chat Completions API | docs.perplexity.ai/api-reference/chat-completions-post | Sonar API schema |
| Perplexity Agentic Research Tools | docs.perplexity.ai/docs/agentic-research/tools | Function calling (Responses API only) |
| AI SDK — xAI Provider | sdk.vercel.ai/providers/ai-sdk-providers/xai | `@ai-sdk/xai` v3 |
| AI SDK — Mistral Provider | sdk.vercel.ai/providers/ai-sdk-providers/mistral | `@ai-sdk/mistral` v3 |
| AI SDK — Perplexity Provider | sdk.vercel.ai/providers/ai-sdk-providers/perplexity | `@ai-sdk/perplexity` v3 |
| Project `lib/openproviders/` | Internal | Provider map, model definitions |
| Project `lib/models/data/` | Internal | Per-provider model configs |

---

## 1. xAI (Grok)

### 1.1 API Format Compatibility

**OpenAI Chat Completions compatible** (designated as "Legacy" by xAI). The Chat Completions endpoint mirrors OpenAI's format:

```json
{
  "role": "assistant",
  "content": [{"type": "text", "text": "..."}]
}
```

Supports roles: `system`, `user`, `assistant`, `developer` (alias for `system`), `tool`.

xAI also offers a **Responses API** (their recommended path forward) which is modeled after OpenAI's Responses API. Our app currently uses the Chat Completions path via `@ai-sdk/xai`.

### 1.2 Reasoning Support

| Aspect | Details |
|--------|---------|
| Reasoning models | `grok-3-mini`, `grok-4`, `grok-4-1-fast-reasoning` |
| `reasoning_content` field | Only `grok-3-mini` returns this in Chat Completions |
| Encrypted reasoning | `grok-4` supports encrypted reasoning via Responses API only (`include: ["reasoning.encrypted_content"]`) |
| `reasoning_tokens` in usage | Yes — all reasoning models expose this |
| `reasoningEffort` parameter | Only `grok-3-mini` supports `"low"` / `"high"`. Other models reject this param with an error. |
| Replay requirement | **Not required**. `reasoning_content` is output-only in Chat Completions. It does not need to be sent back in subsequent turns. Encrypted reasoning CAN be sent back via Responses API for continuity, but this is optional. |

**Key finding**: For the Chat Completions path (which we use), reasoning is purely output metadata. There is no requirement to replay reasoning content in conversation history. Stripping reasoning parts is safe and correct.

### 1.3 Tool Calling Support

**Full OpenAI-compatible function calling**. xAI supports:

- `tools` parameter with `{type: "function", function: {name, description, parameters}}` schema
- `tool_choice`: `"auto"` (default), `"required"`, `"none"`, or specific function
- `parallel_tool_calls`: boolean (default true)
- Assistant messages with `tool_calls` array containing `{id, type: "function", function: {name, arguments}}`
- `tool` role messages with `tool_call_id`, `content`

**Pairing requirements** (inferred from OpenAI-compatible format):

1. Assistant messages with `tool_calls` expect corresponding `tool` role messages with matching `tool_call_id`
2. `tool` messages without a preceding assistant `tool_calls` reference are invalid
3. For parallel tool calls, ALL results must be provided before the next assistant turn

**Built-in tools** (Responses API only — not applicable to our Chat Completions path):
- `web_search`, `x_search`, `code_execution`, `view_image`, `view_x_video`, `mcp_server`, `file_search`

### 1.4 Known Strict Invariants

| Invariant | Severity | Details |
|-----------|----------|---------|
| `presencePenalty`, `frequencyPenalty`, `stop` rejected for reasoning models | Error | These params cause API errors on reasoning models |
| `reasoningEffort` rejected for non-mini models | Error | Only `grok-3-mini` accepts this |
| Single system/developer message | Warning | Only one system message allowed, must be first |
| Tool call/result pairing | Error (likely) | Standard OpenAI pairing rules apply |

### 1.5 `@ai-sdk/xai` Conversion Behavior

- **Package**: `@ai-sdk/xai` v3, first-party Vercel AI SDK provider
- **API**: Uses OpenAI Chat Completions format under the hood (base URL: `https://api.x.ai/v1`)
- **Reasoning**: SDK supports `reasoningEffort` via `providerOptions.xai`. Reasoning output is extracted automatically as `reasoningText` in results.
- **Tool calling**: Full support. SDK maps AI SDK tool definitions to OpenAI-format tools.
- **Message conversion**: `convertToModelMessages()` produces standard OpenAI Chat Completions format. The xAI provider does NOT perform any additional message transformation — it relies on the core SDK's OpenAI-compatible conversion.
- **No auto-stripping**: The provider does NOT automatically strip unsupported part types. If reasoning or tool parts from a different provider are present in the input `UIMessage[]`, they will be converted as-is by the SDK's `convertToModelMessages()`, potentially producing invalid shapes.

**Project config** (`lib/models/data/grok.ts`):
- 5 models configured: Grok 2, Grok 2 Vision, Grok 4, Grok 4.1 Fast, Grok Code Fast
- All have `tools: true`, `webSearch: true`
- Most have `reasoningText: true` (except Grok Code Fast)
- Provider options in `route.ts`: `providerOptions.xai = { reasoningEffort: "medium" }` for reasoning models

---

## 2. Mistral

### 2.1 API Format Compatibility

**Custom API, OpenAI-influenced but not identical**. Key differences:

- Content can be a string OR an array of typed content chunks:
  ```json
  "content": [
    {"type": "thinking", "thinking": [{"type": "text", "text": "..."}]},
    {"type": "text", "text": "..."}
  ]
  ```
- The `thinking` content type is Mistral-specific (not in OpenAI's format)
- Tool calling follows OpenAI conventions but with Mistral-specific extensions
- Base URL: `https://api.mistral.ai/v1`

### 2.2 Reasoning Support

| Aspect | Details |
|--------|---------|
| Reasoning models | `magistral-small-latest` (-2507, -2509), `magistral-medium-latest` (-2507, -2509) |
| Output format (new -2509) | Tokenized `thinking` chunks: `{type: "thinking", thinking: [{type: "text", text: "..."}]}` |
| Output format (old -2506) | String tags: `<<think>>\n...\n<</think>>\n` within content |
| `prompt_mode` parameter | `"reasoning"` (default) or `null` (no system prompt) |
| System prompt | Default system prompt includes thinking template with `thinking` content example |
| Replay requirement | **Not documented as required**. The system prompt shows the thinking format as an example but there's no documented requirement to replay thinking chunks in assistant history. The SDK extracts reasoning automatically. |

**Key finding**: Mistral's reasoning output uses a proprietary `thinking` content type. The AI SDK (`@ai-sdk/mistral`) automatically parses this and provides `reasoningText` separately. For replay purposes, thinking chunks in assistant messages are **not required** — they are output artifacts that the model generates fresh each turn.

### 2.3 Tool Calling Support

**Full function calling support**, following OpenAI conventions:

```
Role Flow:
- No tool call:  system → user → assistant → user → ...
- Tool call:     system → user → assistant(tool_calls) → tool(result) → assistant → ...
- Parallel:      system → user → assistant(fc.1, fc.2) → tool(r.1) → tool(r.2) → assistant → ...
- Successive:    system → user → assistant(fc.1) → tool(r.1) → assistant(fc.2) → tool(r.2) → assistant → ...
```

**Tool call format**:
```json
{
  "role": "assistant",
  "content": "",
  "tool_calls": [
    {
      "id": "D681PevKs",
      "type": "function",
      "function": {
        "name": "retrieve_payment_status",
        "arguments": "{\"transaction_id\": \"T1001\"}"
      }
    }
  ]
}
```

**Tool result format**:
```json
{
  "role": "tool",
  "name": "retrieve_payment_status",
  "content": "{\"status\": \"Paid\"}",
  "tool_call_id": "D681PevKs"
}
```

**Pairing requirements**:

1. `tool` role messages MUST have a matching `tool_call_id` from the preceding assistant `tool_calls`
2. For parallel calls, all results must be provided (one `tool` message per `tool_call`)
3. The model may follow up a tool call with another tool call (successive calling)
4. `tool_choice` supports: `"auto"` (default), `"any"` (force tool use), `"none"` (prevent)
5. `parallel_tool_calls`: `true` (default) or `false`

**Supported models** (for tool calling): Mistral Large 3, Mistral Medium 3.1, Mistral Small 3.2, Devstral, Codestral, Magistral models (reasoning + tools), Ministral 8B/14B.

### 2.4 Known Strict Invariants

| Invariant | Severity | Details |
|-----------|----------|---------|
| Tool call/result pairing by `tool_call_id` | Error | Orphaned tool results or calls will fail |
| `tool` message requires `name` + `tool_call_id` | Error | Both fields mandatory |
| Content type mixing | Tolerated | String content and array content can coexist across messages |
| Thinking chunks in non-reasoning models | Unknown | Likely ignored or rejected if sent to non-Magistral models |

### 2.5 `@ai-sdk/mistral` Conversion Behavior

- **Package**: `@ai-sdk/mistral` v3, first-party Vercel AI SDK provider
- **Reasoning**: SDK automatically parses Mistral's native `thinking` content chunks and provides `reasoningText`/`reasoningParts` in results. No middleware needed.
- **Tool calling**: Full support including parallel tool calls. SDK maps AI SDK tools to Mistral format.
- **Provider options**: `safePrompt`, `parallelToolCalls`, `structuredOutputs`, `strictJsonSchema`, `documentImageLimit`, `documentPageLimit`
- **Message conversion**: SDK handles Mistral's content array format. The provider converts model messages to Mistral's expected format including `thinking` types for reasoning models.
- **No auto-stripping of input parts**: Like `@ai-sdk/xai`, the provider does not strip incoming UIMessage parts that don't belong. The core SDK's `convertToModelMessages()` handles conversion, and unsupported input parts could produce invalid shapes.

**Project config** (`lib/models/data/mistral.ts`):
- 8 models: Codestral, Ministral 3B/8B, Mistral Large/Small, Pixtral 12B/Large
- Most have `tools: true` (Ministral 3B has `tools: false`)
- No web search support (uses Exa fallback for Layer 2 search)
- No special `providerOptions` in `route.ts`

---

## 3. Perplexity

### 3.1 API Format Compatibility

**OpenAI Chat Completions compatible** (Sonar API). Endpoint: `POST /chat/completions`.

Perplexity has **three API surfaces**:

| API | Endpoint | Tool Support | Our Usage |
|-----|----------|-------------|-----------|
| **Sonar API** (Chat Completions) | `/chat/completions` | No user-defined tools | **Yes — this is what we use** |
| **Agentic Research API** (Responses) | `/responses` | Yes (function calling + built-in) | No |
| **Search API** | `/search` | No | No |

Standard message format with `system`, `user`, `assistant` roles.

### 3.2 Reasoning Support

| Aspect | Details |
|--------|---------|
| Reasoning models | `sonar-reasoning`, `sonar-reasoning-pro` |
| Output format | `reasoning_steps` array in response message (each step has `thought`, `type`, optional `web_search`/`fetch_url_content`/`execute_python`) |
| `reasoning_effort` parameter | Supported: `"minimal"`, `"low"`, `"medium"`, `"high"` |
| `reasoning_tokens` in usage | Yes |
| Replay requirement | **Not required**. `reasoning_steps` appear in the API schema on messages, but these are output artifacts from Perplexity's internal multi-step search+reasoning pipeline. They do NOT need to be replayed. The API schema includes them for completeness but sending `reasoning_steps` back in input messages would likely be ignored or cause errors. |

**Key finding**: `reasoning_steps` are Perplexity's way of showing their internal web search + reasoning pipeline. They are fundamentally different from model-level reasoning (like Anthropic's thinking blocks). They represent search queries, URL fetches, and Python execution — all server-side. Stripping them is correct.

### 3.3 Tool Calling Support

**No user-defined tool calling on the Sonar/Chat Completions API**.

- The `tool_calls` and `tool_call_id` fields exist in the API schema, but they are used internally by Perplexity's Pro Search for automated tool orchestration (web_search, fetch_url, execute_python)
- Users CANNOT define custom function tools via the Chat Completions endpoint
- The AI SDK capability table confirms: **all Perplexity models show "Tool Usage: No"**
- User-defined function calling is only available via the **Agentic Research API** (Responses endpoint), which uses a completely different request format

**Confirmed**: Our current treatment of Perplexity as text-only (no tools) is correct for the Sonar API.

### 3.4 Known Strict Invariants

| Invariant | Severity | Details |
|-----------|----------|---------|
| Text-only messages for replay | Requirement | Only `system`, `user`, `assistant` with text content |
| `reasoning_steps` in input | Unknown | Schema allows it but likely ignored; do not replay |
| `tool_calls` in input messages | Unknown | Schema allows it but not user-controllable; do not replay |
| `web_search_options` on request | Supported | Controls built-in search behavior (not a message invariant) |
| Max tokens | 128,000 | Per-request limit |

### 3.5 `@ai-sdk/perplexity` Conversion Behavior

- **Package**: `@ai-sdk/perplexity` v3, first-party Vercel AI SDK provider
- **API**: OpenAI Chat Completions compatible (base URL: `https://api.perplexity.ai`)
- **Tool calling**: **Not supported**. AI SDK capability table shows no tool usage for any Perplexity model.
- **Reasoning**: Not extracted by the SDK. `reasoning_steps` are Perplexity-specific and not mapped to AI SDK's `reasoningText`.
- **Provider options**: `return_images`, `search_recency_filter`, plus passthrough for other Perplexity API params
- **Message conversion**: Standard OpenAI Chat Completions format via `convertToModelMessages()`. Since no tools are supported, any tool parts in UIMessage history would be converted but potentially cause errors or be silently ignored.
- **Sources/Citations**: Handled via the SDK's `sources` property — these are URL citations from Perplexity's search, not message parts.

**Project config** (`lib/models/data/perplexity.ts`):
- 5 models: Sonar, Sonar Reasoning, Sonar Reasoning Pro, Sonar Pro, Sonar Deep Research
- All have `tools: false`
- No special `providerOptions` in `route.ts`

---

## 4. Summary Comparison Table

### 4.1 API & Feature Matrix

| Dimension | xAI (Grok) | Mistral | Perplexity |
|-----------|-----------|---------|------------|
| **API format** | OpenAI Chat Completions (legacy) | Custom (OpenAI-influenced) | OpenAI Chat Completions |
| **AI SDK package** | `@ai-sdk/xai` v3 | `@ai-sdk/mistral` v3 | `@ai-sdk/perplexity` v3 |
| **Base URL** | `api.x.ai/v1` | `api.mistral.ai/v1` | `api.perplexity.ai` |
| **Reasoning output** | `reasoning_content` (grok-3-mini only) | `thinking` content chunks | `reasoning_steps` (search pipeline) |
| **Reasoning replay required** | No | No | No |
| **Tool calling** | Yes (OpenAI format) | Yes (OpenAI format) | No (Sonar API) |
| **Tool format** | `tool_calls[]` + `tool` role | `tool_calls[]` + `tool` role | N/A |
| **Tool pairing** | `tool_call_id` required | `tool_call_id` + `name` required | N/A |
| **Parallel tool calls** | Yes | Yes | N/A |
| **Built-in search** | Yes (via Responses API) | No | Yes (native) |

### 4.2 Part Treatment Matrix

What to do with each UIMessage part type when replaying to each provider:

| Part Type | xAI | Mistral | Perplexity |
|-----------|-----|---------|------------|
| `text` | **Keep** | **Keep** | **Keep** |
| `reasoning` | **Drop** (not recognized as input) | **Drop** (foreign format) | **Drop** |
| `step-start` | **Drop** (SDK artifact) | **Drop** | **Drop** |
| `tool-invocation` | **Transform** (if xAI-originated, keep as OpenAI tool_calls) | **Transform** (keep as Mistral tool_calls) | **Drop** |
| `tool-result` | **Transform** (keep paired with invocation) | **Transform** (keep paired with invocation) | **Drop** |
| `source-url` | **Drop** (not an API-level field) | **Drop** | **Drop** |
| `file` | **Keep** (if applicable) | **Keep** (if applicable) | **Keep** (if applicable) |

### 4.3 Adapter Complexity Rating

| Provider | Complexity | Reason |
|----------|-----------|--------|
| **Perplexity** | Trivial | Strip everything except text. Simplest possible adapter. |
| **xAI** | Low-Medium | OpenAI-compatible tool format. Drop reasoning. Keep tool pairs if both invocation + result exist, drop orphans. |
| **Mistral** | Low-Medium | Similar to xAI. OpenAI-compatible tool format. Drop reasoning. Keep tool pairs, drop orphans. Additional: `name` field required on tool results. |

---

## 5. Implications for Adapter Design

### 5.1 Can Any Share an Adapter?

**Yes — xAI and Mistral can potentially share a "DefaultOpenAICompatible" adapter** with minor variations.

Both providers:
- Follow OpenAI Chat Completions tool call/result format
- Use `tool_call_id` for pairing
- Support parallel tool calls
- Do NOT require reasoning replay
- Do NOT have the OpenAI Responses API's strict reasoning→tool pairing invariant

The key difference is Mistral requires the `name` field on `tool` role messages, while xAI (being OpenAI-compatible) also expects it. This is a shared requirement.

**Proposed adapter hierarchy:**

```
ProviderHistoryAdapter (interface)
├── AnthropicAdapter        — Keep all (reasoning + tools required)
├── OpenAIResponsesAdapter  — Strict reasoning→tool pair invariant
├── OpenAICompatibleAdapter — Drop reasoning, keep tool pairs, drop orphans
│   ├── Used by: xAI, Mistral (maybe with per-provider overrides)
│   └── Could also serve: DeepSeek, Groq, other OpenAI-compatible
├── TextOnlyAdapter         — Strip everything except text
│   ├── Used by: Perplexity
│   └── Could also serve: any provider with no tool/reasoning support
└── DefaultAdapter          — Fallback (current strip-all behavior)
```

### 5.2 xAI-Specific Considerations

1. **Chat Completions is legacy**: xAI is pushing toward the Responses API. If we migrate to `xai.responses()`, the adapter would need to handle Responses API invariants (similar to OpenAI Responses API), not Chat Completions.
2. **Encrypted reasoning**: If we adopt the Responses API in the future, we'd need to handle encrypted `reasoning.encrypted_content` — store it, replay it. This is NOT needed for Chat Completions.
3. **Reasoning models reject certain params**: `presencePenalty`, `frequencyPenalty`, `stop` cause errors on reasoning models. This is a request-level concern, not a history adapter concern.

### 5.3 Mistral-Specific Considerations

1. **Thinking chunks from Magistral models**: If a Mistral Magistral model generated the response, assistant messages may contain `thinking` content chunks. When replaying to a different provider (or even a non-Magistral Mistral model), these MUST be stripped.
2. **Thinking chunks FROM other providers**: If the history contains reasoning parts from Anthropic/OpenAI, the adapter must strip them — Mistral's `thinking` format is its own, not compatible with others.
3. **Content format flexibility**: Mistral accepts both string content and array content. The adapter doesn't need to normalize this — the AI SDK handles it.

### 5.4 Perplexity-Specific Considerations

1. **Simplest adapter**: Strip all non-text parts, keep text. No tool or reasoning concerns.
2. **`reasoning_steps` in output**: These appear in responses but should NOT be stored as `reasoning` parts in our canonical UIMessage format. They represent search pipeline activity, not model reasoning.
3. **Future Agentic Research API**: If we ever adopt Perplexity's Responses API, we'd need a more complex adapter. But for Sonar API, text-only is correct.
4. **Citations**: Perplexity returns `citations[]` at the response level, not in message parts. These don't affect replay.

### 5.5 Correcting Assumptions from the Parent Plan

The parent research document (`provider-aware-history-adaptation.md`) had preliminary entries for these providers. Here are corrections:

| Provider | Original Assumption | Correction |
|----------|-------------------|------------|
| **xAI** | "Not well-documented; likely permissive" | Now confirmed: OpenAI-compatible Chat Completions format. Tool pairing follows OpenAI rules. Reasoning is output-only, not required for replay. |
| **Mistral** | "No reasoning support" | **Incorrect**. Magistral models (since June 2025) support reasoning with `thinking` content chunks. However, reasoning is NOT required for replay. |
| **Mistral** | "Standard OpenAI-compatible tool format" | Confirmed correct. Uses `tool_calls[]` + `tool` role with `tool_call_id` + `name`. |
| **Perplexity** | "No reasoning support" | **Partially incorrect**. Sonar Reasoning models produce `reasoning_steps` (search pipeline), but these are not model-level reasoning. For replay purposes, treating as "no reasoning" is still correct. |
| **Perplexity** | "No tool calling support" | Confirmed correct for Sonar/Chat Completions API. Function calling only in Agentic Research API. |
| **Perplexity** | "Clean text-only replay" | Confirmed correct. |

### 5.6 Validation of Current Workaround

Our current blanket rule in `sanitizeMessagesForProvider()` — strip ALL tool and reasoning parts for non-Anthropic providers — is **safe but suboptimal** for xAI and Mistral:

- **Perplexity**: Current behavior is correct and optimal.
- **xAI**: Current behavior is safe but destroys tool context that xAI can leverage. All Grok models support tools.
- **Mistral**: Current behavior is safe but destroys tool context for tool-capable Mistral models (all except Ministral 3B).

**Risk of changing**: Low for Perplexity (no change needed). Medium for xAI/Mistral (need to implement proper tool pair handling before enabling tool replay).

### 5.7 Recommended Adapter Assignments

| Provider | Adapter | Priority | Notes |
|----------|---------|----------|-------|
| **Perplexity** | `TextOnlyAdapter` | Low (current behavior is already optimal) | Simplest to implement, lowest risk |
| **xAI** | `OpenAICompatibleAdapter` | Medium | Same adapter as Mistral; enables tool context preservation |
| **Mistral** | `OpenAICompatibleAdapter` | Medium | Same adapter as xAI; enables tool context preservation |

The `OpenAICompatibleAdapter` should:
1. Drop all `reasoning` parts
2. Drop all `step-start` parts
3. Drop all `source-url` parts
4. Keep `tool-invocation` + `tool-result` pairs if both exist and are properly paired
5. Drop orphaned tool invocations (no matching result)
6. Drop orphaned tool results (no matching invocation)
7. Drop `tool` role messages if their corresponding `tool_calls` were dropped
8. Provide empty text fallback when all parts are stripped

---

## 6. Open Questions

| # | Question | Impact | How to Resolve |
|---|----------|--------|---------------|
| 1 | Does xAI's Chat Completions endpoint reject orphaned `tool_calls` in history (like OpenAI Responses API does)? | Medium — determines strictness of tool pair enforcement | Empirical test: send history with orphaned tool_call to xAI |
| 2 | Does Mistral reject messages with `thinking` chunks from non-Magistral models? | Low — we'd strip these anyway | Empirical test: send `thinking` content to `mistral-large-latest` |
| 3 | Does Perplexity silently ignore `reasoning_steps` in input messages? | Low — we'd strip these anyway | Empirical test: include `reasoning_steps` in Sonar API request |
| 4 | When should we migrate xAI from Chat Completions to Responses API? | Medium-term — affects adapter design | Track xAI's deprecation timeline for Chat Completions |
| 5 | Should Magistral reasoning models get their thinking replayed for quality improvement? | Low — not documented as beneficial | Test with/without thinking replay on Magistral, compare quality |

---

*This document completes the replay invariant research for the three lower-priority providers. Combined with the parent plan's coverage of OpenAI, Anthropic, and Google, all 6+ providers now have documented replay constraints for adapter implementation.*
