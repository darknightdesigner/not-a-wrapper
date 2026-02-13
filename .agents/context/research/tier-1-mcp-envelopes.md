# Consistent MCP Result Envelopes — Research Findings

> **Tier 1 Foundation · Research Task 4**
> Created: February 13, 2026
> Status: Complete
> Cross-references: Tasks 1 (Timeouts), 2 (Tracing) — wrapper composition at end

---

## 1. Current Envelope Pattern (Layer 2 — Gold Standard)

The Exa search tool (`lib/tools/third-party.ts:82-119`) implements the current gold standard for result envelopes:

```typescript
// lib/tools/third-party.ts:97-107
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
```

**Key properties of this pattern:**

| Property | Value | Purpose |
|----------|-------|---------|
| `ok` | `boolean` | Success flag — enables uniform conditional checks |
| `data` | `T \| null` | The actual result payload (already truncated) |
| `error` | `string \| null` | Always `null` on success path |
| `meta` | `{ tool, source, durationMs, ... }` | Observability — timing, source tracking, result count |

**Error handling**: Errors are NOT enveloped. Tools throw so the AI SDK sets `isError: true` on the tool result (`lib/tools/types.ts:48-50`). This preserves correct success detection in `onFinish` (PostHog events, audit logs).

**Type definition** (`lib/tools/types.ts:57-67`):

```typescript
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

### Current Inconsistency

| Layer | Envelope? | Truncation? | Timing? | Notes |
|-------|-----------|-------------|---------|-------|
| 1 (Provider) | No — opaque | No — provider-managed | No | Intentionally unwrapped |
| 2 (Exa) | Yes — `ToolResultEnvelope` | Yes — inside `execute()` | Yes — `durationMs` in meta | Gold standard |
| 3 (MCP) | **No** — raw result | Yes — via `wrapToolsWithTruncation` | **No** | Gap to fill |

The MCP wrapping happens at `route.ts:300-302`:

```typescript
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapToolsWithTruncation(mcpTools) as ToolSet
}
```

This applies truncation but not the envelope structure — MCP tool results reach the model and audit log as raw (potentially truncated) values.

---

## 2. MCP Specification Analysis

### 2.1 CallToolResult Format

The MCP specification (2025-03-26 and 2025-06-18) defines a standard response format for `tools/call`:

**Source**: [modelcontextprotocol.io/specification/2025-06-18/server/tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Current weather in New York:\nTemperature: 72°F"
      }
    ],
    "isError": false
  }
}
```

**Key findings:**

1. **`content` is an array** of content blocks (`text`, `image`, `audio`, `resource`). Not free-form — there is a standard structure.
2. **`isError` is a boolean** — semantic errors are reported in-band (not as JSON-RPC protocol errors).
3. **No metadata field** — MCP does not include timing, source info, or other observability data.
4. **Multiple content types** — A single tool result can contain text + images + resources.

### 2.2 Structured Content (2025-06-18 addition)

The newer spec adds `structuredContent` alongside `content`:

```json
{
  "content": [
    { "type": "text", "text": "{\"temperature\": 22.5, ...}" }
  ],
  "structuredContent": {
    "temperature": 22.5,
    "conditions": "Partly cloudy",
    "humidity": 65
  }
}
```

With optional `outputSchema` on the tool definition for validation. This is relevant because it means MCP is evolving toward typed results — our envelope approach should not conflict with this.

### 2.3 How @ai-sdk/mcp Translates Results

The `@ai-sdk/mcp` package's `createMCPClient` converts MCP `CallToolResult` into Vercel AI SDK tool results:

- **Without `outputSchema`**: The `content` array is passed through. For text-only results, the text is extracted and returned as the tool result (string or JSON-parsed object).
- **With `outputSchema`**: The client extracts `structuredContent` and validates it against the schema.

**Critical insight**: By the time MCP tool results reach our `execute()` wrapper in `load-tools.ts`, they are already converted from MCP format to plain JavaScript values. The `content[].text` has been extracted — we never see the raw `{ content: [...], isError: false }` envelope. This means:

- MCP tool results arrive as arbitrary values (strings, objects, arrays)
- They have **no** inherent structure we can rely on
- Wrapping them in `ToolResultEnvelope` adds structure where there is none

---

## 3. Impact on Model Behavior

### 3.1 Academic Research

**Primary source**: Kate et al. (2025), "How Good Are LLMs at Processing Tool Outputs?" ([arxiv.org/abs/2510.15955](https://arxiv.org/abs/2510.15955))

Key findings from evaluating 15 LLMs on structured JSON tool output processing:

| Finding | Implication for Envelopes |
|---------|---------------------------|
| JSON processing is hard — GPT-4o best accuracy is 77% | Extra nesting makes extraction harder |
| Performance degrades with response length (+7% to +91% accuracy drop as size increases) | Envelope overhead adds tokens that compound with large results |
| Adding JSON schema improves code-gen performance (up to +12%) | Consistent structure can help if the model knows what to expect |
| Recency bias affects answer extraction (5-75% variation by position) | Putting `data` after `meta` could hurt extraction |
| Extractive questions work best with direct answer generation | Raw results are better for simple extractions |
| Filtering/aggregation benefit from code generation | Structured envelopes help when model needs to process results |

### 3.2 Token Overhead Estimate

For a typical MCP tool result:

```
// Raw result (what model sees today):
{"items": [{"name": "foo", "value": 42}], "total": 1}
// → ~18 tokens

// Enveloped result:
{"ok": true, "data": {"items": [{"name": "foo", "value": 42}], "total": 1}, "error": null, "meta": {"tool": "mcp_github_list_repos", "source": "mcp", "durationMs": 234, "serverName": "GitHub"}}
// → ~52 tokens
```

**Overhead**: ~34 tokens per tool call ≈ 190% increase on small results, <5% increase on large results (5000+ token responses). For a typical conversation with 3-5 tool calls, this is 100-170 extra tokens — negligible relative to context window sizes (128K+) but worth considering for cost.

### 3.3 Comprehension Assessment

**What models see today** (MCP, raw + truncated):
```
The web server returned: {"items": [...], "_truncated": true, "_originalCount": 50, "_returnedCount": 12}
```

**What models would see with envelope**:
```
The web server returned: {"ok": true, "data": {"items": [...]}, "error": null, "meta": {"tool": "mcp_server_search", "source": "mcp", "durationMs": 450}}
```

**Assessment**: The model must navigate one additional nesting level to reach `data`. For frontier models (Claude 4+, GPT-4o+), this is trivial. For smaller models, the `data` → actual payload path adds cognitive load. However, the **consistent structure across all tool results** means the model can learn the pattern once (via system prompt or few examples) and apply it uniformly.

### 3.4 Recommendation: Use `toModelOutput` to Strip Meta

The Vercel AI SDK v6 `tool()` function provides `toModelOutput`:

```typescript
toModelOutput?: ({toolCallId, input, output}) => ToolResultOutput | PromiseLike<ToolResultOutput>
```

**Source**: [ai-sdk.dev/docs/reference/ai-sdk-core/tool](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool)

This allows **separating what the model sees from what the system captures**:

- `execute()` returns the full `ToolResultEnvelope` (with `meta` for observability, caching, audit)
- `toModelOutput()` strips `meta` and returns only `{ ok, data, error }` to the model
- The model sees a simpler, consistent structure
- The system retains full metadata for `onFinish` processing

**This is the key architectural insight**: The envelope serves the system; `toModelOutput` serves the model. They don't have to be the same.

---

## 4. Wrapper Composition Strategy

### 4.1 Options Evaluated

| Approach | Pros | Cons |
|----------|------|------|
| **A: Unified wrapper** (`wrapMcpToolsWithEnvelope`) | Single wrapping pass, consistent behavior, one place to maintain | Large function, harder to test individual concerns |
| **B: Composable wrappers** (`wrapWithTimeout` ∘ `wrapWithTiming` ∘ `wrapWithTruncation` ∘ `wrapWithEnvelope`) | Testable, configurable per-layer, can apply selectively | Wrapping order matters, multiple function layers, potential overhead |
| **C: Layer-specific wrappers** (Exa does its own, MCP has a separate one) | Full control per layer | Duplicated logic, divergent patterns, harder to maintain consistency |

### 4.2 Recommendation: Option B — Composable Wrappers

**Rationale**:
1. **Tasks 1, 2, and 4 all wrap `execute()`** — composability prevents a monolithic function
2. **Each concern is independently testable** — timeout logic, timing, truncation, envelope
3. **Layer-specific configuration** — MCP tools need different timeout values than Exa
4. **Wrapping order is well-defined and documented**

### 4.3 Recommended Wrapping Order

```
execute()
  → timeout (AbortSignal, per-tool or per-layer)     [Task 1]
  → timing (start/end timestamps, durationMs)         [Task 2 partial]
  → truncation (size check, shape-preserving)          [Existing]
  → envelope (wrap in { ok, data, error, meta })       [Task 4]
  → return to SDK
```

**Why this order?**
- **Timeout first**: Must wrap the actual execution to enforce time limits. If timeout fires, we still want timing + envelope for the error case.
- **Timing second**: Captures execution duration including any timeout overhead. Must be inside envelope to populate `meta.durationMs`.
- **Truncation third**: Applied to the raw result before wrapping. The envelope's `data` field should contain the already-truncated result (consistent with Exa pattern at `third-party.ts:99`).
- **Envelope last**: Wraps everything in the standard structure. By this point we have `durationMs` from timing and truncated data.

### 4.4 Code Sketch — Composable Wrapper

```typescript
// lib/tools/wrappers.ts (new file)

import type { ToolSet } from "ai"
import type { ToolResultEnvelope } from "./types"
import { truncateToolResult } from "./utils"
import { MAX_TOOL_RESULT_SIZE } from "@/lib/config"

interface WrapOptions {
  /** Tool name for meta field */
  toolName: string
  /** Source layer for meta field */
  source: "mcp" | "third-party"
  /** Service/server name for meta field */
  serviceName: string
  /** Max result size in bytes */
  maxBytes?: number
  /** Execution timeout in ms (0 = no timeout) */
  timeoutMs?: number
}

/**
 * Wrap a single tool's execute function with timing, truncation, and envelope.
 * Composes the concerns in the correct order:
 *   timeout → timing → truncation → envelope
 *
 * Error handling: On error, the function THROWS (does not envelope the error).
 * This preserves the AI SDK's `isError: true` detection in onFinish.
 */
function wrapExecuteWithEnvelope(
  origExec: (...args: unknown[]) => Promise<unknown>,
  opts: WrapOptions
): (...args: unknown[]) => Promise<ToolResultEnvelope> {
  return async (...args: unknown[]) => {
    const startMs = Date.now()

    // 1. Execute with optional timeout [Task 1 integration point]
    // TODO: Add AbortSignal-based timeout when Task 1 is implemented
    const rawResult = await origExec(...args)

    // 2. Timing captured via startMs → durationMs

    // 3. Truncation (shape-preserving)
    const truncatedResult = truncateToolResult(
      rawResult,
      opts.maxBytes ?? MAX_TOOL_RESULT_SIZE
    )

    // 4. Envelope
    return {
      ok: true,
      data: truncatedResult,
      error: null,
      meta: {
        tool: opts.toolName,
        source: opts.source,
        durationMs: Date.now() - startMs,
        serviceName: opts.serviceName,
      },
    }
    // Errors: NOT caught here — they propagate as thrown exceptions.
    // The AI SDK sets isError: true on the tool result, which is
    // detected by onFinish for audit logging and PostHog events.
  }
}

/**
 * Wrap all MCP tools from a server with result envelopes.
 * Replaces the current `wrapToolsWithTruncation(mcpTools)` call in route.ts.
 *
 * @param tools - Raw MCP tool set from client.tools()
 * @param serverName - Human-readable server name for meta
 * @param toolServerMap - Existing map for display name lookups
 */
export function wrapMcpToolsWithEnvelope(
  tools: ToolSet,
  serverName: string,
  toolServerMap: Map<string, { displayName: string; serverName: string; serverId: string }>
): ToolSet {
  const wrapped: Record<string, unknown> = {}

  for (const [namespacedName, t] of Object.entries(tools)) {
    const original = t as Record<string, unknown>
    if (typeof original.execute !== "function") {
      wrapped[namespacedName] = original
      continue
    }

    const serverInfo = toolServerMap.get(namespacedName)
    const origExec = original.execute as (...args: unknown[]) => Promise<unknown>

    wrapped[namespacedName] = {
      ...original,
      execute: wrapExecuteWithEnvelope(origExec, {
        toolName: serverInfo?.displayName ?? namespacedName,
        source: "mcp",
        serviceName: serverInfo?.serverName ?? serverName,
      }),
    }
  }

  return wrapped as ToolSet
}
```

### 4.5 Integration with `toModelOutput` — Stripping Meta for the Model

For MCP tools loaded via `createMCPClient`, we cannot easily use `tool()` with `toModelOutput` because MCP tools are already wrapped by the SDK. However, we can achieve the same effect by:

**Option 1 — Post-process in the wrapper** (recommended for MCP):

The model receives the full envelope from `execute()`. Since the envelope has a known structure, models handle it well. The `meta` field adds ~30 tokens of overhead — acceptable.

**Option 2 — Custom `toModelOutput` on Layer 2 tools** (for Exa and future third-party tools):

```typescript
// In tool() definitions for Layer 2 tools:
tool({
  // ...
  execute: async (input) => {
    // Returns ToolResultEnvelope
    return { ok: true, data: ..., error: null, meta: { ... } }
  },
  toModelOutput: ({ output }) => {
    // Strip meta for model — model sees { ok, data, error } only
    const { meta, ...modelResult } = output as ToolResultEnvelope
    return modelResult
  },
})
```

**Recommendation**: For Phase 1, do NOT strip `meta` from MCP results. The token overhead is minimal (~30 tokens), and the consistent structure helps the model. Revisit if benchmarks show comprehension issues.

---

## 5. Audit Log Compatibility

### 5.1 Current Audit Logging Code

The `onFinish` callback in `route.ts:685-778` logs tool results to Convex:

**MCP tool logging** (`route.ts:710-711`):
```typescript
outputPreview: toolResult
  ? JSON.stringify(toolResult.output).slice(0, 500)
  : undefined,
```

**Non-MCP tool logging** (`route.ts:758-759`):
```typescript
outputPreview: toolResult
  ? JSON.stringify(toolResult.output).slice(0, 500)
  : undefined,
```

### 5.2 Impact Analysis

**If MCP tool results are enveloped**, `toolResult.output` would be:

```json
// Before (raw):
{"items": [{"name": "repo1"}], "total": 5}

// After (enveloped):
{"ok": true, "data": {"items": [{"name": "repo1"}], "total": 5}, "error": null, "meta": {"tool": "list_repos", "source": "mcp", "durationMs": 234, "serviceName": "GitHub"}}
```

**Does `JSON.stringify(toolResult.output).slice(0, 500)` break?**

**No** — `JSON.stringify` works on both raw objects and enveloped objects. The output is still valid JSON. However, the `outputPreview` will now contain envelope boilerplate instead of just the useful data, which reduces the effective preview window.

**Example with 500-char limit**:
- **Raw**: 500 chars of actual result data → useful preview
- **Enveloped**: ~80 chars of envelope boilerplate + ~420 chars of data → less useful preview

### 5.3 Recommended Changes to Audit Logging

**Option A — Extract `data` from envelope** (recommended):

```typescript
// In onFinish, when logging MCP tool results:
const output = toolResult?.output
const previewData = isToolResultEnvelope(output) ? output.data : output
const outputPreview = previewData
  ? JSON.stringify(previewData).slice(0, 500)
  : undefined
```

With a type guard:

```typescript
function isToolResultEnvelope(value: unknown): value is ToolResultEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    "data" in value &&
    "meta" in value
  )
}
```

**Option B — Log both data and meta separately**:

```typescript
outputPreview: previewData ? JSON.stringify(previewData).slice(0, 500) : undefined,
// New field (requires schema update):
durationMs: isToolResultEnvelope(output) ? output.meta.durationMs : undefined,
```

The `toolCallLog` schema (`convex/toolCallLog.ts:46`) already has `durationMs: v.optional(v.number())` — so the schema supports per-tool timing without modification. Currently this field holds the full response duration (stream start → onFinish). With envelopes, we can populate it with the actual per-tool execution duration from `meta.durationMs`.

### 5.4 PostHog Compatibility

The PostHog event at `route.ts:644-668` only captures:
- `toolName`, `source`, `success`, `chatId`, `serverId`, `serverName`

It does **not** inspect `toolResult.output`, so it is **unaffected** by enveloping.

### 5.5 Success Detection Compatibility

Success is detected via `isError` flag (`route.ts:698-700`):

```typescript
const success = toolResult
  ? !(toolResult as { isError?: boolean }).isError
  : false
```

Since our envelope approach **throws on error** (not enveloping errors), the AI SDK still sets `isError: true` on failures. This detection remains correct.

---

## 6. `ToolResultEnvelope` Type Modifications

### 6.1 Current Type Assessment

The current `ToolResultEnvelope<T>` interface is **sufficient for MCP tools**. No modifications needed for Phase 1.

### 6.2 Considered Additions (Deferred)

| Field | Purpose | Decision |
|-------|---------|----------|
| `meta.serverId` | MCP server identifier for tracing | Defer — available via `toolServerMap` in route.ts |
| `meta.truncated` | Whether truncation was applied | Defer — `isTruncated()` utility exists, can be used externally |
| `meta.stepNumber` | Which agentic step this result belongs to | Defer — only needed for tracing layer (Task 2) |
| `meta.spanId` | OpenTelemetry span correlation | Defer — Task 2 scope |

### 6.3 Error Field Reconsidered

The current design says "Only used for the SUCCESS path" (`types.ts:48`). This is the right design because:

1. **AI SDK error detection requires thrown errors** — if we return `{ ok: false, error: "..." }` instead of throwing, the SDK won't set `isError: true`, breaking `onFinish` success detection.
2. **Double reporting risk** — if we both envelope the error AND throw, the error appears in two places.
3. **Model confusion** — if the model sees `{ ok: false, error: "timeout" }` as a "successful" tool result (because it wasn't thrown), it may not understand the tool failed.

**Recommendation**: Keep `error: string | null` in the type for symmetry, but always set it to `null` in practice. Errors flow through `throw`.

---

## 7. Wrapper Composition with Tasks 1 and 2

### 7.1 Cross-Cutting Concern: Unified Execute Wrapper

Tasks 1 (Timeouts), 2 (Tracing), and 4 (Envelopes) all wrap `execute()`. The recommended composition:

```
execute(args)
  ├─ [Task 1] timeout wrapper (AbortSignal + race)
  │     catches timeout → throws TimeoutError
  ├─ [Task 2] tracing wrapper (span start/end)
  │     records: toolName, durationMs, success, input hash
  ├─ [Existing] truncation (truncateToolResult)
  │     size-preserving truncation of raw result
  └─ [Task 4] envelope wrapper (ToolResultEnvelope)
        wraps in { ok, data, error, meta }
```

### 7.2 Unified vs Composed — Final Recommendation

**Use composed wrappers with a single orchestrating function:**

```typescript
// lib/tools/wrappers.ts

/**
 * Full wrapper pipeline for Layer 3 (MCP) tools.
 * Composes: timeout → tracing → truncation → envelope
 */
export function wrapMcpToolsForProduction(
  tools: ToolSet,
  options: {
    serverName: string
    toolServerMap: Map<string, ServerInfo>
    timeoutMs?: number      // Task 1
    tracingEnabled?: boolean // Task 2
  }
): ToolSet {
  // Phase 1: Apply envelope + truncation (Task 4 — this PR)
  let wrapped = wrapMcpToolsWithEnvelope(tools, options.serverName, options.toolServerMap)

  // Phase 2: Add timeout (Task 1 — future PR)
  // if (options.timeoutMs) {
  //   wrapped = wrapToolsWithTimeout(wrapped, options.timeoutMs)
  // }

  // Phase 3: Add tracing (Task 2 — future PR)
  // if (options.tracingEnabled) {
  //   wrapped = wrapToolsWithTracing(wrapped)
  // }

  return wrapped
}
```

### 7.3 Migration Path in route.ts

Current (`route.ts:300-302`):
```typescript
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapToolsWithTruncation(mcpTools) as ToolSet
}
```

After Task 4 implementation:
```typescript
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapMcpToolsForProduction(mcpTools, {
    serverName: "user-mcp",
    toolServerMap: mcpToolServerMap,
  }) as ToolSet
}
```

This replaces `wrapToolsWithTruncation` with the full pipeline. The `wrapToolsWithTruncation` utility remains available for other use cases but is no longer needed for MCP tools in the chat route.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Model misinterprets envelope nesting | Low | Medium | Monitor with prompt testing; `toModelOutput` escape hatch available |
| Audit log `outputPreview` shows envelope boilerplate | High | Low | Extract `data` field before `JSON.stringify` |
| MCP tools that return multimodal content (images, audio) | Low | High | Current `truncateToolResult` only handles JSON — multimodal needs separate path |
| Token overhead accumulates with many tool calls | Medium | Low | ~30 tokens/call × 10 calls = ~300 tokens — negligible |
| Breaking change if `ToolResultEnvelope` type evolves | Low | Medium | Type is internal, not serialized to client — can evolve freely |
| Wrapper composition order bugs | Medium | Medium | Unit test each wrapper independently, integration test full pipeline |

---

## 9. Compatibility Verification

### 9.1 Vercel AI SDK v6.0.78

- `tool()` with `toModelOutput` is supported (renamed from `experimental_toToolResultContent`)
- `streamText()` passes tool results through `onFinish` without transformation
- MCP tools from `createMCPClient` integrate as standard `ToolSet` entries
- No conflicts with envelope wrapping

### 9.2 Next.js 16 Serverless Functions

- Envelope wrapping is CPU-bound (JSON operations) — no async overhead
- No additional network calls
- Compatible with `after()` cleanup pattern for MCP clients

### 9.3 Existing `streamText` Configuration

- `streamText()` in `route.ts` uses `onFinish` for audit logging — compatible with enveloped results
- `prepareStep` in `route.ts` filters tools by name — unaffected by envelope wrapping
- Tool merging via spread (`{ ...searchTools, ...mcpTools }`) — unaffected

---

## 10. Summary and Recommendations

### Apply Envelope To

| Layer | Envelope? | Rationale |
|-------|-----------|-----------|
| Layer 1 (Provider) | **No** | Opaque, provider-managed — intentionally unwrapped |
| Layer 2 (Exa) | **Already done** | Gold standard pattern |
| Layer 3 (MCP) | **Yes — new** | Fills the consistency gap |

### Envelope Structure

Use existing `ToolResultEnvelope` without modification.

### Wrapper Approach

**Composable wrappers** with orchestrating function `wrapMcpToolsForProduction()`:
- Phase 1: Envelope + truncation (this task)
- Phase 2: Add timeout (Task 1)
- Phase 3: Add tracing (Task 2)

### Meta Stripping

**Not recommended for Phase 1**. Token overhead is ~30 tokens/call. Revisit if model benchmarks show comprehension issues. `toModelOutput` escape hatch is available for Layer 2 tools.

### Audit Log Changes

1. Add `isToolResultEnvelope()` type guard
2. Extract `data` field before `JSON.stringify().slice(0, 500)` for `outputPreview`
3. Populate `durationMs` from `meta.durationMs` (schema already supports this)

### Implementation Effort

- Wrapper functions: ~2 hours
- Route.ts integration: ~1 hour
- Audit log adaptation: ~1 hour
- Unit tests: ~2 hours
- **Total: ~6 hours**

---

## References

### Primary Sources

| Source | URL | Used For |
|--------|-----|----------|
| MCP Specification (2025-03-26) | [modelcontextprotocol.io/specification/2025-03-26/server/tools](https://modelcontextprotocol.io/specification/2025-03-26/server/tools) | CallToolResult format |
| MCP Specification (2025-06-18) | [modelcontextprotocol.io/specification/2025-06-18/server/tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | structuredContent, outputSchema |
| Vercel AI SDK — tool() | [ai-sdk.dev/docs/reference/ai-sdk-core/tool](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool) | toModelOutput API |
| Kate et al. (2025) — "How Good Are LLMs at Processing Tool Outputs?" | [arxiv.org/abs/2510.15955](https://arxiv.org/abs/2510.15955) | JSON processing difficulty, overhead analysis |
| Anthropic — Tool Use Overview | [docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview) | tool_result format, structured outputs |

### NaW Source Files Referenced

| File | Lines | Purpose |
|------|-------|---------|
| `lib/tools/third-party.ts` | 82-119 | Exa envelope gold standard |
| `lib/tools/types.ts` | 44-67 | ToolResultEnvelope type definition |
| `lib/tools/utils.ts` | 1-135 | truncateToolResult, wrapToolsWithTruncation |
| `lib/mcp/load-tools.ts` | 1-369 | MCP tool loading and namespacing |
| `app/api/chat/route.ts` | 280-312 | MCP tool wrapping |
| `app/api/chat/route.ts` | 644-668 | PostHog event logging |
| `app/api/chat/route.ts` | 685-778 | onFinish audit logging |
| `convex/toolCallLog.ts` | 37-91 | Audit log schema and mutation |
| `lib/config.ts` | 194-233 | Tool infrastructure constants |

---

*Research completed February 13, 2026. Feeds into Tier 1 implementation plan.*
