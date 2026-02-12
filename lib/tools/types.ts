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
export interface ToolMetadata {
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
}

// NOTE: ToolCapabilities interface (granular per-capability control) is deferred
// to Phase 7 when code execution is added. Phases 1-5 use `tools !== false`.
