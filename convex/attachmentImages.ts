"use node"

import { v } from "convex/values"
import sharp from "sharp"
import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"

/**
 * Claude rejects a side over 8000 px, and over 2000 px once a request holds
 * more than 20 images; OpenAI and Claude downscale past this anyway.
 */
export const ATTACHMENT_IMAGE_MAX_LONG_SIDE = 2000
/** Below Anthropic's 5 MB per-image cap. */
export const ATTACHMENT_IMAGE_MAX_BYTES = 4 * 1024 * 1024
/**
 * sharp's default decompression-bomb guard. A tall full-page screenshot fits
 * well inside it; anything past it is rejected, never stored unresized.
 */
const ATTACHMENT_IMAGE_MAX_INPUT_PIXELS = 0x3fff ** 2
const ATTACHMENT_IMAGE_TIMEOUT_SECONDS = 20
const ATTACHMENT_IMAGE_QUALITY = 85

export type NormalizedAttachmentImage = {
  bytes: Uint8Array<ArrayBuffer>
  mediaType: "image/jpeg" | "image/png"
}

/**
 * Shrink and re-encode an image once so the stored copy is safe for every
 * vision model (LibreChat resizes at upload the same way). The output is
 * always JPEG or PNG, the two formats every provider takes (xAI takes only
 * these). Returns null when the original already fits and is stored under its
 * real type; throws when the image cannot be fully decoded within the limits.
 */
export async function normalizeAttachmentImage(
  bytes: Uint8Array,
  storedMediaType?: string
): Promise<NormalizedAttachmentImage | null> {
  const input = {
    limitInputPixels: ATTACHMENT_IMAGE_MAX_INPUT_PIXELS,
    sequentialRead: true,
  }
  const { width, height, format, hasAlpha } = await sharp(
    bytes,
    input
  ).metadata()
  if (!width || !height) throw new Error("Image dimensions are unreadable")
  if (
    (format === "jpeg" || format === "png") &&
    storedMediaType === `image/${format}` &&
    Math.max(width, height) <= ATTACHMENT_IMAGE_MAX_LONG_SIDE &&
    bytes.byteLength <= ATTACHMENT_IMAGE_MAX_BYTES
  ) {
    // metadata() reads only the header: decode every pixel so a truncated or
    // corrupt file is rejected instead of kept as ready.
    await sharp(bytes, input)
      .timeout({ seconds: ATTACHMENT_IMAGE_TIMEOUT_SECONDS })
      .stats()
    return null
  }

  const resized = () =>
    sharp(bytes, input)
      .timeout({ seconds: ATTACHMENT_IMAGE_TIMEOUT_SECONDS })
      .rotate()
      .resize({
        width: ATTACHMENT_IMAGE_MAX_LONG_SIDE,
        height: ATTACHMENT_IMAGE_MAX_LONG_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
  // PNG keeps transparency and crisp screenshot text; a PNG still over the
  // byte cap, and every photo, becomes JPEG on white.
  if (hasAlpha || format === "png" || format === "gif") {
    const png = await resized().png({ compressionLevel: 9 }).toBuffer()
    if (png.byteLength <= ATTACHMENT_IMAGE_MAX_BYTES) {
      return { bytes: new Uint8Array(png), mediaType: "image/png" }
    }
  }
  const jpeg = await resized()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: ATTACHMENT_IMAGE_QUALITY, mozjpeg: true })
    .toBuffer()
  return { bytes: new Uint8Array(jpeg), mediaType: "image/jpeg" }
}

/**
 * Scheduled by `files.saveStagedAttachment` for every staged image. An image
 * that cannot be normalized is rejected (the row and blob are removed and the
 * composer shows the failure), so an unsafe original is never bound. If the
 * action itself dies, the row stays pending and the composer's wait times out.
 */
export const normalizeStagedImage = internalAction({
  args: {
    attachmentId: v.id("chatAttachments"),
    storageId: v.id("_storage"),
    /** The stored type; without it the image is always re-encoded. */
    mediaType: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { attachmentId, storageId, mediaType }) => {
    let image: NormalizedAttachmentImage | null
    try {
      const blob = await ctx.storage.get(storageId)
      if (!blob) throw new Error("Staged image is missing")
      image = await normalizeAttachmentImage(
        new Uint8Array(await blob.arrayBuffer()),
        mediaType
      )
    } catch (error) {
      console.warn(
        JSON.stringify({
          _tag: "staged_image_rejected",
          attachmentId,
          error: error instanceof Error ? error.message : String(error),
        })
      )
      await ctx.runMutation(internal.files.rejectStagedImage, {
        attachmentId,
        originalStorageId: storageId,
      })
      return null
    }

    const normalized = image && {
      storageId: await ctx.storage.store(
        new Blob([image.bytes], { type: image.mediaType })
      ),
      fileType: image.mediaType,
      fileSize: image.bytes.byteLength,
    }
    await ctx.runMutation(internal.files.commitStagedImage, {
      attachmentId,
      originalStorageId: storageId,
      ...(normalized ? { normalized } : {}),
    })
    return null
  },
})
