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

- [ ] **#1 Bug fixes** (`In progress`)  
  Sources: `plans/base-ui-pattern-fixes.md`, `plans/provider-neutral-replay-compiler.md`
  - [ ] List unresolved regressions from Base UI migration and map each to owner/file.
  - [x] Fix text loading animation shift and verify no layout jump in streaming states.
  - [x] Fix stop-streaming button behavior and ensure stream cancellation is immediate.
  - [x] Prevent streaming from continuing after exit/navigation.
  - [x] Fix model persistence so selected model is restored reliably.
  - [ ] Remove link text formatting artifacts (`()` rendering issues).

- [x] **#2 Tool calling infra** (`Done`)  
  Sources: `plans/tool-calling-infrastructure.md`, `plans/tool-calling-hardening.md`, `research/multi-tool-calling-system-design.md`, `research/tool-calling-infrastructure.md`
  - [x] Finalize 3-layer hybrid architecture (provider, third-party, MCP).
  - [x] Implement and validate dual-gate injection logic.
  - [x] Document hardening outcomes and known limitations.

- [ ] **#3 Prompt-kit integration** (`Not started`)  
  Sources: `plans/prompt-kit-component-audit.md`
  - [ ] Audit Prompt-kit components and map them to current chat UI surfaces.
  - [ ] Implement highest-priority component swaps with visual parity checks.
  - [ ] Validate keyboard/ARIA behavior and interaction regressions.
  - [ ] Update docs/examples for new component usage.

- [ ] **#4 Visible failure feedback** (`In progress`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define a shared status model for tool calls, RAG, and truncation events.
  - [ ] Add inline/badge indicators for active, partial, failed, and recovered states.
  - [ ] Add user-facing error copy with actionable next steps.
  - [ ] Verify behavior across streaming + retry flows.

- [ ] **#5 Security headers** (`Not started`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Add baseline CSP with least-privilege defaults and required exceptions.
  - [ ] Add HSTS (with rollout-safe max-age strategy).
  - [ ] Add `X-Frame-Options` and validate embed behavior expectations.
  - [ ] Validate headers in local, preview, and production deployments.

- [ ] **#6 Multi-chat card in single conversations** (`Not started`)  
  Sources: —
  - [ ] Reproduce by opening prior single-model thread while multi-chat mode is selected.
  - [ ] Identify state source causing incorrect card-view rendering.
  - [ ] Fix mode/thread reconciliation logic.
  - [ ] Add regression test for single-thread render fallback.

- [ ] **#7 Missing share button on multi-chat threads** (`Not started`)  
  Sources: —
  - [ ] Trace share-button visibility conditions for single vs multi-chat routes.
  - [ ] Implement share action + UI state for multi-chat threads.
  - [ ] Verify permissions, URL generation, and copied-link behavior.
  - [ ] Add regression test for multi-chat share affordance.

- [ ] **#8 OS-conditional shortcut labels in tooltips** (`Not started`)  
  Sources: Sidebar shortcut update discussion (2026-02-18)
  - [ ] Add platform detection utility (`Mac` vs `Windows/Linux`) for shortcut rendering.
  - [ ] Replace hardcoded shortcut labels in sidebar toggle tooltip.
  - [ ] Roll out shared shortcut label component for other tooltips.
  - [ ] Add unit test coverage for platform-specific output.

### P1 — Do Next

- [ ] **#8 UX redesign: tools/thinking** (`Not started`)  
  Sources: `plans/prompt-kit-component-audit.md`, `research/competitive-feature-analysis.md`
  - [ ] Document UX target states (loading, running tool, tool complete, thinking).
  - [ ] Implement revised layout and hierarchy to match competitive patterns.
  - [ ] Validate mobile + desktop readability and collapse behavior.

- [ ] **#9 UX redesign: sources** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`
  - [ ] Define source card schema (title, host, snippet, confidence/relevance).
  - [ ] Redesign source presentation with better scanability and click targets.
  - [ ] Add truncation/expand interactions and keyboard support.

- [ ] **#10 Settings page** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`
  - [ ] Define route architecture for full-page settings.
  - [ ] Migrate existing modal sections into page tabs/sections.
  - [ ] Preserve deep links and back-navigation behavior.
  - [ ] Remove or deprecate legacy modal entry points.

- [ ] **#11 Model selector simplification** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`
  - [ ] Reduce selector cognitive load (grouping, defaults, fewer nested popovers).
  - [ ] Surface thinking effort controls directly in selector flow.
  - [ ] Validate persistence and cross-session recall of user choices.

- [ ] **#12 Inline message controls** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`
  - [ ] Add per-message model override control.
  - [ ] Add per-message web-search toggle.
  - [ ] Add attach/remove file controls scoped to message composition.
  - [ ] Confirm compatibility with retry/edit flows.

- [ ] **#13 Message rating/feedback** (`In progress`)  
  Sources: `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Finalize thumbs up/down interaction and active states.
  - [ ] Persist feedback to backend with message/thread linkage.
  - [ ] Add analytics/reporting hooks for feedback trends.

- [ ] **#14 Conversation export** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define export schema for Markdown and JSON formats.
  - [ ] Implement export action in thread UI.
  - [ ] Validate exports with long threads and tool results.

- [ ] **#15 Template variables in prompts** (`Not started`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define supported variable list and escaping behavior.
  - [ ] Implement template substitution pipeline before model dispatch.
  - [ ] Add preview/validation UI for unresolved variables.

- [ ] **#16 Task model separation** (`Not started`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Route title/tag generation to lower-cost model.
  - [ ] Add fallback and timeout behavior.
  - [ ] Track cost/latency impact against baseline.

- [ ] **#17 Structured audit logging** (`In progress`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define log event taxonomy and severity levels.
  - [ ] Implement Convex wrappers with consistent metadata shape.
  - [ ] Add configurable log level controls per environment.

- [ ] **#18 RAG pipeline** (`Not started`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`, `context/database.md`
  - [ ] Implement chunking strategy and metadata schema.
  - [ ] Add embedding generation pipeline via selected API provider.
  - [ ] Integrate Convex vector search retrieval into chat flow.
  - [ ] Evaluate retrieval quality with representative datasets.

### P2 — Major Features

- [ ] **#19 Image generation in chat** (`Not started`)  
  Sources: `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define provider abstraction for image models (DALL-E, Gemini) under BYOK.
  - [ ] Build prompt-to-image request flow and response rendering UI.
  - [ ] Add content policy checks and error handling.

- [ ] **#20 Inline triggers (`#`, `/`, `@`)** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Implement trigger parser and suggestion engine in composer.
  - [ ] Add keyboard navigation and insertion UX.
  - [ ] Integrate file/model/tool resolution for each trigger type.

- [ ] **#21 Cross-conversation memory** (`Not started`)  
  Sources: `plans/cross-conversation-memory.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define memory schema (fact/entity/source/confidence/updatedAt).
  - [ ] Implement model-callable memory tools (search/add/replace).
  - [ ] Add user controls for memory visibility and deletion.

- [ ] **#22 Personalization** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Add custom instruction and rule management UI.
  - [ ] Add theme controls (fonts/colors) with persisted preferences.
  - [ ] Add model preset/persona creation and assignment flows.

- [ ] **#23 Code execution sandbox** (`Not started`)  
  Sources: `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Evaluate E2B vs WebContainers for security, latency, and cost.
  - [ ] Implement sandbox lifecycle (start/run/terminate) abstraction.
  - [ ] Add output streaming + timeout/failure handling UX.

- [ ] **#24 Audio STT/TTS** (`Not started`)  
  Sources: `plans/phase-7-future-tool-integrations.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define provider adapter interfaces for STT and TTS.
  - [ ] Implement microphone capture and transcription flow.
  - [ ] Implement response speech playback with provider selection.

- [x] **#25 Extend replay model** (`Done`)  
  Sources: `plans/provider-neutral-replay-compiler.md`, `plans/provider-aware-history-adaptation.md`, `research/provider-aware-history-adaptation.md`
  - [x] Preserve provider-native payloads per origin in replay model.
  - [x] Validate compatibility with provider-aware history adaptation.
  - [ ] Evaluate optional expansion scope for additional payload classes.

- [ ] **#26 Inline `style` override safety** (`Not started`)  
  Sources: Identified during dropdown-menu transition fix
  - [ ] Audit affected components: `select`, `dialog`, `alert-dialog`, `sheet`, `dropdown-menu`.
  - [ ] Merge internal transition style with consumer `style` props in all components.
  - [ ] Add regression tests ensuring animation survives style overrides.

- [ ] **#27 Multi-chat layout redesign** (`Not started`)  
  Sources: —
  - [ ] Implement 2-chat 50/50 split behavior.
  - [ ] Implement 3+ chat horizontal scrolling layout.
  - [ ] Validate responsive breakpoints and minimum card widths.

- [ ] **#28 ChatGPT-like notifications and reminders** (`Not started`)  
  Sources: —
  - [ ] Research product requirements and expected reminder/notification flows.
  - [ ] Define reminder data model and scheduling mechanism.
  - [ ] Prototype notification delivery UX and permission handling.

### P3 — Strategic

- [ ] **#28 Model access control ACLs** (`Not started`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define ACL policy model (role, org, workspace, model scope).
  - [ ] Enforce ACL checks in model selection and API dispatch.
  - [ ] Add admin UI for policy management and audits.

- [ ] **#29 Admin-mutable config (PersistentConfig via Convex)** (`Not started`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define typed config schema with validation and defaults.
  - [ ] Implement Convex-backed CRUD with auth/ownership controls.
  - [ ] Add admin controls for live config updates.

- [ ] **#30 OpenTelemetry integration** (`Not started`)  
  Sources: `research/open-webui-analysis/SUMMARY.md`
  - [ ] Define telemetry coverage map (API, model calls, UI events).
  - [ ] Integrate tracing/metrics exporters for target environments.
  - [ ] Add sampling + privacy controls for sensitive payloads.

- [ ] **#31 Prompt library with `/` trigger** (`Not started`)  
  Sources: `research/competitive-feature-analysis.md`, `research/open-webui-analysis/SUMMARY.md`
  - [ ] Design prompt template storage schema and sharing model.
  - [ ] Integrate `/` trigger command palette for prompt insertion.
  - [ ] Add CRUD UI and usage analytics for prompt library entries.

- [ ] **#32 Flowglad integration** (`Not started`)  
  Sources: `AGENTS.md`
  - [ ] Define billing entities and subscription lifecycle mapping.
  - [ ] Implement checkout, upgrade/downgrade, and cancellation flows.
  - [ ] Add webhook handling for plan state synchronization.

### P4 — Performance & DX

> Sources: `.agents/context/research/webclaw/06-recommendations.md` (Sections 1, 2, 4)

- [x] **#33 Message memoization** (`Done`)  
  Benefit: Eliminate long-thread streaming jank by restricting re-renders to active message.  
  Sources: `research/webclaw/06-recommendations.md` R01
  - [x] Add `React.memo` guard and content-based equality comparator.
  - [x] Validate rendering complexity change (O(N) -> O(1) per chunk).
  - [x] Confirm no regression in edited/retried messages.

- [x] **#34 Composer ref isolation** (`Done`)  
  Benefit: Stop per-keystroke cascading re-renders through chat tree.  
  Sources: `research/webclaw/06-recommendations.md` R02
  - [x] Move input state tracking to `useRef`.
  - [x] Add 500ms draft persistence debounce.
  - [x] Add `beforeunload` flush for draft reliability.

- [x] **#35 Singleton Shiki highlighter** (`Done`)  
  Benefit: Prevent repeated WASM initialization and improve code block latency.  
  Sources: `research/webclaw/06-recommendations.md` R04
  - [x] Create module-level singleton `highlighterPromise`.
  - [x] Reuse singleton across all markdown/code renders.
  - [x] Validate no duplicate highlighter bootstrapping.

- [ ] **#36 Typography utilities** (`Partial`)  
  Benefit: Improve text readability with near-zero runtime cost.  
  Sources: `research/webclaw/06-recommendations.md` R05
  - [x] Apply `text-balance`/`text-pretty` in `.prose` markdown context.
  - [ ] Extend utility classes to sidebar titles.
  - [ ] Extend utility classes to standalone headings/components.

- [ ] **#37 Pragmatic hook decomposition** (`In progress`)  
  Benefit: Improve maintainability/testability of complex chat flows.  
  Sources: `research/webclaw/06-recommendations.md` R06 (adapted)
  - [x] Extract `use-chat-operations.ts` and `use-chat-draft.ts`.
  - [ ] Extract `use-chat-submit.ts` from `use-chat-core.ts`.
  - [ ] Extract `use-chat-edit.ts` from `use-chat-core.ts`.
  - [ ] Add focused tests for extracted hooks.

- [ ] **#38 `type` over `interface`** (`Not started`)  
  Benefit: Consistent type composition with unions/utilities.  
  Sources: `research/webclaw/06-recommendations.md` R09
  - [ ] Add lint preference/rule for new files only.
  - [ ] Document migration policy (no codemod, opportunistic adoption).
  - [ ] Track adoption in new/changed modules.

- [ ] **#39 Context meter** (`Not started`)  
  Benefit: Show remaining context window before limit hits.  
  Sources: `research/webclaw/06-recommendations.md` R08
  - [ ] Implement phase 1 estimate from visible message history.
  - [ ] Implement phase 2 with accumulated `usage.promptTokens`.
  - [ ] Normalize across multi-model conversations with differing limits.

- [ ] **#40 Global prompt auto-focus** (`Not started`)  
  Benefit: Remove click-to-focus friction in composer.  
  Sources: `research/webclaw/06-recommendations.md` R07
  - [ ] Add global printable-key listener and focus guardrails.
  - [ ] Exclude editable/interactive targets and modifier-key combos.
  - [ ] Validate behavior across routes/modals/platforms.

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
