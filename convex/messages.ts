import { v, type Infer } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
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
import { extractTextFromMessageParts } from "./domain/message_facts"
import { isVisibleChatMessage } from "./domain/message_visibility"
import { patchChatActivity } from "./domain/project_activity"
import { requireOwnedChat } from "./lib/auth"
import { ownedChatMutation, readableChatQuery } from "./lib/authedFunctions"
import { vToolInvocationStreamMetadata } from "./lib/messageMetadata"
import schema from "./schema"

const vMessageBranchInfo = v.object({
  messageId: v.id("messages"),
  currentIndex: v.number(),
  total: v.number(),
  siblings: v.array(
    v.object({
      messageId: v.id("messages"),
      clientMessageId: v.optional(v.string()),
    })
  ),
})

/**
 * One message as the selected-conversation reads ship it: only the fields the
 * client adapter reads. `content` is omitted when it equals the text parts,
 * which the adapter derives with the same `extractTextFromMessageParts`.
 */
export const vSelectedMessage = schema.tables.messages.validator
  .pick(
    "clientMessageId",
    "role",
    "parts",
    "status",
    "requestId",
    "generationRunId",
    "model",
    "provider",
    "finishReason",
    "usage",
    "error",
    "errorRecovery",
    "streamCursor",
    "createdAt"
  )
  .extend({
    _id: v.id("messages"),
    content: v.optional(v.string()),
    metadata: v.optional(
      vToolInvocationStreamMetadata.extend({
        branch: v.optional(vMessageBranchInfo),
      })
    ),
  })
export type SelectedMessage = Infer<typeof vSelectedMessage>

function toSelectedMessage(
  message: Doc<"messages">,
  branch: MessageBranchInfo | undefined
): SelectedMessage {
  const { content, metadata } = message
  return {
    _id: message._id,
    clientMessageId: message.clientMessageId,
    role: message.role,
    ...(content === extractTextFromMessageParts(message.parts)
      ? {}
      : { content }),
    parts: message.parts,
    status: message.status,
    requestId: message.requestId,
    generationRunId: message.generationRunId,
    model: message.model,
    provider: message.provider,
    finishReason: message.finishReason,
    usage: message.usage,
    error: message.error,
    errorRecovery: message.errorRecovery,
    streamCursor: message.streamCursor,
    metadata: branch ? { ...metadata, branch } : metadata,
    createdAt: message.createdAt,
  }
}

/** A chat's messages in `orderId` order, or only those before `before`. */
export async function listMessagesByChatOrder(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  chatId: Id<"chats">,
  { before }: { before?: number } = {}
) {
  return await ctx.db
    .query("messages")
    .withIndex("by_chat_order", (q) =>
      before === undefined
        ? q.eq("chatId", chatId)
        : q.eq("chatId", chatId).lt("orderId", before)
    )
    .collect()
}

/** The selected path through `messages`, with the branch context it walked. */
function walkSelectedPath(messages: Doc<"messages">[]) {
  const context = createBranchContext(messages)
  return {
    messages,
    context,
    path: getSelectedPathMessagesFromContext(context),
  }
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

export const vSelectedPathProjection = v.object({
  selectedMessages: v.array(vSelectedMessage),
  /**
   * The live message this history stopped before (ADR-0027 live tail), or
   * null when it read the whole path. The client appends `getLiveMessage`
   * only when its id matches, so the live message is never duplicated or
   * misplaced.
   */
  liveMessageId: v.union(v.id("messages"), v.null()),
})
export type SelectedPathProjection = Infer<typeof vSelectedPathProjection>

/**
 * The selected visible path and nothing run-shaped. Its read set is
 * chats/projects/users/messages only, so run-doc writes do not re-execute it.
 * With `splitLiveTail` (the subscribed history) it reads only messages
 * ordered before the chat's live tail while a run streams, so checkpoint
 * writes to the live message stay outside its read set and `getLiveMessage`
 * carries that message alone. Without it, the whole path, live message
 * included.
 */
export async function getSelectedPathForViewer(
  ctx: QueryCtx,
  {
    chat,
    viewer,
    splitLiveTail = false,
  }: {
    chat: Doc<"chats"> | null
    viewer: Doc<"users"> | null
    splitLiveTail?: boolean
  }
): Promise<SelectedPathProjection> {
  // The builder hands only the owner a chat; strangers read shares through
  // the share view (ADR-0043). Fail closed if that ever changes.
  if (!chat || viewer === null || chat.userId !== viewer._id) {
    return { selectedMessages: [], liveMessageId: null }
  }
  const liveTail = splitLiveTail ? chat.liveTail : undefined
  let read = walkSelectedPath(
    await listMessagesByChatOrder(ctx, chat._id, { before: liveTail?.orderId })
  )
  let liveMessageId = liveTail?.messageId ?? null
  // Self-check: the bounded walk must end on the live message's parent, or
  // appending it would misplace it. Fall back to the whole path.
  if (liveTail && read.path.at(-1)?._id !== liveTail.parentMessageId) {
    read = walkSelectedPath(await listMessagesByChatOrder(ctx, chat._id))
    liveMessageId = null
  }
  const selectedMessages = read.path
    .filter(isVisibleChatMessage)
    .map((message) =>
      toSelectedMessage(
        message,
        getBranchInfoForMessageFromContext(read.context, message)
      )
    )

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
      messagesReadBucket: bucketPow2(read.messages.length),
      selectedCountBucket: bucketPow2(selectedMessages.length),
      partsBytesBucket: bucketPow2(partsBytes),
    })
  }

  return { selectedMessages, liveMessageId }
}

/**
 * The live tail's message alone, with its branch descriptor from its sibling
 * group. Null without a live tail, for non-owners, and when the message is
 * gone, moved, deselected or not yet visible.
 */
export async function getLiveMessageForViewer(
  ctx: QueryCtx,
  { chat, viewer }: { chat: Doc<"chats"> | null; viewer: Doc<"users"> | null }
): Promise<SelectedMessage | null> {
  if (!chat?.liveTail || viewer === null || chat.userId !== viewer._id) {
    return null
  }
  const { messageId, parentMessageId } = chat.liveTail
  const message = await ctx.db.get(messageId)
  if (
    !message ||
    message.chatId !== chat._id ||
    message.parentMessageId !== parentMessageId ||
    message.selected === false ||
    !isVisibleChatMessage(message)
  ) {
    return null
  }
  const siblings = await ctx.db
    .query("messages")
    .withIndex("by_chat_parent", (q) =>
      q.eq("chatId", chat._id).eq("parentMessageId", parentMessageId)
    )
    .collect()
  return toSelectedMessage(
    message,
    getBranchInfoForMessageFromContext(createBranchContext(siblings), message)
  )
}

/**
 * The tiny per-beat run state. Non-owner viewers get null. Run↔chat
 * ownership and the points-back check stay server-side; the on-selected-path
 * half lives in the client, which is sound because the selected-conversation
 * queries' values always come from one Convex transition (same client, same
 * `chatId`) — the provider nulls the run when its assistant message is absent
 * from the delivered path.
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

/**
 * The live-tail split is opt-in (ADR-0027), so a client from before it (a tab
 * left open across a deploy, the paired perf base arm on the shared
 * deployment) still reads the whole path: its run validation, Stop target and
 * resume need the live message on that path.
 */
export const getSelectedPath = readableChatQuery({
  args: { splitLiveTail: v.optional(v.literal(true)) },
  returns: vSelectedPathProjection,
  handler: async (ctx, { splitLiveTail }) =>
    getSelectedPathForViewer(ctx, {
      chat: ctx.chat,
      viewer: ctx.user,
      splitLiveTail,
    }),
})

export const getLiveMessage = readableChatQuery({
  args: {},
  returns: v.union(vSelectedMessage, v.null()),
  handler: async (ctx) =>
    getLiveMessageForViewer(ctx, { chat: ctx.chat, viewer: ctx.user }),
})

export const getSelectedRunState = readableChatQuery({
  args: {},
  handler: async (ctx) =>
    getSelectedRunStateForViewer(ctx, { chat: ctx.chat, viewer: ctx.user }),
})

/**
 * The resume route's read (ADR-0039): run state and the whole selected path,
 * live message included, from one snapshot, so its on-path check and
 * selection frame agree.
 */
export const getResumeSelection = readableChatQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = { chat: ctx.chat, viewer: ctx.user }
    const { selectedMessages } = await getSelectedPathForViewer(ctx, viewer)
    return {
      run: await getSelectedRunStateForViewer(ctx, viewer),
      selectedMessages,
    }
  },
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

  // A branch write breaks the live-tail invariant; history reads the whole
  // path again until the next prepare stamps a new tail.
  await patchChatActivity(ctx, chat, { liveTail: undefined }, now)
  return targetMessage._id
}

export const selectBranch = ownedChatMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) =>
    selectBranchForChat(ctx, { chatId: ctx.chat._id, messageId }),
})
