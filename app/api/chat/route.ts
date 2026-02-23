import { auth } from "@clerk/nextjs/server"
import { after } from "next/server"
import {
  SYSTEM_PROMPT_DEFAULT,
  MCP_CONNECTION_TIMEOUT_MS,
  MCP_MAX_STEP_COUNT,
  DEFAULT_MAX_STEP_COUNT,
  ANONYMOUS_MAX_STEP_COUNT,
  ANTHROPIC_BETA_HEADERS,
  PREPARE_STEP_THRESHOLD,
  HISTORY_REPLAY_COMPILER_V1,
} from "@/lib/config"
import { getAllModels } from "@/lib/models"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import type { SupportedModel } from "@/lib/openproviders/types"
import {
  captureGeneration,
  flushPostHog,
  getPostHogClient,
} from "@/lib/posthog"
import type { Provider } from "@/lib/user-keys"
import {
  UIMessage as MessageAISDK,
  streamText,
  ToolSet,
  stepCountIs,
  convertToModelMessages,
  type ModelMessage,
} from "ai"
import type { ProviderOptions } from "@ai-sdk/provider-utils"
import { fetchMutation, fetchQuery } from "convex/nextjs"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import {
  checkServerSideUsage,
  incrementServerSideUsage,
  validateAndTrackUsage,
} from "./api"
import {
  createErrorResponse,
  extractErrorMessage,
  hasProviderLinkedResponseIds,
  toPlainTextModelMessages,
} from "./utils"
import { adaptHistoryForProvider } from "./adapters"
import type { AdaptationContext, AdaptationWarning } from "./adapters/types"
import {
  loadUserMcpTools,
  type LoadToolsResult,
} from "@/lib/mcp/load-tools"
import { resolveToolCapabilities } from "@/lib/tools/types"
import { shouldInjectSearchTools } from "./search-tools"
import {
  ToolTraceCollector,
  wrapMcpTools,
  isToolResultEnvelope,
} from "@/lib/tools/mcp-wrapper"
import type { ShippingAddress } from "@/lib/payclaw/schemas"

export const maxDuration = 60

type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  model: string
  systemPrompt: string
  enableSearch: boolean
  message_group_id?: string
  userId?: string // Client-provided userId (for anonymous users)
}

function isReplayShapeError(message: string): boolean {
  const normalized = message.toLowerCase()
  return [
    // OpenAI
    "was provided without its required",
    "no tool output found for function call",
    // Anthropic
    "thinking block must be followed by",
    "tool_use block must be followed by tool_result",
    // Google
    "number of function response parts is equal to",
    "missing a thought_signature",
  ].some((pattern) => normalized.includes(pattern))
}

function summarizeHistoryPartTypes(messages: MessageAISDK[]): {
  roleCounts: Record<string, number>
  partTypeCounts: Record<string, number>
} {
  const roleCounts: Record<string, number> = {}
  const partTypeCounts: Record<string, number> = {}

  for (const message of messages) {
    roleCounts[message.role] = (roleCounts[message.role] ?? 0) + 1
    for (const part of message.parts ?? []) {
      partTypeCounts[part.type] = (partTypeCounts[part.type] ?? 0) + 1
    }
  }

  return { roleCounts, partTypeCounts }
}

function countWarningsByCode(warnings: AdaptationWarning[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const warning of warnings) {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1
  }
  return counts
}

function summarizeReplayWarningDetails(
  warnings: AdaptationWarning[],
  code: "replay_normalization_warning" | "replay_compile_warning",
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const warning of warnings) {
    if (warning.code !== code) continue
    const subcode = warning.detail.split(":")[0]?.trim() || "unknown"
    counts[subcode] = (counts[subcode] ?? 0) + 1
  }
  return counts
}

function formatAddressContext(addresses: Array<Doc<"shippingAddresses">>): string {
  if (addresses.length === 0) return ""

  const lines = addresses.map((addr) => {
    const prefix = addr.isDefault ? "★ Default" : "•"
    const label = addr.label ? ` (${addr.label})` : ""
    const line2 = addr.line2 ? `, ${addr.line2}` : ""
    const contactInfo = [addr.email, addr.phone].filter(Boolean).join(", ")
    const contactSuffix = contactInfo ? ` [${contactInfo}]` : ""
    return `${prefix}${label}: ${addr.name}, ${addr.line1}${line2}, ${addr.city}, ${addr.state} ${addr.postalCode}${contactSuffix}`
  })

  return [
    "\n\n---",
    "User's shipping addresses on file:",
    ...lines,
    "When the user asks to buy a physical product, use their default shipping address unless they specify otherwise.",
    "---",
  ].join("\n")
}

export async function POST(req: Request) {
  // MCP state — declared outside try for cleanup in both after() and catch
  let mcpClients: LoadToolsResult["clients"] = []
  let mcpToolServerMap: LoadToolsResult["toolServerMap"] = new Map()

  try {
    // Server-side authentication - derive userId from Clerk session
    const { userId: authUserId, getToken } = await auth()
    const isAuthenticated = !!authUserId

    // Get Convex token for authenticated usage tracking
    const convexToken = isAuthenticated
      ? (await getToken({ template: "convex" })) ?? undefined
      : undefined

    const {
      messages,
      chatId,
      model,
      systemPrompt,
      enableSearch,
      message_group_id,
      userId: clientUserId,
    } = (await req.json()) as ChatRequest

    if (!messages || !chatId || !model) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          code: "INVALID_REQUEST",
          details: {
            messages: !messages ? "required" : "ok",
            chatId: !chatId ? "required" : "ok",
            model: !model ? "required" : "ok",
          },
        }),
        { status: 400 }
      )
    }

    // For anonymous users, require a guest ID for usage tracking
    // The client must provide a stable guest ID (format: "guest_<uuid>") from localStorage
    // This is generated by getOrCreateGuestUserId() on the client
    if (!isAuthenticated && !clientUserId) {
      return new Response(
        JSON.stringify({
          error: "Guest ID required for anonymous users",
          code: "MISSING_GUEST_ID",
        }),
        { status: 400 }
      )
    }

    // Use authenticated userId, or client-provided ID for anonymous users
    // At this point: if authenticated, authUserId is defined; if not, clientUserId is defined (validated above)
    const userId = authUserId ?? clientUserId!

    // For anonymous users, use clientUserId for rate limiting
    // This should match the format from getOrCreateGuestUserId: "guest_<uuid>"
    const anonymousId = !isAuthenticated ? clientUserId! : undefined

    // Server-side usage check - enforces rate limits before processing
    // For anonymous users, pass the anonymousId for tracking
    await checkServerSideUsage(convexToken, model, anonymousId)

    await validateAndTrackUsage({
      userId,
      model,
      isAuthenticated,
      token: convexToken,
    })

    // Increment usage count server-side with Convex
    await incrementServerSideUsage(convexToken, model, anonymousId)

    const allModels = await getAllModels()
    const modelConfig = allModels.find((m) => m.id === model)

    if (!modelConfig || !modelConfig.apiSdk) {
      throw new Error(`Model ${model} not found`)
    }

    const effectiveSystemPrompt = systemPrompt || SYSTEM_PROMPT_DEFAULT

    const provider = getProviderForModel(model as SupportedModel)
    let userAddresses: Array<Doc<"shippingAddresses">> = []

    let apiKey: string | undefined
    if (isAuthenticated && convexToken) {
      const { getEffectiveApiKey } = await import("@/lib/user-keys")
      apiKey =
        (await getEffectiveApiKey(
          provider as Provider,
          convexToken
        )) || undefined
    }

    // Pre-flight check: verify an API key is available before calling the provider.
    // When apiKey is undefined, the AI SDK falls back to environment variables.
    // If neither source has a valid key, the provider will reject with a 401.
    if (!apiKey) {
      const { env: providerEnv } = await import("@/lib/openproviders/env")
      const envKeyMap: Record<string, string | undefined> = {
        openai: providerEnv.OPENAI_API_KEY,
        mistral: providerEnv.MISTRAL_API_KEY,
        perplexity: providerEnv.PERPLEXITY_API_KEY,
        google: providerEnv.GOOGLE_GENERATIVE_AI_API_KEY,
        anthropic: providerEnv.ANTHROPIC_API_KEY,
        xai: providerEnv.XAI_API_KEY,
        openrouter: providerEnv.OPENROUTER_API_KEY,
      }
      const envKey = envKeyMap[provider]
      if (!envKey) {
        const providerName = modelConfig.provider || provider
        throw Object.assign(
          new Error(
            `No API key configured for ${providerName}. Please add your ${providerName} API key in settings.`
          ),
          { statusCode: 401, code: "MISSING_API_KEY" }
        )
      }
    }

    // enableSearch is no longer passed to the model — it controls tool injection below.
    // All search is now provided via visible, auditable tool calls (Layer 1 or Layer 2).
    const aiModel = modelConfig.apiSdk(apiKey)

    // -----------------------------------------------------------------------
    // Search Tool Loading (Layer 1 — Built-in Provider Tools)
    //
    // The `enableSearch` flag from the client is the MASTER SWITCH for search
    // tool injection. When true, route.ts injects search tools:
    //   - If the provider has native search tools → use them (Layer 1)
    //   - If not → use Exa fallback (Layer 2, added in Phase 3)
    //
    // This replaces the previous dual mechanism where `enableSearch` was
    // passed to `modelConfig.apiSdk()` as an opaque provider-level flag.
    // All search is now visible, auditable tool calls.
    //
    // NOT gated on isAuthenticated. Anonymous users (5 daily messages)
    // get search tools when the platform has provider API keys configured.
    // When apiKey is undefined (anonymous), the provider factory falls back
    // to the env var — same behavior as model creation above.
    // -----------------------------------------------------------------------
    let builtInTools: ToolSet = {} as ToolSet
    let builtInToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    const capabilities = resolveToolCapabilities(modelConfig.tools)
    const shouldInjectSearch = shouldInjectSearchTools(enableSearch, modelConfig.tools)

    if (shouldInjectSearch) {
      const { getProviderTools } = await import("@/lib/tools/provider")
      const providerResult = await getProviderTools(provider, apiKey)
      builtInTools = providerResult.tools
      builtInToolMetadata = providerResult.metadata
    }

    // -----------------------------------------------------------------------
    // Exa API Key Resolution (shared by Layer 2 capabilities)
    //
    // Resolved once, used by both search fallback and content extraction.
    // Key resolution: user BYOK key → platform env var → undefined.
    // The exa-js SDK accepts keys in its constructor, so BYOK keys
    // are passed directly — no env var manipulation needed.
    //
    // NOT gated on isAuthenticated — anonymous users get Exa-powered tools
    // when the platform has an EXA_API_KEY configured (same as Layer 1).
    // -----------------------------------------------------------------------
    let resolvedExaKey: string | undefined
    if (convexToken) {
      const { getEffectiveToolKey } = await import("@/lib/user-keys")
      resolvedExaKey = await getEffectiveToolKey("exa", convexToken)
    }
    if (!resolvedExaKey) {
      resolvedExaKey = process.env.EXA_API_KEY
    }

    // -----------------------------------------------------------------------
    // Third-Party Search Fallback (Layer 2 — Search)
    // Universal search fallback for providers without native search tools.
    // Only loaded when enableSearch is true AND Layer 1 didn't provide search.
    //
    // The coordination model is simple:
    //   - enableSearch === true: route.ts injects search tools
    //   - Layer 1 provided search (builtInHasSearch): skip Layer 2 search
    //   - Layer 1 did NOT provide search: load Layer 2 Exa fallback
    // -----------------------------------------------------------------------
    let thirdPartyTools: ToolSet = {} as ToolSet
    let thirdPartyToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    if (shouldInjectSearch) {
      const builtInHasSearch = Object.keys(builtInTools).length > 0

      if (!builtInHasSearch) {
        const { getThirdPartyTools } = await import("@/lib/tools/third-party")
        const thirdPartyResult = await getThirdPartyTools({
          skipSearch: false,
          exaKey: resolvedExaKey,
        })
        thirdPartyTools = thirdPartyResult.tools
        thirdPartyToolMetadata = thirdPartyResult.metadata
      }
    }

    // -----------------------------------------------------------------------
    // Content Extraction Tools (Layer 2 — Content)
    // Independent capability — NOT gated on shouldInjectSearch or
    // builtInHasSearch. Gated on capabilities.extract and Exa key.
    // Available for ALL providers including those with native Layer 1
    // search (OpenAI, Anthropic, Google, xAI).
    // -----------------------------------------------------------------------
    let contentTools: ToolSet = {} as ToolSet
    let contentToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    if (resolvedExaKey && capabilities.extract) {
      const { getContentExtractionTools } = await import("@/lib/tools/third-party")
      const contentResult = await getContentExtractionTools({
        exaKey: resolvedExaKey,
      })
      contentTools = contentResult.tools
      contentToolMetadata = contentResult.metadata
    }

    // -----------------------------------------------------------------------
    // MCP Tool Loading
    // Gate on: auth + Convex token + model capability
    // -----------------------------------------------------------------------
    let mcpTools: ToolSet = {} as ToolSet

    if (
      isAuthenticated &&
      convexToken &&
      capabilities.mcp
    ) {
      const mcpLoadStart = Date.now()
      const mcpResult = await loadUserMcpTools(convexToken, {
        timeout: MCP_CONNECTION_TIMEOUT_MS,
      })
      mcpTools = mcpResult.tools as ToolSet
      mcpClients = mcpResult.clients
      mcpToolServerMap = mcpResult.toolServerMap

      // PostHog: MCP tool loading observability
      const phClientForMcp = getPostHogClient()
      if (phClientForMcp) {
        phClientForMcp.capture({
          distinctId: userId,
          event: "mcp_tool_load",
          properties: {
            serverCount: mcpResult.clients.length,
            toolCount: Object.keys(mcpResult.tools).length,
            failedServers: mcpResult.failedServerCount,
            loadTimeMs: Date.now() - mcpLoadStart,
          },
        })
      }

      // Register MCP cleanup immediately after loading — before any code that
      // could throw.  after() runs even when the response errors or the client
      // disconnects, so this covers both the happy path and streaming failures.
      after(async () => {
        await Promise.allSettled(mcpClients.map((c) => c.close()))
      })
    }

    // -----------------------------------------------------------------------
    // Platform Tool Loading (Layer 4 — Experimental)
    // Flowglad Pay: AI-powered purchase agent.
    // Gated on: auth + env var presence (getPlatformTools returns empty if not configured).
    // NOT loaded for anonymous users (has side effects — spends money).
    //
    // EXPERIMENTAL: This entire section can be removed to disable Flowglad Pay.
    // See: .agents/plans/flowglad-pay-integration.md (Rollback instructions)
    // -----------------------------------------------------------------------
    let platformTools: ToolSet = {} as ToolSet
    let platformToolMetadata = new Map<string, import("@/lib/tools/types").ToolMetadata>()

    let userCardId: string | undefined
    if (isAuthenticated) {
      if (convexToken) {
        try {
          userAddresses = (await fetchQuery(
            api.shippingAddresses.list,
            {},
            { token: convexToken }
          )) ?? []
        } catch (err) {
          console.warn("[chat] Failed to fetch shipping addresses:", err)
        }

        try {
          const userDoc = await fetchQuery(
            api.users.getByClerkId,
            { clerkId: authUserId! },
            { token: convexToken }
          )
          userCardId = userDoc?.payClawCardId ?? undefined
        } catch (err) {
          console.warn("[chat] Failed to fetch user card ID:", err)
        }
      }

      const { currentUser } = await import("@clerk/nextjs/server")
      const clerkUser = await currentUser()
      const userName = clerkUser
        ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
        : undefined

      const defaultAddress = userAddresses.find((address) => address.isDefault)
      let cleanDefaultShippingAddress: ShippingAddress | undefined = defaultAddress
        ? ({
            name: defaultAddress.name,
            line1: defaultAddress.line1,
            line2: defaultAddress.line2,
            city: defaultAddress.city,
            state: defaultAddress.state,
            postalCode: defaultAddress.postalCode,
            country: defaultAddress.country,
            phone: defaultAddress.phone,
            email: defaultAddress.email,
          } satisfies ShippingAddress)
        : undefined

      if (
        cleanDefaultShippingAddress &&
        !cleanDefaultShippingAddress.email &&
        clerkUser?.primaryEmailAddress?.emailAddress
      ) {
        cleanDefaultShippingAddress.email = clerkUser.primaryEmailAddress.emailAddress
      }

      const { getPlatformTools } = await import("@/lib/tools/platform")
      const platformResult = await getPlatformTools({
        userName: userName || undefined,
        defaultShippingAddress: cleanDefaultShippingAddress,
        defaultCardId: userCardId,
      })
      platformTools = platformResult.tools
      platformToolMetadata = platformResult.metadata
    }

    // Wrap MCP tools with timeout, timing, truncation, and envelope.
    // Single wrapper handles all Layer 3 concerns — follows the Exa gold
    // standard pattern (lib/tools/third-party.ts:82-119).
    // Replaces the previous wrapToolsWithTruncation(mcpTools) call.
    const traceCollector = new ToolTraceCollector()

    if (Object.keys(mcpTools).length > 0) {
      mcpTools = wrapMcpTools(mcpTools, {
        toolServerMap: mcpToolServerMap,
        traceCollector,
      }) as ToolSet
    }

    // Merge all tool layers:
    //   - Search: Layer 1 (built-in) XOR Layer 2 (Exa fallback) — never both
    //   - Content: Layer 2 content extraction — independent of search gating
    //   - Platform: Layer 4 (Flowglad Pay, etc.)
    //   - MCP: Layer 3 (user-configured servers)
    // Spread order = conflict resolution priority (last wins):
    //   1. Search tools (lowest priority)
    //   2. Content extraction tools (same priority tier as search)
    //   3. Platform tools (middle priority)
    //   4. MCP tools (highest priority — user-configured, namespaced)
    const searchTools = { ...builtInTools, ...thirdPartyTools }
    const allTools = { ...searchTools, ...contentTools, ...platformTools, ...mcpTools } as ToolSet

    // Dev-mode collision detection: warn when duplicate keys are found
    if (process.env.NODE_ENV !== "production") {
      const searchKeys = new Set(Object.keys(searchTools))
      for (const key of Object.keys(mcpTools)) {
        if (searchKeys.has(key)) {
          console.warn(`[tools] Key collision: "${key}" exists in both search and MCP tools. MCP wins.`)
        }
      }
    }

    const hasAnyTools = Object.keys(allTools).length > 0

    // Anonymous users get a lower step count to limit tool call cost exposure.
    // Authenticated users get the full MCP_MAX_STEP_COUNT (20).
    const maxSteps = hasAnyTools
      ? (isAuthenticated ? MCP_MAX_STEP_COUNT : ANONYMOUS_MAX_STEP_COUNT)
      : DEFAULT_MAX_STEP_COUNT

    // Check if PostHog is configured for LLM analytics
    const phClient = getPostHogClient()
    const startTime = Date.now()

    // Schedule PostHog flush after streaming response completes
    // This ensures $ai_generation events are flushed before the serverless function terminates
    // Using flush() instead of shutdown() allows client reuse in warm containers
    if (phClient) {
      after(async () => {
        await flushPostHog()
      })
    }

    const adaptationContext: AdaptationContext = {
      targetModelId: model,
      hasTools: hasAnyTools,
      sourceProviderHint: provider,
    }

    const adaptStartTime = Date.now()
    const adapterResult = await adaptHistoryForProvider(
      messages,
      provider,
      adaptationContext,
      {
        useReplayCompiler: HISTORY_REPLAY_COMPILER_V1,
      },
    )
    const adaptationTimeMs = Date.now() - adaptStartTime
    const warningCount = adapterResult.warnings.length
    const warningCountsByCode = countWarningsByCode(adapterResult.warnings)
    const replayNormalizeWarningCount =
      warningCountsByCode.replay_normalization_warning ?? 0
    const replayCompileWarningCount =
      warningCountsByCode.replay_compile_warning ?? 0
    const replayCompileFallbackCount =
      warningCountsByCode.replay_compile_fallback ?? 0
    const replayCompileFallbackActivated = replayCompileFallbackCount > 0
    const partsDroppedTotal = Object.values(adapterResult.stats.partsDropped).reduce(
      (sum, count) => sum + count,
      0
    )

    if (HISTORY_REPLAY_COMPILER_V1) {
      console.log(
        JSON.stringify({
          _tag: "replay_normalize_stage",
          chatId,
          provider,
          model,
          compilerEnabled: true,
          warningCount: replayNormalizeWarningCount,
          warningCodes: summarizeReplayWarningDetails(
            adapterResult.warnings,
            "replay_normalization_warning"
          ),
          originalMessageCount: adapterResult.stats.originalMessageCount,
          adaptedMessageCount: adapterResult.stats.adaptedMessageCount,
          totalPartsOriginal: adapterResult.stats.totalPartsOriginal,
          totalPartsAdapted: adapterResult.stats.totalPartsAdapted,
        })
      )

      console.log(
        JSON.stringify({
          _tag: "replay_compile_stage",
          chatId,
          provider,
          model,
          compilerEnabled: true,
          warningCount: replayCompileWarningCount,
          warningCodes: summarizeReplayWarningDetails(
            adapterResult.warnings,
            "replay_compile_warning"
          ),
          fallbackActivated: replayCompileFallbackActivated,
          fallbackCount: replayCompileFallbackCount,
          adaptationTimeMs,
        })
      )
    }

    if (replayCompileFallbackActivated) {
      console.warn(
        JSON.stringify({
          _tag: "replay_compile_fallback_activated",
          chatId,
          provider,
          model,
          compilerEnabled: HISTORY_REPLAY_COMPILER_V1,
          fallbackCount: replayCompileFallbackCount,
          originalMessageCount: adapterResult.stats.originalMessageCount,
          adaptedMessageCount: adapterResult.stats.adaptedMessageCount,
        })
      )
    }

    console.log(
      JSON.stringify({
        _tag: "history_adapt",
        chatId,
        provider,
        model,
        replayCompilerEnabled: HISTORY_REPLAY_COMPILER_V1,
        ...adapterResult.stats,
        warningCount,
        warningCodes: warningCountsByCode,
        adaptationTimeMs,
      })
    )

    if (phClient) {
      phClient.capture({
        distinctId: userId || "anonymous",
        event: "history_adaptation",
        properties: {
          chatId,
          provider,
          model,
          originalMessageCount: adapterResult.stats.originalMessageCount,
          adaptedMessageCount: adapterResult.stats.adaptedMessageCount,
          partsDroppedTotal,
          providerIdsStripped: adapterResult.stats.providerIdsStripped,
          warningCount,
          adaptationTimeMs,
        },
      })
    }

    // Convert UIMessage[] to ModelMessage[] for streamText (v6)
    let modelMessages: ModelMessage[] = await convertToModelMessages(
      adapterResult.messages,
      {
        ignoreIncompleteToolCalls: true,
      }
    )

    // OpenAI responses replay hardening:
    // If conversion output still contains provider-linked response IDs
    // (msg_/rs_/ws_), fall back to a plain-text transcript to avoid
    // pairing invariant failures on follow-up turns.
    if (provider === "openai" && hasProviderLinkedResponseIds(modelMessages)) {
      console.warn(
        JSON.stringify({
          _tag: "replay_plaintext_fallback_activated",
          chatId,
          provider,
          model,
          reason: "provider_linked_response_ids_detected_post_conversion",
          messageCount: modelMessages.length,
          compilerEnabled: HISTORY_REPLAY_COMPILER_V1,
        })
      )
      modelMessages = toPlainTextModelMessages(adapterResult.messages)
    }

    // Build provider-specific options to enable reasoning/thinking when
    // the selected model advertises support (reasoningText: true).
    //
    // Anthropic thinking configuration is context-aware:
    //   - Models with thinkingMode: "adaptive" (Opus 4.6+) use Anthropic's
    //     adaptive allocation — the recommended mode per Anthropic's docs.
    //     "enabled" with budget_tokens is deprecated on Opus 4.6.
    //   - Older models use "enabled" with a fixed budgetTokens.
    //
    // IMPORTANT: Server-side web search results (encrypted_content) are
    // counted as INPUT tokens, not output tokens. They do NOT consume from
    // the max_tokens budget. (Source: Anthropic web search tool docs)
    //
    // SDK LIMITATION (ai@6.0.78 / @ai-sdk/anthropic@3.0.41):
    // When adaptive thinking is used with server-side tools (web search),
    // the Anthropic API may return stop_reason: "pause_turn" — indicating
    // the model needs a follow-up request to continue generating text. The
    // AI SDK maps "pause_turn" to the same unified finishReason as "end_turn"
    // ("stop") and the step continuation logic does not re-send the
    // conversation. This results in responses with reasoning + tool results
    // but zero text content.
    //
    // WORKAROUND: When search tools are active, fall back to "enabled"
    // thinking with a conservative budget. This produces a complete response
    // in a single API call (no pause_turn). For non-search requests,
    // adaptive thinking works correctly and is preferred.
    const providerOptions: ProviderOptions = {}

    if (modelConfig.reasoningText) {
      if (provider === "anthropic") {
        if (modelConfig.thinkingMode === "adaptive") {
          if (shouldInjectSearch) {
            // Adaptive + server-side web search triggers pause_turn in the
            // Anthropic API, which the AI SDK does not handle (see above).
            // Fall back to "enabled" with a budget that leaves ample room
            // for text output. Search results are input tokens, so they
            // don't consume from max_tokens — no reduction needed.
            providerOptions.anthropic = {
              thinking: { type: "enabled", budgetTokens: 10000 },
            }
          } else {
            // Opus 4.6+ without search — use adaptive thinking as recommended.
            // The model dynamically allocates between thinking and text, with
            // interleaved thinking automatically enabled for tool use.
            providerOptions.anthropic = {
              thinking: { type: "adaptive" },
            }
          }
        } else {
          // Older models — fixed budget.
          let budgetTokens = 10000 // default
          if (model.includes("opus")) budgetTokens = 16000
          else if (model.includes("haiku")) budgetTokens = 5000
          else if (model.includes("sonnet")) budgetTokens = 12000

          providerOptions.anthropic = {
            thinking: { type: "enabled", budgetTokens },
          }
        }
      } else if (provider === "google") {
        providerOptions.google = {
          thinkingConfig: { includeThoughts: true },
        }
      } else if (provider === "openai") {
        providerOptions.openai = {
          reasoningEffort: "medium",
          reasoningSummary: "auto",
        }
      } else if (provider === "xai") {
        providerOptions.xai = {
          reasoningEffort: "medium",
        }
      }
    }

    // -----------------------------------------------------------------------
    // Anthropic Token-Efficient Tool Use
    //
    // When Anthropic models have tools injected, enable the token-efficient
    // beta header to reduce tool definition token consumption. This header
    // is request-scoped via streamText({ headers }) — only affects Anthropic
    // requests that actually include tools.
    //
    // The header is safe to apply: @ai-sdk/anthropic@3.0.41 comma-merges
    // user and inferred betas (getBetasFromHeaders + Array.from(betas).join(",")).
    // -----------------------------------------------------------------------
    const requestHeaders: Record<string, string> = {}

    if (provider === "anthropic" && hasAnyTools) {
      requestHeaders["anthropic-beta"] = ANTHROPIC_BETA_HEADERS.tokenEfficient
    }

    // Collect all tool metadata for prepareStep tool restriction.
    // Merge built-in + third-party + content + platform metadata (MCP metadata
    // not available here — MCP tools are conservatively included in the safe list).
    const allToolMetadata = new Map([
      ...builtInToolMetadata,
      ...thirdPartyToolMetadata,
      ...contentToolMetadata,
      ...platformToolMetadata,
    ])
    let enrichedSystemPrompt = effectiveSystemPrompt
    if (isAuthenticated && userAddresses.length > 0) {
      enrichedSystemPrompt += formatAddressContext(userAddresses)
    }

    const streamStartMs = Date.now()
    let stepCounter = 0

    // Track reasoning timing for messageMetadata persistence.
    // The first reasoning chunk records a start timestamp; when text-delta
    // arrives (reasoning is done) or onFinish fires, we compute elapsed ms.
    let reasoningStartMs: number | null = null
    let reasoningDurationMs: number | null = null

    const result = streamText({
      model: aiModel,
      system: enrichedSystemPrompt,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(maxSteps),

      // Restrict tools after PREPARE_STEP_THRESHOLD to prevent runaway
      // tool chains. Only tools explicitly marked readOnly: true remain
      // available. MCP tools are conservatively included (can't classify
      // read/write yet). Unclassified non-MCP tools are restricted
      // (fail closed — new tools must opt in via readOnly: true).
      prepareStep: hasAnyTools
        ? async ({ stepNumber }) => {
            if (stepNumber <= PREPARE_STEP_THRESHOLD) return {}

            // Build safe tool list: only tools explicitly marked readOnly.
            // New tools that omit readOnly default to RESTRICTED (fail closed).
            const safeTools: string[] = []
            for (const [name, meta] of allToolMetadata) {
              if (meta.readOnly === true) safeTools.push(name)
            }
            // Include all MCP tools (can't classify read/write yet)
            for (const name of Object.keys(mcpTools)) {
              if (!safeTools.includes(name)) safeTools.push(name)
            }

            // Fail closed: if no safe tools found, no tools available.
            // This is intentional — prevents unrestricted tool access
            // if readOnly metadata is misconfigured.
            return { activeTools: safeTools }
          }
        : undefined,

      // Per-step structured tracing.
      // Captures tool name, duration, token usage, and success per step.
      // This data feeds into the existing toolCallLog for trajectory analysis
      // and future trace-based evaluation.
      onStepFinish: ({ toolCalls, toolResults, usage, finishReason }) => {
        stepCounter++
        if (toolCalls.length === 0) return

        for (const call of toolCalls) {
          const result = toolResults.find(
            (r) => r.toolCallId === call.toolCallId
          )
          const success = result
            ? !(result as { isError?: boolean }).isError
            : false
          const meta = allToolMetadata.get(call.toolName)

          // Structured JSON log — parseable by Vercel log drain and grep.
          // Uses _tag for machine filtering without affecting human readability.
          console.log(
            JSON.stringify({
              _tag: "tool_trace",
              chatId,
              step: stepCounter,
              tool: meta?.displayName ?? call.toolName,
              source: meta?.source ?? "unknown",
              success,
              durationMs: traceCollector.get(call.toolCallId)?.durationMs ?? null,
              tokens: {
                in: usage?.inputTokens ?? null,
                out: usage?.outputTokens ?? null,
              },
              finishReason,
              model,
            })
          )
        }
      },

      ...(Object.keys(providerOptions).length > 0 && { providerOptions }),
      ...(Object.keys(requestHeaders).length > 0 && { headers: requestHeaders }),

      onChunk: ({ chunk }) => {
        if (chunk.type === "reasoning-delta" && reasoningStartMs === null) {
          reasoningStartMs = Date.now()
        }
        // When text-delta arrives after reasoning, reasoning is done
        if (
          chunk.type === "text-delta" &&
          reasoningStartMs !== null &&
          reasoningDurationMs === null
        ) {
          reasoningDurationMs = Date.now() - reasoningStartMs
        }
      },

      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
        const errorMessage = extractErrorMessage(err)

        if (isReplayShapeError(errorMessage)) {
          console.error(
            JSON.stringify({
              _tag: "replay_shape_error",
              chatId,
              provider,
              model,
              errorMessage,
              messageCount: messages.length,
              historyPartTypes: summarizeHistoryPartTypes(messages),
            })
          )
        }

        // Capture failed generations to PostHog for complete analytics
        if (phClient) {
          try {
            const latencyMs = Date.now() - startTime
            captureGeneration({
              distinctId: userId,
              traceId: chatId,
              model,
              provider,
              input: messages,
              output: null,
              latencyMs,
              isError: true,
              errorMessage,
              properties: {
                isAuthenticated,
                messageGroupId: message_group_id,
              },
            })
          } catch (captureErr) {
            console.error("[PostHog] Failed to capture error event:", captureErr)
          }
        }
      },

      onFinish: ({ text, usage, steps, finishReason }) => {
        // Freeze reasoning duration if it wasn't already frozen by text-delta
        // (e.g. reasoning-only responses with no text output, or errors)
        if (reasoningStartMs !== null && reasoningDurationMs === null) {
          reasoningDurationMs = Date.now() - reasoningStartMs
        }

        // ---------------------------------------------------------------
        // Finish reason observability
        // Log when the response was truncated (finishReason: "length")
        // so we can detect max_tokens exhaustion in dev and production.
        // ---------------------------------------------------------------
        if (finishReason === "length") {
          console.warn(
            `[chat] Response truncated (finishReason: "length") — model: ${model}, ` +
            `outputTokens: ${usage?.outputTokens ?? "?"}, ` +
            `inputTokens: ${usage?.inputTokens ?? "?"}`
          )
        }
        if (process.env.NODE_ENV !== "production") {
          // Log both unified and raw finish reasons. The raw reason reveals
          // provider-specific signals (e.g. Anthropic's "pause_turn" vs
          // "end_turn") that the unified reason collapses into "stop".
          const rawReason = steps?.[steps.length - 1]?.rawFinishReason
          console.log(
            `[chat] finishReason: ${finishReason}` +
            `${rawReason && rawReason !== finishReason ? ` (raw: ${rawReason})` : ""}, ` +
            `model: ${model}, ` +
            `tokens: ${usage?.inputTokens ?? "?"}in/${usage?.outputTokens ?? "?"}out, ` +
            `text: ${text?.length ?? 0} chars`
          )
        }

        if (process.env.NODE_ENV !== "production" && provider === "anthropic" && hasAnyTools) {
          console.log(
            `[chat] Anthropic tool usage — inputTokens: ${usage?.inputTokens ?? "?"}, ` +
            `toolCount: ${Object.keys(allTools).length}, ` +
            `tokenEfficient: true`
          )
        }

        // Manually capture LLM generation for PostHog analytics
        // This ensures accurate output capture (withTracing has issues with streaming)
        if (phClient) {
          try {
            const latencyMs = Date.now() - startTime
            captureGeneration({
              distinctId: userId,
              traceId: chatId,
              model,
              provider,
              input: messages,
              output: text,
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              latencyMs,
              properties: {
                isAuthenticated,
                messageGroupId: message_group_id,
                finishReason,
              },
            })

            // PostHog: unified tool call events — one event per tool invocation (all sources)
            // Replaces the previous MCP-only mcp_tool_call event.
            if (steps) {
              // Combine all metadata maps for source identification
              const allToolMetadata = new Map([
                ...builtInToolMetadata,
                ...thirdPartyToolMetadata,
                ...contentToolMetadata,
                ...platformToolMetadata,
              ])

              for (const step of steps) {
                if (step.toolCalls) {
                  for (const toolCall of step.toolCalls) {
                    const mcpServerInfo = mcpToolServerMap.get(toolCall.toolName)
                    const nonMcpMeta = allToolMetadata.get(toolCall.toolName)

                    // Determine source and service name
                    const source = mcpServerInfo ? "mcp" : (nonMcpMeta?.source ?? "unknown")
                    const serviceName = mcpServerInfo
                      ? mcpServerInfo.serverName
                      : (nonMcpMeta?.serviceName ?? "unknown")
                    const displayName = mcpServerInfo
                      ? mcpServerInfo.displayName
                      : (nonMcpMeta?.displayName ?? toolCall.toolName)

                    const toolResult = step.toolResults?.find(
                      (r: { toolCallId: string }) => r.toolCallId === toolCall.toolCallId
                    )
                    const success = toolResult
                      ? !(toolResult as { isError?: boolean }).isError
                      : false

                    phClient.capture({
                      distinctId: userId,
                      event: "tool_call",
                      properties: {
                        toolName: displayName,
                        rawToolName: toolCall.toolName,
                        source,
                        serviceName,
                        success,
                        chatId,
                        // Phase C: Observability enrichment
                        durationMs: traceCollector.get(toolCall.toolCallId)?.durationMs ?? undefined,
                        // MCP-specific (optional)
                        ...(mcpServerInfo && {
                          serverId: mcpServerInfo.serverId,
                          serverName: mcpServerInfo.serverName,
                        }),
                      },
                    })
                  }
                }
              }
            }
          } catch (captureErr) {
            // Analytics failure should never break the response
            console.error(
              "[PostHog] Failed to capture generation event:",
              captureErr
            )
          }
        }

        // Audit log: persist MCP tool calls to toolCallLog (fire-and-forget).
        // These writes are best-effort — failures are swallowed to avoid breaking
        // the streaming response. Follows the same pattern as updateConnectionStatus
        // in lib/mcp/load-tools.ts.
        if (convexToken && steps && mcpToolServerMap.size > 0) {
          let finishStepNumber = 0

          for (const step of steps) {
            finishStepNumber++

            if (step.toolCalls) {
              for (const toolCall of step.toolCalls) {
                const serverInfo = mcpToolServerMap.get(toolCall.toolName)
                if (!serverInfo) continue

                // Find matching tool result for output preview
                const toolResult = step.toolResults?.find(
                  (r: { toolCallId: string }) =>
                    r.toolCallId === toolCall.toolCallId
                )

                const success = toolResult
                  ? !(toolResult as { isError?: boolean }).isError
                  : false

                // Extract data from envelope for preview — avoids wasting
                // 500 chars on envelope metadata ({"ok":true,"data":...}).
                const output = toolResult?.output
                const previewData = isToolResultEnvelope(output)
                  ? output.data
                  : output
                const trace = traceCollector.get(toolCall.toolCallId)

                void fetchMutation(
                  api.toolCallLog.log,
                  {
                    chatId: chatId as Id<"chats">,
                    serverId: serverInfo.serverId as Id<"mcpServers">,
                    toolName: serverInfo.displayName,
                    toolCallId: toolCall.toolCallId,
                    inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
                    outputPreview: previewData
                      ? JSON.stringify(previewData).slice(0, 500)
                      : undefined,
                    success,
                    durationMs: trace?.durationMs,
                    error: trace?.error,
                    source: "mcp",
                    serviceName: serverInfo.serverName,
                    // Phase C: Observability enrichment
                    stepNumber: finishStepNumber,
                    inputTokens: step.usage?.inputTokens,
                    outputTokens: step.usage?.outputTokens,
                    resultSizeBytes: trace?.resultSizeBytes,
                  },
                  { token: convexToken }
                ).catch(() => {
                  // Intentionally swallowed — audit logging is best-effort
                })
              }
            }
          }
        }

        // Audit log: persist built-in + third-party tool calls (fire-and-forget).
        // Identifies non-MCP tools by checking if the tool name is NOT in mcpToolServerMap.
        if (convexToken && steps) {
          // Combine built-in, third-party, content, and platform metadata maps
          const nonMcpMetadata = new Map([
            ...builtInToolMetadata,
            ...thirdPartyToolMetadata,
            ...contentToolMetadata,
            ...platformToolMetadata,
          ])

          if (nonMcpMetadata.size > 0) {
            let finishStepNumber = 0

            for (const step of steps) {
              finishStepNumber++

              if (step.toolCalls) {
                for (const toolCall of step.toolCalls) {
                  // Skip MCP tools (already logged above)
                  if (mcpToolServerMap.get(toolCall.toolName)) continue

                  const meta = nonMcpMetadata.get(toolCall.toolName)
                  if (!meta) continue // Unknown tool — skip

                  const toolResult = step.toolResults?.find(
                    (r: { toolCallId: string }) =>
                      r.toolCallId === toolCall.toolCallId
                  )
                  const success = toolResult
                    ? !(toolResult as { isError?: boolean }).isError
                    : false

                  // For non-MCP tools, check if result is enveloped (Exa uses envelopes)
                  const output = toolResult?.output
                  const previewData = isToolResultEnvelope(output)
                    ? output.data
                    : output

                  void fetchMutation(
                    api.toolCallLog.log,
                    {
                      chatId: chatId as Id<"chats">,
                      // No serverId for non-MCP tools
                      toolName: meta.displayName,
                      toolCallId: toolCall.toolCallId,
                      inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
                      outputPreview: previewData
                        ? JSON.stringify(previewData).slice(0, 500)
                        : undefined,
                      success,
                      // FIX: Use actual per-tool duration instead of total stream duration.
                      // For Exa, the envelope's meta.durationMs has the real timing.
                      // For builtin tools, we don't have per-tool timing (no trace collector).
                      durationMs: isToolResultEnvelope(output)
                        ? output.meta.durationMs
                        : undefined,
                      source: meta.source,
                      serviceName: meta.serviceName,
                      // Phase C: Observability enrichment
                      stepNumber: finishStepNumber,
                      inputTokens: step.usage?.inputTokens,
                      outputTokens: step.usage?.outputTokens,
                    },
                    { token: convexToken }
                  ).catch(() => {
                    // Intentionally swallowed — audit logging is best-effort
                  })
                }
              }
            }
          }
        }
      }
    })

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      sendSources: true,
      messageMetadata: ({ part }) => {
        if (part.type === "finish" && reasoningDurationMs !== null) {
          return { reasoningDurationMs }
        }
        return {}
      },
      onError: (error: unknown) => {
        console.error("Error forwarded to client:", error)
        return extractErrorMessage(error)
      },
    });
  } catch (err: unknown) {
    // Clean up any MCP clients that were opened before the error
    await Promise.allSettled(mcpClients.map((c) => c.close()))

    console.error("Error in /api/chat:", err)
    const error = err as {
      code?: string
      message?: string
      statusCode?: number
    }

    return createErrorResponse(error)
  }
}
