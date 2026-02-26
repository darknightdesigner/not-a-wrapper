---
name: stale-closure-persistence
description: Diagnose and prevent data loss bugs caused by calling the same useCallback-based persistence function multiple times in a single async chain. The second call overwrites the first's IndexedDB write because both share stale closure-captured React state. Use when debugging missing messages after edits, silent edit failures, syncRecentMessages reconciliation failures, or any bug where sequential cacheAndAddMessage calls lose data.
---

# Stale Closure Persistence

Use this skill when a `useCallback` function that writes to IndexedDB (or any external store) is called multiple times in the same async chain — typically two sequential `await cacheAndAddMessage(...)` calls inside `onFinish`.

## Prerequisites

- [ ] Read `dual-message-state` skill for the two-array architecture.
- [ ] Know which `setMessages` you're working with (AI SDK vs MessagesProvider).

## The Bug Pattern

A `useCallback` captures React state at render time. When an async handler `await`s the same callback twice, **both calls share the same stale snapshot** — even if the first call enqueued a state update between them.

```
Render N: serverMessages = [A, B], optimisticMessages = []
                │
                ▼
        onFinish fires (closure from Render N)
                │
    ┌───────────┴────────────┐
    │  await cacheAndAddMessage(userMsg)                              │
    │    ├─ updateOptimisticMessages(add userMsg)  ← enqueues setState│
    │    ├─ writeToIndexedDB([A, B, userMsg])       ← correct ✓      │
    │    └─ await addMessageMutation(...)                             │
    │                                                                 │
    │  await cacheAndAddMessage(assistantMsg)                         │
    │    ├─ updateOptimisticMessages(add assistantMsg)                │
    │    ├─ writeToIndexedDB([A, B, assistantMsg])  ← OVERWRITES! ✗  │
    │    │        ▲ still uses stale closure:                         │
    │    │        serverMessages=[A,B], optimisticMessages=[]         │
    │    │        userMsg is GONE                                     │
    │    └─ await addMessageMutation(...)                             │
    └─────────────────────────────────────────────────────────────────┘
```

The second `writeToIndexedDB` builds its message list from `[...serverMessages, ...optimisticMessages, assistantMsg]`. Since the React state update from the first call hasn't committed (same render cycle), `optimisticMessages` is still `[]`. The user message written by the first call is overwritten.

## Symptoms

1. **Second edit of the same message fails.** First edit works. Second edit shows an error toast ("Oops, something went wrong") or silently does nothing.
2. **`console.error("Unable to locate message timestamp.")` in the console.** The user message lost its `createdAt` because `syncRecentMessages` couldn't find it in IndexedDB.
3. **Message ID validation fails in `handleSave`.** After a failed sync, the message retains its AI SDK-generated ID (e.g., `msg_abc123`), which is neither `optimistic-*` nor a Convex ID.
4. **IndexedDB cache is missing a message that Convex has.** Open DevTools → Application → IndexedDB → `not-a-wrapper-db` → `messages` → compare with the Convex dashboard. If IndexedDB is missing the user message but Convex has it, this is the bug.
5. **`syncRecentMessages` reconciles the assistant but not the user message.** Add a log in `syncRecentMessages` — if only 1 of the 2 expected messages is found in IndexedDB, the write was overwritten.

## Diagnostic Steps

### Step 1: Confirm the overwrite

Add a temporary log in `cacheAndAddMessage` (provider.tsx):

```typescript
const cached = await getCachedMessages(effectiveChatId)
console.log('[cacheAndAddMessage]', {
  messageRole: message.role,
  messageId: message.id,
  cachedCount: cached.length,
  cachedIds: cached.map(m => m.id),
})
```

If the second call's `cachedCount` doesn't include the message from the first call, the overwrite is confirmed.

### Step 2: Check closure freshness

In the function that calls `cacheAndAddMessage` twice (e.g., `onFinish`), log the captured state:

```typescript
console.log('[onFinish] closure check', {
  serverMessagesCount: serverMessages?.length,  // undefined if not in scope
  optimisticMessagesCount: optimisticMessages?.length,
})
```

If these values are the same before both calls, the closure is stale.

### Step 3: Check syncRecentMessages input

Add a log in `syncRecentMessages`:

```typescript
const lastFromDb = await getLastMessagesFromDb(chatId, count)
console.log('[syncRecentMessages]', {
  count: lastFromDb?.length,
  roles: lastFromDb?.map(m => m.role),
  ids: lastFromDb?.map(m => m.id),
  hasCreatedAt: lastFromDb?.map(m => !!m.createdAt),
})
```

Expected after a successful edit: 2 messages (user + assistant), both with `createdAt`. If the user message is missing, the overwrite bug is active.

### Step 4: Check the message in the AI SDK state

After `syncRecentMessages` completes, check what the AI SDK's messages look like:

```typescript
setMessages((prev) => {
  const lastUser = [...prev].reverse().find(m => m.role === 'user')
  console.log('[post-sync] last user', {
    id: lastUser?.id,
    hasCreatedAt: !!(lastUser as any)?.createdAt,
    createdAtType: typeof (lastUser as any)?.createdAt,
  })
  return prev
})
```

If `id` is an AI SDK-generated string (not `optimistic-*` or Convex ID) and `hasCreatedAt` is false, the sync failed because IndexedDB didn't have the message.

## The Fix Pattern

**Never build the write payload from closure-captured React state. Read from the store before writing.**

```typescript
// BEFORE (broken): builds from stale closure values
const allMessages = [...serverMessages, ...optimisticMessages, message]
await writeToIndexedDB("messages", { id: chatId, messages: dedup(allMessages) })

// AFTER (fixed): reads current cache, appends new message
const cached = await getCachedMessages(chatId)
const allMessages = [...cached, message]
await writeToIndexedDB("messages", { id: chatId, messages: dedup(allMessages) })
```

This makes each write additive. The second call reads the first call's output and appends to it.

**Also ensure `createdAt` is always set before caching:**

```typescript
const messageToCache: ExtendedUIMessage = message.createdAt
  ? message
  : { ...message, createdAt: new Date() }
```

AI SDK v6 `UIMessage` omits `createdAt`. Without it, `getCachedMessages` (which sorts by `createdAt`) assigns epoch-0, placing the message at the beginning of the sorted array. `getLastMessagesFromDb(chatId, 2)` then can't find it in the "last N" slice.

## Prevention Rules

### Rule 1: Treat IndexedDB writes as read-modify-write

Any function that writes to IndexedDB should read the current state first, not rely on closure-captured React state. React state is a snapshot from render time; IndexedDB is the live truth for cache contents.

```typescript
// Pattern: read-modify-write
const current = await getCachedMessages(chatId)
const updated = dedup([...current, newMessage])
await writeToIndexedDB("messages", { id: chatId, messages: updated })
```

### Rule 2: Remove stale-prone deps from useCallback

If a `useCallback` no longer reads from closure-captured state (because it reads from the store instead), remove those values from the dependency array. This also makes the callback more stable (fewer re-creations).

```typescript
// BEFORE: re-creates on every serverMessages/optimisticMessages change
}, [chatId, serverMessages, optimisticMessages, updateOptimisticMessages, addMessageMutation])

// AFTER: stable across server data changes
}, [chatId, updateOptimisticMessages, addMessageMutation])
```

### Rule 3: Always set createdAt before persisting

AI SDK v6 messages don't have `createdAt`. Any message entering the cache should have it set. This is a defensive invariant — even if the current consumer doesn't need it, future code (like `getCachedMessages` sort or `syncRecentMessages` pairing) may depend on it.

### Rule 4: Audit any function called multiple times in an async chain

When you see `await fn(a); await fn(b);` where `fn` is a `useCallback`, ask: "Does `fn` read from React state in its closure?" If yes, the second call sees stale data. Either:
- Make `fn` read from the external store (IndexedDB, ref, etc.)
- Pass the needed state as a parameter instead of closing over it
- Combine both calls into one (if the function supports batch input)

### Rule 5: Verify syncRecentMessages coverage

After any change to `cacheAndAddMessage` or `onFinish`, manually verify that `getLastMessagesFromDb(chatId, N)` returns the expected messages (correct count, roles, IDs, and `createdAt` values). The sort order in `getCachedMessages` is the most fragile link — messages without `createdAt` silently drop out of the "last N" window.

## How React State Batching Creates Stale Closures

```
Time →
─────────────────────────────────────────────────────────────
Render N:  useCallback captures { serverMsgs: [A,B], optimisticMsgs: [] }
                │
                ├─ onFinish fires (uses Render N's closure)
                │   ├─ await cacheAndAddMessage(userMsg)
                │   │   └─ updateOptimisticMessages(add userMsg)  ← enqueues
                │   │       React has NOT committed this yet
                │   │
                │   ├─ await cacheAndAddMessage(assistantMsg)
                │   │   └─ optimisticMsgs is STILL [] in this closure
                │   │
                │   └─ await syncRecentMessages(...)
                │
                ▼
Render N+1: optimisticMessages = [userMsg, assistantMsg]
            BUT onFinish already completed with stale data
─────────────────────────────────────────────────────────────
```

`updateOptimisticMessages` calls `setOptimisticMessagesMap` (a React state setter). React enqueues the update but does NOT apply it synchronously — even across `await` boundaries within the same microtask chain. The state commits on the next render, which happens after `onFinish` has already completed.

## Generalizing Beyond cacheAndAddMessage

This pattern applies to **any** `useCallback` that:
1. Reads closure-captured state to build a write payload
2. Writes to an external store (IndexedDB, localStorage, a ref-backed cache)
3. Is called more than once in the same async chain

The fix is always the same: read from the store before writing, not from the closure.

## Key Files

| File | Role |
|------|------|
| `lib/chat-store/messages/provider.tsx` | `cacheAndAddMessage` — the fixed function |
| `lib/chat-store/messages/api.ts` | `getCachedMessages` — reads from IndexedDB with `createdAt` sort |
| `app/components/chat/use-chat-core.ts` | `onFinish` — the async chain that calls `cacheAndAddMessage` twice |
| `app/components/chat/syncRecentMessages.ts` | ID reconciliation — depends on IndexedDB having correct data |
| `app/components/chat/use-chat-edit.ts` | `submitEdit` — writes `trimmedMessages` to IndexedDB before the edit |

## Related Skills

- `dual-message-state` — the two-array architecture and hydration bridge
- `streaming-ui-lifecycle` — end-to-end data flow from API route to components
