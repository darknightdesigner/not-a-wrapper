# Model Registry Update — February 2026

> **Created**: February 6, 2026
> **Research**: `.agents/context/research/latest-models-february-2026.md`
> **Scope**: Deprecate retired models, update stale entries, add new generation models
> **Skill**: Follow `@.agents/skills/add-model/SKILL.md` for the 3-step model addition pattern

---

## Phase 0 — Open Questions (RESOLVE BEFORE EXECUTION)

These questions **must** be answered by a human or by testing before any code changes begin. Do not guess.

### Q1: `claude-3-5-haiku-latest` alias behavior

**Question**: Does the Anthropic API alias `claude-3-5-haiku-latest` now route to `claude-haiku-4-5-20251001`, or does it return an error / still route to the deprecated `claude-3-5-haiku-20241022`?

**Why it matters**: If the alias silently routes to Haiku 4.5, we can update the existing entry. If it errors, we must remove it. Our entry at `lib/models/data/claude.ts` lines 4-32 uses this alias in both `id` and `apiSdk`.

**How to test**: Make a single API call with model `claude-3-5-haiku-latest` and check the response headers or model field.

**Decision**:
- If routes to Haiku 4.5 → **UPDATE** the entry (fix pricing to $1/$5, update name to "Claude Haiku 4.5", etc.)
- If errors or returns deprecated model → **REMOVE** the entry entirely

### Q2: `@ai-sdk/*` package upgrade scope

**Question**: Should we upgrade `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, and `@ai-sdk/xai` from version 3 to latest as part of this work, or treat that as a separate task?

**Why it matters**: The SDK packages pass model ID strings to the provider REST API, so v3 *should* still work with new model IDs. However, newer SDK versions may include support for features like GPT-5.2 reasoning effort levels or Claude Opus 4.6 adaptive thinking. Upgrading could introduce breaking changes that are unrelated to this plan.

**Recommendation**: Treat SDK upgrade as a **separate task** after this plan. The new model IDs will work with v3 for basic chat. Create a follow-up ticket for the SDK upgrade.

### Q3: OpenRouter stale model entries

**Question**: Should the OpenRouter data file (`lib/models/data/openrouter.ts`) also be updated in this plan? It contains entries referencing deprecated models:
- `openrouter:anthropic/claude-3.5-sonnet` (retired model)
- `openrouter:anthropic/claude-3.7-sonnet:thinking` (retiring Feb 19)
- `openrouter:openai/gpt-4.5-preview` (shut down)
- `openrouter:x-ai/grok-3-mini-beta` (Grok 3 family — removed from xAI)

**Recommendation**: Include OpenRouter cleanup in Phase 1 if the answer is yes, otherwise note as a follow-up.

### Q4: `gpt-5.1` pricing

**Question**: The research could not confirm `gpt-5.1` pricing from official docs. Before adding it, verify the exact input/output cost on https://platform.openai.com/docs/pricing.

**Fallback**: If pricing cannot be confirmed, skip `gpt-5.1` in Phase 3 and add it later.

### Q5: Grok 4 reasoning parameter restrictions

**Question**: Does our `app/api/chat/route.ts` ever pass `presencePenalty`, `frequencyPenalty`, or `stop` parameters to `streamText()`? If so, Grok 4 reasoning models will throw errors.

**How to check**: Search `app/api/` for these parameter names in `streamText` calls.

**If yes**: Add model-family-level parameter filtering before adding Grok 4 reasoning models.

### Q6: Default model safety

**Confirmed**: `MODEL_DEFAULT = "gpt-4.1-nano"` in `lib/config.ts` line 36. This model is **not** being removed. No action needed.

---

## Phase 1 — Remove / Deprecate Broken Models

**Goal**: Remove all model entries that reference retired or shut-down APIs. These models are currently causing (or will imminently cause) errors for users who select them.

**Files touched per model removal** (3-step pattern, reversed):
1. `lib/models/data/[provider].ts` — remove the `ModelConfig` object from the array
2. `lib/openproviders/provider-map.ts` — remove the model ID from `MODEL_PROVIDER_MAP`
3. `lib/openproviders/types.ts` — remove the model ID from the provider's type union

### Step 1.1 — Remove `gpt-4.5-preview` (OpenAI — shut down Jul 14, 2025)

**File**: `lib/models/data/openai.ts`
**Action**: Delete the entire object block at lines 130-153 (the entry with `id: "gpt-4.5-preview"`).

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove these lines:
```
"gpt-4.5-preview": "openai",
"gpt-4.5-preview-2025-02-27": "openai",
```

**File**: `lib/openproviders/types.ts`
**Action**: Remove `"gpt-4.5-preview"` and `"gpt-4.5-preview-2025-02-27"` from the `OpenAIModel` union.

### Step 1.2 — Remove `o1-mini` (OpenAI — shut down Oct 27, 2025)

**File**: `lib/models/data/openai.ts`
**Action**: Delete the entire object block at lines 253-277 (the entry with `id: "o1-mini"`).

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove:
```
"o1-mini": "openai",
"o1-mini-2024-09-12": "openai",
```

**File**: `lib/openproviders/types.ts`
**Action**: Remove `"o1-mini"` and `"o1-mini-2024-09-12"` from `OpenAIModel`.

### Step 1.3 — Remove `claude-3-5-sonnet-latest` (Anthropic — retired Oct 28, 2025)

**File**: `lib/models/data/claude.ts`
**Action**: Delete the entire object block at lines 33-61 (the entry with `id: "claude-3-5-sonnet-latest"`).

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove:
```
"claude-3-5-sonnet-latest": "anthropic",
"claude-3-5-sonnet-20241022": "anthropic",
"claude-3-5-sonnet-20240620": "anthropic",
```

**File**: `lib/openproviders/types.ts`
**Action**: Remove `"claude-3-5-sonnet-latest"`, `"claude-3-5-sonnet-20241022"`, `"claude-3-5-sonnet-20240620"` from `AnthropicModel`.

### Step 1.4 — Remove `claude-3-opus-latest` (Anthropic — retired Jan 5, 2026)

**File**: `lib/models/data/claude.ts`
**Action**: Delete the entire object block at lines 142-169 (the entry with `id: "claude-3-opus-latest"`).

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove:
```
"claude-3-opus-latest": "anthropic",
"claude-3-opus-20240229": "anthropic",
```

**File**: `lib/openproviders/types.ts`
**Action**: Remove `"claude-3-opus-latest"` and `"claude-3-opus-20240229"` from `AnthropicModel`.

### Step 1.5 — Remove `claude-3-sonnet-20240229` (Anthropic — retired Jul 21, 2025)

**File**: `lib/models/data/claude.ts`
**Action**: Delete the entire object block at lines 170-198 (the entry with `id: "claude-3-sonnet-20240229"`).

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove `"claude-3-sonnet-20240229": "anthropic"`.

**File**: `lib/openproviders/types.ts`
**Action**: Remove `"claude-3-sonnet-20240229"` from `AnthropicModel`.

### Step 1.6 — Remove `claude-3-7-sonnet-20250219` AND `claude-3-7-sonnet-rea` (retiring Feb 19, 2026)

**File**: `lib/models/data/claude.ts`
**Action**: Delete TWO object blocks:
- Lines 62-87 (the entry with `id: "claude-3-7-sonnet-20250219"`)
- Lines 88-113 (the entry with `id: "claude-3-7-sonnet-rea"`)

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove `"claude-3-7-sonnet-20250219": "anthropic"`.

**File**: `lib/openproviders/types.ts`
**Action**: Remove `"claude-3-7-sonnet-20250219"` from `AnthropicModel`.

### Step 1.7 — Remove Grok 3 family (no longer in xAI API documentation)

**File**: `lib/models/data/grok.ts`
**Action**: Delete FOUR object blocks:
- `id: "grok-3"` (lines 61-85)
- `id: "grok-3-fast"` (lines 86-113)
- `id: "grok-3-mini"` (lines 114-139)
- `id: "grok-3-mini-fast"` (lines 140-166)

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove all Grok 3 entries:
```
"grok-3": "xai",
"grok-3-latest": "xai",
"grok-3-fast": "xai",
"grok-3-fast-latest": "xai",
"grok-3-mini": "xai",
"grok-3-mini-latest": "xai",
"grok-3-mini-fast": "xai",
"grok-3-mini-fast-latest": "xai",
```

**File**: `lib/openproviders/types.ts`
**Action**: Remove all `grok-3*` entries from `XaiModel`.

### Step 1.8 — Remove Gemini experimental/preview entries being replaced

**File**: `lib/models/data/gemini.ts`
**Action**: Delete THREE object blocks:
- `id: "gemini-2.5-pro-exp-03-25"` (lines 142-169) — labeled wrong as "Flash Preview"
- `id: "gemini-2.5-pro-exp-03-25-pro"` (lines 170-197) — uses same API ID as above
- `id: "gemini-2.0-flash-lite-preview-02-05"` (lines 115-141) — graduated to stable

**File**: `lib/openproviders/provider-map.ts`
**Action**: Remove:
```
"gemini-2.5-pro-exp-03-25": "google",
"gemini-2.0-flash-lite-preview-02-05": "google",
```

**File**: `lib/openproviders/types.ts`
**Action**: Remove `"gemini-2.5-pro-exp-03-25"` and `"gemini-2.0-flash-lite-preview-02-05"` from `GeminiModel`.

### Step 1.9 — Fix `o3` apiSdk bug

**File**: `lib/models/data/openai.ts`, line 301
**Action**: Change `openproviders("o3-mini", undefined, apiKey)` → `openproviders("o3", undefined, apiKey)`.

This is a data bug — the `o3` model entry has been calling `o3-mini` instead of `o3`.

### Step 1.10 — Verification

After all Phase 1 changes:
```bash
bun run typecheck   # Must pass — no dangling type references
bun run lint        # Must pass
bun run dev         # Smoke test — model selector should load without errors
```

Remaining Claude entries after Phase 1: `claude-3-5-haiku-latest` (pending Q1), `claude-3-haiku-20240307`, `claude-4-opus`, `claude-4-sonnet`.
Remaining OpenAI entries: all GPT-4.1 family, `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`, `o1`, `o3-mini`, `o3`, `o4-mini`.
Remaining Gemini entries: `gemini-1.5-*` family, `gemini-2.0-flash-001`, `gemma-3-27b-it`.
Remaining Grok entries: `grok-2`, `grok-2-vision`.

---

## Phase 2 — Update Existing Entries

**Goal**: Fix inaccurate data on models that are staying in the registry.

### Step 2.1 — Update `claude-4-opus` with correct API ID and `apiSdk`

**File**: `lib/models/data/claude.ts` (the entry at lines 199-223)
**Changes**:
- `id`: `"claude-4-opus"` → `"claude-opus-4-20250514"`
- `name`: `"Claude 4 Opus"` → `"Claude Opus 4"`
- `modelFamily`: `"Claude 4"` (keep)
- `description`: Update to reflect it's now a production model, not preview
- `tags`: Remove `"preview"`, add `"flagship"`
- `contextWindow`: `500000` → `200000`
- `inputCost`: `25.0` → `15.0`
- `outputCost`: `125.0` → `75.0`
- `audio`: `true` → verify (research says vision yes, audio unverified for Opus 4)
- Add `apiSdk`: `(apiKey?: string) => openproviders("claude-opus-4-20250514", undefined, apiKey)`
- Add `releasedAt`: `"2025-05-14"`

**File**: `lib/openproviders/provider-map.ts`
**Action**: Add `"claude-opus-4-20250514": "anthropic"`. Remove old `"claude-4-opus"` if it was there (it was not in provider-map — this entry had no apiSdk, so no routing entry existed).

**File**: `lib/openproviders/types.ts`
**Action**: Add `"claude-opus-4-20250514"` to `AnthropicModel`.

### Step 2.2 — Update `claude-4-sonnet` with correct API ID and `apiSdk`

**File**: `lib/models/data/claude.ts` (the entry at lines 224-247)
**Changes**:
- `id`: `"claude-4-sonnet"` → `"claude-sonnet-4-20250514"`
- `name`: `"Claude 4 Sonnet"` → `"Claude Sonnet 4"`
- `description`: Update to reflect production status
- `tags`: Remove `"preview"`, add `"balanced"`, `"reasoning"`
- `contextWindow`: `500000` → `200000`
- `inputCost`: `5.0` → `3.0`
- `outputCost`: `25.0` → `15.0`
- Add `apiSdk`: `(apiKey?: string) => openproviders("claude-sonnet-4-20250514", undefined, apiKey)`
- Add `releasedAt`: `"2025-05-14"`

**File**: `lib/openproviders/provider-map.ts`
**Action**: Add `"claude-sonnet-4-20250514": "anthropic"`.

**File**: `lib/openproviders/types.ts`
**Action**: Add `"claude-sonnet-4-20250514"` to `AnthropicModel`.

### Step 2.3 — Update `gemini-2.0-flash-001` pricing

**File**: `lib/models/data/gemini.ts` (the entry at lines 87-114)
**Changes**:
- `inputCost`: `0.075` → `0.10`
- `outputCost`: `0.30` → `0.40`

These reflect the current pricing on https://ai.google.dev/gemini-api/docs/pricing for the paid tier.

### Step 2.4 — Update `claude-3-5-haiku-latest` (CONDITIONAL on Q1 answer)

**IF alias routes to Haiku 4.5** (update):
- `id`: keep `"claude-3-5-haiku-latest"` (alias still works) OR change to `"claude-haiku-4-5"`
- `name`: `"Claude 3.5 Haiku"` → `"Claude Haiku 4.5"`
- `modelFamily`: `"Claude 3.5"` → `"Claude 4.5"`
- `inputCost`: `0.25` → `1.0`
- `outputCost`: `1.25` → `5.0`
- `reasoningText`: `false` → `true`

**IF alias is broken** (remove):
- Delete the entire entry and clean up provider-map + types.

### Step 2.5 — Verification

```bash
bun run typecheck
bun run lint
```

---

## Phase 3 — Add New Models

**Goal**: Add the current-generation flagship models from each provider.

Follow the 3-step pattern from `@.agents/skills/add-model/SKILL.md` for each model:
1. Add `ModelConfig` to `lib/models/data/[provider].ts`
2. Add model ID mapping to `lib/openproviders/provider-map.ts`
3. Add to type union in `lib/openproviders/types.ts`

### Step 3.1 — Add Anthropic Claude 4.x flagship trio

Add these three entries to `lib/models/data/claude.ts` at the **top** of the array (most important first):

**3.1a — `claude-opus-4-6`** (Anthropic's best, released Feb 5, 2026)
```
id: "claude-opus-4-6"
name: "Claude Opus 4.6"
provider: "Anthropic"
providerId: "anthropic"
modelFamily: "Claude 4.6"
baseProviderId: "claude"
description: "Anthropic's most intelligent model. Excels at coding, agents, and complex reasoning."
tags: ["flagship", "reasoning", "agents", "coding", "advanced"]
contextWindow: 200000
inputCost: 5.0
outputCost: 25.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Medium"
intelligence: "High"
website: "https://www.anthropic.com"
apiDocs: "https://docs.anthropic.com"
modelPage: "https://anthropic.com/news/claude-opus-4-6"
releasedAt: "2026-02-05"
icon: "claude"
apiSdk: (apiKey?: string) => openproviders("claude-opus-4-6", undefined, apiKey)
```

**3.1b — `claude-sonnet-4-5`** (Best speed/intelligence balance)
```
id: "claude-sonnet-4-5"
name: "Claude Sonnet 4.5"
provider: "Anthropic"
providerId: "anthropic"
modelFamily: "Claude 4.5"
baseProviderId: "claude"
description: "Best combination of speed and intelligence for everyday tasks."
tags: ["balanced", "fast", "reasoning", "coding"]
contextWindow: 200000
inputCost: 3.0
outputCost: 15.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Fast"
intelligence: "High"
website: "https://www.anthropic.com"
apiDocs: "https://docs.anthropic.com"
releasedAt: "2025-09-29"
icon: "claude"
apiSdk: (apiKey?: string) => openproviders("claude-sonnet-4-5", undefined, apiKey)
```

**3.1c — `claude-haiku-4-5`** (Fast and affordable)
```
id: "claude-haiku-4-5"
name: "Claude Haiku 4.5"
provider: "Anthropic"
providerId: "anthropic"
modelFamily: "Claude 4.5"
baseProviderId: "claude"
description: "Fastest Claude model with near-frontier intelligence."
tags: ["fast", "cheap", "lightweight", "reasoning"]
contextWindow: 200000
inputCost: 1.0
outputCost: 5.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Fast"
intelligence: "Medium"
website: "https://www.anthropic.com"
apiDocs: "https://docs.anthropic.com"
releasedAt: "2025-10-01"
icon: "claude"
apiSdk: (apiKey?: string) => openproviders("claude-haiku-4-5", undefined, apiKey)
```

**Provider map** — add to `lib/openproviders/provider-map.ts`:
```
"claude-opus-4-6": "anthropic",
"claude-sonnet-4-5": "anthropic",
"claude-sonnet-4-5-20250929": "anthropic",
"claude-haiku-4-5": "anthropic",
"claude-haiku-4-5-20251001": "anthropic",
```

**Types** — add to `AnthropicModel` in `lib/openproviders/types.ts`:
```
| "claude-opus-4-6"
| "claude-sonnet-4-5"
| "claude-sonnet-4-5-20250929"
| "claude-haiku-4-5"
| "claude-haiku-4-5-20251001"
```

### Step 3.2 — Add OpenAI GPT-5 family

Add these four entries to `lib/models/data/openai.ts`:

**3.2a — `gpt-5.2`** (OpenAI's best, latest flagship)
```
id: "gpt-5.2"
name: "GPT-5.2"
provider: "OpenAI"
providerId: "openai"
modelFamily: "GPT-5"
baseProviderId: "openai"
description: "OpenAI's best model for coding and agentic tasks across industries."
tags: ["flagship", "reasoning", "coding", "agents"]
contextWindow: 400000
inputCost: 1.75
outputCost: 14.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Medium"
intelligence: "High"
website: "https://openai.com"
apiDocs: "https://platform.openai.com/docs/models/gpt-5.2"
modelPage: "https://platform.openai.com/docs/models/gpt-5.2"
releasedAt: "2025-12-11"
icon: "openai"
apiSdk: (apiKey?: string) => openproviders("gpt-5.2", undefined, apiKey)
```

**3.2b — `gpt-5`** (Previous flagship, still very capable)
```
id: "gpt-5"
name: "GPT-5"
provider: "OpenAI"
providerId: "openai"
modelFamily: "GPT-5"
baseProviderId: "openai"
description: "Previous intelligent reasoning model for coding and agentic tasks."
tags: ["reasoning", "coding", "agents", "balanced"]
contextWindow: 400000
inputCost: 1.25
outputCost: 10.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Medium"
intelligence: "High"
website: "https://openai.com"
apiDocs: "https://platform.openai.com/docs/models/gpt-5"
modelPage: "https://platform.openai.com/docs/models/gpt-5"
releasedAt: "2025-08-07"
icon: "openai"
apiSdk: (apiKey?: string) => openproviders("gpt-5", undefined, apiKey)
```

**3.2c — `gpt-5-mini`** (Fast, cost-efficient reasoning)
```
id: "gpt-5-mini"
name: "GPT-5 Mini"
provider: "OpenAI"
providerId: "openai"
modelFamily: "GPT-5"
baseProviderId: "openai"
description: "A faster, cost-efficient version of GPT-5 for well-defined tasks."
tags: ["fast", "cheap", "reasoning", "efficient"]
contextWindow: 400000
inputCost: 0.25
outputCost: 2.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Fast"
intelligence: "Medium"
website: "https://openai.com"
apiDocs: "https://platform.openai.com/docs/models/gpt-5-mini"
modelPage: "https://platform.openai.com/docs/models/gpt-5-mini"
releasedAt: "2025-08-07"
icon: "openai"
apiSdk: (apiKey?: string) => openproviders("gpt-5-mini", undefined, apiKey)
```

**3.2d — `gpt-5-nano`** (Cheapest, high-throughput)
```
id: "gpt-5-nano"
name: "GPT-5 Nano"
provider: "OpenAI"
providerId: "openai"
modelFamily: "GPT-5"
baseProviderId: "openai"
description: "Fastest, most cost-efficient GPT-5 model for simple tasks."
tags: ["fast", "cheap", "lightweight"]
contextWindow: 400000
inputCost: 0.05
outputCost: 0.40
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Fast"
intelligence: "Low"
website: "https://openai.com"
apiDocs: "https://platform.openai.com/docs/models/gpt-5-nano"
modelPage: "https://platform.openai.com/docs/models/gpt-5-nano"
releasedAt: "2025-08-07"
icon: "openai"
apiSdk: (apiKey?: string) => openproviders("gpt-5-nano", undefined, apiKey)
```

**Provider map** — add:
```
"gpt-5.2": "openai",
"gpt-5.2-2025-12-11": "openai",
"gpt-5": "openai",
"gpt-5-2025-08-07": "openai",
"gpt-5-mini": "openai",
"gpt-5-mini-2025-08-07": "openai",
"gpt-5-nano": "openai",
"gpt-5-nano-2025-08-07": "openai",
```

**Types** — add to `OpenAIModel`:
```
| "gpt-5.2"
| "gpt-5.2-2025-12-11"
| "gpt-5"
| "gpt-5-2025-08-07"
| "gpt-5-mini"
| "gpt-5-mini-2025-08-07"
| "gpt-5-nano"
| "gpt-5-nano-2025-08-07"
```

### Step 3.3 — Add Google Gemini 2.5 stable + 3.0 preview

Add these five entries to `lib/models/data/gemini.ts`:

**3.3a — `gemini-2.5-flash`** (Best price-performance Google model)
```
id: "gemini-2.5-flash"
name: "Gemini 2.5 Flash"
provider: "Google"
providerId: "google"
modelFamily: "Gemini"
baseProviderId: "google"
description: "Best price-performance Gemini model with thinking capabilities."
tags: ["fast", "reasoning", "balanced", "multimodal"]
contextWindow: 1048576
inputCost: 0.30
outputCost: 2.50
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: true
reasoningText: true
openSource: false
speed: "Fast"
intelligence: "Medium"
website: "https://gemini.google.com"
apiDocs: "https://ai.google.dev/api/docs"
modelPage: "https://deepmind.google/technologies/gemini"
icon: "gemini"
apiSdk: (apiKey?: string) => openproviders("gemini-2.5-flash", undefined, apiKey)
```

**3.3b — `gemini-2.5-pro`** (Google's thinking model)
```
id: "gemini-2.5-pro"
name: "Gemini 2.5 Pro"
provider: "Google"
providerId: "google"
modelFamily: "Gemini"
baseProviderId: "google"
description: "State-of-the-art thinking model for code, math, and complex reasoning."
tags: ["reasoning", "thinking", "coding", "flagship"]
contextWindow: 1048576
inputCost: 1.25
outputCost: 10.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: true
reasoningText: true
openSource: false
speed: "Medium"
intelligence: "High"
website: "https://gemini.google.com"
apiDocs: "https://ai.google.dev/api/docs"
modelPage: "https://deepmind.google/technologies/gemini"
icon: "gemini"
apiSdk: (apiKey?: string) => openproviders("gemini-2.5-pro", undefined, apiKey)
```

**3.3c — `gemini-2.5-flash-lite`** (Cheapest Google option)
```
id: "gemini-2.5-flash-lite"
name: "Gemini 2.5 Flash-Lite"
provider: "Google"
providerId: "google"
modelFamily: "Gemini"
baseProviderId: "google"
description: "Fastest, most cost-efficient Gemini model for high-throughput tasks."
tags: ["fast", "cheap", "lightweight", "efficient"]
contextWindow: 1048576
inputCost: 0.10
outputCost: 0.40
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: true
reasoningText: true
openSource: false
speed: "Fast"
intelligence: "Low"
website: "https://gemini.google.com"
apiDocs: "https://ai.google.dev/api/docs"
modelPage: "https://deepmind.google/technologies/gemini"
icon: "gemini"
apiSdk: (apiKey?: string) => openproviders("gemini-2.5-flash-lite", undefined, apiKey)
```

**3.3d — `gemini-2.0-flash-lite`** (Stable replacement for preview entry removed in Phase 1)
```
id: "gemini-2.0-flash-lite"
name: "Gemini 2.0 Flash-Lite"
provider: "Google"
providerId: "google"
modelFamily: "Gemini"
baseProviderId: "google"
description: "Cost-efficient workhorse model optimized for speed."
tags: ["fast", "cheap", "efficient", "lightweight"]
contextWindow: 1048576
inputCost: 0.075
outputCost: 0.30
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: true
reasoningText: false
openSource: false
speed: "Fast"
intelligence: "Low"
website: "https://gemini.google.com"
apiDocs: "https://ai.google.dev/api/docs"
modelPage: "https://deepmind.google/technologies/gemini"
icon: "gemini"
apiSdk: (apiKey?: string) => openproviders("gemini-2.0-flash-lite", undefined, apiKey)
```

**3.3e — `gemini-3-pro-preview`** (Most intelligent Google model, preview)
```
id: "gemini-3-pro-preview"
name: "Gemini 3 Pro Preview"
provider: "Google"
providerId: "google"
modelFamily: "Gemini"
baseProviderId: "google"
description: "Google's most intelligent model for multimodal reasoning and agentic tasks."
tags: ["preview", "flagship", "reasoning", "multimodal", "advanced"]
contextWindow: 1048576
inputCost: 2.0
outputCost: 12.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: true
reasoningText: true
openSource: false
speed: "Medium"
intelligence: "High"
website: "https://gemini.google.com"
apiDocs: "https://ai.google.dev/api/docs"
modelPage: "https://deepmind.google/technologies/gemini"
icon: "gemini"
apiSdk: (apiKey?: string) => openproviders("gemini-3-pro-preview", undefined, apiKey)
```

**Provider map** — add:
```
"gemini-2.5-flash": "google",
"gemini-2.5-pro": "google",
"gemini-2.5-flash-lite": "google",
"gemini-2.0-flash-lite": "google",
"gemini-2.0-flash-lite-001": "google",
"gemini-3-pro-preview": "google",
```

**Types** — add to `GeminiModel`:
```
| "gemini-2.5-flash"
| "gemini-2.5-pro"
| "gemini-2.5-flash-lite"
| "gemini-2.0-flash-lite"
| "gemini-2.0-flash-lite-001"
| "gemini-3-pro-preview"
```

### Step 3.4 — Add xAI Grok 4 family

Add these three entries to `lib/models/data/grok.ts`:

**3.4a — `grok-4`** (xAI flagship reasoning model)
```
id: "grok-4"
name: "Grok 4"
provider: "xAI"
providerId: "xai"
modelFamily: "Grok"
baseProviderId: "xai"
description: "xAI's most powerful reasoning model for complex tasks."
tags: ["flagship", "reasoning", "advanced"]
contextWindow: 256000
inputCost: 3.0
outputCost: 15.0
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Medium"
intelligence: "High"
website: "https://x.ai"
apiDocs: "https://docs.x.ai/docs/models"
releasedAt: "2025-07-09"
icon: "xai"
apiSdk: (apiKey?: string) => openproviders("grok-4", undefined, apiKey)
```

**3.4b — `grok-4-1-fast-reasoning`** (Best agentic model, newest)
```
id: "grok-4-1-fast-reasoning"
name: "Grok 4.1 Fast"
provider: "xAI"
providerId: "xai"
modelFamily: "Grok"
baseProviderId: "xai"
description: "xAI's best agentic model for tool-calling and real-world tasks."
tags: ["fast", "agents", "tools", "reasoning", "cheap"]
contextWindow: 2000000
inputCost: 0.20
outputCost: 0.50
priceUnit: "per 1M tokens"
vision: true
tools: true
audio: false
reasoningText: true
openSource: false
speed: "Fast"
intelligence: "High"
website: "https://x.ai"
apiDocs: "https://docs.x.ai/docs/models"
releasedAt: "2025-11-19"
icon: "xai"
apiSdk: (apiKey?: string) => openproviders("grok-4-1-fast-reasoning", undefined, apiKey)
```

**3.4c — `grok-code-fast-1`** (Coding specialist)
```
id: "grok-code-fast-1"
name: "Grok Code Fast"
provider: "xAI"
providerId: "xai"
modelFamily: "Grok"
baseProviderId: "xai"
description: "Specialized model optimized for agentic coding tasks."
tags: ["coding", "fast", "agents", "cheap"]
contextWindow: 256000
inputCost: 0.20
outputCost: 1.50
priceUnit: "per 1M tokens"
vision: false
tools: true
audio: false
reasoningText: false
openSource: false
speed: "Fast"
intelligence: "High"
website: "https://x.ai"
apiDocs: "https://docs.x.ai/docs/models"
icon: "xai"
apiSdk: (apiKey?: string) => openproviders("grok-code-fast-1", undefined, apiKey)
```

**Provider map** — add:
```
"grok-4": "xai",
"grok-4-fast-reasoning": "xai",
"grok-4-fast-non-reasoning": "xai",
"grok-4-1-fast-reasoning": "xai",
"grok-4-1-fast-non-reasoning": "xai",
"grok-code-fast-1": "xai",
```

**Types** — add to `XaiModel`:
```
| "grok-4"
| "grok-4-fast-reasoning"
| "grok-4-fast-non-reasoning"
| "grok-4-1-fast-reasoning"
| "grok-4-1-fast-non-reasoning"
| "grok-code-fast-1"
```

### Step 3.5 — Final Verification

```bash
bun run typecheck   # All type unions align with provider-map and data files
bun run lint        # No lint errors
bun run dev         # Model selector shows all new models
```

Manually verify in the running app:
- [ ] New models appear in the model selector UI
- [ ] Selecting a new model does not crash
- [ ] Sending a message with at least one new model per provider succeeds

---

## Summary of Files Changed

| File | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| `lib/models/data/claude.ts` | Remove 5 entries | Update 2 entries | Add 3 entries |
| `lib/models/data/openai.ts` | Remove 2 entries, fix 1 bug | — | Add 4 entries |
| `lib/models/data/gemini.ts` | Remove 3 entries | Update 1 entry | Add 5 entries |
| `lib/models/data/grok.ts` | Remove 4 entries | — | Add 3 entries |
| `lib/openproviders/provider-map.ts` | Remove ~20 mappings | Add 2 mappings | Add ~20 mappings |
| `lib/openproviders/types.ts` | Remove ~20 type members | Add 2 type members | Add ~20 type members |

**Total**: ~14 model entries removed, ~3 updated, ~15 added across 6 files.

---

## Follow-Up Tasks (Out of Scope)

- [ ] Upgrade `@ai-sdk/*` packages from v3 to latest (separate PR)
- [ ] Update OpenRouter data file with current model references
- [ ] Update `lib/config.ts` `MODEL_DEFAULT` if desired (currently `gpt-4.1-nano` — still valid)
- [ ] Add Grok 4 parameter filtering if `presencePenalty`/`frequencyPenalty` are used in API route
- [ ] Verify and add `gpt-5.1` once pricing is confirmed
- [ ] Consider adding `gpt-5.2-pro` ($21/$168) for power users
