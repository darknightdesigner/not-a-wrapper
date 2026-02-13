# Provider-Neutral Replay Compiler — Execution Guide

> **Status**: Ready for Implementation
> **Decision**: Option C-lite — provider-neutral replay AST + provider compilers (incremental, adapter-compatible)
> **Priority**: P0 — cross-provider replay schema mismatches cause production chat failures
> **Timeline**: 2 weeks (7 phases)
> **Date**: 2026-02-13 | Revised: 2026-02-13

---

## How to Use This Plan

This plan is designed for an AI coding agent to execute safely with minimal ambiguity.

- Each phase is self-contained and resumable.
- Execute phases in order unless a phase explicitly says it can run in parallel.
- Do not skip verification commands.
- Do not remove existing adapters initially; this migration is additive and behind a feature flag.
- If any decision gate is reached, stop and ask the user before proceeding.

**Permission notes**:
- If implementation requires new dependencies, stop and ask first (`AGENTS.md` rule).
- Do not modify auth or schema files unless explicitly called for in this plan.

---

## Decision Summary

**Implementing a provider-neutral replay layer between stored `UIMessage[]` and provider request compilation.**  
Instead of replaying provider-native tool outputs directly, normalize replay-relevant artifacts into a stable internal format, then compile to target-provider-safe history.

**Why this option**:
- Eliminates the entire bug class of cross-provider tool payload incompatibility.
- Makes replay invariants explicit, testable, and observable.
- Preserves current architecture by integrating with existing adapter entrypoints.

**Evolution path**:
- v1 (this plan): normalized replay model for `web_search`, Anthropic/OpenAI compilers.
- v1.1: add Google/xAI/Mistral compiler parity.
- v2: extend normalized model to all tool families.

---

## Constants Reference

Add to `lib/config.ts`:

```typescript
export const HISTORY_REPLAY_COMPILER_V1 = true
export const HISTORY_REPLAY_NORMALIZER_VERSION = 1
```

If feature-flag conventions require env-driven flags, use the existing project flag style and map these constants accordingly.

---

## File Map

| Phase | File | Action |
|-------|------|--------|
| 1 | `app/api/chat/replay/types.ts` | Create — replay-normalized types and zod schemas |
| 1 | `app/api/chat/replay/normalize.ts` | Create — convert `UIMessage[]` to normalized replay model |
| 2 | `app/api/chat/replay/compilers/anthropic.ts` | Create — Anthropic replay compiler |
| 2 | `app/api/chat/replay/compilers/openai.ts` | Create — OpenAI replay compiler |
| 2 | `app/api/chat/replay/compilers/index.ts` | Create — compiler registry |
| 3 | `app/api/chat/adapters/index.ts` | Modify — route through compiler pipeline when enabled |
| 3 | `app/api/chat/route.ts` | Modify — wire flag + structured logs |
| 4 | `app/api/chat/replay/__tests__/normalize.test.ts` | Create — normalization tests |
| 4 | `app/api/chat/replay/__tests__/compilers.anthropic.test.ts` | Create — Anthropic replay contract tests |
| 4 | `app/api/chat/replay/__tests__/compilers.openai.test.ts` | Create — OpenAI replay contract tests |
| 5 | `app/api/chat/adapters/__tests__/cross-provider.test.ts` | Modify — add OpenAI -> Anthropic web search regression |
| 5 | `app/api/chat/replay/__tests__/matrix.test.ts` | Create — provider-switch matrix coverage |
| 6 | `app/api/chat/route.ts` | Modify — replay observability and fail-safe behavior |
| 7 | `.agents/context/decisions/005-provider-neutral-replay-compiler.md` | Create — ADR for architecture decision |
| 7 | `.agents/context/troubleshooting/replay-shape-errors.md` | Create — operational runbook |

---

## Phase 1: Define Replay-Normalized Model

> **Goal**: Create stable, provider-agnostic replay data structures and normalizer.
> **Dependencies**: None.
> **Can run in parallel with**: None (foundation).

### Context to Load

- `app/api/chat/adapters/types.ts` — existing adaptation contract.
- `app/components/chat/get-sources.ts` — source extraction patterns.
- `app/api/chat/adapters/__tests__/fixtures.ts` — existing message part examples.

### Steps

1. Create `app/api/chat/replay/types.ts` with:
   - `ReplayMessage`, `ReplayPart`, `ReplayToolExchange`.
   - A normalized web-search shape:
     - `query: string`
     - `results: Array<{ url: string; title?: string; snippet?: string }>`
     - `providerOrigin?: "openai" | "anthropic" | "google" | "xai" | "unknown"`
     - `rawShape?: "object-action-sources" | "array-results" | "unknown"`
   - zod schemas for runtime validation.

2. Create `app/api/chat/replay/normalize.ts`:
   - Parse tool parts conservatively.
   - Normalize known tool outputs (`tool-web_search`) from any recognized source shape.
   - Preserve text, file, and source-url parts.
   - Mark unknown tool payloads as non-replayable with explicit reason.

3. Ensure normalizer never throws for malformed data:
   - return warnings, not crashes.
   - keep deterministic ordering.

### Verify

```bash
bun run typecheck
bun run lint
```

---

## Phase 2: Implement Provider Replay Compilers

> **Goal**: Compile normalized replay model into provider-safe `UIMessage[]` for downstream conversion.
> **Dependencies**: Phase 1.
> **Can run in parallel with**: Anthropic and OpenAI compiler workstreams can run in parallel once interfaces are stable.

### Context to Load

- `app/api/chat/adapters/anthropic.ts`
- `app/api/chat/adapters/openai.ts`
- `lib/tools/provider.ts`

### Steps

1. Create compiler interface in `app/api/chat/replay/compilers/index.ts`:
   - `compileReplay(messages, providerId, context) => { messages, warnings, stats }`.

2. Implement `compilers/anthropic.ts`:
   - Accept normalized search tool exchanges only.
   - Convert to Anthropic-compatible replay tool output shape.
   - If conversion is impossible, drop tool replay part and preserve user-visible context via text fallback.

3. Implement `compilers/openai.ts`:
   - Preserve OpenAI atomic constraints (reasoning/tool/result integrity).
   - Never emit orphaned tool replay blocks.

4. Add strict output validation before returning compiled messages.

### Verify

```bash
bun run typecheck
bun run lint
```

---

## Phase 3: Integrate Without Breaking Current Adapters

> **Goal**: Introduce compiler path behind a feature flag, with safe fallback.
> **Dependencies**: Phase 2.
> **Can run in parallel with**: None (integration point).

### Context to Load

- `app/api/chat/route.ts`
- `app/api/chat/adapters/index.ts`
- `app/api/chat/utils.ts`

### Steps

1. Add replay compile orchestration in adapter pipeline:
   - Existing path remains default fallback.
   - New path: `normalize -> compile(provider) -> existing adapt finalization`.

2. Gate with `HISTORY_REPLAY_COMPILER_V1` constant/flag.

3. Add fail-safe:
   - if compile fails, emit warning log and fall back to current adapter path (do not fail request).

4. Keep behavior idempotent and side-effect free.

### Verify

```bash
bun run typecheck
bun run lint
```

Manual:
- replay a tool-heavy conversation with same provider.
- switch provider and verify no stream crash.

---

## Phase 4: Unit + Contract Tests (Must Pass Before Merge)

> **Goal**: Prevent regressions at schema and compiler boundaries.
> **Dependencies**: Phase 3.
> **Can run in parallel with**: Phase 5 test authoring can start in parallel after test harness setup.

### Context to Load

- `app/api/chat/adapters/__tests__/fixtures.ts`
- `app/api/chat/adapters/__tests__/cross-provider.test.ts`

### Steps

1. `normalize.test.ts`:
   - OpenAI object shape (`{ action, sources }`) -> normalized form.
   - Anthropic array shape -> normalized form.
   - malformed shape -> non-replayable warning, no throw.

2. `compilers.anthropic.test.ts`:
   - normalized search -> Anthropic valid tool replay.
   - unknown raw shape -> dropped safely + warning.

3. `compilers.openai.test.ts`:
   - reasoning/tool/result atomicity constraints.

### Verify

```bash
bun run test
bun run typecheck
bun run lint
```

---

## Phase 5: Cross-Provider Matrix + Incident Regression

> **Goal**: Guarantee this bug class is covered permanently.
> **Dependencies**: Phase 4.
> **Can run in parallel with**: None.

### Context to Load

- `app/api/chat/adapters/__tests__/cross-provider.test.ts`
- terminal incident payload from local logs (document as fixture)

### Steps

1. Add regression test fixture for:
   - source model: GPT-5.2
   - replay target: claude-opus-4-6
   - tool payload: `{ action, sources }`

2. Assert:
   - no validation exception from replay compile path.
   - compiled replay either converts tool payload correctly or drops it with warning and preserves text continuity.

3. Add matrix tests:
   - OpenAI -> Anthropic
   - Anthropic -> OpenAI
   - OpenAI -> Google (if compiler exists; otherwise expected fallback behavior assertion)

### Verify

```bash
bun run test
```

---

## Phase 6: Observability + Operational Safety

> **Goal**: Detect future replay-shape incompatibilities early.
> **Dependencies**: Phase 5.
> **Can run in parallel with**: None.

### Context to Load

- `app/api/chat/route.ts`
- existing `_tag: "history_adapt"` / `_tag: "replay_shape_error"` logs

### Steps

1. Emit structured logs:
   - `_tag: "history_replay_normalize"`
   - `_tag: "history_replay_compile"`
   - include `provider`, `model`, dropped counts, warning codes.

2. Emit metric/event on compiler fallback activation.

3. Add on-call actionable error signatures in logs.

4. Ensure no sensitive payload content is logged; only shape summaries.

### Verify

```bash
bun run typecheck
bun run lint
```

Manual:
- Trigger one forced fallback and verify logs are present and sanitized.

---

## Phase 7: Documentation + Hardening Exit Criteria

> **Goal**: Make the solution maintainable and safe for future provider additions.
> **Dependencies**: Phase 6.
> **Can run in parallel with**: None.

### Context to Load

- `.agents/context/decisions/004-provider-history-adapters.md`
- `.agents/context/troubleshooting/`

### Steps

1. Create ADR `005-provider-neutral-replay-compiler.md`:
   - decision, alternatives, migration notes.

2. Create troubleshooting guide:
   - symptom -> likely cause -> log tags -> remediation.

3. Add “new provider checklist” section:
   - implement normalizer mapping
   - implement compiler
   - add matrix tests

### Verify

- docs reviewed for technical correctness and paths.
- all referenced files exist.

---

## Security Checklist

- [ ] Never log API keys, tokens, or raw provider secrets.
- [ ] Runtime schemas reject unsafe payloads and fall back safely.
- [ ] No `// @ts-ignore` and no lint-rule suppression.
- [ ] Unknown tool payloads degrade gracefully, never crash replay.
- [ ] Feature flag provides immediate rollback to current path.

---

## Critical Implementation Patterns

### Replay-Normalize-Compile Pipeline

```typescript
// app/api/chat/replay/pipeline.ts (illustrative)
const normalized = normalizeHistory(messages)
const compiled = compileForProvider(normalized, provider, context)
return compiled.ok ? compiled.messages : fallbackToLegacyAdapters(messages)
```

### Fail-Safe Degradation

- If normalization fails for a tool payload, preserve text and citations.
- If compilation fails, emit structured warning and route to legacy adapter.
- Never fail user request solely due to replay migration path.

---

## Decision Gates

1. **Gate A (after Phase 2)**: keep fallback text synthesis or strict drop-only for non-replayable tools?
2. **Gate B (after Phase 5)**: enable flag for all users or canary cohort first?
3. **Gate C (after Phase 6)**: remove legacy adapter path now or after one week of clean telemetry?

---

## Architecture Reference

### Chosen Option: Option C-lite (Incremental)

- Preserve current adapter architecture.
- Add normalized replay layer and provider compilers in front.
- Gradually shift providers to compiler path.

### Alternatives Considered

- **Adapter-only patching**: fast but repeatedly brittle as tool payload schemas diverge.
- **Dual storage model**: more migration and storage complexity than needed.

### Comparison Matrix

| Dimension | Option C-lite | Adapter-only | Dual storage |
|-----------|---------------|--------------|--------------|
| Bug-class coverage | Strong | Medium | Strong |
| Migration risk | Medium | Low | High |
| Maintainability | Strong | Medium | Medium |
| Time to first fix | Medium | Fast | Slow |
| Long-term scalability | Strong | Weak | Medium |

---

*Plan produced 2026-02-13 for the Not A Wrapper codebase. Optimized for AI-agent execution with strict verification and rollback safety.*
