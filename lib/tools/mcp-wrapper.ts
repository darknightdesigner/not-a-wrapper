// lib/tools/mcp-wrapper.ts
//
// Unified MCP tool wrapper — handles timing, timeout, truncation, and envelope
// in a single execute() body. Follows the Exa gold standard pattern from
// lib/tools/third-party.ts:82-119.
//
// Replaces wrapToolsWithTruncation(mcpTools) in route.ts:300-302.

import type { ToolSet } from "ai"
import { ToolTraceCollector } from "./types"
import type { ToolTrace } from "./types"
import { truncateToolResult, enrichToolError } from "./utils"
import { extractToolErrorData, type ToolErrorCode } from "./errors"
import { extractPolicyErrorData } from "./policy"
import type { ServerInfo } from "@/lib/mcp/load-tools"
import {
  MAX_TOOL_RESULT_SIZE,
  MCP_TOOL_EXECUTION_TIMEOUT_MS,
} from "@/lib/config"

// Re-export trace types for backward compatibility (route.ts imports from here)
export { ToolTraceCollector, type ToolTrace }

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

// ── Configuration ──────────────────────────────────────────

type WrapMcpToolsConfig = {
  /** Map of namespaced tool names → server info for display names and audit */
  toolServerMap: Map<string, ServerInfo>
  /** Trace collector — shared with onStepFinish/onFinish in route.ts */
  traceCollector: ToolTraceCollector
  /** Request-scoped correlation ID for grouping tool traces */
  requestId?: string
  /** Per-tool timeout in ms. Default: MCP_TOOL_EXECUTION_TIMEOUT_MS (30s) */
  timeoutMs?: number
  /** Max result size in bytes. Default: MAX_TOOL_RESULT_SIZE (100KB) */
  maxResultBytes?: number
  /** Optional centralized budget enforcement hook */
  enforceToolBudget?: (toolName: string) => Promise<void>
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
    requestId,
    timeoutMs = MCP_TOOL_EXECUTION_TIMEOUT_MS,
    maxResultBytes = MAX_TOOL_RESULT_SIZE,
    enforceToolBudget,
  } = config

  const serverFailureCounts = new Map<string, number>()
  const circuitThreshold = 3

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
      ): Promise<unknown> => {
        const serverKey = serverInfo?.serverId ?? "unknown"
        const failures = serverFailureCounts.get(serverKey) ?? 0
        if (failures >= circuitThreshold) {
          throw enrichToolError(
            new Error(`Server "${serverInfo?.serverName ?? serverKey}" circuit open — ${failures} consecutive tool failures in this request`),
            displayName
          )
        }

        const startMs = Date.now()
        let success = true
        let error: string | undefined
        let resultSizeBytes: number | undefined
        let errorCode: ToolErrorCode | undefined
        let retryAfterSeconds: number | undefined
        let budgetKeyMode: "platform" | "byok" | undefined
        let budgetDenied: boolean | undefined

        try {
          if (enforceToolBudget) {
            await enforceToolBudget(name)
          }

          // ── Timeout + Execution ────────────────────────
          // Promise.race: either the tool resolves or the timeout rejects.
          // When timeout wins, ToolTimeoutError is thrown → caught below →
          // re-thrown with recovery hint → SDK sets isError: true.
          // Uses AbortSignal.timeout() for cleaner timer lifecycle —
          // no manual clearTimeout needed. The signal's internal timer
          // fires harmlessly after the race settles on serverless.
          const rawResult = await Promise.race([
            origExec(params, options),
            new Promise<never>((_, reject) => {
              AbortSignal.timeout(timeoutMs).addEventListener(
                "abort",
                () => reject(new ToolTimeoutError(name, timeoutMs)),
                { once: true }
              )
            }),
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

          return truncatedResult
        } catch (err) {
          success = false
          error = err instanceof Error ? err.message : String(err)
          const errorData = extractToolErrorData(err, { toolName: displayName })
          errorCode = errorData.code
          retryAfterSeconds = errorData.retryAfterSeconds

          const policyData = extractPolicyErrorData(err)
          if (policyData) {
            budgetKeyMode = policyData.keyMode
            budgetDenied = policyData.budgetDenied
          }

          const failKey = serverInfo?.serverId ?? "unknown"
          serverFailureCounts.set(failKey, (serverFailureCounts.get(failKey) ?? 0) + 1)

          console.error(
            `[tools/mcp] ${displayName} failed after ${Date.now() - startMs}ms:`,
            error
          )
          throw enrichToolError(err, displayName)
        } finally {
          // ── Trace (always — success or failure) ────────
          traceCollector.record({
            toolName: name,
            toolCallId: options.toolCallId,
            requestId,
            durationMs: Date.now() - startMs,
            success,
            error,
            resultSizeBytes,
            errorCode,
            retryAfterSeconds,
            budgetKeyMode,
            budgetDenied,
          })
        }
      },
    }
  }

  return wrapped as ToolSet
}

