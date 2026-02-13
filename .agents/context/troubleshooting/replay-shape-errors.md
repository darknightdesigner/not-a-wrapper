# Replay Shape Errors Runbook

## Purpose

Use this runbook when chat requests fail during history replay, especially after provider switches (for example, OpenAI history replayed into Anthropic).

This guide covers:
- symptom patterns
- structured log tags
- likely root causes
- remediation steps

## Symptoms

Look for one or more of these runtime symptoms:

1. Stream starts, then fails with provider validation errors.
2. Error logs contain replay or tool pairing language.
3. Provider switch chats fail more often than same-provider follow-ups.
4. `history_adapt` logs show warning spikes or fallback activation.

Common error message fragments:
- OpenAI: `was provided without its required`
- OpenAI: `no tool output found for function call`
- Anthropic: `thinking block must be followed by`
- Anthropic: `tool_use block must be followed by tool_result`
- Google: `number of function response parts is equal to`
- Google: `missing a thought_signature`

## Log Tags to Filter

Search logs by `_tag`:

- `replay_shape_error`
  - Emitted when stream errors match known replay shape signatures.
  - Includes `provider`, `model`, `messageCount`, and `historyPartTypes`.
- `replay_normalize_stage`
  - Replay normalization summary.
  - Key fields: `warningCount`, `warningCodes`, `originalMessageCount`, `adaptedMessageCount`.
- `replay_compile_stage`
  - Replay compiler summary.
  - Key fields: `warningCount`, `warningCodes`, `fallbackActivated`, `fallbackCount`.
- `replay_compile_fallback_activated`
  - Compiler fallback path was activated.
- `replay_plaintext_fallback_activated`
  - OpenAI hardening fallback to plaintext transcript was activated.
- `history_adapt`
  - Full adaptation stats and warning code totals.

## Warning Codes to Interpret

Top-level adaptation warning codes:
- `replay_normalization_warning`
- `replay_compile_warning`
- `replay_compile_fallback`

Common replay normalization subcodes:
- `message_invalid`
- `part_invalid`
- `part_unsupported`
- `tool_non_replayable`
- `tool_malformed`

Common replay compile subcodes:
- `tool_non_replayable`
- `tool_dropped_invalid_role`
- `invariant_block_dropped`
- `invariant_reasoning_injected`
- `message_empty_fallback`
- `empty_message_fallback`
- `source_url_dropped`

## Symptom -> Likely Root Cause -> Remediation

### 1) Provider validation error + `replay_shape_error`

Likely root causes:
- Tool call and tool result blocks are not paired correctly for the target provider.
- Replay history includes provider-specific reasoning or response IDs that violate target invariants.

Remediation:
1. Confirm `history_adapt` exists for the same `chatId`.
2. Check `replay_compile_stage` for `fallbackActivated: true`.
3. If fallback is not activating during recurrent failures, verify replay compiler path is enabled and healthy.
4. For immediate user recovery, retry turn after reducing history depth or starting a fresh branch in chat.

### 2) High `replay_normalization_warning` counts

Likely root causes:
- Incoming history contains malformed or unsupported parts.
- Tool outputs are in a shape that normalizer cannot safely replay.

Remediation:
1. Inspect `warningCodes` in `replay_normalize_stage` to identify dominant subcode.
2. If `tool_malformed` or `part_invalid` spikes, capture sanitized sample payload shape and open incident for parser hardening.
3. If `tool_non_replayable` is expected for some tools, confirm text continuity still reaches model.

### 3) Frequent `replay_compile_fallback_activated`

Likely root causes:
- Target provider compiler cannot compile normalized shape for a subset of messages.
- New provider/tool behavior introduced without replay compiler parity.

Remediation:
1. Confirm user-facing reliability: fallback should keep request alive.
2. Quantify impact by provider/model using `_tag: "replay_compile_fallback_activated"`.
3. Create a follow-up task to add/adjust compiler mappings and expand matrix tests.

### 4) `replay_plaintext_fallback_activated` on OpenAI

Likely root causes:
- Post-conversion messages still contain provider-linked response IDs (`msg_`, `rs_`, `ws_`), which can break OpenAI follow-up pairing invariants.

Remediation:
1. Confirm fallback activations are isolated and requests complete successfully.
2. If activation rate climbs, investigate upstream adaptation and conversion steps for ID stripping regressions.
3. Keep plaintext fallback as safety rail during incident; do not disable without replacement.

## On-Call Checklist

- [ ] Confirm incident scope (provider, model, affected chat IDs, first seen time).
- [ ] Filter logs for `_tag: "replay_shape_error"` and capture exact error fragments.
- [ ] Review `_tag: "replay_normalize_stage"` warning counts and subcodes.
- [ ] Review `_tag: "replay_compile_stage"` for `fallbackActivated` and `fallbackCount`.
- [ ] Check whether `_tag: "replay_compile_fallback_activated"` is present (safety rail engaged).
- [ ] Check whether `_tag: "replay_plaintext_fallback_activated"` is present for OpenAI paths.
- [ ] Validate requests are degrading gracefully (no hard stream crash for most traffic).
- [ ] If hard failures persist, escalate with sanitized payload shape summary and dominant warning subcodes.
- [ ] Open follow-up issue for compiler/normalizer parity gaps and add matrix regression coverage.
- [ ] Close incident only after warning/fallback rates return to baseline.

## Escalation Notes

Include in incident handoff:
- affected `provider` and `model`
- top `_tag` events and counts
- dominant warning subcodes
- whether fallback paths preserved user response continuity
- sanitized shape summary (never include raw secrets or full sensitive payloads)

