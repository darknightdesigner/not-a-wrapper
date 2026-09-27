import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { patchChatActivity } from "./domain/project_activity"
import {
  findShareTail,
  isShareId,
  mintShareId,
  projectSharedChat,
  selectSharedPath,
  type SharedChatView,
} from "./domain/share_view"
import { isChatActive } from "./lib/auth"
import { ownedChatMutation } from "./lib/authedFunctions"
import { listMessagesByChatOrder } from "./messages"

// Share links (ADR-0043). A link is an unguessable id plus a snapshot tail;
// the chat's private publicId never grants a stranger anything.

async function findShareForChat(
  ctx: Pick<QueryCtx, "db">,
  chatId: Id<"chats">
) {
  return await ctx.db
    .query("chatShares")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .unique()
}

/**
 * Share the chat as it is now. Sharing again while a link exists moves its
 * snapshot (path and title) to the current chat and keeps its id; after a
 * revoke the next share mints a new id, so a revoked URL never comes back.
 */
export async function publishChatShare(
  ctx: MutationCtx,
  chat: Doc<"chats">
): Promise<{ shareId: string }> {
  const tail = findShareTail(await listMessagesByChatOrder(ctx, chat._id))
  if (!tail) throw new Error("Nothing to share")

  const now = Date.now()
  const snapshot = { throughMessageId: tail._id, title: chat.title }
  const existing = await findShareForChat(ctx, chat._id)
  let shareId: string
  if (existing) {
    shareId = existing.shareId
    await ctx.db.patch(existing._id, { ...snapshot, updatedAt: now })
  } else {
    shareId = mintShareId()
    await ctx.db.insert("chatShares", {
      shareId,
      chatId: chat._id,
      ...snapshot,
      createdAt: now,
      updatedAt: now,
    })
  }
  await patchChatActivity(ctx, chat, { public: true }, now)
  return { shareId }
}

export const publish = ownedChatMutation({
  args: {},
  handler: async (ctx) => await publishChatShare(ctx, ctx.chat),
})

/**
 * Delete a chat's share link; its URL is not found from this commit on. Chat
 * deletion calls this in the tombstone commit (ADR-0014, ADR-0044).
 */
export async function deleteChatShare(
  ctx: Pick<MutationCtx, "db">,
  chatId: Id<"chats">
): Promise<void> {
  const share = await findShareForChat(ctx, chatId)
  if (share) await ctx.db.delete(share._id)
}

export const revoke = ownedChatMutation({
  args: {},
  handler: async (ctx) => {
    await deleteChatShare(ctx, ctx.chat._id)
    await patchChatActivity(ctx, ctx.chat, { public: false }, Date.now())
  },
})

/**
 * The public read behind `/share/<shareId>`: no caller, allowlisted view.
 * Null when the link is revoked, or the chat, its project, or its owner's
 * account is deleted (the `isChatActive` ancestor reads).
 */
export async function getSharedChatView(
  ctx: Pick<QueryCtx, "db">,
  shareId: string
): Promise<SharedChatView | null> {
  if (!isShareId(shareId)) return null
  const share = await ctx.db
    .query("chatShares")
    .withIndex("by_share_id", (q) => q.eq("shareId", shareId))
    .unique()
  if (!share) return null
  const chat = await ctx.db.get(share.chatId)
  if (!chat || !(await isChatActive(ctx, chat))) return null

  const path = selectSharedPath(
    await listMessagesByChatOrder(ctx, chat._id),
    share.throughMessageId
  )
  return path ? projectSharedChat(share, chat, path) : null
}

export const getPublic = query({
  args: { shareId: v.string() },
  handler: async (ctx, { shareId }) => await getSharedChatView(ctx, shareId),
})
