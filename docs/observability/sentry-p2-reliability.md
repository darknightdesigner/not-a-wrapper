# Sentry P2 Reliability Package

## Scope

This document defines the P2 reliability baseline for `not-a-wrapper` AI chat observability.

Implemented telemetry surfaces:

- `app/api/chat/route.ts`
- `lib/observability/sentry-tracing.ts`
- `sentry.server.config.ts`
- Sentry init files (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`)

## Design Goals

- SLO-ready, low-cardinality dimensions for `/api/chat`
- Alertable signals for errors, latency, provider/model quality, and tool reliability
- Release/environment-safe regressions detection
- Privacy-safe observability (no request bodies, auth headers, or cookies in request integration)

## Reference Guidance Used

- [Sentry Next.js Sampling](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/sampling)
- [Sentry Data Collected](https://docs.sentry.io/platforms/javascript/guides/nextjs/data-management/data-collected)
- [Sentry RequestData Integration](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/integrations/requestdata.md)
- [Sentry Vercel AI Integration](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/integrations/vercelai.md)
- [Sentry AI Monitoring (Node)](https://docs.sentry.io/platforms/javascript/guides/node/ai-agent-monitoring.md)
- [AI SDK Telemetry](https://sdk.vercel.ai/docs/ai-sdk-core/telemetry)
- [OpenTelemetry GenAI Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [OpenTelemetry GenAI Metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics)

## Telemetry Contract

### Required low-cardinality dimensions

These dimensions are now emitted consistently on `/api/chat` traces/errors:

- `route`: `api/chat`
- `chat_route`: `/api/chat`
- `chat_operation`: `stream_text`
- `chat_provider`: normalized provider
- `chat_model`: normalized model id
- `chat_is_authenticated`: `true|false|unknown`
- `chat_finish_reason`: bounded finish reason values
- `chat_error_type`: `none|auth|rate_limit|provider_api|tool_timeout|tool_execution|validation|internal|unknown`
- `chat_tool_outcome`: `none|success|failure|timeout|budget_denied`
- `chat_total_latency_bucket`: `le_1s|1s_3s|3s_8s|8s_15s|gt_15s`
- `chat_first_token_latency_bucket`: `le_1s|1s_3s|3s_8s|8s_15s|gt_15s` (when available)

High-cardinality values (`chatId`, `requestId`) are kept in `context` / `extra`, not tags.

### AI spans and latency

`streamText(...)` uses `experimental_telemetry` with stable metadata:

- `route`, `operation`, `provider`, `model`, `isAuthenticated`, `hasTools`, `enableSearch`, `chatVersionBucket`

AI SDK + Sentry Vercel AI integration provide span-level latency/token attributes:

- `ai.response.msToFirstChunk`
- `ai.response.msToFinish`
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`

### Slow-request reliability signal

When total chat latency exceeds threshold, a `chat_slow_request` warning event is captured with:

- provider/model/auth status
- total + first-token latency
- tool outcome counters
- token counts

Configurable threshold:

- `SENTRY_CHAT_SLOW_REQUEST_MS` (default `15000`)

## Dynamic Sampling Strategy

`lib/observability/sentry-tracing.ts` uses `tracesSampler` with env-driven rates.

Defaults (production):

- `SENTRY_TRACES_RATE_CHAT_HEALTHY=0.25`
- `SENTRY_TRACES_RATE_CHAT_FAILURE=1`
- `SENTRY_TRACES_RATE_CHAT_CLIENT_ERROR=0.5`
- `SENTRY_TRACES_RATE_CRITICAL_API=0.2`
- `SENTRY_TRACES_RATE_DEFAULT_API=0.05`
- `SENTRY_TRACES_RATE_FRONTEND=0.01`
- `SENTRY_TRACES_RATE_HEALTHCHECK=0`
- `SENTRY_TRACES_RATE_STATIC_ASSET=0`

Behavior:

- `/api/chat` failure paths sampled at highest fidelity
- healthy `/api/chat` sampled sufficiently for p95/p99 trend quality
- low-value traffic (health checks/static assets/frontend) aggressively down-sampled

## RequestData privacy profile

RequestData integration guidance was applied with a privacy-first default:

- no additional request body/header/cookie/IP capture was introduced
- existing route tags and span metadata provide required SLO segmentation
- existing `beforeSend`/`beforeSendSpan` scrubbing remains the primary guardrail

## Release Regression Correlation

Sentry release/environment are sourced from SDK init (`release`, `environment`).

Regression analysis dimensions:

- `release`
- `environment`
- `route=api/chat`
- provider/model/auth segments

## SLO Definitions (P2)

Primary SLOs for production `/api/chat`:

1. Availability SLO: error rate `< 1.0%` over 1h rolling window
2. Latency SLO (end-to-end): p95 transaction duration `< 8s` over 1h rolling window
3. First-token SLO: p95 `ai.response.msToFirstChunk < 2.5s` over 1h rolling window
4. Tool reliability SLO: tool timeout + failure rate `< 3.0%` over 1h rolling window
5. Release guardrail: new release cannot degrade
   - error rate by `> 0.5pp`, or
   - p95 latency by `> 25%`
   against previous stable release baseline.

