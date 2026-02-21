# Tool Calling Hardening — Implementation Plan

> **Status**: Ready for Implementation
> **Priority**: P0 — Ship before expanding tool count
> **Timeline**: ~1 week (6 phases, Phase 4 parallelizable with 2→3 sequence)
> **Date**: February 12, 2026
> **Research**: `.agents/research/multi-tool-calling-system-design.md`
> **Skill**: `.agents/skills/multiple-tool-calling-design-pattern/SKILL.md`
> **Depends on**: Phases 1–5 of tool infrastructure (already shipped)
> **AI SDK**: v6.0.78 (`ai`), v3.0.26 (`@ai-sdk/openai`), v3.0.41 (`@ai-sdk/anthropic`), v3.0.24 (`@ai-sdk/google`)

---

## Purpose

This plan hardens the existing tool calling infrastructure to industry-standard quality before expanding tool count. It implements the six highest-impact recommendations from the multi-tool-calling system design research: granular capability gating, result truncation, structured result envelopes, step restriction, structured observability, and Anthropic token efficiency.

## How to Use This Plan

Each phase is self-contained with:

- **Context to load** — files to read before starting
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete
- **Files touched** — exact list of creates/modifies

**Parallelization map:**

```
Phase 1 (ToolCapabilities)
    ├──→ Phase 2 (Result Truncation)          ← after 1
    │        └──→ Phase 3 (Structured Envelopes) ← after 2 (shared file)
    ├──→ Phase 4 (Anthropic Token Efficiency)  ← parallel with 2→3
    └──→ Phase 5 (prepareStep)                ← after 1
              └──→ Phase 6 (onStepFinish Tracing) ← after 5
```

Phase 2 must complete before Phase 3 — both modify `lib/tools/third-party.ts` and Phase 3's envelope wraps Phase 2's truncation. Phase 4 can run in parallel with the 2→3 sequence. Phase 5 depends on Phase 1 (uses `resolveToolCapabilities`). Phase 6 depends on Phase 5 (uses metadata from `prepareStep` integration).

---

## Phase 1: `ToolCapabilities` Type and Dual-Gate Injection

> **Effort**: S (< 1 day)
> **Files modified**: `lib/tools/types.ts`, `lib/models/types.ts`, `lib/models/data/openrouter.ts`, `app/api/chat/route.ts`
> **Dependencies**: None
> **Rationale**: Every industry system gates tools by model capability. The current binary `tools !== false` check doesn't distinguish search vs. code vs. MCP. This must be in place before adding any new tool types.

### Context to Load

```
@lib/tools/types.ts                   # Current ToolSource, ToolMetadata
@lib/models/types.ts                  # ModelConfig type (line 21: tools?: boolean)
@app/api/chat/route.ts                # shouldInjectSearch check (line 193)
```

### Step 1.1: Add `ToolCapabilities` Interface

In `lib/tools/types.ts`, add below the existing `ToolMetadata` interface (after line 29):

```typescript
/**
 * Granular per-capability control for model tool access.
 * Replaces the binary `tools?: boolean` in ModelConfig.
 *
 * All fields default to `true` when omitted — preserves backward
 * compatibility with existing `tools: undefined` (all tools enabled).
 *
 * When `tools: false` on a ModelConfig, ALL capabilities are disabled.
 * When `tools: ToolCapabilities`, individual capabilities can be toggled.
 */
export interface ToolCapabilities {
  /** Web search (Layer 1 provider tools + Layer 2 Exa). Default: true */
  search?: boolean
  /** Code execution (provider sandboxes, future). Default: true */
  code?: boolean
  /** MCP server tools (Layer 3). Default: true */
  mcp?: boolean
}

/**
 * Resolve a ModelConfig.tools value into individual capability flags.
 * Handles the boolean → ToolCapabilities migration.
 *
 * @param tools - The raw tools value from ModelConfig
 * @returns Resolved capabilities (all default to true)
 */
export function resolveToolCapabilities(
  tools: boolean | ToolCapabilities | undefined
): Required<ToolCapabilities> {
  if (tools === false) return { search: false, code: false, mcp: false }
  if (tools === true || tools === undefined) return { search: true, code: true, mcp: true }
  return {
    search: tools.search !== false,
    code: tools.code !== false,
    mcp: tools.mcp !== false,
  }
}
```

Also remove the deferred note on line 31–32 (`// NOTE: ToolCapabilities interface...`).

### Step 1.2: Widen `ModelConfig.tools` Type

In `lib/models/types.ts`, change line 21:

```typescript
// BEFORE:
tools?: boolean

// AFTER:
// Add import at top of file:
import type { ToolCapabilities } from "@/lib/tools/types"

// Then change line 21:
tools?: boolean | ToolCapabilities
```

### Step 1.3: Clean Up `apiSdk` Signature

While in `lib/models/types.ts`, remove the dead `opts` parameter from `apiSdk` (lines 46–49):

```typescript
// BEFORE:
apiSdk?: (
  apiKey?: string,
  opts?: { enableSearch?: boolean }
) => LanguageModelV3

// AFTER:
apiSdk?: (apiKey?: string) => LanguageModelV3
```

Then clean up all model config `apiSdk` signatures that accept the dead `opts` parameter. There are **19 instances** in `lib/models/data/openrouter.ts` — each defines `(apiKey?: string, opts?: { enableSearch?: boolean }) => ...` with dead `opts?.enableSearch` logic that conditionally enabled the OpenRouter web search plugin via `extraBody: { plugins: [...] }`. This was the old search mechanism replaced by the 3-layer tool injection system. Remove the `opts` parameter and the conditional `extraBody` block from all 19 OpenRouter model configs. Route.ts already calls `modelConfig.apiSdk(apiKey)` without opts (line 171).

**Files additionally modified**: `lib/models/data/openrouter.ts`

### Step 1.4: Update Route.ts to Use Dual-Gate

In `app/api/chat/route.ts`, replace the binary capability checks with the resolver:

```typescript
// ADD import near top (after line 19):
import { resolveToolCapabilities } from "@/lib/tools/types"

// REPLACE line 193:
// BEFORE:
const shouldInjectSearch = enableSearch && modelConfig.tools !== false

// AFTER:
const capabilities = resolveToolCapabilities(modelConfig.tools)
const shouldInjectSearch = enableSearch && capabilities.search
```

Update the MCP gate (lines 254–258):

```typescript
// BEFORE:
if (
  isAuthenticated &&
  convexToken &&
  modelConfig.tools !== false
) {

// AFTER:
if (
  isAuthenticated &&
  convexToken &&
  capabilities.mcp
) {
```

### Verify Phase 1

1. **Typecheck**: `bun run typecheck` — no errors
2. **Lint**: `bun run lint` — no errors
3. **Backward compat**: Models with `tools: undefined` still get all tools
4. **Binary compat**: Models with `tools: false` still get no tools (Perplexity models)
5. **Granular test**: Temporarily set a model to `tools: { search: true, mcp: false }` — verify it gets search but no MCP tools
6. **apiSdk cleanup**: All 19 OpenRouter model configs have dead `opts` parameter and `extraBody` plugin blocks removed. Search for `enableSearch` in `lib/models/data/` — should find zero occurrences

---

## Phase 2: `MAX_TOOL_RESULT_SIZE` Enforcement

> **Effort**: S (< 1 day)
> **Files created**: `lib/tools/utils.ts`, `lib/tools/__tests__/utils.test.ts`
> **Files modified**: `lib/tools/third-party.ts`, `lib/tools/types.ts`, `app/api/chat/route.ts`
> **Dependencies**: Phase 1 complete (uses `ToolMetadata`)
> **Parallelizable**: Phase 4 only — Phase 3 must follow Phase 2 (both modify `third-party.ts`)

### Context to Load

```
@lib/config.ts                        # MAX_TOOL_RESULT_SIZE = 100KB (line 195)
@lib/tools/third-party.ts            # Exa tool wrapper (lines 81–94)
@lib/tools/types.ts                  # ToolMetadata interface
```

### Step 2.1: Add `maxResultSize` to `ToolMetadata`

In `lib/tools/types.ts`, add to the `ToolMetadata` interface:

```typescript
/**
 * Maximum result size in bytes for this specific tool.
 * Overrides the global MAX_TOOL_RESULT_SIZE when set.
 * Use for tools that legitimately need larger results (e.g., code execution: 500KB).
 */
maxResultSize?: number
```

### Step 2.2: Create Truncation Utility

Create `lib/tools/utils.ts`:

```typescript
// lib/tools/utils.ts

import { MAX_TOOL_RESULT_SIZE } from "@/lib/config"

/**
 * Truncate a tool result to a maximum byte size.
 * Applied as a safety net AFTER the tool's own execute() returns.
 *
 * Design decisions (from research):
 * - Shape-preserving: arrays truncated by item count, objects keep top-level keys
 * - Model-informed: adds _truncated marker so the model knows data is incomplete
 * - Layer 1 exempt: provider tools manage their own limits (do NOT pass through here)
 *
 * @param result - The raw tool result
 * @param maxBytes - Override for per-tool limits (from ToolMetadata.maxResultSize)
 * @returns The original result if within limits, or a truncated version
 */
export function truncateToolResult(
  result: unknown,
  maxBytes: number = MAX_TOOL_RESULT_SIZE
): unknown {
  const serialized = safeStringify(result)
  const sizeBytes = new TextEncoder().encode(serialized).length

  if (sizeBytes <= maxBytes) return result

  // String: truncation with marker
  // Note: 0.9 factor is conservative for ASCII (the common case for tool
  // results). For multi-byte heavy strings (CJK, emoji), this may slightly
  // overshoot — acceptable since the primary concern is order-of-magnitude
  // protection, not byte-exact limits.
  if (typeof result === "string") {
    const charLimit = Math.floor(maxBytes * 0.9)
    return (
      result.slice(0, charLimit) +
      "\n[truncated — result exceeded size limit]"
    )
  }

  // Array: reduce item count until within budget
  if (Array.isArray(result)) {
    let items = result
    while (items.length > 1) {
      items = items.slice(0, Math.ceil(items.length / 2))
      const size = new TextEncoder().encode(safeStringify(items)).length
      if (size <= maxBytes * 0.95) break // leave room for metadata
    }
    return {
      _truncated: true,
      _originalCount: result.length,
      _returnedCount: items.length,
      data: items,
    }
  }

  // Object: serialize and truncate the string representation
  if (typeof result === "object" && result !== null) {
    const truncatedStr = serialized.slice(0, maxBytes * 0.9)
    return {
      _truncated: true,
      _originalSizeBytes: sizeBytes,
      _raw: truncatedStr + "...",
    }
  }

  // Primitive types: return as-is (unlikely to exceed limits)
  return result
}

/**
 * Check if a tool result was truncated by truncateToolResult().
 */
export function isTruncated(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "_truncated" in result &&
    (result as Record<string, unknown>)._truncated === true
  )
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
```

### Step 2.3: Apply to Exa Tool Wrapper

In `lib/tools/third-party.ts`, wrap the execute return with truncation:

```typescript
// ADD import at top:
import { truncateToolResult } from "./utils"

// REPLACE the execute return (line 88-93):
// BEFORE:
return results.map((r) => ({
  title: r.title ?? undefined,
  url: r.url,
  content: r.text?.slice(0, 2000),
  publishedDate: r.publishedDate ?? undefined,
}))

// AFTER:
const mapped = results.map((r) => ({
  title: r.title ?? undefined,
  url: r.url,
  content: r.text?.slice(0, 2000),
  publishedDate: r.publishedDate ?? undefined,
}))
return truncateToolResult(mapped)
```

### Step 2.4: Add Truncation Logging

In `lib/tools/utils.ts`, add a warning when truncation occurs (inside `truncateToolResult`, before returning truncated values):

```typescript
if (sizeBytes > maxBytes) {
  console.warn(
    `[tools] Result truncated: ${sizeBytes} bytes → ${maxBytes} bytes limit`
  )
}
```

### Step 2.5: Wrap MCP Tools with Result Truncation

MCP tools connect to arbitrary user-configured servers that can return unbounded results. Unlike Layer 1 (provider-managed limits) and Layer 2 (Exa's own `maxCharacters` + explicit truncation), Layer 3 has no built-in size safety net.

Add a `wrapToolsWithTruncation` utility in `lib/tools/utils.ts`:

```typescript
/**
 * Wrap all tools in a ToolSet with result truncation.
 * Used for tool sources that don't manage their own result sizes
 * (e.g., MCP tools from user-configured servers).
 *
 * Layer 1 tools are exempt (provider-managed limits).
 * Layer 2 tools apply truncation inside their execute() directly.
 */
export function wrapToolsWithTruncation(
  tools: ToolSet,
  maxBytes: number = MAX_TOOL_RESULT_SIZE
): ToolSet {
  const wrapped: Record<string, unknown> = {}
  for (const [name, t] of Object.entries(tools)) {
    const original = t as Record<string, unknown>
    if (typeof original.execute === "function") {
      const origExec = original.execute as (...args: unknown[]) => Promise<unknown>
      wrapped[name] = {
        ...original,
        execute: async (...args: unknown[]) => {
          const result = await origExec(...args)
          return truncateToolResult(result, maxBytes)
        },
      }
    } else {
      wrapped[name] = original
    }
  }
  return wrapped as ToolSet
}
```

In `app/api/chat/route.ts`, apply the wrapper to MCP tools after loading (after the MCP loading block, before the merge):

```typescript
// ADD import near top:
import { wrapToolsWithTruncation } from "@/lib/tools/utils"

// After MCP tools are loaded and before the merge, wrap with truncation:
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapToolsWithTruncation(mcpTools) as ToolSet
}
```

### Verify Phase 2

1. **Typecheck + lint**: `bun run typecheck && bun run lint`
2. **Unit tests**: Add `lib/tools/__tests__/utils.test.ts` covering:
   - Normal-sized results pass through unchanged
   - Oversized string is truncated with marker
   - Oversized array is shape-preserved with `_truncated`, `_originalCount`, `data`
   - `isTruncated()` returns true/false correctly
   - `wrapToolsWithTruncation` wraps execute functions correctly
3. **Normal results pass through**: Send a search query — results should be identical (< 100KB)
4. **MCP truncation**: If MCP is configured, verify large MCP results are truncated (check dev log for `[tools] Result truncated` warning)
5. **Layer 1 not affected**: Provider tools (OpenAI/Anthropic/Google/xAI search) should NOT pass through truncation

---

## Phase 3: Structured Tool Result Envelopes

> **Effort**: XS (< half day)
> **Files modified**: `lib/tools/third-party.ts`
> **Dependencies**: Phase 2 complete (uses `truncateToolResult` from `lib/tools/utils.ts`)
> **Parallelizable**: Phase 4 only — must follow Phase 2 (both modify `third-party.ts`)

### Context to Load

```
@lib/tools/third-party.ts            # Exa tool execute function (lines 81-94)
```

### Step 3.1: Update Exa Tool to Return Structured Envelope

Replace the raw return with a structured envelope in `lib/tools/third-party.ts`:

```typescript
// REPLACE the execute function body (inside the tool definition):
execute: async ({ query }) => {
  const startMs = Date.now()
  try {
    const { results } = await exa.searchAndContents(query, {
      type: "auto",
      numResults: 5,
      text: { maxCharacters: 2000 },
      livecrawl: "fallback",
    })
    const mapped = results.map((r) => ({
      title: r.title ?? undefined,
      url: r.url,
      content: r.text?.slice(0, 2000),
      publishedDate: r.publishedDate ?? undefined,
    }))
    return {
      ok: true,
      data: truncateToolResult(mapped),
      error: null,
      meta: {
        tool: "web_search",
        source: "exa",
        durationMs: Date.now() - startMs,
        resultCount: results.length,
      },
    }
  } catch (err) {
    // Log for observability, then re-throw so the AI SDK sets isError: true
    // on the tool result. This preserves correct success detection in
    // onFinish (PostHog events, audit logs). The SDK passes the error
    // message to the model as a tool result — the model can still
    // explain "search failed" without the app crashing.
    console.error(
      `[tools/exa] Search failed after ${Date.now() - startMs}ms:`,
      err instanceof Error ? err.message : String(err)
    )
    throw err
  }
},
```

**Why this matters**: On success, the model sees structured data with `meta.resultCount` and `meta.durationMs` for transparency. On error, re-throwing preserves the SDK's `isError` flag — critical because the `onFinish` success detection (`!(toolResult as { isError?: boolean }).isError`) relies on it. Returning `{ ok: false }` as a normal result would make ALL failures appear as successes in PostHog and audit logs.

### Step 3.2: Add ToolResultEnvelope Type

In `lib/tools/types.ts`, add below `ToolMetadata`:

```typescript
/**
 * Standardized tool result envelope for Layer 2 (third-party) tools.
 * Layer 1 (provider) tools return opaque results — do NOT wrap them.
 * Layer 3 (MCP) tools return their own format — do NOT wrap them.
 *
 * IMPORTANT: Only used for the SUCCESS path. On error, tools should
 * throw so the AI SDK sets isError: true — this preserves correct
 * success detection in onFinish, PostHog events, and audit logs.
 *
 * This envelope enables:
 * - Structured success data with metadata
 * - Tool result caching (hash the envelope for dedup)
 * - Observability via meta field (duration, result count)
 */
export interface ToolResultEnvelope<T = unknown> {
  ok: boolean
  data: T | null
  error: string | null
  meta: {
    tool: string
    source: string
    durationMs: number
    [key: string]: unknown
  }
}
```

### Verify Phase 3

1. **Typecheck + lint**: `bun run typecheck && bun run lint`
2. **Success path**: Send a search query with a Layer 2 model (Mistral/OpenRouter with Exa). Verify the model receives structured results and responds coherently.
3. **Error path**: Temporarily use an invalid Exa key. Verify the SDK marks the tool result with `isError: true`, the model receives an error message, and the `[tools/exa]` error log appears. The response should NOT crash — the model should gracefully explain the search failure.
4. **Success detection**: In dev mode, verify that successful Exa calls show `success: true` in PostHog/audit logs, and failed calls show `success: false` (via the SDK's `isError` flag).

---

## Phase 4: Anthropic Token-Efficient Tool Use Validation

> **Effort**: XS (< half day)
> **Files modified**: `app/api/chat/route.ts`
> **Dependencies**: Phase 1 complete
> **Parallelizable**: Yes — runs in parallel with Phases 2 and 3

### Context to Load

```
@lib/config.ts                        # ANTHROPIC_BETA_HEADERS (lines 170-177)
@app/api/chat/route.ts               # providerOptions block (lines 387-433), streamText call (line 435)
```

### Step 4.1: Add Token-Efficient Header When Anthropic Has Tools

In `app/api/chat/route.ts`, add AFTER the `providerOptions` block (after line 433) and BEFORE the `streamText()` call (line 435):

```typescript
    // -----------------------------------------------------------------------
    // Anthropic Token-Efficient Tool Use
    //
    // When Anthropic models have tools injected, enable the token-efficient
    // beta header to reduce tool definition token consumption. This header
    // is request-scoped via streamText({ headers }) — only affects Anthropic
    // requests that actually include tools.
    //
    // The header is safe to apply: @ai-sdk/anthropic@3.0.41 comma-merges
    // user and inferred betas (getBetasFromHeaders + Array.from(betas).join(",")).
    // -----------------------------------------------------------------------
    // Add ANTHROPIC_BETA_HEADERS to the existing import from @/lib/config (line 6).
    const requestHeaders: Record<string, string> = {}

    if (provider === "anthropic" && hasAnyTools) {
      requestHeaders["anthropic-beta"] = ANTHROPIC_BETA_HEADERS.tokenEfficient
    }
```

Then add `headers` to the `streamText()` call:

```typescript
    const result = streamText({
      model: aiModel,
      system: effectiveSystemPrompt,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(maxSteps),
      ...(Object.keys(providerOptions).length > 0 && { providerOptions }),
      ...(Object.keys(requestHeaders).length > 0 && { headers: requestHeaders }),
      // ... rest of streamText options
```

### Step 4.2: Add Dev-Mode Token Logging

In the `onFinish` callback (inside the dev-mode log block, around line 491), add Anthropic tool token tracking:

```typescript
if (process.env.NODE_ENV !== "production" && provider === "anthropic" && hasAnyTools) {
  console.log(
    `[chat] Anthropic tool usage — inputTokens: ${usage?.inputTokens ?? "?"}, ` +
    `toolCount: ${Object.keys(allTools).length}, ` +
    `tokenEfficient: true`
  )
}
```

### Verify Phase 4

1. **Typecheck + lint**: `bun run typecheck && bun run lint`
2. **Anthropic with search**: Select a Claude model with search ON. Send a query — verify the response works and the dev log shows `tokenEfficient: true`.
3. **Anthropic without tools**: Select a Claude model with search OFF. Verify no extra header is added (check dev logs — `tokenEfficient` should not appear).
4. **Non-Anthropic unaffected**: Select an OpenAI model with search ON. Verify no `anthropic-beta` header is in the request.
5. **Token comparison** (manual): Compare `inputTokens` for the same prompt with tools on an Anthropic model before and after this change. The header should reduce input tokens for tool definitions.

---

## Phase 5: `prepareStep` for Tool Restriction

> **Effort**: S (< 1 day)
> **Files modified**: `app/api/chat/route.ts`, `lib/tools/types.ts`, `lib/tools/provider.ts`, `lib/tools/third-party.ts`, `lib/config.ts`
> **Dependencies**: Phase 1 complete (uses `capabilities`)

### Context to Load

```
@app/api/chat/route.ts               # streamText call (line 435)
@lib/tools/types.ts                  # ToolMetadata interface
```

### Step 5.1: Add `readOnly` Field to `ToolMetadata`

In `lib/tools/types.ts`, add to the `ToolMetadata` interface:

```typescript
/**
 * Whether this tool is read-only (no side effects).
 * Used by prepareStep to restrict tools after initial steps.
 * Default: true for search tools, false for write tools.
 */
readOnly?: boolean
```

### Step 5.2: Mark Existing Tools as Read-Only

In `lib/tools/provider.ts`, add `readOnly: true` to all search tool metadata entries (4 instances — OpenAI, Anthropic, Google, xAI).

In `lib/tools/third-party.ts`, add `readOnly: true` to the Exa search tool metadata.

### Step 5.3: Add Step Restriction Threshold Constant

In `lib/config.ts`, add below the `ANONYMOUS_MAX_STEP_COUNT` definition:

```typescript
/**
 * Step number after which prepareStep restricts tools to read-only.
 * The model has full tool access for the first N steps; after this
 * threshold, only tools explicitly marked as readOnly: true remain.
 * MCP tools are conservatively included (can't classify read/write yet).
 */
export const PREPARE_STEP_THRESHOLD = 3
```

### Step 5.4: Add `prepareStep` to `streamText()`

In `app/api/chat/route.ts`, add `PREPARE_STEP_THRESHOLD` to the existing import from `@/lib/config`, then add `prepareStep` to the `streamText()` call:

```typescript
    // Collect all tool metadata for prepareStep tool restriction.
    // Merge built-in + third-party metadata (MCP metadata not available here —
    // MCP tools are conservatively included in the safe list).
    const allToolMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata])

    const result = streamText({
      model: aiModel,
      system: effectiveSystemPrompt,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(maxSteps),

      // Restrict tools after PREPARE_STEP_THRESHOLD to prevent runaway
      // tool chains. Only tools explicitly marked readOnly: true remain
      // available. MCP tools are conservatively included (can't classify
      // read/write yet). Unclassified non-MCP tools are restricted
      // (fail closed — new tools must opt in via readOnly: true).
      prepareStep: hasAnyTools
        ? async ({ stepNumber }) => {
            if (stepNumber <= PREPARE_STEP_THRESHOLD) return {}

            // Build safe tool list: only tools explicitly marked readOnly.
            // New tools that omit readOnly default to RESTRICTED (fail closed).
            const safeTools: string[] = []
            for (const [name, meta] of allToolMetadata) {
              if (meta.readOnly === true) safeTools.push(name)
            }
            // Include all MCP tools (can't classify read/write yet)
            for (const name of Object.keys(mcpTools)) {
              if (!safeTools.includes(name)) safeTools.push(name)
            }

            // Fail closed: if no safe tools found, no tools available.
            // This is intentional — prevents unrestricted tool access
            // if readOnly metadata is misconfigured.
            return { activeTools: safeTools }
          }
        : undefined,

      ...(Object.keys(providerOptions).length > 0 && { providerOptions }),
      ...(Object.keys(requestHeaders).length > 0 && { headers: requestHeaders }),
      // ... rest of streamText
```

### Verify Phase 5

1. **Typecheck + lint**: `bun run typecheck && bun run lint`
2. **Normal flow**: Most queries use 1-2 tool calls. Verify behavior is identical to before — no restriction kicks in within `PREPARE_STEP_THRESHOLD` steps.
3. **Multi-step flow**: Ask a complex question that triggers 4+ tool calls (e.g., a research query with multiple searches). Verify that after the threshold, only tools with `readOnly: true` remain available.
4. **MCP tools**: If MCP is configured, verify MCP tools remain available after the threshold (conservative inclusion).
5. **Fail-closed behavior**: If a hypothetical tool lacks `readOnly` metadata, verify it is NOT available after the threshold (default: restricted).
6. **No tools**: Verify `prepareStep` is `undefined` when `hasAnyTools` is false — no callback overhead for tool-less requests.

---

## Phase 6: Structured `onStepFinish` Tracing

> **Effort**: S (< 1 day)
> **Files modified**: `app/api/chat/route.ts`, `lib/tools/types.ts`
> **Dependencies**: Phase 5 complete (metadata map is available)

### Context to Load

```
@app/api/chat/route.ts               # onFinish callback (lines 473-673), streamText call (line 435)
@lib/tools/types.ts                  # ToolMetadata, ToolResultEnvelope
@convex/toolCallLog.ts              # Audit log mutation
```

### Step 6.1: Add `onStepFinish` Callback

In `app/api/chat/route.ts`, add `onStepFinish` to the `streamText()` call, after `prepareStep`:

```typescript
      // Per-step structured tracing.
      // Captures tool name, duration, token usage, and success per step.
      // This data feeds into the existing toolCallLog for trajectory analysis
      // and future trace-based evaluation.
      onStepFinish: ({ stepType, toolCalls, toolResults, usage, finishReason }) => {
        if (process.env.NODE_ENV !== "production" && stepType === "tool-result") {
          for (const call of toolCalls ?? []) {
            const result = toolResults?.find(
              (r: { toolCallId: string }) => r.toolCallId === call.toolCallId
            )
            const success = result
              ? !(result as { isError?: boolean }).isError
              : false
            const meta = allToolMetadata.get(call.toolName)

            console.log(
              `[tools/step] ${meta?.displayName ?? call.toolName} ` +
              `(${meta?.source ?? "unknown"}) — ` +
              `success: ${success}, ` +
              `tokens: ${usage?.promptTokens ?? "?"}in/${usage?.completionTokens ?? "?"}out, ` +
              `finishReason: ${finishReason}`
            )
          }
        }
      },
```

### Step 6.2: Enrich Audit Log with Step-Level Data

In the `onFinish` callback, add `durationMs` to the non-MCP audit log entries. Track timing by adding a timestamp before `streamText()`:

```typescript
// ADD before streamText() call:
const streamStartMs = Date.now()
```

Then in the non-MCP audit log block (around line 650), add:

```typescript
// ADD to the fetchMutation call for non-MCP tools:
// NOTE: This is the full response duration (stream start → onFinish),
// not per-tool-call duration. Per-tool timing requires wrapping each
// tool's execute function, which is deferred to a future phase.
// Still useful for identifying slow conversations.
durationMs: Date.now() - streamStartMs,
```

### Verify Phase 6

1. **Typecheck + lint**: `bun run typecheck && bun run lint`
2. **Dev logging**: In dev mode, send a search query. Verify `[tools/step]` logs appear with tool name, source, success status, and token usage.
3. **No production overhead**: In production mode (`NODE_ENV=production`), verify no `[tools/step]` logs appear.
4. **Audit log enrichment**: Check the Convex `toolCallLog` table — verify `durationMs` is populated for new entries.
5. **No regression**: Verify the existing `onFinish` PostHog events and audit log entries still work correctly.

---

## File Change Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | — | `lib/tools/types.ts`, `lib/models/types.ts`, `lib/models/data/openrouter.ts`, `app/api/chat/route.ts` |
| 2 | `lib/tools/utils.ts`, `lib/tools/__tests__/utils.test.ts` | `lib/tools/third-party.ts`, `lib/tools/types.ts`, `app/api/chat/route.ts` |
| 3 | — | `lib/tools/third-party.ts`, `lib/tools/types.ts` |
| 4 | — | `app/api/chat/route.ts` |
| 5 | — | `app/api/chat/route.ts`, `lib/tools/types.ts`, `lib/tools/provider.ts`, `lib/tools/third-party.ts`, `lib/config.ts` |
| 6 | — | `app/api/chat/route.ts` |

**Phase overlap notes:**
- Phases 2 and 3 both modify `lib/tools/third-party.ts` — Phase 2 must complete first. Phase 3's envelope wraps Phase 2's truncation call inside the success path.
- Phases 2 and 5 both modify `lib/tools/types.ts` — each adds a different field to `ToolMetadata`, so changes are additive and non-conflicting.
- Phases 2, 4, 5, and 6 all modify `app/api/chat/route.ts` — each touches a different section (MCP truncation wrapper, headers block, prepareStep, onStepFinish). Apply in order: 2 → 4 → 5 → 6.

---

## Parallel Execution Guide for AI Agents

If executing with multiple agents, assign as follows:

| Agent | Phases | Files Owned |
|-------|--------|-------------|
| **Agent A** | 1, 5, 6 | `lib/models/types.ts`, `lib/models/data/openrouter.ts`, `app/api/chat/route.ts` |
| **Agent B** | 2, 3 | `lib/tools/utils.ts` (new), `lib/tools/__tests__/utils.test.ts` (new), `lib/tools/third-party.ts` |
| **Agent C** | 4 | `app/api/chat/route.ts` (headers block only) |

**Merge order**: Agent A (Phase 1) → Agent B (Phase 2 → Phase 3) + Agent C (Phase 4) in parallel → Agent A (Phase 5) → Agent A (Phase 6).

**Shared file protocol**: `lib/tools/types.ts` is modified by Agents A and B. Each adds different fields/types — no overlapping edits. `app/api/chat/route.ts` is modified by Agents A and C in non-overlapping sections. Merge in any order within the parallel window.

---

## Integration Test Checklist (Run After All Phases)

Run these end-to-end after all 6 phases are merged:

### Functional Tests

- [ ] **OpenAI + search ON**: GPT-4o with search toggle ON. Ask "What happened in the news today?" — web_search tool fires, results display.
- [ ] **Anthropic + search ON**: Claude Sonnet with search ON. Same query — web_search fires, token-efficient header active (check dev log).
- [ ] **Google + search ON**: Gemini model with search ON. Same query — googleSearch fires.
- [ ] **xAI + search ON**: Grok model with search ON. Same query — webSearch fires.
- [ ] **Exa fallback**: Mistral model with search ON and `EXA_API_KEY` set. Same query — Exa web_search fires, structured envelope returned.
- [ ] **Search OFF**: Any model with search toggle OFF. Send "What's the news?" — NO tools fire.
- [ ] **No-tools model**: Select a Perplexity model (`tools: false`). Verify zero tools injected regardless of search toggle.
- [ ] **MCP tools**: If MCP is configured, verify MCP tools still load and execute correctly.
- [ ] **Anonymous user**: Log out, send a message with search ON — verify platform key search works with `ANONYMOUS_MAX_STEP_COUNT` cap.

### Safety Tests

- [ ] **prepareStep restriction**: Ask a complex query that triggers 4+ steps. Verify tools are restricted after `PREPARE_STEP_THRESHOLD` (check dev log for `[tools/step]` entries).
- [ ] **Result truncation**: Temporarily mock an MCP tool returning > 100KB. Verify truncation occurs (check dev log for `[tools] Result truncated` warning).
- [ ] **Error handling**: Temporarily use invalid Exa key. Verify the SDK marks the tool result with `isError: true`, the model receives an error message, and the `[tools/exa]` error log appears.

### Observability Tests

- [ ] **Dev step logging**: In dev mode, verify `[tools/step]` logs appear for each tool call with name, source, success, tokens.
- [ ] **Anthropic token logging**: In dev mode with Anthropic + tools, verify `tokenEfficient: true` log.
- [ ] **Audit log**: Check Convex `toolCallLog` table for entries with `source` field populated.
- [ ] **PostHog events**: Verify `tool_call` events fire with correct `source` and `serviceName`.

### Regression Tests

- [ ] **No-search conversations**: Regular chat without search toggle — verify no tool overhead.
- [ ] **Reasoning models**: Anthropic with thinking enabled + search — verify reasoning still works (adaptive vs enabled fallback).
- [ ] **Streaming**: Verify streaming responses are not disrupted by any new callbacks.
- [ ] **BYOK**: With a user BYOK key for OpenAI, verify search tool bills to the user's key.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `prepareStep` restricts needed tools | Low | Medium | MCP tools always allowed; only restricts after threshold; fail-closed is safe default |
| Structured envelope changes model behavior | Low | Medium | Models handle JSON well; `meta` field is self-describing; error path re-throws (no envelope) |
| MCP tool result truncation wrapping breaks tool | Low | Medium | Wrapping preserves original execute signature; truncation is shape-preserving |
| Anthropic beta header causes issues | Very Low | Low | Header is comma-merged; tested in @ai-sdk/anthropic@3.0.41 |
| Truncation breaks tool result parsing | Low | Medium | Shape-preserving truncation; `_truncated` marker informs model |
| `ToolCapabilities` type widens breaks existing code | Very Low | Low | `resolveToolCapabilities` handles all existing values |
| OpenRouter model cleanup breaks search | Very Low | Low | The `opts?.enableSearch` code was already dead (never called from route.ts); removal is safe |
| `onStepFinish` adds latency | Very Low | Very Low | Dev-mode only logging; no production overhead |

---

## Success Criteria

After all phases are complete:

1. **Dual-gate injection**: Every tool injection point checks both system config AND model capability via `resolveToolCapabilities()`
2. **Truncation enforced**: No tool result can exceed `MAX_TOOL_RESULT_SIZE` (100KB) entering `streamText()`
3. **Structured envelopes**: Layer 2 tools return `{ ok, data, meta }` on success — errors re-throw for proper SDK `isError` handling
4. **Token efficiency**: Anthropic requests with tools include the token-efficient beta header
5. **Step restriction**: Tools restricted after `PREPARE_STEP_THRESHOLD` steps; fail-closed default for unclassified tools
6. **Step tracing**: Dev mode logs per-step tool call details; audit log includes duration
7. **Zero regressions**: All existing tool, search, MCP, streaming, and reasoning functionality unchanged
8. **Extensible**: Adding future tools (code execution, extraction) follows the established `ToolCapabilities` + `ToolMetadata` pattern

---

*Plan derived from multi-tool calling system design research, Open WebUI competitive analysis, and Phase 7 future tool integrations plan. See `.agents/research/multi-tool-calling-system-design.md` for full research context.*
