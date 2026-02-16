# Not A Wrapper — Project Plan

> **Status**: Active | **Updated**: 2026-02-15 | **Owner**: <!-- TODO -->

High-level roadmap connecting vision to execution. Detailed implementation plans live in `.agents/plans/`.

```
plan.md              ← What & why (this file)
AGENTS.md            ← Rules & permissions
.agents/plans/       ← How (implementation details)
.agents/context/     ← Reference (architecture, research, ADRs)
.agents/workflows/   ← Process (dev cycle, debugging)
.agents/skills/      ← Guides (multi-step tasks)
```

---

## Vision

<!-- TODO: 2-3 sentences on the long-term vision -->

---

## Priorities

> Sources: `.agents/plans/todo-fixes-and-features.md`, `.agents/context/research/open-webui-analysis/SUMMARY.md`, `.agents/context/research/webclaw/06-recommendations.md`

### P0 — Do Now

| # | What | Status | Sources |
|---|------|--------|---------|
| 1 | **Bug fixes** — Base UI migration fixes, text loading animation shifting, stop streaming button, streaming continues after exit, model persistence, link text formatting (`()` artifacts) | In progress | `plans/base-ui-pattern-fixes.md`, `plans/provider-neutral-replay-compiler.md` |
| 2 | **Tool calling infra** — 3-layer hybrid (provider + third-party + MCP) with dual-gate injection | Done | `plans/tool-calling-infrastructure.md`, `plans/tool-calling-hardening.md`, `research/multi-tool-calling-system-design.md`, `research/tool-calling-infrastructure.md` |
| 3 | **Prompt-kit integration** — Integrate new Prompt-kit components into chat UI | Not started | `plans/prompt-kit-component-audit.md` |
| 4 | **Visible failure feedback** — status indicators for tool calls, RAG, context truncation | In progress | `research/open-webui-analysis/SUMMARY.md` |
| 5 | **Security headers** — CSP, HSTS, X-Frame-Options out of the box | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 6 | **Multi-chat card in single conversations** — When multi-chat is selected and user visits a prior single-model conversation, the UI incorrectly renders multi-chat card view. Investigate and fix. | Not started | — |
| 7 | **Missing share button on multi-chat threads** — Multi-chat conversations have no share button. Investigate why and add support. | Not started | — |

### P1 — Do Next

| # | What | Status | Sources |
|---|------|--------|---------|
| 8 | **UX redesign: tools/thinking** — redesign tools & thinking component to match ChatGPT & Claude patterns | Not started | `plans/prompt-kit-component-audit.md`, `research/competitive-feature-analysis.md` |
| 9 | **UX redesign: sources** — redesign sources component to match ChatGPT & Claude patterns | Not started | `research/competitive-feature-analysis.md` |
| 10 | **Settings page** — convert settings modal to a full settings page (Claude-style) | Not started | `research/competitive-feature-analysis.md` |
| 11 | **Model selector simplification** — simplify popovers, surface thinking effort controls instead of model info | Not started | `research/competitive-feature-analysis.md` |
| 12 | **Inline message controls** — edit model, toggle web search, attach/remove files per message (Cursor-like) | Not started | `research/competitive-feature-analysis.md` |
| 13 | Message rating/feedback (thumbs up/down) | In progress | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 14 | Conversation export (Markdown + JSON) | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 15 | Template variables in prompts (`{{CURRENT_DATE}}`, `{{USER_NAME}}`) | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 16 | Task model separation — cheap model for title/tag generation | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 17 | Structured audit logging — configurable levels, Convex wrappers | In progress | `research/open-webui-analysis/SUMMARY.md` |
| 18 | RAG pipeline — Convex vector search + API embedding + chunking | Not started | `research/open-webui-analysis/SUMMARY.md`, `context/database.md` |

### P2 — Major Features

| # | What | Status | Sources |
|---|------|--------|---------|
| 19 | **Image generation** in chat (DALL-E + Gemini via BYOK) | Not started | `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md` |
| 20 | **Inline triggers** — `#` files, `/` commands, `@` models/tools | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 21 | **Cross-conversation memory** — Convex vectors + model-callable tools (search, add, replace) | Not started | `plans/cross-conversation-memory.md`, `research/open-webui-analysis/SUMMARY.md` |
| 22 | **Personalization** — custom instructions, rules, fonts, colors, model presets/personas | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 23 | Code execution sandbox (E2B or WebContainers) | Not started | `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md` |
| 24 | Audio STT/TTS (OpenAI, Deepgram, ElevenLabs) | Not started | `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md` |
| 25 | Extend replay model — preserve full provider-native tool payload per origin (consider expanding) | Done | `plans/provider-neutral-replay-compiler.md`, `plans/provider-aware-history-adaptation.md`, `research/provider-aware-history-adaptation.md` |
| 26 | **Inline `style` override safety** — all animated UI components (`select`, `dialog`, `alert-dialog`, `sheet`, `dropdown-menu`) place `style={{ transition: ... }}` before `{...props}`. If a consumer passes a `style` prop, React replaces the entire object, silently breaking the open/close animation. Fix: merge consumer `style` with transition style across all affected components | Not started | Identified during dropdown-menu transition fix |
| 27 | **Multi-chat layout redesign** — Better responsive layout: 2 chats → 50/50 split, 3+ chats → horizontally scrollable. Current card grid doesn't scale well. | Not started | — |

### P3 — Strategic

| # | What | Status | Sources |
|---|------|--------|---------|
| 28 | Model access control ACLs | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 29 | Admin-mutable config (PersistentConfig via Convex) | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 30 | OpenTelemetry integration | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 31 | Prompt library with `/` trigger | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 32 | Flowglad integration (billing, subscriptions, plan lifecycle) | Not started | `AGENTS.md` |

### P4 — Performance & DX

> Sources: `.agents/context/research/webclaw/06-recommendations.md` (Sections 1, 2, 4)

| # | What | Benefit | Status | Sources |
|---|------|---------|--------|---------|
| 33 | **Message memoization** — `React.memo` with content-based `areMessagesEqual` comparator; O(N) → O(1) re-renders per streaming chunk | Eliminates jank in long conversations; only the actively streaming message re-renders | Done | `research/webclaw/06-recommendations.md` R01 |
| 34 | **Composer ref isolation** — move `input` from `useState` to `useRef` in composer; debounce draft persistence 500ms + `beforeunload` flush | Stops every keystroke from cascading re-renders through the entire chat tree | Done | `research/webclaw/06-recommendations.md` R02 |
| 35 | **Singleton Shiki highlighter** — module-level `highlighterPromise` initialized once; eliminates redundant WASM init per code block | Faster code block rendering; avoids repeated ~2MB WASM load per block | Done | `research/webclaw/06-recommendations.md` R04 |
| 36 | **Typography utilities** — `text-balance` on headings, `text-pretty` on body in markdown styles (CSS progressive enhancement, zero cost) | Polished text rendering with no performance cost; degrades gracefully | Partial — `.prose` context in `globals.css`; not yet in sidebar titles or standalone headings | `research/webclaw/06-recommendations.md` R05 |
| 37 | **Pragmatic hook decomposition** — extract `use-chat-submit.ts` (~200 LOC) and `use-chat-edit.ts` (~170 LOC) from `use-chat-core.ts`; skip full 6-hook split until file exceeds ~1000 LOC | Makes the two most complex flows independently testable and easier to modify | In progress — `use-chat-operations.ts` (145 LOC) + `use-chat-draft.ts` extracted; core still 723 LOC | `research/webclaw/06-recommendations.md` R06 (adapted) |
| 38 | **`type` over `interface`** — adopt for new code only; no codemod. Add ESLint rule opportunistically | Consistency across codebase; better composability with unions and utility types | Not started | `research/webclaw/06-recommendations.md` R09 |
| 39 | **Context meter** — token usage progress bar in chat header; Phase 1: estimate from messages, Phase 2: accumulate actual `usage.promptTokens` from AI SDK. _Note: follow Cursor's approach and research how to make this work with our multi-model configuration_ | Users can see how much context window remains before hitting limits | Not started | `research/webclaw/06-recommendations.md` R08 |
| 40 | **Global prompt auto-focus** — ~20 LOC global `keydown` listener; auto-focus textarea on printable chars (exclude meta/ctrl/alt, editable elements) | Removes click-to-focus friction; matches VS Code behavior users already expect | Not started | `research/webclaw/06-recommendations.md` R07 |

> **Skipped from WebClaw research** (premature for current team size/stage): full screen-based feature modules (R10), portal-based scroll container (R11 — not applicable, NaW uses `use-stick-to-bottom` with plain divs), pin-to-top scroll (R12, ship behind toggle if ever), unified message component (R13 — shared primitives already in `components/ui/message.tsx`, final unification deferred), cmdk replacement (R14), streaming batching (R15). Revisit when team scales or profiling justifies. Generation guard timer (R03) already implemented in `use-chat-core.ts`.

### Critical Path

```
Bug Fixes + Prompt-kit ← no deps (do first, P0)
Security Headers ← no deps (do first, P0)
Tool Calling Infra → Built-in Injection → Phase 7 → Code Execution (longest chain)
UX Redesign → Settings Page + Model Selector (P1 chain)
Audit Logging → OpenTelemetry
Inline Triggers ← no deps → Prompt Library (P2, deferred)
Memory System ← Convex vectors → RAG Pipeline (P2, shares infra)
Multi-chat Card Bug (#6) ← no deps (investigate P0)
Multi-chat Share Button (#7) ← no deps (investigate P0)
Message Memo (#33) ✅ → Composer Ref (#34) ✅ → Hook Decomposition (#37, in progress) (P4 perf chain)
Shiki Singleton (#35) ✅ + Typography (#36, partial) + Auto-Focus (#40) ← no deps (P4 parallel)
Context Meter (#39) ← needs token accumulation from AI SDK usage object
Style Override Safety (#26) ← no deps (P2, affects select/dialog/alert-dialog/sheet/dropdown-menu)
Multi-chat Layout Redesign (#27) ← no deps (P2)
```

---

## Architecture

> Details: `.agents/context/architecture.md` | DB: `.agents/context/database.md` | API: `.agents/context/api.md` | Terms: `.agents/context/glossary.md`

<!-- TODO: 2-3 sentence summary of current architecture and planned changes -->

| ADR | Decision | Rationale |
|-----|----------|-----------|
| [001](.agents/context/decisions/001-convex-database.md) | Convex over Supabase | <!-- brief --> |
| [002](.agents/context/decisions/002-vercel-ai-sdk.md) | Vercel AI SDK for multi-provider | <!-- brief --> |
| [003](.agents/context/decisions/003-optimistic-updates.md) | Optimistic update pattern | <!-- brief --> |

---

## Research

> All research: `.agents/context/research/`

| Topic | Document |
|-------|----------|
| Provider history replay | `.agents/context/research/provider-aware-history-adaptation.md` |
| Open WebUI comparison | `.agents/context/research/open-webui-analysis/SUMMARY.md` |
| Latest models (Feb 2026) | `.agents/context/research/latest-models-february-2026.md` |
| Multi-tool calling | `.agents/context/research/multi-tool-calling-system-design.md` |
| Desktop/CLI access | `.agents/context/research/desktop-cli-local-access-evaluation.md` |
| Base UI migration | `.agents/context/research/radix-to-base-ui-css-variables.md` |
| WebClaw architecture & perf | `.agents/context/research/webclaw/06-recommendations.md` |

---
