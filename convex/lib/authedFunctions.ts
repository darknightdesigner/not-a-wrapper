/**
 * Authenticated handler builders — the seam that makes auth structural.
 *
 * Before this module, ~33 handlers called `ctx.auth.getUserIdentity()` inline
 * and re-derived the identity→user→ownership sequence by hand; the `auth.ts`
 * helpers existed but were a library you had to remember to call, so the seam
 * was routinely bypassed and the error contract had already drifted. These
 * builders move auth in front of the handler body: a handler defined with
 * `ownedChatMutation` cannot run without an owner-verified `ctx.chat`.
 *
 * Built on convex-helpers `customQuery`/`customMutation`, reusing the `auth.ts`
 * helpers as the injection bodies, so the resolved `user` (and `chat`/`project`/
 * `server`) land on `ctx` with full end-to-end typing. Each owned-resource
 * builder declares the resource id arg itself and passes it through, so handlers
 * keep using `args.<id>` and simply drop their own ownership check.
 *
 * Every builder resolves the caller through `getOptionalAuth`, so a deleted or
 * disabled account is rejected with the typed `account_rejected` ConvexError
 * before any handler runs, even while its access token is valid. Optional and
 * maybe builders never turn a rejected identity into a guest (ADR-0044).
 *
 * Deliberately out of scope: `internalQuery`/`internalMutation` (no client
 * identity), `httpAction` (the chat-route token path), and pure-public reads
 * with no user concept. See ADR-0003.
 */

import {
  customCtx,
  customCtxAndArgs,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions"
import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import {
  getCurrentUser,
  getOptionalAuth,
  requireCurrentUser,
  requireOwnedChatByPublicId,
  requireOwnedGenerationRun,
  requireOwnedMcpServer,
  requireOwnedProject,
  requireOwnedToolApproval,
  requireSignedInCaller,
  resolveReadableChatByPublicId,
} from "./auth"

/**
 * A query whose caller must be authenticated. Injects `ctx.user`; throws
 * "Not authenticated" / "User not found" before the handler runs.
 */
export const authenticatedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireCurrentUser(ctx) }))
)

/** A mutation whose caller must be authenticated. Injects `ctx.user`. */
export const authenticatedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireCurrentUser(ctx) }))
)

/**
 * A query that requires a signed-in identity but not a synced user row.
 * Injects `ctx.identity` and `ctx.user: Doc<"users"> | null` — for
 * self-identity-match handlers. A rejected row still throws.
 */
export const identityQuery = customQuery(
  query,
  customCtx(async (ctx) => await requireSignedInCaller(ctx))
)

/**
 * A mutation that requires a signed-in identity but not a synced user row.
 * Injects `ctx.identity` and `ctx.user: Doc<"users"> | null` — for the
 * insert-only account bootstrap. A rejected row still throws, so the bootstrap
 * can never resurrect a deleted account.
 */
export const identityMutation = customMutation(
  mutation,
  customCtx(async (ctx) => await requireSignedInCaller(ctx))
)

/**
 * A query that resolves the caller if present. Injects
 * `ctx.user: Doc<"users"> | null` — for authenticated reads that degrade to an
 * empty/null result for signed-out callers. Throws only for a rejected account.
 */
export const maybeAuthQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await getCurrentUser(ctx) }))
)

/**
 * A mutation that resolves the caller if present. Injects
 * `ctx.user: Doc<"users"> | null` — for writes that no-op for signed-out
 * callers. Throws only for a rejected account.
 */
export const maybeAuthMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await getCurrentUser(ctx) }))
)

/**
 * A query for optional-auth / anonymous read paths. Injects both
 * `ctx.identity` (raw, nullable) and `ctx.user` (nullable), so the handler can
 * distinguish a guest from an unsynced user. Throws only for a rejected
 * account.
 */
export const optionalAuthQuery = customQuery(
  query,
  customCtx(async (ctx) => await getOptionalAuth(ctx))
)

/**
 * A mutation for optional-auth / anonymous write paths (usage counters, rate
 * limits). Injects `ctx.identity` and `ctx.user`, both nullable. Never throws on
 * a missing caller; throws for a rejected account.
 */
export const optionalAuthMutation = customMutation(
  mutation,
  customCtx(async (ctx) => await getOptionalAuth(ctx))
)

// Every client-facing `chatId` is the client-minted publicId (ADR-0033); the
// builders below resolve it to the owner-verified document exactly once. The
// owned builders hand their handlers the resolved internal id as `args.chatId`
// so nothing behind the boundary ever holds an unresolved public id.

/**
 * A non-throwing read of a chat the caller owns. Injects
 * `ctx.chat: Doc<"chats"> | null` (null for a guest, another user, or a
 * missing chat) and `ctx.user: Doc<"users"> | null`. A shared chat stays
 * private here; strangers read it through its share link (ADR-0043). A
 * rejected account throws. Consumes a `chatId` arg (publicId) and passes it
 * through.
 */
export const readableChatQuery = customQuery(
  query,
  customCtxAndArgs({
    args: { chatId: v.string() },
    input: async (ctx, { chatId }) => {
      const { user, chat } = await resolveReadableChatByPublicId(ctx, chatId)
      return { ctx: { chat, user }, args: { chatId } }
    },
  })
)

/**
 * A read restricted to the chat's owner that throws "Not authenticated" /
 * "Chat not found" / "Not authorized". Injects owner-verified `ctx.chat` and
 * `ctx.user`. Consumes a `chatId` arg (publicId) and passes it through. Use
 * `readableChatQuery` instead when a non-owner should get null, not an error.
 */
export const ownedChatQuery = customQuery(
  query,
  customCtxAndArgs({
    args: { chatId: v.string() },
    input: async (ctx, { chatId }) => {
      const { user, chat } = await requireOwnedChatByPublicId(ctx, chatId)
      return { ctx: { user, chat }, args: { chatId: chat._id } }
    },
  })
)

/**
 * A mutation on a chat the caller owns. Injects owner-verified `ctx.chat` and
 * `ctx.user`; throws "Not authenticated" / "Chat not found" / "Not authorized".
 * Consumes a `chatId` arg (publicId) and passes it through.
 */
export const ownedChatMutation = customMutation(
  mutation,
  customCtxAndArgs({
    args: { chatId: v.string() },
    input: async (ctx, { chatId }) => {
      const { user, chat } = await requireOwnedChatByPublicId(ctx, chatId)
      return { ctx: { user, chat }, args: { chatId: chat._id } }
    },
  })
)

/**
 * A mutation on a generation run the caller owns. Authenticates before reading
 * the run row, then injects owner-verified `ctx.run`, `ctx.chat`, and
 * `ctx.user`; throws "Not authenticated" for guests, "Not authorized" for
 * authenticated callers without a synced user row, and "Run not found" for
 * missing, not-owned, or inconsistent run rows. Consumes a `runId` arg and
 * passes it through.
 *
 * Deriving the chat from `run.chatId` makes the old hand-written
 * `run.chatId !== args.chatId` cross-check structurally impossible to get wrong:
 * there is no second chat id to disagree with. `prepareGeneration` stays on
 * `ownedChatMutation` because it *creates* the run — there is none to key on yet.
 */
export const ownedGenerationRunMutation = customMutation(
  mutation,
  customCtxAndArgs({
    args: { runId: v.id("generationRuns") },
    input: async (ctx, { runId }) => {
      const { user, chat, run } = await requireOwnedGenerationRun(ctx, runId)
      return { ctx: { user, chat, run }, args: { runId } }
    },
  })
)

/**
 * A mutation on a tool approval request the caller owns. Keyed on the public
 * `approvalId`; injects owner-verified `ctx.approval`, `ctx.run`, `ctx.chat`,
 * and `ctx.user`. Throws "Not authenticated" / "Not authorized" for the caller
 * and "Approval not found" for missing, not-owned, or inconsistent rows.
 * Consumes an `approvalId` arg and passes it through.
 */
export const ownedToolApprovalMutation = customMutation(
  mutation,
  customCtxAndArgs({
    args: { approvalId: v.string() },
    input: async (ctx, { approvalId }) => {
      const { user, chat, run, approval } = await requireOwnedToolApproval(
        ctx,
        approvalId
      )
      return { ctx: { user, chat, run, approval }, args: { approvalId } }
    },
  })
)

/**
 * A mutation on a project the caller owns. Injects owner-verified `ctx.project`
 * and `ctx.user`. Consumes a `projectId` arg and passes it through.
 */
export const ownedProjectMutation = customMutation(
  mutation,
  customCtxAndArgs({
    args: { projectId: v.id("projects") },
    input: async (ctx, { projectId }) => {
      const { user, project } = await requireOwnedProject(ctx, projectId)
      return { ctx: { user, project }, args: { projectId } }
    },
  })
)

/**
 * A query on a project the caller owns. Injects owner-verified `ctx.project` and
 * `ctx.user`. Consumes a `projectId` arg and passes it through.
 */
export const ownedProjectQuery = customQuery(
  query,
  customCtxAndArgs({
    args: { projectId: v.id("projects") },
    input: async (ctx, { projectId }) => {
      const { user, project } = await requireOwnedProject(ctx, projectId)
      return { ctx: { user, project }, args: { projectId } }
    },
  })
)

/**
 * A mutation on an MCP server the caller owns. Injects owner-verified
 * `ctx.server` and `ctx.user`; throws "Not authenticated" / "Server not found" /
 * "Not authorized". Consumes a `serverId` arg and passes it through.
 */
export const ownedMcpServerMutation = customMutation(
  mutation,
  customCtxAndArgs({
    args: { serverId: v.id("mcpServers") },
    input: async (ctx, { serverId }) => {
      const { user, server } = await requireOwnedMcpServer(ctx, serverId)
      return { ctx: { user, server }, args: { serverId } }
    },
  })
)

/**
 * A query on an MCP server the caller owns. Injects owner-verified `ctx.server`
 * and `ctx.user`. Consumes a `serverId` arg and passes it through.
 */
export const ownedMcpServerQuery = customQuery(
  query,
  customCtxAndArgs({
    args: { serverId: v.id("mcpServers") },
    input: async (ctx, { serverId }) => {
      const { user, server } = await requireOwnedMcpServer(ctx, serverId)
      return { ctx: { user, server }, args: { serverId } }
    },
  })
)
