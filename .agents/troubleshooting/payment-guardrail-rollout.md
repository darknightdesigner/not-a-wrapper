# Payment Guardrail Rollout Runbook

## Purpose

Use this runbook when operating the payment status + replay hardening feature flags, diagnosing guardrail-related incidents, or evaluating readiness for enforcement escalation.

This guide covers:
- rollout order and feature flag controls
- symptom patterns and log tags
- likely root causes and remediation
- decision gates for enforcement escalation

## Feature Flags

| Flag | Values | Purpose |
|------|--------|---------|
| `PAYMENT_STATUS_GUARDRAILS_V1` | `"1"` / `"true"` to enable | Master switch for intent classification + tool policy |
| `PAYMENT_CHAT_STATE_V1` | `"1"` / `"true"` to enable | Canonical `chatToolState` ledger reads/writes |
| `PAYMENT_GUARDRAIL_MODE` | `"observe"` (default) / `"enforce"` | Observe logs only; enforce removes denied tools |
| `PAYMENT_CHAT_STATE_BACKFILL_V1` | `"1"` / `"true"` to enable | Legacy chat lazy backfill from `toolCallLog` |

## Rollout Order

### Stage 1: Observe-Only (Low Risk)

Enable logging without blocking any tool calls.

```env
PAYMENT_STATUS_GUARDRAILS_V1=1
PAYMENT_CHAT_STATE_V1=1
PAYMENT_GUARDRAIL_MODE=observe
PAYMENT_CHAT_STATE_BACKFILL_V1=0
```

Monitor for 48+ hours. Confirm:
- [ ] `payment_intent_classified` logs appear with expected intent distributions.
- [ ] `payment_policy_decision` logs show correct allow/deny reasoning.
- [ ] No unexpected errors in chat streaming.
- [ ] `chatToolState` rows are created for new payment tool calls.

### Stage 2: Observe + Backfill (Medium Risk)

Enable lazy backfill for legacy chats.

```env
PAYMENT_CHAT_STATE_BACKFILL_V1=1
```

Monitor for 24+ hours. Confirm:
- [ ] Backfill creates state rows for legacy chats on first payment interaction.
- [ ] Backfill does not create state that incorrectly enables `pay_purchase`.
- [ ] No increase in error rates for legacy chats.

### Stage 3: Enforce for Canary (High Risk — Gate B)

Enable hard guardrails for a canary cohort.

```env
PAYMENT_GUARDRAIL_MODE=enforce
```

Deploy to canary/staging first. Confirm:
- [ ] `pay_purchase` is removed from tool list when intent is `status_check`.
- [ ] `pay_purchase` remains available when intent is `new_purchase` and no active job exists.
- [ ] Users can still complete legitimate purchase flows.
- [ ] `payment_guardrail_block` rate is within expected bounds.

### Stage 4: Global Enforcement (Gate B + Gate C)

Roll out globally after stable canary metrics.

**Gate B — Hard enforcement**: Canary `payment_guardrail_block` rate is stable, no false-positive reports.
**Gate C — Backfill confidence**: Backfill failure rate < 1% of legacy chat payment interactions.

## Log Tags to Filter

Search logs by tag or key:

- `payment_intent_classified`
  - Emitted after intent classification for every chat request with payment tools.
  - Key fields: `intentClass`, `hasActiveJob`, `latestStatus`, `isTerminal`.
- `payment_policy_decision`
  - Emitted after policy override computation.
  - Key fields: `denyTools`, `allowTools`, `reason`, `mode` (`observe` / `enforce`).
- `payment_guardrail_block`
  - Emitted when enforce mode removes a tool from the request.
  - Key fields: `toolName`, `intentClass`, `reason`.
- `payment_state_upsert`
  - Emitted when `chatToolState` is created or updated.
  - Key fields: `chatId`, `chatVersion`, `activePurchaseJobId`, `latestStatus`.
- `payment_backfill_attempt`
  - Emitted when lazy backfill runs for a legacy chat.
  - Key fields: `chatId`, `toolCallLogCount`, `success`.
- `payment_purchase_blocked_execute`
  - Emitted by defense-in-depth `isPurchaseBlocked` callback at tool execution time.
  - Key fields: `chatId`, `toolCallId`.

## Symptom -> Likely Root Cause -> Remediation

### 1) User cannot initiate a new purchase (false positive block)

Symptoms:
- User reports `pay_purchase` tool is unavailable.
- `payment_guardrail_block` logs show `reason: "active_job_exists"` or `reason: "status_check_intent"`.

Likely root causes:
- `chatToolState` has a stale `activePurchaseJobId` from a previous (completed) purchase that was not marked terminal.
- Intent classifier misclassified `new_purchase` as `status_check` due to keyword overlap.

Remediation:
1. Check `chatToolState` for the affected `chatId`: is `latestStatusIsTerminal` set correctly?
2. If stale state, user can start a new chat or edit a message to trigger `truncateFromVersion`.
3. If intent misclassification, capture the user message text and add a regression test case.

Rollback: Set `PAYMENT_GUARDRAIL_MODE=observe` to stop blocking while investigating.

### 2) Duplicate purchase triggered on edit/resend

Symptoms:
- User edits a message and a new `pay_purchase` call fires when only status was intended.
- `payment_intent_classified` shows `intentClass: "new_purchase"` for what should have been a status check.

Likely root causes:
- `chatToolState` was truncated by the edit (correct behavior) but the new message didn't contain status keywords.
- Backfill failed silently, so the edit started with no state context.

Remediation:
1. Check `payment_backfill_attempt` logs for the chat.
2. Verify `chatVersion` in the request body matches expected message count.
3. If backfill gap, investigate `toolCallLog` entries for the chat.

Rollback: Set `PAYMENT_STATUS_GUARDRAILS_V1=0` to fully disable.

### 3) Replay continuity summary missing after model switch

Symptoms:
- After switching providers, the model has no context about prior payment state.
- `replay_compile_stage` shows platform tool blocks were dropped without continuity text.

Likely root causes:
- `platformToolContext` was not populated during normalization (tool name not in `PLATFORM_PAYMENT_TOOLS` set).
- Compiler `synthesizePlatformToolFallback` path not reached.

Remediation:
1. Check `replay_normalize_stage` for `tool_non_replayable` warnings on payment tools.
2. Verify the tool name in `toolCallLog` matches an entry in `PLATFORM_PAYMENT_TOOLS`.
3. Add missing tool name variant and expand matrix test coverage.

### 4) High backfill failure rate

Symptoms:
- `payment_backfill_attempt` logs show `success: false` for many legacy chats.
- Legacy chats don't get guardrail protection.

Likely root causes:
- `toolCallLog.outputPreview` doesn't contain parseable JSON for `jobId` extraction.
- Tool names in `toolCallLog` don't match expected payment tool name patterns.

Remediation:
1. Sample failed backfill chats and inspect their `toolCallLog` entries.
2. If `outputPreview` format changed, update the backfill parser.
3. If tool names diverged, expand the `BACKFILL_TOOL_NAMES` set in `chatToolStateBackfill.ts`.

Rollback: Set `PAYMENT_CHAT_STATE_BACKFILL_V1=0` to disable backfill only.

## SLO Monitors

| Metric | Source Tag | Threshold | Action |
|--------|-----------|-----------|--------|
| Guardrail block rate | `payment_guardrail_block` | < 5% of payment-tool requests | Investigate false positives if exceeded |
| Replay compile fallback rate | `replay_compile_fallback_activated` (payment tools) | < 2% of cross-provider replays | Verify continuity summaries are generating |
| Status-intent tool mismatch | `payment_policy_decision` where `intentClass` != expected | < 1% of classified requests | Add regression test cases |
| Backfill failure rate | `payment_backfill_attempt` with `success: false` | < 1% of legacy chat interactions | Expand parser or disable backfill |
| Defense-in-depth block rate | `payment_purchase_blocked_execute` | Should be ~0 in enforce mode | If nonzero, primary policy layer has a gap |

## On-Call Checklist

- [ ] Confirm incident scope (affected chat IDs, user IDs, first seen time).
- [ ] Check current feature flag values in environment.
- [ ] Filter logs for `payment_intent_classified` and `payment_policy_decision` for affected chats.
- [ ] Check `chatToolState` records for stale or missing state.
- [ ] If false positive blocks: set `PAYMENT_GUARDRAIL_MODE=observe` immediately.
- [ ] If duplicate purchases: set `PAYMENT_STATUS_GUARDRAILS_V1=0` and investigate.
- [ ] Verify `chatVersion` values in request bodies match expected message counts.
- [ ] Check `payment_backfill_attempt` logs if legacy chats are affected.
- [ ] Validate replay continuity is working via `replay_compile_stage` logs.
- [ ] Open follow-up for any classifier or backfill parser improvements needed.

## Escalation Notes

Include in incident handoff:
- affected `chatId` values and user scope
- current feature flag configuration
- top log tags and counts
- whether observe or enforce mode was active
- `chatToolState` snapshots for affected chats (redact user PII)
- sanitized intent classification inputs (never include raw API keys or full payloads)
