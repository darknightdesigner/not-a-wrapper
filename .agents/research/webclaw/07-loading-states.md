# Loading States: WebClaw vs Not A Wrapper — Comparative Analysis

> **Date**: February 15, 2026
> **Repository**: [ibelick/webclaw](https://github.com/ibelick/webclaw)
> **Scope**: Chat loading indicators, streaming state transitions, typing indicators, and layout stability
> **Related**: [05-cmp-ux-performance.md](./05-cmp-ux-performance.md), [02-chat-ux-components.md](./02-chat-ux-components.md)

---

## 1. Executive Summary

Not A Wrapper uses a **dual-loader handoff** pattern where two separate loader instances mount/unmount during the `submitted → streaming` transition, causing a visible **left-to-center position shift**. WebClaw avoids this entirely by using a **single typing indicator** rendered in one location, governed by a unified `waitingForResponse` boolean. This document analyzes both approaches, explains the root cause of the position shift bug, and provides prioritized recommendations.

---

## 2. Not A Wrapper — Current Loading Architecture

### 2.1 Status State Machine

The Vercel AI SDK drives a four-state machine: `ready → submitted → streaming → ready`.

```
User sends message
       │
       ▼
   "submitted"  ──► Conversation-level loader mounts (conversation.tsx)
       │
       ▼
   "streaming"  ──► Conversation-level loader unmounts
                    Message-level loader mounts (message-assistant.tsx)
       │
       ▼
   First token   ──► Message-level loader unmounts
                      Text content renders
       │
       ▼
    "ready"      ──► Stream complete
```

### 2.2 Loader 1 — Conversation-Level (`conversation.tsx:110-116`)

```tsx
{status === "submitted" &&
  messages.length > 0 &&
  messages[messages.length - 1].role === "user" && (
    <div className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
      <Loader variant="chat" />
    </div>
  )}
```

- **Trigger**: `status === "submitted"` (before SDK transitions to streaming)
- **Container**: `flex flex-col items-start` → children are **not stretched** to full width
- **Result**: `ChatLoader` sizes to content width → dots appear **left-aligned**

### 2.3 Loader 2 — Message-Level (`message-assistant.tsx:148`)

```tsx
<Message className="group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2">
  <div className="relative flex min-w-full flex-col gap-2">
    {showStreamingLoader && <Loader variant="chat" />}
  </div>
</Message>
```

- **Trigger**: `isLastStreaming && contentNullOrEmpty && !hasVisibleReasoning && !hasVisibleTools && !hasVisibleImages`
- **Container**: Inner div has `min-w-full` with default `align-items: stretch`
- **Result**: `ChatLoader` stretches to full width → `justify-center` pushes dots to **center**

### 2.4 The ChatLoader Component (`loader.tsx:500-512`)

```tsx
<div className={cn("flex items-center justify-center gap-1", className)}>
  {[0, 0.1, 0.2].map((delay, i) => (
    <motion.div key={i} className={`${DOT_SIZE} ${DOT_COLOR} rounded-full`}
      animate={ANIMATION} transition={{ ...TRANSITION, delay }}
    />
  ))}
</div>
```

- Uses `justify-center` internally — the component **self-centers** within whatever width it receives
- Uses Framer Motion for each dot's bounce animation

### 2.5 Root Cause: Dual-Loader Position Shift

| Phase | Status | Loader Location | Container Alignment | ChatLoader Width | Dots Position |
|-------|--------|-----------------|---------------------|------------------|---------------|
| 1 | `submitted` | `conversation.tsx` | `items-start` | Content-width (~32px) | **Left** |
| 2 | `streaming` (no content) | `message-assistant.tsx` | `stretch` (default) + `min-w-full` | Full container (~768px) | **Center** |

The shift happens because:
1. Two different DOM nodes render the same `<Loader variant="chat" />` in different layout contexts
2. `ChatLoader` uses `justify-center`, which is invisible when the container is narrow but visible when wide
3. The transition occurs 1-3 seconds after sending (time for SDK to move from `submitted` to `streaming`)

### 2.6 Additional Concerns

- **No loading timeout**: If streaming never produces content, the loader could persist indefinitely
- **Framer Motion overhead**: Each dot is a separate `motion.div` with its own animation loop; CSS keyframes would be lighter
- **Two render cycles**: The handoff causes two unmount/mount cycles, potentially triggering scroll reflow

---

## 3. WebClaw — Loading Architecture

### 3.1 Single Boolean State

WebClaw manages a single `waitingForResponse` state at the `ChatScreen` level:

```tsx
// chat-screen.tsx
const [waitingForResponse, setWaitingForResponse] = useState(
  () => hasPendingSend() || hasPendingGeneration(),
)
```

This boolean is set `true` when a message is sent and cleared when the generation run completes (via SSE events or timeout).

### 3.2 Single Typing Indicator Location

The `TypingIndicator` renders in exactly **one place** — inside `ChatMessageList`:

```tsx
// chat-message-list.tsx
const showTypingIndicator =
  waitingForResponse &&
  (typeof lastUserIndex !== 'number' ||
   typeof lastAssistantIndex !== 'number' ||
   lastAssistantIndex < lastUserIndex)

// Later in JSX:
{showTypingIndicator ? (
  <div className="pl-2">
    <TypingIndicator />
  </div>
) : null}
```

Key design decisions:
- **Index-based, not status-based**: Uses message array indices to determine visibility, not SDK status strings
- **Single render location**: No handoff between two components
- **Consistent layout**: Always rendered in the same container with the same alignment
- **Simple wrapper**: `<div className="pl-2">` gives consistent left-padding

### 3.3 TypingIndicator Component

```tsx
// typing-indicator.tsx
function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    // Uses TextShimmer — CSS-only gradient animation, no Framer Motion
    <TextShimmer>Generating...</TextShimmer>
  )
}
```

- **CSS-only**: Uses `background-size` animation with `bg-clip-text` — no JavaScript animation frames
- **Text-based**: Shows "Generating..." with shimmer effect instead of abstract bouncing dots
- **Lightweight**: Single DOM element with CSS animation vs. 3 Framer Motion nodes

### 3.4 Generation Guard (Timeout Safety)

```tsx
// use-chat-generation-guard.ts
useEffect(() => {
  if (!waitingForResponse) return
  timeoutTimer.current = window.setTimeout(() => {
    refreshHistory()
    finish() // clears waitingForResponse
  }, 120000) // 120-second timeout
}, [waitingForResponse])
```

- Automatically clears loading state after 2 minutes
- Prevents infinite loading if SSE events are lost
- Triggers a history refresh as recovery

### 3.5 Run-Based Tracking

WebClaw tracks individual generation runs by ID:

```tsx
// chat-screen.tsx
const pendingRunIdsRef = useRef(new Set<string>())
const pendingRunTimersRef = useRef(new Map<string, number>())

function startRun(runId: string) {
  pendingRunIdsRef.current.add(runId)
  // ... 120s timeout per run
  setPendingGeneration(true)
  setWaitingForResponse(true)
}

function finishRun(runId: string) {
  pendingRunIdsRef.current.delete(runId)
  if (pendingRunIdsRef.current.size === 0) {
    setPendingGeneration(false)
    setWaitingForResponse(false)
  }
}
```

- Tracks concurrent generation runs individually
- Only clears `waitingForResponse` when **all** runs complete
- Each run has its own 120-second safety timeout

---

## 4. Side-by-Side Comparison

| Aspect | Not A Wrapper | WebClaw |
|--------|---------------|---------|
| **Loading state source** | SDK `status` field (4 states) | Single `waitingForResponse` boolean |
| **Loader render locations** | 2 (conversation.tsx + message-assistant.tsx) | 1 (chat-message-list.tsx) |
| **Handoff pattern** | Loader 1 unmounts → Loader 2 mounts | No handoff — single indicator |
| **Position consistency** | Left → Center shift (bug) | Consistent left-aligned |
| **Visibility logic** | Status-based + content checks | Index-based comparison |
| **Animation technology** | Framer Motion (3 `motion.div` nodes) | CSS `background-size` animation |
| **Loading timeout** | None | 120-second per-run + global guard |
| **Indicator style** | 3 bouncing dots | "Generating..." text shimmer |
| **Concurrent run tracking** | No (single status) | Yes (run ID set with per-run timeout) |
| **Memoization** | `React.memo` on `Message` | `React.memo` on `MessageItem` + `ChatMessageList` |
| **Scroll behavior** | `min-h-scroll-anchor` class | Pin-to-top with `scrollIntoView` |
| **DOM stability** | 2 mount/unmount cycles during transition | 0 layout shifts |

---

## 5. Evidence Records

| claim_id | claim | evidence_type | source_refs | confidence | impact_area | transferability |
|----------|-------|---------------|-------------|------------|-------------|-----------------|
| WC-A7-C01 | WebClaw uses a single render location for the typing indicator, preventing layout shifts | Code | `chat-message-list.tsx:88-95`, `typing-indicator.tsx` | High | UX / layout stability | Directly Transferable |
| WC-A7-C02 | WebClaw uses CSS-only animation (TextShimmer) vs Framer Motion for typing indicator | Code | `typing-indicator.tsx`, `text-shimmer.tsx` | High | Performance | Directly Transferable |
| WC-A7-C03 | WebClaw implements a 120s generation timeout guard to prevent infinite loading | Code | `use-chat-generation-guard.ts` | High | UX / reliability | Adaptable |
| WC-A7-C04 | WebClaw tracks concurrent generation runs individually by run ID | Code | `chat-screen.tsx` (startRun/finishRun) | High | Architecture | Adaptable |
| WC-A7-C05 | Not A Wrapper's position shift is caused by dual-loader handoff with inconsistent container alignment | Code | `conversation.tsx:110-116`, `message-assistant.tsx:115-148`, `loader.tsx:500-512` | High | UX / layout stability | N/A (bug fix) |
| WC-A7-C06 | Not A Wrapper's ChatLoader self-centers via `justify-center`, violating parent-controlled layout | Code | `loader.tsx:501` | High | Component design | N/A (bug fix) |

---

## 6. Recommendations

### 6.1 Critical Fix: Eliminate Dual-Loader Position Shift

**Priority**: P0 (user-visible layout instability)

**Option A — Remove `justify-center` from ChatLoader** (minimal change)

```tsx
// loader.tsx — ChatLoader
// Before:
<div className={cn("flex items-center justify-center gap-1", className)}>
// After:
<div className={cn("flex items-center gap-1", className)}>
```

Single-line fix. The loader becomes a left-aligned inline element by default. Parents that need centering can pass `className="justify-center"`. This follows the composability principle: leaf components should not dictate their own alignment.

**Option B — Unify to single loader location** (structural fix, inspired by WebClaw)

Remove the conversation-level loader in `conversation.tsx:110-116` entirely. Instead, render the loader inside `MessageAssistant` for all waiting states. This requires either:
- Ensuring an assistant message placeholder exists in the messages array during `submitted` state, or
- Moving the `submitted` check into the conversation component to render a wrapper `<Message>` that contains the loader in the same layout context

**Recommendation**: Apply Option A immediately (fixes the bug), then plan Option B as a follow-up refactor for architectural consistency.

### 6.2 High Priority: Add Loading Timeout Guard

**Priority**: P1 (reliability)

Adopt WebClaw's timeout guard pattern to prevent infinite loading states:

```tsx
// New hook: use-loading-timeout.ts
export function useLoadingTimeout(
  isLoading: boolean,
  onTimeout: () => void,
  timeoutMs = 120_000
) {
  const timerRef = useRef<number | null>(null)
  const loadingRef = useRef(isLoading)
  loadingRef.current = isLoading

  useEffect(() => {
    if (!isLoading) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = null
      return
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (loadingRef.current) onTimeout()
    }, timeoutMs)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [isLoading, onTimeout, timeoutMs])
}
```

### 6.3 Medium Priority: Consider CSS-Only Animation

**Priority**: P2 (performance)

Replace the Framer Motion `ChatLoader` with a CSS-only alternative. The project already has `TextShimmerLoader` and `TextDotsLoader` variants that use CSS keyframes. Consider:

- Using `TextShimmerLoader` (like WebClaw does) for a text-based "Generating..." indicator
- Or keeping the dots pattern but switching to the existing CSS-based `DotsLoader` variant

Benefits:
- Eliminates 3 Framer Motion `motion.div` instances per active loader
- Reduces JavaScript animation frame overhead
- The existing `DotsLoader` in `loader.tsx:165-207` already uses CSS `animate-[bounce-dots]`

### 6.4 Low Priority: Unified Loading State

**Priority**: P3 (architectural improvement)

Consider refactoring toward WebClaw's single-boolean approach where the chat screen owns a `waitingForResponse` state independent of the SDK `status`. This would:

- Decouple loading UI from SDK internals
- Enable cleaner loading states for multi-model comparison
- Allow index-based visibility logic instead of status-based checks

This is a larger refactor and should be planned separately.

---

## 7. Unresolved Questions

1. **Multi-model loading**: How should the loading indicator behave when multiple models are streaming simultaneously? WebClaw doesn't have multi-model comparison, so their pattern doesn't directly address this.
2. **Streaming gaps**: The AI SDK can briefly report `streaming` before the first token arrives. Is the current gap-coverage logic in `message-assistant.tsx:85-100` sufficient, or should a minimum display time be added to prevent flash-of-loader?
3. **Loading indicator accessibility**: Neither project announces loading state changes to screen readers beyond `sr-only` text. Should `aria-live` regions be used?

## 8. Falsification Criteria

- If the position shift is caused by something other than the dual-loader handoff (e.g., CSS transition, scroll reflow), the analysis in Section 2.5 would be incorrect
- If WebClaw's SSE-based streaming has lower latency than the AI SDK's status transitions, the timeout values may not be directly transferable
- If Framer Motion's `animate` on 3 small divs has negligible performance impact compared to CSS keyframes, recommendation 6.3 has lower value than estimated

---

*Research document for `.agents/research/webclaw/`. See `00-research-plan.md` for the overall research track methodology.*
