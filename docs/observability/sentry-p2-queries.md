# Sentry P2 Query Pack

Use environment filter `environment:production` unless debugging non-prod.

## 1) `/api/chat` Error Rate

- Dataset: `errors + transactions` (metric alert formula)
- Numerator query:
  - `event.type:error tags[route]:api/chat`
- Denominator query:
  - `event.type:transaction transaction:"POST /api/chat"`
- Formula:
  - `error_rate = A / B`
- Threshold:
  - critical `> 0.01` for 10m
  - warning `> 0.005` for 10m

## 2) `/api/chat` P95 Duration

- Dataset: transactions
- Query:
  - `event.type:transaction transaction:"POST /api/chat"`
- Aggregate:
  - `p95(transaction.duration)`
- Threshold:
  - critical `> 8000` ms for 15m
  - warning `> 6000` ms for 15m

## 3) Provider/Model Failure Rate

- Dataset: errors + transactions
- Numerator query:
  - `event.type:error tags[route]:api/chat tags[chat_provider]:$PROVIDER tags[chat_model]:$MODEL`
- Denominator query:
  - `event.type:transaction transaction:"POST /api/chat" tags[chat_provider]:$PROVIDER tags[chat_model]:$MODEL`
- Formula:
  - `provider_model_error_rate = A / B`
- Threshold:
  - critical `> 0.03` for 15m
  - warning `> 0.015` for 15m

## 4) Tool Failure + Timeout Rate

- Dataset: errors + transactions
- Numerator query:
  - `event.type:error tags[route]:api/chat (tags[chat_error_type]:tool_timeout OR tags[chat_error_type]:tool_execution OR tags[chat_tool_outcome]:timeout OR tags[chat_tool_outcome]:failure OR tags[chat_tool_outcome]:budget_denied)`
- Denominator query:
  - `event.type:transaction transaction:"POST /api/chat" tags[chat_tool_outcome]:!none`
- Formula:
  - `tool_failure_timeout_rate = A / B`
- Threshold:
  - critical `> 0.03` for 15m
  - warning `> 0.015` for 15m

## 5) Token Usage / Cost Anomaly

Use AI spans from Vercel AI integration.

- Dataset: spans
- Base query:
  - `event.type:span span.op:gen_ai.stream_text tags[route]:api/chat`
- Aggregates:
  - `p95(span.data.gen_ai.usage.input_tokens)`
  - `p95(span.data.gen_ai.usage.output_tokens)`
  - `avg(span.data.gen_ai.usage.output_tokens/span.data.gen_ai.usage.input_tokens)`
- Alerting heuristic:
  - trigger when p95 input or output tokens is `> 2x` trailing 24h median
  - trigger when output/input ratio shifts `> 50%` from trailing 24h median

## 6) Release Regression Guardrails

- Error regression query:
  - `event.type:error tags[route]:api/chat release:$RELEASE`
- Latency regression query:
  - `event.type:transaction transaction:"POST /api/chat" release:$RELEASE`
- Compare against:
  - `release:$BASELINE_RELEASE`
- Guardrails:
  - error rate increase `> 0.5pp`
  - p95 latency increase `> 25%`

## Drill-down Query Filters

Use these filters for rapid segmentation:

- Anonymous traffic:
  - `tags[chat_is_authenticated]:false`
- Authenticated traffic:
  - `tags[chat_is_authenticated]:true`
- Timeout-heavy failures:
  - `tags[chat_error_type]:tool_timeout OR tags[chat_tool_outcome]:timeout`
- Budget-denied tools:
  - `tags[chat_tool_outcome]:budget_denied`
- Slow path:
  - `message:"chat_slow_request" tags[route]:api/chat`

