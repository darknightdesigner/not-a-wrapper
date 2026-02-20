---
name: streaming-ui-lifecycle
description: Understand the full streaming data flow from API route through useChat to message components, including transport memoization, mutable parts, React.memo bypass, status-based rendering, and onFinish persistence. Use when building new chat UI components, fixing rendering bugs during streaming, modifying message persistence logic, working on the transport layer, or creating a new chat surface.
---

# Streaming UI Lifecycle

Use this skill when building or modifying any part of the chat streaming pipeline — from the server-side `streamText` call through transport, `useChat` state management, message persistence, and component rendering.

## Prerequisites

- [ ] You know whether this is server (route handler) or client (UI) work.
- [ ] You can reference `app/api/chat/route.ts` (server), `app/components/chat/use-chat-core.ts` (client).
- [ ] You understand the mutable parts gotcha from `.agents/skills/ai-sdk-v6/SKILL.md`.

## Quick Reference

| Area | File | Key Export |
|------|------|-----------|
| Transport creation | `app/components/chat/use-chat-core.ts` | `useMemo(() => new DefaultChatTransport(...))` |
| Multi-chat transport | `app/components/multi-chat/use-multi-chat.ts` | Module-level `transports[]` array |
| Project transport | `app/p/[projectId]/project-view.tsx` | `useMemo(() => new DefaultChatTransport(...))` |
| useChat hook | `app/components/chat/use-chat-core.ts` | `useChat({ transport, onFinish, onError })` |
| Message persistence | `lib/chat-store/messages/provider.tsx` | `cacheAndAddMessage()` |
| ID reconciliation | `app/components/chat/syncRecentMessages.ts` | `syncRecentMessages()` |
| Status rendering | `app/components/chat/message.tsx` | `areMessagesEqual()` comparator |
| Parts rendering | `app/components/chat/message-assistant.tsx` | `MessageAssistant` |
| Server stream | `app/api/chat/route.ts` | `streamText()` → `toUIMessageStreamResponse()` |

## End-to-End Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Input                                                   │
│    executeSend() (use-chat-core.ts:274-407)                     │
│    ├─ Creates optimistic user message                           │
│    ├─ Adds to UI immediately                                    │
│    └─ Calls sendMessage({ text, files }, { body: {...} })       │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Transport Layer                                              │
│    DefaultChatTransport                                         │
│    ├─ POST /api/chat                                            │
│    └─ Sends: { messages, chatId, userId, model, enableSearch }  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Server Processing (route.ts:146-1171)                        │
│    ├─ Auth validation + rate limiting                           │
│    ├─ Tool loading (4 layers)                                   │
│    ├─ History adaptation for provider                           │
│    ├─ convertToModelMessages()                                  │
│    └─ streamText({ model, system, messages, tools, ... })       │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Stream Response                                              │
│    toUIMessageStreamResponse({                                  │
│      sendReasoning: true,                                       │
│      sendSources: true,                                         │
│      onError: (error) => extractErrorMessage(error)             │
│    })                                                           │
│    → SSE with x-vercel-ai-ui-message-stream: v1 header         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Client State (useChat)                                       │
│    ├─ Receives SSE stream                                       │
│    ├─ Updates messages[] incrementally (mutable parts!)         │
│    ├─ Status transitions: ready → submitted → streaming → ready │
│    └─ Calls onFinish when stream completes                      │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Persistence Pipeline (onFinish)                              │
│    ├─ cacheAndAddMessage(message, chatId)                       │
│    │   ├─ Optimistic update (add to pending messages)           │
│    │   ├─ IndexedDB local cache write                           │
│    │   └─ Convex persistence (authenticated users only)         │
│    └─ syncRecentMessages(chatId, setMessages, 2)                │
│        ├─ Fetches last 2 messages from DB                       │
│        ├─ Reconciles optimistic IDs with DB IDs                 │
│        └─ Updates IndexedDB with reconciled IDs                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Component Rendering                                          │
│    ├─ conversation.tsx: Maps messages[], passes status          │
│    ├─ message.tsx: React.memo with areMessagesEqual()           │
│    │   └─ Bypasses comparison for streaming last message        │
│    └─ message-assistant.tsx: Renders parts                      │
│        ├─ useReasoningPhase → Reasoning component               │
│        ├─ useLoadingState → Loading indicators                  │
│        ├─ Tool invocations → ToolProgress                       │
│        └─ Text content → Markdown                               │
└─────────────────────────────────────────────────────────────────┘
```

## Transport Memoization Rules

Transport instances MUST be stable across renders. Creating `DefaultChatTransport` in the render body causes silent SSE reconnections on every render.

| Pattern | Location | When to Use |
|---------|----------|-------------|
| `useMemo` | `use-chat-core.ts`, `project-view.tsx` | Single-chat surfaces inside hooks |
| Module-level array | `use-multi-chat.ts` | Multi-chat comparison (fixed N instances) |

```typescript
// CORRECT: useMemo with empty deps
const transport = useMemo(
  () => new DefaultChatTransport({ api: API_ROUTE_CHAT }),
  []
)

// CORRECT: Module-level (pre-allocated for multi-chat)
const transports = Array.from(
  { length: MAX_MODELS },
  () => new DefaultChatTransport({ api: "/api/chat" })
)

// WRONG: Render body — causes reconnections every render
function MyChat() {
  const transport = new DefaultChatTransport({ api: "/api/chat" }) // BUG
  const { messages } = useChat({ transport })
}
```

## Status Lifecycle

```
ready → submitted → streaming → ready
                               → error
                               → stopped (via stop())
```

| Status | Meaning | UI Guards |
|--------|---------|-----------|
| `ready` | Idle, no active request | Input enabled, send button visible |
| `submitted` | Request sent, waiting for first token | Show "Generating..." indicator, disable input |
| `streaming` | Tokens arriving | Show stop button, disable input, animate caret |
| `error` | Stream failed | Show error state, re-enable input |

Key status checks across the codebase:

```typescript
// Disable editing during generation
if (status === "submitted" || status === "streaming") return // use-chat-edit.ts

// Show stop button
onStop={isLast && status === "streaming" ? onStop : undefined} // conversation.tsx

// Input state
isStreaming: status === "streaming"  // chat-input.tsx
isAbortable: status === "streaming"  // chat-input.tsx

// Streaming caret
const showActiveContentCaret = Boolean(isLast && status === "streaming" && hasContent)
```

## Mutable Parts and React.memo

The AI SDK mutates part objects in-place during streaming. The first `pushMessage` leaks the SDK's mutable working object into React state. This means `prev.parts[N].text === next.parts[N].text` is always `true` during streaming (same object reference).

The codebase uses a comparator bypass in `message.tsx`:

```typescript
function areMessagesEqual(prev: Props, next: Props): boolean {
  // CRITICAL: Bypass comparison entirely for the streaming last message
  if (next.status === "streaming" && next.isLast) return false

  // Safe to compare after terminal status
  // ... content comparisons ...
}
```

**Rules:**
- [ ] Never rely on deep content equality for parts during `streaming` status
- [ ] Always bypass React.memo for the actively streaming message
- [ ] Only compare parts content after terminal status (`ready`, `error`, `stopped`)

## onFinish Persistence Pipeline

When the stream completes, `onFinish` triggers a 3-stage persistence pipeline:

```typescript
// use-chat-core.ts (simplified)
onFinish: async (message) => {
  // 1. Skip aborted/errored
  if (finishReason === "aborted" || finishReason === "error") return

  // 2. Cache + persist
  await cacheAndAddMessage(message, effectiveChatId)
  //    ├─ Optimistic update (adds to pending messages in provider)
  //    ├─ IndexedDB cache write (offline support)
  //    └─ Convex mutation (authenticated users: server persistence)

  // 3. ID reconciliation
  await syncRecentMessages(effectiveChatId, setMessages, 2)
  //    ├─ Fetches last 2 messages from Convex
  //    ├─ Pairs optimistic IDs with DB-assigned IDs by role match
  //    └─ Updates IndexedDB with reconciled IDs
}
```

**Why ID reconciliation matters:** The client generates optimistic message IDs before the server assigns Convex IDs. `syncRecentMessages` pairs them by matching roles and recency, then updates local storage so subsequent loads don't show duplicates.

## sendMessage Body Params

Client context reaches the server through `sendMessage` options.body:

```typescript
// use-chat-core.ts: executeSend()
sendMessage(
  { text, files },
  {
    body: {
      chatId: currentChatId,
      userId: uid,
      model: selectedModel,
      isAuthenticated,
      systemPrompt: SYSTEM_PROMPT_DEFAULT,
      enableSearch,
      ...bodyExtras  // custom system prompt, etc.
    }
  }
)
```

The server extracts these from the request body:

```typescript
// route.ts
const { messages, chatId, model, systemPrompt, enableSearch, userId } = await req.json()
```

## Step-by-Step: Creating a New Chat Surface

1) **Create transport**
- [ ] Use `useMemo` with empty deps for single-chat, or module-level for multi-chat.
- [ ] Point `api` to `/api/chat` (or a custom endpoint).

2) **Configure useChat**
- [ ] Pass `transport`, `messages` (initial state), `id` (unique chat identifier).
- [ ] Wire `onFinish` to your persistence logic (use `cacheAndAddMessage` + `syncRecentMessages` for standard chats).
- [ ] Wire `onError` for error handling.

3) **Wire sendMessage body**
- [ ] Include at minimum: `chatId`, `userId`, `model`, `isAuthenticated`.
- [ ] Add `enableSearch`, `systemPrompt`, and any custom params.

4) **Render messages**
- [ ] Map `messages` array, pass `status` and `isLast` to each message component.
- [ ] Use `areMessagesEqual`-style comparator if wrapping in React.memo.
- [ ] Bypass memo comparison for the streaming last message.

5) **Add status-based UI**
- [ ] Show "Generating..." when `status === "submitted"`.
- [ ] Show stop button when `status === "streaming"`.
- [ ] Disable input when `status !== "ready"`.

## Multi-Chat Comparison Pattern

The multi-chat surface uses a fixed-hook pattern — 10 `useChat` instances are always called, regardless of how many models are active. This is required because React hooks cannot be conditionally called.

```typescript
// use-multi-chat.ts
const MAX_MODELS = 10
const transports = Array.from(
  { length: MAX_MODELS },
  () => new DefaultChatTransport({ api: "/api/chat" })
)

// Inside the hook: ALL 10 are always called
const chat0 = useChat({ transport: transports[0], ... })
const chat1 = useChat({ transport: transports[1], ... })
// ... through chat9

// Only the active ones are exposed based on selectedModels.length
```

**Never attempt conditional hooks:** `if (i < selectedModels.length) useChat(...)` violates React's rules of hooks and will produce cryptic state corruption.

## Gotchas

1. **DefaultChatTransport in render body** — Causes silent reconnections. Always memoize.
2. **onFinish closure stale state** — `chatId` may change between request start and stream completion. Use `overrideChatId` pattern in `cacheAndAddMessage`.
3. **syncRecentMessages race** — If two streams finish simultaneously, ID reconciliation can conflict. The `2`-message window minimizes this.
4. **120s generation timeout** — `use-chat-core.ts` has a safety timeout that calls `stop()` if streaming doesn't complete in 120 seconds.
5. **`sendReasoning: true`** — Must be explicitly set in `toUIMessageStreamResponse` for reasoning parts to appear. Defaults to `true` in SDK, but the codebase sets it explicitly.
6. **`sendSources: true`** — Defaults to `false` in the SDK; must opt in for source citations to stream.
7. **Status doesn't mean "tokens received"** — `submitted` means the request was sent; `streaming` means at least one chunk arrived. There can be a gap between the two.

## Do / Don't

**Do**
- Memoize transport instances (useMemo or module-level)
- Check `status` before allowing user interactions (edit, send, stop)
- Use `onFinish` for persistence — never persist during streaming
- Pass `isLast` and `status` to message components for streaming-aware rendering
- Use `areMessagesEqual` pattern for React.memo comparators

**Don't**
- Create `DefaultChatTransport` in the render body
- Rely on deep equality for message parts during streaming
- Call `sendMessage` when `status !== "ready"` without explicit stop/abort
- Persist messages during streaming (partial data, mutable objects)
- Use conditional `useChat` hooks in multi-chat surfaces

## Internal References

- Transport + useChat: `app/components/chat/use-chat-core.ts`
- Multi-chat: `app/components/multi-chat/use-multi-chat.ts`
- Project chat: `app/p/[projectId]/project-view.tsx`
- Message persistence: `lib/chat-store/messages/provider.tsx` (`cacheAndAddMessage`)
- ID reconciliation: `app/components/chat/syncRecentMessages.ts`
- Message component: `app/components/chat/message.tsx` (React.memo comparator)
- Assistant parts: `app/components/chat/message-assistant.tsx`
- Reasoning phase: `app/components/chat/use-reasoning-phase.ts`
- Loading state: `app/components/chat/use-loading-state.ts`
- Server route: `app/api/chat/route.ts`
- Mutable parts gotcha: `.agents/skills/ai-sdk-v6/SKILL.md`
