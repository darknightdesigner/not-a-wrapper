import { getConvexSize, type Value } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id, TableNames } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import {
  closeSupersededGenerationsForChat,
  denyPendingApprovalsForChat,
} from "../chatRuntime"
import {
  ACCOUNT_PHASES,
  ACCOUNT_TABLE_PHASES,
  ACCOUNT_TOMBSTONE_SCRUB,
  paginateAccountTable,
  type AccountPhase,
  type AccountTablePhase,
} from "./account_deletion"
import { takeLinkedChats } from "./chat_project_link"
import { isSupersedableGenerationRunStatus } from "./generation_run_lifecycle"
import { GENERATION_RUN_STATUSES } from "./message_contract"

export const DELETION_PHASES = [
  "toolInvocations",
  "toolApprovalRequests",
  "toolCallLog",
  "messages",
  "generationRuns",
  "attachments", // includes stored-file reference handling
  "chatRoot",
] as const
// Project jobs: phase "chats" (drain linked chats through the phases above,
// one chat at a time via job.chatId), then "projectRoot".
// Account jobs (ADR-0044): ACCOUNT_PHASES, whose "chats" phase is the same
// loop over every owned Chat.

export const DELETION_BATCH = {
  numItems: 200,
  maximumRowsRead: 400,
  maximumBytesRead: 2 * 1024 * 1024,
  attachmentsPerBatch: 25,
} as const

type ChatDeletionPhase = (typeof DELETION_PHASES)[number]
type ChildDeletionPhase = Exclude<
  ChatDeletionPhase,
  "attachments" | "chatRoot"
>

const CHILD_DELETION_PHASES: readonly ChildDeletionPhase[] = [
  "toolInvocations",
  "toolApprovalRequests",
  "toolCallLog",
  "messages",
  "generationRuns",
]

type ChatDeletionCtx = MutationCtx

type ChildRow =
  | Doc<"toolInvocations">
  | Doc<"toolApprovalRequests">
  | Doc<"toolCallLog">
  | Doc<"messages">
  | Doc<"generationRuns">

type ChildPage = {
  page: ChildRow[]
}

type BatchProgress = {
  documentsDeleted: number
  bytesObserved: number
}

type ChatBatchResult = {
  phase: string
  chatId?: Id<"chats">
  complete: boolean
}

class DeletionFailure extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

function invariant(condition: unknown): asserts condition {
  if (!condition) throw new DeletionFailure("invariant_violation")
}

function isChildDeletionPhase(phase: string): phase is ChildDeletionPhase {
  return (CHILD_DELETION_PHASES as readonly string[]).includes(phase)
}

function nextChatPhase(phase: ChatDeletionPhase): ChatDeletionPhase {
  const index = DELETION_PHASES.indexOf(phase)
  invariant(index >= 0 && index < DELETION_PHASES.length - 1)
  return DELETION_PHASES[index + 1]
}

function isAccountTablePhase(phase: string): phase is AccountTablePhase {
  return (ACCOUNT_TABLE_PHASES as readonly string[]).includes(phase)
}

function nextAccountPhase(phase: AccountPhase): AccountPhase {
  const index = ACCOUNT_PHASES.indexOf(phase)
  invariant(index >= 0 && index < ACCOUNT_PHASES.length - 1)
  return ACCOUNT_PHASES[index + 1]
}

const DESTRUCTIVE_PAGE = {
  cursor: null,
  numItems: DELETION_BATCH.numItems,
  maximumRowsRead: DELETION_BATCH.maximumRowsRead,
  maximumBytesRead: DELETION_BATCH.maximumBytesRead,
} as const

async function paginateChildPhase(
  ctx: ChatDeletionCtx,
  phase: ChildDeletionPhase,
  chatId: Id<"chats">
): Promise<ChildPage> {
  const paginationOptions = DESTRUCTIVE_PAGE

  switch (phase) {
    case "toolInvocations":
      return await ctx.db
        .query("toolInvocations")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .paginate(paginationOptions)
    case "toolApprovalRequests":
      return await ctx.db
        .query("toolApprovalRequests")
        .withIndex("by_chat_status", (q) => q.eq("chatId", chatId))
        .paginate(paginationOptions)
    case "toolCallLog":
      return await ctx.db
        .query("toolCallLog")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .paginate(paginationOptions)
    case "messages":
      return await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .paginate(paginationOptions)
    case "generationRuns":
      return await ctx.db
        .query("generationRuns")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .paginate(paginationOptions)
  }
}

async function deleteRow(
  ctx: ChatDeletionCtx,
  row: Doc<TableNames>,
  progress: BatchProgress
): Promise<void> {
  await ctx.db.delete(row._id)
  progress.documentsDeleted++
  progress.bytesObserved += getConvexSize(row as unknown as Value)
}

function isMissingStorageError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("already deleted")
  )
}

// Deletes each row and its stored file, unless another attachment still
// references the same blob (in-transaction by_storage exclusivity check).
async function deleteAttachmentPage(
  ctx: ChatDeletionCtx,
  attachments: Doc<"chatAttachments">[],
  progress: BatchProgress
): Promise<void> {
  for (const attachment of attachments) {
    if (attachment.storageId) {
      const references = await ctx.db
        .query("chatAttachments")
        .withIndex("by_storage", (q) =>
          q.eq("storageId", attachment.storageId)
        )
        .take(2)
      if (
        references.length === 1 &&
        references[0]?._id === attachment._id
      ) {
        await deleteStoredFile(ctx, attachment.storageId)
      }
    }
    await deleteRow(ctx, attachment, progress)
  }
}

async function deleteStoredFile(
  ctx: ChatDeletionCtx,
  storageId: Id<"_storage">
): Promise<void> {
  try {
    await ctx.storage.delete(storageId)
  } catch (error) {
    if (!isMissingStorageError(error)) {
      throw new DeletionFailure("storage_delete_failed")
    }
  }
}

async function deleteAttachmentsBatch(
  ctx: ChatDeletionCtx,
  chatId: Id<"chats">,
  progress: BatchProgress
): Promise<ChatDeletionPhase> {
  const attachments = await ctx.db
    .query("chatAttachments")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .take(DELETION_BATCH.attachmentsPerBatch)

  if (attachments.length === 0) return "chatRoot"
  await deleteAttachmentPage(ctx, attachments, progress)
  return "attachments"
}

async function firstRemainingPhase(
  ctx: ChatDeletionCtx,
  chatId: Id<"chats">
): Promise<Exclude<ChatDeletionPhase, "chatRoot"> | null> {
  if (
    await ctx.db
      .query("toolInvocations")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .first()
  ) {
    return "toolInvocations"
  }
  if (
    await ctx.db
      .query("toolApprovalRequests")
      .withIndex("by_chat_status", (q) => q.eq("chatId", chatId))
      .first()
  ) {
    return "toolApprovalRequests"
  }
  if (
    await ctx.db
      .query("toolCallLog")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .first()
  ) {
    return "toolCallLog"
  }
  if (
    await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .first()
  ) {
    return "messages"
  }
  if (
    await ctx.db
      .query("generationRuns")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .first()
  ) {
    return "generationRuns"
  }
  if (
    await ctx.db
      .query("chatAttachments")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .first()
  ) {
    return "attachments"
  }
  return null
}

async function runChatBatch(
  ctx: ChatDeletionCtx,
  job: Doc<"deletionJobs">,
  chatId: Id<"chats">,
  progress: BatchProgress
): Promise<ChatBatchResult> {
  const phase =
    job.targetKind !== "chat" && job.phase === "chats"
      ? DELETION_PHASES[0]
      : job.phase

  if (isChildDeletionPhase(phase)) {
    const rows = await paginateChildPhase(ctx, phase, chatId)
    for (const row of rows.page) {
      await deleteRow(ctx, row, progress)
    }
    return {
      phase: rows.page.length === 0 ? nextChatPhase(phase) : phase,
      chatId,
      complete: false,
    }
  }

  if (phase === "attachments") {
    return {
      phase: await deleteAttachmentsBatch(ctx, chatId, progress),
      chatId,
      complete: false,
    }
  }

  invariant(phase === "chatRoot")
  const chat = await ctx.db.get(chatId)
  if (chat) {
    const remainingPhase = await firstRemainingPhase(ctx, chatId)
    if (remainingPhase) {
      return { phase: remainingPhase, chatId, complete: false }
    }
    await deleteRow(ctx, chat, progress)
  }

  if (job.targetKind === "chat") {
    return { phase: "chatRoot", chatId, complete: true }
  }
  return { phase: "chats", chatId: undefined, complete: false }
}

async function runProjectBatch(
  ctx: ChatDeletionCtx,
  job: Doc<"deletionJobs">,
  progress: BatchProgress
): Promise<ChatBatchResult> {
  invariant(job.projectId)

  if (job.phase === "projectRoot") {
    const project = await ctx.db.get(job.projectId)
    invariant(project)
    await deleteRow(ctx, project, progress)
    return { phase: "projectRoot", complete: true }
  }

  if (job.chatId) {
    return await runChatBatch(ctx, job, job.chatId, progress)
  }

  invariant(job.phase === "chats")
  const project = await ctx.db.get(job.projectId)
  invariant(project)
  const chats = await takeLinkedChats(ctx, project, 2)
  const chat = chats[0]
  if (!chat) return { phase: "projectRoot", complete: false }
  return await beginChatDrain(ctx, job, chat)
}

// Project and account jobs reach chats through this worker rather than
// chats.remove. Close and defer live runs before any child row can be
// deleted, using the same lifecycle path as direct Chat deletion, and revoke
// share links in the same commit.
async function beginChatDrain(
  ctx: ChatDeletionCtx,
  job: Doc<"deletionJobs">,
  chat: Doc<"chats">
): Promise<ChatBatchResult> {
  const now = Date.now()
  await closeSupersededGenerationsForChat(ctx, chat._id, job.userId, now)
  if (chat.deletingAt === undefined || chat.public) {
    await ctx.db.patch(chat._id, {
      deletingAt: chat.deletingAt ?? now,
      public: false,
    })
  }
  return { phase: "chats", chatId: chat._id, complete: false }
}

const SUPERSEDABLE_RUN_STATUSES = GENERATION_RUN_STATUSES.filter(
  isSupersedableGenerationRunStatus
)

async function findLiveRun(
  ctx: ChatDeletionCtx,
  userId: Id<"users">
): Promise<Doc<"generationRuns"> | null> {
  for (const status of SUPERSEDABLE_RUN_STATUSES) {
    const run = await ctx.db
      .query("generationRuns")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", status)
      )
      .first()
    if (run) return run
  }
  return null
}

async function runAccountBatch(
  ctx: ChatDeletionCtx,
  job: Doc<"deletionJobs">,
  progress: BatchProgress
): Promise<ChatBatchResult> {
  if (job.chatId) {
    return await runChatBatch(ctx, job, job.chatId, progress)
  }

  // Never drain a live account: the permanent tombstone is the precondition.
  const account = await ctx.db.get(job.userId)
  invariant(account && account.deletedAt !== undefined)
  const phase = job.phase

  if (phase === "liveRuns") {
    // One Chat per batch, through the same lifecycle paths as Chat deletion
    // (supersede, which revokes the worker grant) and the next turn's
    // deny-pending (which closes the paused run and settles its usage).
    const liveRun = await findLiveRun(ctx, account._id)
    if (liveRun) {
      await closeSupersededGenerationsForChat(
        ctx,
        liveRun.chatId,
        account._id,
        Date.now()
      )
      const closed = await ctx.db.get(liveRun._id)
      invariant(!closed || !isSupersedableGenerationRunStatus(closed.status))
      return { phase, complete: false }
    }
    const pendingApproval = await ctx.db
      .query("toolApprovalRequests")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", account._id).eq("status", "pending")
      )
      .first()
    if (pendingApproval) {
      await denyPendingApprovalsForChat(
        ctx,
        pendingApproval.chatId,
        account._id,
        "account deleted"
      )
      return { phase, complete: false }
    }
    return { phase: nextAccountPhase(phase), complete: false }
  }

  if (phase === "chats") {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", account._id))
      .first()
    if (!chat) return { phase: nextAccountPhase(phase), complete: false }
    return await beginChatDrain(ctx, job, chat)
  }

  if (phase === "projects") {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", account._id))
      .first()
    if (!project) return { phase: nextAccountPhase(phase), complete: false }
    // Every owned Chat is already gone, so no Project can still link one.
    invariant((await takeLinkedChats(ctx, project, 1)).length === 0)
    // Supersede an unfinished Project job so it never blocks on the missing
    // root it was draining toward.
    const projectJob = await findActiveProjectJob(ctx, project._id)
    if (projectJob) {
      const now = Date.now()
      await ctx.db.patch(projectJob._id, {
        state: "complete",
        failureCode: undefined,
        updatedAt: now,
        completedAt: now,
      })
    }
    await deleteRow(ctx, project, progress)
    return { phase, complete: false }
  }

  if (phase === "accountAttachments") {
    // Chat-bound attachments went with their Chats; this drains staged ones.
    const attachments = await ctx.db
      .query("chatAttachments")
      .withIndex("by_user", (q) => q.eq("userId", account._id))
      .take(DELETION_BATCH.attachmentsPerBatch)
    if (attachments.length === 0) {
      return { phase: nextAccountPhase(phase), complete: false }
    }
    await deleteAttachmentPage(ctx, attachments, progress)
    return { phase, complete: false }
  }

  if (isAccountTablePhase(phase)) {
    const rows = await paginateAccountTable(
      ctx,
      phase,
      account,
      DESTRUCTIVE_PAGE
    )
    for (const row of rows.page) {
      await deleteRow(ctx, row, progress)
    }
    return {
      phase: rows.page.length === 0 ? nextAccountPhase(phase) : phase,
      complete: false,
    }
  }

  invariant(phase === "accountRoot")
  const profileImageStorageId = account.profileImageStorageId
  if (profileImageStorageId) {
    const sharedWithAttachment = await ctx.db
      .query("chatAttachments")
      .withIndex("by_storage", (q) => q.eq("storageId", profileImageStorageId))
      .first()
    if (!sharedWithAttachment) {
      await deleteStoredFile(ctx, profileImageStorageId)
    }
  }
  await ctx.db.patch(account._id, ACCOUNT_TOMBSTONE_SCRUB)
  return { phase, complete: true }
}

async function findActiveChatJob(
  ctx: ChatDeletionCtx,
  chatId: Id<"chats">
): Promise<Doc<"deletionJobs"> | null> {
  return await ctx.db
    .query("deletionJobs")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .filter((q) => q.neq(q.field("state"), "complete"))
    .first()
}

async function findActiveProjectJob(
  ctx: ChatDeletionCtx,
  projectId: Id<"projects">
): Promise<Doc<"deletionJobs"> | null> {
  return await ctx.db
    .query("deletionJobs")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .filter((q) => q.neq(q.field("state"), "complete"))
    .first()
}

export async function ensureChatDeletionJob(
  ctx: ChatDeletionCtx,
  chat: Doc<"chats">,
  user: Doc<"users">
): Promise<Doc<"deletionJobs">> {
  const existing = await findActiveChatJob(ctx, chat._id)
  if (existing) return existing

  const now = Date.now()
  const jobId = await ctx.db.insert("deletionJobs", {
    targetKind: "chat",
    chatId: chat._id,
    userId: user._id,
    state: "pending",
    phase: DELETION_PHASES[0],
    version: 1,
    batchesProcessed: 0,
    documentsDeleted: 0,
    bytesObserved: 0,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  })
  const job = await ctx.db.get(jobId)
  invariant(job)
  return job
}

export async function ensureProjectDeletionJob(
  ctx: ChatDeletionCtx,
  project: Doc<"projects">,
  user: Doc<"users">
): Promise<Doc<"deletionJobs">> {
  const existing = await findActiveProjectJob(ctx, project._id)
  if (existing) return existing

  const now = Date.now()
  const jobId = await ctx.db.insert("deletionJobs", {
    targetKind: "project",
    projectId: project._id,
    userId: user._id,
    state: "pending",
    phase: "chats",
    version: 1,
    batchesProcessed: 0,
    documentsDeleted: 0,
    bytesObserved: 0,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  })
  const job = await ctx.db.get(jobId)
  invariant(job)
  return job
}

export async function runDeletionBatchImpl(
  ctx: ChatDeletionCtx,
  jobId: Id<"deletionJobs">
): Promise<void> {
  const job = await ctx.db.get(jobId)
  if (!job || job.state === "complete" || job.state === "blocked") return

  const now = Date.now()
  await ctx.db.patch(job._id, { state: "running", updatedAt: now })
  const progress: BatchProgress = {
    documentsDeleted: 0,
    bytesObserved: 0,
  }

  try {
    let result: ChatBatchResult
    if (job.targetKind === "chat") {
      invariant(job.chatId)
      result = await runChatBatch(ctx, job, job.chatId, progress)
    } else if (job.targetKind === "project") {
      result = await runProjectBatch(ctx, job, progress)
    } else {
      result = await runAccountBatch(ctx, job, progress)
    }

    await ctx.db.patch(job._id, {
      state: result.complete ? "complete" : "running",
      phase: result.phase,
      chatId: result.chatId,
      batchesProcessed: job.batchesProcessed + 1,
      documentsDeleted: job.documentsDeleted + progress.documentsDeleted,
      bytesObserved: job.bytesObserved + progress.bytesObserved,
      failureCode: undefined,
      updatedAt: now,
      completedAt: result.complete ? now : undefined,
    })

    if (!result.complete) {
      await ctx.scheduler.runAfter(
        0,
        internal.deletionCleanup.runDeletionBatch,
        { jobId }
      )
    }
  } catch (error) {
    await ctx.db.patch(job._id, {
      state: "blocked",
      batchesProcessed: job.batchesProcessed + 1,
      documentsDeleted: job.documentsDeleted + progress.documentsDeleted,
      bytesObserved: job.bytesObserved + progress.bytesObserved,
      retryCount: job.retryCount + 1,
      failureCode:
        error instanceof DeletionFailure ? error.code : "batch_failed",
      updatedAt: now,
    })
  }
}
