import { api } from "@/convex/_generated/api"
import type { Doc } from "@/convex/_generated/dataModel"
import type {
  ChatTurnEditRequest,
  ChatTurnRegenerationRequest,
} from "@/lib/chat-messages/chat-turn-contract"
import { isPdfMediaType, isTextLikeMediaType } from "@/lib/file/policy"
import type { AttachmentSizes } from "@/lib/usage/platform-usage-estimate"
import type { UIMessage } from "ai"
import { validateUIMessages } from "ai"
import { fetchQuery as defaultFetchQuery } from "convex/nextjs"
import {
  buildDurablePrepareIntent,
  toDurableUiMessages,
} from "./durable-turn-runtime"
import {
  getFilePartReferences,
  prepareTextFilePartsForModelInput,
} from "./text-file-parts"
import {
  excludeSystemRoleMessages,
  toInvalidDurableRequestError,
} from "./utils"

export type DurableGenerationInputPlan = {
  inputHash: string
  /** Canonical, system-filtered, attachment-expanded provider input. */
  messages: UIMessage[]
  pinnedProvider?: string
  /** Stored PDF sizes for the platform usage estimate. */
  attachmentSizes?: AttachmentSizes
  textFileStats: {
    convertedCount: number
    failedCount: number
    truncatedCount: number
    skippedCount: number
  }
}

type PreflightArgs = {
  chatId: string
  token: string
  messages: UIMessage[]
  expectedVisibleMessageCount?: number
  tailMessageId?: string
  edit?: ChatTurnEditRequest
  regeneration?: ChatTurnRegenerationRequest
}

type PreflightDeps = {
  fetchQuery: typeof defaultFetchQuery
  fetchImpl?: typeof fetch
}

/**
 * Build the one durable provider-input plan used by allowance estimation and
 * execution. Attachment bytes are fetched once here and the expanded messages
 * ride the admitted turn; the runtime never re-reads them after reservation.
 */
export async function preflightDurableGenerationInput(
  args: PreflightArgs,
  deps: PreflightDeps = { fetchQuery: defaultFetchQuery }
): Promise<DurableGenerationInputPlan> {
  const { approvalResponses, latestUserMessage } = buildDurablePrepareIntent({
    messages: args.messages,
    edit: args.edit,
    regeneration: args.regeneration,
  })
  const plan = await deps
    .fetchQuery(
      api.chatRuntime.planGenerationInput,
      {
        chatId: args.chatId,
        expectedVisibleMessageCount: args.expectedVisibleMessageCount,
        tailMessageId: args.tailMessageId,
        latestUserMessage: latestUserMessage
          ? {
              id: latestUserMessage.id,
              role: "user" as const,
              parts: latestUserMessage.parts,
            }
          : undefined,
        edit: args.edit,
        regeneration: args.regeneration,
        approvalResponses,
      },
      { token: args.token }
    )
    .catch((error: unknown) => {
      const invalidRequest = toInvalidDurableRequestError(error)
      if (invalidRequest) throw invalidRequest
      throw error
    })

  const canonicalMessages = toDurableUiMessages(
    plan.messages as Doc<"messages">[]
  )
  const systemFiltered = excludeSystemRoleMessages(canonicalMessages).messages
  const validatedMessages = await validateUIMessages({
    messages: systemFiltered,
  })
  // Text-like files are read and inlined; PDFs are only sized.
  const attachmentReferences = getFilePartReferences(
    validatedMessages,
    (mediaType) => isTextLikeMediaType(mediaType) || isPdfMediaType(mediaType)
  )
  const trustedAttachments =
    attachmentReferences.length > 0
      ? await deps.fetchQuery(
          api.files.getTrustedTextAttachmentsForChat,
          {
            chatId: args.chatId,
            references: attachmentReferences,
          },
          { token: args.token }
        )
      : []
  const textFileInput = await prepareTextFilePartsForModelInput(
    validatedMessages,
    {
      trustedAttachments: trustedAttachments.filter((attachment) =>
        isTextLikeMediaType(attachment.mediaType)
      ),
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    }
  )
  const attachmentSizes: Record<string, number> = {}
  for (const attachment of trustedAttachments) {
    if (isPdfMediaType(attachment.mediaType) && attachment.size !== undefined) {
      attachmentSizes[attachment.attachmentId] = attachment.size
    }
  }

  return {
    inputHash: plan.inputHash,
    messages: textFileInput.messages,
    ...(plan.pinnedProvider ? { pinnedProvider: plan.pinnedProvider } : {}),
    attachmentSizes,
    textFileStats: {
      convertedCount: textFileInput.convertedCount,
      failedCount: textFileInput.failedCount,
      truncatedCount: textFileInput.truncatedCount,
      skippedCount: textFileInput.skippedCount,
    },
  }
}
