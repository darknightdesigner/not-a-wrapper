# Latest Models Research — February 2026

> **Date**: February 6, 2026
> **Author**: AI Research Agent
> **Purpose**: Identify models to add, update, or deprecate across Anthropic, OpenAI, Google, and xAI
> **Status**: Research complete — ready for implementation planning

---

## Executive Summary

Significant changes have occurred across all four providers since our model data was last updated. Every provider has released at least one new generation of models. Key findings:

- **Anthropic**: Entire Claude 4.x lineup released (Opus 4.6, Sonnet 4.5, Haiku 4.5). Many of our current models are deprecated or retired.
- **OpenAI**: GPT-5 family launched (5.2, 5.1, 5, 5-mini, 5-nano). Several of our current models are deprecated/shut down.
- **Google**: Gemini 3 (preview) and stable Gemini 2.5 models released. Our experimental/preview IDs should be replaced.
- **xAI**: Grok 4 family launched. Grok 3 models no longer appear in official API documentation.

**Total changes needed**: ~20 models to add, ~10 to update, ~12 to deprecate/remove.

---

## 1. Anthropic (Claude)

### Current State of Our Codebase

We have 9 Claude model entries. Several reference models that have been **retired** from the API.

### Official Model Lineup (February 2026)

| API Model ID | Display Name | Context Window | Input Cost | Output Cost | Vision | Tools | Reasoning | Speed | Intelligence | Status in Our Codebase |
|---|---|---|---|---|---|---|---|---|---|---|
| `claude-opus-4-6` | Claude Opus 4.6 | 200K (1M beta) | $5.00 | $25.00 | Yes | Yes | Yes (adaptive) | Moderate | Highest | **NEW — add** |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 | 200K (1M beta) | $3.00 | $15.00 | Yes | Yes | Yes | Fast | High | **NEW — add** |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | 200K | $1.00 | $5.00 | Yes | Yes | Yes | Fastest | Medium | **NEW — add** |
| `claude-opus-4-5-20251101` | Claude Opus 4.5 | 200K | $5.00 | $25.00 | Yes | Yes | Yes | Moderate | High | **NEW — add** (optional) |
| `claude-opus-4-1-20250805` | Claude Opus 4.1 | 200K | $15.00 | $75.00 | Yes | Yes | Yes | Moderate | High | **NEW — add** (optional) |
| `claude-opus-4-20250514` | Claude Opus 4 | 200K | $15.00 | $75.00 | Yes | Yes | Yes | Moderate | High | **UPDATE** — our `claude-4-opus` entry |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 | 200K | $3.00 | $15.00 | Yes | Yes | Yes | Fast | High | **UPDATE** — our `claude-4-sonnet` entry |
| `claude-3-5-haiku-20241022` | Claude Haiku 3.5 | 200K | $0.80 | $4.00 | Yes | Yes | No | Fast | Medium | **DEPRECATE** — retiring Feb 19, 2026 |
| `claude-3-haiku-20240307` | Claude Haiku 3 | 200K | $0.25 | $1.25 | Yes | Yes | No | Fast | Medium | Keep (still active) |

### Aliases

| Alias | Currently Points To | Notes |
|---|---|---|
| `claude-opus-4-6` | `claude-opus-4-6` | Same as snapshot (no date suffix) |
| `claude-sonnet-4-5` | `claude-sonnet-4-5-20250929` | Use alias for latest |
| `claude-haiku-4-5` | `claude-haiku-4-5-20251001` | Use alias for latest |

### Deprecation Notices (from docs.anthropic.com)

| Model | Deprecated Date | Retirement Date | Status |
|---|---|---|---|
| `claude-3-5-sonnet-20240620` | Aug 13, 2025 | Oct 28, 2025 | **RETIRED** |
| `claude-3-5-sonnet-20241022` | Aug 13, 2025 | Oct 28, 2025 | **RETIRED** |
| `claude-3-opus-20240229` | Jun 30, 2025 | Jan 5, 2026 | **RETIRED** |
| `claude-3-sonnet-20240229` | Jan 21, 2025 | Jul 21, 2025 | **RETIRED** |
| `claude-3-7-sonnet-20250219` | Oct 28, 2025 | Feb 19, 2026 | **DEPRECATED** — retiring in 13 days |
| `claude-3-5-haiku-20241022` | Dec 19, 2025 | Feb 19, 2026 | **DEPRECATED** — retiring in 13 days |

### Actions Required for Claude

| Our Model ID | Action | Details |
|---|---|---|
| `claude-3-5-sonnet-latest` | **REMOVE** | Points to retired model (`claude-3-5-sonnet-20241022` was retired Oct 28, 2025). Alias likely broken. |
| `claude-3-7-sonnet-20250219` | **REMOVE** | Deprecated Oct 28, 2025, retiring Feb 19, 2026 — 13 days from now. |
| `claude-3-7-sonnet-rea` | **REMOVE** | Custom entry mapping to deprecated `claude-3-7-sonnet-20250219`. |
| `claude-3-opus-latest` | **REMOVE** | Points to retired model (`claude-3-opus-20240229` was retired Jan 5, 2026). |
| `claude-3-sonnet-20240229` | **REMOVE** | Retired Jul 21, 2025. |
| `claude-3-5-haiku-latest` | **UPDATE or REMOVE** | If alias now routes to `claude-haiku-4-5`, update entry. Otherwise remove (retiring Feb 19). |
| `claude-3-haiku-20240307` | **KEEP** | Still active per deprecation table. |
| `claude-4-opus` | **UPDATE** | Correct API ID is `claude-opus-4-20250514`. Pricing: $15/$75. Add `apiSdk` function. Context: 200K. |
| `claude-4-sonnet` | **UPDATE** | Correct API ID is `claude-sonnet-4-20250514`. Pricing: $3/$15. Add `apiSdk` function. Context: 200K. |
| — | **ADD** `claude-opus-4-6` | Flagship model. $5/$25. 200K (1M beta). Adaptive thinking. |
| — | **ADD** `claude-sonnet-4-5` | Best balance of speed/intelligence. $3/$15. 200K (1M beta). |
| — | **ADD** `claude-haiku-4-5` | Fast, affordable. $1/$5. 200K. |

### Pricing Note

Anthropic's new naming convention dropped the hyphenated version numbering (e.g., `claude-3-5-sonnet` → `claude-sonnet-4-5`). The Claude Haiku 3.5 pricing was updated to $0.80/$4.00 (we had $0.25/$1.25 — that was Claude 3 Haiku pricing).

---

## 2. OpenAI

### Current State of Our Codebase

We have 14 OpenAI model entries. Several reference models that are deprecated or shut down.

### Official Model Lineup (February 2026)

| API Model ID | Display Name | Context Window | Input Cost | Output Cost | Vision | Tools | Reasoning | Speed | Intelligence | Status in Our Codebase |
|---|---|---|---|---|---|---|---|---|---|---|
| `gpt-5.2` | GPT-5.2 | 400,000 | $1.75 | $14.00 | Yes | Yes | Yes | Medium | Highest | **NEW — add** |
| `gpt-5.2-pro` | GPT-5.2 Pro | 400,000 | $21.00 | $168.00 | Yes | Yes | Yes | Slow | Highest | **NEW — add** (optional, very expensive) |
| `gpt-5.1` | GPT-5.1 | 400,000 | unverified | unverified | Yes | Yes | Yes | Medium | High | **NEW — add** |
| `gpt-5` | GPT-5 | 400,000 | $1.25 | $10.00 | Yes | Yes | Yes | Medium | High | **NEW — add** |
| `gpt-5-mini` | GPT-5 Mini | 400,000 | $0.25 | $2.00 | Yes | Yes | Yes | Fast | Medium | **NEW — add** |
| `gpt-5-nano` | GPT-5 Nano | 400,000 | $0.05 | $0.40 | Yes | Yes | Yes | Fast | Low | **NEW — add** |
| `gpt-4.1` | GPT-4.1 | 1,047,576 | $2.00 | $8.00 | Yes | Yes | No | Medium | High | **KEEP** |
| `gpt-4.1-mini` | GPT-4.1 Mini | 1,047,576 | $0.40 | $1.60 | Yes | Yes | No | Fast | Medium | **KEEP** |
| `gpt-4.1-nano` | GPT-4.1 Nano | 1,047,576 | $0.10 | $0.40 | Yes | Yes | No | Fast | Low | **KEEP** |
| `gpt-4o` | GPT-4o | 128,000 | $2.50 | $10.00 | Yes | Yes | No | Medium | High | **KEEP** (still active) |
| `gpt-4o-mini` | GPT-4o Mini | 128,000 | $0.15 | $0.60 | Yes | Yes | No | Fast | Medium | **KEEP** (still active) |
| `o3` | o3 | 200,000 | $10.00 | $40.00 | Yes | Yes | Yes | Slow | High | **KEEP** (succeeded by GPT-5) |
| `o3-mini` | o3-mini | 200,000 | $1.10 | $4.40 | Yes | Yes | Yes | Medium | Medium | **KEEP** |
| `o4-mini` | o4-mini | 200,000 | $1.10 | $4.40 | Yes | Yes | Yes | Medium | Medium | **KEEP** (succeeded by GPT-5 mini) |
| `gpt-4-turbo` | GPT-4 Turbo | 128,000 | $10.00 | $30.00 | Yes | Yes | No | Medium | High | **KEEP** (legacy but active) |
| `gpt-3.5-turbo` | GPT-3.5 Turbo | 16,385 | $0.50 | $1.50 | No | No | No | Fast | Low | **KEEP** (legacy) |

### Deprecation Notices (from platform.openai.com/docs/deprecations)

| Model | Deprecated Date | Shutdown Date | Status |
|---|---|---|---|
| `gpt-4.5-preview` | Apr 14, 2025 | Jul 14, 2025 | **SHUT DOWN** — must remove |
| `o1-preview` | Apr 28, 2025 | Jul 28, 2025 | **SHUT DOWN** |
| `o1-mini` | Apr 28, 2025 | Oct 27, 2025 | **SHUT DOWN** — must remove |
| `chatgpt-4o-latest` | Nov 18, 2025 | Feb 17, 2026 | Shutting down in 11 days |
| `gpt-3.5-turbo-1106` | Sep 26, 2025 | Sep 28, 2026 | Deprecated but still active |
| `gpt-3.5-turbo-instruct` | Sep 26, 2025 | Sep 28, 2026 | Deprecated but still active |

### Actions Required for OpenAI

| Our Model ID | Action | Details |
|---|---|---|
| `gpt-4.5-preview` | **REMOVE** | Shut down Jul 14, 2025. No longer accessible via API. |
| `o1-mini` | **REMOVE** | Shut down Oct 27, 2025. No longer accessible via API. |
| `o1` | **KEEP but mark legacy** | Still active. Listed as "Previous full o-series reasoning model". |
| `o3` | **FIX BUG** | `apiSdk` incorrectly calls `openproviders("o3-mini")` — should be `openproviders("o3")`. |
| `gpt-3.5-turbo` | **KEEP but mark legacy** | Still active but legacy. Deprecated snapshots being shut down. |
| `gpt-4-turbo` | **KEEP but mark legacy** | Still listed but overshadowed by GPT-4.1 and GPT-5 family. |
| `gpt-4o` | **KEEP** | Still fully active and listed. |
| `gpt-4o-mini` | **KEEP** | Still fully active and listed. |
| — | **ADD** `gpt-5.2` | New flagship. $1.75/$14. 400K context. Reasoning. |
| — | **ADD** `gpt-5` | Previous flagship. $1.25/$10. 400K context. Reasoning. |
| — | **ADD** `gpt-5-mini` | Cost-efficient reasoning. $0.25/$2. 400K context. |
| — | **ADD** `gpt-5-nano` | Ultra-cheap. $0.05/$0.40. 400K context. |

### Bug Fix Required

The `o3` model entry has `apiSdk` calling `openproviders("o3-mini")` instead of `openproviders("o3")`. This must be fixed.

---

## 3. Google (Gemini)

### Current State of Our Codebase

We have 8 Gemini model entries. Many use experimental/preview IDs that now have stable replacements. There are also naming errors.

### Official Model Lineup (February 2026)

| API Model ID | Display Name | Context Window | Input Cost | Output Cost | Vision | Tools | Reasoning | Speed | Intelligence | Status in Our Codebase |
|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-3-pro-preview` | Gemini 3 Pro Preview | 1,048,576 | $2.00 | $12.00 | Yes | Yes | Yes | Medium | Highest | **NEW — add** |
| `gemini-3-flash-preview` | Gemini 3 Flash Preview | 1,048,576 | $0.50 | $3.00 | Yes | Yes | Yes | Fast | High | **NEW — add** |
| `gemini-2.5-pro` | Gemini 2.5 Pro (stable) | 1,048,576 | $1.25 | $10.00 | Yes | Yes | Yes | Medium | High | **NEW — add** (replaces exp entry) |
| `gemini-2.5-flash` | Gemini 2.5 Flash (stable) | 1,048,576 | $0.30 | $2.50 | Yes | Yes | Yes | Fast | Medium | **NEW — add** (replaces exp entry) |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite | 1,048,576 | $0.10 | $0.40 | Yes | Yes | Yes | Fast | Low | **NEW — add** |
| `gemini-2.0-flash` | Gemini 2.0 Flash (stable) | 1,048,576 | $0.10 | $0.40 | Yes | Yes | Exp | Fast | Medium | **UPDATE** (new stable alias, updated pricing) |
| `gemini-2.0-flash-lite` | Gemini 2.0 Flash-Lite (stable) | 1,048,576 | $0.075 | $0.30 | Yes | Yes | No | Fast | Low | **UPDATE** (graduated from preview) |
| `gemini-1.5-pro-002` | Gemini 1.5 Pro 002 | 2,000,000 | $1.25 | $5.00 | Yes | Yes | Yes | Medium | High | **KEEP** (previous generation) |
| `gemini-1.5-flash-002` | Gemini 1.5 Flash 002 | 1,000,000 | $0.075 | $0.30 | Yes | Yes | No | Fast | Medium | **KEEP** (previous generation) |
| `gemini-1.5-flash-8b` | Gemini 1.5 Flash 8B | 1,000,000 | $0.0375 | $0.15 | Yes | Yes | No | Fast | Low | **KEEP** (cheap option) |

### Actions Required for Gemini

| Our Model ID | Action | Details |
|---|---|---|
| `gemini-2.5-pro-exp-03-25` | **REPLACE** | Named "Gemini 2.5 Flash Preview" (wrong!) with `id: gemini-2.5-pro-exp-03-25`. Replace with stable `gemini-2.5-flash`. |
| `gemini-2.5-pro-exp-03-25-pro` | **REPLACE** | Named "Gemini 2.5 Pro Preview". Replace with stable `gemini-2.5-pro`. |
| `gemini-2.0-flash-lite-preview-02-05` | **REPLACE** | Graduated to stable `gemini-2.0-flash-lite`. Update ID and pricing. |
| `gemini-2.0-flash-001` | **UPDATE** | Update pricing from $0.075/$0.30 to $0.10/$0.40 (per current pricing page). Consider using `gemini-2.0-flash` alias. |
| `gemma-3-27b-it` | **KEEP** | Open-source model, still available (free tier only). |
| `gemini-1.5-flash-002` | **KEEP** | Previous generation, still active. |
| `gemini-1.5-flash-8b` | **KEEP** | Previous generation, still active. |
| `gemini-1.5-pro-002` | **KEEP** | Previous generation, still active. |
| — | **ADD** `gemini-3-pro-preview` | Most intelligent Gemini. $2/$12. 1M context. Preview. |
| — | **ADD** `gemini-3-flash-preview` | Fast + intelligent. $0.50/$3. 1M context. Preview. |
| — | **ADD** `gemini-2.5-pro` | Stable thinking model. $1.25/$10. 1M context. |
| — | **ADD** `gemini-2.5-flash` | Stable fast model. $0.30/$2.50. 1M context. |
| — | **ADD** `gemini-2.5-flash-lite` | Ultra-cheap stable. $0.10/$0.40. 1M context. |

### Naming Bug

Our `gemini-2.5-pro-exp-03-25` entry is labeled **"Gemini 2.5 Flash Preview"** but uses the Pro model ID. This is a data error that should be corrected.

---

## 4. xAI (Grok)

### Current State of Our Codebase

We have 6 Grok model entries, all from the Grok 2 and Grok 3 families. xAI's official documentation now shows Grok 4 as the current generation, and Grok 3 models no longer appear in the official API model list.

### Official Model Lineup (February 2026)

| API Model ID | Display Name | Context Window | Input Cost | Output Cost | Vision | Tools | Reasoning | Speed | Intelligence | Status in Our Codebase |
|---|---|---|---|---|---|---|---|---|---|---|
| `grok-4` | Grok 4 | 256,000 | $3.00 | $15.00 | Yes | Yes | Yes (always-on) | Medium | Highest | **NEW — add** |
| `grok-4-fast-reasoning` | Grok 4 Fast (Reasoning) | 2,000,000 | $0.20 | $0.50 | Yes | Yes | Yes | Fast | High | **NEW — add** |
| `grok-4-fast-non-reasoning` | Grok 4 Fast (Non-Reasoning) | 2,000,000 | $0.20 | $0.50 | Yes | Yes | No | Fast | High | **NEW — add** |
| `grok-4-1-fast-reasoning` | Grok 4.1 Fast (Reasoning) | 2,000,000 | $0.20 | $0.50 | Yes | Yes | Yes | Fast | High | **NEW — add** |
| `grok-4-1-fast-non-reasoning` | Grok 4.1 Fast (Non-Reasoning) | 2,000,000 | $0.20 | $0.50 | Yes | Yes | No | Fast | High | **NEW — add** |
| `grok-code-fast-1` | Grok Code Fast | 256,000 | $0.20 | $1.50 | No | Yes | No | Fast | High | **NEW — add** |
| `grok-2-image-1212` | Grok 2 Image | — | — | — | — | — | — | — | — | Image generation only — skip |

### Actions Required for Grok

| Our Model ID | Action | Details |
|---|---|---|
| `grok-3` | **DEPRECATE** | No longer in official xAI model list. May still work via alias but undocumented. |
| `grok-3-fast` | **DEPRECATE** | No longer in official xAI model list. |
| `grok-3-mini` | **DEPRECATE** | No longer in official xAI model list. |
| `grok-3-mini-fast` | **DEPRECATE** | No longer in official xAI model list. |
| `grok-2` | **KEEP but mark legacy** | Not in current API docs but may still route. Superseded by Grok 4. |
| `grok-2-vision` | **KEEP but mark legacy** | Not in current API docs but may still route. |
| — | **ADD** `grok-4` | Flagship reasoning. $3/$15. 256K context. |
| — | **ADD** `grok-4-1-fast-reasoning` | Latest agentic model. $0.20/$0.50. 2M context. Best for tool-calling. |
| — | **ADD** `grok-4-1-fast-non-reasoning` | Same specs without reasoning overhead. |
| — | **ADD** `grok-4-fast-reasoning` | Cost-efficient reasoning. $0.20/$0.50. 2M context. |
| — | **ADD** `grok-code-fast-1` | Coding specialist. $0.20/$1.50. 256K context. |

### Notes

- Grok 4 is always a reasoning model — no non-reasoning mode for the full `grok-4`.
- The "Beta" designation from Grok 3 is gone. Grok 4 models are production-ready.
- `presencePenalty`, `frequencyPenalty`, and `stop` parameters are not supported by Grok 4 reasoning models.
- xAI API is compatible with OpenAI/Anthropic SDK interfaces.

---

## 5. Package Version Requirements

### Current Versions

| Package | Current Version | Notes |
|---|---|---|
| `@ai-sdk/anthropic` | `3` | Major version 3 |
| `@ai-sdk/openai` | `3` | Major version 3 |
| `@ai-sdk/google` | `3` | Major version 3 |
| `@ai-sdk/xai` | `3` | Major version 3 |

### Vercel AI SDK Compatibility

The Vercel AI SDK documentation indicates **AI SDK 6** is the current major version. Our `@ai-sdk/*` provider packages at v3 should still work for passing model ID strings to the underlying APIs, since these packages typically forward the model string to the provider's REST API without hardcoding a list of valid models.

**However**, upgrading is recommended because:

1. **New features**: SDK v6 may include provider-specific features for new models (e.g., adaptive thinking for Claude Opus 4.6, reasoning effort for GPT-5.2).
2. **Bug fixes**: Older versions may have compatibility issues with newer model response formats.
3. **Type safety**: Updated type definitions for new model IDs.

### Recommended Action

```bash
# Check latest available versions
bun add @ai-sdk/anthropic@latest @ai-sdk/openai@latest @ai-sdk/google@latest @ai-sdk/xai@latest
```

> **Note**: This requires user approval per AGENTS.md — modifying `package.json` is in the "Ask First" category.

---

## 6. Recommended Implementation Order

Priority is based on user value (popular models first), urgency (removing broken entries), and effort.

### Priority 1: Critical Fixes (broken entries)

| # | Action | Urgency | Effort |
|---|---|---|---|
| 1 | Remove `gpt-4.5-preview` — shut down, API calls will fail | Immediate | Low |
| 2 | Remove `o1-mini` — shut down, API calls will fail | Immediate | Low |
| 3 | Remove `claude-3-5-sonnet-latest` — points to retired model | Immediate | Low |
| 4 | Remove `claude-3-opus-latest` — points to retired model | Immediate | Low |
| 5 | Remove `claude-3-sonnet-20240229` — retired | Immediate | Low |
| 6 | Remove `claude-3-7-sonnet-20250219` and `claude-3-7-sonnet-rea` — retiring Feb 19 | Urgent (13 days) | Low |
| 7 | Fix `o3` apiSdk bug — currently calls wrong model (`o3-mini`) | Immediate | Low |

### Priority 2: Add Flagship Models

| # | Action | User Value | Effort |
|---|---|---|---|
| 8 | Add `claude-opus-4-6` | Very High — Anthropic's best | Medium |
| 9 | Add `claude-sonnet-4-5` | Very High — best price/perf | Medium |
| 10 | Add `claude-haiku-4-5` | High — fast & cheap | Medium |
| 11 | Add `gpt-5.2` | Very High — OpenAI's best | Medium |
| 12 | Add `gpt-5-mini` | High — affordable reasoning | Medium |
| 13 | Add `gpt-5-nano` | High — cheapest OpenAI | Medium |
| 14 | Add `gemini-2.5-flash` (stable) | High — best Google price/perf | Medium |
| 15 | Add `gemini-2.5-pro` (stable) | High — Google's thinking model | Medium |
| 16 | Add `grok-4-1-fast-reasoning` | High — xAI's latest | Medium |
| 17 | Add `grok-4` | High — xAI flagship | Medium |

### Priority 3: Update Existing Entries

| # | Action | Details |
|---|---|---|
| 18 | Update `claude-4-opus` — fix API ID to `claude-opus-4-20250514`, add `apiSdk` | Medium |
| 19 | Update `claude-4-sonnet` — fix API ID to `claude-sonnet-4-20250514`, add `apiSdk` | Medium |
| 20 | Replace `gemini-2.5-pro-exp-03-25` entries with stable IDs | Medium |
| 21 | Replace `gemini-2.0-flash-lite-preview-02-05` with `gemini-2.0-flash-lite` | Low |
| 22 | Update `gemini-2.0-flash-001` pricing | Low |

### Priority 4: Add Remaining Models

| # | Action | Details |
|---|---|---|
| 23 | Add `gpt-5` | Previous flagship, still valuable |
| 24 | Add `gemini-3-pro-preview`, `gemini-3-flash-preview` | Preview but cutting-edge |
| 25 | Add `gemini-2.5-flash-lite` | Ultra-cheap Gemini option |
| 26 | Add `grok-4-fast-reasoning`, `grok-4-1-fast-non-reasoning` | Additional Grok variants |
| 27 | Add `grok-code-fast-1` | Coding specialist |

### Priority 5: Deprecate Old Models

| # | Action | Details |
|---|---|---|
| 28 | Remove/deprecate `grok-3`, `grok-3-fast`, `grok-3-mini`, `grok-3-mini-fast` | No longer in xAI docs |
| 29 | Mark `gpt-3.5-turbo`, `gpt-4-turbo`, `gpt-4o`, `gpt-4o-mini` as legacy | Still work but superseded |
| 30 | Update `claude-3-5-haiku-latest` — either update to route correctly or remove | Retiring Feb 19 |
| 31 | Mark `grok-2`, `grok-2-vision` as legacy | Superseded by Grok 4 |

---

## 7. Breaking Changes & Migration Notes

### Anthropic Naming Convention Change

Anthropic has completely changed their model naming convention:
- **Old**: `claude-{generation}-{tier}-{date}` (e.g., `claude-3-5-sonnet-20241022`)
- **New**: `claude-{tier}-{generation}-{date}` (e.g., `claude-sonnet-4-5-20250929`)

Our `ModelConfig.modelFamily` values should be updated accordingly:
- `"Claude 3"` → keep for old models
- `"Claude 3.5"` → keep for old models
- `"Claude 4"` → for Opus 4, Sonnet 4
- `"Claude 4.5"` → for Opus 4.5, Sonnet 4.5, Haiku 4.5
- `"Claude 4.6"` → for Opus 4.6

### OpenAI GPT-5 Reasoning

GPT-5 family models have built-in reasoning with configurable effort levels (`none`, `low`, `medium`, `high`, `xhigh` for 5.2). This means `reasoningText: true` for all GPT-5 models. The GPT-4.1 family does NOT have reasoning (`reasoningText: false`).

### Grok 4 Reasoning

Grok 4 (non-fast) is **always** a reasoning model. The `presencePenalty`, `frequencyPenalty`, and `stop` parameters are not supported and will cause errors. This may require special handling in our API route if we pass these params.

### xAI Model ID Format

xAI now uses `-reasoning` and `-non-reasoning` suffixes for the fast models. Our `openproviders` system needs to support these new IDs. They may need to be added to the `XaiModel` type union and `MODEL_PROVIDER_MAP`.

### Google Gemini Stable IDs

Google's stable model IDs no longer use date suffixes for the current generation:
- `gemini-2.5-pro` (not `gemini-2.5-pro-exp-03-25`)
- `gemini-2.5-flash` (not `gemini-2.5-flash-preview-05-20`)
- `gemini-2.0-flash` (alias for stable `gemini-2.0-flash-001`)

---

## 8. Type System Updates Required

### `lib/openproviders/types.ts`

New model IDs to add to type unions:

```typescript
// Anthropic
export type AnthropicModel =
  | "claude-opus-4-6"
  | "claude-sonnet-4-5"
  | "claude-sonnet-4-5-20250929"
  | "claude-haiku-4-5"
  | "claude-haiku-4-5-20251001"
  | "claude-opus-4-5-20251101"
  | "claude-opus-4-1-20250805"
  | "claude-opus-4-20250514"
  | "claude-sonnet-4-20250514"
  | "claude-3-haiku-20240307"  // still active
  // ... remove retired model IDs

// OpenAI
export type OpenAIModel =
  | "gpt-5.2"
  | "gpt-5.1"
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-5-nano"
  | "gpt-5.2-pro"
  // ... keep existing active models, remove shut down models

// Gemini
export type GeminiModel =
  | "gemini-3-pro-preview"
  | "gemini-3-flash-preview"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-lite"
  // ... keep existing active models

// xAI
export type XaiModel =
  | "grok-4"
  | "grok-4-fast-reasoning"
  | "grok-4-fast-non-reasoning"
  | "grok-4-1-fast-reasoning"
  | "grok-4-1-fast-non-reasoning"
  | "grok-code-fast-1"
  | "grok-2"           // legacy
  | "grok-2-vision"    // legacy
  // ... remove Grok 3 models
```

### `lib/openproviders/provider-map.ts`

All new model IDs must be added to `MODEL_PROVIDER_MAP`. All retired/shut down model IDs should be removed.

---

## 9. Verification Checklist

- [ ] Every "new" model confirmed not already in our data files
- [ ] Every "remove" model confirmed deprecated/retired per official source
- [ ] Every API model ID confirmed from official provider documentation
- [ ] Every pricing figure sourced from official pricing pages
- [ ] `o3` apiSdk bug confirmed by reading source code (line 301 of `openai.ts`)
- [ ] Gemini naming bug confirmed by reading source code (lines 143-169 of `gemini.ts`)
- [ ] Package versions checked in `package.json`

---

## 10. Sources

| Provider | Source | URL |
|---|---|---|
| Anthropic | Models overview | https://docs.anthropic.com/en/docs/about-claude/models/overview |
| Anthropic | Pricing | https://docs.anthropic.com/en/docs/about-claude/pricing |
| Anthropic | Model deprecations | https://docs.anthropic.com/en/docs/about-claude/model-deprecations |
| Anthropic | Opus 4.6 announcement | https://anthropic.com/news/claude-opus-4-6 |
| OpenAI | Models | https://platform.openai.com/docs/models |
| OpenAI | GPT-5.2 specs | https://platform.openai.com/docs/models/gpt-5.2 |
| OpenAI | GPT-5 specs | https://platform.openai.com/docs/models/gpt-5 |
| OpenAI | GPT-5 mini specs | https://platform.openai.com/docs/models/gpt-5-mini |
| OpenAI | GPT-5 nano specs | https://platform.openai.com/docs/models/gpt-5-nano |
| OpenAI | Deprecations | https://platform.openai.com/docs/deprecations |
| Google | Gemini models | https://ai.google.dev/gemini-api/docs/models |
| Google | Gemini pricing | https://ai.google.dev/gemini-api/docs/pricing |
| xAI | Models & pricing | https://docs.x.ai/docs/models |
| xAI | API overview | https://x.ai/api |
| Vercel | AI SDK docs | https://sdk.vercel.ai/docs |

---

## Unverified Items

The following items could not be fully confirmed and should be verified before implementation:

| Item | Reason | Risk |
|---|---|---|
| `gpt-5.1` pricing | Not found on pricing page during research | Medium — may need to check API or docs again |
| `gpt-5.2-pro` context window | Not explicitly stated in docs | Low — likely 400K like other GPT-5 models |
| `claude-3-5-haiku-latest` alias routing | Unclear if this alias now routes to Haiku 4.5 or returns errors | Medium — test before deciding keep vs remove |
| Grok 3 models still working via API | Not in official docs but may still accept requests | Low — deprecate regardless |
| `@ai-sdk/*` v3 compatibility with new model IDs | SDK packages pass strings to API; should work | Low — test with one model first |

---

*Research completed February 6, 2026. This document should be used as the basis for implementation planning.*
