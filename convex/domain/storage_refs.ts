import type { Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

/**
 * Stored-file references (ADR-0046). A blob is held by `chatAttachments`
 * rows and by `users.profileImageStorageId`, and by nothing else.
 */
type StorageReferenceId = Id<"chatAttachments"> | Id<"users">

/**
 * Whether any attachment row or profile image other than `except` holds the
 * blob. Two rows per index are enough to see past `except`.
 */
export async function isStorageReferenced(
  ctx: Pick<QueryCtx, "db">,
  storageId: Id<"_storage">,
  except?: StorageReferenceId
): Promise<boolean> {
  const attachments = await ctx.db
    .query("chatAttachments")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .take(2)
  if (attachments.some(({ _id }) => _id !== except)) return true
  const profiles = await ctx.db
    .query("users")
    .withIndex("by_profile_image_storage_id", (q) =>
      q.eq("profileImageStorageId", storageId)
    )
    .take(2)
  return profiles.some(({ _id }) => _id !== except)
}

/**
 * The one blob-deletion rule: delete a stored file only when no attachment
 * row and no profile image still references it. `releasing` is the caller's
 * own reference, which it removes in the same transaction, before or after
 * this call. Explicit deletion, staged cleanup, Chat and account deletion,
 * and profile-image replacement all go through here, so a duplicate
 * reference never loses its blob.
 */
export async function deleteStorageIfUnreferenced(
  ctx: Pick<MutationCtx, "db" | "storage">,
  storageId: Id<"_storage">,
  releasing?: StorageReferenceId
): Promise<boolean> {
  if (await isStorageReferenced(ctx, storageId, releasing)) return false
  if (!(await ctx.db.system.get("_storage", storageId))) return false
  await ctx.storage.delete(storageId)
  return true
}
