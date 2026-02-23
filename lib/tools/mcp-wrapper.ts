// lib/tools/mcp-wrapper.ts
//
// Unified MCP tool wrapper — handles timing, timeout, truncation, and envelope
// in a single execute() body. Follows the Exa gold standard pattern from
// lib/tools/third-party.ts:82-119.
//
// Replaces wrapToolsWithTruncation(mcpTools) in route.ts:300-302.

import type { ToolSet } from "ai"
import type { ToolResultEnvelope } from "./types"
import { truncateToolResult, enrichToolError } from "./utils"
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

type WrapMcpToolsConfig = {
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
          success = false
          error = err instanceof Error ? err.message : String(err)

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
