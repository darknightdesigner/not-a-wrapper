# Provider-Aware History Adaptation — Implementation Plan

> **Date**: February 13, 2026
> **Status**: ✅ Research Complete — Plan Revised After Adversarial Review
> **Last reviewed**: February 13, 2026 (post-adversarial review revision)
> **Scope**: Architecture for robust cross-provider message history replay
> **Related**: `app/api/chat/utils.ts` (current sanitization), `app/api/chat/route.ts` (chat route), ADR-002 (Vercel AI SDK)
> **Triggered by**: Production bug — OpenAI Responses API rejected replayed history with orphaned `web_search_call` items missing required `reasoning` pairs

---

## Research Status

All five research questions have been answered. Individual research documents contain full details; this plan is the consolidated single source of truth.

| # | Question | Status | Answered By | Key Finding |
|---|----------|--------|-------------|-------------|
| Q1 | Provider replay invariants | ✅ Complete (all 6 providers + OpenRouter) | `openai-replay-invariants.md`, `anthropic-replay-invariants.md`, `google-replay-invariants.md`, `xai-mistral-perplexity-replay-invariants.md` | Each provider enforces different invariants. OpenAI is strictest (atomic reasoning→tool pairing). Anthropic API auto-handles thinking. Google is strict on FC pairing (not permissive). xAI/Mistral share OpenAI-compatible format. Perplexity is text-only. |
| Q2 | Canonical history format | ✅ Answered | `ai-sdk-convert-messages.md`, `cross-turn-tool-artifacts.md` | Keep current rich `UIMessage[]` with full parts. Adapt on send, not at storage. All surveyed open-source projects validate this pattern. |
| Q3 | Part type treatment matrix | ✅ Complete (all 11 part types × 6 providers) | All research docs + `ai-sdk-convert-messages.md` §Part Type Mapping | See Section 2.3. Key correction: Google should **preserve** reasoning (converted to native `thought: true`), not strip it. |
| Q4 | Cross-turn tool artifacts | ✅ Answered | `cross-turn-tool-artifacts.md` | No cross-message tool pairs in our architecture. All tool state lives in one assistant UIMessage. `callProviderMetadata` is the root cause of replay failures. |
| Q5 | Same-provider vs switch behavior | ✅ Answered | All research docs | Adapter is keyed on **target** provider. Source provider detected from `callProviderMetadata` when needed. Same-provider replay can preserve more artifacts. |

### Supporting Research Documents

| Document | Scope | Key Contribution |
|----------|-------|-----------------|
| `openai-replay-invariants.md` | OpenAI Responses API pairing rules, error catalog, @ai-sdk/openai behavior | Atomic pairing decision tree (§7), ID stripping strategy (§8.4) |
| `anthropic-replay-invariants.md` | Anthropic thinking block rules, tool_use/tool_result pairing, @ai-sdk/anthropic behavior | Confirmed passthrough is correct; API auto-strips prior thinking (§1.2) |
| `google-replay-invariants.md` | Gemini FC pairing, thought signatures, role alternation, @ai-sdk/google behavior | Corrected "permissive" to "strict"; Gemini 3 thought signature requirements (§2) |
| `xai-mistral-perplexity-replay-invariants.md` | xAI, Mistral, Perplexity replay constraints | Shared `OpenAICompatibleAdapter` recommendation (§5.1); Mistral reasoning exists but not required |
| `ai-sdk-convert-messages.md` | `convertToModelMessages()` internals, three-layer pipeline | Confirmed adapters operate at Layer 1 (UIMessage); provider-agnostic conversion (§Pipeline) |
| `cross-turn-tool-artifacts.md` | Tool artifact storage, `providerExecuted` flag, `callProviderMetadata` flow | Identified `callProviderMetadata` as root cause; no `role: "tool"` in Convex (§5.4, §3.7) |
| `open-source-patterns.md` | Survey of LibreChat, LobeChat, Open WebUI, Chatbot UI, Jan, AI SDK | No project has solved this; our approach is architecturally novel (§Executive Summary) |

---

## Key Discoveries

Findings that changed the plan or were surprising:

1. **Google Gemini is STRICT, not permissive** — The original assumption was wrong. Gemini enforces strict `functionCall`/`functionResponse` count parity, strict role alternation, and 400 errors on violations. The Google adapter needs more rigor than initially planned. *(See `google-replay-invariants.md` §1)*

2. **Google converts reasoning to native thought format** — `@ai-sdk/google` turns `reasoning` parts into Gemini's `{ text, thought: true }` format automatically. This means reasoning from *any provider* can be preserved when replaying to Google — a significant quality improvement over our current strip-all approach. *(See `google-replay-invariants.md` §4)*

3. **Gemini 3 thought signatures are mandatory for FC** — Gemini 3 models require `thoughtSignature` on function call parts in the current turn. For cross-provider replay, the dummy value `"skip_thought_signature_validator"` must be injected. This is a new adapter requirement not anticipated in the original plan. *(See `google-replay-invariants.md` §2)*

4. **`callProviderMetadata` is the hidden root cause** — Provider-linked IDs (`msg_`, `rs_`, `ws_`, `fc_`) flow from stored UIMessage tool parts through `convertToModelMessages()` into `providerOptions` on ModelMessages. This is what triggers OpenAI's pairing validation errors. Stripping `callProviderMetadata` when target ≠ source is the highest-leverage fix. *(See `cross-turn-tool-artifacts.md` §5.4)*

5. **No `role: "tool"` messages exist in Convex** — Our schema only stores `user|assistant|system|data`. All tool artifacts live inside the assistant message's `parts` array. The `role: "tool"` ModelMessages are *synthesized at conversion time* by `convertToModelMessages()`. This simplifies adapter design — adapters only need to process assistant message parts. *(See `cross-turn-tool-artifacts.md` §3.7)*

6. **Our problem is novel in the ecosystem** — No surveyed open-source project (LibreChat, LobeChat, Open WebUI, Chatbot UI, Jan) has production-grade provider-aware history adapters. The Vercel AI SDK's own `pruneMessages` has the exact same bug (Issue #11036, open with no fix). We're pioneering this pattern. *(See `open-source-patterns.md` §Executive Summary)*

7. **Mistral DOES support reasoning** — Magistral models (since June 2025) produce `thinking` content chunks. However, replay is not required — thinking is an output artifact. The original plan said "No reasoning support" which was corrected. *(See `xai-mistral-perplexity-replay-invariants.md` §2.2)*

8. **xAI and Mistral can share an `OpenAICompatibleAdapter`** — Both follow OpenAI Chat Completions format for tools, use `tool_call_id` for pairing, don't require reasoning replay. Reduces adapter count from 7 to 6 distinct implementations. *(See `xai-mistral-perplexity-replay-invariants.md` §5.1)*

9. **Anthropic passthrough is validated as correct** — The API auto-strips thinking blocks from prior turns. Only active tool use loops need preserved thinking blocks — and the AI SDK handles this internally during `streamText()`. Our current `sanitizeMessagesForProvider("anthropic") → return as-is` is the right approach. *(See `anthropic-replay-invariants.md` §5.3, §6)*

10. **Adapter should be async** — Though current implementations are synchronous, the async signature allows future model capability lookups, and the caller already awaits `convertToModelMessages()`. Zero cost. *(See Section 3.1.5 Gap 1)*

11. **`ignoreIncompleteToolCalls` is NOT set in the route** — The `convertToModelMessages()` call at `route.ts:373` passes no options, defaulting `ignoreIncompleteToolCalls` to `false`. If a user aborts a stream and immediately sends a new message, incomplete tool parts (`state: "input-streaming"` or `state: "input-available"`) could reach conversion and trigger `MissingToolResultsError`. This must be fixed immediately (1-line change) independent of the adapter work. *(See `ai-sdk-convert-messages.md` §9)*

12. **`step-start` is an unstable SDK implementation detail** — `StepStartUIPart` is `{ type: "step-start" }` with no payload, no documentation, and no stability guarantee. The OpenAI adapter's block-level logic depends on it as a delimiter. If the SDK changes or removes this mechanism, block detection breaks silently. Adapters should use `step-start` as the primary delimiter but detect block boundaries from content semantics (reasoning→tool transitions) as a fallback. *(See `cross-turn-tool-artifacts.md` §5.7)*

13. **OpenRouter users get the worst experience under strip-all** — OpenRouter model IDs encode the underlying provider (e.g., `anthropic/claude-4-opus`, `openai/gpt-5.2`). The adapter registry should parse model IDs to detect the underlying provider and route to the appropriate adapter, not the default strip-all. This is the highest-leverage improvement for multi-provider users per engineering hour.

---

## Executive Summary

1. **Root cause confirmed**: Our canonical history stores all AI SDK `UIMessage` parts (reasoning, tool invocations, step markers, sources). When replayed to a different provider — or even the same provider on a follow-up turn — provider-specific invariants about part ordering and pairing are violated. The specific trigger is `callProviderMetadata` carrying provider-linked IDs (`msg_`, `rs_`, `ws_`) through `convertToModelMessages()` into `providerOptions`. *(See `cross-turn-tool-artifacts.md` §5.4)*

2. **Current fix is brittle**: `sanitizeMessagesForProvider()` uses a binary Anthropic-vs-everyone-else filter. It strips *all* tool/reasoning parts for non-Anthropic providers, which destroys tool-use context that models like GPT-5.2 and Gemini can actually leverage. Research shows Google can consume reasoning natively as `thought: true` parts, and xAI/Mistral can use tool history.

3. **The problem is structural**: Provider APIs enforce different replay contracts — Anthropic requires tool pairing + handles thinking lifecycle automatically; OpenAI Responses API requires atomic reasoning→tool→result triples; Google Gemini enforces strict FC/FR count parity and role alternation. All three are strict; none are "permissive." *(See individual provider research docs)*

4. **Three architecture options identified**: (A) sanitize-on-send with per-provider adapters, (B) dual-track storage (canonical + provider-replay views), (C) provider-specific transcript builders with a shared AST.

5. **Recommended approach**: Option A (sanitize-on-send) with provider adapter contracts — lowest migration cost, highest correctness per provider, testable via contract tests. **Validated against all research findings and open-source survey.** No surveyed project (LibreChat, LobeChat, Open WebUI, Chatbot UI, Jan) has this capability. *(See `open-source-patterns.md`)*

6. **Key insight**: "Canonical history" and "provider replay input" are fundamentally different concerns. Canonical history is for UI rendering, observability, and persistence. Provider replay input must satisfy strict per-provider invariants.

7. **Tool artifacts are simpler than expected**: All tool state lives in a single assistant UIMessage (no `role: "tool"` in Convex). `convertToModelMessages()` synthesizes the paired ModelMessages. Adapters operate on the flat `parts` array. *(See `cross-turn-tool-artifacts.md` §3.7)*

8. **Validation is the highest-leverage investment**: Contract tests per provider will catch replay regressions before production, and the test matrix is enumerable (12 scenarios × 30 source×target cells). *(See Section 4.2)*

9. **Observability gaps exist**: We have no structured logging for replay-shape mutations, no metrics on how often sanitization fires, and no alerting on provider rejection patterns.

10. **Rollout can be phased**: Start with OpenAI adapter (highest incident rate), then extend to other providers, with feature flags and A/B comparison of old vs new sanitization. Shared `OpenAICompatibleAdapter` for xAI + Mistral reduces total adapter count to 6 distinct implementations.

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
| **OpenAI** (Responses API) | **Atomic pairing** — reasoning must immediately precede its paired tool/message item; bidirectional (orphaned in either direction rejected) | **Strict** — `function_call` ↔ `function_call_output` via `call_id`; parallel calls must be grouped (all calls → all outputs, no interleaving) | `reasoning` → `tool_call` → `tool_result` is an atomic triple; provider IDs (`msg_`/`rs_`/`ws_`/`fc_`) create cross-response linkage. *See `openai-replay-invariants.md`* |
| **Anthropic** | **Required** during active tool loops (400 error + cryptographic signature verification); **auto-stripped** by API for prior completed turns | **Strict** — every `tool_use` must pair with `tool_result` in next message; `tool_use_id` must match; `tool_result` before text in user msgs | API auto-strips prior thinking from context window; `@ai-sdk/anthropic` handles tool-loop thinking internally. Passthrough is correct. *See `anthropic-replay-invariants.md`* |
| **Google Gemini** | **Converted to native `thought: true`** by `@ai-sdk/google`; Gemini 3: mandatory `thoughtSignature` on current-turn FC; 2.5: optional; prior-turn signatures not validated | **Strict** — `functionCall` ↔ `functionResponse` count parity enforced (400 error); strict role alternation (consecutive same-role = 400) | Gemini 3: use `"skip_thought_signature_validator"` for cross-provider FC replay. *See `google-replay-invariants.md`* |
| **xAI (Grok)** | Not required (output-only in Chat Completions); encrypted reasoning via Responses API optional | OpenAI-compatible `tool_calls` + `tool` role; `tool_call_id` pairing required | `presencePenalty`/`frequencyPenalty`/`stop` rejected on reasoning models. *See `xai-mistral-perplexity-replay-invariants.md` §1* |
| **Mistral** | Not required (Magistral `thinking` chunks are output artifacts, not replay inputs) | `tool_calls` + `tool` role with `tool_call_id` + `name` (both required); parallel and successive calling | Magistral reasoning exists since June 2025 but replay not required. *See `xai-mistral-perplexity-replay-invariants.md` §2* |
| **Perplexity** | No model reasoning (`reasoning_steps` are search pipeline artifacts) | No user-defined tool calling (Sonar API) | Clean text-only replay. *See `xai-mistral-perplexity-replay-invariants.md` §3* |
| **OpenRouter** | Depends on underlying model | Depends on underlying model | Passthrough — inherits target provider's constraints |

**Status**: All providers empirically researched via documentation, SDK source, and GitHub issues. See individual research documents for full evidence.

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

\* OpenAI: Reasoning + tool pairs must be kept together or dropped together. Cannot keep one without the other. Provider-specific IDs (`msg_`/`rs_`/`ws_`/`fc_`) must be stripped. *(See `openai-replay-invariants.md` §2, §7, §8.4)*
\** Google: Tool calls must be paired with results (strict count parity — 400 error). For Gemini 3, function call parts require `thoughtSignature` (use `"skip_thought_signature_validator"` for cross-provider replay). *(See `google-replay-invariants.md` §1, §2)*
\*** xAI/Mistral: Drop reasoning, keep tool pairs if both invocation + result exist, drop orphans. Mistral additionally requires `name` field on tool results. *(See `xai-mistral-perplexity-replay-invariants.md` §1.3, §2.3)*
† Google: `@ai-sdk/google` converts `reasoning` parts to Gemini's native `{ text, thought: true }` format. This preserves reasoning context and improves response quality. Thought signatures from prior turns are NOT validated — only current-turn FC needs valid signatures. *(See `google-replay-invariants.md` §4)*
‡ `source-url` and `source-document` are silently dropped by `convertToModelMessages()` — adapters don't strictly need to strip them, but should for observability accuracy. *(See `ai-sdk-convert-messages.md` §Part Type Mapping)*
§ `callProviderMetadata` carries provider-linked IDs (e.g., `msg_`, `rs_`, `ws_`) that create cross-response linkage. Must be stripped when target provider differs from source to prevent pairing validation errors. *(See `cross-turn-tool-artifacts.md` §5.4)*

### 2.4 Cross-Turn Tool Artifact Representation

> **Q4**: How should tool-call artifacts be represented when they span turns?
> **Status**: ✅ Answered — See `cross-turn-tool-artifacts.md` for full analysis

**Key findings**:

1. **Tool pairs do NOT span messages in our architecture.** Our Convex schema stores only `user|assistant|system|data` roles — no `role: "tool"` messages. All tool artifacts (call + result) live inside a single assistant UIMessage's `parts` array, delimited by `step-start` markers. The `role: "tool"` ModelMessages are *synthesized* by `convertToModelMessages()` during the conversion step.

2. **`convertToModelMessages()` handles splitting correctly.** It processes `step-start` blocks within each assistant UIMessage, producing paired `{role: "assistant"}` + `{role: "tool"}` ModelMessages per block. One stored UIMessage with 3 tool steps becomes ~7 ModelMessages (3 assistant+tool pairs + 1 final assistant).

3. **`providerExecuted` flag changes the replay shape.** Provider-executed tools (OpenAI `web_search`, Google `code_execution`) have their `tool-result` inlined in the assistant ModelMessage content — no separate `role: "tool"` message. SDK-executed tools (MCP, Exa) produce separate `role: "tool"` ModelMessages. Adapters must be aware of this distinction when deciding what to keep/drop.

4. **`callProviderMetadata` is the root cause of replay failures.** Provider-linked IDs (`msg_`, `rs_`, `ws_`, `fc_`) flow from stored UIMessage tool parts through `providerMetadata` → `providerOptions` into ModelMessages. When replayed to a different provider (or even the same provider in a new session), these IDs trigger pairing validation errors. **The adapter MUST strip `callProviderMetadata` when target ≠ source.**

5. **No consolidation needed.** Since all tool state is already within a single message, there is no cross-message consolidation requirement. The adapter operates on the flat `parts` array of each assistant UIMessage.

**Implications for adapter design**: See `cross-turn-tool-artifacts.md` §6 for the complete list of shapes adapters must handle (10 distinct shapes, from text-only to mixed provider+SDK tools with failed calls).

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

**Gap 6: Non-Final Tool State Handling**

Tool parts can have non-final states (`input-streaming`, `input-available`, `approval-requested`) if an abort/disconnect races with the next user message. The `ai-sdk-convert-messages.md` §9 confirms that `convertToModelMessages()` only filters these when `ignoreIncompleteToolCalls: true` is set — which is NOT currently set in our route.

**Resolution**: Two-layer defense:
1. **Immediate fix**: Pass `ignoreIncompleteToolCalls: true` to `convertToModelMessages()` in `route.ts` (1-line change, deploy immediately)
2. **Adapter contract**: All adapters MUST drop tool parts with non-final states before applying provider-specific logic. A shared utility `isToolPartFinal()` checks for `output-available`, `output-error`, or `output-denied` states. This is documented in the adapter contract (Appendix C) and implemented as a shared pre-filter.

**Gap 7: OpenRouter Meta-Provider Resolution**

OpenRouter is assigned to `DefaultAdapter` (strip-all), but OpenRouter model IDs encode the underlying provider (e.g., `anthropic/claude-4-opus` → Anthropic). Users routing through OpenRouter to known providers get unnecessarily degraded experience.

**Resolution**: The adapter registry's `adaptHistoryForProvider()` function detects OpenRouter and parses the model ID (available via `context.targetModelId`) to resolve the underlying provider. Known prefixes (`anthropic`, `openai`, `google`, `xai`, `mistral`) route to their respective adapters; unknown prefixes fall back to `DefaultAdapter`. See updated Appendix C and Appendix D.

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

**Issue 6 (MEDIUM): `step-start` Block Detection Resilience**

The OpenAI adapter's core logic groups parts by `step-start` boundaries. `StepStartUIPart` is an SDK implementation detail with no documentation, no stability guarantee, and no formal specification. If the SDK changes, adds metadata to, or removes `step-start`, the block detection breaks silently.

**Recommendation**: The adapter should use `step-start` as the primary delimiter but implement content-semantic fallback detection:
- A `reasoning` part following a completed tool result implies a block boundary
- A `text` part following a completed tool result implies a block boundary
- If no `step-start` markers are present in a multi-tool message, fall back to semantic detection

This adds ~20-30 lines to the OpenAI adapter but prevents silent breakage if the SDK changes the delimiter mechanism.

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
3. **Leverages AI SDK** — Stays on the `convertToModelMessages()` path, benefiting from SDK updates. Research confirms adapters should operate at Layer 1 (UIMessage level). *(See `ai-sdk-convert-messages.md` §Pipeline)*
4. **Matches codebase patterns** — The provider map (`lib/openproviders/provider-map.ts`) already routes by provider ID.
5. **Incremental adoption** — Can ship one adapter at a time, starting with OpenAI.
6. **Validated by ecosystem survey** — LibreChat's per-client `buildMessages()` validates the per-provider pattern. No surveyed project has our invariant enforcement layer, confirming this is both novel and needed. *(See `open-source-patterns.md` §9)*
7. **Shared adapters reduce scope** — xAI and Mistral can share `OpenAICompatibleAdapter`, reducing total adapter count to 6 distinct implementations. *(See `xai-mistral-perplexity-replay-invariants.md` §5.1)*

Option C is the ideal long-term architecture but requires 3-4x the effort and bypasses the AI SDK's conversion pipeline. Consider migrating to C in a future quarter if adapter complexity grows. The emerging Open Responses specification (openresponses.org) could also influence long-term direction. *(See `open-source-patterns.md` §7)*

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
                     │  Anthropic  │  OpenAI  │  Google    │  xAI  │  Mistral  │  Perplexity
Source Provider      │             │          │            │       │           │
─────────────────────┼─────────────┼──────────┼────────────┼───────┼───────────┼────────────
Anthropic            │  pass-thru  │  strip R │  keep R†   │ strip │  strip R  │  text-only
OpenAI               │  keep all   │  pair RT │  pair RT†  │ pair T│  pair T   │  text-only
Google               │  keep all   │  strip R │  pass-thru │ strip │  strip R  │  text-only
xAI                  │  keep all   │  strip R │  keep R†   │ pass  │  strip R  │  text-only
Mistral              │  keep all   │  strip R │  keep R†   │ strip │  pass     │  text-only

R = reasoning parts, T = tool pairs, RT = reasoning-tool atomic triples
† Google keeps reasoning (converted to thought: true) and requires FC/FR parity + role alternation
```

Test scenarios for each cell:
1. **Text-only history** — Baseline (should always pass)
2. **History with reasoning** — Tests reasoning preservation/stripping
3. **History with tool calls** — Tests tool pair handling
4. **History with reasoning + tool chains** — Tests the OpenAI paired invariant
5. **History with mixed sources** — Previous messages from provider X, new request to provider Y
6. **Long history** — 50+ messages with interleaved tool usage
7. **Provider-executed vs SDK-executed tools** — Tests `providerExecuted` flag handling *(from `cross-turn-tool-artifacts.md` §2.3)*
8. **Parallel tool calls in single step** — Tests multi-tool block handling *(from `openai-replay-invariants.md` §2.4, `google-replay-invariants.md` §1)*
9. **Failed tool calls (`output-error`)** — Tests error tool part pairing *(from `cross-turn-tool-artifacts.md` §5.1)*
10. **`callProviderMetadata` stripping** — Tests provider ID removal on cross-provider replay *(from `cross-turn-tool-artifacts.md` §5.4)*
11. **Gemini 3 thought signature injection** — Tests dummy signature insertion for cross-provider FC replay to Gemini 3 *(from `google-replay-invariants.md` §2)*
12. **Role alternation validation (Google)** — Tests that adapter prevents consecutive same-role messages after stripping *(from `google-replay-invariants.md` §1)*

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

### 4.5 Pipeline Smoke Tests (New — Adversarial Review M2)

> **Rationale**: Contract tests validate adapters in isolation. The production Batman bug would have *passed* contract tests — the adapter would have correctly kept `web_search_call` parts, and the test would confirm "tool parts preserved." The failure was downstream, in `convertToModelMessages()` passing through `callProviderMetadata` IDs that OpenAI rejected. Pipeline tests close this gap.

Pipeline smoke tests pass adapter output through `convertToModelMessages()` and validate the resulting `ModelMessage[]` structure **without making API calls**. They run in CI alongside contract tests.

```typescript
// adapters/__tests__/pipeline.test.ts

describe("adapter → convertToModelMessages pipeline", () => {
  for (const [name, adapter] of Object.entries(adapters)) {
    describe(name, () => {
      it("produces valid ModelMessages after conversion", async () => {
        const adapted = await adapter.adaptMessages(fixtureMessages, context)
        const modelMessages = await convertToModelMessages(adapted.messages, {
          ignoreIncompleteToolCalls: true,
        })

        // No provider-linked IDs leaked through
        expect(hasProviderLinkedResponseIds(modelMessages)).toBe(false)

        // Every tool-call has a matching tool-result
        assertToolCallsHaveResults(modelMessages)

        // No empty content arrays
        assertNoEmptyContent(modelMessages)
      })

      it("handles cross-provider history without provider ID leakage", async () => {
        const adapted = await adapter.adaptMessages(crossProviderFixtures, context)
        const modelMessages = await convertToModelMessages(adapted.messages)
        expect(hasProviderLinkedResponseIds(modelMessages)).toBe(false)
      })
    })
  }
})
```

**Test categories**:
1. **Structural validity**: Every adapter's output, after conversion, produces well-formed ModelMessages
2. **Provider ID hygiene**: No `msg_`/`rs_`/`ws_`/`fc_` IDs survive the adapter→conversion pipeline for cross-provider cases
3. **Tool pairing completeness**: Every tool-call content part has a corresponding tool-result
4. **Non-empty content**: No ModelMessages with empty content arrays (would produce provider API errors)

These tests catch the class of bug where the adapter produces valid UIMessages but `convertToModelMessages()` produces invalid ModelMessages.

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

Pattern-match known replay-shape error messages (verified from research):

- **OpenAI**: `"was provided without its required"`, `"No tool output found for function call"`, `"invalid input message"` *(See `openai-replay-invariants.md` §5 for full error catalog)*
- **Anthropic**: `"thinking block must be followed by"`, `"tool_use block must be followed by tool_result"`, signature verification failure *(See `anthropic-replay-invariants.md` §5.1)*
- **Google**: `"number of function response parts is equal to"`, `"function call turns come immediately after"`, `"function response turn comes immediately after"`, `"missing a thought_signature"` (Gemini 3) *(See `google-replay-invariants.md` §5)*

---

## 6. Rollout Plan

> **Revised** after adversarial architecture review. Key changes from previous version:
> - Added Phase 0 (immediate pre-adapter fix for `ignoreIncompleteToolCalls`)
> - Added shadow-mode validation during feature flag period
> - Added pipeline smoke tests to Phase 1 (catches the class of bug that caused the production incident)
> - Added OpenRouter provider detection to Phase 2
> - Added step-start resilience to OpenAI adapter
> - Google adapter effort increased (3h → 4.5h) — structural validation tier
> - Added Phase 5 (token budget awareness) as a planned future phase
> - Feature flag expanded to three states: `false` / `shadow` / `true`
> - Total effort increased from 37h to ~47.5h (~6 eng-days)

### Phase 0: Immediate Pre-Adapter Fix (Day 1)

**Goal**: Close the `ignoreIncompleteToolCalls` race window immediately, independent of adapter work.

**Steps**:
1. Pass `ignoreIncompleteToolCalls: true` to `convertToModelMessages()` in `route.ts`

```typescript
// route.ts — 1-line change
let modelMessages = await convertToModelMessages(sanitizedMessages, {
  ignoreIncompleteToolCalls: true,
})
```

**Effort**: 15 minutes
**Risk**: None — this is a defensive option that filters incomplete tool states before conversion
**Deploy**: Immediately, no feature flag needed

### Phase 1: OpenAI Adapter + Foundation (Week 1)

**Goal**: Replace the binary sanitization with a proper OpenAI adapter that handles reasoning-tool pairs. Validate the full adapter→conversion pipeline.

**Steps**:
1. Create `app/api/chat/adapters/types.ts` — Define `ProviderHistoryAdapter`, `AdaptationResult` (with `warnings`), `AdaptationContext` (with `maxHistoryTokens`), `AdaptationWarning`, shared utilities (`isToolPartFinal()`)
2. Create `app/api/chat/adapters/openai.ts` — OpenAI Responses API adapter (reasoning-tool pairing, `step-start` block awareness with semantic fallback, `callProviderMetadata` stripping, parallel call grouping, ID stripping)
3. Create `app/api/chat/adapters/default.ts` — Default adapter (current strip-all behavior)
4. Create `app/api/chat/adapters/anthropic.ts` — Anthropic near-passthrough adapter
5. Create `app/api/chat/adapters/index.ts` — Registry + `adaptHistoryForProvider()` entry point (with OpenRouter resolution prep)
6. Create `adapters/__tests__/fixtures.ts` — Realistic message shapes from `cross-turn-tool-artifacts.md` §3 (10 shape categories)
7. Write contract tests in `adapters/__tests__/openai.test.ts` (10-12 cases including parallel calls, `callProviderMetadata`, `providerExecuted` flag, non-final tool states)
8. Write pipeline smoke tests in `adapters/__tests__/pipeline.test.ts` — adapter output → `convertToModelMessages()` → validate ModelMessage structure (Section 4.5)
9. Write regression test reproducing Batman production bug (exact message shapes from production)
10. Integrate adapters into `route.ts` with **three-state feature flag** and **shadow-mode validation** (keep `sanitizeMessagesForProvider()` as fallback)
11. Deploy to preview, manual testing with OpenAI models (reasoning + tool flows)

**Feature flag**: `HISTORY_ADAPTER_V2` with three states:
- `false` (default) — Legacy `sanitizeMessagesForProvider()` path
- `shadow` — Legacy path **plus** adapter runs in parallel; differences logged as `adapter_shadow_diff` events
- `true` — Adapter path replaces legacy

```typescript
// Shadow mode in route.ts — validates adapter against real traffic
const legacyResult = sanitizeMessagesForProvider(messages, provider)
const adapterResult = await adaptHistoryForProvider(messages, provider, context)

if (process.env.HISTORY_ADAPTER_V2 === "shadow") {
  const diff = compareAdaptationOutputs(legacyResult, adapterResult.messages)
  if (diff.hasDifferences) {
    console.log(JSON.stringify({ _tag: "adapter_shadow_diff", chatId, provider, ...diff }))
  }
  modelMessages = await convertToModelMessages(legacyResult, { ignoreIncompleteToolCalls: true })
} else if (process.env.HISTORY_ADAPTER_V2 === "true") {
  modelMessages = await convertToModelMessages(adapterResult.messages, { ignoreIncompleteToolCalls: true })
} else {
  modelMessages = await convertToModelMessages(legacyResult, { ignoreIncompleteToolCalls: true })
}
```

**Rollback**: Set flag to `false`, reverts to current binary sanitization
**Success criteria**: Zero `replay_shape_error` events for OpenAI in 48 hours; shadow-mode diff logs reviewed

### Phase 2: Provider-Specific Adapters (Week 2)

**Goal**: Add adapters for Google, xAI, Mistral, Perplexity. Add OpenRouter provider detection.

**Steps**:
1. Create `app/api/chat/adapters/google.ts` — Google Gemini adapter (strict FC pairing, role alternation validation, Gemini 3 `thoughtSignature` injection, reasoning→`thought: true` preservation). **Note**: This is a "Structural" tier adapter — it requires post-transformation validation, not just per-part filtering. See Section 8 (Adapter Complexity Tiers).
2. Create `app/api/chat/adapters/openai-compatible.ts` — Shared adapter for xAI + Mistral (drop reasoning, keep tool pairs, drop orphans, ensure `name` on tool results)
3. Create `app/api/chat/adapters/text-only.ts` — Perplexity adapter (strip everything except text)
4. Register all adapters in `index.ts` + **add OpenRouter provider detection** (xAI → `OpenAICompatibleAdapter`, Mistral → `OpenAICompatibleAdapter`, OpenRouter → resolve underlying provider from model ID)
5. Write contract tests: `google.test.ts` (FC parity, role alternation, thought signatures), `openai-compatible.test.ts`, `text-only.test.ts`
6. Write pipeline smoke tests for all new adapters in `pipeline.test.ts`
7. Build `cross-provider.test.ts` — full source×target matrix (12 scenarios × key cells)

**OpenRouter detection** (in `adapters/index.ts`):

```typescript
const KNOWN_UNDERLYING_PROVIDERS = ["anthropic", "openai", "google", "xai", "mistral"] as const

function extractUnderlyingProvider(modelId: string): string | null {
  // "anthropic/claude-4-opus" → "anthropic"
  // "openai/gpt-5.2" → "openai"
  // "meta-llama/llama-4-maverick" → null (unknown, use default)
  const prefix = modelId.split("/")[0]
  return KNOWN_UNDERLYING_PROVIDERS.includes(prefix as any) ? prefix : null
}

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

**Feature flag**: Same `HISTORY_ADAPTER_V2` flag
**Success criteria**: Full test matrix passing, zero replay errors across all providers, OpenRouter routing validated

### Phase 3: Observability + Hardening (Week 2-3)

**Goal**: Add structured logging, metrics, and replay-shape error detection.

**Steps**:
1. Add `history_adapt` structured log to adapter pipeline (including `warnings` array from `AdaptationResult`)
2. Add `replay_shape_error` detection to error handler
3. Add PostHog events for adaptation metrics
4. Create dashboard for replay health monitoring
5. Set up alerts for replay-shape errors and tool explosions

### Phase 4: Cleanup (Week 3)

**Goal**: Remove feature flag, delete old sanitization code, update documentation.

**Steps**:
1. Remove `HISTORY_ADAPTER_V2` flag (adapters are now the default)
2. Remove old `sanitizeMessagesForProvider()` binary logic
3. Remove shadow-mode comparison code
4. Update `app/api/CLAUDE.md` and glossary with adapter patterns
5. Add ADR for the adapter architecture decision

### Phase 5: Token Budget Awareness (Month 2-3, Planned)

> **Deferred**: Define the `maxHistoryTokens` field in `AdaptationContext` now (Phase 1) so the interface doesn't change later, but defer implementation until context window overflow becomes a reported issue. The adversarial review's analysis shows full preservation can increase history tokens by ~11x in heavy tool-use conversations, which is manageable on 128k+ models but problematic on 32k models (Mistral).

**Goal**: Add optional token budget management to adapters.

**When to implement**: When token budget management becomes a top-3 user complaint, or when a 32k-context model is added with significant tool-use traffic.

**Steps**:
1. Implement token estimation per provider (requires tokenizer awareness — `tiktoken` for OpenAI, approximation for others)
2. When `maxHistoryTokens` is set, adapters degrade older tool triples to text summaries if full preservation exceeds the budget (oldest first)
3. Add `tokenBudgetExceeded` to `AdaptationWarning` codes
4. Add observability for token budget utilization

**Effort estimate**: 8-12h (not 4h — proper token counting requires per-provider tokenizer integration)

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

## 8. Adapter Complexity Tiers (New)

> **Added** after adversarial review. The review correctly identified that the Google adapter is a different complexity class than simpler adapters. Categorizing adapters by complexity tier sets honest expectations for maintenance burden and helps future contributors understand what they're modifying.

| Tier | Adapters | Complexity | Key Characteristic | Estimated Effort |
|------|----------|------------|-------------------|-----------------|
| **Simple** | `TextOnlyAdapter`, `DefaultAdapter` | Part filtering only | Drop/keep decisions per part type, no structural checks | 0.5-1h |
| **Standard** | `AnthropicAdapter`, `OpenAICompatibleAdapter` | Part filtering + pairing checks | Warn on orphaned pairs, strip SDK artifacts | 1-2h |
| **Complex** | `OpenAIResponsesAdapter` | Block-level atomic triple enforcement | Keep-or-drop-entire-block logic, step-start awareness with semantic fallback, parallel call grouping | 4-5h |
| **Structural** | `GoogleAdapter` | Post-transformation structural validation | Validates and repairs the resulting message sequence after filtering (role alternation, FC/FR parity, thought signature injection) | 4.5-5h |

**Why this matters**: When a new provider's API requires post-transformation structural validation (like Google's role alternation check), it belongs in the **Structural** tier. The adapter interface accommodates this — all tiers implement the same `ProviderHistoryAdapter` contract — but the implementation complexity and testing burden are significantly higher.

**Prediction**: As provider APIs get stricter (xAI migrating to Responses API, Open Responses spec), more adapters will move from Standard to Complex or Structural tier. If three or more adapters need post-transformation structural validation, reassess the architecture (see Section 9).

---

## 9. Future Reassessment Triggers (New)

> **Added** after adversarial review. These are concrete conditions under which the Option A architecture should be reassessed. Set calendar reminders.

| Trigger | Reassess Toward | Why |
|---------|----------------|-----|
| **Three or more adapters need post-transformation structural validation** (like Google's role alternation check) | Option C (AST builders) | The "sanitize-on-send" abstraction is leaking; adapters are becoming transcript builders |
| **Open Responses spec reaches v1.0 with SDK support** | Option C or native Open Responses targeting | A standard intermediate format would provide what Option C's AST was trying to create |
| **Token budget management becomes a top-3 user complaint** | Phase 5 implementation or Option C | Option C provides genuinely superior capability for graduated summarization |
| **A new SDK major version (v7) breaks adapter assumptions** | Option C (own the conversion pipeline) | If SDK conversion changes break adapters once, it'll happen again |
| **OpenAI fully deprecates Chat Completions for new models** | Responses API-native adapter or Option C | The adapter-per-provider model may need to account for API format migration within a single provider |

**Current status (February 2026)**: None of these triggers are active. The Open Responses spec is emerging but pre-v1. All adapters are in the Simple-Structural range. Token budgets are not a reported issue.

---

## Prioritized "First 2 Weeks" Action List

> **Revised** after adversarial architecture review. Key changes from previous version:
> - Phase 0 added: immediate `ignoreIncompleteToolCalls` fix (15 min)
> - Pipeline smoke tests added to Week 1 (catches the class of bug that caused the production incident)
> - Shadow-mode validation added to feature flag integration
> - OpenRouter provider detection added to Week 2
> - OpenAI adapter includes step-start resilience (semantic fallback)
> - Google adapter effort increased (3h → 4.5h) — Structural tier complexity
> - Non-final tool state handling added to adapter contract
> - Test matrix expanded to include pipeline tests
> - Total effort: 37h → ~47.5h (~6 eng-days)

### Day 1: Immediate Fix

| # | Task | Effort | Owner | Depends On |
|---|------|--------|-------|------------|
| 0 | Pass `ignoreIncompleteToolCalls: true` to `convertToModelMessages()` in `route.ts` | 0.25h | — | — |

**Day 1 total**: ~0.25h — Deploy immediately

### Week 1: Foundation

| # | Task | Effort | Owner | Depends On |
|---|------|--------|-------|------------|
| 1 | Define `ProviderHistoryAdapter` interface and types — includes `AdaptationWarning`, `readonly` params, `maxHistoryTokens` field (deferred impl), `isToolPartFinal()` utility, non-final state handling in contract JSDoc (Appendix C) | 2.5h | — | — |
| 2 | Create `fixtures.ts` with realistic message shapes from `cross-turn-tool-artifacts.md` §3 (10 shape categories), including non-final tool states and cross-provider `callProviderMetadata` | 2h | — | 1 |
| 3 | Implement OpenAI adapter: atomic reasoning→tool→result triples, `step-start` block awareness **with semantic fallback detection**, `callProviderMetadata` stripping, parallel call grouping, ID stripping, non-final state pre-filter | 5h | — | 1 |
| 4 | Implement Anthropic near-passthrough adapter: strip `step-start` only, defensive tool-pairing validation (warn, don't error), non-final state pre-filter | 1h | — | 1 |
| 5 | Implement default adapter (current strip-all behavior as fallback for unknown providers) | 1h | — | 1 |
| 6 | Create adapter registry with provider-to-adapter mapping + `adaptHistoryForProvider()` entry point (with OpenRouter resolution prep) | 1.5h | — | 1, 3-5 |
| 7 | Write contract tests for OpenAI adapter (10-12 cases including parallel calls, `callProviderMetadata`, `providerExecuted` flag, non-final tool states) | 3h | — | 2, 3 |
| 7b | Write **pipeline smoke tests** — adapter output → `convertToModelMessages()` → validate ModelMessage structure, provider ID hygiene, tool pairing completeness (Section 4.5) | 3h | — | 2, 3-5 |
| 8 | Write regression test reproducing Batman production bug (exact message shapes from production) | 1h | — | 2, 3 |
| 9 | Integrate adapters into `route.ts` with **three-state feature flag** (`false`/`shadow`/`true`) and **shadow-mode validation** — runs both paths, logs differences | 3h | — | 6 |
| 10 | Deploy to preview, manual testing with OpenAI models (reasoning + tool flows) | 2h | — | 9 |

**Week 1 total**: ~25h (3.1 eng-days)

### Week 2: Coverage + Observability

| # | Task | Effort | Owner | Depends On |
|---|------|--------|-------|------------|
| 11 | Implement Google adapter (**Structural tier**): strict FC/FR parity, role alternation validation + placeholder injection, Gemini 3 `thoughtSignature` injection with model-family branching, reasoning→`thought: true` preservation, non-final state pre-filter | 4.5h | — | 1 |
| 12 | Implement `OpenAICompatibleAdapter` (shared for xAI + Mistral): drop reasoning, keep tool pairs, drop orphans, ensure `name` on tool results, non-final state pre-filter | 2h | — | 1 |
| 13 | Implement `TextOnlyAdapter` (Perplexity + future text-only providers): strip everything except text | 0.5h | — | 1 |
| 14 | Register all adapters in `index.ts` + **implement OpenRouter provider detection** (parse model ID → resolve underlying provider → route to appropriate adapter) | 2.5h | — | 11-13 |
| 15 | Write contract tests: `google.test.ts` (FC parity, role alternation, thought signatures), `openai-compatible.test.ts`, `text-only.test.ts` | 3h | — | 2, 11-13 |
| 15b | Write pipeline smoke tests for all Week 2 adapters in `pipeline.test.ts` | 1h | — | 11-13 |
| 16 | Build `cross-provider.test.ts` — full source×target matrix (12 scenarios × key cells), including OpenRouter routing cases | 3h | — | 7, 15 |
| 17 | Add `history_adapt` structured logging to adapter pipeline (Section 5.1 format, including `warnings` array) | 2h | — | 6 |
| 18 | Add `replay_shape_error` detection in `streamText` error handler + PostHog events | 2h | — | 17 |
| 19 | Enable flag as `shadow` in production, review diff logs for 24h, then switch to `true` with 48h monitoring | — | — | All above |
| 20 | Remove flag, remove shadow-mode code, clean up old `sanitizeMessagesForProvider()`, update docs (CLAUDE.md, glossary, ADR) | 2h | — | 19 |

**Week 2 total**: ~22.5h (2.8 eng-days)

### Total Estimated Effort: ~6 engineering days (47.5 hours)

| Phase | Effort | Change from Previous |
|-------|--------|---------------------|
| Phase 0 (immediate fix) | 0.25h | **New** |
| Week 1 (foundation) | 25h | +6h (pipeline tests, shadow mode, step-start resilience, non-final states) |
| Week 2 (coverage) | 22.5h | +4.5h (OpenRouter detection, pipeline tests, Google adapter bump) |
| **Total** | **47.5h** | **+10.5h from previous 37h** |

The additional ~10.5h buys: pipeline tests that catch the production bug class, shadow-mode validation against real traffic, OpenRouter user experience, step-start resilience, incomplete tool state handling, and a cleaner adapter contract.

---

## Appendix A: OpenAI Responses API Replay Invariants (Verified)

> Source: `openai-replay-invariants.md` — exhaustive research from OpenAI docs, SDK source, community reports, and GitHub issues

### Hard Invariants (400 `invalid_request_error` on Violation)

1. **Reasoning→Item pairing**: A `reasoning` item (`rs_*`) MUST be immediately followed by its paired item (`function_call`, `web_search_call`, `file_search_call`, `computer_call`, `code_interpreter_call`, or `message`). Orphaned reasoning at the end of input is rejected.

2. **Item→Reasoning pairing** (bidirectional): A tool call item that was originally generated alongside reasoning MUST have its preceding `reasoning` item present. Error: `"Item 'fc_...' was provided without its required 'reasoning' item: 'rs_...'"`.

3. **Function call→Output pairing**: Every `function_call` must eventually be followed by a `function_call_output` with matching `call_id`. Error: `"No tool output found for function call 'fc_...'"`.

4. **Parallel call grouping**: When a model makes parallel function calls, replay order MUST be: `[reasoning, call_1, call_2, ..., output_1, output_2, ...]`. Interleaving calls with outputs is rejected (misleading "missing reasoning item" error).

5. **Reasoning→Message pairing**: If a `message` is immediately preceded by a `reasoning` item, both must be included together and in order, or both omitted.

### Safe Behaviors

6. **Text-only messages**: Plain `message` items with text content (no tool calls, no reasoning) are always safe to replay.

7. **`code_interpreter` exception**: When `code_interpreter` was called, do NOT include the `reasoning_id` — only reference the `message_id`.

### ID Stripping Requirements

8. **Provider-specific IDs** (`msg_`, `rs_`, `ws_`, `fc_`, `cu_`, `ci_`, `ig_`, `fs_`) create cross-response relationships. When replaying from stored history (not via `previous_response_id`), these IDs are not valid for the new session. **Strip all provider IDs** to eliminate cross-session linkage validation.

### Adapter Decision Tree

```
For each assistant UIMessage in history:
├─ Group parts by step-start blocks
├─ For each block:
│  ├─ Text-only? → Keep as-is
│  ├─ Complete reasoning→tool→output triple? → Keep all, strip IDs
│  ├─ Complete reasoning→text pair? → Keep both, strip IDs
│  ├─ Incomplete (missing any component)? → Drop entire block
│  └─ Orphaned reasoning or tool? → Drop
└─ Strip all callProviderMetadata
```

### Error Pattern Catalog

| Error Pattern | Cause |
|---------------|-------|
| `Item 'rs_...' of type 'reasoning' was provided without its required following item.` | Orphaned reasoning |
| `Item 'fc_...' of type 'function_call' was provided without its required 'reasoning' item` | Tool call without paired reasoning |
| `Item 'web_search_call' at index N was provided without its required 'reasoning' item` | Web search without paired reasoning |
| `No tool output found for function call 'fc_...'` | Function call without matching output |

## Appendix B: Anthropic Replay Invariants (Verified)

> Source: `anthropic-replay-invariants.md` — research from Anthropic docs, SDK source, Claude Code issues, and AI SDK issues

### Hard Invariants (400 Error on Violation)

1. **Tool pairing**: Every `tool_use` block MUST have a corresponding `tool_result` in the immediately next message. `tool_use_id` must match.

2. **Tool result ordering**: `tool_result` blocks MUST come BEFORE text in user messages. Text before `tool_result` triggers 400.

3. **Tool loop thinking**: Thinking blocks from the **last assistant message** during an active tool use loop MUST be preserved — with unmodified `signature` fields (cryptographic verification). Both `thinking` and `redacted_thinking` blocks must be preserved.

4. **Thinking block ordering**: The sequence of consecutive thinking blocks must match the original output exactly — no rearranging.

5. **Manual mode constraint**: With manual thinking mode, the last assistant turn must start with a `thinking` or `redacted_thinking` block (if thinking is enabled).

### API-Managed Behaviors (No Error)

6. **Prior-turn thinking auto-stripped**: The API automatically excludes thinking blocks from prior completed turns from the context window. You do NOT need to strip them yourself. Formula: `context_window = (input_tokens - previous_thinking_tokens) + current_turn_tokens`.

7. **Thinking toggle tolerance**: Toggling thinking mid-turn is handled gracefully — API silently disables thinking rather than erroring.

8. **Cross-provider reasoning tolerance**: Sending reasoning from other providers (no valid Anthropic signature) is tolerated — treated as new content, no error.

### Model-Specific Differences

| Model | Thinking Mode | Interleaved Thinking | Prior Turn Flexibility |
|-------|--------------|---------------------|----------------------|
| **Opus 4.6** | Adaptive (recommended) | Auto-enabled | Previous turns don't need to start with thinking blocks |
| **Opus 4.5** | Manual (`type: "enabled"`) | Beta header required | Keeps all previous thinking blocks by default |
| **Sonnet 4.5, Sonnet 4** | Manual | Beta header required | Standard stripping behavior |
| **Sonnet 3.7** (deprecated) | Manual | NOT supported | Standard stripping behavior |

### Adapter Strategy: Near-Passthrough

The Anthropic adapter should preserve everything and only strip SDK artifacts (`step-start`). The API handles all thinking block lifecycle management. Our current `sanitizeMessagesForProvider("anthropic") → return as-is` approach is **validated as correct**.

## Appendix B.2: Google Gemini Replay Invariants (New)

> Source: `google-replay-invariants.md` — research from Gemini API docs, gemini-cli issues, AI SDK issues, and @ai-sdk/google source

### Hard Invariants (400 `INVALID_ARGUMENT` on Violation)

1. **FC/FR count parity**: Number of `functionResponse` parts MUST exactly equal number of `functionCall` parts in the preceding model turn.

2. **Turn ordering**: FC turns must come immediately after user/FR turn. FR turns must come immediately after FC turn.

3. **Strict role alternation**: Consecutive turns with same role are rejected. Even-indexed = user, odd-indexed = model.

4. **Gemini 3 thought signatures**: FC parts in the current turn MUST include `thoughtSignature`. Missing = 400 error. Use `"skip_thought_signature_validator"` for cross-provider replay.

### Lenient Behaviors

5. **Prior-turn thought signatures not validated**: Only the active FC loop is checked.

6. **Reasoning preserved as native thoughts**: `@ai-sdk/google` converts `reasoning` parts to `{ text, thought: true }` — preserving cross-provider reasoning.

### Adapter Requirements

- Validate FC/FR count parity after filtering
- Check role alternation after filtering (merge/inject placeholders if violated)
- Inject dummy `thoughtSignature` for Gemini 3 cross-provider FC replay
- Preserve reasoning parts (they become native Gemini thoughts)

## Appendix C: Proposed Adapter Interface (Validated + Revised)

> Updated after validation against all 7 research documents, codebase audit (Section 3.1), and adversarial architecture review.
> 
> **Changes from previous version** (adversarial review revisions):
> - `adaptMessages` parameter changed to `readonly UIMessage[]` — compiler-enforced immutability
> - `AdaptationResult` gains `warnings: AdaptationWarning[]` — structured degradation signals
> - `AdaptationContext` gains `maxHistoryTokens?: number` — Phase 5 token budget (field defined now, implementation deferred)
> - Non-final tool state handling documented in contract JSDoc
> - `adaptHistoryForProvider()` includes OpenRouter provider detection
> - `isToolPartFinal()` shared utility added

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
  /**
   * Optional token budget for history messages.
   * When set, adapters should degrade older tool triples to text summaries
   * if full preservation would exceed this budget.
   *
   * Phase 5 — field defined now, implementation deferred until needed.
   * See Section 6 (Phase 5) and Section 9 (reassessment triggers).
   */
  maxHistoryTokens?: number
}

/**
 * Structured warning emitted when an adapter degrades content.
 * Logged alongside stats for observability and potential future UI indicators.
 */
export interface AdaptationWarning {
  /** Warning type — machine-readable code for filtering and alerting */
  code:
    | "incomplete_triple_dropped"   // Reasoning-tool group was incomplete, entire block dropped
    | "provider_ids_stripped"        // callProviderMetadata stripped for cross-provider replay
    | "empty_message_fallback"      // All parts stripped, injected empty text placeholder
    | "non_final_state_dropped"     // Tool part with non-final state dropped (abort race)
    | "role_alternation_repaired"   // Google: consecutive same-role messages merged/placeholder injected
    | "thought_signature_injected"  // Google: dummy thought signature injected for cross-provider FC
  /** Index of the affected message in the original messages array */
  messageIndex: number
  /** Human-readable detail for logging */
  detail: string
}

/**
 * Contract for provider-specific history adaptation.
 *
 * Adapters transform canonical UIMessage[] into a form that satisfies
 * the target provider's replay invariants. They operate on UIMessage[]
 * (before convertToModelMessages) to stay within the AI SDK's
 * conversion pipeline.
 *
 * ## Adapter Requirements
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
 * Adapters MUST NOT mutate input messages. The `readonly` parameter
 * type enforces this at the compiler level.
 *
 * ## Non-Final Tool State Handling
 *
 * Adapters MUST drop tool parts with non-final states BEFORE applying
 * provider-specific logic. Non-final states can appear if abort/disconnect
 * cleanup races with the next user request. Use `isToolPartFinal()`.
 *
 * Final states: "output-available", "output-error", "output-denied"
 * Non-final states: "input-streaming", "input-available", "approval-requested",
 *                   "approval-responded"
 *
 * ## Complexity Tiers
 *
 * See Section 8 for adapter complexity tiers (Simple/Standard/Complex/Structural).
 * All tiers implement the same interface; implementation complexity varies.
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
    messages: readonly UIMessage[],
    context: AdaptationContext,
  ): Promise<AdaptationResult>

  /**
   * Static metadata for observability — what this adapter drops/transforms.
   * Used for structured logging and dashboard configuration.
   */
  readonly metadata: {
    droppedPartTypes: ReadonlySet<string>
    transformedPartTypes: ReadonlySet<string>
    /** Adapter complexity tier. See Section 8. */
    tier: "simple" | "standard" | "complex" | "structural"
    description: string
  }
}

/**
 * Result of adaptation, including observability data.
 * Stats structure matches the structured log format in Section 5.1.
 */
export interface AdaptationResult {
  messages: UIMessage[]
  /** Quantitative stats for logging and metrics */
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
  /** Structured warnings about content degradation decisions */
  warnings: AdaptationWarning[]
}

/**
 * Adapter registry — maps providerId to adapter.
 * Multiple provider IDs can map to the same adapter instance
 * (e.g., xAI and Mistral both use OpenAICompatibleAdapter).
 */
export type AdapterRegistry = Map<string, ProviderHistoryAdapter>

// --- Shared utilities ---

/** Known providers that can be detected from OpenRouter model IDs */
const KNOWN_UNDERLYING_PROVIDERS = ["anthropic", "openai", "google", "xai", "mistral"] as const

/**
 * Extract the underlying provider from an OpenRouter model ID.
 * Returns null if the prefix is not a known provider.
 *
 * Examples:
 *   "anthropic/claude-4-opus" → "anthropic"
 *   "openai/gpt-5.2" → "openai"
 *   "meta-llama/llama-4-maverick" → null
 */
function extractUnderlyingProvider(modelId: string): string | null {
  const prefix = modelId.split("/")[0]
  return KNOWN_UNDERLYING_PROVIDERS.includes(prefix as any) ? prefix : null
}

/** Tool part states that are considered final (safe for replay) */
const FINAL_TOOL_STATES = new Set(["output-available", "output-error", "output-denied"])

/**
 * Check if a tool part has a final state (safe for replay).
 * Non-final states (input-streaming, input-available, approval-requested)
 * can appear if abort/disconnect races with the next request.
 * Adapters should drop non-final tool parts before provider-specific logic.
 */
export function isToolPartFinal(part: { state?: string }): boolean {
  return part.state != null && FINAL_TOOL_STATES.has(part.state)
}

// --- Entry point ---

/**
 * Entry point: resolve and run the adapter for a given provider.
 * Falls back to DefaultAdapter if no provider-specific adapter exists.
 *
 * For OpenRouter, parses the model ID to detect the underlying provider
 * and routes to the appropriate adapter. Unknown underlying providers
 * fall back to DefaultAdapter.
 *
 * This replaces sanitizeMessagesForProvider() — same invocation point,
 * richer per-provider logic, structured observability output.
 */
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

## Appendix D: File Structure (Validated + Revised)

> Updated after validation against project conventions (Section 3.1.4) and adversarial review.
> Test files use `__tests__/` convention (matches `lib/tools/`, `lib/mcp/` pattern for multi-file test suites).
> xAI and Mistral share `openai-compatible.ts` adapter (validated in xAI/Mistral research).
>
> **Changes from previous version** (adversarial review revisions):
> - Added `pipeline.test.ts` — validates adapter→`convertToModelMessages()` pipeline (Section 4.5)
> - OpenRouter routing moved from DefaultAdapter to dynamic resolution in `index.ts`

```
app/api/chat/
├── adapters/
│   ├── types.ts               # ProviderHistoryAdapter, AdaptationResult, AdaptationContext,
│   │                          #   AdaptationWarning, isToolPartFinal()
│   ├── index.ts               # Registry: providerId → adapter + adaptHistoryForProvider()
│   │                          #   (includes OpenRouter underlying-provider detection)
│   ├── openai.ts              # OpenAI Responses API invariants (Complex tier)
│   │                          #   strict reasoning-tool pairing, step-start block awareness
│   │                          #   with semantic fallback, parallel call grouping
│   ├── anthropic.ts           # Anthropic near-passthrough (Standard tier)
│   │                          #   keep all, strip step-start
│   ├── google.ts              # Google Gemini invariants (Structural tier)
│   │                          #   strict FC pairing, role alternation validation,
│   │                          #   thought signatures, post-transformation structural checks
│   ├── openai-compatible.ts   # Shared adapter for xAI + Mistral (Standard tier)
│   │                          #   drop reasoning, keep tool pairs
│   ├── text-only.ts           # Perplexity and future text-only providers (Simple tier)
│   └── default.ts             # Fallback for unknown providers (Simple tier)
│                              #   current strip-all behavior
├── adapters/__tests__/
│   ├── openai.test.ts         # Contract tests — reasoning-tool pairing, ID stripping
│   ├── anthropic.test.ts      # Contract tests — passthrough verification
│   ├── google.test.ts         # Contract tests — FC pairing, role alternation, thought signatures
│   ├── openai-compatible.test.ts  # Contract tests — xAI/Mistral tool pair handling
│   ├── text-only.test.ts      # Contract tests — text extraction, part stripping
│   ├── pipeline.test.ts       # Pipeline smoke tests — adapter → convertToModelMessages()
│   │                          #   → validate ModelMessage structure (Section 4.5)
│   ├── cross-provider.test.ts # Matrix tests — all source×target combinations
│   │                          #   (includes OpenRouter routing cases)
│   └── fixtures.ts            # Shared realistic message fixtures (from cross-turn-tool-artifacts §3)
│                              #   includes non-final tool states, cross-provider callProviderMetadata
├── route.ts                   # Updated: adaptHistoryForProvider() replaces sanitizeMessagesForProvider()
│                              #   Three-state feature flag (false/shadow/true)
│                              #   ignoreIncompleteToolCalls: true (Phase 0 fix)
├── utils.ts                   # sanitizeMessagesForProvider() kept as deprecated fallback behind feature flag
└── utils.test.ts              # Existing tests kept; new adapter tests in __tests__/
```

**Mapping: providerId → adapter file**

| Provider ID | Adapter File | Adapter Name | Tier | Notes |
|------------|-------------|-------------|------|-------|
| `anthropic` | `anthropic.ts` | `AnthropicAdapter` | Standard | Near-passthrough, strip step-start |
| `openai` | `openai.ts` | `OpenAIResponsesAdapter` | Complex | Atomic triples, step-start block awareness with semantic fallback |
| `google` | `google.ts` | `GoogleAdapter` | Structural | Post-transformation validation (role alternation, FC/FR parity) |
| `xai` | `openai-compatible.ts` | `OpenAICompatibleAdapter` | Standard | Drop reasoning, keep tool pairs |
| `mistral` | `openai-compatible.ts` | `OpenAICompatibleAdapter` | Standard | Drop reasoning, keep tool pairs, ensure `name` on tool results |
| `perplexity` | `text-only.ts` | `TextOnlyAdapter` | Simple | Strip everything except text |
| `openrouter` | *(dynamic)* | *(resolved at runtime)* | — | Parses model ID to detect underlying provider; routes to matching adapter or `DefaultAdapter` |
| *(unknown)* | `default.ts` | `DefaultAdapter` | Simple | Current strip-all behavior |

---

*Research complete. All five questions answered. All provider invariants documented. Interface validated and revised after adversarial review. This plan is ready for implementation. Begin with Phase 0 (immediate `ignoreIncompleteToolCalls` fix), then the OpenAI adapter (Phase 1, Week 1) to address the highest-incident-rate provider first. See individual research docs for deep-dive details on any provider.*
