# Not A Wrapper — Project Plan

> **Status**: Active  
> **Last Updated**: 2026-02-15  
> **Owner**: <!-- TODO: your name / GitHub handle -->

This is the **root-level plan** for the Not A Wrapper project. It serves as the high-level roadmap that connects vision to execution. Individual implementation plans live in `.agents/plans/` — this document ties them together with strategic context.

---

## How This Document Works

This `plan.md` follows emerging best practices from the [ExecPlan pattern](https://developers.openai.com/cookbook/articles/codex_exec_plans), the [AGENTS.md standard](https://agents.md), and DeveloperToolkit.ai's context management guidance. Key principles:

1. **Self-contained**: A new contributor (human or AI agent) should understand the project direction from this file alone.
2. **Living document**: Updated at every major milestone, decision, or pivot. Never stale.
3. **Reference hub**: Points to detailed plans in `.agents/plans/` rather than duplicating them.
4. **Outcome-focused**: Describes what users can do after each milestone, not just what code changes.

### Relationship to Other Docs

```
plan.md (this file)          ← Strategic: vision, milestones, priorities
├── AGENTS.md                ← Tactical: commands, patterns, permissions
├── CLAUDE.md                ← Agent config: Claude-specific behaviors
├── .agents/plans/*.md       ← Execution: detailed implementation plans
├── .agents/context/         ← Reference: architecture, API, glossary
│   ├── research/            ← Evidence: evaluations, analyses
│   ├── decisions/           ← ADRs: architecture decision records
│   └── troubleshooting/     ← Fixes: known issues & solutions
├── .agents/workflows/       ← Process: development cycle, debugging
├── .agents/skills/          ← Guides: multi-step task instructions
└── .agents/archive/         ← History: superseded documents
```

**Convention**: This file answers *what* and *why*. `.agents/plans/` answers *how*. `AGENTS.md` answers *with what rules*. `.agents/context/` provides *supporting knowledge*.

---

## Vision

<!-- TODO: 2-3 sentences describing the long-term vision for Not A Wrapper -->
<!-- Example: "Not A Wrapper is the open-source alternative to ChatGPT, Claude.ai, and Gemini — 
     a single interface for every AI model, where users own their data, keys, and workflow." -->

## Goals

<!-- TODO: Define 3-5 measurable goals for the current development phase -->
<!-- Tip: Make these SMART — Specific, Measurable, Achievable, Relevant, Time-bound -->

| # | Goal | Measure of Success | Target Date |
|---|------|--------------------|-------------|
| 1 | <!-- e.g., Production-ready multi-provider chat --> | <!-- e.g., All 8 providers streaming without errors --> | <!-- e.g., 2026-Q1 --> |
| 2 | <!-- e.g., Robust tool calling across providers --> | <!-- e.g., Web search works on all supported models --> | <!-- --> |
| 3 | <!-- e.g., Beautiful, accessible UI --> | <!-- e.g., Base UI migration complete, WCAG 2.1 AA --> | <!-- --> |
| 4 | <!-- e.g., Community adoption --> | <!-- e.g., 500+ GitHub stars, 10+ contributors --> | <!-- --> |
| 5 | <!-- e.g., Monetization foundation --> | <!-- e.g., BYOK + hosted plans via Flowglad --> | <!-- --> |

---

## Current Priorities

> Reference: `.agents/plans/todo-fixes-and-features.md` for the tactical backlog.

### Priority 1 — Stability & Polish

<!-- TODO: Describe the current focus area and why it matters -->
<!-- These should map to Priority 1 items in todo-fixes-and-features.md -->

Active plans:
- `.agents/plans/base-ui-migration.md` — <!-- brief status -->
- `.agents/plans/base-ui-pattern-fixes.md` — <!-- brief status -->
- `.agents/plans/provider-neutral-replay-compiler.md` — <!-- brief status -->

### Priority 2 — UX Redesign

<!-- TODO: Describe the redesign direction (ChatGPT-like? Claude-like? Original?) -->

Active plans:
- <!-- reference .agents/plans/ files or note "plan needed" -->

### Priority 3 — Feature Expansion

<!-- TODO: Describe the next wave of features -->

Active plans:
- `.agents/plans/tool-calling-infrastructure.md` — <!-- brief status -->
- `.agents/plans/tool-calling-hardening.md` — <!-- brief status -->
- `.agents/plans/cross-conversation-memory.md` — <!-- brief status -->
- `.agents/plans/phase-7-future-tool-integrations.md` — <!-- brief status -->

---

## Milestones

<!-- TODO: Define 3-6 milestones that represent meaningful progress -->
<!-- Each milestone should describe: scope, what exists after, how to verify -->

### Milestone 1: <!-- e.g., "Stable Multi-Provider Chat" -->

**Target**: <!-- date -->  
**Scope**: <!-- 1-2 sentences -->  
**Acceptance**: <!-- What can a user do after this? How do you verify? -->  
**Plans**: <!-- list of .agents/plans/ files that contribute to this milestone -->

### Milestone 2: <!-- e.g., "Tool Calling v1" -->

**Target**: <!-- date -->  
**Scope**: <!-- 1-2 sentences -->  
**Acceptance**: <!-- What can a user do after this? How do you verify? -->  
**Plans**: <!-- list of .agents/plans/ files -->

### Milestone 3: <!-- e.g., "Public Beta" -->

**Target**: <!-- date -->  
**Scope**: <!-- 1-2 sentences -->  
**Acceptance**: <!-- What can a user do after this? How do you verify? -->  
**Plans**: <!-- list of .agents/plans/ files -->

---

## Architecture Overview

> Full details: `.agents/context/architecture.md`  
> Database schema: `.agents/context/database.md`  
> API surface: `.agents/context/api.md`  
> Terminology: `.agents/context/glossary.md`

<!-- TODO: 3-5 sentence summary of the current architecture and any planned changes -->
<!-- Example: "Next.js 16 App Router with Convex for reactive data, Clerk for auth, and 
     Vercel AI SDK v6 for multi-provider streaming. The key architectural challenge is 
     provider-neutral history replay (see ADR-003 and the replay compiler plan)." -->

### Key Architecture Decisions

<!-- TODO: Summarize the most impactful ADRs -->

| ADR | Decision | Rationale |
|-----|----------|-----------|
| [001](.agents/context/decisions/001-convex-database.md) | Convex over Supabase | <!-- brief --> |
| [002](.agents/context/decisions/002-vercel-ai-sdk.md) | Vercel AI SDK for multi-provider | <!-- brief --> |
| [003](.agents/context/decisions/003-optimistic-updates.md) | Optimistic update pattern | <!-- brief --> |
| <!-- new --> | <!-- e.g., Base UI over Radix --> | <!-- brief --> |

---

## Research & Context

> Active research lives in `.agents/context/research/`

### Completed Research

<!-- TODO: List research docs that have informed decisions -->

| Topic | Document | Key Findings |
|-------|----------|--------------|
| Provider history replay | `.agents/context/research/provider-aware-history-adaptation.md` | <!-- brief --> |
| Open WebUI comparison | `.agents/context/research/open-webui-analysis/SUMMARY.md` | <!-- brief --> |
| Latest models (Feb 2026) | `.agents/context/research/latest-models-february-2026.md` | <!-- brief --> |
| Multi-tool calling | `.agents/context/research/multi-tool-calling-system-design.md` | <!-- brief --> |
| Desktop/CLI access | `.agents/context/research/desktop-cli-local-access-evaluation.md` | <!-- brief --> |
| Base UI migration | `.agents/context/research/radix-to-base-ui-css-variables.md` | <!-- brief --> |

### Open Questions

<!-- TODO: List research questions that still need answers -->
<!-- These may become new docs in .agents/context/research/ -->

- <!-- e.g., "What's the best approach for cross-conversation memory? Vector search vs. graph?" -->
- <!-- e.g., "Should we support MCP (Model Context Protocol) for tool extensibility?" -->
- <!-- e.g., "What's the right monetization model for hosted vs. self-hosted?" -->

---

## Progress

> This section is a living checklist. Update at every stopping point.

- [ ] <!-- (date) Define vision statement -->
- [ ] <!-- (date) Fill in goals table -->
- [ ] <!-- (date) Define milestones with acceptance criteria -->
- [ ] <!-- (date) Summarize architecture decisions -->
- [ ] <!-- (date) Link completed research findings -->
- [ ] <!-- (date) Write open questions -->
- [ ] <!-- (date) First milestone complete -->

---

## Decision Log

> Record every strategic decision. For implementation-level decisions, use the relevant `.agents/plans/` file.

<!-- 
- **Decision**: ...
  **Rationale**: ...
  **Date**: ...
  **Alternatives considered**: ...
-->

---

## Surprises & Discoveries

> Unexpected findings that shaped the project direction. For implementation-level discoveries, use the relevant plan file.

<!-- 
- **Observation**: ...
  **Evidence**: ...
  **Impact**: ...
-->

---

## Outcomes & Retrospective

> Updated at major milestones or phase completions.

<!-- 
### Milestone X — (date)
**Achieved**: ...
**Remaining**: ...
**Lessons learned**: ...
-->

---

## Quick Reference

### Commands

```bash
bun run dev          # Dev server (:3000)
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun run build        # Production build
bun run test         # Vitest
```

### Key Files

| Purpose | Path |
|---------|------|
| Agent instructions | `AGENTS.md` |
| Claude config | `CLAUDE.md` |
| Implementation plans | `.agents/plans/` |
| Architecture docs | `.agents/context/` |
| Development workflows | `.agents/workflows/` |
| Task guides | `.agents/skills/` |
| Todo backlog | `.agents/plans/todo-fixes-and-features.md` |

### Creating New Plans

When starting a new feature or refactor, create a plan in `.agents/plans/`:

1. Use the ExecPlan pattern (self-contained, living document, outcome-focused)
2. Include: status, decision summary, file map, phases, verification steps
3. Reference this `plan.md` for strategic context
4. Follow `AGENTS.md` permissions for what requires approval
5. See `.agents/plans/provider-neutral-replay-compiler.md` as a gold-standard example

---

*This plan follows the [ExecPlan methodology](https://developers.openai.com/cookbook/articles/codex_exec_plans) adapted for project-level planning. Individual feature plans use the full ExecPlan format in `.agents/plans/`.*
