# Thinking/Reasoning Configuration — Implementation Plan

## Background

We recently enabled thinking/reasoning for Claude models in `app/api/chat/route.ts` by adding `providerOptions` to the `streamText` call. This was confirmed working — Claude now shows a collapsible "Reasoning" section above responses.

**The problem**: Many model configs have `reasoningText: true` but the providers don't actually expose reasoning tokens, OR the route doesn't configure the provider-specific options needed to enable thinking. This plan covers all remaining work.

## What's Already Done

- `app/api/chat/route.ts` (lines 258–272) has `providerOptions` for:
  - `anthropic`: `thinking: { type: "enabled", budgetTokens: 10000 }` (confirmed working)
  - `google`: `thinkingConfig: { includeThoughts: true }` (added, untested)
- `sendReasoning: true` is set on the response (line ~420)
- The `Reasoning` component in `app/components/chat/reasoning.tsx` renders correctly
- `app/components/chat/message-assistant.tsx` extracts and displays reasoning parts

## Tasks

### Task 1: Scale Claude thinking budgets by model tier

**File**: `app/api/chat/route.ts` (lines 258–272)

Currently all Claude models get a flat `budgetTokens: 10000`. Scale by model capability:

| Model ID | Tier | Budget |
|----------|------|--------|
| `claude-opus-4-6` | Flagship | `16000` |
| `claude-sonnet-4-5` | High | `12000` |
| `claude-sonnet-4-20250514` | High | `12000` |
| `claude-haiku-4-5` | Fast/Light | `5000` |

**Implementation approach**: Use the `model` variable (string ID) to determine the budget. Example:

```typescript
if (provider === "anthropic") {
  let budgetTokens = 10000 // default
  if (model.includes("opus")) budgetTokens = 16000
  else if (model.includes("haiku")) budgetTokens = 5000
  else if (model.includes("sonnet")) budgetTokens = 12000

  providerOptions.anthropic = {
    thinking: { type: "enabled", budgetTokens },
  }
}
```

The `model` variable is available — it's the model ID string from the request body (e.g., `"claude-opus-4-6"`), defined earlier in the same function.

### Task 2: Add OpenAI reasoning effort for thinking models

**File**: `app/api/chat/route.ts` (lines 258–272)

Add a new `else if` branch for OpenAI. The AI SDK `@ai-sdk/openai` v3+ supports `providerOptions.openai.reasoningEffort` for models that have reasoning capabilities (o3, o4-mini, gpt-5.1-thinking).

```typescript
else if (provider === "openai") {
  providerOptions.openai = {
    reasoningEffort: "medium",
  }
}
```

**Important**: Only add this when `modelConfig.reasoningText` is true (the outer `if` already checks this). Models like `gpt-4.1`, `gpt-4o`, and `gpt-5.1` (non-thinking) have `reasoningText: false` and won't be affected.

### Task 3: Add xAI/Grok reasoning effort

**File**: `app/api/chat/route.ts` (lines 258–272)

The `@ai-sdk/xai` provider supports `providerOptions.xai.reasoningEffort` for Grok reasoning models.

```typescript
else if (provider === "xai") {
  providerOptions.xai = {
    reasoningEffort: "medium",
  }
}
```

### Task 4: Clean up `reasoningText` flags across model configs

The `reasoningText` flag should mean: **"This model's provider API actually returns reasoning/thinking tokens that our UI can display."** Many models currently have `reasoningText: true` when the provider doesn't expose reasoning.

#### `lib/models/data/openai.ts`

| Model | Current | Should Be | Reason |
|-------|---------|-----------|--------|
| `gpt-5.2` | `true` | `true` | GPT-5.2 has reasoning capabilities |
| `gpt-5.1` | `false` | `false` | Correct — instant model, no reasoning |
| `gpt-5.1-thinking` | `true` | `true` | Thinking variant with reasoning |
| `gpt-5` | `true` | `true` | Has reasoning capabilities |
| `gpt-5-mini` | `true` | `true` | Has reasoning capabilities |
| `gpt-4.1` | missing | leave as-is | No `reasoningText` field = falsy |
| `gpt-4o` | missing | leave as-is | No `reasoningText` field = falsy |
| `o3` | missing | **add `reasoningText: true`** | o3 is a dedicated reasoning model |
| `o4-mini` | missing | **add `reasoningText: true`** | o4-mini is a dedicated reasoning model |

**Changes needed**: Add `reasoningText: true` to `o3` and `o4-mini` entries.

#### `lib/models/data/gemini.ts`

| Model | Current | Should Be | Reason |
|-------|---------|-----------|--------|
| `gemini-2.5-flash-lite` | `true` | `false` | Lite model, no thinking support |
| `gemini-2.5-flash` | `true` | `true` | Has thinking capabilities |
| `gemini-2.5-pro` | `true` | `true` | Has thinking capabilities |
| `gemini-3-pro-preview` | `true` | `true` | Has thinking capabilities |
| `gemma-3-27b-it` | `true` | `false` | Open-source model, no thinking API |

**Changes needed**: Set `reasoningText: false` for `gemini-2.5-flash-lite` and `gemma-3-27b-it`.

#### `lib/models/data/mistral.ts`

| Model | Current | Should Be | Reason |
|-------|---------|-----------|--------|
| `ministral-8b-latest` | `true` | `false` | No exposed reasoning API |
| `mistral-large-latest` | `true` | `false` | No exposed reasoning API |
| `pixtral-large-latest` | `true` | `false` | No exposed reasoning API |

**Changes needed**: Set `reasoningText: false` for all three. Mistral does not expose reasoning tokens through their API.

#### `lib/models/data/perplexity.ts`

| Model | Current | Should Be | Reason |
|-------|---------|-----------|--------|
| ALL models | `true` | `false` | Perplexity does not expose reasoning tokens through the AI SDK |

**Changes needed**: Set `reasoningText: false` for all 5 Perplexity models (`sonar`, `sonar-reasoning`, `sonar-reasoning-pro`, `sonar-pro`, `sonar-deep-research`). Perplexity's "reasoning" is internal to their search pipeline and not exposed as reasoning parts.

#### `lib/models/data/grok.ts`

| Model | Current | Should Be | Reason |
|-------|---------|-----------|--------|
| `grok-2` | `true` | `true` | xAI supports reasoning |
| `grok-2-vision` | `true` | `true` | xAI supports reasoning |
| `grok-4` | `true` | `true` | xAI supports reasoning |
| `grok-4-1-fast-reasoning` | `true` | `true` | Explicitly a reasoning model |
| `grok-code-fast-1` | `false` | `false` | Correct |

No changes needed for Grok.

#### `lib/models/data/deepseek.ts`

| Model | Current | Should Be | Reason |
|-------|---------|-----------|--------|
| `deepseek-r1` | `true` | `true` | R1 natively produces reasoning via `<think>` tags |
| `deepseek-v3` | `true` | `false` | V3 is not a reasoning model |

**Changes needed**: Set `reasoningText: false` for `deepseek-v3`.

#### `lib/models/data/llama.ts`

| Model | Current | Should Be | Reason |
|-------|---------|-----------|--------|
| `llama-4-scout-groq` | `true` | `false` | No exposed reasoning API via Groq |
| `llama-3-3-70b-groq` | `true` | `false` | No exposed reasoning API via Groq |
| `llama-3-70b-groq` | `true` | `false` | No exposed reasoning API via Groq |
| `llama-3-1-405b-together` | `true` | `false` | No exposed reasoning API via Together |

**Changes needed**: Set `reasoningText: false` for all four models listed above. These providers don't expose reasoning tokens.

#### `lib/models/data/claude.ts`

All Claude models correctly have `reasoningText: true`. No changes needed.

#### `lib/models/data/ollama.ts`

The `checkReasoningCapability()` function (line 227) returns `true` for Llama, Qwen, DeepSeek, Mistral, Phi families. This is too broad — most Ollama models don't expose reasoning tokens.

**Change needed**: Update `checkReasoningCapability()` to only return `true` for model families that actually produce reasoning (primarily DeepSeek when running R1 variants):

```typescript
function checkReasoningCapability(family: string): boolean {
  return ["DeepSeek"].includes(family)
}
```

Also set `reasoningText: false` for both static fallback models (`llama3.2:latest` and `qwen2.5-coder:latest`).

### Task 5: Run verification

After all changes, run:

```bash
bun run lint
bun run typecheck
```

Fix any errors before considering the task complete.

## Files to Modify (Summary)

| File | Changes |
|------|---------|
| `app/api/chat/route.ts` | Scale Claude budgets, add OpenAI + xAI providerOptions |
| `lib/models/data/openai.ts` | Add `reasoningText: true` to o3, o4-mini |
| `lib/models/data/gemini.ts` | Set `reasoningText: false` for flash-lite, gemma-3 |
| `lib/models/data/mistral.ts` | Set `reasoningText: false` for 3 models |
| `lib/models/data/perplexity.ts` | Set `reasoningText: false` for all 5 models |
| `lib/models/data/deepseek.ts` | Set `reasoningText: false` for deepseek-v3 |
| `lib/models/data/llama.ts` | Set `reasoningText: false` for 4 models |
| `lib/models/data/ollama.ts` | Tighten `checkReasoningCapability()`, fix 2 static models |

## Important Constraints

- Do NOT modify the `Reasoning` component (`app/components/chat/reasoning.tsx`) — it works correctly
- Do NOT modify `message-assistant.tsx` — the rendering pipeline is working
- Do NOT add `// @ts-ignore` or `eslint-disable` comments
- Do NOT change the response's `sendReasoning: true` — it must stay enabled
- The `model` variable (string ID like `"claude-opus-4-6"`) is available in the route function scope
- The `provider` variable (string like `"anthropic"`, `"google"`, `"openai"`) is also available
- The `modelConfig` object has the full `ModelConfig` type including `reasoningText`
- Preserve the existing reasoning-stripping logic for non-Anthropic providers (lines 227–253)
