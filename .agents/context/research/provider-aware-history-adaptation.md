# Provider-Aware History Adaptation — Research Plan

> **Date**: February 13, 2026
> **Status**: 📋 Research Plan (pre-implementation)
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
| **Google Gemini** | Permissive (thoughts are optional in replay) | Tool calls should pair with results; missing results = warning, not error | `functionCall` + `functionResponse` pairing is expected but not strictly enforced |
| **xAI (Grok)** | Not well-documented; likely permissive | Follows OpenAI-compatible format | Needs empirical testing |
| **Mistral** | No reasoning support | Tool calls must pair with results | Standard OpenAI-compatible tool format |
| **Perplexity** | No reasoning support | No tool calling support | Clean text-only replay |
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
| `reasoning` | Keep (required) | Transform* | Drop | Drop | Drop | Drop |
| `step-start` | Drop (SDK artifact) | Drop | Drop | Drop | Drop | Drop |
| `tool-*` (invocation) | Keep (required) | Transform* | Transform** | Drop | Transform** | Drop |
| `tool-result` | Keep (required) | Transform* | Transform** | Drop | Transform** | Drop |
| `source-url` | Keep | Keep | Keep | Keep | Keep | Keep |
| `file` | Keep | Keep | Keep | Keep | Keep | Keep |

\* OpenAI: Reasoning + tool pairs must be kept together or dropped together. Cannot keep one without the other.
\** Google/Mistral: Tool calls should be paired with results. If result is missing, either synthesize a placeholder or drop the pair.

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
interface ProviderHistoryAdapter {
  providerId: string
  adaptMessages(messages: UIMessage[]): UIMessage[]
  // Metadata for observability
  readonly droppedPartTypes: Set<string>
  readonly transformedPartTypes: Set<string>
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
1. Create `app/api/chat/adapters/types.ts` — Define `ProviderHistoryAdapter` interface
2. Create `app/api/chat/adapters/openai.ts` — OpenAI-specific adapter
3. Create `app/api/chat/adapters/default.ts` — Default adapter (current strip-all behavior)
4. Create `app/api/chat/adapters/anthropic.ts` — Anthropic pass-through adapter
5. Create `app/api/chat/adapters/index.ts` — Registry mapping providerId → adapter
6. Update `sanitizeMessagesForProvider()` to delegate to adapters
7. Write contract tests for OpenAI adapter
8. Write regression test for the Batman production bug

**Feature flag**: `HISTORY_ADAPTER_V2=true` (env var, defaults to false)
**Rollback**: Set flag to false, reverts to current binary sanitization
**Success criteria**: Zero `replay_shape_error` events for OpenAI in 48 hours

### Phase 2: Provider-Specific Adapters (Week 2)

**Goal**: Add adapters for Google, xAI, Mistral, Perplexity.

**Steps**:
1. Create `app/api/chat/adapters/google.ts` — Google Gemini adapter
2. Create `app/api/chat/adapters/xai.ts` — xAI adapter
3. Create `app/api/chat/adapters/mistral.ts` — Mistral adapter
4. Create `app/api/chat/adapters/perplexity.ts` — Perplexity adapter (text-only)
5. Update registry
6. Write contract tests for each adapter
7. Run cross-provider replay test matrix

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

## Appendix C: Proposed Adapter Interface

```typescript
// app/api/chat/adapters/types.ts

import type { UIMessage } from "ai"

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
 */
export interface ProviderHistoryAdapter {
  /** Provider ID this adapter handles */
  readonly providerId: string

  /**
   * Adapt messages for this provider's replay invariants.
   * Returns a new array (never mutates input).
   */
  adaptMessages(messages: UIMessage[]): UIMessage[]

  /**
   * Metadata for observability — what this adapter drops/transforms.
   * Used for structured logging.
   */
  readonly metadata: {
    droppedPartTypes: ReadonlySet<string>
    transformedPartTypes: ReadonlySet<string>
    description: string
  }
}

/**
 * Result of adaptation, including observability data.
 */
export interface AdaptationResult {
  messages: UIMessage[]
  stats: {
    originalMessageCount: number
    adaptedMessageCount: number
    partsDropped: Record<string, number>
    partsTransformed: Record<string, number>
    partsPreserved: Record<string, number>
  }
}
```

## Appendix D: File Structure

```
app/api/chat/
├── adapters/
│   ├── types.ts          # ProviderHistoryAdapter interface
│   ├── index.ts           # Registry: providerId → adapter
│   ├── openai.ts          # OpenAI Responses API invariants
│   ├── anthropic.ts       # Anthropic pass-through (keep all)
│   ├── google.ts          # Google Gemini invariants
│   ├── xai.ts             # xAI (OpenAI-compatible subset)
│   ├── mistral.ts         # Mistral invariants
│   ├── perplexity.ts      # Perplexity (text-only)
│   └── default.ts         # Fallback (strip tool+reasoning)
├── adapters/__tests__/
│   ├── openai.test.ts     # Contract tests
│   ├── anthropic.test.ts
│   ├── google.test.ts
│   ├── cross-provider.test.ts  # Matrix tests
│   └── fixtures.ts        # Shared test message fixtures
├── route.ts               # Updated to use adapter registry
├── utils.ts               # sanitizeMessagesForProvider delegates to adapters
└── utils.test.ts          # Updated tests
```

---

*This research plan is ready for engineering review and sprint planning. Implementation should begin with the OpenAI adapter (Phase 1) to address the highest-incident-rate provider first.*
