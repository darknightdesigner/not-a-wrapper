// convex/chatToolStateBackfill.ts
// Lazy-backfill logic for legacy chats that predate the chatToolState table.
// Hydrates a best-effort chatToolState row from historical toolCallLog entries.

import { v } from "convex/values"
import { mutation } from "./_generated/server"

// =============================================================================
// Constants
// =============================================================================

/**
 * Tool names that represent payment-related platform operations.
 * toolCallLog stores display names (e.g. "Purchase") not canonical keys
 * (e.g. "pay_purchase"), so we match both forms.
 */
const PURCHASE_TOOL_NAMES = ["pay_purchase", "Purchase"] as const
const STATUS_TOOL_NAMES = ["pay_status", "Purchase Status"] as const
const ALL_PAYMENT_TOOL_NAMES: readonly string[] = [
  ...PURCHASE_TOOL_NAMES,
  ...STATUS_TOOL_NAMES,
]

// =============================================================================
// Helpers
// =============================================================================

/**
 * Attempt to extract a jobId from a toolCallLog outputPreview string.
 * The outputPreview is a truncated JSON string that may contain a jobId field.
 * Returns undefined if extraction fails — callers treat this as ambiguous.
 */
function extractJobId(outputPreview: string | undefined): string | undefined {
  if (!outputPreview) return undefined
  try {
    const parsed = JSON.parse(outputPreview)
    // Direct field access — covers { jobId: "..." } and nested shapes
    if (typeof parsed.jobId === "string" && parsed.jobId.length > 0) {
      return parsed.jobId
    }
    // Some outputs nest under result/data
    if (typeof parsed.result?.jobId === "string" && parsed.result.jobId.length > 0) {
      return parsed.result.jobId
    }
    if (typeof parsed.data?.jobId === "string" && parsed.data.jobId.length > 0) {
      return parsed.data.jobId
    }
  } catch {
    // outputPreview may be truncated mid-JSON — not parseable. That's expected.
  }
  return undefined
}

/**
 * Attempt to extract a status string from a toolCallLog outputPreview.
 * Returns undefined if extraction fails.
 */
function extractStatus(outputPreview: string | undefined): string | undefined {
  if (!outputPreview) return undefined
  try {
    const parsed = JSON.parse(outputPreview)
    if (typeof parsed.status === "string" && parsed.status.length > 0) {
      return parsed.status
    }
    if (typeof parsed.result?.status === "string" && parsed.result.status.length > 0) {
      return parsed.result.status
    }
    if (typeof parsed.data?.status === "string" && parsed.data.status.length > 0) {
      return parsed.data.status
    }
  } catch {
    // Truncated JSON — cannot extract status
  }
  return undefined
}

/** Terminal purchase statuses. A terminal status means the purchase lifecycle is complete. */
const TERMINAL_STATUSES = new Set([
  "completed",
  "delivered",
  "cancelled",
  "refunded",
  "failed",
  "expired",
])

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase())
}

function isPurchaseTool(toolName: string): boolean {
  return (PURCHASE_TOOL_NAMES as readonly string[]).includes(toolName)
}

function isStatusTool(toolName: string): boolean {
  return (STATUS_TOOL_NAMES as readonly string[]).includes(toolName)
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Hydrate chatToolState from toolCallLog entries for a legacy chat.
 *
 * - Reads the most recent platform tool entries (pay_purchase, pay_status,
 *   Purchase, Purchase Status) from toolCallLog for the given chatId.
 * - Derives best-effort state (latestPurchaseJobId, status, isTerminal).
 * - Writes a new chatToolState row with provenance marking
 *   (lastMutationKey prefix: "backfill:").
 * - IDEMPOTENT: if chatToolState already exists, returns null (skip).
 * - FAIL-SAFE: if backfill cannot determine an active job unambiguously,
 *   does not create a row that would enable pay_purchase. An ambiguous
 *   backfill must not enable destructive tools.
 *
 * Only runs when PAYMENT_CHAT_STATE_BACKFILL_V1 is enabled
 * (checked by the caller, not here).
 */
export const hydrateFromToolCallLog = mutation({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, { chatId }) => {
    // 1. Auth + ownership check (same pattern as chatToolState.ts)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique()

    if (!user) throw new Error("User not found")

    const chat = await ctx.db.get(chatId)
    if (!chat) throw new Error("Chat not found")
    if (chat.userId !== user._id) throw new Error("Not authorized")

    // 2. Check if chatToolState already exists — if yes, return early (idempotent)
    const existingState = await ctx.db
      .query("chatToolState")
      .withIndex("by_user_chat", (q: any) =>
        q.eq("userId", user._id).eq("chatId", chatId)
      )
      .unique()

    if (existingState) {
      return null
    }

    // 3. Query toolCallLog for this chatId, filter for platform payment tools.
    //    Ordered desc by _creationTime to get most recent first.
    const allLogs = await ctx.db
      .query("toolCallLog")
      .withIndex("by_chat", (q: any) => q.eq("chatId", chatId))
      .order("desc")
      .collect()

    // Filter to successful payment tool calls only
    const paymentLogs = allLogs.filter(
      (log) =>
        log.success &&
        ALL_PAYMENT_TOOL_NAMES.includes(log.toolName)
    )

    // No payment tool calls found — nothing to backfill
    if (paymentLogs.length === 0) {
      return null
    }

    // 4. Derive state from entries.
    //    Strategy: walk from most recent to oldest to find the latest purchase,
    //    then only consider status calls that reference the same jobId.

    // Find the most recent purchase call
    const latestPurchase = paymentLogs.find((log) => isPurchaseTool(log.toolName))
    // Extract jobId from the latest purchase
    const purchaseJobId = latestPurchase
      ? extractJobId(latestPurchase.outputPreview)
      : undefined

    // FAIL-SAFE: If we found purchase log entries but cannot extract a jobId,
    // the data is ambiguous. Do not create state that could enable pay_purchase.
    if (latestPurchase && !purchaseJobId) {
      return null
    }

    // Extract status only when it references the same jobId as latest purchase.
    // This prevents cross-job contamination (e.g. status for job_A affecting job_B).
    let derivedStatus: string | undefined
    if (purchaseJobId) {
      const latestStatusForPurchase = paymentLogs.find((log) => {
        if (!isStatusTool(log.toolName)) return false
        return extractJobId(log.outputPreview) === purchaseJobId
      })

      derivedStatus = latestStatusForPurchase
        ? extractStatus(latestStatusForPurchase.outputPreview)
        : undefined
    } else {
      // No purchase context available; keep best-effort status-only hydration.
      const latestStatusCall = paymentLogs.find((log) => isStatusTool(log.toolName))
      derivedStatus = latestStatusCall
        ? extractStatus(latestStatusCall.outputPreview)
        : undefined
    }

    // If there are no purchase entries and no extractable status, nothing useful to backfill.
    if (!purchaseJobId && !derivedStatus) {
      return null
    }

    // Determine terminal status
    const isTerminal = derivedStatus ? isTerminalStatus(derivedStatus) : undefined

    // Determine activePurchaseJobId:
    // - If status is terminal for the same jobId, the job is done.
    // - If status is non-terminal for the same jobId, the job is active.
    // - If we have a purchase jobId but no correlated status, assume active
    //   (safety-first: blocks accidental duplicate purchases on legacy chats).
    let activePurchaseJobId: string | undefined = undefined

    if (purchaseJobId) {
      if (derivedStatus) {
        // We have correlated status for this purchase jobId.
        activePurchaseJobId = isTerminal ? undefined : purchaseJobId
      } else {
        // No correlated status found; keep the latest purchase active by default.
        activePurchaseJobId = purchaseJobId
      }
    }
    // If we have derivedStatus but no purchaseJobId — leave undefined.

    // 5. Create the chatToolState row with backfill provenance
    const now = Date.now()

    const rowId = await ctx.db.insert("chatToolState", {
      chatId,
      userId: user._id,
      chatVersion: 0, // Backfilled, not from a real version
      activePurchaseJobId,
      latestPurchaseJobId: purchaseJobId,
      latestPurchaseUrl: undefined,
      latestStatus: derivedStatus,
      latestStatusIsTerminal: isTerminal,
      sourceMessageTimestamp: undefined, // Not available from backfill
      lastMutationKey: `backfill:${chatId}:${now}`,
      lastToolCallId: undefined,
      lastRequestId: undefined,
      updatedAt: now,
    })

    // 6. Return the created row id
    return rowId
  },
})
