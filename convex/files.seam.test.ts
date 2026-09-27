/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
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

    // The last reference releases the blob.
    await t
      .withIdentity({ subject: "workos_owner" })
      .mutation(api.files.deleteFile, { attachmentId: seeded.ownerCopy })
    expect(await exists(seeded.shared)).toBe(false)
  })
})
