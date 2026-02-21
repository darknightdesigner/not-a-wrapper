# Tool Calling Infrastructure — Implementation Plan

> **Status**: Ready for Implementation
> **Priority**: P0 — Critical
> **Timeline**: 3–4 weeks (7 phases)
> **Date**: February 11, 2026
> **Research**: `.agents/research/tool-calling-infrastructure.md`
> **Decision**: `.agents/research/tool-calling-infrastructure.md`
> **AI SDK**: v6.0.78 (`ai`), v3.0.26 (`@ai-sdk/openai`), v3.0.41 (`@ai-sdk/anthropic`), v3.0.24 (`@ai-sdk/google`)

---

## How to Use This Plan

This plan is structured for AI agent step-by-step execution. Each phase is self-contained with:

- **Context to load** — files to read before starting the phase
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete
- **Decision gates** — questions that must be answered before proceeding

Phases must be executed in order (1 → 2 → 3 → ...), except where noted as parallelizable. An agent starting at Phase N should read Phase N's context files AND verify prior phases are complete.

**Permission note**: Phase 4 modifies `convex/schema.ts` and renames `convex/mcpToolCallLog.ts`, which require explicit user approval per `AGENTS.md`.

**Parallelization note**: Phases 2 and 4 touch non-overlapping files and can be executed in parallel after Phase 1 is complete.

---

## Decision Summary

**Implementing a 3-layer hybrid tool architecture with centralized coordination and `enableSearch` as the universal search routing control:**

1. **Layer 1 — Built-in Provider Tools** (zero-config, zero new deps): Provider-specific search via `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/xai` — packages already installed. Uses the resolved BYOK API key (same key as the model). **Verified exports**: `openai.tools.webSearch()`, `anthropic.tools.webSearch_20250305()`, `google.tools.googleSearch()`, `xai.tools.webSearch()`.
2. **Layer 2 — Third-Party Tools** (one new dep): Universal search fallback via `exa-js` (Exa core SDK) with custom `tool()` wrapper for providers without native search (Mistral, OpenRouter, Perplexity). API key model: **Option C (Hybrid)** — platform key as default, user BYOK key takes priority. Uses `exa-js` instead of `@exalabs/ai-sdk` because the latter does not support explicit `apiKey` passthrough needed for BYOK.
3. **Layer 3 — MCP Tools** (existing, unchanged): The existing `loadUserMcpTools()` pipeline continues as-is.

**Coordination**: Route.ts is the single coordinator. `enableSearch` (from client) is the **master switch** — when true, injects Layer 1 or Layer 2 search tools. When false, no search tools. MCP (Layer 3) is always independent. All layers merge into one `ToolSet` for `streamText()`.

```
┌────────────────────────────────────────────────────────────────────┐
│                   app/api/chat/route.ts                            │
│                   streamText({ tools: allTools })                  │
│                                                                    │
│  enableSearch (from client) ─────────────────────────┐             │
│                                                      ▼             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ COORDINATOR: route.ts merges all layers                     │   │
│  │                                                             │   │
│  │  if (enableSearch && tools !== false):                       │   │
│  │  ┌──────────────────────┐                                   │   │
│  │  │ Provider has native  │── YES ──→ Layer 1: Provider Tool  │   │
│  │  │ search tools?        │           (OpenAI / Anthropic /   │   │
│  │  │                      │            Google / xAI)          │   │
│  │  │                      │                                   │   │
│  │  │                      │── NO ───→ Layer 2: Exa Fallback   │   │
│  │  │                      │           (Mistral / OpenRouter / │   │
│  │  │                      │            Perplexity / etc.)     │   │
│  │  └──────────────────────┘                                   │   │
│  │                                                             │   │
│  │  always (if auth + tools !== false):                         │   │
│  │  ┌──────────────────────┐                                   │   │
│  │  │ Layer 3: MCP Tools   │  (existing, independent)          │   │
│  │  └──────────────────────┘                                   │   │
│  │                                                             │   │
│  │  Merge: { ...searchTools, ...mcpTools }                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Verification Tasks

> **Effort**: XS (< half day)
> **Dependencies**: None — run before any code changes
> **Output**: Verified API identifiers used by all subsequent phases

Before writing any code, the implementing agent MUST verify the remaining unconfirmed API identifier below. Tasks V1 (Anthropic), V2 (gateway), and V3 (Firecrawl) are resolved or moved to Phase 7. **Task V4 is now verified — Phase 0 is complete.**

### Task V4: Verify `exa-js` Package and API Shape ✅ VERIFIED

Since Phase 3 uses `exa-js` (Exa core SDK) with a custom `tool()` wrapper, verify the package works and returns the expected response shape.

**Steps:**

1. ✅ Run `npm info exa-js` to confirm the package exists and check its latest version.
2. ✅ Run: `npx tsx -e "import Exa from 'exa-js'; console.log(typeof Exa)"` — should output `function`.
3. ✅ Verify the `searchAndContents` method exists: `npx tsx -e "import Exa from 'exa-js'; const e = new Exa('test-key'); console.log(typeof e.searchAndContents)"` — should output `function`.
4. ⏳ After Phase 3 installation with a real key, verify the response shape includes `results` array with `title`, `url`, `text`, and `publishedDate` fields.

**Verification Results (February 11, 2026):**

| Check | Result |
|-------|--------|
| npm registry | `exa-js@2.3.0` (latest), MIT license, 90 versions published |
| Project dependency | `^1.6.13` in package.json → resolves to `1.10.2` installed |
| `typeof Exa` (default export) | `function` ✅ — constructor works as expected |
| `typeof e.searchAndContents` | `function` ✅ — method exists on instance |
| Full API surface | `search`, `searchAndContents`, `findSimilar`, `findSimilarAndContents`, `getContents`, `answer`, `streamAnswer`, `extractContentsOptions`, `request`, `rawRequest`, `processChunk`, `parseSSEStream` |

**Version note:** The project pins `^1.6.13` (installed `1.10.2`), while the latest is `2.3.0`. Phase 3 Step 3.1 (`bun add exa-js`) will update to the latest. The `searchAndContents` method exists in both versions, so no API shape risk. The v2.x release added `answer`/`streamAnswer` methods and depends on `openai@^5.0.1` and `zod@^3.22.0` (both compatible with the project's existing deps).

**Fallback**: If `exa-js` has issues, use `@exalabs/ai-sdk` for platform-key-only search (reads `EXA_API_KEY` from env). BYOK support would require a custom wrapper around `@exalabs/ai-sdk` that temporarily sets the env var — less clean but functional.

---

## Phase 1: Tool Abstraction Layer (Foundation)

> **Effort**: S (< 1 day)
> **Files created**: 2 (`lib/tools/provider.ts`, `lib/tools/types.ts`)
> **Files modified**: 2 (`app/api/chat/route.ts`, `lib/config.ts`)
> **Dependencies**: None — all packages already installed

### Context to Load

```
@app/api/chat/route.ts          # Current tool integration point (line 292: `tools: mcpTools`)
@lib/config.ts                  # Constants (lines 194-199: MCP constants)
@lib/openproviders/provider-map.ts  # getProviderForModel() function
@lib/openproviders/env.ts       # Environment variable availability pattern
@lib/models/types.ts            # ModelConfig type (tools?: boolean)
```

### Step 1.1: Create `lib/tools/types.ts`

Create the shared types for the tool system.

```typescript
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
```

### Step 1.2: Create `lib/tools/provider.ts`

Create the provider-specific tool resolver. This module returns zero-config tools that use the resolved BYOK API key — the same key used for the model itself.

> **Task V1 RESOLVED**: Anthropic export is `webSearch_20250305`. xAI export is `webSearch`. Both verified via live package inspection on February 11, 2026.

```typescript
// lib/tools/provider.ts

import type { ToolSet } from "ai"
import type { ToolMetadata } from "./types"

/**
 * Provider IDs that have native built-in search tools.
 * These tools use the same API key as the model itself — zero additional config.
 *
 * Verified exports (AI SDK v6.0.78, February 2026):
 *   - openai:    openai.tools.webSearch({})
 *   - anthropic: anthropic.tools.webSearch_20250305({})
 *   - google:    google.tools.googleSearch({})
 *   - xai:       xai.tools.webSearch({})
 */
const PROVIDERS_WITH_SEARCH = ["openai", "anthropic", "google", "xai"] as const
type SearchProvider = (typeof PROVIDERS_WITH_SEARCH)[number]

/**
 * Returns provider-specific built-in tools for the given provider ID.
 *
 * IMPORTANT: Uses the resolved API key (BYOK or platform) to create a
 * fresh provider instance. This ensures tool calls bill to the same key
 * as model calls — critical for the BYOK model.
 *
 * When `apiKey` is undefined, the provider factory falls back to the
 * corresponding environment variable (e.g., `OPENAI_API_KEY`). This is
 * the same behavior as `modelConfig.apiSdk(apiKey, ...)` in route.ts.
 *
 * Provider instances (createOpenAI, createAnthropic, createGoogleGenerativeAI,
 * createXai) are stateless HTTP client factories — they do not hold connections
 * or resources. No after() cleanup is needed; instances are GC'd when the
 * request completes.
 *
 * @param providerId - The provider string from getProviderForModel()
 * @param apiKey - The resolved API key (BYOK or undefined for env fallback)
 * @returns A ToolSet with provider-specific tools, or empty object
 */
export async function getProviderTools(
  providerId: string,
  apiKey?: string
): Promise<{
  tools: ToolSet
  metadata: Map<string, ToolMetadata>
}> {
  const tools: Record<string, unknown> = {}
  const metadata = new Map<string, ToolMetadata>()

  if (!isSearchProvider(providerId)) {
    return { tools: tools as ToolSet, metadata }
  }

  switch (providerId) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai")
      const openaiProvider = createOpenAI(apiKey ? { apiKey } : {})
      tools.web_search = openaiProvider.tools.webSearch({})
      metadata.set("web_search", {
        displayName: "Web Search",
        source: "builtin",
        serviceName: "OpenAI",
        icon: "search",
        estimatedCostPer1k: 30, // ~$25-50/1K depending on searchContextSize
      })
      break
    }
    case "anthropic": {
      // Verified: webSearch_20250305 is the correct export (Task V1, Feb 2026)
      const { createAnthropic } = await import("@ai-sdk/anthropic")
      const anthropicProvider = createAnthropic(apiKey ? { apiKey } : {})
      tools.web_search = anthropicProvider.tools.webSearch_20250305()
      metadata.set("web_search", {
        displayName: "Web Search",
        source: "builtin",
        serviceName: "Anthropic",
        icon: "search",
        estimatedCostPer1k: 10, // Usage-based, varies
      })
      break
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
      const googleProvider = createGoogleGenerativeAI(apiKey ? { apiKey } : {})
      tools.web_search = googleProvider.tools.googleSearch({})
      metadata.set("web_search", {
        displayName: "Web Search",
        source: "builtin",
        serviceName: "Google",
        icon: "search",
        estimatedCostPer1k: 35, // Grounding billing started Jan 5, 2026
      })
      break
    }
    case "xai": {
      // Verified: xAI exports webSearch tool (discovered Feb 2026)
      const { createXai } = await import("@ai-sdk/xai")
      const xaiProvider = createXai(apiKey ? { apiKey } : {})
      tools.web_search = xaiProvider.tools.webSearch({})
      metadata.set("web_search", {
        displayName: "Web Search",
        source: "builtin",
        serviceName: "xAI",
        icon: "search",
        estimatedCostPer1k: 0, // Included in Grok API pricing
      })
      break
    }
  }

  return { tools: tools as ToolSet, metadata }
}

function isSearchProvider(providerId: string): providerId is SearchProvider {
  return (PROVIDERS_WITH_SEARCH as readonly string[]).includes(providerId)
}
```

### Step 1.3: Add Constants to `lib/config.ts`

Add tool-related constants to the existing config file.

**Location**: After the existing MCP constants block (after line 199).

```typescript
// ============================================================================
// Tool Infrastructure
// ============================================================================

/** Max steps when no tools are available (currently hardcoded as 10 in route.ts:213) */
export const DEFAULT_MAX_STEP_COUNT = 10

/**
 * Max steps for anonymous (unauthenticated) users with tools.
 * Capped lower than authenticated users (MCP_MAX_STEP_COUNT = 20) to limit
 * tool call cost exposure. With 5 daily messages × 5 steps, worst case is
 * 25 tool calls/day/user — manageable at $0.005/Exa search.
 */
export const ANONYMOUS_MAX_STEP_COUNT = 5

/**
 * Timeout for individual third-party tool executions (in milliseconds).
 * Provider tools (Layer 1) are server-side and have their own timeouts.
 * Third-party tools (Layer 2) make outbound HTTP requests that could hang.
 * This timeout is enforced via AbortSignal in custom tool() wrappers.
 *
 * Not yet enforced — reserved for Phase 7 when custom tool() wrappers
 * with AbortSignal support are added for third-party tools.
 */
export const TOOL_EXECUTION_TIMEOUT_MS = 15_000
```

### Step 1.4: Integrate into `app/api/chat/route.ts`

This is the critical integration step. The existing MCP pipeline is completely untouched.

**1.4a — Add import** (near line 7, after existing config imports):

```typescript
import {
  SYSTEM_PROMPT_DEFAULT,
  MCP_CONNECTION_TIMEOUT_MS,
  MCP_MAX_STEP_COUNT,
  DEFAULT_MAX_STEP_COUNT,
  ANONYMOUS_MAX_STEP_COUNT,
} from "@/lib/config"
```

**1.4b — Stop passing `enableSearch` to `apiSdk()`** (line 168):

The `enableSearch` flag is no longer passed to the model factory. It is now the server-side routing control for search tool injection (see 1.4c below). All search is provided via visible, auditable tool calls — not opaque provider-level plugins.

Current code:
```typescript
    const aiModel = modelConfig.apiSdk(apiKey, { enableSearch })
```

Replace with:
```typescript
    // enableSearch is no longer passed to the model — it controls tool injection below.
    // All search is now provided via visible, auditable tool calls (Layer 1 or Layer 2).
    const aiModel = modelConfig.apiSdk(apiKey)
```

> **Migration note**: This change removes the opaque `enableSearch` pass-through to `apiSdk()`. Any provider-specific search behavior that was triggered by this flag (e.g., OpenRouter's `enableSearch` plugin) is replaced by tool-based search. Verify that `apiSdk()` gracefully ignores the missing `opts` parameter — the `ModelConfig.apiSdk` signature is `(apiKey?: string, opts?: { enableSearch?: boolean })`, so omitting `opts` is safe.

**1.4c — Add search tool loading block (Layer 1)** (insert AFTER `const aiModel = ...`, BEFORE the MCP block):

```typescript
    // -----------------------------------------------------------------------
    // Search Tool Loading (Layer 1 — Built-in Provider Tools)
    //
    // The `enableSearch` flag from the client is the MASTER SWITCH for search
    // tool injection. When true, route.ts injects search tools:
    //   - If the provider has native search tools → use them (Layer 1)
    //   - If not → use Exa fallback (Layer 2, added in Phase 3)
    //
    // This replaces the previous dual mechanism where `enableSearch` was
    // passed to `modelConfig.apiSdk()` as an opaque provider-level flag.
    // All search is now visible, auditable tool calls.
    //
    // NOT gated on isAuthenticated. Anonymous users (5 daily messages)
    // get search tools when the platform has provider API keys configured.
    // When apiKey is undefined (anonymous), the provider factory falls back
    // to the env var — same behavior as model creation above.
    // -----------------------------------------------------------------------
    let builtInTools: ToolSet = {} as ToolSet
    let builtInToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    const shouldInjectSearch = enableSearch && modelConfig.tools !== false

    if (shouldInjectSearch) {
      const { getProviderTools } = await import("@/lib/tools/provider")
      const providerResult = await getProviderTools(provider, apiKey)
      builtInTools = providerResult.tools
      builtInToolMetadata = providerResult.metadata
    }
```

**1.4d — Merge tools and update step count** (replace lines 212-213):

Current code:
```typescript
    const hasMcpTools = Object.keys(mcpTools).length > 0
    const maxSteps = hasMcpTools ? MCP_MAX_STEP_COUNT : 10
```

Replace with:
```typescript
    // Merge all tool layers: search (Layer 1) + MCP (Layer 3)
    // Layer 2 (third-party) will be added in Phase 3.
    // Spread order: search first, MCP second. MCP tools are namespaced
    // (e.g., "serverslug_toolname") so key collisions are extremely unlikely.
    // If a collision occurs, MCP wins (intentional — user config overrides defaults).
    const allTools = { ...builtInTools, ...mcpTools } as ToolSet

    // Dev-mode collision detection: warn when duplicate keys are found
    if (process.env.NODE_ENV !== "production") {
      const builtInKeys = new Set(Object.keys(builtInTools))
      const mcpKeys = Object.keys(mcpTools)
      for (const key of mcpKeys) {
        if (builtInKeys.has(key)) {
          console.warn(`[tools] Key collision: "${key}" exists in both built-in and MCP tools. MCP wins.`)
        }
      }
    }

    const hasAnyTools = Object.keys(allTools).length > 0

    // Anonymous users get a lower step count to limit tool call cost exposure.
    // Authenticated users get the full MCP_MAX_STEP_COUNT (20).
    const maxSteps = hasAnyTools
      ? (isAuthenticated ? MCP_MAX_STEP_COUNT : ANONYMOUS_MAX_STEP_COUNT)
      : DEFAULT_MAX_STEP_COUNT
```

**1.4e — Update streamText call** (line 292):

Current code:
```typescript
      tools: mcpTools,
```

Replace with:
```typescript
      tools: allTools,
```

**1.4f — Remove `ENABLE_MCP` feature gate** (merged from Phase 6):

This step removes the `ENABLE_MCP` env var requirement. Built-in tools are independent of MCP, and there are no existing users relying on the gate. The existing security layers (auth check for MCP, URL validation, DNS rebinding guard, circuit breaker, per-tool approval) remain in place.

Current code (line 176-180):
```typescript
    if (
      isAuthenticated &&
      convexToken &&
      process.env.ENABLE_MCP === "true" &&
      modelConfig.tools !== false
    ) {
```

Replace with:
```typescript
    if (
      isAuthenticated &&
      convexToken &&
      modelConfig.tools !== false
    ) {
```

Also remove references to `ENABLE_MCP` from:
- `.env.example` (if present)
- Any README or setup docs that mention the flag

### Verify Phase 1

1. **Lint**: `bun run lint` — no new errors
2. **Typecheck**: `bun run typecheck` — no new errors
3. **Smoke test (enableSearch ON)**: `bun run dev`, select an OpenAI model (e.g., gpt-5-mini), toggle search ON, send "What happened in the news today?" — the model should invoke `web_search` and return results with citations.
4. **Multi-provider search**: Repeat with Google, Anthropic, and xAI models with search ON. Verify each provider's native search tool fires.
5. **Search OFF test**: With search toggle OFF, send the same query — the model should NOT invoke search, confirming `enableSearch` controls injection.
6. **Non-search message**: With search ON, send "What is 2+2?" — the model should NOT invoke search, confirming `toolChoice: "auto"` behavior.
7. **No-tools model**: Select a Perplexity model (which has `tools: false` in ModelConfig) — verify no tools are injected even with search ON.
8. **BYOK key test**: If a user BYOK key is configured for OpenAI, verify the tool uses that key (check that the search call appears in the user's OpenAI usage dashboard, not the platform's).
9. **Anonymous user test**: Log out. Select a model with search ON — verify built-in search tools work using the platform API key (env var fallback).
10. **Anonymous step limit**: Verify anonymous users are capped at `ANONYMOUS_MAX_STEP_COUNT` (5) steps, not the full 20.
11. **ENABLE_MCP removed**: Remove `ENABLE_MCP=true` from `.env.local` (or never set it). Verify MCP tools still load for authenticated users with configured MCP servers.
12. **Collision warning**: In dev mode, verify `console.warn` fires if an MCP tool has the same key as a built-in tool (add a test MCP server with a `web_search` tool temporarily).

### Decision Gate

> **Note for implementing agent**: The unchecked items below are **runtime verification tasks**, not blocking planning questions. They should be answered during the Phase 1 smoke test (Verify steps 3–12). Proceed with implementation — check these off as you verify each one during testing.

- [x] ~~Did Task V1 reveal the correct Anthropic web search export?~~ **RESOLVED**: Export is `webSearch_20250305`. Anthropic case is uncommented.
- [x] ~~Does xAI have native search tools?~~ **RESOLVED**: Yes, `xai.tools.webSearch({})`. xAI added to Layer 1.
- [ ] Does `createOpenAI({ apiKey }).tools.webSearch({})` work correctly with a BYOK key? *(Verify: smoke test #8)*
- [ ] Does `createGoogleGenerativeAI({ apiKey }).tools.googleSearch({})` work correctly? *(Verify: smoke test #4)*
- [ ] Does `createXai({ apiKey }).tools.webSearch({})` work correctly? *(Verify: smoke test #4)*
- [ ] Does `createAnthropic({ apiKey }).tools.webSearch_20250305()` work correctly? *(Verify: smoke test #4)*
- [ ] Is `ENABLE_MCP` fully removed? Search codebase for any remaining references. *(Verify: smoke test #11)*
- [ ] Does removing `enableSearch` from `apiSdk()` break any existing behavior? Verify OpenRouter models still work. *(Verify: smoke test #3–6)*

---

## Phase 2: Tool UI Awareness (Built-in Tool Display)

> **Effort**: S (< 1 day)
> **Files modified**: 1 (`app/components/chat/tool-invocation.tsx`)
> **Dependencies**: Phase 1 complete
> **Parallelizable**: Can run in parallel with Phase 4.

### Context to Load

```
@app/components/chat/tool-invocation.tsx  # Current tool rendering (generic cards)
@lib/tools/types.ts                       # ToolMetadata type from Phase 1
```

### Step 2.1: Add Built-in Tool Name Detection

The existing `tool-invocation.tsx` renders raw namespaced MCP tool names (e.g., `my_github_server_create_issue`). Built-in tools use clean names (e.g., `web_search`). Add a helper to detect and format these.

At the top of `tool-invocation.tsx`, add a mapping for known built-in tool display names:

```typescript
/** Maps built-in tool names to human-readable display names and icons */
const BUILTIN_TOOL_DISPLAY: Record<string, { name: string; icon: "search" | "code" | "image" | "extract" }> = {
  web_search: { name: "Web Search", icon: "search" },
  google_search: { name: "Web Search", icon: "search" },
  // Future built-in tools:
  // code_execution: { name: "Code Execution", icon: "code" },
  // image_generation: { name: "Image Generation", icon: "image" },
}
```

### Step 2.2: Use Display Names in Tool Card Header

In the tool card rendering, check if the tool name exists in `BUILTIN_TOOL_DISPLAY` before falling back to the raw name. Use `Search01Icon` for search tools instead of the generic `Wrench01Icon`.

> **Import note**: `tool-invocation.tsx` does NOT currently import `Search01Icon`. Add it to the existing Hugeicons import block:
> ```typescript
> import {
>   ArrowDown01Icon,
>   CheckmarkCircle01Icon,
>   SourceCodeIcon,
>   Link01Icon,
>   NutIcon,
>   Loading01Icon,
>   Search01Icon,  // ← ADD
>   Wrench01Icon,
> } from "@hugeicons-pro/core-stroke-rounded"
> ```

The exact implementation depends on the current rendering structure. The agent should:
1. Read the full `tool-invocation.tsx` file
2. Locate where tool names are displayed (look for `getStaticToolName` or raw `toolName` usage — line 219)
3. Add a helper: `const displayInfo = BUILTIN_TOOL_DISPLAY[toolName] ?? null`
4. If `displayInfo` exists, use `displayInfo.name` as the display name and swap `Wrench01Icon` for `Search01Icon` (line 395)

### Step 2.3: Handle Provider Source Attribution

AI SDK v6 normalizes provider-defined tool results into a unified `sources` array on the response. The `sendSources: true` option in `toUIMessageStreamResponse()` already sends these to the client. The agent should:

1. Check if the chat message renderer already handles `source` parts in the message parts array
2. If not, add rendering for source parts — display as clickable URL chips below the assistant message text
3. Provider tools (OpenAI, Anthropic, Google) embed sources as inline citations in the text; Exa returns structured `toolResults` — the renderer should handle both:
   - **Provider sources**: Rendered as citation markers in the text + a "Sources" footer with URLs
   - **Exa tool results**: Rendered as a collapsible "Web Search" card with title/URL/snippet per result

### Verify Phase 2

1. **Visual check**: In dev mode, send a search query to an OpenAI/Google model with search ON. Verify the tool invocation card shows "Web Search" with a search icon instead of a wrench icon and raw tool name.
2. **Source attribution**: Verify search results show source URLs/citations below the response.
3. **MCP tools unchanged**: If MCP is configured, verify MCP tool cards still render with the existing wrench icon and namespaced names.

---

## Phase 3: Third-Party Tool Framework (Exa)

> **Effort**: M (2-3 days)
> **Files created**: 1 (`lib/tools/third-party.ts`)
> **Files modified**: 2 (`app/api/chat/route.ts`, `package.json`)
> **Dependencies**: Phase 1 complete, one new npm package
> **Permission required**: `bun add exa-js` (new dependency — ask user first per AGENTS.md)

### Context to Load

```
@app/api/chat/route.ts              # Current tool integration (Phase 1 changes)
@lib/tools/provider.ts              # Phase 1 provider tools
@lib/tools/types.ts                 # ToolMetadata type
@lib/openproviders/env.ts           # Environment variable pattern
@convex/schema.ts                   # userKeys table (lines 84-91)
@lib/user-keys.ts                   # getEffectiveApiKey pattern
```

### Decision Gate (Resolved)

**API key model: Option C — Hybrid.** This is resolved based on the BYOK-primary product strategy:

- **Platform key** (`EXA_API_KEY` env var) provides a baseline: all users (including anonymous) get search on non-provider models. The platform controls costs via rate limits.
- **User BYOK key** takes priority when provided (via Phase 5's settings UI). User bears their own cost with higher limits.
- **Key resolution order**: User BYOK key → Platform env var → no tool (graceful skip).

Phase 3 implements the infrastructure with platform key support. Phase 5 adds the user BYOK key resolution.

**Why `exa-js` (core SDK) over `@exalabs/ai-sdk` (convenience package)**: The `@exalabs/ai-sdk` package reads `EXA_API_KEY` exclusively from `process.env` — it does not accept an explicit `apiKey` parameter. This breaks BYOK, where per-user keys must be injected at runtime. The `exa-js` core SDK accepts keys in its constructor (`new Exa(apiKey)`), enabling clean BYOK support via a custom `tool()` wrapper. One code path serves both platform-key and BYOK users.

### Step 3.1: Install Exa Core SDK

```bash
bun add exa-js
```

Verify installation (Task V4): `npx tsx -e "import Exa from 'exa-js'; console.log(typeof Exa)"` should output `function`.

### Step 3.2: Create `lib/tools/third-party.ts`

This module provides tools for providers without native capabilities. It uses the `exa-js` core SDK with a custom `tool()` wrapper that accepts an explicit API key — critical for BYOK support.

The module does NOT know which providers have built-in search — that coordination happens in `route.ts` via the `skipSearch` parameter.

```typescript
// lib/tools/third-party.ts

import { tool } from "ai"
import { z } from "zod"
import type { ToolSet } from "ai"
import type { ToolMetadata } from "./types"

/**
 * Configuration for third-party tool loading.
 * The coordinator (route.ts) determines which capabilities to skip
 * based on what Layer 1 (built-in provider tools) already provides.
 * Route.ts only calls getThirdPartyTools when Layer 1 didn't provide search.
 */
export interface ThirdPartyToolOptions {
  /**
   * Skip loading search tools.
   * Set to true when Layer 1 already provides a search tool for this provider.
   * In practice, route.ts only calls getThirdPartyTools when Layer 1 didn't
   * provide search, so this will typically be false when called.
   * Kept for future extensibility (e.g., skip search but load other tools).
   */
  skipSearch?: boolean

  /**
   * Resolved Exa API key.
   * Key resolution order (handled by caller in route.ts):
   *   1. User BYOK key from Convex userKeys (Phase 5)
   *   2. Platform env var: process.env.EXA_API_KEY
   *   3. undefined (no key → skip Exa tools)
   *
   * The exa-js SDK requires an explicit key in its constructor —
   * it does not read from process.env. This is intentional: it ensures
   * BYOK keys are passed directly without env var manipulation.
   */
  exaKey?: string
}

/**
 * Returns third-party tools based on available API keys and capability flags.
 *
 * Uses the exa-js core SDK with a custom tool() wrapper instead of
 * @exalabs/ai-sdk, because the latter reads API keys from env vars only
 * and does not support explicit key passthrough needed for BYOK.
 *
 * This module is intentionally decoupled from Layer 1 (provider tools).
 * It does not know or check which providers have built-in search.
 * The `skipSearch` flag is set by the coordinator (route.ts).
 *
 * @param options - Configuration for which tools to load and with which keys
 * @returns A ToolSet with third-party tools, or empty object
 */
export async function getThirdPartyTools(options: ThirdPartyToolOptions): Promise<{
  tools: ToolSet
  metadata: Map<string, ToolMetadata>
}> {
  const { skipSearch = false, exaKey } = options
  const tools: Record<string, unknown> = {}
  const metadata = new Map<string, ToolMetadata>()

  // Exa Search — skip if Layer 1 already provides search
  if (!skipSearch && exaKey) {
    try {
      // exa-js is a stateless HTTP client wrapper — no cleanup or after() needed.
      // Each call creates a fresh fetch request. No connection pool or persistent state.
      const Exa = (await import("exa-js")).default
      const exa = new Exa(exaKey)

      tools.web_search = tool({
        description:
          "Search the web for current information using AI-native semantic search. " +
          "Returns relevant web pages with titles, URLs, content snippets, and publication dates.",
        parameters: z.object({
          query: z
            .string()
            .min(1)
            .max(200)
            .describe("The search query — be specific for better results"),
        }),
        execute: async ({ query }) => {
          const { results } = await exa.searchAndContents(query, {
            type: "auto",
            numResults: 5,
            text: { maxCharacters: 2000 },
            livecrawl: "fallback",
          })
          return results.map(
            (r: {
              title?: string
              url: string
              text?: string
              publishedDate?: string
            }) => ({
              title: r.title,
              url: r.url,
              content: r.text?.slice(0, 2000),
              publishedDate: r.publishedDate,
            })
          )
        },
      })
      metadata.set("web_search", {
        displayName: "Web Search",
        source: "third-party",
        serviceName: "Exa",
        icon: "search",
        estimatedCostPer1k: 5, // $5/1K search requests (1-25 results per request)
      })
    } catch (err) {
      console.error("[tools/third-party] Failed to load Exa search:", err)
    }
  }

  return { tools: tools as ToolSet, metadata }
}
```

### Step 3.3: Integrate into `app/api/chat/route.ts`

**3.3a — Add third-party tool loading** (insert AFTER the built-in tool loading block from Phase 1, BEFORE the MCP block):

```typescript
    // -----------------------------------------------------------------------
    // Third-Party Tool Loading (Layer 2)
    // Universal search fallback for providers without native search tools.
    // Only loaded when enableSearch is true AND Layer 1 didn't provide search.
    //
    // The coordination model is simple:
    //   - enableSearch === true: route.ts injects search tools
    //   - Layer 1 provided search (builtInHasSearch): skip Layer 2
    //   - Layer 1 did NOT provide search: load Layer 2 Exa fallback
    //
    // NOT gated on isAuthenticated — anonymous users get search when
    // the platform has an EXA_API_KEY configured (same as Layer 1).
    // -----------------------------------------------------------------------
    let thirdPartyTools: ToolSet = {} as ToolSet
    let thirdPartyToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    if (shouldInjectSearch) {
      const builtInHasSearch = Object.keys(builtInTools).length > 0

      // Only load Layer 2 when Layer 1 didn't provide search.
      // This is the sole coordination point — third-party.ts does not
      // know about providers. It just receives a skipSearch flag.
      if (!builtInHasSearch) {
        const { getThirdPartyTools } = await import("@/lib/tools/third-party")

        // Key resolution: user BYOK key (Phase 5) → platform env var → undefined
        // Phase 3: platform key only. Phase 5 will add user BYOK resolution here.
        const resolvedExaKey = process.env.EXA_API_KEY

        const thirdPartyResult = await getThirdPartyTools({
          skipSearch: false, // We already know we need search (builtInHasSearch is false)
          exaKey: resolvedExaKey,
        })
        thirdPartyTools = thirdPartyResult.tools
        thirdPartyToolMetadata = thirdPartyResult.metadata
      }
    }
```

**3.3b — Update tool merging** (update the merge block from Phase 1):

```typescript
    // Merge all tool layers: search (Layer 1 OR Layer 2) + MCP (Layer 3)
    // Search tools are mutually exclusive: Layer 1 XOR Layer 2 (never both).
    // MCP tools are always independent and additive.
    // Spread order matters for conflict resolution:
    //   1. Built-in/third-party search tools (lowest priority)
    //   2. MCP tools (highest priority — user-configured, namespaced)
    const searchTools = { ...builtInTools, ...thirdPartyTools }
    const allTools = { ...searchTools, ...mcpTools } as ToolSet

    // Dev-mode collision detection: warn when duplicate keys are found
    if (process.env.NODE_ENV !== "production") {
      const searchKeys = new Set(Object.keys(searchTools))
      for (const key of Object.keys(mcpTools)) {
        if (searchKeys.has(key)) {
          console.warn(`[tools] Key collision: "${key}" exists in both search and MCP tools. MCP wins.`)
        }
      }
    }

    const hasAnyTools = Object.keys(allTools).length > 0
    const maxSteps = hasAnyTools
      ? (isAuthenticated ? MCP_MAX_STEP_COUNT : ANONYMOUS_MAX_STEP_COUNT)
      : DEFAULT_MAX_STEP_COUNT
```

### Step 3.4: Update Tool Display Map (Phase 2 additions)

In `app/components/chat/tool-invocation.tsx`, the `BUILTIN_TOOL_DISPLAY` map from Phase 2 already covers `web_search` (the key used by both Layer 1 and Layer 2). No additional entry is needed since Exa's custom wrapper uses the same `web_search` key. The display name "Web Search" is sufficient regardless of whether the tool is backed by OpenAI, Google, or Exa — users care about the capability, not the implementation.

### Verify Phase 3

1. **With EXA_API_KEY**: Set `EXA_API_KEY=...` in `.env.local`. Select a Mistral or OpenRouter model with search ON. Ask "What happened in the news today?" — the model should invoke `web_search` via Exa and return results with titles, URLs, and content.
2. **Without EXA_API_KEY**: Remove the key. Verify Mistral/OpenRouter models get no search tools when search is ON (graceful degradation — no Exa key, no Layer 1 for these providers).
3. **No duplicate tools**: Select an OpenAI model WITH `EXA_API_KEY` set and search ON — verify only ONE `web_search` tool is injected (the OpenAI built-in, not Exa). Layer 1 provides search, so Layer 2 is skipped entirely.
4. **xAI uses native search**: Select an xAI model with search ON — verify the xAI native `web_search` tool fires (Layer 1), NOT Exa (Layer 2). xAI is now a Layer 1 provider.
5. **Anonymous user**: Log out, select a Mistral model with search ON, ask a search query — verify search works via platform `EXA_API_KEY` (Layer 2 fallback for non-Layer-1 providers).
6. **Search OFF**: With `EXA_API_KEY` set, select a Mistral model with search OFF — verify NO search tools are injected. The `enableSearch` master switch controls everything.
7. **Lint + typecheck**: `bun run lint && bun run typecheck`

### Environment Variable Documentation

After Phase 3, update `.env.example` to include:

```bash
# Third-Party Tool API Keys (optional)
# These enable additional tool capabilities for models without native tools.
# Users can also provide their own keys via Settings → Tool Keys (overrides these).
# EXA_API_KEY=...              # Web search for xAI/Mistral/OpenRouter models
# FIRECRAWL_API_KEY=...        # Web scraping/extraction (future)
```

---

## Phase 4: Audit Schema Generalization

> **Effort**: S-M (1-2 days)
> **Files created**: 1 (`convex/toolCallLog.ts`)
> **Files modified**: 2 (`convex/schema.ts`, `app/api/chat/route.ts`)
> **Files deleted**: 1 (`convex/mcpToolCallLog.ts` — renamed)
> **Dependencies**: Phase 1 complete
> **Permission required**: Modifies `convex/schema.ts` and renames a Convex function file — ask user first per AGENTS.md
> **Parallelizable**: Can run in parallel with Phase 2.

### Context to Load

```
@convex/schema.ts                # mcpToolCallLog table (lines 158-173)
@convex/mcpToolCallLog.ts        # log mutation and queries
@app/api/chat/route.ts           # onFinish callback tool logging (lines 389-430)
@lib/tools/types.ts              # ToolSource type
```

### Step 4.1: Rename and Update Convex Schema

In `convex/schema.ts`, rename the `mcpToolCallLog` table to `toolCallLog` and update the schema to support all tool sources.

Replace lines 158-173:

```typescript
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
  })
    .index("by_user", ["userId"])
    .index("by_chat", ["chatId"])
    .index("by_server", ["serverId"])
    .index("by_source", ["source"]),
```

### Step 4.2: Create `convex/toolCallLog.ts` (Rename from `mcpToolCallLog.ts`)

Create the new file with updated mutation and queries. Delete the old `convex/mcpToolCallLog.ts`.

```typescript
// convex/toolCallLog.ts
// Renamed from convex/mcpToolCallLog.ts — now logs all tool sources (builtin, third-party, mcp).

import { v } from "convex/values"
import { paginationOptsValidator } from "convex/server"
import { mutation, query } from "./_generated/server"

// =============================================================================
// Helpers
// =============================================================================

const MAX_PREVIEW_LENGTH = 500

/**
 * Truncate a string to MAX_PREVIEW_LENGTH chars.
 * Intentionally stores only truncated previews — avoids persisting sensitive
 * data (PII, tokens) that tools may process.
 */
function truncatePreview(text: string | undefined): string | undefined {
  if (!text) return undefined
  if (text.length <= MAX_PREVIEW_LENGTH) return text
  return text.slice(0, MAX_PREVIEW_LENGTH) + "…"
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Log a tool call for audit purposes.
 *
 * Called from the chat route's onFinish callback.
 * Supports all tool sources: builtin, third-party, and MCP.
 * serverId is optional — only provided for MCP tool calls.
 * userId is set from auth context — never from client input.
 */
export const log = mutation({
  args: {
    chatId: v.optional(v.id("chats")),
    serverId: v.optional(v.id("mcpServers")), // Only for MCP tools
    toolName: v.string(),
    toolCallId: v.string(),
    inputPreview: v.optional(v.string()),
    outputPreview: v.optional(v.string()),
    success: v.boolean(),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
    // REQUIRED — clean break, no backward compat needed
    source: v.union(
      v.literal("builtin"),
      v.literal("third-party"),
      v.literal("mcp")
    ),
    serviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) throw new Error("User not found")

    // Verify chat ownership if chatId is provided
    if (args.chatId) {
      const chat = await ctx.db.get(args.chatId)
      if (!chat || chat.userId !== user._id) {
        throw new Error("Chat not found")
      }
    }

    return await ctx.db.insert("toolCallLog", {
      userId: user._id,
      chatId: args.chatId,
      serverId: args.serverId,
      toolName: args.toolName,
      toolCallId: args.toolCallId,
      inputPreview: truncatePreview(args.inputPreview),
      outputPreview: truncatePreview(args.outputPreview),
      success: args.success,
      durationMs: args.durationMs,
      error: args.error ? truncatePreview(args.error) : undefined,
      source: args.source,
      serviceName: args.serviceName,
      createdAt: Date.now(),
    })
  },
})

// =============================================================================
// Queries
// =============================================================================

/**
 * Get the audit trail for a specific conversation.
 * Returns all tool call log entries for the given chat, ordered by creation time.
 */
export const listByChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) return []

    // Verify chat ownership
    const chat = await ctx.db.get(chatId)
    if (!chat || chat.userId !== user._id) return []

    return await ctx.db
      .query("toolCallLog")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .order("desc")
      .collect()
  },
})

/**
 * Get the user's tool call history (paginated).
 * Returns most recent entries first.
 */
export const listByUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return { page: [], isDone: true, continueCursor: "" }
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) {
      return { page: [], isDone: true, continueCursor: "" }
    }

    return await ctx.db
      .query("toolCallLog")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts)
  },
})
```

### Step 4.3: Update `route.ts` Imports and Audit Logging

**4.3a — Update import** (change `api.mcpToolCallLog.log` to `api.toolCallLog.log`):

Find all references to `api.mcpToolCallLog` in `route.ts` and replace with `api.toolCallLog`.

**4.3b — Add logging for built-in + third-party tool calls:**

In the `onFinish` callback, add a new block AFTER the existing MCP audit logging block:

```typescript
        // Audit log: persist built-in + third-party tool calls (fire-and-forget).
        // Identifies non-MCP tools by checking if the tool name is NOT in mcpToolServerMap.
        if (convexToken && steps) {
          // Combine built-in and third-party metadata maps
          const nonMcpMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata])

          if (nonMcpMetadata.size > 0) {
            for (const step of steps) {
              if (step.toolCalls) {
                for (const toolCall of step.toolCalls) {
                  // Skip MCP tools (already logged above)
                  if (mcpToolServerMap.get(toolCall.toolName)) continue

                  const meta = nonMcpMetadata.get(toolCall.toolName)
                  if (!meta) continue // Unknown tool — skip

                  const toolResult = step.toolResults?.find(
                    (r: { toolCallId: string }) =>
                      r.toolCallId === toolCall.toolCallId
                  )
                  const success = toolResult
                    ? !(toolResult as { isError?: boolean }).isError
                    : false

                  void fetchMutation(
                    api.toolCallLog.log,
                    {
                      chatId: chatId as Id<"chats">,
                      // No serverId for non-MCP tools
                      toolName: meta.displayName,
                      toolCallId: toolCall.toolCallId,
                      inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
                      outputPreview: toolResult
                        ? JSON.stringify(toolResult.output).slice(0, 500)
                        : undefined,
                      success,
                      source: meta.source,
                      serviceName: meta.serviceName,
                    },
                    { token: convexToken }
                  ).catch(() => {
                    // Intentionally swallowed — audit logging is best-effort
                  })
                }
              }
            }
          }
        }
```

### Step 4.4: Add Unified `tool_call` PostHog Event

Replace the MCP-only `mcp_tool_call` PostHog event with a unified `tool_call` event that covers all tool sources. In the `onFinish` callback, replace the existing MCP PostHog capture block (lines 349-381) with:

```typescript
            // PostHog: unified tool call events — one event per tool invocation (all sources)
            // Replaces the previous MCP-only mcp_tool_call event.
            if (steps) {
              // Combine all metadata maps for source identification
              const allToolMetadata = new Map([...builtInToolMetadata, ...thirdPartyToolMetadata])

              for (const step of steps) {
                if (step.toolCalls) {
                  for (const toolCall of step.toolCalls) {
                    const mcpServerInfo = mcpToolServerMap.get(toolCall.toolName)
                    const nonMcpMeta = allToolMetadata.get(toolCall.toolName)

                    // Determine source and service name
                    const source = mcpServerInfo ? "mcp" : (nonMcpMeta?.source ?? "unknown")
                    const serviceName = mcpServerInfo
                      ? mcpServerInfo.serverName
                      : (nonMcpMeta?.serviceName ?? "unknown")
                    const displayName = mcpServerInfo
                      ? mcpServerInfo.displayName
                      : (nonMcpMeta?.displayName ?? toolCall.toolName)

                    const toolResult = step.toolResults?.find(
                      (r: { toolCallId: string }) => r.toolCallId === toolCall.toolCallId
                    )
                    const success = toolResult
                      ? !(toolResult as { isError?: boolean }).isError
                      : false

                    phClient.capture({
                      distinctId: userId,
                      event: "tool_call",
                      properties: {
                        toolName: displayName,
                        rawToolName: toolCall.toolName,
                        source,
                        serviceName,
                        success,
                        chatId,
                        // MCP-specific (optional)
                        ...(mcpServerInfo && {
                          serverId: mcpServerInfo.serverId,
                          serverName: mcpServerInfo.serverName,
                        }),
                      },
                    })
                  }
                }
              }
            }
```

### Step 4.5: Update Existing MCP Log Calls

Update the existing MCP audit log call (around line 411) to use the new import and add `source: "mcp"`:

```typescript
                void fetchMutation(
                  api.toolCallLog.log, // was: api.mcpToolCallLog.log
                  {
                    chatId: chatId as Id<"chats">,
                    serverId: serverInfo.serverId as Id<"mcpServers">,
                    toolName: serverInfo.displayName,
                    toolCallId: toolCall.toolCallId,
                    inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
                    outputPreview: toolResult
                      ? JSON.stringify(toolResult.output).slice(0, 500)
                      : undefined,
                    success,
                    source: "mcp", // NEW — explicit source
                    serviceName: serverInfo.serverName, // NEW
                  },
                  { token: convexToken }
                ).catch(() => {
                  // Intentionally swallowed — audit logging is best-effort
                })
```

### Step 4.6: Delete Old File

Delete `convex/mcpToolCallLog.ts` after verifying the new `convex/toolCallLog.ts` works correctly.

**Clean break note**: Since there are no existing users, this is a clean break — no data migration needed. The new `toolCallLog` table starts empty. The old `mcpToolCallLog` table is dropped when removed from the schema. No backfill script required.

### Verify Phase 4

1. **Convex push**: `npx convex dev` should apply schema changes without errors. The old `mcpToolCallLog` table will be dropped and the new `toolCallLog` table created.
2. **New logs**: Send a search query with an OpenAI model. Check the Convex dashboard — the `toolCallLog` table should contain a new entry with `source: "builtin"`, `serviceName: "OpenAI"`, and `serverId: undefined`.
3. **MCP logs**: Send a message using an MCP tool. Verify the log entry has `source: "mcp"`, the correct `serverId`, and `serviceName`.
4. **No stale references**: Search codebase for any remaining `mcpToolCallLog` references and update them.
5. **Lint + typecheck**: `bun run lint && bun run typecheck`

---

## Phase 5: BYOK Tool Key Settings UI

> **Effort**: M (3-4 days)
> **Files created**: 2-3 (settings panel components)
> **Files modified**: 3 (`convex/userKeys.ts`, `lib/user-keys.ts`, `app/api/chat/route.ts`)
> **Dependencies**: Phase 3 complete (Exa integrated)
> **Permission required**: None — `convex/schema.ts` is NOT modified (the `provider` field is already `v.string()`)

This phase is promoted from the original Phase 6 roadmap. With BYOK as the primary product strategy, users need a polished way to manage their tool API keys.

### Context to Load

```
@convex/schema.ts                      # userKeys table (lines 84-91)
@convex/userKeys.ts                    # Existing BYOK key CRUD pattern
@lib/encryption.ts                     # AES-256-GCM encryption for keys
@lib/user-keys.ts                      # getEffectiveApiKey pattern
@app/components/layout/settings/       # Existing settings panels
@lib/tools/third-party.ts             # Phase 3 — accepts exaKey parameter
```

### Step 5.1: Widen `getUserKeyFromConvex` and Add `getEffectiveToolKey`

The existing `userKeys` table stores provider API keys (OpenAI, Anthropic, etc.) with `userId + provider` as the lookup. The `provider` field is already `v.string()`, so tool provider IDs can be stored without schema changes.

**First**, widen `getUserKeyFromConvex` to accept `string` instead of `Provider`:

```typescript
// lib/user-keys.ts — CHANGE the function signature

// BEFORE:
export async function getUserKeyFromConvex(
  provider: Provider,
  token?: string
): Promise<string | null> {

// AFTER:
export async function getUserKeyFromConvex(
  provider: string, // Widened from Provider to string — supports both AI providers and tool providers
  token?: string
): Promise<string | null> {
```

> **Rationale**: The Convex schema already uses `v.string()` for the `provider` field — only the TypeScript type was restrictive. Tool providers ("exa", "firecrawl") need the same encrypt/decrypt flow as AI providers. A single function is more maintainable than duplicating the logic. The `getEffectiveApiKey` function retains its `Provider` type constraint since it also handles the env var map (which is AI-provider-specific).

**Then**, add the tool-specific types and resolution function:

```typescript
// lib/user-keys.ts — add below existing exports

/** Tool provider IDs that can be stored in userKeys */
export const TOOL_PROVIDERS = ["exa", "firecrawl"] as const
export type ToolProvider = (typeof TOOL_PROVIDERS)[number]

/** Maps tool provider IDs to their environment variable names */
const TOOL_ENV_MAP: Record<ToolProvider, string> = {
  exa: "EXA_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
}

/**
 * Get the effective API key for a tool provider.
 * Uses the widened getUserKeyFromConvex (accepts string) for BYOK lookup,
 * then falls back to platform env vars.
 *
 * Resolution order:
 *   1. User BYOK key from Convex userKeys (encrypted, decrypted here)
 *   2. Platform env var (e.g., EXA_API_KEY)
 *   3. undefined (no key available → tool will be skipped)
 *
 * @param provider - The tool provider to get key for
 * @param convexToken - Optional Convex auth token for fetching user keys
 */
export async function getEffectiveToolKey(
  provider: ToolProvider,
  convexToken?: string
): Promise<string | undefined> {
  // 1. Try user BYOK key first (getUserKeyFromConvex accepts string)
  if (convexToken) {
    const userKey = await getUserKeyFromConvex(provider, convexToken)
    if (userKey) return userKey
  }

  // 2. Fall back to platform env var
  return process.env[TOOL_ENV_MAP[provider]] || undefined
}
```

### Step 5.2: Create Tool Key Settings Panel

Create a settings panel at `app/components/layout/settings/tools/` that follows the existing settings panel patterns. The agent should:

1. Read the existing API key settings panel (likely in `app/components/layout/settings/`) for UI patterns
2. Create a "Tool Keys" section with:
   - Status indicators showing which tools are active (platform key vs. user key vs. unavailable)
   - Input fields for Exa and Firecrawl API keys
   - Clear labeling of which tools use platform-provided keys vs. user keys
   - Cost estimate display: "~$0.005 per search" for Exa ($5/1K), sourced from `estimatedCostPer1k` in `ToolMetadata`
   - Link to Exa Dashboard for key creation: https://dashboard.exa.ai/api-keys
3. Reuse the existing encrypted key storage flow (`convex/userKeys.ts` + `lib/encryption.ts`)

### Step 5.3: Wire User Tool Keys into Route.ts

Update the Phase 3 key resolution in `route.ts` to check for user BYOK tool keys:

```typescript
    // Key resolution: user BYOK key → platform env var → undefined
    // The exa-js SDK accepts keys in its constructor, so BYOK keys
    // are passed directly — no env var manipulation needed.
    let resolvedExaKey: string | undefined
    if (convexToken) {
      const { getEffectiveToolKey } = await import("@/lib/user-keys")
      resolvedExaKey = await getEffectiveToolKey("exa", convexToken)
    }
    if (!resolvedExaKey) {
      resolvedExaKey = process.env.EXA_API_KEY
    }
```

**Note**: Unlike `@exalabs/ai-sdk` (which reads from env only), our custom `tool()` wrapper using `exa-js` accepts the key directly via `new Exa(exaKey)`. This means BYOK works without any env var manipulation or workarounds — the resolved key (user BYOK or platform env) flows cleanly into the SDK constructor.

### Verify Phase 5

1. **Settings UI**: Navigate to Settings → Tool Keys. Verify the panel displays correctly with cost estimates.
2. **Save key**: Enter an Exa key and save. Verify it's stored encrypted in the `userKeys` table with `provider: "exa"`.
3. **BYOK override**: With both a platform `EXA_API_KEY` and a user BYOK key, verify the user's key takes priority (check Exa's usage dashboard).
4. **Remove key**: Delete the user key. Verify it falls back to the platform key.
5. **No platform key**: Remove `EXA_API_KEY` from env. Verify users with BYOK keys still get search, and users without keys get no search.
6. **Anonymous user**: Anonymous users should still get search via platform key (no BYOK lookup for unauthenticated users).

---

> **Phase 6 note**: There is no Phase 6. The original Phase 6 was split and promoted into earlier phases:
> - `ENABLE_MCP` feature gate removal → merged into **Phase 1, Step 1.4f**
> - BYOK tool key settings → promoted to **Phase 5**
>
> The numbering gap is intentional to preserve stable phase IDs referenced elsewhere.

---

## Phase 7: Future Tool Integrations (Roadmap)

> **Effort**: Variable per integration
> **Dependencies**: Phases 1-3 complete

This phase is not a single implementation step — it's a guide for adding future tools. Each subsection can be prioritized independently.

### 7.0: `ToolCapabilities` Type (Granular Control)

When code execution tools are added, extend `ModelConfig.tools` from `boolean` to `boolean | ToolCapabilities`:

```typescript
// lib/tools/types.ts — add when Phase 7 begins
export interface ToolCapabilities {
  search?: boolean  // Web search (Layer 1 + Layer 2). Default: true
  code?: boolean    // Code execution (provider sandboxes). Default: true
  mcp?: boolean     // MCP server tools (Layer 3). Default: true
}
```

Phases 1-5 use the boolean check (`tools !== false`). Granular checks use `typeof tools === 'object' ? tools.search !== false : tools !== false`.

### 7.1: ToolProvider Interface (Extensibility Pattern)

When the third tool provider is added (after Exa), refactor `lib/tools/third-party.ts` from a growing if-block into a registry pattern. This makes adding a new provider a "create one file" operation.

**Interface:**

```typescript
// lib/tools/types.ts — add to existing file

/**
 * Interface for third-party tool providers.
 * Each provider is a separate file in lib/tools/providers/.
 * The registry in lib/tools/third-party.ts iterates over registered providers.
 */
export interface ToolProvider {
  /** Unique identifier (e.g., "exa", "firecrawl") */
  id: string
  /** Human-readable name for UI */
  displayName: string
  /**
   * Check if this provider is available (API key present, etc.)
   * @param config - Resolved keys and flags from route.ts
   */
  isAvailable(config: { apiKey?: string; skipSearch?: boolean }): boolean
  /**
   * Return the tools this provider offers.
   * @param config - Same config as isAvailable
   */
  getTools(config: { apiKey?: string }): Promise<{
    tools: ToolSet
    metadata: Map<string, ToolMetadata>
  }>
}
```

**Directory structure** (when 3+ providers exist):

```
lib/tools/
├── types.ts              # ToolSource, ToolMetadata, ToolProvider interface
├── provider.ts           # Layer 1: Built-in provider tools
├── third-party.ts        # Layer 2: Registry that loads from providers/
├── providers/            # One file per third-party tool provider
│   ├── exa.ts            # implements ToolProvider (Phase 3 — already exists)
│   └── firecrawl.ts      # implements ToolProvider
└── index.ts              # Barrel export
```

### 7.2: Adding a New Third-Party Tool Provider

To add a new tool provider (e.g., Firecrawl, BrowserBase):

1. Install the SDK package: `bun add <package>`
2. Create `lib/tools/providers/<name>.ts` implementing `ToolProvider`
3. Register it in `lib/tools/third-party.ts`
4. Add display name to `tool-invocation.tsx`'s `BUILTIN_TOOL_DISPLAY` map
5. Add env var to `.env.example`
6. Add the provider ID to `TOOL_PROVIDERS` in `lib/user-keys.ts`
7. Prefer core SDKs that accept explicit API keys (like `exa-js`) over convenience wrappers that read from env vars only (like `@exalabs/ai-sdk`) — this is critical for BYOK support
8. Test

### 7.3: `MAX_TOOL_RESULT_SIZE` Enforcement

The `MAX_TOOL_RESULT_SIZE` constant (100KB) is defined in `lib/config.ts:195` but never enforced. Third-party tools can return arbitrarily large results, consuming model context and increasing token costs.

**Implementation approach:**
1. For custom `tool()` wrappers (future): Truncate the `execute` return value to `MAX_TOOL_RESULT_SIZE` bytes before returning.
2. For opaque provider tools (Layer 1): These are server-side and generally return reasonable sizes. Monitor via audit logging and add truncation in `onStepFinish` if needed.
3. For MCP tools: The existing `truncatePreview()` only applies to audit logs, not to the actual tool result passed to the model. Consider adding a wrapper that truncates oversized MCP tool results.

### 7.4: `prepareStep` and `needsApproval` (AI SDK v6 Patterns)

The research document identifies two AI SDK v6 patterns that the current plan does not use:

1. **`prepareStep` for dynamic tool restriction**: Restrict `activeTools` per step. For future high-risk tools (code execution, file operations), this limits the attack surface:
   ```typescript
   prepareStep: async ({ stepNumber }) => {
     if (stepNumber > 0) {
       // After the first step, restrict to only safe tools
       return { activeTools: ["web_search"] }
     }
   }
   ```

2. **`needsApproval` for cost-sensitive tools**: For tools with per-request costs (e.g., Exa deep search at higher credit cost), the AI SDK supports per-tool approval:
   ```typescript
   tools.web_search = tool({
     // ... tool definition ...
     needsApproval: true, // or async (input) => input.searchType === "deep"
   })
   ```
   This sends an approval request to the client instead of executing immediately.

### 7.5: Adding Provider Code Execution

When ready to add code execution:

1. Extend `lib/tools/provider.ts` with code execution tools:
   - `googleProvider.tools.codeExecution({})` for Gemini models
   - Anthropic's analysis tool (verify API first)
2. Build a dedicated code output renderer in `tool-invocation.tsx` (syntax highlighting, stdout/stderr blocks)
3. Add `"code"` icon support in the tool card header

### 7.6: Token-Efficient Tool Use (Anthropic)

`ANTHROPIC_BETA_HEADERS.tokenEfficient` is already defined in `lib/config.ts:174` (`"token-efficient-tools-2025-02-19"`). When Anthropic models have tools injected, enable this beta header to reduce token consumption:

```typescript
if (provider === "anthropic" && Object.keys(allTools).length > 0) {
  providerOptions.anthropic = {
    ...providerOptions.anthropic,
    headers: {
      "anthropic-beta": ANTHROPIC_BETA_HEADERS.tokenEfficient,
    },
  }
}
```

Verify the exact header format with the `@ai-sdk/anthropic` package before implementing.

### 7.7: URL/Content Extraction

1. Exa's `searchAndContents()` already returns page content (up to `maxCharacters` per result), covering basic extraction needs. For dedicated extraction:
2. Use `exa-js` → `exa.getContents(urls, { text: { maxCharacters: 5000 } })` for content extraction from specific URLs. Add as `content_extract` tool in `lib/tools/third-party.ts`.
3. Alternatively: `firecrawl-aisdk` → `scrapeTool` for JS-rendered page support (requires separate `FIRECRAWL_API_KEY`)

### 7.8: Verify `gateway` Import Path

The research found two import paths: `import { gateway } from "ai"` and `import { gateway } from "@ai-sdk/gateway"`. The `gateway` import is used for optional fallback search (`gateway.tools.perplexitySearch()`). Verify which import works before using. If neither works, skip — Layer 2 (Exa) serves the same purpose.

### 7.9: Verify Firecrawl AI SDK Package Name

The research uses `firecrawl-aisdk` but this could not be verified on npm. Check `npm info firecrawl-aisdk` and `npm info @mendable/firecrawl-js` for the correct package name before integrating.

---

## File Change Summary

**New**: `lib/tools/types.ts` (P1), `lib/tools/provider.ts` (P1), `lib/tools/third-party.ts` (P3), `convex/toolCallLog.ts` (P4), `app/components/layout/settings/tools/` (P5)
**Modified**: `lib/config.ts` (P1), `app/api/chat/route.ts` (P1,3,4,5), `app/components/chat/tool-invocation.tsx` (P2), `convex/schema.ts` (P4), `lib/user-keys.ts` (P5), `.env.example` (P3)
**Deleted**: `convex/mcpToolCallLog.ts` (P4) — replaced by `convex/toolCallLog.ts`
**New dep**: `exa-js` (P3) — Exa core SDK for BYOK-compatible web search
**Unchanged**: `lib/mcp/*` (entire MCP pipeline untouched)
**Verify only**: `lib/openproviders/index.ts` (confirm `apiSdk()` handles missing `opts`), `lib/models/data/` (confirm `webSearch` is UI-only)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `createOpenAI({ apiKey }).tools` doesn't expose tools | Low | High | Verified `typeof` returns `function`; full integration test in Phase 1 decision gate |
| Provider search adds unexpected BYOK cost | Medium | Medium | `estimatedCostPer1k` in ToolMetadata; cost indicators in tool cards and Phase 5 UI |
| Tool name collision (search vs MCP) | Very Low | Medium | Dev-mode `console.warn` collision detection; MCP tools are namespaced; `shouldInjectSearch` prevents Layer 1/Layer 2 overlap |
| Exa rate limits hit on platform key | Medium | Medium | Usage-based pricing ($5/1K); `ANONYMOUS_MAX_STEP_COUNT = 5` caps exposure; per-user rate limiting in future |
| `exa-js` API shape changes | Low | Medium | Task V4 verification; custom wrapper isolates API surface |
| Third-party tool hangs (no timeout) | Low | Medium | `TOOL_EXECUTION_TIMEOUT_MS` defined; enforcement deferred to Phase 7.3 |
| Tool returns oversized result (> 100KB) | Low | Medium | `MAX_TOOL_RESULT_SIZE` defined; enforcement deferred to Phase 7.3 |
| Breaking change in `streamText` tool handling | Very Low | High | Pin AI SDK version; test after upgrades |
| Anonymous users abuse platform search key | Medium | Medium | Daily message limit (5) x `ANONYMOUS_MAX_STEP_COUNT` (5) = max 25 tool calls/day/user |
| Removing `enableSearch` from `apiSdk()` breaks OpenRouter | Low | Medium | `apiSdk` signature has `opts?` optional parameter; verify OpenRouter models work without it in Phase 1 decision gate |
| xAI `webSearch` tool has different cost model | Low | Low | Set `estimatedCostPer1k: 0` (included in API pricing); monitor via PostHog |

---

## Success Criteria

After all phases are complete:

1. **`enableSearch` as universal control**: Users can toggle search ON for ANY model. When ON, the model gets web search tools — either native (Layer 1) or Exa fallback (Layer 2). When OFF, no search tools are injected.
2. **4 native providers**: OpenAI, Anthropic, Google, and xAI models use their own provider-defined search tools (Layer 1) — best quality, zero extra cost for BYOK users.
3. **Universal fallback**: Mistral, OpenRouter, and other non-Layer-1 models get Exa search (Layer 2) when a platform or BYOK key is available.
4. **BYOK consistency**: Built-in tool calls (Layer 1) bill to the user's BYOK key when one is provided — same key as model calls.
5. **BYOK tool keys**: Users can provide their own Exa/Firecrawl keys via Settings → Tool Keys, with platform keys as fallback.
6. **MCP unchanged**: Existing MCP server configurations continue to work exactly as before, independent of search.
7. **Single coordination point**: Route.ts is the sole coordinator. `enableSearch` is the master switch. Layer 2 does not know about Layer 1 providers.
8. **Extensible**: Adding a new tool provider requires minimal changes — create a provider file, register it, prefer core SDKs with explicit key support for BYOK.
9. **Auditable**: All tool calls (built-in, third-party, MCP) are logged to `toolCallLog` with required `source` discrimination. Unified `tool_call` PostHog event for observability.
10. **No feature gate**: Tools work for all users (authenticated AND anonymous) without requiring `ENABLE_MCP=true`.
11. **Anonymous cost protection**: Anonymous users capped at `ANONYMOUS_MAX_STEP_COUNT` (5) steps per message, limiting tool call cost exposure.
12. **Cost transparency**: Tool invocation cards display estimated per-search costs, with BYOK users seeing which key is billed.
13. **All search is visible**: No opaque provider-level search. All search goes through auditable, renderable tool calls.

