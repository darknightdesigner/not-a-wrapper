import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable({
    // Identity
    clerkId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    profileImage: v.optional(v.string()),

    // Status
    anonymous: v.optional(v.boolean()),
    premium: v.optional(v.boolean()),

    // Usage tracking - regular models
    messageCount: v.optional(v.number()),
    dailyMessageCount: v.optional(v.number()),
    dailyReset: v.optional(v.number()), // Unix timestamp

    // Usage tracking - pro models
    dailyProMessageCount: v.optional(v.number()),
    dailyProReset: v.optional(v.number()), // Unix timestamp

    // Activity
    lastActiveAt: v.optional(v.number()), // Unix timestamp

    // Preferences stored directly on user
    favoriteModels: v.optional(v.array(v.string())),
    systemPrompt: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  chats: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    public: v.boolean(),
    pinned: v.boolean(),
    pinnedAt: v.optional(v.number()), // Unix timestamp
    updatedAt: v.optional(v.number()), // Unix timestamp for manual tracking
  })
    .index("by_user", ["userId"])
    .index("by_user_pinned", ["userId", "pinned"])
    .index("by_project", ["projectId"]),

  messages: defineTable({
    chatId: v.id("chats"),
    orderId: v.optional(v.number()), // For ordering within a chat
    userId: v.optional(v.id("users")), // For user messages
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("data")
    ),
    content: v.optional(v.string()),
    parts: v.optional(v.any()), // AI SDK parts format
    attachments: v.optional(v.array(v.any())), // Legacy field; v6 uses file parts in `parts`
    messageGroupId: v.optional(v.string()), // For grouping related messages
    model: v.optional(v.string()), // Model used for this message
  })
    .index("by_chat", ["chatId"])
    .index("by_chat_role", ["chatId", "role"]),

  projects: defineTable({
    userId: v.id("users"),
    name: v.string(),
  }).index("by_user", ["userId"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    layout: v.optional(v.string()),
    promptSuggestions: v.optional(v.boolean()),
    showToolInvocations: v.optional(v.boolean()),
    showConversationPreviews: v.optional(v.boolean()),
    multiModelEnabled: v.optional(v.boolean()),
    webSearchEnabled: v.optional(v.boolean()),
    hiddenModels: v.optional(v.array(v.string())),
  }).index("by_user", ["userId"]),

  userKeys: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    encryptedKey: v.string(),
    iv: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  feedback: defineTable({
    userId: v.id("users"),
    message: v.string(),
  }).index("by_user", ["userId"]),

  // File attachments tracking
  chatAttachments: defineTable({
    chatId: v.id("chats"),
    userId: v.id("users"),
    storageId: v.optional(v.id("_storage")), // Convex storage reference
    fileUrl: v.string(), // Public URL
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  })
    .index("by_chat", ["chatId"])
    .index("by_user", ["userId"]),

  // Anonymous usage tracking (for rate limiting unauthenticated users)
  anonymousUsage: defineTable({
    anonymousId: v.string(), // Client-generated persistent ID
    dailyMessageCount: v.number(),
    dailyReset: v.number(), // Unix timestamp (start of day)
  }).index("by_anonymous_id", ["anonymousId"]),

  // ============================================================================
  // MCP (Model Context Protocol) Integration
  // ============================================================================

  mcpServers: defineTable({
    userId: v.id("users"),
    name: v.string(),
    url: v.string(),
    transport: v.union(v.literal("http"), v.literal("sse")),
    enabled: v.boolean(),
    // Auth fields are optional at the schema level because they depend on authType.
    // Invariant enforced in mcpServers.create/update mutations:
    //   - bearer/header: encryptedAuthValue + authIv required
    //   - header: headerName additionally required
    //   - none: auth fields must be absent
    authType: v.optional(
      v.union(v.literal("none"), v.literal("bearer"), v.literal("header"))
    ),
    encryptedAuthValue: v.optional(v.string()),
    authIv: v.optional(v.string()),
    headerName: v.optional(v.string()),
    createdAt: v.number(),
    lastConnectedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_enabled", ["userId", "enabled"]),

  mcpToolApprovals: defineTable({
    userId: v.id("users"),
    serverId: v.id("mcpServers"),
    toolName: v.string(),
    approved: v.boolean(),
    approvedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_server", ["serverId"])
    .index("by_user_server", ["userId", "serverId"])
    .index("by_user_server_tool", ["userId", "serverId", "toolName"]),

  toolCallLog: defineTable({
    userId: v.id("users"),
    chatId: v.optional(v.id("chats")),
    serverId: v.optional(v.id("mcpServers")), // Optional — only present for MCP tools
    toolName: v.string(),
    toolCallId: v.string(),
    inputPreview: v.optional(v.string()),
    outputPreview: v.optional(v.string()),
    success: v.boolean(),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    // Tool source discriminator — identifies which layer produced the tool call.
    // REQUIRED (not optional) — clean break, no existing data to migrate.
    source: v.union(
      v.literal("builtin"),
      v.literal("third-party"),
      v.literal("mcp")
    ),
    // Service name for display and filtering (e.g., "OpenAI", "Exa", "my-mcp-server")
    serviceName: v.optional(v.string()),

    // --- Phase C: Observability enrichment (all optional, backward compatible) ---

    // Step number within the streaming response (1-indexed).
    // Enables ordering tool calls chronologically within a single generation.
    stepNumber: v.optional(v.number()),

    // Token usage for the step that produced this tool call.
    // Captured from onStepFinish usage — NOT per-tool, but per-step.
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),

    // Original result size in bytes before truncation.
    // Helps identify tools that consistently return large results.
    resultSizeBytes: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_chat", ["chatId"])
    .index("by_server", ["serverId"])
    .index("by_source", ["source"]),
})
