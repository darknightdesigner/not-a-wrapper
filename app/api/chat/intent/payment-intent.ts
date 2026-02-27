// app/api/chat/intent/payment-intent.ts

export type PaymentIntentClass = "status_check" | "new_purchase" | "unknown"

export type PaymentIntentResult = {
  intent: PaymentIntentClass
  confidence: "high" | "medium" | "low"
  reason: string
}

export type PaymentIntentContext = {
  /** Latest user message text */
  userMessage: string
  /** Whether there's an active (non-terminal) purchase job */
  hasActiveJob: boolean
  /** Whether any purchase job exists in the chat */
  hasAnyJob: boolean
  /** The latest status if available */
  latestStatus?: string
  /** Whether the latest status is terminal */
  latestStatusIsTerminal?: boolean
}

// ── Keyword patterns ────────────────────────────────────────

const STATUS_KEYWORDS = [
  "status",
  "check",
  "where is",
  "track",
  "update",
  "how is",
  "progress",
  "what happened",
  "delivery",
  "shipped",
  "arrived",
  "eta",
] as const

const PURCHASE_KEYWORDS = [
  "buy",
  "purchase",
  "order",
  "get me",
  "i want",
  "add to cart",
  "checkout",
] as const

function normalizeMessage(message: string): string {
  return message.toLowerCase().trim()
}

function containsAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => text.includes(kw))
}

// ── Classifier ──────────────────────────────────────────────

/**
 * Classify the payment intent from the user's latest message and chat state.
 * This is a deterministic, server-side classifier -- not model-dependent.
 */
export function classifyPaymentIntent(
  ctx: PaymentIntentContext
): PaymentIntentResult {
  const normalized = normalizeMessage(ctx.userMessage)
  const hasStatusKeyword = containsAny(normalized, STATUS_KEYWORDS)
  const hasPurchaseKeyword = containsAny(normalized, PURCHASE_KEYWORDS)

  // Edge case: both status and purchase keywords with an active job -> safety-first
  if (hasStatusKeyword && hasPurchaseKeyword && ctx.hasActiveJob) {
    return {
      intent: "status_check",
      confidence: "high",
      reason: "ambiguous_with_active_job_safety_first",
    }
  }

  // Status check: status keywords + existing job context
  if (hasStatusKeyword && (ctx.hasActiveJob || ctx.hasAnyJob)) {
    return {
      intent: "status_check",
      confidence: "high",
      reason: "status_keywords_with_existing_job",
    }
  }

  // New purchase with active job -> reclassify as status_check (safety-first)
  if (hasPurchaseKeyword && ctx.hasActiveJob) {
    return {
      intent: "status_check",
      confidence: "medium",
      reason: "purchase_intent_overridden_by_active_job",
    }
  }

  // New purchase: explicit purchase intent without active job
  if (hasPurchaseKeyword && !ctx.hasActiveJob) {
    return {
      intent: "new_purchase",
      confidence: "high",
      reason: "explicit_purchase_intent",
    }
  }

  // Status keywords without any job context -> unknown (no job to check)
  if (hasStatusKeyword && !ctx.hasActiveJob && !ctx.hasAnyJob) {
    return {
      intent: "unknown",
      confidence: "low",
      reason: "status_keywords_but_no_job_context",
    }
  }

  // Default: unknown
  return {
    intent: "unknown",
    confidence: "low",
    reason: "no_matching_keywords",
  }
}
