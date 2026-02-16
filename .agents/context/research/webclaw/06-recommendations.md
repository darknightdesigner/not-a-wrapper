# WebClaw Research Synthesis — Prioritized Recommendations for Not A Wrapper

> **Agent**: Synthesis (Phase 3)
> **Status**: Complete
> **Date**: February 15, 2026
> **Depends On**: `04-cmp-architecture.md`, `05-cmp-ux-performance.md`
> **Also Reads**: All Phase 1 docs (01–03), `../open-webui-analysis/SUMMARY.md`

---

## Executive Summary

Across five research documents, 65 coded claims, and direct comparison with Not A Wrapper's codebase, the WebClaw analysis reveals a clear pattern: **the most transferable findings are React-level performance optimizations and code organization patterns, not architectural decisions.** WebClaw's gateway-dependent, stateless-client architecture is non-transferable to NaW's multi-provider serverless platform. But WebClaw's streaming performance discipline — content-based memoization, ref-based composer isolation, portal-based scroll containers, and 13-hook decomposition — addresses the exact performance gaps in NaW's current chat implementation.

This document distills the research into **15 recommendations** (5 P0, 5 P1, 5 P2), each with full evidence tracing, risk assessment, and cross-reference to Open WebUI findings. The P0 recommendations alone would reduce per-streaming-chunk DOM work from O(N × message_complexity) to O(1), eliminate keystroke-triggered re-render cascades, and add a critical safety net for dropped streams.

---

## 1. Quick Wins (< 1 week effort each)

These patterns are adoptable immediately with minimal risk and high payoff.

| # | Quick Win | File to Change | Pattern | Expected Improvement |
|---|-----------|---------------|---------|---------------------|
| 1 | Message memoization | `app/components/chat/message.tsx` | Wrap in `React.memo` with `areMessagesEqual` content comparator | O(N) → O(1) re-renders per streaming chunk |
| 2 | Composer ref isolation | `app/components/chat/use-chat-core.ts` line 92 | Move `input` from `useState` to `useRef`; debounce draft persistence to 500ms | Eliminate keystroke cascade through chat.tsx → conversation.tsx |
| 3 | Generation guard timer | `app/components/chat/use-chat-core.ts` (new effect) | 120s timeout when `status === "streaming"`; on timeout: `stop()` + error toast | Prevent stuck "generating" UI when streams drop silently |
| 4 | Singleton Shiki highlighter | `app/components/chat/code-block.tsx` (or equivalent) | Module-level `let highlighterPromise` initialized once on first use | Eliminate redundant Shiki WASM initialization per code block |
| 5 | Typography utilities | `app/components/chat/markdown.tsx` + global markdown styles | Add `text-balance` to headings, `text-pretty` to body text | Better text rendering at zero perf cost (CSS progressive enhancement) |

---

## 2. Architectural Lessons

### Screen-Based Feature Modules

WebClaw organizes the entire chat feature into a self-contained `screens/chat/` directory: components, hooks, types, queries, and utilities in one tree. NaW scatters the equivalent across `app/components/chat/` (22 files), `lib/chat-store/` (7 files), and `app/api/chat/` (6 files).

**Concrete refactoring path:**

```
Phase 1: Co-locate queries (1 day)
  Create app/components/chat/chat-queries.ts
  Centralize TanStack Query keys, fetchers, cache helpers
  
Phase 2: Co-locate types (0.5 day)
  Move chat-specific types from lib/chat-store/types.ts
  into app/components/chat/types.ts
  Keep shared types (consumed by sidebar, history) in lib/

Phase 3: Separate hooks subdirectory (1 day)
  Move hooks into app/components/chat/hooks/
  Each hook in its own file with single responsibility

Phase 4: (Optional) Rename to features/chat/ (0.5 day)
  Only if NaW adds more feature modules (projects/, settings/)
```

**Key constraint:** `lib/chat-store/chats/provider.tsx` and `lib/chat-store/messages/provider.tsx` stay in `lib/` — they're consumed by sidebar, history, and project views. The API route (`app/api/chat/`) stays where it is (Next.js routing constraint).

### Hook Decomposition Strategy

WebClaw's 13-hook decomposition proves that a monolithic chat hook can be broken into focused units that each own one concern. NaW's `use-chat-core.ts` (~670 LOC, 16-item return, 138-line `submit` callback with 16-item dependency array) is the extraction candidate.

**Extraction plan:**

| New Hook | Extracted From | WebClaw Equivalent | LOC Estimate |
|----------|---------------|-------------------|-------------|
| `use-chat-streaming.ts` | useChat initialization (119–160) + status/error/stop | `use-chat-stream.ts` | ~100 |
| `use-chat-submit.ts` | `submit` callback (225–363) + `handleSuggestion` (531–604) | `chat-screen.tsx` send flow | ~200 |
| `use-chat-edit.ts` | `submitEdit` callback (365–528) | No equivalent | ~170 |
| `use-chat-input.ts` | input/setInput state (92) + handleInputChange (628–634) | Implicit in `ChatComposer` | ~50 |
| `use-chat-search.ts` | enableSearch state (69–71) + setEnableSearch (217–221) | `use-chat-settings.ts` | ~30 |
| `use-chat-hydration.ts` | Chat transition effects (169–204) | `use-chat-redirect.ts` | ~50 |

### Convention Adoption

Three conventions warrant formal adoption in `AGENTS.md`:

1. **`type` over `interface`** — Add ESLint rule `@typescript-eslint/consistent-type-definitions: ['error', 'type']`. Apply to new code immediately, codemod existing code opportunistically.

2. **No `useEffect` for derivable state** — Audit existing effects. Two candidates in `use-chat-core.ts` (message hydration at line 191, search preference sync at line 213) could be `useMemo` or initialization logic. Aligns with React 19 / React Compiler best practices.

3. **Named function expressions for TanStack Query callbacks** — Produces labeled entries in React Query Devtools at zero cost:
   ```typescript
   // Before (anonymous in devtools)
   queryClient.setQueryData(key, (data) => ({ ...data, messages: [...data.messages, msg] }))
   // After (labeled in devtools)
   queryClient.setQueryData(key, function appendMessage(data) { return { ...data, messages: [...data.messages, msg] } })
   ```

---

## 3. UI/UX Patterns to Adapt

### Global Prompt Auto-Focus

WebClaw's `bindGlobalPromptListener()` auto-focuses the chat textarea when the user types printable characters anywhere on the page (excluding editable fields). ~20 lines of code. Matches VS Code behavior.

**What to lift:** The entire pattern — global `keydown` listener that checks `event.metaKey`, `event.ctrlKey`, `event.altKey`, target element tag, and `isContentEditable` before focusing the textarea.

**What to modify:** NaW has keyboard shortcuts (possibly via hotkeys) that may conflict. Ensure the listener respects existing shortcut bindings and the inline trigger system (`#`, `/`, `@` from Open WebUI P0 recommendation).

### Context Meter (Token Usage Display)

WebClaw's `context-meter.tsx` shows token usage as a progress bar (e.g., "128K / 200K") in the chat header. NaW has model context window data in `lib/models/` but doesn't surface it.

**What to lift:** The progress bar concept with formatted token counts.

**What to modify:** NaW needs per-provider token counting. The Vercel AI SDK's `usage` object from `streamText()` provides `promptTokens` and `completionTokens`. Accumulate these across the conversation and display against the model's `contextWindow` from NaW's model config.

### Pin-to-Top Scroll Behavior

WebClaw pins the user's message to the top of the viewport while the response grows below. This creates a ChatGPT-like experience where the question stays visible during long responses.

**What to lift:** The `pinToTop` state concept that triggers on new response start.

**What to modify:** Must integrate with `use-stick-to-bottom`. When `pinToTop` is active, use `scrollIntoView({ block: 'start' })` on the user message element instead of scrolling to bottom. Switch back to bottom-anchoring when the user scrolls manually.

### Typing Indicator Enhancement

WebClaw's `TextShimmer` component uses CSS `background-clip: text` with a gradient animation — a polished loading state. NaW's `Loader` is adequate but less refined.

**What to lift:** The `TextShimmer` CSS technique as a reusable animation primitive.

**What to modify:** Apply to NaW's existing loader component rather than replacing it. The three-dot animation can remain; add the shimmer effect to the "Generating..." label.

---

## 4. Performance Patterns to Adopt

### R01 — Content-Based Message Memoization

The single highest-impact performance fix available.

```typescript
// Target: app/components/chat/message.tsx (or wherever Message is defined)

function areMessagesEqual(prev: MessageProps, next: MessageProps): boolean {
  // Skip re-render if actual content hasn't changed
  if (prev.role !== next.role) return false
  if (textContent(prev.message) !== textContent(next.message)) return false
  if (reasoningContent(prev.message) !== reasoningContent(next.message)) return false
  if (toolCallsSignature(prev.message) !== toolCallsSignature(next.message)) return false
  if (prev.isStreaming !== next.isStreaming) return false
  return true
}

const MemoizedMessage = React.memo(Message, areMessagesEqual)
```

**Why content-based, not referential:** During streaming, every token creates a new messages array reference from Vercel AI SDK's `useChat`. Reference equality fails for every message, every chunk. Content-based comparison (text + reasoning + tool signatures) ensures only the actively streaming message re-renders.

**Cost analysis:** Per streaming chunk with 200 messages: 200 signature comparisons (string extraction + comparison). Each is O(text_length) — cheap. Total: sub-millisecond. Versus current: 200 full component re-renders with virtual DOM diffing.

### R04 — Ref-Based Composer Input

```typescript
// Current (use-chat-core.ts line 92): every keystroke triggers parent re-render
const [input, setInput] = useState(draftValue || "")

// Target: move to useRef in composer component
const valueRef = useRef('')
const setValueRef = useRef<((v: string) => void) | null>(null)

// Draft persistence: debounce to 500ms
const debouncedSetDraft = useMemo(
  () => debounce((v: string) => setDraftValue(v), 500),
  [setDraftValue]
)
```

**Why this matters:** Currently, typing "hello" triggers 5 state updates in `use-chat-core.ts`, each propagating through `chat.tsx` → `conversationProps` memo → `Conversation` → all `Message` components. With ref-based input, keystrokes are invisible to React's reconciler.

### Portal-Based Scroll Container (Evaluate First)

WebClaw uses `createPortal()` to inject message content into a memoized scroll shell, preventing `ScrollAreaRoot`, `ScrollAreaScrollbar`, and `ScrollAreaThumb` from re-rendering on every content update.

**Before adopting:** Profile NaW's `use-stick-to-bottom` during streaming with React DevTools. If the scroll library already memoizes its shell internally, this pattern is redundant. If scroll components show up in the profiler during streaming, layer the portal pattern on top.

### Stable Reference via Signature

WebClaw's `useChatHistory` computes a string signature from message count + last role + last ID + last 32 chars of text + content signature. If the signature matches the previous render, it returns the same array reference — preventing unnecessary downstream re-renders from background refetches.

**NaW application:** If NaW uses TanStack Query for any chat data alongside Convex subscriptions, apply this pattern to prevent TQ refetch cycles (window focus, interval) from triggering unnecessary re-renders when data hasn't actually changed.

---

## 5. Things We Should NOT Copy

### Gateway Architecture Patterns

WebClaw's entire server layer is a WebSocket client to the OpenClaw Gateway. The connection pooling (`sharedGatewayClients` Map), SSE bridge (WS → SSE translation), and RPC correlation pattern are elegant but **non-transferable** to NaW's serverless architecture. Vercel serverless functions are ephemeral — no persistent connections between requests.

**Evidence:** WC-A1-C01, WC-A1-C02, WC-A1-C03, WC-A4-C04, WC-A4-C05, WC-A4-C12

### Module-Level Mutable State

WebClaw uses `let` variables at module scope for cross-navigation coordination (`pending-send.ts`, `session-tombstones.ts`). These survive React navigation but are invisible to DevTools, cannot be serialized for SSR, break on hot reload, and cannot be shared across tabs.

**NaW alternative:** Use Zustand stores (already in the stack) for cross-component coordination state. They provide the same persistence across navigation with the added benefits of DevTools visibility, selective subscriptions, and `persist` middleware.

### No-Virtualization Message Rendering

WebClaw renders all messages as DOM nodes with a hard cap of 200 messages. For NaW's multi-model comparison (which can easily exceed 200 messages across parallel streams), this would cause performance degradation. Plan for `@tanstack/react-virtual` when conversation length becomes a measured bottleneck.

### UI State in TanStack Query Cache

Storing `isSidebarCollapsed` in the TQ cache as a "virtual query" with `staleTime: Infinity` is clever for a single-state app but semantically misleading. NaW already uses Zustand for UI state — keep it there.

### Streamdown Markdown Parser

WebClaw uses Streamdown for streaming-optimized markdown. NaW's `react-markdown` + `marked.lexer()` per-block memoization already provides 80% of the benefit with zero migration risk. Streamdown is newer, less battle-tested, and NaW's approach is proven. Only revisit if streaming jank is measured and traced to markdown parsing.

---

## 6. Things We Do Better

An honest assessment of NaW's advantages to protect.

| Advantage | NaW | WebClaw | Protect? |
|-----------|-----|---------|----------|
| **Multi-provider support** | 8+ providers, 100+ models via Vercel AI SDK | Single gateway, single model at a time | Yes — core differentiator |
| **Multi-model comparison** | Compare N models side-by-side | Not supported | Yes — unique capability |
| **BYOK encryption** | AES-256-GCM encrypted user keys in Convex | Not applicable (gateway handles) | Yes — security feature |
| **Real-time data sync** | Convex subscriptions (sub-second updates) | 30s polling + tombstone hacks | Yes — architectural advantage |
| **Per-block markdown memoization** | `marked.lexer()` → block splitting → independent memo | Whole-component `React.memo` | Yes — better for completed content |
| **Draft persistence** | `useChatDraft` → IndexedDB | Not implemented | Yes — user convenience |
| **Scroll management** | `use-stick-to-bottom` (battle-tested library) | Custom MutationObserver + scroll listener | Yes — less maintenance |
| **Auth architecture** | Clerk (managed, multi-method, production-grade) | Shared gateway token/password | Yes — production-grade |
| **Database persistence** | Convex (full persistence, real-time, vector search) | None (gateway manages all state) | Yes — data ownership |
| **Feature breadth** | 73 UI components, file upload, feedback, sources, projects | 22 components, single chat view | Yes — platform scope |
| **Thinking/reasoning display** | 3 components (reasoning.tsx, thinking-bar.tsx, chain-of-thought.tsx) | 1 minimal collapsible (45 LOC) | Yes — richer UX |

---

## 7. Comparison with Open WebUI Findings

| Dimension | Open WebUI Finding | WebClaw Finding | Convergence | NaW Action |
|-----------|-------------------|-----------------|-------------|------------|
| **Component decomposition** | OWUI's `Chat.svelte` is 1,500 lines — god-module anti-pattern (cautionary tale) | WebClaw's ChatScreen is 450 LOC + 13 hooks — well-decomposed (positive example) | **Converge**: Both point to decomposing NaW's `use-chat-core.ts` monolith | P1: Hook decomposition |
| **Tool display** | OWUI tools fail silently — #1 pain point (67+ comments) | WebClaw's `tool.tsx` has explicit 4-state machine (`input-streaming` → `output-available` → `output-error`) | **Converge**: Both confirm visible tool state is essential | Adopt 4-state tool model |
| **Context visibility** | OWUI truncates context silently | WebClaw surfaces token usage in context meter | **Converge**: Both confirm NaW should show context window usage | P1: Context meter |
| **Performance** | OWUI degrades at 100+ messages, 500MB+ memory | WebClaw caps at 200, no virtualization | **Converge**: Neither virtualizes. NaW should plan for it given multi-model comparison. | Future: Plan virtualization |
| **Inline triggers** | OWUI has `#`, `/`, `@` trigger characters — best UX pattern found | WebClaw has none | **New perspective**: WebClaw's absence reinforces that inline triggers are a gap only NaW's complexity demands | Already in OWUI P0 #2 |
| **Streaming performance** | Different stack (Svelte) — no direct comparison | Same stack (React 19) — directly comparable memo patterns | **New perspective**: WebClaw provides concrete React performance patterns OWUI research couldn't | P0: Memoization patterns |
| **State management** | OWUI has 50+ flat Svelte stores with no persistence | WebClaw has TQ + Zustand with persist — disciplined | **Converge**: Both NaW and WebClaw have better state management than OWUI | Protect existing approach |
| **Auto-scroll** | OWUI has basic auto-scroll | WebClaw has pin-to-top — novel enhancement | **New perspective**: Pin-to-top not seen in any prior research | P2: Evaluate pin-to-top |
| **Silent failures** | OWUI's #1 anti-pattern — silent failure modes | WebClaw has generation guard timer (120s timeout) | **Converge**: Both confirm safety nets for streaming are essential | P0: Generation guard |

**Summary:** WebClaw findings **confirm** 4 Open WebUI recommendations (decomposition, tool visibility, context meter, failure feedback) and **add new perspective** on 3 dimensions (React-specific performance patterns, pin-to-top scroll, ref-based input isolation) that the Open WebUI research couldn't address due to the different stack.

---

## 8. Implementation Dependencies

```
[No Dependencies — Do Immediately]
├── R01: Message Memoization ← no deps
├── R03: Generation Guard Timer ← no deps
├── R04: Singleton Shiki ← no deps
├── R05: Typography (text-balance/text-pretty) ← no deps
└── R09: Convention Enforcement ← no deps (policy change)

[Performance Chain]
R01: Message Memoization
└──→ R02: Composer Ref Optimization (can co-land, but test memo first)
     └──→ R06: Hook Decomposition (largest refactor — do after perf wins land)
          └──→ R10: Screen-Based Feature Module (organizational, after hook boundaries clear)

[UX Chain]
R07: Global Prompt Auto-Focus ← no deps
R08: Context Meter ← needs token counting from AI SDK usage object
     └──→ R12: Pin-to-Top Scroll (evaluate after context meter ships)

[Evaluation-Gated]
R11: Portal-Based Scroll Container ← GATED on profiling results
     Profile use-stick-to-bottom during streaming first.
     Only implement if scroll components appear in React DevTools profiler.
```

**Critical path:** R01 → R02 → R06 → R10 is the longest chain. Start R01 immediately; it unblocks the performance chain.

**Parallel work:** R03, R04, R05, R07, R09 have zero dependencies and can proceed in any order alongside the performance chain.

---

## 9. Unresolved Questions (Requiring Human Decision)

1. **Does NaW's `Message` component cause measurable jank during streaming?** The analysis (WC-A5-C07) shows all messages re-render per chunk, but React's reconciliation may keep frame times under 16ms on modern hardware. **Decision needed:** Profile with React DevTools before or after implementing R01? Recommendation: implement R01 first (low risk, high ceiling), then profile to measure improvement.

2. **Should draft persistence remain synchronous with input state?** Moving composer input to `useRef` (R02) requires decoupling draft saves from React state. A 500ms debounce is proposed, but this means drafts could be lost on tab close within the debounce window. **Decision needed:** Is 500ms draft loss acceptable? Alternative: use `beforeunload` to flush pending draft.

3. **Should the hook decomposition (R06) happen before or after the AI SDK v6 patterns settle?** NaW uses Vercel AI SDK, which manages its own streaming state via `useChat`. Decomposing `use-chat-core.ts` may be affected by any upcoming SDK changes to the `useChat` API. **Decision needed:** Proceed now or wait for SDK v6 to stabilize?

4. **Is pin-to-top scroll (R12) desirable for NaW's users?** This is a UX preference with no clear right answer. ChatGPT scrolls to bottom; WebClaw pins to top. **Decision needed:** Ship behind a user preference toggle, or pick one behavior?

5. **Should the context meter (R08) show estimated tokens or actual tokens?** Estimated tokens (from model config × message count heuristic) are available immediately. Actual tokens require accumulating `usage` data from each `streamText()` response. **Decision needed:** Ship estimated first and upgrade to actual, or wait for actual?

---

## Recommendations (Grouped by Priority)

### P0 — Do Now (5 recommendations)

---

#### R01: Content-Based Message Memoization

| Field | Value |
|-------|-------|
| **Title** | Content-Based Message Memoization |
| **Action** | Adopt |
| **Confidence** | High |
| **Transferability** | Direct — same React 19 stack, identical problem |
| **Effort** | 1–2 days |
| **Impact** | Performance — reduces per-streaming-chunk DOM work from O(N) to O(1) |
| **Evidence** | WC-A5-C07, WC-A3-C02, WC-A2-C17 |
| **Risk if wrong** | Negligible — `React.memo` can be removed. Worst case: custom comparator has a bug that skips a needed re-render (testable) |
| **Synergy with OWUI** | Confirms OWUI finding that 100+ messages cause degradation. Memoization is the first defense before virtualization. |

**Implementation:** Wrap `Message` in `React.memo` with `areMessagesEqual`. The comparator extracts text content, reasoning content, and tool call signatures as strings and compares them. Only the message whose content actually changed re-renders.

---

#### R02: Composer Input Ref Optimization

| Field | Value |
|-------|-------|
| **Title** | Composer Input Ref Optimization |
| **Action** | Adapt |
| **Confidence** | High |
| **Transferability** | Direct — universal React pattern |
| **Effort** | 1–2 days |
| **Impact** | Performance — eliminates keystroke-triggered cascading re-renders |
| **Evidence** | WC-A5-C08, WC-A3-C04, WC-A2-C15 |
| **Risk if wrong** | Medium — breaks draft persistence if debounce isn't wired correctly. Mitigate: `beforeunload` flush. |
| **Synergy with OWUI** | N/A — different stack (Svelte). New insight unique to WebClaw research. |

**Implementation:** Move `input` from `useState` in `use-chat-core.ts` (line 92) to `useRef` in the composer component. Debounce `setDraftValue` to 500ms. Expose `getValue()` callback for submission. Add `beforeunload` listener to flush pending draft.

---

#### R03: Generation Guard Timer

| Field | Value |
|-------|-------|
| **Title** | Generation Guard Timer |
| **Action** | Adopt |
| **Confidence** | High |
| **Transferability** | Direct — ~35 lines of framework-agnostic timeout logic |
| **Effort** | < 1 day |
| **Impact** | UX reliability — prevents permanent "streaming" state when connections drop |
| **Evidence** | WC-A5-C13, WC-A2-C09 (auto-reconnection + guard) |
| **Risk if wrong** | Timer fires too early on slow models (long thinking). Mitigate: configurable timeout (120s default), extend for reasoning-enabled models. |
| **Synergy with OWUI** | Confirms OWUI anti-pattern #4 (silent failure modes). Generation guard is the streaming equivalent of visible failure feedback. |

**Implementation:** Add a `useEffect` in `use-chat-core.ts` (or extracted `use-chat-streaming.ts`) that starts a timeout when `status === "streaming"`. On timeout: call `stop()`, show error toast ("Response timed out — please try again"), reset streaming state.

---

#### R04: Singleton Shiki Highlighter

| Field | Value |
|-------|-------|
| **Title** | Singleton Shiki Highlighter |
| **Action** | Adopt |
| **Confidence** | High |
| **Transferability** | Direct — module-level singleton pattern |
| **Effort** | < 1 day |
| **Impact** | Performance — eliminates redundant WASM initialization per code block |
| **Evidence** | WC-A5-C06, WC-A2-C03 |
| **Risk if wrong** | None — strictly better than per-render initialization |
| **Synergy with OWUI** | N/A — different syntax highlighting approach. New insight from WebClaw. |

**Implementation:** Create a module-level `let highlighterPromise: Promise<HighlighterCore> | null = null` in the code block component. Initialize with `createHighlighterCore()` on first use. All code blocks share the same instance. Pre-load common languages (JS, TS, Python, Bash, JSON, etc.).

---

#### R05: Typography Utilities (text-balance, text-pretty)

| Field | Value |
|-------|-------|
| **Title** | Typography Utilities |
| **Action** | Adopt |
| **Confidence** | High |
| **Transferability** | Direct — CSS standard properties |
| **Effort** | < 0.5 day |
| **Impact** | UX — improved text rendering at zero performance cost |
| **Evidence** | WC-A5-C15 |
| **Risk if wrong** | None — CSS progressive enhancement, ignored by unsupported browsers |
| **Synergy with OWUI** | N/A — typography-specific, not covered in OWUI research. |

**Implementation:** Add `text-balance` to heading styles (h1–h3) and `text-pretty` to body/paragraph styles in the markdown component. Also apply in chat sidebar session titles and any multi-line UI text.

---

### P1 — Do Next (5 recommendations)

---

#### R06: Hook Decomposition of `use-chat-core.ts`

| Field | Value |
|-------|-------|
| **Title** | Hook Decomposition |
| **Action** | Adapt |
| **Confidence** | High |
| **Transferability** | Direct — same React hook composition model |
| **Effort** | 3–5 days |
| **Impact** | DX + Performance — easier maintenance, better re-render isolation, each hook independently testable |
| **Evidence** | WC-A5-C02, WC-A5-C03, WC-A2-C09–C14, WC-A4-C08 |
| **Risk if wrong** | Medium — increased indirection (more files, more imports). Mitigate: keep all hooks co-located in `hooks/` subdirectory with clear naming. Worse case: more boilerplate for the same functionality. |
| **Synergy with OWUI** | OWUI's 1,500-line `Chat.svelte` is the cautionary tale; WebClaw's 13-hook pattern is the positive example. Both converge on the same prescription: decompose. |

**Implementation:** Extract 6 hooks from `use-chat-core.ts` (see Section 2 above). Each hook owns one concern: streaming, submission, editing, input, search, hydration. The orchestrator (`chat.tsx`) calls hooks at the top level and passes results as props.

---

#### R07: Global Prompt Auto-Focus

| Field | Value |
|-------|-------|
| **Title** | Global Prompt Auto-Focus |
| **Action** | Adopt |
| **Confidence** | Medium |
| **Transferability** | Direct — ~20 lines of vanilla JS |
| **Effort** | < 1 day |
| **Impact** | UX — eliminates click-to-focus friction. Matches VS Code behavior. |
| **Evidence** | WC-A5-C11, WC-A2-C05 |
| **Risk if wrong** | Low — may interfere with keyboard shortcuts or accessibility (screen readers). Mitigate: exclude meta/ctrl/alt keys, editable elements, and respect `aria-` attributes. Test with VoiceOver. |
| **Synergy with OWUI** | OWUI doesn't have this. Competitive differentiator vs all analyzed competitors. |

**Implementation:** Attach a global `keydown` listener in the chat layout. On printable character input (single-char keys, excluding meta/ctrl/alt): focus the prompt textarea if the event target isn't an input, textarea, or `contentEditable` element.

---

#### R08: Context Meter / Token Usage Display

| Field | Value |
|-------|-------|
| **Title** | Context Meter |
| **Action** | Adopt |
| **Confidence** | High |
| **Transferability** | Direct — component pattern + data from existing model config |
| **Effort** | 3–5 days |
| **Impact** | UX — power user feature, context visibility. Cross-competitor pattern. |
| **Evidence** | WC-A5-C14, OWUI P0 #4 (visible failure feedback) |
| **Risk if wrong** | Low — informational display only. Worst case: inaccurate token estimate (fixable). |
| **Synergy with OWUI** | Both WebClaw AND Open WebUI surface context information. NaW is the outlier among all three analyzed competitors. |

**Implementation:** Create a progress bar component in the chat header. Show estimated token usage against the model's `contextWindow`. Phase 1: estimate from message count × average tokens. Phase 2: accumulate actual `usage.promptTokens` from Vercel AI SDK responses.

---

#### R09: Convention Enforcement

| Field | Value |
|-------|-------|
| **Title** | Convention Enforcement (type, useEffect policy, named functions) |
| **Action** | Adopt |
| **Confidence** | High |
| **Transferability** | Direct — convention + ESLint rules |
| **Effort** | 1 day (policy) + ongoing (enforcement) |
| **Impact** | DX — consistency, better tooling, React 19/Compiler alignment |
| **Evidence** | WC-A4-C07, WC-A4-C08, WC-A4-C09, WC-A1-C06 |
| **Risk if wrong** | None — conventions are reversible policy decisions |
| **Synergy with OWUI** | OWUI has disabled lint entirely. Convention enforcement is the opposite approach — confirms NaW's quality-first philosophy. |

**Implementation:** (1) Add `@typescript-eslint/consistent-type-definitions: ['error', 'type']` to ESLint config. (2) Document "no useEffect for derivable state" in `AGENTS.md`. (3) Adopt named function expressions for TQ callbacks in coding standards.

---

#### R10: Screen-Based Feature Module for Chat

| Field | Value |
|-------|-------|
| **Title** | Screen-Based Feature Module |
| **Action** | Adapt |
| **Confidence** | Medium |
| **Transferability** | Direct — purely organizational change |
| **Effort** | 2–3 days |
| **Impact** | DX — improved locality, discoverability, boundary clarity |
| **Evidence** | WC-A4-C03, WC-A1-C05 |
| **Risk if wrong** | Low — directory reorganization is reversible. Risk: circular deps with `lib/chat-store/` if boundary is misdrawn. |
| **Synergy with OWUI** | Addresses OWUI anti-pattern #5 (god-module). Both research tracks confirm that scattered chat code creates maintenance burden. |

**Implementation:** Follow the phased refactoring path in Section 2. Start with co-locating `chat-queries.ts`, then types, then hooks subdirectory. Keep shared state providers in `lib/`.

---

### P2 — Do Later (5 recommendations)

---

#### R11: Portal-Based Scroll Container (Evaluation-Gated)

| Field | Value |
|-------|-------|
| **Title** | Portal-Based Scroll Container |
| **Action** | Adapt (gated on profiling) |
| **Confidence** | Medium |
| **Transferability** | Direct — same Base UI ScrollArea |
| **Effort** | 1–2 days |
| **Impact** | Performance — prevents scroll component re-renders during streaming |
| **Evidence** | WC-A5-C09, WC-A3-C03, WC-A2-C01 |
| **Risk if wrong** | Low — if `use-stick-to-bottom` already handles this internally, the pattern is redundant |
| **Synergy with OWUI** | N/A — different rendering model |

**Implementation:** Profile `use-stick-to-bottom` during streaming with React DevTools first. If scroll components (`ScrollAreaRoot`, `ScrollAreaScrollbar`, `ScrollAreaThumb`) appear in the profiler, implement the `createPortal` pattern: memoize the scroll shell, portal content into the viewport node.

---

#### R12: Pin-to-Top Scroll Behavior

| Field | Value |
|-------|-------|
| **Title** | Pin-to-Top Scroll |
| **Action** | Adapt |
| **Confidence** | Medium |
| **Transferability** | Adaptable — requires integration with `use-stick-to-bottom` |
| **Effort** | 2–3 days |
| **Impact** | UX — better readability during long responses |
| **Evidence** | WC-A5-C12, WC-A2-C16 |
| **Risk if wrong** | Medium — may conflict with `use-stick-to-bottom`, may feel unfamiliar. Mitigate: ship behind user preference toggle. |
| **Synergy with OWUI** | Neither OWUI nor ChatGPT/Claude has this — potential differentiator. |

**Implementation:** Add `pinToTop` boolean state. Set to `true` when a new response starts streaming. When active, `scrollIntoView({ block: 'start' })` on the user message element. Revert to bottom-anchoring when user scrolls manually or when response completes.

---

#### R13: Unified Message Component Pattern

| Field | Value |
|-------|-------|
| **Title** | Unified Message Component |
| **Action** | Adapt |
| **Confidence** | High |
| **Transferability** | Direct — component composition pattern |
| **Effort** | 2–3 days |
| **Impact** | DX — reduces duplication between `message-user.tsx` and `message-assistant.tsx` |
| **Evidence** | WC-A5-C01 |
| **Risk if wrong** | Low — component refactoring, easily reversible |
| **Synergy with OWUI** | N/A — different component model |

**Implementation:** Create a unified `Message` component with compound sub-components (`MessageContent`, `MessageActions`, `MessageAvatar`). Use `MessageContent markdown={boolean}` to switch between plain text (user) and markdown (assistant) rendering. Eliminate duplicated avatar, layout, and action logic.

---

#### R14: Replace cmdk with Base UI Autocomplete (Evaluate Only)

| Field | Value |
|-------|-------|
| **Title** | Evaluate cmdk Replacement |
| **Action** | Skip (evaluate later) |
| **Confidence** | Medium |
| **Transferability** | Adaptable — non-trivial migration |
| **Effort** | 1–2 weeks |
| **Impact** | DX — eliminates Radix as transitive dependency |
| **Evidence** | WC-A5-C04 |
| **Risk if wrong** | cmdk is battle-tested; Base UI Autocomplete fuzzy matching may be inferior |
| **Synergy with OWUI** | N/A |

**Decision:** Skip for now. The Radix transitive dependency through cmdk is a minor nuisance, not a blocker. Revisit when NaW fully migrates off any remaining Radix dependencies.

---

#### R15: Streaming Update Batching (Future Investigation)

| Field | Value |
|-------|-------|
| **Title** | Streaming Update Batching |
| **Action** | Skip (investigate when needed) |
| **Confidence** | Low |
| **Transferability** | Adaptable |
| **Effort** | 2–3 days investigation |
| **Impact** | Performance — potential frame drop prevention at high streaming rates |
| **Evidence** | WC-A3-C15 (identified as gap in both codebases) |
| **Risk if wrong** | React's automatic batching may make explicit batching unnecessary |
| **Synergy with OWUI** | N/A |

**Decision:** Neither WebClaw nor NaW batches streaming updates. React 19's automatic batching within the same tick may suffice. Investigate only if profiling reveals frame drops at high token rates (30+ tokens/second). Potential approach: batch streaming cache writes with `requestAnimationFrame`.

---

## Summary Matrix

| ID | Recommendation | Priority | Action | Effort | Impact | Deps |
|----|---------------|----------|--------|--------|--------|------|
| R01 | Message Memoization | **P0** | Adopt | 1–2d | Performance | None |
| R02 | Composer Ref Optimization | **P0** | Adapt | 1–2d | Performance | None |
| R03 | Generation Guard Timer | **P0** | Adopt | <1d | UX Reliability | None |
| R04 | Singleton Shiki | **P0** | Adopt | <1d | Performance | None |
| R05 | Typography Utilities | **P0** | Adopt | <0.5d | UX | None |
| R06 | Hook Decomposition | **P1** | Adapt | 3–5d | DX + Perf | R01, R02 |
| R07 | Global Prompt Focus | **P1** | Adopt | <1d | UX | None |
| R08 | Context Meter | **P1** | Adopt | 3–5d | UX | None |
| R09 | Convention Enforcement | **P1** | Adopt | 1d | DX | None |
| R10 | Feature Module | **P1** | Adapt | 2–3d | DX | R06 |
| R11 | Portal Scroll Container | **P2** | Adapt | 1–2d | Performance | Profile first |
| R12 | Pin-to-Top Scroll | **P2** | Adapt | 2–3d | UX | R08 |
| R13 | Unified Message Component | **P2** | Adapt | 2–3d | DX | R01 |
| R14 | cmdk Replacement | **P2** | Skip | 1–2w | DX | Evaluate later |
| R15 | Streaming Batching | **P2** | Skip | 2–3d | Performance | Profile first |

**Total effort for P0:** ~5 days
**Total effort for P0 + P1:** ~15 days
**Total effort for all:** ~25 days

---

*Research synthesis completed February 15, 2026. Based on 5 WebClaw research documents (65 coded claims), Open WebUI analysis summary (80 coded claims), and Not A Wrapper codebase on branch `am-i-in-over-my-head`.*
