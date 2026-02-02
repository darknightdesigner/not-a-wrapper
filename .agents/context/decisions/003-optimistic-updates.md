# ADR-003: Optimistic Updates with Rollback Pattern

## Status

**Accepted** — January 2025

## Context

Chat applications require immediate UI feedback:
- Message sent → appears instantly
- Chat renamed → title updates immediately
- Chat deleted → disappears right away

However, server operations can:
- Take 100-500ms
- Fail due to network issues
- Fail due to validation

Users expect instant feedback with graceful error handling.

## Decision

Implement **optimistic updates with automatic rollback** across all state-changing operations.

## Rationale

### Pattern

```typescript
const updateTitle = async (id: string, title: string) => {
  // 1. Save previous state for rollback
  let previousState: State | null = null
  
  // 2. Apply optimistic update immediately
  setState((prev) => {
    previousState = prev
    return applyUpdate(prev, id, title)
  })
  
  try {
    // 3. Persist to server
    await serverMutation(id, title)
  } catch (error) {
    // 4. Rollback on failure
    if (previousState) setState(previousState)
    toast.error("Failed to update")
  }
}
```

### Why This Approach

| Approach | Latency | Complexity | UX |
|----------|---------|------------|-----|
| Wait for server | 200-500ms | Low | Sluggish |
| Optimistic, no rollback | 0ms | Low | Data loss risk |
| **Optimistic + rollback** | 0ms | Medium | Best |
| CRDT/OT | 0ms | High | Overkill |

### Trade-offs Accepted

- ✅ Instant UI feedback
- ✅ Graceful error recovery
- ✅ User sees accurate state
- ❌ More complex state logic
- ❌ Must track previous state

## Consequences

### Positive

- Chat feels instant
- Errors don't leave UI in bad state
- Clear user feedback on failures
- Works offline-first

### Negative

- State management more complex
- Must handle optimistic ID → real ID replacement
- Server state is source of truth (must reconcile)

## Implementation Notes

### Gold Standard

`lib/chat-store/chats/provider.tsx`

### Key Patterns

**1. Optimistic Message IDs**
```typescript
const optimisticId = `optimistic-${Date.now()}`
// Replace with real ID after server confirms
```

**2. Server State Priority**
```typescript
const chats = useMemo(() => {
  const serverIds = new Set(serverChats.map(c => c.id))
  const pendingOps = optimisticOps.filter(op => !serverIds.has(op.id))
  return [...serverChats, ...pendingOps]
}, [serverChats, optimisticOps])
```

**3. Cleanup After Sync**
```typescript
// Remove optimistic op once server confirms
setTimeout(() => {
  setOptimisticOps(prev => prev.filter(op => op.id !== optimisticId))
}, 1000)
```

### Critical Rules

1. **Never overwrite server state** — Server is truth
2. **Always save previous state** — For rollback
3. **Show user feedback on error** — Toast notification
4. **Clean up optimistic state** — Prevent memory leaks

## References

- `lib/chat-store/chats/provider.tsx` — Gold standard
- `context/architecture.md` — State management layers
- `.cursor/rules/020-react-components.mdc` — React patterns
