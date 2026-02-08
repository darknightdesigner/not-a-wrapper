import { createMCPClient } from "@ai-sdk/mcp"
import { fetchQuery, fetchMutation } from "convex/nextjs"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { decryptKey } from "@/lib/encryption"
import {
  MCP_CONNECTION_TIMEOUT_MS,
  MCP_MAX_TOOLS_PER_REQUEST,
} from "@/lib/config"
import {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
} from "./circuit-breaker"

// =============================================================================
// Types
// =============================================================================

/** MCP client instance — inferred from createMCPClient return type */
type MCPClient = Awaited<ReturnType<typeof createMCPClient>>

/** Tool set returned by client.tools() — compatible with streamText() */
type MCPToolSet = Awaited<ReturnType<MCPClient["tools"]>>

/** Maps a namespaced tool name to its source server info */
export type ServerInfo = {
  /** Original tool name (without namespace prefix) */
  displayName: string
  /** Human-readable server name from user config */
  serverName: string
  /** Convex document ID of the MCP server */
  serverId: string
}

/** Result from loadUserMcpTools — everything the chat route needs */
export type LoadToolsResult = {
  /** Merged, namespaced tools from all enabled servers. Pass to streamText(). */
  tools: MCPToolSet
  /** Active MCP client connections. Must be closed after streaming via after(). */
  clients: MCPClient[]
  /** Namespaced tool name → server info. Used for UI display and audit logging. */
  toolServerMap: Map<string, ServerInfo>
}

export type LoadToolsOptions = {
  /** Per-server connection timeout in ms. @default MCP_CONNECTION_TIMEOUT_MS (5000) */
  timeout?: number
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert a server name to a stable URL-safe slug for tool namespacing.
 *
 * IMPORTANT: The slug must be deterministic and treated as immutable once tools
 * are used in a conversation. Changing the slug orphans historical tool names
 * stored in message history (tool-call and tool-result parts reference the
 * namespaced name).
 *
 * @example slugify("My GitHub Server") → "my_github_server"
 */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "server"
  )
}

/**
 * Build auth headers for an MCP server connection.
 * Decrypts the stored auth value using AES-256-GCM (same pattern as BYOK keys).
 */
function buildAuthHeaders(server: {
  authType?: "none" | "bearer" | "header"
  encryptedAuthValue?: string
  authIv?: string
  headerName?: string
}): Record<string, string> | undefined {
  if (!server.authType || server.authType === "none") return undefined
  if (!server.encryptedAuthValue || !server.authIv) return undefined

  try {
    const decryptedValue = decryptKey(
      server.encryptedAuthValue,
      server.authIv
    )

    if (server.authType === "bearer") {
      return { Authorization: `Bearer ${decryptedValue}` }
    }

    if (server.authType === "header" && server.headerName) {
      return { [server.headerName]: decryptedValue }
    }
  } catch (error) {
    console.error(
      "[MCP] Failed to decrypt auth for server:",
      error instanceof Error ? error.message : error
    )
  }

  return undefined
}

/**
 * Update MCP server connection status (best-effort, non-blocking).
 * Failures are silently caught — these are observability updates, not critical path.
 */
function updateConnectionStatus(
  serverId: Id<"mcpServers">,
  status: { lastConnectedAt?: number; lastError?: string },
  token: string
): void {
  void fetchMutation(
    api.mcpServers.updateConnectionStatus,
    { serverId, ...status },
    { token }
  ).catch(() => {
    // Intentionally swallowed — connection status updates are best-effort
  })
}

// =============================================================================
// Main Orchestrator
// =============================================================================

/**
 * Load MCP tools for a user's enabled servers.
 *
 * This is the core orchestration layer for Phase 3 of MCP integration.
 * Called once per chat request when MCP is enabled.
 *
 * **Flow**:
 * 1. Fetch user's enabled server configs + tool approvals from Convex (parallel)
 * 2. Create MCP clients in parallel with per-server timeout
 * 3. Collect and namespace tools from successful connections
 * 4. Filter by approval status (v1: default auto-approved)
 * 5. Enforce per-request tool limit
 *
 * **Latency**: ~500ms-2s depending on server count and responsiveness.
 * Total = max(Convex query, max(individual server connections)).
 *
 * **Error handling**: Failed servers are skipped gracefully. If ALL servers
 * fail, returns empty tools (the chat proceeds without tool capabilities).
 *
 * **Cleanup**: Callers MUST close returned clients after streaming via `after()`.
 *
 * @param convexToken - Clerk/Convex auth token for user identity resolution
 * @param options - Optional configuration overrides
 */
export async function loadUserMcpTools(
  convexToken: string,
  options: LoadToolsOptions = {}
): Promise<LoadToolsResult> {
  const timeout = options.timeout ?? MCP_CONNECTION_TIMEOUT_MS

  const emptyResult: LoadToolsResult = {
    tools: {} as MCPToolSet,
    clients: [],
    toolServerMap: new Map(),
  }

  // -------------------------------------------------------------------------
  // 1. Load server configs + tool approvals in parallel (~50-100ms Convex RTT)
  // -------------------------------------------------------------------------
  const [allServers, allApprovals] = await Promise.all([
    fetchQuery(api.mcpServers.list, {}, { token: convexToken }),
    fetchQuery(api.mcpToolApprovals.listByUser, {}, { token: convexToken }),
  ])

  const enabledServers = allServers.filter((s) => s.enabled)
  if (enabledServers.length === 0) return emptyResult

  // Build approval lookup: `serverId_toolName` → approved
  const approvalMap = new Map<string, boolean>()
  for (const approval of allApprovals) {
    approvalMap.set(
      `${approval.serverId}_${approval.toolName}`,
      approval.approved
    )
  }

  // -------------------------------------------------------------------------
  // 2. Filter out servers with open circuits (too many consecutive failures)
  // -------------------------------------------------------------------------
  const serversToConnect = enabledServers.filter((server) => {
    if (isCircuitOpen(server._id)) {
      console.warn(
        `[MCP] Circuit open for "${server.name}" (consecutive failures >= threshold), skipping`
      )
      return false
    }
    return true
  })

  if (serversToConnect.length === 0) return emptyResult

  // -------------------------------------------------------------------------
  // 3. Create MCP clients in parallel with per-server timeout
  //    Total time = max(individual server times), not sum.
  //    A slow server doesn't block fast servers.
  // -------------------------------------------------------------------------
  const clientResults = await Promise.allSettled(
    serversToConnect.map((server) => {
      const headers = buildAuthHeaders(server)
      return Promise.race([
        createMCPClient({
          transport: {
            type: server.transport,
            url: server.url,
            ...(headers ? { headers } : {}),
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("MCP connection timeout")),
            timeout
          )
        ),
      ])
    })
  )

  // -------------------------------------------------------------------------
  // 4. Collect tools from successful clients
  // -------------------------------------------------------------------------
  const clients: MCPClient[] = []
  const mergedTools: Record<string, unknown> = {}
  const toolServerMap = new Map<string, ServerInfo>()
  let toolCount = 0

  for (let i = 0; i < clientResults.length; i++) {
    const result = clientResults[i]
    const server = serversToConnect[i]

    // --- Failed connection: log, record failure for circuit breaker, skip ---
    if (result.status === "rejected") {
      const errorMsg =
        result.reason instanceof Error
          ? result.reason.message
          : "Connection failed"

      console.error(`[MCP] Connection failed for "${server.name}":`, errorMsg)
      recordFailure(server._id)
      updateConnectionStatus(server._id, { lastError: errorMsg }, convexToken)
      continue
    }

    // --- Successful connection: reset circuit breaker ---
    const client = result.value
    clients.push(client)
    recordSuccess(server._id)

    try {
      const tools = await client.tools()
      const serverSlug = slugify(server.name)

      // Update successful connection status (best-effort)
      updateConnectionStatus(
        server._id,
        { lastConnectedAt: Date.now() },
        convexToken
      )

      for (const [toolName, tool] of Object.entries(tools)) {
        // 4. Filter by approved tools (v1: default auto-approved if no record)
        const approvalKey = `${server._id}_${toolName}`
        const isApproved = approvalMap.get(approvalKey) ?? true
        if (!isApproved) continue

        // 5. Enforce per-request tool limit
        if (toolCount >= MCP_MAX_TOOLS_PER_REQUEST) {
          console.warn(
            `[MCP] Tool limit (${MCP_MAX_TOOLS_PER_REQUEST}) reached, ` +
              `skipping remaining tools from "${server.name}"`
          )
          break
        }

        // 6. Namespace tool name: `${serverSlug}_${toolName}`
        const namespacedName = `${serverSlug}_${toolName}`
        mergedTools[namespacedName] = tool
        toolServerMap.set(namespacedName, {
          displayName: toolName,
          serverName: server.name,
          serverId: server._id,
        })
        toolCount++
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Tool loading failed"

      console.error(
        `[MCP] Failed to load tools from "${server.name}":`,
        errorMsg
      )
      updateConnectionStatus(server._id, { lastError: errorMsg }, convexToken)
    }
  }

  return {
    tools: mergedTools as MCPToolSet,
    clients,
    toolServerMap,
  }
}
