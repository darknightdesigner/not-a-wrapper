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
  it("keeps images that fit and stores the rest as small PNG or JPEG", async () => {
    const fits = await png(800, 600)
    await expect(normalizeAttachmentImage(fits, "image/png")).resolves.toBe(
      null
    )
    // A readable header over truncated pixel data is rejected, not kept.
    await expect(
      normalizeAttachmentImage(fits.subarray(0, fits.length - 64), "image/png")
    ).rejects.toThrow()

    const screenshot = await normalizeAttachmentImage(await png(1200, 9000))
    expect(screenshot?.mediaType).toBe("image/png")
    const metadata = await sharp(screenshot?.bytes).metadata()
    expect(metadata.format).toBe("png")
    expect(metadata.height).toBe(ATTACHMENT_IMAGE_MAX_LONG_SIDE)

    // Small but WebP: not every vision provider takes it (xAI).
    const webp = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .webp()
      .toBuffer()
    await expect(normalizeAttachmentImage(webp)).resolves.toMatchObject({
      mediaType: "image/png",
    })
  })
})

async function seedStagedImage(bytes: Uint8Array<ArrayBuffer>) {
  const t = convexTest(schema, modules)
  // Seeded as saveStagedAttachment stages an image: no canonical URL yet.
  // (convex-test does not record a stored blob's content type.)
  const ids = await t.run(async (ctx) => {
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
      new Blob([bytes], { type: "image/png" })
    )
    const attachmentId = await ctx.db.insert("chatAttachments", {
      userId,
      storageId: originalStorageId,
      fileUrl: "",
      fileType: "image/png",
      fileSize: bytes.byteLength,
      stagedAt: Date.now(),
    })
    return { attachmentId, originalStorageId }
  })
  const owner = t.withIdentity({ subject: "workos_owner" })
  const normalize = () =>
    t.action(internal.attachmentImages.normalizeStagedImage, {
      attachmentId: ids.attachmentId,
      storageId: ids.originalStorageId,
    })
  return { t, owner, normalize, ...ids }
}

describe("staged image lifecycle", () => {
  it("binds only the normalized copy and deletes the replaced original", async () => {
    const { t, owner, normalize, attachmentId, originalStorageId } =
      await seedStagedImage(new Uint8Array(await png(1200, 9000)))
    const bind = () =>
      owner.mutation(api.files.attachStagedFiles, {
        chatId: "chat-public",
        attachmentIds: [attachmentId],
      })

    await expect(bind()).rejects.toThrow("Attachment is not ready")
    await normalize()

    const [bound] = await bind()
    expect(bound?.contentType).toBe("image/png")
    await t.run(async (ctx) => {
      const row = await ctx.db.get(attachmentId)
      expect(row?.storageId).not.toBe(originalStorageId)
      expect(bound?.url).toBe(await ctx.storage.getUrl(row!.storageId!))
      expect(await ctx.storage.get(originalStorageId)).toBeNull()
    })
  })

  it("rejects an image it cannot read instead of storing it", async () => {
    const { t, owner, normalize, attachmentId, originalStorageId } =
      await seedStagedImage(new TextEncoder().encode("not an image"))

    await normalize()

    await expect(
      owner.query(api.files.getStagedAttachmentStatus, { attachmentId })
    ).resolves.toBeNull()
    await t.run(async (ctx) => {
      expect(await ctx.storage.get(originalStorageId)).toBeNull()
    })
  })
})
