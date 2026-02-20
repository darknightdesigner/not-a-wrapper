# AI SDK `convertToModelMessages()` — Deep Dive

| Field | Value |
|-------|-------|
| **Status** | Complete |
| **Date** | 2026-02-13 |
| **SDK Version** | `ai@6.0.78` |
| **Source File** | `node_modules/ai/src/ui/convert-to-model-messages.ts` |
| **Related** | `provider-aware-history-adaptation.md`, `openai-replay-invariants.md` |

## Type Signature

```typescript
async function convertToModelMessages<UI_MESSAGE extends UIMessage>(
  messages: Array<Omit<UI_MESSAGE, 'id'>>,
  options?: {
    tools?: ToolSet;
    ignoreIncompleteToolCalls?: boolean;  // default: false
    convertDataPart?: (
      part: DataUIPart<InferUIMessageData<UI_MESSAGE>>,
    ) => TextPart | FilePart | undefined;
  },
): Promise<ModelMessage[]>
```

Returns `ModelMessage[]` where:

```typescript
type ModelMessage =
  | SystemModelMessage   // { role: 'system',    content: string }
  | UserModelMessage     // { role: 'user',      content: string | (TextPart | ImagePart | FilePart)[] }
  | AssistantModelMessage // { role: 'assistant', content: string | AssistantContent[] }
  | ToolModelMessage     // { role: 'tool',      content: (ToolResultPart | ToolApprovalResponse)[] }
```

All four types also carry optional `providerOptions?: ProviderOptions`.

---

## Part Type Mapping Table

### System Messages (`role: 'system'`)

| UIMessage Part Type | ModelMessage Output | Notes |
|---|---|---|
| `text` | Concatenated into single `content: string` | Multiple text parts joined with empty string |
| *(all others)* | **Dropped** | Only text parts extracted |

`providerMetadata` from text parts is merged into a single `providerOptions` on the system message.

### User Messages (`role: 'user'`)

| UIMessage Part Type | ModelMessage Output | Notes |
|---|---|---|
| `text` | `{ type: 'text', text, providerOptions? }` | Direct mapping |
| `file` | `{ type: 'file', mediaType, filename?, data: part.url, providerOptions? }` | `url` → `data` field |
| `data-*` | Passed to `convertDataPart()` callback | Returns `TextPart \| FilePart \| undefined`; dropped if no callback or returns undefined |
| `reasoning` | **Dropped** | Not collected into user content |
| `tool-*` | **Dropped** | Not collected into user content |
| `step-start` | **Dropped** | Not collected into user content |
| `source-url` | **Dropped** | Not collected into user content |
| `source-document` | **Dropped** | Not collected into user content |

### Assistant Messages (`role: 'assistant'`)

Parts are accumulated into **blocks** delimited by `step-start` parts. Each block produces one `{role: 'assistant'}` message and optionally one `{role: 'tool'}` message.

| UIMessage Part Type | Collected into Block? | ModelMessage Output (in assistant content) | Notes |
|---|---|---|---|
| `text` | Yes | `{ type: 'text', text, providerOptions? }` | Direct mapping |
| `reasoning` | Yes | `{ type: 'reasoning', text, providerOptions }` | **Preserved** (providerOptions always set, even if undefined) |
| `file` | Yes | `{ type: 'file', mediaType, filename?, data: url }` | `url` → `data` field |
| `tool-*` (ToolUIPart) | Yes | Complex — see Tool Part Handling below | Produces both assistant and tool message content |
| `data-*` | Yes | Passed to `convertDataPart()` callback | Dropped if no callback or returns undefined |
| `step-start` | **No** — triggers block flush | *(none directly)* | Flushes accumulated block, starts new block |
| `source-url` | **No** — silently dropped | *(none)* | Not matched by any type guard |
| `source-document` | **No** — silently dropped | *(none)* | Not matched by any type guard |

---

## Tool Part Handling (Detail)

Tool parts undergo the most complex transformation. A single `ToolUIPart` in the UI can produce content in **both** the assistant message and a following tool message.

### In the Assistant Content

| Tool Part State | Output in Assistant Content |
|---|---|
| `input-streaming` | **Skipped entirely** |
| `input-available` | Skipped (if `ignoreIncompleteToolCalls: true`) |
| All other states | `{ type: 'tool-call', toolCallId, toolName, input, providerExecuted?, providerOptions? }` |

Additionally, if the tool part has `approval`:
- Adds `{ type: 'tool-approval-request', approvalId, toolCallId }` after the tool-call

For **provider-executed** tools (`providerExecuted === true`) in `output-available` or `output-error` state (but NOT `approval-responded`):
- Also adds `{ type: 'tool-result', toolCallId, toolName, output }` directly in assistant content
- The output is produced via `createToolModelOutput()` with the tool's `toModelOutput` if available

### In the Tool Message

After processing a block, a separate `{role: 'tool'}` message is created for tools that are:
- NOT provider-executed, OR
- Have an approval response (`approval.approved != null`)

| Tool Part State | Tool Message Content |
|---|---|
| `output-denied` | `{ type: 'tool-result', toolCallId, toolName, output: { type: 'error-text', value: reason } }` |
| `output-error` | `{ type: 'tool-result', toolCallId, toolName, output }` (via `createToolModelOutput` with `errorMode: 'text'`) |
| `output-available` | `{ type: 'tool-result', toolCallId, toolName, output }` (via `createToolModelOutput` with `errorMode: 'none'`) |
| `approval-responded` (with `approval.approved != null`) | `{ type: 'tool-approval-response', approvalId, approved, reason?, providerExecuted? }` |

**Critical**: Provider-executed tool results are **only** in the assistant message. They are explicitly skipped when building the tool message (line 277: `if (toolPart.providerExecuted === true) continue`). This prevents orphaned `function_call_output` entries.

### `createToolModelOutput` Behavior

```typescript
// If errorMode is 'text' → { type: 'error-text', value: errorMessage }
// If errorMode is 'json' → { type: 'error-json', value: jsonValue }
// If tool has toModelOutput → awaits tool.toModelOutput({ toolCallId, input, output })
// If output is string → { type: 'text', value: output }
// Otherwise → { type: 'json', value: jsonValue }
```

---

## Role Handling

| UIMessage Role | ModelMessage Role(s) | One-to-Many? |
|---|---|---|
| `system` | `system` | 1:1 |
| `user` | `user` | 1:1 |
| `assistant` | `assistant` + `tool` (per step) | **1:N** — one pair per `step-start`-delimited block |

UIMessage has **no `tool` role** — only `system`, `user`, `assistant`. The `tool` ModelMessages are synthesized from tool parts within assistant UIMessages.

### Step-Start Block Splitting Example

Given a UIMessage with parts:
```
[text, tool-A, step-start, text, tool-B, step-start, text]
```

Produces:
```
{ role: 'assistant', content: [text, tool-call-A] }
{ role: 'tool', content: [tool-result-A] }
{ role: 'assistant', content: [text, tool-call-B] }
{ role: 'tool', content: [tool-result-B] }
{ role: 'assistant', content: [text] }
```

---

## Cross-Turn Tool Pairing

`convertToModelMessages` itself does **not** validate tool call/result pairing. It simply produces ModelMessages from the parts.

Pairing validation happens later in `convertToLanguageModelPrompt()`:
1. Tracks all non-provider-executed `tool-call` IDs from assistant messages
2. Removes IDs when matching `tool-result` is found in tool messages
3. Clears IDs for approved tool calls (from `tool-approval-response` parts)
4. Before each user/system message or at the end, throws `MissingToolResultsError` if unmatched tool calls remain

This means our sanitizer must ensure that if a tool-call exists in an assistant block, a corresponding tool-result must exist in the subsequent tool message — or the call must be removed entirely.

---

## Provider-Agnostic vs Provider-Specific Behavior

**`convertToModelMessages` is completely provider-agnostic.** It does not accept a provider parameter, does not inspect provider names, and produces the same `ModelMessage[]` regardless of the target provider.

All provider-specific transformations happen downstream in the pipeline.

---

## The Full Conversion Pipeline

```
UIMessage[] (client)
    │
    ▼
┌─────────────────────────────────────┐
│ sanitizeMessagesForProvider()       │ ← OUR CODE (app/api/chat/utils.ts)
│ Provider-aware pre-processing       │   Strips reasoning/tool parts for non-Anthropic
│ Still UIMessage[] format            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ convertToModelMessages()            │ ← AI SDK (ai/src/ui/convert-to-model-messages.ts)
│ UIMessage[] → ModelMessage[]        │   Provider-AGNOSTIC
│ Handles step-start splitting        │   Async (tool output processing)
│ Synthesizes tool messages           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ OUR POST-PROCESSING                 │ ← OUR CODE (app/api/chat/route.ts)
│ hasProviderLinkedResponseIds()      │   OpenAI replay hardening
│ toPlainTextModelMessages()          │   Fallback if provider IDs detected
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ streamText({ messages })            │ ← AI SDK (ai/src/generate-text/stream-text.ts)
│   ↓                                 │
│ standardizePrompt()                 │   Validates ModelMessage[] against Zod schema
│   ↓                                 │
│ convertToLanguageModelPrompt()      │   ModelMessage[] → LanguageModelV3Prompt
│   - Downloads URL assets if needed  │   Downloads images/files not supported by provider
│   - Validates tool call/result pair │   Throws MissingToolResultsError on orphans
│   - Combines consecutive tool msgs  │   Merges adjacent tool messages
│   - Filters empty tool messages     │   Removes tool msgs with only approval-response
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Provider SDK doStream()             │ ← Provider package (e.g. @ai-sdk/anthropic)
│                                     │
│ Anthropic:                          │
│   convertToAnthropicMessagesPrompt()│   Groups into user/assistant blocks
│   - thinking blocks from reasoning  │   Requires signature in providerMetadata
│   - server_tool_use for web_search  │   Provider-executed tools
│   - cache_control from providerOpts │   Anthropic-specific
│   - Trims trailing whitespace       │   On last assistant text
│                                     │
│ OpenAI:                             │
│   convertToOpenAIChatMessages()     │   Maps to OpenAI chat format
│   - system → system/developer role  │   Configurable via systemMessageMode
│   - file → image_url / input_audio  │   Based on mediaType
│   - tool-call → function_call       │   OpenAI function calling format
│   - tool-result → tool role message │
└─────────────────────────────────────┘
```

### Key Insight: Three-Layer Architecture

1. **UI Layer** (`UIMessage[]`) — Client-facing, rich part types (source-url, step-start, etc.)
2. **Model Layer** (`ModelMessage[]`) — Provider-agnostic intermediate, stripped of UI-only parts
3. **Provider Layer** (`LanguageModelV3Prompt` → API payload) — Provider-specific formatting

Our adapters should operate at **Layer 1** (before `convertToModelMessages`) or between **Layer 1 and 2** (post-sanitization, pre-conversion). Operating at Layer 2 is possible but requires manual construction of the paired assistant+tool message structure.

---

## Options / Configuration

| Option | Type | Default | Purpose |
|---|---|---|---|
| `tools` | `ToolSet` | `undefined` | Enables `toModelOutput()` on tools for multi-modal responses. Without this, tool outputs are serialized as text/JSON. |
| `ignoreIncompleteToolCalls` | `boolean` | `false` | When `true`, filters out tool parts with state `input-streaming` or `input-available` before conversion. |
| `convertDataPart` | `(part) => TextPart \| FilePart \| undefined` | `undefined` | Custom converter for `data-*` parts. By default, all data parts are silently dropped. |

---

## Gotchas and Edge Cases

### 1. Source parts are silently dropped
`source-url` and `source-document` parts are **never** included in ModelMessage output. They don't match any type guard in the assistant block accumulation loop and are simply not pushed to the block. This is intentional — sources are UI-only metadata.

### 2. Step-start produces message multiplication
A single UIMessage can produce **many** ModelMessages. An assistant message with 3 tool steps produces 6 ModelMessages (3 assistant + 3 tool). Our sanitizer must account for this when estimating message counts.

### 3. Provider-executed tool result placement
Provider-executed tool results go into the **assistant** message content, NOT the tool message. If we strip provider-executed tool-call parts during sanitization, we must also strip their results to avoid orphaned content.

### 4. The `id` field is stripped
The function signature uses `Omit<UI_MESSAGE, 'id'>`. Message IDs are UI-only and don't propagate. However, `providerMetadata` (which may contain provider-linked IDs like `msg_*`) **does** propagate as `providerOptions`.

### 5. `providerMetadata` → `providerOptions` rename
UI parts use `providerMetadata`; Model parts use `providerOptions`. Same data, different field names. This is where Anthropic thinking signatures and OpenAI response IDs flow through.

### 6. Empty text parts are NOT filtered
`convertToModelMessages` does not filter empty text parts. That happens later in `convertToLanguageModelMessage()` which filters `part.type === 'text' && part.text === ''` (unless providerOptions exists).

### 7. Async nature
The function is `async` because `createToolModelOutput()` may call `tool.toModelOutput()` which can be async. Our code must `await` the result.

### 8. Tool call input handling for error state
For `output-error` state, the input falls back to `rawInput` if `input` is undefined. This handles cases where input parsing failed.

### 9. ignoreIncompleteToolCalls timing
When `ignoreIncompleteToolCalls: true`, filtering happens **before** the main loop — it creates new message copies with filtered parts. This means the original messages are not mutated.

### 10. Consecutive tool message merging
`convertToLanguageModelPrompt()` merges consecutive `{role: 'tool'}` messages into a single message. This happens **after** convertToModelMessages, so our post-processing doesn't need to worry about it.

---

## Implications for Our Adapter Layer

### Where to sanitize: BEFORE `convertToModelMessages`

Our `sanitizeMessagesForProvider()` operates on `UIMessage[]` — this is correct. Reasons:

1. **Part-level granularity**: We can selectively keep/remove reasoning, tool parts, source-url etc. based on provider.
2. **Step-start awareness not needed**: We don't need to understand block splitting; `convertToModelMessages` handles that.
3. **ID sanitization**: We can strip/rewrite message IDs before they're discarded.
4. **Simpler logic**: UIMessage is a flat array of parts; ModelMessage has a complex nested structure with paired messages.

### When to use the post-conversion fallback

Our `toPlainTextModelMessages()` fallback (post-conversion) is correct for the OpenAI replay hardening case where provider-linked IDs leak through `providerOptions`. This can only be detected after conversion because `providerMetadata` propagation happens during conversion.

### What our adapter must guarantee

For `convertToModelMessages` to succeed without errors:
- Every assistant message must have at least one part (or will produce empty content)
- No `unsupported role` (only system/user/assistant)
- Parts must match expected type guards

For the downstream `convertToLanguageModelPrompt` to succeed:
- Every non-provider-executed tool-call in an assistant block must have a matching tool-result
- OR the tool-call must be removed entirely

### Recommended adapter placement

```
UIMessage[] from client
    │
    ├─ [1] sanitizeMessagesForProvider()  ← current location, KEEP HERE
    │       Remove provider-incompatible parts
    │       Strip reasoning for non-Anthropic
    │       Remove tool artifacts for non-Anthropic
    │
    ├─ [2] convertToModelMessages()       ← AI SDK, don't touch
    │
    ├─ [3] Post-conversion checks         ← current location, KEEP HERE
    │       hasProviderLinkedResponseIds()
    │       toPlainTextModelMessages() fallback
    │
    └─ [4] streamText() → provider SDK    ← AI SDK + provider, don't touch
```
