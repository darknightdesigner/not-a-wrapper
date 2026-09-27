/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { ATTACHMENT_UPLOAD_WINDOW, getFileUploadLimit } from "./files"
import schema from "./schema"
import { modules } from "./test.setup"

// The stored-file reference rule (ADR-0046) through the real registrations
// and indexes: a blob survives while any attachment row or profile image
// still holds it. Duplicates predate owner-bound uploads, so they are seeded.

describe("stored-file deletion", () => {
  it("keeps a blob while another attachment or a profile image still references it", async () => {
    const t = convexTest(schema, modules)
    const seeded = await t.run(async (ctx) => {
      const shared = await ctx.storage.store(new Blob(["shared"]))
      const avatar = await ctx.storage.store(new Blob(["avatar"]))
      const owner = await ctx.db.insert("users", {
        workosUserId: "workos_owner",
        profileImageStorageId: avatar,
      })
      const other = await ctx.db.insert("users", {
        workosUserId: "workos_other",
      })
      // Staged long ago, so the 24 h cleanup applies.
      const stage = (userId: Id<"users">, storageId: Id<"_storage">) =>
        ctx.db.insert("chatAttachments", {
          userId,
          storageId,
          fileUrl: "https://files.test/staged",
          stagedAt: 1,
        })
      return {
        shared,
        avatar,
        ownerCopy: await stage(owner, shared),
        otherCopy: await stage(other, shared),
        claimedAvatar: await stage(other, avatar),
      }
    })
    const exists = (storageId: Id<"_storage">) =>
      t.run(
        async (ctx) => (await ctx.db.system.get("_storage", storageId)) !== null
      )

    await t
      .withIdentity({ subject: "workos_other" })
      .mutation(api.files.deleteFile, { attachmentId: seeded.otherCopy })
    expect(await exists(seeded.shared)).toBe(true)

    await t.mutation(internal.files.cleanupStagedAttachment, {
      attachmentId: seeded.claimedAvatar,
    })
    expect(await exists(seeded.avatar)).toBe(true)

    // A failed upload's cleanup: its commit may have landed after all.
    await t.mutation(internal.files.releaseUploadedStorage, {
      storageId: seeded.shared,
    })
    expect(await exists(seeded.shared)).toBe(true)

    // The last reference releases the blob.
    await t
      .withIdentity({ subject: "workos_owner" })
      .mutation(api.files.deleteFile, { attachmentId: seeded.ownerCopy })
    expect(await exists(seeded.shared)).toBe(false)
  })
})

describe("attachment upload admission", () => {
  afterEach(() => vi.useRealTimers())

  // The gate the upload action runs before storing a body: a replayed ticket
  // must not store anything once its owner may no longer upload.
  it("refuses a rejected account, a spent daily allowance, and a burst past the window", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"))
    const t = convexTest(schema, modules)
    const users = await t.run(async (ctx) => {
      const spent = await ctx.db.insert("users", { workosUserId: "spent" })
      for (let i = 0; i < (getFileUploadLimit({}) ?? 0); i++) {
        await ctx.db.insert("chatAttachments", {
          userId: spent,
          fileUrl: "https://files.test/today",
        })
      }
      return {
        spent,
        rejected: await ctx.db.insert("users", {
          workosUserId: "rejected",
          disabledAt: 1,
        }),
        premium: await ctx.db.insert("users", {
          workosUserId: "premium",
          premium: true,
        }),
      }
    })
    const admit = (userId: Id<"users">) =>
      t.mutation(internal.files.admitAttachmentUpload, { userId })

    expect(await admit(users.rejected)).toEqual({ status: "refused" })
    expect(await admit(users.spent)).toEqual({ status: "daily_limit" })
    for (let i = 0; i < ATTACHMENT_UPLOAD_WINDOW.limit; i++) {
      expect(await admit(users.premium)).toEqual({ status: "allowed" })
    }
    expect(await admit(users.premium)).toMatchObject({
      status: "rate_limited",
    })
  })
})
