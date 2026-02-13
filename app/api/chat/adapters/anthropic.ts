import type { UIMessage } from "ai"
import {
  createEmptyStats,
  detectSourceProvider,
  incrementStat,
  isToolPart,
  isToolPartFinal,
  stripCallProviderMetadata,
  type AdaptationResult,
  type AdaptationWarning,
  type ProviderHistoryAdapter,
} from "./types"

function isToolInvocationPart(part: Record<string, unknown>): boolean {
  const state = typeof part.state === "string" ? part.state : ""
  return state.startsWith("input-") || "input" in part
}

function isToolResultPart(part: Record<string, unknown>): boolean {
  const state = typeof part.state === "string" ? part.state : ""
  return state.startsWith("output-") || "output" in part
}

function warnForOrphanedToolPairs(
  warnings: AdaptationWarning[],
  messageIndex: number,
  parts: Array<Record<string, unknown>>,
): void {
  const invocationCounts = new Map<string, number>()
  const resultCounts = new Map<string, number>()

  for (const part of parts) {
    const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : null
    if (!toolCallId) continue

    if (isToolInvocationPart(part)) {
      invocationCounts.set(toolCallId, (invocationCounts.get(toolCallId) ?? 0) + 1)
    }
    if (isToolResultPart(part)) {
      resultCounts.set(toolCallId, (resultCounts.get(toolCallId) ?? 0) + 1)
    }
  }

  for (const [toolCallId, invocationCount] of invocationCounts) {
    const resultCount = resultCounts.get(toolCallId) ?? 0
    if (invocationCount !== resultCount) {
      warnings.push({
        code: "incomplete_triple_dropped",
        messageIndex,
        detail: `Orphaned tool pair detected for toolCallId "${toolCallId}" (${invocationCount} invocation(s), ${resultCount} result(s))`,
      })
    }
  }

  for (const [toolCallId, resultCount] of resultCounts) {
    const invocationCount = invocationCounts.get(toolCallId) ?? 0
    if (invocationCount === 0 && resultCount > 0) {
      warnings.push({
        code: "incomplete_triple_dropped",
        messageIndex,
        detail: `Orphaned tool result detected for toolCallId "${toolCallId}" (${resultCount} result(s), no invocation)`,
      })
    }
  }
}

export const anthropicAdapter: ProviderHistoryAdapter = {
  providerId: "anthropic",
  metadata: {
    droppedPartTypes: new Set(["step-start"]),
    transformedPartTypes: new Set(),
    tier: "standard",
    description: "Anthropic near-passthrough - API auto-manages thinking lifecycle",
  },
  async adaptMessages(messages, _context): Promise<AdaptationResult> {
    const totalPartsOriginal = messages.reduce((sum, message) => sum + message.parts.length, 0)
    const stats = createEmptyStats(messages.length, totalPartsOriginal)
    const warnings: AdaptationWarning[] = []
    const adapted: UIMessage[] = []

    for (const [messageIndex, message] of messages.entries()) {
      const nextParts: Array<Record<string, unknown>> = []
      const role = (message as { role?: string }).role

      for (const part of message.parts) {
        const mutablePart = part as Record<string, unknown>
        const partType = typeof mutablePart.type === "string" ? mutablePart.type : "unknown"

        if (isToolPart({ type: partType }) && !isToolPartFinal(mutablePart)) {
          incrementStat(stats.partsDropped, partType)
          warnings.push({
            code: "non_final_state_dropped",
            messageIndex,
            detail: `Dropped non-final tool state "${String(mutablePart.state ?? "unknown")}"`,
          })
          continue
        }

        if (partType === "step-start") {
          incrementStat(stats.partsDropped, partType)
          continue
        }

        let nextPart = mutablePart
        if ("callProviderMetadata" in nextPart) {
          const sourceProvider = detectSourceProvider(nextPart)
          if (sourceProvider && sourceProvider !== "anthropic") {
            nextPart = stripCallProviderMetadata(nextPart)
            stats.providerIdsStripped += 1
            incrementStat(stats.partsTransformed, partType)
            warnings.push({
              code: "provider_ids_stripped",
              messageIndex,
              detail: `Stripped callProviderMetadata from "${sourceProvider}" for Anthropic replay`,
            })
          }
        }

        nextParts.push(nextPart)
        incrementStat(stats.partsPreserved, partType)
      }

      if (role === "assistant") {
        warnForOrphanedToolPairs(warnings, messageIndex, nextParts)
      }

      if (nextParts.length === 0) {
        incrementStat(stats.partsDropped, "message-empty")
        warnings.push({
          code: "empty_message_fallback",
          messageIndex,
          detail: "Injected empty text fallback because all message parts were removed",
        })
        nextParts.push({ type: "text", text: "" })
        incrementStat(stats.partsTransformed, "fallback-text")
      }

      adapted.push({
        ...message,
        parts: nextParts as UIMessage["parts"],
      })
    }

    stats.adaptedMessageCount = adapted.length
    stats.droppedMessages = Math.max(0, stats.originalMessageCount - adapted.length)
    stats.totalPartsAdapted = adapted.reduce((sum, message) => sum + message.parts.length, 0)

    return {
      messages: adapted,
      stats,
      warnings,
    }
  },
}
