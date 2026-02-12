# Plan: Descope Self-Hosting Functionality

> **Status:** Ready for implementation
> **Created:** 2026-02-11
> **Goal:** Remove all self-hosting infrastructure (Docker, Ollama, standalone build) while preserving BYOK functionality intact.
> **Affected files:** ~35 files (4 delete, ~12 edit, ~19 docs updates)

---

## Context

Self-hosting features (Docker, Ollama local models) were inherited from the upstream Zola repo. Not A Wrapper is deployed exclusively on Vercel with Convex and Clerk as cloud dependencies, making true self-hosting impossible without those services anyway. We are descoping self-hosting to reduce maintenance burden and simplify the codebase.

**BYOK (Bring Your Own Key) is explicitly preserved.** An earlier analysis confirmed zero coupling between BYOK and Ollama/self-hosting code.

---

## Pre-Implementation Checklist

Before starting, run these commands and verify they pass:

```bash
bun run lint
bun run typecheck
```

After EACH priority section, re-run both commands and fix any issues before proceeding.

---

## Priority 1: Delete Self-Hosting Infrastructure Files

These files exist solely for Docker/self-hosted deployments. Delete all four.

### Step 1.1: Delete Docker files

Delete the following files:

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.ollama.yml`
- `.dockerignore`

### Step 1.2: Verify

Run `bun run lint && bun run typecheck` — no source code depends on these files.

---

## Priority 2: Remove Ollama Integration Code

Ollama is the local-model provider for self-hosting. It is woven through the model/provider system but cleanly separable. Work through these in order — the sequence avoids broken imports.

### Step 2.1: Remove Ollama types (`lib/openproviders/types.ts`)

**Remove these lines/blocks:**

1. Delete the `StaticOllamaModel` type (line 150):
   ```
   export type StaticOllamaModel = "llama3.2:latest" | "qwen2.5-coder:latest"
   ```

2. Delete the `OllamaModel` type (line 153):
   ```
   export type OllamaModel = StaticOllamaModel | (string & {})
   ```

3. Remove `"ollama"` from the `Provider` union (line 162). The type should become:
   ```typescript
   export type Provider =
     | "openai"
     | "mistral"
     | "perplexity"
     | "google"
     | "anthropic"
     | "xai"
     | "openrouter"
   ```

4. Remove `OllamaModel` from the `SupportedModel` union (line 172). The type should become:
   ```typescript
   export type SupportedModel =
     | OpenAIModel
     | MistralModel
     | GeminiModel
     | PerplexityModel
     | AnthropicModel
     | XaiModel
     | OpenRouterModel
   ```

### Step 2.2: Remove Ollama from provider map (`lib/openproviders/provider-map.ts`)

1. Delete the two static Ollama entries from `MODEL_PROVIDER_MAP` (lines 130-132):
   ```
   // Static Ollama models
   "llama3.2:latest": "ollama",
   "qwen2.5-coder:latest": "ollama",
   ```

2. Delete the entire `isOllamaModel` function (lines 135-159).

3. In `getProviderForModel`, remove the Ollama fallback check (lines 170-173):
   ```typescript
   // If not found in static mapping, check if it looks like an Ollama model
   if (isOllamaModel(model)) {
     return "ollama"
   }
   ```

   The function should now be:
   ```typescript
   export function getProviderForModel(model: SupportedModel): Provider {
     if (model.startsWith("openrouter:")) {
       return "openrouter"
     }

     const provider = MODEL_PROVIDER_MAP[model]
     if (provider) return provider

     throw new Error(`Unknown provider for model: ${model}`)
   }
   ```

### Step 2.3: Remove Ollama from provider factory (`lib/openproviders/index.ts`)

1. Remove the `OllamaModel` import from the types import block (line 13):
   ```
   OllamaModel,
   ```

2. Delete the `getOllamaBaseURL` function (lines 20-30):
   ```typescript
   // Get Ollama base URL from environment or use default
   const getOllamaBaseURL = () => {
     ...
   }
   ```

3. Delete the `createOllamaProvider` function (lines 32-39):
   ```typescript
   // Create Ollama provider instance with configurable baseURL
   const createOllamaProvider = () => {
     ...
   }
   ```

4. Delete the Ollama branch from the `openproviders` function (lines 107-110):
   ```typescript
   if (provider === "ollama") {
     const ollamaProvider = createOllamaProvider()
     return ollamaProvider(modelId as OllamaModel)
   }
   ```

### Step 2.4: Delete the Ollama model data file

Delete the entire file: `lib/models/data/ollama.ts`

### Step 2.5: Remove Ollama from model aggregation (`lib/models/index.ts`)

1. Remove the Ollama import (line 7):
   ```
   import { getOllamaModels, ollamaModels } from "./data/ollama"
   ```

2. Remove `...ollamaModels` from the `STATIC_MODELS` array (line 22):
   ```
   ...ollamaModels, // Static fallback Ollama models
   ```

3. Simplify `getAllModels()` — remove the entire dynamic Ollama detection logic. The function should become:
   ```typescript
   export async function getAllModels(): Promise<ModelConfig[]> {
     return STATIC_MODELS
   }
   ```

   This removes the cache infrastructure (`dynamicModelsCache`, `lastFetchTime`, `CACHE_DURATION`) since it only existed for Ollama dynamic detection. Remove those variables too (lines 27-29):
   ```
   let dynamicModelsCache: ModelConfig[] | null = null
   let lastFetchTime = 0
   const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
   ```

4. In `getModelsWithAccessFlags()`, remove the Ollama free-model check (line 65):
   ```
   || model.providerId === "ollama"
   ```
   The filter should become:
   ```typescript
   .filter((model) => FREE_MODELS_IDS.includes(model.id))
   ```

5. Update `getModelInfo` to remove cache references (lines 112-119). Since there's no dynamic cache anymore:
   ```typescript
   export function getModelInfo(modelId: string): ModelConfig | undefined {
     return STATIC_MODELS.find((model) => model.id === modelId)
   }
   ```

6. Remove `refreshModelsCache()` function (lines 126-129) — no longer needed.

7. Update `MODELS` export if it references the cache. It currently references `STATIC_MODELS` which is fine.

### Step 2.6: Simplify user-keys types (`lib/user-keys.ts`)

1. Remove the `ProviderWithoutOllama` type export (line 8):
   ```
   export type ProviderWithoutOllama = Exclude<Provider, "ollama">
   ```

2. Replace all usages of `ProviderWithoutOllama` with `Provider` in this file:
   - `hasUserKey` parameter type (line 15): `provider: ProviderWithoutOllama` → `provider: Provider`
   - `getUserKeyFromConvex` parameter type (line 38): `provider: ProviderWithoutOllama` → `provider: Provider`
   - `getEffectiveApiKey` parameter type (line 69): `provider: ProviderWithoutOllama` → `provider: Provider`
   - `envKeyMap` type annotation (line 81): `Record<ProviderWithoutOllama, string | undefined>` → `Record<Provider, string | undefined>`

   **IMPORTANT**: After removing `"ollama"` from the `Provider` union in Step 2.1, `Provider` already excludes Ollama. So `ProviderWithoutOllama` is now redundant and identical to `Provider`.

### Step 2.7: Update chat API route (`app/api/chat/route.ts`)

1. Change the import (line 15) from:
   ```typescript
   import type { ProviderWithoutOllama } from "@/lib/user-keys"
   ```
   to:
   ```typescript
   import type { Provider } from "@/lib/user-keys"
   ```

2. Update the type cast (line 135) from:
   ```typescript
   provider as ProviderWithoutOllama,
   ```
   to:
   ```typescript
   provider as Provider,
   ```

3. Remove the Ollama exception in the API key pre-flight check (line 143). Change:
   ```typescript
   if (!apiKey && provider !== "ollama") {
   ```
   to:
   ```typescript
   if (!apiKey) {
   ```

### Step 2.8: Update providers API route (`app/api/providers/route.ts`)

1. Update the import (line 2) from:
   ```typescript
   import { ProviderWithoutOllama } from "@/lib/user-keys"
   ```
   to:
   ```typescript
   import { Provider } from "@/lib/user-keys"
   ```

2. Delete the Ollama early-return block (lines 18-24):
   ```typescript
   // Skip Ollama since it doesn't use API keys
   if (provider === "ollama") {
     return NextResponse.json({
       hasUserKey: false,
       provider,
     })
   }
   ```

3. Update the type annotation (line 28) from:
   ```typescript
   const envKeyMap: Record<ProviderWithoutOllama, string | undefined> = {
   ```
   to:
   ```typescript
   const envKeyMap: Record<Provider, string | undefined> = {
   ```

4. Update the type cast (line 38) from:
   ```typescript
   const hasEnvKey = !!envKeyMap[provider as ProviderWithoutOllama]
   ```
   to:
   ```typescript
   const hasEnvKey = !!envKeyMap[provider as Provider]
   ```

### Step 2.9: Remove Ollama from UI providers list (`lib/providers/index.ts`)

1. Remove the Ollama icon import (line 9):
   ```typescript
   import Ollama from "@/components/icons/ollama"
   ```

2. Remove the Ollama entry from the `PROVIDERS` array (lines 74-77):
   ```typescript
   {
     id: "ollama",
     name: "Ollama",
     icon: Ollama,
   },
   ```

### Step 2.10: Delete Ollama icon component

Delete the file: `components/icons/ollama.tsx`

### Step 2.11: Remove Ollama settings UI

1. Delete the file: `app/components/layout/settings/connections/ollama-section.tsx`

2. Edit `app/components/layout/settings/settings-content.tsx`:
   - Remove the import (line 23):
     ```typescript
     import { OllamaSection } from "./connections/ollama-section"
     ```
   - Remove both conditional renders. In the mobile tabs content (line 130):
     ```typescript
     {isDev && <OllamaSection />}
     ```
   - And in the desktop tabs content (line 212):
     ```typescript
     {isDev && <OllamaSection />}
     ```

### Step 2.12: Verify Priority 2

Run `bun run lint && bun run typecheck`. All Ollama references should be gone from source code. Fix any issues before proceeding.

---

## Priority 3: Update Configuration

### Step 3.1: Remove standalone output from Next.js config (`next.config.ts`)

Remove line 4:
```typescript
output: "standalone",
```

**Rationale**: `output: "standalone"` is only needed for Docker. Vercel works without it (and ignores it).

### Step 3.2: Remove Ollama env vars from `.env.example`

Remove the "Local AI Models" section (lines 72-80):
```
# -----------------------------------------------------------------------------
# Local AI Models (Optional)
# -----------------------------------------------------------------------------
# Ollama - for running local models
# Default: http://localhost:11434
# OLLAMA_BASE_URL=http://localhost:11434

# Set to 'true' to disable Ollama auto-detection
# DISABLE_OLLAMA=false
```

### Step 3.3: Verify Priority 3

Run `bun run lint && bun run typecheck`.

---

## Priority 4: Update User-Facing Documentation

### Step 4.1: Rewrite `INSTALL.md`

Remove these sections entirely:

1. **Ollama Setup section** (lines 171-319): Everything from `## Ollama Setup (Local AI Models)` through `## Disabling Ollama` and its subsections, including:
   - Installing Ollama
   - Setting up Models
   - Not A Wrapper + Ollama Integration
   - Configuration Options
   - Docker with Ollama
   - Troubleshooting Ollama
   - Disabling Ollama
   - Recommended Models by Use Case

2. **Docker Installation section** (lines 400-529): Everything from `## Docker Installation` through `### Option 3: Docker Compose with Ollama`, including:
   - Option 1: Single Container with Docker
   - Option 2: Docker Compose
   - Option 3: Docker Compose with Ollama

3. **Self-Hosted Production section** (lines 582-593): The `### Self-Hosted Production` section that says:
   ```
   For a self-hosted production environment...
   bun run build
   bun run start
   ```

4. In the **Prerequisites** section (line 13), remove:
   ```
   - API keys for supported AI models (OpenAI, Anthropic, etc.) OR Ollama for local models
   ```
   Replace with:
   ```
   - API keys for supported AI models (OpenAI, Anthropic, etc.)
   ```

5. In the **Environment Setup** section, remove the Ollama env var lines (lines 44-45):
   ```
   # Ollama (for local AI models)
   OLLAMA_BASE_URL=http://localhost:11434
   ```

6. In the **Troubleshooting** section, remove Docker troubleshooting (lines 616-618):
   ```
   3. **Docker container exits immediately**
      - Check logs using `docker logs <container_id>`
      - Ensure all required environment variables are set
   ```

7. Update the opening paragraph (line 3) — remove "including Docker deployment options":
   ```
   This guide covers how to install and run Not A Wrapper on different platforms, including Docker deployment options.
   ```
   Replace with:
   ```
   This guide covers how to install and run Not A Wrapper locally for development and deploy to Vercel for production.
   ```

### Step 4.2: Update `README.md`

1. Remove "Self-hostable" from features (line 14):
   ```
   - 🏠 **Self-hostable** - Full control over your data
   ```

2. Remove the Ollama feature line (line 16):
   ```
   - 🖥️ **Local AI with Ollama** - Run models locally with automatic detection
   ```

3. Remove "Option 2: With Ollama (Local)" quick start (lines 32-46):
   ```markdown
   ### Option 2: With Ollama (Local)
   ...
   Not A Wrapper will automatically detect your local Ollama models!
   ```

4. Remove "Option 3: Docker with Ollama" quick start (lines 58-64):
   ```markdown
   ### Option 3: Docker with Ollama
   ...
   ```

5. Rename "Option 1: With OpenAI (Cloud)" to just "### Quick Start" since it's the only option now.

6. Remove the Ollama row from the providers table (line 78):
   ```
   | **Ollama** | Any local model | Local, Private |
   ```

### Step 4.3: Update OpenGraph alt text (`app/opengraph-image.alt`)

Change:
```
Not A Wrapper is an open-source multi-AI chat application with support for 100+ models, BYOK, and local models via Ollama.
```
To:
```
Not A Wrapper is an open-source multi-AI chat application with support for 100+ models and BYOK.
```

---

## Priority 5: Update Marketing Copy and Metadata

### Step 5.1: Update root layout metadata (`app/layout.tsx`)

Change the description (line 33-34) from:
```typescript
"Not A Wrapper is an open-source, Next.js-based AI chat application that provides a unified interface for multiple models, including OpenAI, Mistral, Claude, and Gemini. BYOK-ready and self-hostable.",
```
To:
```typescript
"Not A Wrapper is an open-source, Next.js-based AI chat application that provides a unified interface for multiple models, including OpenAI, Mistral, Claude, and Gemini. BYOK-ready.",
```

### Step 5.2: Update app info content (`app/components/layout/app-info/app-info-content.tsx`)

Change line 10 from:
```
Multi-model comparison, BYOK-ready, and fully self-hostable.
```
To:
```
Multi-model comparison and BYOK-ready.
```

### Step 5.3: Update project spec (`spec.md`)

1. Remove the Ollama checkbox from Phase 1 (line 25):
   ```
   - [x] Ollama local model integration
   ```

2. Update the Product Vision (line 9) from:
   ```
   Provide a powerful, self-hostable AI chat interface that lets users interact with any AI model through a unified experience, with support for multi-model comparison, BYOK, and local models.
   ```
   To:
   ```
   Provide a powerful AI chat interface that lets users interact with any AI model through a unified experience, with support for multi-model comparison and BYOK.
   ```

### Step 5.4: Verify Priorities 4-5

Run `bun run lint && bun run typecheck`.

---

## Priority 6: Update Internal Agent Documentation

These are `.agents/` files used by AI assistants. Lower urgency but prevents stale context from causing mistakes in future AI-assisted work.

### Step 6.1: Update deployment docs (`.agents/context/deployment.md`)

1. Remove the entire "Docker Deployment (Alternative)" section (lines 217-301), including:
   - Dockerfile code block
   - Docker Compose code block
   - Running with Docker instructions

2. Remove `Ollama` from the architecture diagram (lines 27-30):
   ```
   │  │  ┌──────────────┐  ┌────────────┐ │  │
   │  │  │  AI Providers│  │   Ollama   │ │  │
   │  │  │  (Anthropic, │  │   (Local   │ │  │
   │  │  │   OpenAI...) │  │   Models)  │ │  │
   │  │  └──────────────┘  └────────────┘ │  │
   ```
   Simplify to just AI Providers.

3. Update the subtitle (line 5):
   ```
   > **Alternative:** Docker (self-hosted)
   ```
   Remove this line.

4. Remove `output: "standalone"` reference from Next.js Configuration section (line 374-376).

### Step 6.2: Update icons README (`components/icons/README.md`)

Remove the `OllamaIcon` entry (line 123):
```
- `OllamaIcon`
```

### Step 6.3: Update remaining `.agents/` files

For each of these files, find and remove or update Ollama/self-hosting/Docker mentions. These are minor text changes:

- `.agents/context/architecture.md` — remove Ollama from architecture diagram
- `.agents/context/glossary.md` — remove Ollama model references
- `.agents/context/decisions/002-vercel-ai-sdk.md` — remove Ollama from supported providers list
- `.agents/context/decisions/004-exa-vs-tavily.md` — remove "self-hosters" references
- `.agents/context/research/competitive-feature-analysis.md` — remove self-hosting as competitive advantage
- `.agents/context/research/tool-calling-infrastructure.md` — remove Ollama mentions
- `.agents/plans/thinking-reasoning-configuration.md` — remove `ollama.ts` file references
- `.agents/plans/tool-calling-infrastructure.md` — remove Ollama mentions
- `.agents/plans/mcp-integration-plan.md` — remove `ollama-section.tsx` references
- `.agents/skills/add-ai-provider/SKILL.md` — remove `ProviderWithoutOllama` reference, update to use `Provider`
- `.agents/skills/add-ai-provider/references/provider-checklist.md` — remove Ollama entries

### Step 6.4: Archive files (optional)

Files in `.agents/archive/` can be left as-is since they represent historical snapshots:
- `.agents/archive/installation-implementation-plan-2026-01.md`
- `.agents/archive/icon-system-migration-plan-2026-01.md`

---

## Priority 7: Review — Keep or Remove

### Step 7.1: Health check endpoint — KEEP

`app/api/health/route.ts` is useful for Vercel monitoring, uptime checks, and general observability. **Keep it.** It has no Docker-specific code.

### Step 7.2: `isDev` utility — KEEP

The `isDev` check in `lib/utils.ts` is used by other features (DeveloperTools). **Keep it.**

---

## Post-Implementation Verification

After all priorities are complete:

1. **Lint and typecheck**:
   ```bash
   bun run lint && bun run typecheck
   ```

2. **Build**:
   ```bash
   bun run build
   ```

3. **Manual smoke test**: Run `bun run dev` and verify:
   - Chat works with cloud providers (OpenAI, Anthropic, etc.)
   - BYOK settings page works (add/remove API keys)
   - Settings > Connections tab no longer shows Ollama section
   - Model selector does not show any Ollama models
   - No "self-host" or "Ollama" text visible in the UI

4. **Search for stragglers**:
   ```bash
   rg -i "ollama" --type ts --type tsx
   rg -i "self.host" --type ts --type tsx
   rg -i "docker" --type ts --type tsx
   ```
   These should return zero results in source code. Documentation files in `.agents/archive/` are acceptable.

---

## Files Summary

### Files to DELETE (4)

| File | Reason |
|------|--------|
| `Dockerfile` | Docker infrastructure |
| `docker-compose.yml` | Docker infrastructure |
| `docker-compose.ollama.yml` | Docker + Ollama infrastructure |
| `.dockerignore` | Docker infrastructure |

### Files to DELETE (3, Ollama code)

| File | Reason |
|------|--------|
| `lib/models/data/ollama.ts` | Ollama model definitions |
| `components/icons/ollama.tsx` | Ollama icon |
| `app/components/layout/settings/connections/ollama-section.tsx` | Ollama settings UI |

### Files to EDIT (~12, source code)

| File | Change summary |
|------|----------------|
| `lib/openproviders/types.ts` | Remove Ollama types from Provider and SupportedModel unions |
| `lib/openproviders/provider-map.ts` | Remove Ollama entries, `isOllamaModel()` function |
| `lib/openproviders/index.ts` | Remove Ollama provider factory and helpers |
| `lib/models/index.ts` | Remove Ollama imports, dynamic detection, free-model check |
| `lib/user-keys.ts` | Remove `ProviderWithoutOllama`, use `Provider` directly |
| `lib/providers/index.ts` | Remove Ollama from PROVIDERS array and import |
| `app/api/chat/route.ts` | Remove Ollama exception in API key check |
| `app/api/providers/route.ts` | Remove Ollama early-return and update types |
| `app/components/layout/settings/settings-content.tsx` | Remove OllamaSection import and renders |
| `next.config.ts` | Remove `output: "standalone"` |
| `.env.example` | Remove Ollama env vars |

### Files to EDIT (~19, documentation and copy)

| File | Change summary |
|------|----------------|
| `INSTALL.md` | Remove Ollama, Docker, self-hosted sections |
| `README.md` | Remove Ollama, Docker, self-hostable references |
| `app/opengraph-image.alt` | Remove Ollama mention |
| `app/layout.tsx` | Remove "self-hostable" from metadata |
| `app/components/layout/app-info/app-info-content.tsx` | Remove "self-hostable" text |
| `spec.md` | Remove Ollama checkbox, update vision |
| `.agents/context/deployment.md` | Remove Docker section, Ollama from diagram |
| `components/icons/README.md` | Remove OllamaIcon entry |
| `.agents/context/architecture.md` | Remove Ollama from diagram |
| `.agents/context/glossary.md` | Remove Ollama references |
| `.agents/context/decisions/002-vercel-ai-sdk.md` | Remove Ollama provider |
| `.agents/context/decisions/004-exa-vs-tavily.md` | Remove self-hoster references |
| `.agents/context/research/competitive-feature-analysis.md` | Remove self-hosting mention |
| `.agents/context/research/tool-calling-infrastructure.md` | Remove Ollama mentions |
| `.agents/plans/thinking-reasoning-configuration.md` | Remove ollama.ts references |
| `.agents/plans/tool-calling-infrastructure.md` | Remove Ollama mentions |
| `.agents/plans/mcp-integration-plan.md` | Remove ollama-section.tsx references |
| `.agents/skills/add-ai-provider/SKILL.md` | Update ProviderWithoutOllama → Provider |
| `.agents/skills/add-ai-provider/references/provider-checklist.md` | Remove Ollama entries |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Type errors from Provider union change | Medium | High | Step 2.1 first, then fix downstream |
| Missed Ollama reference causes runtime error | Low | Medium | Post-implementation grep search |
| BYOK breaks during refactor | Very Low | High | BYOK has zero coupling — verified |
| Build fails after removing standalone | Very Low | Low | Vercel doesn't need it |

---

## Notes

- The `refreshModelsCache()` export in `lib/models/index.ts` may be imported elsewhere. Search for usages before removing. If imported, replace with a no-op or remove the import.
- The `getAllModels()` function signature stays async even though it now returns a static array — this avoids changing all callers. Keeping it async is harmless.
- The `MODELS` export in `lib/models/index.ts` should still work since it references `STATIC_MODELS`.
