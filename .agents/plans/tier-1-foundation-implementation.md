# Tier 1 Foundation Hardening — Implementation Plan

> **Based on**: `.agents/research/tier-1-foundation-summary.md`
> **Created**: February 13, 2026
> **Status**: Ready for implementation
> **Estimated effort**: ~11 hours (4 phases)

---

## Prerequisites

Before starting any phase, read these files to confirm nothing has changed since plan creation:

```
@app/api/chat/route.ts          # Main chat streaming endpoint
@lib/tools/utils.ts             # Current wrapToolsWithTruncation()
@lib/tools/types.ts             # ToolResultEnvelope type
@lib/tools/third-party.ts       # Exa gold standard pattern
@lib/config.ts                  # Constants
@convex/schema.ts               # toolCallLog schema (lines 158-183)
@convex/toolCallLog.ts          # Convex log mutation
@lib/mcp/load-tools.ts          # ServerInfo type, toolServerMap
```

Run `bun run typecheck && bun run lint` to confirm a clean baseline before edits.

---

## Phase A — Production Tracing Quick Wins

**Goal**: Enable structured tool tracing in production. Zero-risk changes in `route.ts` only.
**Effort**: ~30 minutes
**Files modified**: `app/api/chat/route.ts` (1 file)

### Step A.1 — Add `stepCounter` closure before `streamText()`

**File**: `app/api/chat/route.ts`
**Location**: Immediately after line 471 (`const streamStartMs = Date.now()`)

Add a step counter that `onStepFinish` will increment. This must be declared in the same scope as `streamText()` so the closure captures it.

```typescript
const streamStartMs = Date.now()
let stepCounter = 0  // ← ADD THIS LINE
```

**Why**: The AI SDK's `onStepFinish` does not provide a `stepNumber` field. We must track it via closure. The research confirmed this in `tier-1-production-tracing.md`.

### Step A.2 — Remove `NODE_ENV` gate from `onStepFinish`

**File**: `app/api/chat/route.ts`
**Location**: Lines 511-531 (the `onStepFinish` callback)

**Current code** (lines 511-531):

```typescript
onStepFinish: ({ toolCalls, toolResults, usage, finishReason }) => {
  if (process.env.NODE_ENV !== "production" && toolCalls.length > 0) {
    for (const call of toolCalls) {
      // ... logging
    }
  }
},
```

**Replace with**:

```typescript
onStepFinish: ({ toolCalls, toolResults, usage, finishReason }) => {
  stepCounter++
  if (toolCalls.length === 0) return

  for (const call of toolCalls) {
    const result = toolResults.find(
      (r) => r.toolCallId === call.toolCallId
    )
    const success = result
      ? !(result as { isError?: boolean }).isError
      : false
    const meta = allToolMetadata.get(call.toolName)

    // Structured JSON log — parseable by Vercel log drain and grep.
    // Uses _tag for machine filtering without affecting human readability.
    console.log(
      JSON.stringify({
        _tag: "tool_trace",
        chatId,
        step: stepCounter,
        tool: meta?.displayName ?? call.toolName,
        source: meta?.source ?? "unknown",
        success,
        durationMs: null, // Per-tool timing added in Phase B
        tokens: {
          in: usage?.inputTokens ?? null,
          out: usage?.outputTokens ?? null,
        },
        finishReason,
        model,
      })
    )
  }
},
```

**Key changes**:
1. Removed `process.env.NODE_ENV !== "production"` gate
2. Added `stepCounter++` at the top
3. Early return on no tool calls (moved from condition to guard clause)
4. Replaced unstructured `console.log` with `JSON.stringify` for Vercel log drain
5. Added `_tag: "tool_trace"` for machine filtering
6. Added `durationMs: null` placeholder (populated in Phase B by `ToolTraceCollector`)

**What NOT to change**:
- Do NOT touch `onFinish` in this step
- Do NOT change the `onStepFinish` function signature — it must still destructure `{ toolCalls, toolResults, usage, finishReason }`
- Do NOT add `stepType` to the destructuring yet (not needed until Phase C)

### Step A.3 — Verify

```bash
bun run typecheck
bun run lint
```

Confirm `stepCounter` is not flagged as unused (it's referenced inside the closure). If the linter warns about `stepCounter` being `let` but never reassigned outside the callback, that's expected — `stepCounter++` inside the closure IS a reassignment.

### Phase A Acceptance Criteria

- [ ] `NODE_ENV` gate removed from `onStepFinish`
- [ ] `stepCounter` increments each step
- [ ] Logs are structured JSON with `_tag: "tool_trace"`
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes

---

## Phase B — `wrapMcpTools()` Unified Wrapper

**Goal**: Replace `wrapToolsWithTruncation(mcpTools)` with a unified wrapper that handles timing, timeout, truncation, and envelope in a single `execute()` body — following the Exa gold standard.
**Effort**: ~4 hours
**Files created**: `lib/tools/mcp-wrapper.ts` (1 new file)
**Files modified**: `app/api/chat/route.ts`, `lib/config.ts` (2 files)

### Step B.1 — Add `MCP_TOOL_EXECUTION_TIMEOUT_MS` constant to `lib/config.ts`

**File**: `lib/config.ts`
**Location**: In the "MCP Integration" section (after line 199, `MCP_MAX_TOOLS_PER_REQUEST`)

```typescript
/** Timeout for MCP tool executions (in milliseconds).
 * MCP tools connect to arbitrary user-configured servers that can hang.
 * Enforced via Promise.race in wrapMcpTools(). On timeout, the AI SDK
 * receives a thrown ToolTimeoutError and gracefully returns a tool-error
 * to the model, which can acknowledge the failure and continue.
 * 30s is conservative — aligns with MCP RFC #1492 direction (60s proposed).
 */
export const MCP_TOOL_EXECUTION_TIMEOUT_MS = 30_000
```

**Why 30s**: MCP tools are user-configured and call arbitrary external servers. 30s is generous enough for most operations while preventing infinite hangs. The MCP RFC #1492 proposes 60s as the spec default; 30s is a tighter safety net since users expect chat responses, not CI pipelines.

**Do NOT modify** the existing `TOOL_EXECUTION_TIMEOUT_MS = 15_000` — that's for Layer 2 (Exa) and is used in Phase C.

### Step B.2 — Create `lib/tools/mcp-wrapper.ts`

**New file**: `lib/tools/mcp-wrapper.ts`

This is the core deliverable. One function that replaces `wrapToolsWithTruncation(mcpTools)` and handles all Layer 3 concerns in a single `execute()` body.

```typescript
// lib/tools/mcp-wrapper.ts
//
// Unified MCP tool wrapper — handles timing, timeout, truncation, and envelope
// in a single execute() body. Follows the Exa gold standard pattern from
// lib/tools/third-party.ts:82-119.
//
// Replaces wrapToolsWithTruncation(mcpTools) in route.ts:300-302.

import type { ToolSet } from "ai"
import type { ToolResultEnvelope } from "./types"
import { truncateToolResult } from "./utils"
import {
  MAX_TOOL_RESULT_SIZE,
  MCP_TOOL_EXECUTION_TIMEOUT_MS,
} from "@/lib/config"

// ── Error Types ────────────────────────────────────────────

/**
 * Thrown when a tool execution exceeds its timeout.
 * The AI SDK catches this in execute() and returns a tool-error to the model,
 * which can acknowledge the failure and continue streaming.
 */
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

// ── Trace Types ────────────────────────────────────────────

export type ToolTrace = {
  toolName: string
  toolCallId: string
  durationMs: number
  success: boolean
  error?: string
  resultSizeBytes?: number
}

/**
 * Collects per-tool-call traces for a single streamText() request.
 * Created before streamText(), read in onStepFinish and onFinish.
 *
 * Lifecycle:
 *   1. Created in route.ts before streamText()
 *   2. wrapMcpTools() records traces during execute()
 *   3. onStepFinish reads traces for structured logging
 *   4. onFinish reads traces for Convex + PostHog enrichment
 *   5. Garbage collected when the request ends
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
}

// ── Configuration ──────────────────────────────────────────

interface WrapMcpToolsConfig {
  /** Map of namespaced tool names → server info for display names and audit */
  toolServerMap: Map<
    string,
    {
      displayName: string
      serverName: string
      serverId: string
    }
  >
  /** Trace collector — shared with onStepFinish/onFinish in route.ts */
  traceCollector: ToolTraceCollector
  /** Per-tool timeout in ms. Default: MCP_TOOL_EXECUTION_TIMEOUT_MS (30s) */
  timeoutMs?: number
  /** Max result size in bytes. Default: MAX_TOOL_RESULT_SIZE (100KB) */
  maxResultBytes?: number
}

// ── Wrapper ────────────────────────────────────────────────

/**
 * Wrap MCP tools with timeout, timing, truncation, and envelope.
 *
 * Follows the Exa gold standard (third-party.ts:82-119):
 * all concerns handled in a single execute() body.
 *
 * Replaces wrapToolsWithTruncation(mcpTools) at route.ts:300-302.
 *
 * Error behavior: throws on failure (does NOT envelope errors).
 * This preserves the AI SDK's isError detection in onFinish for
 * audit logs and PostHog events. The SDK passes the error message
 * to the model as a tool result — the model can still explain
 * "tool X failed" without the app crashing.
 *
 * @param tools - MCP ToolSet from loadUserMcpTools()
 * @param config - Wrapper configuration
 * @returns Wrapped ToolSet with timeout, timing, truncation, envelope
 */
export function wrapMcpTools(
  tools: ToolSet,
  config: WrapMcpToolsConfig
): ToolSet {
  const {
    toolServerMap,
    traceCollector,
    timeoutMs = MCP_TOOL_EXECUTION_TIMEOUT_MS,
    maxResultBytes = MAX_TOOL_RESULT_SIZE,
  } = config

  const wrapped: Record<string, unknown> = {}

  for (const [name, t] of Object.entries(tools)) {
    const original = t as Record<string, unknown>

    // Tools without execute (e.g., provider tools with providerExecuted: true)
    // pass through unchanged. This is a safety net — MCP tools should always
    // have execute, but we check to avoid runtime errors.
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
          // ── Timeout + Execution ────────────────────────
          // Promise.race: either the tool resolves or the timeout rejects.
          // When timeout wins, ToolTimeoutError is thrown → caught below →
          // re-thrown → SDK sets isError: true on the tool result.
          const rawResult = await Promise.race([
            origExec(params, options),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new ToolTimeoutError(name, timeoutMs)),
                timeoutMs
              )
            ),
          ])

          // ── Measure result size (for trace, before truncation) ──
          try {
            const serialized = JSON.stringify(rawResult)
            resultSizeBytes = new TextEncoder().encode(serialized).length
          } catch {
            // Non-serializable result — skip measurement, not critical
          }

          // ── Truncation ─────────────────────────────────
          const truncatedResult = truncateToolResult(rawResult, maxResultBytes)

          // ── Envelope ───────────────────────────────────
          return {
            ok: true,
            data: truncatedResult,
            error: null,
            meta: {
              tool: displayName,
              source: "mcp",
              durationMs: Date.now() - startMs,
              serverName: serverInfo?.serverName ?? "unknown",
            },
          }
        } catch (err) {
          // Record failure for tracing, then re-throw so the AI SDK
          // sets isError: true — preserving audit log success detection
          // and PostHog event accuracy.
          success = false
          error = err instanceof Error ? err.message : String(err)

          console.error(
            `[tools/mcp] ${displayName} failed after ${Date.now() - startMs}ms:`,
            error
          )
          throw err
        } finally {
          // ── Trace (always — success or failure) ────────
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

// ── Type Guard ─────────────────────────────────────────────

/**
 * Check if a tool result is a ToolResultEnvelope.
 * Used in onFinish audit logging to extract `data` from envelopes
 * before generating output previews — ensures the preview contains
 * actual result data instead of envelope metadata.
 */
export function isToolResultEnvelope(
  value: unknown
): value is ToolResultEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    "data" in value &&
    "meta" in value
  )
}
```

**Architecture notes for the implementing agent**:

1. **`ToolTimeoutError`** — A named error class so `onStepFinish` / logging can distinguish timeouts from other errors. The `toolName` and `timeoutMs` properties enable structured logging without parsing the message.

2. **`ToolTraceCollector`** — A simple `Map<toolCallId, ToolTrace>` scoped to a single request. The AI SDK does NOT provide per-tool-call timing — this collector bridges that gap. Created before `streamText()`, written by `wrapMcpTools`, read by `onStepFinish` and `onFinish`.

3. **`wrapMcpTools()`** — Follows the Exa gold standard: all concerns in one `execute()` body. The `finally` block ensures traces are recorded even on error/timeout. The function re-throws errors rather than enveloping them because the AI SDK's `isError` detection in `onFinish` depends on thrown errors.

4. **`isToolResultEnvelope()`** — Needed in `onFinish` to extract `.data` from envelopes before running `JSON.stringify().slice(0, 500)` for previews. Without this, preview strings contain envelope metadata (`{"ok":true,"data":...`) instead of actual results.

### Step B.3 — Update `route.ts` imports

**File**: `app/api/chat/route.ts`
**Location**: Import section (lines 1-37)

**Add** this import:

```typescript
import {
  ToolTraceCollector,
  wrapMcpTools,
  isToolResultEnvelope,
} from "@/lib/tools/mcp-wrapper"
```

**Remove** this import (will be unused after Step B.4):

```typescript
import { wrapToolsWithTruncation } from "@/lib/tools/utils"
```

**Keep** the config import unchanged — `MCP_TOOL_EXECUTION_TIMEOUT_MS` is used internally by `mcp-wrapper.ts`, not by `route.ts`.

### Step B.4 — Replace `wrapToolsWithTruncation` call with `wrapMcpTools`

**File**: `app/api/chat/route.ts`
**Location**: Lines 295-302

**Current code**:

```typescript
// Wrap MCP tools with result truncation before merging.
// MCP tools connect to arbitrary user-configured servers that can return
// unbounded results. Unlike Layer 1 (provider-managed limits) and Layer 2
// (Exa's own maxCharacters + explicit truncation), Layer 3 has no built-in
// size safety net.
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapToolsWithTruncation(mcpTools) as ToolSet
}
```

**Replace with**:

```typescript
// Wrap MCP tools with timeout, timing, truncation, and envelope.
// Single wrapper handles all Layer 3 concerns — follows the Exa gold
// standard pattern (lib/tools/third-party.ts:82-119).
// Replaces the previous wrapToolsWithTruncation(mcpTools) call.
const traceCollector = new ToolTraceCollector()

if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapMcpTools(mcpTools, {
    toolServerMap: mcpToolServerMap,
    traceCollector,
  }) as ToolSet
}
```

**IMPORTANT**: `traceCollector` must be declared OUTSIDE the `if` block so that it's in scope for `onStepFinish` and `onFinish` closures even when there are no MCP tools. When there are no MCP tools, `traceCollector.get()` simply returns `undefined` — no special handling needed.

### Step B.5 — Wire `traceCollector` into `onStepFinish`

**File**: `app/api/chat/route.ts`
**Location**: The `onStepFinish` callback (modified in Step A.2)

Update the structured log to read trace data from the collector:

**Change the `durationMs` line in the JSON.stringify block from**:

```typescript
durationMs: null, // Per-tool timing added in Phase B
```

**To**:

```typescript
durationMs: traceCollector.get(call.toolCallId)?.durationMs ?? null,
```

This is the only change needed. When the tool has no trace (Layer 1/2 tools), `get()` returns `undefined` and the `??` produces `null`.

### Step B.6 — Update MCP audit log in `onFinish` to extract from envelopes

**File**: `app/api/chat/route.ts`
**Location**: The MCP audit logging block in `onFinish` (lines 681-724)

In the inner loop where `toolResult` is found, update the `outputPreview` and add `durationMs` from the trace collector.

**Current code** (lines 709-716):

```typescript
void fetchMutation(
  api.toolCallLog.log,
  {
    chatId: chatId as Id<"chats">,
    serverId: serverInfo.serverId as Id<"mcpServers">,
    toolName: serverInfo.displayName,
    toolCallId: toolCall.toolCallId,
    inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
    outputPreview: toolResult
      ? JSON.stringify(toolResult.output).slice(0, 500)
      : undefined,
    success,
    source: "mcp",
    serviceName: serverInfo.serverName,
  },
  { token: convexToken }
)
```

**Replace with**:

```typescript
// Extract data from envelope for preview — avoids wasting
// 500 chars on envelope metadata ({"ok":true,"data":...}).
const output = toolResult?.output
const previewData = isToolResultEnvelope(output)
  ? output.data
  : output
const trace = traceCollector.get(toolCall.toolCallId)

void fetchMutation(
  api.toolCallLog.log,
  {
    chatId: chatId as Id<"chats">,
    serverId: serverInfo.serverId as Id<"mcpServers">,
    toolName: serverInfo.displayName,
    toolCallId: toolCall.toolCallId,
    inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
    outputPreview: previewData
      ? JSON.stringify(previewData).slice(0, 500)
      : undefined,
    success,
    durationMs: trace?.durationMs,
    error: trace?.error,
    source: "mcp",
    serviceName: serverInfo.serverName,
  },
  { token: convexToken }
)
```

**Key changes**:
1. `outputPreview` now extracts `.data` from the envelope before stringifying
2. `durationMs` now comes from the trace collector (actual per-tool timing, not total stream duration)
3. `error` is now populated from the trace collector

### Step B.7 — Verify

```bash
bun run typecheck
bun run lint
```

**Manual verification**: Check that `wrapToolsWithTruncation` is no longer imported in `route.ts`. If it's still used elsewhere, keep the export in `utils.ts`. If `route.ts` was the only consumer, the function can stay (no need to delete — it's still useful for potential future consumers).

### Phase B Acceptance Criteria

- [ ] `lib/tools/mcp-wrapper.ts` created with `ToolTimeoutError`, `ToolTraceCollector`, `wrapMcpTools`, `isToolResultEnvelope`
- [ ] `MCP_TOOL_EXECUTION_TIMEOUT_MS = 30_000` added to `lib/config.ts`
- [ ] `route.ts` imports `wrapMcpTools` instead of `wrapToolsWithTruncation`
- [ ] `traceCollector` declared before `streamText()` and shared via closures
- [ ] `onStepFinish` reads `durationMs` from `traceCollector`
- [ ] MCP audit log in `onFinish` extracts `.data` from envelopes and uses trace data
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes

---

## Phase C — Observability Enrichment

**Goal**: Enrich existing storage (Convex + PostHog) with trace data and add timeout protection to Exa.
**Effort**: ~4 hours
**Files modified**: `convex/schema.ts`, `convex/toolCallLog.ts`, `app/api/chat/route.ts`, `lib/tools/third-party.ts`

### Step C.1 — Extend Convex `toolCallLog` schema

**File**: `convex/schema.ts`
**Location**: `toolCallLog` table definition (lines 158-183)

Add new optional fields after the existing `serviceName` field (line 178). All fields are `v.optional()` — backward compatible, no migration needed.

**Add these fields before the closing `})` of the `defineTable()`**:

```typescript
// --- Phase C: Observability enrichment (all optional, backward compatible) ---

// Step number within the streaming response (1-indexed).
// Enables ordering tool calls chronologically within a single generation.
stepNumber: v.optional(v.number()),

// Token usage for the step that produced this tool call.
// Captured from onStepFinish usage — NOT per-tool, but per-step.
inputTokens: v.optional(v.number()),
outputTokens: v.optional(v.number()),

// Original result size in bytes before truncation.
// Helps identify tools that consistently return large results.
resultSizeBytes: v.optional(v.number()),
```

**Do NOT** change any existing fields or indexes.

### Step C.2 — Extend Convex `toolCallLog.log` mutation args

**File**: `convex/toolCallLog.ts`
**Location**: The `log` mutation args (lines 38-55)

Add the new optional args to match the schema:

```typescript
args: {
  chatId: v.optional(v.id("chats")),
  serverId: v.optional(v.id("mcpServers")),
  toolName: v.string(),
  toolCallId: v.string(),
  inputPreview: v.optional(v.string()),
  outputPreview: v.optional(v.string()),
  success: v.boolean(),
  durationMs: v.optional(v.number()),
  error: v.optional(v.string()),
  source: v.union(
    v.literal("builtin"),
    v.literal("third-party"),
    v.literal("mcp")
  ),
  serviceName: v.optional(v.string()),
  // Phase C: Observability enrichment
  stepNumber: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  resultSizeBytes: v.optional(v.number()),
},
```

And update the `ctx.db.insert` call to include the new fields:

```typescript
return await ctx.db.insert("toolCallLog", {
  userId: user._id,
  chatId: args.chatId,
  serverId: args.serverId,
  toolName: args.toolName,
  toolCallId: args.toolCallId,
  inputPreview: truncatePreview(args.inputPreview),
  outputPreview: truncatePreview(args.outputPreview),
  success: args.success,
  durationMs: args.durationMs,
  error: args.error ? truncatePreview(args.error) : undefined,
  source: args.source,
  serviceName: args.serviceName,
  // Phase C: Observability enrichment
  stepNumber: args.stepNumber,
  inputTokens: args.inputTokens,
  outputTokens: args.outputTokens,
  resultSizeBytes: args.resultSizeBytes,
  createdAt: Date.now(),
})
```

### Step C.3 — Enrich MCP audit log writes with step/token data

**File**: `app/api/chat/route.ts`
**Location**: MCP audit logging in `onFinish` (the block modified in Step B.6)

The `onFinish` callback receives `steps` but does not currently track which step number a tool call belongs to. We need to add a step counter within the `onFinish` loop.

**In the MCP audit block** (starts at line ~685), add step tracking:

```typescript
if (convexToken && steps && mcpToolServerMap.size > 0) {
  let finishStepNumber = 0  // ← ADD step counter

  for (const step of steps) {
    finishStepNumber++  // ← INCREMENT per step

    if (step.toolCalls) {
      for (const toolCall of step.toolCalls) {
        const serverInfo = mcpToolServerMap.get(toolCall.toolName)
        if (!serverInfo) continue

        const toolResult = step.toolResults?.find(
          (r: { toolCallId: string }) =>
            r.toolCallId === toolCall.toolCallId
        )
        const success = toolResult
          ? !(toolResult as { isError?: boolean }).isError
          : false

        const output = toolResult?.output
        const previewData = isToolResultEnvelope(output)
          ? output.data
          : output
        const trace = traceCollector.get(toolCall.toolCallId)

        void fetchMutation(
          api.toolCallLog.log,
          {
            chatId: chatId as Id<"chats">,
            serverId: serverInfo.serverId as Id<"mcpServers">,
            toolName: serverInfo.displayName,
            toolCallId: toolCall.toolCallId,
            inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
            outputPreview: previewData
              ? JSON.stringify(previewData).slice(0, 500)
              : undefined,
            success,
            durationMs: trace?.durationMs,
            error: trace?.error,
            source: "mcp",
            serviceName: serverInfo.serverName,
            // Phase C: Observability enrichment
            stepNumber: finishStepNumber,
            inputTokens: step.usage?.inputTokens,
            outputTokens: step.usage?.outputTokens,
            resultSizeBytes: trace?.resultSizeBytes,
          },
          { token: convexToken }
        ).catch(() => {
          // Intentionally swallowed — audit logging is best-effort
        })
      }
    }
  }
}
```

**Note**: `step.usage` contains the token usage for that specific step. This is per-step, not per-tool — which is clearly documented in the schema field comment.

### Step C.4 — Enrich non-MCP audit log writes

**File**: `app/api/chat/route.ts`
**Location**: Non-MCP audit logging in `onFinish` (lines 726-778)

Apply the same enrichment pattern. Add a step counter and include the new fields:

```typescript
if (convexToken && steps) {
  const nonMcpMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata])

  if (nonMcpMetadata.size > 0) {
    let finishStepNumber = 0  // ← ADD step counter

    for (const step of steps) {
      finishStepNumber++  // ← INCREMENT per step

      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          if (mcpToolServerMap.get(toolCall.toolName)) continue

          const meta = nonMcpMetadata.get(toolCall.toolName)
          if (!meta) continue

          const toolResult = step.toolResults?.find(
            (r: { toolCallId: string }) =>
              r.toolCallId === toolCall.toolCallId
          )
          const success = toolResult
            ? !(toolResult as { isError?: boolean }).isError
            : false

          // For non-MCP tools, check if result is enveloped (Exa uses envelopes)
          const output = toolResult?.output
          const previewData = isToolResultEnvelope(output)
            ? output.data
            : output

          void fetchMutation(
            api.toolCallLog.log,
            {
              chatId: chatId as Id<"chats">,
              toolName: meta.displayName,
              toolCallId: toolCall.toolCallId,
              inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
              outputPreview: previewData
                ? JSON.stringify(previewData).slice(0, 500)
                : undefined,
              success,
              // FIX: Use actual per-tool duration instead of total stream duration.
              // For Exa, the envelope's meta.durationMs has the real timing.
              // For builtin tools, we don't have per-tool timing (no trace collector).
              durationMs: isToolResultEnvelope(output)
                ? output.meta.durationMs
                : undefined,
              source: meta.source,
              serviceName: meta.serviceName,
              // Phase C: Observability enrichment
              stepNumber: finishStepNumber,
              inputTokens: step.usage?.inputTokens,
              outputTokens: step.usage?.outputTokens,
            },
            { token: convexToken }
          ).catch(() => {
            // Intentionally swallowed — audit logging is best-effort
          })
        }
      }
    }
  }
}
```

**Key fix**: The previous code used `durationMs: Date.now() - streamStartMs` which recorded total stream duration, not per-tool timing. The research flagged this as a known bug at `route.ts:765`. Now:
- **MCP tools**: Use `trace.durationMs` from the collector (Phase B)
- **Exa (third-party)**: Use `output.meta.durationMs` from the envelope (already exists)
- **Builtin tools**: `undefined` (provider-managed, no timing available)

### Step C.5 — Enrich PostHog `tool_call` events

**File**: `app/api/chat/route.ts`
**Location**: PostHog tool_call event block in `onFinish` (lines 625-671)

Add trace data to PostHog events. Inside the `for (const toolCall of step.toolCalls)` loop, after the existing `phClient.capture()` call, enrich the properties:

**Add to the `properties` object inside `phClient.capture()`**:

```typescript
phClient.capture({
  distinctId: userId,
  event: "tool_call",
  properties: {
    toolName: displayName,
    rawToolName: toolCall.toolName,
    source,
    serviceName,
    success,
    chatId,
    // Phase C: Observability enrichment
    durationMs: traceCollector.get(toolCall.toolCallId)?.durationMs ?? undefined,
    // MCP-specific (optional)
    ...(mcpServerInfo && {
      serverId: mcpServerInfo.serverId,
      serverName: mcpServerInfo.serverName,
    }),
  },
})
```

**Note**: Only MCP tools will have trace data. For Layer 1/2 tools, `durationMs` will be `undefined` — PostHog ignores undefined properties.

### Step C.6 — Add timeout protection to Exa (Layer 2)

**File**: `lib/tools/third-party.ts`
**Location**: The `execute` function inside the `web_search` tool (lines 82-119)

Add `Promise.race` with timeout inside the existing function body — not a wrapper, just an inline addition following the same pattern as `wrapMcpTools`.

**Current code** (lines 82-96):

```typescript
execute: async ({ query }) => {
  const startMs = Date.now()
  try {
    const { results } = await exa.searchAndContents(query, {
      type: "auto",
      numResults: 5,
      text: { maxCharacters: 2000 },
      livecrawl: "fallback",
    })
```

**Replace with**:

```typescript
execute: async ({ query }) => {
  const startMs = Date.now()
  try {
    const { results } = await Promise.race([
      exa.searchAndContents(query, {
        type: "auto",
        numResults: 5,
        text: { maxCharacters: 2000 },
        livecrawl: "fallback",
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Exa search timed out after ${TOOL_EXECUTION_TIMEOUT_MS}ms`
              )
            ),
          TOOL_EXECUTION_TIMEOUT_MS
        )
      ),
    ])
```

**Add import** at the top of `lib/tools/third-party.ts`:

```typescript
import { TOOL_EXECUTION_TIMEOUT_MS } from "@/lib/config"
```

**Why a plain `Error` instead of `ToolTimeoutError`**: Exa is Layer 2 and doesn't use the trace collector. `ToolTimeoutError` is specific to Layer 3 (MCP wrapper). Using a plain error keeps the dependency clean — `third-party.ts` doesn't need to import from `mcp-wrapper.ts`.

### Step C.7 — Verify

```bash
bun run typecheck
bun run lint
```

Then verify the Convex schema change deploys cleanly:

```bash
bun run dev  # Start dev server, Convex will auto-deploy schema
```

Check the Convex dashboard for any schema migration errors (there should be none — all new fields are `v.optional()`).

### Phase C Acceptance Criteria

- [ ] Convex `toolCallLog` schema has 4 new optional fields
- [ ] Convex `toolCallLog.log` mutation accepts and stores the new fields
- [ ] MCP audit log writes include `stepNumber`, `inputTokens`, `outputTokens`, `resultSizeBytes`
- [ ] Non-MCP audit log writes include `stepNumber`, `inputTokens`, `outputTokens`
- [ ] Non-MCP audit log uses actual per-tool `durationMs` from envelope (fixes the stream-duration bug)
- [ ] PostHog `tool_call` events include `durationMs` from trace collector
- [ ] Exa search has `Promise.race` timeout at `TOOL_EXECUTION_TIMEOUT_MS` (15s)
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] Convex schema deploys without errors

---

## Phase D — Tests

**Goal**: Verify wrapper behavior with unit tests.
**Effort**: ~2.5 hours
**Files created**: `lib/tools/__tests__/mcp-wrapper.test.ts` (1 new file)

### Step D.1 — Create test file

**File**: `lib/tools/__tests__/mcp-wrapper.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest"
import {
  wrapMcpTools,
  ToolTraceCollector,
  ToolTimeoutError,
  isToolResultEnvelope,
} from "../mcp-wrapper"
import type { ToolSet } from "ai"
import type { ToolResultEnvelope } from "../types"

// ── Helpers ──────────────────────────────────────────────

/** Create a minimal tool with the given execute function */
function makeTool(
  executeFn: (params: unknown, options: { toolCallId: string }) => Promise<unknown>
) {
  return {
    description: "test tool",
    parameters: { type: "object", properties: {} },
    execute: executeFn,
  }
}

/** Create a standard WrapMcpToolsConfig for tests */
function makeConfig(overrides?: {
  timeoutMs?: number
  maxResultBytes?: number
}) {
  const traceCollector = new ToolTraceCollector()
  return {
    toolServerMap: new Map([
      [
        "test_tool",
        {
          displayName: "Test Tool",
          serverName: "test-server",
          serverId: "server123",
        },
      ],
    ]),
    traceCollector,
    ...overrides,
  }
}

// ── wrapMcpTools ─────────────────────────────────────────

describe("wrapMcpTools", () => {
  it("wraps a tool that resolves before timeout", async () => {
    const config = makeConfig({ timeoutMs: 5000 })
    const tools = {
      test_tool: makeTool(async () => ({ answer: 42 })),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)
    const result = await (wrapped.test_tool as { execute: Function }).execute(
      {},
      { toolCallId: "call_1" }
    ) as ToolResultEnvelope

    // Envelope structure
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ answer: 42 })
    expect(result.error).toBeNull()
    expect(result.meta.tool).toBe("Test Tool")
    expect(result.meta.source).toBe("mcp")
    expect(result.meta.serverName).toBe("test-server")
    expect(typeof result.meta.durationMs).toBe("number")
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0)

    // Trace recorded
    const trace = config.traceCollector.get("call_1")
    expect(trace).toBeDefined()
    expect(trace!.success).toBe(true)
    expect(trace!.toolName).toBe("test_tool")
    expect(trace!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("throws ToolTimeoutError when tool exceeds timeout", async () => {
    const config = makeConfig({ timeoutMs: 50 }) // 50ms timeout
    const tools = {
      test_tool: makeTool(
        () => new Promise((resolve) => setTimeout(resolve, 5000)) // hangs for 5s
      ),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)

    await expect(
      (wrapped.test_tool as { execute: Function }).execute(
        {},
        { toolCallId: "call_timeout" }
      )
    ).rejects.toThrow(ToolTimeoutError)

    // Trace records the failure
    const trace = config.traceCollector.get("call_timeout")
    expect(trace).toBeDefined()
    expect(trace!.success).toBe(false)
    expect(trace!.error).toContain("timed out")
    expect(trace!.durationMs).toBeLessThan(500) // Should fail fast
  })

  it("throws and traces when tool execute() rejects", async () => {
    const config = makeConfig({ timeoutMs: 5000 })
    const tools = {
      test_tool: makeTool(async () => {
        throw new Error("API rate limited")
      }),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)

    await expect(
      (wrapped.test_tool as { execute: Function }).execute(
        {},
        { toolCallId: "call_error" }
      )
    ).rejects.toThrow("API rate limited")

    const trace = config.traceCollector.get("call_error")
    expect(trace).toBeDefined()
    expect(trace!.success).toBe(false)
    expect(trace!.error).toBe("API rate limited")
  })

  it("passes through tools without execute unchanged", () => {
    const config = makeConfig()
    const providerTool = { description: "provider tool", parameters: {} }
    const tools = {
      provider_tool: providerTool,
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)
    expect(wrapped.provider_tool).toBe(providerTool)
  })

  it("truncates large results", async () => {
    const config = makeConfig({ timeoutMs: 5000, maxResultBytes: 100 })
    const largeResult = "x".repeat(1000)
    const tools = {
      test_tool: makeTool(async () => largeResult),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)
    const result = await (wrapped.test_tool as { execute: Function }).execute(
      {},
      { toolCallId: "call_large" }
    ) as ToolResultEnvelope

    expect(result.ok).toBe(true)
    // The data should be truncated (contains truncation marker)
    const dataStr = typeof result.data === "string" ? result.data : JSON.stringify(result.data)
    expect(dataStr.length).toBeLessThan(1000)

    // Trace should record original size
    const trace = config.traceCollector.get("call_large")
    expect(trace).toBeDefined()
    expect(trace!.resultSizeBytes).toBeGreaterThan(100)
  })
})

// ── ToolTraceCollector ───────────────────────────────────

describe("ToolTraceCollector", () => {
  it("records and retrieves traces by toolCallId", () => {
    const collector = new ToolTraceCollector()
    collector.record({
      toolName: "search",
      toolCallId: "call_1",
      durationMs: 150,
      success: true,
      resultSizeBytes: 2048,
    })
    collector.record({
      toolName: "fetch",
      toolCallId: "call_2",
      durationMs: 300,
      success: false,
      error: "Connection refused",
    })

    expect(collector.get("call_1")?.durationMs).toBe(150)
    expect(collector.get("call_1")?.success).toBe(true)

    expect(collector.get("call_2")?.success).toBe(false)
    expect(collector.get("call_2")?.error).toBe("Connection refused")

    expect(collector.get("nonexistent")).toBeUndefined()
  })

  it("returns all traces via getAll()", () => {
    const collector = new ToolTraceCollector()
    collector.record({
      toolName: "a",
      toolCallId: "call_a",
      durationMs: 10,
      success: true,
    })
    collector.record({
      toolName: "b",
      toolCallId: "call_b",
      durationMs: 20,
      success: true,
    })

    const all = collector.getAll()
    expect(all).toHaveLength(2)
    expect(all.map((t) => t.toolName)).toEqual(
      expect.arrayContaining(["a", "b"])
    )
  })
})

// ── isToolResultEnvelope ─────────────────────────────────

describe("isToolResultEnvelope", () => {
  it("returns true for valid envelopes", () => {
    const envelope: ToolResultEnvelope = {
      ok: true,
      data: { result: "hello" },
      error: null,
      meta: { tool: "test", source: "mcp", durationMs: 100 },
    }
    expect(isToolResultEnvelope(envelope)).toBe(true)
  })

  it("returns false for non-envelope objects", () => {
    expect(isToolResultEnvelope({ result: "hello" })).toBe(false)
    expect(isToolResultEnvelope({ ok: true })).toBe(false)
    expect(isToolResultEnvelope({ ok: true, data: null })).toBe(false)
    expect(isToolResultEnvelope(null)).toBe(false)
    expect(isToolResultEnvelope(undefined)).toBe(false)
    expect(isToolResultEnvelope("string")).toBe(false)
    expect(isToolResultEnvelope(42)).toBe(false)
  })
})

// ── ToolTimeoutError ─────────────────────────────────────

describe("ToolTimeoutError", () => {
  it("has correct name, toolName, and timeoutMs", () => {
    const err = new ToolTimeoutError("my_tool", 30000)
    expect(err.name).toBe("ToolTimeoutError")
    expect(err.toolName).toBe("my_tool")
    expect(err.timeoutMs).toBe(30000)
    expect(err.message).toContain("my_tool")
    expect(err.message).toContain("30000ms")
    expect(err instanceof Error).toBe(true)
  })
})
```

### Step D.2 — Run tests

```bash
bun run test lib/tools/__tests__/mcp-wrapper.test.ts
```

All tests should pass. If any fail, fix the implementation code — not the tests.

### Step D.3 — Run full test suite

```bash
bun run test
```

Ensure no regressions in existing tests.

### Phase D Acceptance Criteria

- [ ] All `wrapMcpTools` tests pass (success, timeout, error, passthrough, truncation)
- [ ] All `ToolTraceCollector` tests pass (record, retrieve, getAll)
- [ ] All `isToolResultEnvelope` tests pass (positive and negative cases)
- [ ] `ToolTimeoutError` test passes (name, properties, inheritance)
- [ ] Full test suite (`bun run test`) passes with no regressions

---

## Implementation Order Summary

```
Phase A (30 min)  → route.ts only: stepCounter + remove NODE_ENV gate + structured logs
                    ↓ verify: typecheck + lint
Phase B (4 hr)    → new mcp-wrapper.ts + route.ts integration
                    ↓ verify: typecheck + lint
Phase C (4 hr)    → Convex schema + route.ts enrichment + Exa timeout
                    ↓ verify: typecheck + lint + Convex deploy
Phase D (2.5 hr)  → unit tests
                    ↓ verify: all tests pass
```

Each phase is independently deployable. Phase A can ship to production immediately. Phase B depends on A being in place (references `stepCounter`). Phase C depends on B (references `traceCollector` and `isToolResultEnvelope`). Phase D tests Phase B's code.

---

## Critical Gotchas for the Implementing Agent

### 1. Do NOT wrap Layer 1 (provider) tools
Provider tools have `providerExecuted: true` — the SDK bypasses user-land `execute()` entirely. The `wrapMcpTools()` function checks `typeof original.execute !== "function"` and passes these through. Never change this.

### 2. Do NOT envelope errors
The AI SDK detects tool failures via `isError: true` on tool results. This detection depends on `execute()` throwing. If you envelope errors instead of re-throwing, `isError` will be `false` and audit logs will record failures as successes.

### 3. `traceCollector` scope matters
`traceCollector` MUST be declared before the `if (Object.keys(mcpTools).length > 0)` block so it's in scope for `onStepFinish` and `onFinish` closures even when there are no MCP tools. When `traceCollector.get()` returns `undefined`, use optional chaining (`?.`) — no special handling needed.

### 4. `toolResult.output` typing
The AI SDK types `toolResult.output` as `unknown`. When checking if it's an envelope, always use `isToolResultEnvelope()` — never cast directly.

### 5. Convex schema fields must be `v.optional()`
All new fields in the `toolCallLog` schema MUST be `v.optional()`. Convex does not support default values in schemas. Existing rows will have `undefined` for new fields — this is expected and safe.

### 6. `streamStartMs` vs `trace.durationMs`
The existing code at route.ts:766 uses `Date.now() - streamStartMs` which records total stream duration, not per-tool timing. Phase C fixes this for Exa (via envelope `meta.durationMs`) and MCP (via trace collector). For builtin tools, per-tool timing remains unavailable — use `undefined`, not `0`.

### 7. Import cleanup
After Phase B, `wrapToolsWithTruncation` should be removed from `route.ts` imports. The function itself stays in `utils.ts` (it's still exported and could be used by future consumers). Do NOT delete the function from `utils.ts`.

### 8. `finishStepNumber` is separate from `stepCounter`
`stepCounter` in Phase A counts steps during streaming (in `onStepFinish`). `finishStepNumber` in Phase C counts steps in `onFinish` by iterating `steps[]`. These are the same values but computed independently because `onFinish` doesn't have access to `stepCounter`'s final value when processing step data. Using the same pattern (incrementing counter per step) ensures consistency.

---

## Files Modified/Created (Summary)

| Phase | File | Action |
|-------|------|--------|
| A | `app/api/chat/route.ts` | Modified (stepCounter, onStepFinish) |
| B | `lib/tools/mcp-wrapper.ts` | **Created** |
| B | `lib/config.ts` | Modified (add constant) |
| B | `app/api/chat/route.ts` | Modified (imports, wrapMcpTools, onFinish) |
| C | `convex/schema.ts` | Modified (add optional fields) |
| C | `convex/toolCallLog.ts` | Modified (add args + insert fields) |
| C | `app/api/chat/route.ts` | Modified (enrich audit + PostHog) |
| C | `lib/tools/third-party.ts` | Modified (add timeout) |
| D | `lib/tools/__tests__/mcp-wrapper.test.ts` | **Created** |

**Total**: 2 new files, 5 modified files.
