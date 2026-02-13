# Provider-Aware History Adaptation — Research Plan

> **Date**: February 13, 2026
> **Status**: ✅ Research Complete — Interface Validated (ready for implementation)
> **Scope**: Architecture for robust cross-provider message history replay
> **Related**: `app/api/chat/utils.ts` (current sanitization), `app/api/chat/route.ts` (chat route), ADR-002 (Vercel AI SDK)
> **Triggered by**: Production bug — OpenAI Responses API rejected replayed history with orphaned `web_search_call` items missing required `reasoning` pairs

---

## Executive Summary

1. **Root cause confirmed**: Our canonical history stores all AI SDK `UIMessage` parts (reasoning, tool invocations, step markers, sources). When replayed to a different provider — or even the same provider on a follow-up turn — provider-specific invariants about part ordering and pairing are violated.

2. **Current fix is brittle**: `sanitizeMessagesForProvider()` uses a binary Anthropic-vs-everyone-else filter. It strips *all* tool/reasoning parts for non-Anthropic providers, which destroys tool-use context that models like GPT-5.2 and Gemini can actually leverage.

3. **The problem is structural**: Provider APIs enforce different replay contracts — Anthropic requires reasoning + tool pairs for continuity; OpenAI Responses API requires reasoning items to precede their paired tool items; Google Gemini is permissive but penalizes missing tool results.

4. **Three architecture options identified**: (A) sanitize-on-send with per-provider adapters, (B) dual-track storage (canonical + provider-replay views), (C) provider-specific transcript builders with a shared AST.

5. **Recommended approach**: Option A (sanitize-on-send) with provider adapter contracts — lowest migration cost, highest correctness per provider, testable via contract tests.

6. **Key insight**: "Canonical history" and "provider replay input" are fundamentally different concerns. Canonical history is for UI rendering, observability, and persistence. Provider replay input must satisfy strict per-provider invariants.

7. **Tool-call artifacts need special treatment**: They exist as cross-turn state (tool call in turn N, result in turn N+1). Stripping them entirely loses context; keeping them verbatim violates invariants. Per-provider transformation is required.

8. **Validation is the highest-leverage investment**: Contract tests per provider will catch replay regressions before production, and the test matrix is enumerable.

9. **Observability gaps exist**: We have no structured logging for replay-shape mutations, no metrics on how often sanitization fires, and no alerting on provider rejection patterns.

10. **Rollout can be phased**: Start with OpenAI adapter (highest incident rate), then extend to other providers, with feature flags and A/B comparison of old vs new sanitization.

---

## 1. Problem Framing

### 1.1 What Is "Provider-Aware History Adaptation"?

The process of transforming a **canonical conversation history** (stored in our database as `UIMessage[]` with rich `parts` arrays) into a **provider-compatible input sequence** (`ModelMessage[]`) that satisfies the target provider's API invariants for message replay.

This is distinct from:
- **Message serialization**: Converting between wire formats (JSON ↔ protobuf)
- **Message rendering**: Converting parts to UI components
- **Message storage**: Persisting to Convex DB

### 1.2 User-Visible State vs Provider-Internal Artifacts

| Category | Examples | Stored? | Replayed? | Displayed? |
|----------|----------|---------|-----------|------------|
| **User-visible content** | Text responses, file attachments | Yes | Yes (always) | Yes |
| **User-visible tool UX** | Tool call name/status, search results, citations | Yes | Depends on provider | Yes |
| **Provider execution artifacts** | Reasoning traces, step markers, internal tool orchestration | Yes | Provider-specific | Conditionally |
| **Ephemeral metadata** | Stream chunk boundaries, token counts, latency | No | No | No (observability only) |

**Key distinction**: A `reasoning` part is a *provider execution artifact* that Anthropic requires for replay continuity but OpenAI rejects if not properly paired with subsequent tool calls. A `tool-web_search` part is *user-visible tool UX* that users expect to see but that may violate a different provider's input schema.

### 1.3 The Production Bug — Anatomy

```
Turn 1 (user):    "Find Batman products on Amazon"
Turn 2 (GPT-5.2): [reasoning] → [web_search_call] → [web_search_call] → ... → [text]
                   ^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^
                   These are paired internally by OpenAI's Responses API

Turn 3 (user):    "Why weren't links from Amazon?"
Turn 4 (replay):  History includes Turn 2's parts. Our sanitization kept tool parts
                   but stripped reasoning, breaking the required pairing.
                   
Error: "Item 'web_search_call' at index 3 was provided without its required
        'reasoning' item that should precede it"
```

The fix (`sanitizeMessagesForProvider()`) strips *all* tool and reasoning parts for non-Anthropic providers. This works but is overly aggressive — it destroys tool context that could improve follow-up response quality.

### 1.4 Current Architecture

```
Convex DB (UIMessage with full parts[])
    ↓
Client (useChat hook renders all parts)
    ↓ HTTP POST /api/chat
sanitizeMessagesForProvider(messages, provider)
    ↓ Binary: Anthropic keeps all, others strip tool+reasoning+step-start
convertToModelMessages(sanitizedMessages)    ← AI SDK v6, async
    ↓
streamText({ model, messages: ModelMessage[] })
```

**File locations**:
- Sanitization: `app/api/chat/utils.ts:77-107`
- Invocation: `app/api/chat/route.ts:356-361`
- Provider resolution: `lib/openproviders/provider-map.ts`
- Storage: `convex/messages.ts` (parts stored as-is)

---

## 2. Research Questions

### 2.1 Provider Replay Invariants

> **Q1**: What invariants does each provider enforce when replaying conversation history with reasoning and tool artifacts?

| Provider | Reasoning Replay | Tool Replay | Known Constraints |
|----------|-----------------|-------------|-------------------|
| **OpenAI** (Responses API) | Required if tool calls follow reasoning | Tool calls must pair with results | `web_search_call` requires preceding `reasoning` item; orphaned items rejected |
| **Anthropic** | Required for continuity (thinking blocks) | Required — tool_use must pair with tool_result | Thinking blocks must be replayed for multi-turn coherence; stripping them degrades quality |
| **Google Gemini** | **Converted to native `thought: true`** (Gemini 3: mandatory signatures on current-turn FC; 2.5: optional) | **Strict** — `functionCall` must pair with `functionResponse`; count parity enforced; 400 error on mismatch | Strict role alternation (user/model); Gemini 3 requires `thoughtSignature` on FC parts in current turn |
| **xAI (Grok)** | Not required for replay (output-only in Chat Completions) | OpenAI-compatible `tool_calls` + `tool` role; `tool_call_id` pairing required | `presencePenalty`/`frequencyPenalty`/`stop` rejected on reasoning models |
| **Mistral** | Not required for replay (Magistral `thinking` chunks are output artifacts) | `tool_calls` + `tool` role with `tool_call_id` + `name`; parallel and successive calling | Magistral models produce `thinking` content chunks but replay is not required |
| **Perplexity** | No reasoning support (`reasoning_steps` are search pipeline artifacts) | No user-defined tool calling (Sonar API) | Clean text-only replay; tool fields in schema but not user-controllable |
| **OpenRouter** | Depends on underlying model | Depends on underlying model | Passthrough — inherits target provider's constraints |

**Action**: Empirically validate each provider's behavior with structured test payloads.

### 2.2 Canonical History Format

> **Q2**: What should be the canonical storage format for conversation history?

**Current**: `UIMessage[]` with `parts` array containing all part types (text, reasoning, tool-*, step-start, source-url, file).

**Options**:
- **A. Keep current format (rich parts)** — Maximum fidelity, adapt on send
- **B. Dual-track: canonical + stripped** — Store both rich and text-only views
- **C. Normalized AST** — Abstract syntax tree with semantic annotations

**Recommendation**: Option A. Rich parts are needed for UI rendering, observability, and debugging. Adaptation should happen at the send boundary, not storage.

### 2.3 What to Preserve, Transform, or Drop

> **Q3**: For each part type, what treatment should it receive per provider?

| Part Type | Anthropic | OpenAI | Google | xAI | Mistral | Perplexity |
|-----------|-----------|--------|--------|-----|---------|------------|
| `text` | Keep | Keep | Keep | Keep | Keep | Keep |
| `reasoning` | Keep (required) | Transform* | **Keep** (converted to `thought: true`)† | Drop | Drop | Drop |
| `step-start` | Drop (SDK artifact) | Drop | Drop | Drop | Drop | Drop |
| `tool-*` (invocation) | Keep (required) | Transform* | Transform** | Transform*** | Transform*** | Drop |
| `tool-result` | Keep (required) | Transform* | Transform** | Transform*** | Transform*** | Drop |
| `source-url` | Keep‡ | Keep‡ | Keep‡ | Keep‡ | Keep‡ | Keep‡ |
| `source-document` | Keep‡ | Keep‡ | Keep‡ | Keep‡ | Keep‡ | Keep‡ |
| `file` | Keep | Keep | Keep | Keep | Keep | Keep |
| `dynamic-tool` | Keep (same as tool-*) | Transform* | Transform** | Transform*** | Transform*** | Drop |
| `data-*` | Pass through | Pass through | Pass through | Pass through | Pass through | Pass through |
| `callProviderMetadata` | Keep | Strip IDs§ | Strip IDs§ | Strip IDs§ | Strip IDs§ | Strip IDs§ |

\* OpenAI: Reasoning + tool pairs must be kept together or dropped together. Cannot keep one without the other. Provider-specific IDs (`msg_`/`rs_`/`ws_`/`fc_`) must be stripped.
\** Google: Tool calls must be paired with results (strict count parity — 400 error). For Gemini 3, function call parts require `thoughtSignature` (use `"skip_thought_signature_validator"` for cross-provider replay).
\*** xAI/Mistral: Drop reasoning, keep tool pairs if both invocation + result exist, drop orphans. Mistral additionally requires `name` field on tool results.
† Google: `@ai-sdk/google` converts `reasoning` parts to Gemini's native `{ text, thought: true }` format. This preserves reasoning context and improves response quality. Thought signatures from prior turns are NOT validated — only current-turn FC needs valid signatures.
‡ `source-url` and `source-document` are silently dropped by `convertToModelMessages()` — adapters don't strictly need to strip them, but should for observability accuracy.
§ `callProviderMetadata` carries provider-linked IDs (e.g., `msg_`, `rs_`, `ws_`) that create cross-response linkage. Must be stripped when target provider differs from source to prevent pairing validation errors.

### 2.4 Cross-Turn Tool Artifact Representation

> **Q4**: How should tool-call artifacts be represented when they span turns?

**Scenario**: Model makes a tool call in turn N. The tool result arrives in the same streaming response but is stored as a separate message or part.

**Current behavior**: Tool results are stored as `role: "tool"` messages or `tool-result` parts. Sanitization drops them for non-Anthropic providers.

**Research needed**:
- Does the AI SDK's `convertToModelMessages()` handle cross-turn tool pairs correctly?
- What happens when a tool call is in one message and the result is in a different message?
- Should we consolidate tool call + result into a single message before conversion?

### 2.5 Same-Provider Continuation vs Provider Switch

> **Q5**: Should behavior differ when continuing with the same provider vs switching?

| Scenario | Recommended Behavior |
|----------|---------------------|
| Same provider, same model | Replay with minimal transformation (preserve provider-specific artifacts) |
| Same provider, different model | Replay with model-level adaptation (e.g., reasoning support may differ) |
| Different provider | Full provider adaptation (apply target provider's adapter) |

**Key insight**: The model that *generated* a message is not necessarily the model that will *consume* it on replay. The adapter must be keyed on the **target** provider, not the source.

---

## 3. Comparative Strategy Options

### Option A: Sanitize-on-Send with Provider Adapters

```
UIMessage[] → ProviderAdapter.adapt(messages) → convertToModelMessages() → streamText()
```

**Design**:
- One adapter per provider implementing a `ProviderHistoryAdapter` interface
- Adapters registered in a map keyed by `providerId`
- Each adapter encodes that provider's replay invariants
- Adapters are pure functions (stateless, testable)

```typescript
// Original sketch — see Appendix C for validated interface
interface ProviderHistoryAdapter {
  providerId: string
  adaptMessages(messages: UIMessage[], context: AdaptationContext): Promise<AdaptationResult>
  readonly metadata: { droppedPartTypes: ReadonlySet<string>; transformedPartTypes: ReadonlySet<string>; description: string }
}
```

**Tradeoffs**:

| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | ★★★★★ | Each adapter encodes exact provider invariants |
| Complexity | ★★★☆☆ | One adapter per provider (~7 adapters) |
| Latency | ★★★★★ | In-memory transformation, negligible cost |
| Token cost | ★★★★☆ | Can preserve useful context per provider |
| Debuggability | ★★★★☆ | Adapter logs what was dropped/transformed |
| Migration effort | ★★★★★ | Drop-in replacement for `sanitizeMessagesForProvider()` |
| Extensibility | ★★★★★ | Adding provider = adding one adapter file |

### 3.1 Interface Validation Results

> **Validated**: February 13, 2026
> **Scope**: Validated proposed Appendix C interface and Appendix D file structure against all 7 research documents, codebase conventions, and real message shapes

#### 3.1.1 Part Type Coverage — Gaps Found and Addressed

**AI SDK v6 `UIMessagePart` union (from `ai@6.0.78`):**

```typescript
type UIMessagePart =
  | TextUIPart           // { type: "text" }        — ✅ Covered
  | ReasoningUIPart      // { type: "reasoning" }   — ✅ Covered
  | ToolUIPart<TOOLS>    // { type: `tool-${NAME}` }— ✅ Covered
  | DynamicToolUIPart    // { type: "dynamic-tool" }— ⚠️ MISSING from original table
  | SourceUrlUIPart      // { type: "source-url" }  — ✅ Covered
  | SourceDocumentUIPart // { type: "source-document" } — ⚠️ MISSING from original table
  | FileUIPart           // { type: "file" }        — ✅ Covered
  | DataUIPart           // { type: `data-${NAME}` }— ⚠️ MISSING from original table
  | StepStartUIPart      // { type: "step-start" }  — ✅ Covered
```

**Codebase usage audit:**

| Part Type | Used In Codebase | Found In |
|-----------|-----------------|----------|
| `text` | Yes (very common) | `utils.ts`, `use-chat-core.ts`, `messages/provider.tsx`, etc. |
| `reasoning` | Yes | `utils.ts`, `message-assistant.tsx`, `db.ts` |
| `step-start` | Yes | `utils.ts`, `db.ts` |
| `tool-*` (e.g., `tool-web_search`, `tool-exa_search`) | Yes | `utils.ts`, `utils.test.ts`, `tool-invocation.tsx` |
| `source-url` | Yes | `utils.ts`, `get-sources.ts` |
| `source-document` | **Not used** | Not found in any source file |
| `file` | Yes | `messages/provider.tsx`, `use-chat-core.ts` |
| `dynamic-tool` | **Not used** | Not found (could appear with MCP tools in future) |
| `data-*` | **Not used** | Not found (AI SDK supports custom data parts) |

**Resolution**: Section 2.3 table updated to include `source-document`, `dynamic-tool`, `data-*`, and `callProviderMetadata`. All three missing part types are safe to pass through (they're either silently dropped by `convertToModelMessages()` or treated identically to their base types).

**Critical addition**: `callProviderMetadata` added to the table. This is the mechanism through which provider-linked IDs (`msg_`, `rs_`, `ws_`, `fc_`) flow from stored UIMessage tool parts into ModelMessages, triggering pairing validation errors. The adapter MUST strip this when the target provider differs from the source.

#### 3.1.2 AdaptationResult Stats — Gaps Found

The proposed `AdaptationResult.stats` (Appendix C) was missing fields needed by the structured log format (Section 5.1):

| Field | In AdaptationResult? | In Log Format? | Resolution |
|-------|---------------------|----------------|------------|
| `originalMessageCount` | ✅ Yes | ✅ Yes | — |
| `adaptedMessageCount` | ✅ Yes | ✅ Yes | — |
| `partsDropped` | ✅ Yes | ✅ Yes | — |
| `partsTransformed` | ✅ Yes | ✅ Yes | — |
| `partsPreserved` | ✅ Yes | ✅ Yes | — |
| `droppedMessages` | ❌ Missing | ✅ Yes | **Added** — count of messages entirely removed |
| `totalPartsOriginal` | ❌ Missing | ✅ Yes | **Added** — total part count before adaptation |
| `totalPartsAdapted` | ❌ Missing | ✅ Yes | **Added** — total part count after adaptation |
| `adaptationTimeMs` | ❌ Missing | ✅ Yes | **Added** — measured by caller, not adapter |
| `providerIdsStripped` | ❌ Missing | ❌ Missing | **Added** — count of `callProviderMetadata` entries stripped |

**Resolution**: `AdaptationResult` in Appendix C updated with all missing fields.

#### 3.1.3 Adapter Invocation Point — Confirmed Correct, With Refinement

The `ai-sdk-convert-messages.md` research confirms the three-layer architecture:

```
UIMessage[] → [ADAPTER HERE] → convertToModelMessages() → Provider SDK
   Layer 1                        Layer 2                  Layer 3
```

**Confirmed**: Adapters should operate at Layer 1 (before `convertToModelMessages()`). Reasons from research:
1. Part-level granularity is available (reasoning, tool, source-url etc.)
2. Step-start block splitting is handled downstream by the SDK
3. `callProviderMetadata` can be stripped before it propagates to `providerOptions`
4. UIMessage is a flat parts array — simpler than nested ModelMessage structure

**Refinement needed**: The existing post-conversion safety net (`hasProviderLinkedResponseIds()` + `toPlainTextModelMessages()`) should remain as defense-in-depth. The adapter strips `callProviderMetadata` proactively; the post-conversion check catches any leakage.

**No post-conversion adapter needed**: The provider SDKs (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) handle the final format transformation. Adding an adapter between `convertToModelMessages()` and `streamText()` would require working with the complex `ModelMessage` structure (paired assistant+tool messages) — unnecessary complexity.

**Additional context the adapter may need** (see 3.1.5):
- Target model ID (for Gemini 3 vs 2.5 thought signature handling)
- Whether tools are being sent (to decide if tool parts should be preserved)
- Model capabilities (e.g., `modelConfig.reasoningText`, `modelConfig.tools`)

#### 3.1.4 File Structure — Validated Against Conventions

**Test file convention audit:**

| Location | Convention | Examples |
|----------|-----------|----------|
| `app/api/chat/utils.test.ts` | `.test.ts` alongside source | Single test file for a single module |
| `lib/tools/__tests__/*.test.ts` | `__tests__/` subdirectory | Multi-file test suite for a cohesive module |
| `lib/mcp/__tests__/*.test.ts` | `__tests__/` subdirectory | Multi-file test suite for a cohesive module |
| `lib/as-child-adapter.test.ts` | `.test.ts` alongside source | Single test file |

**Finding**: Both conventions coexist. `__tests__/` is used for cohesive modules with multiple test files (lib/tools, lib/mcp). `.test.ts` alongside source is used for single-module testing. The adapters module has multiple test files (one per provider + cross-provider), so `__tests__/` is the correct convention.

**Vitest config** (`vitest.config.ts`): No include/exclude patterns — both conventions are auto-discovered.

**File structure change from research**: The xAI/Mistral research recommends a shared `OpenAICompatibleAdapter` rather than separate adapters. Updated in Appendix D.

#### 3.1.5 Interface Gaps Identified

**Gap 1: Synchronous vs Asynchronous**

The proposed `adaptMessages()` is synchronous. This should be **async** because:
- `convertToModelMessages()` is already async (the caller already awaits)
- Future adapters might need to look up model capabilities or source provider info
- The cost of async is zero (caller already in an async context)
- Enables potential future integration with AI SDK middleware

**Resolution**: Changed to `async` in Appendix C.

**Gap 2: Missing Adaptation Context**

The adapter receives only `messages: UIMessage[]` but needs additional context:

| Context | Why Needed | Example |
|---------|-----------|---------|
| `targetModelId` | Gemini 3 vs 2.5 have different thought signature requirements | `"gemini-3-pro"` requires signatures; `"gemini-2.5-flash"` doesn't |
| `hasTools` | Adapters should only preserve tool parts when tools are actually being sent | If no tools in current request, tool history parts are noise |
| `sourceProviderHint` | Enables smarter stripping — e.g., Anthropic→Anthropic can preserve signatures | Per-message source is in `callProviderMetadata`; conversation-level hint is useful |

**Resolution**: Added `AdaptationContext` parameter to `adaptMessages()` in Appendix C.

**Gap 3: Source Provider Identification**

The adapter is keyed on the **target** provider (correct — Section 2.5 confirms this). But it may benefit from knowing the source provider per message. This information is available in two places:
1. `callProviderMetadata` on tool parts (carries provider name as key)
2. `model` field on `ExtendedUIMessage` (our app-specific extension, stored in Convex)

**Resolution**: Rather than requiring per-message source provider, the adapter should inspect `callProviderMetadata` keys to detect source provider when needed. The `sourceProviderHint` in `AdaptationContext` provides a conversation-level default.

**Gap 4: `providerExecuted` Flag Awareness**

The `cross-turn-tool-artifacts.md` research reveals that `providerExecuted: true` tool parts produce inlined tool results in the assistant ModelMessage (not separate `role: "tool"` messages). This affects the replay shape downstream. The adapter must understand this distinction when deciding what to keep/drop, because:
- Provider-executed tools (OpenAI `web_search`, Google `code_execution`) carry `callProviderMetadata` with provider IDs
- SDK-executed tools (MCP, Exa) don't carry provider IDs but need call/result pairing

**Resolution**: Documented in adapter contract (Appendix C). No interface change needed — `providerExecuted` is already on the ToolUIPart and adapters can inspect it.

**Gap 5: Fallback Chain Support**

The xAI/Mistral research suggests shared adapters (both use `OpenAICompatibleAdapter`). Rather than fallback chains, the registry should support **adapter aliasing** — multiple provider IDs mapping to the same adapter instance.

**Resolution**: Registry design updated in Appendix C to use a simple map with shared instances. No fallback chain mechanism needed.

#### 3.1.6 Research Cross-Reference — Corrections to Main Plan

| Section | Original Claim | Correction | Source |
|---------|---------------|------------|--------|
| 2.1 (Google) | "Permissive... not strictly enforced" | **Strict** — 400 `INVALID_ARGUMENT` on tool pairing violations | `google-replay-invariants.md` §1 |
| 2.1 (Mistral) | "No reasoning support" | Magistral models support `thinking` content chunks (since June 2025) | `xai-mistral-perplexity-replay-invariants.md` §2.2 |
| 2.3 (Google reasoning) | "Drop" | **Keep** — `@ai-sdk/google` converts to native `thought: true` format | `google-replay-invariants.md` §4 |
| 2.3 (missing parts) | Only 7 part types listed | 3 additional types: `source-document`, `dynamic-tool`, `data-*` | `cross-turn-tool-artifacts.md` §2.1 |
| — (new) | `callProviderMetadata` not addressed | Must strip when target ≠ source — carries `msg_`/`rs_`/`ws_` IDs | `cross-turn-tool-artifacts.md` §5.4, `openai-replay-invariants.md` §8.4 |
| — (new) | Gemini 3 thought signatures not addressed | Gemini 3 requires `thoughtSignature` on FC parts; use dummy `"skip_thought_signature_validator"` for cross-provider replay | `google-replay-invariants.md` §2 |
| — (new) | No shared adapter concept | xAI and Mistral can share an `OpenAICompatibleAdapter` | `xai-mistral-perplexity-replay-invariants.md` §5.1 |

#### 3.1.7 Design Issues Requiring Resolution Before Implementation

**Issue 1 (HIGH): Gemini 3 Thought Signature Injection**

Gemini 3 models require `thoughtSignature` on `functionCall` parts in the current turn. When replaying cross-provider history (e.g., OpenAI tool calls → Gemini 3), these signatures are missing. The adapter must inject the dummy value `"skip_thought_signature_validator"`.

**Question**: Should the adapter inject this at the UIMessage level (into `providerMetadata.google`), or should this be handled downstream by the `@ai-sdk/google` provider?

**Recommendation**: Handle in the adapter. The `@ai-sdk/google` provider converts `providerMetadata` to `providerOptions` and then to `thoughtSignature` on parts. The adapter can set `providerMetadata.google.thoughtSignature = "skip_thought_signature_validator"` on tool parts that lack signatures.

**Issue 2 (MEDIUM): `providerExecuted` Tool Parts Need Special Handling**

Provider-executed tool results are inlined in the assistant ModelMessage (not separate `role: "tool"` messages). When the adapter drops a provider-executed tool part, it only needs to drop that one part. When it drops an SDK-executed tool part, it must also account for the `role: "tool"` ModelMessage that `convertToModelMessages()` would synthesize.

**Current design handles this**: Since the adapter operates on UIMessage parts (before conversion), dropping a tool part automatically prevents the SDK from synthesizing the downstream ModelMessage. No special handling needed at the adapter level — but this should be documented in the adapter contract.

**Issue 3 (MEDIUM): Role Alternation Validation for Google**

The Google research reveals strict role alternation (user/model). If the adapter strips all parts from an assistant message (making it empty), and the message is between two user messages, the result is consecutive user messages — which Gemini rejects with a 400 error.

**Recommendation**: The Google adapter must verify role alternation after filtering. If stripping creates consecutive same-role messages, either merge them or inject an empty assistant placeholder.

**Issue 4 (LOW): `step-start` Parts and Block Awareness**

The `cross-turn-tool-artifacts.md` research shows that `step-start` parts delimit atomic blocks within a single assistant UIMessage. The OpenAI adapter needs block-level awareness to enforce the reasoning→tool→result atomic triple invariant.

**Recommendation**: The adapter should process parts within `step-start` blocks. For each block: identify reasoning + tool parts, check if the group is complete, keep or drop the entire block. This is already described in the OpenAI research (§7 decision tree) but should be explicit in the interface contract.

**Issue 5 (LOW): Test Fixture Realism**

Current `utils.test.ts` fixtures use minimal part shapes (e.g., `{ type: "tool-web_search", toolCallId: "tc1", input: { q: "batman" } }`). Real parts include `state`, `providerExecuted`, `output`, `callProviderMetadata`. Contract tests should use realistic fixtures matching the shapes cataloged in `cross-turn-tool-artifacts.md` §3.

**Recommendation**: Create a comprehensive `fixtures.ts` with realistic message shapes from the cross-turn-tool-artifacts research (Section 3.1–3.8).

---

### Option B: Dual-Track History Model

```
Storage: canonical_parts[] + replay_parts[provider]
Send:    Load replay_parts[targetProvider] → convertToModelMessages() → streamText()
```

**Design**:
- At message write time, generate provider-specific replay views
- Store views alongside canonical parts in Convex
- On replay, select the view matching the target provider

**Tradeoffs**:

| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | ★★★★☆ | Pre-computed views may become stale if invariants change |
| Complexity | ★★☆☆☆ | Storage schema change, migration needed, write amplification |
| Latency | ★★★★★ | Pre-computed, zero transform cost at send time |
| Token cost | ★★★★☆ | Same as A (views encode same decisions) |
| Debuggability | ★★★☆☆ | Must inspect both canonical and replay views |
| Migration effort | ★★☆☆☆ | Schema migration for existing messages, backfill required |
| Extensibility | ★★★☆☆ | Adding provider = schema change + backfill |

### Option C: Provider-Specific Transcript Builders

```
UIMessage[] → MessageAST → ProviderTranscriptBuilder.build(ast) → ModelMessage[]
```

**Design**:
- Parse `UIMessage[]` into a provider-neutral AST
- AST represents semantic structure: user turns, assistant turns, tool exchanges, reasoning blocks
- Per-provider transcript builders compile the AST into `ModelMessage[]` directly (bypassing `convertToModelMessages()`)

**Tradeoffs**:

| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | ★★★★★ | Maximum control over output format |
| Complexity | ★☆☆☆☆ | AST design + N builders + bypasses SDK conversion |
| Latency | ★★★★☆ | AST parse adds small overhead |
| Token cost | ★★★★★ | Can optimize per-provider (e.g., summarize old tool results) |
| Debuggability | ★★★★★ | AST is inspectable, builders are testable |
| Migration effort | ★☆☆☆☆ | Major refactor, bypasses AI SDK's conversion |
| Extensibility | ★★★★★ | Most flexible long-term |

### Recommendation: Option A

Option A (sanitize-on-send with provider adapters) is the best fit for this codebase because:

1. **Lowest migration cost** — Drop-in replacement for the existing `sanitizeMessagesForProvider()` function.
2. **Highest correctness** — Each adapter encodes exact invariants, validated by contract tests.
3. **Leverages AI SDK** — Stays on the `convertToModelMessages()` path, benefiting from SDK updates.
4. **Matches codebase patterns** — The provider map (`lib/openproviders/provider-map.ts`) already routes by provider ID.
5. **Incremental adoption** — Can ship one adapter at a time, starting with OpenAI.

Option C is the ideal long-term architecture but requires 3-4x the effort and bypasses the AI SDK's conversion pipeline. Consider migrating to C in a future quarter if adapter complexity grows.

---

## 4. Validation and Test Strategy

### 4.1 Contract Tests Per Provider

Each provider adapter gets a contract test suite that validates:

```typescript
describe("OpenAIHistoryAdapter", () => {
  // Invariant: reasoning + tool pairs are kept together or dropped together
  it("drops reasoning-tool pairs when pair is incomplete")
  it("keeps complete reasoning-tool-result triples")
  it("preserves text parts unchanged")
  
  // Invariant: no orphaned tool_call without preceding reasoning
  it("never produces orphaned web_search_call items")
  
  // Invariant: tool role messages are handled
  it("transforms tool-role messages into inline tool results or drops them")
  
  // Edge: all parts stripped
  it("produces fallback text when all parts are stripped")
  
  // Edge: empty message after filtering
  it("removes messages that become empty after adaptation")
})
```

### 4.2 Cross-Provider Replay Test Matrix

```
                     ┌──────────────────── Target Provider ────────────────────┐
                     │  Anthropic  │  OpenAI  │  Google  │  xAI  │  Mistral  │
Source Provider      │             │          │          │       │           │
─────────────────────┼─────────────┼──────────┼──────────┼───────┼───────────┤
Anthropic            │  pass-thru  │  strip R │  strip R │ strip │  strip R  │
OpenAI               │  keep all   │  pair RT │  pair RT │ strip │  pair RT  │
Google               │  keep all   │  strip R │  pass-thru│ strip │  strip R  │
xAI                  │  keep all   │  strip R │  strip R │ pass  │  strip R  │

R = reasoning parts, T = tool parts, RT = reasoning-tool pairs
```

Test scenarios for each cell:
1. **Text-only history** — Baseline (should always pass)
2. **History with reasoning** — Tests reasoning preservation/stripping
3. **History with tool calls** — Tests tool pair handling
4. **History with reasoning + tool chains** — Tests the OpenAI paired invariant
5. **History with mixed sources** — Previous messages from provider X, new request to provider Y
6. **Long history** — 50+ messages with interleaved tool usage

### 4.3 Failure-Injection Scenarios

| Scenario | Description | Expected Behavior |
|----------|-------------|-------------------|
| Orphaned tool call | Tool invocation part without matching result | Adapter drops the orphaned call or synthesizes a placeholder result |
| Orphaned tool result | Tool result without matching invocation | Adapter drops the orphaned result |
| Partial tool chain | 5 web_search calls, only 3 have results | Adapter drops incomplete pairs |
| Missing reasoning before tool | Tool call exists without preceding reasoning (for OpenAI) | Adapter drops the tool call |
| Corrupted part type | Unknown part type in history | Adapter passes through (fail open for unknown types) |
| Empty parts array | Message with `parts: []` | Adapter adds fallback text or drops message |
| Giant tool result | Tool result with 100KB+ output | Adapter truncates or summarizes |

### 4.4 Integration Tests

- **Round-trip test**: Send a tool-using conversation through each provider, verify the response succeeds and includes expected content.
- **Provider-switch test**: Start conversation with Provider A (tool usage), switch to Provider B, verify follow-up succeeds.
- **Regression test**: Replay the exact message sequence from the production Batman bug against OpenAI.

---

## 5. Observability Plan

### 5.1 Structured Logging for Replay Adaptation

Add structured log events when `sanitizeMessagesForProvider()` (or its adapter replacement) transforms messages:

```typescript
// _tag: "history_adapt" for machine filtering
console.log(JSON.stringify({
  _tag: "history_adapt",
  chatId,
  provider,
  model,
  originalMessageCount: messages.length,
  adaptedMessageCount: adapted.length,
  droppedMessages: messages.length - adapted.length,
  partsDropped: { reasoning: 3, tool: 5, stepStart: 2 },
  partsTransformed: { toolPair: 2 },
  partsPreserved: { text: 8, sourceUrl: 2, file: 0 },
  totalPartsOriginal: 20,
  totalPartsAdapted: 10,
  adaptationTimeMs: 1.2,
}))
```

### 5.2 Metrics and Alerts

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `history_adapt.parts_dropped_ratio` | % of parts dropped per request | > 80% (overly aggressive stripping) |
| `history_adapt.adaptation_failures` | Adapter threw an error | Any occurrence |
| `provider_reject.replay_shape` | Provider rejected with message-shape error | Any occurrence |
| `tool_explosion.sequential_calls` | Number of sequential tool calls in one response | > 10 (matches `prepareStep` threshold) |
| `history_adapt.fallback_text_injected` | Adapter had to inject empty text fallback | > 5% of requests |
| `provider_switch.cross_provider_replay` | Conversation switched providers | Track rate, correlate with errors |

### 5.3 Replay Error Detection

Wrap the `streamText()` call's error handler to detect replay-shape errors specifically:

```typescript
onError: (err) => {
  const msg = extractErrorMessage(err)
  if (isReplayShapeError(msg)) {
    console.error(JSON.stringify({
      _tag: "replay_shape_error",
      chatId, provider, model,
      errorMessage: msg,
      messageCount: messages.length,
      // Attach sanitized history summary (not full content)
      historyPartTypes: messages.map(m => m.parts.map(p => p.type)),
    }))
  }
}
```

Pattern-match known replay-shape error messages:
- OpenAI: `"was provided without its required"`, `"invalid input message"`
- Anthropic: `"thinking block must be followed by"`, `"tool_use block must be followed by tool_result"`
- Google: `"functionCall must be followed by functionResponse"`

---

## 6. Rollout Plan

### Phase 1: OpenAI Adapter (Week 1)

**Goal**: Replace the binary sanitization with a proper OpenAI adapter that handles reasoning-tool pairs.

**Steps**:
1. Create `app/api/chat/adapters/types.ts` — Define `ProviderHistoryAdapter`, `AdaptationResult`, `AdaptationContext`
2. Create `app/api/chat/adapters/openai.ts` — OpenAI Responses API adapter (reasoning-tool pairing, ID stripping)
3. Create `app/api/chat/adapters/default.ts` — Default adapter (current strip-all behavior)
4. Create `app/api/chat/adapters/anthropic.ts` — Anthropic near-passthrough adapter
5. Create `app/api/chat/adapters/index.ts` — Registry + `adaptHistoryForProvider()` entry point
6. Update `route.ts` to call `adaptHistoryForProvider()` behind feature flag (keep `sanitizeMessagesForProvider()` as fallback)
7. Write contract tests in `adapters/__tests__/openai.test.ts` with realistic fixtures
8. Write regression test reproducing Batman production bug

**Feature flag**: `HISTORY_ADAPTER_V2=true` (env var, defaults to false)
**Rollback**: Set flag to false, reverts to current binary sanitization
**Success criteria**: Zero `replay_shape_error` events for OpenAI in 48 hours

### Phase 2: Provider-Specific Adapters (Week 2)

**Goal**: Add adapters for Google, xAI, Mistral, Perplexity.

**Steps**:
1. Create `app/api/chat/adapters/google.ts` — Google Gemini adapter (strict FC pairing, role alternation, Gemini 3 thought signatures)
2. Create `app/api/chat/adapters/openai-compatible.ts` — Shared adapter for xAI + Mistral (drop reasoning, keep tool pairs)
3. Create `app/api/chat/adapters/text-only.ts` — Perplexity adapter (strip everything except text)
4. Register all adapters in `index.ts` (xAI and Mistral map to `OpenAICompatibleAdapter`)
5. Write contract tests: `google.test.ts`, `openai-compatible.test.ts`, `text-only.test.ts`
6. Write `cross-provider.test.ts` — Full source×target matrix
7. Create `fixtures.ts` with realistic message shapes from cross-turn-tool-artifacts research

**Feature flag**: Same `HISTORY_ADAPTER_V2` flag
**Success criteria**: Full test matrix passing, zero replay errors across all providers

### Phase 3: Observability + Hardening (Week 2-3)

**Goal**: Add structured logging, metrics, and replay-shape error detection.

**Steps**:
1. Add `history_adapt` structured log to adapter pipeline
2. Add `replay_shape_error` detection to error handler
3. Add PostHog events for adaptation metrics
4. Create dashboard for replay health monitoring
5. Set up alerts for replay-shape errors and tool explosions

### Phase 4: Cleanup (Week 3)

**Goal**: Remove feature flag, delete old sanitization code, update documentation.

**Steps**:
1. Remove `HISTORY_ADAPTER_V2` flag (adapters are now the default)
2. Remove old `sanitizeMessagesForProvider()` binary logic
3. Update `app/api/CLAUDE.md` and glossary with adapter patterns
4. Add ADR for the adapter architecture decision

### Backward Compatibility

- **Stored messages**: No migration needed. Adapters operate on `UIMessage[]` at send time, not at storage time. Existing messages remain untouched.
- **Client contract**: No changes. The client still sends `UIMessage[]` via `DefaultChatTransport`.
- **Streaming response**: No changes. `toUIMessageStreamResponse()` is unaffected.

---

## 7. Recommendation Criteria

### Scoring Rubric

| Criterion | Weight | Definition |
|-----------|--------|------------|
| **Correctness** | 30% | Does it prevent all known replay-shape errors? Does it handle edge cases? |
| **Maintainability** | 20% | Can a new team member understand and modify the adapter for a new provider? |
| **Extensibility** | 15% | How easy is it to add a new provider? Change an existing invariant? |
| **Developer Experience** | 15% | Are adapters easy to test? Do errors produce actionable diagnostics? |
| **Token Cost** | 10% | Does the adaptation preserve useful context when possible, rather than stripping everything? |
| **Migration Effort** | 10% | How much existing code must change? Risk of regression? |

### Scoring for Each Option

| Criterion | Weight | Option A (Adapters) | Option B (Dual-Track) | Option C (AST Builders) |
|-----------|--------|--------------------|-----------------------|------------------------|
| Correctness | 30% | 5 (150) | 4 (120) | 5 (150) |
| Maintainability | 20% | 4 (80) | 2 (40) | 3 (60) |
| Extensibility | 15% | 4 (60) | 3 (45) | 5 (75) |
| DX | 15% | 4 (60) | 3 (45) | 4 (60) |
| Token Cost | 10% | 4 (40) | 4 (40) | 5 (50) |
| Migration | 10% | 5 (50) | 2 (20) | 1 (10) |
| **Total** | 100% | **440** | **310** | **405** |

### What "Best Practice" Means for This Codebase

Given this project's constraints — Vercel AI SDK dependency, Convex storage, 8 providers, streaming UX, tool-calling features, and a small engineering team — best practice is:

1. **Encode invariants explicitly** — Each provider's replay rules should be readable code, not implicit in a giant if/else chain.
2. **Test at the contract level** — Provider adapters are pure functions that can be tested without network calls.
3. **Preserve the SDK's conversion pipeline** — Don't bypass `convertToModelMessages()` unless forced to.
4. **Fail safe** — When in doubt, strip parts (current behavior) rather than send invalid shapes. But make the stripping targeted, not blanket.
5. **Observe adaptation** — Log what was transformed so that new provider invariants can be discovered from production data.
6. **Keep storage canonical** — Never lose data at write time. All adaptation happens at read/send time.

---

## Prioritized "First 2 Weeks" Action List

### Week 1: Foundation

| # | Task | Effort | Owner | Depends On |
|---|------|--------|-------|------------|
| 1 | Define `ProviderHistoryAdapter` interface and types | 2h | — | — |
| 2 | Implement OpenAI adapter with reasoning-tool pair handling | 4h | — | 1 |
| 3 | Implement Anthropic pass-through adapter | 1h | — | 1 |
| 4 | Implement default adapter (current strip-all as fallback) | 1h | — | 1 |
| 5 | Create adapter registry with provider-to-adapter mapping | 1h | — | 1-4 |
| 6 | Write contract tests for OpenAI adapter (8-10 cases) | 3h | — | 2 |
| 7 | Write regression test reproducing Batman production bug | 2h | — | 2 |
| 8 | Integrate adapters into `route.ts` behind feature flag | 2h | — | 5 |
| 9 | Deploy to preview, test with OpenAI models manually | 2h | — | 8 |
| 10 | Deploy to production with flag off, canary with flag on | 1h | — | 9 |

**Week 1 total**: ~19h (2.5 eng-days)

### Week 2: Coverage + Observability

| # | Task | Effort | Owner | Depends On |
|---|------|--------|-------|------------|
| 11 | Implement Google adapter | 2h | — | 1 |
| 12 | Implement xAI, Mistral, Perplexity adapters | 3h | — | 1 |
| 13 | Write contract tests for all new adapters | 4h | — | 11-12 |
| 14 | Build cross-provider replay test matrix | 3h | — | 6, 13 |
| 15 | Add `history_adapt` structured logging | 2h | — | 5 |
| 16 | Add `replay_shape_error` detection in error handler | 2h | — | 15 |
| 17 | Add PostHog events for adaptation metrics | 2h | — | 15 |
| 18 | Enable flag in production, monitor for 48h | — | — | All above |
| 19 | Remove flag, clean up old sanitization code | 1h | — | 18 |
| 20 | Update documentation (CLAUDE.md, glossary, ADR) | 1h | — | 19 |

**Week 2 total**: ~20h (2.5 eng-days)

### Total Estimated Effort: 5 engineering days

---

## Appendix A: OpenAI Responses API Replay Invariants

Based on the production error and OpenAI documentation:

1. `reasoning` items must immediately precede their associated `web_search_call` (or other tool) items.
2. A `web_search_call` without its preceding `reasoning` item is rejected.
3. Tool call items must be paired with their results in subsequent messages.
4. The `reasoning` → `tool_call` → `tool_result` triple is atomic — all three must be present or all three must be absent.
5. Text-only assistant messages do not require any pairing.

## Appendix B: Anthropic Replay Invariants

Based on Anthropic documentation and observed behavior:

1. `thinking` blocks should be replayed for multi-turn coherence (stripping degrades quality).
2. `tool_use` blocks must be followed by `tool_result` blocks in the next message.
3. Interleaved thinking is automatically enabled when tools are present (on supported models).
4. Stripping thinking blocks from history is tolerated but not recommended.

## Appendix C: Proposed Adapter Interface (Validated)

> Updated after validation against all 7 research documents and codebase audit (Section 3.1)

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
   * This is a conversation-level hint for the common case.
   */
  sourceProviderHint?: string
}

/**
 * Contract for provider-specific history adaptation.
 * 
 * Adapters transform canonical UIMessage[] into a form that satisfies
 * the target provider's replay invariants. They operate on UIMessage[]
 * (before convertToModelMessages) to stay within the AI SDK's
 * conversion pipeline.
 * 
 * Adapters MUST be:
 * - Pure functions (no side effects, no network calls)
 * - Idempotent (applying twice produces the same result)
 * - Documented (invariants are in comments, not just code)
 * 
 * Adapters MUST handle these UIMessage part types:
 * - text, reasoning, step-start, tool-*, dynamic-tool
 * - source-url, source-document, file, data-*
 * - Parts with callProviderMetadata (provider-linked IDs)
 * - Parts with providerExecuted: true vs false
 * 
 * Adapters MUST enforce provider invariants at the step-start block
 * level. Within a single assistant UIMessage, parts are grouped by
 * step-start delimiters. Each block may contain reasoning + tool
 * parts that form atomic units (especially for OpenAI).
 * 
 * Adapters MUST NOT mutate input messages. Return new arrays/objects.
 */
export interface ProviderHistoryAdapter {
  /** Provider ID(s) this adapter handles */
  readonly providerId: string

  /**
   * Adapt messages for this provider's replay invariants.
   * Returns a new array (never mutates input).
   * 
   * Async for future flexibility (model capability lookups, etc.)
   * Currently all implementations are synchronous but wrapped in Promise.
   */
  adaptMessages(
    messages: UIMessage[],
    context: AdaptationContext,
  ): Promise<AdaptationResult>

  /**
   * Static metadata for observability — what this adapter drops/transforms.
   * Used for structured logging and dashboard configuration.
   */
  readonly metadata: {
    droppedPartTypes: ReadonlySet<string>
    transformedPartTypes: ReadonlySet<string>
    description: string
  }
}

/**
 * Result of adaptation, including observability data.
 * Stats structure matches the structured log format in Section 5.1.
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
}

/**
 * Adapter registry — maps providerId to adapter.
 * Multiple provider IDs can map to the same adapter instance
 * (e.g., xAI and Mistral both use OpenAICompatibleAdapter).
 */
export type AdapterRegistry = Map<string, ProviderHistoryAdapter>

/**
 * Entry point: resolve and run the adapter for a given provider.
 * Falls back to DefaultAdapter if no provider-specific adapter exists.
 * 
 * This replaces sanitizeMessagesForProvider() — same invocation point,
 * richer per-provider logic, structured observability output.
 */
export async function adaptHistoryForProvider(
  messages: UIMessage[],
  providerId: string,
  context: AdaptationContext,
): Promise<AdaptationResult> {
  const adapter = registry.get(providerId) ?? defaultAdapter
  return adapter.adaptMessages(messages, context)
}
```

## Appendix D: File Structure (Validated)

> Updated after validation against project conventions (Section 3.1.4).
> Test files use `__tests__/` convention (matches `lib/tools/`, `lib/mcp/` pattern for multi-file test suites).
> xAI and Mistral share `openai-compatible.ts` adapter (validated in xAI/Mistral research).

```
app/api/chat/
├── adapters/
│   ├── types.ts               # ProviderHistoryAdapter, AdaptationResult, AdaptationContext
│   ├── index.ts               # Registry: providerId → adapter + adaptHistoryForProvider()
│   ├── openai.ts              # OpenAI Responses API invariants (strict reasoning-tool pairing)
│   ├── anthropic.ts           # Anthropic near-passthrough (keep all, strip step-start)
│   ├── google.ts              # Google Gemini invariants (strict FC pairing, role alternation, thought signatures)
│   ├── openai-compatible.ts   # Shared adapter for xAI + Mistral (drop reasoning, keep tool pairs)
│   ├── text-only.ts           # Perplexity and future text-only providers
│   └── default.ts             # Fallback (current strip-all behavior for unknown providers)
├── adapters/__tests__/
│   ├── openai.test.ts         # Contract tests — reasoning-tool pairing, ID stripping
│   ├── anthropic.test.ts      # Contract tests — passthrough verification
│   ├── google.test.ts         # Contract tests — FC pairing, role alternation, thought signatures
│   ├── openai-compatible.test.ts  # Contract tests — xAI/Mistral tool pair handling
│   ├── text-only.test.ts      # Contract tests — text extraction, part stripping
│   ├── cross-provider.test.ts # Matrix tests — all source×target combinations
│   └── fixtures.ts            # Shared realistic message fixtures (from cross-turn-tool-artifacts §3)
├── route.ts                   # Updated: adaptHistoryForProvider() replaces sanitizeMessagesForProvider()
├── utils.ts                   # sanitizeMessagesForProvider() kept as deprecated fallback behind feature flag
└── utils.test.ts              # Existing tests kept; new adapter tests in __tests__/
```

**Mapping: providerId → adapter file**

| Provider ID | Adapter File | Adapter Name |
|------------|-------------|-------------|
| `anthropic` | `anthropic.ts` | `AnthropicAdapter` |
| `openai` | `openai.ts` | `OpenAIResponsesAdapter` |
| `google` | `google.ts` | `GoogleAdapter` |
| `xai` | `openai-compatible.ts` | `OpenAICompatibleAdapter` |
| `mistral` | `openai-compatible.ts` | `OpenAICompatibleAdapter` |
| `perplexity` | `text-only.ts` | `TextOnlyAdapter` |
| `openrouter` | `default.ts` | `DefaultAdapter` (inherits target model's constraints) |
| *(unknown)* | `default.ts` | `DefaultAdapter` |

---

*This research plan is ready for engineering review and sprint planning. Implementation should begin with the OpenAI adapter (Phase 1) to address the highest-incident-rate provider first.*
