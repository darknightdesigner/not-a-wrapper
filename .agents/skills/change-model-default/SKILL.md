---
name: change-model-default
description: Safely update the application's default AI model. Use when changing MODEL_DEFAULT, updating the default model for new users, or when a model ID in config.ts needs to change. Covers all coordinated updates across config, allow-lists, and documentation to prevent anonymous-user breakage.
---

# Change Default Model

Changing `MODEL_DEFAULT` requires coordinated updates across multiple files. The default model flows through client-side selection, chat creation, and API validation. Missing any step causes silent failures — most commonly, anonymous users get rejected because the new default isn't in the allow-list.

## Prerequisites

- [ ] New model ID exists in `lib/models/data/[provider].ts` (if not, use `add-model` skill first)
- [ ] New model ID is in `lib/openproviders/provider-map.ts`
- [ ] You know whether the model should be free (no BYOK required) for authenticated users

## Quick Reference

| Step | File | Constant | Required? |
|------|------|----------|-----------|
| 1 | `lib/config.ts` | `MODEL_DEFAULT` | Always |
| 2 | `lib/config.ts` | `NON_AUTH_ALLOWED_MODELS` | Always |
| 3 | `lib/config.ts` | `FREE_MODELS_IDS` | If model should be free |
| 4 | `lib/model-store/utils.ts` | `DEFAULT_MODEL_ORDER` | If display position matters |
| 5 | `lib/CLAUDE.md` | Inline code example | Always |

## How the Default Model Flows

```
lib/config.ts (MODEL_DEFAULT)
    │
    ├──► app/components/chat/use-model.ts
    │    selectedModel = chat.model || favoriteModels[0] || MODEL_DEFAULT
    │
    ├──► lib/chat-store/chats/provider.tsx
    │    model: model || MODEL_DEFAULT  (guest + auth chat creation)
    │
    ├──► lib/chat-store/chats/api.ts
    │    model: model || MODEL_DEFAULT  (HTTP chat creation)
    │
    └──► app/api/chat/api.ts (validation)
         if (!auth): model must be in NON_AUTH_ALLOWED_MODELS
         if (auth && !BYOK): model must be in FREE_MODELS_IDS
```

All consumers import the constant — only `lib/config.ts` needs the value changed.

## Step-by-Step

### 1. Update `MODEL_DEFAULT`

```typescript
// lib/config.ts
export const MODEL_DEFAULT = "[new-model-id]"
```

### 2. Update `NON_AUTH_ALLOWED_MODELS` (critical)

The new default **must** be in this array, or anonymous users will be rejected by the API with "This model requires authentication."

```typescript
// lib/config.ts
export const NON_AUTH_ALLOWED_MODELS = ["gpt-5-mini", "[new-model-id]"]
```

> Keep any previously allowed models unless intentionally removing access.

### 3. (Conditional) Update `FREE_MODELS_IDS`

Only needed if the new default should work for authenticated users **without** BYOK keys. If the model requires BYOK, skip this step.

```typescript
// lib/config.ts
export const FREE_MODELS_IDS = [
  "openrouter:deepseek/deepseek-r1:free",
  "openrouter:meta-llama/llama-3.3-8b-instruct:free",
  "pixtral-large-latest",
  "mistral-large-latest",
  "gpt-5-mini",
  "[new-model-id]",  // Add if free
]
```

### 4. (Optional) Update `DEFAULT_MODEL_ORDER`

Controls display order in the model selector. The default model should typically appear prominently.

```typescript
// lib/model-store/utils.ts
export const DEFAULT_MODEL_ORDER: string[] = [
  // ... existing models
  "[new-model-id]",  // Add or reposition
]
```

### 5. Update Documentation

Update the inline example in `lib/CLAUDE.md` to reflect the new value:

```typescript
// lib/CLAUDE.md — under "Centralized Configuration" section
export const MODEL_DEFAULT = "[new-model-id]"
```

## Validation Checklist

After making changes:

```bash
bun run typecheck  # No type errors
bun run lint       # No lint errors
```

Then verify manually:

- [ ] `MODEL_DEFAULT` value exists in `lib/models/data/*.ts` as a `ModelConfig.id`
- [ ] `MODEL_DEFAULT` value exists in `lib/openproviders/provider-map.ts` `MODEL_PROVIDER_MAP`
- [ ] `MODEL_DEFAULT` is in `NON_AUTH_ALLOWED_MODELS`
- [ ] If model should be free: `MODEL_DEFAULT` is in `FREE_MODELS_IDS`
- [ ] `lib/CLAUDE.md` example matches new value

## Common Mistakes

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Not adding to `NON_AUTH_ALLOWED_MODELS` | Anonymous users get "requires authentication" error | Step 2 is mandatory |
| Not adding to `FREE_MODELS_IDS` | Auth users without BYOK can't use default | Decide free-tier policy first |
| Model ID not in `provider-map.ts` | "Unknown provider" error at runtime | Run `add-model` skill first |
| Stale docs in `lib/CLAUDE.md` | Future agents get wrong default | Always update docs (Step 5) |
| Removing old models from `NON_AUTH_ALLOWED_MODELS` | Breaks existing anonymous chats using those models | Keep old models unless intentional |

## Files That Auto-Inherit (No Changes Needed)

These files import `MODEL_DEFAULT` and need no edits:

- `app/components/chat/use-model.ts` — client-side model resolution
- `lib/chat-store/chats/provider.tsx` — chat creation fallback
- `lib/chat-store/chats/api.ts` — HTTP chat creation fallback
- `app/api/chat/api.ts` — validation (uses allow-list arrays, not `MODEL_DEFAULT` directly)
