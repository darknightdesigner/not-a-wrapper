# UI, Chat UX & Performance Comparison — WebClaw vs Not A Wrapper

> **Agent**: Agent 5 — UI, Chat UX & Performance Comparison
> **Phase**: 2 (parallel)
> **Status**: Complete
> **Date**: February 15, 2026
> **Primary Dependencies**: `02-chat-ux-components.md`, `03-state-performance-data-flow.md`
> **Also Reads**: `01-architecture-gateway.md`
> **NaW Cross-References**: `use-chat-core.ts`, `chat.tsx`, `provider.tsx`, `components/ui/`, `conversation.tsx`, `markdown.tsx`, `code-block.tsx`, `chat-container.tsx`
> **Prior Research Context**: `../open-webui-analysis/SUMMARY.md`

---

## Summary

This document compares WebClaw and Not A Wrapper across 11 dimensions of UI, chat UX, and performance. The core finding: **WebClaw is better optimized for streaming performance; NaW is better architected for feature breadth.** WebClaw's 13-hook decomposition, content-based memoization, and composer state isolation are immediately transferable patterns that would measurably improve NaW's streaming performance. NaW's markdown rendering (react-markdown with per-block memoization), Convex-backed optimistic updates, and `use-stick-to-bottom` scroll library are stronger foundations that WebClaw would benefit from adopting. The highest-impact recommendation is decomposing `use-chat-core.ts` into focused hooks — not because WebClaw proves it's universally better, but because NaW's current monolith mixes streaming state, submission logic, edit handling, and search preferences in a single 670-line file that is increasingly difficult to extend without re-render cascades.

---

## 1. Prompt-Kit Components vs NaW Chat Components

### Component Inventory Comparison

| Concern | WebClaw (`prompt-kit/`) | NaW (`components/ui/` + `app/components/chat/`) |
|---------|------------------------|------------------------------------------------|
| Chat container | `chat-container.tsx` (portal + memo shell) | `chat-container.tsx` (use-stick-to-bottom) |
| Markdown | `markdown.tsx` (Streamdown) | `markdown.tsx` (react-markdown + marked lexer blocks) |
| Code block | `code-block/` (singleton Shiki, 30 langs) | `code-block.tsx` (codeToHtml per-render, theme-aware) |
| Message | `message.tsx` (5 sub-components) | `message.tsx` + `message-assistant.tsx` + `message-user.tsx` |
| Prompt input | `prompt-input.tsx` (dual context, global focus) | `prompt-input.tsx` + `chat-input.tsx` |
| Thinking | `thinking.tsx` (collapsible) | `reasoning.tsx` + `thinking-bar.tsx` + `chain-of-thought.tsx` |
| Tool display | `tool.tsx` (4-state machine) | `tool.tsx` |
| Scroll button | `scroll-button.tsx` (MutationObserver) | `scroll-button.tsx` (use-stick-to-bottom) |
| Typing indicator | `typing-indicator.tsx` + `text-shimmer.tsx` | `loader.tsx` |
| Context meter | `context-meter.tsx` (token usage) | *Not implemented* |
| File upload | *Not a separate component* | `file-upload.tsx` |
| Source citations | *Not implemented* | `source.tsx` |
| Response stream | *Not implemented* | `response-stream.tsx` |

### Which is Better Decomposed?

**WebClaw wins on component API design.** Their prompt-kit components are purpose-built for AI chat with clean, single-responsibility APIs:

- `MessageContent` takes a `markdown` boolean — user messages render as plain text, assistant messages render as markdown. NaW splits this into two completely separate components (`message-user.tsx`, `message-assistant.tsx`), which means shared message UI logic (actions, avatars, layout) is duplicated.
- `PromptInput` uses compound components (`PromptInputTextarea`, `PromptInputActions`, `PromptInputAction`) with dual React contexts. NaW's `prompt-input.tsx` and `chat-input.tsx` are less clearly separated.
- `Tool` has an explicit 4-state machine (`input-streaming` → `input-available` → `output-available` → `output-error`) which makes the component's lifecycle self-documenting.

**NaW wins on feature coverage.** NaW has 73 UI components to WebClaw's 22 (13 `ui/` + 9 `prompt-kit/`). NaW covers sources, progressive blur, morphing dialogs, file uploads, feedback bars, and multi-chat comparison — none of which exist in WebClaw. This is expected: NaW is a platform, WebClaw is a single-chat client.

**NaW also wins on markdown customization.** NaW's `Markdown` component uses `marked.lexer()` to split content into blocks, then memoizes each block independently via `MemoizedMarkdownBlock`. This means during streaming, only the *last* block re-renders — earlier blocks retain their memoized output. WebClaw's `Streamdown` approach handles partial markdown more gracefully during active streaming, but NaW's per-block memoization is more battle-tested for completed content.

> **Transferability**: The prompt-kit compound component pattern is **Directly Transferable**. The unified `Message` + `MessageContent` (with markdown opt-in) pattern would reduce NaW's component duplication.

### WC-A5-C01: WebClaw's Compound Message Component Reduces Duplication

**Claim**: WebClaw's single `Message` component with `MessageContent markdown={true|false}` is cleaner than NaW's split `message-user.tsx` / `message-assistant.tsx` pattern.

**Evidence**: WebClaw `message.tsx` exports 5 sub-components (`Message`, `MessageAvatar`, `MessageContent`, `MessageActions`, `MessageAction`) composed at the call site. NaW duplicates avatar rendering, layout structure, and action logic across two separate files. When adding a new message action (e.g., "quote"), NaW must update both files.

**Confidence**: High — visible code duplication in NaW.
**Impact**: DX — reduced maintenance surface.
**Transferability**: Directly Transferable.

---

## 2. Hook Decomposition: 13 Focused Hooks vs `use-chat-core.ts` Monolith

### Structural Comparison

| Metric | WebClaw (13 hooks) | NaW (`use-chat-core.ts`) |
|--------|-------------------|--------------------------|
| Total LOC | ~1,800 across 13 files | ~670 in 1 file |
| Responsibilities | 1 per hook | 6+ (streaming, submit, edit, reload, suggestion, search, auth) |
| Largest hook | `use-chat-stream.ts` (~400 LOC) | `use-chat-core.ts` (~670 LOC) |
| Orchestrator | `chat-screen.tsx` (~450 LOC) | `chat.tsx` (~285 LOC) |
| State locations | Distributed across hooks | Centralized in one hook |
| Testability | Each hook independently testable | Must mock entire hook interface |

### Is Decomposition Actually Better?

**Yes, with qualifications.** The decomposition is better for three concrete reasons:

**1. Re-render isolation.** In NaW's `use-chat-core.ts`, changing `enableSearch` causes the hook to recalculate and potentially trigger re-renders in all consumers — including the message list. In WebClaw, `useChatSettings` is a separate Zustand store; toggling settings doesn't touch the streaming or history hooks. NaW's `input` state (line 92, `useState`) means every keystroke propagates through the hook's return value to `chat.tsx`, which then must check whether `conversationProps` and `chatInputProps` changed. WebClaw avoids this entirely via ref-based composer input (WC-A2-C15).

**2. Concern clarity.** NaW's `submit` callback (lines 225-363, 138 lines) handles: guest user creation, optimistic messages, file uploads, rate limiting, chat creation, message sending, error rollback, and draft clearing — in a single `useCallback`. WebClaw splits this into: `useChatPendingSend` (optimistic navigation), `useDeleteSession` (deletion), `useRenameSession` (rename), each with focused `useMutation` patterns. When debugging "why did the message disappear after edit?", NaW requires reading all 670 lines; WebClaw requires reading one 75-line hook.

**3. Extensibility.** Adding a new concern (e.g., "generation guard" timer) in NaW means adding more state, more refs, and more logic to the already-large hook. In WebClaw, it's a new 35-line hook (`use-chat-generation-guard.ts`) that the orchestrator calls.

**The qualification**: WebClaw's orchestrator (`chat-screen.tsx`, ~450 LOC) is *more* complex than NaW's (`chat.tsx`, ~285 LOC) precisely because it must wire 13 hooks together. The decomposition shifts complexity from inside the hook to the composition layer. This is a trade-off, not a pure win. But composition complexity is easier to navigate (grep for hook names) than interleaved logic complexity.

### Concrete Path to Decompose NaW's Monolith

Based on WebClaw's decomposition pattern, here's a realistic extraction plan for `use-chat-core.ts`:

| Extracted Hook | Lines from current monolith | WebClaw equivalent |
|---------------|---------------------------|-------------------|
| `use-chat-streaming.ts` | useChat initialization (119-160) + status/error/stop | `use-chat-stream.ts` |
| `use-chat-submit.ts` | `submit` callback (225-363) + `handleSuggestion` (531-604) | Part of `chat-screen.tsx` |
| `use-chat-edit.ts` | `submitEdit` callback (365-528) | No equivalent (WebClaw lacks edit) |
| `use-chat-input.ts` | `input`/`setInput` state (92) + `handleInputChange` (628-634) + draft sync | Implicit in `ChatComposer` |
| `use-chat-search.ts` | `enableSearch` state (69-71) + `setEnableSearch` (217-221) | `use-chat-settings.ts` |
| `use-chat-hydration.ts` | Chat transition effects (169-204) | `use-chat-redirect.ts` + route logic |

**Estimated effort**: 2-3 days for extraction, 1 day for testing, 1 day for cleanup.
**Risk if wrong**: Minor — extraction is refactoring, not feature change. Can be reverted.

### WC-A5-C02: Hook Decomposition Enables Better Re-render Isolation

**Claim**: Decomposing `use-chat-core.ts` into focused hooks would reduce unnecessary re-renders by isolating state changes to their consumers.

**Evidence**: Currently, changing `enableSearch` in `use-chat-core.ts` potentially triggers re-computation of the hook's entire return object (16 values). In WebClaw, search/settings state lives in a separate Zustand store that only re-renders components subscribed to settings. The `useChatCore` hook return has 16 properties; any change to any of them potentially triggers re-renders in `chat.tsx`, which then checks `conversationProps` (8 deps) and `chatInputProps` (17 deps).

**Confidence**: High — structural analysis of dependency arrays.
**Impact**: Performance + DX.
**Transferability**: Directly Transferable.

### WC-A5-C03: NaW's `submit` Callback Is an Extraction Candidate

**Claim**: The 138-line `submit` callback in `use-chat-core.ts` (lines 225-363) combines 8 concerns and should be extracted.

**Evidence**: The callback handles guest auth, optimistic UI, file uploads, rate limiting, chat creation, message sending, error rollback, and draft clearing. Its `useCallback` dependency array has 16 items. WebClaw's equivalent logic is split across `useChatPendingSend` (navigation-safe sends), the ChatScreen's `send()` function, and `chat-screen-utils.ts` (message creation).

**Confidence**: High.
**Impact**: DX — easier debugging, testing, modification.
**Transferability**: Directly Transferable.

---

## 3. Base UI Wrapper Patterns — Direct Comparison

Both projects use `@base-ui/react`. This is the most directly comparable dimension.

### Pattern Comparison

| Aspect | WebClaw | NaW |
|--------|---------|-----|
| Wrapper style | `cn()` + direct Base UI props | `cn()` + CVA + `asChild` shim |
| CVA usage | Button only | Button + potentially others |
| Polymorphic rendering | `useRender` from Base UI | `adaptAsChild` shim → Base UI `render` prop |
| Component count | 13 wrappers | 73 wrappers |
| `'use client'` | All wrappers | All wrappers |
| Prop typing | `ComponentProps<typeof Primitive>` | `Primitive.Props` + custom extensions |
| Data attributes | None | `data-slot`, `data-variant`, `data-size` |

### Whose Wrappers Are Cleaner?

**WebClaw's wrappers are thinner; NaW's are more instrumented.**

WebClaw's pattern is minimal — each wrapper adds Tailwind classes and passes through Base UI props. No data attributes, no compatibility shims, no extra abstractions.

NaW's wrappers add `data-slot` attributes (useful for CSS selectors and testing), `data-variant`/`data-size` (useful for debugging), and the `asChild` compatibility shim (`adaptAsChild`). The shim exists because NaW migrated from Radix UI to Base UI and needed backward compatibility.

**For new components**, WebClaw's approach is preferable — fewer layers, less indirection. But NaW's instrumentation (`data-slot`) is a genuine advantage for testing and CSS targeting that WebClaw lacks.

### Specific Comparisons

**Button**: Both use CVA with similar variant sets. NaW has `rounded-full` as base; WebClaw does not (their base uses the default border radius). WebClaw uses `useRender` for polymorphic rendering; NaW uses `adaptAsChild`. Both achieve the same goal — rendering a `<Link>` as a button.

**ScrollArea**: Very similar. NaW adds a `viewportRef` prop for external access. WebClaw's version is marginally thinner. Both wrap the same Base UI primitives.

**Command Palette**: WebClaw composes Base UI `Dialog` + `Autocomplete` into a command palette *without `cmdk`*. NaW uses `cmdk` (which brings Radix as a transitive dependency). WebClaw's approach is purer (no external dependencies beyond Base UI) but less battle-tested than cmdk. This is a meaningful difference — WebClaw demonstrates that cmdk is replaceable with Base UI primitives.

### WC-A5-C04: WebClaw's cmdk-Free Command Palette Is Worth Studying

**Claim**: WebClaw builds a command palette from Base UI `Dialog` + `Autocomplete` without using `cmdk`, eliminating Radix as a transitive dependency.

**Evidence**: `components/ui/command.tsx` in WebClaw composes Base UI's Autocomplete (with fuzzy matching) inside a Dialog. NaW's `components/ui/command.tsx` uses `cmdk` which depends on `@radix-ui/react-dialog`.

**Confidence**: High.
**Impact**: DX — dependency reduction. Eliminates Radix transitive dep.
**Transferability**: Adaptable — would require rewriting NaW's command palette to use Base UI Autocomplete. Non-trivial effort.

---

## 4. Streaming Markdown: Streamdown + Shiki vs NaW's Approach

### Pipeline Comparison

| Stage | WebClaw | NaW |
|-------|---------|-----|
| Parser | Streamdown (streaming-native) | `react-markdown` + `remarkGfm` + `remarkBreaks` |
| Block splitting | None (Streamdown handles incrementally) | `marked.lexer()` → block array → memoize per block |
| Syntax highlighting | Shiki singleton, 30 langs, lazy | `codeToHtml` per-render, theme-aware via `useTheme()` |
| Memoization | Whole `Markdown` component via `React.memo` | Per-block `MemoizedMarkdownBlock` with content equality |
| Streaming behavior | Incremental parse of partial markdown | Full re-parse of changed blocks only |
| Component mapping | Custom HTML element → React component map | `Components` from react-markdown |

### Which Produces Better UX During Streaming?

**WebClaw has smoother streaming; NaW has better completed-content rendering.**

**During active streaming**, Streamdown is designed for partial markdown. It can handle unclosed code blocks, incomplete lists, and mid-word tokens without breaking the render. `react-markdown` was not designed for streaming — it re-parses the entire input on every render. NaW mitigates this with `marked.lexer()` block splitting, so only the last block re-renders during streaming, but within that block, react-markdown still does a full re-parse.

**For completed content**, NaW's per-block memoization is superior. Once a markdown block is complete, it's memoized and never re-parsed — even if later blocks are added. WebClaw's whole-component `React.memo` means the entire markdown re-renders if any content changes.

**Code highlighting is a weak spot for both.** WebClaw uses a singleton Shiki highlighter (good — avoids re-initialization) but re-highlights the entire code block on every streaming token (bad — expensive for large blocks). NaW uses `codeToHtml` which creates a new highlighting promise on every content change — same problem, arguably worse because it doesn't cache the highlighter instance.

### WC-A5-C05: NaW's Per-Block Markdown Memoization Is Superior for Completed Content

**Claim**: NaW's `marked.lexer()` → per-block `MemoizedMarkdownBlock` pattern is better than WebClaw's whole-component `React.memo` for conversations with many completed messages.

**Evidence**: NaW `markdown.tsx` splits content into blocks and memoizes each with content-based equality (`prevProps.content === nextProps.content`). When a new paragraph is added during streaming, only the new block renders. WebClaw's `React.memo(MarkdownComponent)` checks the entire `children` string — any change to the string re-renders the whole component.

**Confidence**: Medium — NaW's advantage depends on block stability during streaming, which is imperfect with `marked.lexer()`.
**Impact**: Performance during streaming.
**Transferability**: N/A (NaW already has this).

### WC-A5-C06: WebClaw's Singleton Shiki Highlighter Should Be Adopted

**Claim**: NaW should adopt WebClaw's singleton Shiki pattern — create the highlighter once and reuse it across all code blocks.

**Evidence**: WebClaw `code-block/index.tsx` uses a module-level `let highlighterPromise` that is initialized once on first use. NaW's `code-block.tsx` calls `codeToHtml()` which creates (or looks up) a highlighter on every invocation. The singleton pattern avoids redundant initialization and enables pre-loading common languages.

**Confidence**: High — well-understood optimization.
**Impact**: Performance — faster code block rendering, especially on first load.
**Transferability**: Directly Transferable.

---

## 5. Performance Patterns: Memoization and Re-render Avoidance

### Strategy Comparison

| Pattern | WebClaw | NaW |
|---------|---------|-----|
| Message memoization | Content-based equality (`areMessagesEqual`) | None visible — `Message` not wrapped in `React.memo` |
| Scroll container isolation | Portal (`createPortal`) + memoized shell | `use-stick-to-bottom` (library-managed) |
| Composer input isolation | `useRef` for value, `memo()` wrapper | `useState` in `use-chat-core.ts` (line 92) |
| History reference stability | Signature-based (`stableHistorySignatureRef`) | Not applicable (Convex subscriptions) |
| Streaming message targeting | O(1) DOM update via content-based memo | All messages re-render on every token |
| CSS custom properties | `--chat-header-height`, `--chat-composer-height` | Not used for measurements |
| Derived state | Inline computation, no useEffect | Some useEffect for derived state (lines 213-215) |

### Who Avoids Re-renders Better?

**WebClaw, decisively.** Their streaming pipeline has a clear re-render budget:

Per streaming chunk:
1. `ChatScreen` — No re-render (messages in TQ, not useState)
2. `ChatComposer` — No re-render (memo + no message dependency)
3. `ChatContainerShell` — No re-render (portal pattern)
4. `ChatMessageList` — Yes (messages ref changed)
5. N × `MessageItem` memo check — O(N) checks, all pass except streaming message
6. Streaming `MessageItem` — Yes (content changed)
7. `Markdown` → `Streamdown` → DOM

Total DOM updates per chunk: **1 message subtree**.

NaW's current pipeline:
1. Vercel AI SDK `useChat` updates `messages` state
2. `use-chat-core.ts` returns new `messages` reference
3. `chat.tsx` recalculates `conversationProps` (new `messages` ref → new memo result)
4. `Conversation` receives new `messages` prop → re-renders
5. All `Message` components re-render (no `React.memo` with custom equality)
6. Each message's `Markdown` component re-renders if content differs
7. Per-block memoization catches unchanged blocks

Total DOM updates per chunk: **All message components re-render, but only changed markdown blocks update DOM.** React's reconciliation prevents actual DOM changes for unchanged content, but the virtual DOM work is still O(N × message_complexity).

### WC-A5-C07: NaW Lacks Message-Level Memoization During Streaming

**Claim**: NaW re-renders all `Message` components on every streaming chunk because there is no content-based `React.memo` on the message component.

**Evidence**: `conversation.tsx` maps over `messages` and renders `<Message>` for each. The `Message` component is not wrapped in `React.memo`. The `Conversation` component itself is not memoized with a custom comparator — it receives `messages` as a prop, and every streaming token creates a new `messages` array reference from Vercel AI SDK's `useChat`.

**Confidence**: High — visible in source code.
**Impact**: Performance — significant during streaming in long conversations.
**Transferability**: Directly Transferable — add `React.memo` with content-based equality to `Message`.

### WC-A5-C08: NaW's Composer Uses `useState` — Every Keystroke Cascades

**Claim**: NaW's composer input state (`useState` in `use-chat-core.ts` line 92) causes re-renders in the parent `chat.tsx` on every keystroke.

**Evidence**: `use-chat-core.ts` line 92: `const [input, setInput] = useState(draftValue || "")`. This state is returned from the hook and passed through `chat.tsx` → `chatInputProps.value`. Every keystroke triggers: `setInput` → `useChatCore` re-evaluates → `chat.tsx` recalculates `chatInputProps` → `ChatInput` re-renders. WebClaw's composer uses `useRef('')` for value — keystrokes are invisible to React's reconciler.

**Confidence**: High.
**Impact**: Performance — input lag on lower-end devices, unnecessary work during typing.
**Transferability**: Directly Transferable — move input value to `useRef`, expose via callback.

### WC-A5-C09: WebClaw's Portal-Based Scroll Container Prevents Shell Re-renders

**Claim**: WebClaw's `createPortal` pattern for the scroll container prevents scroll area components from re-rendering when message content changes. NaW's `use-stick-to-bottom` manages scroll differently but doesn't isolate shell re-renders.

**Evidence**: WebClaw `chat-container.tsx` uses `MemoizedChatContainerShell` + `ChatContainerPortal`. NaW's `chat-container.tsx` wraps content in `<StickToBottom>` / `<StickToBottom.Content>` which is a third-party library that manages its own scroll behavior.

**Confidence**: Medium — NaW's `use-stick-to-bottom` may already handle this internally. Need profiling to confirm whether scroll components actually re-render during streaming.
**Impact**: Performance — potentially significant if scroll components are expensive.
**Transferability**: Adaptable — NaW uses a different scroll strategy; the portal concept could be layered on top.

---

## 6. Optimistic Updates: TanStack Query Direct Cache vs Convex

### Pattern Comparison

| Aspect | WebClaw (TanStack Query) | NaW (Convex + optimistic ops) |
|--------|-------------------------|-------------------------------|
| Source of truth | Gateway (server-side) | Convex (reactive DB) |
| Optimistic mechanism | Direct `queryClient.setQueryData()` | `useState<OptimisticOperation[]>` layered over `useQuery` |
| Cache manipulation | 11 typed helper functions in `chat-queries.ts` | `setOptimisticOps` with add/update/delete operation types |
| Rollback strategy | `onMutate` snapshot → `onError` restore | Remove matching optimistic op on error |
| Streaming updates | Direct cache writes per SSE event | Vercel AI SDK `useChat` manages message state internally |
| Real-time sync | 30s polling + manual invalidation | Convex subscriptions (automatic, real-time) |
| Reconciliation | Three-way merge (server + optimistic + streaming) | Convex real-time overwrites optimistic when server confirms |

### Which Is More Reliable?

**NaW's Convex approach is structurally more reliable.** Convex's real-time subscriptions automatically replace optimistic state when the server confirms, eliminating the entire class of "stale optimistic state" bugs. WebClaw's polling (30s interval) means optimistic state can persist for up to 30 seconds before being reconciled, and the three-way merge (server + optimistic + streaming) is complex code with edge cases.

**WebClaw's approach is more responsive for streaming.** Direct cache writes via `setQueryData` happen synchronously. NaW's streaming goes through Vercel AI SDK's internal state management, which adds a layer of indirection. The streaming messages aren't in NaW's optimistic ops system — they live in `useChat`'s internal state, separate from the Convex-backed chat data.

### Which Is More Responsive?

For chat operations (create, delete, rename): **roughly equivalent**. Both show instant UI updates. NaW's Convex subscriptions provide faster final confirmation (sub-second vs 30s polling).

For streaming: **WebClaw**, by design. They write streaming tokens directly into the TanStack Query cache that powers the UI. NaW relies on Vercel AI SDK's `useChat` to manage streaming state, which is a more opaque pipeline.

### WC-A5-C10: NaW's Convex Subscriptions Eliminate Optimistic Staleness

**Claim**: NaW's real-time Convex subscriptions are structurally superior to WebClaw's 30s polling for optimistic update reconciliation.

**Evidence**: NaW's `ChatsProvider` uses `useQuery(api.chats.getForCurrentUser)` which receives real-time updates via Convex subscriptions. When a mutation succeeds, the subscription fires immediately with updated data. WebClaw's `useChatSessions` uses `refetchInterval: 30000` — a 30-second polling cycle, during which the tombstone/optimistic state must bridge the gap.

**Confidence**: High — architectural difference.
**Impact**: State reliability.
**Transferability**: N/A (NaW already has this advantage).

---

## 7. Composer Architecture: Local State Isolation

### Comparison

| Aspect | WebClaw (`ChatComposer`) | NaW (`use-chat-core.ts` + `ChatInput`) |
|--------|------------------------|----------------------------------------|
| Input value storage | `useRef('')` — no re-renders | `useState(draftValue)` — re-renders on keystroke |
| External value access | `valueRef.current` (imperative read) | `input` from hook return (reactive) |
| External value set | `setValueRef.current(newValue)` | `setInput(newValue)` |
| Attachment state | `useState` (visual updates needed) | Separate `useFileUpload` hook |
| Memo wrapper | `memo(ChatComposerComponent)` | Not memoized separately |
| Draft persistence | Not implemented | `useChatDraft` → IndexedDB |
| Global focus | `bindGlobalPromptListener()` — auto-focuses on printable keys | Not implemented |

### NaW's Draft Sync Complicates Ref-Based Input

NaW's `handleInputChange` (line 628-634) calls both `setInput(value)` and `setDraftValue(value)` on every keystroke to persist drafts to IndexedDB. If we switch to ref-based input, we'd need to debounce the draft persistence (which is fine — draft saves don't need to be synchronous) but we'd lose the ability to reflect the current input value in React's render cycle.

**Recommended approach**: Keep `useState` for draft persistence but add `React.memo` to the `ChatInput` component with a custom comparator that ignores `value` changes when only the input itself triggered the change. Alternatively, use `useRef` for the input value and debounce `setDraftValue` to 500ms.

### WC-A5-C11: WebClaw's Global Prompt Focus Is a Low-Effort UX Win

**Claim**: WebClaw's `bindGlobalPromptListener()` auto-focuses the prompt textarea when the user types printable characters anywhere on the page (excluding editable fields).

**Evidence**: `prompt-input.tsx` registers a global `keydown` listener that checks if the target is an editable element; if not, it focuses the prompt textarea.

**Confidence**: High — simple feature, well-implemented.
**Impact**: UX — eliminates the "click to focus" step. Matches VS Code behavior.
**Transferability**: Directly Transferable — ~20 lines of code.

---

## 8. Scroll Behavior: `use-stick-to-bottom` vs Custom Implementation

### Comparison

| Aspect | WebClaw (custom) | NaW (`use-stick-to-bottom`) |
|--------|-----------------|----------------------------|
| Library | None — custom `ScrollButton` + `scrollIntoView` | `use-stick-to-bottom` (third-party) |
| Auto-scroll | `scrollIntoView({ block: 'end' })` on anchor element | Library-managed with `resize="smooth"` |
| Detection | MutationObserver + scroll listener | Library-internal |
| Pin-to-top | Yes — pins user message to top during response | Not implemented |
| Show threshold | 100px + 200ms delay | Library-managed |
| Programmatic scroll | `programmaticScroll` ref prevents button flicker | Not needed (library handles) |

### Assessment

**NaW's `use-stick-to-bottom` is the better foundation.** It handles the common case (auto-scroll to bottom during streaming) with zero custom code. WebClaw's custom implementation is more flexible (pin-to-top behavior) but also more fragile (MutationObserver + scroll listener + manual threshold management + delay timer).

**WebClaw's pin-to-top is a UX feature worth considering.** When a user sends a message, pinning their message to the top while the response grows below creates a ChatGPT-like experience. NaW currently scrolls to the bottom, which means the user's message scrolls out of view as the response grows. This is a separate feature from auto-scroll — it could be implemented alongside `use-stick-to-bottom`.

### WC-A5-C12: Pin-to-Top Scroll Behavior Is a UX Enhancement

**Claim**: WebClaw's pin-to-top behavior (user message stays at top, response grows below) improves readability during streaming.

**Evidence**: `chat-message-list.tsx` uses `scrollIntoView({ behavior: 'auto', block: 'start' })` on the last user message when `pinToTop` is true. This keeps the user's question visible while the response unfolds.

**Confidence**: Medium — UX preference, not measured.
**Impact**: UX — better readability during long responses.
**Transferability**: Adaptable — can be implemented alongside `use-stick-to-bottom` but requires changes to scroll logic.

---

## 9. Patterns NaW Doesn't Have Yet

### Context Meter

WebClaw's `context-meter.tsx` displays token usage as a progress bar (e.g., "128K / 200K") using Base UI's `PreviewCard` as a hover tooltip. This gives users visibility into how much context window they've consumed.

**Assessment**: Valuable for power users. NaW has the model data (context window sizes in `lib/models/`) but doesn't surface usage. This confirms the Open WebUI finding that context visibility is a cross-competitor pattern.

**Transferability**: Directly Transferable. **Recommendation**: ADOPT — low effort, high value for power users.

### Typing Indicator with TextShimmer

WebClaw's `TypingIndicator` uses three staggered `animate-pulse` dots + a CSS `TextShimmer` component. NaW's `Loader` component serves the same purpose but with a simpler animation.

**Assessment**: WebClaw's is more polished. The `TextShimmer` (background-clip: text + gradient animation) is a nice touch. However, NaW's `Loader` is adequate.

**Transferability**: Directly Transferable. **Recommendation**: ADAPT — adopt `TextShimmer` as a general animation primitive, not the full typing indicator.

### Thinking Display

WebClaw's `thinking.tsx` is a 45-line collapsible that defaults to collapsed. NaW has three separate components: `reasoning.tsx`, `thinking-bar.tsx`, and `chain-of-thought.tsx`.

**Assessment**: NaW's is more feature-rich (bar visualization, multi-step chain display). WebClaw's is simpler but may be too minimal for users who want to see reasoning.

**Transferability**: Non-transferable — NaW's approach is already more sophisticated.

### Generation Guard Timer

WebClaw's `use-chat-generation-guard.ts` sets a 120-second timeout when waiting for a response. If no response arrives, it forces a history refresh and clears the waiting state. NaW has no equivalent safety net.

**Assessment**: Essential reliability feature. Prevents the UI from being stuck in "generating" state indefinitely if the stream drops without a terminal event.

**Transferability**: Directly Transferable. **Recommendation**: ADOPT.

### WC-A5-C13: NaW Lacks a Generation Guard Timer

**Claim**: NaW has no safety net for streams that drop without a terminal event, potentially leaving the UI stuck in a "streaming" state.

**Evidence**: `use-chat-core.ts` does not implement a timeout for the streaming state. The `status` from `useChat` can remain "streaming" indefinitely if the connection drops without sending a "done" signal.

**Confidence**: High — absence of timeout logic in code.
**Impact**: UX reliability — prevents stuck states.
**Transferability**: Directly Transferable — ~35 lines.

### WC-A5-C14: Context Meter Is a Missing UX Feature

**Claim**: Token usage / context window visibility is a pattern NaW should adopt, confirmed by both WebClaw and Open WebUI research.

**Evidence**: WebClaw `context-meter.tsx` shows token usage as a progress bar. Open WebUI also surfaces context information. NaW has the data (model context windows in `lib/models/`) but doesn't expose it to users.

**Confidence**: High — cross-competitor pattern.
**Impact**: UX — power user feature.
**Transferability**: Directly Transferable.

---

## 10. Typography Rules: Should NaW Adopt?

### WebClaw's Typography Rules

| Rule | Implementation | NaW Current |
|------|---------------|-------------|
| Never bolder than `font-medium` | All headings use `font-medium` (500) | Mixed — uses `font-semibold` and `font-bold` in places |
| `text-balance` for headings | Applied to h1, h2 | Not consistently applied |
| `text-pretty` for body text | Applied to paragraphs | Not consistently applied |
| `tracking-tight` for headings only | h1, h2 get `tracking-tight` | Used more broadly |
| Consistent `text-sm` (14px) for body | All chat body is `text-sm` | Mostly consistent |
| `size-*` for square elements | `size-9` instead of `w-9 h-9` | Already partially adopted |

### Should NaW Adopt?

**Partially.** The `text-balance` and `text-pretty` utilities are CSS best practices that improve text rendering:

- `text-balance` (CSS `text-wrap: balance`) distributes text evenly across lines in headings. Zero performance cost, better visual appearance.
- `text-pretty` (CSS `text-wrap: pretty`) prevents orphaned words at line ends. Minimal cost, better readability.

These are worth adopting globally. The "never bolder than `font-medium`" rule is an aesthetic choice that works for WebClaw's minimal design but may feel too subtle for NaW's more feature-rich UI where visual hierarchy needs stronger differentiation.

### WC-A5-C15: `text-balance` and `text-pretty` Are Low-Cost Typography Wins

**Claim**: CSS `text-wrap: balance` (headings) and `text-wrap: pretty` (body) improve text rendering at zero performance cost.

**Evidence**: WebClaw applies these consistently across all markdown-rendered content.

**Confidence**: High — CSS standard, browser-supported.
**Impact**: UX — subtle readability improvement.
**Transferability**: Directly Transferable.

---

## 11. Animation Patterns: `motion/react` Usage

### Comparison

| Aspect | WebClaw | NaW |
|--------|---------|-----|
| Library | `motion/react` (formerly Framer Motion) | `motion/react` (same library) |
| Usage scope | Sidebar collapse/expand only | Onboarding transition, chat input layout, `FeedbackWidget` |
| Patterns | `AnimatePresence` + `motion.aside` | `AnimatePresence` + `motion.div` + `layout` animations |
| Restraint | Very restrained — only sidebar | Moderate — several animated transitions |

### What Animations Improve Perceived Performance?

**WebClaw's restraint is instructive.** They animate exactly one thing: the sidebar. Everything else is instant. This suggests they've made a deliberate choice that animations during streaming would hurt perceived performance (animation frames competing with streaming renders).

**NaW's layout animations** (`layoutId="chat-input-container"`, `layoutId="onboarding"`) are well-placed — they smooth the transition from onboarding to chat. These don't compete with streaming because they only fire once.

**Recommendation**: Keep NaW's existing animations. Don't add animations to the streaming pipeline (message appear, scroll, token arrival). WebClaw's approach of animating only structural changes (sidebar, layout shifts) is the right philosophy.

### WC-A5-C16: Animation Should Be Reserved for Structural Changes, Not Streaming

**Claim**: WebClaw's restrained animation approach (sidebar only) suggests that animations during streaming compete with rendering performance.

**Evidence**: WebClaw animates only the sidebar collapse/expand with 150ms transitions. No message appear animations, no scroll animations, no token animations. AGENTS.md doesn't explain this choice, but the pattern is consistent.

**Confidence**: Medium — inferred from absence, not stated design principle.
**Impact**: Performance philosophy.
**Transferability**: Adaptable — confirms NaW's existing approach of limiting streaming-path animations.

---

## Evidence Table

| claim_id | claim | evidence_type | source_refs | confidence | impact_area | transferability | notes |
|----------|-------|---------------|-------------|------------|-------------|-----------------|-------|
| WC-A5-C01 | WebClaw's unified Message component with markdown opt-in reduces duplication vs NaW's split user/assistant pattern | Code comparison | WC `message.tsx` vs NaW `message-user.tsx` + `message-assistant.tsx` | High | DX | Directly Transferable | NaW duplicates avatar, layout, action logic across two files |
| WC-A5-C02 | Hook decomposition enables better re-render isolation than NaW's monolithic `use-chat-core.ts` | Code + structural analysis | WC 13 hooks, NaW `use-chat-core.ts` (670 LOC, 16-item return) | High | Performance + DX | Directly Transferable | Decomposition shifts complexity from interleaved to compositional |
| WC-A5-C03 | NaW's 138-line `submit` callback combines 8 concerns and is an extraction candidate | Code analysis | NaW `use-chat-core.ts` lines 225-363 | High | DX | Directly Transferable | 16-item dependency array is a code smell |
| WC-A5-C04 | WebClaw builds command palette from Base UI primitives without cmdk | Code comparison | WC `command.tsx` vs NaW `command.tsx` (uses cmdk → Radix transitive dep) | High | DX | Adaptable | Non-trivial migration but eliminates Radix dep |
| WC-A5-C05 | NaW's per-block markdown memoization is superior for completed content | Code comparison | NaW `markdown.tsx` (marked.lexer blocks) vs WC whole-component memo | Medium | Performance | N/A (NaW advantage) | WebClaw's Streamdown is better for active streaming |
| WC-A5-C06 | WebClaw's singleton Shiki highlighter avoids redundant initialization | Code pattern | WC `code-block/index.tsx` (module-level promise) vs NaW `code-block.tsx` (per-render codeToHtml) | High | Performance | Directly Transferable | NaW should cache the highlighter instance |
| WC-A5-C07 | NaW re-renders all Message components on every streaming chunk (no content-based memo) | Code analysis | NaW `conversation.tsx` — no `React.memo` on Message, no custom equality | High | Performance | Directly Transferable | Single highest-impact performance fix |
| WC-A5-C08 | NaW's composer uses `useState` — every keystroke causes parent re-renders | Code analysis | NaW `use-chat-core.ts` line 92: `useState(draftValue)` | High | Performance | Directly Transferable | WebClaw uses `useRef` — keystrokes invisible to React |
| WC-A5-C09 | WebClaw's portal-based scroll container prevents shell re-renders during streaming | Code pattern | WC `chat-container.tsx` (`createPortal` + memoized shell) | Medium | Performance | Adaptable | NaW uses `use-stick-to-bottom` — may handle this internally |
| WC-A5-C10 | NaW's Convex subscriptions are structurally superior to WebClaw's 30s polling | Architecture comparison | NaW `provider.tsx` (real-time) vs WC (refetchInterval: 30000) | High | State reliability | N/A (NaW advantage) | Convex auto-reconciles optimistic state |
| WC-A5-C11 | WebClaw's global prompt focus auto-focuses textarea on printable keystrokes | Code pattern | WC `prompt-input.tsx` — `bindGlobalPromptListener()` | High | UX | Directly Transferable | ~20 lines, matches VS Code behavior |
| WC-A5-C12 | Pin-to-top scroll behavior keeps user message visible during response streaming | Code pattern | WC `chat-message-list.tsx` — `scrollIntoView({ block: 'start' })` | Medium | UX | Adaptable | Requires changes alongside use-stick-to-bottom |
| WC-A5-C13 | NaW lacks a generation guard timer — streams can leave UI stuck in "streaming" state | Code analysis (absence) | NaW `use-chat-core.ts` — no timeout for streaming status | High | UX reliability | Directly Transferable | ~35 lines, essential safety net |
| WC-A5-C14 | Context meter (token usage visibility) is a cross-competitor pattern NaW is missing | Cross-reference | WC `context-meter.tsx`, OWUI context display, NaW model data in `lib/models/` | High | UX | Directly Transferable | Confirmed by both WebClaw and Open WebUI research |
| WC-A5-C15 | `text-balance` and `text-pretty` CSS utilities improve text rendering at zero cost | Code convention | WC markdown component typography classes | High | UX | Directly Transferable | CSS standard, browser-supported |
| WC-A5-C16 | Animations should be reserved for structural changes, not streaming path | Convention (inferred) | WC animates only sidebar; NaW animates onboarding + layout transitions | Medium | Performance | Adaptable | Confirms NaW's existing restrained approach |

---

## Uncertainty & Falsification

### Top 3 Unresolved Questions

1. **Does NaW's `Message` component actually cause visible jank during streaming?** The analysis shows all messages re-render, but React's reconciliation prevents actual DOM changes for unchanged content. The virtual DOM overhead may be negligible on modern hardware. **Evidence needed**: React DevTools profiling of NaW during active streaming with 50+ messages. If frame times stay under 16ms, WC-A5-C07's urgency decreases.

2. **Does `use-stick-to-bottom` already prevent scroll component re-renders internally?** The library may implement its own memoization strategy that makes WebClaw's portal pattern (WC-A5-C09) redundant for NaW. **Evidence needed**: React DevTools profiling of `StickToBottom` during streaming. If the library memoizes its shell, skip the portal pattern.

3. **How does Streamdown compare to react-markdown in bundle size and reliability?** WebClaw uses Streamdown for streaming-native markdown, but the library is newer and less battle-tested. **Evidence needed**: Bundle size comparison, GitHub issue count, maintenance cadence. If Streamdown is >50KB gzip or has known issues, skip evaluation.

### Falsification Criteria

- **WC-A5-C07 (message-level memoization)** would be downgraded if React 19's automatic memoization or React Compiler eliminates the need for manual `React.memo` on message components. Test: remove all manual memos in a React 19 + Compiler setup and profile.
- **WC-A5-C08 (useState vs useRef for composer)** would be irrelevant if React 19's automatic batching eliminates cascading re-renders from input state changes. Test: profile keystroke propagation in current NaW.
- **WC-A5-C02 (hook decomposition)** would be weakened if profiling shows the 13-hook composition in WebClaw's ChatScreen adds measurable overhead vs NaW's single hook. The decomposition trades per-hook overhead for re-render isolation; which wins depends on the ratio.
- **WC-A5-C06 (singleton Shiki)** would be unnecessary if `shiki`'s `codeToHtml` already caches the highlighter internally (check Shiki docs/source).

### Claims Based on Inference

- WC-A5-C07: The re-render analysis is based on code structure, not runtime profiling. Actual impact depends on React's reconciliation efficiency.
- WC-A5-C16: The animation philosophy is inferred from absence of animation code in the streaming path, not from stated design decisions.
- WC-A5-C05: The "superior for completed content" claim assumes `marked.lexer()` produces stable block boundaries, which may not hold for all markdown structures.

---

## Cross-Reference with Open WebUI Findings

| Dimension | Open WebUI Finding | WebClaw Finding | Convergence |
|-----------|-------------------|-----------------|-------------|
| Component decomposition | OWUI's `Chat.svelte` is 1,500 lines — "god module" anti-pattern | WebClaw's ChatScreen is 450 lines with 13 hooks — well-decomposed | Both point to decomposing NaW's monolith. OWUI is the cautionary tale; WebClaw is the positive example. |
| Tool display | OWUI tools fail silently — #1 pain point | WebClaw's tool component has explicit 4-state machine | Both confirm NaW should have visible tool state. Confirms OWUI P0 recommendation #4. |
| Context visibility | OWUI truncates context silently | WebClaw surfaces token usage in context meter | Both confirm NaW should show context window usage. Confirms OWUI P0 recommendation #4. |
| Performance | OWUI degrades at 100+ messages, 500MB+ memory | WebClaw caps at 200 messages, no virtualization | Both lack virtualization. NaW should plan for it. |
| Inline triggers | OWUI has `#`, `/`, `@` trigger characters | WebClaw has none | OWUI's inline triggers remain the best UX pattern in competitive research. |
| Auto-scroll | OWUI has basic auto-scroll | WebClaw has custom scroll + pin-to-top | WebClaw's pin-to-top is a novel enhancement not seen in OWUI. |
| State management | OWUI has 50+ flat Svelte stores with no persistence | WebClaw has TQ + Zustand with persist | Both NaW and WebClaw have better state management than OWUI. |

---

## Recommendations

### 1. ADOPT — Message-Level Content-Based Memoization

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C07, WC-A3-C02, WC-A2-C17
**Effort**: 1-2 days
**Impact**: Performance — reduces per-streaming-chunk work from O(N × message_complexity) to O(1 streaming message)
**Risk if wrong**: Negligible — memoization can be removed if profiling shows no benefit.
**Synergy with OWUI**: OWUI's 500MB+ memory at 100+ messages confirms that avoiding unnecessary work per message is critical.
**Implementation**: Wrap `Message` in `React.memo` with a custom comparator that compares text content, parts signatures, and relevant props. Model on WebClaw's `areMessagesEqual`.

### 2. ADOPT — Generation Guard Timer

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C13, WC-A2-C09 (auto-reconnection + guard)
**Effort**: < 1 day
**Impact**: UX reliability — prevents stuck "streaming" state
**Risk if wrong**: Timer fires too early on slow models. Mitigate with configurable timeout (default 120s).
**Synergy with OWUI**: OWUI's "silent failure modes" anti-pattern confirms this is essential.
**Implementation**: Add a `useEffect` in `use-chat-core.ts` that sets a timeout when `status === "streaming"`. On timeout, call `stop()` and show an error toast.

### 3. ADOPT — Global Prompt Focus

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C11, WC-A2-C05
**Effort**: < 1 day
**Impact**: UX — eliminates click-to-focus friction
**Risk if wrong**: Interferes with keyboard shortcuts or accessibility. Mitigate by excluding meta/ctrl/alt keys and editable elements.
**Synergy with OWUI**: OWUI doesn't have this. Competitive differentiator vs all analyzed competitors.
**Implementation**: ~20 lines of global `keydown` listener attached in the chat layout.

### 4. ADOPT — Singleton Shiki Highlighter

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C06, WC-A2-C03
**Effort**: < 1 day
**Impact**: Performance — faster code block rendering, especially first render
**Risk if wrong**: None — strictly better than per-render initialization.
**Synergy with OWUI**: N/A (different stack).
**Implementation**: Create a module-level `highlighterPromise` in `code-block.tsx` initialized on first use. Reuse across all code blocks.

### 5. ADOPT — `text-balance` and `text-pretty` Typography

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C15
**Effort**: < 1 day
**Impact**: UX — improved text rendering
**Risk if wrong**: None — CSS properties are progressive enhancement.
**Implementation**: Add `text-balance` to heading styles, `text-pretty` to body/paragraph styles in markdown components and global CSS.

### 6. ADOPT — Context Meter / Token Usage Display

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C14, OWUI P0 #4 (visible failure feedback)
**Effort**: 3-5 days
**Impact**: UX — power user feature, context visibility
**Risk if wrong**: Low — informational display, doesn't affect functionality.
**Synergy with OWUI**: Both WebClaw and Open WebUI surface context information. NaW is the outlier.
**Implementation**: Create a progress bar component that shows token usage against model context window. Display in chat header.

### 7. ADAPT — Hook Decomposition of `use-chat-core.ts`

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C02, WC-A5-C03, WC-A2-C09-C14
**Effort**: 3-5 days
**Impact**: DX + Performance — easier maintenance, better re-render isolation
**Risk if wrong**: Increased indirection — more files to navigate. Mitigate by keeping all hooks in the same directory with clear naming.
**Synergy with OWUI**: OWUI's 1,500-line Chat.svelte is the cautionary tale of what happens without decomposition.
**Implementation**: Extract streaming, submission, edit, search, and hydration concerns into separate hooks. Keep the orchestrator in `chat.tsx`.

### 8. ADAPT — Composer Input Ref Optimization

**Transferability**: Directly Transferable
**Evidence**: WC-A5-C08, WC-A3-C04, WC-A2-C15
**Effort**: 1-2 days
**Impact**: Performance — eliminates keystroke-triggered cascading re-renders
**Risk if wrong**: Breaks draft persistence (IndexedDB sync relies on `useState`). Mitigate by debouncing draft saves.
**Synergy with OWUI**: N/A.
**Implementation**: Move `input` from `useState` to `useRef`. Debounce draft persistence to 500ms. Expose `getValue()` callback for submission.

### 9. ADAPT — Pin-to-Top Scroll Behavior

**Transferability**: Adaptable
**Evidence**: WC-A5-C12, WC-A2-C16
**Effort**: 2-3 days
**Impact**: UX — better readability during long responses
**Risk if wrong**: Conflicts with `use-stick-to-bottom` behavior. May feel unfamiliar to users used to bottom-anchored scrolling.
**Synergy with OWUI**: Neither OWUI nor ChatGPT/Claude have this — would be a differentiator.
**Implementation**: Add `pinToTop` state that triggers on new response. Use `scrollIntoView({ block: 'start' })` on the user message element.

### 10. SKIP — Replace react-markdown with Streamdown

**Transferability**: Adaptable
**Evidence**: WC-A5-C05, WC-A2-C02, WC-A2-C18
**Effort**: 3-5 days + risk
**Impact**: Potentially better streaming UX, but NaW's per-block memoization already handles the main concern
**Risk if wrong**: Streamdown is newer, less tested, potentially larger bundle. NaW's react-markdown + marked.lexer approach is proven.
**Synergy with OWUI**: N/A.
**Rationale**: NaW's per-block memoization gives 80% of Streamdown's benefit with zero migration risk. Revisit if streaming jank is measured and traced to markdown parsing.

### 11. SKIP — Replace cmdk with Base UI Autocomplete

**Transferability**: Adaptable
**Evidence**: WC-A5-C04
**Effort**: 1-2 weeks
**Impact**: Eliminates Radix transitive dependency
**Risk if wrong**: cmdk is battle-tested; Base UI Autocomplete may lack fuzzy matching quality.
**Rationale**: The Radix transitive dep through cmdk is a minor nuisance, not a blocker. Migration cost doesn't justify the benefit.

### 12. SKIP — UI State in TanStack Query Cache

**Transferability**: Adaptable but not recommended
**Evidence**: WC-A3-C05
**Effort**: 1 day
**Impact**: Minimal — NaW already uses Zustand for UI state
**Rationale**: Semantically confusing. Zustand with `persist` is clearer and already in use.

---

## Summary: What NaW Does Better

| Dimension | NaW Advantage | Protect? |
|-----------|--------------|----------|
| Real-time data sync | Convex subscriptions vs 30s polling | Yes — core architectural advantage |
| Per-block markdown memoization | `marked.lexer()` → block splitting → independent memo | Yes — proven pattern |
| Feature breadth | 73 UI components, multi-model comparison, BYOK | Yes — platform scope |
| Scroll management | `use-stick-to-bottom` library vs custom code | Yes — less maintenance burden |
| Draft persistence | `useChatDraft` → IndexedDB | Yes — user convenience |
| Auth architecture | Clerk (managed, multi-method) vs gateway token | Yes — production-grade |
| Database persistence | Convex (full persistence) vs none (gateway manages) | Yes — data ownership |

---

*Research completed February 15, 2026. Based on WebClaw repository (`main` branch, ~80 commits), Not A Wrapper codebase on branch `am-i-in-over-my-head`, and Open WebUI analysis (Feb 12, 2026). All code references verified against current source files.*
