# Production-Grade Tool Call Tracing — Research Findings

> **Research Task**: Tier 1, Task 2 (`tier-1-production-tracing`)
> **Date**: February 13, 2026
> **AI SDK Version**: `ai@6.0.78` (Vercel AI SDK v6)
> **NaW Source**: `route.ts:511-531` (onStepFinish), `route.ts:566-779` (onFinish audit)

---

## 1. Data Available in `onStepFinish`

### 1.1 Full Property List

The `onStepFinish` callback receives a `StepResult<TOOLS>` object. From the AI SDK v6 type definitions (`node_modules/ai/dist/index.d.ts:780-863`):

```typescript
type StepResult<TOOLS extends ToolSet> = {
  readonly content: Array<ContentPart<TOOLS>>
  readonly text: string
  readonly reasoning: Array<ReasoningPart>
  readonly reasoningText: string | undefined
  readonly files: Array<GeneratedFile>
  readonly sources: Array<Source>
  readonly toolCalls: Array<TypedToolCall<TOOLS>>
  readonly staticToolCalls: Array<StaticToolCall<TOOLS>>
  readonly dynamicToolCalls: Array<DynamicToolCall>
  readonly toolResults: Array<TypedToolResult<TOOLS>>
  readonly staticToolResults: Array<StaticToolResult<TOOLS>>
  readonly dynamicToolResults: Array<DynamicToolResult>
  readonly finishReason: FinishReason  // "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"
  readonly rawFinishReason: string | undefined
  readonly usage: LanguageModelUsage
  readonly warnings: CallWarning[] | undefined
  readonly request: LanguageModelRequestMetadata
  readonly response: LanguageModelResponseMetadata & {
    readonly messages: Array<ResponseMessage>
    body?: unknown
  }
  readonly stepType: "initial" | "continue" | "tool-result"
}
```

### 1.2 Key Question: Is `stepNumber` Available?

**No.** `stepNumber` is NOT part of `StepResult` and is NOT passed to `onStepFinish`.

`stepNumber` is only available in:
- `prepareStep({ stepNumber, steps, model, messages })` — used for tool restriction
- The `steps` array index (in `onFinish` when iterating `steps`)

**Implication**: To get `stepNumber` in `onStepFinish`, we must track it ourselves with a closure counter:

```typescript
let stepCounter = 0
const result = streamText({
  // ...
  onStepFinish: (stepResult) => {
    stepCounter++
    // stepCounter is now the step number (1-indexed)
  },
})
```

This is safe because `onStepFinish` is called sequentially per step — no concurrency within a single `streamText` call.

### 1.3 Key Question: Is `usage` Incremental or Cumulative?

**Per-step (incremental).** The `usage` field in `StepResult` represents the token usage for that specific step only.

Evidence:
- The `StreamTextOnFinishCallback` type (`index.d.ts:2361-2378`) has a separate `totalUsage: LanguageModelUsage` field documented as *"Total usage for all steps. This is the sum of the usage of all steps."*
- The `StepResult.usage` field is documented as *"The token usage of the generated text"* (singular, referring to the step)

This means we can directly use `stepResult.usage` for per-step cost calculation without subtraction.

### 1.4 `LanguageModelUsage` Full Type

```typescript
type LanguageModelUsage = {
  inputTokens: number | undefined
  inputTokenDetails: {
    noCacheTokens: number | undefined
    cacheReadTokens: number | undefined
    cacheWriteTokens: number | undefined
  }
  outputTokens: number | undefined
  outputTokenDetails: {
    textTokens: number | undefined
    reasoningTokens: number | undefined
  }
  totalTokens: number | undefined
}
```

The `cacheReadTokens` field is particularly valuable — Anthropic prompt caching can reduce input costs by 90%, and tracking this per-step reveals real cost savings.

### 1.5 What's NOT Available in `onStepFinish`

| Missing Data | Where Available | Workaround |
|--------------|-----------------|------------|
| `stepNumber` | `prepareStep` only | Closure counter |
| Per-tool-call duration | Not in SDK | Wrap `execute()` |
| Tool result size (bytes) | Not in SDK | Measure in wrapper |
| Estimated cost (USD) | Not in SDK | Compute from usage + model pricing |
| Error message for failed tools | `toolResult.isError` flag only | Capture in `execute()` wrapper |

---

## 2. Industry Trace Data Models

### 2.1 OpenAI Agents SDK Tracing

**Source**: [openai.github.io/openai-agents-python/tracing/](https://openai.github.io/openai-agents-python/tracing/)

**Architecture**: Hierarchical trace → span model, enabled by default.

| Concept | Description | NaW Equivalent |
|---------|-------------|----------------|
| **Trace** | End-to-end workflow. Has `workflow_name`, `trace_id`, `group_id`, `metadata` | One `POST /api/chat` request |
| **Span** | Individual operation with `started_at`, `ended_at`, `trace_id`, `parent_id`, `span_data` | One step within `streamText` |
| **`function_span()`** | Wraps tool execution. Captures inputs/outputs/timing | Per-tool-call trace record |
| **`generation_span()`** | Wraps LLM call. Captures prompt/completion/usage | Per-step LLM call |

**Key design decisions**:
- Traces are **hierarchical** (trace → agent_span → generation_span/function_span)
- Tool calls are automatically wrapped in `function_span()` — no manual instrumentation
- Sensitive data capture is opt-out (`trace_include_sensitive_data`)
- Custom `TracingProcessor` interface for exporting to external backends
- `BatchTraceProcessor` sends traces asynchronously in batches

**Relevance to NaW**: The OpenAI SDK wraps tool calls at the framework level (like NaW's `wrapToolsWithTruncation`). NaW can follow the same pattern — wrapping `execute()` to capture timing — since the Vercel AI SDK doesn't auto-instrument tool calls.

### 2.2 LangSmith Spans

**Source**: [docs.smith.langchain.com/observability](https://docs.smith.langchain.com/observability)

**Architecture**: Flat-within-hierarchy model. Each "run" (span) has:

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | UUID | Unique span identifier |
| `trace_id` | UUID | Links all spans in one trace |
| `parent_run_id` | UUID | Hierarchical nesting |
| `name` | string | Operation name |
| `run_type` | enum | `llm`, `tool`, `chain`, `retriever`, `embedding` |
| `inputs` | object | Operation inputs |
| `outputs` | object | Operation outputs |
| `start_time` | datetime | When the operation began |
| `end_time` | datetime | When the operation completed |
| `error` | string | Error message if failed |
| `metadata` | object | Custom key-value pairs |
| `tokens` | object | `{ prompt, completion, total }` |

**Key design decisions**:
- Tool calls are typed as `run_type: "tool"` — first-class citizens in the trace
- Distributed tracing via `langsmith-trace` header propagation
- Inputs/outputs are full JSON (not truncated) — privacy is user-managed
- Context accessed via `getCurrentRunTree()` / `get_current_run_tree()`

**Relevance to NaW**: LangSmith's flat-within-hierarchy model is the closest to what NaW's `toolCallLog` already implements. Each tool call is a flat record with a `chatId` parent key.

### 2.3 OpenTelemetry Semantic Conventions for GenAI

**Source**: [opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)

**Status**: Development (not stable as of February 2026)

**Key span types**:

| Span Name | Kind | Description |
|-----------|------|-------------|
| `chat {model}` | CLIENT | Full inference request |
| `execute_tool` | INTERNAL | Individual tool execution |

**Standard attributes for tool execution**:

| Attribute | Type | Description |
|-----------|------|-------------|
| `gen_ai.operation.name` | string | `"execute_tool"` |
| `gen_ai.provider.name` | string | Provider identifier |
| `gen_ai.request.model` | string | Model name |
| `gen_ai.usage.input_tokens` | int | Input tokens |
| `gen_ai.usage.output_tokens` | int | Output tokens |
| `gen_ai.response.finish_reasons` | string[] | Why generation stopped |
| `gen_ai.conversation.id` | string | Session/thread ID |
| `error.type` | string | Error class if failed |

**Vercel AI SDK's `ai.toolCall` span attributes** (from telemetry docs):

| Attribute | Description |
|-----------|-------------|
| `ai.toolCall.name` | Tool name |
| `ai.toolCall.id` | Tool call ID |
| `ai.toolCall.args` | Input parameters (stringified) |
| `ai.toolCall.result` | Output result (stringified) |

### 2.4 Industry Comparison Matrix

| Feature | OpenAI Agents SDK | LangSmith | OTEL GenAI | NaW Current |
|---------|-------------------|-----------|------------|-------------|
| **Hierarchy** | Trace → Span (nested) | Trace → Run (nested) | Span (nested) | Flat (chatId parent) |
| **Tool call timing** | Auto (function_span) | Auto (@traceable) | Manual (execute_tool span) | **Missing** |
| **Token usage** | Per-generation | Per-run | Per-span | Per-request only |
| **Cost calculation** | No | Yes (via model pricing) | No | **Missing** |
| **Storage** | OpenAI backend | LangSmith SaaS | OTEL collector | Convex + PostHog |
| **Sensitive data control** | Opt-out flag | User-managed | Opt-in attributes | Truncated previews |
| **Enabled in prod** | Yes (default) | Yes | Yes (explicit) | **No (dev-only)** |

---

## 3. Per-Tool Duration Capture

### 3.1 The Core Challenge

The Vercel AI SDK calls each tool's `execute()` function internally within `streamText()`. NaW does not call tools directly — it passes them to `streamText()` and the SDK manages execution. This means:

1. `onStepFinish` fires **after** the entire step (LLM call + all tool executions in that step)
2. There is no per-tool-call timing data in the callback
3. The SDK does not expose individual tool execution durations

### 3.2 Wrapper Approach (Recommended)

Follow the same pattern as `wrapToolsWithTruncation()` in `lib/tools/utils.ts:106-127`. Create a `wrapToolsWithTiming()` that:

1. Records `startMs = Date.now()` before calling `execute()`
2. Records `endMs = Date.now()` after `execute()` completes (or throws)
3. Stores the timing data in a shared `Map` keyed by `toolCallId`

```typescript
// lib/tools/trace.ts

export type ToolTrace = {
  toolName: string
  toolCallId: string
  startMs: number
  endMs: number
  durationMs: number
  success: boolean
  error?: string
  resultSizeBytes?: number
}

/**
 * Shared trace collector for a single streamText request.
 * Created before streamText(), read in onStepFinish/onFinish.
 */
export class ToolTraceCollector {
  private traces = new Map<string, ToolTrace>()

  record(trace: ToolTrace): void {
    this.traces.set(trace.toolCallId, trace)
  }

  get(toolCallId: string): ToolTrace | undefined {
    return this.traces.get(toolCallId)
  }

  getAll(): ToolTrace[] {
    return Array.from(this.traces.values())
  }

  clear(): void {
    this.traces.clear()
  }
}

/**
 * Wrap all tools with timing instrumentation.
 * Records per-tool-call duration in the provided collector.
 *
 * IMPORTANT: This wrapper must be applied OUTSIDE timeout and truncation
 * wrappers to capture the full wall-clock time including those operations.
 */
export function wrapToolsWithTiming(
  tools: ToolSet,
  collector: ToolTraceCollector
): ToolSet {
  const wrapped: Record<string, unknown> = {}

  for (const [name, t] of Object.entries(tools)) {
    const original = t as Record<string, unknown>
    if (typeof original.execute !== "function") {
      wrapped[name] = original
      continue
    }

    const origExec = original.execute as (
      params: unknown,
      options: { toolCallId: string; [key: string]: unknown }
    ) => Promise<unknown>

    wrapped[name] = {
      ...original,
      execute: async (
        params: unknown,
        options: { toolCallId: string; [key: string]: unknown }
      ) => {
        const startMs = Date.now()
        let success = true
        let error: string | undefined
        let resultSizeBytes: number | undefined

        try {
          const result = await origExec(params, options)

          // Measure result size for observability
          try {
            const serialized = JSON.stringify(result)
            resultSizeBytes = new TextEncoder().encode(serialized).length
          } catch {
            // Non-serializable result — skip size measurement
          }

          return result
        } catch (err) {
          success = false
          error = err instanceof Error ? err.message : String(err)
          throw err // Re-throw to preserve SDK error handling
        } finally {
          const endMs = Date.now()
          collector.record({
            toolName: name,
            toolCallId: options.toolCallId,
            startMs,
            endMs,
            durationMs: endMs - startMs,
            success,
            error,
            resultSizeBytes,
          })
        }
      },
    }
  }

  return wrapped as ToolSet
}
```

### 3.3 SDK Compatibility

The AI SDK passes `ToolExecutionOptions` to `execute()`, which includes:

```typescript
type ToolExecutionOptions = {
  toolCallId: string           // ← We need this as the trace key
  messages: ModelMessage[]
  abortSignal: AbortSignal     // ← Important for timeout composition
}
```

The `toolCallId` is the perfect trace key — it's unique per invocation and is available in both `onStepFinish.toolCalls[]` and `onStepFinish.toolResults[]`.

### 3.4 Why Not Use `experimental_telemetry` for Timing?

The SDK's telemetry does create `ai.toolCall` spans with timing data. However:

| Concern | Assessment |
|---------|------------|
| **Stability** | Still `experimental_` prefixed. Can break in patch releases. |
| **Infrastructure** | Requires OTEL collector + backend (e.g., SigNoz, Honeycomb). NaW uses Convex + PostHog. |
| **Data access** | Spans go to OTEL backend, not accessible in `onStepFinish`/`onFinish` callbacks |
| **Coverage** | Creates `ai.toolCall` spans but doesn't populate NaW's `toolCallLog` or PostHog events |
| **Granularity** | No `resultSizeBytes`, no `source` layer, no `estimatedCost` |

**Recommendation**: Do NOT use `experimental_telemetry` as the primary tracing mechanism. It can be enabled as a supplementary data source if NaW adds an OTEL backend in the future. The manual wrapper approach gives full control and feeds directly into existing Convex + PostHog infrastructure.

---

## 4. Storage Recommendation

### 4.1 Options Evaluated

| Option | Where | Pros | Cons |
|--------|-------|------|------|
| **A: Extend Convex `toolCallLog`** | Convex DB | Real-time queries, per-chat audit trail, user-facing UI, ownership-verified | ~50ms latency per mutation, storage cost grows linearly, schema migration needed |
| **B: PostHog events only** | PostHog | Zero-latency (async capture), built-in dashboards/funnels, already configured | Not queryable per-chat, no real-time reactivity, data retention limits |
| **C: Structured `console.log`** | Vercel log drain | Zero cost, zero latency, parseable by log aggregators | Not queryable, no persistence guarantee, requires log drain setup for analysis |
| **D: Hybrid (A + B + C)** | All three | Debugging (C), analytics (B), audit trail (A) | Complexity of three write paths, but writes are all fire-and-forget |

### 4.2 Recommendation: Option D (Hybrid) with tiered data

**Tier 1 — Structured console.log (always, all environments)**
- Every tool call gets a single-line JSON log in production
- Immediately available in Vercel logs for debugging
- Zero latency, zero cost, zero failure impact
- Parseable by Vercel log drain → Datadog/etc. if needed later

**Tier 2 — PostHog events (always, enriched)**
- Enrich existing `tool_call` event with: `stepNumber`, `durationMs`, `inputTokens`, `outputTokens`, `estimatedCostUsd`, `resultSizeBytes`, `truncated`
- Powers analytics dashboards: cost per tool, failure rates, latency P50/P95
- Already implemented in `route.ts:651-668`, just needs enrichment

**Tier 3 — Convex `toolCallLog` (always, enriched)**
- Add new fields to schema: `stepNumber`, `inputTokens`, `outputTokens`, `estimatedCostUsd`
- Powers per-chat audit trail UI
- Already implemented in `route.ts:685-778`, just needs enrichment

### 4.3 Current `durationMs` Bug

The current `toolCallLog` writes use `Date.now() - streamStartMs` (`route.ts:765`), which is the total stream duration — NOT per-tool duration. The inline comment acknowledges this:

```
// NOTE: This is the full response duration (stream start → onFinish),
// not per-tool-call duration. Per-tool timing requires wrapping each
// tool's execute function, which is deferred to a future phase.
```

With the `ToolTraceCollector` wrapper, we can replace this with actual per-tool timing.

### 4.4 Convex Schema Additions

```typescript
// convex/schema.ts — additions to toolCallLog
toolCallLog: defineTable({
  // ... existing fields ...

  // New fields for production tracing
  stepNumber: v.optional(v.number()),       // 1-indexed step within the request
  stepType: v.optional(v.string()),         // "initial" | "continue" | "tool-result"
  inputTokens: v.optional(v.number()),      // Per-step input tokens (from usage)
  outputTokens: v.optional(v.number()),     // Per-step output tokens
  totalTokens: v.optional(v.number()),      // Per-step total tokens
  cacheReadTokens: v.optional(v.number()),  // Prompt caching savings
  reasoningTokens: v.optional(v.number()),  // Thinking/reasoning tokens
  estimatedCostUsd: v.optional(v.number()), // Computed: tokens × model pricing
  resultSizeBytes: v.optional(v.number()),  // Tool result size before truncation
  truncated: v.optional(v.boolean()),       // Whether result was truncated
  model: v.optional(v.string()),            // Model that made the tool call
  provider: v.optional(v.string()),         // Provider (anthropic, openai, etc.)
  finishReason: v.optional(v.string()),     // Step finish reason
})
```

These are all `v.optional()` — backward compatible with existing data.

### 4.5 PostHog Event Enrichment

Enrich the existing `tool_call` event (`route.ts:651-668`):

```typescript
phClient.capture({
  distinctId: userId,
  event: "tool_call",
  properties: {
    // ... existing properties ...
    // New enrichment:
    stepNumber,
    durationMs: trace?.durationMs,          // From ToolTraceCollector
    inputTokens: stepUsage?.inputTokens,    // From onStepFinish
    outputTokens: stepUsage?.outputTokens,
    estimatedCostUsd,                        // Computed
    resultSizeBytes: trace?.resultSizeBytes,
    truncated: trace?.resultSizeBytes ? trace.resultSizeBytes > MAX_TOOL_RESULT_SIZE : undefined,
    model,
    provider,
    finishReason: step.finishReason,
    stepType: step.stepType,
  },
})
```

---

## 5. Minimum Viable Trace Schema

### 5.1 Per-Tool-Call Trace Record

The minimum fields needed to debug failures, measure cost, and detect regressions:

```typescript
interface ToolCallTrace {
  // Identity
  toolCallId: string           // SDK-generated, unique per invocation
  toolName: string             // Raw tool name (e.g., "web_search", "mcp__server__tool")
  displayName: string          // Human-readable (e.g., "Web Search", "My MCP Tool")
  source: ToolSource           // "builtin" | "third-party" | "mcp"
  serviceName: string          // "OpenAI" | "Exa" | "my-mcp-server"

  // Context
  chatId: string               // Conversation ID (trace grouping key)
  stepNumber: number           // 1-indexed step within the request
  stepType: string             // "initial" | "continue" | "tool-result"
  model: string                // Model that triggered the tool call
  provider: string             // Provider (for cost lookup)

  // Timing
  durationMs: number           // Per-tool wall clock time (from wrapper)

  // Tokens (per-step, shared across all tools in the step)
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheReadTokens?: number     // Prompt caching savings
  reasoningTokens?: number     // Thinking tokens

  // Cost
  estimatedCostUsd?: number    // Computed from tokens × pricing

  // Result
  success: boolean
  errorMessage?: string        // Truncated error (max 500 chars)
  resultSizeBytes?: number     // Before truncation
  truncated?: boolean          // Whether truncation was applied

  // Timestamps
  createdAt: number            // Unix ms
}
```

### 5.2 Cost Computation

Cost can be estimated per-step (tokens are shared across all tool calls within a step):

```typescript
// lib/tools/cost.ts

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number; cacheReadPer1M?: number }> = {
  "claude-sonnet-4-5-20250929": { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3 },
  "claude-haiku-4-5-20250929": { inputPer1M: 0.8, outputPer1M: 4.0, cacheReadPer1M: 0.08 },
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0, cacheReadPer1M: 0.5 },
  // ... add as needed
}

export function estimateStepCost(
  model: string,
  usage: LanguageModelUsage
): number | undefined {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return undefined

  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0

  // Cache-read tokens are billed at the reduced rate
  const effectiveInputTokens = inputTokens - cacheReadTokens
  const inputCost = (effectiveInputTokens * pricing.inputPer1M) / 1_000_000
  const cacheCost = pricing.cacheReadPer1M
    ? (cacheReadTokens * pricing.cacheReadPer1M) / 1_000_000
    : 0
  const outputCost = (outputTokens * pricing.outputPer1M) / 1_000_000

  return inputCost + cacheCost + outputCost
}
```

---

## 6. Vercel `experimental_telemetry` Assessment

### 6.1 What It Provides

When enabled, `experimental_telemetry` creates OpenTelemetry spans:

| Span | Attributes |
|------|------------|
| `ai.streamText` | Full request: prompt, response text, tool calls, finish reason, usage |
| `ai.streamText.doStream` | Per-provider call: messages, tools, response, `msToFirstChunk`, `msToFinish`, `avgCompletionTokensPerSecond` |
| `ai.toolCall` | Per-tool: `name`, `id`, `args`, `result` |
| `ai.stream.firstChunk` (event) | `msToFirstChunk` |
| `ai.stream.finish` (event) | Stream completion |

### 6.2 Evaluation

| Criterion | Score | Notes |
|-----------|-------|-------|
| **Stability** | Low | Still `experimental_` prefix. No commitment to stability. |
| **Coverage** | Medium | Creates `ai.toolCall` spans but missing: `source`, `serviceName`, `resultSizeBytes`, `estimatedCost` |
| **Infrastructure** | High cost | Requires OTEL collector + backend (SigNoz, Honeycomb, Datadog). NaW has none. |
| **Integration** | Poor | Spans go to OTEL pipeline. Cannot feed Convex `toolCallLog` or enrich PostHog events. |
| **Latency data** | Good | `msToFirstChunk`, `msToFinish`, `avgCompletionTokensPerSecond` are valuable |
| **Tool call timing** | Implicit | `ai.toolCall` span has start/end, but only in OTEL backend |

### 6.3 Recommendation

**Do NOT adopt `experimental_telemetry` as primary tracing.** Reasons:
1. It requires OTEL infrastructure NaW doesn't have
2. It doesn't feed existing storage (Convex, PostHog)
3. It lacks NaW-specific fields (source layer, service name, cost)
4. The `experimental_` prefix means it can break without notice

**Future consideration**: If NaW adds an OTEL-compatible observability backend (e.g., for Vercel's upcoming tracing features), `experimental_telemetry` can be enabled as a **supplementary** data source alongside manual tracing. The two approaches are not mutually exclusive.

---

## 7. Production `onStepFinish` Code Sketch

### 7.1 Refactored `onStepFinish` (Production-Ready)

```typescript
// In route.ts, before streamText():
const traceCollector = new ToolTraceCollector()
let stepCounter = 0

// Wrap tools with timing (outermost wrapper — captures full wall clock)
// Applied to Layer 2 (third-party) and Layer 3 (MCP) tools.
// Layer 1 (provider/builtin) tools are SDK-managed and cannot be wrapped.
const timedSearchTools = wrapToolsWithTiming(searchTools, traceCollector)
const timedMcpTools = wrapToolsWithTiming(
  wrapToolsWithTruncation(mcpTools),
  traceCollector
)
const allTools = { ...timedSearchTools, ...timedMcpTools } as ToolSet

// Inside streamText():
onStepFinish: ({ toolCalls, toolResults, usage, finishReason, stepType }) => {
  stepCounter++

  if (toolCalls.length === 0) return

  // Compute per-step cost estimate
  const stepCost = estimateStepCost(model, usage)

  for (const call of toolCalls) {
    const result = toolResults.find(
      (r) => r.toolCallId === call.toolCallId
    )
    const success = result
      ? !(result as { isError?: boolean }).isError
      : false
    const meta = allToolMetadata.get(call.toolName)
    const trace = traceCollector.get(call.toolCallId)

    // Tier 1: Structured console.log (always, all environments)
    // JSON format for Vercel log drain parseability
    console.log(
      JSON.stringify({
        _tag: "tool_trace",
        chatId,
        step: stepCounter,
        stepType,
        tool: meta?.displayName ?? call.toolName,
        source: meta?.source ?? "unknown",
        service: meta?.serviceName ?? "unknown",
        success,
        durationMs: trace?.durationMs ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
        estimatedCostUsd: stepCost ?? null,
        resultSizeBytes: trace?.resultSizeBytes ?? null,
        finishReason,
        model,
        provider,
        error: trace?.error?.slice(0, 200) ?? null,
      })
    )
  }
},
```

### 7.2 Enriched `onFinish` Audit Logging

```typescript
// In onFinish, replace the current tool call logging with enriched version:
if (convexToken && steps) {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (!step.toolCalls?.length) continue

    const stepNumber = i + 1
    const stepCost = estimateStepCost(model, step.usage)

    for (const toolCall of step.toolCalls) {
      const mcpServerInfo = mcpToolServerMap.get(toolCall.toolName)
      const nonMcpMeta = allToolMetadata.get(toolCall.toolName)
      const trace = traceCollector.get(toolCall.toolCallId)

      const toolResult = step.toolResults?.find(
        (r: { toolCallId: string }) => r.toolCallId === toolCall.toolCallId
      )
      const success = toolResult
        ? !(toolResult as { isError?: boolean }).isError
        : false

      // Convex audit log (fire-and-forget)
      void fetchMutation(
        api.toolCallLog.log,
        {
          chatId: chatId as Id<"chats">,
          serverId: mcpServerInfo?.serverId as Id<"mcpServers"> | undefined,
          toolName: mcpServerInfo?.displayName ?? nonMcpMeta?.displayName ?? toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
          outputPreview: toolResult
            ? JSON.stringify(toolResult.output).slice(0, 500)
            : undefined,
          success,
          durationMs: trace?.durationMs,              // Actual per-tool timing
          source: mcpServerInfo ? "mcp" : (nonMcpMeta?.source ?? "builtin"),
          serviceName: mcpServerInfo?.serverName ?? nonMcpMeta?.serviceName,
          // New enrichment fields:
          stepNumber,
          stepType: step.stepType,
          inputTokens: step.usage?.inputTokens,
          outputTokens: step.usage?.outputTokens,
          totalTokens: step.usage?.totalTokens,
          cacheReadTokens: step.usage?.inputTokenDetails?.cacheReadTokens,
          reasoningTokens: step.usage?.outputTokenDetails?.reasoningTokens,
          estimatedCostUsd: stepCost,
          resultSizeBytes: trace?.resultSizeBytes,
          truncated: trace?.resultSizeBytes
            ? trace.resultSizeBytes > MAX_TOOL_RESULT_SIZE
            : undefined,
          model,
          provider,
          finishReason: step.finishReason,
          error: trace?.error?.slice(0, 500),
        },
        { token: convexToken }
      ).catch(() => {
        // Intentionally swallowed — audit logging is best-effort
      })

      // PostHog enriched event
      if (phClient) {
        phClient.capture({
          distinctId: userId,
          event: "tool_call",
          properties: {
            toolName: mcpServerInfo?.displayName ?? nonMcpMeta?.displayName ?? toolCall.toolName,
            rawToolName: toolCall.toolName,
            source: mcpServerInfo ? "mcp" : (nonMcpMeta?.source ?? "unknown"),
            serviceName: mcpServerInfo?.serverName ?? nonMcpMeta?.serviceName,
            success,
            chatId,
            stepNumber,
            durationMs: trace?.durationMs,
            inputTokens: step.usage?.inputTokens,
            outputTokens: step.usage?.outputTokens,
            cacheReadTokens: step.usage?.inputTokenDetails?.cacheReadTokens,
            estimatedCostUsd: stepCost,
            resultSizeBytes: trace?.resultSizeBytes,
            model,
            provider,
            finishReason: step.finishReason,
            ...(mcpServerInfo && {
              serverId: mcpServerInfo.serverId,
              serverName: mcpServerInfo.serverName,
            }),
          },
        })
      }
    }
  }
}
```

---

## 8. Wrapper Composition with Timeout (Task 1)

### 8.1 Composition Order

The wrappers must compose in a specific order. The outermost wrapper runs first (captures the most inclusive timing), and the innermost wrapper runs last (closest to the raw tool execution):

```
SDK calls execute()
    → timing wrapper (outermost — captures full wall clock)
        → timeout wrapper (kills if too slow)
            → truncation wrapper (shrinks result)
                → original execute() (innermost)
```

In code:

```typescript
// Wrapping order matters: timing ∘ timeout ∘ truncation
const wrappedTools = wrapToolsWithTiming(
  wrapToolsWithTimeout(
    wrapToolsWithTruncation(tools),
    TOOL_EXECUTION_TIMEOUT_MS
  ),
  traceCollector
)
```

### 8.2 Why This Order?

| Position | Wrapper | Rationale |
|----------|---------|-----------|
| **Outermost** | Timing | Captures the true wall-clock time including timeout/truncation overhead |
| **Middle** | Timeout | Must wrap the actual execution + truncation. If timeout fires, timing still records the duration |
| **Innermost** | Truncation | Applied to the raw result before timeout checks or timing records |

### 8.3 Unified vs Composable Wrappers

| Approach | Verdict | Rationale |
|----------|---------|-----------|
| **Unified wrapper** | Not recommended | Different layers need different configurations (MCP gets all three; Layer 2 has its own truncation; Layer 1 gets none) |
| **Composable wrappers** | **Recommended** | Each layer applies only the wrappers it needs. Testable in isolation. |
| **Layer-specific** | Acceptable fallback | If composition proves fragile, Layer-specific wrappers can encapsulate the full chain |

### 8.4 Per-Layer Application

| Tool Layer | Timing | Timeout | Truncation | Rationale |
|------------|--------|---------|------------|-----------|
| Layer 1 (Provider/Builtin) | No* | No | No | SDK-managed, opaque. Cannot wrap `execute()`. |
| Layer 2 (Third-party/Exa) | Yes | Yes | Internal** | Exa applies truncation inside `execute()`. Timing + timeout wrap outside. |
| Layer 3 (MCP) | Yes | Yes | Yes | User-configured servers, fully wrappable. |

*Layer 1 tools don't have a user-accessible `execute()` — they're provider-defined. The timing wrapper can't wrap them. However, the `ai.toolCall` telemetry span (if enabled) would cover these.

**Layer 2 tools apply truncation via `truncateToolResult()` inside their `execute()` function (see `third-party.ts:99`). External truncation wrapping would double-truncate.

---

## 9. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Convex mutation latency** | Low | Already fire-and-forget (`void fetchMutation`). Adding fields doesn't change latency characteristics. |
| **`console.log` volume in prod** | Medium | Only log when `toolCalls.length > 0`. One line per tool call. Vercel log drain handles retention. |
| **PostHog event volume** | Low | Already sending `tool_call` events. Adding properties doesn't increase event count. |
| **Timing wrapper overhead** | Negligible | `Date.now()` is ~0.001ms. Two calls per tool execution adds ~0.002ms. |
| **`stepNumber` closure correctness** | Low | `onStepFinish` is called sequentially. No concurrent increment risk within one `streamText` call. |
| **Cost estimation accuracy** | Medium | Model pricing changes. Use a config-driven pricing table (not hardcoded). Accept ~10% error margin. |
| **Schema migration** | Low | All new fields are `v.optional()`. No data migration needed. Old records continue to work. |
| **Layer 1 tool timing gap** | Medium | Provider tools can't be wrapped. Accept this gap — track at step level only. Note in trace as `durationMs: null`. |

---

## 10. Implementation Priorities

| Priority | Item | Effort | Dependencies |
|----------|------|--------|--------------|
| **P0** | Remove `NODE_ENV !== "production"` gate from `onStepFinish` | 5 min | None |
| **P0** | Add `stepCounter` closure for step numbering | 5 min | None |
| **P1** | Create `ToolTraceCollector` + `wrapToolsWithTiming()` | 1-2 hr | None |
| **P1** | Structured JSON `console.log` in `onStepFinish` | 30 min | ToolTraceCollector |
| **P2** | Extend Convex `toolCallLog` schema with new fields | 30 min | None |
| **P2** | Extend `toolCallLog.log` mutation to accept new fields | 30 min | Schema change |
| **P2** | Enrich `onFinish` Convex writes with trace data | 1 hr | ToolTraceCollector + schema |
| **P2** | Enrich PostHog `tool_call` events | 30 min | ToolTraceCollector |
| **P3** | Create `estimateStepCost()` with pricing table | 1 hr | None |
| **P3** | Move PostHog tool_call events from `onFinish` to `onStepFinish` | 1 hr | stepCounter |

**Total estimated effort**: 6-8 hours

---

## 11. References

### Primary Sources

| Source | URL | Used For |
|--------|-----|----------|
| AI SDK v6 Reference — streamText | [ai-sdk.dev/docs/reference/ai-sdk-core/stream-text](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) | onStepFinish properties, StepResult type |
| AI SDK v6 — Telemetry | [ai-sdk.dev/docs/ai-sdk-core/telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry) | experimental_telemetry assessment |
| AI SDK v6 TypeScript Types | `node_modules/ai/dist/index.d.ts:780-863` | StepResult definition, LanguageModelUsage |
| OpenAI Agents SDK — Tracing | [openai.github.io/openai-agents-python/tracing/](https://openai.github.io/openai-agents-python/tracing/) | Trace/span data model |
| LangSmith — Observability | [docs.smith.langchain.com/observability](https://docs.smith.langchain.com/observability) | Run/span structure |
| OpenTelemetry GenAI Semantic Conventions | [opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/) | Standard attributes |

### NaW Source Files Referenced

| File | Lines | Content |
|------|-------|---------|
| `app/api/chat/route.ts` | 511-531 | Current `onStepFinish` (dev-only) |
| `app/api/chat/route.ts` | 566-779 | Current `onFinish` audit logging |
| `app/api/chat/route.ts` | 471, 765 | `streamStartMs` and incorrect `durationMs` |
| `convex/schema.ts` | 158-183 | Current `toolCallLog` schema |
| `convex/toolCallLog.ts` | 37-91 | Current `log` mutation |
| `lib/tools/types.ts` | 14-41 | `ToolMetadata` type |
| `lib/tools/utils.ts` | 106-127 | `wrapToolsWithTruncation()` pattern |
| `lib/tools/third-party.ts` | 82-120 | Exa envelope pattern (timing gold standard) |
| `lib/config.ts` | 224-233 | `TOOL_EXECUTION_TIMEOUT_MS` (not yet enforced) |

---

*Research completed February 13, 2026. Ready for implementation planning.*
