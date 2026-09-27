"use node"

import { v } from "convex/values"
import sharp from "sharp"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalAction } from "./_generated/server"

/**
 * Claude rejects a side over 8000 px, and over 2000 px once a request holds
 * more than 20 images; OpenAI and Claude downscale past this anyway.
 */
export const ATTACHMENT_IMAGE_MAX_LONG_SIDE = 2000
/** Below Anthropic's 5 MB per-image cap. */
export const ATTACHMENT_IMAGE_MAX_BYTES = 4 * 1024 * 1024
const ATTACHMENT_IMAGE_MAX_INPUT_PIXELS = 100_000_000
const ATTACHMENT_IMAGE_TIMEOUT_SECONDS = 20
const ATTACHMENT_IMAGE_QUALITY = 85

export type NormalizedAttachmentImage = {
  bytes: Uint8Array<ArrayBuffer>
  mediaType: "image/jpeg" | "image/webp"
}

/**
 * Shrink an image once so the stored copy is safe for every vision model
 * (LibreChat resizes at upload the same way). Returns null when the original
 * already fits.
 */
export async function normalizeAttachmentImage(
  bytes: Uint8Array
): Promise<NormalizedAttachmentImage | null> {
  const input = {
    limitInputPixels: ATTACHMENT_IMAGE_MAX_INPUT_PIXELS,
    sequentialRead: true,
  }
  const { width, height, hasAlpha } = await sharp(bytes, input).metadata()
  if (!width || !height) throw new Error("Image dimensions are unreadable")
  if (
    Math.max(width, height) <= ATTACHMENT_IMAGE_MAX_LONG_SIDE &&
    bytes.byteLength <= ATTACHMENT_IMAGE_MAX_BYTES
  ) {
    return null
  }

  const resized = sharp(bytes, input)
    .timeout({ seconds: ATTACHMENT_IMAGE_TIMEOUT_SECONDS })
    .rotate()
    .resize({
      width: ATTACHMENT_IMAGE_MAX_LONG_SIDE,
      height: ATTACHMENT_IMAGE_MAX_LONG_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
  // JPEG is the most widely accepted; WebP only where transparency matters.
  const encoded = hasAlpha
    ? resized.webp({ quality: ATTACHMENT_IMAGE_QUALITY })
    : resized.jpeg({ quality: ATTACHMENT_IMAGE_QUALITY, mozjpeg: true })
  return {
    bytes: new Uint8Array(await encoded.toBuffer()),
    mediaType: hasAlpha ? "image/webp" : "image/jpeg",
  }
}

/**
 * Scheduled by `files.saveStagedAttachment` for every staged image. Always
 * commits: a failure keeps the original bytes, as before normalization.
 */
export const normalizeStagedImage = internalAction({
  args: {
    attachmentId: v.id("chatAttachments"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, { attachmentId, storageId }) => {
    let normalized:
      | { storageId: Id<"_storage">; fileType: string; fileSize: number }
      | undefined
    try {
      const blob = await ctx.storage.get(storageId)
      const image = blob
        ? await normalizeAttachmentImage(
            new Uint8Array(await blob.arrayBuffer())
          )
        : null
      if (image) {
        normalized = {
          storageId: await ctx.storage.store(
            new Blob([image.bytes], { type: image.mediaType })
          ),
          fileType: image.mediaType,
          fileSize: image.bytes.byteLength,
        }
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          _tag: "staged_image_normalization_failed",
          attachmentId,
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }

    await ctx.runMutation(internal.files.commitStagedImage, {
      attachmentId,
      originalStorageId: storageId,
      ...(normalized ? { normalized } : {}),
    })
    return null
  },
})
