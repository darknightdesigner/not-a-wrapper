# Anthropic Message Replay Invariants

> **Status**: Complete
> **Date**: February 13, 2026
> **Author**: AI Research (Claude)
> **Related**: `app/api/chat/utils.ts`, `app/api/chat/route.ts`, `provider-aware-history-adaptation.md`
> **Sources consulted**:
> - [Anthropic Extended Thinking docs](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
> - [Anthropic Adaptive Thinking docs](https://docs.anthropic.com/en/docs/build-with-claude/adaptive-thinking)
> - [Anthropic Tool Use docs](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
> - [Anthropic Tool Implementation docs](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use)
> - [Anthropic Context Windows docs](https://docs.anthropic.com/en/docs/build-with-claude/context-windows)
> - [Anthropic Messages API docs](https://docs.anthropic.com/en/docs/build-with-claude/working-with-messages)
> - [AI SDK Anthropic Provider docs](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
> - [AI SDK convertToModelMessages docs](https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages)
> - [Vercel AI SDK Issue #8516](https://github.com/vercel/ai/issues/8516) — tool_use/tool_result pairing error
> - [Claude Code Issue #14264](https://github.com/anthropics/claude-code/issues/14264) — thinking blocks not preserved during tool loops
> - [Claude Code Issue #13769](https://github.com/anthropics/claude-code/issues/13769) — assistant message must start with thinking block
> - [Continue Issue #4470](https://github.com/continuedev/continue/issues/4470) — thinking/redacted_thinking blocks required for tool support

---

## Executive Summary

Anthropic's Messages API enforces specific invariants for message replay that differ significantly from other providers. The key finding is that **our current approach of passing messages through unchanged for Anthropic is broadly correct**, but with important nuances around tool use loops. The API is designed to be tolerant of thinking blocks in prior turns (it auto-strips them), but strict about `tool_use`/`tool_result` pairing and thinking block preservation during active tool use loops.

**Critical distinction**: The Anthropic API is a *stateless* API — you always send the full conversational history. The API itself handles stripping thinking blocks from prior turns. You do NOT need to strip them yourself. You MUST preserve them during tool use loops.

---

## 1. Thinking Block Replay Rules

### 1.1 Classification: Required vs Recommended vs Tolerant

| Scenario | Thinking Blocks | Requirement Level | What Happens |
|----------|----------------|-------------------|--------------|
| **Tool use loop (last assistant msg)** | MUST include | **Required** | 400 error if missing. Cryptographic signature verified. |
| **Prior completed turns** | SHOULD include | **Recommended** | API auto-strips from context. No error. Quality may benefit from caching. |
| **Non-thinking conversation** | N/A | **N/A** | If thinking is disabled and you pass thinking blocks, they are stripped and thinking remains disabled. |
| **Toggling thinking mid-turn** | Handled gracefully | **Tolerant** | API silently disables thinking for that request rather than erroring. |

### 1.2 Auto-Stripping Behavior

From Anthropic's context windows documentation:

> "Previous thinking blocks are automatically stripped from the context window calculation by the Claude API and are not part of the conversation history that the model 'sees' for subsequent turns. You do not need to strip the thinking blocks yourself. The Claude API automatically does this for you if you pass them back."

**What this means for us**: When we pass full history including thinking/reasoning parts to Anthropic, the API:
1. Accepts them without error
2. Automatically excludes them from context window calculations
3. Only bills thinking tokens once (during generation)
4. Uses relevant thinking blocks for caching purposes

**Effective context window formula**:
```
context_window = (input_tokens - previous_thinking_tokens) + current_turn_tokens
```

### 1.3 Tool Use Loop Requirements (CRITICAL)

During a tool use loop, thinking blocks are **strictly required** in the last assistant message:

```
User:    "What's the weather in Paris?"
Assistant: [thinking] + [tool_use: get_weather]     ← MUST include thinking
User:    [tool_result: "20°C, sunny"]
Assistant: [text: "The weather in Paris is 20°C"]    ← New turn, thinking auto-generated
```

**Rules**:
1. When posting tool results, the entire unmodified thinking block that accompanies that specific tool request must be included
2. The `signature` field on thinking blocks is verified cryptographically — modification causes errors
3. The sequence of consecutive thinking blocks must match the original output exactly — no rearranging
4. Both `thinking` and `redacted_thinking` blocks must be preserved

**After the tool use cycle completes** (i.e., a new user message arrives that is not a tool_result), the thinking blocks from the completed cycle CAN be dropped. The API will auto-strip them.

### 1.4 Thinking Block Types

| Block Type | Content | Modifiable | Must Preserve |
|-----------|---------|------------|---------------|
| `thinking` | Summarized reasoning (Claude 4+) or full reasoning (3.7) | No | During tool loops |
| `redacted_thinking` | Encrypted safety-flagged reasoning | No (opaque) | During tool loops |

**Claude 4 models** return summarized thinking. **Claude Sonnet 3.7** returns full thinking output. The `signature` field enables verification when blocks are replayed.

### 1.5 Model-Specific Thinking Differences

| Model | Thinking Mode | Interleaved Thinking | Prior Turn Flexibility |
|-------|--------------|---------------------|----------------------|
| **Opus 4.6** | Adaptive (recommended) | Auto-enabled | Previous turns don't need to start with thinking blocks |
| **Opus 4.5** | Manual (`type: "enabled"`) | Beta header required | Keeps all previous thinking blocks by default |
| **Opus 4.1, Opus 4** | Manual | Beta header required | Keeps all previous thinking blocks by default |
| **Sonnet 4.5, Sonnet 4** | Manual | Beta header required | Standard stripping behavior |
| **Haiku 4.5** | Manual | Beta header required | Standard stripping behavior |
| **Sonnet 3.7** (deprecated) | Manual | NOT supported | Standard stripping behavior |

**Key difference for Opus 4.6**: Adaptive thinking validation is more flexible. Previous assistant turns don't need to start with thinking blocks, unlike manual mode where the API enforces this.

**Key difference for Opus 4.5+**: All previous thinking blocks are kept by default. For older models, when a non-tool-result user block is included, all previous thinking blocks are ignored and stripped from context.

---

## 2. Tool Use / Tool Result Pairing Rules

### 2.1 Hard Invariants (400 Error on Violation)

1. **Every `tool_use` block MUST have a corresponding `tool_result`**:
   > "Each `tool_use` block must have a corresponding `tool_result` block in the next message."

2. **`tool_result` must immediately follow `tool_use`**:
   You cannot include any messages between the assistant's `tool_use` message and the user's `tool_result` message.

3. **`tool_result` blocks MUST come FIRST in user messages**:
   ```
   // WRONG — causes 400 error:
   { role: "user", content: [
     { type: "text", text: "Here are the results:" },   // ❌ Text before tool_result
     { type: "tool_result", tool_use_id: "toolu_01", ... }
   ]}

   // CORRECT:
   { role: "user", content: [
     { type: "tool_result", tool_use_id: "toolu_01", ... },
     { type: "text", text: "What should I do next?" }    // ✅ Text after tool_result
   ]}
   ```

4. **`tool_use_id` must match**: The `tool_use_id` in the `tool_result` must match the `id` from the corresponding `tool_use` block.

### 2.2 Tool Use Ordering Within Messages

```
Assistant message content ordering:
  [thinking]* → [text]? → [tool_use]*

User message content ordering (tool result turn):
  [tool_result]+ → [text]?
```

- `*` = zero or more
- `?` = zero or one
- `+` = one or more

### 2.3 Cross-Turn Tool State

A tool use exchange is a **single conceptual assistant turn** that spans multiple API calls:

```
Turn 1 (API call 1):
  User:      "What's the weather?"
  Assistant: [thinking] + [tool_use: get_weather]    ← stop_reason: "tool_use"

Turn 1 continued (API call 2):
  User:      [tool_result: "20°C"]                   ← Tool result for get_weather
  Assistant: [text: "It's 20°C and sunny"]           ← stop_reason: "end_turn"

Turn 2 (API call 3):
  User:      "What about tomorrow?"
  Assistant: [thinking] + [text: "..."]              ← New turn, new thinking
```

**Important**: Turns 1 and "Turn 1 continued" are the SAME assistant turn from the model's perspective. The tool loop does not create a new turn boundary.

### 2.4 Parallel Tool Calls

Anthropic supports parallel tool calls by default. When multiple `tool_use` blocks appear in one assistant message, ALL must have corresponding `tool_result` blocks in the next user message:

```
Assistant: [tool_use: get_weather, id: "t1"] + [tool_use: get_time, id: "t2"]
User:      [tool_result: id: "t1", ...] + [tool_result: id: "t2", ...]
```

Missing any one `tool_result` triggers the pairing error.

---

## 3. Interleaved Thinking with Tools

### 3.1 What Is Interleaved Thinking

Interleaved thinking allows Claude to think between tool calls within the same turn. Instead of thinking once and then making all tool calls, Claude can:
- Think about initial approach
- Make a tool call
- Think about the result
- Make another tool call
- Think about the final answer
- Produce text

### 3.2 Enabling Interleaved Thinking

| Model | How to Enable | Notes |
|-------|--------------|-------|
| **Opus 4.6** | Automatic with adaptive thinking | No beta header needed |
| **Claude 4 models** (Opus 4.5, 4.1, 4, Sonnet 4.5, 4) | Beta header: `interleaved-thinking-2025-05-14` | Header has no effect on unsupported models |
| **Sonnet 3.7** | NOT supported | No interleaving possible |

### 3.3 Interleaved Thinking Replay Invariants

With interleaved thinking, the `budget_tokens` can exceed `max_tokens` because the budget is the TOTAL across all thinking blocks within one assistant turn.

The replay rules are the same as non-interleaved thinking: all thinking blocks in the last assistant message must be preserved during tool loops. The sequence of thinking blocks must remain in their original order.

### 3.4 Prompt Caching Interaction

Interleaved thinking **amplifies cache invalidation** because thinking blocks can occur between multiple tool calls. Changes to thinking parameters invalidate message cache breakpoints.

---

## 4. @ai-sdk/anthropic Conversion Behavior

### 4.1 UIMessage → ModelMessage → Anthropic API

The conversion pipeline in our app:

```
UIMessage[] (with parts: reasoning, text, tool-*, etc.)
    ↓ sanitizeMessagesForProvider(messages, "anthropic")  → returns as-is
    ↓ convertToModelMessages(sanitizedMessages)           → ModelMessage[]
    ↓ @ai-sdk/anthropic provider converts to Anthropic format
    ↓ Anthropic Messages API
```

### 4.2 How convertToModelMessages Handles Parts

The AI SDK's `convertToModelMessages()`:
- Converts `reasoning` UIMessage parts into model-level reasoning content
- Converts `tool-invocation` parts into `tool-call` ModelMessage content
- Converts `tool-result` parts into `tool-result` ModelMessage content  
- Creates proper `role: "tool"` messages from tool results
- The `ignoreIncompleteToolCalls` option can skip tool calls without matching results

### 4.3 How @ai-sdk/anthropic Handles Reasoning

The `@ai-sdk/anthropic` provider:

1. **`sendReasoning` option** (defaults to `true`): Controls whether reasoning content from prior turns is included in requests sent to the Anthropic API. When `true`, reasoning parts from `ModelMessage` are converted to Anthropic `thinking` blocks with their `signature` fields.

2. **Automatic thinking block management**: The provider converts AI SDK reasoning content to Anthropic's `thinking` content blocks. The `signature` field from the original response is preserved and sent back.

3. **Tool use loop handling**: During `streamText()` multi-step execution, the SDK automatically includes thinking blocks from the current assistant turn when posting tool results back to the API. This is handled internally — the developer doesn't need to manually manage it.

4. **Context Management features**: The `@ai-sdk/anthropic` provider exposes Anthropic's context management:
   - `clear_thinking_20251015`: Automatically clears old thinking blocks
   - `clear_tool_uses_20250919`: Clears old tool uses
   - `compact_20260112`: Summarizes earlier conversation context

### 4.4 Known SDK Issues (Historical)

| Issue | Status | Impact |
|-------|--------|--------|
| **#8516**: `tool_use` ids without `tool_result` blocks | Fixed (PR #8524) | SDK was incorrectly ordering tool_result parts after text in combined messages |
| **#10200**: Thinking not working via AI Gateway | Resolved | Reasoning blocks not appearing in responses through Vercel AI Gateway |
| **#6472**: Interleaved thinking triggering tool pairing errors | Reported | Interleaved thinking can create complex message structures that trip the pairing validator |
| **Claude Code #14264**: Thinking blocks not preserved during tool loops | Open | SDK/agent frameworks dropping thinking blocks during message reconstruction |
| **Claude Code #13769**: Assistant message must start with thinking block | Reported | When thinking enabled with manual mode, first block must be thinking/redacted_thinking |

---

## 5. Stripping Thinking Blocks: Errors vs Quality Degradation

### 5.1 When Stripping Causes Errors

| Scenario | Result |
|----------|--------|
| Strip thinking from **last assistant message during tool loop** | **400 Error** — "thinking block must be followed by..." |
| Strip thinking from **prior completed turns** | **No error** — API auto-strips anyway |
| Strip thinking but leave orphaned tool_use | **400 Error** — tool pairing violation |
| Modify thinking block content or signature | **400 Error** — signature verification failure |
| Strip redacted_thinking blocks during tool loop | **400 Error** — must preserve all block types |

### 5.2 When Stripping Causes Quality Degradation (No Error)

| Scenario | Impact |
|----------|--------|
| Strip thinking from prior turns (no active tool loop) | **Minimal** — API strips them from context anyway. Potential cache miss. |
| Strip thinking for Opus 4.5+ (which keeps all prior blocks) | **Low-Medium** — Opus 4.5+ retains prior thinking by default; stripping removes this benefit. |
| Send conversation without thinking to a thinking-enabled model | **None** — model generates fresh thinking for the new turn. |

### 5.3 Practical Implications

**Our current approach is correct**: `sanitizeMessagesForProvider()` returns messages as-is for `provider === "anthropic"`. This means:

1. Reasoning parts are preserved in UIMessages
2. `convertToModelMessages()` converts them to model-level reasoning
3. `@ai-sdk/anthropic` converts them to Anthropic thinking blocks with signatures
4. The API receives them and auto-strips from prior turns as needed
5. During tool loops (managed internally by `streamText()`), thinking blocks are automatically preserved

**The only risk** would be if our stored UIMessages somehow lose their reasoning parts between storage and replay, which would break tool loop continuity. Since we store parts as-is in Convex, this should not occur.

---

## 6. Implications for Adapter Design

### 6.1 Current Architecture Assessment

Our current `sanitizeMessagesForProvider()` in `utils.ts`:

```typescript
if (provider === "anthropic") return messages  // Pass through unchanged
```

**This is correct.** The Anthropic adapter should be a near-passthrough because:

1. The API handles thinking block management server-side
2. The AI SDK handles tool use loop thinking block preservation
3. Stripping anything would either cause errors (tool loops) or be unnecessary (API auto-strips)

### 6.2 What the Anthropic Adapter Should Do

For the `ProviderHistoryAdapter` architecture proposed in the parent research doc:

```typescript
// app/api/chat/adapters/anthropic.ts
const anthropicAdapter: ProviderHistoryAdapter = {
  providerId: "anthropic",

  adaptMessages(messages: UIMessage[]): UIMessage[] {
    // Near-passthrough: preserve everything
    // The Anthropic API + AI SDK handle stripping/management

    // Only transformations needed:
    // 1. Remove step-start parts (SDK artifact, not Anthropic concept)
    // 2. Ensure tool-result messages follow their tool-invocation messages
    //    (defensive — convertToModelMessages should handle this)

    return messages.map(message => {
      if (message.role !== "assistant") return message

      const filteredParts = message.parts.filter(
        part => part.type !== "step-start"
      )

      return filteredParts.length === message.parts.length
        ? message
        : { ...message, parts: filteredParts }
    })
  },

  metadata: {
    droppedPartTypes: new Set(["step-start"]),
    transformedPartTypes: new Set([]),
    description: "Anthropic near-passthrough: preserves reasoning and tool parts, strips SDK artifacts",
  },
}
```

### 6.3 Defensive Validations (Optional)

For observability, the adapter could validate (but not enforce) these invariants:

1. **Tool pairing check**: Every `tool-invocation` part should have a matching `tool-result` in a subsequent message. Log a warning if orphaned.
2. **Thinking block presence**: If the last assistant message contains tool invocations, verify it also has reasoning parts. Log a warning if missing (SDK should handle this, but worth monitoring).
3. **Message alternation**: Anthropic requires user/assistant alternation. Verify this holds after any filtering.

### 6.4 What NOT to Do

1. **Don't strip reasoning parts** — This breaks tool loop continuity and removes data the API handles gracefully.
2. **Don't strip tool parts** — Anthropic requires full tool chains.
3. **Don't reorder parts** — The API validates ordering (thinking before tool_use, tool_result before text).
4. **Don't modify thinking block signatures** — Cryptographic verification will fail.

### 6.5 Cross-Provider Replay Considerations

When messages originally generated by Anthropic are replayed to Anthropic on a follow-up turn:

| Part Type | Generated By Anthropic | Replay to Anthropic | Action |
|-----------|----------------------|---------------------|--------|
| `reasoning` (with signature) | Yes | Yes | Keep — SDK preserves signature |
| `text` | Yes | Yes | Keep |
| `tool-invocation` | Yes | Yes | Keep |
| `tool-result` | Yes (via tool loop) | Yes | Keep |
| `step-start` | SDK artifact | N/A | Drop |
| `source-url` | SDK artifact | N/A | Keep (benign) |

When messages originally generated by **another provider** (e.g., OpenAI) are replayed to Anthropic:

| Part Type | Generated By Other | Replay to Anthropic | Action |
|-----------|-------------------|---------------------|--------|
| `reasoning` (no Anthropic signature) | Yes | Tolerated | The SDK will include reasoning content. Without a valid Anthropic signature, the API treats it as new content. No error — but no signature verification benefit. |
| `text` | Yes | Yes | Keep |
| `tool-invocation` | Yes | Yes | Keep — Anthropic will see tool history from the other provider |
| `tool-result` | Yes | Yes | Keep |

---

## 7. Summary of Rules

### Required (400 Error on Violation)

1. Every `tool_use` must have a matching `tool_result` in the immediately next message
2. `tool_result` blocks must come BEFORE text in user messages  
3. Thinking blocks from the last assistant message MUST be preserved during tool use loops (with unmodified signatures)
4. `tool_use_id` must match between `tool_use` and `tool_result` blocks
5. With manual thinking mode, the last assistant turn must start with a thinking block (if thinking is enabled)

### Recommended (Quality Impact)

1. Always pass thinking blocks back — the API handles stripping, and you benefit from caching
2. Use adaptive thinking for Opus 4.6 instead of manual mode
3. Preserve the full sequence of thinking blocks — don't rearrange
4. Use `sendReasoning: true` (the default in @ai-sdk/anthropic)

### Tolerant (API Handles Gracefully)

1. Thinking blocks from prior completed turns — auto-stripped, no error
2. Toggling thinking mid-turn — API silently disables thinking rather than erroring
3. Passing thinking blocks when thinking is disabled — stripped silently
4. Sending history from other providers with non-Anthropic reasoning — treated as new content

### Our App's Current Behavior: CORRECT

The `sanitizeMessagesForProvider("anthropic")` passthrough is the right approach because:
- The API auto-strips thinking from prior turns
- The AI SDK handles tool loop thinking preservation internally
- Stripping any parts would be either harmful (tool loops) or unnecessary (auto-stripped)
- The `@ai-sdk/anthropic` provider correctly converts reasoning parts to thinking blocks

The Anthropic adapter in the planned adapter architecture should remain a near-passthrough, only stripping SDK-internal artifacts like `step-start` that have no Anthropic equivalent.

---

*This research document is ready for reference during adapter implementation. See `provider-aware-history-adaptation.md` for the full architecture plan.*
