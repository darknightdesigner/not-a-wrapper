# MCP Integration Plan — Execution Guide

> **Status**: Ready for Implementation
> **Decision**: Option A — Per-Request MCP Client (Stateless Serverless)
> **Priority**: P0 — Critical
> **Timeline**: 2–3 weeks (6 phases)
> **Date**: February 7, 2026 | Revised: February 7, 2026

---

## How to Use This Plan

This plan is structured for AI agent step-by-step execution. Each phase is self-contained with:

- **Context to load** — files to read before starting the phase
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete
- **Decision gates** — questions that must be answered before proceeding

Phases can be resumed independently. An agent starting at Phase 3 only needs to read Phase 3's context files, not the entire plan.

**Permission note**: Phase 2 modifies `convex/schema.ts`, which requires explicit user approval per `AGENTS.md`.

---

## Decision Summary

**Implementing Option A: Per-Request MCP Client.** On every chat request, the API route creates MCP clients for the user's configured servers, loads tools, passes them to `streamText()`, and closes clients after streaming.

**Why Option A**: Fastest path to value (2–3 weeks vs 3–4), lowest risk, follows existing per-request patterns (like BYOK key resolution), and all schema/UI work is reusable for future Options B/C. See [Architecture Reference](#architecture-reference) at the end for full option comparison.

**Evolution path**: v1 (this plan) → v1.0.1 (in-memory warm cache) → v1.1 (persistent Convex cache + granular pre-approval) → v2 (client-side tool awareness, @-mention UX).

---

## Constants Reference

All MCP constants to add to `lib/config.ts`. Referenced by multiple phases.

```typescript
// MCP Integration Constants
export const MAX_MCP_SERVERS_PER_USER = 10
export const MAX_TOOL_RESULT_SIZE = 100 * 1024    // 100KB
export const MCP_CONNECTION_TIMEOUT_MS = 5000
export const MCP_CIRCUIT_BREAKER_THRESHOLD = 3
export const MCP_MAX_STEP_COUNT = 20
export const MCP_MAX_TOOLS_PER_REQUEST = 50
```

---

## Schema Reference

Three new Convex tables. This is the canonical schema — copy directly into `convex/schema.ts`.

```typescript
mcpServers: defineTable({
  userId: v.id("users"),
  name: v.string(),
  url: v.string(),
  transport: v.union(v.literal("http"), v.literal("sse")),
  enabled: v.boolean(),
  authType: v.optional(v.union(
    v.literal("none"),
    v.literal("bearer"),
    v.literal("header")
  )),
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

mcpToolCallLog: defineTable({
  userId: v.id("users"),
  chatId: v.optional(v.id("chats")),
  serverId: v.id("mcpServers"),
  toolName: v.string(),
  toolCallId: v.string(),
  inputPreview: v.optional(v.string()),
  outputPreview: v.optional(v.string()),
  success: v.boolean(),
  durationMs: v.optional(v.number()),
  error: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_chat", ["chatId"])
  .index("by_server", ["serverId"]),
```

---

## File Map

Every file to create or modify, organized by phase. Use as a progress tracker.

| Phase | File | Action |
|-------|------|--------|
| 0 | `package.json` | Modify — pin `@ai-sdk/mcp` version |
| 1 | `lib/config.ts` | Modify — add MCP constants |
| 1 | `.env.example` | Modify — add `ENABLE_MCP` |
| 2 | `convex/schema.ts` | Modify — add 3 tables (**Ask First**) |
| 2 | `convex/mcpServers.ts` | Create — CRUD + URL validation |
| 2 | `convex/mcpToolApprovals.ts` | Create — approval mutations/queries |
| 2 | `convex/mcpToolCallLog.ts` | Create — audit log mutations |
| 3 | `lib/models/types.ts` | Modify — add `supportsTools` field |
| 3 | `lib/mcp/load-mcp-from-url.ts` | Modify — add `type: 'http'` support |
| 3 | `lib/mcp/load-tools.ts` | Create — multi-server tool orchestrator |
| 4 | `app/api/chat/route.ts` | Modify — wire MCP tools into `streamText()` |
| 5 | Settings UI files (see Phase 5) | Create/Modify — connections management |
| 6 | `lib/mcp/__tests__/*.test.ts` | Create — unit tests |

---

## Phase 0: Transport Spike

> **Goal**: Verify `type: 'http'` transport works before committing to it.
> **Dependencies**: None.
> **Can run in parallel with**: Phase 1.

### Context to Load

- `lib/mcp/load-mcp-from-url.ts` — existing SSE implementation
- `lib/mcp/load-mcp-from-local.ts` — stdio implementation (reference only)
- `package.json` — check `@ai-sdk/mcp` version

### Steps

1. Pin `@ai-sdk/mcp` version in `package.json` — remove the `^` caret from `^1.0.18` to prevent surprise breakage
2. Write a minimal test script that creates an MCP client with HTTP transport:
   ```typescript
   import { createMCPClient } from "@ai-sdk/mcp"
   const client = await createMCPClient({
     transport: { type: 'http', url: '<public-mcp-server-url>' }
   })
   const tools = await client.tools()
   console.log('Tools discovered:', Object.keys(tools))
   await client.close()
   ```
3. If `type: 'http'` works → use as primary transport for all subsequent phases
4. If `type: 'http'` fails → confirm `type: 'sse'` works, use as v1 transport, update all references in this plan

### Verify

- Script runs without errors
- `tools()` returns a valid `ToolSet` object with at least one tool

### Decision Gate

**Transport decision**: `'http'` or `'sse'`? This affects the default transport value in Phase 2 schema and Phase 3 client creation.

---

## Phase 1: Configuration and Feature Flag

> **Goal**: Add constants and feature flag infrastructure.
> **Dependencies**: None.
> **Can run in parallel with**: Phase 0.

### Context to Load

- `lib/config.ts` — find the right section for new constants
- `.env.example` — see existing env var documentation style

### Steps

1. Read `lib/config.ts` and add all MCP constants after the existing rate limit section. Use the exact values from [Constants Reference](#constants-reference) above.
2. Read `.env.example` and add at the end:
   ```
   # MCP Tool Integration
   # Set to 'true' to enable MCP tool loading in the chat route.
   # Can be toggled via Vercel env vars without a deploy (instant kill-switch).
   ENABLE_MCP=
   ```
3. Add `ENABLE_MCP=true` to your local `.env` for development.

### Verify

```bash
bun run typecheck  # No new errors
```

---

## Phase 2: Database Layer

> **Goal**: Create Convex tables and CRUD operations for MCP servers, approvals, and audit logs.
> **Dependencies**: Phase 1 (constants referenced in mutations).
> **Permission**: Modifying `convex/schema.ts` requires explicit user approval per `AGENTS.md`.

### Context to Load

- `convex/schema.ts` — existing table structure, understand the pattern
- `convex/userKeys.ts` — **pattern reference** for auth checking and encrypted field handling
- `lib/encryption.ts` — encryption/decryption functions for auth tokens
- `lib/config.ts` — `MAX_MCP_SERVERS_PER_USER` constant

### Step 2.1: Add Schema Tables

1. Read `convex/schema.ts` to understand the existing table definitions
2. Add the three tables from [Schema Reference](#schema-reference) above
3. Note: `convex deploy` (used in the build script) auto-applies schema changes — adding tables is non-destructive

**Verify**: `bun run typecheck`

### Step 2.2: Server CRUD — `convex/mcpServers.ts`

1. Read `convex/userKeys.ts` — follow its auth pattern: `ctx.auth.getUserIdentity()` → resolve Convex user ID via `users.by_clerk_id` → verify ownership
2. Create `convex/mcpServers.ts` with these functions:

| Function | Type | Description |
|----------|------|-------------|
| `list` | query | Returns all MCP servers for the authenticated user |
| `get` | query | Single server by ID, verify ownership |
| `create` | mutation | URL validation + `MAX_MCP_SERVERS_PER_USER` enforcement + encrypt auth |
| `update` | mutation | URL re-validation, ownership check, re-encrypt auth if changed |
| `remove` | mutation | Delete server + cascade delete associated approvals |
| `toggleEnabled` | mutation | Quick enable/disable toggle |

3. **SSRF validation in `create` and `update`** — reject these URL patterns:
   - Private IP ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `169.254.x.x`, `127.x.x.x`
   - Hostnames: `localhost`, `0.0.0.0`
   - Non-HTTPS URLs in production (allow HTTP in development)
4. **Server limit enforcement in `create`** — count existing servers for user, reject if `>= MAX_MCP_SERVERS_PER_USER`
5. **Auth encryption** — encrypt `authValue` using the same AES-256-GCM pattern as `lib/encryption.ts`, store in `encryptedAuthValue` + `authIv` fields

**Verify**: `bun run typecheck`

### Step 2.3: Tool Approvals — `convex/mcpToolApprovals.ts`

1. Create with these functions:

| Function | Type | Description |
|----------|------|-------------|
| `listByServer` | query | All approvals for a specific server |
| `listByUser` | query | All approvals across all servers for a user |
| `upsertApproval` | mutation | Check `by_user_server_tool` index before insert to avoid duplicates |
| `bulkApprove` | mutation | Auto-approve all tools for a server (called on server add) |
| `toggleApproval` | mutation | Flip individual tool approved status |
| `removeByServer` | internal mutation | Cleanup when server is deleted (called from `mcpServers.remove`) |

2. **v1 trust model**: When a user adds an MCP server, ALL discovered tools are auto-approved. The trust boundary is server-level — the user chose to add the URL. Users can individually disable tools after discovery. This is a conscious security tradeoff for v1 usability.

**Verify**: `bun run typecheck`

### Step 2.4: Audit Log — `convex/mcpToolCallLog.ts`

1. Create with these functions:

| Function | Type | Description |
|----------|------|-------------|
| `log` | mutation | Write a tool call entry. Truncate `inputPreview` and `outputPreview` to 500 chars. |
| `listByChat` | query | Audit trail for a conversation |
| `listByUser` | query | User's tool call history (paginated) |

2. Intentionally store only truncated previews — avoid persisting sensitive data (PII, tokens) that MCP tools may process.

**Verify**: `bun run typecheck` — all Convex functions compile and have auth checks.

---

## Phase 3: Core MCP Logic

> **Goal**: Build the tool loading orchestration layer that connects MCP servers and prepares tools for `streamText()`.
> **Dependencies**: Phase 0 (transport decision), Phase 2 (Convex queries for server configs).

### Context to Load

- `lib/mcp/load-mcp-from-url.ts` — existing SSE client, will be updated
- `lib/user-keys.ts` — pattern reference for per-request key resolution
- `lib/models/types.ts` — model type definitions
- `lib/config.ts` — MCP constants from Phase 1
- `convex/mcpServers.ts` — server query functions from Phase 2

### Step 3.1: Add Model Capability Field

1. Read `lib/models/types.ts`
2. Add `supportsTools?: boolean` to the `ModelConfig` interface (or equivalent type). Default is `true` — only explicitly set to `false` for models known not to support tools.
3. Read through model definition files in `lib/models/data/` and set `supportsTools: false` for any models that don't support tool use (some smaller/free-tier models, reasoning-only models).

**Verify**: `bun run typecheck`

### Step 3.2: Update Transport Support

1. Read `lib/mcp/load-mcp-from-url.ts`
2. Update to support both `type: 'http'` (preferred, per Phase 0 results) and `type: 'sse'` (fallback)
3. Add auth header support:
   ```typescript
   headers: serverConfig.authType === 'bearer'
     ? { Authorization: `Bearer ${decryptedAuthValue}` }
     : serverConfig.authType === 'header'
       ? { [serverConfig.headerName!]: decryptedAuthValue! }
       : undefined,
   ```

**Verify**: `bun run typecheck`

### Step 3.3: Tool Loading Orchestrator — `lib/mcp/load-tools.ts`

This is the most complex new file. It orchestrates multi-server tool loading for a single chat request.

**Input**: Convex auth token (NOT a raw userId string)

**Output**: `{ tools: ToolSet, clients: MCPClient[], toolServerMap: Map<string, ServerInfo> }`

**Implementation requirements**:

1. **Resolve user identity internally** — use `fetchQuery` with the Convex token to resolve the Convex user ID. Follow the same pattern as `convex/userKeys.ts` which uses `ctx.auth.getUserIdentity()` → `users.by_clerk_id`. The chat route passes a Clerk ID string (`"user_2abc..."`), NOT a Convex `v.id("users")`.

2. **Load server configs** — `fetchQuery` to read enabled servers from `mcpServers` table. This adds ~50-100ms of Convex round-trip latency before MCP connections begin.

3. **Create clients in parallel** — use `Promise.allSettled()` with per-server timeout:
   ```typescript
   const results = await Promise.allSettled(
     enabledServers.map(server =>
       Promise.race([
         createMCPClient({ transport: { type: 'http', url: server.url, headers } }),
         new Promise((_, reject) =>
           setTimeout(() => reject(new Error('MCP connection timeout')), MCP_CONNECTION_TIMEOUT_MS)
         ),
       ])
     )
   )
   ```
   Total loading time = `max(individual server times)`, not sum. A slow server doesn't block fast servers.

4. **Collect tools from successful clients** — skip failed servers, log errors to `mcpServers.lastError`.

5. **Namespace tool names** — prefix with server slug to prevent collisions: `${serverSlug}_${toolName}`. The slug must be immutable once set (changing it orphans historical tool names in message history).

6. **Filter by approved tools** — query `mcpToolApprovals`, only include tools where `approved === true`.

7. **Enforce `MCP_MAX_TOOLS_PER_REQUEST`** — if combined tools exceed limit, prioritize recently-used or prompt user to select.

8. **Truncate tool results** — cap at `MAX_TOOL_RESULT_SIZE` (100KB) before passing to model and audit log.

9. **Circuit-breaker** — skip servers with `MCP_CIRCUIT_BREAKER_THRESHOLD` (3) consecutive failures. Reset on success.

10. **Return `toolServerMap`** — maps namespaced tool names to `{ displayName, serverName, serverId }`. Needed for:
    - Audit logging (which server handled the call)
    - UI display name mapping (`tool-invocation.tsx` should strip namespace prefix)
    - Message history compatibility

**Verify**: `bun run typecheck`, write unit tests for URL validation and tool merging (Phase 6)

---

## Phase 4: Chat Route Integration

> **Goal**: Wire MCP tools into the streaming chat pipeline.
> **Dependencies**: Phase 3 (load-tools.ts must exist).
> **This is the critical integration phase** — read the existing route carefully before modifying.

### Context to Load

- `app/api/chat/route.ts` — **read the entire file thoroughly** before making changes. This is the gold standard API route.
- `app/api/chat/api.ts` — business logic, rate limiting
- `lib/mcp/load-tools.ts` — the tool loader from Phase 3

### Step 4.1: Add Import and MCP Variables

1. Add import at the top:
   ```typescript
   import { loadUserMcpTools } from "@/lib/mcp/load-tools"
   ```
2. After existing auth and rate limit checks, add MCP variables:
   ```typescript
   let mcpTools: ToolSet = {} as ToolSet
   let mcpClients: MCPClient[] = []
   ```

### Step 4.2: Add Gated Tool Loading

After the auth/rate-limit section, before `streamText()`:

```typescript
// Gate on: auth + feature flag + model capability
const mcpEnabled = isAuthenticated
  && convexToken
  && process.env.ENABLE_MCP === 'true'
  && modelConfig.supportsTools !== false

if (mcpEnabled) {
  const result = await loadUserMcpTools(convexToken, {
    timeout: MCP_CONNECTION_TIMEOUT_MS,
  })
  mcpTools = result.tools
  mcpClients = result.clients
}
```

**Key notes**:
- `isAuthenticated` — existing check in the route. MCP is auth-only, never for anonymous users.
- `convexToken` — needed for `loadUserMcpTools` to query Convex.
- `modelConfig.supportsTools` — from Phase 3. Prevents confusing errors for non-tool-capable models.

### Step 4.3: Adjust Step Limit

```typescript
const hasMcpTools = Object.keys(mcpTools).length > 0
const maxSteps = hasMcpTools ? MCP_MAX_STEP_COUNT : 10
```

Complex MCP tool chains can easily exceed the default 10 steps (e.g., research → process → follow-up). 20 steps with `maxDuration=60` is a reasonable balance.

**Timeout risk**: With 20 steps, worst-case is 20 tool calls × 2-3s each = 40-60s of execution, plus LLM inference. The circuit-breaker and tool output truncation mitigate this. Monitor p95 function duration after launch.

### Step 4.4: Update `streamText()` Call

- Replace `tools: {} as ToolSet` with `tools: mcpTools`
- Update `stopWhen: stepCountIs(maxSteps)`

```typescript
const result = streamText({
  model: aiModel,
  system: effectiveSystemPrompt,
  messages: modelMessages,
  tools: mcpTools,              // Was: {} as ToolSet
  stopWhen: stepCountIs(maxSteps),
  // onFinish is for LOGGING ONLY — does NOT fire on client disconnect
  onFinish: ({ text, usage }) => {
    // ... existing PostHog tracking ...
    // Add: log tool calls to mcpToolCallLog (truncated previews)
  },
})
```

### Step 4.5: Add Client Cleanup via `after()`

```typescript
// PRIMARY CLEANUP — after() always runs after response completes or aborts,
// including client disconnects. The route already uses after() for PostHog flushing.
after(async () => {
  await Promise.allSettled(mcpClients.map(c => c.close()))
})
```

**Why `after()` and not `onFinish`?** `onFinish` does NOT fire if the client disconnects mid-stream (user closes tab, network drop). `after()` from `next/server` always runs — it is the only reliable cleanup path. Use `onFinish` exclusively for audit logging.

### Step 4.6: Add Error Cleanup Path

If an error occurs before `streamText()` is called (e.g., during tool loading), `after()` may not have been registered yet. Add explicit cleanup in the catch block:

```typescript
} catch (error) {
  await Promise.allSettled(mcpClients.map(c => c.close()))
  throw error
}
```

### Verify

```bash
bun run typecheck
bun run lint
```

Then manual test:
1. With `ENABLE_MCP=false` — verify no behavior change (tools still empty)
2. With `ENABLE_MCP=true` but no MCP servers configured — verify no errors, tools still empty

---

## Phase 5: Settings UI

> **Goal**: Replace the ConnectionsPlaceholder with MCP server management UI.
> **Dependencies**: Phase 2 (Convex CRUD for data layer).

### Context to Load

- `app/components/layout/settings/connections/connections-placeholder.tsx` — being replaced
- `app/components/layout/settings/connections/ollama-section.tsx` — pattern reference
- `app/components/layout/settings/connections/developer-tools.tsx` — pattern reference
- `app/components/layout/settings/settings-content.tsx` — **critical**: has BOTH mobile and desktop layouts, both must be updated. Currently gates connections on `!isDev`.

### Step 5.1: MCP Server List — `mcp-servers.tsx`

Create `app/components/layout/settings/connections/mcp-servers.tsx`:

- List of configured MCP servers with: name, URL (masked), enabled status toggle
- Per-server actions: edit, delete, connection status badge (`lastError`, `lastConnectedAt`)
- "Add Server" button
- Empty state when no servers configured
- Use Convex `useQuery(api.mcpServers.list)` for reactive data

### Step 5.2: Server Form — `mcp-server-form.tsx`

Create `app/components/layout/settings/connections/mcp-server-form.tsx`:

- Fields: name, URL, transport type (http/sse), auth type (none/bearer/custom header)
- URL validation feedback (SSRF rules from Phase 2)
- **Test Connection button** — connects to the server, calls `tools()`, displays discovered tool count or error. Essential for debugging configuration before sending a chat message.
- Supports both create and edit modes

### Step 5.3: Tool Approvals — `mcp-tool-approvals.tsx`

Create `app/components/layout/settings/connections/mcp-tool-approvals.tsx`:

- Per-server expandable tool list
- Each tool: name, description, approved toggle
- "Auto-approved" badge for newly discovered tools
- Bulk approve/reject actions

### Step 5.4: Wire into Settings Layout

1. Read `settings-content.tsx` — locate BOTH the mobile and desktop rendering paths for the Connections tab
2. Replace `ConnectionsPlaceholder` with the new MCP server management component
3. **Visibility rules**:
   - MCP UI: visible to ALL users (not gated on `isDev`), but only when MCP is enabled
   - `OllamaSection` and `DeveloperTools`: remain dev-only, alongside the MCP section
4. **Feature flag gating**: Check `ENABLE_MCP` status via API response (recommended approach: add `mcpEnabled: boolean` to an existing settings/status endpoint). When MCP is disabled, show a message: "MCP integration is currently disabled."

### Verify

- UI renders correctly in both mobile and desktop layouts
- CRUD operations work (add, edit, delete, toggle)
- Test Connection button returns tool count or error

---

## Phase 6: Testing and Validation

> **Goal**: Verify the full integration end-to-end.
> **Dependencies**: All previous phases.

### Context to Load

- `lib/mcp/load-tools.ts` — to write tests against
- `convex/mcpServers.ts` — to verify SSRF validation

### Step 6.1: Unit Tests

| Test File | What It Tests |
|-----------|---------------|
| `lib/mcp/__tests__/url-validation.test.ts` | SSRF protection: reject private IPs, localhost, non-HTTPS |
| `lib/mcp/__tests__/load-tools.test.ts` | Multi-server tool merging, approval filtering, namespace collisions |
| `lib/mcp/__tests__/truncation.test.ts` | Output >100KB is truncated correctly |
| `lib/mcp/__tests__/circuit-breaker.test.ts` | Skip servers after 3 consecutive failures, reset on success |

### Step 6.2: Integration Test Checklist

Run manually against a public MCP server (e.g., Vercel MCP template):

- [ ] Configure server in Settings > Connections
- [ ] Tools appear in approval list (auto-approved)
- [ ] Send a chat message that should trigger a tool call
- [ ] Tool invocation renders in `tool-invocation.tsx` with correct display name (namespace stripped)
- [ ] Audit log entry appears in Convex dashboard
- [ ] Disable the server → send message → graceful degradation (no tools, no error)
- [ ] Set `ENABLE_MCP=false` → verify tools are not loaded
- [ ] Select a model with `supportsTools: false` → verify tools are not loaded
- [ ] Anonymous user → verify MCP tools never loaded

### Step 6.3: Monitoring Setup

Add PostHog events for production observability:

| Event | Properties |
|-------|------------|
| `mcp_tool_load` | `serverCount`, `toolCount`, `loadTimeMs`, `failedServers` |
| `mcp_tool_call` | `toolName`, `serverSlug`, `durationMs`, `success` |

Alert thresholds to configure:
- MCP connection failures: >50% for any server
- Tool loading latency p95: >3s
- Tool execution error rate: >10%
- Serverless function timeouts: any increase post-launch

### Verify

```bash
bun run test
bun run lint
bun run typecheck
bun run build
```

---

## Security Checklist

Apply throughout all phases. Review before marking any phase complete.

- [ ] All Convex mutations verify user ownership via `ctx.auth.getUserIdentity()`
- [ ] MCP server URLs validated against SSRF rules (no private IPs, no localhost, HTTPS-only in prod)
- [ ] Auth tokens encrypted with AES-256-GCM via `lib/encryption.ts` (same `ENCRYPTION_KEY` env var)
- [ ] `MAX_MCP_SERVERS_PER_USER` enforced in create mutation
- [ ] Tool results truncated to `MAX_TOOL_RESULT_SIZE` before model and audit log
- [ ] Audit log stores truncated previews only (500 chars max, no full sensitive data)
- [ ] MCP tools restricted to authenticated users only (never anonymous)
- [ ] Feature flag `ENABLE_MCP` gates all MCP logic
- [ ] `after()` is used for MCP client cleanup (not `onFinish`)
- [ ] `onFinish` used ONLY for logging/audit (does not fire on client disconnect)
- [ ] Never log OAuth tokens, API keys, credentials, session tokens

---

## Critical Implementation Patterns

### Tool Namespacing

Prefix tool names with server slug to prevent collisions across servers:

```typescript
const key = `${serverSlug}_${toolName}`
```

**Side-effects to handle**:

1. **`tool-invocation.tsx` display**: The component uses `getStaticToolName()` which returns the raw namespaced name. Update to strip the prefix for display, show server name as a badge: `create_issue (GitHub)`.
2. **Build a mapping during tool loading**: `{ namespacedName → { displayName, serverName, serverId } }` — passed to UI via stream metadata or separate query.
3. **Message history**: Tool call/result parts in message history contain namespaced names. The namespace must match current tool definitions. The server slug must be **immutable** once set — changing it orphans historical tool names.

### Connection Lifecycle in Serverless

```typescript
// Create clients IN PARALLEL with per-server timeout
const results = await Promise.allSettled(
  enabledServers.map(server =>
    Promise.race([
      createMCPClient({ transport: { type: 'http', url: server.url, headers } }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('MCP connection timeout')), MCP_CONNECTION_TIMEOUT_MS)
      ),
    ])
  )
)

// PRIMARY CLEANUP — after() always runs, even on client disconnect
after(async () => {
  await Promise.allSettled(clients.map(c => c.close()))
})
```

### Error Propagation

| Failure Point | Behavior |
|---------------|----------|
| Tool loading fails (before `streamText`) | Failed servers skipped, proceed with available tools. If ALL fail → `tools: {}` (graceful degradation). Error logged to `mcpServers.lastError`. |
| Tool execution fails (during streaming) | AI SDK propagates `CallToolError` through stream → `tool-invocation.tsx` renders error → model sees error and can retry or explain. Logged to `mcpToolCallLog` with `success: false`. |
| Server unreachable mid-stream | Caught as tool execution failure (above). |
| Tool output exceeds size limit | Truncated to `MAX_TOOL_RESULT_SIZE` transparently before model and audit log. |

### Feature Flag Behavior

| `ENABLE_MCP` | Chat Route | Settings UI |
|--------------|------------|-------------|
| `false` (or unset) | `tools: {} as ToolSet` (current behavior, no change) | Shows `ConnectionsPlaceholder` or "MCP currently disabled" |
| `true` | Loads MCP tools for authenticated users with tool-capable models | Shows MCP server management UI for all users |

**Kill procedure**: Set `ENABLE_MCP=false` in Vercel env vars → instant disable, no deploy needed.

---

## Architecture Reference

This section preserves the full analysis for context. Not needed for execution — refer only when making architectural decisions or if a phase raises questions.

### Current State

| Component | File | Status |
|-----------|------|--------|
| MCP client (stdio) | `lib/mcp/load-mcp-from-local.ts` | Working utility, dev-only, not integrated |
| MCP client (SSE) | `lib/mcp/load-mcp-from-url.ts` | Working utility, not integrated |
| Chat streaming route | `app/api/chat/route.ts` | Production — `tools: {} as ToolSet` (empty) |
| Tool invocation UI | `app/components/chat/tool-invocation.tsx` | Production — renders tool calls with args/results |
| Connections settings tab | `app/components/layout/settings/connections/` | Placeholder UI |
| BYOK encryption | `lib/encryption.ts` | Production — AES-256-GCM |
| Rate limiting | `app/api/chat/api.ts`, `convex/usage.ts` | Production — tiered daily limits |
| User keys (Convex) | `convex/userKeys.ts` | Production — encrypted key storage |
| `@ai-sdk/mcp` package | `package.json` | Installed `^1.0.18` |

### AI SDK MCP API (v6)

```typescript
// HTTP transport (recommended)
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://server.example.com/mcp',
    headers: { Authorization: 'Bearer token' },
  },
})

// SSE transport (legacy, still supported)
const client = await createMCPClient({
  transport: { type: 'sse', url: 'https://server.example.com/sse' },
})

// Get tools compatible with streamText()
const tools = await client.tools()

// Must close after use (critical in serverless)
await client.close()
```

### Constraints Applied to All Options

- **No stdio transport in v1.** Vercel serverless cannot maintain persistent child processes. Only HTTP-based transports are viable.
- **Streamable HTTP preferred over SSE.** Per Vercel guidance (June 2025), reduces CPU usage ~50%.
- **Security is non-negotiable.** Allowlisting, per-tool approval, and audit logging required.
- **Convex is the database.** All persistent state lives in Convex.

### Option A: Per-Request MCP Client (Chosen)

**Architecture**: On every chat request, create MCP clients → load tools → pass to `streamText()` → close via `after()`.

**Pros**: (1) Simplest architecture — no caching, no background jobs. (2) Always-fresh tools. (3) Minimal blast radius — failing server only affects current request. (4) Reliable cleanup via `after()`. (5) Follows existing per-request patterns.

**Cons**: (1) 500ms–2s latency per request for tool loading. (2) Shares `maxDuration=60s` timeout with streaming and tool execution. (3) No connection reuse between requests. (4) No offline awareness — failures discovered on send. (5) Auto-approval in v1 (server-level trust).

### Option B: Cached Tool Registry with Background Sync (v1.1 candidate)

**Architecture**: Tool schemas fetched in background via Convex actions, cached in a `mcpToolCache` table. Chat route reads cached schemas (~50ms) and creates ephemeral clients only for tool execution.

**Pros**: Near-zero chat latency, pre-flight tool discovery, resilient to server downtime.
**Cons**: Cache staleness (15-min window), custom tool executor complexity, double connection cost (sync + execution), Convex action timeout limits.
**Timeline**: 3–4 weeks. **Complexity**: High.

### Option C: Client-Side MCP Resolution with Server Proxy (v2 candidate)

**Architecture**: Browser discovers tools via API endpoints, sends tool definitions with chat requests. Server validates and proxies tool execution.

**Pros**: Zero chat latency for tool loading, rich client-side UX, natural fit for @-mention tool invocation.
**Cons**: Increased attack surface (client-sent tools), CORS blockers for direct connections, two-API design, complex client state, payload bloat.
**Timeline**: 3–4 weeks. **Complexity**: High.

### Comparison Matrix

| Dimension | A: Per-Request | B: Cached | C: Client-Side |
|-----------|---------------|-----------|----------------|
| Tool loading latency | 500ms–2s/req | ~50ms | ~0ms |
| Tool freshness | Always fresh | 15-min window | On page load |
| Architecture complexity | Low | High | High |
| Security complexity | Low | Medium | High |
| Timeline | 2–3 weeks | 3–4 weeks | 3–4 weeks |
| v1 viability | **Best** | Good | Risky |

### Stdio Transport — Future Work

Stdio-based MCP servers require persistent child processes, incompatible with Vercel serverless. Future options: (1) Local proxy desktop app, (2) MCP bridge service on Fly.io/Railway, (3) Vercel Fluid Compute evolution. Preserve `lib/mcp/load-mcp-from-local.ts` as dev-only.

---

*Plan produced February 7, 2026. Optimized for AI agent execution February 7, 2026. Based on: AI SDK v6, @ai-sdk/mcp v1.0.18, Vercel MCP deployment guidance (June 2025), and the Not A Wrapper codebase on the `upgrade-bishhhhhhhhh` branch.*
