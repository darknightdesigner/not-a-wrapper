# Sentry P2 Alerts and Runbook

## Alert Set

Production alerts to create:

1. `/api/chat` error rate high
2. `/api/chat` p95 latency high
3. provider/model failure rate high
4. tool timeout/failure rate high
5. token usage anomaly
6. release regression (error + latency deltas)

Machine-readable templates are in `docs/observability/sentry-p2-alerts.json`.

## Provisioning via API

If credentials are available:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG_SLUG`
- `SENTRY_PROJECT_SLUG`

Create alerts using:

```bash
curl -X POST "https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}/alert-rules/" \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @docs/observability/sentry-p2-alerts.json
```

If your Sentry plan/API requires one rule per request, split the JSON array and POST each entry.

Idempotent upsert workflow (template):

```bash
RULE_ID="chat-error-rate-high"
EXISTING=$(curl -s "https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}/alert-rules/" \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}")

echo "${EXISTING}" | jq -e ".[] | select(.name == \"P2 Chat Error Rate High\")" >/dev/null \
  || jq ".alerts[] | select(.id == \"${RULE_ID}\")" docs/observability/sentry-p2-alerts.json \
    | curl -X POST "https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}/alert-rules/" \
      -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      --data-binary @-
```

## Triage Playbooks

### Playbook: High Error Rate

1. Open alert issue and confirm:
   - `tags[route]:api/chat`
   - `environment:production`
2. Break down by:
   - `chat_error_type`
   - `chat_provider`
   - `chat_model`
   - `chat_is_authenticated`
3. If concentrated on one provider/model:
   - treat as provider incident candidate
4. Validate release impact:
   - compare current `release` vs previous stable release
5. Mitigation options:
   - temporary provider/model denylist routing
   - reduce tool surface for impacted segment
   - rollback release if broad regression

### Playbook: Latency Spike

1. Confirm transaction metric:
   - `event.type:transaction transaction:"POST /api/chat"`
2. Compare p95 by dimensions:
   - `chat_provider`, `chat_model`, `chat_tool_outcome`
3. Inspect slow warnings:
   - `message:"chat_slow_request" tags[route]:api/chat`
4. Validate first-token vs total latency split:
   - first-token increase implies provider/network/model queuing
   - total-only increase implies tool fanout or long generation tails
5. Mitigation options:
   - lower max step count or tool breadth for affected segment
   - shift traffic off degraded provider/model

### Playbook: Provider Outage

1. Filter errors:
   - `tags[chat_error_type]:provider_api tags[route]:api/chat`
2. Group by:
   - `chat_provider`
   - `chat_model`
3. Confirm with latency and timeout data:
   - p95 transaction duration
   - tool outcome and finish reason shifts
4. Mitigation:
   - fail over to healthy provider/model
   - disable affected model temporarily
   - publish status update

### Playbook: Tool Failures/Timeouts

1. Filter:
   - `tags[chat_tool_outcome]:timeout OR tags[chat_tool_outcome]:failure OR tags[chat_tool_outcome]:budget_denied`
2. Correlate with error type:
   - `tags[chat_error_type]:tool_timeout|tool_execution`
3. Inspect tool logs / spans for:
   - timeout concentration
   - budget-denied spikes
4. Mitigation:
   - tighten tool selection/policy
   - reduce expensive tool retries
   - quarantine failing external tools

### Playbook: Release Regression

1. Compare `release:$NEW` vs `release:$BASELINE` for:
   - error rate
   - p95 duration
   - provider/model segments
2. If guardrail exceeded:
   - rollback or canary halt
3. Validate post-mitigation:
   - return to baseline thresholds for 30-60 minutes

