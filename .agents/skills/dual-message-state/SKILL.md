---
name: dual-message-state
description: Navigate the dual message state architecture (AI SDK display state vs MessagesProvider persistence state) and the initialMessages hydration bridge between them. Use when debugging duplicate messages, missing messages after refresh, message persistence bugs, editing message flows, or any work touching cacheAndAddMessage, setMessages, initialMessages, or onFinish in the chat pipeline.
---

# Dual Message State Architecture

Use this skill when modifying message persistence, the edit flow, or any code that calls `cacheAndAddMessage`, `setMessages`, or `sendMessage` — especially when these interact in the same synchronous block.

## Prerequisites

- [ ] Read `streaming-ui-lifecycle` skill for the end-to-end data flow.
- [ ] Know which `setMessages` you're working with (AI SDK vs MessagesProvider).

## The Two Message Arrays

Two independent message arrays coexist at runtime. Confusing them or mutating both in the same React batch is the root cause of most message duplication and data loss bugs.

```
┌──────────────────────────────────────────────────────────────┐
│ AI SDK messages (DISPLAY)                                     │
│ Source: useChat() in use-chat-core.ts                        │
│ Updated by: setMessages, sendMessage, stream chunks          │
│ Rendered by: Conversation → message components               │
│ Scope: in-memory React state, lost on refresh                │
└──────────────────────────────────────────────────────────────┘
        ▲                                     │
        │ hydration effect                    │ onFinish
        │ (initialMessages → setMessages)     │ (cacheAndAddMessage)
        │                                     ▼
┌──────────────────────────────────────────────────────────────┐
│ MessagesProvider messages (PERSISTENCE)                       │
│ Source: lib/chat-store/messages/provider.tsx                  │
│ Derived from: serverMessages (Convex) + optimisticMessages   │
│ Exposed as: useMessages().messages                           │
│ Aliased as: initialMessages in chat.tsx                      │
│ Scope: Convex server state + local optimistic overlay        │
└──────────────────────────────────────────────────────────────┘
```

## The Bridge: Hydration Effect

`use-chat-core.ts` has a `useEffect` that syncs provider → AI SDK on load:

```typescript
useEffect(() => {
  if (!chatId) return
  const isNewChat = hydratedChatIdRef.current !== chatId
  if (isNewChat) {
    hydratedChatIdRef.current = chatId
    setMessages(initialMessages) // full replace on navigation
    return
  }
  if (initialMessages.length > 0) {
    setMessages((prev) => (prev.length === 0 ? initialMessages : prev))
    //                      ^^^^^^^^^^^^^^^ GUARD: only when empty
  }
}, [chatId, initialMessages, setMessages])
```

**Critical invariant:** The `prev.length === 0` guard is the only thing preventing `initialMessages` from overwriting the AI SDK's active state. If `initialMessages` changes while the AI SDK messages are momentarily empty (e.g., during a truncation), the guard fails and stale/duplicate data floods in.

## cacheAndAddMessage Is Not Pure I/O

`cacheAndAddMessage` (in `provider.tsx`) does **three things**, and the first is a synchronous React state mutation:

```
cacheAndAddMessage(message, chatId)
  ├─ 1. updateOptimisticMessages(...)  ← SYNC React setState (changes initialMessages!)
  ├─ 2. await writeToIndexedDB(...)    ← async local write
  └─ 3. await addMessageMutation(...)  ← async Convex write
```

Step 1 changes `optimisticMessages` → recomputes provider `messages` → changes `initialMessages` in `chat.tsx` → can trigger the hydration effect.

When the Convex mutation from step 3 completes, the reactive query updates `serverMessages`. Now the provider has **both** the server version (Convex ID) and the optimistic version (optimistic ID) of the same logical message — different IDs, so deduplication doesn't catch it. This is normally harmless because the hydration guard blocks it from reaching the display. But it becomes a bug if the guard fails.

## The Dangerous Pattern

Calling `cacheAndAddMessage` in the same synchronous block as `setMessages`/`sendMessage`:

```typescript
// DANGEROUS — can cause duplicates
setMessages(trimmedMessages)     // may set AI SDK to []
sendMessage(...)                 // AI SDK adds user message
cacheAndAddMessage(msg, chatId)  // mutates provider state → changes initialMessages
```

The provider state mutation from `cacheAndAddMessage` is batched with the `setMessages`/`sendMessage` state updates. Depending on the AI SDK's internal state management and React's commit ordering, `initialMessages` may change at a moment when the AI SDK's state is transitional, causing the hydration effect to inject stale or duplicate data.

## Stale Closure Overwrite (Sequential Awaits)

Separate from the batching hazard above, calling `cacheAndAddMessage` **twice in the same async chain** (e.g., in `onFinish` for the user message then the assistant message) causes the second write to overwrite the first in IndexedDB — because both calls share the same stale closure-captured `serverMessages` and `optimisticMessages`.

This is the root cause of the "second edit fails" bug. See the **`stale-closure-persistence`** skill for the full diagnosis, fix pattern, and prevention rules.

**Quick summary of the fix:** `cacheAndAddMessage` now reads from IndexedDB (`getCachedMessages`) before writing, instead of building from closure-captured React state. It also ensures `createdAt` is set on every message before caching (AI SDK v6 `UIMessage` omits it).

## The Safe Patterns

### Pattern 1: Persist in onFinish (edit flow)

For flows that truncate messages before sending (edit, regenerate), defer persistence to `onFinish` via a ref:

```typescript
// In the hook that owns onFinish:
const pendingEditUserMsgRef = useRef<{ message: UIMessage; chatId: string } | null>(null)

// In submitEdit: just store in ref (no state mutation)
pendingEditUserMsgRef.current = { message: optimisticEditedMessage, chatId }

// In onFinish: persist after stream completes
const pending = pendingEditUserMsgRef.current
if (pending) {
  pendingEditUserMsgRef.current = null
  await cacheAndAddMessage(pending.message, pending.chatId)
}
await cacheAndAddMessage(assistantMessage, effectiveChatId)
await syncRecentMessages(effectiveChatId, setMessages, 2)
```

**Why this is safe:** By the time `onFinish` fires, the stream is complete, the AI SDK has its final messages (`prev.length > 0`), and the hydration guard reliably blocks any `initialMessages` changes from overwriting the display.

### Pattern 2: Fire-and-forget after sendMessage (normal send flow)

For append-only flows (no truncation), calling `cacheAndAddMessage` after `sendMessage` is acceptable because the AI SDK messages are never empty:

```typescript
// executeSend (use-chat-core.ts) — works because no truncation
sendMessage(...)
removeOptimistic()
cacheAndAddMessage(optimisticMessage, currentChatId) // safe: prev.length > 0
```

## Diagnostic Checklist

When debugging message duplication or data loss:

- [ ] **Which `setMessages`?** The AI SDK's (from `useChat`) or the provider's (from `useMessages`)? They're different functions with different effects.
- [ ] **Is `cacheAndAddMessage` called in the same sync block as `sendMessage`/`setMessages`?** If yes and there's a truncation (`setMessages([])` or `setMessages(trimmed)`), this is likely the bug. Defer to `onFinish`.
- [ ] **Check the provider's `messages` for duplicates.** After `cacheAndAddMessage` + Convex mutation, `serverMessages` and `optimisticMessages` may both contain the same logical message with different IDs. This is expected and normally harmless.
- [ ] **Is there a moment when AI SDK messages are `[]`?** If yes, the hydration effect will inject `initialMessages`. Check what `initialMessages` contains at that moment.
- [ ] **On refresh, is the data correct?** If yes, the bug is in local state during the active session, not in persistence. Focus on the hydration effect and provider state timing.
- [ ] **On refresh, is the user redirected to home?** Check if `isLoading` in `ChatsProvider` accounts for `isConvexAuthLoading`. Convex queries return `[]` (not `undefined`) when auth hasn't synced, making `isLoading` prematurely false.

## ID Lifecycle

A message ID passes through up to 4 stages:

```
optimistic-edit-xyz  →  (AI SDK auto-generated)  →  (syncRecentMessages)  →  Convex _id
     submitEdit           sendMessage                  onFinish                 refresh
```

`syncRecentMessages` reads the last N messages from IndexedDB and pairs them with AI SDK messages by role. It assigns the IndexedDB ID to the local message. The IndexedDB entry may still have the optimistic ID (not the Convex ID), so the reconciliation is partial. Full reconciliation happens on refresh when Convex provides the authoritative IDs.

## Key Files

| File | Role |
|------|------|
| `app/components/chat/use-chat-core.ts` | AI SDK `useChat`, `onFinish`, hydration effect, `executeSend` |
| `app/components/chat/use-chat-edit.ts` | Edit flow: truncation + `sendMessage` + deferred persistence |
| `lib/chat-store/messages/provider.tsx` | `cacheAndAddMessage`, `serverMessages`, `optimisticMessages`, provider `setMessages` |
| `app/components/chat/syncRecentMessages.ts` | ID reconciliation (IndexedDB → AI SDK local state) |
| `app/components/chat/chat.tsx` | Hook composition, `initialMessages` alias, redirect guard |
| `lib/chat-store/chats/provider.tsx` | `isLoading` (must gate on `isConvexAuthLoading` for redirect safety) |

## Rules

**Do:**
- Use `onFinish` for all persistence in flows that involve message truncation
- Use refs to hand off data from user actions to `onFinish` without mutating React state
- Treat `cacheAndAddMessage` as a function with React state side effects, not just I/O
- Verify both `setMessages` identities when reading code (AI SDK vs provider)

**Don't:**
- Call `cacheAndAddMessage` in the same synchronous block as `setMessages(truncated)` + `sendMessage`
- Assume `initialMessages` is stable during a `sendMessage` call — any provider state change (including from Convex reactive queries) can alter it
- Forget that Convex reactive queries returning `[]` before auth syncs looks identical to "no data" — gate `isLoading` on auth state
