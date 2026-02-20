# State Management, Performance & Data Flow

> **Agent**: Agent 3
> **Phase**: 1 (parallel)
> **Status**: Complete
> **Date**: February 15, 2026

## Summary

WebClaw implements a highly intentional state management architecture that prioritizes streaming performance above all else. Server data (sessions, message history) lives in TanStack Query with aggressive direct cache manipulation instead of invalidation. Ephemeral UI state (sidebar collapsed) is stored in the TanStack Query cache as a singleton — an unusual but effective pattern for their minimal UI surface. User preferences (theme, tool display, thinking level) live in two small Zustand stores with `persist` middleware. Cross-route navigation state (pending send payloads, session tombstones) lives in module-scoped variables that survive React navigation but not page refresh. The performance architecture is defined by a single critical path: streaming chunks must update exactly one message component while all other messages remain memoized. They achieve this through content-based `memo()` equality on `MessageItem`, a stable-reference trick in `useChatHistory` using string signatures, and a portal-based scroll container that separates shell rendering from content rendering.

## Findings

### 1. TanStack Query Patterns

**Source**: `screens/chat/chat-queries.ts`, `screens/chat/hooks/use-chat-sessions.ts`, `screens/chat/hooks/use-chat-history.ts`

#### Query Key Design

The query key structure is flat and minimal, defined in a `chatQueryKeys` object:

```typescript
export const chatQueryKeys = {
  sessions: ['chat', 'sessions'] as const,
  history: function history(friendlyId: string, sessionKey: string) {
    return ['chat', 'history', friendlyId, sessionKey] as const
  },
} as const
```

Two additional keys exist outside this object:
- `['chat', 'ui']` — UI state singleton (from `chat-ui.ts`)
- `['gateway', 'status']` — Gateway health check (from `chat-screen.tsx`)

This is notably simpler than query key factory patterns commonly seen (no nested builders, no filter keys). The `history` key uses both `friendlyId` and `sessionKey` as compound identifiers because the gateway can reference sessions by either.

#### Cache Timing Configuration

| Query | staleTime | gcTime | refetchInterval | Other |
|-------|-----------|--------|-----------------|-------|
| Sessions | default (0) | default | 30,000ms (30s) | — |
| History | default (0) | 600,000ms (10min) | — | `retry: false`, `placeholderData` from cache |
| UI state | `Infinity` | default | — | `initialData` from cache |
| Gateway status | default (0) | default | — | `retry: false`, `refetchOnMount: 'always'` |

The history query uses `placeholderData` pointing to the existing cache, which means the UI shows the previously cached messages while a background refetch runs. This is critical for the streaming flow — without it, navigating back to a conversation would flash empty before loading.

#### Fetcher Organization

All fetchers are co-located in `chat-queries.ts` alongside query keys and cache manipulation utilities. This creates a single file that owns the "data layer" contract:

```
chat-queries.ts (150+ lines)
├── chatQueryKeys          — query key definitions
├── fetchSessions()        — GET /api/sessions
├── fetchHistory()         — GET /api/history?sessionKey=...&limit=200
├── fetchGatewayStatus()   — GET /api/ping (with 2.5s abort timeout)
├── updateHistoryMessages()          — generic cache updater
├── appendHistoryMessage()           — add message to history
├── updateHistoryMessageByClientId() — update by clientId/optimisticId
├── removeHistoryMessageByClientId() — remove by clientId
├── clearHistoryMessages()           — clear session history
├── moveHistoryMessages()            — move messages between sessions
├── updateSessionLastMessage()       — update sidebar + re-sort by time
└── removeSessionFromCache()         — remove session + its history queries
```

#### Invalidation Strategy: Direct Cache Manipulation

This is the most significant TanStack Query pattern in the codebase. **WebClaw almost never calls `queryClient.invalidateQueries()`**. Instead, they directly manipulate the cache with `queryClient.setQueryData()`:

- Streaming message arrives → `updateHistoryMessages()` upserts into cache directly
- Optimistic send → `appendHistoryMessage()` + `updateSessionLastMessage()` write to cache
- Session deleted → `removeSessionFromCache()` removes from both sessions and history caches
- New session created → `queryClient.invalidateQueries()` (one of the rare invalidations)
- Sidebar collapse → `setChatUiState()` writes to cache

The only places `invalidateQueries` appears are session creation (must fetch full list from server) and history `refetch()` calls after stream events reach `final`/`error`/`aborted` state.

**Why this matters**: Direct cache manipulation is deterministic and instant. Invalidation triggers a background refetch that creates a race condition with streaming updates. By writing directly, streaming messages appear immediately without waiting for a server round-trip, and there's no flicker from stale-then-fresh data.

### 2. UI State in TanStack Query Cache

**Source**: `screens/chat/chat-ui.ts`, `screens/chat/hooks/use-chat-mobile.ts`

WebClaw stores sidebar collapsed state in the TanStack Query cache as a "virtual query" — one with `staleTime: Infinity` and no real server fetcher:

```typescript
export const chatUiQueryKey = ['chat', 'ui'] as const

export type ChatUiState = {
  isSidebarCollapsed: boolean
}

export function getChatUiState(queryClient: QueryClient): ChatUiState {
  const cached = queryClient.getQueryData(chatUiQueryKey)
  // ...merge with defaults
}

export function setChatUiState(
  queryClient: QueryClient,
  updater: (state: ChatUiState) => ChatUiState,
) {
  queryClient.setQueryData(chatUiQueryKey, function update(state: unknown) {
    // ...merge and update
  })
}
```

The `queryFn` in the hook just reads from the cache — it never fetches from the server:

```typescript
const uiQuery = useQuery({
  queryKey: chatUiQueryKey,
  queryFn: function readUiState() { return getChatUiState(queryClient) },
  initialData: function initialUiState() { return getChatUiState(queryClient) },
  staleTime: Infinity,
})
```

#### Trade-offs vs Zustand or useState

| Dimension | TQ Cache (their approach) | Zustand | useState |
|-----------|--------------------------|---------|----------|
| Reactivity | Same system as server data | Separate subscription | Local only |
| Persistence | None (ephemeral) | With `persist` middleware | None |
| DevTools | Visible in TQ devtools | Separate devtools | React DevTools only |
| Semantics | Confusing (not server data) | Clear purpose | Obvious |
| Access pattern | Via `queryClient` instance | Global import | Props/context |
| Dependencies | None extra | Zustand import | None |
| Middleware | None | persist, devtools, immer | None |

**Assessment**: This works for WebClaw because they have exactly one piece of ephemeral UI state (sidebar). It would not scale to multiple UI concerns. For NaW, this pattern should be **skipped** in favor of Zustand for UI state — we already have Zustand, and its `persist` middleware gives us cross-session persistence that TQ cache does not.

### 3. Optimistic Updates

**Source**: `screens/chat/pending-send.ts`, `screens/chat/session-tombstones.ts`, `screens/chat/chat-screen.tsx`, `screens/chat/chat-screen-utils.ts`, `screens/chat/hooks/use-chat-pending-send.ts`, `screens/chat/hooks/use-chat-history.ts`

#### 3a. Optimistic Send Flow (Existing Session)

```
User types message → ChatComposer.handleSubmit()
  → ChatScreen.send()
    → createOptimisticMessage(body, attachments)
       Returns: { clientId: UUID, optimisticId: "opt-{UUID}", optimisticMessage }
    → appendHistoryMessage(qc, friendlyId, sessionKey, optimisticMessage)
       [Message appears in UI immediately with status: 'sending']
    → updateSessionLastMessage(qc, sessionKey, friendlyId, optimisticMessage)
       [Sidebar re-sorts with this session at top]
    → setPendingGeneration(true), setSending(true), setWaitingForResponse(true)
    → POST /api/send { sessionKey, friendlyId, message, thinking, idempotencyKey }
       On success:
         → startRun(runId) — tracks generation with 120s timeout
         → refreshHistory() — background refetch
       On error:
         → updateHistoryMessageByClientId() — marks optimistic message as 'error'
         → Clear waiting/pending states
```

The optimistic message carries three identifiers:
- `clientId` — the original UUID
- `__optimisticId` — `"opt-{clientId}"` prefix version
- `status: 'sending'` — visual indicator

When history refetches, `mergeOptimisticHistoryMessages()` reconciles:
1. Match by `clientId` (exact match)
2. Match by `__optimisticId` (exact match)
3. Match by `role + text + near-timestamp` (within 10 seconds) — fuzzy fallback

#### 3b. New Chat Send Flow (Cross-Route Navigation)

This is substantially more complex because the user submits on `/new` but needs to arrive at `/chat/{friendlyId}`:

```
User submits on /new
  → createOptimisticMessage()
  → appendHistoryMessage(qc, 'new', 'new', optimistic) — appends to virtual 'new' history
  → POST /api/sessions {} — creates session on gateway
  → setRecentSession(friendlyId) — marks as recent for 15 seconds
  → stashPendingSend({ sessionKey, friendlyId, message, optimisticMessage, attachments })
     [Stores in module-scoped variable — survives React navigation]
  → navigate({ to: '/chat/$sessionKey', params: { sessionKey: friendlyId } })
     [Route change triggers useChatPendingSend in new ChatScreen]

ChatScreen mounts at /chat/{friendlyId}
  → useChatPendingSend runs useLayoutEffect
  → consumePendingSend(sessionKey, friendlyId) — retrieves stashed payload
  → Checks if optimistic message already in cache (dedup guard)
  → If not, appendHistoryMessage() to correct history key
  → sendMessage(sessionKey, friendlyId, message, skipOptimistic=true)
     [skipOptimistic=true because optimistic message is already in cache]
```

The `pending-send.ts` module uses **module-scoped variables** (not React state):

```typescript
let pendingSend: PendingSendPayload | null = null
let pendingGeneration = false
let recentSession: { friendlyId: string; at: number } | null = null
```

This is intentional — these survive React's concurrent rendering and route transitions, but don't cause re-renders when set. The trade-off is they're invisible to React DevTools and aren't reactive.

#### 3c. Session Tombstones

When a session is deleted, the server may take a moment to process. During this window, the sessions list polling (every 30s) could return the deleted session, causing it to "reappear" in the sidebar.

`session-tombstones.ts` solves this with a time-limited client-side filter:

```typescript
const TOMBSTONE_TTL_MS = 8000  // 8 seconds
const tombstones = new Map<string, Tombstone>()

export function markSessionDeleted(id: string) {
  tombstones.set(id, { id, expiresAt: Date.now() + TOMBSTONE_TTL_MS })
}

export function filterSessionsWithTombstones<T extends { key: string; friendlyId: string }>(
  sessions: Array<T>
) {
  // Filter out tombstoned sessions, auto-clean expired tombstones
}
```

Applied in `useChatSessions`:

```typescript
const sessions = useMemo(() => {
  const rawSessions = sessionsQuery.data ?? []
  return filterSessionsWithTombstones(rawSessions)
}, [sessionsQuery.data])
```

The 8-second TTL is tuned to be longer than expected server processing time but short enough that if the server actually fails to delete, the session reappears.

### 4. Performance Patterns

**Source**: `AGENTS.md` conventions, `screens/chat/components/message-item.tsx`, `screens/chat/components/chat-message-list.tsx`, `screens/chat/components/chat-composer.tsx`, `components/prompt-kit/chat-container.tsx`

#### 4a. Content-Based Message Memoization

`MessageItem` uses `memo()` with a custom `areMessagesEqual` comparator that performs **deep content comparison**, not referential equality:

```typescript
function areMessagesEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  // Structural checks (props that change independently)
  if (prev.forceActionsVisible !== next.forceActionsVisible) return false
  if (prev.wrapperClassName !== next.wrapperClassName) return false

  // Role check
  if ((prev.message.role || 'assistant') !== (next.message.role || 'assistant')) return false

  // TEXT content comparison (the key streaming check)
  if (textFromMessage(prev.message) !== textFromMessage(next.message)) return false

  // Thinking content comparison
  if (thinkingFromMessage(prev.message) !== thinkingFromMessage(next.message)) return false

  // Tool call SIGNATURE comparison (composite string of all tool call fields)
  if (toolCallsSignature(prev.message) !== toolCallsSignature(next.message)) return false

  // Tool RESULT signature comparison (looks up linked results from Map)
  if (toolResultsSignature(prev.message, prev.toolResultsByCallId) !==
      toolResultsSignature(next.message, next.toolResultsByCallId)) return false

  // Timestamp comparison
  if (rawTimestamp(prev.message) !== rawTimestamp(next.message)) return false

  return true
}
```

The signature functions are notable: `toolCallsSignature()` creates a pipe-delimited string from all tool call IDs, names, partialJson, and args. `toolResultsSignature()` does the same for linked tool results by looking them up from a `Map<string, GatewayMessage>`. This means a tool call message only re-renders when its input or output actually changes — not when the messages array ref changes.

**Cost analysis**: Each `areMessagesEqual` call performs string extraction from message content (which iterates `content[]` arrays) and string comparisons. For a message with one text part and no tools, this is approximately: 2 array scans, 4 string comparisons, 1 timestamp normalization. Cheap enough for 200 messages per streaming chunk.

#### 4b. Scroll Container Portal Pattern

The `ChatContainerRoot` separates the scroll shell from the content using `createPortal()`:

```typescript
// Shell is memoized — doesn't re-render when content changes
const MemoizedChatContainerShell = React.memo(ChatContainerShell, areShellPropsEqual)

// Content is portaled INTO the shell's viewport node
function ChatContainerPortal({ viewportNode, children }: ChatContainerPortalProps) {
  if (!viewportNode) return null
  return createPortal(<div className="min-h-full">{children}</div>, viewportNode)
}

function ChatContainerRoot({ children, className, onUserScroll }: ChatContainerRootProps) {
  const [viewportNode, setViewportNode] = useState<HTMLDivElement | null>(null)
  // Shell renders once, captures viewport ref
  // Content portaled in, can re-render independently
  return (
    <>
      <MemoizedChatContainerShell viewportRef={handleViewportRef} scrollRef={scrollRef} ... />
      <ChatContainerPortal viewportNode={viewportNode}>{children}</ChatContainerPortal>
    </>
  )
}
```

**Why this matters**: Without this pattern, any re-render of the chat content (e.g., streaming update) would also re-render the `ScrollAreaRoot`, `ScrollAreaScrollbar`, `ScrollAreaThumb`, and `ScrollAreaCorner` components. With the portal, the shell (scrollbar, scroll area) only re-renders when its own props change — which happens rarely (resize, className change).

The custom `areShellPropsEqual` comparator checks `className`, `viewportRef`, `scrollRef`, and a shallow `viewportProps` comparison.

#### 4c. Local Composer State

`ChatComposer` isolates all input state from the chat screen:

```typescript
function ChatComposerComponent({ onSubmit, isLoading, disabled, wrapperRef }: ChatComposerProps) {
  const [attachments, setAttachments] = useState<Array<AttachmentFile>>([])
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const valueRef = useRef('')                    // NOT useState — no re-renders on keystroke
  const setValueRef = useRef<((value: string) => void) | null>(null)
  // ...
}

const MemoizedChatComposer = memo(ChatComposerComponent)
```

Key decisions:
- **`valueRef` (not `useState`)** for input text — typing doesn't trigger React re-renders
- **`setValueRef`** allows external code to set the value (for error rollback) without a re-render
- **`attachments` uses `useState`** — attachment changes are infrequent and DO need visual updates
- **`memo()` wrapper** — prevents re-renders from parent when only streaming state changes

**This is the single most important performance decision for input responsiveness**. Without it, every keystroke would trigger a state update in `ChatScreen`, which would cascade to `ChatMessageList`, which would check all `MessageItem` memo comparators. With ref-based input state, keystrokes are invisible to React's reconciler.

#### 4d. Stable History Reference

`useChatHistory` uses a signature-based stability trick:

```typescript
const stableHistorySignatureRef = useRef('')
const stableHistoryMessagesRef = useRef<Array<GatewayMessage>>([])

const historyMessages = useMemo(() => {
  const messages = Array.isArray(historyQuery.data?.messages) ? historyQuery.data.messages : []
  const last = messages.at(-1)
  // Build signature from: count + lastRole + lastId + lastText[-32:] + contentSignature
  const signature = `${messages.length}:${lastRole}:${lastId}:${lastText.slice(-32)}:${lastContentSignature}`
  if (signature === stableHistorySignatureRef.current) {
    return stableHistoryMessagesRef.current  // SAME REFERENCE — no downstream re-render
  }
  stableHistorySignatureRef.current = signature
  stableHistoryMessagesRef.current = messages
  return messages
}, [historyQuery.data?.messages])
```

This is an optimization for the case where TanStack Query creates a new data object on refetch but the actual messages haven't changed (e.g., refetch triggered by window focus). Without this, `ChatMessageList` would receive a new `messages` array reference, bypass its memo check, and re-render all children (even though each `MessageItem` memo would still bail out).

**During streaming, this optimization does NOT prevent re-renders** — the signature will change because the last message's text changes. But it prevents unnecessary re-renders from background refetches.

#### 4e. Measurement-Based Pin Layout

`useChatMeasurements` uses `ResizeObserver` to track header and composer heights, computing a `pinGroupMinHeight` that ensures the "pinned" message group (last user message + response) fills the viewport:

```typescript
const applySizes = () => {
  const nextHeaderHeight = headerEl?.offsetHeight ?? 0
  const composerHeight = composerEl?.offsetHeight ?? 0
  const mainHeight = mainEl.clientHeight
  setPinGroupMinHeight(Math.max(0, mainHeight - nextHeaderHeight - composerHeight))
}
const observer = new ResizeObserver(() => applySizes())
```

This feeds into `ChatMessageList`'s pin-to-top behavior, where after sending a message, the last user message scrolls to the top of the viewport with the response filling the remaining space below. This is a UX polish feature, not a performance feature, but the measurement hook is well-isolated.

### 5. Re-render Avoidance During Streaming

**This section traces the full data flow from WebSocket event to DOM update.**

#### Full Pipeline

```
Gateway WebSocket
  → Server: gateway.ts gatewayEventStream() receives 'event' frame
  → Server: API route (/api/stream) relays as Server-Sent Event
  → Client: EventSource in use-chat-stream.ts
  → handleStreamEvent() parses JSON
  → shouldSkipDuplicateEvent(seen: Set, source, runId, state, seq)
  → shouldSkipDuplicatePayload(seen: Set, source, payload)
  → shouldSkipStaleRunEvent(runId, seq, stateVersion, Maps)
  → [If 'agent' event, extractChatPayloadsFromAgentPayload() normalizes]
  → upsert() function: merges into messages array
     → findStreamMessageIndex() — finds existing by id or __streamRunId
     → mergeStreamMessage() — deep merges content parts via mergeMessageContent()
  → queryClient.setQueryData(chatQueryKeys.history(...), updatedData)
     [TanStack Query notifies subscribers]
  → useChatHistory hook re-evaluates:
     → historyQuery.data changes → useMemo recomputes
     → Signature check: "${count}:${lastRole}:${lastId}:${lastText[-32:]}:${contentSig}"
     → Signature WILL change (streaming text grew) → returns NEW array ref
  → ChatMessageList receives new `messages` prop
     → Custom areChatMessageListEqual: prev.messages !== next.messages → FAILS → re-render
  → ChatMessageList re-renders, iterates displayMessages
     → For EACH MessageItem: areMessagesEqual() runs
        → textFromMessage(prev) vs textFromMessage(next)
        → For non-streaming messages: text matches → returns true → SKIP re-render ✓
        → For streaming message: text differs → returns false → RE-RENDER
  → ONLY the streaming MessageItem re-renders
     → Markdown component receives new children string
     → Streamdown processes incremental markdown
     → CodeBlock (if present) triggers Shiki syntax highlighting
  → DOM update: only the streaming message's DOM subtree changes
```

#### What Re-renders Per Streaming Chunk

| Component | Re-renders? | Why |
|-----------|-------------|-----|
| ChatScreen | No | Messages flow via TQ, not useState |
| ChatSidebar | Only if lastMessage updates | `updateSessionLastMessage()` triggers |
| ChatHeader | No | Props are stable |
| ChatComposer | No | `memo()` wrapper, no message dependency |
| ChatContainerShell | No | Portal pattern isolates |
| ChatMessageList | **Yes** | `messages` ref changes |
| MessageItem (non-streaming) | No | Content-based equality matches |
| MessageItem (streaming) | **Yes** | Text content changed |
| Markdown | **Yes** | New `children` string |

**Critical insight**: The cost per streaming chunk is O(N) for memo checks where N is total message count, but each memo check is O(text_length) — cheap string comparisons. The actual DOM work is limited to a single message's markdown render. This scales well to 200 messages.

#### Deduplication Guards (Three Layers)

The stream handler has three dedup mechanisms to prevent duplicate processing:

1. **Event dedup** (`shouldSkipDuplicateEvent`): Tracks `${source}:${runId}:${state}:${seq}` in a `Set<string>` capped at 4000 entries. Prevents reprocessing identical events.

2. **Payload dedup** (`shouldSkipDuplicatePayload`): Tracks a composite key including `source`, `runId`, `state`, `sessionKey`, `role`, `messageId`, `toolCallId`, and first 512 chars of text. Prevents duplicate payload processing.

3. **Stale run event** (`shouldSkipStaleRunEvent`): Tracks per-run sequence numbers and state versions in `Map<string, number>`. Skips events with seq ≤ last seen seq, or stateVersion < last seen version. Prevents out-of-order processing.

The 4000-entry cap with `seen.clear()` on overflow is a pragmatic memory bound — at typical streaming rates, this is ample.

#### Agent Event Normalization

The stream handler has special logic for `agent` events (vs `chat` events). Agent events use a different payload shape with `stream` types (`assistant`, `thinking`, `lifecycle`, `tool-call`, `tool-result`). The `extractChatPayloadsFromAgentPayload()` function normalizes these into the same `StreamChatPayload` shape:

```
agent event { stream: 'assistant', data: { text: '...' } }
  → { runId, sessionKey, state: 'delta', message: { role: 'assistant', content: [{ type: 'text', text }] } }

agent event { stream: 'thinking', data: { thinking: '...' } }
  → { runId, sessionKey, state: 'delta', message: { role: 'assistant', content: [{ type: 'thinking', thinking }] } }

agent event { stream: 'lifecycle', data: { phase: 'end' } }
  → { runId, sessionKey, state: 'final' }
```

When both `agent` and `chat` events exist for the same `runId`, agent events take priority:

```typescript
if (payloadSource === 'chat' && currentSource === 'agent') {
  continue  // Skip chat event if agent event already claimed this run
}
```

### 6. Gateway Client Connection Lifecycle

**Source**: `server/gateway.ts`

#### Architecture

The gateway client has three modes of operation:

| Mode | Function | Use Case | Connection Lifetime |
|------|----------|----------|-------------------|
| One-shot | `gatewayRpc()` | Single request (sessions, history, send) | Connect → request → close |
| Pooled | `acquireGatewayClient()` | Shared connection for multiple requests | Reference-counted, shared |
| Event stream | `gatewayEventStream()` | Long-lived event subscription | Dedicated WebSocket per session |

#### Connection Pooling

```typescript
const sharedGatewayClients = new Map<string, GatewayClientEntry>()

type GatewayClientEntry = {
  key: string
  refs: number       // reference count
  client: GatewayClient
}
```

`acquireGatewayClient(key)`:
1. Check Map for existing entry with matching key
2. If found and not closed → increment refs, update event/error handlers, return handle
3. If not found → create new client, connect, store in Map with refs=1, return handle
4. Handle includes a `release()` function

`releaseGatewayClient(key)`:
1. Decrement refs
2. If refs > 0 → keep alive
3. If refs == 0 → close WebSocket, delete from Map

The `gatewayRpcShared()` function attempts to reuse a pooled client if available:

```typescript
export async function gatewayRpcShared<T>(method: string, params: unknown, key?: string): Promise<T> {
  if (key) {
    const entry = sharedGatewayClients.get(key)
    if (entry && !entry.client.isClosed()) {
      await entry.client.connect()
      return entry.client.sendReq<T>(method, params)
    }
  }
  return gatewayRpc<T>(method, params)  // fallback to one-shot
}
```

#### Protocol

WebSocket frames use a discriminated union on `type`:

```typescript
type GatewayFrame =
  | { type: 'req'; id: string; method: string; params?: unknown }
  | { type: 'res'; id: string; ok: boolean; payload?: unknown; error?: { code, message, details } }
  | { type: 'event'; event: string; payload?: unknown; seq?: number; stateVersion?: number }
```

Auth handshake is always the first request:

```typescript
{
  type: 'req',
  id: randomUUID(),
  method: 'connect',
  params: {
    minProtocol: 3, maxProtocol: 3,
    client: { id: 'gateway-client', displayName: 'webclaw', version: 'dev', platform, mode: 'ui' },
    auth: { token, password },
    role: 'operator',
    scopes: ['operator.admin']
  }
}
```

#### Reconnection Strategy

Client-side (in `use-chat-stream.ts`):

```typescript
function handleStreamError() {
  if (cancelled) return
  if (streamReconnectTimer.current) return  // Already reconnecting
  source.close()
  streamReconnectAttempt.current += 1
  const backoff = Math.min(8000, 1000 * streamReconnectAttempt.current)  // Linear backoff, 8s cap
  streamReconnectTimer.current = window.setTimeout(() => {
    startStream()  // Full restart
  }, backoff)
}

function handleStreamOpen() {
  streamReconnectAttempt.current = 0  // Reset on success
  refreshHistoryRef.current()         // Catch missed events
}
```

**Key detail**: On successful reconnection, history is refreshed to catch events missed during the disconnect. This provides eventual consistency — the client may miss streaming chunks during the gap, but the final state will be correct.

#### Cleanup Patterns

- `rejectAll()` rejects all pending RPC waiters with an error on close
- Event listeners are cleaned up in `handleClose` and `close()`
- AbortSignal support for `gatewayEventStream()`:
  ```typescript
  if (signal) {
    signal.addEventListener('abort', () => { close() }, { once: true })
  }
  ```
- One-shot `gatewayRpc()` always closes in `finally` block
- Pooled clients cleaned up when ref count reaches 0

### 7. Zustand Usage

**Source**: `hooks/use-chat-settings.ts`, `hooks/use-pinned-sessions.ts`

#### Two Zustand Stores

**1. Chat Settings Store** (`useChatSettingsStore`):

```typescript
create<ChatSettingsState>()(
  persist(
    (set) => ({
      settings: {
        showToolMessages: true,
        showReasoningBlocks: true,
        thinkingLevel: 'medium',
        theme: 'system',
      },
      updateSettings: (updates) => set((state) => ({
        settings: { ...state.settings, ...updates },
      })),
    }),
    { name: 'chat-settings' },  // localStorage key
  ),
)
```

**2. Pinned Sessions Store** (`usePinnedSessionsStore`):

```typescript
create<PinnedSessionsState>()(
  persist(
    (set, get) => ({
      pinnedSessionKeys: [],
      pinSession: (key) => set(...),
      unpinSession: (key) => set(...),
      togglePinnedSession: (key) => { ... },
      isSessionPinned: (key) => get().pinnedSessionKeys.includes(key),
    }),
    { name: 'pinned-sessions' },  // localStorage key
  ),
)
```

Both use the `persist` middleware with localStorage. Neither uses `devtools`, `immer`, or any other middleware.

Both expose thin custom hooks that use selector patterns for subscription optimization:

```typescript
export function usePinnedSessions() {
  const pinnedSessionKeys = usePinnedSessionsStore((s) => s.pinnedSessionKeys)
  const togglePinnedSession = usePinnedSessionsStore((s) => s.togglePinnedSession)
  return { pinnedSessionKeys, togglePinnedSession }
}
```

#### Complete State Distribution Map

| State Category | Storage | Reactive? | Persisted? | Why This Choice |
|----------------|---------|-----------|------------|-----------------|
| Session list | TanStack Query (`['chat','sessions']`) | Yes | No (server-fetched) | Server data, polled every 30s |
| Message history | TanStack Query (`['chat','history',…]`) | Yes | No (server-fetched) | Server data, enhanced with optimistic/streaming |
| UI state (sidebar) | TanStack Query (`['chat','ui']`) | Yes | No | Ephemeral, avoids extra dependency |
| Gateway status | TanStack Query (`['gateway','status']`) | Yes | No | Server health, refetched on mount |
| User preferences | Zustand (`chat-settings`) | Yes | Yes (localStorage) | Client-side, must survive page refresh |
| Pinned sessions | Zustand (`pinned-sessions`) | Yes | Yes (localStorage) | Client-side, must survive page refresh |
| Pending send | Module-scoped `let` variables | No | No | Cross-route state, intentionally non-reactive |
| Session tombstones | Module-scoped `Map` | No | No | 8s TTL deletion guard, intentionally non-reactive |
| Sending/loading flags | `useState` in ChatScreen | Yes | No | Component-local transient UI |
| Composer input text | `useRef` in ChatComposer | No | No | Performance: no re-renders on keystrokes |
| Composer attachments | `useState` in ChatComposer | Yes | No | Visual updates needed for attachment preview |
| Mobile detection | `useState` in useChatMobile | Yes | No | Derived from matchMedia |
| Run tracking | `useRef` Sets/Maps in ChatScreen | No | No | Imperative tracking, no render needed |

**Design principle**: Reactive state (useState/Zustand/TQ) is used only when the UI must visually respond. Imperative state (useRef/module vars) is used for tracking, coordination, and performance-critical paths.

### 8. Long Conversation Handling

**Source**: `screens/chat/hooks/use-chat-history.ts`, `screens/chat/components/chat-message-list.tsx`, `screens/chat/chat-queries.ts`

**WebClaw does not virtualize messages.** There is no usage of `react-window`, `@tanstack/react-virtual`, or any virtualization library. All messages in `displayMessages` are rendered as real DOM nodes.

Their approach to handling long conversations:

1. **Hard limit**: History fetch includes `limit: '200'` in the query params
2. **Content-based memoization**: Individual messages don't re-render unless their content changes
3. **Tool result deduplication**: `displayMessages` filters out tool results already rendered inline with their associated tool calls, reducing rendered message count
4. **No pagination or infinite scroll**: No "load more" behavior observed

**Assessment**: This is a significant limitation for conversations with heavy tool usage (which can generate many messages). At 200 messages, the DOM contains 200+ `MessageItem` components. Each streaming chunk performs 200 memo checks. Without virtualization, scroll performance will degrade with DOM size.

The 200-message limit is pragmatic but not a solution — it means old messages are simply missing, not lazily loaded. For NaW, where users may have conversations with hundreds of messages across multi-model comparisons, virtualization should be strongly considered.

### 9. Streaming Pipeline Cost Analysis

**Full pipeline**: Gateway WebSocket → Server relay → SSE EventSource → JSON parse → 3-layer dedup → Message upsert → TQ cache update → Hook subscriber → Signature check → ChatMessageList memo → N × MessageItem memo → Streamdown markdown → Shiki syntax highlight → DOM paint

#### Cost per streaming chunk

| Stage | Cost | Notes |
|-------|------|-------|
| EventSource receive | Negligible | Browser-native SSE parsing |
| JSON.parse | O(payload_size) | Typically < 1KB per chunk |
| Dedup checks (3 layers) | O(1) amortized | Set/Map lookups, 4000-entry cap |
| Agent payload normalization | O(1) | Simple object transformation |
| Message upsert | O(N) | Scans messages for matching id/runId |
| `mergeStreamMessage` | O(parts) | Merges content arrays by part identity |
| TQ `setQueryData` | O(1) | Sets cache, notifies subscribers |
| `useChatHistory` signature | O(text_length) | Last message text scan + hash |
| `ChatMessageList` memo | O(1) | Referential check fails immediately |
| N × `MessageItem` memo | O(N × avg_text_length) | Content-based equality per message |
| Streamdown (streaming msg) | O(chunk_size) | Incremental markdown parsing |
| Shiki (if code block) | O(code_length) | Full re-highlight (expensive) |
| DOM paint | O(changed_nodes) | React reconciliation |

#### Identified Bottlenecks

1. **Shiki re-highlighting**: When a code block is actively streaming, Shiki re-highlights the entire block on each chunk. This is the most expensive single operation. Streamdown may mitigate this with incremental parsing, but Shiki itself is not incremental.

2. **No chunk debouncing/batching**: Every SSE event triggers the full pipeline. If the gateway sends 30 events/second, that's 30 full pipeline executions. React batches state updates within the same tick, but TQ `setQueryData` calls may not be batched across multiple events.

3. **Linear upsert scan**: `upsert()` in `use-chat-stream.ts` scans the messages array to find the matching message. For 200 messages, this is negligible, but it's O(N).

4. **N × memo checks**: For 200 messages, each streaming chunk triggers 200 `areMessagesEqual` calls. Each extracts text via `textFromMessage` (which scans content array). This is approximately O(200 × avg_parts_per_message).

5. **No message content caching**: `textFromMessage()` is called in both `useChatHistory` (for signature) and `areMessagesEqual` (for memo check). The same text extraction runs twice per chunk per non-streaming message.

## Key Patterns Worth Studying

### Pattern 1: Content-Based Message Memoization

**File**: `screens/chat/components/message-item.tsx`
**Pattern**: Custom `areMessagesEqual` comparator that compares semantic content instead of referential identity. Uses "signature" functions to create comparable strings from complex nested structures (tool calls, tool results).

**Why it matters**: During streaming, React re-renders the message list on every chunk. Without content-based memoization, ALL messages would re-render — turning a O(1) DOM update into O(N). This is the single most impactful performance pattern in the codebase.

### Pattern 2: Portal-Based Scroll Container

**File**: `components/prompt-kit/chat-container.tsx`
**Pattern**: Memoize the scroll shell (`ScrollAreaRoot` + scrollbars) separately from content. Use `createPortal()` to inject frequently-updating content into the memoized shell's viewport.

**Why it matters**: Scroll area components often have internal state (thumb position, scrollbar visibility). If the scroll container re-renders on every content update, this internal state may reset or cause visual glitches. The portal pattern keeps the shell stable.

### Pattern 3: Ref-Based Composer Input

**File**: `screens/chat/components/chat-composer.tsx`
**Pattern**: Store input value in `useRef` instead of `useState`. Expose `setValueRef` for external control. Only use `useState` for state that requires visual updates (attachments).

**Why it matters**: In a chat app, the composer and the message list share a parent. If the input value is in `useState`, every keystroke triggers the parent's re-render, which cascades to the message list. With `useRef`, keystrokes are invisible to React.

### Pattern 4: Direct TQ Cache Manipulation for Streaming

**File**: `screens/chat/chat-queries.ts`
**Pattern**: Write streaming messages directly into TQ cache via `setQueryData` instead of invalidating and refetching. Provide typed helper functions (`appendHistoryMessage`, `updateHistoryMessageByClientId`, etc.) that abstract the cache manipulation.

**Why it matters**: Invalidation triggers a refetch that races with streaming updates. Direct cache writes are deterministic and instant.

### Pattern 5: Module-Scoped Navigation State

**File**: `screens/chat/pending-send.ts`
**Pattern**: Store cross-route state (pending send payload) in module-scoped `let` variables that survive React navigation but intentionally don't trigger re-renders.

**Why it matters**: When sending a message creates a new session, the app navigates from `/new` to `/chat/{id}`. React state is destroyed during navigation. Module-scoped state persists, allowing the new route to pick up where the old one left off.

## Concerns & Limitations

### 1. No Virtualization

200 messages rendered as real DOM is a hard ceiling. For users with heavy tool-use conversations (which generate many messages), this will degrade. NaW's multi-model comparison mode could easily exceed this.

### 2. Shiki Re-highlight Cost

During code streaming, every chunk triggers a full Shiki re-highlight of the entire code block. This is expensive (Shiki loads WASM grammars) and not debounced. For large code blocks, this could cause visible jank.

### 3. UI State in TQ Cache is Semantically Misleading

Storing `isSidebarCollapsed` in the TQ cache works but confuses the data model. It's not server data, it has no queryFn, and `staleTime: Infinity` means it never refetches. This is a Zustand use case crammed into TQ. It works because they have exactly one such state — it wouldn't scale.

### 4. Module-Scoped State is Invisible

`pending-send.ts` and `session-tombstones.ts` use module-scoped variables that don't appear in React DevTools or TQ DevTools. Debugging cross-route state issues requires reading source code.

### 5. No Debouncing of Streaming Updates

Every SSE event triggers the full pipeline from JSON parse to DOM paint. At high streaming rates (30+ events/second), this could cause frame drops. Some chat apps batch streaming updates into animation frames.

### 6. Linear Merge Complexity

The `mergeStreamingHistoryMessages` and `mergeOptimisticHistoryMessages` functions use nested loops (O(streaming × server) and O(optimistic × server)) to match messages. At 200 messages, this is fine. At 1000+ it could become noticeable.

### 7. 8-Second Tombstone TTL is Fragile

The tombstone TTL of 8 seconds assumes server-side deletion completes within that window. Under load, this assumption could fail, causing deleted sessions to reappear temporarily.

## Unexpected Findings

### 1. No `useEffect` for Render Logic — But Plenty of `useEffect` for Side Effects

Their AGENTS.md says "NEVER use useEffect for anything that can be expressed as render logic." In practice, they still use `useEffect` heavily — but exclusively for side effects: EventSource lifecycle, timers, ResizeObserver setup, media query listeners, and pending send consumption. The line between "render logic" and "side effect" is their key distinction.

### 2. Three-Layer Dedup is Unusually Defensive

The triple dedup in streaming (event keys, payload keys, stale run events) with 4000-entry caps suggests they encountered real-world duplicate event issues with the OpenClaw gateway. This level of dedup is more thorough than typical SSE consumers.

### 3. Agent vs Chat Event Priority System

The stream handler tracks which "source" (agent or chat) first claimed a `runId`, and subsequent events from the lower-priority source are silently dropped. This suggests the gateway can send duplicate information via two different event channels, and the client must arbitrate.

### 4. `mergeMessageContent` Uses Part Identity, Not Index

Content parts are merged by a computed identity (`text` → "text", `thinking` → "thinking", `toolCall` → "toolCall:{id}:{name}"), not by array index. This means if the gateway sends parts in a different order, the merge still works correctly. This is more robust than index-based merging.

### 5. History Refetch Preserves Optimistic and Streaming Messages

The history `queryFn` in `useChatHistory` has a remarkable pattern: before fetching from the server, it extracts optimistic and streaming messages from the current cache, then merges them back into the server response:

```typescript
queryFn: async function fetchHistoryForSession() {
  const cached = queryClient.getQueryData<HistoryResponse>(historyKey)
  const optimisticMessages = cached?.messages.filter(m => m.status === 'sending' || m.__optimisticId || m.clientId)
  const streamingMessages = cached?.messages.filter(m => m.__streamRunId)
  const serverData = await fetchHistory(...)
  const mergedWithOptimistic = mergeOptimisticHistoryMessages(serverData.messages, optimisticMessages)
  const merged = mergeStreamingHistoryMessages(mergedWithOptimistic, streamingMessages)
  return { ...serverData, messages: merged }
}
```

This prevents a common bug where refetching history during streaming would overwrite in-progress streaming messages with the server's (incomplete) state.

## Evidence Table

| claim_id | claim | evidence_type | source_refs | confidence | impact_area | transferability | notes |
|-----------|-------|---------------|-------------|------------|-------------|-----------------|-------|
| WC-A3-C01 | WebClaw uses direct TQ cache manipulation instead of invalidation for streaming updates, providing deterministic instant updates | Code | `chat-queries.ts` — `updateHistoryMessages()`, `appendHistoryMessage()`, `updateSessionLastMessage()` | High | Performance / streaming | Direct | Same TQ version, same pattern applies to NaW |
| WC-A3-C02 | Content-based `memo()` on MessageItem ensures only the streaming message re-renders per chunk; all other messages are skipped | Code | `message-item.tsx` — `areMessagesEqual()`, `toolCallsSignature()`, `toolResultsSignature()` | High | Performance / streaming | Direct | Pattern is framework-agnostic React optimization |
| WC-A3-C03 | Scroll container uses `createPortal()` to separate shell rendering from content rendering, preventing scroll component re-renders during streaming | Code | `chat-container.tsx` — `MemoizedChatContainerShell`, `ChatContainerPortal` | High | Performance | Direct | Same Base UI ScrollArea, directly applicable |
| WC-A3-C04 | Composer uses `useRef` for input value to avoid keystroke-triggered re-renders in parent components | Code | `chat-composer.tsx` — `valueRef = useRef('')` | High | Performance | Direct | Universal React pattern |
| WC-A3-C05 | UI state (sidebar collapsed) is stored in TQ cache as a virtual query with `staleTime: Infinity` | Code | `chat-ui.ts` — `chatUiQueryKey`, `getChatUiState()`, `setChatUiState()` | High | State management | Adaptable | Works for minimal UI state; Zustand better for multiple concerns |
| WC-A3-C06 | Zustand is used exclusively for persisted client-side preferences (settings, pinned sessions) with `persist` middleware | Code | `use-chat-settings.ts` (Zustand+persist), `use-pinned-sessions.ts` (Zustand+persist) | High | State management | Direct | Same Zustand usage as NaW |
| WC-A3-C07 | Cross-route navigation state uses module-scoped `let` variables that survive React navigation but don't trigger re-renders | Code | `pending-send.ts` — `let pendingSend`, `let pendingGeneration`, `let recentSession` | High | Architecture | Adaptable | NaW uses Next.js router (different navigation model) |
| WC-A3-C08 | Session tombstones use time-limited (8s TTL) client-side filtering to prevent deleted sessions from reappearing during polling | Code | `session-tombstones.ts` — `TOMBSTONE_TTL_MS = 8000`, `filterSessionsWithTombstones()` | High | State management | Adaptable | NaW uses Convex real-time subscriptions, may not need this |
| WC-A3-C09 | History `queryFn` preserves optimistic and streaming messages during refetch by extracting them before fetch and merging them back after | Code | `use-chat-history.ts` — `fetchHistoryForSession()`, `mergeOptimisticHistoryMessages()`, `mergeStreamingHistoryMessages()` | High | State management / streaming | Adaptable | Different transport (Vercel AI SDK) but same merge problem |
| WC-A3-C10 | `useChatHistory` uses a string signature to stabilize array references and prevent unnecessary downstream re-renders from background refetches | Code | `use-chat-history.ts` — `stableHistorySignatureRef`, signature computation | Medium | Performance | Direct | Useful if TQ refetches cause unnecessary re-renders |
| WC-A3-C11 | No virtualization is used; messages are capped at 200 via API limit parameter | Code + convention | `chat-queries.ts` — `limit: '200'`, `chat-message-list.tsx` — no virtualization imports | High | Performance (limitation) | N/A | NaW should use virtualization for multi-model comparison |
| WC-A3-C12 | Three-layer dedup in streaming (event keys, payload keys, stale run events) prevents duplicate processing with 4000-entry caps | Code | `use-chat-stream.ts` — `shouldSkipDuplicateEvent()`, `shouldSkipDuplicatePayload()`, `shouldSkipStaleRunEvent()` | High | Streaming reliability | Adaptable | Dedup concept applies; specific implementation tied to gateway protocol |
| WC-A3-C13 | Gateway client uses reference-counted connection pooling via module-scoped Map | Code | `gateway.ts` — `sharedGatewayClients`, `acquireGatewayClient()`, `releaseGatewayClient()` | High | Architecture | Non-transferable | NaW connects directly to AI providers via Vercel AI SDK |
| WC-A3-C14 | EventSource reconnection uses linear backoff (1s, 2s, ..., 8s cap) with history refresh on successful reconnect | Code | `use-chat-stream.ts` — `handleStreamError()`, `handleStreamOpen()` | Medium | Reliability | Adaptable | Concept of reconnect+catchup applies to any streaming transport |
| WC-A3-C15 | No debouncing or batching of streaming updates; every SSE event triggers full pipeline | Code (absence) | `use-chat-stream.ts` — direct `queryClient.setQueryData()` per event, no `requestAnimationFrame` batching | Medium | Performance (concern) | N/A | Should consider batching for high-frequency streaming |

## Uncertainty & Falsification

### Top 3 Unresolved Questions

1. **What is the actual re-render cost at scale?** The memo check analysis (Section 5) is theoretical. Without profiling with React DevTools on a 200-message conversation during streaming, the actual frame budget impact is unknown. The O(N × text_length) estimate for memo checks could be higher if messages have many content parts.

2. **Does Streamdown actually provide incremental parsing for Shiki?** The markdown component uses `<Streamdown>` which suggests streaming-optimized rendering, but without examining streamdown's internals, it's unclear whether Shiki re-highlights the entire code block or only the new delta. If full re-highlight, this is the biggest bottleneck.

3. **How does the gateway handle high-throughput streaming?** The SSE relay (`/api/stream`) is a pass-through from gateway WebSocket events. If the gateway sends 50+ events/second (fast token generation), does the server batch them? Does the EventSource backpressure? The client has no throttling.

### Falsification Criteria

- **WC-A3-C02 would be weakened** if React's concurrent mode or automatic batching already prevents non-streaming message re-renders without the custom memo comparator. (Test: remove `areMessagesEqual`, profile.)
- **WC-A3-C03 would be irrelevant** if Base UI's ScrollArea internally memoizes its children or if the scroll components are pure/lightweight enough that re-renders are negligible.
- **WC-A3-C04 would be unnecessary** if React 19's automatic batching means `useState` for composer input no longer causes cascading re-renders.
- **WC-A3-C10 would be unnecessary** if TanStack Query v5's structural sharing already prevents new object references when data is unchanged.

### Claims Based on Inference

- WC-A3-C15 (no debouncing) is based on the **absence** of debouncing code, not on confirmed jank. It's possible that React's automatic batching + browser compositing makes debouncing unnecessary at typical streaming rates.
- The cost analysis in Section 9 is theoretical. Actual bottleneck identification requires profiling.

## Recommendations Preview

### 1. ADOPT: Content-Based Message Memoization

**Transferability**: Direct
**Evidence**: WC-A3-C02
**Impact**: Critical for streaming performance. NaW currently re-renders all messages during streaming (based on `use-chat-core.ts` monolithic pattern). Implementing per-message `memo()` with content-based equality would reduce per-chunk DOM work from O(N) to O(1).

### 2. ADOPT: Ref-Based Composer Input

**Transferability**: Direct
**Evidence**: WC-A3-C04
**Impact**: Prevents keystroke-triggered cascading re-renders. Check if NaW's composer already uses refs. If using `useState` for input value, switch to `useRef`.

### 3. ADAPT: Direct TQ Cache Manipulation for Streaming

**Transferability**: Adaptable (different transport)
**Evidence**: WC-A3-C01, WC-A3-C09
**Impact**: NaW uses Vercel AI SDK's `useChat`, which manages its own state. The principle (write streaming data directly into cache, don't invalidate) should inform how we interface with `useChat`'s state and our TQ cache. Specific implementation will differ.

### 4. ADAPT: Portal-Based Scroll Container

**Transferability**: Direct (same ScrollArea library)
**Evidence**: WC-A3-C03
**Impact**: If NaW's scroll container re-renders during streaming, this pattern would help. Measure first — if scroll re-renders aren't a bottleneck, skip.

### 5. SKIP: UI State in TQ Cache

**Transferability**: Adaptable but inadvisable
**Evidence**: WC-A3-C05
**Impact**: NaW has more UI state than WebClaw and already uses Zustand. Storing UI state in TQ cache adds semantic confusion for no meaningful benefit.

---

*Research completed February 15, 2026. Based on WebClaw repository at [github.com/ibelick/webclaw](https://github.com/ibelick/webclaw) (main branch, ~80 commits). All source references are from `apps/webclaw/src/` unless otherwise noted.*
