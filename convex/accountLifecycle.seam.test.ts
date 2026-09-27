/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "./_generated/api"
import type { TableNames } from "./_generated/dataModel"
import schema from "./schema"
import { modules } from "./test.setup"
import {
  softDeleteAppUserFromWorkOS,
  upsertAppUserFromWorkOS,
} from "./userSync"

// Account lifecycle seam (ADR-0044): the rejected-account rule through the
// real builders, the insert-only bootstrap, and the account deletion drain.

const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>

const REJECTED = { data: { code: "account_rejected" } }

async function seedUser(
  t: T,
  workosUserId: string,
  lifecycle: { deletedAt?: number; disabledAt?: number } = {}
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workosUserId,
      email: `${workosUserId}@example.com`,
      ...lifecycle,
    })
    const publicId = `${workosUserId}-shared`
    await ctx.db.insert("chats", {
      publicId,
      userId,
      public: true,
      pinned: false,
      updatedAt: 1,
    })
    return { userId, publicId }
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe("rejected account at the auth boundary", () => {
  it("denies a still-valid identity on every builder kind and never serves it as a guest", async () => {
    const t = makeT()
    const deleted = await seedUser(t, "workos_deleted", { deletedAt: 1 })
    const disabled = await seedUser(t, "workos_disabled", { disabledAt: 1 })

    for (const subject of ["workos_deleted", "workos_disabled"]) {
      const caller = t.withIdentity({ subject })
      const { publicId } = subject === "workos_deleted" ? deleted : disabled
      await expect(
        caller.query(api.users.getCurrent, {})
      ).rejects.toMatchObject(REJECTED)
      // An anonymous id must not turn the identity into a guest admission.
      await expect(
        caller.mutation(api.usage.admit, { anonymousId: "guest_1" })
      ).rejects.toMatchObject(REJECTED)
      await expect(
        caller.query(api.userKeys.getKeySettings, {})
      ).rejects.toMatchObject(REJECTED)
      await expect(
        caller.query(api.chats.getById, { chatId: publicId })
      ).rejects.toMatchObject(REJECTED)
      await expect(
        caller.mutation(api.chats.remove, { chatId: publicId })
      ).rejects.toMatchObject(REJECTED)
      await expect(
        caller.mutation(api.users.ensureCurrent, {})
      ).rejects.toMatchObject(REJECTED)
    }

    // A real guest keeps guest behavior, but the rejected owner's share link
    // is gone without touching the chat row.
    await expect(
      t.mutation(api.usage.admit, { anonymousId: "guest_1" })
    ).resolves.toMatchObject({ canSend: true })
    await expect(
      t.query(api.chats.getPublicById, { chatId: deleted.publicId })
    ).resolves.toBeNull()
    await expect(
      t.query(api.chats.getPublicById, { chatId: disabled.publicId })
    ).resolves.toBeNull()
  })
})

describe("account bootstrap and profile sync", () => {
  it("inserts from verified claims only and can never clear the flags or resurrect a tombstone", async () => {
    const t = makeT()
    const fresh = t.withIdentity({
      subject: "workos_new",
      email: "claim@x.dev",
    })
    const userId = await fresh.mutation(api.users.ensureCurrent, {})
    await t.run((ctx) => ctx.db.patch(userId, { displayName: "Webhook Name" }))
    await expect(fresh.mutation(api.users.ensureCurrent, {})).resolves.toBe(
      userId
    )
    const inserted = await t.run((ctx) => ctx.db.get(userId))
    expect(inserted).toMatchObject({
      email: "claim@x.dev",
      displayName: "Webhook Name",
    })
    expect(inserted?.workosUpdatedAt).toBeUndefined()

    const { userId: deletedId } = await seedUser(t, "workos_gone", {
      deletedAt: 5,
      disabledAt: 5,
    })
    await expect(
      t
        .withIdentity({ subject: "workos_gone" })
        .mutation(api.users.ensureCurrent, {})
    ).rejects.toMatchObject(REJECTED)
    // Even a newer verified profile event leaves the tombstone as it is.
    await t.run((ctx) =>
      upsertAppUserFromWorkOS(ctx, {
        workosUserId: "workos_gone",
        email: "back@x.dev",
        workosUpdatedAt: "2999-01-01T00:00:00.000Z",
      })
    )
    const tombstone = await t.run((ctx) => ctx.db.get(deletedId))
    expect(tombstone).toMatchObject({
      deletedAt: 5,
      disabledAt: 5,
      email: "workos_gone@example.com",
    })
    expect(tombstone?.workosUpdatedAt).toBeUndefined()
  })
})

describe("account deletion drain", () => {
  it("closes live runs and pending approvals before any phase that can block", async () => {
    vi.useFakeTimers()
    const t = makeT()
    const seeded = await t.run(async (ctx) => {
      const now = Date.now()
      const userId = await ctx.db.insert("users", {
        workosUserId: "workos_live",
      })
      const runIds = []
      // A lease-expired stream and an expired approval pause: exactly the rows
      // the reapers would skip (and rescan) forever behind a blocked job.
      for (const status of ["streaming", "awaiting_approval"] as const) {
        const chatId = await ctx.db.insert("chats", {
          publicId: `live-${status}`,
          userId,
          public: false,
          pinned: false,
          updatedAt: 1,
        })
        const messageId = await ctx.db.insert("messages", {
          chatId,
          orderId: 1,
          role: "assistant",
          content: "",
          parts: [],
          status,
          createdAt: 1,
          updatedAt: 1,
        })
        const runId = await ctx.db.insert("generationRuns", {
          chatId,
          userId,
          requestId: `request_${status}`,
          model: "gpt-5-mini",
          provider: "openai",
          assistantMessageId: messageId,
          status,
          leaseExpiresAt: status === "streaming" ? now - 1 : undefined,
          updatedAt: 1,
        })
        runIds.push(runId)
        if (status === "awaiting_approval") {
          await ctx.db.insert("toolApprovalRequests", {
            chatId,
            runId,
            assistantMessageId: messageId,
            userId,
            toolCallId: "call_1",
            toolName: "send_email",
            source: "mcp",
            riskClass: "destructive",
            approvalId: "approval_live",
            status: "pending",
            createdAt: 1,
            expiresAt: now - 1,
          })
        }
      }
      return { runIds }
    })
    await t.run((ctx) =>
      softDeleteAppUserFromWorkOS(ctx, { workosUserId: "workos_live" })
    )

    const readState = () =>
      t.run(async (ctx) => ({
        job: (await ctx.db.query("deletionJobs").collect())[0],
        runs: await Promise.all(seeded.runIds.map((id) => ctx.db.get(id))),
        approvals: await ctx.db.query("toolApprovalRequests").collect(),
        chats: await ctx.db.query("chats").collect(),
      }))
    let state = await readState()
    for (let batch = 0; batch < 5 && state.job?.phase === "liveRuns"; batch++) {
      await t.mutation(internal.deletionCleanup.runDeletionBatch, {
        jobId: state.job._id,
      })
      state = await readState()
    }

    expect(state.job).toMatchObject({ phase: "chats", state: "running" })
    expect(state.runs.map((run) => run?.status)).toEqual(["aborted", "aborted"])
    expect(state.approvals.map((approval) => approval.status)).toEqual([
      "denied",
    ])
    // Nothing is deleted yet; only live work was settled.
    expect(state.chats).toHaveLength(2)
  })

  it("drains every owned row, keeps usage evidence and the scrubbed tombstone, and spares other accounts", async () => {
    vi.useFakeTimers()
    const t = makeT()
    const owner = "workos_owner"
    const other = await seedUser(t, "workos_other")
    const seeded = await t.run(async (ctx) => {
      const avatar = await ctx.storage.store(new Blob(["avatar"]))
      const staged = await ctx.storage.store(new Blob(["staged"]))
      const userId = await ctx.db.insert("users", {
        workosUserId: owner,
        email: "owner@example.com",
        systemPrompt: "private",
        profileImageStorageId: avatar,
        // A planted far-future stamp must not block deletion (audit).
        workosUpdatedAt: "2999-01-01T00:00:00.000Z",
      })
      const projectId = await ctx.db.insert("projects", {
        userId,
        name: "P",
        updatedAt: 1,
        pinned: false,
      })
      for (const [publicId, linked] of [
        ["owner-shared", undefined],
        ["owner-in-project", projectId],
      ] as const) {
        const chatId = await ctx.db.insert("chats", {
          publicId,
          userId,
          projectId: linked,
          public: true,
          pinned: false,
          updatedAt: 1,
        })
        await ctx.db.insert("messages", {
          chatId,
          orderId: 1,
          role: "user",
          content: "hi",
          parts: [],
          status: "completed",
          createdAt: 1,
          updatedAt: 1,
        })
      }
      await ctx.db.insert("chatAttachments", {
        userId,
        storageId: staged,
        fileUrl: "https://files.test/staged",
        stagedAt: 1,
      })
      const serverId = await ctx.db.insert("mcpServers", {
        userId,
        name: "S",
        url: "https://mcp.test",
        transport: "http",
        enabled: true,
        createdAt: 1,
      })
      await ctx.db.insert("mcpToolApprovals", {
        userId,
        serverId,
        toolName: "t",
        approved: true,
      })
      await ctx.db.insert("userKeys", {
        userId,
        provider: "openai",
        encryptedKey: "cipher",
        iv: "iv",
      })
      await ctx.db.insert("userPreferences", { userId })
      await ctx.db.insert("feedback", { userId, message: "m" })
      await ctx.db.insert("toolCallLog", {
        userId,
        toolName: "t",
        toolCallId: "call_1",
        success: true,
        createdAt: 1,
        source: "builtin",
      })
      const bucketId = await ctx.db.insert("usageBuckets", {
        userId,
        bucketKind: "included",
        periodKey: "2026-09",
        periodStart: 0,
        periodEnd: 1,
        planId: "free",
        grantedCredits: 1,
        availableCredits: 1,
        reservedCredits: 0,
        spentCredits: 0,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      })
      return { userId, avatar, staged, bucketId }
    })
    // Limiter rows through their real writers, so the actor keys cannot drift.
    const signedIn = t.withIdentity({ subject: owner })
    await signedIn.mutation(api.toolLimits.checkAndConsume, {
      limitType: "domain",
      toolName: "extract_content",
      keyMode: "platform",
      scopeCounts: [{ scopeKey: "example.com", count: 1 }],
      windowMs: 60_000,
      maxCount: 10,
      bucketSizeMs: 60_000,
    })
    await signedIn.mutation(api.rateLimits.consume, { bucket: "mcp_test" })

    await t.run((ctx) =>
      softDeleteAppUserFromWorkOS(ctx, {
        workosUserId: owner,
        workosUpdatedAt: "2026-01-01T00:00:00.000Z",
      })
    )
    // Logically immediate: share links die before any row is drained.
    await expect(
      t.query(api.chats.getPublicById, { chatId: "owner-shared" })
    ).resolves.toBeNull()

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const ownedTables: TableNames[] = [
      "chats",
      "messages",
      "projects",
      "chatAttachments",
      "mcpServers",
      "mcpToolApprovals",
      "userKeys",
      "userPreferences",
      "feedback",
      "toolCallLog",
      "toolLimitBuckets",
      "apiRateLimits",
    ]
    const remaining = await t.run(async (ctx) => {
      const counts: Record<string, number> = {}
      for (const table of ownedTables) {
        counts[table] = (await ctx.db.query(table).collect()).length
      }
      return counts
    })
    // Only the other account's shared chat survives.
    expect(remaining).toEqual({
      ...Object.fromEntries(ownedTables.map((table) => [table, 0])),
      chats: 1,
    })
    await expect(
      t.query(api.chats.getPublicById, { chatId: other.publicId })
    ).resolves.not.toBeNull()

    const after = await t.run(async (ctx) => ({
      tombstone: await ctx.db.get(seeded.userId),
      bucket: await ctx.db.get(seeded.bucketId),
      avatar: await ctx.storage.get(seeded.avatar),
      staged: await ctx.storage.get(seeded.staged),
      jobs: await ctx.db.query("deletionJobs").collect(),
    }))
    expect(after.tombstone).toMatchObject({ workosUserId: owner })
    expect(after.tombstone?.deletedAt).toBeTypeOf("number")
    expect(after.tombstone?.email).toBeUndefined()
    expect(after.tombstone?.systemPrompt).toBeUndefined()
    expect(after.bucket).not.toBeNull()
    expect(after.avatar).toBeNull()
    expect(after.staged).toBeNull()
    expect(after.jobs).toMatchObject([
      { targetKind: "account", userId: seeded.userId, state: "complete" },
    ])
  })
})
