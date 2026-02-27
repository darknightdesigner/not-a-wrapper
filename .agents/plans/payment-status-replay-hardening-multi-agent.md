# Payment Status + Replay Hardening — Multi-Agent Execution Guide

> **Status**: Implemented (All 8 phases complete)
> **Decision**: Option C — Canonical payment state ledger + intent policy guardrails + replay safety boundaries
> **Priority**: P0 — Prevents repeat side-effect incidents across edit/resend and model switches
> **Timeline**: Not estimated (8 phases + compatibility/backfill phase)
> **Date**: 2026-02-27 | Revised: 2026-02-27

---

## How to Use This Plan

This plan is designed for parallel execution by multiple coding agents, then a single integration pass.

- Execute phases in order unless a phase explicitly states parallel-safe execution.
- Each phase includes its own context, steps, verification, and rollback guidance.
- Keep diffs minimal and focused; do not introduce new dependencies.
- Treat schema, persistence, and tool policy changes as high-risk; stop at decision gates when indicated.

**Recommended agent split (max 4 in parallel):**

- **Agent A (State Ledger)**: Convex schema/functions and persistence contracts.
- **Agent B (Intent Guardrails)**: status intent detection and tool allow/deny policy.
- **Agent C (Replay Safety)**: replay compiler safety boundaries and regression coverage.
- **Agent D (Client Consistency)**: edit/resend + model-switch version consistency.

**Permission notes (per `AGENTS.md`):**

- Editing `convex/schema.ts` requires explicit user approval before execution.
- No dependency changes (`package.json`) in this plan.
- No auth-path changes are required.

**Pre-flight context requirement (do before Phase 0 execution):**

- Load and align with existing replay architecture plans:
  - `.agents/plans/provider-neutral-replay-compiler.md`
  - `.agents/plans/provider-aware-history-adaptation.md`
- Reuse existing replay compiler and adapter test matrix; do not create a parallel replay framework.

---

## Critical Existing Context (Must Incorporate)

1. Replay compiler and cross-provider tests already exist in production code paths (`app/api/chat/replay/*`, `app/api/chat/adapters/*`).
2. Current replay normalization marks non-`web_search` tools non-replayable; payment continuity cannot depend on replayed tool blocks.
3. `toolCallLog.toolName` currently stores display names (e.g., "Purchase"), not canonical tool keys (`pay_purchase`), which weakens deterministic backfill.
4. Convex writes can experience optimistic concurrency retries; all new payment-state writes must be idempotent.
5. Existing chats will not have canonical `chatToolState`; compatibility and lazy backfill are mandatory for safe rollout.

---

## Decision Summary

Implement a dual-track architecture:

1. **Canonical business/tool state** for payment job continuity (independent of model replay format).
2. **Provider-safe replay pipeline** for cross-provider history compatibility.

This addresses both root-cause classes:

- replay-shape failures (Anthropic/OpenAI invariants),
- incorrect side-effect tool selection (`pay_purchase` on status intent).

**Why this approach**:

- Deterministic behavior for side-effect tools.
- Compatible with existing adapter/replay architecture.
- Maintains model flexibility while moving policy-critical logic server-side.

**Evolution path**:

- **v1 (this plan):** payment-focused canonical state + policy guardrails.
- **v1.1:** extend same pattern to other side-effect tools.
- **v2:** generalized tool session/state framework across all platform actions.

---

## Option Analysis

| Dimension | Option A: Prompt-only steering | Option B: Replay-only hardening | Option C: State + policy + replay (Chosen) |
|-----------|-------------------------------|----------------------------------|---------------------------------------------|
| Fixes provider replay errors | Partial | Strong | Strong |
| Prevents wrong side-effect tool choice | Weak | Weak | Strong |
| Resilience to edit/resend + model switch | Weak | Medium | Strong |
| Long-term maintainability | Medium | Medium | Strong |
| Complexity | Low | Medium | Medium-High |

---

## Constants Reference

Add to `lib/config.ts`:

```typescript
export const PAYMENT_STATUS_GUARDRAILS_V1 =
  process.env.PAYMENT_STATUS_GUARDRAILS_V1 === "1" ||
  process.env.PAYMENT_STATUS_GUARDRAILS_V1 === "true"

export const PAYMENT_CHAT_STATE_V1 =
  process.env.PAYMENT_CHAT_STATE_V1 === "1" ||
  process.env.PAYMENT_CHAT_STATE_V1 === "true"

// "observe" = evaluate/log only, "enforce" = block disallowed tools.
export const PAYMENT_GUARDRAIL_MODE =
  (process.env.PAYMENT_GUARDRAIL_MODE as "observe" | "enforce" | undefined) ??
  "observe"

// Enables compatibility hydration for legacy chats without canonical state.
export const PAYMENT_CHAT_STATE_BACKFILL_V1 =
  process.env.PAYMENT_CHAT_STATE_BACKFILL_V1 === "1" ||
  process.env.PAYMENT_CHAT_STATE_BACKFILL_V1 === "true"
```

---

## Schema Reference

Decision gate required before applying.

Add to `convex/schema.ts`:

```typescript
chatToolState: defineTable({
  chatId: v.id("chats"),
  userId: v.id("users"),
  // monotonic chat-local version used for edit/resend truncation safety
  chatVersion: v.number(),
  activePurchaseJobId: v.optional(v.string()),
  latestPurchaseJobId: v.optional(v.string()),
  latestPurchaseUrl: v.optional(v.string()),
  latestStatus: v.optional(v.string()),
  latestStatusIsTerminal: v.optional(v.boolean()),
  sourceMessageTimestamp: v.optional(v.number()),
  // Idempotency/correlation fields for OCC-safe writes.
  lastMutationKey: v.optional(v.string()),
  lastToolCallId: v.optional(v.string()),
  lastRequestId: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index("by_chat", ["chatId"])
  .index("by_user_chat", ["userId", "chatId"]),
```

---

## File Map

| Phase | File | Action |
|------|------|--------|
| 0 | `.agents/plans/payment-status-replay-hardening-multi-agent.md` | Update — decision gate outcomes |
| 1 | `convex/schema.ts` | Modify — add `chatToolState` (**Ask First**) |
| 1 | `convex/chatToolState.ts` | Create — state query/mutation API |
| 1 | `convex/messages.ts` | Modify — optional version bump hook on truncation |
| 1B | `convex/chatToolStateBackfill.ts` | Create — lazy/explicit backfill for legacy chats |
| 2 | `app/api/chat/intent/payment-intent.ts` | Create — status/purchase intent classifier |
| 2 | `lib/tools/capability-policy.ts` | Modify — request-scoped tool allow/deny |
| 3 | `app/api/chat/route.ts` | Modify — enforce intent/state-driven active tools |
| 3 | `lib/tools/platform.ts` | Modify — hard block disallowed `pay_purchase` turns |
| 3 | `app/api/chat/adapters/index.ts` | Modify — preserve single replay pipeline, add continuity hooks only |
| 4 | `app/api/chat/replay/normalize.ts` | Modify — explicit non-replayable summaries for platform tools |
| 4 | `app/api/chat/replay/compilers/anthropic.ts` | Modify — deterministic fallback behavior for dropped tool context |
| 4 | `app/api/chat/replay/compilers/openai.ts` | Modify — preserve continuity text when dropping incompatible blocks |
| 5 | `app/components/chat/use-chat-edit.ts` | Modify — persist and propagate `chatVersion` semantics |
| 5 | `app/components/chat/use-chat-core.ts` | Modify — include version context in send/onFinish lifecycle |
| 6 | `convex/toolCallLog.ts` | Modify — add policy decision metadata to logs |
| 6 | `convex/schema.ts` | Modify — optional `toolKey` field in `toolCallLog` (**Ask First**) |
| 6 | `app/api/chat/route.ts` | Modify — add structured replay/policy/state observability tags |
| 7 | `app/api/chat/replay/__tests__/matrix.test.ts` | Modify — incident regression assertions |
| 7 | `app/api/chat/adapters/__tests__/cross-provider.test.ts` | Modify — side-effect continuity cases |
| 7 | `lib/tools/__tests__/route-policy-integration.test.ts` | Modify — status intent blocks purchase |
| 7 | `lib/tools/__tests__/platform.test.ts` | Modify — platform guardrail tests |
| 7 | `app/components/chat/__tests__/edit-switch-consistency.test.ts` | Create — edit/model-switch consistency |

---

## Phase 0: Contract Freeze + Acceptance Criteria

> **Goal**: Lock cross-team contracts so parallel workstreams do not conflict.
> **Dependencies**: None.
> **Can run in parallel with**: None.

### Context to Load

- `app/api/chat/route.ts`
- `lib/tools/platform.ts`
- `app/api/chat/replay/normalize.ts`
- `app/components/chat/use-chat-core.ts`
- `app/components/chat/use-chat-edit.ts`

### Steps

1. Define canonical invariants:
   - Status-intent turn must not execute `pay_purchase` when an active job exists.
   - Replay incompatibility must never trigger side effects.
   - Edit truncation must not leave stale payment state active.
2. Document acceptance checks in this plan (see Phase 7 checklist).
3. Freeze payload contracts for `chatToolState` and policy metadata keys.

### Verify

- Team agrees on invariants and contract field names.
- No implementation starts before this is settled.

### Decision Gate

**Gate A — Schema approval**: approve `chatToolState` addition before Phase 1 execution.

---

## Phase 1: Canonical Payment State Ledger (Agent A)

> **Goal**: Persist authoritative per-chat payment job state independent of replay format.
> **Dependencies**: Phase 0.
> **Permission**: `convex/schema.ts` modification requires explicit user approval.
> **Can run in parallel with**: Phase 2 (after shared type contract is finalized).

### Context to Load

- `convex/schema.ts`
- `convex/messages.ts`
- `convex/toolCallLog.ts`

### Steps

1. Add `chatToolState` table and indexes.
2. Create `convex/chatToolState.ts` with:
   - `getByChat(chatId)`
   - `upsertFromPurchase(chatId, jobId, url, chatVersion, sourceMessageTimestamp)`
   - `upsertFromStatus(chatId, jobId, status, isTerminal, chatVersion)`
   - `truncateFromVersion(chatId, minVersion)` or equivalent rollback mutation.
3. Ensure ownership checks follow Convex auth pattern.
4. Make writes idempotent:
   - use `lastMutationKey` (e.g., `requestId:toolCallId:eventType`) and ignore duplicate updates.
5. Wire mutations from trusted server paths only (route/tool layer).

### Verify

```bash
bunx convex codegen
bun run typecheck
bun run lint
```

Rollback:

- If schema deployment fails, revert `chatToolState` references and disable `PAYMENT_CHAT_STATE_V1`.

---

## Phase 1B: Legacy Compatibility + Backfill (Agent A)

> **Goal**: Ensure existing chats without canonical state still behave correctly.
> **Dependencies**: Phase 1.
> **Can run in parallel with**: Phase 2.

### Context to Load

- `convex/toolCallLog.ts`
- `convex/messages.ts`
- `convex/chatToolState.ts`

### Steps

1. Create compatibility backfill logic:
   - `hydrateFromToolCallLog(chatId)` using most recent platform tool entries.
   - If not available, derive best-effort fallback from assistant text only in observe mode.
2. Add lazy hydration:
   - first route read of missing `chatToolState` triggers safe backfill write when `PAYMENT_CHAT_STATE_BACKFILL_V1` is enabled.
3. Record hydration provenance (`lastMutationKey` prefix `backfill:`) for auditability.
4. Keep behavior fail-safe:
   - if backfill cannot determine active job, status intent must not auto-trigger `pay_purchase`.

### Verify

```bash
bunx convex codegen
bun run typecheck
bun run lint
```

Rollback:

- Disable `PAYMENT_CHAT_STATE_BACKFILL_V1` and continue with observe-only policy mode.

---

## Phase 2: Intent Policy Engine (Agent B)

> **Goal**: Create deterministic status/purchase intent policy independent of model choice.
> **Dependencies**: Phase 0.
> **Can run in parallel with**: Phase 1B.

### Context to Load

- `lib/tools/capability-policy.ts`
- `lib/tools/types.ts`
- `lib/tools/platform.ts`

### Steps

1. Add `payment-intent.ts` helper:
   - classify `status_check`, `new_purchase`, `unknown`.
2. Extend policy resolution with request-scoped overrides:
   - `denyTools: string[]`, `allowTools: string[]`.
3. Add policy reason codes:
   - `status_intent_requires_pay_status`
   - `status_intent_blocks_pay_purchase`
   - `no_active_job_blocks_status`
4. Keep default behavior unchanged when feature flag off.
5. Add explicit policy mode behavior:
   - `observe`: compute policy, log decisions, do not block.
   - `enforce`: block disallowed side-effect calls.

### Verify

```bash
bun run typecheck
bun run lint
```

Rollback:

- If classifier quality is poor, keep policy in observe-only mode behind flag.

---

## Phase 3: Route + Tool Guardrail Integration (Agents A+B, sequential merge)

> **Goal**: Enforce payment intent/state policy at runtime before tool execution.
> **Dependencies**: Phases 1, 1B, and 2.
> **Can run in parallel with**: Phase 4 can begin after route contracts are stable.

### Context to Load

- `app/api/chat/route.ts`
- `lib/tools/platform.ts`
- `convex/chatToolState.ts`

### Steps

1. In route pre-stream path:
   - load `chatToolState` for `chatId`.
   - classify intent from latest user text.
   - compute request-scoped tool policy.
2. Restrict `activeTools`/step policy accordingly.
3. In `pay_purchase` tool wrapper, enforce hard guard:
   - if route policy denies purchase this turn, throw typed tool error (no side effects).
4. On successful `pay_purchase`/`pay_status`, update `chatToolState` with idempotency keys.
5. Preserve single replay entrypoint:
   - use existing `adaptHistoryForProvider()` pipeline;
   - do not introduce a second replay adaptation path.

### Verify

```bash
bun run typecheck
bun run lint
```

Manual:

- status intent with active job => only `pay_status`.
- status intent without active job => no `pay_purchase`.

Rollback:

- Disable `PAYMENT_STATUS_GUARDRAILS_V1` to return to existing policy behavior.
- If needed, switch `PAYMENT_GUARDRAIL_MODE` to `observe` without disabling telemetry.

---

## Phase 4: Replay Safety Boundary Refinement (Agent C)

> **Goal**: Keep replay robust while preserving continuity summaries for non-replayable side-effect tools.
> **Dependencies**: Phase 0.
> **Can run in parallel with**: Phase 5.

### Context to Load

- `app/api/chat/replay/normalize.ts`
- `app/api/chat/replay/compilers/openai.ts`
- `app/api/chat/replay/compilers/anthropic.ts`
- `app/api/chat/adapters/index.ts`

### Steps

1. Normalize platform tool artifacts into explicit continuity summary parts (non-executable).
2. Ensure compilers never reconstruct executable `pay_purchase` replay from history.
3. Preserve user-visible context (job IDs/status text) even when structured tool replay is dropped.
4. Keep compiler fallback behavior deterministic and fully logged.
5. Keep compatibility with existing replay tests and warning codes (no new incompatible warning taxonomy).

### Verify

```bash
bun run typecheck
bun run lint
```

Rollback:

- Revert to previous compiler behavior with feature flag and retain structured warnings.

---

## Phase 5: Edit/Resend + Model Switch Version Safety (Agent D)

> **Goal**: Prevent stale or branched state after edit truncation and model-switch retries.
> **Dependencies**: Phase 1 contracts.
> **Can run in parallel with**: Phase 4.

### Context to Load

- `app/components/chat/use-chat-edit.ts`
- `app/components/chat/use-chat-core.ts`
- `convex/messages.ts`
- `convex/chatToolState.ts`

### Steps

1. Introduce `chatVersion` propagation in send/edit paths.
2. On `deleteFromTimestamp`, ensure version-aware rollback for `chatToolState`.
3. Persist version with tool-state updates and reject stale writes.
4. Keep optimistic UI behavior unchanged for user-facing latency.

### Verify

```bash
bun run typecheck
bun run lint
```

Manual:

- purchase -> status error -> edit -> switch model -> retry status: state remains consistent.

Rollback:

- Disable version enforcement with flag while retaining state reads.

---

## Phase 6: Observability + Incident Forensics (Agent C or A)

> **Goal**: Make future incidents diagnosable without deep log archaeology.
> **Dependencies**: Phases 3–5.
> **Can run in parallel with**: Phase 7 test authoring.

### Context to Load

- `app/api/chat/route.ts`
- `convex/toolCallLog.ts`

### Steps

1. Add structured tags:
   - `payment_intent_policy`
   - `payment_state_read`
   - `payment_state_write`
   - `payment_guardrail_block`
2. Extend `toolCallLog` metadata with:
   - `intentClass`
   - `policyDecision`
   - `chatVersion`
   - `toolKey` (canonical key like `pay_purchase` / `pay_status`, distinct from display name)
   - `stateMutationKey`
3. Ensure no sensitive payload logging.

### Verify

```bash
bun run typecheck
bun run lint
```

Rollback:

- Keep new fields optional; remove only emitters if needed.

---

## Phase 7: Regression + Matrix Testing (All agents, parallel test ownership)

> **Goal**: Permanently guard against this incident class.
> **Dependencies**: Phases 3–6.

### Context to Load

- `app/api/chat/replay/__tests__/matrix.test.ts`
- `app/api/chat/adapters/__tests__/cross-provider.test.ts`
- `lib/tools/__tests__/route-policy-integration.test.ts`
- `lib/tools/__tests__/platform.test.ts`

### Test Scenarios (must all pass)

- [ ] Status intent with active job calls `pay_status` exactly once.
- [ ] Status intent never executes `pay_purchase` unless explicit “new purchase”.
- [ ] Opus-style replay-shape failure does not produce side effects.
- [ ] Opus -> GPT switch preserves canonical payment continuity.
- [ ] Edit/resend truncation invalidates stale payment state branches.
- [ ] Compiler fallback path logs structured warning and remains side-effect safe.
- [ ] Legacy chat with no `chatToolState` still routes status intent safely (no accidental purchase).
- [ ] Idempotent duplicate writes (same `requestId`/`toolCallId`) do not corrupt canonical state.

### Verify

```bash
bun run test
bun run typecheck
bun run lint
```

---

## Phase 8: Rollout Strategy + Runbook

> **Goal**: Safe production rollout with quick rollback controls.
> **Dependencies**: Phase 7.

### Steps

1. Rollout order:
   - enable observe-only policy logs,
   - enable hard guardrails for a canary cohort,
   - enable globally after stable metrics.
2. Create runbook entry in `.agents/troubleshooting/`:
   - symptom -> log tags -> likely root cause -> rollback flag.
3. Define SLO monitors:
   - rate of `payment_guardrail_block`,
   - rate of replay compile fallback,
   - rate of status-intent tool mismatch.
   - rate of missing-state lazy backfills and backfill failures.

### Decision Gate

**Gate B — Hard enforcement**: proceed from observe-only to blocking mode.
**Gate C — Backfill confidence**: backfill failure rate acceptable before global enforcement.

---

## Critical Path

`Phase 0 -> Phase 1 -> Phase 1B -> Phase 3 -> Phase 7 -> Phase 8`

Fast-track parallel lanes:

- `Phase 2` parallel with `Phase 1`
- `Phase 4` parallel with `Phase 5`
- `Phase 6` parallel with early `Phase 7` test writing

---

## Security Checklist

- [ ] Ownership checks enforced for all new state mutations.
- [ ] No secrets or raw tool payloads logged.
- [ ] Side-effect tools require policy allow and current `chatVersion`.
- [ ] Feature flags gate all new behavior for rollback.
- [ ] No `// @ts-ignore` or lint bypasses.

---

## Architecture Reference

### Current State Risks

- Replay safety and business continuity are coupled.
- Side-effect tool selection relies too heavily on model compliance.
- Edit/model-switch flows can invalidate assumptions without a canonical state channel.

### Target State

- Replay compilers handle provider shape compatibility only.
- Canonical payment state drives status/purchase policy deterministically.
- Version-aware state updates keep edit/resend and model-switch safe.

---

*Plan produced on 2026-02-27 for multi-agent execution in Not A Wrapper, based on incident reconstruction for `jd7897yd860z63dw588qgq29m581xdjv` and existing replay compiler architecture.*

