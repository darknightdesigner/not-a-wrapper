// lib/tools/utils.ts

import { MAX_TOOL_RESULT_SIZE } from "@/lib/config"
import type { ToolSet } from "ai"

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

  // Log truncation for observability
  console.warn(
    `[tools] Result truncated: ${sizeBytes} bytes → ${maxBytes} bytes limit`
  )

  // String: truncation with marker
  // Note: 0.9 factor is conservative for ASCII (the common case for tool
  // results). For multi-byte heavy strings (CJK, emoji), this may slightly
  // overshoot — acceptable since the primary concern is order-of-magnitude
  // protection, not byte-exact limits.
  if (typeof result === "string") {
    const charLimit = Math.floor(maxBytes * 0.9)
    return (
      result.slice(0, charLimit) +
      `\n[truncated — showing first ${charLimit} of ${result.length} chars. Use more targeted queries for smaller results.]`
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

    // Final size check: if the last remaining element is still oversized,
    // fall back to an empty array so the wrapper stays within budget.
    if (items.length > 0) {
      const finalSize = new TextEncoder().encode(safeStringify(items)).length
      if (finalSize > maxBytes * 0.95) {
        items = []
      }
    }

    return {
      _truncated: true,
      _originalCount: result.length,
      _returnedCount: items.length,
      _hint: `Result was truncated from ${result.length} to ${items.length} items. Use more specific filters or request fewer results for complete data.`,
      data: items,
    }
  }

  // Object: serialize and truncate the string representation
  if (typeof result === "object" && result !== null) {
    const truncatedStr = serialized.slice(0, maxBytes * 0.9)
    return {
      _truncated: true,
      _originalSizeBytes: sizeBytes,
      _hint: `Object was truncated at ${maxBytes} bytes (original: ${sizeBytes} bytes). Request specific fields instead of the full object.`,
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

/**
 * Enrich a tool error with actionable recovery hints for the model.
 * The AI SDK passes thrown error messages to the model as tool results.
 * Adding recovery guidance helps the model self-correct instead of
 * retrying the same failing operation.
 *
 * @param err - The original error
 * @param toolName - The tool that failed (for context in the message)
 * @returns A new Error with the original message plus a recovery hint
 */
export function enrichToolError(err: unknown, toolName: string): Error {
  const original = err instanceof Error ? err : new Error(String(err))
  const message = original.message

  let hint: string
  if (
    message.includes("timed out") ||
    message.includes("timeout") ||
    original.name === "ToolTimeoutError"
  ) {
    hint = "Try a shorter or more specific query, or skip this step."
  } else if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("Rate limit")
  ) {
    hint = "Rate limit exceeded. Wait before trying again or use a different approach."
  } else if (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  ) {
    hint = "API key is invalid or expired. Cannot retry — inform the user."
  } else if (
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("fetch failed") ||
    message.includes("network")
  ) {
    hint = "Network error — the service may be temporarily unavailable. Try a different query or skip."
  } else if (message.includes("DOMAIN_RATE_LIMIT")) {
    hint = "Too many requests to the same domain. Use URLs from different sources."
  } else {
    hint = "If the error persists, try a different approach or skip this step."
  }

  const enriched = new Error(`${toolName} failed: ${message}. ${hint}`)
  enriched.name = original.name
  if (original.stack) enriched.stack = original.stack
  return enriched
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
