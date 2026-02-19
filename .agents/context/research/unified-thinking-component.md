# Research: Unified Thinking + Reasoning Component (ChatGPT Pattern)

**Date**: 2026-02-19
**Status**: Research complete — ready for implementation planning
**Scope**: Consolidate ThinkingBar + Reasoning into a single ChatGPT-style component

---

## 1. Component Consolidation Strategy

### Current State

Three components exist today, each handling a slice of the thinking/reasoning UX:

| Component | Location | Used? | Architecture |
|-----------|----------|-------|-------------|
| `ThinkingBar` | `components/ui/thinking-bar.tsx` | Yes | Flat — shimmer text + optional onClick/chevron |
| `Reasoning` (app) | `app/components/chat/reasoning.tsx` | Yes | Simple — useState toggle + AnimatePresence |
| `Reasoning` (prompt-kit) | `components/ui/reasoning.tsx` | No | Compound — Context + controlled/uncontrolled + auto-open/close |

In `message-assistant.tsx`, ThinkingBar and Reasoning render as **two separate sequential blocks**:

```
{isLastStreaming && reasoningParts && contentNullOrEmpty && (
  <ThinkingBar text="Thinking" />           ← vanishes when text starts
)}
{reasoningParts && reasoningParts.text && (
  <Reasoning reasoning={...} isStreaming={...} />  ← separate block
)}
```

The ThinkingBar disappears entirely when reasoning text arrives, creating a visual "swap" rather than a smooth transition within a single container.

### Options Considered

#### Option A: Extend the prompt-kit compound component (`components/ui/reasoning.tsx`)

**Pros**:
- Already has the right architecture: Context provider, controlled/uncontrolled state, auto-open during streaming, auto-close on completion
- Already uses React 19 render-sync pattern (no useEffect for streaming state)
- Compound pattern (Reasoning, ReasoningTrigger, ReasoningContent) allows flexible composition
- ResizeObserver-based height animation for smooth expand/collapse

**Cons**:
- Missing timer/duration logic
- Missing shimmer animation for the "Thinking..." active phase
- Label is static — needs to transition from "Thinking..." to "Thought for Xs"
- Would need a new sub-component or trigger variant for the phase-aware label

#### Option B: Build a new unified component from scratch

**Pros**:
- Clean slate — no legacy patterns to work around
- Can design the state machine from the ground up
- Can bake in timer logic as a first-class concern

**Cons**:
- Duplicates the controlled/uncontrolled pattern, auto-open/close logic, and height animation that already exist in the prompt-kit version
- More code to maintain; diverges from prompt-kit ecosystem
- Higher risk of missing edge cases the existing compound component already handles

#### Option C: Adopt the Vercel AI SDK Elements `Reasoning` component pattern

The official Vercel AI SDK Elements library (https://sdk.vercel.ai/elements/components/reasoning) ships a `Reasoning` component with:
- `isStreaming` and `duration` props
- `useReasoning()` hook returning `{ isStreaming, isOpen, setIsOpen, duration }`
- Auto-open during streaming, auto-close on completion
- Built on Radix Collapsible primitives

**Pros**:
- First-party reference implementation from the AI SDK team
- Already includes `duration` as a prop concept
- Well-tested open/close lifecycle

**Cons**:
- Uses Radix UI — this project migrated to Base UI in February 2026
- Would need porting to Base UI Collapsible (or CSS-based collapsible)
- `duration` is externally provided, not internally computed
- No shimmer animation built in

### Recommended Approach

**Extend Option A** (the existing prompt-kit compound component) with additions inspired by Option C's API design.

**Rationale**:
1. The prompt-kit compound component already solves the hardest problems: controlled/uncontrolled state, context-based communication between trigger and content, auto-open/close lifecycle, and ResizeObserver-based animation. Rebuilding this from scratch gains nothing.
2. The Vercel Elements component validates the API shape — `isStreaming` + `duration` is the right prop surface. But its Radix dependency makes it a reference, not a drop-in.
3. The additions needed are discrete and well-scoped:
   - Add `duration` to context (number | undefined)
   - Add `phase` to context: `'thinking' | 'complete' | 'idle'`
   - Create a new `ReasoningLabel` sub-component that renders "Thinking..." with shimmer during `thinking` phase and "Thought for Xs" during `complete` phase
   - Merge ThinkingBar's `TextShimmer` usage into this label
4. The simple app version (`app/components/chat/reasoning.tsx`) gets **deleted** — it's replaced entirely by the extended prompt-kit version.

### Open Questions

- Should the unified component also absorb the "Generating" ThinkingBar shown in `conversation.tsx` (line 119) for the `submitted` state? This is pre-reasoning — the model hasn't started yet. Recommendation: keep that separate, as it's a different lifecycle (waiting for response vs. active reasoning).
- How to handle models that return multiple reasoning parts (GPT pattern, per Vercel docs)? The prompt-kit component receives children, so the orchestrator can consolidate reasoning text before passing it. This is already how the Vercel Elements example works.

---

## 2. Reasoning Timer Implementation

### Current State

No timer exists anywhere in the codebase. The ThinkingBar shows "Thinking" with no duration. The Reasoning component shows "Reasoning" with no duration. There is no `reasoningDuration`, `thinkingDuration`, or similar field.

### Where Does the Timer Start?

The first reasoning part arrives with `state: 'streaming'` on the `ReasoningUIPart`. This is the correct trigger.

**Not** `status === 'streaming'` (too early — includes pre-reasoning network/system time) and **not** "when the ThinkingBar appears" (that's a UI-level concern, not a data-level one).

### Where Does the Timer Stop?

Two options:

| Signal | Meaning | Reliability |
|--------|---------|-------------|
| `ReasoningUIPart.state === 'done'` | SDK marks reasoning as complete | High — set by SDK when reasoning stream ends |
| First `TextUIPart` appears | Text content begins streaming | Medium — some models interleave reasoning + text |

**Recommendation**: Use `ReasoningUIPart.state` transitioning from `'streaming'` to `'done'` as the primary signal. The `state` field on reasoning parts was added to the AI SDK specifically to distinguish active vs. completed reasoning.

Fallback: if `state` is undefined (older SDK versions or edge cases), fall back to "first text part appears".

### Client-Side vs. Server-Side

#### Client-Side Timer (recommended for streaming display)

```
// Pseudocode
const startRef = useRef<number | null>(null)
const [duration, setDuration] = useState<number | undefined>()

// On each render, check reasoning parts
if (reasoningPart?.state === 'streaming' && !startRef.current) {
  startRef.current = Date.now()
}
if (reasoningPart?.state === 'done' && startRef.current) {
  setDuration(Math.round((Date.now() - startRef.current) / 1000))
  startRef.current = null
}
```

**Pros**: Simple, no server changes, works immediately
**Cons**: Timer resets on page refresh during streaming; completed messages lose duration on reload

#### Server-Side Metadata (recommended for persistence)

Use the AI SDK's `messageMetadata` callback:

```
return result.toUIMessageStreamResponse({
  sendReasoning: true,
  messageMetadata: ({ part }) => {
    if (part.type === 'start') {
      return { reasoningStartedAt: Date.now() }
    }
    if (part.type === 'finish') {
      return { reasoningDurationMs: computedDuration }
    }
  },
})
```

**Pros**: Duration persists with the message; available on reload
**Cons**: Requires changes to API route + message type definitions; `messageMetadata` fires at message-level granularity (start/finish), not at reasoning-part-level granularity

#### Hybrid Approach (recommended)

1. **During streaming**: Use a client-side timer (useRef-based) for the live "Thinking..." → "Thought for Xs" transition. This gives instant feedback without waiting for server metadata.
2. **On completion**: Server sends `reasoningDurationMs` via `messageMetadata` in the `finish` event. This gets stored with the message and is available on reload.
3. **On reload**: Read `message.metadata.reasoningDurationMs` directly — no timer needed.

### Duration Persistence

The `UIMessage<METADATA>` interface supports a generic `metadata` field. This project should define:

```typescript
type MessageMetadata = {
  reasoningDurationMs?: number  // milliseconds of reasoning time
  model?: string                // which model generated this
  createdAt?: number            // timestamp
}
```

The `messageMetadata` callback in `toUIMessageStreamResponse` already supports sending metadata at `start` and `finish` events. Adding `reasoningDurationMs` at `finish` time is straightforward.

For messages already persisted in Convex without this field, the component should gracefully handle `undefined` duration by either:
- Not showing a duration label (just "Thought" or "Reasoning")
- Retroactively computing an approximate duration from timestamps if available

### Timer Display Format

Follow ChatGPT's pattern:
- < 60 seconds: "Thought for Xs" (e.g., "Thought for 12s")
- >= 60 seconds: "Thought for Xm Ys" (e.g., "Thought for 2m 34s")
- During active thinking: "Thinking..." (with shimmer animation)

### Open Questions

- Should the timer tick live during reasoning (like a stopwatch) or only show the final duration? ChatGPT shows a live-updating timer during thinking. **Recommendation**: Show live ticking during `thinking` phase using `requestAnimationFrame` or a 1-second `setInterval`.
- How accurate does the server-side duration need to be? The `finish` callback on `toUIMessageStreamResponse` fires when the entire message finishes, not when reasoning specifically ends. We'd need to track reasoning start/end inside the `onChunk` or `prepareStep` callbacks of `streamText` for true server-side precision. The simpler approach: compute duration client-side and send it back to the server for persistence.

---

## 3. State Machine Redesign

### Current State Machine (implicit)

The current `useLoadingState` hook computes `showThinking` as:

```typescript
const showThinking = isLastStreaming && Boolean(reasoningParts) && !hasVisibleReasoning
```

This is a **transient boolean** that's true only during a narrow window: streaming + reasoning parts exist + no visible text in reasoning yet. It maps roughly to "the model is thinking but hasn't emitted reasoning tokens yet."

The Reasoning component's visibility is driven by a separate condition:

```typescript
{reasoningParts && reasoningParts.text && <Reasoning ... />}
```

This creates two disconnected visibility states with no unified lifecycle.

### Proposed State Machine

```
                ┌─────────────────────────────────┐
                │              idle                │
                │  (no reasoning parts, OR         │
                │   non-reasoning model)           │
                └─────────┬───────────────────────┘
                          │ first ReasoningUIPart appears
                          │ (part.type === 'reasoning')
                          ▼
                ┌─────────────────────────────────┐
                │           thinking               │
                │  Label: "Thinking..." (shimmer)  │
                │  Content: streaming reasoning    │
                │  Default state: expanded         │
                │  Timer: ticking live             │
                └─────────┬───────────────────────┘
                          │ reasoning.state === 'done'
                          │ OR first TextUIPart appears
                          ▼
                ┌─────────────────────────────────┐
                │           complete               │
                │  Label: "Thought for Xs"         │
                │  Content: full reasoning text    │
                │  Default state: collapsed        │
                │  Timer: frozen at final value    │
                └─────────────────────────────────┘
```

### Mapping to Existing Status

| Chat `status` | Reasoning `state` | Parts data | → Thinking Phase |
|---------------|-------------------|------------|------------------|
| `submitted` | N/A | No parts yet | `idle` (pre-reasoning) |
| `streaming` | No reasoning part | No reasoning | `idle` (non-reasoning model) |
| `streaming` | `streaming` | Reasoning part exists, may have text | `thinking` |
| `streaming` | `done` | Reasoning complete, text streaming | `complete` |
| `ready` | `done` | All parts final | `complete` |
| `ready` | N/A | No reasoning parts | `idle` |
| `error` | Any | Partial data | `complete` (freeze at last known state) |

### Key Insight: `ReasoningUIPart.state`

The AI SDK's `ReasoningUIPart` has a `state?: 'streaming' | 'done'` field. This is the authoritative signal for phase transitions:

- `state === 'streaming'` → `thinking` phase (timer running, shimmer active)
- `state === 'done'` → `complete` phase (timer frozen, static label)
- No reasoning part → `idle` phase

This replaces the current fragile heuristic of "reasoning parts exist but no text visible" (which conflates "hasn't started emitting text" with "is actively thinking").

### Implementation Location

The state machine should be a **new hook**: `useReasoningPhase` (or extend the existing `useLoadingState`). It returns:

```typescript
type ReasoningPhase = {
  phase: 'idle' | 'thinking' | 'complete'
  reasoningText: string        // consolidated from all reasoning parts
  durationSeconds?: number     // undefined in idle/early thinking
  isReasoningStreaming: boolean // true only in thinking phase
}
```

This hook replaces:
- The `showThinking` boolean from `useLoadingState`
- The separate `reasoningParts` checks in `message-assistant.tsx`
- The `isStreaming` prop threading on the Reasoning component

### Changes to `useLoadingState`

`showThinking` should be **removed** from `useLoadingState`. The loading state hook should focus on the loader/dots indicators — "is anything happening that warrants a generic loading indicator?" The reasoning phase is its own concern.

### Open Questions

- Should the `thinking` → `complete` transition be instant or have a brief delay (ChatGPT appears to pause ~280ms before transitioning)? This is a polish concern for implementation.
- How does the state machine handle the case where a model emits reasoning, then a tool call, then more reasoning? The SDK can produce multiple `ReasoningUIPart` objects. The state machine should track the **last** reasoning part's state.

---

## 4. Persistence in Completed Messages

### Current State

- `ThinkingBar` **only renders for streaming messages** (`isLastStreaming && reasoningParts && contentNullOrEmpty`). Past messages never show a thinking indicator.
- `Reasoning` (app version) renders for **any message** with reasoning text. But it shows a static "Reasoning" label — no duration, no "Thought for Xs".
- No reasoning duration is stored anywhere — not in message parts, not in metadata, not in Convex.

### What Needs to Persist

For completed messages to show "Thought for 12s":

1. **Reasoning duration** — must survive page reload
2. **Whether reasoning occurred** — derived from presence of reasoning parts (already persists)
3. **Reasoning text** — already persists in `parts` array

### Storage Options

#### Option A: `UIMessage.metadata.reasoningDurationMs`

**Mechanism**: Send via `messageMetadata` callback at stream finish time.

**Pros**:
- First-class AI SDK support — `UIMessage<METADATA>` is generic, `messageMetadata` callback exists
- Clean separation — duration is message-level metadata, not content
- Type-safe with `MyUIMessage` pattern from SDK docs

**Cons**:
- Requires API route changes (add `messageMetadata` to `toUIMessageStreamResponse`)
- Requires Convex schema update if persisting messages (metadata field)
- Server doesn't natively know reasoning duration — would need client-side calculation sent back, or server-side tracking via `streamText` callbacks

#### Option B: Custom data part

**Mechanism**: Send a custom `data` part with reasoning duration.

**Pros**:
- Shows up in the parts array alongside reasoning
- Can be type-safe with `UIDataTypes`

**Cons**:
- Pollutes the parts array with non-content data
- More complex to filter out during rendering
- Feels like an abuse of the data parts system

#### Option C: Client-side compute on reload

**Mechanism**: Don't persist duration. On reload, show "Thought" without a time, or estimate from timestamps.

**Pros**:
- Zero storage changes
- Simple

**Cons**:
- Degrades UX — "Thought for 12s" becomes just "Thought" on reload
- Inconsistent with live streaming experience
- ChatGPT always shows duration on historical messages

### Recommended Approach

**Option A** — `UIMessage.metadata.reasoningDurationMs`.

Implementation:
1. Define a `MessageMetadata` type in the project
2. Add `messageMetadata` callback to the `toUIMessageStreamResponse` call in `app/api/chat/route.ts`
3. Track reasoning duration in the streaming pipeline (either server-side via `streamText` callbacks or client-side with a persist-back mechanism)
4. On completed messages, read `message.metadata?.reasoningDurationMs` for the label

For the server-side duration tracking, the cleanest approach is to use `streamText`'s `onStepFinish` callback or the `reasoning` event to capture timing. Alternatively, the client can send back the duration when the message is persisted to Convex (the `onFinish` callback in `useChat` fires with the final message).

### Backward Compatibility

Messages already stored without `reasoningDurationMs` should render with:
- If reasoning parts exist but no duration → "Thought" (no time) or "Reasoning" as a fallback label
- This is graceful degradation — old messages work fine, new messages get the full UX

### Open Questions

- Does the Convex message storage schema already have a `metadata` field, or does it need to be added?
- Should duration be stored in milliseconds (precision) or seconds (simplicity)? Recommendation: milliseconds, format on display.
- If the client computes duration, what's the mechanism to persist it back? Options: a mutation call in `onFinish`, or include it in the message save path.

---

## 5. Industry Patterns Research

### ChatGPT ("Thought for Xs")

**Behavior**:
1. User sends message → loading dots
2. Reasoning begins → collapsible "Thinking..." appears with live-updating timer
3. Reasoning completes → label transitions to "Thought for Xm Ys"
4. Component stays permanently in the message, collapsed by default
5. Chevron toggles reasoning text open/closed

**Implementation details** (from reverse-engineering analysis):
- Uses a 280ms intentional delay before showing first content ("considered" feel)
- Timer ticks live during thinking using client-side elapsed time
- Shimmer/gradient animation on the "Thinking" text
- Duration persists on the message — always visible on reload

**Key insight**: ChatGPT's component is a **single element** that transitions through phases. It never removes and re-adds DOM nodes.

### Claude.ai ("Thinking")

**Behavior**:
1. Thinking block appears as a collapsible section
2. Shows "Thinking..." during extended thinking
3. Content is visible inside the collapsible when expanded
4. No explicit timer displayed (unlike ChatGPT)
5. Persists after completion — can be re-expanded

**Key insight**: Claude's pattern is simpler — no timer, just a collapsible block. The "Thinking Claude" browser extension (github.com/richards199999/Thinking-Claude) adds fold/unfold UI for thinking sections.

### assistant-ui (`ChainOfThoughtPrimitive`)

**Approach**: Groups consecutive reasoning + tool-call parts into a single accordion. Collapsed by default. Uses `AuiIf` for conditional rendering based on accordion state.

**Key insight**: assistant-ui treats reasoning and tool calls as a unified "chain of thought" — they're grouped together because they represent intermediate steps before the final answer. This is architecturally different from our requirement (we only want reasoning in the thinking block, tool calls are separate).

### Vercel AI SDK Elements `Reasoning` Component

**API**:
```typescript
<Reasoning isStreaming={isReasoningStreaming} duration={durationSeconds}>
  <ReasoningTrigger />
  <ReasoningContent>{reasoningText}</ReasoningContent>
</Reasoning>
```

**`useReasoning()` hook returns**: `{ isStreaming, isOpen, setIsOpen, duration }`

**Key insight**: This is the closest reference implementation to what we need. It validates the compound component pattern with `isStreaming` + `duration` as the core props. However, it's built on Radix Collapsible and doesn't include timer logic — `duration` is externally provided.

### prompt-kit (our existing `components/ui/reasoning.tsx`)

**Already has**: Context-based state management, controlled/uncontrolled pattern, auto-open during streaming, auto-close on completion, React 19 render-sync, ResizeObserver animation.

**Missing**: Duration/timer, phase-aware label, shimmer animation.

**Key insight**: Our prompt-kit version is the most architecturally mature of the options already in the codebase. The Vercel Elements component validates the same API shape but adds `duration` as a concept.

### AI SDK Reasoning Part Structure

```typescript
type ReasoningUIPart = {
  type: 'reasoning'
  text: string
  state?: 'streaming' | 'done'
  providerMetadata?: ProviderMetadata
}
```

**Critical finding**: The `state` field (`'streaming' | 'done'`) is the authoritative signal for phase transitions. It's set by the SDK when processing the stream. No timing metadata is included in the part itself — duration must be computed externally.

**Multiple reasoning parts**: Models like GPT with high reasoning effort can return multiple `ReasoningUIPart` objects. The recommended pattern (from Vercel docs) is to consolidate them: `reasoningParts.map(p => p.text).join('\n\n')`.

---

## 6. Animation & Transition Design

### Current Animations

| Component | Animation | Library |
|-----------|-----------|---------|
| ThinkingBar | Text shimmer (gradient sweep) | CSS animation via `TextShimmer` |
| Reasoning (app) | Expand/collapse via height + opacity | framer-motion `AnimatePresence` |
| Reasoning (prompt-kit) | Expand/collapse via `max-height` transition | CSS transition + ResizeObserver |

### Transition: "Thinking..." → "Thought for Xs"

This is the key animation moment — the label must smoothly transition from an animated state to a static state within the same DOM element.

#### Option A: TextShimmer fade-out → static text fade-in

1. During `thinking` phase: Render "Thinking..." inside `<TextShimmer>` component
2. On transition to `complete`: Fade out shimmer, fade in static "Thought for Xs"
3. Use CSS transition on opacity, or framer-motion `AnimatePresence` with `mode="wait"`

**Pros**: Smooth, distinct visual phases
**Cons**: Requires coordinating two animations (fade out + fade in)

#### Option B: Shimmer animation wind-down

1. During `thinking` phase: "Thinking..." with shimmer
2. On transition: Shimmer animation speed decelerates and stops, text becomes static, label text crossfades to "Thought for Xs"
3. Use CSS `animation-play-state: paused` + text content swap

**Pros**: Feels organic, like the "thinking" is literally winding down
**Cons**: More complex to implement; `animation-play-state` can cause visual jumps

#### Option C: Instant swap (ChatGPT approach)

ChatGPT actually does a fairly **instant** transition — the shimmer stops and the text changes in one frame. The visual continuity comes from the component staying in the same position, not from a crossfade animation.

**Pros**: Simplest to implement, matches ChatGPT exactly
**Cons**: Less visually polished than a crossfade

### Recommended Approach

**Option C** (instant swap) for the initial implementation, with Option A as a future polish.

**Rationale**: ChatGPT has validated that an instant transition works well when the component stays in place. The key UX win is **not removing and re-adding the DOM node** — that's what causes the current jarring experience. A smooth label swap within a persistent container is sufficient.

### Expand/Collapse Animation

The prompt-kit compound component already uses CSS `max-height` transitions with `ResizeObserver`. This is the right approach — no changes needed.

The framer-motion `AnimatePresence` in the app reasoning component should be **removed** when migrating to the unified component (it's replaced by the CSS transition in the prompt-kit version, reducing the framer-motion dependency surface).

### Shimmer Effect Details

The existing `TextShimmer` component (`components/ui/text-shimmer.tsx`) is well-suited:
- Configurable `duration` (default 4s) and `spread` (default 20)
- Pure CSS animation — no JavaScript overhead
- Already used by ThinkingBar

For the "Thinking..." label during active reasoning, wrap the text in `<TextShimmer>`:

```
<TextShimmer duration={2} spread={15}>Thinking...</TextShimmer>
```

A faster shimmer (2s vs 4s) and tighter spread (15 vs 20) would feel more "active" and less like a loading placeholder.

### Live Timer Animation

During the `thinking` phase, the timer should update every second. This creates a subtle but important animation: the numbers ticking up. Combined with the shimmer on "Thinking...", this gives the user two signals that the system is working.

Implementation: `useEffect` with `setInterval(1000)` during `thinking` phase, reading from a `startTimeRef`. Clean up on phase transition.

### Open Questions

- Should the chevron rotate on expand/collapse? The current app version rotates the arrow 180°. The prompt-kit version also rotates 180°. This is consistent — keep it.
- Should there be a visual indicator (pulse, dot, etc.) alongside the shimmer text during thinking? ChatGPT uses just the shimmer + timer. Claude uses a subtle pulse. Recommendation: start with shimmer + timer only, add pulse if testing shows users miss the activity signal.

---

## Summary of Recommendations

| Area | Recommendation |
|------|----------------|
| **Component base** | Extend existing prompt-kit compound component (`components/ui/reasoning.tsx`) |
| **Components to remove** | `app/components/chat/reasoning.tsx` (replaced), `ThinkingBar` usage in message-assistant (absorbed) |
| **Timer source** | Client-side `useRef` timer keyed to `ReasoningUIPart.state` transitions |
| **Timer persistence** | `UIMessage.metadata.reasoningDurationMs` via `messageMetadata` callback |
| **State machine** | New `useReasoningPhase` hook with `idle → thinking → complete` phases |
| **Phase signal** | `ReasoningUIPart.state: 'streaming' | 'done'` (primary), first TextUIPart (fallback) |
| **Label transition** | Instant swap: "Thinking..." (shimmer) → "Thought for Xs" (static) |
| **Expand/collapse** | CSS `max-height` transition (already in prompt-kit), remove framer-motion |
| **Default state** | Expanded during `thinking`, collapsed on transition to `complete` |
| **Backward compat** | Old messages without duration show "Thought" (no time) |

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `ReasoningUIPart.state` is `undefined` in some SDK versions | Medium | Fallback to text-content-based heuristic |
| Multiple reasoning parts from GPT models | Low | Consolidate parts before passing to component (already documented pattern) |
| Mutable parts causing stale timer values | Medium | Timer uses `useRef` + wall-clock time, not part content for timing |
| Convex schema migration for metadata field | Low | `metadata` field is optional — additive change, no migration needed |
| React.memo bypassing hides reasoning updates | Already solved | `areMessagesEqual` returns `false` for streaming last message (line 73 of `message.tsx`) |

### Implementation Order (suggested)

1. **Phase 1**: Create `useReasoningPhase` hook with state machine + client-side timer
2. **Phase 2**: Extend prompt-kit Reasoning component with `phase`, `duration`, and shimmer-label
3. **Phase 3**: Update `message-assistant.tsx` to use unified component, remove ThinkingBar + app Reasoning
4. **Phase 4**: Add `messageMetadata` to API route for server-side duration persistence
5. **Phase 5**: Polish — animation timing, live ticking timer, backward-compat label for old messages
