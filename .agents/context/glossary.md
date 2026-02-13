# Project Glossary

Domain-specific terminology for the Not A Wrapper codebase. AI assistants should reference this when encountering these terms.

## AI Model Terminology

### Model (Three Meanings)

| Context | Meaning | Example |
|---------|---------|---------|
| **ModelConfig** | Full configuration object with metadata | `{ id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "OpenAI", ... }` |
| **Model ID** | String identifier matching AI SDK | `"gpt-4.1-nano"`, `"claude-3-5-sonnet-latest"` |
| **Model Instance** | `LanguageModelV3` from AI SDK | Return value of `modelConfig.apiSdk()` |

When code says "model", determine which meaning from context:
- Database/API requests → Model ID string
- `allModels.find()` → Returns ModelConfig object
- `streamText({ model: ... })` → Model Instance

### Provider Terminology

| Term | Purpose | Example Values |
|------|---------|----------------|
| **provider** | Display name for UI | `"OpenAI"`, `"Anthropic"`, `"Mistral"` |
| **providerId** | Internal ID for filtering, API key lookups, factory routing | `"openai"`, `"anthropic"`, `"mistral"` |
| **baseProviderId** | AI SDK model prefix (for display/grouping only) | `"openai"`, `"claude"`, `"google"` |

**Important distinctions:**

- `providerId` is used in `lib/openproviders/index.ts` for factory routing (the switch/if cases)
- `baseProviderId` is metadata in `ModelConfig` for UI grouping—it does NOT affect factory routing
- Anthropic models use `providerId: "anthropic"` (factory uses `"anthropic"` case) but `baseProviderId: "claude"` (because models display as "claude-3-5-sonnet", etc.)

```typescript
// Factory routing uses providerId (via getProviderForModel)
if (provider === "anthropic") {  // ← providerId
  return anthropic(modelId)      // ← returns claude-prefixed model
}

// ModelConfig uses both
{
  providerId: "anthropic",       // ← for factory/API key lookup
  baseProviderId: "claude",      // ← for display/grouping only
}
```

### apiSdk

Factory function on `ModelConfig` that returns an AI SDK model instance.

```typescript
// Signature
apiSdk?: (apiKey?: string, opts?: { enableSearch?: boolean }) => LanguageModelV3

// Usage
const modelInstance = modelConfig.apiSdk(userApiKey, { enableSearch: true })
const result = streamText({ model: modelInstance, ... })
```

### openproviders

Unified abstraction layer over multiple AI SDK providers. Located at `lib/openproviders/index.ts`.

```typescript
// Returns LanguageModelV3 for any supported model
openproviders("gpt-4.1-nano", settings, apiKey)
openproviders("claude-3-5-sonnet-latest", settings, apiKey)
```

## Message Terminology

### parts

Array of content parts from the AI SDK. Stored in database and used for rendering rich content.

| Part Type | Purpose |
|-----------|---------|
| `text` | Plain text content |
| `tool-invocation` | Tool calls and results |
| `reasoning` | Model reasoning (o1, o3 models) |
| `source` | Citations and sources |
| `file` | File attachments (`filename`, `mediaType`, `url`) |
| `step-start` | Multi-step reasoning markers |

```typescript
// Database schema
parts: v.optional(v.any())

// Extracting sources
const sources = getSources(message.parts)
```

### message_group_id

String identifier that groups related messages together. Used in multi-model comparison to link responses from different models to the same user message.

```typescript
// All responses to the same user prompt share this ID
{ role: "assistant", model: "gpt-4", message_group_id: "abc123" }
{ role: "assistant", model: "claude-3", message_group_id: "abc123" }
```

### Message Types (AI SDK v6)

AI SDK v6 defines two primary message types for different layers:

| Type | Package | Purpose | Primary Content |
|------|---------|---------|-----------------|
| **`UIMessage`** | `ai`, `@ai-sdk/react` | UI rendering in chat components | `parts` (array of `UIMessagePart`) |
| **`ModelMessage`** | `ai` | API communication with models | `content` (array of `ModelMessagePart`) |

**`UIMessage`** is the type used in components and hooks (`useChat`, message lists). It uses `parts` as the primary content representation for rendering text, tool invocations, reasoning, sources, and files.

**`ModelMessage`** is the type sent to `streamText`/`generateText`. Use `convertToModelMessages()` to transform `UIMessage[]` → `ModelMessage[]` before calling the API.

```typescript
// In route.ts — converting UI messages to model messages
import { UIMessage as MessageAISDK, convertToModelMessages } from "ai"
const modelMessages = await convertToModelMessages(sanitizedMessages)
const result = streamText({ model, messages: modelMessages, ... })
```

**NaW alias**: The codebase imports `UIMessage as MessageAISDK` in `route.ts` for backward compatibility. New code should prefer `UIMessage` directly.

Attachments are represented as `file` parts in the `parts` array (e.g., `{ type: "file", filename, mediaType, url }`).

## History Adaptation

### ProviderHistoryAdapter

Adapter contract for provider-specific history replay normalization. Implementations transform `UIMessage[]` into provider-safe history while preserving as much useful context as possible (reasoning/tool chains) according to target provider invariants.

Primary location: `app/api/chat/adapters/types.ts`

### AdaptationContext

Request-scoped input passed into a `ProviderHistoryAdapter` (`targetModelId`, `hasTools`, optional source hints). It lets adapters make provider- and model-aware transformation decisions without reading global state.

Primary location: `app/api/chat/adapters/types.ts`

### AdaptationResult

Structured output from `adaptHistoryForProvider()`: adapted `UIMessage[]`, detailed transformation stats, and warnings. Used for both conversion input (`convertToModelMessages`) and observability (`history_adapt` logging / analytics).

Primary locations: `app/api/chat/adapters/types.ts`, `app/api/chat/route.ts`

## Access Control

### accessible

Boolean flag on `ModelConfig` indicating if the current user can use this model.

Determined by:
- Model is in `FREE_MODELS_IDS` list
- User has appropriate subscription tier

### BYOK (Bring Your Own Key)

Feature allowing users to provide their own API keys for AI providers. Keys are encrypted at rest using AES-256-GCM.

Related files:
- `lib/encryption.ts` - Encryption/decryption
- `convex/userKeys.ts` - Key storage
- `app/api/user-keys/route.ts` - Key management API

## State Management

### Optimistic Operations

UI updates that happen immediately before server confirmation, with rollback on failure.

```typescript
// Pattern
let previousState = null
setChats((prev) => {
  previousState = prev  // Save for rollback
  return updated        // Apply optimistic update
})

try {
  await serverMutation()
} catch {
  if (previousState) setChats(previousState)  // Rollback
}
```

### Server State vs Optimistic State

- **Server State**: Data from Convex queries (source of truth)
- **Optimistic State**: Temporary local state before server confirms
- **Merged State**: Combination shown in UI

```typescript
const chats = useMemo(
  () => mergeWithOptimistic(serverChats, optimisticOps),
  [serverChats, optimisticOps]
)
```

## Rate Limiting

### Daily Limits

| User Type | Limit | Reset |
|-----------|-------|-------|
| Anonymous | 5 messages/day | Midnight UTC |
| Authenticated | 1000 messages/day | Midnight UTC |
| Pro Models | 500 messages/day | Midnight UTC |

### clientUserId

Identifier for anonymous users in format `"guest_<uuid>"`. Required for tracking anonymous usage.

## Tool Calling & MCP

These are **distinct concepts** that interact in a specific way. The AI SDK documentation separates them into two pages: [Tool Calling](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling) and [Model Context Protocol (MCP)](https://sdk.vercel.ai/docs/ai-sdk-core/mcp-tools). MCP is one *source* of tools — once MCP tools are loaded, they become standard AI SDK tools.

### Tool (AI SDK)

An object that a language model can invoke to perform a specific task. Defined with `description`, `inputSchema`, an optional `execute` function, and optional `strict` mode. Passed to `generateText`/`streamText` as a `ToolSet` (an object with tool names as keys and tools as values).

> **Official definition** (AI SDK docs): "Tools are objects that can be called by the model to perform a specific task."

```typescript
// Defining a tool
import { tool } from "ai"
const myTool = tool({
  description: "Get the weather",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => ({ temperature: 72 }),
})

// Passing tools to streamText
streamText({ model, tools: { myTool }, prompt })
```

### Tool Call

The act of a model choosing to invoke a tool. The model generates a tool call (with a `toolCallId`, `toolName`, and `input`); the SDK validates the input against `inputSchema`, runs `execute()`, and returns the **tool result** to the model.

> **Official definition** (AI SDK docs): "When a model uses a tool, it is called a 'tool call' and the output of the tool is called a 'tool result'."

In NaW, tool calls from all sources are logged to `toolCallLog` in Convex and tracked via PostHog `tool_call` events. The `toolCallId` is the SDK-generated unique identifier for each invocation.

### ToolSet

The AI SDK type for the `tools` parameter of `generateText`/`streamText`. An object with tool names as keys and tool definitions as values. In NaW, the final `ToolSet` passed to `streamText` is a merge of all three tool layers.

```typescript
// NaW's merged ToolSet (simplified from route.ts)
const allTools: ToolSet = {
  ...builtInTools,     // Layer 1
  ...thirdPartyTools,  // Layer 2
  ...mcpTools,         // Layer 3
}
streamText({ model, tools: allTools, ... })
```

### stopWhen

AI SDK v6 loop-control function that replaced the v5 `maxSteps` parameter. Determines when multi-step tool calling should stop. Used with helper functions like `stepCountIs()`.

> **Official definition** (AI SDK docs): "The `stopWhen` conditions are only evaluated when the last step contains tool results."

```typescript
// NaW usage (from route.ts)
import { stepCountIs } from "ai"
const maxSteps = hasAnyTools ? MCP_MAX_STEP_COUNT : DEFAULT_MAX_STEP_COUNT
streamText({ model, tools: allTools, stopWhen: stepCountIs(maxSteps), ... })
```

### needsApproval

AI SDK v6 tool property that requires user approval before execution. When set, `streamText`/`generateText` return `tool-approval-request` parts instead of executing immediately. The host application collects the user's decision and responds with a `tool-approval-response`.

```typescript
// Static approval
tool({ description: "Run a command", needsApproval: true, execute: ... })

// Dynamic approval (based on input)
tool({ needsApproval: async ({ amount }) => amount > 1000, execute: ... })
```

NaW uses a similar approval concept for MCP tools via `mcpToolApprovals` in Convex, though at the tool-level rather than per-invocation.

### dynamicTool

AI SDK v6 helper for tools whose schemas are not known at compile time. Returns a tool with `unknown` input/output types, requiring runtime validation. Useful for MCP tools loaded from external servers without compile-time type information.

```typescript
import { dynamicTool } from "ai"
const customTool = dynamicTool({
  description: "Execute a custom function",
  inputSchema: z.object({}),
  execute: async (input) => { /* input is typed as 'unknown' */ },
})
```

### toUIMessageStreamResponse

Method on the `streamText` result that converts the AI SDK stream into a `Response` suitable for `UIMessage`-based chat UIs. This is the primary streaming response method used in NaW.

```typescript
// NaW usage (from route.ts)
return result.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
  onError: (error) => extractErrorMessage(error),
})
```

The AI SDK also provides a lower-level `createUIMessageStream` + `createUIMessageStreamResponse` pattern for custom stream composition, but NaW uses `toUIMessageStreamResponse` for its standard chat flow.

### MCP (Model Context Protocol)

An **open protocol** (not a tool, not a tool type) that standardizes how LLM applications connect to external data sources and capabilities. Defined by the [MCP specification](https://modelcontextprotocol.io/specification/latest) (version 2025-11-25). Uses JSON-RPC 2.0 for communication.

> **Official definition** (MCP spec): "An open protocol that enables seamless integration between LLM applications and external data sources and tools."

MCP defines three roles:
- **Host**: The LLM application that initiates connections (NaW's Next.js server)
- **Client**: A connector within the host (`@ai-sdk/mcp`'s `createMCPClient`)
- **Server**: An external service that provides capabilities (user-configured endpoints)

MCP communication uses **Streamable HTTP** (recommended) or **SSE** (legacy) transports. NaW defaults to HTTP via `lib/mcp/load-mcp-from-url.ts` (configurable per server).

MCP servers can expose three types of capabilities (server features):
- **Tools**: Functions the AI model can execute (this is the part that becomes AI SDK tools)
- **Resources**: Application-driven data/context (not tool calls — the app decides when to fetch these)
- **Prompts**: Templated messages and workflows

MCP clients may also offer features to servers (client features):
- **Sampling**: Server-initiated agentic behaviors and recursive LLM interactions
- **Roots**: Server-initiated inquiries into URI or filesystem boundaries
- **Elicitation**: Server-initiated requests for additional information from users

> NaW currently uses only the server **Tools** capability. Resources, Prompts, and client features are not yet implemented.

**Only MCP Tools become AI SDK tool calls.** Resources and Prompts are separate MCP capabilities that do not go through the tool calling pipeline.

### MCP Tool

A tool discovered from an MCP server and converted into a standard AI SDK tool via `mcpClient.tools()`. Once converted, it is indistinguishable from any other AI SDK tool — the model sees the same `description` + `inputSchema`, the SDK calls `execute()` the same way.

> **Official definition** (AI SDK docs): The MCP client's `tools` method "acts as an adapter between MCP tools and AI SDK tools."

```typescript
// Loading MCP tools (from lib/mcp/load-tools.ts)
const mcpClient = await createMCPClient({ transport: { type: "http", url } })
const mcpTools: ToolSet = await mcpClient.tools()
// mcpTools is now a standard ToolSet — same type as any other tools
```

In NaW, MCP tools are namespaced as `${serverSlug}_${toolName}` and filtered by user approvals before merging into `allTools`.

### Tool Layers (NaW-specific)

NaW organizes tools into three layers by **source and execution model**. This is a project-specific classification, not an AI SDK or MCP concept.

| Layer | Name | Source | execute() | Wrapping | Example | Code |
|-------|------|--------|-----------|----------|---------|------|
| 1 | **Builtin** (Provider) | AI provider SDK | Provider-executed (`providerExecuted: true`); SDK bypasses user-land `execute()` entirely | None — opaque | `openai.tools.webSearch()` | `lib/tools/provider.ts` |
| 2 | **Third-party** | Custom `tool()` definitions | User-defined `execute()` | Self-contained (inline timing, truncation, envelope) | Exa `web_search` | `lib/tools/third-party.ts` |
| 3 | **MCP** | User-configured MCP servers via `@ai-sdk/mcp` | User-defined `execute()` (adapter from MCP protocol) | `wrapMcpTools()` (timeout, timing, truncation, envelope) | User MCP tools | `lib/mcp/load-tools.ts` |

Layer 1 tools cannot be wrapped or instrumented because the provider handles execution. Layer 2 and 3 tools have user-land `execute()` functions that NaW can wrap for observability and error handling.

### ToolSource (NaW-specific)

Discriminator type used in `toolCallLog` and PostHog events to identify which layer produced a tool call. Defined in `lib/tools/types.ts`.

```typescript
type ToolSource = "builtin" | "third-party" | "mcp"
```

### Key Distinction: "Tool Call" vs "MCP"

| | Tool Call | MCP |
|---|----------|-----|
| **What it is** | A model invoking a function | A protocol for discovering capabilities |
| **Scope** | One invocation of one tool | A connection to an external server |
| **Defined by** | AI SDK (`ai` package) | MCP specification (JSON-RPC 2.0) |
| **In NaW** | Logged to `toolCallLog`, tracked in PostHog | Configured in `mcpServers`, tools loaded via `@ai-sdk/mcp` |
| **Relationship** | All MCP tool invocations are tool calls | MCP is one of three sources of tools |

## File Locations

| Term | Location |
|------|----------|
| Model definitions | `lib/models/data/*.ts` |
| Provider abstraction | `lib/openproviders/` |
| Database schema | `convex/schema.ts` |
| Chat state | `lib/chat-store/` |
| API routes | `app/api/` |
| Chat components | `app/components/chat/` |
| Tool definitions (Layer 1) | `lib/tools/provider.ts` |
| Tool definitions (Layer 2) | `lib/tools/third-party.ts` |
| Tool types & metadata | `lib/tools/types.ts` |
| Tool utilities | `lib/tools/utils.ts` |
| MCP client loading | `lib/mcp/load-tools.ts` |
| MCP server config (DB) | `convex/mcpServers.ts` |
| MCP tool approvals (DB) | `convex/mcpToolApprovals.ts` |
| Tool audit log (DB) | `convex/toolCallLog.ts` |
| MCP settings UI | `app/components/layout/settings/connections/mcp-*.tsx` |
