# Per-Tool Execution Timeouts — Research Findings

> **Research Task**: Tier 1 Foundation Hardening — Task 1
> **Date**: February 13, 2026
> **Status**: Complete
> **Output**: Recommended approach with TypeScript code sketch, comparison table, risks

---

## 1. How the Vercel AI SDK Executes Tools

### Execution Flow (AI SDK v6.0.78)

The SDK's tool execution path, traced from source code in `node_modules/ai/dist/index.mjs` and `node_modules/@ai-sdk/provider-utils/dist/index.mjs`:

```
streamText({ tools, abortSignal })
  └→ executeTools({ toolCalls, tools, abortSignal })           // L4386-4411
       └→ Promise.all(toolCalls.map(executeToolCall))           // Parallel per-step
            └→ executeToolCall({ toolCall, tools, abortSignal }) // L2642-2710
                 └→ executeTool({ execute, input, options })     // @ai-sdk/provider-utils
                      └→ tool.execute(input, { toolCallId, messages, abortSignal, ... })
```

**Key observations from source code**:

1. **`executeToolCall`** (L2642-2710 in `ai/dist/index.mjs`) wraps each tool call in a telemetry span and delegates to `executeTool` from `@ai-sdk/provider-utils`.

2. **`executeTool`** (L2499-2515 in `@ai-sdk/provider-utils/dist/index.mjs`) calls `execute(input, options)` directly. The full implementation:
   ```javascript
   async function* executeTool({ execute, input, options }) {
     const result = execute(input, options);
     if (isAsyncIterable(result)) {
       let lastOutput;
       for await (const output of result) {
         lastOutput = output;
         yield { type: "preliminary", output };
       }
       yield { type: "final", output: lastOutput };
     } else {
       yield { type: "final", output: await result };
     }
   }
   ```
   There is **no timeout, no middleware, no retry** — it's a bare `await`.

3. **Error handling** (L2699-2710): When `execute()` throws, the error is caught and returned as:
   ```javascript
   { type: "tool-error", toolCallId, toolName, input, error, dynamic: ... }
   ```

4. **In `streamText`** (L5924-5948): Tool execution is fire-and-forget with `.then()/.catch()/.finally()`:
   ```javascript
   executeToolCall({ ... })
     .then((result) => toolResultsStreamController.enqueue(result))
     .catch((error) => toolResultsStreamController.enqueue({ type: "error", error }))
     .finally(() => { outstandingToolResults.delete(id); attemptClose(); });
   ```

5. **Multiple tool calls** within a single step are executed in parallel via `Promise.all` (in `generateText`) or fire-and-forget promises (in `streamText`).

### AbortSignal Passthrough

The `ToolExecutionOptions` interface (from `@ai-sdk/provider-utils/dist/index.d.ts` L943-966):

```typescript
interface ToolExecutionOptions {
  toolCallId: string;
  messages: ModelMessage[];
  abortSignal?: AbortSignal;              // ← This is the request-level signal
  experimental_context?: Record<string, unknown>;
}
```

The `abortSignal` passed to `tool.execute()` is the **request-level** signal from `streamText({ abortSignal })`. It is NOT a per-tool signal. If the request is aborted, ALL tool executions receive the same abort signal.

### What Happens When execute() Throws

Traced through the SDK source (both `generateText` and `streamText` paths):

1. `executeToolCall` catches the error → returns `{ type: "tool-error" }` (L2699-2710)
2. The error is fed back to the model as a tool result via `createToolModelOutput()` with `errorMode: "json"` or `"text"` (L3763-3777, L3959-3964)
3. The model receives the error message and can acknowledge it / retry / continue
4. The streaming response **continues** — it does NOT abort
5. `onStepFinish` fires normally with `toolResults` containing `isError: true`
6. `onFinish` fires normally with all steps available

**Critical finding**: A tool that throws (e.g., due to timeout) is handled gracefully by the SDK. The stream continues, the model sees the error, and all callbacks fire correctly. This means **`Promise.race` with a thrown timeout error is fully SDK-compatible**.

---

## 2. Industry Timeout Patterns

### Comparison Table

| Framework | Mechanism | Default Timeout | Per-Tool Config? | Status (Feb 2026) |
|-----------|-----------|----------------|------------------|--------------------|
| **Vercel AI SDK** | `abortSignal` on `streamText` (request-level) | None (relies on serverless `maxDuration`) | No | Stable, no per-tool API planned |
| **OpenAI Agents SDK (Python)** | Proposed `timeout` param on `@function_tool` | Not yet implemented | Yes (proposed) | Issue [#2346](https://github.com/openai/openai-agents-python/issues/2346), milestone 0.9.x |
| **OpenAI Agents SDK (JS)** | Not implemented | N/A | N/A | Issue [#772](https://github.com/openai/openai-agents-js/issues/772), open |
| **LangGraph (Python)** | No native per-tool timeout; `recursion_limit` for graph | N/A | No | Manual wrapping required |
| **LangChain (Python)** | `BaseTool` inherits `Runnable` — no native timeout | N/A | No | `asyncio.timeout()` wrap |
| **MCP Protocol** | RFC [#1492](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1492): server-declared timeouts | 60s proposed | Per-method (not per-tool) | Open RFC, needs SEP |
| **Anthropic MCP Client** | Implementation-specific | 5s (`tools/list`), 60s (other) | Per-method | Production |
| **Open WebUI** | No timeout enforcement | None (`timeout=None`) | No | Known gap |

### Key Takeaways

1. **No framework has native per-tool timeout enforcement today.** OpenAI Agents SDK is closest with a proposed design for Python (0.9.x milestone), but it's not shipped.

2. **The universal pattern is wrapper-based**: every framework that enforces timeouts does so by wrapping the tool execution function, not through a framework-level API.

3. **`Promise.race` / `asyncio.timeout()` is the standard pattern.** There is no alternative mechanism in any mainstream framework.

4. **The MCP protocol is moving toward server-declared timeouts** (RFC #1492), where servers declare expected durations during initialization. Clients retain final control. This is not yet standardized.

### OpenAI Agents SDK Proposed Design (Python, Issue #2346)

The most mature design proposal, assigned to milestone 0.9.x:

```python
@function_tool(
    timeout=30,                              # seconds
    timeout_behavior="error_as_result",      # or "raise_exception"
    timeout_error_function=custom_error_fn,  # optional custom message
)
async def my_tool(query: str) -> str: ...
```

Two timeout behaviors:
- `"error_as_result"` (default): Returns a timed-out error message to the LLM, allowing it to continue
- `"raise_exception"`: Raises an exception and fails the entire run

**NaW alignment**: Our approach should mirror `"error_as_result"` semantics — throw so the SDK returns a tool-error to the model, which can then continue.

---

## 3. Recommended Approach for NaW

### Pattern: `wrapToolsWithTimeout()` using `Promise.race`

**Why `Promise.race` over `AbortSignal.timeout()`**:
- `AbortSignal.timeout()` (Node 18+) only works if the tool's `execute()` actually checks the signal. Most tools (especially MCP tools from arbitrary servers) ignore it.
- `Promise.race` guarantees the wrapper resolves/rejects within the timeout regardless of whether the inner function respects signals.
- We still pass the original `abortSignal` through to `execute()` for cooperative cancellation.
- `AbortSignal.timeout()` can be composed with the request signal using `AbortSignal.any()` as a complementary optimization for tools that DO respect it.

### Where to Apply

| Layer | Apply Timeout? | Rationale |
|-------|---------------|-----------|
| **Layer 1 (Provider)** | **No** | Provider tools are `providerExecuted` — the SDK doesn't call our `execute()`. They are opaque server-side tools with their own timeouts. No `execute()` function to wrap. |
| **Layer 2 (Exa)** | **Yes** | HTTP API calls can hang. We control the `execute()` function. Currently no timeout protection. |
| **Layer 3 (MCP)** | **Yes** | Arbitrary user-configured servers are the highest risk for hangs. Already wrapped with truncation. |

### Error Handling: Throw (Not Return)

The wrapper should **throw** on timeout, not return a structured error result. Reasons:

1. **SDK compatibility**: When `execute()` throws, the SDK returns `{ type: "tool-error" }` and the model receives the error message. This is the designed error path.
2. **`isError` detection**: The SDK sets `isError: true` on tool results from thrown errors. This flows through to `onStepFinish`, `onFinish`, PostHog events, and audit logs — all existing observability works without changes.
3. **Consistency**: Exa already re-throws on failure (`third-party.ts:118`) for the same reason.
4. **If we returned a structured result instead**, `isError` would be `false`, and all downstream error detection would miss it.

### Code Sketch: `wrapToolsWithTimeout()`

```typescript
// lib/tools/utils.ts (addition)

import { TOOL_EXECUTION_TIMEOUT_MS } from "@/lib/config"
import type { ToolSet } from "ai"

/**
 * Error thrown when a tool execution exceeds the configured timeout.
 * The error message is designed to be useful when the SDK passes it to the model
 * as a tool-error result — the model can acknowledge the timeout and continue.
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

/**
 * Wrap all tools in a ToolSet with per-tool execution timeouts.
 *
 * When a tool's execute() exceeds the timeout, the wrapper throws a
 * ToolTimeoutError. The Vercel AI SDK catches this and returns a
 * tool-error to the model, which can then decide how to proceed.
 *
 * The original abortSignal from streamText is still passed through
 * to execute() for cooperative cancellation. The Promise.race
 * provides a hard guarantee regardless of signal support.
 *
 * Layer 1 tools are exempt (provider-managed, no execute() to wrap).
 * Apply BEFORE wrapToolsWithTruncation — timeout should race the raw
 * execution, and truncation processes whatever result arrives.
 *
 * @param tools - The ToolSet to wrap
 * @param timeoutMs - Per-tool timeout in milliseconds
 */
export function wrapToolsWithTimeout(
  tools: ToolSet,
  timeoutMs: number = TOOL_EXECUTION_TIMEOUT_MS
): ToolSet {
  const wrapped: Record<string, unknown> = {}

  for (const [name, t] of Object.entries(tools)) {
    const original = t as Record<string, unknown>
    if (typeof original.execute === "function") {
      const origExec = original.execute as (
        ...args: unknown[]
      ) => Promise<unknown>

      wrapped[name] = {
        ...original,
        execute: async (...args: unknown[]) => {
          return Promise.race([
            origExec(...args),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new ToolTimeoutError(name, timeoutMs)),
                timeoutMs
              )
            ),
          ])
        },
      }
    } else {
      // Tools without execute (e.g., provider tools with providerExecuted)
      // are passed through unchanged.
      wrapped[name] = original
    }
  }

  return wrapped as ToolSet
}
```

### Wrapper Composition Order

```
Original execute()
  → wrapToolsWithTimeout()     // OUTER: races execution against timer
    → wrapToolsWithTruncation()  // INNER: truncates result if within size
      → return to SDK
```

In code (applied in `route.ts`):

```typescript
// Current (route.ts:300-302):
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapToolsWithTruncation(mcpTools) as ToolSet
}

// Proposed:
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapToolsWithTruncation(
    wrapToolsWithTimeout(mcpTools)
  ) as ToolSet
}
```

**Why this order**:
- Timeout wrapping is applied first (innermost in the wrapping chain, outermost in execution) — it races the raw `execute()` against the timer.
- If timeout wins → throws `ToolTimeoutError` → truncation wrapper propagates the throw (it doesn't catch) → SDK handles as `tool-error`.
- If execute wins → result passes to truncation wrapper → size-limited result returns to SDK.
- Truncation never runs on a timed-out execution (no wasted processing).

### Layer 2 (Exa) Integration

For Exa, the timeout can be applied in two ways:

**Option A**: Wrap at merge time (same as MCP):
```typescript
// route.ts — after getThirdPartyTools()
thirdPartyTools = wrapToolsWithTimeout(thirdPartyTools, TOOL_EXECUTION_TIMEOUT_MS) as ToolSet
```

**Option B**: Apply inside the `execute()` function in `third-party.ts`:
```typescript
// Inside the Exa tool execute function
execute: async ({ query }, { abortSignal }) => {
  const startMs = Date.now()
  const timeoutSignal = AbortSignal.timeout(TOOL_EXECUTION_TIMEOUT_MS)
  const combinedSignal = AbortSignal.any([
    ...(abortSignal ? [abortSignal] : []),
    timeoutSignal,
  ])
  // Pass combinedSignal to exa.searchAndContents() if the Exa SDK supports it
  // ...
}
```

**Recommendation**: Option A. It's consistent with MCP wrapping, keeps `third-party.ts` focused on Exa logic, and the wrapper already handles the `ToolTimeoutError` pattern. Option B is a nice-to-have optimization if the Exa SDK supports `AbortSignal`.

### Per-Tool Timeout Configuration (Future)

For future extensibility, `ToolMetadata` can be extended with a per-tool timeout:

```typescript
// lib/tools/types.ts (future addition)
export interface ToolMetadata {
  // ... existing fields ...

  /**
   * Per-tool execution timeout in milliseconds.
   * Overrides the global TOOL_EXECUTION_TIMEOUT_MS.
   * Use for tools that legitimately need more time (e.g., code execution).
   */
  timeoutMs?: number
}
```

The wrapper can then read from a metadata map:

```typescript
export function wrapToolsWithTimeout(
  tools: ToolSet,
  defaultTimeoutMs: number = TOOL_EXECUTION_TIMEOUT_MS,
  metadataMap?: Map<string, { timeoutMs?: number }>
): ToolSet {
  // ...
  const toolTimeout = metadataMap?.get(name)?.timeoutMs ?? defaultTimeoutMs
  // ...
}
```

This is deferred to a future phase — the global timeout is sufficient for the initial implementation.

---

## 4. Risks and Edge Cases

### 4.1 Timer Leak on Success

When the tool completes before the timeout, the `setTimeout` timer remains pending until it fires. This is a minor resource leak.

**Mitigation**: Use `AbortController` to cancel the timer:

```typescript
execute: async (...args: unknown[]) => {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  )

  try {
    const result = await Promise.race([
      origExec(...args),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new ToolTimeoutError(name, timeoutMs))
        )
      }),
    ])
    clearTimeout(timer)
    return result
  } catch (error) {
    clearTimeout(timer)
    throw error
  }
}
```

**Assessment**: The simpler `setTimeout` version is acceptable for v1. Timers are lightweight, fire in ~15s, and the GC cleans up the closure. The `clearTimeout` optimization can be added if profiling reveals issues.

### 4.2 Hung Tool After Timeout

When `Promise.race` rejects due to timeout, the original `execute()` promise is still pending. The tool may continue running in the background.

**Impact**:
- For Exa (Layer 2): The HTTP request continues until the `fetch` completes or the serverless function terminates. Minimal resource impact.
- For MCP (Layer 3): The MCP client connection is kept alive until `after()` cleanup runs. If the tool is still executing when `after()` closes the client, the server-side operation is abandoned.

**Mitigation (v1)**: Accept this behavior. The serverless function's `maxDuration = 60s` is the ultimate backstop. The `after()` cleanup reliably closes MCP connections.

**Mitigation (v2, future)**: Pass a composed `AbortSignal` to `execute()`:
```typescript
const timeoutSignal = AbortSignal.timeout(timeoutMs)
const combinedSignal = AbortSignal.any([
  ...(originalAbortSignal ? [originalAbortSignal] : []),
  timeoutSignal,
])
// Pass combinedSignal as abortSignal in options
```
This enables cooperative cancellation for tools that check the signal (e.g., `fetch` requests).

### 4.3 MCP Client Cleanup on Timeout

When an MCP tool times out, the MCP client connection remains open. The `after()` handler in `route.ts:290-292` closes all clients after streaming:

```typescript
after(async () => {
  await Promise.allSettled(mcpClients.map((c) => c.close()))
})
```

This runs **regardless of whether tools timed out**, so MCP clients are always cleaned up. No additional cleanup is needed for the timeout wrapper.

### 4.4 Streaming Response During Tool Timeout

Tested via SDK source analysis:

1. When a tool times out (throws), the SDK enqueues the error to `toolResultsStreamController`
2. The stream emits a `tool-result` part with `isError: true` and the error message
3. The SDK feeds this to the model in the next step
4. The model acknowledges the timeout and generates a text response
5. The `toUIMessageStreamResponse()` continues streaming — the user sees the model's response

**The user never sees a raw timeout error.** The model mediates and explains what happened.

### 4.5 Concurrent Tool Timeouts

When multiple tools are called in the same step and both timeout:

- In `streamText`: Each tool is fire-and-forget (L5927-5948). Both timeouts are handled independently.
- In `generateText`: Tools are run via `Promise.all` (L4395-4407). All errors are collected.
- Both paths enqueue tool-error results correctly. The model receives ALL error messages.

### 4.6 Timeout Timer vs Serverless maxDuration

| Parameter | Value | Scope |
|-----------|-------|-------|
| `TOOL_EXECUTION_TIMEOUT_MS` | 15,000ms | Per-tool-call |
| `MCP_CONNECTION_TIMEOUT_MS` | 5,000ms | Per-server-connection |
| `maxDuration` | 60s | Per-serverless-invocation |
| `MCP_MAX_STEP_COUNT` | 20 | Per-request step budget |

**Worst-case analysis**: If every step has a tool call and every tool times out:
- 20 steps × 15s timeout = 300s >> 60s maxDuration

This CANNOT happen because:
1. LLM inference between steps takes ~2-10s, consuming the 60s budget
2. After ~2-3 tool timeouts, the model typically stops calling tools
3. `prepareStep` restricts tools after `PREPARE_STEP_THRESHOLD` (3 steps)
4. The `maxDuration` hard-kills the function regardless

**Realistic worst case**: 3 tool-using steps × 15s + 3 × 5s LLM = 60s. This exactly matches `maxDuration`. If timeouts are increased, `maxDuration` may need adjustment.

### 4.7 Layer 1 Provider Tools — Why No Wrapping

Provider tools (OpenAI web search, Anthropic web search, Google grounding, xAI web search) from `lib/tools/provider.ts`:

1. **No `execute()` to wrap**: Provider tools are `providerExecuted: true`. The SDK doesn't call our `execute()` — it sends the tool to the provider API, and the provider executes it server-side.
2. **Opaque results**: Results come back in the provider's API response, not from a user-land function.
3. **Provider-managed timeouts**: Each provider has its own server-side timeout enforcement.
4. **SDK assertion**: Provider tools are checked via `toolCall.providerExecuted !== true` before executing (L5924). Wrapping would either:
   - Be bypassed entirely (SDK skips execute for provider tools)
   - Break the SDK's provider tool handling if we accidentally made them look non-provider

**Conclusion**: Layer 1 tools MUST NOT be wrapped. The timeout wrapper's `typeof original.execute === "function"` check naturally skips them if they don't have an `execute()`, but provider tools DO have an `execute()` (it's the provider's internal function). The safe approach is to only apply `wrapToolsWithTimeout()` to MCP and third-party tools, never to `builtInTools`.

---

## 5. Decision: Recommended Timeout Values

| Layer | Timeout | Rationale |
|-------|---------|-----------|
| **Layer 1 (Provider)** | N/A — no wrapping | SDK-managed, provider-enforced. Wrapping would be bypassed or break behavior. |
| **Layer 2 (Third-party / Exa)** | 15,000ms | HTTP API call to a known service. Should complete in 2-5s; 15s is generous. Matches existing `TOOL_EXECUTION_TIMEOUT_MS`. |
| **Layer 3 (MCP)** | 30,000ms | Arbitrary servers with unpredictable latency. MCP RFC #1492 proposes 60s; 30s is a conservative middle ground between NaW's 15s default and the MCP community's 60s proposal. |

### Constants (additions to `lib/config.ts`)

```typescript
// lib/config.ts

/**
 * Timeout for Layer 2 (third-party) tool executions.
 * These are known services with predictable latency (Exa, Firecrawl, etc.).
 */
export const TOOL_EXECUTION_TIMEOUT_MS = 15_000 // existing constant, now enforced

/**
 * Timeout for Layer 3 (MCP) tool executions.
 * MCP servers are user-configured and may have unpredictable latency.
 * Higher than TOOL_EXECUTION_TIMEOUT_MS to accommodate slower servers
 * while still preventing indefinite hangs.
 *
 * Industry reference: MCP RFC #1492 proposes 60s. We use 30s as a
 * conservative default that balances reliability with responsiveness.
 */
export const MCP_TOOL_EXECUTION_TIMEOUT_MS = 30_000
```

---

## 6. Implementation Plan (Summary)

### Phase 1: Core Wrapper (1-2 hours)

1. Add `ToolTimeoutError` class to `lib/tools/utils.ts`
2. Add `wrapToolsWithTimeout()` function to `lib/tools/utils.ts`
3. Add `MCP_TOOL_EXECUTION_TIMEOUT_MS = 30_000` to `lib/config.ts`

### Phase 2: Apply to MCP Tools (30 minutes)

Update `route.ts:300-302`:
```typescript
if (Object.keys(mcpTools).length > 0) {
  mcpTools = wrapToolsWithTruncation(
    wrapToolsWithTimeout(mcpTools, MCP_TOOL_EXECUTION_TIMEOUT_MS)
  ) as ToolSet
}
```

### Phase 3: Apply to Third-Party Tools (30 minutes)

Update `route.ts` after `getThirdPartyTools()`:
```typescript
if (Object.keys(thirdPartyTools).length > 0) {
  thirdPartyTools = wrapToolsWithTimeout(thirdPartyTools, TOOL_EXECUTION_TIMEOUT_MS) as ToolSet
}
```

### Phase 4: Observability (30 minutes)

Add timeout detection to `onStepFinish`:
```typescript
for (const call of toolCalls) {
  const result = toolResults.find(r => r.toolCallId === call.toolCallId)
  const isTimeout = result && (result as { isError?: boolean }).isError
    && (result as { error?: unknown }).error instanceof ToolTimeoutError
  // Log timeout events for monitoring
}
```

### Phase 5: Testing (1 hour)

- Unit test: `wrapToolsWithTimeout` with a tool that resolves before timeout
- Unit test: `wrapToolsWithTimeout` with a tool that hangs past timeout
- Unit test: Verify `ToolTimeoutError` message format
- Integration: Verify timeout wrapper composes with truncation wrapper

### Total Estimated Effort: 3-4 hours

---

## 7. Cross-Cutting: Unified Wrapper Composition

Tasks 1 (timeout), 2 (timing), and 4 (envelope) all wrap `execute()`. The recommended composition order:

```
execute()
  → timeout wrapper     (rejects if execution exceeds time budget)
  → timing wrapper      (captures durationMs for tracing — Task 2)
  → truncation wrapper  (limits result size)
  → envelope wrapper    (wraps result in { ok, data, error, meta } — Task 4)
  → return to SDK
```

### Why This Order

1. **Timeout outermost**: Must race the raw execution. If it fires, everything below is skipped.
2. **Timing next**: Captures the actual execution duration (including potential timeout). The duration is accurate whether the tool succeeds, fails, or times out.
3. **Truncation next**: Operates on the raw result. Must run before envelope wrapping so the truncation marker (`_truncated`) is inside the envelope's `data` field.
4. **Envelope innermost**: Wraps the final (potentially truncated) result in a structured envelope for observability.

### Unified vs. Composable Decision

**Recommendation**: Start with composable wrappers (current approach), migrate to a unified wrapper when all four concerns are implemented.

| Approach | Phase | Rationale |
|----------|-------|-----------|
| **Composable** (now) | Phases 1-3 | Each wrapper is independently testable, can be applied selectively per layer |
| **Unified** (future) | Phase 4+ | Single wrapping pass, one place to maintain, consistent behavior |

The composable approach allows incremental delivery: timeout can ship alone (this task), timing can ship with Task 2, and envelope with Task 4. A unified wrapper refactor can follow when all concerns are stable.

---

## References

### Primary Sources

| Source | URL / Location | Used For |
|--------|---------------|----------|
| AI SDK source: `executeToolCall` | `node_modules/ai/dist/index.mjs` L2640-2710 | Tool execution flow, error handling |
| AI SDK source: `executeTool` | `node_modules/@ai-sdk/provider-utils/dist/index.mjs` L2499-2515 | Raw execute() invocation |
| AI SDK source: `ToolExecutionOptions` | `node_modules/@ai-sdk/provider-utils/dist/index.d.ts` L943-966 | AbortSignal passthrough |
| AI SDK source: `streamText` tool path | `node_modules/ai/dist/index.mjs` L5924-5948 | Fire-and-forget execution, error enqueueing |
| AI SDK docs: streamText | `sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text` | Configuration, abortSignal |
| AI SDK docs: tool() | `sdk.vercel.ai/docs/reference/ai-sdk-core/tool` | Tool definition patterns |
| OpenAI Agents SDK Python #2346 | `github.com/openai/openai-agents-python/issues/2346` | Per-tool timeout design |
| OpenAI Agents SDK JS #772 | `github.com/openai/openai-agents-js/issues/772` | MCP tool call timeout |
| MCP RFC #1492 | `github.com/modelcontextprotocol/modelcontextprotocol/pull/1492` | Standardized timeout negotiation |

### NaW Codebase References

| File | Lines | Relevance |
|------|-------|-----------|
| `app/api/chat/route.ts` | L473-531 | `streamText` config, `onStepFinish` |
| `app/api/chat/route.ts` | L300-302 | MCP truncation wrapping |
| `lib/tools/utils.ts` | L106-127 | `wrapToolsWithTruncation` pattern (to follow) |
| `lib/tools/provider.ts` | L39-115 | Layer 1 provider tools (exempt from wrapping) |
| `lib/tools/third-party.ts` | L82-119 | Layer 2 Exa execute with envelope |
| `lib/mcp/load-tools.ts` | L230-268 | MCP connection timeout pattern (precedent) |
| `lib/config.ts` | L225-233 | `TOOL_EXECUTION_TIMEOUT_MS` definition |
| `lib/tools/types.ts` | L14-41 | `ToolMetadata` (future `timeoutMs` extension) |

---

*Research completed February 13, 2026. Derived from AI SDK source code analysis, industry framework comparison, and NaW codebase architecture review.*
