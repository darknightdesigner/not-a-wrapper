// lib/tools/types.ts

/**
 * Source identifier for tool audit logging and UI display.
 * - "builtin": Provider-specific tools (OpenAI web search, Google grounding, etc.)
 * - "third-party": Third-party tools via API keys (Exa, Firecrawl, etc.)
 * - "mcp": User-configured MCP server tools (existing system)
 */
export type ToolSource = "builtin" | "third-party" | "mcp"

/**
 * Metadata for a tool, used for UI display, audit logging, and cost tracking.
 */
export type ToolMetadata = {
  /** Human-readable display name (e.g., "Web Search", "Exa Search") */
  displayName: string
  /** Tool source layer */
  source: ToolSource
  /** Provider or service name (e.g., "OpenAI", "Exa", "my-mcp-server") */
  serviceName: string
  /** Optional icon identifier for the UI */
  icon?: "search" | "code" | "image" | "extract" | "wrench"
  /**
   * Estimated cost per 1,000 invocations in USD.
   * Used for BYOK cost transparency in the UI — shown in tool invocation cards.
   * Omit if the tool has no marginal cost or cost is unknown.
   */
  estimatedCostPer1k?: number
  /**
   * Maximum result size in bytes for this specific tool.
   * Overrides the global MAX_TOOL_RESULT_SIZE when set.
   * Use for tools that legitimately need larger results (e.g., code execution: 500KB).
   */
  maxResultSize?: number
  /**
   * Whether this tool is read-only (no side effects).
   * Used by prepareStep to restrict tools after initial steps.
   * Default: true for search tools, false for write tools.
   */
  readOnly?: boolean
  /**
   * Whether this tool performs destructive updates (delete, overwrite).
   * Mapped from MCP `destructiveHint` annotation when available.
   * Used for future approval UI and prepareStep restrictions.
   */
  destructive?: boolean
  /**
   * Whether calling this tool multiple times with the same input is safe.
   * Mapped from MCP `idempotentHint` annotation when available.
   * Used for future retry policies (only retry idempotent tools).
   */
  idempotent?: boolean
}

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
export type ToolResultEnvelope<T = unknown> = {
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
export type ToolCapabilities = {
  /** Web search (Layer 1 provider tools + Layer 2 Exa). Default: true */
  search?: boolean
  /** Content extraction from URLs (Layer 2 Exa getContents). Default: true */
  extract?: boolean
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
  if (tools === false) return { search: false, extract: false, code: false, mcp: false }
  if (tools === true || tools === undefined) return { search: true, extract: true, code: true, mcp: true }
  return {
    search: tools.search !== false,
    extract: tools.extract !== false,
    code: tools.code !== false,
    mcp: tools.mcp !== false,
  }
}
