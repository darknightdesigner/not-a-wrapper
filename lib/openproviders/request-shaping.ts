import { ANTHROPIC_BETA_HEADERS } from "@/lib/config"
import type { ModelConfig, ModelReasoningEffort } from "@/lib/models/types"
import { clampToNearestEffortLevel } from "@/lib/models/types"
import type { Provider } from "@/lib/provider-identity"
import type { ProviderOptions } from "@ai-sdk/provider-utils"
import { fixedThinkingBudgetTokens } from "./output-budget"

/**
 * Request shaping (CONTEXT.md): everything provider-specific about issuing
 * one model request, resolved from the model config plus request context —
 * provider options (thinking/reasoning configuration, per-model thinking
 * budgets, response storage, actor attribution, prompt caching) and provider
 * beta headers. Callers spread the result into streamText and never branch
 * on provider.
 */

export type RequestShapingContext = {
  /** Server-side search tools are active for this request. */
  searchToolsActive: boolean
  /** The request carries any tools at all (any Tool layer). */
  hasTools: boolean
  /**
   * The request offers tools the app executes (Exa, content, MCP), beyond
   * provider-hosted search, so the model can take a later step.
   */
  appToolsActive: boolean
  /**
   * Optional per-turn wire override (ADR-0026), already clamped to a level
   * this route's provider accepts. Absent means send no effort override.
   */
  wireReasoningEffort?: ModelReasoningEffort
  /**
   * Opaque per-actor id for provider abuse attribution (ADR-0021), from
   * `deriveProviderSafetyIdentifier`. Absent sends none: guests stay absent
   * until a server-signed guest identity exists to derive it from.
   */
  safetyIdentifier?: string
}

function usesFixedBudgetSearchThinking(
  modelConfig: Pick<ModelConfig, "thinkingMode" | "searchThinkingDowngrade">,
  searchToolsActive: boolean
): boolean {
  return (
    modelConfig.thinkingMode === "adaptive" &&
    modelConfig.searchThinkingDowngrade === true &&
    searchToolsActive
  )
}

export type ReasoningEffortResolution = {
  /** Concrete override sent for this turn. Absent means no wire override. */
  wireReasoningEffort?: ModelReasoningEffort
  /** Concrete effective level recorded in the receipt and message metadata. */
  appliedReasoningEffort?: ModelReasoningEffort
}

/**
 * Resolve one request into separate wire and receipt facts (ADR-0026).
 * Default and platform-funded turns send no override but record the route's
 * documented default. A fixed numeric thinking budget records no canonical
 * effort level because none of the named levels can describe it honestly.
 */
export function resolveReasoningEffort(
  modelConfig: Pick<
    ModelConfig,
    | "defaultEffort"
    | "effortLevels"
    | "thinkingMode"
    | "searchThinkingDowngrade"
  >,
  requested: ModelReasoningEffort | undefined,
  ctx: { platformFunded: boolean; searchToolsActive: boolean }
): ReasoningEffortResolution {
  const levels = modelConfig.effortLevels
  if (!levels || levels.length === 0) return {}
  if (usesFixedBudgetSearchThinking(modelConfig, ctx.searchToolsActive)) {
    return {}
  }
  if (requested === undefined || ctx.platformFunded) {
    return modelConfig.defaultEffort === undefined
      ? {}
      : { appliedReasoningEffort: modelConfig.defaultEffort }
  }
  const effort = clampToNearestEffortLevel(levels, requested)
  return effort === undefined
    ? {}
    : {
        wireReasoningEffort: effort,
        appliedReasoningEffort: effort,
      }
}

export type ShapedRequest = {
  providerOptions: ProviderOptions
  headers: Record<string, string>
}

export function shapeRequest(
  modelConfig: ModelConfig,
  ctx: RequestShapingContext
): ShapedRequest {
  return {
    providerOptions: mergeProviderOptions(
      resolveReasoningOptions(modelConfig, ctx),
      resolveRequestPolicyOptions(modelConfig.providerId, ctx),
      resolvePromptCachingOptions(modelConfig)
    ),
    headers: resolveHeaders(modelConfig, ctx),
  }
}

/**
 * Options every request to a provider carries, reasoning or not, the title
 * call included (ADR-0021, provider data retention and attribution).
 *
 * Storage: OpenAI and xAI send `store: false` (Convex already holds the
 * conversation; the SDKs then request encrypted reasoning themselves and
 * replay it inline between steps). One exception: an OpenAI turn that pairs
 * hosted search with app tools keeps the default storage. Without it the
 * SDK drops the hosted `web_search_call` from later steps but still sends
 * the reasoning item that preceded it, which OpenAI rejects ("reasoning ...
 * without its required following item"). The xAI SDK drops hosted calls
 * whatever `store` says, so storage changes nothing there.
 *
 * Attribution: the hashed actor id goes out as OpenAI `safetyIdentifier`,
 * Anthropic `metadata.userId`, and OpenRouter `user`; the xAI SDK has no
 * id field.
 */
export function resolveRequestPolicyOptions(
  providerId: Provider,
  ctx: Pick<
    RequestShapingContext,
    "searchToolsActive" | "appToolsActive" | "safetyIdentifier"
  >
): ProviderOptions {
  const { safetyIdentifier } = ctx
  switch (providerId) {
    case "openai":
      return {
        openai: {
          ...(ctx.searchToolsActive && ctx.appToolsActive
            ? {}
            : { store: false }),
          ...(safetyIdentifier !== undefined ? { safetyIdentifier } : {}),
        },
      }
    case "anthropic":
      return safetyIdentifier !== undefined
        ? { anthropic: { metadata: { userId: safetyIdentifier } } }
        : {}
    case "xai":
      return { xai: { store: false } }
    case "openrouter":
      return safetyIdentifier !== undefined
        ? { openrouter: { user: safetyIdentifier } }
        : {}
    default:
      return {}
  }
}

/**
 * Anthropic automatic prompt caching on every Claude answer request, direct
 * or through OpenRouter (its provider sends `cacheControl` as the top-level
 * `cache_control`). Each step of a tool loop and each later turn re-reads
 * the shared prefix at the cache rate; prompts below the model's minimum
 * cacheable size are not cached. The one-shot title call skips it.
 */
function resolvePromptCachingOptions(
  modelConfig: Pick<ModelConfig, "providerId" | "baseProviderId">
): ProviderOptions {
  const cacheControl = { type: "ephemeral" }
  if (modelConfig.providerId === "anthropic") {
    return { anthropic: { cacheControl } }
  }
  if (
    modelConfig.providerId === "openrouter" &&
    modelConfig.baseProviderId === "anthropic"
  ) {
    return { openrouter: { cacheControl } }
  }
  return {}
}

/** Merge per-provider option objects one namespace level deep. */
function mergeProviderOptions(...sources: ProviderOptions[]): ProviderOptions {
  const merged: ProviderOptions = {}
  for (const source of sources) {
    for (const [namespace, options] of Object.entries(source)) {
      merged[namespace] = { ...merged[namespace], ...options }
    }
  }
  return merged
}

/**
 * Enable reasoning according to the selected model's catalog metadata.
 *
 * AI SDK 7 currently maps Anthropic `pause_turn` to `stop` without continuing
 * the request. Catalogued models with `searchThinkingDowngrade` therefore use
 * fixed-budget thinking while search is active to avoid a reasoning-only
 * response. Never apply that workaround to later models that reject fixed
 * budgets; fix renewed `pause_turn` failures at the SDK continuation layer.
 */
function resolveReasoningOptions(
  modelConfig: ModelConfig,
  ctx: RequestShapingContext
): ProviderOptions {
  if (!modelConfig.reasoningText) return {}
  const effort = ctx.wireReasoningEffort

  switch (modelConfig.providerId) {
    case "anthropic": {
      const downgradeForSearch = usesFixedBudgetSearchThinking(
        modelConfig,
        ctx.searchToolsActive
      )
      if (modelConfig.thinkingMode === "adaptive" && !downgradeForSearch) {
        // Effort rides only the adaptive path, and the catalog never offers
        // "none" on Anthropic — so the Opus 5 "disabled thinking + xhigh/max
        // → 400" combination is unrepresentable here by construction.
        // `display` is explicit because the provider default flipped at 4.7
        // (Opus 4.8/Sonnet 5/Fable 5 default to `omitted`: thinking blocks
        // stream with empty text and no thinking_delta). `summarized` is the
        // documented default on 4.6, so it is a no-op there. The fixed-budget
        // path below never sends it (`display` is invalid with `enabled`).
        return {
          anthropic: {
            thinking: { type: "adaptive", display: "summarized" },
            ...(effort !== undefined ? { effort } : {}),
          },
        }
      }
      // Fixed-budget path (pause_turn downgrade or budget-era models):
      // `effort` and `budget_tokens` don't combine — the budget wins and the
      // receipt omits applied effort because no named level represents it.
      const budgetTokens = fixedThinkingBudgetTokens(
        modelConfig,
        ctx.searchToolsActive
      )
      return { anthropic: { thinking: { type: "enabled", budgetTokens } } }
    }
    case "google":
      return {
        google: {
          thinkingConfig: {
            includeThoughts: true,
            // Gemini 3.x takes thinkingLevel; 2.5 models never declare
            // effortLevels, so effort stays undefined for them here.
            ...(effort !== undefined ? { thinkingLevel: effort } : {}),
          },
        },
      }
    case "openai":
      return {
        openai: {
          ...(effort !== undefined ? { reasoningEffort: effort } : {}),
          reasoningSummary: "auto",
        },
      }
    case "xai":
      // Only grok-4.3 declares effortLevels (the other catalogued Grok 4
      // models reason unconditionally and reject the parameter), so effort
      // is undefined for them and the option is never sent.
      return effort !== undefined ? { xai: { reasoningEffort: effort } } : {}
    case "mistral":
      // Mistral reasoning is off unless reasoning_effort is "high" (the only
      // enabling value the installed adapter sends); there is no per-turn
      // effort knob, so the catalog flag alone decides.
      return { mistral: { reasoningEffort: "high" } }
    // OpenRouter reasoning is mapped at model construction (ADR-0026): the
    // catalog setting and the per-turn effort override live in
    // provider-strategy.ts.
    default:
      return {}
  }
}

/** Add Anthropic's token-efficient-tools beta only to requests with tools. */
function resolveHeaders(
  modelConfig: ModelConfig,
  ctx: RequestShapingContext
): Record<string, string> {
  const headers: Record<string, string> = {}
  const isTokenEfficient =
    process.env.ANTHROPIC_TOKEN_EFFICIENT_TOOLS !== "false"

  if (
    modelConfig.providerId === "anthropic" &&
    ctx.hasTools &&
    isTokenEfficient
  ) {
    headers["anthropic-beta"] = ANTHROPIC_BETA_HEADERS.tokenEfficient
  }
  return headers
}
