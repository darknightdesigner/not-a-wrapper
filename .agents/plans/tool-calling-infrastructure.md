# Tool Calling Infrastructure — Implementation Plan

> **Status**: Ready for Implementation (Reviewed)
> **Priority**: P0 — Critical
> **Timeline**: 3–4 weeks (7 phases)
> **Date**: February 11, 2026
> **Reviewed**: February 11, 2026
> **Research**: `.agents/context/research/tool-calling-infrastructure.md`
> **Decision**: `.agents/context/decisions/004-exa-vs-tavily.md`

> ### Review Changes (February 11, 2026)
>
> The following changes were made based on critical review. Items marked **[Blocking]** or **[Critical]** must be addressed before implementation begins.
>
> 1. **[Blocking] API key passthrough (W1)**: `getProviderTools()` now accepts the resolved BYOK API key and creates provider instances with it, instead of using the default singleton that reads from `process.env`. Without this fix, BYOK users' tool calls would silently bill to the platform key (or fail with 401 if no env key exists).
> 2. **[Critical] Decoupled layer resolution (W2)**: Removed `PROVIDERS_WITH_BUILTIN_SEARCH` from `third-party.ts`. Route.ts now coordinates layers by checking whether Layer 1 already provided search, eliminating fragile coupling where Layer 2 had to duplicate Layer 1's provider list.
> 3. **[High] Phase 3 resolved as Option C (Decision Gate)**: Platform key + BYOK override from the start. Was "start with Option A, add BYOK later." The BYOK-primary product strategy makes Option C the correct default.
> 4. **[High] Simplified maxSteps (W6)**: Removed dead `BUILTIN_TOOLS_MAX_STEP_COUNT` constant and collapsed the identical-branch triple ternary.
> 5. **[High] Tool execution timeout (W3)**: Added `TOOL_EXECUTION_TIMEOUT_MS` constant. Plan notes AbortSignal propagation for future tool wrappers.
> 6. **[High] Cost visibility (W5)**: Added `estimatedCostPer1k` to `ToolMetadata` for BYOK cost transparency in UI.
> 7. **[Medium] Audit table renamed (W10)**: `mcpToolCallLog` → `toolCallLog` in Phase 4. Convex schema change is straightforward and avoids permanent naming confusion.
> 8. **[Medium] BYOK Tool Key UI promoted (Phase 5)**: Moved from Phase 6 roadmap to Phase 5 concrete implementation. Core to the BYOK-primary product strategy.
> 9. **[Medium] `await import()` consistency (W9)**: Replaced `require()` with `await import()` in all new code. Matches existing patterns in `route.ts:132,144`.
> 10. **[Medium] V4 verification task added (W11)**: Tavily + AI SDK v6 compatibility check before Phase 3.
> 11. **[Medium] ToolProvider interface (W7)**: Added to Phase 7 roadmap for extensibility beyond 3 providers.
> 12. **[Low] Self-hoster env-var controls cancelled (W8)**: Redirected effort to user-facing toggles (BYOK-primary strategy).
> 13. **[Info] Research patterns noted (W12)**: `prepareStep`, `needsApproval`, token-efficient tools, `MAX_TOOL_RESULT_SIZE` enforcement added to Phase 7 roadmap.

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

**Implementing a 3-layer hybrid tool architecture with centralized coordination:**

1. **Layer 1 — Built-in Provider Tools** (zero-config, zero new deps): Provider-specific search via `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` — packages already installed. Uses the resolved BYOK API key (same key as the model).
2. **Layer 2 — Third-Party Tools** (one new dep): Universal search fallback via `@tavily/ai-sdk` for providers without native search (xAI, Mistral, OpenRouter). API key model: **Option C (Hybrid)** — platform key as default, user BYOK key takes priority.
3. **Layer 3 — MCP Tools** (existing, unchanged): The existing `loadUserMcpTools()` pipeline continues as-is.

**Coordination model**: Route.ts is the single coordinator. It loads Layer 1, checks whether search is already provided, then loads Layer 2 with `skipSearch` if Layer 1 already has it. Layer 2 does NOT know about Layer 1's provider list — the coupling is broken.

All three layers merge into a single `ToolSet` before passing to `streamText()`. The Vercel AI SDK v6 `ToolSet` type natively supports this composition — all tool types are `Record<string, ToolDefinition>` under the hood.

**Architecture diagram:**

```
┌──────────────────────────────────────────────────────────────────┐
│                   app/api/chat/route.ts                           │
│                   streamText({ tools: allTools })                 │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ COORDINATOR: route.ts merges all layers                    │  │
│  │                                                            │  │
│  │  ┌──────────────┐                                          │  │
│  │  │  Layer 1:     │──→ has search? ──→ skipSearch flag       │  │
│  │  │  Built-in     │                         │                │  │
│  │  │  Provider     │                         ▼                │  │
│  │  │  Tools        │    ┌──────────────┐  ┌──────────────┐   │  │
│  │  │               │    │  Layer 2:     │  │  Layer 3:    │   │  │
│  │  │ lib/tools/    │    │  Third-party  │  │  MCP Tools   │   │  │
│  │  │ provider.ts   │    │  Tools        │  │  (existing)  │   │  │
│  │  │               │    │              │  │              │   │  │
│  │  │ apiKey ──────►│    │ lib/tools/   │  │ lib/mcp/     │   │  │
│  │  │ (BYOK)        │    │ third-       │  │ load-tools   │   │  │
│  │  │               │    │ party.ts     │  │ .ts          │   │  │
│  │  └──────────────┘    └──────────────┘  └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Pre-Implementation: Verification Tasks

Before writing any code, the implementing agent MUST verify these unconfirmed API identifiers.

### Task V1: Verify Anthropic Web Search Export

The research document uses `anthropic.tools.webSearch_20250305()` but this identifier is **UNVERIFIED**. The date suffix `_20250305` predates Anthropic's web search announcement (May 7, 2025).

**Steps:**

1. Run `npx tsx -e "import { anthropic } from '@ai-sdk/anthropic'; console.log(Object.keys(anthropic.tools))"` to list available tool exports.
2. If that fails, check the package source: `ls node_modules/@ai-sdk/anthropic/dist/` and grep for `webSearch` or `web_search`.
3. Alternatively, search `npm info @ai-sdk/anthropic` or check https://ai-sdk.dev/providers/ai-sdk-providers/anthropic.
4. Record the exact export name. Update this plan's Phase 1 code accordingly.

**Fallback**: If `@ai-sdk/anthropic` does not export a web search tool at all, skip Anthropic in Phase 1 Layer 1 and rely on Layer 2 (Tavily) for Anthropic models.

### Task V2: Verify `gateway` Import Path

The research found two import paths: `import { gateway } from "ai"` and `import { gateway } from "@ai-sdk/gateway"`.

**Steps:**

1. Run `npx tsx -e "import { gateway } from 'ai'; console.log(typeof gateway, Object.keys(gateway.tools || {}))"`.
2. If that fails, try `import { gateway } from "@ai-sdk/gateway"`.
3. Record which import works. Update Phase 7 roadmap accordingly if gateway is used.

**Note**: The `gateway` import is used for optional fallback search (`gateway.tools.perplexitySearch()`). If neither import works, skip the gateway fallback — Layer 2 (Tavily) serves the same purpose.

### Task V3: Verify Firecrawl AI SDK Package Name (Optional — Phase 7+)

The research uses `firecrawl-aisdk` but this could not be verified on npm. The actual package may be under `@mendable/firecrawl-js`.

**Steps:**

1. Run `npm info firecrawl-aisdk` to check if it exists.
2. If not found, check `npm info @mendable/firecrawl-js` and look for AI SDK tool exports in the docs.
3. Record the correct package name for future Phase 7+ integration.

### Task V4: Verify Tavily + AI SDK v6 Compatibility

The research notes `@tavily/ai-sdk` is "documented as compatible with AI SDK v5 (works with v6 as well)" but this is **UNVERIFIED**. Since Tavily is Phase 3's sole new dependency, verify before committing to it.

**Steps:**

1. Run `npm info @tavily/ai-sdk` to confirm the package exists and check its latest version.
2. After Phase 3 installation, run: `npx tsx -e "import { tavilySearch } from '@tavily/ai-sdk'; console.log(typeof tavilySearch)"` — should output `function`.
3. Verify the returned tool object has the expected shape for AI SDK v6 `ToolSet` compatibility.

**Fallback**: If `@tavily/ai-sdk` is incompatible with AI SDK v6, use `@tavily/core` with a custom `tool()` wrapper (the research document Section 7.1 shows this pattern with Exa).

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
 * - "third-party": Third-party tools via API keys (Exa, Tavily, Firecrawl, etc.)
 * - "mcp": User-configured MCP server tools (existing system)
 */
export type ToolSource = "builtin" | "third-party" | "mcp"

/**
 * Metadata for a tool, used for UI display, audit logging, and cost tracking.
 */
export interface ToolMetadata {
  /** Human-readable display name (e.g., "Web Search", "Tavily Search") */
  displayName: string
  /** Tool source layer */
  source: ToolSource
  /** Provider or service name (e.g., "OpenAI", "Tavily", "my-mcp-server") */
  serviceName: string
  /** Optional icon identifier for the UI */
  icon?: "search" | "code" | "image" | "extract" | "wrench"
  /**
   * Estimated cost per 1,000 invocations in USD.
   * Used for BYOK cost transparency in the UI.
   * Omit if the tool has no marginal cost or cost is unknown.
   */
  estimatedCostPer1k?: number
}
```

### Step 1.2: Create `lib/tools/provider.ts`

Create the provider-specific tool resolver. This module returns zero-config tools that use the resolved BYOK API key — the same key used for the model itself.

**IMPORTANT**: Before writing this file, complete verification Task V1 (Anthropic export name). Use the verified export name in the `anthropic` case.

```typescript
// lib/tools/provider.ts

import type { ToolSet } from "ai"
import type { ToolMetadata } from "./types"

/**
 * Provider IDs that have native built-in search tools.
 * These tools use the same API key as the model itself — zero additional config.
 */
const PROVIDERS_WITH_SEARCH = ["openai", "anthropic", "google"] as const
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
      // NOTE: The exact export name must be verified in Task V1.
      // The research document uses webSearch_20250305() but this is unverified.
      // Replace the identifier below with the verified export name.
      const { createAnthropic } = await import("@ai-sdk/anthropic")
      const anthropicProvider = createAnthropic(apiKey ? { apiKey } : {})
      // TODO: Replace with verified identifier from Task V1
      // tools.web_search = anthropicProvider.tools.webSearch_VERIFIED_DATE()
      // metadata.set("web_search", {
      //   displayName: "Web Search",
      //   source: "builtin",
      //   serviceName: "Anthropic",
      //   icon: "search",
      //   estimatedCostPer1k: 10, // Usage-based, varies
      // })
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
} from "@/lib/config"
```

**1.4b — Add built-in tool loading block** (insert AFTER line 167 `const aiModel = ...`, BEFORE line 169 MCP block):

```typescript
    // -----------------------------------------------------------------------
    // Built-in Tool Loading (Layer 1)
    // Zero-config, provider-specific tools using the same API key as the model.
    // The resolved apiKey (BYOK or undefined for env fallback) is passed through
    // to ensure consistent billing — tool calls use the same key as model calls.
    // -----------------------------------------------------------------------
    let builtInTools: ToolSet = {} as ToolSet
    let builtInToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    if (modelConfig.tools !== false) {
      const { getProviderTools } = await import("@/lib/tools/provider")
      const providerResult = await getProviderTools(provider, apiKey)
      builtInTools = providerResult.tools
      builtInToolMetadata = providerResult.metadata
    }
```

**1.4c — Merge tools and update step count** (replace lines 212-213):

Current code:
```typescript
    const hasMcpTools = Object.keys(mcpTools).length > 0
    const maxSteps = hasMcpTools ? MCP_MAX_STEP_COUNT : 10
```

Replace with:
```typescript
    // Merge all tool layers: built-in (Layer 1) + MCP (Layer 3)
    // Layer 2 (third-party) will be added in Phase 3.
    // Spread order: built-in first, MCP second. MCP tools are namespaced
    // (e.g., "serverslug_toolname") so key collisions are extremely unlikely.
    // If a collision occurs, MCP wins (intentional — user config overrides defaults).
    const allTools = { ...builtInTools, ...mcpTools } as ToolSet
    const hasMcpTools = Object.keys(mcpTools).length > 0
    const maxSteps = hasMcpTools ? MCP_MAX_STEP_COUNT : DEFAULT_MAX_STEP_COUNT
```

**1.4d — Update streamText call** (line 292):

Current code:
```typescript
      tools: mcpTools,
```

Replace with:
```typescript
      tools: allTools,
```

### Verify Phase 1

1. **Lint**: `bun run lint` — no new errors
2. **Typecheck**: `bun run typecheck` — no new errors
3. **Smoke test**: `bun run dev`, select an OpenAI model (e.g., gpt-5-mini), send a message asking "What happened in the news today?" — the model should invoke `web_search` and return results with citations. Select a Google model and repeat. Verify the model calls the search tool.
4. **Non-search test**: Send a regular message ("What is 2+2?") — the model should NOT invoke search, confirming `toolChoice: "auto"` behavior.
5. **No-tools model**: Select a Perplexity model (which has `tools: false` in ModelConfig) — verify no tools are injected.
6. **BYOK key test**: If a user BYOK key is configured for OpenAI, verify the tool uses that key (check that the search call appears in the user's OpenAI usage dashboard, not the platform's).

### Decision Gate

- [ ] Did Task V1 reveal the correct Anthropic web search export? If yes, uncomment the `anthropic` case in `lib/tools/provider.ts`. If no export exists, leave it commented out — Anthropic models will use Layer 2 fallback in Phase 3.
- [ ] Does `createOpenAI({ apiKey }).tools.webSearch({})` work correctly with a BYOK key?
- [ ] Does `createGoogleGenerativeAI({ apiKey }).tools.googleSearch({})` work correctly?

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

In the tool card rendering, check if the tool name exists in `BUILTIN_TOOL_DISPLAY` before falling back to the raw name. Use the `Search01Icon` for search tools instead of the generic `Wrench01Icon`.

The exact implementation depends on the current rendering structure. The agent should:
1. Read the full `tool-invocation.tsx` file
2. Locate where tool names are displayed (look for `getStaticToolName` or raw `toolName` usage)
3. Add a helper: `const displayInfo = BUILTIN_TOOL_DISPLAY[toolName] ?? null`
4. If `displayInfo` exists, use `displayInfo.name` as the display name and swap the icon

### Verify Phase 2

1. **Visual check**: In dev mode, send a search query to an OpenAI/Google model. Verify the tool invocation card shows "Web Search" with a search icon instead of a wrench icon and raw tool name.
2. **MCP tools unchanged**: If MCP is configured, verify MCP tool cards still render with the existing wrench icon and namespaced names.

---

## Phase 3: Third-Party Tool Framework (Tavily)

> **Effort**: M (2-3 days)
> **Files created**: 1 (`lib/tools/third-party.ts`)
> **Files modified**: 2 (`app/api/chat/route.ts`, `package.json`)
> **Dependencies**: Phase 1 complete, one new npm package
> **Permission required**: `bun add @tavily/ai-sdk` (new dependency — ask user first per AGENTS.md)

### Context to Load

```
@app/api/chat/route.ts              # Current tool integration (Phase 1 changes)
@lib/tools/provider.ts              # Phase 1 provider tools
@lib/tools/types.ts                 # ToolMetadata type
@lib/openproviders/env.ts           # Environment variable pattern
@convex/schema.ts                   # userKeys table (lines 84-91)
@lib/user-keys.ts                   # getEffectiveApiKey pattern
@.agents/context/decisions/004-exa-vs-tavily.md  # Decision: Tavily chosen for Phase 3
```

### Decision Gate (Resolved)

**API key model: Option C — Hybrid.** This is resolved based on the BYOK-primary product strategy:

- **Platform key** (`TAVILY_API_KEY` env var) provides a baseline: all authenticated users get search on non-provider models. The platform controls costs via rate limits.
- **User BYOK key** takes priority when provided (via Phase 5's settings UI). User bears their own cost with higher limits.
- **Key resolution order**: User BYOK key → Platform env var → no tool (graceful skip).

Phase 3 implements the infrastructure with platform key support. Phase 5 adds the user BYOK key resolution.

### Step 3.1: Install Tavily AI SDK Package

```bash
bun add @tavily/ai-sdk
```

Verify installation (Task V4): `npx tsx -e "import { tavilySearch } from '@tavily/ai-sdk'; console.log(typeof tavilySearch)"` should output `function`.

### Step 3.2: Create `lib/tools/third-party.ts`

This module provides tools for providers without native capabilities. It does NOT know which providers have built-in search — that coordination happens in `route.ts` via the `skipSearch` parameter.

```typescript
// lib/tools/third-party.ts

import type { ToolSet } from "ai"
import type { ToolMetadata } from "./types"

/**
 * Configuration for third-party tool loading.
 * The coordinator (route.ts) determines which capabilities to skip
 * based on what Layer 1 (built-in provider tools) already provides.
 */
export interface ThirdPartyToolOptions {
  /**
   * Skip loading search tools.
   * Set to true when Layer 1 already provides a search tool for this provider.
   * This eliminates the coupling where Layer 2 needed to know Layer 1's provider list.
   */
  skipSearch?: boolean

  /**
   * Resolved Tavily API key.
   * Key resolution order (handled by caller in route.ts):
   *   1. User BYOK key from Convex userKeys (Phase 5)
   *   2. Platform env var: process.env.TAVILY_API_KEY
   *   3. undefined (no key → skip Tavily tools)
   */
  tavilyKey?: string
}

/**
 * Returns third-party tools based on available API keys and capability flags.
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
  const { skipSearch = false, tavilyKey } = options
  const tools: Record<string, unknown> = {}
  const metadata = new Map<string, ToolMetadata>()

  // Tavily Search — skip if Layer 1 already provides search
  if (!skipSearch && tavilyKey) {
    try {
      const { tavilySearch } = await import("@tavily/ai-sdk")
      tools.web_search = tavilySearch({
        maxResults: 5,
        searchDepth: "basic",
        // The tavilySearch function reads TAVILY_API_KEY from process.env.
        // For user BYOK keys (Phase 5), we may need to pass the key explicitly.
        // TODO (Phase 5): Check if @tavily/ai-sdk supports passing apiKey as a parameter.
        // If not, use @tavily/core with a custom tool() wrapper.
      })
      metadata.set("web_search", {
        displayName: "Web Search",
        source: "third-party",
        serviceName: "Tavily",
        icon: "search",
        estimatedCostPer1k: 8, // $0.008/credit, basic search = 1 credit
      })
    } catch (err) {
      console.error("[tools/third-party] Failed to load Tavily search:", err)
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
    // Route.ts coordinates: if Layer 1 already has search, Layer 2 skips it.
    // This eliminates coupling — third-party.ts does not know about providers.
    // -----------------------------------------------------------------------
    let thirdPartyTools: ToolSet = {} as ToolSet
    let thirdPartyToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    if (modelConfig.tools !== false) {
      const { getThirdPartyTools } = await import("@/lib/tools/third-party")

      // Centralized search coordination: check if Layer 1 already provides search
      const builtInHasSearch = "web_search" in builtInTools

      // Key resolution: user BYOK key (Phase 5) → platform env var → undefined
      // Phase 3: platform key only. Phase 5 will add user BYOK resolution here.
      const resolvedTavilyKey = process.env.TAVILY_API_KEY

      const thirdPartyResult = await getThirdPartyTools({
        skipSearch: builtInHasSearch,
        tavilyKey: resolvedTavilyKey,
      })
      thirdPartyTools = thirdPartyResult.tools
      thirdPartyToolMetadata = thirdPartyResult.metadata
    }
```

**3.3b — Update tool merging** (update the merge block from Phase 1):

```typescript
    // Merge all tool layers: built-in (Layer 1) + third-party (Layer 2) + MCP (Layer 3)
    // Spread order matters for conflict resolution:
    //   1. Built-in tools (lowest priority — provider defaults)
    //   2. Third-party tools (middle — only for providers without built-in search)
    //   3. MCP tools (highest priority — user-configured, namespaced)
    const allTools = { ...builtInTools, ...thirdPartyTools, ...mcpTools } as ToolSet
    const hasMcpTools = Object.keys(mcpTools).length > 0
    const maxSteps = hasMcpTools ? MCP_MAX_STEP_COUNT : DEFAULT_MAX_STEP_COUNT
```

### Step 3.4: Update Tool Display Map (Phase 2 additions)

In `app/components/chat/tool-invocation.tsx`, add Tavily to the built-in tool display map:

```typescript
const BUILTIN_TOOL_DISPLAY: Record<string, { name: string; icon: "search" | "code" | "image" | "extract" }> = {
  web_search: { name: "Web Search", icon: "search" },
  google_search: { name: "Web Search", icon: "search" },
  tavily_search: { name: "Web Search", icon: "search" },
  // Future:
  // tavily_extract: { name: "Content Extract", icon: "extract" },
}
```

### Verify Phase 3

1. **With TAVILY_API_KEY**: Set `TAVILY_API_KEY=tvly-...` in `.env.local`. Select a Mistral or xAI model. Ask "What happened in the news today?" — the model should invoke `web_search` via Tavily.
2. **Without TAVILY_API_KEY**: Remove the key. Verify non-OpenAI/Google/Anthropic models get no search tools (graceful degradation).
3. **No duplicate tools**: Select an OpenAI model WITH `TAVILY_API_KEY` set — verify only ONE `web_search` tool is injected (the OpenAI built-in, not Tavily). Confirm via the tool invocation card showing "Web Search" with OpenAI's provider rendering, not Tavily's.
4. **Lint + typecheck**: `bun run lint && bun run typecheck`

### Environment Variable Documentation

After Phase 3, update `.env.example` to include:

```bash
# Third-Party Tool API Keys (optional)
# These enable additional tool capabilities for models without native tools.
# Users can also provide their own keys via Settings → Tool Keys (overrides these).
# TAVILY_API_KEY=tvly-...    # Web search for xAI/Mistral/OpenRouter models
# EXA_API_KEY=...            # Alternative search (future)
# FIRECRAWL_API_KEY=...      # Web scraping/extraction (future)
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
    // Tool source discriminator — identifies which layer produced the tool call
    source: v.optional(
      v.union(
        v.literal("builtin"),
        v.literal("third-party"),
        v.literal("mcp")
      )
    ),
    // Service name for display and filtering (e.g., "OpenAI", "Tavily", "my-mcp-server")
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
    source: v.optional(
      v.union(
        v.literal("builtin"),
        v.literal("third-party"),
        v.literal("mcp")
      )
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
      source: args.source ?? "mcp", // Default to "mcp" for backward compat with existing callers
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

### Step 4.4: Update Existing MCP Log Calls

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

### Step 4.5: Delete Old File

Delete `convex/mcpToolCallLog.ts` after verifying the new `convex/toolCallLog.ts` works correctly.

### Verify Phase 4

1. **Convex push**: `npx convex dev` should apply schema changes without errors
2. **Backward compatibility**: Existing MCP tool call logs continue to work (now with `source: "mcp"`)
3. **New logs**: Send a search query with an OpenAI model. Check the Convex dashboard — the `toolCallLog` table should contain a new entry with `source: "builtin"`, `serviceName: "OpenAI"`, and `serverId: undefined`.
4. **No stale references**: Search codebase for any remaining `mcpToolCallLog` references and update them.
5. **Lint + typecheck**: `bun run lint && bun run typecheck`

---

## Phase 5: BYOK Tool Key Settings UI

> **Effort**: M (3-4 days)
> **Files created**: 2-3 (settings panel components)
> **Files modified**: 3 (`convex/schema.ts`, `convex/userKeys.ts`, `app/api/chat/route.ts`)
> **Dependencies**: Phase 3 complete (Tavily integrated)
> **Permission required**: Modifies `convex/schema.ts` — ask user first per AGENTS.md

This phase is promoted from the original Phase 6 roadmap. With BYOK as the primary product strategy, users need a polished way to manage their tool API keys.

### Context to Load

```
@convex/schema.ts                      # userKeys table (lines 84-91)
@convex/userKeys.ts                    # Existing BYOK key CRUD pattern
@lib/encryption.ts                     # AES-256-GCM encryption for keys
@lib/user-keys.ts                      # getEffectiveApiKey pattern
@app/components/layout/settings/       # Existing settings panels
@lib/tools/third-party.ts             # Phase 3 — accepts tavilyKey parameter
```

### Step 5.1: Extend `userKeys` for Tool Providers

The existing `userKeys` table stores provider API keys (OpenAI, Anthropic, etc.) with `userId + provider` as the lookup. Extend this to accept tool provider keys.

Add the following tool provider IDs to the list of valid `provider` values:
- `"tavily"` — Tavily web search
- `"exa"` — Exa AI search (future)
- `"firecrawl"` — Firecrawl scraping (future)

No schema change needed — the `provider` field is already `v.string()`. The change is in the application logic: `convex/userKeys.ts` mutations should accept these new provider IDs, and `lib/user-keys.ts` should be extended with a helper to retrieve tool-specific keys.

```typescript
// lib/user-keys.ts — add helper for tool keys

/** Tool provider IDs that can be stored in userKeys */
export const TOOL_PROVIDERS = ["tavily", "exa", "firecrawl"] as const
export type ToolProvider = (typeof TOOL_PROVIDERS)[number]

/**
 * Get the user's BYOK key for a tool provider.
 * Returns undefined if no key is stored.
 */
export async function getEffectiveToolKey(
  provider: ToolProvider,
  convexToken: string
): Promise<string | undefined> {
  // Reuse the same getEffectiveApiKey logic — the userKeys table
  // stores tool keys identically to provider keys.
  const { getEffectiveApiKey } = await import("@/lib/user-keys")
  return (await getEffectiveApiKey(provider as string, convexToken)) || undefined
}
```

### Step 5.2: Create Tool Key Settings Panel

Create a settings panel at `app/components/layout/settings/tools/` that follows the existing settings panel patterns. The agent should:

1. Read the existing API key settings panel (likely in `app/components/layout/settings/`) for UI patterns
2. Create a "Tool Keys" section with:
   - Status indicators showing which tools are active (platform key vs. user key vs. unavailable)
   - Input fields for Tavily, Exa, and Firecrawl API keys
   - Clear labeling of which tools use platform-provided keys vs. user keys
   - Cost estimate display using `estimatedCostPer1k` from `ToolMetadata`
3. Reuse the existing encrypted key storage flow (`convex/userKeys.ts` + `lib/encryption.ts`)

### Step 5.3: Wire User Tool Keys into Route.ts

Update the Phase 3 key resolution in `route.ts` to check for user BYOK tool keys:

```typescript
    // Key resolution: user BYOK key → platform env var → undefined
    let resolvedTavilyKey: string | undefined
    if (isAuthenticated && convexToken) {
      const { getEffectiveToolKey } = await import("@/lib/user-keys")
      resolvedTavilyKey = await getEffectiveToolKey("tavily", convexToken)
    }
    if (!resolvedTavilyKey) {
      resolvedTavilyKey = process.env.TAVILY_API_KEY
    }
```

**Note**: The `@tavily/ai-sdk` package reads `TAVILY_API_KEY` from `process.env` by default. If the user provides a BYOK key that differs from the env var, we may need to use `@tavily/core` with a custom `tool()` wrapper that accepts the key as a parameter. Verify this during implementation. If `tavilySearch()` supports a `key` or `apiKey` option, use that directly.

### Verify Phase 5

1. **Settings UI**: Navigate to Settings → Tool Keys. Verify the panel displays correctly.
2. **Save key**: Enter a Tavily key and save. Verify it's stored encrypted in the `userKeys` table with `provider: "tavily"`.
3. **BYOK override**: With both a platform `TAVILY_API_KEY` and a user BYOK key, verify the user's key takes priority (check Tavily's usage dashboard).
4. **Remove key**: Delete the user key. Verify it falls back to the platform key.
5. **No platform key**: Remove `TAVILY_API_KEY` from env. Verify users with BYOK keys still get search, and users without keys get no search.

---

## Phase 6: Remove `ENABLE_MCP` Feature Gate

> **Effort**: S (< 1 day)
> **Files modified**: 1 (`app/api/chat/route.ts`)
> **Dependencies**: Phases 1-4 complete and stable
> **Note**: This phase can optionally be executed earlier (after Phase 1) since built-in tools provide value without MCP, making the feature gate less critical. Discuss timing with the project owner.

### Context to Load

```
@app/api/chat/route.ts  # MCP gate at line 178: process.env.ENABLE_MCP === "true"
```

### Decision Gate

- [ ] Are built-in tools stable in production? (Phase 1 verified)
- [ ] Is the MCP pipeline stable with the new tool merging? (Phase 1 verified)
- [ ] Is the deployer comfortable removing the gate? (Discuss with user)

### Step 6.1: Remove the ENABLE_MCP Check

**Current code** (lines 175-179):

```typescript
    if (
      isAuthenticated &&
      convexToken &&
      process.env.ENABLE_MCP === "true" &&
      modelConfig.tools !== false
    ) {
```

**Replace with:**

```typescript
    if (
      isAuthenticated &&
      convexToken &&
      modelConfig.tools !== false
    ) {
```

This removes the `ENABLE_MCP` env var requirement. MCP tools are now loaded for all authenticated users whose model supports tools. The existing security layers (URL validation, DNS rebinding guard, circuit breaker, per-tool approval) remain in place.

### Step 6.2: Update Documentation

Remove references to `ENABLE_MCP` from:
- `.env.example` (if present)
- Any README or setup docs that mention the flag
- `app/api/CLAUDE.md` (if it mentions the flag)

### Verify Phase 6

1. **Without ENABLE_MCP**: Remove `ENABLE_MCP=true` from `.env.local`. Verify MCP tools still load for authenticated users with configured MCP servers.
2. **Built-in tools still work**: Verify provider search tools work regardless of MCP state.
3. **Anonymous users**: Verify anonymous users still get NO MCP tools (the `isAuthenticated && convexToken` check remains).

---

## Phase 7: Future Tool Integrations (Roadmap)

> **Effort**: Variable per integration
> **Dependencies**: Phases 1-3 complete

This phase is not a single implementation step — it's a guide for adding future tools. Each subsection can be prioritized independently.

### 7.1: ToolProvider Interface (Extensibility Pattern)

When the third tool provider is added (after Tavily), refactor `lib/tools/third-party.ts` from a growing if-block into a registry pattern. This makes adding a new provider a "create one file" operation.

**Interface:**

```typescript
// lib/tools/types.ts — add to existing file

/**
 * Interface for third-party tool providers.
 * Each provider is a separate file in lib/tools/providers/.
 * The registry in lib/tools/third-party.ts iterates over registered providers.
 */
export interface ToolProvider {
  /** Unique identifier (e.g., "tavily", "exa", "firecrawl") */
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
│   ├── tavily.ts         # implements ToolProvider
│   ├── exa.ts            # implements ToolProvider
│   └── firecrawl.ts      # implements ToolProvider
└── index.ts              # Barrel export
```

### 7.2: Adding a New Third-Party Tool Provider

To add a new tool provider (e.g., Exa, Firecrawl, BrowserBase):

1. Install the AI SDK package: `bun add @exalabs/ai-sdk`
2. Create `lib/tools/providers/exa.ts` implementing `ToolProvider`
3. Register it in `lib/tools/third-party.ts`
4. Add display name to `tool-invocation.tsx`'s `BUILTIN_TOOL_DISPLAY` map
5. Add env var to `.env.example`
6. Add the provider ID to `TOOL_PROVIDERS` in `lib/user-keys.ts`
7. Test

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

2. **`needsApproval` for cost-sensitive tools**: For tools with per-request costs (e.g., Tavily advanced search = 2 credits), the AI SDK supports per-tool approval:
   ```typescript
   tools.web_search = tavilySearch({
     searchDepth: "advanced",
     needsApproval: true, // or async (input) => input.searchDepth === "advanced"
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

1. Use `@tavily/ai-sdk` → `tavilyExtract()` (already installed after Phase 3)
2. Add to `lib/tools/third-party.ts` as `content_extract` tool
3. Alternatively: `firecrawl-aisdk` → `scrapeTool` for JS-rendered page support

---

## File Change Summary

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `lib/tools/types.ts` | 1 | Shared types (`ToolSource`, `ToolMetadata`) |
| `lib/tools/provider.ts` | 1 | Provider-specific built-in tools (accepts BYOK apiKey) |
| `lib/tools/third-party.ts` | 3 | Third-party tool integrations (decoupled, accepts config) |
| `convex/toolCallLog.ts` | 4 | Renamed from `convex/mcpToolCallLog.ts` — all tool sources |
| `app/components/layout/settings/tools/` | 5 | BYOK tool key settings panel |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `lib/config.ts` | 1 | Add `DEFAULT_MAX_STEP_COUNT`, `TOOL_EXECUTION_TIMEOUT_MS` |
| `app/api/chat/route.ts` | 1, 3, 4, 5, 6 | Import tools, pass BYOK apiKey, merge 3 layers with centralized coordination, update audit logging to `toolCallLog`, add BYOK tool key resolution, remove `ENABLE_MCP` |
| `app/components/chat/tool-invocation.tsx` | 2 | Add built-in tool display names and icons |
| `convex/schema.ts` | 4 | Rename `mcpToolCallLog` → `toolCallLog`, make `serverId` optional, add `source` and `serviceName` fields, add `by_source` index |
| `lib/user-keys.ts` | 5 | Add `TOOL_PROVIDERS`, `getEffectiveToolKey()` helper |
| `.env.example` | 3 | Document `TAVILY_API_KEY` and future tool API keys |

### Deleted Files

| File | Phase | Reason |
|------|-------|--------|
| `convex/mcpToolCallLog.ts` | 4 | Renamed to `convex/toolCallLog.ts` |

### Dependencies

| Package | Phase | Purpose |
|---------|-------|---------|
| `@tavily/ai-sdk` | 3 | Universal web search for non-provider models |

### No Changes Required

| File | Reason |
|------|--------|
| `lib/mcp/load-tools.ts` | Existing MCP pipeline completely untouched |
| `lib/mcp/circuit-breaker.ts` | No changes |
| `lib/mcp/url-validation.ts` | No changes |
| `lib/models/types.ts` | `tools?: boolean` field already sufficient |
| `lib/openproviders/provider-map.ts` | `getProviderForModel()` already returns the provider ID we need |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Anthropic web search export name incorrect | Medium | Low | Task V1 verification; fallback to Tavily |
| `createOpenAI({ apiKey }).tools` doesn't expose tools | Low | High | Verify in Phase 1 decision gate; fallback to default singleton with env key |
| Provider search adds unexpected BYOK cost | Medium | Medium | `estimatedCostPer1k` in ToolMetadata; cost indicators in Phase 5 UI |
| Tool name collision (built-in vs third-party) | Very Low | Medium | Centralized coordination in route.ts; Layer 2 `skipSearch` flag |
| Tavily rate limits hit on platform key | Medium | Medium | Credit-based pricing with generous free tier; rate limit per-user in future |
| `@tavily/ai-sdk` incompatible with AI SDK v6 | Low | High | Task V4 verification; fallback to `@tavily/core` + custom `tool()` wrapper |
| Third-party tool hangs (no timeout) | Low | Medium | `TOOL_EXECUTION_TIMEOUT_MS` defined; enforcement deferred to Phase 7.3 |
| Tool returns oversized result (> 100KB) | Low | Medium | `MAX_TOOL_RESULT_SIZE` defined; enforcement deferred to Phase 7.3 |
| Breaking change in `streamText` tool handling | Very Low | High | Pin AI SDK version; test after upgrades |
| Convex table rename breaks existing data | Very Low | Low | Convex handles schema renames; verify migration in Phase 4 |

---

## Success Criteria

After all phases are complete:

1. **Zero-config search**: A new user can ask "What's in the news today?" and get web search results without configuring anything (assuming provider API keys are set up).
2. **Universal coverage**: Every model with `tools !== false` gets web search — either via provider-specific tools or Tavily fallback.
3. **BYOK consistency**: Tool calls bill to the user's BYOK key when one is provided — same key as model calls.
4. **BYOK tool keys**: Users can provide their own Tavily/Exa/Firecrawl keys via Settings, with platform keys as fallback.
5. **MCP unchanged**: Existing MCP server configurations continue to work exactly as before.
6. **Decoupled layers**: Layer 2 (third-party) does not know about Layer 1 (provider) capabilities. Route.ts coordinates.
7. **Extensible**: Adding a new tool provider requires minimal changes — create a provider file and register it.
8. **Auditable**: All tool calls (built-in, third-party, MCP) are logged to `toolCallLog` with source discrimination.
9. **No feature gate**: Tools work for all authenticated users without requiring `ENABLE_MCP=true`.

---

*Plan created February 11, 2026. Reviewed February 11, 2026. Based on research at `.agents/context/research/tool-calling-infrastructure.md` and codebase analysis.*
