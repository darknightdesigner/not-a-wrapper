import { v } from "convex/values"
import {
  isAllowedFileMimeType,
  MAX_FILE_SIZE,
  normalizeFileMimeType,
} from "../lib/file/policy"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import {
  deleteStorageIfUnreferenced,
  isStorageReferenced,
} from "./domain/storage_refs"
import { isChatActive, isRejectedAccount } from "./lib/auth"
import {
  authenticatedMutation,
  authenticatedQuery,
  maybeAuthQuery,
  ownedChatMutation,
  ownedChatQuery,
} from "./lib/authedFunctions"
import { ATTACHMENT_UPLOAD_PATH, signUploadTicket } from "./lib/uploadTicket"
import { commitFixedWindow, readFixedWindow } from "./rateLimits"

const DAILY_FILE_UPLOAD_LIMIT = 5
const PREMIUM_FILE_UPLOAD_LIMIT = null
/** Per-user burst ceiling on the upload action, where tickets are replayable. */
export const ATTACHMENT_UPLOAD_WINDOW = {
  bucket: "attachment_upload",
  limit: 20,
  windowMs: 60_000,
}

type FileUploadLimitUser = {
  premium?: boolean
}

type TrustedTextAttachmentForModelInput = {
  attachmentId: Id<"chatAttachments">
  url: string
  filename?: string
  mediaType?: string
  size?: number
}

type TrustedTextAttachmentReference = {
  attachmentId?: string
  url?: string
}

type TrustedTextAttachmentCandidate = {
  _id: Id<"chatAttachments">
  chatId?: Id<"chats">
  userId: Id<"users">
  storageId?: Id<"_storage">
  fileUrl: string
  fileName?: string
  fileType?: string
  fileSize?: number
}

const STAGED_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000

export function isStoredFileMetadataValid(
  metadata: { size: number; contentType?: string | null } | null,
  declaredType: string | undefined
): boolean {
  if (!metadata || metadata.size > MAX_FILE_SIZE) return false
  const storedType = normalizeFileMimeType(metadata.contentType)
  return (
    isAllowedFileMimeType(storedType) &&
    storedType === normalizeFileMimeType(declaredType)
  )
}

export function assertAttachmentCanBeDeletedIndependently(attachment: {
  chatId?: Id<"chats">
}): void {
  if (attachment.chatId) {
    throw new Error("Attached files cannot be deleted independently")
  }
}

export function isFileUploadLimitExceeded(
  user: FileUploadLimitUser,
  todayCount: number
): boolean {
  if (user.premium === true) return false
  return todayCount >= DAILY_FILE_UPLOAD_LIMIT
}

export function getFileUploadLimit(user: FileUploadLimitUser): number | null {
  return user.premium === true
    ? PREMIUM_FILE_UPLOAD_LIMIT
    : DAILY_FILE_UPLOAD_LIMIT
}

export function getFileUploadLimitStatus(
  user: FileUploadLimitUser,
  todayCount: number | null
): { count: number | null; limit: number | null; canUpload: boolean } {
  const limit = getFileUploadLimit(user)
  if (limit === null) {
    return { count: null, limit: null, canUpload: true }
  }

  const count = todayCount ?? 0
  return {
    count,
    limit,
    canUpload: !isFileUploadLimitExceeded(user, count),
  }
}

function normalizeMediaType(mediaType: string | undefined): string {
  return mediaType?.split(";")[0]?.trim().toLowerCase() ?? ""
}

export function selectTrustedTextAttachmentsForModelInput(args: {
  attachments: readonly TrustedTextAttachmentCandidate[]
  references: readonly TrustedTextAttachmentReference[]
  chatId: Id<"chats">
  userId: Id<"users">
}): TrustedTextAttachmentCandidate[] {
  const requestedAttachmentIds = new Set(
    args.references
      .map((reference) => reference.attachmentId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  )
  const requestedUrls = new Set(
    args.references
      .map((reference) => reference.url)
      .filter((url): url is string => typeof url === "string" && url.length > 0)
  )

  if (requestedAttachmentIds.size === 0 && requestedUrls.size === 0) {
    return []
  }

  return args.attachments.filter((attachment) => {
    if (attachment.chatId !== args.chatId) return false
    if (attachment.userId !== args.userId) return false
    if (!attachment.storageId) return false
    if (normalizeMediaType(attachment.fileType) !== "text/plain") return false
    return (
      requestedAttachmentIds.has(attachment._id) ||
      requestedUrls.has(attachment.fileUrl)
    )
  })
}

async function getTodayUploadCount(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">
): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfDay)
  startOfTomorrow.setUTCDate(startOfDay.getUTCDate() + 1)

  const attachments = await ctx.db
    .query("chatAttachments")
    .withIndex("by_user", (q) =>
      q
        .eq("userId", userId)
        .gte("_creationTime", startOfDay.getTime())
        .lt("_creationTime", startOfTomorrow.getTime())
    )
    .collect()

  return attachments.length
}

/** Premium users are unlimited, so their daily attachments are not scanned. */
async function isDailyUploadLimitReached(
  ctx: MutationCtx | QueryCtx,
  user: Doc<"users">
): Promise<boolean> {
  if (getFileUploadLimit(user) === null) return false
  return isFileUploadLimitExceeded(
    user,
    await getTodayUploadCount(ctx, user._id)
  )
}

/**
 * Mint an upload target for the `/attachments` HTTP action: its URL and a
 * ticket bound to the caller (ADR-0046). Null when the daily limit is spent.
 */
export const generateUploadUrl = authenticatedMutation({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user
    if (await isDailyUploadLimitReached(ctx, user)) return null

    const siteUrl = process.env.CONVEX_SITE_URL
    if (!siteUrl) throw new Error("CONVEX_SITE_URL is not set")
    return {
      url: `${siteUrl}${ATTACHMENT_UPLOAD_PATH}`,
      ticket: signUploadTicket(user._id),
    }
  },
})

/**
 * Get the URL for a stored file the caller owns.
 *
 * Requires authentication and verifies the caller owns a chatAttachment backed
 * by this storage id before returning the URL — otherwise any authenticated (or
 * previously, any unauthenticated) caller could read any file by guessing a
 * storage id.
 */
type AuthenticatedFileReadCtx = Pick<QueryCtx, "db" | "storage"> & {
  user: Doc<"users">
}

export async function getFileUrlForUserHandler(
  ctx: AuthenticatedFileReadCtx,
  { storageId }: { storageId: Id<"_storage"> }
) {
  const owned = await ctx.db
    .query("chatAttachments")
    .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
    .filter((q) => q.eq(q.field("storageId"), storageId))
    .first()
  if (!owned) return null
  if (owned.chatId) {
    const chat = await ctx.db.get(owned.chatId)
    if (!chat || !(await isChatActive(ctx, chat))) return null
  }

  return await ctx.storage.getUrl(storageId)
}

export const getUrl = authenticatedQuery({
  args: { storageId: v.id("_storage") },
  handler: getFileUrlForUserHandler,
})

type SaveStagedAttachmentCtx = MutationCtx & {
  user: Doc<"users">
}

type SaveStagedAttachmentArgs = {
  storageId: Id<"_storage">
  fileName?: string
  fileType?: string
}

/**
 * Stage a blob the upload action stored for `ctx.user`. Throws or returns
 * null (daily limit) without deleting it: the action that stored the blob
 * releases it on any refusal.
 */
export async function saveStagedAttachmentHandler(
  ctx: SaveStagedAttachmentCtx,
  args: SaveStagedAttachmentArgs
) {
  const user = ctx.user

  // A blob is bound once: if any attachment row or profile image already
  // holds it, no one may stage it.
  if (await isStorageReferenced(ctx, args.storageId)) {
    throw new Error("Stored file is already in use")
  }

  const metadata = await ctx.db.system.get("_storage", args.storageId)
  const storedType = normalizeFileMimeType(metadata?.contentType)
  if (!metadata || !isStoredFileMetadataValid(metadata, args.fileType)) {
    throw new Error("Stored file failed server validation")
  }

  // Authoritative re-check: concurrent uploads can all pass admission.
  if (await isDailyUploadLimitReached(ctx, user)) return null

  const fileUrl = await ctx.storage.getUrl(args.storageId)
  if (!fileUrl) throw new Error("Failed to get file URL")

  const attachmentId = await ctx.db.insert("chatAttachments", {
    userId: user._id,
    storageId: args.storageId,
    fileUrl,
    fileName: args.fileName,
    fileType: storedType,
    fileSize: metadata.size,
    stagedAt: Date.now(),
  })

  await ctx.scheduler.runAfter(
    STAGED_ATTACHMENT_TTL_MS,
    internal.files.cleanupStagedAttachment,
    { attachmentId }
  )

  return attachmentId
}

/**
 * The `/attachments` action's gate before it reads or stores the body, like
 * the profile-image rate limit: a ticket outlives the check that minted it,
 * so a replayed one past the daily limit or the burst window stores nothing.
 */
export const admitAttachmentUpload = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId)
    // The ticket proved who uploads; the row decides whether they still may.
    if (!user || isRejectedAccount(user)) return { status: "refused" } as const
    if (await isDailyUploadLimitReached(ctx, user)) {
      return { status: "daily_limit" } as const
    }
    const window = await readFixedWindow(ctx, {
      actorKey: `user:${userId}`,
      ...ATTACHMENT_UPLOAD_WINDOW,
      now: Date.now(),
    })
    if (!window.allowed) {
      return {
        status: "rate_limited",
        retryAfterMs: window.retryAfterMs,
      } as const
    }
    await commitFixedWindow(ctx, window)
    return { status: "allowed" } as const
  },
})

/**
 * Stage a blob the `/attachments` HTTP action just stored for the user its
 * upload ticket names. Internal-only, so no client can nominate a storage id.
 */
export const stageUploadedAttachment = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.optional(v.string()),
    fileType: v.string(),
  },
  handler: async (ctx, { userId, ...args }) => {
    const user = await ctx.db.get(userId)
    if (!user) throw new Error("User not found")
    if (isRejectedAccount(user)) throw new Error("Account rejected")
    return await saveStagedAttachmentHandler({ ...ctx, user }, args)
  },
})

/**
 * Release a blob an upload action stored but could not commit (attachment
 * staging or the profile-image commit). A commit that landed before its
 * result was lost still references the blob, so the one deletion rule keeps
 * it: a staged row still expires through its TTL cleanup.
 */
export const releaseUploadedStorage = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await deleteStorageIfUnreferenced(ctx, storageId)
  },
})

/** The wire descriptor a bound attachment crosses back to the client as. */
export type BoundAttachmentDescriptor = {
  name: string
  contentType: string
  url: string
  attachmentId: Id<"chatAttachments">
}

/**
 * Bind a complete staged set to one chat the caller owns. Every row is
 * validated before any patch, so callers never receive or dispatch a partial
 * subset — and inside a larger transaction (the atomic first-turn creation) a
 * validation throw rolls the whole transaction back. Ownership of `chatId` is
 * the caller's responsibility (the ownedChatMutation builder, or a chat the
 * same transaction just inserted for `userId`).
 */
export async function bindStagedAttachmentsToChat(
  ctx: MutationCtx,
  owner: { userId: Id<"users">; chatId: Id<"chats"> },
  attachmentIds: Id<"chatAttachments">[]
): Promise<BoundAttachmentDescriptor[]> {
  const uniqueIds = new Set(attachmentIds)
  if (uniqueIds.size !== attachmentIds.length) {
    throw new Error("Duplicate attachment reference")
  }

  const attachments = await Promise.all(
    attachmentIds.map((attachmentId) => ctx.db.get(attachmentId))
  )
  for (const attachment of attachments) {
    if (!attachment || attachment.userId !== owner.userId) {
      throw new Error("Attachment not found")
    }
    if (attachment.chatId && attachment.chatId !== owner.chatId) {
      throw new Error("Attachment belongs to another chat")
    }
    if (!attachment.storageId) {
      throw new Error("Attachment is not ready")
    }
  }

  for (const attachment of attachments) {
    if (attachment?.chatId === owner.chatId) continue
    await ctx.db.patch(attachment!._id, {
      chatId: owner.chatId,
      stagedAt: undefined,
    })
  }

  return attachments.map((attachment) => describeBoundAttachment(attachment!))
}

export function describeBoundAttachment(
  attachment: Doc<"chatAttachments">
): BoundAttachmentDescriptor {
  return {
    name: attachment.fileName ?? "File",
    contentType: attachment.fileType ?? "application/octet-stream",
    url: attachment.fileUrl,
    attachmentId: attachment._id,
  }
}

/**
 * Bind a complete staged set to one owned chat (the existing-chat turn path;
 * the first turn binds through chats.createWithFirstTurn instead).
 */
export const attachStagedFiles = ownedChatMutation({
  args: { attachmentIds: v.array(v.id("chatAttachments")) },
  handler: async (ctx, { attachmentIds }) =>
    bindStagedAttachmentsToChat(
      ctx,
      { userId: ctx.user._id, chatId: ctx.chat._id },
      attachmentIds
    ),
})

/** Resolve an owner-verified preview source for the same-origin proxy. */
export async function getAttachmentPreviewForUserHandler(
  ctx: AuthenticatedFileReadCtx,
  { attachmentId }: { attachmentId: Id<"chatAttachments"> }
) {
  const attachment = await ctx.db.get(attachmentId)
  if (!attachment || attachment.userId !== ctx.user._id) return null
  if (attachment.chatId) {
    const chat = await ctx.db.get(attachment.chatId)
    if (!chat || !(await isChatActive(ctx, chat))) return null
  }
  if (!attachment.storageId) return null
  const url = await ctx.storage.getUrl(attachment.storageId)
  if (!url) return null
  return {
    url,
    fileName: attachment.fileName ?? "File",
    fileType: attachment.fileType ?? "application/octet-stream",
    fileSize: attachment.fileSize,
  }
}

export const getAttachmentPreview = authenticatedQuery({
  args: { attachmentId: v.id("chatAttachments") },
  handler: getAttachmentPreviewForUserHandler,
})

/** Best-effort server cleanup for abandoned staged rows. */
export const cleanupStagedAttachment = internalMutation({
  args: { attachmentId: v.id("chatAttachments") },
  handler: async (ctx, { attachmentId }) => {
    const attachment = await ctx.db.get(attachmentId)
    if (!attachment?.stagedAt || attachment.chatId) return
    if (Date.now() - attachment.stagedAt < STAGED_ATTACHMENT_TTL_MS) return
    if (attachment.storageId) {
      await deleteStorageIfUnreferenced(ctx, attachment.storageId, attachmentId)
    }
    await ctx.db.delete(attachmentId)
  },
})

export const getTrustedTextAttachmentsForChat = ownedChatQuery({
  args: {
    references: v.array(
      v.object({
        attachmentId: v.optional(v.string()),
        url: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { references }) => {
    const chatId = ctx.chat._id
    const attachments = await ctx.db
      .query("chatAttachments")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .collect()

    const trustedAttachments = selectTrustedTextAttachmentsForModelInput({
      attachments,
      references,
      chatId,
      userId: ctx.user._id,
    })

    const result: TrustedTextAttachmentForModelInput[] = []
    for (const attachment of trustedAttachments) {
      if (!attachment.storageId) continue
      const url = await ctx.storage.getUrl(attachment.storageId)
      if (!url) continue

      result.push({
        attachmentId: attachment._id,
        url,
        filename: attachment.fileName,
        mediaType: attachment.fileType,
        size: attachment.fileSize,
      })
    }

    return result
  },
})

/**
 * Check daily file upload limit
 */
export const checkUploadLimit = maybeAuthQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user
    if (!user) {
      return { count: 0, limit: DAILY_FILE_UPLOAD_LIMIT, canUpload: true }
    }

    if (getFileUploadLimit(user) === null) {
      return getFileUploadLimitStatus(user, null)
    }

    const todayCount = await getTodayUploadCount(ctx, user._id)
    return getFileUploadLimitStatus(user, todayCount)
  },
})

/**
 * Delete a file. Ownership is a per-row check on the attachment, not a builder
 * resource, so this stays an authenticatedMutation with an inline owner check.
 */
export const deleteFile = authenticatedMutation({
  args: { attachmentId: v.id("chatAttachments") },
  handler: async (ctx, { attachmentId }) => {
    const attachment = await ctx.db.get(attachmentId)
    if (!attachment) throw new Error("Attachment not found")

    if (attachment.userId !== ctx.user._id) {
      throw new Error("Not authorized")
    }

    assertAttachmentCanBeDeletedIndependently(attachment)

    if (attachment.storageId) {
      await deleteStorageIfUnreferenced(ctx, attachment.storageId, attachmentId)
    }

    await ctx.db.delete(attachmentId)
  },
})
