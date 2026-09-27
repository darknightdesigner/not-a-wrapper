import {
  EXTRACT_CONTENT_DOMAIN_MAX_REQUESTS,
  EXTRACT_CONTENT_DOMAIN_WINDOW_MS,
  TOOL_BUDGET_LIMITS,
  TOOL_BUDGET_WINDOW_MS,
  TOOL_LIMIT_BUCKET_SIZE_MS,
} from "../config"

// Pure and relative-import only: Convex (convex/toolLimits.ts) and the Next
// tool runtime both resolve policy here. Config is read at call time, never at
// module load.

export type ToolKeyMode = "platform" | "byok"
export type ToolLimitType = "domain" | "budget"

export type ToolLimitPolicy = {
  windowMs: number
  maxCount: number
  bucketSizeMs: number
}

/**
 * Server-owned tool-limit policy by tool name, like `API_RATE_LIMIT_POLICIES`
 * (ADR-0045): callers send only the tool and its scopes, so no caller can
 * choose a wider window or a higher cap.
 */
export function resolveToolLimitPolicy(
  limitType: ToolLimitType,
  toolName: string,
  keyMode: ToolKeyMode
): ToolLimitPolicy {
  if (limitType === "domain") {
    if (toolName !== "extract_content") {
      throw new Error(`No domain limit policy for tool "${toolName}"`)
    }
    return {
      windowMs: EXTRACT_CONTENT_DOMAIN_WINDOW_MS,
      maxCount: EXTRACT_CONTENT_DOMAIN_MAX_REQUESTS,
      bucketSizeMs: TOOL_LIMIT_BUCKET_SIZE_MS,
    }
  }

  const limits: Readonly<Record<string, number>> = TOOL_BUDGET_LIMITS[keyMode]
  return {
    windowMs: TOOL_BUDGET_WINDOW_MS,
    // Own keys only: a tool named "constructor" must not read the prototype.
    maxCount: Object.prototype.hasOwnProperty.call(limits, toolName)
      ? limits[toolName]
      : TOOL_BUDGET_LIMITS[keyMode].default,
    bucketSizeMs: TOOL_LIMIT_BUCKET_SIZE_MS,
  }
}
