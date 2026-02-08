import { MAX_TOOL_RESULT_SIZE } from "@/lib/config"

const TRUNCATION_SUFFIX = "\n\n[Result truncated — exceeded size limit]"

/**
 * Truncate a tool result to MAX_TOOL_RESULT_SIZE bytes.
 *
 * MCP tools can return arbitrarily large results. This function ensures
 * results passed to the model and audit log don't exceed the size limit.
 *
 * For string results, truncates with a "[truncated]" suffix.
 * For object results, serializes to JSON first, then truncates.
 *
 * @param result - The tool result to truncate
 * @param maxSize - Maximum size in bytes (defaults to MAX_TOOL_RESULT_SIZE = 100KB)
 * @returns The truncated result as a string
 */
export function truncateToolResult(
  result: unknown,
  maxSize: number = MAX_TOOL_RESULT_SIZE
): string {
  let text: string
  if (typeof result === "string") {
    text = result
  } else if (result === null || result === undefined) {
    return ""
  } else {
    try {
      text = JSON.stringify(result)
    } catch {
      text = String(result)
    }
  }

  // Check byte length, not character length (handles multi-byte chars)
  const byteLength = new TextEncoder().encode(text).length

  if (byteLength <= maxSize) return text

  const suffixBytes = new TextEncoder().encode(TRUNCATION_SUFFIX).length
  const targetBytes = maxSize - suffixBytes

  if (targetBytes <= 0) return TRUNCATION_SUFFIX.trim()

  // Fast path: if text is pure ASCII, char count === byte count
  if (byteLength === text.length) {
    return text.slice(0, targetBytes) + TRUNCATION_SUFFIX
  }

  // Slow path: binary search for the right character cut point
  // that keeps byte length under targetBytes (handles multi-byte chars)
  const encoder = new TextEncoder()
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (encoder.encode(text.slice(0, mid)).length <= targetBytes) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return text.slice(0, lo) + TRUNCATION_SUFFIX
}
