# Provider-Aware History Adaptation — Implementation Plan

> **Status**: Ready for Implementation
> **Priority**: P0 — Production replay errors affecting all non-Anthropic providers
> **Timeline**: ~6 engineering days (~47.5h), 2 weeks
> **Date**: February 13, 2026
> **Research**: `.agents/research/provider-aware-history-adaptation/provider-aware-history-adaptation.md`
> **Architecture**: Option A — Sanitize-on-Send with Per-Provider Adapters
> **AI SDK**: v6.0.78 (`ai`), v3.0.26 (`@ai-sdk/openai`), v3.0.41 (`@ai-sdk/anthropic`), v3.0.24 (`@ai-sdk/google`)
> **Triggered by**: Production bug — OpenAI Responses API rejected replayed history with orphaned `web_search_call` items

---

## Purpose

Replace the brittle binary `sanitizeMessagesForProvider()` function (Anthropic keeps all, everyone else strips everything) with per-provider history adapters that encode each provider's exact replay invariants. This preserves useful tool/reasoning context when possible while preventing replay-shape errors.

The current strip-all approach destroys tool context that models like GPT-5.2, Gemini, and Grok can actually leverage for better follow-up responses.

## How to Use This Plan

Each phase is self-contained with:

- **Context to load** — files an agent must read before starting
- **Provider-specific invariants** — the exact rules the adapter must enforce (embedded inline)
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete
- **Files touched** — exact list of creates/modifies
- **Output contract** — what downstream phases expect from this phase

**Multi-agent parallelization is the primary design goal.** Dependencies are explicitly documented per phase. Independent phases should be dispatched to separate agents simultaneously.

---

## Parallelization Map

```
Phase 0: Immediate Fix ─── standalone, deploy immediately
    │
Phase 1: Foundation (types + utilities + fixtures) ─── critical path
    │
    ├──── Phase 2A: OpenAI Adapter ──────────────────┐
    ├──── Phase 2B: Anthropic + Default Adapters ────┤  ← ALL PARALLEL
    ├──── Phase 2C: Google Adapter ──────────────────┤     (4 agents)
    └──── Phase 2D: OpenAI-Compatible + Text-Only ───┤
                                                      │
Phase 3: Registry & Entry Point ─────────────────────┘  ← sequential
    │
    ├──── Phase 4A: Contract Tests (per adapter) ────┐
    ├──── Phase 4B: Pipeline Smoke Tests ────────────┤  ← ALL PARALLEL
    └──── Phase 4C: Cross-Provider Matrix Tests ─────┤     (3 agents)
                                                      │
Phase 5: Route Integration + Feature Flag ───────────┘  ← sequential
    │
Phase 6: Observability & Error Detection ─── sequential
    │
Phase 7: Cleanup & Documentation ─── sequential (after production validation)
```

### Parallel Dispatch Summary

| Wave | Phases | Agents Needed | Wall-Clock Effort |
|------|--------|---------------|-------------------|
| Wave 1 | Phase 0 | 1 | 15 min |
| Wave 2 | Phase 1 | 1 | 4h |
| Wave 3 | Phases 2A, 2B, 2C, 2D | 4 (parallel) | 5h (longest: OpenAI or Google) |
| Wave 4 | Phase 3 | 1 | 1.5h |
| Wave 5 | Phases 4A, 4B, 4C | 3 (parallel) | 3h (longest: cross-provider matrix) |
| Wave 6 | Phase 5 | 1 | 3h |
| Wave 7 | Phase 6 | 1 | 4h |
| Wave 8 | Phase 7 | 1 | 2h |

**Critical path**: Phase 0 → Phase 1 → Phase 2A (OpenAI) → Phase 3 → Phase 4B (pipeline) → Phase 5

---

## Phase 0: Immediate Pre-Adapter Fix

> **Effort**: 15 minutes
> **Risk**: None — defensive option that filters incomplete tool states
> **Deploy**: Immediately, no feature flag needed
> **Parallelizable**: Standalone, independent of all other phases

### Context to Load

```
@app/api/chat/route.ts           # Line 373: convertToModelMessages() call — currently passes no options
```

### Problem

`convertToModelMessages()` at `route.ts:373` passes no options, defaulting `ignoreIncompleteToolCalls` to `false`. If a user aborts a stream and immediately sends a new message, incomplete tool parts (`state: "input-streaming"` or `state: "input-available"`) reach conversion and trigger `MissingToolResultsError`.

### Step 0.1: Add `ignoreIncompleteToolCalls` Option

In `app/api/chat/route.ts`, at line 373, change:

```typescript
// BEFORE
let modelMessages = await convertToModelMessages(sanitizedMessages)

// AFTER
let modelMessages = await convertToModelMessages(sanitizedMessages, {
  ignoreIncompleteToolCalls: true,
})
```

### Verify

```bash
bun run typecheck
bun run lint
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/route.ts` | Modify (1 line) |

---

## Phase 1: Foundation Types, Utilities, and Test Fixtures

> **Effort**: ~4h
> **Dependencies**: None (can start immediately after Phase 0 deploys)
> **Parallelizable**: No — this is the critical path. ALL Phase 2 agents depend on this output.

### Context to Load

```
@app/api/chat/utils.ts                    # Current sanitizeMessagesForProvider() — lines 78-116
@app/api/chat/route.ts                    # Integration point — lines 358-384
@app/api/chat/utils.test.ts               # Existing test patterns
@lib/tools/types.ts                       # ToolSource, ToolMetadata patterns (for convention reference)
```

### Key Design Decisions (All Adapters Must Follow)

1. **Adapters operate at Layer 1 (UIMessage level)** — before `convertToModelMessages()`. Parts-level granularity is available, and `callProviderMetadata` can be stripped before propagation.
2. **Adapters are pure functions** — no side effects, no network calls, idempotent.
3. **Adapters MUST NOT mutate input** — `readonly UIMessage[]` parameter enforces this.
4. **Adapters MUST drop non-final tool states** before applying provider-specific logic. Use shared `isToolPartFinal()`.
5. **Async signature** — though current impls are synchronous, async enables future model capability lookups. Zero cost since caller already awaits.

### Step 1.1: Create `app/api/chat/adapters/types.ts`

Define the complete adapter contract. This file is the **single source of truth** for all adapter implementations.

```typescript
// app/api/chat/adapters/types.ts

import type { UIMessage } from "ai"

/**
 * Context provided to adapters for informed adaptation decisions.
 * Populated by the caller (route.ts) from request-level information.
 */
export interface AdaptationContext {
  /** Target model ID (e.g., "gemini-3-pro", "gpt-5.2") */
  targetModelId: string
  /** Whether tools are being sent in this request */
  hasTools: boolean
  /**
   * Hint for the dominant source provider in this conversation.
   * Per-message source can be detected from callProviderMetadata.
   */
  sourceProviderHint?: string
  /**
   * Optional token budget for history messages.
   * Phase 5 — field defined now, implementation deferred until needed.
   */
  maxHistoryTokens?: number
}

/**
 * Structured warning emitted when an adapter degrades content.
 */
export interface AdaptationWarning {
  code:
    | "incomplete_triple_dropped"
    | "provider_ids_stripped"
    | "empty_message_fallback"
    | "non_final_state_dropped"
    | "role_alternation_repaired"
    | "thought_signature_injected"
  messageIndex: number
  detail: string
}

/**
 * Result of adaptation, including observability data.
 */
export interface AdaptationResult {
  messages: UIMessage[]
  stats: {
    originalMessageCount: number
    adaptedMessageCount: number
    droppedMessages: number
    partsDropped: Record<string, number>
    partsTransformed: Record<string, number>
    partsPreserved: Record<string, number>
    totalPartsOriginal: number
    totalPartsAdapted: number
    providerIdsStripped: number
  }
  warnings: AdaptationWarning[]
}

/**
 * Contract for provider-specific history adaptation.
 *
 * Adapters transform canonical UIMessage[] into a form that satisfies
 * the target provider's replay invariants. They operate on UIMessage[]
 * (before convertToModelMessages) to stay within the AI SDK's
 * conversion pipeline.
 *
 * ## Requirements
 * - Pure functions (no side effects, no network calls)
 * - Idempotent (applying twice produces the same result)
 * - MUST NOT mutate input messages (readonly parameter)
 * - MUST drop non-final tool states via isToolPartFinal() before provider logic
 *
 * ## Complexity Tiers
 * - Simple: Part filtering only (TextOnly, Default)
 * - Standard: Part filtering + pairing checks (Anthropic, OpenAICompatible)
 * - Complex: Block-level atomic triple enforcement (OpenAI)
 * - Structural: Post-transformation structural validation (Google)
 */
export interface ProviderHistoryAdapter {
  readonly providerId: string

  adaptMessages(
    messages: readonly UIMessage[],
    context: AdaptationContext,
  ): Promise<AdaptationResult>

  readonly metadata: {
    droppedPartTypes: ReadonlySet<string>
    transformedPartTypes: ReadonlySet<string>
    tier: "simple" | "standard" | "complex" | "structural"
    description: string
  }
}

export type AdapterRegistry = Map<string, ProviderHistoryAdapter>
```

### Step 1.2: Create Shared Utilities in `types.ts`

Add below the interfaces:

```typescript
// --- Shared utilities ---

/** Tool part states that are considered final (safe for replay) */
const FINAL_TOOL_STATES = new Set(["output-available", "output-error", "output-denied"])

/**
 * Check if a tool part has a final state (safe for replay).
 * Non-final states (input-streaming, input-available, approval-requested)
 * appear if abort/disconnect races with the next request.
 */
export function isToolPartFinal(part: { state?: string }): boolean {
  return part.state == null || FINAL_TOOL_STATES.has(part.state)
}

/** Check if a part is tool-related */
export function isToolPart(part: { type: string }): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool"
}

/**
 * Create an empty AdaptationResult stats object.
 * All adapters should use this as a starting point for stats accumulation.
 */
export function createEmptyStats(originalMessageCount: number, totalPartsOriginal: number) {
  return {
    originalMessageCount,
    adaptedMessageCount: 0,
    droppedMessages: 0,
    partsDropped: {} as Record<string, number>,
    partsTransformed: {} as Record<string, number>,
    partsPreserved: {} as Record<string, number>,
    totalPartsOriginal,
    totalPartsAdapted: 0,
    providerIdsStripped: 0,
  }
}

/** Increment a counter in a Record<string, number> */
export function incrementStat(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount
}

/**
 * Detect the source provider from callProviderMetadata on a tool part.
 * Returns the provider name key (e.g., "openai", "anthropic") or null.
 */
export function detectSourceProvider(part: { callProviderMetadata?: Record<string, unknown> }): string | null {
  if (!part.callProviderMetadata) return null
  const keys = Object.keys(part.callProviderMetadata)
  return keys.length > 0 ? keys[0] : null
}

/**
 * Strip callProviderMetadata from a tool part.
 * Returns a shallow copy of the part without the metadata.
 */
export function stripCallProviderMetadata<T extends { callProviderMetadata?: Record<string, unknown> }>(part: T): T {
  if (!part.callProviderMetadata) return part
  const { callProviderMetadata, ...rest } = part
  return rest as T
}
```

### Step 1.3: Create Test Fixtures `app/api/chat/adapters/__tests__/fixtures.ts`

Create realistic message fixtures covering the 10 shape categories from `cross-turn-tool-artifacts.md` §3:

1. **Text-only assistant message** — `parts: [{ type: "text", text: "Hello" }]`
2. **Reasoning + text** — `parts: [{ type: "reasoning", ... }, { type: "text", ... }]`
3. **Single SDK tool call (complete)** — `step-start → reasoning → tool-exa_search (output-available) → text`
4. **Single provider-executed tool** — `step-start → reasoning → tool-web_search (output-available, providerExecuted: true, callProviderMetadata: { openai: { ... } }) → text`
5. **Parallel tool calls** — `step-start → reasoning → tool-call-1 → tool-call-2 → text`
6. **Multi-step tool chain** — Multiple `step-start` blocks with interleaved tool usage
7. **Failed tool call** — `tool-exa_search` with `state: "output-error"`
8. **Incomplete (aborted) tool** — `tool-exa_search` with `state: "input-streaming"` (non-final)
9. **Cross-provider metadata** — Messages with `callProviderMetadata` from provider A being replayed to provider B
10. **Mixed provider+SDK tools** — Both `providerExecuted: true` and `false` in one message

Each fixture should be a complete `UIMessage` object with realistic `id`, `role`, and `parts` arrays.

Also create conversation-level fixtures:

- **Batman production bug** — exact shapes from the production incident (user asks about Batman, GPT-5.2 responds with web_search chains, follow-up fails)
- **Cross-provider conversation** — 4-message conversation alternating between Anthropic and OpenAI
- **Heavy tool-use conversation** — 10+ messages with tool usage in most turns

### Verify

```bash
bun run typecheck  # types.ts compiles
bun run lint       # No lint errors
# Fixtures import and instantiate without type errors
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/types.ts` | Create |
| `app/api/chat/adapters/__tests__/fixtures.ts` | Create |

### Output Contract

All Phase 2 agents import from `adapters/types.ts`:
- `ProviderHistoryAdapter`, `AdaptationResult`, `AdaptationContext`, `AdaptationWarning`
- `isToolPartFinal()`, `isToolPart()`, `createEmptyStats()`, `incrementStat()`
- `detectSourceProvider()`, `stripCallProviderMetadata()`

All Phase 4 agents import from `adapters/__tests__/fixtures.ts`:
- Named fixture exports for each shape category
- Conversation-level fixture exports

---

## Phase 2A: OpenAI Responses Adapter (Complex Tier)

> **Effort**: ~5h
> **Dependencies**: Phase 1 (types + fixtures)
> **Parallelizable**: YES — run simultaneously with Phases 2B, 2C, 2D
> **Tier**: Complex — block-level atomic triple enforcement

### Context to Load

```
@app/api/chat/adapters/types.ts                  # Adapter interface (from Phase 1)
@app/api/chat/utils.ts                           # Current sanitization — lines 78-116 (being replaced)
```

### OpenAI Responses API Replay Invariants (MUST ENFORCE)

These are the hard constraints the adapter must satisfy. Violation causes `400 invalid_request_error`.

1. **Reasoning→Item pairing (bidirectional)**:
   - A `reasoning` part MUST be immediately followed by its paired item (`tool-*` or `text`).
   - A tool call that was originally generated with reasoning MUST have its preceding `reasoning` present.
   - Error: `"Item 'web_search_call' at index N was provided without its required 'reasoning' item"`

2. **Function call→Output pairing**:
   - Every tool invocation must have a corresponding tool result with matching `toolCallId`.
   - Error: `"No tool output found for function call 'fc_...'"`

3. **Parallel call grouping**:
   - When multiple tool calls happen in one step: `[reasoning, call_1, call_2, ..., output_1, output_2, ...]`
   - Interleaving calls with outputs is rejected.

4. **Provider ID stripping**:
   - `callProviderMetadata` carries IDs like `msg_`, `rs_`, `ws_`, `fc_` that create cross-response linkage.
   - MUST strip ALL `callProviderMetadata` from tool parts when the part was generated by any provider (including OpenAI — IDs are session-specific).

5. **Text-only messages**: Plain text messages are always safe to replay.

### Decision Tree (Per Assistant Message)

```
For each assistant UIMessage in history:
├─ Group parts by step-start blocks (primary delimiter)
│  └─ If no step-start markers: use semantic fallback detection
│     (reasoning→tool transition = block boundary)
├─ For each block:
│  ├─ Text-only? → Keep as-is
│  ├─ Complete reasoning→tool→output triple? → Keep all, strip callProviderMetadata
│  ├─ Complete reasoning→text pair? → Keep both
│  ├─ Incomplete (missing any component)? → Drop entire block, emit warning
│  └─ Orphaned reasoning or tool? → Drop, emit warning
├─ Strip all callProviderMetadata on every tool part
└─ If all parts stripped → inject fallback text: { type: "text", text: "" }
```

### Step 2A.1: Create `app/api/chat/adapters/openai.ts`

Implement `OpenAIResponsesAdapter` following the decision tree above.

Key implementation details:

1. **Block splitting**: Parse parts array using `step-start` as primary delimiter. If no `step-start` found and message contains multiple tool operations, fall back to semantic detection (a `reasoning` part after a completed tool result implies a block boundary).

2. **Block completeness check**: For each block, verify the atomic triple pattern:
   - Has reasoning? Then must have a following tool call or text.
   - Has tool call? Then must have reasoning before it AND a matching tool result.
   - Has tool result? Then must have a matching tool call.
   - All components present → keep block, strip IDs.
   - Any component missing → drop entire block.

3. **Parallel call handling**: Multiple tool calls in one block share a single preceding reasoning. All calls must have results, or the entire block is dropped.

4. **Non-final state pre-filter**: Before block analysis, use `isToolPartFinal()` to drop any tool parts with states like `input-streaming`, `input-available`, `approval-requested`.

5. **`callProviderMetadata` stripping**: On every kept tool part, call `stripCallProviderMetadata()`.

6. **Stats tracking**: Use `createEmptyStats()` and `incrementStat()` for all counters.

7. **Metadata declaration**:
   ```typescript
   metadata: {
     droppedPartTypes: new Set(["step-start", "source-url", "source-document"]),
     transformedPartTypes: new Set(["tool-*", "reasoning"]),
     tier: "complex",
     description: "OpenAI Responses API — atomic reasoning→tool→result triple enforcement"
   }
   ```

### Verify

```bash
bun run typecheck
bun run lint
# Import and instantiate OpenAIResponsesAdapter — should compile
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/openai.ts` | Create |

### Output Contract

Exports `OpenAIResponsesAdapter` class/object implementing `ProviderHistoryAdapter`. Phase 3 registers it under `"openai"` in the adapter registry.

---

## Phase 2B: Anthropic + Default Adapters (Standard + Simple Tier)

> **Effort**: ~2h
> **Dependencies**: Phase 1 (types + fixtures)
> **Parallelizable**: YES — run simultaneously with Phases 2A, 2C, 2D

### Context to Load

```
@app/api/chat/adapters/types.ts                  # Adapter interface (from Phase 1)
@app/api/chat/utils.ts                           # Current sanitization — lines 78-116 (being replaced)
```

### Anthropic Replay Invariants

1. **Passthrough is correct**: The Anthropic API auto-strips thinking blocks from prior completed turns. The `@ai-sdk/anthropic` SDK handles tool-loop thinking internally during `streamText()`.
2. **Tool pairing required**: Every `tool_use` must have a `tool_result` — but this is enforced by `convertToModelMessages()`, not the adapter.
3. **Reasoning tolerance**: Cross-provider reasoning (no valid Anthropic signature) is tolerated — treated as new content, no error.
4. **Only strip `step-start`**: SDK artifact with no semantic meaning.
5. **Non-final state pre-filter**: Drop tool parts with non-final states.

### Default Adapter Behavior (Fallback for Unknown Providers)

Implements the current `sanitizeMessagesForProvider()` strip-all behavior:
- Strip `reasoning`, `step-start`, `source-url`, `source-document`, all `tool-*`, `dynamic-tool`
- Keep `text`, `file`, `data-*`
- Inject fallback text `{ type: "text", text: "" }` if all parts stripped

### Step 2B.1: Create `app/api/chat/adapters/anthropic.ts`

Implement `AnthropicAdapter`:

1. **Pre-filter non-final tool states** via `isToolPartFinal()`.
2. **Strip `step-start` parts** (SDK artifact, no semantic meaning).
3. **Preserve everything else** — reasoning, tool-*, text, source-url, file, data-*.
4. **Defensive validation**: If a tool invocation lacks a matching result, emit a warning (don't error — Anthropic API will enforce this downstream). Use `AdaptationWarning` with code `"incomplete_triple_dropped"`.
5. **Strip `callProviderMetadata`** only when source provider differs from `"anthropic"` (same-provider can preserve).

Metadata:
```typescript
metadata: {
  droppedPartTypes: new Set(["step-start"]),
  transformedPartTypes: new Set([]),
  tier: "standard",
  description: "Anthropic near-passthrough — API auto-manages thinking lifecycle"
}
```

### Step 2B.2: Create `app/api/chat/adapters/default.ts`

Implement `DefaultAdapter`:

1. **Strip all non-text content from assistant messages**: Drop `reasoning`, `step-start`, `source-url`, `source-document`, all `tool-*`, `dynamic-tool`.
2. **Keep**: `text`, `file`, `data-*`.
3. **Inject fallback** if all parts stripped.
4. **Filter out `role: "tool"` messages** entirely.
5. **Strip all `callProviderMetadata`**.

Metadata:
```typescript
metadata: {
  droppedPartTypes: new Set(["reasoning", "step-start", "source-url", "source-document", "tool-*", "dynamic-tool"]),
  transformedPartTypes: new Set([]),
  tier: "simple",
  description: "Conservative fallback — strip all non-text content (current behavior)"
}
```

### Verify

```bash
bun run typecheck
bun run lint
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/anthropic.ts` | Create |
| `app/api/chat/adapters/default.ts` | Create |

### Output Contract

Exports `AnthropicAdapter` and `DefaultAdapter`. Phase 3 registers `AnthropicAdapter` under `"anthropic"` and `DefaultAdapter` as the fallback.

---

## Phase 2C: Google Gemini Adapter (Structural Tier)

> **Effort**: ~4.5h
> **Dependencies**: Phase 1 (types + fixtures)
> **Parallelizable**: YES — run simultaneously with Phases 2A, 2B, 2D
> **Tier**: Structural — requires post-transformation structural validation

### Context to Load

```
@app/api/chat/adapters/types.ts                  # Adapter interface (from Phase 1)
@app/api/chat/utils.ts                           # Current sanitization — lines 78-116 (being replaced)
```

### Google Gemini Replay Invariants (MUST ENFORCE)

These are hard constraints. Violation causes `400 INVALID_ARGUMENT`.

1. **FC/FR count parity**: Number of `functionResponse` parts MUST exactly equal number of `functionCall` parts in the preceding model turn. The adapter must ensure that after filtering, every tool invocation has a matching result.

2. **Turn ordering**: Function call turns must come immediately after user/FR turn. Function response turns must come immediately after function call turn.

3. **Strict role alternation**: Consecutive turns with the same role are REJECTED. Even after filtering parts, if an assistant message becomes empty and sits between two user messages, it creates consecutive user roles → 400 error. The adapter MUST validate role alternation after filtering and either merge consecutive same-role messages or inject an empty assistant placeholder.

4. **Gemini 3 thought signatures**: Function call parts in the current turn (last assistant message before the new user message) MUST include `thoughtSignature`. For cross-provider replay (tool calls generated by OpenAI/Anthropic replayed to Gemini 3), inject the dummy value `"skip_thought_signature_validator"` into `providerMetadata.google.thoughtSignature`.

5. **Prior-turn thought signatures NOT validated**: Only the active FC loop's signatures are checked. Historical signatures can be missing.

6. **Reasoning preserved as native thoughts**: `@ai-sdk/google` converts `reasoning` parts to `{ text, thought: true }` automatically. This is a quality improvement — keep reasoning parts for Google (they become native Gemini thoughts).

### Step 2C.1: Create `app/api/chat/adapters/google.ts`

Implement `GoogleAdapter` with TWO passes:

**Pass 1 — Part-level filtering** (same pattern as other adapters):
1. Pre-filter non-final tool states via `isToolPartFinal()`.
2. **Keep** `reasoning` parts (they become native Gemini thoughts — quality improvement).
3. **Keep** complete tool pairs (invocation + result with matching `toolCallId`).
4. **Drop** orphaned tool invocations (no matching result) and orphaned tool results.
5. **Drop** `step-start` parts.
6. **Strip** `callProviderMetadata` when source differs from `"google"`.

**Pass 2 — Structural validation** (unique to Google):
1. **FC/FR parity check**: Count tool invocations vs results in each assistant message. If imbalanced, drop the unpaired ones.
2. **Role alternation check**: Iterate the resulting message array. If two consecutive messages have the same role:
   - If both are `user`: merge their text content.
   - If both are `assistant`: merge their parts.
   - If an assistant message is empty after filtering: inject `{ type: "text", text: "" }` placeholder.
3. **Gemini 3 thought signature injection**: For the LAST assistant message in the history (the one preceding the current user turn), check if any tool invocation parts lack `providerMetadata.google.thoughtSignature`. If `context.targetModelId` starts with `"gemini-3"`, inject the dummy signature.

Metadata:
```typescript
metadata: {
  droppedPartTypes: new Set(["step-start", "source-url", "source-document"]),
  transformedPartTypes: new Set(["tool-*", "reasoning"]),
  tier: "structural",
  description: "Google Gemini — strict FC/FR parity, role alternation, thought signatures"
}
```

### Verify

```bash
bun run typecheck
bun run lint
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/google.ts` | Create |

### Output Contract

Exports `GoogleAdapter`. Phase 3 registers it under `"google"`.

---

## Phase 2D: OpenAI-Compatible + Text-Only Adapters (Standard + Simple Tier)

> **Effort**: ~2.5h
> **Dependencies**: Phase 1 (types + fixtures)
> **Parallelizable**: YES — run simultaneously with Phases 2A, 2B, 2C

### Context to Load

```
@app/api/chat/adapters/types.ts                  # Adapter interface (from Phase 1)
@app/api/chat/utils.ts                           # Current sanitization — lines 78-116 (being replaced)
```

### xAI (Grok) Replay Rules

- **Reasoning**: Not required for replay (output-only in Chat Completions format). Drop all.
- **Tool pairing**: OpenAI-compatible — `tool_calls` + `tool` role with `tool_call_id` pairing.
- **Constraints**: `presencePenalty`/`frequencyPenalty`/`stop` rejected on reasoning models (handled by provider SDK, not adapter).

### Mistral Replay Rules

- **Reasoning**: Not required (Magistral `thinking` chunks are output artifacts). Drop all.
- **Tool pairing**: `tool_calls` + `tool` role. BOTH `tool_call_id` AND `name` are required on tool results.
- **Parallel and successive calling**: Supported.

### Perplexity Replay Rules

- **No user-defined tools**: Sonar API only.
- **No reasoning**: `reasoning_steps` are search pipeline artifacts, not model reasoning.
- **Clean text-only replay**: Strip everything except text parts.

### Step 2D.1: Create `app/api/chat/adapters/openai-compatible.ts`

Implement `OpenAICompatibleAdapter` (shared for xAI + Mistral):

1. Pre-filter non-final tool states.
2. **Drop** all `reasoning` parts.
3. **Drop** `step-start`, `source-url`, `source-document`.
4. **Keep** complete tool pairs (invocation + result with matching `toolCallId`). Drop orphans.
5. **Strip** all `callProviderMetadata`.
6. **Ensure `name` field on tool results** — Mistral requires this. If a tool result part lacks a `name` field, attempt to derive it from the matching tool invocation's `toolName`. If not derivable, drop the pair.
7. **Inject fallback** if all parts stripped.

Metadata:
```typescript
metadata: {
  droppedPartTypes: new Set(["reasoning", "step-start", "source-url", "source-document"]),
  transformedPartTypes: new Set(["tool-*"]),
  tier: "standard",
  description: "OpenAI-compatible format — shared for xAI + Mistral"
}
```

### Step 2D.2: Create `app/api/chat/adapters/text-only.ts`

Implement `TextOnlyAdapter` (Perplexity + future text-only providers):

1. **Keep** only `text` parts from all messages.
2. **Drop** everything else: `reasoning`, `step-start`, `tool-*`, `dynamic-tool`, `source-url`, `source-document`, `file`.
3. **Filter out `role: "tool"` messages** entirely.
4. **Inject fallback** if all parts stripped.
5. **Strip** all `callProviderMetadata`.

Metadata:
```typescript
metadata: {
  droppedPartTypes: new Set(["reasoning", "step-start", "tool-*", "dynamic-tool", "source-url", "source-document", "file"]),
  transformedPartTypes: new Set([]),
  tier: "simple",
  description: "Text-only providers — strip everything except text"
}
```

### Verify

```bash
bun run typecheck
bun run lint
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/openai-compatible.ts` | Create |
| `app/api/chat/adapters/text-only.ts` | Create |

### Output Contract

Exports `OpenAICompatibleAdapter` and `TextOnlyAdapter`. Phase 3 registers `OpenAICompatibleAdapter` under both `"xai"` and `"mistral"`, and `TextOnlyAdapter` under `"perplexity"`.

---

## Phase 3: Adapter Registry and Entry Point

> **Effort**: ~1.5h
> **Dependencies**: Phase 1 + ALL Phase 2 adapters (2A, 2B, 2C, 2D)
> **Parallelizable**: No — must wait for all adapters to exist

### Context to Load

```
@app/api/chat/adapters/types.ts             # Adapter interface + utilities
@app/api/chat/adapters/openai.ts            # OpenAI adapter (from Phase 2A)
@app/api/chat/adapters/anthropic.ts         # Anthropic adapter (from Phase 2B)
@app/api/chat/adapters/default.ts           # Default adapter (from Phase 2B)
@app/api/chat/adapters/google.ts            # Google adapter (from Phase 2C)
@app/api/chat/adapters/openai-compatible.ts # xAI/Mistral adapter (from Phase 2D)
@app/api/chat/adapters/text-only.ts         # Perplexity adapter (from Phase 2D)
@lib/openproviders/provider-map.ts          # Existing provider routing (for convention reference)
```

### Step 3.1: Create `app/api/chat/adapters/index.ts`

Build the registry and entry point:

```typescript
// Provider-to-adapter mapping
const registry: AdapterRegistry = new Map()

// Register all adapters
registry.set("openai", openaiAdapter)
registry.set("anthropic", anthropicAdapter)
registry.set("google", googleAdapter)
registry.set("xai", openaiCompatibleAdapter)
registry.set("mistral", openaiCompatibleAdapter)    // Shared instance with xAI
registry.set("perplexity", textOnlyAdapter)
```

### Step 3.2: Add OpenRouter Provider Detection

```typescript
const KNOWN_UNDERLYING_PROVIDERS = ["anthropic", "openai", "google", "xai", "mistral"] as const

function extractUnderlyingProvider(modelId: string): string | null {
  const prefix = modelId.split("/")[0]
  return KNOWN_UNDERLYING_PROVIDERS.includes(prefix as any) ? prefix : null
}
```

### Step 3.3: Implement `adaptHistoryForProvider()` Entry Point

```typescript
export async function adaptHistoryForProvider(
  messages: readonly UIMessage[],
  providerId: string,
  context: AdaptationContext,
): Promise<AdaptationResult> {
  let adapter: ProviderHistoryAdapter

  if (providerId === "openrouter") {
    const underlying = extractUnderlyingProvider(context.targetModelId)
    adapter = (underlying ? registry.get(underlying) : null) ?? defaultAdapter
  } else {
    adapter = registry.get(providerId) ?? defaultAdapter
  }

  return adapter.adaptMessages(messages, context)
}
```

### Verify

```bash
bun run typecheck
bun run lint
# Verify all adapters are registered (check map size = 6 provider entries)
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/index.ts` | Create |

### Output Contract

Exports `adaptHistoryForProvider()` — the single entry point that Phase 5 (route integration) will call. Also exports the `registry` for testing purposes.

---

## Phase 4A: Contract Tests (Per Adapter)

> **Effort**: ~3h
> **Dependencies**: Phase 1 (fixtures) + Phase 2 (all adapters) + Phase 3 (registry)
> **Parallelizable**: YES — can split across agents per adapter. Can also run alongside Phases 4B and 4C.

### Context to Load

```
@app/api/chat/adapters/__tests__/fixtures.ts     # Test fixtures (from Phase 1)
@app/api/chat/adapters/openai.ts                 # OpenAI adapter
@app/api/chat/adapters/anthropic.ts              # Anthropic adapter
@app/api/chat/adapters/default.ts                # Default adapter
@app/api/chat/adapters/google.ts                 # Google adapter
@app/api/chat/adapters/openai-compatible.ts      # xAI/Mistral adapter
@app/api/chat/adapters/text-only.ts              # Text-only adapter
@app/api/chat/utils.test.ts                      # Existing test patterns (Vitest)
```

### Sub-Parallelization

These test files can each be written by a separate agent:

| Test File | Adapter | Key Cases | Effort |
|-----------|---------|-----------|--------|
| `openai.test.ts` | OpenAI | 12 cases: atomic triples, parallel calls, `callProviderMetadata`, `providerExecuted`, non-final states, block detection fallback, Batman regression | 1.5h |
| `anthropic.test.ts` | Anthropic | 5 cases: passthrough verification, step-start stripping, cross-provider reasoning tolerance, defensive tool pairing warning | 0.5h |
| `google.test.ts` | Google | 8 cases: FC/FR parity, role alternation repair, thought signature injection (Gemini 3 vs 2.5), reasoning preservation | 1h |
| `openai-compatible.test.ts` | xAI/Mistral | 5 cases: reasoning drop, tool pair keep, orphan drop, name field ensure, cross-provider metadata | 0.5h |
| `text-only.test.ts` | TextOnly | 3 cases: text extraction, all-non-text fallback, tool message filtering | 0.25h |
| `default.test.ts` | Default | 3 cases: strip-all behavior matches current sanitize function, fallback text injection | 0.25h |

### Contract Test Pattern (All Files Follow This)

```typescript
import { describe, it, expect } from "vitest"
import { SomeAdapter } from "../some-adapter"
import { fixtures } from "./fixtures"

const adapter = new SomeAdapter()  // or however it's exported
const defaultContext = {
  targetModelId: "some-model-id",
  hasTools: true,
}

describe("SomeAdapter", () => {
  it("preserves text-only messages unchanged", async () => {
    const result = await adapter.adaptMessages([fixtures.textOnlyAssistant], defaultContext)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].parts).toEqual(fixtures.textOnlyAssistant.parts)
  })

  it("handles specific invariant...", async () => {
    // ... test specific provider invariant
  })

  it("tracks stats correctly", async () => {
    const result = await adapter.adaptMessages([fixtures.someMessage], defaultContext)
    expect(result.stats.partsDropped).toMatchObject({ reasoning: 1 })
    expect(result.stats.providerIdsStripped).toBe(2)
  })
})
```

### Batman Regression Test (in `openai.test.ts`)

Must reproduce the exact production bug scenario:

```typescript
it("prevents Batman production bug — orphaned web_search_call", async () => {
  // Turn 2: GPT-5.2 response with reasoning → web_search_call chains
  // The adapter should either keep complete triples or drop the whole block
  const result = await adapter.adaptMessages(
    [fixtures.batmanUserMessage, fixtures.batmanAssistantWithWebSearch, fixtures.batmanFollowUpUser],
    { targetModelId: "gpt-5.2", hasTools: true }
  )

  // Verify: no orphaned web_search_call parts without preceding reasoning
  for (const msg of result.messages) {
    if (msg.role !== "assistant") continue
    const parts = msg.parts
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type.startsWith("tool-") && parts[i].type !== "tool-result") {
        // If a tool call exists, either reasoning precedes it or the block is complete
        // The adapter should never produce an orphaned tool call
      }
    }
  }
})
```

### Verify

```bash
bun run test -- adapters/__tests__/openai.test.ts
bun run test -- adapters/__tests__/anthropic.test.ts
bun run test -- adapters/__tests__/google.test.ts
bun run test -- adapters/__tests__/openai-compatible.test.ts
bun run test -- adapters/__tests__/text-only.test.ts
bun run test -- adapters/__tests__/default.test.ts
# All tests pass
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/__tests__/openai.test.ts` | Create |
| `app/api/chat/adapters/__tests__/anthropic.test.ts` | Create |
| `app/api/chat/adapters/__tests__/google.test.ts` | Create |
| `app/api/chat/adapters/__tests__/openai-compatible.test.ts` | Create |
| `app/api/chat/adapters/__tests__/text-only.test.ts` | Create |
| `app/api/chat/adapters/__tests__/default.test.ts` | Create |

---

## Phase 4B: Pipeline Smoke Tests

> **Effort**: ~3h
> **Dependencies**: Phase 1 (fixtures) + Phase 3 (registry)
> **Parallelizable**: YES — run simultaneously with Phases 4A and 4C

### Context to Load

```
@app/api/chat/adapters/__tests__/fixtures.ts     # Test fixtures
@app/api/chat/adapters/index.ts                  # Registry + adaptHistoryForProvider()
@app/api/chat/utils.ts                           # hasProviderLinkedResponseIds() — lines 118-132
```

### Rationale

Contract tests validate adapters in isolation. The production Batman bug would have **passed** contract tests — the adapter would have correctly kept `web_search_call` parts, and the test would confirm "tool parts preserved." The failure was downstream, in `convertToModelMessages()` passing through `callProviderMetadata` IDs that OpenAI rejected.

Pipeline tests close this gap by passing adapter output through `convertToModelMessages()` and validating the resulting `ModelMessage[]` structure **without making API calls**.

### Step 4B.1: Create `app/api/chat/adapters/__tests__/pipeline.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { convertToModelMessages } from "ai"
import { adaptHistoryForProvider } from "../index"
import { hasProviderLinkedResponseIds } from "../../utils"
import * as fixtures from "./fixtures"

// Helper: assert every tool-call content has a corresponding tool-result
function assertToolCallsHaveResults(messages: ModelMessage[]) { /* ... */ }

// Helper: assert no empty content arrays
function assertNoEmptyContent(messages: ModelMessage[]) { /* ... */ }

const providers = ["openai", "anthropic", "google", "xai", "mistral", "perplexity"] as const

for (const provider of providers) {
  describe(`${provider} adapter → convertToModelMessages pipeline`, () => {
    it("produces valid ModelMessages after conversion", async () => {
      const context = { targetModelId: `test-${provider}-model`, hasTools: true }
      const adapted = await adaptHistoryForProvider(fixtures.multiStepToolConversation, provider, context)
      const modelMessages = await convertToModelMessages(adapted.messages, {
        ignoreIncompleteToolCalls: true,
      })

      expect(hasProviderLinkedResponseIds(modelMessages)).toBe(false)
      assertToolCallsHaveResults(modelMessages)
      assertNoEmptyContent(modelMessages)
    })

    it("handles cross-provider history without provider ID leakage", async () => {
      const context = { targetModelId: `test-${provider}-model`, hasTools: true }
      const adapted = await adaptHistoryForProvider(fixtures.crossProviderConversation, provider, context)
      const modelMessages = await convertToModelMessages(adapted.messages, {
        ignoreIncompleteToolCalls: true,
      })

      expect(hasProviderLinkedResponseIds(modelMessages)).toBe(false)
    })

    it("handles aborted/incomplete tool states gracefully", async () => {
      const context = { targetModelId: `test-${provider}-model`, hasTools: true }
      const adapted = await adaptHistoryForProvider(fixtures.abortedToolConversation, provider, context)
      const modelMessages = await convertToModelMessages(adapted.messages, {
        ignoreIncompleteToolCalls: true,
      })

      assertNoEmptyContent(modelMessages)
    })
  })
}
```

### Test Categories

1. **Structural validity**: Every adapter's output, after conversion, produces well-formed `ModelMessage[]`
2. **Provider ID hygiene**: No `msg_`/`rs_`/`ws_`/`fc_` IDs survive the adapter→conversion pipeline for cross-provider cases
3. **Tool pairing completeness**: Every tool-call content part has a corresponding tool-result
4. **Non-empty content**: No `ModelMessage[]` with empty content arrays

### Verify

```bash
bun run test -- adapters/__tests__/pipeline.test.ts
# All pipeline tests pass for all 6 providers
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/__tests__/pipeline.test.ts` | Create |

---

## Phase 4C: Cross-Provider Matrix Tests

> **Effort**: ~3h
> **Dependencies**: Phase 1 (fixtures) + Phase 3 (registry)
> **Parallelizable**: YES — run simultaneously with Phases 4A and 4B

### Context to Load

```
@app/api/chat/adapters/__tests__/fixtures.ts     # Test fixtures
@app/api/chat/adapters/index.ts                  # Registry + adaptHistoryForProvider()
```

### Test Matrix Reference

```
                     ┌──────────────────── Target Provider ────────────────────┐
                     │  Anthropic  │  OpenAI  │  Google    │  xAI  │  Mistral  │  Perplexity
Source Provider      │             │          │            │       │           │
─────────────────────┼─────────────┼──────────┼────────────┼───────┼───────────┼────────────
Anthropic            │  pass-thru  │  strip R │  keep R    │ strip │  strip R  │  text-only
OpenAI               │  keep all   │  pair RT │  pair RT   │ pair T│  pair T   │  text-only
Google               │  keep all   │  strip R │  pass-thru │ strip │  strip R  │  text-only
xAI                  │  keep all   │  strip R │  keep R    │ pass  │  strip R  │  text-only
Mistral              │  keep all   │  strip R │  keep R    │ strip │  pass     │  text-only

R = reasoning parts, T = tool pairs, RT = reasoning-tool atomic triples
```

### Step 4C.1: Create `app/api/chat/adapters/__tests__/cross-provider.test.ts`

Test 12 scenarios per matrix cell:

1. Text-only history
2. History with reasoning
3. History with tool calls
4. History with reasoning + tool chains
5. History with mixed sources
6. Long history (50+ messages)
7. Provider-executed vs SDK-executed tools
8. Parallel tool calls in single step
9. Failed tool calls (`output-error`)
10. `callProviderMetadata` stripping
11. Gemini 3 thought signature injection
12. Role alternation validation (Google)

Focus on **key cells** (highest real-world traffic):
- OpenAI → Anthropic (most common switch)
- Anthropic → OpenAI (most common switch)
- OpenAI → OpenAI (same-provider continuation)
- Anthropic → Google (cross-provider with reasoning preservation)
- OpenRouter → * (underlying provider detection)

Also include **OpenRouter routing cases**:
```typescript
it("routes openrouter/anthropic/* to AnthropicAdapter", async () => {
  const result = await adaptHistoryForProvider(
    fixtures.textOnlyConversation,
    "openrouter",
    { targetModelId: "anthropic/claude-4-opus", hasTools: true }
  )
  // Should behave like Anthropic adapter (preserve reasoning)
})

it("routes openrouter/unknown-org/* to DefaultAdapter", async () => {
  const result = await adaptHistoryForProvider(
    fixtures.textOnlyConversation,
    "openrouter",
    { targetModelId: "meta-llama/llama-4-maverick", hasTools: true }
  )
  // Should behave like Default adapter (strip all)
})
```

### Verify

```bash
bun run test -- adapters/__tests__/cross-provider.test.ts
# All matrix tests pass
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/adapters/__tests__/cross-provider.test.ts` | Create |

---

## Phase 5: Route Integration with Feature Flag

> **Effort**: ~3h
> **Dependencies**: Phase 3 (registry) + Phase 4 (all tests passing)
> **Parallelizable**: No — modifies the critical path in `route.ts`

### Context to Load

```
@app/api/chat/route.ts                           # Lines 358-384: current sanitization + conversion
@app/api/chat/adapters/index.ts                  # adaptHistoryForProvider() entry point
@app/api/chat/utils.ts                           # sanitizeMessagesForProvider() — kept as fallback
```

### Three-State Feature Flag

`HISTORY_ADAPTER_V2` environment variable with three states:

| Value | Behavior |
|-------|----------|
| `"false"` (default) | Legacy `sanitizeMessagesForProvider()` path |
| `"shadow"` | Legacy path + adapter runs in parallel; differences logged |
| `"true"` | Adapter path replaces legacy |

### Step 5.1: Modify `app/api/chat/route.ts`

Replace lines 358-384 with the three-state integration:

```typescript
import { adaptHistoryForProvider, type AdaptationContext } from "./adapters"

// ... inside POST handler, after provider resolution ...

const adapterFlag = process.env.HISTORY_ADAPTER_V2 ?? "false"

const adaptationContext: AdaptationContext = {
  targetModelId: model,
  hasTools: hasAnyTools,
  sourceProviderHint: provider,
}

let modelMessages: ModelMessage[]

if (adapterFlag === "shadow") {
  // Shadow mode: run both paths, log differences, use legacy output
  const legacyResult = sanitizeMessagesForProvider(messages, provider)
  const adapterResult = await adaptHistoryForProvider(messages, provider, adaptationContext)

  // Log differences for observability
  const legacyPartCount = legacyResult.reduce((sum, m) => sum + (m.parts?.length ?? 0), 0)
  const adapterPartCount = adapterResult.messages.reduce((sum, m) => sum + (m.parts?.length ?? 0), 0)

  if (legacyPartCount !== adapterPartCount || legacyResult.length !== adapterResult.messages.length) {
    console.log(JSON.stringify({
      _tag: "adapter_shadow_diff",
      chatId,
      provider,
      model,
      legacyMessageCount: legacyResult.length,
      adapterMessageCount: adapterResult.messages.length,
      legacyPartCount,
      adapterPartCount,
      adapterWarnings: adapterResult.warnings,
    }))
  }

  modelMessages = await convertToModelMessages(legacyResult, {
    ignoreIncompleteToolCalls: true,
  })
} else if (adapterFlag === "true") {
  // Adapter mode: use new adapters
  const adapterResult = await adaptHistoryForProvider(messages, provider, adaptationContext)

  // Structured logging for observability
  console.log(JSON.stringify({
    _tag: "history_adapt",
    chatId,
    provider,
    model,
    ...adapterResult.stats,
    warningCount: adapterResult.warnings.length,
  }))

  modelMessages = await convertToModelMessages(adapterResult.messages, {
    ignoreIncompleteToolCalls: true,
  })
} else {
  // Legacy mode: current sanitizeMessagesForProvider() behavior
  const sanitizedMessages = sanitizeMessagesForProvider(messages, provider)

  if (process.env.NODE_ENV !== "production" && provider !== "anthropic") {
    const originalMsgIdCount = messages.filter((m) => m.id.startsWith("msg_")).length
    const sanitizedMsgIdCount = sanitizedMessages.filter((m) => m.id.startsWith("msg_")).length
    if (originalMsgIdCount > 0 || sanitizedMsgIdCount > 0) {
      console.log(
        `[chat] sanitized history for ${provider}: msg_* ids ${originalMsgIdCount} -> ${sanitizedMsgIdCount}, ` +
        `messages ${messages.length} -> ${sanitizedMessages.length}`
      )
    }
  }

  modelMessages = await convertToModelMessages(sanitizedMessages, {
    ignoreIncompleteToolCalls: true,
  })
}

// Keep existing post-conversion safety net (defense-in-depth)
if (provider === "openai" && hasProviderLinkedResponseIds(modelMessages)) {
  console.warn(
    "[chat] OpenAI replay fallback activated: provider-linked response IDs detected after conversion."
  )
  modelMessages = toPlainTextModelMessages(
    adapterFlag === "true"
      ? (await adaptHistoryForProvider(messages, provider, adaptationContext)).messages
      : sanitizeMessagesForProvider(messages, provider)
  )
}
```

### Step 5.2: Add Feature Flag to Environment

Add to `.env.example` (do NOT modify `.env` or `.env.local`):

```bash
# History adapter v2 feature flag: "false" (legacy), "shadow" (compare), "true" (new adapters)
# HISTORY_ADAPTER_V2=false
```

### Verify

```bash
bun run typecheck
bun run lint
bun run test  # All existing + new tests pass
# Manual testing:
#   1. Set HISTORY_ADAPTER_V2=shadow, send messages with OpenAI model, check logs for adapter_shadow_diff
#   2. Set HISTORY_ADAPTER_V2=true, send messages with OpenAI model, verify no replay errors
#   3. Test provider switching (Anthropic → OpenAI → Google)
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/route.ts` | Modify (lines 358-384 replaced) |
| `.env.example` | Modify (add HISTORY_ADAPTER_V2 documentation) |

---

## Phase 6: Observability and Error Detection

> **Effort**: ~4h
> **Dependencies**: Phase 5 (route integration)
> **Parallelizable**: No — modifies `route.ts` error handler and observability pipeline

### Context to Load

```
@app/api/chat/route.ts                    # streamText error handler, PostHog integration
@app/api/chat/utils.ts                    # extractErrorMessage(), handleStreamError()
@lib/posthog.ts                           # PostHog client patterns
```

### Step 6.1: Add `replay_shape_error` Detection

In `route.ts`, enhance the `streamText` `onError` handler to detect replay-shape errors:

```typescript
function isReplayShapeError(message: string): boolean {
  const patterns = [
    // OpenAI
    /was provided without its required/i,
    /No tool output found for function call/i,
    /invalid input message/i,
    // Anthropic
    /thinking block must be followed by/i,
    /tool_use block must be followed by tool_result/i,
    // Google
    /number of function response parts is equal to/i,
    /function call turns come immediately after/i,
    /function response turn comes immediately after/i,
    /missing a thought_signature/i,
  ]
  return patterns.some(p => p.test(message))
}
```

When a replay-shape error is detected, log:

```typescript
console.error(JSON.stringify({
  _tag: "replay_shape_error",
  chatId,
  provider,
  model,
  errorMessage: msg,
  messageCount: messages.length,
  historyPartTypes: messages.map(m => m.parts.map(p => p.type)),
  adapterFlag: process.env.HISTORY_ADAPTER_V2 ?? "false",
}))
```

### Step 6.2: Add PostHog Events for Adaptation Metrics

Capture key adaptation events for analytics:

```typescript
// In the adapter path (HISTORY_ADAPTER_V2 === "true")
if (phClient) {
  phClient.capture({
    distinctId: userId || "anonymous",
    event: "history_adaptation",
    properties: {
      provider,
      model,
      originalMessageCount: adapterResult.stats.originalMessageCount,
      adaptedMessageCount: adapterResult.stats.adaptedMessageCount,
      partsDroppedTotal: Object.values(adapterResult.stats.partsDropped).reduce((a, b) => a + b, 0),
      partsPreservedTotal: Object.values(adapterResult.stats.partsPreserved).reduce((a, b) => a + b, 0),
      providerIdsStripped: adapterResult.stats.providerIdsStripped,
      warningCount: adapterResult.warnings.length,
      hasCrossProviderHistory: adapterResult.stats.providerIdsStripped > 0,
    },
  })
}
```

### Step 6.3: Add Structured Logging Enhancement

Ensure the `history_adapt` log event (already added in Phase 5) includes the full stats structure matching Section 5.1 of the research:

```typescript
console.log(JSON.stringify({
  _tag: "history_adapt",
  chatId,
  provider,
  model,
  ...adapterResult.stats,
  warnings: adapterResult.warnings.map(w => ({ code: w.code, detail: w.detail })),
  adaptationTimeMs: Date.now() - adaptStartTime,
}))
```

### Verify

```bash
bun run typecheck
bun run lint
# Manual testing:
#   1. Trigger a replay-shape error intentionally (send malformed history to OpenAI)
#   2. Verify replay_shape_error log appears with correct structure
#   3. Verify history_adapt log appears on every request with HISTORY_ADAPTER_V2=true
#   4. Check PostHog for history_adaptation events
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/route.ts` | Modify (error handler, PostHog events) |

---

## Phase 7: Cleanup and Documentation

> **Effort**: ~2h
> **Dependencies**: Production validation (24-48h with `HISTORY_ADAPTER_V2=true`, zero replay errors)
> **Parallelizable**: No — final cleanup step

### Context to Load

```
@app/api/chat/route.ts                    # Feature flag code to remove
@app/api/chat/utils.ts                    # sanitizeMessagesForProvider() to deprecate/remove
@AGENTS.md                                # Gold standard examples to update
@.agents/context/glossary.md              # Terminology to add
```

### Step 7.1: Remove Feature Flag

1. Remove `HISTORY_ADAPTER_V2` branching from `route.ts` — keep only the adapter path.
2. Remove shadow-mode comparison code.
3. Remove `HISTORY_ADAPTER_V2` from `.env.example`.

### Step 7.2: Remove Legacy Sanitization

1. Remove `sanitizeMessagesForProvider()` from `utils.ts` (or mark as `@deprecated` with removal timeline).
2. Remove the import from `route.ts`.
3. Keep `hasProviderLinkedResponseIds()` and `toPlainTextModelMessages()` as defense-in-depth.

### Step 7.3: Update Documentation

1. **`AGENTS.md`**: Add adapter pattern to Gold Standard Examples table.
2. **`.agents/context/glossary.md`**: Add entries for `ProviderHistoryAdapter`, `AdaptationContext`, `AdaptationResult`.
3. **Create ADR**: `.agents/research/provider-aware-history-adaptation/provider-aware-history-adaptation.md` documenting the Option A decision and why Options B/C were rejected.
4. **Update `app/api/CLAUDE.md`**: Add adapters to the file structure and describe the adapter pattern.

### Verify

```bash
bun run typecheck
bun run lint
bun run test  # All tests still pass
bun run build # Production build succeeds
```

### Files Touched

| File | Action |
|------|--------|
| `app/api/chat/route.ts` | Modify (remove feature flag) |
| `app/api/chat/utils.ts` | Modify (remove/deprecate sanitizeMessagesForProvider) |
| `.env.example` | Modify (remove HISTORY_ADAPTER_V2) |
| `AGENTS.md` | Modify (add adapter pattern) |
| `.agents/context/glossary.md` | Modify (add adapter terms) |
| `.agents/research/provider-aware-history-adaptation/provider-aware-history-adaptation.md` | Create |
| `app/api/CLAUDE.md` | Modify (add adapter docs) |

---

## Complete File Manifest

### New Files (13)

| File | Phase | Tier |
|------|-------|------|
| `app/api/chat/adapters/types.ts` | Phase 1 | Foundation |
| `app/api/chat/adapters/__tests__/fixtures.ts` | Phase 1 | Foundation |
| `app/api/chat/adapters/openai.ts` | Phase 2A | Complex |
| `app/api/chat/adapters/anthropic.ts` | Phase 2B | Standard |
| `app/api/chat/adapters/default.ts` | Phase 2B | Simple |
| `app/api/chat/adapters/google.ts` | Phase 2C | Structural |
| `app/api/chat/adapters/openai-compatible.ts` | Phase 2D | Standard |
| `app/api/chat/adapters/text-only.ts` | Phase 2D | Simple |
| `app/api/chat/adapters/index.ts` | Phase 3 | Registry |
| `app/api/chat/adapters/__tests__/openai.test.ts` | Phase 4A | Test |
| `app/api/chat/adapters/__tests__/anthropic.test.ts` | Phase 4A | Test |
| `app/api/chat/adapters/__tests__/google.test.ts` | Phase 4A | Test |
| `app/api/chat/adapters/__tests__/openai-compatible.test.ts` | Phase 4A | Test |
| `app/api/chat/adapters/__tests__/text-only.test.ts` | Phase 4A | Test |
| `app/api/chat/adapters/__tests__/default.test.ts` | Phase 4A | Test |
| `app/api/chat/adapters/__tests__/pipeline.test.ts` | Phase 4B | Test |
| `app/api/chat/adapters/__tests__/cross-provider.test.ts` | Phase 4C | Test |
| `.agents/research/provider-aware-history-adaptation/provider-aware-history-adaptation.md` | Phase 7 | Docs |

### Modified Files (4)

| File | Phases |
|------|--------|
| `app/api/chat/route.ts` | Phase 0, Phase 5, Phase 6, Phase 7 |
| `app/api/chat/utils.ts` | Phase 7 (deprecate/remove) |
| `.env.example` | Phase 5, Phase 7 |
| `AGENTS.md` | Phase 7 |
| `.agents/context/glossary.md` | Phase 7 |
| `app/api/CLAUDE.md` | Phase 7 |

---

## Provider-to-Adapter Quick Reference

| Provider ID | Adapter File | Adapter Name | Tier | Key Behavior |
|------------|-------------|-------------|------|-------------|
| `openai` | `openai.ts` | `OpenAIResponsesAdapter` | Complex | Atomic reasoning→tool→result triples |
| `anthropic` | `anthropic.ts` | `AnthropicAdapter` | Standard | Near-passthrough, strip step-start |
| `google` | `google.ts` | `GoogleAdapter` | Structural | FC/FR parity, role alternation, thought signatures |
| `xai` | `openai-compatible.ts` | `OpenAICompatibleAdapter` | Standard | Drop reasoning, keep tool pairs |
| `mistral` | `openai-compatible.ts` | `OpenAICompatibleAdapter` | Standard | Drop reasoning, keep tool pairs + name field |
| `perplexity` | `text-only.ts` | `TextOnlyAdapter` | Simple | Text-only, strip everything else |
| `openrouter` | *(dynamic)* | *(resolved at runtime)* | — | Parse model ID → underlying provider adapter |
| *(unknown)* | `default.ts` | `DefaultAdapter` | Simple | Current strip-all behavior |

---

## Effort Summary

| Phase | Effort | Sequential? | Notes |
|-------|--------|-------------|-------|
| Phase 0 | 0.25h | Yes | Deploy immediately |
| Phase 1 | 4h | Yes (critical path) | Foundation for everything |
| Phases 2A-2D | 5h wall-clock | **4 agents parallel** | 14h total, 5h wall-clock |
| Phase 3 | 1.5h | Yes | Needs all adapters |
| Phases 4A-4C | 3h wall-clock | **3 agents parallel** | 9h total, 3h wall-clock |
| Phase 5 | 3h | Yes | Route integration |
| Phase 6 | 4h | Yes | Observability |
| Phase 7 | 2h | Yes | After production validation |
| **Total effort** | **~47.5h** | | **~6 eng-days** |
| **Wall-clock (parallel)** | **~22.75h** | | **~2.8 eng-days** |

---

## Rollback Strategy

At every phase, rollback is simple:

- **Phase 0**: Revert the 1-line `ignoreIncompleteToolCalls` change (low risk, unlikely needed).
- **Phases 1-4**: No production impact — adapters are not wired in yet.
- **Phase 5**: Set `HISTORY_ADAPTER_V2=false` → instant revert to legacy path. Zero deployment needed (env var change).
- **Phase 6**: Observability code is additive — no rollback needed.
- **Phase 7**: Only executed after 48h of zero errors in production.

---

## Research References

For deep-dive context on any provider's invariants, load the corresponding research document:

| Provider | Research Document |
|----------|------------------|
| OpenAI | `.agents/research/provider-aware-history-adaptation/openai-replay-invariants.md` |
| Anthropic | `.agents/research/provider-aware-history-adaptation/anthropic-replay-invariants.md` |
| Google | `.agents/research/provider-aware-history-adaptation/google-replay-invariants.md` |
| xAI/Mistral/Perplexity | `.agents/research/provider-aware-history-adaptation/xai-mistral-perplexity-replay-invariants.md` |
| AI SDK conversion | `.agents/research/provider-aware-history-adaptation/ai-sdk-convert-messages.md` |
| Tool artifacts | `.agents/research/provider-aware-history-adaptation/cross-turn-tool-artifacts.md` |
| Open-source survey | `.agents/research/provider-aware-history-adaptation/open-source-patterns.md` |
| Parent plan | `.agents/research/provider-aware-history-adaptation/provider-aware-history-adaptation.md` |
