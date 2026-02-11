# Prompt-Kit Component Audit — Review & Recommendations

## Background

This project includes 19 prompt-kit components in `components/ui/`. These are chat-oriented UI primitives sourced from [prompt-kit.com](https://prompt-kit.com). Currently only 9 of 19 are used in the chat UI. Some unused components have custom alternatives in `app/components/chat/`, while others have no equivalent at all.

This plan instructs an AI agent to review each component, compare prompt-kit vs custom implementations, and recommend a path forward for each.

## What's Already Done

### Currently Used (9 components)

| Component | Prompt-Kit File | Used In |
|-----------|----------------|---------|
| Chat Container | `components/ui/chat-container.tsx` | `conversation.tsx`, `multi-conversation.tsx` |
| Code Block | `components/ui/code-block.tsx` | Indirectly via `Markdown` (Shiki highlighting) |
| File Upload | `components/ui/file-upload.tsx` | `chat-input/button-file-upload.tsx` |
| Loader | `components/ui/loader.tsx` | `message-assistant.tsx`, `conversation.tsx` (variant="chat") |
| Markdown | `components/ui/markdown.tsx` | `reasoning.tsx`, via `MessageContent` |
| Message | `components/ui/message.tsx` | `message-assistant.tsx`, `message-user.tsx`, `chat-preview-panel.tsx`, share page |
| Prompt Input | `components/ui/prompt-input.tsx` | `chat-input.tsx`, `multi-chat-input.tsx` |
| Prompt Suggestion | `components/ui/prompt-suggestion.tsx` | `chat-input/suggestions.tsx` |
| Scroll Button | `components/ui/scroll-button.tsx` | `conversation.tsx`, `multi-conversation.tsx` |

### Custom Alternatives Exist (3 components — prompt-kit version unused)

| Prompt-Kit Component | Custom Implementation | Key Differences |
|----------------------|-----------------------|-----------------|
| `components/ui/reasoning.tsx` | `app/components/chat/reasoning.tsx` | Custom is simpler (64 lines vs 206). Uses `framer-motion` AnimatePresence for expand/collapse. Prompt-kit uses CSS `max-height` transitions with ResizeObserver, has compound component API (Reasoning/Trigger/Content), controlled/uncontrolled modes, React 19 render-sync pattern. |
| `components/ui/tool.tsx` | `app/components/chat/tool-invocation.tsx` | Custom is much richer (490 lines vs 217). Groups tools by `toolCallId`, uses AI SDK v6 `getStaticToolName()`, renders search results with links, handles MCP namespaced tool names, animated badge transitions. Prompt-kit is simpler with basic state/badge display. |
| `components/ui/source.tsx` | `app/components/chat/sources-list.tsx` | Custom renders a collapsible list of all sources with favicon previews, UTM parameters, and uses AI SDK `SourceUrlUIPart` type. Prompt-kit renders a single inline source pill with HoverCard preview — different UX pattern entirely. |

### Completely Unused (7 components — no custom alternative)

| Component | Prompt-Kit File | Lines | Description |
|-----------|----------------|-------|-------------|
| Chain of Thought | `components/ui/chain-of-thought.tsx` | 150 | Multi-step collapsible with vertical connector lines. Steps auto-detect last item. Uses Collapsible from Base UI. |
| Feedback Bar | `components/ui/feedback-bar.tsx` | 66 | Inline bar with thumbs up/down and close button. Intended for per-message feedback. |
| Image | `components/ui/image.tsx` | 95 | Handles base64 and Uint8Array image rendering with blob URL cleanup. App currently uses `next/image` for all images. |
| Steps | `components/ui/steps.tsx` | 118 | Collapsible step with vertical progress bar. Simpler than ChainOfThought (no connector lines between steps). |
| System Message | `components/ui/system-message.tsx` | 135 | Styled inline notification with action/error/warning variants, optional CTA button. Uses CVA for variants. |
| Text Shimmer | `components/ui/text-shimmer.tsx` | ~40 | Animated shimmer text effect. Used internally by ThinkingBar but not standalone. |
| Thinking Bar | `components/ui/thinking-bar.tsx` | 63 | Shimmer "Thinking" text with optional "Answer now" stop button and clickable navigation. |

---

## Tasks

### Task 1: Review currently used components — assess customization health

**Goal**: Ensure the 9 actively used prompt-kit components are in good shape, properly customized, and documented.

**For each used component**, check:

1. Does the file have a `@component` / `@source` / `@customized` JSDoc header? If not, add one following the pattern in `components/ui/reasoning.tsx` (lines 1–16).
2. Are there any upstream prompt-kit updates that should be pulled in? Compare with https://prompt-kit.com/docs/[component-name].
3. Are there any linting or type issues?

**Files to review**:
- `components/ui/chat-container.tsx`
- `components/ui/code-block.tsx`
- `components/ui/file-upload.tsx`
- `components/ui/loader.tsx`
- `components/ui/markdown.tsx`
- `components/ui/message.tsx`
- `components/ui/prompt-input.tsx`
- `components/ui/prompt-suggestion.tsx`
- `components/ui/scroll-button.tsx`

**Output**: A summary table noting which files need JSDoc headers, any issues found, and any upstream drift.

---

### Task 2: Evaluate Reasoning — migrate to prompt-kit or keep custom

**Goal**: Decide whether to migrate `app/components/chat/reasoning.tsx` to use the prompt-kit `Reasoning` compound component, or keep the custom version.

**Analysis points**:

| Factor | Custom (`app/`) | Prompt-Kit (`components/ui/`) |
|--------|-----------------|-------------------------------|
| Lines | 64 | 206 |
| API | Single component, props-based | Compound: `Reasoning` + `ReasoningTrigger` + `ReasoningContent` |
| Animation | `framer-motion` AnimatePresence | CSS `max-height` + ResizeObserver |
| Streaming | `useState` + wasStreaming flag | React 19 render-sync pattern (no useEffect) |
| Markdown | Renders via `<Markdown>` | Optional `markdown` prop on `ReasoningContent` |
| Controlled/Uncontrolled | Uncontrolled only | Both supported |

**Recommendation criteria**:
- **Migrate** if: prompt-kit version covers all current use cases and the compound API is cleaner for future extensions (e.g. adding thinking duration, custom trigger labels).
- **Keep custom** if: the simplicity is a feature and the framer-motion animation is preferred. The prompt-kit version would need framer-motion added anyway for animation parity.
- **Hybrid**: Use prompt-kit's streaming logic and controlled/uncontrolled pattern, but keep framer-motion for animation.

**Action**: Write recommendation with rationale. If migrating, include the code changes needed in `app/components/chat/message-assistant.tsx`.

---

### Task 3: Evaluate Tool — keep custom, consider prompt-kit for simple display

**Goal**: Decide the relationship between `components/ui/tool.tsx` and `app/components/chat/tool-invocation.tsx`.

**Analysis points**:

The custom `ToolInvocation` (490 lines) is significantly more capable than the prompt-kit `Tool` (217 lines):
- Groups multiple tool calls by `toolCallId` and picks the most informative state
- Uses AI SDK v6 `getStaticToolName()` for tool name resolution
- Renders structured search results (with clickable links, snippets)
- Handles MCP namespaced tool names
- Animated loading/completed badge transitions with framer-motion
- Multi-tool grouped view with "Tools executed" count badge

The prompt-kit `Tool` is a simpler single-tool display with:
- Basic state icon/badge (Processing, Ready, Completed, Error)
- Input/output sections with JSON formatting
- Uses Base UI Collapsible (not framer-motion)
- No tool grouping or SDK integration

**Recommendation criteria**:
- **Keep custom** as the primary chat tool display — it's feature-complete for the app's needs.
- **Consider prompt-kit Tool** for: simpler contexts like chat history preview, share pages, or debugging panels where the full tool invocation UI is overkill.
- **Consider removing** `components/ui/tool.tsx` if no simpler context needs it, to reduce dead code.

**Action**: Write recommendation. If keeping both, document when to use which.

---

### Task 4: Evaluate Source — keep both, different use cases

**Goal**: Clarify the relationship between `components/ui/source.tsx` and `app/components/chat/sources-list.tsx`.

**Analysis points**:

These serve fundamentally different UX patterns:
- **Prompt-kit `Source`**: Inline pill badge with HoverCard preview. Designed for embedding individual source references within text (like footnotes).
- **Custom `SourcesList`**: Collapsible list below the message showing all sources. Designed for displaying a collection of sources after the response.

**Recommendation criteria**:
- **Keep both** — they solve different problems.
- **Use `Source`** for: inline citation rendering within markdown text (e.g., `[1]` style footnotes that show a preview on hover). This is currently NOT implemented but would be a valuable feature.
- **Use `SourcesList`** for: the current collapsible sources section below messages.

**Action**: Write recommendation. If `Source` should be adopted for inline citations, outline the markdown plugin or message part changes needed.

---

### Task 5: Evaluate Chain of Thought — adopt for agentic workflows

**Goal**: Determine if/when to adopt `ChainOfThought` component.

**Analysis points**:

`ChainOfThought` provides a multi-step collapsible display with vertical connector lines between steps. Each step is independently collapsible and can show detailed content.

**Potential use cases**:
1. **Multi-step tool execution**: When an agent runs multiple tools in sequence, display as a chain rather than individual cards.
2. **Reasoning steps**: For models that return structured reasoning (step-by-step), display as a chain instead of a single block.
3. **Agentic workflows**: When implementing sub-agent architecture, show the orchestration steps.

**Recommendation criteria**:
- **Adopt when**: agentic/multi-step tool calling is implemented (see `.agents/plans/tool-calling-infrastructure.md`).
- **Skip for now** if: single-step tool calls remain the primary use case.
- **Relationship to Steps**: `ChainOfThought` and `Steps` overlap significantly. `ChainOfThought` adds connector lines and auto-detects the last item. Prefer `ChainOfThought` for multi-step flows and `Steps` for single collapsible sections.

**Action**: Write recommendation with timeline tied to tool-calling roadmap.

---

### Task 6: Evaluate Feedback Bar — adopt for per-message feedback

**Goal**: Determine if/when to adopt `FeedbackBar` for per-message thumbs up/down.

**Analysis points**:

Currently the app only has a global `FeedbackWidget` (floating button in `app/components/chat/feedback-widget.tsx`). There is no per-message feedback mechanism.

`FeedbackBar` provides:
- Inline thumbs up/down buttons
- Close button to dismiss
- Custom title and icon

**Recommendation criteria**:
- **Adopt when**: per-message feedback is a priority feature.
- **Requirements before adoption**: Need a backend mutation (Convex) to store feedback per message, and a way to surface aggregated feedback.
- **Consider enhancing**: The current component lacks a "selected" state (showing which option was chosen). This would need to be added.

**Action**: Write recommendation. If adopting, outline the Convex schema additions and integration points in `message-assistant.tsx`.

---

### Task 7: Evaluate remaining components — Image, Steps, System Message, Text Shimmer, Thinking Bar

**Goal**: Quick assessment of the remaining 5 unused components.

#### Image (`components/ui/image.tsx`)
- **Current state**: App uses `next/image` everywhere for standard images and `MorphingDialog` for image previews.
- **Unique capability**: Handles `base64` and `Uint8Array` rendering with proper blob URL cleanup.
- **Recommendation**: **Keep available** for AI-generated image features (e.g., DALL-E output). Not needed for current functionality. Do not remove — low maintenance cost.

#### Steps (`components/ui/steps.tsx`)
- **Current state**: Unused. Overlaps with `ChainOfThought`.
- **Unique capability**: Simpler collapsible with vertical bar (no connector lines between steps).
- **Recommendation**: **Keep available** for simpler collapsible patterns. Could replace framer-motion expand/collapse in places where CSS-only animation is preferred. Evaluate alongside `ChainOfThought` per Task 5.

#### System Message (`components/ui/system-message.tsx`)
- **Current state**: No inline system notifications in chat stream.
- **Unique capability**: Styled action/error/warning messages with CVA variants and optional CTA button.
- **Potential uses**:
  - Rate limit warnings inline in chat
  - Model fallback notifications ("Switched to gpt-4o due to rate limit")
  - System status messages ("Connected to local Ollama")
  - Error recovery prompts with CTA ("Retry" button)
- **Recommendation**: **Adopt soon**. This fills a real UX gap. Currently errors are only shown as toasts, which disappear. Inline system messages would persist in the conversation context.

#### Text Shimmer (`components/ui/text-shimmer.tsx`)
- **Current state**: Only used internally by `ThinkingBar`.
- **Recommendation**: **Keep as-is**. No standalone use needed. It's a dependency of ThinkingBar.

#### Thinking Bar (`components/ui/thinking-bar.tsx`)
- **Current state**: Unused. The app currently shows `Loader variant="chat"` (3-dot bounce) while waiting for the first streaming token.
- **Unique capability**: Shimmer "Thinking" text with "Answer now" stop button and clickable navigation (our customization adds `onClick` + ChevronRight icon).
- **Recommendation**: **Adopt as enhancement** to the current thinking/loading state. The ThinkingBar provides more context than a generic loader. Integration point: `app/components/chat/message-assistant.tsx` where `Loader variant="chat"` is currently rendered.

**Action**: Write summary table with priority/timeline for each.

---

## Priority Summary

| Component | Action | Priority | Blocked By |
|-----------|--------|----------|------------|
| **System Message** | Adopt — fills UX gap for inline notifications | High | Nothing |
| **Thinking Bar** | Adopt — better than current Loader for thinking state | High | Nothing |
| **Feedback Bar** | Adopt — per-message feedback | Medium | Convex schema for feedback storage |
| **Source (inline)** | Adopt — inline citation footnotes | Medium | Markdown plugin for citation rendering |
| **Reasoning** | Evaluate migration — compare animation/streaming tradeoffs | Medium | Nothing |
| **Chain of Thought** | Adopt — when agentic tool calling ships | Low | Tool calling infrastructure |
| **Steps** | Evaluate alongside ChainOfThought | Low | Task 5 decision |
| **Tool (prompt-kit)** | Keep or remove — custom version is primary | Low | Nothing |
| **Image** | Keep available — needed for AI image generation | Low | Image generation feature |
| **Text Shimmer** | Keep as-is — ThinkingBar dependency | None | N/A |

---

## How to Execute This Plan

1. Start with **Task 1** (audit used components) — quick wins, documentation improvements.
2. Then **Task 7** (quick evaluations) — low effort, establishes priorities.
3. Then **Tasks 2–4** in parallel — deeper evaluations of the three "custom alternative" components.
4. Then **Tasks 5–6** based on roadmap priorities.

Each task should produce a **recommendation section** added below the task in this document, with:
- Decision: Adopt / Keep Custom / Remove / Defer
- Rationale: 2–3 sentences
- Code changes: File list and brief description of changes needed
- Dependencies: Any blockers or prerequisites
