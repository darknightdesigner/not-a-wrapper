import { v } from "convex/values"
import { mutation, query, internalMutation } from "./_generated/server"

// Mirror of lib/config.ts MAX_MCP_SERVERS_PER_USER — keep in sync
const MAX_MCP_SERVERS_PER_USER = 10

// =============================================================================
// SSRF Validation
// =============================================================================

/**
 * Validate a URL against SSRF rules.
 * Checks hostname patterns only — no DNS resolution in Convex runtime.
 * Defense-in-depth: the API route also validates before connecting.
 *
 * Rejects: private IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x),
 * localhost, 0.0.0.0, [::1], .local hostnames.
 */
function validateServerUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "Invalid URL format"
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block localhost and special hostnames
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  ) {
    return "Localhost and local network URLs are not allowed"
  }

  // Block private IP ranges
  const ipParts = hostname.split(".").map(Number)
  if (
    ipParts.length === 4 &&
    ipParts.every((n) => !isNaN(n) && n >= 0 && n <= 255)
  ) {
    const [a, b] = ipParts
    if (
      a === 10 || // 10.0.0.0/8
      a === 127 || // 127.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) || // 169.254.0.0/16
      a === 0 // 0.0.0.0/8
    ) {
      return "Private IP addresses are not allowed"
    }
  }

  // Must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only HTTP and HTTPS URLs are supported"
  }

  return null // valid
}

// =============================================================================
// Queries
// =============================================================================

/**
 * List all MCP servers for the authenticated user.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) return []

    return await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
  },
})

/**
 * Get a single MCP server by ID. Verifies ownership.
 */
export const get = query({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, { serverId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) return null

    const server = await ctx.db.get(serverId)
    if (!server || server.userId !== user._id) return null

    return server
  },
})

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new MCP server configuration.
 *
 * - Validates URL against SSRF rules
 * - Enforces MAX_MCP_SERVERS_PER_USER limit
 * - Stores pre-encrypted auth values (caller encrypts via lib/encryption.ts)
 */
export const create = mutation({
  args: {
    name: v.string(),
    url: v.string(),
    transport: v.union(v.literal("http"), v.literal("sse")),
    authType: v.optional(
      v.union(v.literal("none"), v.literal("bearer"), v.literal("header"))
    ),
    encryptedAuthValue: v.optional(v.string()),
    authIv: v.optional(v.string()),
    headerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) throw new Error("User not found")

    // SSRF validation
    const urlError = validateServerUrl(args.url)
    if (urlError) throw new Error(urlError)

    // Server limit enforcement
    const existingServers = await ctx.db
      .query("mcpServers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    if (existingServers.length >= MAX_MCP_SERVERS_PER_USER) {
      throw new Error(
        `Maximum of ${MAX_MCP_SERVERS_PER_USER} MCP servers allowed`
      )
    }

    // Validate auth fields consistency
    if (
      (args.authType === "bearer" || args.authType === "header") &&
      (!args.encryptedAuthValue || !args.authIv)
    ) {
      throw new Error(
        "Encrypted auth value and IV are required for bearer/header auth"
      )
    }

    if (args.authType === "header" && !args.headerName) {
      throw new Error("Header name is required for header auth type")
    }

    return await ctx.db.insert("mcpServers", {
      userId: user._id,
      name: args.name,
      url: args.url,
      transport: args.transport,
      enabled: true,
      authType: args.authType,
      encryptedAuthValue: args.encryptedAuthValue,
      authIv: args.authIv,
      headerName: args.headerName,
      createdAt: Date.now(),
    })
  },
})

/**
 * Update an existing MCP server configuration.
 *
 * - Verifies ownership
 * - Re-validates URL if changed
 * - Accepts partial updates (only provided fields are changed)
 */
export const update = mutation({
  args: {
    serverId: v.id("mcpServers"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    transport: v.optional(v.union(v.literal("http"), v.literal("sse"))),
    authType: v.optional(
      v.union(v.literal("none"), v.literal("bearer"), v.literal("header"))
    ),
    encryptedAuthValue: v.optional(v.string()),
    authIv: v.optional(v.string()),
    headerName: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, ...updates }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) throw new Error("User not found")

    const server = await ctx.db.get(serverId)
    if (!server || server.userId !== user._id) {
      throw new Error("Server not found")
    }

    // SSRF validation if URL is being changed
    if (updates.url) {
      const urlError = validateServerUrl(updates.url)
      if (urlError) throw new Error(urlError)
    }

    // Validate auth fields consistency for the final state
    const finalAuthType = updates.authType ?? server.authType
    if (finalAuthType === "bearer" || finalAuthType === "header") {
      const finalEncrypted =
        updates.encryptedAuthValue ?? server.encryptedAuthValue
      const finalIv = updates.authIv ?? server.authIv
      if (!finalEncrypted || !finalIv) {
        throw new Error(
          "Encrypted auth value and IV are required for bearer/header auth"
        )
      }
    }

    if (finalAuthType === "header") {
      const finalHeaderName = updates.headerName ?? server.headerName
      if (!finalHeaderName) {
        throw new Error("Header name is required for header auth type")
      }
    }

    // Build patch object with only provided fields
    const patch: Record<string, unknown> = {}
    if (updates.name !== undefined) patch.name = updates.name
    if (updates.url !== undefined) patch.url = updates.url
    if (updates.transport !== undefined) patch.transport = updates.transport
    if (updates.authType !== undefined) patch.authType = updates.authType
    if (updates.encryptedAuthValue !== undefined)
      patch.encryptedAuthValue = updates.encryptedAuthValue
    if (updates.authIv !== undefined) patch.authIv = updates.authIv
    if (updates.headerName !== undefined) patch.headerName = updates.headerName

    // Clear auth fields when switching to "none"
    if (updates.authType === "none") {
      patch.encryptedAuthValue = undefined
      patch.authIv = undefined
      patch.headerName = undefined
    }

    await ctx.db.patch(serverId, patch)
  },
})

/**
 * Delete an MCP server and cascade delete its tool approvals.
 * Tool call logs are preserved as audit trail (serverId becomes a dangling ref).
 */
export const remove = mutation({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, { serverId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) throw new Error("User not found")

    const server = await ctx.db.get(serverId)
    if (!server || server.userId !== user._id) {
      throw new Error("Server not found")
    }

    // Cascade delete: remove all tool approvals for this server
    const approvals = await ctx.db
      .query("mcpToolApprovals")
      .withIndex("by_server", (q) => q.eq("serverId", serverId))
      .collect()

    for (const approval of approvals) {
      await ctx.db.delete(approval._id)
    }

    // Delete the server
    await ctx.db.delete(serverId)
  },
})

/**
 * Quick enable/disable toggle for an MCP server.
 */
export const toggleEnabled = mutation({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, { serverId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) throw new Error("User not found")

    const server = await ctx.db.get(serverId)
    if (!server || server.userId !== user._id) {
      throw new Error("Server not found")
    }

    await ctx.db.patch(serverId, { enabled: !server.enabled })
  },
})

/**
 * Update connection status (lastConnectedAt, lastError).
 * Called from the API route after attempting to connect to a server.
 */
export const updateConnectionStatus = mutation({
  args: {
    serverId: v.id("mcpServers"),
    lastConnectedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, lastConnectedAt, lastError }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) throw new Error("User not found")

    const server = await ctx.db.get(serverId)
    if (!server || server.userId !== user._id) {
      throw new Error("Server not found")
    }

    const patch: Record<string, unknown> = {}
    if (lastConnectedAt !== undefined) patch.lastConnectedAt = lastConnectedAt
    if (lastError !== undefined) patch.lastError = lastError

    // Clear error on successful connection
    if (lastConnectedAt && !lastError) {
      patch.lastError = undefined
    }

    await ctx.db.patch(serverId, patch)
  },
})

// =============================================================================
// Internal Mutations (for server-side use from Convex actions/scheduled jobs)
// =============================================================================

/**
 * Internal: update connection status without auth check.
 * For use from Convex actions that have already verified the user.
 */
export const internalUpdateConnectionStatus = internalMutation({
  args: {
    serverId: v.id("mcpServers"),
    lastConnectedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, lastConnectedAt, lastError }) => {
    const server = await ctx.db.get(serverId)
    if (!server) return

    const patch: Record<string, unknown> = {}
    if (lastConnectedAt !== undefined) patch.lastConnectedAt = lastConnectedAt
    if (lastError !== undefined) patch.lastError = lastError

    if (lastConnectedAt && !lastError) {
      patch.lastError = undefined
    }

    await ctx.db.patch(serverId, patch)
  },
})
