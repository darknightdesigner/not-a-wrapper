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

> Sources: `.agents/plans/todo-fixes-and-features.md`, `.agents/context/research/open-webui-analysis/SUMMARY.md`

### P0 — Do Now

| # | What | Status | Sources |
|---|------|--------|---------|
| 1 | **Bug fixes** — Base UI migration fixes, text loading animation shifting, stop streaming button, streaming continues after exit, model persistence, link text formatting (`()` artifacts) | In progress | `plans/base-ui-pattern-fixes.md`, `plans/provider-neutral-replay-compiler.md` |
| 2 | **Tool calling infra** — 3-layer hybrid (provider + third-party + MCP) with dual-gate injection | Done | `plans/tool-calling-infrastructure.md`, `plans/tool-calling-hardening.md`, `research/multi-tool-calling-system-design.md`, `research/tool-calling-infrastructure.md` |
| 3 | **Prompt-kit integration** — Integrate new Prompt-kit components into chat UI | Not started | `plans/prompt-kit-component-audit.md` |
| 4 | **Visible failure feedback** — status indicators for tool calls, RAG, context truncation | In progress | `research/open-webui-analysis/SUMMARY.md` |
| 5 | **Security headers** — CSP, HSTS, X-Frame-Options out of the box | Not started | `research/open-webui-analysis/SUMMARY.md` |

### P1 — Do Next

| # | What | Status | Sources |
|---|------|--------|---------|
| 6 | **UX redesign: tools/thinking** — redesign tools & thinking component to match ChatGPT & Claude patterns | Not started | `plans/prompt-kit-component-audit.md`, `research/competitive-feature-analysis.md` |
| 7 | **UX redesign: sources** — redesign sources component to match ChatGPT & Claude patterns | Not started | `research/competitive-feature-analysis.md` |
| 8 | **Settings page** — convert settings modal to a full settings page (Claude-style) | Not started | `research/competitive-feature-analysis.md` |
| 9 | **Model selector simplification** — simplify popovers, surface thinking effort controls instead of model info | Not started | `research/competitive-feature-analysis.md` |
| 10 | **Inline message controls** — edit model, toggle web search, attach/remove files per message (Cursor-like) | Not started | `research/competitive-feature-analysis.md` |
| 11 | Message rating/feedback (thumbs up/down) | In progress | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 12 | Conversation export (Markdown + JSON) | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 13 | Template variables in prompts (`{{CURRENT_DATE}}`, `{{USER_NAME}}`) | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 14 | Task model separation — cheap model for title/tag generation | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 15 | Structured audit logging — configurable levels, Convex wrappers | In progress | `research/open-webui-analysis/SUMMARY.md` |
| 16 | RAG pipeline — Convex vector search + API embedding + chunking | Not started | `research/open-webui-analysis/SUMMARY.md`, `context/database.md` |

### P2 — Major Features

| # | What | Status | Sources |
|---|------|--------|---------|
| 17 | **Image generation** in chat (DALL-E + Gemini via BYOK) | Not started | `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md` |
| 18 | **Inline triggers** — `#` files, `/` commands, `@` models/tools | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 19 | **Cross-conversation memory** — Convex vectors + model-callable tools (search, add, replace) | Not started | `plans/cross-conversation-memory.md`, `research/open-webui-analysis/SUMMARY.md` |
| 20 | **Personalization** — custom instructions, rules, fonts, colors, model presets/personas | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 21 | Code execution sandbox (E2B or WebContainers) | Not started | `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md` |
| 22 | Audio STT/TTS (OpenAI, Deepgram, ElevenLabs) | Not started | `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md` |
| 23 | Extend replay model — preserve full provider-native tool payload per origin (consider expanding) | Done | `plans/provider-neutral-replay-compiler.md`, `plans/provider-aware-history-adaptation.md`, `research/provider-aware-history-adaptation.md` |

### P3 — Strategic

| # | What | Status | Sources |
|---|------|--------|---------|
| 24 | Model access control ACLs | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 25 | Admin-mutable config (PersistentConfig via Convex) | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 26 | OpenTelemetry integration | Not started | `research/open-webui-analysis/SUMMARY.md` |
| 27 | Prompt library with `/` trigger | Not started | `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md` |
| 28 | Flowglad integration (billing, subscriptions, plan lifecycle) | Not started | `AGENTS.md` |

### Critical Path

```
Bug Fixes + Prompt-kit ← no deps (do first, P0)
Security Headers ← no deps (do first, P0)
Tool Calling Infra → Built-in Injection → Phase 7 → Code Execution (longest chain)
UX Redesign → Settings Page + Model Selector (P1 chain)
Audit Logging → OpenTelemetry
Inline Triggers ← no deps → Prompt Library (P2, deferred)
Memory System ← Convex vectors → RAG Pipeline (P2, shares infra)
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

---
