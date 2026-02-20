---
name: history-adaptation-system
description: Navigate and modify the cross-model history adaptation pipeline (adapters, replay compiler, normalization) that transforms UIMessages when users switch between AI providers. Use when working on cross-model chat history bugs, adding a new provider adapter, modifying the replay compiler, fixing message rendering after model switching, or any work touching adapters/ or replay/.
---

# History Adaptation System

Use this skill when modifying how chat history is adapted for cross-model replay — including provider-specific adapters, the replay compiler, normalization, and the OpenAI hardening fallback.

## Prerequisites

- [ ] You understand that UIMessage[] (client format) must be transformed before calling `convertToModelMessages()`.
- [ ] You can reference `app/api/chat/route.ts` (lines 521–662) for the integration point.
- [ ] You know the target provider and whether the replay compiler flag is enabled.

## Quick Reference

| Stage | File | Entry Point |
|-------|------|-------------|
| Orchestrator | `app/api/chat/adapters/index.ts` | `adaptHistoryForProvider()` |
| Adapter contract | `app/api/chat/adapters/types.ts` | `ProviderHistoryAdapter` |
| Adapters | `adapters/{openai,anthropic,google,openai-compatible,text-only,default}.ts` | `adaptMessages()` |
| Normalization | `app/api/chat/replay/normalize.ts` | `normalizeReplayMessages()` |
| Compilation | `app/api/chat/replay/compilers/index.ts` | `compileReplay()` |
| Post-conversion | `app/api/chat/utils.ts` | `hasProviderLinkedResponseIds()`, `toPlainTextModelMessages()` |
| Feature flag | `lib/config.ts` | `HISTORY_REPLAY_COMPILER_V1` |

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Route Entry (route.ts:528)                                   │
│    adaptHistoryForProvider(messages, providerId, context)        │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Adapter Resolution (adapters/index.ts:44-61)                 │
│    resolveAdapter(providerId, context)                           │
│    - OpenRouter → extractUnderlyingProvider(modelId)             │
│    - Returns: { adapter, effectiveProviderId }                   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
               ┌────────┴────────┐
               │                 │
    useReplayCompiler?     useReplayCompiler?
         true                  false
               │                 │
               ▼                 │
┌────────────────────────┐       │
│ 3a. Replay Path        │       │
│                        │       │
│ 3a.1 Normalize         │       │
│   normalizeReplay      │       │
│   Messages()           │       │
│   → ReplayMessage[]    │       │
│                        │       │
│ 3a.2 Compile           │       │
│   compileReplay()      │       │
│   → UIMessage[]        │       │
│   (provider-shaped)    │       │
│                        │       │
│ 3a.3 Adapt             │       │
│   adapter.adapt        │       │
│   Messages()           │       │
│   → AdaptationResult   │       │
└──────────┬─────────────┘       │
           │                     │
           │    ┌────────────────┘
           │    │
           │    ▼
           │  ┌──────────────────┐
           │  │ 3b. Legacy Path  │
           │  │  adapter.adapt   │
           │  │  Messages()      │
           │  │  → Adaptation    │
           │  │    Result        │
           │  └────────┬─────────┘
           │           │
           └─────┬─────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Conversion (route.ts:638)                                    │
│    await convertToModelMessages(adaptedMessages)                │
│    → ModelMessage[]                                             │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. OpenAI Hardening (route.ts:645-662)                          │
│    if (openai && hasProviderLinkedResponseIds(modelMessages))    │
│      → toPlainTextModelMessages(adaptedMessages) as fallback    │
│    → Final ModelMessage[] for streamText()                      │
└─────────────────────────────────────────────────────────────────┘
```

## Adapter Registry

| Provider ID | Adapter | Tier | Behavior |
|-------------|---------|------|----------|
| `openai` | `openaiAdapter` | complex | Validates reasoning→tool→result triples, splits by step boundaries, drops incomplete blocks |
| `anthropic` | `anthropicAdapter` | standard | Near-passthrough, preserves reasoning/tools, normalizes web_search output shapes |
| `google` | `googleAdapter` | structural | Two-pass: tool pair validation + role alternation, enforces FC/FR parity, injects thought signatures |
| `xai` | `openaiCompatibleAdapter` | standard | Pairs tool invocations with results, drops orphans |
| `mistral` | `openaiCompatibleAdapter` | standard | Same as xAI |
| `perplexity` | `textOnlyAdapter` | simple | Drops everything except text parts |
| `openrouter` | (routed) | — | Extracts underlying provider from model ID, routes to matching adapter |
| (unknown) | `defaultAdapter` | simple | Conservative fallback, strips all non-text content |

## Adapter Contract

```typescript
// app/api/chat/adapters/types.ts
type ProviderHistoryAdapter = {
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
```

Requirements:
- [ ] Pure functions only — no side effects, no network calls
- [ ] Idempotent — applying twice yields the same result
- [ ] Non-mutating — never modify input `messages` array
- [ ] Drop non-final tool states via `isToolPartFinal()` before provider-specific logic

## Step-by-Step: Adding a New Adapter

1) **Determine the tier**
- [ ] `simple` — Only needs text (strips everything else)
- [ ] `standard` — Needs text + tool pairs (drops orphan tools)
- [ ] `complex` — Has strict ordering invariants (e.g., reasoning→tool→result triples)
- [ ] `structural` — Needs role alternation or cross-message constraints

2) **Create adapter file**
- [ ] Create `app/api/chat/adapters/{provider}.ts`
- [ ] Export a `ProviderHistoryAdapter` with `providerId`, `metadata`, and `adaptMessages()`
- [ ] Use helpers from `types.ts`: `isToolPartFinal()`, `isToolPart()`, `createEmptyStats()`, `incrementStat()`

3) **Register in the adapter registry**
- [ ] Add to `app/api/chat/adapters/index.ts`: `registry.set("providerId", yourAdapter)`

4) **Add replay compiler (if replay compiler flag is on)**
- [ ] Create `app/api/chat/replay/compilers/{provider}.ts` implementing `ReplayCompiler`
- [ ] Register in `app/api/chat/replay/compilers/index.ts` `compilerRegistry`

5) **Verify**
- [ ] Test with cross-model conversations (start with provider A, switch to provider B)
- [ ] Check `AdaptationResult.stats` for expected drop/preserve counts
- [ ] Check `AdaptationResult.warnings` for unexpected warnings

## Step-by-Step: Debugging a Cross-Model Replay Bug

1) **Identify the pipeline stage**
- [ ] Does the bug occur with the same model (no adaptation needed)? → Not an adapter issue.
- [ ] Does `AdaptationResult.warnings` contain relevant codes? → Check the specific adapter.
- [ ] Does the bug only occur OpenAI → other? → Check `hasProviderLinkedResponseIds()` hardening.

2) **Read the pipeline in order**
- [ ] `adaptHistoryForProvider()` — Is the correct adapter being resolved?
- [ ] `normalizeReplayMessages()` (if replay compiler is on) — Are parts being normalized correctly?
- [ ] `compileReplay()` (if replay compiler is on) — Are provider invariants being enforced?
- [ ] `adapter.adaptMessages()` — Is the adapter dropping/transforming the right parts?
- [ ] `convertToModelMessages()` — Is the SDK conversion correct?
- [ ] `hasProviderLinkedResponseIds()` → `toPlainTextModelMessages()` — Is the OpenAI fallback triggering unexpectedly?

3) **Decision tree: where to fix**

```
Is the issue about message FORMAT (wrong part types, missing fields)?
  └─ YES → Fix in the specific adapter's adaptMessages()
  └─ NO ↓

Is the issue about cross-provider NORMALIZATION (parts from provider A confuse provider B)?
  └─ YES → Fix in replay/normalize.ts
  └─ NO ↓

Is the issue about STRUCTURAL invariants (wrong ordering, missing pairs)?
  └─ YES → Fix in replay/compilers/{provider}.ts
  └─ NO ↓

Is the issue about SDK CONVERSION (ModelMessage shape wrong)?
  └─ YES → Check convertToModelMessages() behavior; may need post-conversion defense
  └─ NO ↓

Is the issue about PROVIDER-LINKED IDs (msg_/rs_/ws_ prefixes)?
  └─ YES → Fix in utils.ts hasProviderLinkedResponseIds() or toPlainTextModelMessages()
```

## OpenRouter Routing

OpenRouter uses model IDs with provider prefixes (e.g., `anthropic/claude-4-opus`). The `extractUnderlyingProvider()` function strips the `openrouter:` prefix, splits by `/`, and checks against `KNOWN_UNDERLYING_PROVIDERS`:

```typescript
// Known providers: ["anthropic", "openai", "google", "xai", "mistral"]
"openrouter:anthropic/claude-4-opus" → "anthropic" → anthropicAdapter
"openai/gpt-5.2"                    → "openai"    → openaiAdapter
"meta-llama/llama-4"                → null         → defaultAdapter
```

## Feature Flag: `HISTORY_REPLAY_COMPILER_V1`

- **Definition:** `lib/config.ts` — env var `HISTORY_REPLAY_COMPILER_V1` set to `"1"` or `"true"`
- **Default:** `false` (disabled)
- **When enabled:** Normalize → Compile → Adapt pipeline
- **When disabled:** Direct adapter path (legacy)
- **Fallback:** If the compiler throws, falls back to the legacy adapter path with a `replay_compile_fallback` warning

## Replay Compiler Architecture

The replay compiler operates between normalization and adaptation:

1. **Normalize** (`replay/normalize.ts`): Converts UIMessage[] → ReplayMessage[] (a normalized schema that strips provider-specific quirks)
2. **Compile** (`replay/compilers/`): Transforms ReplayMessage[] → UIMessage[] shaped for the target provider's invariants
3. **Adapt** (adapter): Final provider-specific cleanup

Compilers exist per-provider:
- `replay/compilers/openai.ts` — Enforces reasoning→tool invariants, reconstructs tool parts
- `replay/compilers/anthropic.ts` — Validates web_search tool parts, synthesizes fallback text

## Key Warning Codes

| Code | Stage | Meaning |
|------|-------|---------|
| `incomplete_triple_dropped` | OpenAI adapter | Reasoning→tool→result triple was incomplete |
| `provider_ids_stripped` | Adapters | Provider-linked metadata was removed |
| `empty_message_fallback` | Adapters | Message had no parts after adaptation; text fallback injected |
| `non_final_state_dropped` | Adapters | Tool part in non-final state was dropped |
| `role_alternation_repaired` | Google adapter | Adjacent same-role messages were merged |
| `thought_signature_injected` | Google adapter | Gemini thought signatures were added |
| `replay_normalization_warning` | Normalize | Part couldn't be cleanly normalized |
| `replay_compile_warning` | Compile | Compiler detected a structural issue |
| `replay_compile_fallback` | Orchestrator | Compiler threw; legacy adapter path used |

## Gotchas

1. **`convertToModelMessages` is async** — Always `await` it; forgetting produces runtime errors, not compile errors.
2. **OpenAI hardening runs AFTER conversion** — `hasProviderLinkedResponseIds()` checks the already-converted ModelMessage[], not the UIMessage[]. If it detects `msg_`/`rs_`/`ws_` prefixed IDs, it rebuilds from scratch using `toPlainTextModelMessages()`.
3. **Adapter purity** — Never add network calls or side effects to adapters. All observability goes through `AdaptationResult.stats` and `warnings` in route.ts.
4. **`detectSourceProvider()` reads `callProviderMetadata`** — This metadata is attached by the SDK during streaming and persists on tool parts. It tells you which provider originally generated a tool call.
5. **`isToolPartFinal()` allows `undefined` state** — Parts with no `state` field are treated as final (backward compat with pre-v6 messages).

## Internal References

- Pipeline entry: `app/api/chat/adapters/index.ts`
- Adapter contract: `app/api/chat/adapters/types.ts`
- Provider adapters: `app/api/chat/adapters/{openai,anthropic,google,openai-compatible,text-only,default}.ts`
- Normalization: `app/api/chat/replay/normalize.ts`
- Compilers: `app/api/chat/replay/compilers/{index,openai,anthropic}.ts`
- Replay types: `app/api/chat/replay/types.ts`
- Post-conversion defense: `app/api/chat/utils.ts`
- Route integration: `app/api/chat/route.ts` (lines 521–662)
- Feature flag: `lib/config.ts` (`HISTORY_REPLAY_COMPILER_V1`)
- AI SDK v6 skill: `.agents/skills/ai-sdk-v6/SKILL.md`
