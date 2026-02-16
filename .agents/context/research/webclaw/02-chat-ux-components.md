# Chat UX, Streaming & Components — WebClaw Deep Dive

> **Agent**: Agent 2 — Chat UX, Streaming & Components
> **Phase**: 1 (parallel)
> **Status**: Complete
> **Date**: February 15, 2026

---

## Summary

WebClaw's chat implementation is a masterclass in focused component architecture for an AI chat client. The codebase delivers a **prompt-kit component library** (9 files, ~1,200 LOC) of headless-ish chat primitives, **13 single-responsibility hooks** (~1,800 LOC) that decompose chat logic into composable units, and a **ChatScreen orchestrator** (~450 LOC) that wires everything together. The streaming pipeline uses **EventSource (SSE) → TanStack Query cache → Streamdown + Shiki** for progressive markdown rendering. Base UI wrappers (13 files) follow a consistent pattern: thin `cn()` styling layers over `@base-ui/react` primitives with CVA for variants. The codebase is remarkably disciplined — every component is memoized with custom equality functions, prompt input state is kept local to the composer, and the chat container uses `createPortal` to isolate scroll container re-renders. The hook decomposition pattern is the single most transferable finding for NaW: it demonstrates how to break a monolithic chat hook into 13 focused hooks that each own one concern.

---

## 1. Prompt-Kit Component Library

The `components/prompt-kit/` directory contains 9 focused chat UI primitives. This is not a general-purpose design system — it is purpose-built for AI chat interfaces.

### 1.1 ChatContainer (`chat-container.tsx`, ~160 LOC)

**Source**: [chat-container.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/chat-container.tsx)

**Architecture**: Three sub-components using a **portal + memoization** pattern:

| Export | Role |
|--------|------|
| `ChatContainerRoot` | Outer wrapper; manages scroll ref, viewport ref, user scroll events |
| `ChatContainerContent` | Inner content area with padding and max-width constraints |
| `ChatContainerScrollAnchor` | Empty div at the bottom for scroll-to-bottom anchoring |

**Key pattern — Portal-based scroll isolation** (WC-A2-C01): The `ChatContainerShell` wraps the Base UI `ScrollArea` primitives and is memoized with a custom `areShellPropsEqual` function. Content is injected via `createPortal` into the viewport node:

```typescript
function ChatContainerPortal({ viewportNode, children }) {
  if (!viewportNode) return null
  return createPortal(
    <div className="flex flex-col gap-6">{children}</div>,
    viewportNode,
  )
}
```

This means the scroll container shell **never re-renders when messages change** — only the portal content updates. The shell's `MemoizedChatContainerShell` uses deep equality on `viewportProps` to prevent unnecessary re-renders.

**Quality**: High. The custom `areViewportPropsEqual` does key-by-key shallow comparison, and `areShellPropsEqual` checks className, refs, and viewport props. The `useLayoutEffect` for scroll event binding is correctly cleaned up.

**Limitation**: No virtualization — all messages are rendered in the DOM. Fine for WebClaw's scope (single-agent chats) but would not scale for NaW's long multi-model conversations.

### 1.2 Markdown (`markdown.tsx`, ~120 LOC)

**Source**: [markdown.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/markdown.tsx)

**Architecture**: A `memo`-wrapped component that renders markdown using the **Streamdown** library with custom HTML element mappings.

**Key pattern — Streamdown with component overrides** (WC-A2-C02): Instead of using `react-markdown` or `rehype`, they use `Streamdown` — a streaming-optimized markdown parser. Each HTML element gets a custom React component:

```typescript
const INITIAL_COMPONENTS = {
  code: function CodeComponent({ className, children }) {
    const isInline = !className?.includes('language-')
    if (isInline) return <code className="...">{children}</code>
    const language = extractLanguage(className)
    return <CodeBlock content={children as string} language={language} />
  },
  pre: function PreComponent({ children }) { return <>{children}</> },
  h1: function H1Component({ children }) { return <h1 className="text-xl font-medium ...">{children}</h1> },
  // ... 15+ more element mappings
}
```

**Typography conventions visible here**:
- Headings: `text-xl font-medium` (h1), `text-lg font-medium` (h2), `text-base font-medium` (h3) — **never bolder than `font-medium`**
- Body text: `text-sm leading-relaxed` with `text-pretty` utility
- Lists: proper `list-disc`/`list-decimal` with `ml-6 space-y-2`
- Links: `text-primary-700 underline underline-offset-4 hover:text-primary-900`
- Tables: Full table styling with borders, alternating row backgrounds

**Streaming optimization**: Streamdown is designed for progressive rendering — it can parse partial markdown (mid-stream) without breaking. This is critical for chat UX where tokens arrive one at a time.

**Quality**: Very good component mapping. The `extractLanguage` helper is clean. Memoized at the component level with `React.memo`.

### 1.3 CodeBlock (`code-block/index.tsx` + `code-block/utils.ts`, ~200 LOC)

**Source**: [code-block/index.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/code-block/index.tsx)

**Architecture**: Lazy-loaded Shiki highlighter with singleton initialization, theme-aware rendering, and copy-to-clipboard.

**Key pattern — Singleton Shiki highlighter** (WC-A2-C03):

```typescript
let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [vitesseLight, vitesseDark],
      langs: [langJavascript, langTypescript, langPython, /* ... 28 total */],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}
```

**Language support**: 30 languages loaded (JS, TS, TSX, JSX, Python, Bash, Shell, JSON, YAML, TOML, Markdown, HTML, CSS, SQL, Rust, Go, Java, Kotlin, Swift, Ruby, PHP, C, C++, C#, Dockerfile, Diff, GraphQL, Regexp, XML). Language normalization handles aliases (`js` → `javascript`, `sh` → `bash`, etc.).

**Streaming behavior**: During streaming, the code block falls back to unstyled `<pre>` until the highlighter resolves. The `useEffect` dependency on `content` means it re-highlights as tokens arrive, but the fallback prevents layout shift.

**Quality**: Good. The singleton pattern prevents multiple highlighter initializations. Theme-awareness via `useResolvedTheme()` hook. The `active` flag in `useEffect` cleanup prevents stale updates. Copy button with 1.6s checkmark feedback.

### 1.4 PromptInput (`prompt-input.tsx`, ~250 LOC)

**Source**: [prompt-input.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/prompt-input.tsx)

**Architecture**: Compound component with **two React contexts** — one for value state, one for UI state — plus a global keyboard listener.

| Export | Role |
|--------|------|
| `PromptInput` | Root container; provides both contexts |
| `PromptInputTextarea` | Auto-sizing textarea with Enter-to-submit |
| `PromptInputActions` | Action button container |
| `PromptInputAction` | Individual action button with tooltip wrapper |

**Key pattern — Dual context split** (WC-A2-C04): Separating value context from UI context means that changing `isLoading` doesn't re-render the textarea, and typing doesn't re-render action buttons:

```typescript
const PromptInputValueContext = createContext<PromptInputValueContextType>({
  value: '', setValue: () => {}, maxHeight: 240, textareaRef: ...
})
const PromptInputUiContext = createContext<PromptInputUiContextType>({
  isLoading: false, onSubmit: undefined, disabled: false,
})
```

**Key pattern — Global prompt focus** (WC-A2-C05): A global `keydown` listener auto-focuses the textarea when the user types printable characters anywhere on the page (unless they're already in an editable element):

```typescript
function bindGlobalPromptListener() {
  if (isGlobalListenerBound) return
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
    if (!event.key.length === 1 && event.key !== 'Backspace') return
    globalPromptTarget?.focus()
  })
}
```

**Auto-sizing**: Uses `useLayoutEffect` to measure `scrollHeight` and clamp to `maxHeight` (default 240px). The `adjustHeight` function sets `height: auto` first, then measures, then sets the clamped height.

**Ref pattern**: Uses `valueRef` and `setValueRef` as mutable refs for imperative access from parent — allows the composer to read/set value without causing re-renders through prop changes.

**Quality**: Excellent. The dual context is a strong performance optimization. The `MemoizedPromptInputAction` prevents tooltip re-renders. The global focus listener is a nice UX touch.

### 1.5 Message (`message.tsx`, ~120 LOC)

**Source**: [message.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/message.tsx)

**Architecture**: Five sub-components for flexible message composition:

| Export | Role |
|--------|------|
| `Message` | Outer flex container |
| `MessageAvatar` | Avatar with Base UI `Avatar` primitive (image + fallback) |
| `MessageContent` | Content wrapper; optionally renders as `Markdown` |
| `MessageActions` | Actions container (copy, regenerate, etc.) |
| `MessageAction` | Individual action button with tooltip |

**Key pattern — Markdown opt-in** (WC-A2-C06): `MessageContent` accepts a `markdown` boolean prop. When true, it renders children through the `Markdown` component. When false, it renders as a plain div. This allows user messages (plain text) and assistant messages (markdown) to use the same component:

```typescript
function MessageContent({ children, markdown = false, className, ...props }) {
  return markdown ? (
    <Markdown className={classNames} {...props}>{children as string}</Markdown>
  ) : (
    <div className={classNames} {...props}>{children}</div>
  )
}
```

**Quality**: Clean composition pattern. Direct use of Base UI's `Avatar` primitive (not wrapped in `/ui/`). The tooltip wrapping in `MessageAction` uses the same pattern as `PromptInputAction`.

### 1.6 Thinking (`thinking.tsx`, ~45 LOC)

**Source**: [thinking.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/thinking.tsx)

**Architecture**: Simple collapsible wrapper using the `Collapsible` UI component. Displays AI thinking/reasoning content in a collapsed panel.

```typescript
function Thinking({ content }: { content: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger>
        <Button variant="ghost" size="sm"><ArrowDown01Icon /> Thinking</Button>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <p className="text-primary-600 text-sm whitespace-pre-wrap">{content}</p>
      </CollapsiblePanel>
    </Collapsible>
  )
}
```

**Quality**: Minimal and effective. Defaults to collapsed (user must click to expand). No streaming-specific behavior — the content is a string that updates as thinking tokens arrive. NaW's thinking display could adopt this simplicity.

### 1.7 Tool (`tool.tsx`, ~120 LOC)

**Source**: [tool.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/tool.tsx)

**Architecture**: Collapsible tool call display with state-aware rendering. Accepts a `ToolPart` type with four states: `input-streaming`, `input-available`, `output-available`, `output-error`.

**Key pattern — Tool state machine** (WC-A2-C07):

```typescript
type ToolPart = {
  type: string
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  toolCallId?: string
  errorText?: string
}
```

The component renders different sections based on state: input section (key-value pairs), output section (JSON or text), error section (red text), and a "Processing..." indicator during `input-streaming`.

**Quality**: Good. JSON values are pretty-printed with `JSON.stringify(formatted, null, 2)`. Tool call ID is truncated to 16 chars. Defaults to collapsed (`defaultOpen = false`), so tool calls don't clutter the conversation.

### 1.8 ScrollButton (`scroll-button.tsx`, ~85 LOC)

**Source**: [scroll-button.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/scroll-button.tsx)

**Architecture**: A scroll-to-bottom button that appears/disappears based on scroll position. Uses a **MutationObserver** to detect content changes that might affect scroll position.

**Key pattern — MutationObserver for content-aware scroll detection** (WC-A2-C08):

```typescript
useLayoutEffect(() => {
  const observer = new MutationObserver(() => {
    if (element.scrollTop !== lastScrollTopRef.current) {
      lastScrollTopRef.current = element.scrollTop
    }
    checkIsAtBottom()
  })
  element.addEventListener('scroll', handleScroll)
  observer.observe(element, { childList: true, subtree: true })
  return () => { element.removeEventListener('scroll', handleScroll); observer.disconnect() }
}, [])
```

The button has a 200ms delay before showing (to avoid flickering during streaming), and a 100px threshold for "at bottom" detection.

**Quality**: Good. The dual scroll-event + mutation-observer approach catches both user scrolling and content additions (streaming). The delay timer prevents flash-of-button during rapid updates. Note: they did NOT use the `use-stick-to-bottom` library mentioned in their AGENTS.md — this is a custom implementation.

### 1.9 TypingIndicator + TextShimmer (`typing-indicator.tsx` + `text-shimmer.tsx`, ~50 LOC)

**Source**: [typing-indicator.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/typing-indicator.tsx), [text-shimmer.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/text-shimmer.tsx)

**Architecture**: `TypingIndicator` combines three animated dots with a `TextShimmer` "Generating..." label. `TextShimmer` is a pure CSS animation using `background-clip: text` with a shimmer gradient.

```typescript
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="flex items-center gap-1">
        {/* Three dots with staggered animation-delay via Tailwind */}
        <span className="... animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="... animate-pulse" style={{ animationDelay: '300ms' }} />
        <span className="... animate-pulse" style={{ animationDelay: '600ms' }} />
      </div>
      <TextShimmer duration={4} spread={20}>Generating...</TextShimmer>
    </div>
  )
}
```

**TextShimmer** uses CSS `@property` for the shimmer angle with a `background: linear-gradient` that clips to text. The `spread` prop controls gradient width (clamped 5-45 degrees).

**Quality**: Clean and lightweight. Pure CSS animation — no JavaScript animation library needed for this simple effect.

---

## 2. Chat Hooks Decomposition (13 Hooks)

The `screens/chat/hooks/` directory contains 13 single-responsibility hooks totaling ~1,800 LOC. This is the most architecturally significant pattern in the WebClaw codebase.

### 2.1 Hook Dependency Map

```
ChatScreen (orchestrator)
├── useChatMeasurements ──── DOM measurements (header/composer heights)
├── useChatMobile ────────── Responsive detection (matchMedia 768px)
├── useChatSessions ──────── Session list (TanStack Query + tombstone filtering)
├── useChatHistory ───────── Message history (TanStack Query + optimistic merge)
├── useChatStream ────────── SSE streaming (EventSource + cache updates)
├── useChatPendingSend ───── Optimistic send recovery after navigation
├── useChatGenerationGuard ─ Timeout safety net (120s guard timer)
├── useChatRedirect ──────── Navigation logic (dead sessions → /new)
├── shouldRedirectToConnect ─ Gateway auth check (pure function, not hook)
├── useChatSettings (screen) ─ Settings dialog state + paths API
├── useDeleteSession ─────── Session deletion (TanStack Mutation + tombstones)
├── useRenameSession ─────── Session rename (TanStack Mutation + optimistic)
└── useSessionShortcuts ──── Keyboard shortcuts (Cmd+K search, Cmd+Shift+O new)
```

### 2.2 Detailed Hook Analysis

#### `use-chat-stream.ts` (~400 LOC) — Core Streaming

**Source**: [use-chat-stream.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-stream.ts)

**Responsibility**: Establishes SSE connection, processes gateway events, deduplicates messages, merges streaming content into TanStack Query cache.

**Key patterns** (WC-A2-C09):
- **EventSource for streaming**: Not WebSocket — uses standard SSE via `/api/stream?sessionKey=...&friendlyId=...`
- **Six deduplication refs**: `streamRunSeqRef`, `streamRunStateVersionRef`, `streamRunSourceRef`, `streamSeenEventKeysRef`, `streamSeenPayloadKeysRef` track seen events to prevent duplicates
- **Content merging via `partIdentity`**: Messages are merged by identity (`text` → one part, `thinking` → one part, `toolCall:id:name` → unique per tool)
- **Agent vs Chat event priority**: `agent` events override `chat` events for the same runId
- **Auto-reconnection**: Exponential backoff (1s, 2s, 4s, 8s max) on error
- **State transitions**: `delta` → streaming, `final`/`error`/`aborted` → terminal

**Complexity**: This is the most complex hook. The `upsert` function (~60 lines) handles message insertion with multiple merge strategies: by ID, by streamRunId, by timestamp proximity (15s window), and by text content similarity.

**Quality**: Very robust deduplication. The `streamSeenEventKeysRef` and `streamSeenPayloadKeysRef` sets auto-clear at 4000 entries to prevent memory leaks. The `extractChatPayloadsFromAgentPayload` function properly handles all gateway event types (assistant text, thinking, lifecycle, tool calls/results).

#### `use-chat-history.ts` (~220 LOC) — History Management

**Source**: [use-chat-history.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-history.ts)

**Responsibility**: Fetches history, preserves optimistic/streaming messages during refetch, provides stable message reference.

**Key pattern — Stable history signature** (WC-A2-C10):

```typescript
const stableHistorySignatureRef = useRef('')
const stableHistoryMessagesRef = useRef<Array<GatewayMessage>>([])

const historyMessages = useMemo(() => {
  const messages = historyQuery.data?.messages ?? []
  const last = messages.at(-1)
  const signature = `${messages.length}:${lastRole}:${lastId}:${lastText.slice(-32)}:${lastContentSignature}`
  if (signature === stableHistorySignatureRef.current) {
    return stableHistoryMessagesRef.current  // Return same reference
  }
  stableHistorySignatureRef.current = signature
  stableHistoryMessagesRef.current = messages
  return messages
}, [historyQuery.data?.messages])
```

This ensures the message array reference only changes when content actually changes, preventing unnecessary re-renders downstream.

**Key pattern — Optimistic + streaming message preservation** (WC-A2-C11): When refetching history from server, the hook extracts optimistic and streaming messages from the current cache, fetches server data, then merges them back:

```typescript
const optimisticMessages = cachedMessages.filter(m => m.status === 'sending' || m.__optimisticId || m.clientId)
const streamingMessages = cachedMessages.filter(m => m.__streamRunId)
const serverData = await fetchHistory(...)
return { messages: mergeStreamingHistoryMessages(mergeOptimisticHistoryMessages(serverData.messages, optimisticMessages), streamingMessages) }
```

**Quality**: Excellent. The signature-based stability check is a clever optimization. The three-way merge (server + optimistic + streaming) handles edge cases well.

#### `use-chat-sessions.ts` (~55 LOC) — Session List

**Source**: [use-chat-sessions.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-sessions.ts)

**Responsibility**: Fetches session list, filters with tombstones, derives active session metadata.

**Key detail**: `refetchInterval: 30000` (30s polling for session list updates). Sessions are filtered through `filterSessionsWithTombstones` to hide recently-deleted sessions before the server acknowledges the deletion.

**Quality**: Clean and focused. Good use of `useMemo` for derived values.

#### `use-chat-error-state.ts` (~25 LOC) — Error Classification

**Source**: [use-chat-error-state.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-error-state.ts)

**Responsibility**: Pure function (not a hook) that determines if the user should be redirected to the `/connect` page based on error messages. Checks for missing gateway auth patterns.

**Quality**: Simple and correct. The `shouldRedirectToConnect` name clearly communicates intent.

#### `use-chat-generation-guard.ts` (~35 LOC) — Timeout Safety

**Source**: [use-chat-generation-guard.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-generation-guard.ts)

**Responsibility**: Sets a 120-second timeout when `waitingForResponse` is true. If no response arrives, it force-refreshes history and clears the waiting state.

**Quality**: Essential safety net. Prevents the UI from being stuck in a "generating" state forever if the stream drops without a terminal event.

#### `use-chat-measurements.ts` (~50 LOC) — DOM Layout

**Source**: [use-chat-measurements.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-measurements.ts)

**Responsibility**: Measures header and composer heights using `ResizeObserver`, sets CSS custom properties, calculates `pinGroupMinHeight` for message pinning behavior.

**Key pattern**: Uses CSS custom properties (`--chat-header-height`, `--chat-composer-height`) on the main container, allowing other components to reference these values without prop drilling.

**Quality**: Good. `ResizeObserver` is the correct API for responsive measurement. Clean cleanup.

#### `use-chat-mobile.ts` (~20 LOC) — Responsive Detection

**Source**: [use-chat-mobile.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-mobile.ts)

**Responsibility**: Detects mobile viewport (768px breakpoint) via `matchMedia`, auto-collapses sidebar on mobile.

**Quality**: Simple and effective. Uses `matchMedia` listener (not resize event) for efficient detection.

#### `use-chat-pending-send.ts` (~75 LOC) — Optimistic Navigation

**Source**: [use-chat-pending-send.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-pending-send.ts)

**Responsibility**: Recovers pending messages after navigation (e.g., when creating a new session redirects to `/chat/$sessionKey`). Consumes stashed pending sends and replays them.

**Key pattern — Navigation-safe optimistic sends** (WC-A2-C12): When a user sends a message on `/new`, the app creates a session (async), stashes the message, navigates to `/chat/$id`, and this hook picks up the stashed message and sends it. This prevents message loss during navigation.

**Quality**: Good. Handles the edge case of duplicate optimistic messages (checks `alreadyHasOptimistic`).

#### `use-chat-redirect.ts` (~40 LOC) — Navigation Logic

Handles redirecting to `/new` when the active session no longer exists (deleted by another tab, etc.).

#### `use-chat-settings.ts` (screen-level, ~60 LOC) — Settings Dialog

Manages settings dialog open/close state and fetches system paths from `/api/paths`.

#### `use-delete-session.ts` (~80 LOC) — Session Deletion

**Source**: [use-delete-session.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-delete-session.ts)

**Key pattern — Tombstone-based optimistic deletion** (WC-A2-C13): Uses `markSessionDeleted` to immediately hide the session, then `useMutation` with `onMutate`/`onError`/`onSuccess` for full optimistic update lifecycle:

```typescript
onMutate: async function(payload) {
  markSessionDeleted(payload.sessionKey || payload.friendlyId)
  await queryClient.cancelQueries({ queryKey: chatQueryKeys.sessions })
  const previousSessions = queryClient.getQueryData(chatQueryKeys.sessions)
  removeSessionFromCache(queryClient, payload.sessionKey, payload.friendlyId)
  return { previousSessions }
},
onError: function(err, _payload, context) {
  queryClient.setQueryData(chatQueryKeys.sessions, context.previousSessions)
  clearSessionDeleted(...)
}
```

**Quality**: Textbook optimistic update with rollback. Clean separation of concerns.

#### `use-rename-session.ts` (~65 LOC) — Session Rename

Same optimistic mutation pattern as delete. Updates `label` and `title` in cache immediately, rolls back on error.

#### `use-session-shortcuts.ts` (~30 LOC) — Keyboard Shortcuts

Uses `@tanstack/react-hotkeys` for `Cmd+K` (search sessions) and `Cmd+Shift+O` (new session). Properly excludes editable targets.

---

## 3. Chat Screen Components

### 3.1 ChatScreen Orchestrator (`chat-screen.tsx`, ~450 LOC)

**Source**: [chat-screen.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/chat-screen.tsx)

**Architecture**: The orchestrator composes all 13 hooks and passes results to 4 child components:

```
ChatScreen
├── ChatSidebar (sessions list, settings, search)
├── ChatHeader (title, context meter, export)
├── ChatMessageList (messages, typing indicator, pinning)
└── ChatComposer (input, attachments, send button)
```

**Key pattern — Prop drilling over context** (WC-A2-C14): The ChatScreen does NOT use React context for chat state. Instead, it calls hooks at the top level and passes results as props. This is a deliberate choice: it makes data flow explicit and avoids the re-render cascade of context value changes.

**State owned by ChatScreen**:
- `sending`, `creatingSession`, `isRedirecting` — UI flags
- `waitingForResponse`, `pinToTop` — generation lifecycle
- `pendingRunIdsRef`, `pendingRunTimersRef` — run tracking

**Message sending flow**:
1. User types in composer, hits Enter
2. `send()` callback checks if `isNewChat`
3. If new: creates optimistic message → `createSessionForMessage()` → stash pending send → navigate to `/chat/$id`
4. If existing: `sendMessage()` → POST to `/api/send` → optimistic message in cache → await `runId` from response → `startRun()` with 120s timer

**Quality**: Well-organized but the file is the longest in the chat module. The `sendMessage` function (~50 LOC) could arguably be extracted to its own hook. The `finishRun`/`startRun`/`finishAllRuns` callbacks are clean run lifecycle management.

### 3.2 ChatComposer (`chat-composer.tsx`, ~120 LOC)

**Source**: [chat-composer.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/components/chat-composer.tsx)

**Architecture**: Memoized wrapper around `PromptInput` with attachment support.

**Key pattern — Local state isolation** (WC-A2-C15): The composer keeps `attachments`, `valueRef`, and `setValueRef` as local state/refs. The parent ChatScreen never has access to the raw input value — only the `onSubmit` callback receives the final text and attachments.

```typescript
const valueRef = useRef<string>('')
const setValueRef = useRef<((value: string) => void) | null>(null)
```

This prevents the entire chat screen from re-rendering on every keystroke. The parent can still imperatively set the value (e.g., after an error) via the `helpers.setValue` callback.

**Quality**: Excellent isolation pattern. The `MemoizedChatComposer = memo(ChatComposerComponent)` prevents re-renders when parent state changes (e.g., new messages arriving).

### 3.3 ChatMessageList (`chat-message-list.tsx`, ~200 LOC)

**Source**: [chat-message-list.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/components/chat-message-list.tsx)

**Architecture**: Renders messages inside `ChatContainerRoot`, with **pin-to-top** behavior for the latest user+assistant exchange.

**Key pattern — Message pinning** (WC-A2-C16): When `pinToTop` is true, the last user message is scrolled to the top of the viewport using `scrollIntoView({ block: 'start' })`. This creates a ChatGPT-like experience where new responses grow downward from the user's message:

```typescript
if (pinToTop) {
  if (shouldPin && lastUserRef.current) {
    programmaticScroll.current = true
    lastUserRef.current.scrollIntoView({ behavior: 'auto', block: 'start' })
  }
  return
}
// Otherwise scroll to bottom anchor
anchorRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
```

**Tool result linking**: The component builds a `linkedToolCallIds` set and `toolResultsByCallId` map to associate tool results with their call messages, preventing duplicate rendering.

**Custom memo equality**: `areChatMessageListEqual` does prop-by-prop shallow comparison, including `contentStyle` reference equality.

**Quality**: Good. The pin-to-top behavior is a significant UX feature. The `programmaticScroll` ref prevents the scroll button from flickering during programmatic scrolls.

### 3.4 MessageItem (`message-item.tsx`, ~300 LOC)

**Source**: [message-item.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/components/message-item.tsx)

**Architecture**: The most complex chat component. Renders user messages, assistant messages (with thinking + text + tool calls), and standalone tool results.

**Key pattern — Content-based memo equality** (WC-A2-C17):

```typescript
function areMessagesEqual(prev, next) {
  if (prev.forceActionsVisible !== next.forceActionsVisible) return false
  if (textFromMessage(prev.message) !== textFromMessage(next.message)) return false
  if (thinkingFromMessage(prev.message) !== thinkingFromMessage(next.message)) return false
  if (toolCallsSignature(prev.message) !== toolCallsSignature(next.message)) return false
  if (toolResultsSignature(prev.message, prev.toolResultsByCallId) !== ...) return false
  if (rawTimestamp(prev.message) !== rawTimestamp(next.message)) return false
  return true
}
```

This is **content-based equality** rather than reference equality. It computes text, thinking, tool call, and tool result signatures and only re-renders when actual content changes. This is critical during streaming — the message object reference changes on every token, but only the last message actually needs to re-render.

**Rendering logic**: Assistant messages iterate over `content` parts in order (thinking → text → toolCall), respecting `showReasoningBlocks` and `showToolMessages` settings.

**Quality**: Excellent memoization strategy. The signature functions are well-designed. Image attachment rendering is also handled for user messages.

### 3.5 ChatSidebar (`chat-sidebar.tsx`, ~250 LOC)

**Source**: [chat-sidebar.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/components/chat-sidebar.tsx)

**Architecture**: Collapsible sidebar with session list, search (command dialog), settings, and rename/delete dialogs.

**Animation**: Uses `motion/react` `AnimatePresence` for sidebar collapse/expand transitions (150ms duration, `easeIn`/`easeOut`).

**Custom memo equality**: `areSidebarPropsEqual` with `areSessionsEqual` that does key-by-key comparison of session metadata (key, friendlyId, label, title, derivedTitle, updatedAt).

**Quality**: Good. The sidebar is well-organized with clear action handlers. The keyboard shortcuts (`useSessionShortcuts`) are properly integrated.

### 3.6 Other Components

- **ContextMeter** (`context-meter.tsx`): Token usage progress bar using Base UI's `PreviewCard` as a hover tooltip. Shows percentage used/left with formatted token counts (e.g., "128K / 200K").
- **GatewayStatusMessage** (`gateway-status-message.tsx`): Error display for gateway connection issues. Shows connection instructions and retry button.
- **SettingsDialog** (`settings-dialog.tsx`): Full settings UI using Base UI Dialog, Switch, and Tabs. Configures theme (system/light/dark), thinking level (low/medium/high), and display toggles (tool messages, reasoning blocks).

---

## 4. Base UI Usage Patterns

WebClaw uses 13 Base UI primitives from `@base-ui/react`. All wrappers follow the same pattern.

### 4.1 Wrapper Pattern

Every UI component in `components/ui/` follows this structure:

```typescript
'use client'
import { PrimitiveName } from '@base-ui/react/primitive-name'
import { cn } from '@/lib/utils'

function WrappedComponent({ className, ...props }: PrimitiveName.Props) {
  return <PrimitiveName.Root className={cn('tailwind-classes', className)} {...props} />
}
```

**Key characteristics**:
1. **Thin styling wrappers**: Each file adds Tailwind classes to Base UI primitives, nothing more
2. **`cn()` for class merging**: Uses `clsx` + `tailwind-merge` (standard pattern)
3. **`'use client'` directive**: All UI components are client components
4. **TypeScript types**: Props derived from Base UI's own types via `ComponentProps<typeof Primitive.SubComponent>`
5. **No additional logic**: No state management, no event handling beyond Base UI's built-in behavior

### 4.2 CVA Usage (Button only)

Only the `Button` component uses CVA (class-variance-authority):

```typescript
const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center ...',
  {
    variants: {
      size: { default: 'h-9 px-4', sm: 'h-8 px-3', lg: 'h-10 px-5', icon: 'size-9', 'icon-sm': 'size-8', 'icon-md': 'size-10', 'icon-xl': 'size-11' },
      variant: { default: 'bg-primary-950 ...', secondary: '...', outline: '...', ghost: '...', destructive: '...' },
    },
    defaultVariants: { size: 'default', variant: 'default' },
  },
)
```

**Unique feature**: Button uses `useRender` from `@base-ui/react` to support a `render` prop for custom element rendering:

```typescript
function Button({ className, variant, size, render, ...props }) {
  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(defaultProps, props),
    render,
  })
}
```

This allows rendering a `<Link>` or `<a>` as a button — a pattern we should compare with our Shadcn approach.

### 4.3 Component Inventory

| Component | Base UI Primitive | CVA? | Complexity |
|-----------|------------------|------|------------|
| `alert-dialog.tsx` | `AlertDialog` | No | Medium — Backdrop + Popup + Close with `useRender` |
| `autocomplete.tsx` | `Autocomplete` | No | High — Full wrapper with Input, Popup, List, Item, ScrollArea |
| `button.tsx` | `useRender` + `mergeProps` | Yes | Medium — CVA variants + render prop |
| `collapsible.tsx` | `Collapsible` | No | Low — Root + Trigger + Panel |
| `command.tsx` | `Dialog` + `Autocomplete` | No | High — Composite command palette |
| `dialog.tsx` | `Dialog` | No | Medium — Backdrop + Popup + Close |
| `input.tsx` | `Input` | No | Low — Size variants via `cn()` conditional |
| `menu.tsx` | `Menu` | No | Low — Root + Trigger + Content + Item |
| `preview-card.tsx` | `PreviewCard` | No | Low — Hover card with positioner |
| `scroll-area.tsx` | `ScrollArea` | No | Low — Root + Viewport + Scrollbar + Thumb + Corner |
| `switch.tsx` | `Switch` | No | Low — Root + Thumb |
| `tabs.tsx` | `Tabs` | No | Medium — `TabsVariant` union for default/underline styles |
| `tooltip.tsx` | `Tooltip` | No | Low — Provider + Root + Trigger + Content |

### 4.4 Comparison with NaW's Base UI Wrappers

**WebClaw approach**: Thin wrappers, `cn()` styling, very few adding behavior. Only `button` uses CVA. Props are typed from Base UI's own types.

**Key difference**: WebClaw uses `useRender` from Base UI for the Button component, enabling polymorphic rendering without the `asChild` pattern. Their `autocomplete.tsx` is the most complex wrapper — it composes Base UI's Autocomplete with their own ScrollArea and Input components. Their `command.tsx` builds a command palette by composing Dialog + Autocomplete — not using cmdk.

---

## 5. Streaming Markdown Pipeline

### 5.1 Pipeline Architecture

```
Gateway (SSE events) → useChatStream → TanStack Query cache → ChatMessageList → MessageItem → Markdown → Streamdown → CodeBlock → Shiki
```

**Step-by-step flow**:

1. **SSE events arrive** via EventSource in `useChatStream`
2. **Events are deduplicated** using run IDs, sequence numbers, and state versions
3. **Messages are upserted** into TanStack Query cache via `updateHistoryMessages`
4. **ChatMessageList** receives messages via `historyMessages` (with stable reference optimization)
5. **MessageItem** renders each message, memoized with content-based equality
6. **Markdown** (wrapped in `MessageContent`) renders the text through **Streamdown**
7. **Streamdown** parses markdown incrementally, producing HTML elements
8. **CodeBlock** receives code blocks and highlights them via **Shiki** (singleton, lazy-loaded)

### 5.2 Streamdown Specifics (WC-A2-C18)

Streamdown is a streaming-aware markdown parser. Unlike `react-markdown` (which re-parses the entire document on every token), Streamdown:
- Handles **partial markdown** gracefully (unclosed code blocks, incomplete lists)
- Maps HTML elements to **custom React components** via the `components` prop
- Is designed for **progressive rendering** — it updates the DOM incrementally as new tokens arrive

The `Markdown` component wraps Streamdown:
```typescript
function MarkdownComponent({ children, className, components = INITIAL_COMPONENTS }) {
  return (
    <div className={cn('...')}>
      <Streamdown components={components}>{children}</Streamdown>
    </div>
  )
}
```

### 5.3 Shiki Integration (WC-A2-C19)

The Shiki integration is **lazy and singleton**:
- The highlighter promise is created once on first use
- All code blocks share the same highlighter instance
- 30 languages are pre-loaded
- Two themes (vitesse-dark, vitesse-light) switch based on resolved theme
- During initial load or streaming, a plain `<pre>` fallback is shown

**Performance consideration**: The `useEffect` in CodeBlock depends on `content`, meaning it re-highlights on every token during streaming. For large code blocks, this could be expensive. A debounce or "highlight on idle" strategy would be more efficient.

---

## 6. Global Hooks

### 6.1 `use-chat-settings.ts` (Global, ~65 LOC)

**Source**: [hooks/use-chat-settings.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/hooks/use-chat-settings.ts)

**Architecture**: Zustand store with `persist` middleware for localStorage. Stores: `showToolMessages`, `showReasoningBlocks`, `thinkingLevel`, `theme`.

**Key pattern — Selective store subscriptions** (WC-A2-C20):

```typescript
export function useChatSettings() {
  const settings = useChatSettingsStore((state) => state.settings)
  const updateSettings = useChatSettingsStore((state) => state.updateSettings)
  return { settings, updateSettings }
}
```

**Theme resolution**: `useResolvedTheme()` combines the stored theme preference with system preference via `matchMedia`, returning `'dark'` or `'light'`.

### 6.2 `use-export.ts` (~100 LOC)

**Source**: [hooks/use-export.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/hooks/use-export.ts)

**Formats**: Markdown, JSON, and plain text. Reads messages from TanStack Query cache (not a separate API call). Downloads via blob URL + anchor click.

### 6.3 `use-pinned-sessions.ts` (~40 LOC)

**Source**: [hooks/use-pinned-sessions.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/hooks/use-pinned-sessions.ts)

**Architecture**: Zustand store with `persist` middleware. Stores an array of pinned session keys with `pin`/`unpin`/`toggle` actions.

---

## 7. State Management Patterns

### 7.1 Chat UI State in TanStack Query (WC-A2-C21)

**Source**: [chat-ui.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/chat-ui.ts)

WebClaw stores ephemeral UI state (`isSidebarCollapsed`) in TanStack Query cache — not Zustand:

```typescript
export const chatUiQueryKey = ['chat', 'ui'] as const

export function getChatUiState(queryClient: QueryClient): ChatUiState {
  const cached = queryClient.getQueryData<ChatUiState>(chatUiQueryKey)
  return cached ? { ...defaultChatUiState, ...cached } : defaultChatUiState
}

export function setChatUiState(queryClient: QueryClient, updater: (state: ChatUiState) => ChatUiState) {
  queryClient.setQueryData(chatUiQueryKey, updater)
}
```

**Trade-off**: This avoids adding another Zustand store for one boolean. But it couples UI state to the query client, which is unusual.

### 7.2 TanStack Query Key Design (WC-A2-C22)

```typescript
export const chatQueryKeys = {
  sessions: ['chat', 'sessions'] as const,
  history: (friendlyId: string, sessionKey: string) => ['chat', 'history', friendlyId, sessionKey] as const,
}
```

Clean, simple, predictable. The `history` key uses both `friendlyId` and `sessionKey` to handle session key resolution.

---

## 8. Animation & Scroll Patterns

### 8.1 Motion Library Usage

**Library**: `motion/react` (formerly Framer Motion)

**Usage**: Limited to sidebar collapse/expand animation via `AnimatePresence` and `motion.aside`:

```typescript
const transition = {
  duration: 0.15,
  ease: isCollapsed ? 'easeIn' : 'easeOut',
}
```

The sidebar uses `motion.aside` with `animate`, `initial`, and `exit` props for width transitions. This is tasteful and restrained — no gratuitous animations.

### 8.2 Scroll Behavior

**Custom implementation**: The `ScrollButton` uses a MutationObserver + scroll listener combination (Section 1.8). The `ChatMessageList` manages scroll positioning with `scrollIntoView`.

**Pin-to-top behavior**: When a new response starts, the user's message is pinned to the top of the viewport while the response grows below it. This is implemented via `pinToTop` state and `scrollIntoView({ block: 'start' })`.

**No external scroll library**: Despite mentioning `use-stick-to-bottom` in their AGENTS.md, they use a custom implementation.

### 8.3 Responsive Strategy

**Approach**: JavaScript-first via `useChatMobile` hook (matchMedia at 768px). On mobile:
- Sidebar auto-collapses
- Sidebar becomes an overlay (different layout)
- Session selection auto-collapses sidebar

**No CSS-only responsive**: The responsive behavior is driven by the `isMobile` state, which conditionally renders different component trees (not just CSS classes).

---

## 9. Typography Conventions

From the code analysis (confirmed by their Markdown component):

| Element | Classes | Convention |
|---------|---------|------------|
| h1 | `text-xl font-medium tracking-tight text-balance` | Max weight: `font-medium` |
| h2 | `text-lg font-medium tracking-tight text-balance` | `text-balance` for headings |
| h3 | `text-base font-medium` | Consistent `font-medium` |
| Body (p) | `text-sm leading-relaxed text-pretty` | `text-pretty` for body |
| Code (inline) | `bg-primary-200/50 rounded-sm px-1 py-0.5 text-[13px]` | Subtle background |
| Links | `text-primary-700 underline underline-offset-4` | Underlined, offset |
| Lists | `ml-6 space-y-2 text-sm` | Proper indentation |

**Key rules**:
- Never bolder than `font-medium` (500)
- `text-balance` for headings, `text-pretty` for body text
- Consistent `text-sm` (14px) for body content
- `tracking-tight` for headings only
- Table styling with `divide-y` and `bg-primary-50/50` alternating rows

---

## Evidence Table

| Claim ID | Claim | Evidence Type | Source Refs | Confidence | Impact Area | Transferability | Notes |
|----------|-------|---------------|-------------|------------|-------------|-----------------|-------|
| WC-A2-C01 | Portal-based scroll isolation prevents container re-renders during streaming | Code pattern | [chat-container.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/chat-container.tsx) | High | Performance | Directly Transferable | Uses createPortal to decouple content updates from scroll container |
| WC-A2-C02 | Streamdown provides streaming-optimized markdown with custom component mapping | Code + library | [markdown.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/markdown.tsx) | High | Streaming / UX | Adaptable | NaW would need to evaluate Streamdown vs react-markdown for streaming perf |
| WC-A2-C03 | Singleton Shiki highlighter with lazy loading and 30 language support | Code pattern | [code-block/index.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/code-block/index.tsx) | High | Performance | Directly Transferable | Singleton prevents multiple initializations |
| WC-A2-C04 | Dual context split in PromptInput prevents cross-concern re-renders | Code pattern | [prompt-input.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/prompt-input.tsx) | High | Performance | Directly Transferable | Value context vs UI context separation |
| WC-A2-C05 | Global keyboard listener auto-focuses prompt on printable character input | Code pattern | [prompt-input.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/prompt-input.tsx) | Medium | UX | Directly Transferable | Nice UX touch, low effort to implement |
| WC-A2-C06 | MessageContent opts into markdown rendering via boolean prop | Code pattern | [message.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/message.tsx) | Medium | DX | Directly Transferable | Simple composition pattern |
| WC-A2-C07 | Tool display uses 4-state machine (input-streaming → input-available → output-available → output-error) | Code pattern | [tool.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/tool.tsx) | High | UX | Directly Transferable | Clean state modeling for tool call lifecycle |
| WC-A2-C08 | MutationObserver + scroll listener for content-aware scroll detection | Code pattern | [scroll-button.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/scroll-button.tsx) | Medium | UX | Directly Transferable | Catches streaming content additions, not just user scroll |
| WC-A2-C09 | SSE streaming with 6-layer deduplication (runId, seq, stateVersion, source, event key, payload key) | Code pattern | [use-chat-stream.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-stream.ts) | High | Architecture / Streaming | Adaptable | WebClaw's dedup is gateway-specific, but the pattern of layered dedup is transferable |
| WC-A2-C10 | Stable history reference via signature-based change detection | Code pattern | [use-chat-history.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-history.ts) | High | Performance | Directly Transferable | Prevents downstream re-renders when content hasn't changed |
| WC-A2-C11 | Three-way merge preserves optimistic + streaming messages during server refetch | Code pattern | [use-chat-history.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-history.ts) | High | State | Adaptable | NaW uses Convex subscriptions, not polling, but merge concept transfers |
| WC-A2-C12 | Navigation-safe optimistic sends via stash + replay pattern | Code pattern | [use-chat-pending-send.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-chat-pending-send.ts) | High | UX | Directly Transferable | Prevents message loss during new-session navigation |
| WC-A2-C13 | Tombstone-based optimistic session deletion with rollback | Code pattern | [use-delete-session.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/hooks/use-delete-session.ts) | High | State | Directly Transferable | Textbook TanStack Mutation optimistic pattern |
| WC-A2-C14 | ChatScreen uses prop drilling over context for chat state | Convention | [chat-screen.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/chat-screen.tsx) | Medium | Architecture | Adaptable | Explicit data flow but scales worse than context for deep trees |
| WC-A2-C15 | Composer isolates input state from parent via refs + memoization | Code pattern | [chat-composer.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/components/chat-composer.tsx) | High | Performance | Directly Transferable | Prevents chat-wide re-renders during typing |
| WC-A2-C16 | Pin-to-top scroll behavior for latest user+response exchange | Code pattern | [chat-message-list.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/components/chat-message-list.tsx) | Medium | UX | Directly Transferable | ChatGPT-like behavior where response grows below user message |
| WC-A2-C17 | Content-based memo equality for message items (text, thinking, tool signatures) | Code pattern | [message-item.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/components/message-item.tsx) | High | Performance | Directly Transferable | Only re-renders when actual content changes, not on reference changes |
| WC-A2-C18 | Streamdown handles partial markdown during streaming without re-parsing | Code + library | [markdown.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/markdown.tsx) | Medium | Streaming | Adaptable | Need to evaluate Streamdown library quality and bundle size |
| WC-A2-C19 | Shiki re-highlights code on every token during streaming (potential perf issue) | Code pattern | [code-block/index.tsx](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/components/prompt-kit/code-block/index.tsx) | Medium | Performance | Directly Transferable | useEffect depends on content — may need debouncing for large blocks |
| WC-A2-C20 | Zustand with persist middleware for user preferences, selective subscriptions | Code pattern | [hooks/use-chat-settings.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/hooks/use-chat-settings.ts) | High | State | Directly Transferable | Clean pattern matching NaW's Zustand usage |
| WC-A2-C21 | Ephemeral UI state stored in TanStack Query cache (not Zustand) | Convention | [chat-ui.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/chat-ui.ts) | Medium | Architecture | Adaptable | Unusual pattern — trades simplicity for coupling to query client |
| WC-A2-C22 | Simple query key design with factory functions | Code pattern | [chat-queries.ts](https://github.com/ibelick/webclaw/blob/main/apps/webclaw/src/screens/chat/chat-queries.ts) | High | DX | Directly Transferable | Clean, predictable key structure |

---

## Uncertainty & Falsification

### Top 3 Unresolved Questions

1. **How does Streamdown perform at scale?** We've read the code but haven't benchmarked Streamdown vs react-markdown for long conversations (1000+ messages). The library is relatively new and less battle-tested. **What evidence would change conclusions**: If Streamdown has significant bundle size or memory overhead, WC-A2-C02/C18 would be downgraded.

2. **Does the lack of virtualization cause problems?** WebClaw renders all messages in the DOM. For their single-agent use case with short conversations, this is fine. But we're inferring performance characteristics — we haven't tested with long conversations. **What evidence would change conclusions**: If they experience jank with 50+ messages, the ChatContainer pattern (WC-A2-C01) is less impressive.

3. **Is the 13-hook decomposition actually better than a monolith?** The decomposition looks clean in code review, but we haven't measured whether it reduces re-renders compared to a single hook that returns the same data. The overhead of 13 hook calls in ChatScreen could theoretically be worse. **What evidence would change conclusions**: If profiling shows the hook composition adds measurable overhead, WC-A2-C14 would need qualification.

### Falsification Criteria

- If Streamdown has significant bundle size (>50KB gzip) or memory overhead compared to react-markdown, claims WC-A2-C02 and WC-A2-C18 would be downgraded from Adaptable to Skip
- If WebClaw experiences visible jank with 50+ messages due to lack of virtualization, the ChatContainer portal pattern (WC-A2-C01) provides less performance benefit than claimed
- If profiling shows 13-hook composition in ChatScreen adds measurable overhead vs a single monolithic hook, WC-A2-C14 (prop drilling over context) would need qualification
- If React 19's compiler optimizations make content-based memo equality (WC-A2-C17) unnecessary by automatically memoizing component subtrees, the recommendation to adopt this pattern would shift from ADOPT to SKIP

### Claims Based on Inference

- WC-A2-C18 (Streamdown handles partial markdown) is inferred from the library's name and usage context, not from reading Streamdown's source code.
- WC-A2-C19 (Shiki re-highlights on every token) is a potential performance issue, not a confirmed one — small code blocks may be fast enough.
- WC-A2-C16 (pin-to-top behavior) quality assessment assumes correct behavior based on code reading, not runtime testing.

---

## Key Patterns Worth Studying

### Pattern 1: Hook Decomposition Strategy

The 13-hook pattern demonstrates how to decompose a monolithic chat hook:
- **Each hook owns one concern** (streaming, history, sessions, settings, etc.)
- **Hooks communicate via shared state** in the orchestrator (ChatScreen)
- **Hooks receive dependencies as input** (not globals or context)
- **Each hook is independently testable**

This is the highest-value pattern for NaW, where `use-chat-core.ts` is a monolith.

### Pattern 2: Content-Based Memo Equality

The `areMessagesEqual` function in MessageItem demonstrates that **reference equality is insufficient for streaming chat**. When every token creates a new message object, you need content-based comparison:

```typescript
textFromMessage(prev.message) !== textFromMessage(next.message)
toolCallsSignature(prev.message) !== toolCallsSignature(next.message)
```

### Pattern 3: Optimistic Update Lifecycle

The delete-session and rename-session hooks show textbook TanStack Mutation usage:
1. `onMutate`: Cancel queries → snapshot previous → apply optimistic update
2. `onError`: Restore snapshot → clear tombstone
3. `onSuccess`: Invalidate to get fresh data
4. `onSettled`: Reset loading state

---

## Concerns & Limitations

1. **No message virtualization**: All messages rendered in DOM. Will not scale for long conversations.
2. **Shiki re-highlighting during streaming**: Every token triggers re-highlight for code blocks. Needs debouncing.
3. **ChatScreen is still large (~450 LOC)**: Despite hook decomposition, the orchestrator file is substantial.
4. **No multi-model support**: All components assume a single agent/model. NaW's multi-model comparison view has no equivalent.
5. **SSE vs WebSocket**: Their AGENTS.md mentions WebSocket but the code uses EventSource (SSE). The architecture is actually simpler than described.
6. **No offline/error recovery for messages**: If a send fails, the optimistic message is marked as error but there's no retry mechanism.

---

## Unexpected Findings

1. **They don't use `use-stick-to-bottom`**: Despite listing it in their tech stack, they have a custom scroll implementation. The MutationObserver approach is interesting and potentially more reliable.
2. **UI state in TanStack Query cache**: Using the query cache for sidebar collapse state is creative but unconventional. It avoids another Zustand store at the cost of coupling.
3. **Command palette built from Dialog + Autocomplete**: They don't use `cmdk` — they compose Base UI's Dialog and Autocomplete primitives into a command palette. This is a strong composition pattern.
4. **Only Button uses CVA**: The rest of the UI components use plain `cn()` conditional classes. CVA might be overkill for components with few variants.
5. **`useRender` from Base UI**: The Button component uses Base UI's `useRender` hook for polymorphic rendering, which is a newer pattern than the `asChild` approach.

---

## Recommendations Preview

### 1. ADOPT — Hook Decomposition for `use-chat-core.ts`

**Transferability**: Directly Transferable
**Evidence**: WC-A2-C09, WC-A2-C10, WC-A2-C11, WC-A2-C12, WC-A2-C13, WC-A2-C14
**Impact**: Architecture / DX / Performance
**Rationale**: NaW's `use-chat-core.ts` is a monolith. WebClaw's 13-hook pattern proves that decomposition works well with our shared stack. Start with extracting streaming, history, and session management into separate hooks.

### 2. ADOPT — Content-Based Memo Equality for Message Components

**Transferability**: Directly Transferable
**Evidence**: WC-A2-C17, WC-A2-C10
**Impact**: Performance
**Rationale**: During streaming, every token creates a new message reference. Content-based comparison (text signature, tool call signature, thinking content) prevents unnecessary re-renders of non-streaming messages.

### 3. ADOPT — Composer State Isolation via Refs

**Transferability**: Directly Transferable
**Evidence**: WC-A2-C15, WC-A2-C04
**Impact**: Performance
**Rationale**: Keeping prompt input value in local refs/state prevents chat-wide re-renders on every keystroke. The dual-context split for value vs UI state is a clean optimization.

### 4. ADAPT — Evaluate Streamdown for Streaming Markdown

**Transferability**: Adaptable
**Evidence**: WC-A2-C02, WC-A2-C18
**Impact**: UX / Performance
**Rationale**: Streamdown is purpose-built for progressive markdown rendering during streaming. Worth evaluating vs our current approach, but need to assess bundle size, API stability, and community support.

### 5. SKIP — UI State in TanStack Query Cache

**Transferability**: Adaptable but not recommended
**Evidence**: WC-A2-C21
**Impact**: Architecture
**Rationale**: Storing sidebar collapse state in the query cache is creative but couples UI state to the data layer. NaW should keep using Zustand for UI state — it's more idiomatic and clearer in intent.

---

*Research completed February 15, 2026. Based on WebClaw repository at commit ~80 commits, branch `main`. All source references are to the `apps/webclaw/src/` directory.*
