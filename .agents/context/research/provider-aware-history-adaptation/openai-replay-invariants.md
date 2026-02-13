# OpenAI Responses API — Replay Invariants Research

> **Status**: Complete
> **Date**: February 13, 2026
> **Researcher**: AI Assistant
> **Scope**: Exhaustive documentation of OpenAI Responses API message replay rules, pairing invariants, and @ai-sdk/openai conversion behavior
> **Related**: `provider-aware-history-adaptation.md` (parent research), `app/api/chat/utils.ts` (current sanitization)

---

## Sources Consulted

| Source | URL | Key Information |
|--------|-----|-----------------|
| OpenAI Responses API Reference | https://platform.openai.com/docs/api-reference/responses/create | Input item types, response object schema |
| OpenAI Conversation State Guide | https://platform.openai.com/docs/guides/conversation-state | Manual vs automatic state management |
| OpenAI Reasoning Models Guide | https://platform.openai.com/docs/guides/reasoning | Reasoning item replay requirements, encrypted content |
| OpenAI Web Search Tool Guide | https://platform.openai.com/docs/guides/tools-web-search | web_search_call output structure |
| Vercel AI SDK Issue #7099 | https://github.com/vercel/ai/issues/7099 | "reasoning was provided without its required following item" |
| Vercel AI SDK Issue #11036 | https://github.com/vercel/ai/issues/11036 | pruneMessages breaks reasoning models |
| Vercel AI SDK Issue #9308 | https://github.com/vercel/ai/issues/9308 | web_search tool-error on success |
| Vercel AI SDK Issue #8844 | https://github.com/vercel/ai/issues/8844 | web_search_call.action.sources validation |
| Vercel AI SDK PR #8177 | https://github.com/vercel/ai/pull/8177 | Fix for web search tool input conversion |
| OpenAI Community — Reasoning Pairing | https://community.openai.com/t/1151686 | Community solutions for reasoning pairing errors |
| OpenAI Community — GPT-5 Reasoning Fix | https://community.openai.com/t/1344988 | item_reference approach, pairing rules |
| OpenAI Community — Function Call Ordering | https://community.openai.com/t/1355347 | Parallel function_call ordering constraint |
| OpenAI Community — function_call without reasoning | https://community.openai.com/t/1236046 | Inverse pairing error |

---

## 1. Complete List of Responses API Input Item Types

The OpenAI Responses API (`POST /v1/responses`) accepts input items via the `input` parameter. These are distinct from Chat Completions API messages.

### 1.1 Message Items

| Type | Description | Roles |
|------|-------------|-------|
| `message` (EasyInputMessage) | Simple message with string or content array | `user`, `assistant`, `system`, `developer` |
| `message` (Message) | Full message with content list and status | `user`, `system`, `developer` |
| `ResponseOutputMessage` | Previous assistant output replayed as input | `assistant` (with `id` field) |

Content types within messages:
- `input_text` — Text content
- `input_image` — Image content (with detail level)
- `input_file` — File content (data, id, url, or filename)

### 1.2 Reasoning Items

| Type | ID Prefix | Description |
|------|-----------|-------------|
| `reasoning` | `rs_` | Internal reasoning trace from a reasoning model |

Reasoning items have:
- `id`: Unique identifier (e.g., `rs_67e298fa71e4...`)
- `summary`: Array of summary objects (may be empty)
- `encrypted_content`: Optional encrypted reasoning tokens (when `include: ["reasoning.encrypted_content"]`)

### 1.3 Tool Call Items (Built-in Tools)

| Type | ID Prefix | Description |
|------|-----------|-------------|
| `web_search_call` | `ws_` | Web search invocation |
| `file_search_call` | `fs_` | File search invocation |
| `computer_call` | `cu_` | Computer use invocation |
| `code_interpreter_call` | `ci_` | Code interpreter invocation |
| `image_generation_call` | `ig_` | Image generation invocation |

### 1.4 Tool Call Output Items

| Type | Description |
|------|-------------|
| `computer_call_output` | Output from computer use tool |
| `code_interpreter_call_output` | Output from code interpreter |

Note: `web_search_call` and `file_search_call` do NOT have separate output items — their results are embedded in the subsequent `message` item.

### 1.5 Function Call Items (Custom Tools)

| Type | ID Prefix | Description |
|------|-----------|-------------|
| `function_call` | `fc_` | Custom function invocation |
| `function_call_output` | — | Output from custom function |

### 1.6 Item References

| Type | Description |
|------|-------------|
| `item_reference` | Reference to a previously stored item by ID |

---

## 2. Pairing Rules — The Core Invariants

This is the critical section. The Responses API enforces strict structural invariants when replaying conversation history. Violating any of these produces a `400 invalid_request_error`.

### 2.1 Invariant: Reasoning Must Have a Following Item

**Rule**: A `reasoning` item (`rs_*`) MUST be immediately followed by its paired item. If a reasoning item is the last item, or its following item is missing, the API rejects the request.

**Error messages**:
```
Item 'rs_...' of type 'reasoning' was provided without its required following item.
```

**What constitutes a valid "following item"**:
- `function_call` — When reasoning preceded a custom tool call
- `web_search_call` — When reasoning preceded a web search
- `file_search_call` — When reasoning preceded a file search
- `computer_call` — When reasoning preceded a computer use action
- `code_interpreter_call` — When reasoning preceded code execution
- `message` (assistant) — When reasoning preceded a text response

**Key insight**: The "following item" is whatever the model decided to do after reasoning. The API tracks this relationship via internal IDs.

### 2.2 Invariant: Tool Calls Must Have Their Preceding Reasoning

**Rule**: A tool call item (e.g., `function_call`, `web_search_call`) that was originally generated alongside reasoning MUST have its preceding `reasoning` item present.

**Error messages**:
```
Item 'fc_...' of type 'function_call' was provided without its required 'reasoning' item: 'rs_...'.
Item 'web_search_call' at index 3 was provided without its required 'reasoning' item that should precede it.
```

**This is the exact error from our production bug.** Our sanitization stripped reasoning but kept web_search_call items, breaking this pairing.

### 2.3 Invariant: Function Calls Must Have Outputs

**Rule**: A `function_call` item must eventually be followed by a `function_call_output` item with a matching `call_id`.

**Error message**:
```
No tool output found for function call 'fc_...'.
```

### 2.4 Invariant: Parallel Function Calls Must Be Grouped Correctly

**Rule**: When a model makes parallel function calls (common with GPT-5), the replay order must be:

```
reasoning           ← One reasoning block for the batch
function_call_1     ← All calls together
function_call_2
function_call_3
function_call_output_1  ← All outputs together
function_call_output_2
function_call_output_3
```

**NOT** interleaved:
```
reasoning
function_call_1
function_call_output_1   ← WRONG: interleaving calls and outputs
function_call_2
function_call_output_2
```

**Source**: Community report from GPT-5 migration (https://community.openai.com/t/1355347). The error message misleadingly says "missing reasoning item" when the actual issue is interleaved ordering.

### 2.5 Invariant: Reasoning–Message Pairing for Text Responses

**Rule**: If a `message` item is immediately preceded by a `reasoning` item, those two form a pair. Both must be included together and in order, or both omitted.

**Source**: Community guide (https://community.openai.com/t/1344988):
> "If a message item is immediately preceded by a reasoning item, those two form a pair. Always include both IDs together and in order when referencing them."

### 2.6 Exception: code_interpreter Reasoning

**Rule**: When `code_interpreter` was called, do NOT include the `reasoning_id` — only reference the `message_id`.

**Source**: Same community guide. This suggests the code_interpreter tool has different replay semantics.

### 2.7 Text-Only Messages Are Always Safe

**Rule**: Replaying a plain `message` item with text-only content (no tool calls, no reasoning) is always safe. The API does not reject simple text messages.

This is why our current "strip everything to text" fallback works — it produces valid but context-poor input.

---

## 3. Chat Completions API vs Responses API — Replay Differences

| Dimension | Chat Completions API | Responses API |
|-----------|---------------------|---------------|
| **Message format** | `{ role, content }` objects | Typed items with `type` discriminator |
| **Reasoning tokens** | Discarded between turns; NOT replayable | Preserved as `reasoning` items; replayable and recommended |
| **State management** | Fully stateless; caller manages all history | Supports `previous_response_id`, `conversation`, or manual input |
| **Tool call format** | `tool_calls` array on assistant message | Separate `function_call` / `web_search_call` items |
| **Tool result format** | `role: "tool"` message with `tool_call_id` | `function_call_output` item with `call_id` |
| **Built-in tools** | Limited (`web_search_preview` on specific models only) | Full support (`web_search`, `file_search`, `code_interpreter`, `computer_use`) |
| **Pairing enforcement** | Tool calls need matching results; no reasoning pairing | Strict reasoning-tool pairing; strict ordering |
| **ID linkage** | Messages don't have provider-specific IDs | Items have `id` fields (`msg_`, `rs_`, `ws_`, `fc_`, `cu_`, etc.) with internal cross-references |
| **Parallel tool calls** | Grouped in `tool_calls` array on single message | Separate items that must maintain ordering (reasoning → all calls → all outputs) |

### Critical Implication for Our App

When `@ai-sdk/openai` uses `openai.responses()` (the default for newer models), it sends Responses API format. The Responses API has STRICTER replay requirements than Chat Completions. Our stored `UIMessage[]` parts originate from Responses API output items, carrying `msg_`, `rs_`, `ws_` prefixes that create ID-linked relationships the API expects to see preserved.

When we use `openai.chat()` instead, reasoning and tool streaming are unavailable but replay is simpler since Chat Completions doesn't enforce reasoning pairing.

---

## 4. @ai-sdk/openai Conversion Behavior

### 4.1 How the SDK Converts UIMessage Parts

The `@ai-sdk/openai` package provides two model constructors:
- `openai.chat("model")` — Uses Chat Completions API (`/v1/chat/completions`)
- `openai.responses("model")` — Uses Responses API (`/v1/responses`)

When using `openai.responses()`, the SDK's `convertToModelMessages()` function (from `ai` core) converts `UIMessage[]` into `ModelMessage[]`, which the OpenAI provider then maps to Responses API input items.

**Key behaviors observed from issues and PRs**:

1. **Reasoning parts become `reasoning` items**: The SDK preserves reasoning content from `UIMessage` parts as `reasoning` input items in the Responses API request. This includes the `id` (e.g., `rs_...`) if present.

2. **Tool parts become typed items**: `tool-invocation` parts are mapped to their corresponding Responses API types (`function_call`, `web_search_call`, etc.).

3. **IDs are preserved**: The SDK passes through item IDs from previous responses. This means if a `UIMessage` has a part with `id: "rs_abc123"`, that ID is included in the input. The API uses these IDs to validate pairing relationships.

4. **The SDK does NOT automatically handle pairing**: PR #8177 fixed the web search tool input structure but did NOT add general-purpose reasoning-tool pairing validation. The SDK trusts the caller to provide structurally valid input.

5. **pruneMessages breaks pairing**: Issue #11036 confirms that the SDK's `pruneMessages` utility strips reasoning parts independently of tool call parts, breaking the Responses API invariants. This is the same class of bug as our sanitization.

### 4.2 What the SDK Does NOT Do

- **No automatic pairing repair**: If you strip reasoning but keep tool calls, the SDK sends it as-is and the API rejects it.
- **No provider-aware pruning**: `pruneMessages` uses a blanket `reasoning: 'all'` strategy with no awareness of Responses API pairing requirements.
- **No ID stripping**: The SDK preserves all item IDs, which can create cross-response linkage issues when replaying to a different model or provider.

### 4.3 PR #8177 — What It Fixed

The August 2025 fix (PR #8177) specifically addressed the web search tool input format. The issue was that the SDK was not correctly mapping web search tool call/result structures to the Responses API format. This caused multi-step chats with `generateText`, GPT-5 reasoning, and web search to fail.

**The fix updated the SDK to match the Responses API's expected web search action/schema format.** It did NOT add general pairing validation — that remains the caller's responsibility.

---

## 5. Exact Error Messages — Reference Table

| Error Pattern | Cause | OpenAI Error Type |
|---------------|-------|-------------------|
| `Item 'rs_...' of type 'reasoning' was provided without its required following item.` | Reasoning item present without its paired tool call or message item | `invalid_request_error` |
| `Item 'fc_...' of type 'function_call' was provided without its required 'reasoning' item: 'rs_...'.` | Function call present without its required preceding reasoning item | `invalid_request_error` |
| `Item 'web_search_call' at index N was provided without its required 'reasoning' item that should precede it` | Web search call present without preceding reasoning | `invalid_request_error` |
| `No tool output found for function call 'fc_...'` | Function call without matching function_call_output | `invalid_request_error` |
| `Invalid input message` | Malformed message structure | `invalid_request_error` |
| `Item 'cu_...' of type 'computer_call' was provided without its required 'reasoning' item` | Computer call without preceding reasoning | `invalid_request_error` |

All of these are HTTP 400 errors with `type: "invalid_request_error"`.

---

## 6. Relevant GitHub Issues

### Directly Relevant

| Issue | Title | Status | Key Insight |
|-------|-------|--------|-------------|
| [#7099](https://github.com/vercel/ai/issues/7099) | Item 'rs_...' reasoning without required following item | **Closed** (PR #8177) | Confirmed: openai.responses() + reasoning model + tool call = pairing error. Fixed for web search specifically. |
| [#11036](https://github.com/vercel/ai/issues/11036) | pruneMessages doesn't work with OpenAI reasoning models | **Open** | `pruneMessages` strips reasoning independently, breaking pairing. Exactly our bug class. Two specific errors documented: removing reasoning breaks tool calls, removing tool calls breaks reasoning. |
| [#8177](https://github.com/vercel/ai/pull/8177) | fix(provider/openai): correct web search tool input | **Merged** | Fixed web search tool format mapping. Multi-step chats with GPT-5 + web search now work within a single session. Does NOT fix cross-session replay. |
| [#9308](https://github.com/vercel/ai/issues/9308) | OpenAI 'tool-error' chunk returned even when web search succeeds | — | Web search schema validation bug — `open_page` action may omit `url` field, causing spurious tool errors. |
| [#8844](https://github.com/vercel/ai/issues/8844) | AI Gateway validation missing web_search_call.action.sources | — | Gateway-level validation was too strict. |

### Peripherally Relevant

| Issue | Title | Key Insight |
|-------|-------|-------------|
| [#4809](https://github.com/vercel/ai/issues/4809) | Unable to get reasoning tokens with latest version | Early issue about reasoning token access in v4/v5 era |

### OpenAI Community Threads (Highly Relevant)

| Thread | Key Finding |
|--------|-------------|
| [community.openai.com/t/1151686](https://community.openai.com/t/1151686) | Original March 2025 report. Computer use + reasoning pairing. Even with `previous_response_id`, pairing errors occur. |
| [community.openai.com/t/1344988](https://community.openai.com/t/1344988) | **Best community solution**: Use `item_reference` instead of `previous_response_id`. Explicit pairing rules documented. |
| [community.openai.com/t/1355347](https://community.openai.com/t/1355347) | **Parallel function call ordering**: Calls and outputs must NOT be interleaved. GPT-5 makes 5-10 parallel calls. |
| [community.openai.com/t/1236046](https://community.openai.com/t/1236046) | Inverse error: function_call without reasoning item. Confirms bidirectional pairing. |
| [community.openai.com/t/1303809](https://community.openai.com/t/1303809) | Another instance of the reasoning pairing error |
| [community.openai.com/t/1280238](https://community.openai.com/t/1280238) | Error specific to Responses API — not seen in Chat Completions |

---

## 7. Pairing Rule Summary — Decision Tree

For the OpenAI adapter, use this decision tree when processing each assistant message's parts:

```
For each assistant message in history:
│
├─ Contains reasoning parts?
│  ├─ YES: Contains tool call parts immediately after?
│  │  ├─ YES: Keep BOTH (reasoning + tool calls as a unit)
│  │  │  └─ Contains tool call outputs?
│  │  │     ├─ YES: Keep outputs too (complete triple)
│  │  │     └─ NO: Drop the entire unit (reasoning + calls)
│  │  │         OR synthesize placeholder outputs
│  │  └─ NO: Contains message/text immediately after?
│  │     ├─ YES: Keep BOTH (reasoning + message as a pair)
│  │     └─ NO: Drop the orphaned reasoning
│  └─ NO: Contains tool call parts?
│     ├─ YES: Were these calls generated with reasoning?
│     │  ├─ YES (has rs_ reference): Drop the orphaned tool calls
│     │  └─ NO / UNKNOWN: Keep if outputs present, drop if orphaned
│     └─ NO: Keep as-is (text-only message)
│
└─ Strip all provider-specific IDs (msg_, rs_, ws_, fc_, cu_)
   to prevent cross-session linkage errors
```

### Simplified Safe Strategy

When in doubt, the safest approach for our OpenAI adapter:

1. **If the message has ONLY text parts**: Keep as-is. Always safe.
2. **If the message has complete reasoning→tool→output triples**: Keep all three. Preserves context.
3. **If any part of a reasoning-tool group is missing**: Drop the ENTIRE group. Replace with text summary if available.
4. **Always strip provider-specific IDs** (`msg_`, `rs_`, `ws_`, `fc_`, `cu_`, `ci_`, `ig_`): These create cross-session linkage that the API validates. When replaying from stored history (not `previous_response_id`), IDs from a prior response are not valid.

---

## 8. Implications for Our Adapter Design

### 8.1 What the OpenAI Adapter MUST Enforce

1. **Atomic pairing**: Reasoning and its following item(s) must be treated as an atomic unit. Either keep the full group or drop the full group. Never keep one without the other.

2. **Ordering invariant for parallel calls**: When preserving function calls with reasoning, maintain the order: `[reasoning, call_1, call_2, ..., output_1, output_2, ...]`. Never interleave calls with outputs.

3. **ID stripping or regeneration**: When replaying stored history (not via `previous_response_id`), provider-specific IDs (`rs_`, `ws_`, `fc_`, `msg_`) create cross-response linkage that the API validates. If the linked items aren't all present and correctly ordered, the API rejects the request. **Stripping IDs is the safest approach for cross-session replay.**

4. **Tool output completeness**: Every `function_call` must have a matching `function_call_output`. If the output is missing (e.g., because it was stored in a separate `role: "tool"` message that our sanitizer drops), either include the output or drop the call.

5. **Text fallback**: When all non-text parts are stripped, ensure the message has at least one text part (even if empty string).

### 8.2 What the OpenAI Adapter CAN Preserve (vs Current Strip-All)

Our current `sanitizeMessagesForProvider()` strips ALL tool and reasoning parts for non-Anthropic providers. With a proper adapter, we can:

| Scenario | Current Behavior | Improved Behavior |
|----------|-----------------|-------------------|
| Text-only assistant messages | Keep (correct) | Keep (same) |
| Complete reasoning→text pair | Strip reasoning (loses context) | **Keep both** (safe, preserves quality) |
| Complete reasoning→tool→output | Strip all (loses tool context) | **Keep all** (safe, preserves tool context) |
| Orphaned reasoning (no following item) | Strip (correct) | Strip (same) |
| Orphaned tool call (no reasoning) | Strip (correct) | Strip (same, but more targeted) |
| Tool call without output | Strip (correct) | Strip or synthesize placeholder |
| `source-url` parts | Strip (unnecessary loss) | **Keep as text annotation** |

### 8.3 Recommended Adapter Pseudocode

```typescript
function adaptForOpenAI(messages: UIMessage[]): UIMessage[] {
  return messages
    .filter(msg => msg.role !== "tool") // Handle tool-role separately
    .map(msg => {
      if (msg.role !== "assistant") return msg

      // Group parts into atomic units
      const units = groupPartsIntoUnits(msg.parts)
      // A "unit" is: [reasoning?, tool_call*, tool_output*] or [text] or [source-url]

      const keptParts = units.flatMap(unit => {
        // Text-only units: always keep
        if (unit.type === "text") return unit.parts

        // Reasoning-tool unit: keep only if complete
        if (unit.type === "reasoning-tool") {
          const hasReasoning = unit.parts.some(p => p.type === "reasoning")
          const hasToolCall = unit.parts.some(p => isToolPart(p))
          const hasOutput = /* check for matching outputs */

          if (hasReasoning && hasToolCall && hasOutput) {
            return stripProviderIds(unit.parts)
          }
          // Incomplete: summarize to text or drop
          return summarizeToText(unit)
        }

        // Reasoning-message unit: keep both or drop reasoning
        if (unit.type === "reasoning-message") {
          return stripProviderIds(unit.parts)
        }

        return [] // Drop unknown unit types
      })

      return {
        ...msg,
        id: normalizeId(msg.id), // Strip msg_ prefix
        parts: keptParts.length ? keptParts : [{ type: "text", text: "" }]
      }
    })
}
```

### 8.4 ID Stripping Strategy

Provider IDs that need stripping/normalization:

| ID Prefix | Item Type | Action |
|-----------|-----------|--------|
| `msg_` | Output message | Replace with synthetic ID |
| `rs_` | Reasoning | Remove (don't replay reasoning IDs to avoid linkage) |
| `ws_` | Web search call | Remove |
| `fc_` | Function call | Remove or regenerate (needed for call_id matching) |
| `cu_` | Computer call | Remove |
| `ci_` | Code interpreter | Remove |
| `ig_` | Image generation | Remove |
| `fs_` | File search | Remove |

**Why**: These IDs create cross-response relationships. When item `fc_abc` references `rs_def`, the API validates that `rs_def` is present and correctly positioned. If we're replaying from stored history (not via `previous_response_id`), these relationships cannot be satisfied because the API doesn't have the original response context.

### 8.5 When to Use openai.chat() vs openai.responses()

| Use Case | Recommended API | Reason |
|----------|----------------|--------|
| New conversation, first turn | `openai.responses()` | Full feature support |
| Same-session continuation | `openai.responses()` + `previous_response_id` | Automatic context, no replay issues |
| Cross-session replay (our use case) | `openai.responses()` + manual input | Must handle pairing ourselves |
| Fallback for replay errors | `openai.chat()` | Simpler replay, but no reasoning/tool streaming |

---

## 9. Open Questions

1. **Are ID-stripped reasoning items still useful?** If we strip the `rs_` ID but keep the reasoning `summary` content, does the Responses API accept it as a new reasoning item or reject it? Needs empirical testing.

2. **Can we convert Responses API items to Chat Completions format?** If cross-session replay is too fragile with Responses API, could we use `openai.chat()` for replay while losing reasoning streaming? This is effectively what our current strip-all approach does.

3. **Does the AI SDK plan to fix pruneMessages?** Issue #11036 is open with no assignee. If the SDK adds pairing-aware pruning, we could leverage it instead of our custom adapter.

4. **What about `encrypted_content` for stateless replay?** OpenAI recommends `include: ["reasoning.encrypted_content"]` for zero-data-retention orgs. Could we use this for cross-session reasoning replay? The encrypted tokens are opaque but satisfy the pairing requirement.

5. **How does compaction interact with pairing?** OpenAI's compaction feature (`context_management`) automatically manages context window. Does it respect pairing invariants, or can it create orphaned items?

---

## 10. Recommendations for Adapter Implementation

### Priority 1: Atomic Unit Detection

The single most important feature for the OpenAI adapter is detecting and enforcing atomic units. A reasoning item and its following tool call(s) are a single unit. Either the whole unit is replayed or none of it.

### Priority 2: ID Hygiene

Strip all provider-specific IDs when replaying from stored history. This eliminates the cross-response linkage validation entirely, making replay more robust.

### Priority 3: Tool Output Matching

When preserving tool calls, ensure their outputs are present. This requires looking across message boundaries (tool outputs may be in a separate `role: "tool"` message).

### Priority 4: Parallel Call Ordering

If preserving parallel function calls, maintain the grouping: all calls before all outputs. This is a less common scenario but critical for GPT-5's agentic behavior.

---

*This document should be updated as OpenAI changes their API validation rules or as the Vercel AI SDK adds pairing-aware features.*
