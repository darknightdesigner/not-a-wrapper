import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server"
import {
  bucketPow2,
  logChatPerfConvex,
  shouldSampleChatPerfConvex,
} from "./domain/chat_perf"
import { createMessageBranchWriter } from "./domain/message_branch_writes"
import {
  createBranchContext,
  getBranchInfoForMessageFromContext,
  getSelectedPathMessagesFromContext,
  type MessageBranchInfo,
} from "./domain/message_branches"
import { isVisibleChatMessage } from "./domain/message_visibility"
import { recordChatActivity } from "./domain/project_activity"
import { requireOwnedChat } from "./lib/auth"
import { ownedChatMutation, readableChatQuery } from "./lib/authedFunctions"

function withBranchMetadata(
  selectedMessages: Doc<"messages">[],
  getBranchInfo: (message: Doc<"messages">) => MessageBranchInfo | undefined
) {
  return selectedMessages.map((message) => {
    const branch = getBranchInfo(message)
    if (!branch) return message

    const metadata =
      message.metadata &&
      typeof message.metadata === "object" &&
      !Array.isArray(message.metadata)
        ? message.metadata
        : {}

    return {
      ...message,
      metadata: {
        ...metadata,
        branch,
      },
    }
  })
}

/**
 * Selected visible path plus branch descriptors. The whole projection shares
 * one branch context.
 */
function getVisibleSelectedMessages(messages: Doc<"messages">[]) {
  const context = createBranchContext(messages)
  return withBranchMetadata(
    getSelectedPathMessagesFromContext(context).filter(isVisibleChatMessage),
    (message) => getBranchInfoForMessageFromContext(context, message)
  )
}

export async function listMessagesByChatOrder(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  chatId: Id<"chats">
) {
  return await ctx.db
    .query("messages")
    .withIndex("by_chat_order", (q) => q.eq("chatId", chatId))
    .collect()
}

// Selected-conversation projections.

/**
 * Presence and expiry drive the awaiting-approval presentation. The approval
 * UI itself reads message parts and uses the approve/deny mutations.
 */
export type PendingApprovalProjection = {
  expiresAt: number
}

/**
 * Raw durable facts about the chat's current run — deliberately `selectedRun`,
 * not `activeRun`: `statusRunId` is kept after a terminal transition, so the
 * UI receives the linked terminal status/reason during convergence. NO
 * time-derived fields cross this wire (freshness, controllable, stoppable):
 * Convex queries re-execute on data changes, never on wall-clock time — a
 * server-classified freshness could never expire between writes. The
 * client resolver owns all clock classification.
 */
export type SelectedRunProjection = {
  runId: Id<"generationRuns">
  assistantMessageId: Id<"messages">
  status: Doc<"generationRuns">["status"]
  terminalReason?: Doc<"generationRuns">["terminalReason"]
  leaseExpiresAt?: number
  pendingApproval: PendingApprovalProjection | null
}

export type SelectedPathProjection = {
  selectedMessages: ReturnType<typeof getVisibleSelectedMessages>
  /**
   * Cheap reconciliation fingerprint derived from the data this execution
   * read — no schema change, sufficient for client-side consistency
   * assertions, NOT a server-side gate.
   */
  pathVersion: {
    count: number
    tailMessageId: Id<"messages"> | null
    maxUpdatedAt: number
  }
}

/**
 * The selected visible path and nothing run-shaped. Its Convex read set is
 * chats/projects/users/messages only, so
 * run-doc writes (deduped snapshot beats, heartbeats, tool steps, approval
 * bookkeeping) do not re-execute the full message collect. Derivation uses
 * the shared branch context so branch and sibling semantics stay consistent.
 */
export async function getSelectedPathForViewer(
  ctx: QueryCtx,
  {
    chat,
    viewer,
  }: { chat: Doc<"chats"> | null; viewer: Doc<"users"> | null }
): Promise<SelectedPathProjection> {
  const empty: SelectedPathProjection = {
    selectedMessages: [],
    pathVersion: { count: 0, tailMessageId: null, maxUpdatedAt: 0 },
  }
  // The builder hands only the owner a chat; strangers read shares through
  // the share view (ADR-0043). Fail closed if that ever changes.
  if (!chat || viewer === null || chat.userId !== viewer._id) return empty
  const messages = await listMessagesByChatOrder(ctx, chat._id)
  const selectedMessages = getVisibleSelectedMessages(messages)

  if (shouldSampleChatPerfConvex()) {
    let partsBytes = 0
    try {
      partsBytes = JSON.stringify(
        selectedMessages.map((message) => message.parts)
      ).length
    } catch {
      // Size estimate only.
    }
    logChatPerfConvex("selected_conversation_read", {
      messagesReadBucket: bucketPow2(messages.length),
      selectedCountBucket: bucketPow2(selectedMessages.length),
      partsBytesBucket: bucketPow2(partsBytes),
    })
  }

  return {
    selectedMessages,
    pathVersion: {
      count: selectedMessages.length,
      tailMessageId: selectedMessages.at(-1)?._id ?? null,
      maxUpdatedAt: selectedMessages.reduce(
        (max, message) => Math.max(max, message.updatedAt ?? 0),
        0
      ),
    },
  }
}

/**
 * The tiny per-beat run state. Non-owner viewers get null. Run↔chat
 * ownership and the points-back check stay server-side; the on-selected-path
 * half lives in the client, which is sound because both queries'
 * values always come from one Convex transition (same client, same
 * `chatId`-only arguments) — the provider nulls the run when its assistant
 * message is absent from the delivered path.
 */
export async function getSelectedRunStateForViewer(
  ctx: QueryCtx,
  {
    chat,
    viewer,
  }: { chat: Doc<"chats"> | null; viewer: Doc<"users"> | null }
): Promise<SelectedRunProjection | null> {
  if (!chat) return null
  const isOwner = viewer !== null && chat.userId === viewer._id
  if (!isOwner) return null
  if (!chat.statusRunId) return null

  const run = await ctx.db.get(chat.statusRunId)
  if (
    !run ||
    run.chatId !== chat._id ||
    (run.userId !== undefined && run.userId !== chat.userId)
  ) {
    return null
  }
  const assistantMessageId = run.assistantMessageId
  if (!assistantMessageId) return null
  // While the run is live, `activeStreamId` is the linked message id (stamped
  // at stream start, cleared on terminal transitions), so the back-pointer is
  // decidable from the run doc alone. Reading the message would also add the
  // growing live doc to this query's read set, re-executing the run half on
  // every content beat. The message read remains only as the settled-run
  // fallback (`generationRunId` stamp), where the doc is no longer written
  // per beat. When `activeStreamId` matches, the linked message's existence is
  // not verified; a dangling id cannot appear in the delivered path, so the
  // client's on-path check still rejects it.
  let pointsBack = run.activeStreamId === assistantMessageId
  if (!pointsBack) {
    const linkedMessage = await ctx.db.get(assistantMessageId)
    pointsBack =
      linkedMessage !== null && linkedMessage.generationRunId === run._id
  }
  if (!pointsBack) return null

  const pendingApproval = await ctx.db
    .query("toolApprovalRequests")
    .withIndex("by_run_status", (q) =>
      q.eq("runId", run._id).eq("status", "pending")
    )
    .first()

  return {
    runId: run._id,
    assistantMessageId,
    status: run.status,
    terminalReason: run.terminalReason,
    leaseExpiresAt: run.leaseExpiresAt,
    pendingApproval: pendingApproval
      ? { expiresAt: pendingApproval.expiresAt }
      : null,
  }
}

export const getSelectedPath = readableChatQuery({
  args: {},
  handler: async (ctx) =>
    getSelectedPathForViewer(ctx, { chat: ctx.chat, viewer: ctx.user }),
})

export const getSelectedRunState = readableChatQuery({
  args: {},
  handler: async (ctx) =>
    getSelectedRunStateForViewer(ctx, { chat: ctx.chat, viewer: ctx.user }),
})

/**
 * Select one sibling branch for rendering.
 */
export async function selectBranchForChat(
  ctx: MutationCtx,
  {
    chatId,
    messageId,
  }: {
    chatId: Id<"chats">
    messageId: Id<"messages">
  }
) {
  const { chat } = await requireOwnedChat(ctx, chatId)

  const targetMessage = await ctx.db.get(messageId)
  if (!targetMessage || targetMessage.chatId !== chatId) {
    throw new Error("Message not found")
  }

  const now = Date.now()
  await createMessageBranchWriter(ctx, { chatId, now }).select(targetMessage._id)

  await recordChatActivity(ctx, chat, now)
  return targetMessage._id
}

export const selectBranch = ownedChatMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) =>
    selectBranchForChat(ctx, { chatId: ctx.chat._id, messageId }),
})
