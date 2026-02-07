# MCP Integration Plan: Not A Wrapper

> **Date**: February 7, 2026
> **Status**: Draft
> **Priority**: P0 — Critical (per competitive-feature-analysis.md)
> **Author**: AI Agent (research + architecture)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Key Architectural Decisions](#3-key-architectural-decisions)
4. [Option A: Per-Request MCP Client (Stateless Serverless)](#4-option-a-per-request-mcp-client-stateless-serverless)
5. [Option B: Cached Tool Registry with Background Sync](#5-option-b-cached-tool-registry-with-background-sync)
6. [Option C: Client-Side MCP Resolution with Server Proxy](#6-option-c-client-side-mcp-resolution-with-server-proxy)
7. [Comparison Matrix](#7-comparison-matrix)
8. [Recommendation](#8-recommendation)
9. [Appendix: Shared Implementation Details](#9-appendix-shared-implementation-details)

---

## 1. Executive Summary

MCP (Model Context Protocol) integration is the single most strategically important feature for Not A Wrapper. It transforms the app from a multi-model chat interface into a **universal AI interface** that can interact with any tool ecosystem — without building native integrations for each service.

Both ChatGPT (60+ apps/connectors, remote MCP servers) and Claude (connectors/MCP for Google Workspace, Slack) are investing heavily here. Not A Wrapper already has `@ai-sdk/mcp` installed (v1.0.18) and two utility files (`lib/mcp/load-mcp-from-local.ts`, `lib/mcp/load-mcp-from-url.ts`), but these are **not wired into the chat flow** — the chat route passes `tools: {} as ToolSet` to `streamText()`.

This plan presents three architecturally distinct approaches to closing this gap, each making different tradeoffs on latency, complexity, security, and scope.

### Constraints Applied to All Options

- **No stdio transport in v1.** The chat API runs on Vercel serverless functions (`app/api/chat/route.ts`, `maxDuration = 60`), which cannot maintain persistent child processes. Only HTTP-based transports (Streamable HTTP and SSE) are viable for v1.
- **Streamable HTTP is preferred over SSE.** Per Vercel's official guidance (June 2025), Streamable HTTP is the recommended transport — it eliminates persistent connections and reduces CPU usage by ~50% vs SSE. The existing `lib/mcp/load-mcp-from-url.ts` uses SSE and should be updated. **Pre-implementation spike required:** The AI SDK docs list `'sse' | 'http'` as valid transport types, but `type: 'http'` support should be verified at the installed `@ai-sdk/mcp` `^1.0.18` version before committing to it. Write a minimal integration test against a known public MCP server. If `type: 'http'` fails, fall back to `type: 'sse'` for v1 (already proven to work). Pin the `@ai-sdk/mcp` version in `package.json` rather than relying on the caret range to avoid surprise breakage.
- **Security is non-negotiable.** Each option addresses trust models, allowlisting, per-tool approval, and audit logging.
- **Convex is the database.** All persistent state (server configs, tool registries, audit logs) lives in Convex, consistent with the rest of the app.

---

## 2. Current State Analysis

### What Exists Today

| Component | File | Status |
|-----------|------|--------|
| MCP client (stdio) | `lib/mcp/load-mcp-from-local.ts` | Working utility, not integrated |
| MCP client (SSE) | `lib/mcp/load-mcp-from-url.ts` | Working utility, not integrated |
| Chat streaming route | `app/api/chat/route.ts` | Production — `tools: {} as ToolSet` (empty) |
| Tool invocation UI | `app/components/chat/tool-invocation.tsx` | Production — renders tool calls with args/results |
| Connections settings tab | `app/components/layout/settings/connections/` | Placeholder UI (`ConnectionsPlaceholder`, `OllamaSection`, `DeveloperTools`) |
| BYOK encryption | `lib/encryption.ts` | Production — AES-256-GCM for API keys |
| Rate limiting | `app/api/chat/api.ts`, `convex/usage.ts` | Production — tiered daily limits |
| User keys (Convex) | `convex/userKeys.ts` | Production — encrypted key storage with provider lookup |
| `@ai-sdk/mcp` package | `package.json` | Installed v1.0.18 |

### What's Missing

1. **No MCP server configuration storage** — No Convex table for user-configured MCP servers
2. **No tool loading in chat route** — `streamText()` receives empty tools
3. **No Connections UI** — The settings tab is a placeholder
4. **No trust/approval model** — No allowlisting, no per-tool approval, no audit logging
5. **No tool call rate limiting** — Usage tracking counts messages, not tool calls
6. **Transport needs updating** — Existing SSE transport should be updated to Streamable HTTP per latest spec

### AI SDK MCP API (v6)

The `createMCPClient()` from `@ai-sdk/mcp` supports:

```typescript
// HTTP transport (recommended for production)
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://server.example.com/mcp',
    headers: { Authorization: 'Bearer token' },
  },
});

// SSE transport (legacy, still supported)
const client = await createMCPClient({
  transport: { type: 'sse', url: 'https://server.example.com/sse' },
});

// Get tools compatible with streamText()
const tools = await client.tools();

// Must close after use (critical in serverless)
await client.close();
```

The `tools()` method returns a `ToolSet` directly compatible with `streamText()`. Tool results are rendered by the existing `tool-invocation.tsx` component.

---

## 3. Key Architectural Decisions

Before evaluating options, these are the cross-cutting decisions each option must address:

### D1: Where are MCP server configurations stored?

All options store configs in a new `mcpServers` Convex table. The question is what metadata is stored alongside the URL.

### D2: When are tool definitions loaded?

This is the key differentiator between options. Loading tools requires connecting to an MCP server, which has latency and reliability implications in a serverless context.

### D3: How are tools passed to `streamText()`?

The AI SDK expects a `ToolSet` object. MCP tools from `client.tools()` are already in this format. The question is how to merge tools from multiple servers and how to filter by user approval.

### D4: How does trust and approval work?

Options range from "all tools from allowlisted servers are auto-approved" to "each tool requires explicit per-user approval before first use."

### D5: How does this interact with BYOK and rate limiting?

MCP tool calls consume model tokens (the model decides to call tools). Some MCP servers may also require authentication. The system must handle both.

### D6: How are MCP connections cleaned up in serverless?

`createMCPClient()` returns a `close()` method that must be called. In serverless, this must happen in `onFinish` or via `after()` from `next/server`. Failure to close leaks connections.

---

## 4. Option A: Per-Request MCP Client (Stateless Serverless)

### Architecture

The simplest approach: on every chat request, the API route creates MCP clients for the user's configured servers, loads tools, passes them to `streamText()`, and closes clients when streaming finishes.

```
┌─────────────────────────────────────────────────────────────┐
│                    POST /api/chat                            │
│                                                             │
│  1. Auth + rate limit check (existing)                      │
│  2. Fetch user's MCP servers from Convex                    │
│  3. For each enabled server:                                │
│     a. createMCPClient({ transport: { type: 'http', url }}) │
│     b. client.tools() → ToolSet                            │
│  4. Merge all tools + filter by user's approved tools       │
│  5. streamText({ ..., tools: mergedTools })                 │
│  6. onFinish: close all MCP clients + log tool calls        │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Changes

```typescript
// convex/schema.ts — new tables

mcpServers: defineTable({
  userId: v.id("users"),
  name: v.string(),                          // "My GitHub MCP"
  url: v.string(),                           // "https://mcp.example.com/mcp"
  transport: v.union(
    v.literal("http"),
    v.literal("sse")
  ),
  enabled: v.boolean(),
  // Optional auth — encrypted like BYOK keys
  authType: v.optional(v.union(
    v.literal("none"),
    v.literal("bearer"),
    v.literal("header")
  )),
  encryptedAuthValue: v.optional(v.string()),
  authIv: v.optional(v.string()),
  headerName: v.optional(v.string()),        // For custom header auth
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
  .index("by_user_server", ["userId", "serverId"]),

mcpToolCallLog: defineTable({
  userId: v.id("users"),
  chatId: v.optional(v.id("chats")),   // Optional — may be absent in tool-testing flows
  serverId: v.id("mcpServers"),
  toolName: v.string(),
  toolCallId: v.string(),
  inputPreview: v.optional(v.string()), // Truncated first 500 chars (avoid storing sensitive data)
  outputPreview: v.optional(v.string()),// Truncated first 500 chars
  success: v.boolean(),
  durationMs: v.optional(v.number()),
  error: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_chat", ["chatId"])
  .index("by_server", ["serverId"]),
```

### Files to Create or Modify

| File | Action | Description |
|------|--------|-------------|
| `convex/schema.ts` | Modify | Add `mcpServers`, `mcpToolApprovals`, `mcpToolCallLog` tables |
| `convex/mcpServers.ts` | Create | CRUD mutations/queries for MCP server configs |
| `convex/mcpToolApprovals.ts` | Create | Tool approval mutations/queries |
| `convex/mcpToolCallLog.ts` | Create | Audit log mutations |
| `lib/mcp/load-tools.ts` | Create | Orchestrates multi-server tool loading with filtering |
| `lib/mcp/load-mcp-from-url.ts` | Modify | Update to support `type: 'http'` transport (currently SSE-only) |
| `app/api/chat/route.ts` | Modify | Wire tool loading before `streamText()`, close clients in `onFinish` |
| `app/components/layout/settings/connections/mcp-servers.tsx` | Create | MCP server management UI |
| `app/components/layout/settings/connections/mcp-server-form.tsx` | Create | Add/edit server form with URL validation and test connection |
| `app/components/layout/settings/connections/mcp-tool-approvals.tsx` | Create | Per-tool approval management |
| `app/components/layout/settings/settings-content.tsx` | Modify | Replace `ConnectionsPlaceholder` with MCP UI. **Note:** The current file conditionally renders `{!isDev && <ConnectionsPlaceholder />}` and shows `OllamaSection`/`DeveloperTools` only in dev mode. The MCP server UI should be visible to **all** users (not gated on `isDev`), while keeping Ollama/DevTools as dev-only alongside the new MCP section. |

### Modified Chat Route (Conceptual)

```typescript
// app/api/chat/route.ts — key changes (conceptual, not implementation)

import { loadUserMcpTools, closeMcpClients } from "@/lib/mcp/load-tools"

// Inside POST handler, after auth and rate limiting:

// IMPORTANT: The chat route's `userId` is a Clerk ID string (e.g., "user_2abc..."),
// NOT a Convex v.id("users"). The MCP tool loading function must resolve the Convex
// user ID internally using the convexToken, following the same pattern as
// convex/userKeys.ts (which uses ctx.auth.getUserIdentity() → users.by_clerk_id).
//
// The loadUserMcpTools function accepts the convexToken and resolves the user
// internally via Convex auth — it does NOT accept a raw userId string.

// Only load MCP tools for authenticated users (see Appendix F)
let mcpTools: ToolSet = {} as ToolSet
let mcpClients: MCPClient[] = []

if (isAuthenticated && convexToken && process.env.ENABLE_MCP === 'true') {
  const result = await loadUserMcpTools(convexToken, { timeout: 5000 })
  mcpTools = result.tools
  mcpClients = result.clients
}

const result = streamText({
  model: aiModel,
  system: effectiveSystemPrompt,
  messages: modelMessages,
  tools: mcpTools, // Previously: {} as ToolSet
  stopWhen: stepCountIs(10),

  onFinish: async ({ text, usage }) => {
    // Close all MCP clients
    await closeMcpClients(mcpClients)

    // Log tool calls to Convex audit log
    // ... existing PostHog tracking ...
  },
})
```

### Security Model

- **Server allowlisting**: Users add servers manually via Settings > Connections. No curated directory in v1.
- **URL validation (SSRF protection)**: All user-provided MCP server URLs are validated before storage and connection. The server rejects: private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x), `localhost` and `0.0.0.0`, non-HTTPS URLs (plain HTTP disallowed in production). Validation runs in the `convex/mcpServers.ts` creation/update mutations.
- **Auto-approve on server add (v1)**: When a user adds an MCP server, all discovered tools are auto-inserted into `mcpToolApprovals` with `approved: true`. The trust boundary in v1 is server-level — the user explicitly chose to add the server URL. Users can individually disable tools from Settings > Connections after discovery. New tools discovered on subsequent requests from an already-added server are also auto-approved (with a notification in the UI). Granular per-tool pre-approval can be added in v1.1.
- **Audit logging**: Tool calls are logged to `mcpToolCallLog` with: tool name, duration, success/failure status, and a truncated input/output preview (first 500 chars). Full input/output is intentionally not stored to avoid persisting sensitive data (PII, tokens) that MCP tools may process. A `debugMode` user preference can enable full logging in v1.1.
- **Tool output size limit**: Tool results are capped at `MAX_TOOL_RESULT_SIZE` (100KB). Results exceeding this are truncated before being passed to the model and before audit logging, preventing memory pressure in the serverless function and token waste in the LLM context.
- **Auth for MCP servers**: Server auth tokens are encrypted using the same AES-256-GCM pattern as BYOK keys (`lib/encryption.ts`). The same `ENCRYPTION_KEY` environment variable is reused.
- **Connection timeout**: Each MCP server connection has a 5-second timeout. Failing servers are skipped with an error logged.

### Pros

1. **Simplest architecture.** No caching layer, no background jobs, no additional infrastructure. The chat route remains a pure function: request in, stream out.
2. **Always-fresh tools.** Every request gets the latest tool definitions from MCP servers. No stale cache issues if a server adds/removes tools.
3. **Minimal blast radius.** A failing MCP server only affects the current request. No global cache corruption, no background sync failures to debug.
4. **Natural cleanup.** MCP clients are created and closed within a single request lifecycle. The `onFinish` callback on `streamText()` provides a clean hook, and `after()` from `next/server` provides a fallback.
5. **Reuses existing patterns.** Follows the same per-request pattern as API key resolution (`getEffectiveApiKey` in `lib/user-keys.ts`) and rate limiting. No new infrastructure patterns to learn.

### Cons

1. **Added latency on every request.** Creating MCP clients and calling `tools()` adds network round-trips per server. With 3 servers, this could add 500ms–2s to initial response time. Users with many configured servers will feel this.
2. **Vercel function timeout pressure.** The function has `maxDuration = 60` seconds. MCP client creation + tool loading + LLM streaming + tool execution all share this budget. Complex multi-tool conversations may timeout.
3. **Connection overhead at scale.** Each chat message creates new TCP/HTTP connections to all configured MCP servers. This doesn't cache or reuse connections between requests, even within warm Vercel function containers.
4. **No offline awareness.** If an MCP server is down, the user discovers this only when they send a message. There's no pre-flight health check or status indicator.
5. **No granular pre-approval.** Tools are auto-approved at the server level in v1. Users who want to selectively disable specific tools must do so after discovery via Settings. This is acceptable for v1 but a granular pre-approval flow should be added in v1.1.

### Risks and Open Questions

- **Timeout risk**: What if MCP servers are slow to respond? Need a circuit-breaker pattern: skip servers that fail 3+ times in a row.
- **Tool name collisions**: Two MCP servers may expose tools with the same name. Need a namespacing strategy (e.g., `server-slug:tool-name`).
- **Max tools limit**: LLMs have practical limits on how many tools they can reason about (~20-50). Need a tool count limit or selection mechanism.
- **Anonymous users**: Should anonymous users have access to MCP tools? The current rate limiting separates auth/anon. Recommendation: MCP is auth-only.

### Estimated Complexity and Timeline

- **Complexity**: Medium
- **Timeline**: 2–3 weeks
  - Week 1: Convex schema, server CRUD, basic connections UI
  - Week 2: Tool loading in chat route, tool approval flow, audit logging
  - Week 3: Error handling, timeout/circuit-breaker, testing, polish

---

## 5. Option B: Cached Tool Registry with Background Sync

### Architecture

Tool definitions are fetched from MCP servers in the background and cached in Convex. The chat route reads tools from the cache instead of connecting to MCP servers on every request, eliminating per-request latency.

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Background Sync (Convex Action / Cron)              │
│                                                                      │
│  1. For each enabled MCP server:                                     │
│     a. createMCPClient({ transport: { type: 'http', url }})         │
│     b. client.tools() → tool definitions (schemas)                  │
│     c. Store tool schemas in mcpToolCache table                     │
│     d. Close client                                                  │
│  2. Runs on: server add/edit, manual refresh, periodic (every 15m)  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                       POST /api/chat                                 │
│                                                                      │
│  1. Auth + rate limit check (existing)                               │
│  2. Read cached tool definitions from Convex                         │
│  3. Build runtime tool executors using cached schemas                 │
│  4. For each tool call during streaming:                             │
│     a. Create ephemeral MCP client to target server                  │
│     b. Execute the tool call                                         │
│     c. Close client                                                  │
│  5. Log tool calls for audit                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Database Schema Changes

Same as Option A, plus:

```typescript
// convex/schema.ts — additional table

mcpToolCache: defineTable({
  serverId: v.id("mcpServers"),
  userId: v.id("users"),
  toolName: v.string(),
  description: v.optional(v.string()),
  inputSchema: v.any(),          // JSON Schema for tool parameters
  outputSchema: v.optional(v.any()),
  lastSyncedAt: v.number(),
  syncError: v.optional(v.string()),
})
  .index("by_server", ["serverId"])
  .index("by_user", ["userId"])
  .index("by_user_server", ["userId", "serverId"]),
```

### Files to Create or Modify

Everything from Option A, plus:

| File | Action | Description |
|------|--------|-------------|
| `convex/mcpToolCache.ts` | Create | Tool cache CRUD + sync logic |
| `convex/mcpSync.ts` | Create | Convex action for background tool sync |
| `lib/mcp/build-tools-from-cache.ts` | Create | Reconstructs AI SDK ToolSet from cached schemas |
| `lib/mcp/tool-executor.ts` | Create | Ephemeral MCP client for executing individual tool calls |

### How Tool Execution Works

The cache stores **tool schemas** (name, description, input/output schema), not executable tool functions. At request time, the system builds AI SDK-compatible tool definitions with custom `execute` functions that:

1. Look up which MCP server owns the tool (from the cache metadata)
2. Create an ephemeral MCP client to that server
3. Execute the specific tool call
4. Close the client
5. Return the result

```typescript
// Conceptual: building executable tools from cached schemas
function buildToolFromCache(
  cachedTool: CachedTool,
  serverUrl: string,
  serverAuth?: { type: string; value: string }
): Tool {
  return tool({
    description: cachedTool.description,
    parameters: jsonSchema(cachedTool.inputSchema),
    execute: async (args) => {
      const client = await createMCPClient({
        transport: { type: 'http', url: serverUrl, headers: buildAuthHeaders(serverAuth) },
      });
      try {
        const serverTools = await client.tools();
        const result = await serverTools[cachedTool.toolName].execute(args);
        return result;
      } finally {
        await client.close();
      }
    },
  });
}
```

### Security Model

Same as Option A, plus:

- **Sync-time validation**: When syncing tools, validate tool schemas against a size/complexity limit (e.g., max 50 tools per server, max 10KB per schema). Reject servers with suspicious tool definitions.
- **Cache freshness indicators**: UI shows "Last synced: 5 minutes ago" with a manual refresh button. Stale caches (>1 hour) show a warning.
- **Sync audit trail**: All sync operations are logged, including which tools appeared/disappeared between syncs.

### Pros

1. **Near-zero chat latency impact.** The chat route reads tool schemas from Convex (fast database read) instead of connecting to MCP servers. Tool loading adds ~50ms instead of ~500ms–2s.
2. **Pre-flight tool discovery.** Users can see available tools before sending a message. The UI can show "3 servers connected, 12 tools available" in the chat input area.
3. **Resilience to MCP server downtime.** If an MCP server goes down, cached tools are still visible. Execution will fail, but the user sees a clear error rather than a silent omission of tools.
4. **Tool browsing and approval UX.** Cached tool metadata enables a rich approval UI: browse all available tools, see descriptions and parameters, approve/reject before ever sending a message.
5. **Tool count management.** The cache enables intelligent tool selection: if a user has 50+ tools, the system can select the most relevant ones per conversation based on tool descriptions and conversation context.

### Cons

1. **Significant added complexity.** Introduces a background sync system, cache invalidation, and a custom tool executor layer. This is a meaningful increase in moving parts vs Option A.
2. **Cache staleness.** Tools may change on the MCP server between syncs. A tool that was cached 15 minutes ago may have different parameters or no longer exist. This leads to runtime errors that are confusing to debug.
3. **Custom tool executor is non-trivial.** Reconstructing AI SDK tools from cached schemas and building ephemeral clients for execution requires careful engineering. The `@ai-sdk/mcp` library doesn't natively support this pattern — it expects `createMCPClient` → `tools()` → `streamText()` as a unit.
4. **Convex action limitations.** Convex actions (server-side functions that can make HTTP requests) have their own timeout limits. Syncing many servers with many tools may hit these limits.
5. **Double connection cost for execution.** When a tool is actually called, an ephemeral MCP client is still created for execution. This means the background sync saved latency on the initial tool listing, but execution still pays the connection cost.

### Risks and Open Questions

- **Convex action reliability**: Background sync runs as Convex actions. What happens if the sync fails repeatedly? Need a retry strategy with exponential backoff and a "sync failed" status visible to users.
- **Schema compatibility**: Cached JSON schemas must be 100% compatible with what the AI SDK expects. Any version mismatches could cause silent failures.
- **Stale tool execution**: What if a cached tool is called but no longer exists on the server? Need graceful error handling that surfaces "Tool no longer available" to the user.
- **Sync frequency**: 15-minute sync interval is a balance between freshness and server load. Configurable per-server?

### Estimated Complexity and Timeline

- **Complexity**: High
- **Timeline**: 3–4 weeks
  - Week 1: Convex schema, server CRUD, cache table, connections UI
  - Week 2: Background sync system (Convex actions), cache management
  - Week 3: Custom tool executor, integration with chat route, tool approval UI
  - Week 4: Error handling, sync monitoring, cache invalidation, testing

---

## 6. Option C: Client-Side MCP Resolution with Server Proxy

### Architecture

A fundamentally different approach: MCP server connections are managed by the **client (browser)**, not the API route. The browser connects to MCP servers, discovers tools, and sends tool definitions as part of the chat request. The server acts as a proxy, executing tool calls on behalf of the client during streaming.

This is closer to how Cursor IDE handles MCP: the client is aware of available tools and explicitly provides them to the AI.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                     │
│                                                         │
│  1. User configures MCP servers in Settings              │
│  2. Client connects to each server via fetch/SSE         │
│  3. Client discovers tools → stores in local state       │
│  4. On chat submit: sends messages + toolDefinitions[]   │
│     to POST /api/chat                                    │
│  5. During streaming, when tool call is needed:          │
│     Server pauses → client executes tool via MCP         │
│     → sends result back → streaming resumes              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    POST /api/chat                        │
│                                                         │
│  1. Receives messages + toolDefinitions from client      │
│  2. Validates tool definitions against allowlist         │
│  3. streamText({ tools: validatedTools })                │
│  4. Tool execution is handled client-side via            │
│     the AI SDK's tool result protocol                    │
└─────────────────────────────────────────────────────────┘
```

### Variant: Server-Proxied Execution

Since MCP servers may require authentication that shouldn't be exposed to the browser, a hybrid variant uses client-side tool discovery but server-side execution:

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                     │
│                                                         │
│  1. Fetches tool catalog from API (server-rendered)      │
│  2. Sends selected tools + messages to POST /api/chat    │
│                                                         │
│                    POST /api/chat                        │
│  3. For tool calls: creates ephemeral MCP client         │
│     on server, executes tool, returns result in stream   │
└─────────────────────────────────────────────────────────┘
```

### Database Schema Changes

Same `mcpServers`, `mcpToolApprovals`, `mcpToolCallLog` tables as Option A.

Additional:

```typescript
// No mcpToolCache table needed — client manages tool state

// API endpoint for tool catalog
// GET /api/mcp/tools → returns tool definitions for user's servers
// POST /api/mcp/execute → proxies a tool call to the target MCP server
```

### Files to Create or Modify

| File | Action | Description |
|------|--------|-------------|
| `convex/schema.ts` | Modify | Add `mcpServers`, `mcpToolApprovals`, `mcpToolCallLog` |
| `convex/mcpServers.ts` | Create | Server config CRUD |
| `app/api/mcp/tools/route.ts` | Create | API to fetch tool catalog (connects to servers, returns tool schemas) |
| `app/api/mcp/execute/route.ts` | Create | API to proxy tool execution to MCP servers |
| `app/api/chat/route.ts` | Modify | Accept `toolDefinitions` in request, validate, build tools |
| `lib/mcp/load-mcp-from-url.ts` | Modify | Update to `type: 'http'` transport |
| `app/hooks/use-mcp-tools.ts` | Create | Client hook to manage MCP tool state |
| `app/components/chat/chat-input/mcp-tool-indicator.tsx` | Create | Shows active tools in input area |
| `app/components/layout/settings/connections/mcp-servers.tsx` | Create | Server management UI |
| `app/components/layout/settings/settings-content.tsx` | Modify | Wire MCP UI into connections tab |

### Modified Chat Request Type

```typescript
type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  model: string
  systemPrompt: string
  enableSearch: boolean
  message_group_id?: string
  userId?: string
  // New: client-provided MCP tool definitions
  mcpTools?: Array<{
    serverId: string       // Convex ID of the MCP server
    toolName: string
    description?: string
    inputSchema: object    // JSON Schema
  }>
}
```

### Security Model

This option requires the **most careful security design** because tool definitions come from the client:

- **Server-side validation**: Every tool definition received from the client is validated against the user's `mcpServers` table. The server never trusts client-provided server URLs — it looks up the URL from Convex using the `serverId`.
- **Tool allowlist enforcement**: The server checks `mcpToolApprovals` before including any tool. Unapproved tools are silently dropped.
- **Schema validation**: Tool input schemas are validated for size and structure. Malicious schemas (e.g., extremely large, recursive) are rejected.
- **Execution proxy**: Tool calls are executed server-side through the proxy endpoint, never from the browser directly. This keeps MCP server auth tokens on the server.
- **Rate limiting for tool execution**: The `/api/mcp/execute` endpoint has its own rate limits, separate from chat message limits.

### Pros

1. **Decouples tool discovery from chat latency.** Tool discovery happens before the user sends a message (via the `use-mcp-tools` hook). The chat route receives pre-resolved tool definitions, adding zero latency for tool loading.
2. **Rich client-side tool UX.** The browser has full knowledge of available tools, enabling: tool search/filter in the input area, `@`-mention style tool invocation (a la ChatGPT), visual indicators of which tools are active, and per-message tool selection.
3. **Graceful degradation.** If an MCP server is unreachable, the client knows immediately (during tool discovery) and can show a status indicator. The user can still send messages — they just won't have that server's tools.
4. **Client-side tool selection.** Users can explicitly enable/disable specific tools per conversation or per message. This gives fine-grained control and prevents tool overload (too many tools confusing the model).
5. **Future-proof for `@`-mention UX.** The competitive analysis identified ChatGPT's `@`-mention system for integrations as an important pattern. This architecture naturally supports it: the client knows all tools and can surface them via `@` mention.

### Cons

1. **Increased attack surface.** Tool definitions arrive from the client, requiring rigorous server-side validation. A malicious client could attempt to inject tools that point to unauthorized servers. The server must independently verify every server ID against Convex.
2. **Client-side MCP connections are limited.** Browser fetch/SSE connections have CORS restrictions. Many MCP servers won't have CORS headers configured for browser access. This means the "client connects directly to MCP servers" variant is impractical — the server proxy variant is required.
3. **Two-API design.** Requires both `/api/mcp/tools` (tool catalog) and `/api/mcp/execute` (tool proxy) endpoints in addition to the existing `/api/chat`. This is more API surface to maintain, test, and secure.
4. **Complex client-side state.** The `use-mcp-tools` hook must manage connections, tool caching, error states, and reconnection for multiple MCP servers. This is significant client-side complexity.
5. **Message payload bloat.** Tool definitions are sent with every chat request. With 20+ tools, this adds meaningful payload size to each request (tool schemas can be large).

### Risks and Open Questions

- **CORS is a blocker for direct client connections.** Most MCP servers are not configured for browser CORS. The server-proxied variant is more practical but loses some of the client-side benefits.
- **Tool schema serialization**: JSON Schema objects must round-trip from server → client → server without losing fidelity. Need careful serialization.
- **Stale client state**: If tools change on the MCP server while the user has a browser tab open, the client's tool catalog becomes stale. Need a refresh mechanism.
- **Multi-tab consistency**: If a user has two tabs open, tool states may diverge. Need to sync via IndexedDB or similar.

### Estimated Complexity and Timeline

- **Complexity**: High
- **Timeline**: 3–4 weeks
  - Week 1: Convex schema, server CRUD, connections UI
  - Week 2: `/api/mcp/tools` and `/api/mcp/execute` endpoints, server-side validation
  - Week 3: `use-mcp-tools` client hook, tool indicator UI, integration with chat route
  - Week 4: `@`-mention UX, error handling, CORS/proxy edge cases, testing

---

## 7. Comparison Matrix

| Dimension | Option A: Per-Request | Option B: Cached Registry | Option C: Client-Side |
|-----------|----------------------|--------------------------|----------------------|
| **Tool loading latency** | 500ms–2s per request | ~50ms (cache read) | ~0ms (pre-loaded) |
| **Tool freshness** | Always fresh | 15-min staleness window | Refreshed on page load |
| **Serverless compatibility** | Excellent | Good (sync via Convex actions) | Excellent |
| **Architecture complexity** | Low | High | High |
| **New Convex tables** | 3 | 4 | 3 |
| **New API endpoints** | 0 | 0 | 2 |
| **Client-side changes** | Settings UI only | Settings UI + tool browser | Settings UI + hook + indicator + `@`-mention |
| **Security complexity** | Low | Medium (sync validation) | High (client-sent tool validation) |
| **Offline/degraded UX** | Poor (fails on send) | Good (cached tools visible) | Good (status indicators) |
| **`@`-mention potential** | Possible but awkward | Possible via cached catalog | Natural fit |
| **Risk level** | Low | Medium | Medium-High |
| **Timeline** | 2–3 weeks | 3–4 weeks | 3–4 weeks |
| **v1 viability** | Best | Good | Risky for v1 |

---

## 8. Recommendation

### Recommended: Option A for v1, evolve toward Option C for v2

**Start with Option A (Per-Request MCP Client)** because:

1. **Fastest path to value.** MCP integration is the #1 strategic priority. Getting it into users' hands in 2–3 weeks matters more than optimizing latency that can be improved later.
2. **Lowest risk.** The architecture is simple, follows existing patterns (per-request key resolution, per-request rate limiting), and has minimal new infrastructure.
3. **Foundation for evolution.** The Convex schema (servers, approvals, audit logs) and UI components (connections settings, tool approval) created in Option A are reused by all other options. Nothing is throwaway.
4. **Latency is manageable.** The 500ms–2s overhead for tool loading is noticeable but acceptable for v1. Users are already accustomed to ~1s before streaming starts (auth, rate limit check, model initialization). Most users will have 1–3 MCP servers, not 10+.

**Plan the evolution:**

- **v1.1** (2–4 weeks after v1): Add a simple tool cache in Convex to eliminate repeated tool loading for servers that haven't changed. This borrows from Option B but without the full background sync system — just cache tool schemas after the first load and refresh on user action.
- **v2** (longer term): Implement client-side tool awareness from Option C, enabling `@`-mention tool invocation and per-message tool selection. This requires the server proxy endpoints and the client hook. By this point, the MCP ecosystem will be more mature and CORS/auth patterns will be more standardized.

### Immediate Next Steps (if approved)

1. Update `lib/mcp/load-mcp-from-url.ts` to support `type: 'http'` transport (Streamable HTTP)
2. Add `mcpServers`, `mcpToolApprovals`, `mcpToolCallLog` tables to `convex/schema.ts`
3. Build `convex/mcpServers.ts` with CRUD operations
4. Build the Connections settings UI (replace `ConnectionsPlaceholder`)
5. Implement `lib/mcp/load-tools.ts` — multi-server tool loading with timeout and approval filtering
6. Wire into `app/api/chat/route.ts` — load tools before `streamText()`, close in `onFinish`
7. Test with a public MCP server (e.g., the Vercel MCP template)
8. Add circuit-breaker for failing servers
9. Add tool call audit logging

---

## 9. Appendix: Shared Implementation Details

### A. Dependencies

| Package | Current Version | Action | Justification |
|---------|----------------|--------|---------------|
| `@ai-sdk/mcp` | v1.0.18 | Keep / update | Already installed. Provides `createMCPClient()` and transport types. Check for updates to ensure Streamable HTTP support. |
| `@modelcontextprotocol/sdk` | Not installed | Consider for v1.1+ | Official MCP SDK provides `StreamableHTTPClientTransport` for more control. Not required for v1 since `@ai-sdk/mcp` wraps it. |

No new dependencies are required for Option A. The existing `@ai-sdk/mcp` package supports both `http` and `sse` transport types via configuration.

### B. Transport Strategy

```typescript
// v1: Use @ai-sdk/mcp's built-in http transport
const client = await createMCPClient({
  transport: {
    type: 'http', // Streamable HTTP (recommended)
    url: serverConfig.url,
    headers: serverConfig.authType === 'bearer'
      ? { Authorization: `Bearer ${decryptedAuthValue}` }
      : serverConfig.authType === 'header'
        ? { [serverConfig.headerName!]: decryptedAuthValue! }
        : undefined,
  },
});

// Fallback: SSE for servers that don't support Streamable HTTP
const client = await createMCPClient({
  transport: {
    type: 'sse',
    url: serverConfig.url,
    headers: buildAuthHeaders(serverConfig),
  },
});
```

### C. Tool Namespacing Strategy

To prevent tool name collisions between MCP servers:

```typescript
// Prefix tool names with a server slug
const namespacedTools: ToolSet = {};
for (const [toolName, toolDef] of Object.entries(serverTools)) {
  const key = `${serverSlug}_${toolName}`;
  namespacedTools[key] = toolDef;
}
```

The `tool-invocation.tsx` component should strip the namespace prefix for display, showing only the tool name to the user.

### D. Connection Lifecycle in Serverless

```typescript
// Correct pattern for Vercel serverless
const clients: MCPClient[] = [];

try {
  // Create clients
  for (const server of enabledServers) {
    const client = await createMCPClient({ transport: { type: 'http', url: server.url } });
    clients.push(client);
  }

  // Use tools
  const result = streamText({
    tools: mergedTools,
    onFinish: async () => {
      // Primary cleanup: close in onFinish
      await Promise.allSettled(clients.map(c => c.close()));
    },
  });

  // Fallback cleanup: after() runs after response is sent
  after(async () => {
    await Promise.allSettled(clients.map(c => c.close()));
  });

  return result.toUIMessageStreamResponse({ ... });
} catch (error) {
  // Error cleanup
  await Promise.allSettled(clients.map(c => c.close()));
  throw error;
}
```

### E. Rate Limiting Interaction

Tool calls consume model tokens (the LLM generates tool call tokens), so they're already counted by the existing message-level rate limiting in `convex/usage.ts`. No separate tool call rate limiting is needed for v1.

For v2, consider adding tool-call-specific limits to prevent abuse (e.g., a user configuring a loop that makes hundreds of tool calls).

### F. Anonymous User Policy

MCP tools should be **restricted to authenticated users only** in v1. Reasons:
- MCP servers may expose sensitive operations
- Tool calls increase token consumption (rate limiting is already tighter for anonymous users)
- The approval model requires persistent user identity

The chat route already checks `isAuthenticated` — MCP tool loading should be gated on this flag.

### G. Stdio Transport (Future Work)

Stdio-based MCP servers require persistent child processes, which are incompatible with Vercel serverless. Future options for stdio support:

1. **Local proxy**: A desktop app or CLI that runs stdio MCP servers locally and exposes them via HTTP for Not A Wrapper to connect to.
2. **MCP bridge service**: A separate long-running service (e.g., on Fly.io or Railway) that maintains stdio connections and exposes them via Streamable HTTP.
3. **Vercel Fluid Compute**: Vercel's evolving compute model may eventually support long-running processes. Monitor for updates.

For now, the `lib/mcp/load-mcp-from-local.ts` file should be preserved but clearly documented as dev-only and not used in the chat route.

---

*Plan produced February 7, 2026. Based on: AI SDK v6 documentation, @ai-sdk/mcp v1.0.18 API, Vercel MCP deployment guidance (June 2025), and the Not A Wrapper codebase at current commit on the `americas-top-model` branch.*
