# Tier 1 Foundation Hardening — Research Synthesis

> **Date**: February 13, 2026 (revised)
> **Inputs**: `tier-1-tool-timeouts.md`, `tier-1-production-tracing.md`, `tier-1-mcp-envelopes.md`
> **Source plan**: `.agents/plans/tier-1-foundation-research.md`
> **Guiding principle**: `multi-tool-calling-system-design.md` §8.10 — "Don't over-architect for complexity you don't have yet."
> **Status**: Complete — ready for implementation

---

## 1. Key Findings

### Task 1 — Per-Tool Execution Timeouts

The Vercel AI SDK (v6.0.78) has **no built-in per-tool timeout mechanism** and no mainstream framework does either — timeout enforcement is universally wrapper-based. The SDK's `executeTool()` is a bare `await` with no middleware. When `execute()` throws (e.g., from `Promise.race` timeout), the SDK gracefully returns a `tool-error` to the model, which can acknowledge the failure and continue streaming. This makes `Promise.race` with a `ToolTimeoutError` fully SDK-compatible. Layer 1 (provider) tools must NOT be wrapped — they are `providerExecuted: true` and the SDK bypasses user-land `execute()` entirely. Recommended timeouts: 15s for Layer 2 (Exa), 30s for Layer 3 (MCP), aligned with the MCP RFC #1492 direction (60s proposed).

### Task 2 — Production-Grade Tool Call Tracing

The `onStepFinish` callback provides rich per-step data (`toolCalls`, `toolResults`, `usage` with cache/reasoning detail, `finishReason`, `stepType`) but is currently gated behind `NODE_ENV !== "production"` and lacks `stepNumber` (must be tracked via closure counter). Per-tool-call duration is **not available from the SDK** — it must be captured inside the tool's `execute()` function. The current `durationMs` in `toolCallLog` records total stream duration, not per-tool timing (a known bug at `route.ts:765`). Industry trace models (OpenAI Agents SDK, LangSmith, OpenTelemetry GenAI) all capture per-tool timing as a first-class concern. The SDK's `experimental_telemetry` is unsuitable as primary tracing — it requires OTEL infrastructure NaW doesn't have and doesn't feed Convex/PostHog. Recommended storage: hybrid (structured `console.log` + enriched PostHog events + enriched Convex `toolCallLog`).

### Task 4 — Consistent MCP Result Envelopes

Layer 2 (Exa) returns structured `{ ok, data, error, meta }` envelopes; Layer 3 (MCP) returns raw values with only truncation applied — an inconsistency that blocks uniform observability. Research on model comprehension (Kate et al. 2025) shows JSON processing is hard for LLMs and degrades with size, but consistent structure helps. Token overhead is ~30 tokens per call (~190% on small results, <5% on large), which is negligible. The key architectural insight is the SDK's `toModelOutput` API — it allows separating what the system captures from what the model sees. Audit logging requires extracting `data` from envelopes before `JSON.stringify().slice(0, 500)` to preserve preview usefulness.

### Task 3 — Anthropic Token-Efficient Header

Already shipped. `route.ts:462-464` applies `ANTHROPIC_BETA_HEADERS.tokenEfficient` for all Anthropic requests with tools. Zero remaining work.

---

## 2. Design Correction: One Wrapper Per Layer, Not Four Composable Wrappers

### What the research proposed (and why it's wrong)

The three research tasks were executed in parallel. Each researcher proposed a separate generic wrapper for their concern. The synthesis then debated wrapper composition order — a design problem that shouldn't exist.

| Document | Proposed Wrapper |
|----------|-----------------|
| Task 1 | `wrapToolsWithTimeout()` |
| Task 2 | `wrapToolsWithTiming()` |
| Existing | `wrapToolsWithTruncation()` |
| Task 4 | `wrapToolsWithEnvelope()` |

This produced a 4-layer composition chain with ordering debates (each researcher positioned their wrapper as "outermost"). The original system design research warned against exactly this:

> "Don't over-architect for complexity you don't have yet." — `multi-tool-calling-system-design.md` §8.10

> "The 'agent' is the easy part — the system is the product." — §8.8

### What the industry actually does

No production system composes four generic wrappers with ordering constraints:

- **OpenAI Agents SDK**: `@function_tool(timeout=30)` — timeout is a parameter on the tool definition, tracing is automatic via `function_span()`
- **LangSmith**: `@traceable` — single decorator per tool
- **Exa in NaW** (`third-party.ts:82-119`): one `execute()` function body that handles timing, truncation, envelope, and error handling together

The industry pattern is **one wrapper per tool layer** that handles all concerns for that layer.

### Corrected approach: follow the Exa gold standard

The Exa tool already does this correctly in a single function:

```
execute()
├── timing          const startMs = Date.now()
├── execution       const { results } = await exa.searchAndContents(...)
├── truncation      truncateToolResult(mapped)
├── envelope        { ok, data, error: null, meta: { durationMs, ... } }
└── error handling  catch → console.error → re-throw
```

MCP tools need a **single wrapper function** — `wrapMcpTools()` — that replaces each tool's `execute()` with one that does the same thing. Timeout is a parameter, not a separate wrapper.

### Per-layer summary

| Layer | Wrapper | Concerns Handled |
|-------|---------|-----------------|
| Layer 1 (Provider) | None — opaque, SDK-managed | N/A |
| Layer 2 (Exa) | None needed — already done inline in `third-party.ts:82-119` | timing, truncation, envelope, error |
| Layer 3 (MCP) | `wrapMcpTools(tools, config)` — **new** | timing, timeout, truncation, envelope, error |

Layer 2 only needs the addition of timeout protection. Since Exa's `execute()` is written inline, the simplest approach is adding `Promise.race` inside the existing function body — not wrapping it externally.

---

## 3. Recommended Implementation Order

Three work items, not nineteen steps.

### Phase A — Production tracing quick wins (30 min)

Two changes in `route.ts` with immediate production value and zero risk:

1. Remove the `NODE_ENV !== "production"` gate from `onStepFinish` (`route.ts:512`)
2. Add a `stepCounter` closure before `streamText()`
3. Replace the current `console.log` with structured JSON (parseable by Vercel log drain)

These unlock production debugging today.

### Phase B — `wrapMcpTools()` unified wrapper (half day)

One new function that replaces the current `wrapToolsWithTruncation(mcpTools)` call at `route.ts:300-302`. Handles all concerns for Layer 3:

1. Add `ToolTimeoutError` class and `MCP_TOOL_EXECUTION_TIMEOUT_MS` constant
2. Create `wrapMcpTools()` in `lib/tools/mcp-wrapper.ts` (timing + timeout + truncation + envelope in one `execute()`)
3. Add `ToolTraceCollector` (simple `Map<toolCallId, ToolTrace>`) for `onStepFinish` to read
4. Add `isToolResultEnvelope()` type guard
5. Update `route.ts`: replace `wrapToolsWithTruncation(mcpTools)` with `wrapMcpTools(mcpTools, config)`
6. Update audit log in `onFinish` to extract `data` from envelopes before preview

### Phase C — Observability enrichment (half day)

Enrich existing storage with trace data from the collector:

1. Extend Convex `toolCallLog` schema (all `v.optional()` — backward compatible)
2. Enrich `onFinish` Convex writes with `durationMs`, `stepNumber`, `inputTokens`, `outputTokens`
3. Enrich PostHog `tool_call` events with the same fields
4. Add `estimateStepCost()` with a config-driven pricing table
5. Add timeout to Layer 2 (Exa): `Promise.race` inside the existing `execute()` body

### Phase D — Tests (2–3 hours)

1. Unit test: `wrapMcpTools` with a tool that resolves before timeout
2. Unit test: `wrapMcpTools` with a tool that hangs past timeout
3. Unit test: envelope structure and `isToolResultEnvelope()` type guard
4. Unit test: `ToolTraceCollector` records correct timing on success and error

---

## 4. Total Estimated Effort

| Phase | Description | Effort |
|-------|-------------|--------|
| A | Production tracing quick wins | 30 min |
| B | `wrapMcpTools()` unified wrapper + route integration | 4 hr |
| C | Observability enrichment (Convex, PostHog, Exa timeout) | 4 hr |
| D | Tests | 2.5 hr |
| **Total** | | **~11 hours (1.5 days)** |

Down from ~16 hours in the previous estimate. The reduction comes from eliminating four separate wrappers, their composition logic, and integration tests for the composition chain.

---

## 5. Findings That Change the Original Priority Ordering

The original plan listed: Timeouts → Tracing → (done) → Envelopes, as if they were independent work streams. They aren't — they're all aspects of a single wrapper function per tool layer. The corrected ordering treats them as one deliverable:

```
Original:   1. Timeouts → 2. Tracing → 3. (done) → 4. Envelopes
                 ↓              ↓                       ↓
            4 separate wrappers with composition ordering debate

Corrected:  A. Quick wins (tracing) → B. wrapMcpTools() → C. Enrich storage
                                            ↑
                              one function handles timeout +
                              timing + truncation + envelope
```

### Key priority changes

1. **Tracing quick wins ship first** — 30 minutes of work that immediately enables production debugging. Should not wait for any wrapper work.

2. **Timeout, timing, truncation, and envelope are one deliverable** — not four. They ship together in `wrapMcpTools()` because they are all concerns of the same `execute()` function, exactly as Exa already demonstrates.

3. **The `toModelOutput` escape hatch** reduces envelope risk to "low." If model comprehension degrades with envelope structure, we can strip `meta` without changing the wrapper.

---

## 6. Code Sketch: `wrapMcpTools()`

One function that follows the Exa gold standard pattern. All concerns in one `execute()` body.

### `lib/tools/mcp-wrapper.ts`

```typescript
import type { ToolSet } from "ai"
import type { ToolResultEnvelope } from "./types"
import { truncateToolResult } from "./utils"
import {
  MAX_TOOL_RESULT_SIZE,
  MCP_TOOL_EXECUTION_TIMEOUT_MS,
} from "@/lib/config"

// ── Types ──────────────────────────────────────────────

export class ToolTimeoutError extends Error {
  readonly toolName: string
  readonly timeoutMs: number
  constructor(toolName: string, timeoutMs: number) {
    super(
      `Tool "${toolName}" timed out after ${timeoutMs}ms. ` +
      `The operation was taking too long and was cancelled.`
    )
    this.name = "ToolTimeoutError"
    this.toolName = toolName
    this.timeoutMs = timeoutMs
  }
}

export type ToolTrace = {
  toolName: string
  toolCallId: string
  durationMs: number
  success: boolean
  error?: string
  resultSizeBytes?: number
}

/**
 * Collects per-tool-call traces for a single streamText request.
 * Created before streamText(), read in onStepFinish and onFinish.
 */
export class ToolTraceCollector {
  private traces = new Map<string, ToolTrace>()
  record(trace: ToolTrace): void { this.traces.set(trace.toolCallId, trace) }
  get(toolCallId: string): ToolTrace | undefined { return this.traces.get(toolCallId) }
  getAll(): ToolTrace[] { return Array.from(this.traces.values()) }
}

// ── Configuration ──────────────────────────────────────

interface WrapMcpToolsConfig {
  /** Server name for envelope meta */
  serverName: string
  /** Map of tool names → server info for display names */
  toolServerMap: Map<string, {
    displayName: string
    serverName: string
    serverId: string
  }>
  /** Trace collector — shared with onStepFinish/onFinish */
  traceCollector: ToolTraceCollector
  /** Per-tool timeout in ms. Default: MCP_TOOL_EXECUTION_TIMEOUT_MS */
  timeoutMs?: number
  /** Max result size in bytes. Default: MAX_TOOL_RESULT_SIZE */
  maxResultBytes?: number
}

// ── Wrapper ────────────────────────────────────────────

/**
 * Wrap MCP tools with timeout, timing, truncation, and envelope.
 * Follows the Exa gold standard (third-party.ts:82-119):
 * all concerns handled in a single execute() body.
 *
 * Replaces the current wrapToolsWithTruncation(mcpTools) call
 * in route.ts:300-302.
 *
 * On error: throws (does NOT envelope errors). This preserves
 * the AI SDK's isError detection in onFinish for audit logs
 * and PostHog events.
 */
export function wrapMcpTools(
  tools: ToolSet,
  config: WrapMcpToolsConfig
): ToolSet {
  const {
    serverName,
    toolServerMap,
    traceCollector,
    timeoutMs = MCP_TOOL_EXECUTION_TIMEOUT_MS,
    maxResultBytes = MAX_TOOL_RESULT_SIZE,
  } = config

  const wrapped: Record<string, unknown> = {}

  for (const [name, t] of Object.entries(tools)) {
    const original = t as Record<string, unknown>

    // Tools without execute (e.g., provider tools) pass through unchanged.
    if (typeof original.execute !== "function") {
      wrapped[name] = original
      continue
    }

    const origExec = original.execute as (
      params: unknown,
      options: { toolCallId: string; [k: string]: unknown }
    ) => Promise<unknown>

    const serverInfo = toolServerMap.get(name)
    const displayName = serverInfo?.displayName ?? name

    wrapped[name] = {
      ...original,
      execute: async (
        params: unknown,
        options: { toolCallId: string; [k: string]: unknown }
      ): Promise<ToolResultEnvelope> => {
        const startMs = Date.now()
        let success = true
        let error: string | undefined
        let resultSizeBytes: number | undefined

        try {
          // ── Timeout + Execution ──
          const rawResult = await Promise.race([
            origExec(params, options),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new ToolTimeoutError(name, timeoutMs)),
                timeoutMs
              )
            ),
          ])

          // ── Measure result size ──
          try {
            const serialized = JSON.stringify(rawResult)
            resultSizeBytes = new TextEncoder().encode(serialized).length
          } catch {
            // Non-serializable — skip measurement
          }

          // ── Truncation ──
          const truncatedResult = truncateToolResult(rawResult, maxResultBytes)

          // ── Envelope ──
          return {
            ok: true,
            data: truncatedResult,
            error: null,
            meta: {
              tool: displayName,
              source: "mcp",
              durationMs: Date.now() - startMs,
              serverName: serverInfo?.serverName ?? serverName,
            },
          }
        } catch (err) {
          // Record failure for tracing, then re-throw so the AI SDK
          // sets isError: true — preserving audit log success detection.
          success = false
          error = err instanceof Error ? err.message : String(err)

          console.error(
            `[tools/mcp] ${displayName} failed after ${Date.now() - startMs}ms:`,
            error
          )
          throw err
        } finally {
          // ── Trace (always — success or failure) ──
          traceCollector.record({
            toolName: name,
            toolCallId: options.toolCallId,
            durationMs: Date.now() - startMs,
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

// ── Type guard ─────────────────────────────────────────

/** Check if a tool result is a ToolResultEnvelope (for audit log extraction). */
export function isToolResultEnvelope(value: unknown): value is ToolResultEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    "data" in value &&
    "meta" in value
  )
}
```

### Application in `route.ts`

```typescript
import {
  ToolTraceCollector,
  wrapMcpTools,
  isToolResultEnvelope,
} from "@/lib/tools/mcp-wrapper"

// Before streamText():
const traceCollector = new ToolTraceCollector()
let stepCounter = 0

// Replace route.ts:300-302:
//   mcpTools = wrapToolsWithTruncation(mcpTools) as ToolSet
// With:
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapMcpTools(mcpTools, {
    serverName: "user-mcp",
    toolServerMap: mcpToolServerMap,
    traceCollector,
  }) as ToolSet
}

// onStepFinish — remove NODE_ENV gate, add structured logging:
onStepFinish: ({ toolCalls, toolResults, usage, finishReason, stepType }) => {
  stepCounter++
  if (toolCalls.length === 0) return

  for (const call of toolCalls) {
    const result = toolResults.find((r) => r.toolCallId === call.toolCallId)
    const success = result ? !(result as { isError?: boolean }).isError : false
    const trace = traceCollector.get(call.toolCallId)
    const meta = allToolMetadata.get(call.toolName)

    console.log(JSON.stringify({
      _tag: "tool_trace",
      chatId,
      step: stepCounter,
      tool: meta?.displayName ?? call.toolName,
      source: meta?.source ?? "unknown",
      success,
      durationMs: trace?.durationMs ?? null,
      tokens: { in: usage?.inputTokens ?? null, out: usage?.outputTokens ?? null },
      finishReason,
      model,
      error: trace?.error?.slice(0, 200) ?? null,
    }))
  }
},

// In onFinish audit logging — extract data from envelope for preview:
const output = toolResult?.output
const previewData = isToolResultEnvelope(output) ? output.data : output
const outputPreview = previewData
  ? JSON.stringify(previewData).slice(0, 500)
  : undefined
const durationMs = isToolResultEnvelope(output)
  ? output.meta.durationMs
  : undefined
```

---

## 7. Self-Correction: What We Over-Engineered

For transparency, documenting what the original synthesis got wrong and why.

| Original proposal | Problem | Correction |
|-------------------|---------|------------|
| Four composable wrappers (`timing`, `timeout`, `truncation`, `envelope`) | Created an ordering debate that doesn't exist in any production system. No framework composes 4 generic wrappers. | One wrapper per layer. All concerns in one `execute()` body. |
| 19-step implementation plan across 6 phases | Over-decomposition. Each "step" was 5–30 minutes. Research-to-code ratio was inverted. | Three phases, three clear deliverables. |
| `wrapToolsWithTiming()` as shared infrastructure | Treating timing as a generic concern. In practice, timing is 2 lines (`Date.now()` before and after) — not worth a separate utility. | Inline `startMs` / `durationMs` in each layer's wrapper, as Exa already does. |
| Debating wrapper ordering semantics | Artifact of parallel research decomposition. Three independent researchers each optimized for their own concern. | No ordering to debate when there's one function. |

The root cause: the research plan decomposed a single design problem (how to wrap MCP tool execution) into three independent tasks, then the synthesis tried to recompose them. The industry treats this as one problem per tool layer.

---

## References

| Document | Location | What it contributes |
|----------|----------|-------------------|
| Timeout research | `tier-1-tool-timeouts.md` | `Promise.race` pattern, SDK error handling, layer applicability |
| Tracing research | `tier-1-production-tracing.md` | `onStepFinish` data, `ToolTraceCollector` pattern, storage recommendation |
| Envelope research | `tier-1-mcp-envelopes.md` | MCP spec analysis, model comprehension, `toModelOutput` escape hatch |
| System design research | `multi-tool-calling-system-design.md` | Industry patterns, anti-over-engineering principle |
| Exa gold standard | `lib/tools/third-party.ts:82-119` | Unified wrapper pattern to follow |
| Current MCP wrapping | `app/api/chat/route.ts:300-302` | Code to replace |
| Tool types | `lib/tools/types.ts:57-67` | `ToolResultEnvelope` type (unchanged) |

---

*Synthesis revised February 13, 2026. Corrected from 4-wrapper composition to unified per-layer pattern aligned with industry practice and NaW's own Exa gold standard.*
