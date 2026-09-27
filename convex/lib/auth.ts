import { ConvexError } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

type ConvexCtx = QueryCtx | MutationCtx
type ChatActivityCtx = Pick<QueryCtx, "db">
type IdentityCtx = Pick<QueryCtx, "auth">
type Identity = NonNullable<
  Awaited<ReturnType<IdentityCtx["auth"]["getUserIdentity"]>>
>

/** ConvexError code for a rejected account (ADR-0044). */
export const ACCOUNT_REJECTED_CODE = "account_rejected"

/**
 * A deleted (permanent, from WorkOS) or disabled account. The boundary
 * rejects it even while the caller's access token is still valid.
 */
export function isRejectedAccount(
  user: Pick<Doc<"users">, "deletedAt" | "disabledAt">
): boolean {
  return user.deletedAt !== undefined || user.disabledAt !== undefined
}

/** True for the typed rejection, on the server, the client, or Next. */
export function isAccountRejectedError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false
  const data: unknown = error.data
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === ACCOUNT_REJECTED_CODE
  )
}

export type AuthenticatedChatOwner = {
  user: Doc<"users">
  chat: Doc<"chats">
}

/**
 * A chat owner plus the generation run the caller is acting on. Ownership is
 * transitive: the run is reached through its `chatId`, so verifying the chat
 * owner verifies the run. Injected by `ownedGenerationRunMutation`.
 */
export type AuthenticatedRunOwner = AuthenticatedChatOwner & {
  run: Doc<"generationRuns">
}

/**
 * A run owner plus the tool approval request the caller is deciding on.
 * Ownership is transitive through approval → run → chat. Injected by
 * `ownedToolApprovalMutation`.
 */
export type AuthenticatedToolApprovalOwner = AuthenticatedRunOwner & {
  approval: Doc<"toolApprovalRequests">
}

/** A chat is active when neither it, its linked project, nor its owner's
 * account is deleted. The ancestor reads are required so tombstoning a
 * project or an account instantly revokes every chat (share links included)
 * without patching children. Fail closed on a dangling projectId or owner
 * (same policy as chat_project_link). */
export function isChatDocActive(chat: Doc<"chats">): boolean {
  return chat.deletingAt === undefined
}

export async function isChatActive(
  ctx: ChatActivityCtx,
  chat: Doc<"chats">
): Promise<boolean> {
  if (!isChatDocActive(chat)) return false
  const owner = await ctx.db.get(chat.userId)
  if (!owner || isRejectedAccount(owner)) return false
  if (!chat.projectId) return true
  const project = await ctx.db.get(chat.projectId)
  return project !== null && project.deletingAt === undefined
}

/**
 * Parent-aware projection for bounded Chat result sets. Project ids are
 * de-duplicated so a page containing siblings reads each logical root once;
 * missing projects fail closed like `isChatActive`. Only for owner-scoped
 * reads: the caller's builder already rejected a rejected owner account, so
 * the owner read is not repeated per chat.
 */
export async function filterActiveChats(
  ctx: ChatActivityCtx,
  chats: readonly Doc<"chats">[]
): Promise<Doc<"chats">[]> {
  const rootActiveChats = chats.filter(isChatDocActive)
  const projectIds = [
    ...new Set(
      rootActiveChats.flatMap((chat) =>
        chat.projectId ? [chat.projectId] : []
      )
    ),
  ]
  const projects = await Promise.all(
    projectIds.map(async (projectId) => await ctx.db.get(projectId))
  )
  const activeProjectIds = new Set(
    projects
      .filter(
        (project): project is Doc<"projects"> =>
          project !== null && project.deletingAt === undefined
      )
      .map((project) => project._id)
  )

  return rootActiveChats.filter(
    (chat) => !chat.projectId || activeProjectIds.has(chat.projectId)
  )
}

async function getUserByWorkosSubject(ctx: ConvexCtx, subject: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", subject))
    .unique()
}

/**
 * The one caller resolution every builder goes through (ADR-0044). Returns
 * both the raw identity and the synced user row, each nullable, so optional
 * paths can tell a guest (no identity) from an unsynced user (identity, no
 * row). A deleted or disabled row never resolves: it throws the typed
 * rejection, so a rejected account can neither act as itself nor fall
 * through to guest behavior.
 */
export async function getOptionalAuth(ctx: ConvexCtx): Promise<{
  identity: Identity | null
  user: Doc<"users"> | null
}> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return { identity: null, user: null }
  const user = await getUserByWorkosSubject(ctx, identity.subject)
  if (user && isRejectedAccount(user)) {
    throw new ConvexError({ code: ACCOUNT_REJECTED_CODE })
  }
  return { identity, user }
}

export async function getCurrentUser(
  ctx: ConvexCtx
): Promise<Doc<"users"> | null> {
  return (await getOptionalAuth(ctx)).user
}

/**
 * Require a signed-in caller whose row may not exist yet (the bootstrap and
 * self-identity-match handlers). A rejected row still throws.
 */
export async function requireSignedInCaller(ctx: ConvexCtx): Promise<{
  identity: Identity
  user: Doc<"users"> | null
}> {
  const { identity, user } = await getOptionalAuth(ctx)
  if (!identity) throw new Error("Not authenticated")
  return { identity, user }
}

/**
 * Require a signed-in caller's raw identity without resolving the user row.
 * Only for HTTP actions, which have no `db`: account state is enforced by the
 * mutations they call, never by this check alone.
 */
export async function requireIdentity(ctx: IdentityCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Not authenticated")
  return identity
}

export async function requireCurrentUser(
  ctx: ConvexCtx
): Promise<Doc<"users">> {
  const { user } = await requireSignedInCaller(ctx)
  if (!user) throw new Error("User not found")
  return user
}

/**
 * The client-facing chat lookup (ADR-0033): clients only ever name a chat by
 * its client-minted `publicId`; `_id` never crosses the boundary. Unique by
 * construction (creation is idempotent on publicId in one transaction).
 */
export async function findChatByPublicId(
  ctx: ChatActivityCtx,
  publicId: string
): Promise<Doc<"chats"> | null> {
  return await ctx.db
    .query("chats")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique()
}

// Resolve the caller BEFORE the chat read: a rejected account is denied even
// for public chats, never served as a guest.
async function resolveChatForRead(
  ctx: ConvexCtx,
  loadChat: () => Promise<Doc<"chats"> | null>
): Promise<{ user: Doc<"users"> | null; chat: Doc<"chats"> | null }> {
  const user = await getCurrentUser(ctx)
  const chat = await loadChat()
  if (!chat || !(await isChatActive(ctx, chat))) return { user, chat: null }
  if (chat.public || chat.userId === user?._id) return { user, chat }
  return { user, chat: null }
}

export async function getAuthorizedChatForRead(
  ctx: ConvexCtx,
  chatId: Id<"chats">
): Promise<Doc<"chats"> | null> {
  return (await resolveChatForRead(ctx, () => ctx.db.get(chatId))).chat
}

/**
 * Boundary read: the owner, or anyone when the chat is public. Returns the
 * resolved caller beside the chat (null when not readable).
 */
export async function resolveReadableChatByPublicId(
  ctx: ConvexCtx,
  publicId: string
): Promise<{ user: Doc<"users"> | null; chat: Doc<"chats"> | null }> {
  return await resolveChatForRead(ctx, () => findChatByPublicId(ctx, publicId))
}

export async function getReadableChatByPublicId(
  ctx: ConvexCtx,
  publicId: string
): Promise<Doc<"chats"> | null> {
  return (await resolveReadableChatByPublicId(ctx, publicId)).chat
}

// Authenticate BEFORE the chat read: an unauthenticated caller never touches
// the chat row, and the same predicate serves both id shapes.
async function requireOwnedChatDoc(
  ctx: ConvexCtx,
  loadChat: () => Promise<Doc<"chats"> | null>
): Promise<AuthenticatedChatOwner> {
  const user = await requireUserForOwnedResource(ctx)
  const chat = await loadChat()
  if (!chat) throw new Error("Chat not found")

  if (chat.userId !== user._id) {
    throw new Error("Not authorized")
  }
  if (!(await isChatActive(ctx, chat))) throw new Error("Chat not found")

  return { user, chat }
}

export async function requireOwnedChat(
  ctx: ConvexCtx,
  chatId: Id<"chats">
): Promise<AuthenticatedChatOwner> {
  return await requireOwnedChatDoc(ctx, () => ctx.db.get(chatId))
}

/**
 * Boundary ownership check: resolves a client `publicId` to the owner-verified
 * chat exactly once, so no handler behind it ever sees an unresolved id.
 */
export async function requireOwnedChatByPublicId(
  ctx: ConvexCtx,
  publicId: string
): Promise<AuthenticatedChatOwner> {
  return await requireOwnedChatDoc(ctx, () =>
    findChatByPublicId(ctx, publicId)
  )
}

async function requireUserForOwnedResource(
  ctx: ConvexCtx
): Promise<Doc<"users">> {
  const { user } = await requireSignedInCaller(ctx)
  if (!user) throw new Error("Not authorized")
  return user
}

/**
 * Require the caller to own a generation run without exposing whether another
 * user's run exists. Auth is resolved before reading `generationRuns`, then
 * missing, not-owned, and broken-link rows all collapse to "Run not found".
 * Returns the owner-verified user, chat, and run. Backs
 * `ownedGenerationRunMutation`.
 */
export async function requireOwnedGenerationRun(
  ctx: ConvexCtx,
  runId: Id<"generationRuns">
): Promise<AuthenticatedRunOwner> {
  const user = await requireUserForOwnedResource(ctx)
  const run = await ctx.db.get(runId)
  if (!run) throw new Error("Run not found")
  if (run.userId !== user._id) throw new Error("Run not found")

  const chat = await ctx.db.get(run.chatId)
  if (!chat || chat.userId !== user._id) throw new Error("Run not found")
  if (!(await isChatActive(ctx, chat))) throw new Error("Run not found")

  return { user, chat, run }
}

/**
 * Require the caller to own a tool approval request, keyed by the public
 * `approvalId`. Same shape as `requireOwnedGenerationRun`: auth first, then
 * missing, not-owned, and broken-link rows all collapse to "Approval not
 * found". Backs `ownedToolApprovalMutation`.
 */
export async function requireOwnedToolApproval(
  ctx: ConvexCtx,
  approvalId: string
): Promise<AuthenticatedToolApprovalOwner> {
  const user = await requireUserForOwnedResource(ctx)
  const approval = await ctx.db
    .query("toolApprovalRequests")
    .withIndex("by_approval", (q) => q.eq("approvalId", approvalId))
    .unique()
  if (!approval || approval.userId !== user._id) {
    throw new Error("Approval not found")
  }

  const run = await ctx.db.get(approval.runId)
  if (!run || run.userId !== user._id) throw new Error("Approval not found")

  const chat = await ctx.db.get(run.chatId)
  if (!chat || chat.userId !== user._id) throw new Error("Approval not found")
  if (!(await isChatActive(ctx, chat))) throw new Error("Approval not found")

  return { user, chat, run, approval }
}

export async function requireOwnedProject(
  ctx: ConvexCtx,
  projectId: Id<"projects">
): Promise<{ user: Doc<"users">; project: Doc<"projects"> }> {
  const { user } = await requireSignedInCaller(ctx)
  const project = await ctx.db.get(projectId)
  if (!project) throw new Error("Project not found")

  if (!user || project.userId !== user._id) {
    throw new Error("Not authorized")
  }
  if (project.deletingAt !== undefined) throw new Error("Project not found")

  return { user, project }
}

export async function requireOwnedMcpServer(
  ctx: ConvexCtx,
  serverId: Id<"mcpServers">
): Promise<{ user: Doc<"users">; server: Doc<"mcpServers"> }> {
  const { user } = await requireSignedInCaller(ctx)
  const server = await ctx.db.get(serverId)
  if (!server) throw new Error("MCP server not found")

  if (!user || server.userId !== user._id) {
    throw new Error("Not authorized")
  }

  return { user, server }
}
