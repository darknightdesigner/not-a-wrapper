# Cross-Turn Tool Artifacts — Message Shape Analysis

> **Status**: Complete
> **Date**: February 13, 2026
> **Researcher**: AI Assistant
> **Scope**: How tool-call artifacts flow through storage, client state, and replay in the history adaptation pipeline
> **AI SDK Version**: `ai@6.0.78`
> **Related**: `provider-aware-history-adaptation.md` (parent), `openai-replay-invariants.md` (sibling)

---

## Files Examined

| File | Role in Tool Artifact Flow |
|------|---------------------------|
| `app/api/chat/route.ts` | `streamText()` with tools, `onFinish` audit logging (does NOT store messages) |
| `app/api/chat/utils.ts` | `sanitizeMessagesForProvider()` — strips tool/reasoning parts before replay |
| `app/components/chat/use-chat-core.ts` | Client-side `onFinish` — calls `cacheAndAddMessage()` to persist the assistant message |
| `lib/chat-store/messages/provider.tsx` | `cacheAndAddMessage()` — writes `message.parts` as-is to Convex |
| `convex/messages.ts` | `add` mutation — stores `parts: v.optional(v.any())` |
| `convex/schema.ts` | Message schema — `role` is `user|assistant|system|data`, no `tool` role |
| `app/components/chat/syncRecentMessages.ts` | ID reconciliation only — does not transform parts |
| `app/components/chat/tool-invocation.tsx` | Client rendering of `ToolUIPart` |
| `node_modules/ai/dist/index.mjs:7831-8058` | `convertToModelMessages()` source — how tool UIparts become ModelMessages |

---

## 1. Message Flow Diagram — Tool-Using Conversation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TURN N: User asks "Find Batman products on Amazon"                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Client (use-chat-core.ts)                                                  │
│    ├─ sendMessage({ text, body: { chatId, model, ... } })                   │
│    ├─ Creates optimistic user UIMessage with parts: [{ type: "text" }]      │
│    └─ cacheAndAddMessage(optimisticMessage) → Convex messages.add           │
│                                                                             │
│  Server (route.ts)                                                          │
│    ├─ sanitizeMessagesForProvider(messages, provider) [1]                    │
│    ├─ convertToModelMessages(sanitizedMessages) [2]                         │
│    ├─ streamText({ model, messages: modelMessages, tools: allTools })       │
│    │    ├─ Step 1: Model emits reasoning → tool_call(web_search)            │
│    │    │           SDK executes tool (or provider executes if built-in)     │
│    │    │           Tool result returned → model continues                   │
│    │    ├─ Step 2: Model emits reasoning → tool_call(web_search)            │
│    │    │           ...same cycle...                                         │
│    │    ├─ Step 3: Model emits reasoning → tool_call(web_search)            │
│    │    │           ...same cycle...                                         │
│    │    └─ Final step: Model emits text response                            │
│    │                                                                         │
│    ├─ onStepFinish: logs per-step tool traces (structured JSON)             │
│    ├─ onFinish: logs to PostHog + toolCallLog (does NOT store messages)     │
│    └─ toUIMessageStreamResponse() → streams parts to client [3]            │
│                                                                             │
│  Client (use-chat-core.ts)                                                  │
│    ├─ useChat receives streamed UIMessage with ALL parts from ALL steps     │
│    ├─ onFinish({ message }) — the SINGLE assistant UIMessage                │
│    ├─ cacheAndAddMessage(message) → Convex messages.add [4]                 │
│    └─ syncRecentMessages() — reconciles optimistic IDs only                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  TURN N+1: User asks "Why weren't links from Amazon?"                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Client loads messages from Convex (messages/provider.tsx)                  │
│    ├─ convexMessages.map(msg => { parts: msg.parts, role: msg.role })       │
│    └─ Sends ALL messages (including stored tool parts) to /api/chat         │
│                                                                             │
│  Server (route.ts)                                                          │
│    ├─ sanitizeMessagesForProvider(messages, provider)                        │
│    │   ├─ Anthropic: passes all parts through                               │
│    │   └─ Others: STRIPS tool-*, reasoning, step-start, source-url [5]      │
│    ├─ convertToModelMessages(sanitizedMessages) [6]                         │
│    └─ streamText({ messages: modelMessages })                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Legend:
[1] First touch: provider-specific part filtering
[2] AI SDK converts UIMessage[] → ModelMessage[] (handles step-start splitting)
[3] AI SDK converts streaming steps → single UIMessage with step-start delimiters
[4] Stored ONE assistant message per generation (all steps consolidated)
[5] Current sanitization is binary: keep-all (Anthropic) or strip-all (others)
[6] On replay, convertToModelMessages splits step-start blocks into
    separate assistant + tool ModelMessage pairs
```

---

## 2. UIMessage Part Types in AI SDK v6

### 2.1 Complete Part Type Union

```typescript
type UIMessagePart =
  | TextUIPart           // { type: "text", text: string, state?: "streaming"|"done" }
  | ReasoningUIPart      // { type: "reasoning", text: string, state?: "streaming"|"done" }
  | ToolUIPart<TOOLS>    // { type: `tool-${NAME}`, ...UIToolInvocation }
  | DynamicToolUIPart    // { type: "dynamic-tool", toolName: string, ...UIToolInvocation }
  | SourceUrlUIPart      // { type: "source-url", sourceId, url, title? }
  | SourceDocumentUIPart // { type: "source-document", ... }
  | FileUIPart           // { type: "file", mediaType, filename, url }
  | DataUIPart           // { type: `data-${NAME}`, data: ... }
  | StepStartUIPart      // { type: "step-start" }
```

### 2.2 Tool Invocation States

```typescript
type UIToolInvocation<TOOL> = {
  toolCallId: string
  title?: string
  providerExecuted?: boolean   // true for OpenAI web_search, Google code_execution
} & (
  | { state: "input-streaming", input: DeepPartial<...> | undefined }
  | { state: "input-available", input: TOOL["input"] }
  | { state: "approval-requested", input: ..., approval: { id: string } }
  | { state: "approval-responded", input: ..., approval: { id, approved, reason? } }
  | { state: "output-available", input: ..., output: TOOL["output"], preliminary?: boolean }
  | { state: "output-error", input: ..., errorText: string }
  | { state: "output-denied", input: ..., approval: { id, approved: false, reason? } }
)
```

### 2.3 The `providerExecuted` Flag — Critical for Replay

| `providerExecuted` | Meaning | Examples | Replay Impact |
|---------------------|---------|----------|---------------|
| `true` | Provider ran the tool server-side | OpenAI `web_search`, Google `code_execution` | `convertToModelMessages` puts tool-result in the **assistant** message content |
| `false` / `undefined` | AI SDK executed the tool client-side | MCP tools, Exa search, custom tools | `convertToModelMessages` puts tool-result in a separate **`role: "tool"`** ModelMessage |

---

## 3. Example `parts[]` Arrays for Each Message Shape

### 3.1 User Message (simple text)

```jsonc
// Stored in Convex: role="user"
{
  "role": "user",
  "parts": [
    { "type": "text", "text": "Find Batman products on Amazon" }
  ]
}
```

### 3.2 User Message (with file attachment)

```jsonc
// Stored in Convex: role="user"
{
  "role": "user",
  "parts": [
    { "type": "text", "text": "What's in this image?" },
    { "type": "file", "filename": "photo.png", "mediaType": "image/png", "url": "https://..." }
  ]
}
```

### 3.3 Assistant Message — Single Provider-Executed Tool Call (e.g., OpenAI web_search)

This is what GPT-5.2 produces for a single web search:

```jsonc
// Stored in Convex: role="assistant"
{
  "role": "assistant",
  "parts": [
    { "type": "step-start" },
    { "type": "reasoning", "text": "The user wants to find Batman products...", "state": "done" },
    {
      "type": "tool-web_search",
      "toolCallId": "ws_abc123",
      "state": "output-available",
      "providerExecuted": true,
      "input": { "query": "Batman products Amazon" },
      "output": {
        // OpenAI web_search output — provider-specific structure
        "content": [{ "type": "text", "text": "..." }]
      },
      "callProviderMetadata": {
        "openai": { /* ... response item metadata ... */ }
      }
    },
    { "type": "step-start" },
    { "type": "text", "text": "I found several Batman products on Amazon...", "state": "done" },
    { "type": "source-url", "sourceId": "src_1", "url": "https://amazon.com/...", "title": "Batman Figure" }
  ]
}
```

**Key observations**:
- `step-start` parts delimit each step
- `providerExecuted: true` means OpenAI ran the search server-side
- Tool part has both `input` and `output` — it's in `output-available` state
- `callProviderMetadata` carries provider-specific response item linkage (the `msg_`/`rs_`/`ws_` IDs that cause replay issues)

### 3.4 Assistant Message — 3 Sequential Provider-Executed Tool Calls (Multi-Step)

What GPT-5.2 produces for 3 sequential `web_search` calls:

```jsonc
// Stored in Convex: role="assistant" — ONE message, ALL steps
{
  "role": "assistant",
  "parts": [
    // --- Step 1 ---
    { "type": "step-start" },
    { "type": "reasoning", "text": "Let me search for Batman products...", "state": "done" },
    {
      "type": "tool-web_search",
      "toolCallId": "ws_001",
      "state": "output-available",
      "providerExecuted": true,
      "input": { "query": "Batman products Amazon" },
      "output": { "content": [{ "type": "text", "text": "..." }] }
    },
    // --- Step 2 ---
    { "type": "step-start" },
    { "type": "reasoning", "text": "I need to refine the search...", "state": "done" },
    {
      "type": "tool-web_search",
      "toolCallId": "ws_002",
      "state": "output-available",
      "providerExecuted": true,
      "input": { "query": "Batman action figures Amazon best sellers" },
      "output": { "content": [{ "type": "text", "text": "..." }] }
    },
    // --- Step 3 ---
    { "type": "step-start" },
    { "type": "reasoning", "text": "Let me check prices...", "state": "done" },
    {
      "type": "tool-web_search",
      "toolCallId": "ws_003",
      "state": "output-available",
      "providerExecuted": true,
      "input": { "query": "Batman collectibles Amazon under $50" },
      "output": { "content": [{ "type": "text", "text": "..." }] }
    },
    // --- Final step (text response) ---
    { "type": "step-start" },
    { "type": "text", "text": "Here are the best Batman products on Amazon...", "state": "done" },
    { "type": "source-url", "sourceId": "src_1", "url": "https://...", "title": "..." },
    { "type": "source-url", "sourceId": "src_2", "url": "https://...", "title": "..." }
  ]
}
```

**Critical**: This is **one message** in Convex with **one `_id`** and **one `_creationTime`**. All 3 tool calls are in the same `parts` array, separated by `step-start` delimiters.

### 3.5 Assistant Message — SDK-Executed Tool Calls (MCP / Exa)

When the AI SDK runs tools (not provider-executed):

```jsonc
// Stored in Convex: role="assistant" — ONE message
{
  "role": "assistant",
  "parts": [
    // --- Step 1 ---
    { "type": "step-start" },
    {
      "type": "tool-exa_search",
      "toolCallId": "call_abc",
      "state": "output-available",
      "providerExecuted": false,   // SDK executed, not provider
      "input": { "query": "Batman products", "numResults": 5 },
      "output": {
        "ok": true,
        "data": [{ "url": "...", "title": "...", "snippet": "..." }],
        "meta": { "durationMs": 342 }
      }
    },
    // --- Step 2 (text response) ---
    { "type": "step-start" },
    { "type": "text", "text": "Based on the search results...", "state": "done" }
  ]
}
```

**Key difference from provider-executed**: No `reasoning` parts (unless the model also reasons), and `providerExecuted` is `false`/absent.

### 3.6 Assistant Message — Mixed Provider + SDK Tools (Same Response)

When search tools are provider-executed but MCP tools are SDK-executed:

```jsonc
// Stored in Convex: role="assistant" — ONE message
{
  "role": "assistant",
  "parts": [
    // --- Step 1: Provider-executed search ---
    { "type": "step-start" },
    { "type": "reasoning", "text": "..." },
    {
      "type": "tool-web_search",
      "toolCallId": "ws_001",
      "state": "output-available",
      "providerExecuted": true,
      "input": { "query": "..." },
      "output": { "content": [...] }
    },
    // --- Step 2: SDK-executed MCP tool ---
    { "type": "step-start" },
    {
      "type": "tool-my_github_create_issue",   // dynamic: "dynamic-tool" or "tool-{name}"
      "toolCallId": "call_xyz",
      "state": "output-available",
      "providerExecuted": false,
      "input": { "title": "...", "body": "..." },
      "output": { "ok": true, "data": { "number": 42 } }
    },
    // --- Step 3: Final text ---
    { "type": "step-start" },
    { "type": "text", "text": "I've searched and created the issue...", "state": "done" }
  ]
}
```

### 3.7 No Separate `role: "tool"` Messages in Storage

**Our Convex schema does NOT store `role: "tool"` messages.** The schema allows:

```typescript
role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system"), v.literal("data"))
```

All tool artifacts live inside the assistant message's `parts` array. The `role: "tool"` ModelMessages are **synthesized at conversion time** by `convertToModelMessages()`.

---

## 4. How `convertToModelMessages()` Reconstructs Tool Messages

When the stored parts array is replayed, the AI SDK's `convertToModelMessages()` (source: `ai/dist/index.mjs:7831-8058`) applies this algorithm:

### 4.1 Step-Start Block Splitting

```
Input: One assistant UIMessage with parts = [step-start, reasoning, tool, step-start, text]

Processing:
  block = []
  
  part: step-start  → processBlock() (empty, no-op) → block = []
  part: reasoning    → block = [reasoning]
  part: tool         → block = [reasoning, tool]
  part: step-start  → processBlock() → emit assistant + tool messages → block = []
  part: text         → block = [text]
  (end of parts)    → processBlock() → emit assistant message
  
Output: Three ModelMessages:
  1. { role: "assistant", content: [reasoning, tool-call] }
  2. { role: "tool", content: [tool-result] }           // Only for non-providerExecuted
  3. { role: "assistant", content: [text] }
```

### 4.2 Provider-Executed vs SDK-Executed Tool Results

| Tool Type | `providerExecuted` | Assistant Message Contains | Separate `role: "tool"` Message? |
|-----------|-------------------|---------------------------|----------------------------------|
| OpenAI `web_search` | `true` | `tool-call` + `tool-result` | **No** |
| Google `code_execution` | `true` | `tool-call` + `tool-result` | **No** |
| MCP tools | `false`/absent | `tool-call` only | **Yes** — contains `tool-result` |
| Exa search | `false`/absent | `tool-call` only | **Yes** — contains `tool-result` |

### 4.3 Resulting ModelMessage Sequence for 3 Sequential web_search Calls

```
Stored:  1 assistant UIMessage with 4 step-start blocks

convertToModelMessages() output:

  ModelMessage 1: { role: "assistant", content: [reasoning, tool-call(ws_001), tool-result(ws_001)] }
                                                  ^^^^^^^^ providerExecuted=true → result inlined
  ModelMessage 2: { role: "assistant", content: [reasoning, tool-call(ws_002), tool-result(ws_002)] }
  ModelMessage 3: { role: "assistant", content: [reasoning, tool-call(ws_003), tool-result(ws_003)] }
  ModelMessage 4: { role: "assistant", content: [text("Here are the results...")] }
```

**Observation**: One stored UIMessage becomes **four ModelMessages**. This is where the replay shape complexity comes from — the provider's API must accept this sequence.

### 4.4 Resulting ModelMessage Sequence for SDK-Executed Tools

```
Stored:  1 assistant UIMessage with 2 step-start blocks (1 tool + 1 text)

convertToModelMessages() output:

  ModelMessage 1: { role: "assistant", content: [tool-call(call_abc)] }
  ModelMessage 2: { role: "tool", content: [tool-result(call_abc)] }
  ModelMessage 3: { role: "assistant", content: [text("Based on the results...")] }
```

**Observation**: SDK-executed tools produce **assistant → tool → assistant** message triples.

---

## 5. Edge Cases Discovered

### 5.1 Failed Tool Calls (`output-error`)

**What happens**: When a tool call fails, the part has `state: "output-error"` with `errorText: string` and no `output`.

```jsonc
{
  "type": "tool-exa_search",
  "toolCallId": "call_fail",
  "state": "output-error",
  "providerExecuted": false,
  "input": { "query": "..." },
  "errorText": "Exa API rate limit exceeded"
}
```

**On replay**: `convertToModelMessages()` (line 7927) handles this:
- Generates a `tool-call` with `input` (falls back to `rawInput` if `input` is undefined)
- Generates a `tool-result` with the `errorText` as output and `errorMode: "text"` (for tool messages) or `"json"` (for provider-executed inline results)

**Adapter implication**: Error tool parts MUST be handled the same as successful ones for pairing purposes. An adapter cannot drop a failed tool-call without also dropping its error result — the pair must stay together or be dropped together.

### 5.2 Interrupted Streams (Abort/Disconnect)

**What happens**: In `use-chat-core.ts:124-129`:

```typescript
onFinish: async ({ message, isAbort, isDisconnect, isError }) => {
  if (isAbort || isDisconnect || isError) return
  // ... only persists on clean finish
}
```

**Impact**: If the user aborts mid-tool-chain or the connection drops:
- **Nothing is persisted to Convex** — the message is silently dropped
- The `useChat` hook's local state may contain incomplete parts with `state: "input-streaming"` or `state: "input-available"`
- On next page load, only the previously-stored messages are loaded from Convex
- **No partial tool state leaks into storage**

**Edge case within this edge case**: If the stream completes enough for `onFinish` to fire with `isAbort: false` but some tool parts are still incomplete, those incomplete parts WOULD be persisted. However, AI SDK v6 waits for all steps to complete before calling `onFinish`, so this scenario is unlikely under normal operation.

### 5.3 Messages with Mixed Tool Parts from Different Steps

**Yes, this happens.** A single assistant UIMessage can contain:
- Provider-executed tools (`providerExecuted: true`) from steps 1-3
- SDK-executed tools (`providerExecuted: false`) from step 4
- Text from the final step

All in the same `parts` array, delimited by `step-start` markers.

**On replay**: `convertToModelMessages()` handles this correctly because it processes block-by-block. Each block's tool parts are checked independently for `providerExecuted`. Mixed blocks produce the appropriate message types.

**Adapter implication**: An adapter processing the UIMessage `parts` array will encounter interleaved `providerExecuted: true` and `false` tool parts. The adapter must understand that `step-start` is the block delimiter and that tool result location depends on `providerExecuted`.

### 5.4 `callProviderMetadata` Carries Replay-Breaking IDs

Provider-executed tool parts carry `callProviderMetadata` which may contain provider-specific identifiers:

```jsonc
{
  "type": "tool-web_search",
  "callProviderMetadata": {
    "openai": {
      "id": "ws_abc123",            // ws_ prefix = web_search response item
      "type": "web_search_call",
      // ... other OpenAI-specific fields
    }
  }
}
```

These are passed through to `convertToModelMessages()` as `providerOptions` on the `tool-call` content part. If the resulting ModelMessage is sent to a different provider, or even to the same provider without proper pairing, these IDs can trigger validation errors.

**This is the root cause** of the production bug: `callProviderMetadata` with `ws_`/`rs_`/`msg_` IDs flows through to ModelMessages and triggers OpenAI's pairing invariant checks.

### 5.5 Empty Parts After Sanitization

When `sanitizeMessagesForProvider()` strips all tool and reasoning parts from an assistant message, the message may have zero remaining parts. The current code handles this:

```typescript
// utils.ts:111-113
parts: filteredParts.length
  ? filteredParts
  : [{ type: "text" as const, text: "" }],
```

An empty-text fallback is injected. This means the provider receives an assistant message with `content: ""`, which all providers accept but which loses all tool context.

### 5.6 No `role: "tool"` Messages in Convex — But `sanitizeMessagesForProvider` Filters Them

The schema doesn't support `role: "tool"`, and `cacheAndAddMessage` only stores `user|assistant|system`. However, `sanitizeMessagesForProvider()` (line 85) still filters out `role: "tool"` messages:

```typescript
.filter((message) => (message as { role: string }).role !== "tool")
```

This is defensive — the AI SDK's `useChat` hook might inject synthetic `role: "tool"` messages into its local state during streaming (before `onFinish`), and those could theoretically be sent in the `messages` array of the next request.

### 5.7 `step-start` Parts Are Never Stored with Meaningful Data

`StepStartUIPart` is simply `{ type: "step-start" }` with no payload. Its only purpose is as a block delimiter for `convertToModelMessages()`. When stored to Convex, it takes up schema space but carries no user-visible information.

### 5.8 Parallel Tool Calls in a Single Step

Some models can make multiple tool calls in a single step (e.g., "search for X" and "search for Y" simultaneously). In this case, multiple tool parts appear between the same pair of `step-start` delimiters:

```jsonc
[
  { "type": "step-start" },
  { "type": "tool-web_search", "toolCallId": "ws_001", ... },
  { "type": "tool-web_search", "toolCallId": "ws_002", ... },
  { "type": "step-start" },
  { "type": "text", "text": "..." }
]
```

`convertToModelMessages()` processes the entire block at once, emitting one assistant message with multiple `tool-call` entries and (for non-provider-executed tools) one `role: "tool"` message with multiple `tool-result` entries.

---

## 6. Implications for Adapter Design

### 6.1 Shapes Adapters Must Handle

Every `ProviderHistoryAdapter.adaptMessages()` implementation must handle these UIMessage shapes in the input:

| # | Shape | Frequency | Example |
|---|-------|-----------|---------|
| 1 | Text-only assistant message | Very common | Simple responses without tool use |
| 2 | Assistant with reasoning + text (no tools) | Common | Thinking models without search enabled |
| 3 | Assistant with provider-executed tool parts (`providerExecuted: true`) | Common | OpenAI web_search, Google code_execution |
| 4 | Assistant with SDK-executed tool parts (`providerExecuted: false`) | Common | MCP tools, Exa search |
| 5 | Assistant with mixed provider + SDK tool parts | Rare | Search + MCP in same response |
| 6 | Assistant with failed tool parts (`state: "output-error"`) | Rare | Tool timeout, API errors |
| 7 | Assistant with `step-start` delimiters between tool groups | Always (when tools used) | Multi-step tool chains |
| 8 | Assistant with `source-url` parts | Common | Web search results with citations |
| 9 | Assistant with `callProviderMetadata` on tool parts | Common | OpenAI response item IDs |
| 10 | Assistant with empty text after all parts stripped | Edge case | Fallback from current sanitization |

### 6.2 Decision Matrix: What to Do with Each Part Type

| Part Type | Keep (Full) | Keep (Text Summary) | Drop | Notes |
|-----------|:-----------:|:-------------------:|:----:|-------|
| `text` | Always | — | — | Universal |
| `reasoning` | Anthropic | — | Others* | *OpenAI: must drop with paired tool or keep both |
| `step-start` | Anthropic | — | Others | Block delimiter; only meaningful during conversion |
| `tool-*` (provider-exec) | Anthropic | OpenAI** | Others | **OpenAI: keep full pair or drop full pair |
| `tool-*` (SDK-exec) | Anthropic | Possible | Others | Could summarize as text |
| `source-url` | All | — | — | Citations are user-visible |
| `source-document` | All | — | — | Document citations |
| `file` | All | — | — | User-visible content |

### 6.3 The Pairing Invariant Problem

The core challenge for adapters is that parts have **implicit pairing relationships**:

```
reasoning ─────── paired-with ──────→ tool-call
                                         │
                                    paired-with
                                         │
                                         ↓
                                    tool-result
```

For OpenAI specifically: `reasoning` → `tool-call` → `tool-result` is an **atomic triple**. You cannot:
- Keep `tool-call` without preceding `reasoning`
- Keep `reasoning` without following `tool-call`
- Keep `tool-call` without `tool-result`

**Adapter strategy**: Process parts within each `step-start` block. For each block:
1. Identify reasoning parts and tool parts
2. Check if all required pairs are complete
3. Either keep the entire block or drop the entire block
4. Never produce a partial block

### 6.4 The `providerExecuted` Flag Changes ModelMessage Shape

Adapters operate on UIMessage `parts` (before `convertToModelMessages`), but they must understand the downstream impact:

- **Provider-executed** tool parts → `convertToModelMessages` inlines `tool-result` in the assistant content → no separate `role: "tool"` message → simpler replay shape
- **SDK-executed** tool parts → `convertToModelMessages` creates a separate `role: "tool"` message → requires proper assistant-tool-assistant message sequence

An adapter that drops tool parts must consider that it's affecting the ModelMessage count downstream.

### 6.5 The `callProviderMetadata` Poisoning Problem

When replaying OpenAI-generated tool parts to a different provider, `callProviderMetadata` carries OpenAI-specific response item IDs. `convertToModelMessages()` passes these through as `providerOptions` on `tool-call` content parts.

**Current mitigation** (`utils.ts:123-131`): `hasProviderLinkedResponseIds()` detects `msg_`/`rs_`/`ws_` patterns in serialized ModelMessages and falls back to plain-text when detected.

**Better adapter-level mitigation**: Strip `callProviderMetadata` when the target provider differs from the source provider. This preserves tool structure while removing provider-specific linkage.

### 6.6 Storage Implications — What Adapters Can Assume

1. **One assistant message per generation** — All tool steps consolidated
2. **Parts array is the source of truth** — `content` field is a text-only extract for backward compat
3. **`step-start` parts are always present** when tools were used
4. **Tool parts always have a final state** (`output-available` or `output-error`) — incomplete states are not persisted
5. **No `role: "tool"` messages exist in storage** — they're synthesized during conversion
6. **`parts` is `v.any()`** — no schema validation on part structure; adapters must handle malformed parts gracefully

---

## 7. Summary Table: Message Count Per Scenario

| Scenario | Messages Stored in Convex | ModelMessages After Conversion |
|----------|--------------------------|-------------------------------|
| Simple text response | 1 user + 1 assistant | 1 user + 1 assistant |
| 1 provider-executed search | 1 user + 1 assistant | 1 user + 2 assistant (tool step + text) |
| 3 provider-executed searches | 1 user + 1 assistant | 1 user + 4 assistant (3 tool steps + text) |
| 1 SDK-executed tool | 1 user + 1 assistant | 1 user + 1 assistant + 1 tool + 1 assistant |
| 3 SDK-executed tools | 1 user + 1 assistant | 1 user + 3×(assistant + tool) + 1 assistant = 8 |
| Mixed (1 provider + 1 SDK) | 1 user + 1 assistant | 1 user + 1 assistant + 1 assistant + 1 tool + 1 assistant = 5 |
| Failed tool + text | 1 user + 1 assistant | Same as success case (error is in tool-result) |

---

*This research informs the adapter design in the parent document. Each adapter must handle the shapes cataloged above and produce valid replay input for its target provider.*
