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
  PAYMENT_STATUS_GUARDRAILS_V1,
  PAYMENT_CHAT_STATE_V1,
  PAYMENT_GUARDRAIL_MODE,
  PAYMENT_CHAT_STATE_BACKFILL_V1,
} from "@/lib/config"
import { getAllModels } from "@/lib/models"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import type { SupportedModel } from "@/lib/openproviders/types"
import {
  captureGeneration,
  flushPostHog,
  getPostHogClient,
} from "@/lib/posthog"
import { scrubForAnalytics } from "@/lib/posthog/scrub"
import type { Provider, ToolKeyMode } from "@/lib/user-keys"
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
import {
  enforceToolNamingGovernance,
  type ToolLayerMap,
} from "@/lib/tools/naming"
import {
  filterMetadataMapByPolicy,
  filterToolSetByPolicy,
  getActiveToolsForStep,
  resolveCapabilityPolicy,
  type ToolPolicyInput,
  type ToolPolicyDecision,
} from "@/lib/tools/capability-policy"
import {
  buildFinishToolInvocationStreamMetadata,
  buildStartToolInvocationStreamMetadata,
  buildToolInvocationMetadataByName,
  type ToolInvocationMetadataByCallId,
} from "@/lib/tools/ui-metadata"
import {
  ToolTraceCollector,
  wrapMcpTools,
} from "@/lib/tools/mcp-wrapper"
import type { ShippingAddress } from "@/lib/payclaw/schemas"

export const maxDuration = 60

type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  model: string
  systemPrompt: string
  enableSearch: boolean
  chatVersion?: number
  message_group_id?: string
  userId?: string // Client-provided userId (for anonymous users)
}

const TERMINAL_PAYMENT_STATUSES = new Set([
  "completed",
  "delivered",
  "cancelled",
  "refunded",
  "failed",
  "expired",
])

function normalizeChatVersion(
  chatVersion: unknown,
  fallbackMessages: MessageAISDK[]
): number {
  if (
    typeof chatVersion === "number" &&
    Number.isFinite(chatVersion) &&
    chatVersion >= 0
  ) {
    return Math.floor(chatVersion)
  }
  return fallbackMessages.length
}

function parseTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  return undefined
}

function getLatestUserMessageTimestamp(messages: MessageAISDK[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "user") continue
    const withCreatedAt = message as MessageAISDK & { createdAt?: unknown }
    return parseTimestampMs(withCreatedAt.createdAt)
  }
  return undefined
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function getStringField(
  value: Record<string, unknown> | null,
  field: string
): string | undefined {
  if (!value) return undefined
  const candidate = value[field]
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : undefined
}

function getBooleanField(
  value: Record<string, unknown> | null,
  field: string
): boolean | undefined {
  if (!value) return undefined
  const candidate = value[field]
  return typeof candidate === "boolean" ? candidate : undefined
}

function inferTerminalStatus(status: string): boolean {
  return TERMINAL_PAYMENT_STATUSES.has(status.toLowerCase())
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
      chatVersion,
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

    const normalizedChatVersion = normalizeChatVersion(chatVersion, messages)
    const latestUserMessageTimestamp = getLatestUserMessageTimestamp(messages)

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
    const providerToolKeyMode: ToolKeyMode = apiKey ? "byok" : "platform"

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

    const initialCapabilityPolicy = resolveCapabilityPolicy({
      modelTools: modelConfig.tools,
      isAuthenticated,
    })
    const capabilities = initialCapabilityPolicy.capabilities
    const shouldInjectSearch = enableSearch && capabilities.search
    const requestId = crypto.randomUUID()

    console.log(
      JSON.stringify({
        _tag: "tool_capability_policy",
        requestId,
        chatId,
        userId,
        model,
        userTier: initialCapabilityPolicy.userTier,
        capabilities: initialCapabilityPolicy.capabilities,
        capabilityReasons: initialCapabilityPolicy.capabilityReasons,
        keyModeReason: initialCapabilityPolicy.keyModeReason,
      })
    )

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
    let resolvedExaKeyMode: ToolKeyMode | undefined
    const { getEffectiveToolKeyWithMode } = await import("@/lib/user-keys")
    const resolvedExa = await getEffectiveToolKeyWithMode("exa", convexToken)
    resolvedExaKey = resolvedExa.key
    resolvedExaKeyMode = resolvedExa.keyMode

    const {
      createOutageTolerantToolBudgetEnforcer,
      createConvexToolLimitStore,
      createRequestLocalToolSoftCap,
      createToolPolicyGuard,
      isPolicyUnavailableError,
      probeToolBudget,
    } = await import("@/lib/tools/policy")
    const toolLimitStore = createConvexToolLimitStore({
      convexToken,
      anonymousId,
    })
    const makePolicyGuard = (keyMode: ToolKeyMode) =>
      createToolPolicyGuard({ store: toolLimitStore, keyMode })

    const builtInPolicyGuard = makePolicyGuard(providerToolKeyMode)
    const mcpPolicyGuard = makePolicyGuard("platform")
    const platformPolicyGuard = makePolicyGuard("platform")
    const exaPolicyGuard =
      resolvedExaKeyMode ? makePolicyGuard(resolvedExaKeyMode) : undefined

    const logOutageTolerantBudgetEvent = (
      source: "third-party" | "content" | "platform" | "mcp",
      event: {
        type: "recovered" | "degraded_allow" | "degraded_block"
        toolName: string
        keyMode: ToolKeyMode
        retryAfterSeconds?: number
        snapshot?: {
          used: number
          remaining: number
          maxCalls: number
        }
        error?: string
      }
    ) => {
      if (event.type === "recovered") {
        console.warn(
          JSON.stringify({
            _tag: "tool_budget_gate_recovered",
            requestId,
            tool: event.toolName,
            source,
            keyMode: event.keyMode,
            action: "resume_policy_enforced_budgeting",
          })
        )
        return
      }

      console.warn(
        JSON.stringify({
          _tag: "tool_budget_gate_degraded",
          requestId,
          tool: event.toolName,
          source,
          keyMode: event.keyMode,
          policyUnavailable: true,
          usedCalls: event.snapshot?.used ?? null,
          remainingCalls: event.snapshot?.remaining ?? null,
          maxCalls: event.snapshot?.maxCalls ?? null,
          retryAfterSeconds: event.retryAfterSeconds ?? null,
          error: event.error ?? null,
          action:
            event.type === "degraded_allow"
              ? "allow_tool_with_request_local_soft_cap"
              : "disable_tool_for_remaining_request",
        })
      )
    }

    const thirdPartyBudgetEnforcer =
      exaPolicyGuard && resolvedExaKeyMode
        ? createOutageTolerantToolBudgetEnforcer({
            enforceToolBudget: (toolName) => exaPolicyGuard.enforceToolBudget(toolName),
            keyMode: resolvedExaKeyMode,
            maxCallsPerTool: PREPARE_STEP_THRESHOLD,
            onEvent: (event) => logOutageTolerantBudgetEvent("third-party", event),
          })
        : undefined

    const contentBudgetEnforcer =
      exaPolicyGuard && resolvedExaKeyMode
        ? createOutageTolerantToolBudgetEnforcer({
            enforceToolBudget: (toolName) => exaPolicyGuard.enforceToolBudget(toolName),
            keyMode: resolvedExaKeyMode,
            maxCallsPerTool: PREPARE_STEP_THRESHOLD,
            onEvent: (event) => logOutageTolerantBudgetEvent("content", event),
          })
        : undefined

    const platformBudgetEnforcer = createOutageTolerantToolBudgetEnforcer({
      enforceToolBudget: (toolName) => platformPolicyGuard.enforceToolBudget(toolName),
      keyMode: "platform",
      maxCallsPerTool: PREPARE_STEP_THRESHOLD,
      onEvent: (event) => logOutageTolerantBudgetEvent("platform", event),
    })

    const mcpBudgetEnforcer = createOutageTolerantToolBudgetEnforcer({
      enforceToolBudget: (toolName) => mcpPolicyGuard.enforceToolBudget(toolName),
      keyMode: "platform",
      maxCallsPerTool: PREPARE_STEP_THRESHOLD,
      onEvent: (event) => logOutageTolerantBudgetEvent("mcp", event),
    })

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
        policyGuard: exaPolicyGuard,
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

    // Payment policy: set to true after intent classification when pay_purchase is denied.
    // The closure is read lazily at execution time by getPlatformTools (defense-in-depth).
    let purchaseBlockedByPolicy = false

    let userCardId: string | undefined
    if (isAuthenticated && capabilities.platform) {
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
        isPurchaseBlocked: () => purchaseBlockedByPolicy,
      })
      platformTools = platformResult.tools
      platformToolMetadata = platformResult.metadata
    }

    // -----------------------------------------------------------------------
    // Payment Intent + State-Driven Tool Policy (Phase 3 Guardrails)
    // -----------------------------------------------------------------------
    let paymentPolicyDenyTools: string[] = []

    if (PAYMENT_STATUS_GUARDRAILS_V1 && isAuthenticated && convexToken) {
      try {
        let chatToolState: Doc<"chatToolState"> | null = null

        // 1. Read canonical payment state (explicitly gated by PAYMENT_CHAT_STATE_V1)
        if (PAYMENT_CHAT_STATE_V1) {
          chatToolState = await fetchQuery(
            api.chatToolState.getByChat,
            { chatId: chatId as Id<"chats"> },
            { token: convexToken }
          )

          // 2. Lazy backfill for legacy chats
          if (!chatToolState && PAYMENT_CHAT_STATE_BACKFILL_V1) {
            try {
              await fetchMutation(
                api.chatToolStateBackfill.hydrateFromToolCallLog,
                { chatId: chatId as Id<"chats"> },
                { token: convexToken }
              )
              chatToolState = await fetchQuery(
                api.chatToolState.getByChat,
                { chatId: chatId as Id<"chats"> },
                { token: convexToken }
              )
            } catch (backfillErr) {
              console.warn(
                JSON.stringify({
                  _tag: "payment_state_backfill_error",
                  requestId,
                  chatId,
                  error: backfillErr instanceof Error ? backfillErr.message : String(backfillErr),
                })
              )
            }
          }
        }

        // 3. Classify payment intent from latest user message
        const latestUserMessage = messages
          .filter((m) => m.role === "user")
          .pop()
        const userMessageText = latestUserMessage?.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ") ?? ""

        const { classifyPaymentIntent } = await import("@/app/api/chat/intent/payment-intent")
        const { computePaymentPolicyOverrides } = await import("@/lib/tools/capability-policy")

        const hasActiveJob = !!chatToolState?.activePurchaseJobId
        const hasAnyJob = !!chatToolState?.latestPurchaseJobId

        const intentResult = classifyPaymentIntent({
          userMessage: userMessageText,
          hasActiveJob,
          hasAnyJob,
          latestStatus: chatToolState?.latestStatus ?? undefined,
          latestStatusIsTerminal: chatToolState?.latestStatusIsTerminal ?? undefined,
        })

        const policyOverrides = computePaymentPolicyOverrides(
          intentResult,
          chatToolState ? { hasActiveJob, hasAnyJob } : null,
          PAYMENT_GUARDRAIL_MODE,
        )

        if (policyOverrides) {
          console.log(
            JSON.stringify({
              _tag: "payment_intent_policy",
              requestId,
              chatId,
              intent: intentResult.intent,
              confidence: intentResult.confidence,
              reason: intentResult.reason,
              policyReason: policyOverrides.reason,
              mode: policyOverrides.mode,
              denyTools: policyOverrides.denyTools ?? [],
              allowTools: policyOverrides.allowTools ?? [],
              hasActiveJob,
              hasAnyJob,
            })
          )

          if (policyOverrides.mode === "enforce" && policyOverrides.denyTools) {
            paymentPolicyDenyTools = policyOverrides.denyTools
          }
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            _tag: "payment_guardrail_error",
            requestId,
            chatId,
            error: err instanceof Error ? err.message : String(err),
          })
        )
      }
    }

    // Apply payment policy deny list to platform tools
    if (paymentPolicyDenyTools.length > 0) {
      for (const toolName of paymentPolicyDenyTools) {
        if (toolName in platformTools) {
          delete (platformTools as Record<string, unknown>)[toolName]
          platformToolMetadata.delete(toolName)
        }
      }
      // Activate defense-in-depth: flag for the lazy isPurchaseBlocked callback
      if (paymentPolicyDenyTools.includes("pay_purchase")) {
        purchaseBlockedByPolicy = true
      }
    }

    const toolPolicyInputs: ToolPolicyInput[] = [
      ...Object.keys(builtInTools).map((toolName) => {
        const meta = builtInToolMetadata.get(toolName)
        return {
          toolName,
          source: meta?.source ?? "builtin",
          capability: "search" as const,
          readOnly: meta?.readOnly,
          destructive: meta?.destructive,
          idempotent: meta?.idempotent,
          openWorld: meta?.openWorld,
        }
      }),
      ...Object.keys(thirdPartyTools).map((toolName) => {
        const meta = thirdPartyToolMetadata.get(toolName)
        return {
          toolName,
          source: meta?.source ?? "third-party",
          capability: "search" as const,
          readOnly: meta?.readOnly,
          destructive: meta?.destructive,
          idempotent: meta?.idempotent,
          openWorld: meta?.openWorld,
        }
      }),
      ...Object.keys(contentTools).map((toolName) => {
        const meta = contentToolMetadata.get(toolName)
        return {
          toolName,
          source: meta?.source ?? "third-party",
          capability: "extract" as const,
          readOnly: meta?.readOnly,
          destructive: meta?.destructive,
          idempotent: meta?.idempotent,
          openWorld: meta?.openWorld,
        }
      }),
      ...Object.keys(platformTools).map((toolName) => {
        const meta = platformToolMetadata.get(toolName)
        return {
          toolName,
          source: meta?.source ?? "platform",
          capability: "platform" as const,
          readOnly: meta?.readOnly,
          destructive: meta?.destructive,
          idempotent: meta?.idempotent,
          openWorld: meta?.openWorld,
        }
      }),
      ...Object.keys(mcpTools).map((toolName) => {
        const info = mcpToolServerMap.get(toolName)
        const policyHintsTrusted = info?.policyHintsTrusted === true
        return {
          toolName,
          source: "mcp" as const,
          capability: "mcp" as const,
          riskHintsTrusted: policyHintsTrusted,
          readOnly: policyHintsTrusted ? info?.readOnly : undefined,
          destructive: policyHintsTrusted ? info?.destructive : undefined,
          idempotent: policyHintsTrusted ? info?.idempotent : undefined,
          openWorld: policyHintsTrusted ? info?.openWorld : undefined,
        }
      }),
    ]

    const toolPolicy = resolveCapabilityPolicy({
      modelTools: modelConfig.tools,
      isAuthenticated,
      keyMode: resolvedExaKeyMode,
      tools: toolPolicyInputs,
    })

    const summarizeReasonCounts = (
      decisions: ToolPolicyDecision[],
      selector: (decision: ToolPolicyDecision) => string
    ) => {
      const counts: Record<string, number> = {}
      for (const decision of decisions) {
        const reason = selector(decision)
        counts[reason] = (counts[reason] ?? 0) + 1
      }
      return counts
    }

    console.log(
      JSON.stringify({
        _tag: "tool_policy_matrix",
        requestId,
        chatId,
        userId,
        model,
        userTier: toolPolicy.userTier,
        keyMode: toolPolicy.keyMode ?? null,
        keyModeReason: toolPolicy.keyModeReason,
        capabilities: toolPolicy.capabilities,
        capabilityReasons: toolPolicy.capabilityReasons,
        totalTools: toolPolicy.toolDecisions.length,
        earlyAllowedCount: toolPolicy.earlyToolNames.length,
        lateAllowedCount: toolPolicy.lateToolNames.length,
        earlyReasonCounts: summarizeReasonCounts(
          toolPolicy.toolDecisions,
          (decision) => decision.earlyReasonCode
        ),
        lateReasonCounts: summarizeReasonCounts(
          toolPolicy.toolDecisions,
          (decision) => decision.lateReasonCode
        ),
      })
    )

    builtInTools = filterToolSetByPolicy(builtInTools, toolPolicy)
    thirdPartyTools = filterToolSetByPolicy(thirdPartyTools, toolPolicy)
    contentTools = filterToolSetByPolicy(contentTools, toolPolicy)
    platformTools = filterToolSetByPolicy(platformTools, toolPolicy)
    mcpTools = filterToolSetByPolicy(mcpTools, toolPolicy)

    builtInToolMetadata = filterMetadataMapByPolicy(builtInToolMetadata, toolPolicy)
    thirdPartyToolMetadata = filterMetadataMapByPolicy(
      thirdPartyToolMetadata,
      toolPolicy
    )
    contentToolMetadata = filterMetadataMapByPolicy(contentToolMetadata, toolPolicy)
    platformToolMetadata = filterMetadataMapByPolicy(
      platformToolMetadata,
      toolPolicy
    )
    mcpToolServerMap = filterMetadataMapByPolicy(mcpToolServerMap, toolPolicy)

    // Wrap MCP tools with timeout, timing, truncation, and envelope.
    // Single wrapper handles all Layer 3 concerns — follows the Exa gold
    // standard pattern (lib/tools/third-party.ts:82-119).
    // Replaces the previous wrapToolsWithTruncation(mcpTools) call.
    const traceCollector = new ToolTraceCollector()

    if (Object.keys(mcpTools).length > 0) {
      mcpTools = wrapMcpTools(mcpTools, {
        toolServerMap: mcpToolServerMap,
        traceCollector,
        requestId,
        enforceToolBudget: async (toolName) => {
          await mcpBudgetEnforcer(toolName)
        },
      }) as ToolSet
    }

    // Wrap non-builtin tools with tracing (Layer 2 + Layer 4).
    // Records durationMs and resultSizeBytes into traceCollector so
    // onStepFinish and onFinish can read them for ALL tool types.
    const { wrapToolsWithTracing } = await import("@/lib/tools/utils")
    if (Object.keys(thirdPartyTools).length > 0) {
      thirdPartyTools = wrapToolsWithTracing(
        thirdPartyTools,
        traceCollector,
        requestId,
        async (toolName) => {
          if (!thirdPartyBudgetEnforcer) return
          await thirdPartyBudgetEnforcer(toolName)
        },
        thirdPartyToolMetadata
      )
    }
    if (Object.keys(contentTools).length > 0) {
      contentTools = wrapToolsWithTracing(
        contentTools,
        traceCollector,
        requestId,
        async (toolName) => {
          if (!contentBudgetEnforcer) return
          await contentBudgetEnforcer(toolName)
        },
        contentToolMetadata
      )
    }
    if (Object.keys(platformTools).length > 0) {
      platformTools = wrapToolsWithTracing(
        platformTools,
        traceCollector,
        requestId,
        async (toolName) => {
          await platformBudgetEnforcer(toolName)
        },
        platformToolMetadata
      )
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
    const toolLayers: ToolLayerMap = {
      "built-in": builtInTools,
      "third-party-search": thirdPartyTools,
      "content-extraction": contentTools,
      platform: platformTools,
      mcp: mcpTools,
    }

    const namingResult = enforceToolNamingGovernance(toolLayers)
    if (namingResult.invalid.length > 0) {
      for (const invalid of namingResult.invalid) {
        console.warn(
          JSON.stringify({
            _tag: "tool_name_invalid",
            requestId,
            tool: invalid.toolKey,
            layer: invalid.layer,
            reason: invalid.reason,
            action: "drop_invalid_tool",
          })
        )
      }
    }
    if (namingResult.collisions.length > 0) {
      for (const collision of namingResult.collisions) {
        const droppedLayers = collision.owners.filter(
          (layer) => layer !== collision.winner
        )
        console.warn(
          JSON.stringify({
            _tag: "tool_name_collision",
            requestId,
            tool: collision.toolKey,
            layers: collision.owners,
            winner: collision.winner,
            droppedLayers,
            action: "keep_winner_drop_losers",
          })
        )
      }
    }

    builtInTools = (namingResult.sanitizedLayers["built-in"] ?? {}) as ToolSet
    thirdPartyTools = (namingResult.sanitizedLayers["third-party-search"] ??
      {}) as ToolSet
    contentTools = (namingResult.sanitizedLayers["content-extraction"] ??
      {}) as ToolSet
    platformTools = (namingResult.sanitizedLayers.platform ?? {}) as ToolSet
    mcpTools = (namingResult.sanitizedLayers.mcp ?? {}) as ToolSet

    const filterMetadataByTools = <T>(
      metadata: ReadonlyMap<string, T>,
      tools: ToolSet
    ) =>
      new Map(
        Array.from(metadata.entries()).filter(([name]) =>
          Object.prototype.hasOwnProperty.call(tools, name)
        )
      )

    builtInToolMetadata = filterMetadataByTools(builtInToolMetadata, builtInTools)
    thirdPartyToolMetadata = filterMetadataByTools(
      thirdPartyToolMetadata,
      thirdPartyTools
    )
    contentToolMetadata = filterMetadataByTools(contentToolMetadata, contentTools)
    platformToolMetadata = filterMetadataByTools(
      platformToolMetadata,
      platformTools
    )
    mcpToolServerMap = new Map(
      Array.from(mcpToolServerMap.entries()).filter(([name]) =>
        Object.prototype.hasOwnProperty.call(mcpTools, name)
      )
    )

    const builtInToolNames = new Set(Object.keys(builtInTools))
    const exhaustedBuiltInTools = new Set<string>()
    const degradedBuiltInTools = new Set<string>()
    const degradedBuiltInSoftCap = createRequestLocalToolSoftCap({
      maxCallsPerTool: PREPARE_STEP_THRESHOLD,
    })

    // Provider-native (Layer 1) tools are provider-executed and do not expose a
    // local execute() hook for per-call preflight enforcement. Compensating
    // control: probe budget during prepareStep (consume:false) and account
    // actual usage in onStepFinish. This preserves centralized budget policy
    // semantics, with a bounded request-local soft cap when policy is unavailable.
    const isBuiltInToolBudgetAllowed = async (toolName: string): Promise<boolean> => {
      if (!builtInToolNames.has(toolName)) return true
      if (exhaustedBuiltInTools.has(toolName)) return false

      try {
        const probe = await probeToolBudget({
          store: toolLimitStore,
          keyMode: providerToolKeyMode,
          toolName,
        })
        if (probe.allowed) {
          if (degradedBuiltInTools.delete(toolName)) {
            console.warn(
              JSON.stringify({
                _tag: "tool_budget_gate_recovered",
                requestId,
                tool: toolName,
                source: "builtin",
                keyMode: providerToolKeyMode,
                action: "resume_policy_enforced_budgeting",
              })
            )
          }
          return true
        }
        degradedBuiltInTools.delete(toolName)
        exhaustedBuiltInTools.add(toolName)
        console.warn(
          JSON.stringify({
            _tag: "tool_budget_gate",
            requestId,
            tool: toolName,
            source: "builtin",
            keyMode: providerToolKeyMode,
            retryAfterSeconds: probe.retryAfterSeconds ?? null,
            action: "disable_tool_for_remaining_steps",
          })
        )
        return false
      } catch (error) {
        if (isPolicyUnavailableError(error)) {
          degradedBuiltInTools.add(toolName)
          const softCap = degradedBuiltInSoftCap.getSnapshot(toolName)
          const allowed = softCap.remaining > 0
          console.warn(
            JSON.stringify({
              _tag: "tool_budget_gate_degraded",
              requestId,
              tool: toolName,
              source: "builtin",
              keyMode: providerToolKeyMode,
              policyUnavailable: true,
              usedCalls: softCap.used,
              remainingCalls: softCap.remaining,
              maxCalls: softCap.maxCalls,
              error: error.message,
              action: allowed
                ? "allow_tool_with_request_local_soft_cap"
                : "disable_tool_until_policy_recovers",
            })
          )
          return allowed
        }
        exhaustedBuiltInTools.add(toolName)
        console.warn(
          JSON.stringify({
            _tag: "tool_budget_gate_error",
            requestId,
            tool: toolName,
            source: "builtin",
            keyMode: providerToolKeyMode,
            error: error instanceof Error ? error.message : String(error),
            action: "disable_tool_fail_closed",
          })
        )
        return false
      }
    }

    const searchTools = { ...builtInTools, ...thirdPartyTools }
    const allTools = { ...searchTools, ...contentTools, ...platformTools, ...mcpTools } as ToolSet

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
    const isTokenEfficient =
      process.env.ANTHROPIC_TOKEN_EFFICIENT_TOOLS !== "false"
    const requestHeaders: Record<string, string> = {}

    if (provider === "anthropic" && hasAnyTools && isTokenEfficient) {
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
    const toolMetadataByName = buildToolInvocationMetadataByName({
      nonMcpMetadata: allToolMetadata,
      mcpToolServerMap,
    })
    let enrichedSystemPrompt = effectiveSystemPrompt
    if (isAuthenticated && userAddresses.length > 0) {
      enrichedSystemPrompt += formatAddressContext(userAddresses)
    }

    const streamStartMs = Date.now()
    let stepCounter = 0
    let toolMetadataByCallId: ToolInvocationMetadataByCallId = {}

    // Track reasoning timing for messageMetadata persistence.
    // The first reasoning chunk records a start timestamp; when text-delta
    // arrives (reasoning is done) or onFinish fires, we compute elapsed ms.
    let reasoningStartMs: number | null = null
    let reasoningDurationMs: number | null = null
    let loggedLateStepPolicy = false

    const result = streamText({
      model: aiModel,
      system: enrichedSystemPrompt,
      messages: modelMessages,
      tools: allTools,
      stopWhen: stepCountIs(maxSteps),

      // Centralized step gating from the capability policy resolver.
      // After PREPARE_STEP_THRESHOLD, only late-step-safe tools remain
      // (currently read_only risk class). Unknown risk fails closed.
      prepareStep: hasAnyTools
        ? async ({ stepNumber }) => {
            const isLateStep = stepNumber > PREPARE_STEP_THRESHOLD
            const policyToolsForStep = getActiveToolsForStep(
              toolPolicy,
              stepNumber,
              PREPARE_STEP_THRESHOLD
            )
            const budgetAllowedTools: string[] = []
            for (const toolName of policyToolsForStep ?? []) {
              if (!builtInToolNames.has(toolName)) {
                budgetAllowedTools.push(toolName)
                continue
              }
              if (await isBuiltInToolBudgetAllowed(toolName)) {
                budgetAllowedTools.push(toolName)
              }
            }

            if (isLateStep && !loggedLateStepPolicy) {
              loggedLateStepPolicy = true
              console.log(
                JSON.stringify({
                  _tag: "tool_policy_step_gate",
                  requestId,
                  chatId,
                  userId,
                  model,
                  stepNumber,
                  threshold: PREPARE_STEP_THRESHOLD,
                  earlyToolCount: toolPolicy.earlyToolNames.length,
                  lateToolCount: budgetAllowedTools.length,
                  blockedCount:
                    toolPolicy.earlyToolNames.length - budgetAllowedTools.length,
                })
              )
            }

            return { activeTools: budgetAllowedTools }
          }
        : undefined,

      // Per-step structured tracing.
      // Captures tool name, duration, token usage, and success per step.
      // This data feeds into the existing toolCallLog for trajectory analysis
      // and future trace-based evaluation.
      onStepFinish: async ({ toolCalls, toolResults, usage, finishReason }) => {
        stepCounter++
        if (toolCalls.length === 0) return

        for (const call of toolCalls) {
          if (!builtInToolNames.has(call.toolName)) continue
          try {
            await builtInPolicyGuard.enforceToolBudget(call.toolName)
            if (degradedBuiltInTools.delete(call.toolName)) {
              console.warn(
                JSON.stringify({
                  _tag: "tool_budget_post_accounting_recovered",
                  requestId,
                  tool: call.toolName,
                  source: "builtin",
                  keyMode: providerToolKeyMode,
                  action: "resume_policy_enforced_budgeting",
                })
              )
            }
          } catch (error) {
            if (isPolicyUnavailableError(error)) {
              degradedBuiltInTools.add(call.toolName)
              const softCap = degradedBuiltInSoftCap.recordCall(call.toolName)
              console.warn(
                JSON.stringify({
                  _tag: "tool_budget_post_accounting_degraded",
                  requestId,
                  tool: call.toolName,
                  source: "builtin",
                  keyMode: providerToolKeyMode,
                  policyUnavailable: true,
                  usedCalls: softCap.used,
                  remainingCalls: softCap.remaining,
                  maxCalls: softCap.maxCalls,
                  error: error.message,
                  action:
                    softCap.remaining > 0
                      ? "allow_tool_with_request_local_soft_cap"
                      : "disable_tool_until_policy_recovers",
                })
              )
              continue
            }
            exhaustedBuiltInTools.add(call.toolName)
            console.warn(
              JSON.stringify({
                _tag: "tool_budget_post_accounting_denied",
                requestId,
                tool: call.toolName,
                source: "builtin",
                keyMode: providerToolKeyMode,
                error: error instanceof Error ? error.message : String(error),
                action: "disable_tool_for_remaining_steps",
              })
            )
          }
        }

        for (const call of toolCalls) {
          const result = toolResults.find(
            (r) => r.toolCallId === call.toolCallId
          )
          const success = result
            ? !(result as { isError?: boolean }).isError
            : false
          const meta = allToolMetadata.get(call.toolName)
          const trace = traceCollector.get(call.toolCallId)

          // Structured JSON log — parseable by Vercel log drain and grep.
          // Uses _tag for machine filtering without affecting human readability.
          console.log(
            JSON.stringify({
              _tag: "tool_trace",
              requestId,
              chatId,
              userId,
              step: stepCounter,
              tool: meta?.displayName ?? call.toolName,
              source: meta?.source ?? "unknown",
              success,
              durationMs: trace?.durationMs ?? null,
              estimatedCostPer1k: meta?.estimatedCostPer1k ?? null,
              errorCode: trace?.errorCode ?? null,
              retryAfterSeconds: trace?.retryAfterSeconds ?? null,
              budgetKeyMode: trace?.budgetKeyMode ?? null,
              budgetDenied: trace?.budgetDenied ?? null,
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
              input: scrubForAnalytics(messages),
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
        if (steps) {
          const resolvedByCallId: ToolInvocationMetadataByCallId = {}
          for (const step of steps) {
            for (const toolCall of step.toolCalls ?? []) {
              const resolved = toolMetadataByName[toolCall.toolName]
              if (resolved) {
                resolvedByCallId[toolCall.toolCallId] = resolved
              }
            }
          }
          toolMetadataByCallId = resolvedByCallId
        }

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
            `tokenEfficient: ${isTokenEfficient}`
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
              input: scrubForAnalytics(messages),
              output: scrubForAnalytics(text),
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
                    const trace = traceCollector.get(toolCall.toolCallId)
                    const stateMutationKey =
                      toolCall.toolName === "pay_purchase" ||
                      toolCall.toolName === "pay_status"
                        ? `${requestId}:${toolCall.toolCallId}:${toolCall.toolName}`
                        : undefined

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
                        chatVersion: normalizedChatVersion,
                        // Phase C: Observability enrichment
                        durationMs: trace?.durationMs ?? undefined,
                        errorCode: trace?.errorCode,
                        retryAfterSeconds: trace?.retryAfterSeconds,
                        budgetKeyMode: trace?.budgetKeyMode,
                        budgetDenied: trace?.budgetDenied,
                        requestId,
                        stateMutationKey,
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

                const previewData = toolResult?.output
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
                    requestId,
                    errorCode: trace?.errorCode,
                    retryAfterSeconds: trace?.retryAfterSeconds,
                    budgetKeyMode: trace?.budgetKeyMode,
                    budgetDenied: trace?.budgetDenied,
                    chatVersion: normalizedChatVersion,
                    toolKey: toolCall.toolName,
                  },
                  { token: convexToken }
                ).catch((err: unknown) => {
                  console.warn(JSON.stringify({
                    _tag: "tool_call_log_write_failed",
                    requestId,
                    chatId,
                    toolCallId: toolCall.toolCallId,
                    toolName: serverInfo.displayName,
                    source: "mcp",
                    stepNumber: finishStepNumber,
                    error: err instanceof Error ? err.message : String(err),
                  }))
                })
              }
            }
          }
        }

        // Audit log: persist built-in + third-party tool calls (fire-and-forget).
        // Identifies non-MCP tools by checking if the tool name is NOT in mcpToolServerMap.
        if (convexToken && steps) {
          if (allToolMetadata.size > 0) {
            let finishStepNumber = 0

            for (const step of steps) {
              finishStepNumber++

              if (step.toolCalls) {
                for (const toolCall of step.toolCalls) {
                  // Skip MCP tools (already logged above)
                  if (mcpToolServerMap.get(toolCall.toolName)) continue

                  const meta = allToolMetadata.get(toolCall.toolName)
                  if (!meta) continue // Unknown tool — skip

                  const toolResult = step.toolResults?.find(
                    (r: { toolCallId: string }) =>
                      r.toolCallId === toolCall.toolCallId
                  )
                  const success = toolResult
                    ? !(toolResult as { isError?: boolean }).isError
                    : false

                  const previewData = toolResult?.output

                  const trace = traceCollector.get(toolCall.toolCallId)

                  void fetchMutation(
                    api.toolCallLog.log,
                    {
                      chatId: chatId as Id<"chats">,
                      toolName: meta.displayName,
                      toolCallId: toolCall.toolCallId,
                      inputPreview: JSON.stringify(toolCall.input).slice(0, 500),
                      outputPreview: previewData
                        ? JSON.stringify(previewData).slice(0, 500)
                        : undefined,
                      success,
                      durationMs: trace?.durationMs,
                      source: meta.source,
                      serviceName: meta.serviceName,
                      // Phase C: Observability enrichment
                      stepNumber: finishStepNumber,
                      inputTokens: step.usage?.inputTokens,
                      outputTokens: step.usage?.outputTokens,
                      resultSizeBytes: trace?.resultSizeBytes,
                      requestId,
                      errorCode: trace?.errorCode,
                      retryAfterSeconds: trace?.retryAfterSeconds,
                      budgetKeyMode: trace?.budgetKeyMode,
                      budgetDenied: trace?.budgetDenied,
                      chatVersion: normalizedChatVersion,
                      toolKey: toolCall.toolName,
                      stateMutationKey:
                        toolCall.toolName === "pay_purchase" ||
                        toolCall.toolName === "pay_status"
                          ? `${requestId}:${toolCall.toolCallId}:${toolCall.toolName}`
                          : undefined,
                    },
                    { token: convexToken }
                  ).catch((err: unknown) => {
                    console.warn(JSON.stringify({
                      _tag: "tool_call_log_write_failed",
                      requestId,
                      chatId,
                      toolCallId: toolCall.toolCallId,
                      toolName: meta.displayName,
                      source: meta.source,
                      stepNumber: finishStepNumber,
                      error: err instanceof Error ? err.message : String(err),
                    }))
                  })

                  if (!PAYMENT_CHAT_STATE_V1 || !success) continue

                  if (toolCall.toolName === "pay_purchase") {
                    const outputRecord = getRecord(toolResult?.output)
                    const inputRecord = getRecord(toolCall.input)
                    const jobId = getStringField(outputRecord, "jobId")
                    const url = getStringField(inputRecord, "url")
                    if (!jobId || !url) continue

                    const mutationKey = `${requestId}:${toolCall.toolCallId}:pay_purchase`
                    void fetchMutation(
                      api.chatToolState.upsertFromPurchase,
                      {
                        chatId: chatId as Id<"chats">,
                        jobId,
                        url,
                        chatVersion: normalizedChatVersion,
                        sourceMessageTimestamp: latestUserMessageTimestamp,
                        mutationKey,
                        toolCallId: toolCall.toolCallId,
                        requestId,
                      },
                      { token: convexToken }
                    ).catch((err: unknown) => {
                      console.warn(JSON.stringify({
                        _tag: "payment_state_write_failed",
                        requestId,
                        chatId,
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        mutation: "upsertFromPurchase",
                        error: err instanceof Error ? err.message : String(err),
                      }))
                    })
                  }

                  if (toolCall.toolName === "pay_status") {
                    const outputRecord = getRecord(toolResult?.output)
                    const jobId = getStringField(outputRecord, "jobId")
                    const statusText = getStringField(outputRecord, "status")
                    if (!jobId || !statusText) continue

                    const isTerminalExplicit = getBooleanField(
                      outputRecord,
                      "isTerminal"
                    )
                    const isTerminal =
                      isTerminalExplicit ?? inferTerminalStatus(statusText)
                    const mutationKey = `${requestId}:${toolCall.toolCallId}:pay_status`

                    void fetchMutation(
                      api.chatToolState.upsertFromStatus,
                      {
                        chatId: chatId as Id<"chats">,
                        jobId,
                        status: statusText,
                        isTerminal,
                        chatVersion: normalizedChatVersion,
                        mutationKey,
                        toolCallId: toolCall.toolCallId,
                        requestId,
                      },
                      { token: convexToken }
                    ).catch((err: unknown) => {
                      console.warn(JSON.stringify({
                        _tag: "payment_state_write_failed",
                        requestId,
                        chatId,
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        mutation: "upsertFromStatus",
                        error: err instanceof Error ? err.message : String(err),
                      }))
                    })
                  }
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
        if (part.type === "start") {
          return buildStartToolInvocationStreamMetadata(toolMetadataByName)
        }
        if (part.type === "finish") {
          return buildFinishToolInvocationStreamMetadata({
            toolMetadataByCallId,
            reasoningDurationMs,
          })
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
