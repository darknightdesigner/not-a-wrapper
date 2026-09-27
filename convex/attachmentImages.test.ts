import { convexTest } from "convex-test"
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { api, internal } from "./_generated/api"
import {
  ATTACHMENT_IMAGE_MAX_LONG_SIDE,
  normalizeAttachmentImage,
} from "./attachmentImages"
import schema from "./schema"
import { modules } from "./test.setup"

async function png(width: number, height: number) {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 250, g: 250, b: 250 },
    },
  })
    .png()
    .toBuffer()
}

describe("attachment image normalization", () => {
  it("keeps images that already fit and shrinks a tall screenshot", async () => {
    await expect(normalizeAttachmentImage(await png(800, 600))).resolves.toBe(
      null
    )

    const normalized = await normalizeAttachmentImage(await png(1200, 9000))
    expect(normalized?.mediaType).toBe("image/jpeg")
    const metadata = await sharp(normalized?.bytes).metadata()
    expect(metadata.format).toBe("jpeg")
    expect(metadata.height).toBe(ATTACHMENT_IMAGE_MAX_LONG_SIDE)
  })
})

describe("staged image lifecycle", () => {
  it("binds only the normalized copy and deletes the replaced original", async () => {
    const t = convexTest(schema, modules)
    const screenshot = new Uint8Array(await png(1200, 9000))
    // Seeded as saveStagedAttachment stages an image: no canonical URL yet.
    // (convex-test does not record a stored blob's content type.)
    const { attachmentId, originalStorageId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workosUserId: "workos_owner",
        email: "owner@example.com",
      })
      await ctx.db.insert("chats", {
        publicId: "chat-public",
        userId,
        public: false,
        pinned: false,
        updatedAt: 1,
      })
      const originalStorageId = await ctx.storage.store(
        new Blob([screenshot], { type: "image/png" })
      )
      const attachmentId = await ctx.db.insert("chatAttachments", {
        userId,
        storageId: originalStorageId,
        fileUrl: "",
        fileType: "image/png",
        fileSize: screenshot.byteLength,
        stagedAt: Date.now(),
      })
      return { attachmentId, originalStorageId }
    })
    const owner = t.withIdentity({ subject: "workos_owner" })
    const bind = () =>
      owner.mutation(api.files.attachStagedFiles, {
        chatId: "chat-public",
        attachmentIds: [attachmentId],
      })

    await expect(bind()).rejects.toThrow("Attachment is not ready")
    await t.action(internal.attachmentImages.normalizeStagedImage, {
      attachmentId,
      storageId: originalStorageId,
    })

    const [bound] = await bind()
    expect(bound?.contentType).toBe("image/jpeg")
    await t.run(async (ctx) => {
      const row = await ctx.db.get(attachmentId)
      expect(row?.storageId).not.toBe(originalStorageId)
      expect(bound?.url).toBe(await ctx.storage.getUrl(row!.storageId!))
      expect(await ctx.storage.get(originalStorageId)).toBeNull()
    })
  })
})
