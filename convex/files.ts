import { v } from "convex/values"
import {
  isAllowedFileMimeType,
  isImageMediaType,
  isPdfMediaType,
  isTextLikeMediaType,
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
import { isChatActive } from "./lib/auth"
import {
  authenticatedMutation,
  authenticatedQuery,
  maybeAuthQuery,
  ownedChatMutation,
  ownedChatQuery,
} from "./lib/authedFunctions"

const DAILY_FILE_UPLOAD_LIMIT = 5
const PREMIUM_FILE_UPLOAD_LIMIT = null

type FileUploadLimitUser = {
  premium?: boolean
}

type TrustedModelInputAttachment = {
  attachmentId: Id<"chatAttachments">
  url: string
  filename?: string
  mediaType?: string
  size?: number
}

type TrustedModelInputAttachmentReference = {
  attachmentId?: string
  url?: string
}

type TrustedModelInputAttachmentCandidate = {
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

/**
 * A staged image has no canonical URL until `attachmentImages` commits the
 * stored copy every model can take, so it cannot be bound, and its URL
 * persisted into a message, before then.
 */
const PENDING_ATTACHMENT_URL = ""

export function isAttachmentReady(
  attachment: Pick<Doc<"chatAttachments">, "storageId" | "fileUrl">
): boolean {
  return (
    attachment.storageId !== undefined &&
    attachment.fileUrl !== PENDING_ATTACHMENT_URL
  )
}

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

/**
 * Text-like rows are read and inlined as text; PDF rows are only sized for
 * the platform usage estimate.
 */
export function selectTrustedModelInputAttachments(args: {
  attachments: readonly TrustedModelInputAttachmentCandidate[]
  references: readonly TrustedModelInputAttachmentReference[]
  chatId: Id<"chats">
  userId: Id<"users">
}): TrustedModelInputAttachmentCandidate[] {
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
    if (
      !isTextLikeMediaType(attachment.fileType) &&
      !isPdfMediaType(attachment.fileType)
    ) {
      return false
    }
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

/**
 * Generate an upload URL for file storage
 * Enforces daily upload limit server-side
 */
export const generateUploadUrl = authenticatedMutation({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user
    // Enforce daily upload limit server-side. Premium users are unlimited, so
    // avoid scanning their daily attachments.
    if (getFileUploadLimit(user) !== null) {
      const todayCount = await getTodayUploadCount(ctx, user._id)

      if (isFileUploadLimitExceeded(user, todayCount)) {
        return null
      }
    }

    return await ctx.storage.generateUploadUrl()
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
  fileSize?: number
}

export async function saveStagedAttachmentHandler(
  ctx: SaveStagedAttachmentCtx,
  args: SaveStagedAttachmentArgs
) {
  const user = ctx.user

  const metadata = await ctx.db.system.get("_storage", args.storageId)
  const storedType = normalizeFileMimeType(metadata?.contentType)
  if (!metadata || !isStoredFileMetadataValid(metadata, args.fileType)) {
    // The storage id is caller-supplied and has no owner-verified attachment
    // record yet. Leave it unreferenced; cleanup requires a trusted ownership
    // signal so this mutation cannot delete another user's file.
    throw new Error("Stored file failed server validation")
  }

  // Re-check daily upload limit to prevent bypass via pre-fetched upload URLs.
  if (getFileUploadLimit(user) !== null) {
    const todayCount = await getTodayUploadCount(ctx, user._id)

    if (isFileUploadLimitExceeded(user, todayCount)) {
      // NOTE: We intentionally do NOT delete args.storageId here because we cannot
      // verify it belongs to this user. Deleting without ownership verification would
      // allow an attacker to delete other users' files by passing their storageId.
      // Orphaned files should be cleaned up by a scheduled background job.
      return null
    }
  }

  const normalizesImage = isImageMediaType(storedType)
  const fileUrl = normalizesImage
    ? PENDING_ATTACHMENT_URL
    : await ctx.storage.getUrl(args.storageId)
  if (fileUrl === null) throw new Error("Failed to get file URL")

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
  if (normalizesImage) {
    await ctx.scheduler.runAfter(
      0,
      internal.attachmentImages.normalizeStagedImage,
      { attachmentId, storageId: args.storageId }
    )
  }

  return attachmentId
}

export const saveStagedAttachment = authenticatedMutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
  },
  handler: saveStagedAttachmentHandler,
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
    if (!isAttachmentReady(attachment)) {
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
    if (attachment.storageId) await ctx.storage.delete(attachment.storageId)
    await ctx.db.delete(attachmentId)
  },
})

/** Composer upload readiness: a staged image stays pending until committed. */
export const getStagedAttachmentStatus = authenticatedQuery({
  args: { attachmentId: v.id("chatAttachments") },
  handler: async (ctx, { attachmentId }) => {
    const attachment = await ctx.db.get(attachmentId)
    if (!attachment || attachment.userId !== ctx.user._id) return null
    return isAttachmentReady(attachment)
      ? ("ready" as const)
      : ("pending" as const)
  },
})

type CommitStagedImageArgs = {
  attachmentId: Id<"chatAttachments">
  originalStorageId: Id<"_storage">
  normalized?: {
    storageId: Id<"_storage">
    fileType: string
    fileSize: number
  }
}

/** The staged row still waits on the normalization run for this blob. */
async function getAwaitingStagedImage(
  ctx: MutationCtx,
  attachmentId: Id<"chatAttachments">,
  originalStorageId: Id<"_storage">
) {
  const attachment = await ctx.db.get(attachmentId)
  return attachment &&
    !isAttachmentReady(attachment) &&
    attachment.storageId === originalStorageId
    ? attachment
    : null
}

/** Chat deletion's rule: keep a blob another row still references. */
async function deleteStorageIfUnreferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">
) {
  const reference = await ctx.db
    .query("chatAttachments")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first()
  if (!reference && (await ctx.db.system.get("_storage", storageId))) {
    await ctx.storage.delete(storageId)
  }
}

/**
 * Make a staged image bindable, pointing it at the normalized copy when one
 * was made. Runs only while the row is still pending, so a message can never
 * hold the URL of a blob this replaces.
 */
export async function commitStagedImageHandler(
  ctx: MutationCtx,
  { attachmentId, originalStorageId, normalized }: CommitStagedImageArgs
) {
  if (!(await getAwaitingStagedImage(ctx, attachmentId, originalStorageId))) {
    // Removed or already committed: nothing references the fresh copy.
    if (normalized) await ctx.storage.delete(normalized.storageId)
    return
  }

  const storageId = normalized?.storageId ?? originalStorageId
  const fileUrl = await ctx.storage.getUrl(storageId)
  if (!fileUrl) throw new Error("Failed to get file URL")
  await ctx.db.patch(attachmentId, {
    fileUrl,
    ...(normalized
      ? {
          storageId,
          fileType: normalized.fileType,
          fileSize: normalized.fileSize,
        }
      : {}),
  })
  if (normalized) await deleteStorageIfUnreferenced(ctx, originalStorageId)
}

export const commitStagedImage = internalMutation({
  args: {
    attachmentId: v.id("chatAttachments"),
    originalStorageId: v.id("_storage"),
    normalized: v.optional(
      v.object({
        storageId: v.id("_storage"),
        fileType: v.string(),
        fileSize: v.number(),
      })
    ),
  },
  handler: commitStagedImageHandler,
})

/**
 * Drop a staged image that could not be normalized (too large or unreadable)
 * instead of storing an original some models reject. The composer sees the
 * row disappear and fails that upload.
 */
export const rejectStagedImage = internalMutation({
  args: {
    attachmentId: v.id("chatAttachments"),
    originalStorageId: v.id("_storage"),
  },
  handler: async (ctx, { attachmentId, originalStorageId }) => {
    if (!(await getAwaitingStagedImage(ctx, attachmentId, originalStorageId)))
      return
    await ctx.db.delete(attachmentId)
    await deleteStorageIfUnreferenced(ctx, originalStorageId)
  },
})

/**
 * Owner-checked model-input attachments for one chat. The name predates PDF
 * sizing and stays for deploy compatibility with the Next.js caller.
 */
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

    const trustedAttachments = selectTrustedModelInputAttachments({
      attachments,
      references,
      chatId,
      userId: ctx.user._id,
    })

    const result: TrustedModelInputAttachment[] = []
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
      await ctx.storage.delete(attachment.storageId)
    }

    await ctx.db.delete(attachmentId)
  },
})
