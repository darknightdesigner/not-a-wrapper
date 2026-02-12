# Phase 7: Future Tool Integrations — Expanded Implementation Plan

> **Status**: Research Updated — Implementation Gates Identified
> **Reviewed**: February 12, 2026 — Decisions refreshed via codebase analysis, SDK source verification, npm package inspection, and provider docs
> **Priority**: P1 — High (builds on P0 foundation)
> **Parent Plan**: `.agents/plans/tool-calling-infrastructure.md` (Phase 7)
> **Prerequisites**: Phases 1–5 complete (tool abstraction, UI, Exa, audit logging, BYOK)
> **Date**: February 12, 2026

---

## How to Use This Plan

This plan expands the Phase 7 roadmap from the parent plan into actionable sub-phases. Unlike Phases 1–5 (which are sequential), Phase 7 sub-phases are **independently prioritizable** — each can be implemented in isolation based on user demand and product priorities.

Each sub-phase includes:

- **Context to load** — files to read before starting
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the sub-phase is complete
- **Open questions** — decisions that must be resolved before implementation

### Priority Tiers

| Tier | Sub-Phases | Rationale |
|------|-----------|-----------|
| **Tier 1 — High Impact, Low Effort** | 7.6, 7.3, 7.0 | Quick wins: cost reduction, safety, correctness |
| **Tier 2 — High Impact, Medium Effort** | 7.5, 7.4, 7.7 | New capabilities users will see |
| **Tier 3 — Infrastructure** | 7.1, 7.2 | Extensibility — implement when third provider is added |
| **Tier 4 — Exploratory** | 7.8, 7.9 | Verify-and-decide — may not be needed |

### Execution Gates (Must Confirm Before Tier 2 Work)

1. **Anthropic token-efficient behavior is measured in this repo** (7.6)  
   Do not assume old beta headers are required. Run before/after token measurements for Anthropic + tools in this app.
2. **Firecrawl package choice is finalized with BYOK as a hard requirement** (7.9)  
   `firecrawl-aisdk` exists on npm, but published build reads only `process.env.FIRECRAWL_API_KEY`. Use `@mendable/firecrawl-js` unless wrapper adds explicit key injection.
3. **Read-only tool classification exists before `prepareStep` restrictions** (7.4)  
   Name-based heuristics (e.g., `mcp_read_*`) are not sufficient in the current MCP naming model.
4. **Truncation contract preserves result shape** (7.3)  
   Truncation cannot arbitrarily convert arrays/objects into a generic wrapper that breaks downstream tool consumers.

---

## Sub-Phase 7.0: `ToolCapabilities` Type (Granular Control)

> **Effort**: S (< 1 day)
> **Files modified**: `lib/tools/types.ts`, `lib/models/types.ts`, `app/api/chat/route.ts`
> **Dependencies**: Phases 1–3 complete
> **Trigger**: Implement when adding code execution (7.5) or when a model needs per-capability opt-out

### Context to Load

```
@lib/tools/types.ts                   # Current ToolSource, ToolMetadata (line 31: deferred note)
@lib/models/types.ts                  # ModelConfig type (line 20: tools?: boolean)
@app/api/chat/route.ts                # shouldInjectSearch check pattern
@lib/models/data/                     # Per-provider model configs (check tools field usage)
```

### Current State

`ModelConfig.tools` is `boolean | undefined`:
- `tools: false` → model cannot use any tools (e.g., Perplexity models)
- `tools: undefined` (default) → model can use all tools

This is binary. When code execution is added, some models may support search but not code execution, or vice versa.

### Step 7.0.1: Add `ToolCapabilities` Interface

In `lib/tools/types.ts`, add below the existing `ToolMetadata` interface:

```typescript
/**
 * Granular per-capability control for model tool access.
 * Replaces the binary `tools?: boolean` in ModelConfig.
 *
 * All fields default to `true` when omitted — this preserves backward
 * compatibility with existing `tools: undefined` (all tools enabled).
 *
 * When `tools: false` is set on a ModelConfig, ALL capabilities are disabled.
 * When `tools: ToolCapabilities` is set, individual capabilities can be toggled.
 */
export interface ToolCapabilities {
  /** Web search (Layer 1 provider tools + Layer 2 Exa). Default: true */
  search?: boolean
  /** Code execution (provider sandboxes). Default: true */
  code?: boolean
  /** MCP server tools (Layer 3). Default: true */
  mcp?: boolean
}
```

### Step 7.0.2: Update `ModelConfig` Type

In `lib/models/types.ts`, widen the `tools` field:

```typescript
// BEFORE:
tools?: boolean

// AFTER:
tools?: boolean | ToolCapabilities
```

### Step 7.0.3: Add Capability Resolver Helper

In `lib/tools/types.ts`, add a resolver function:

```typescript
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
  // tools: false → everything disabled
  if (tools === false) return { search: false, code: false, mcp: false }
  // tools: true or undefined → everything enabled
  if (tools === true || tools === undefined) return { search: true, code: true, mcp: true }
  // tools: ToolCapabilities → merge with defaults
  return {
    search: tools.search !== false,
    code: tools.code !== false,
    mcp: tools.mcp !== false,
  }
}
```

### Step 7.0.4: Update `route.ts` Capability Checks

Replace the binary check pattern with the resolver:

```typescript
// BEFORE:
const shouldInjectSearch = enableSearch && modelConfig.tools !== false

// AFTER:
const capabilities = resolveToolCapabilities(modelConfig.tools)
const shouldInjectSearch = enableSearch && capabilities.search
// Future: capabilities.code, capabilities.mcp
```

### Verify 7.0

1. **Backward compat**: Models with `tools: undefined` still get all tools
2. **Binary compat**: Models with `tools: false` still get no tools
3. **Granular**: A model with `tools: { search: false, code: true }` gets code execution but no search
4. **Typecheck**: `bun run typecheck` — no errors from the widened type

### Open Questions

- [x] **Q7.0-A: Should `ToolCapabilities` be exposed in the client-side UI?** **Decision: No — server-side only.** The client already has `enableSearch` as a per-message toggle. `ToolCapabilities` represents what a model's API *can do* (capability), not what a user *wants* (preference). Per-model UI overrides would create confusing UX ("why can't I enable code for this model?"). Keep in `ModelConfig` only.

- [x] **Q7.0-B: Should `ToolCapabilities` include a `files` capability for future file upload tools?** **Decision: Defer.** YAGNI — no file-related tools exist yet. The interface is trivially extensible. File tools will likely need more nuance than a single boolean (image generation vs document analysis vs OCR), so speculating now risks the wrong abstraction.

- [x] **Q7.0-C: How should `ToolCapabilities` interact with BYOK?** **Decision: No BYOK override.** `ToolCapabilities` encodes what the model API supports at a protocol level. If a model can't handle tool calling, sending tools causes a runtime error regardless of keys. Keys unlock *access*, capabilities unlock *features* — they're orthogonal.

---

## Sub-Phase 7.1: ToolProvider Interface (Extensibility Pattern)

> **Effort**: M (1–2 days)
> **Files created**: `lib/tools/providers/exa.ts`, `lib/tools/providers/index.ts`
> **Files modified**: `lib/tools/types.ts`, `lib/tools/third-party.ts`
> **Dependencies**: Phase 3 complete
> **Trigger**: Implement when the **third** tool provider is added (Exa is first, second provider triggers planning, third triggers refactor)

### Context to Load

```
@lib/tools/types.ts                   # ToolMetadata, ToolSource
@lib/tools/third-party.ts            # Current monolithic Exa implementation
@lib/user-keys.ts                    # TOOL_PROVIDERS, getEffectiveToolKey
@app/api/chat/route.ts               # Tool loading and coordination
```

### Current State

`lib/tools/third-party.ts` is a single function with Exa hardcoded. This is fine for one provider. At two, it becomes a long if-chain. At three, it needs a registry.

### Step 7.1.1: Define `ToolProvider` Interface

In `lib/tools/types.ts`:

```typescript
/**
 * Interface for third-party tool providers.
 * Each provider is a separate file in lib/tools/providers/.
 * The registry in lib/tools/third-party.ts iterates over registered providers.
 */
export interface ToolProviderDefinition {
  /** Unique identifier (e.g., "exa", "firecrawl") — must match TOOL_PROVIDERS */
  id: string
  /** Human-readable name for UI display */
  displayName: string
  /** Tool categories this provider offers */
  categories: Array<"search" | "extract" | "code" | "image">
  /**
   * Check if this provider should load given the current configuration.
   * Return false to skip (e.g., no API key, capability already provided).
   */
  shouldLoad(config: ToolProviderConfig): boolean
  /**
   * Return the tools this provider offers.
   * Called only when shouldLoad() returns true.
   */
  getTools(config: ToolProviderConfig): Promise<{
    tools: ToolSet
    metadata: Map<string, ToolMetadata>
  }>
}

export interface ToolProviderConfig {
  /** Resolved API key for this provider (BYOK or platform) */
  apiKey?: string
  /** Capabilities to skip (already provided by Layer 1) */
  skipCapabilities: Set<string>
}
```

### Step 7.1.2: Extract Exa into `lib/tools/providers/exa.ts`

Move the Exa implementation from `third-party.ts` into a standalone provider file that implements `ToolProviderDefinition`.

### Step 7.1.3: Create Provider Registry

Create `lib/tools/providers/index.ts` that exports a registry array:

```typescript
import type { ToolProviderDefinition } from "../types"
import { exaProvider } from "./exa"
// import { firecrawlProvider } from "./firecrawl"  // when added

export const toolProviders: ToolProviderDefinition[] = [
  exaProvider,
  // firecrawlProvider,
]
```

### Step 7.1.4: Refactor `third-party.ts` to Use Registry

Replace the hardcoded Exa block with a loop over registered providers:

```typescript
export async function getThirdPartyTools(options: ThirdPartyToolOptions): Promise<...> {
  const tools: Record<string, unknown> = {}
  const metadata = new Map<string, ToolMetadata>()

  for (const provider of toolProviders) {
    const config: ToolProviderConfig = {
      apiKey: options.keys?.[provider.id],
      skipCapabilities: new Set(options.skipSearch ? ["search"] : []),
    }

    if (!provider.shouldLoad(config)) continue

    try {
      const result = await provider.getTools(config)
      Object.assign(tools, result.tools)
      for (const [key, meta] of result.metadata) metadata.set(key, meta)
    } catch (err) {
      console.error(`[tools/third-party] Failed to load ${provider.id}:`, err)
    }
  }

  return { tools: tools as ToolSet, metadata }
}
```

### Verify 7.1

1. **Exa still works**: All Phase 3 verification steps pass after refactor
2. **Adding a provider is mechanical**: Create one file implementing `ToolProviderDefinition`, add to registry, done
3. **Lint + typecheck**: `bun run lint && bun run typecheck`

### Open Questions

- [x] **Q7.1-A: Should the registry support async provider loading (lazy imports)?** **Decision: Yes — keep lazy `import()` inside `getTools()`.** The codebase already uses this pattern everywhere in `route.ts`. SDKs like `exa-js` and `@mendable/firecrawl-js` are 500KB+ — importing at module-load time would bloat cold starts on serverless. The registry metadata (id, displayName, categories) is static and cheap; heavy SDK imports stay inside `getTools()`.

- [x] **Q7.1-B: Should tool providers declare their BYOK key requirements?** **Decision: Yes — add `keyId: string` and `envVar: string` to `ToolProviderDefinition`.** Currently `TOOL_PROVIDERS` and `TOOL_ENV_MAP` in `lib/user-keys.ts` are manually maintained separately from the provider implementation. Derive `TOOL_PROVIDERS` and `TOOL_ENV_MAP` from the registry for a single source of truth. Eliminates bugs where a new provider is added to `third-party.ts` but forgotten in `user-keys.ts`.

- [x] **Q7.1-C: When exactly to trigger this refactor?** **Decision: Wait for the third provider (rule of three).** Two providers (Exa + Firecrawl) in a single function is a simple if-chain — perfectly readable. Refactoring at two risks designing an interface that doesn't fit the third provider. At three, there are enough data points for a good abstraction. Firecrawl can be added as a second block in `third-party.ts` without a registry. *(Disagrees with original recommendation.)*

- [x] **Q7.1-D: Should tool providers be able to register multiple tools?** **Decision: Yes — return a `ToolSet` per provider.** `getTools()` returning a `ToolSet` already handles this. Firecrawl naturally bundles `web_scrape` + `web_extract`. Individual tools from unrelated services are different providers.

---

## Sub-Phase 7.2: Adding New Third-Party Tool Providers

> **Effort**: S per provider (< 1 day each)
> **Dependencies**: Phase 3 complete; Phase 7.1 recommended but not required
> **Trigger**: User demand for specific tool capabilities

This is not a single implementation — it's a **repeatable checklist** for adding any new tool provider. The first candidate is Firecrawl.

### Checklist: Adding a New Tool Provider

When implementing, load the following context:

```
@lib/tools/third-party.ts            # Current tool loading (or providers/ if 7.1 is done)
@lib/tools/types.ts                  # ToolMetadata, ToolProviderDefinition
@lib/user-keys.ts                    # TOOL_PROVIDERS, getEffectiveToolKey
@app/components/chat/tool-invocation.tsx  # BUILTIN_TOOL_DISPLAY map
@.env.example                        # Environment variable documentation
```

#### Steps

1. **Verify package**: `npm info <package>` — confirm it exists, check version, check license
2. **Install SDK**: `bun add <package>` (requires user approval per AGENTS.md)
3. **Prefer explicit key support**: Use core SDKs that accept `apiKey` in constructors (like `exa-js`), not convenience wrappers that only read from `process.env` (like `@exalabs/ai-sdk`). This is critical for BYOK.
4. **Create provider file**: `lib/tools/providers/<name>.ts` implementing `ToolProviderDefinition` (or add to `third-party.ts` if 7.1 is not done)
5. **Register in TOOL_PROVIDERS**: Add the provider ID to `TOOL_PROVIDERS` in `lib/user-keys.ts`
6. **Add env var mapping**: Add to `TOOL_ENV_MAP` in `lib/user-keys.ts`
7. **Add display names**: Add tool names to `BUILTIN_TOOL_DISPLAY` in `tool-invocation.tsx`
8. **Update .env.example**: Document the new environment variable
9. **Update Settings UI**: Add the new tool key to the Tool Keys settings panel (Phase 5)
10. **Test**: Full verification cycle (with key, without key, BYOK, anonymous)

### Candidate: Firecrawl (Web Scraping / Extraction)

**What it adds**: JS-rendered page scraping, structured content extraction from URLs. Complements Exa's search-and-content by handling pages that require JavaScript rendering.

**Package options** (verify before implementing):
- `@mendable/firecrawl-js` — Official Firecrawl JS SDK
- `firecrawl-aisdk` — AI SDK integration (may not support explicit keys)

**Tool names**: `web_scrape` (full page), `web_extract` (structured extraction)

### Open Questions

- [x] **Q7.2-A: What is the priority order for new tool providers?** **Decision: Firecrawl → Provider code execution (7.5) → E2B → Jina.** Firecrawl complements Exa with JS-rendered page scraping. Provider code execution (7.5) comes before E2B since it requires zero new dependencies (built into provider APIs). E2B is a universal third-party sandbox for all models. Jina is a lightweight URL reader alternative. Defer BrowserBase — browser automation is complex and niche.

- [x] **Q7.2-B: Should there be a maximum number of third-party tools injected per request?** **Decision: Yes — combined cap `MAX_TOOLS_PER_REQUEST = 30` across all layers.** Each tool description is ~200-500 tokens. A combined cap across Layers 1+2+3 is simpler than per-layer caps. With 30 tools at ~300 tokens each, that's ~9K tokens — significant but manageable. `MCP_MAX_TOOLS_PER_REQUEST = 50` should be lowered to align. *(Modifies original recommendation from per-layer to combined cap.)*

- [x] **Q7.2-C: How should tool conflicts between providers be resolved?** **Decision: First-registered wins.** Tool names should be distinct by convention (Exa: `web_search`, Firecrawl: `web_scrape`). If both provide the same name, it's a naming bug — fix the name. Registry order is deterministic. Extend the existing dev-mode collision warning (route.ts line 301-307) to cover all layers.

- [x] **Q7.2-D: Should the "Tool Keys" settings UI show available tools even if no key is configured?** **Decision: Yes — show all with status.** Three states: "Active (platform key)", "Active (your key)", "Not configured — add key to enable". Standard SaaS settings UX. Drives discoverability without cluttering the main chat interface.

---

## Sub-Phase 7.3: `MAX_TOOL_RESULT_SIZE` Enforcement

> **Effort**: S (< 1 day)
> **Files modified**: `lib/tools/third-party.ts`, `app/api/chat/route.ts`
> **Dependencies**: Phase 3 complete
> **Priority**: Tier 1 — safety net for token cost control

### Context to Load

```
@lib/config.ts                        # MAX_TOOL_RESULT_SIZE = 100KB (line 195)
@lib/tools/third-party.ts            # Exa tool wrapper (execute function)
@app/api/chat/route.ts               # streamText() call and onStepFinish
```

### Current State

`MAX_TOOL_RESULT_SIZE` (100KB) is defined in `lib/config.ts:195` but **never enforced**. Third-party tools can return arbitrarily large results, consuming model context window and increasing token costs. The Exa tool wrapper manually caps at 2000 chars per result × 5 results = ~10KB, but this is implicit, not a centralized guard.

### Step 7.3.1: Create Truncation Utility

Create a shared truncation helper in `lib/tools/types.ts` (or a new `lib/tools/utils.ts`) that is byte-aware and shape-preserving:

```typescript
import { MAX_TOOL_RESULT_SIZE } from "@/lib/config"

/**
 * Truncate a tool result to MAX_TOOL_RESULT_SIZE.
 * Attempts to preserve valid JSON structure when truncating objects/arrays.
 *
 * Applied as a safety net AFTER the tool's own execute() returns.
 * Individual tools should still limit their own output, but this
 * catches edge cases (unexpected API responses, large MCP results).
 */
export function truncateToolResult(result: unknown): unknown {
  const serialized = safeJsonStringify(result)
  const sizeBytes = new TextEncoder().encode(serialized).length
  if (sizeBytes <= MAX_TOOL_RESULT_SIZE) return result

  // For strings, simple truncation with marker
  if (typeof result === "string") {
    return result.slice(0, MAX_TOOL_RESULT_SIZE) +
      "\n[truncated — result exceeded size limit]"
  }

  // Preserve top-level shape so existing renderers/parsers keep working.
  // Objects: add metadata fields without replacing object semantics.
  // Arrays: truncate item count, then append metadata in the tool response contract.
  return applyShapePreservingTruncation(result, MAX_TOOL_RESULT_SIZE)
}
```

### Step 7.3.2: Apply to Custom Tool Wrappers (Layer 2)

Wrap the `execute` return in `third-party.ts` (and future providers) with the truncation utility. This is the last line of defense — individual tools should still limit their output.

### Step 7.3.3: Apply to MCP Tool Results (Layer 3)

The MCP pipeline currently passes tool results directly to the model. Add truncation in the MCP tool result processing path (likely in `onStepFinish` or the MCP tool wrapper in `lib/mcp/`).

### Step 7.3.4: Add Monitoring

Log when truncation occurs so it can be tracked:

```typescript
if (serialized.length > MAX_TOOL_RESULT_SIZE) {
  console.warn(
    `[tools] Result from "${toolName}" truncated: ${serialized.length} → ${MAX_TOOL_RESULT_SIZE} bytes`
  )
}
```

### Verify 7.3

1. **Normal results pass through**: Exa search results (< 100KB) are not truncated
2. **Oversized results are capped**: Mock an MCP tool that returns > 100KB; verify truncation
3. **Audit log reflects truncation**: The `outputPreview` in `toolCallLog` should show truncated output
4. **Model still gets useful data**: Verify the model can work with truncated results (the `_truncated: true` marker helps the model understand the data is incomplete)

### Open Questions

- [x] **Q7.3-A: Should truncation be applied in the tool wrapper or in `onStepFinish`?** **Decision: Tool wrapper level.** This is fundamentally a *cost control* measure. If truncation happens in `onStepFinish`, the model has already consumed tokens processing the oversized result. Tool wrapper truncation prevents oversized data from entering `streamText()` entirely. The audit log in `onStepFinish` already uses `.slice(0, 500)` for preview — that's a separate concern.

- [x] **Q7.3-B: Should `MAX_TOOL_RESULT_SIZE` be configurable per tool?** **Decision: Yes — global default + per-tool override via `ToolMetadata`.** Add `maxResultSize?: number` to `ToolMetadata`. Recommended values: global default 100KB, code execution 500KB (`MAX_CODE_RESULT_SIZE`), content extraction 200KB. Truncation utility checks tool-specific first, falls back to global.

- [x] **Q7.3-C: How should the model be informed of truncation?** **Decision: Structured for objects, text marker for strings.** Use `{ _truncated: true, _originalSize: N, data: ... }` for structured data. Use `"\n[truncated — result exceeded size limit]"` for string data. Silent truncation (option c) is dangerous — the model may draw incorrect conclusions from incomplete data.

- [x] **Q7.3-D: Should Layer 1 (provider tools) be truncated?** **Decision: Do NOT truncate Layer 1.** Provider tools return results processed by the provider's own pipeline. Results include citation markers, structured references, and provider-specific formatting that truncation would corrupt. Provider APIs already enforce their own token limits. Only truncate Layer 2 (third-party) and Layer 3 (MCP) where result size is unbounded.

---

## Sub-Phase 7.4: `prepareStep` and `needsApproval` (AI SDK v6 Patterns)

> **Effort**: M–L (2–4 days)
> **Files modified**: `app/api/chat/route.ts`, `app/components/chat/` (client-side approval UI)
> **Dependencies**: Phase 1 complete; Phase 7.0 recommended
> **Priority**: Tier 2 — needed for safe code execution (7.5)

### Context to Load

```
@app/api/chat/route.ts               # streamText() call (tools, maxSteps)
@app/components/chat/use-chat-core.ts # Client-side chat hook (stream handling)
@app/components/chat/tool-invocation.tsx # Tool card rendering
```

### 7.4a: `prepareStep` for Dynamic Tool Restriction

`prepareStep` is an AI SDK v6 callback that runs before each step in a multi-step tool call chain. It can restrict which tools are available for subsequent steps.

**Use cases:**
- After the first step, restrict to only safe tools (prevent runaway tool chains)
- Limit code execution to the first step only
- Restrict expensive tools after a cost threshold

```typescript
// Example pattern for route.ts:
streamText({
  // ...
  prepareStep: async ({ stepNumber, previousSteps }) => {
    if (stepNumber > 3) {
      // After 3 steps, only allow safe read-only tools
      return { activeTools: ["web_search"] }
    }
    // Otherwise, all tools remain available
    return {}
  },
})
```

### 7.4b: `needsApproval` for Cost-Sensitive Tools

`needsApproval` pauses tool execution and sends an approval request to the client. The model continues only after the user approves.

**Use cases:**
- Code execution tools (safety concern)
- Deep search / premium search modes (cost concern)
- MCP tools that modify external state (create issue, send email)

### Step 7.4.1: Implement `prepareStep` in Route.ts

Add a `prepareStep` callback that restricts tools after a configurable number of steps. Start conservative:

```typescript
prepareStep: async ({ stepNumber }) => {
  // After MAX_UNRESTRICTED_STEPS, only allow read-only tools
  if (stepNumber > 3) {
    const readOnlyTools = Object.entries(allToolMetadata)
      .filter(([, meta]) => meta.readOnly === true)
      .map(([name]) => name)

    // Safety fallback: if metadata is unavailable, keep only known-safe defaults
    if (readOnlyTools.length === 0) {
      return { activeTools: ["web_search"] }
    }

    return { activeTools: readOnlyTools }
  }
  return {}
},
```

Add `readOnly?: boolean` and `capability?: "search" | "code" | "extract" | "mcp"` to `ToolMetadata`, then populate for all layers (including MCP) before turning on this policy.

### Step 7.4.2: Add Client-Side Approval UI

Create an approval component that renders when the stream receives a tool approval request. The component should show:
- Tool name and description
- Input parameters (formatted)
- Estimated cost (from `ToolMetadata.estimatedCostPer1k`)
- Approve / Deny buttons

### Step 7.4.3: Wire Approval into `use-chat-core.ts`

Handle the approval protocol in the chat hook. When the model requests approval, the stream pauses until the user responds.

### Verify 7.4

1. **prepareStep limits multi-step**: A query that triggers 5+ tool calls should see tools restricted after step 3
2. **Approval UI renders**: A tool with `needsApproval: true` shows the approval dialog
3. **Deny stops execution**: Denying a tool call stops the current step chain
4. **Approve continues**: Approving a tool call executes it and continues

### Open Questions

- [x] **Q7.4-A: What's the client-side UX for tool approval?** **Decision: Inline card in the message stream (option b).** The AI SDK v6 already defines tool states including `approval-requested` and `approval-responded`. An inline approval card fits naturally into the existing tool invocation card pattern in `tool-invocation.tsx`. Modals are too disruptive; toasts are too easy to miss for security-sensitive decisions. Preserves conversational context.

- [x] **Q7.4-B: How does approval interact with streaming?** **Decision: Resolved — AI SDK v6 has a well-defined protocol.** Tools with `needsApproval: true` go through these states: (1) `input-streaming` / `input-available`, (2) `approval-requested` (stream pauses, client shows approval UI), (3) `approval-responded` (client calls `addToolResult`), (4) `output-available` / `output-denied` / `output-error`. No custom protocol needed — follow the SDK's built-in states.

- [x] **Q7.4-C: Should approval be per-tool-type or per-invocation?** **Decision: Per-invocation for dangerous tools + per-session "always allow" for cost-sensitive tools.** Per-invocation for code execution and state-modifying MCP tools (each invocation could be different). Per-session "always allow for this chat" for premium search / content extraction (reduces friction in iterative workflows). Standard web search never needs approval. *(Modifies recommendation: "always allow" is per-session, not per-type.)*

- [x] **Q7.4-D: Which tools should require approval by default?** **Decision: Configure in `ToolMetadata`.** Add `requiresApproval?: boolean | ((input: unknown) => boolean)` to `ToolMetadata`. Defaults: search tools = `false`, content extraction = `false`, provider code execution = `true` on first invocation per chat then user may "Always allow in this chat", third-party code execution (E2B) = `true`, state-modifying MCP tools = `true`. The function form enables conditional approval (e.g., approve only if code snippet exceeds N chars).

- [x] **Q7.4-E: How does `prepareStep` interact with `ANONYMOUS_MAX_STEP_COUNT`?** **Decision: Step count limit is sufficient for anonymous users.** `stopWhen: stepCountIs(ANONYMOUS_MAX_STEP_COUNT)` already caps total steps. `prepareStep` restrictions are orthogonal — they restrict *which* tools per step, not *how many* steps total. Adding `prepareStep` restrictions for anonymous users would be belt-and-suspenders overkill.

- [x] **Q7.4-F: Does `prepareStep` work correctly with the AI SDK streaming response?** **Decision: Resolved — YES, fully confirmed.** From the AI SDK v6 `streamText` reference: `prepareStep` is a first-class documented parameter. `PrepareStepOptions` includes `{ steps, stepNumber, model, messages }`. `PrepareStepResult` includes `{ model?, toolChoice?, activeTools?, system?, messages?, providerOptions? }`. It runs server-side before each LLM call and works alongside `toUIMessageStreamResponse()`. No compatibility issues.

---

## Sub-Phase 7.5: Provider Code Execution

> **Effort**: M–L (3–5 days)
> **Files modified**: `lib/tools/provider.ts`, `app/components/chat/tool-invocation.tsx`
> **Dependencies**: Phase 1 complete; Phase 7.0 strongly recommended; Phase 7.4 recommended for safety
> **Priority**: Tier 2 — high user impact, new capability

### Context to Load

```
@lib/tools/provider.ts                # Provider tool resolution (Layer 1)
@lib/tools/types.ts                   # ToolMetadata, ToolCapabilities
@app/components/chat/tool-invocation.tsx # Tool card rendering
@lib/models/data/gemini.ts            # Google model configs (check code execution support)
@lib/models/data/claude.ts            # Anthropic model configs
```

### Current State

No code execution tools are currently integrated. The infrastructure from Phases 1–3 supports adding them as additional tools in `getProviderTools()`.

### Candidates

| Provider | Tool | SDK Export | Status |
|----------|------|-----------|--------|
| Google (Gemini) | Code execution sandbox | `google.tools.codeExecution({})` | Likely available — needs verification |
| Anthropic | Analysis tool (sandbox) | Unknown | Verify API and SDK support |
| OpenAI | Code Interpreter | Unknown SDK pattern | Verify AI SDK v6 support |

### Step 7.5.1: Verify Provider Code Execution APIs

Before implementation, verify each provider's code execution tool:

```bash
# Check Google code execution
npx tsx -e "import { createGoogleGenerativeAI } from '@ai-sdk/google'; const g = createGoogleGenerativeAI(); console.log(Object.keys(g.tools))"

# Check if Anthropic has analysis tools
npx tsx -e "import { createAnthropic } from '@ai-sdk/anthropic'; const a = createAnthropic(); console.log(Object.keys(a.tools))"
```

### Step 7.5.2: Add Code Execution to `provider.ts`

Extend the switch statement in `getProviderTools()` to include code execution tools when the model supports it:

```typescript
case "google": {
  // ... existing search tool ...
  if (capabilities.code) {
    tools.code_execution = googleProvider.tools.codeExecution({})
    metadata.set("code_execution", {
      displayName: "Code Execution",
      source: "builtin",
      serviceName: "Google",
      icon: "code",
    })
  }
  break
}
```

### Step 7.5.3: Build Code Output Renderer

Create a dedicated rendering component for code execution results in `tool-invocation.tsx`:
- Syntax-highlighted code input
- stdout / stderr blocks (split by stream)
- Generated files / images (if applicable)
- Execution time display

### Verify 7.5

1. **Google code execution**: Select a Gemini model, ask "Write and run Python code to calculate the first 20 Fibonacci numbers." Verify the model uses the code execution tool and results display correctly.
2. **Code + search**: Ask "Search for the current Bitcoin price and write Python code to calculate the daily percentage change." Verify both tools work in the same conversation.
3. **Non-code model**: A model with `tools: { search: true, code: false }` should get search but not code execution.

### Open Questions

- [x] **Q7.5-A: Which providers actually support code execution through the AI SDK?** **Decision: Resolved — three providers verified.**
  | Provider | Tool | Status | Mechanism |
  |----------|------|--------|-----------|
  | **Google (Gemini)** | Code execution sandbox | Available | `google.tools.codeExecution({})` — native tool, Gemini 2.5+ |
  | **Anthropic** | Code execution tool | Beta | Requires `code-execution-2025-08-25` header, `code_execution_20250825` tool type |
  | **OpenAI** | Code Interpreter | Available (Responses API) | `code_interpreter` type — may not surface via `@ai-sdk/openai` tools export |
  **Recommendation**: Start with Google (most mature, simplest). Add Anthropic when beta stabilizes. Defer OpenAI until `@ai-sdk/openai` cleanly exposes Code Interpreter as a tool.

- [x] **Q7.5-B: Should code execution require user approval (7.4b)?** **Decision: Yes — first invocation per chat requires approval, then allow opt-in bypass for that chat.** Provider sandboxes are isolated, but code execution is still high-impact for cost and user trust. Use a low-friction policy: first execution request in a chat requires approval; users can choose "Always allow for this chat" for subsequent invocations. Keep strict per-invocation approval for non-provider sandboxes (E2B) and state-modifying MCP tools.

- [x] **Q7.5-C: How should code execution output be rendered?** **Decision: Syntax-highlighted code blocks (option b).** Familiar to developers, reuses existing markdown rendering. Separate stdout/stderr sections with clear labels. Collapsible by default (same pattern as tool invocation cards). Upgrade to notebook-style (option c) later if demand warrants.

- [x] **Q7.5-D: What's the cost model for provider code execution?** **Decision: Resolved.**
  | Provider | Cost | `estimatedCostPer1k` |
  |----------|------|---------------------|
  | Google | Included in model token pricing | `0` |
  | Anthropic | Free during beta, likely usage-based at GA | TBD |
  | OpenAI | ~$0.03 per session | `30` |

- [x] **Q7.5-E: Should code execution results count toward `MAX_TOOL_RESULT_SIZE`?** **Decision: Separate, higher limit.** Add `MAX_CODE_RESULT_SIZE = 500KB` in `config.ts`. Code output (data tables, generated files) can be large — truncating to 100KB often makes it useless. The per-tool `maxResultSize` in `ToolMetadata` (from Q7.3-B) handles this cleanly by overriding the global default for code execution tools.

---

## Sub-Phase 7.6: Anthropic Token-Efficient Validation

> **Effort**: XS (< half day)
> **Files modified**: `app/api/chat/route.ts`
> **Dependencies**: Phase 1 complete
> **Priority**: Tier 1 — quick validation, may be a no-op

### Context to Load

```
@lib/config.ts                        # ANTHROPIC_BETA_HEADERS (line 170-177)
@app/api/chat/route.ts               # providerOptions block, streamText() call
```

### Current State

`ANTHROPIC_BETA_HEADERS.tokenEfficient` is defined in `lib/config.ts` but may be legacy. Anthropic has moved tool-efficiency capabilities forward (including newer advanced tool-use betas), and behavior may already be active depending on model/version. This phase is now measurement-first, not header-first.

### Step 7.6.1: Measure Current Anthropic Tool Token Usage

Run an A/B benchmark in this codebase using identical prompts with tools enabled:
- Baseline: current behavior (no new per-request beta header changes)
- Variant: add a request-scoped `headers["anthropic-beta"]` override
- Compare `usage.inputTokens` and total latency in `onFinish`

```typescript
if (provider === "anthropic" && Object.keys(allTools).length > 0 && enableAnthropicToolBeta) {
  headers = {
    ...headers,
    "anthropic-beta": "token-efficient-tools-2025-02-19",
  }
}
```

### Step 7.6.2: Keep Header Injection Request-Scoped

If a beta header is needed, pass it via `streamText({ headers })` so it only applies to Anthropic requests that actually include tools.

### Verify 7.6

1. **Measurement complete**: At least 20 comparable Anthropic tool runs per variant (same model family/prompt class)
2. **Decision threshold**: Keep custom header only if median input-token savings is materially positive (for example, >= 5%) with no reliability regression
3. **No regression**: Anthropic requests continue to work with and without tools
4. **Isolation**: Other providers are unaffected

### Open Questions

- [x] **Q7.6-A: Is `token-efficient-tools-2025-02-19` still the current beta header?** **Decision: Treat as untrusted legacy until measured.** Anthropic docs now emphasize newer tool-search/advanced tool-use betas; the old token-efficient header may be redundant for current Claude 4.x behavior. Keep this phase as a benchmark gate, not a guaranteed implementation.

- [x] **Q7.6-B: How does the `anthropic-beta` header interact with other beta headers?** **Decision: Comma-merge confirmed in current dependency.** Verified in installed `@ai-sdk/anthropic@3.0.41` source: user and inferred betas are unioned and emitted as comma-separated `anthropic-beta` (`getBetasFromHeaders` + `Array.from(betas).join(",")`). This previously reported overwrite bug is not present in the current pinned version.

- [x] **Q7.6-C: How does `@ai-sdk/anthropic` accept provider-specific headers?** **Decision: Use `streamText({ headers })` for request-scoped betas.** This is the cleanest way to attach headers only when needed (Anthropic + tools), without changing global provider construction.

- [x] **Q7.6-D: What's the actual token savings?** **Decision: Unknown in this app until benchmarked.** Public claims vary by tool count and prompt shape; production decision must be based on this repo's traffic profile and model mix.

---

## Sub-Phase 7.7: URL/Content Extraction

> **Effort**: S–M (1–2 days)
> **Files modified**: `lib/tools/third-party.ts` (or `lib/tools/providers/exa.ts` if 7.1 is done)
> **Dependencies**: Phase 3 complete
> **Priority**: Tier 2 — complements search with targeted extraction

### Context to Load

```
@lib/tools/third-party.ts            # Exa tool wrapper
@lib/tools/types.ts                  # ToolMetadata
@app/components/chat/tool-invocation.tsx # Tool card rendering
```

### Current State

Exa's `searchAndContents()` already returns page content (up to 2000 chars per result). For cases where a user shares a specific URL and wants the model to read it, a dedicated extraction tool is needed.

### Step 7.7.1: Add `content_extract` Tool via Exa

Exa's `getContents()` method fetches and extracts content from specific URLs. Add it as a second tool in the Exa provider:

```typescript
tools.content_extract = tool({
  description:
    "Extract the main text content from one or more web page URLs. " +
    "Use when the user provides specific URLs to read or analyze.",
  inputSchema: z.object({
    urls: z.array(z.string().url()).min(1).max(5)
      .describe("URLs to extract content from"),
  }),
  execute: async ({ urls }) => {
    const results = await exa.getContents(urls, {
      text: { maxCharacters: 5000 },
    })
    return results.results.map((r) => ({
      url: r.url,
      title: r.title ?? undefined,
      content: r.text?.slice(0, 5000),
    }))
  },
})
```

### Step 7.7.2: Add Display Info

In `tool-invocation.tsx`, add the new tool to `BUILTIN_TOOL_DISPLAY`:

```typescript
content_extract: { name: "Read Page", icon: "extract" },
```

### Verify 7.7

1. **URL extraction**: Ask "Read this article: https://example.com/article" — the model should use `content_extract`
2. **Multiple URLs**: Ask "Compare these two pages: [url1] and [url2]" — both should be extracted
3. **Search + extract**: Ask "Search for X and then read the top result in full" — model uses `web_search` then `content_extract`

### Open Questions

- [x] **Q7.7-A: Should `content_extract` use Exa or a dedicated extraction service (Firecrawl)?** **Decision: Start with Exa.** Zero new dependencies. `exa.getContents()` is a documented method. Most user-shared URLs are static pages (articles, docs, blog posts). JS-rendered SPAs are an edge case. Add Firecrawl for JS-rendered sites only if users report extraction failures.

- [x] **Q7.7-B: Should `content_extract` share the same API key as `web_search` (both Exa)?** **Decision: Yes — same key.** Both are Exa API calls. BYOK users expect unified billing for a single service. One key, one dashboard. Separating keys for the same service would be confusing.

- [x] **Q7.7-C: What's the cost model for `content_extract`?** **Decision: Resolved — cheaper than search.** From Exa pricing: `getContents()` costs **$1/1K pages**. This is cheaper than `searchAndContents()` ($5/1K search requests + $1/1K pages for content). Set `estimatedCostPer1k: 1` for the `content_extract` tool metadata.

- [x] **Q7.7-D: Should `content_extract` be limited to authenticated users?** **Decision: Allow for anonymous users.** At $1/1K pages with 25 extractions/day max (5 messages x 5 steps), worst case is $0.025/day per anonymous user. The daily message limit is the primary control. Platform key availability already gates it.

- [x] **Q7.7-E: Should the model automatically extract URLs that appear in user messages?** **Decision: No — let the model decide.** `toolChoice: "auto"` plus a clear tool description is sufficient. Proactive extraction would trigger on URLs in code snippets, reference links, and other unintended contexts. The model has better judgment about user intent than a URL regex.

---

## Sub-Phase 7.8: ~~Verify `gateway` Import Path~~ (Will Not Implement)

> **Effort**: XS (< 1 hour)
> **Dependencies**: None
> **Priority**: ~~Tier 4 — exploratory~~ **Closed** — Requires Vercel platform; conflicts with open-source/BYOK model

### Context to Load

```
@package.json                         # Check ai SDK version
```

### Task

The research document found two potential import paths for the AI SDK gateway:

```typescript
import { gateway } from "ai"
import { gateway } from "@ai-sdk/gateway"
```

The gateway provides `gateway.tools.perplexitySearch()` as an optional search fallback.

### Step 7.8.1: Verify Import

```bash
npx tsx -e "import { gateway } from 'ai'; console.log(typeof gateway)"
npx tsx -e "import { gateway } from '@ai-sdk/gateway'; console.log(typeof gateway)"
```

### Step 7.8.2: Check Tool Surface

If the import works:
```bash
npx tsx -e "import { gateway } from 'ai'; const g = gateway(); console.log(Object.keys(g.tools || {}))"
```

### Open Questions

- [x] **Q7.8-A: Is the gateway useful given Layer 1 + Layer 2 already cover all providers?** **Decision: Not needed — will not implement.** The gateway provides `gateway.tools.perplexitySearch()` at $5/1K requests. But Layer 2 Exa already covers the universal search fallback at $5/1K requests. The gateway requires Vercel AI Gateway (Vercel platform dependency), which conflicts with the project's open-source, self-hostable, BYOK-first philosophy. Close this sub-phase.

- [x] **Q7.8-B: Does the gateway require a separate API key or account?** **Decision: Resolved — yes, requires Vercel platform.** `@ai-sdk/gateway` requires Vercel AI Gateway, which is a Vercel platform feature (likely Pro tier). This disqualifies it for an open-source app that users self-host. **Sub-Phase 7.8 status: Will not implement.**

---

## Sub-Phase 7.9: Verify Firecrawl Package + BYOK Compatibility

> **Effort**: XS (< 1 hour)
> **Dependencies**: None
> **Priority**: Tier 4 — verification for Phase 7.2 Firecrawl integration

### Task

Determine which Firecrawl package should be used given the project's BYOK requirement.

### Step 7.9.1: Check Packages

```bash
npm info firecrawl-aisdk
npm info @mendable/firecrawl-js
npm info @firecrawl/firecrawl-aisdk
```

### Step 7.9.2: Check Key Passthrough

For whichever package exists, verify it supports explicit `apiKey` passthrough (critical for BYOK):

```bash
npx tsx -e "import { ... } from '<package>'; // check constructor accepts apiKey"
```

### Open Questions

- [x] **Q7.9-A: Does the Firecrawl AI SDK wrapper support explicit API key passthrough?** **Decision: Wrapper exists, but current build is not BYOK-compatible.** `firecrawl-aisdk` exists on npm (`0.8.1`), but published code initializes via `process.env.FIRECRAWL_API_KEY` and throws if missing. No explicit per-request key injection path was found in the published package.

- [x] **Q7.9-B: Is `@mendable/firecrawl-js` (core SDK) better than the AI SDK wrapper?** **Decision: Yes for this project, due to BYOK constraints.** `@mendable/firecrawl-js` supports explicit constructor keys and cleanly matches the existing Exa wrapper pattern. Use it unless `firecrawl-aisdk` adds explicit API key injection and stable maintenance signals.

---

## Cross-Cutting Open Questions

These questions span multiple sub-phases and should be resolved before starting any Tier 2 work.

### Error Handling Strategy

- [x] **Q-CC-A: Should tool execution errors be shown to the user or only to the model?** **Decision: Both places.** Tool card shows error with red indicator (visual feedback) + model also sees it and can explain (contextual explanation). Add an `error` visual state to `SingleToolCard` alongside the existing `loading` and `completed` states. This is what ChatGPT does — users expect it.

- [x] **Q-CC-B: Should tool execution have a global retry policy?** **Decision: No automatic retry.** Retries add latency (user waits longer). The model can self-heal by retrying in a new step. For MCP tools, retrying could trigger side effects on non-idempotent operations. Transient 429s are rare for Exa (generous rate limits). Keep it simple.

### Rate Limiting

- [x] **Q-CC-C: Should there be per-tool rate limiting separate from the message-level rate limit?** **Decision: Not initially.** `ANONYMOUS_MAX_STEP_COUNT = 5` and daily message limits (5 anonymous, 1000 authenticated) are sufficient. Monitor via `toolCallLog` and PostHog `tool_call` events first. Add per-user daily tool call limits only if abuse is observed in production.

- [x] **Q-CC-D: Should platform API key usage for tools (Exa, Firecrawl) be tracked per-user?** **Decision: Offline analysis only.** `toolCallLog` + PostHog `tool_call` events already capture all tool calls per user with `distinctId`. Don't query them in the hot path — adds latency to every request. Use offline analysis for cost attribution. If real-time limits are needed later, use an in-memory counter or Redis.

### Cost Transparency

- [x] **Q-CC-E: Should the UI show estimated tool cost before a message is sent?** **Decision: Settings panel only.** Per-message cost estimates are inaccurate (depends on whether the model actually uses tools) and would add clutter for a negligible cost ($0.005/search). Keep cost info in Settings > Tool Keys.

- [x] **Q-CC-F: Should the tool invocation card show actual cost (not just estimated)?** **Decision: Defer.** Requires querying provider billing APIs — complex with low user value. Estimates from `ToolMetadata.estimatedCostPer1k` are sufficient. Revisit if users request actual cost tracking.

### Testing Strategy

- [x] **Q-CC-G: Should tool integrations have automated tests?** **Decision: Yes, with prioritized targets.** Priority order: (1) `resolveToolCapabilities()` — pure function, zero mocking; (2) `truncateToolResult()` — pure function, zero mocking; (3) `getProviderTools()` — mock provider factories; (4) `getThirdPartyTools()` — mock Exa client; (5) integration tests with recorded API responses (later). Don't test actual Exa/Firecrawl APIs — mock them.

### `ModelConfig.apiSdk` Signature

- [x] **Q-CC-H: Should the `enableSearch` parameter be removed from the `apiSdk` type?** **Decision: Yes — clean up in Phase 7.0.** Current type: `apiSdk?: (apiKey?: string, opts?: { enableSearch?: boolean }) => LanguageModelV3`. Route.ts only calls `modelConfig.apiSdk(apiKey)` — the `opts` parameter is dead code since Phase 1 stopped passing `enableSearch`. Clean to `apiSdk?: (apiKey?: string) => LanguageModelV3`.

---

## File Change Summary

| Sub-Phase | New Files | Modified Files |
|-----------|-----------|----------------|
| 7.0 | — | `lib/tools/types.ts`, `lib/models/types.ts`, `app/api/chat/route.ts` |
| 7.1 | `lib/tools/providers/exa.ts`, `lib/tools/providers/index.ts` | `lib/tools/types.ts`, `lib/tools/third-party.ts` |
| 7.2 | `lib/tools/providers/<name>.ts` | `lib/user-keys.ts`, `tool-invocation.tsx`, `.env.example` |
| 7.3 | `lib/tools/utils.ts` (optional) | `lib/tools/third-party.ts`, `app/api/chat/route.ts` |
| 7.4 | Approval UI component | `app/api/chat/route.ts`, `use-chat-core.ts`, `tool-invocation.tsx` |
| 7.5 | Code output renderer | `lib/tools/provider.ts`, `tool-invocation.tsx` |
| 7.6 | — | `app/api/chat/route.ts` |
| 7.7 | — | `lib/tools/third-party.ts`, `tool-invocation.tsx` |
| 7.8 | — | (verification only) |
| 7.9 | — | (verification only) |

---

## Open Questions Index

Most questions are now resolved with evidence. Decisions below are working defaults; execution gates in 7.6/7.9 still require benchmark confirmation before rollout.

| ID | Sub-Phase | Summary | Decision | Modified? |
|----|-----------|---------|----------|-----------|
| Q7.0-A | 7.0 | Expose ToolCapabilities in client UI? | Server-side only | No |
| Q7.0-B | 7.0 | Add `files` capability? | Defer | No |
| Q7.0-C | 7.0 | ToolCapabilities vs BYOK override | No override | No |
| Q7.1-A | 7.1 | Async provider loading in registry | Keep lazy import() | No |
| Q7.1-B | 7.1 | Provider declares own key requirements | Yes — single source of truth | No |
| Q7.1-C | 7.1 | When to trigger registry refactor | **Wait for 3rd provider** | **Yes** |
| Q7.1-D | 7.1 | Multi-tool providers | ToolSet per provider | No |
| Q7.2-A | 7.2 | Provider priority order | Firecrawl → 7.5 → E2B → Jina | No |
| Q7.2-B | 7.2 | Max third-party tools per request | **Combined cap 30 (all layers)** | **Yes** |
| Q7.2-C | 7.2 | Tool name conflicts between providers | First-registered wins | No |
| Q7.2-D | 7.2 | Show unconfigured tools in settings | Yes — 3 states | No |
| Q7.3-A | 7.3 | Truncation at wrapper vs onStepFinish | Tool wrapper level | No |
| Q7.3-B | 7.3 | Per-tool size limits | Global + per-tool override | No |
| Q7.3-C | 7.3 | How to inform model of truncation | Structured / text marker | No |
| Q7.3-D | 7.3 | Truncate Layer 1 results? | Do NOT truncate | No |
| Q7.4-A | 7.4 | Approval UX (modal vs inline) | Inline card | No |
| Q7.4-B | 7.4 | Approval + streaming interaction | SDK-defined protocol | No |
| Q7.4-C | 7.4 | Per-type vs per-invocation approval | **Per-session "always allow"** | **Yes** |
| Q7.4-D | 7.4 | Which tools need approval | ToolMetadata config | No |
| Q7.4-E | 7.4 | prepareStep + anonymous step limits | Step count sufficient | No |
| Q7.4-F | 7.4 | prepareStep SDK compatibility | Confirmed — fully supported | No |
| Q7.5-A | 7.5 | Which providers support code execution | Google (ready), Anthropic (beta), OpenAI (deferred) | No |
| Q7.5-B | 7.5 | Code execution approval | First invocation approval + per-chat allow | **Yes** |
| Q7.5-C | 7.5 | Code output rendering style | Syntax-highlighted blocks | No |
| Q7.5-D | 7.5 | Code execution cost model | Google $0, Anthropic TBD, OpenAI $30/1K | No |
| Q7.5-E | 7.5 | Code results vs MAX_TOOL_RESULT_SIZE | Separate 500KB limit | No |
| Q7.6-A | 7.6 | Current beta header name | Treat as legacy until benchmarked | **Yes** |
| Q7.6-B | 7.6 | Multiple beta headers | Comma-separated; merge confirmed in installed SDK | **Yes** |
| Q7.6-C | 7.6 | How @ai-sdk/anthropic accepts headers | **Use `streamText({ headers })` not providerOptions** | **Yes** |
| Q7.6-D | 7.6 | Actual token savings | Unknown in this app until benchmarked | **Yes** |
| Q7.7-A | 7.7 | Exa vs Firecrawl for extraction | Start with Exa | No |
| Q7.7-B | 7.7 | Shared API key for search + extract | Same key | No |
| Q7.7-C | 7.7 | Content extraction cost model | $1/1K pages (cheaper than search) | No |
| Q7.7-D | 7.7 | Extraction for anonymous users | Allow | No |
| Q7.7-E | 7.7 | Auto-extract URLs in user messages | No — model decides | No |
| Q7.8-A | 7.8 | Is gateway useful? | **Will not implement** | No |
| Q7.8-B | 7.8 | Gateway pricing/access | Requires Vercel platform — disqualified | No |
| Q7.9-A | 7.9 | Firecrawl wrapper BYOK support | `firecrawl-aisdk` exists but env-var-only in published build | **Yes** |
| Q7.9-B | 7.9 | Core SDK vs AI SDK wrapper | Prefer `@mendable/firecrawl-js` for explicit BYOK keys | **Yes** |
| Q-CC-A | Cross | Tool error display in UI | Both places (card + model) | No |
| Q-CC-B | Cross | Automatic retry policy | No retry | No |
| Q-CC-C | Cross | Per-tool rate limiting | Not initially | No |
| Q-CC-D | Cross | Platform key usage tracking | Offline analysis only | No |
| Q-CC-E | Cross | Pre-send cost estimates in UI | Settings panel only | No |
| Q-CC-F | Cross | Actual cost in tool cards | Defer | No |
| Q-CC-G | Cross | Automated tests for tools | Yes — prioritized list | No |
| Q-CC-H | Cross | Clean up apiSdk type signature | Yes — in Phase 7.0 | No |

**Modified decisions** (10 total): Q7.1-C, Q7.2-B, Q7.4-C, Q7.5-B, Q7.6-A, Q7.6-B, Q7.6-C, Q7.9-A, Q7.9-B, plus execution-gate framing at plan level.

---

*Expanded from Phase 7 of `.agents/plans/tool-calling-infrastructure.md`. See parent plan for Phases 1–5 implementation details.*
