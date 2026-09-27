import { authenticatedRoute } from "@/app/api/_lib/authenticated-route"
import {
  getConvexSiteUrl,
  internalServerError,
  jsonError,
} from "@/app/api/_lib/convex"
import {
  isAllowedProfileImageMimeType,
  MAX_FILE_SIZE,
  normalizeFileMimeType,
} from "@/lib/file/policy"
import { readBodyCapped } from "@/lib/file/read-body-capped"

export const POST = authenticatedRoute(async (request, { session }) => {
  const fileType = normalizeFileMimeType(request.headers.get("Content-Type"))
  if (!isAllowedProfileImageMimeType(fileType)) {
    return jsonError("Unsupported profile image type", 415)
  }

  // Fast pre-reject on the declared length; the capped read below is the
  // enforcement for clients that omit or understate it.
  const contentLength = Number(request.headers.get("Content-Length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
    return jsonError("Profile image is too large", 413)
  }

  const bodyRead = await readBodyCapped(request, MAX_FILE_SIZE, fileType)
  if (bodyRead.kind === "too_large") {
    return jsonError("Profile image is too large", 413)
  }
  if (bodyRead.kind === "invalid") {
    return jsonError("Invalid profile image body", 400)
  }

  try {
    const response = await fetch(`${getConvexSiteUrl()}/profile-image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": fileType,
      },
      body: bodyRead.blob,
    })
    const body = await response.text()

    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type":
        response.headers.get("Content-Type") ?? "application/json",
    })
    const retryAfter = response.headers.get("Retry-After")
    if (retryAfter) headers.set("Retry-After", retryAfter)

    return new Response(body, { status: response.status, headers })
  } catch (error) {
    console.error("Profile image upload proxy failed", error)
    return internalServerError()
  }
})
