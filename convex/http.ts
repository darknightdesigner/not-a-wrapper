import { httpRouter } from "convex/server"
import {
  ATTACHMENT_NAME_HEADER,
  DAILY_FILE_LIMIT_CODE,
  isAllowedFileMimeType,
  isAllowedProfileImageMimeType,
  MAX_FILE_SIZE,
  normalizeFileMimeType,
  PROFILE_IMAGE_SNIFF_BYTES,
  sniffProfileImageMimeType,
} from "../lib/file/policy"
import { readBodyCapped } from "../lib/file/read-body-capped"
import { api, internal } from "./_generated/api"
import { httpAction, type ActionCtx } from "./_generated/server"
import {
  GRANT_REJECTION_MESSAGES,
  grantRejectionCode,
  type DurableWorkerPayloads,
  type GrantAuthArgs,
} from "./chatRuntimeWorker"
import { requireIdentity } from "./lib/auth"
import { sha256Hex } from "./lib/sha256"
import { ATTACHMENT_UPLOAD_PATH, verifyUploadTicket } from "./lib/uploadTicket"
import { authKit } from "./workosAuth"

const http = httpRouter()

authKit.registerRoutes(http)

type DurableWorkerOp = keyof DurableWorkerPayloads

// The Durable worker wire (ADR-0011): run-scoped writes authorized by an
// execution grant instead of the user's request token. The raw Bearer secret
// is hashed HERE, before dispatch, so it never appears in a mutation argument
// or the function log; the grant-authorized internal mutations compare
// digests transactionally against the run row.
//
// One dispatch closure per op: `runMutation(ref, args)` type-checks each
// payload against its mutation's validators, so drift between the wire
// contract (`DurableWorkerPayloads`) and `chatRuntimeWorker` is a compile
// error in this table, not a runtime 400.
const WORKER_OPS: {
  [Op in DurableWorkerOp]: (
    ctx: ActionCtx,
    args: DurableWorkerPayloads[Op] & GrantAuthArgs
  ) => Promise<unknown>
} = {
  markGenerationWorkStarted: (ctx, args) =>
    ctx.runMutation(
      internal.chatRuntimeWorker.markGenerationWorkStarted,
      args
    ),
  recordTitleUsageEvidence: (ctx, args) =>
    ctx.runMutation(
      internal.chatRuntimeWorker.recordTitleUsageEvidence,
      args
    ),
  updateAssistantSnapshot: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.updateAssistantSnapshot, args),
  recordToolInvocations: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.recordToolInvocations, args),
  createToolApprovalRequest: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.createToolApprovalRequest, args),
  markGenerationRunCompleted: (ctx, args) =>
    ctx.runMutation(
      internal.chatRuntimeWorker.markGenerationRunCompleted,
      args
    ),
  markGenerationRunFailed: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.markGenerationRunFailed, args),
  markGenerationRunAborted: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.markGenerationRunAborted, args),
  heartbeatGenerationRun: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.heartbeatGenerationRun, args),
  // Settlement-only receipt: authenticated against the reservation's
  // settlement digest, not the (revoked) run grant — see chatRuntimeWorker.
  finalizeTerminalUsage: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.finalizeTerminalUsage, args),
  // Receipt attach after a Stop/supersession: authenticated against the
  // run's receipt-attach digest, not the (revoked) run grant.
  attachRunTimingReceipt: (ctx, args) =>
    ctx.runMutation(internal.chatRuntimeWorker.attachRunTimingReceipt, args),
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers?: HeadersInit
) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set("Content-Type", "application/json")
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  })
}

type ProfileImageUploadCtx = Pick<
  ActionCtx,
  "auth" | "runAction" | "runMutation" | "storage"
>

type StoredUploadId = Awaited<ReturnType<ActionCtx["storage"]["store"]>>

// For a blob this request stored but could not commit. A commit whose result
// was lost may still have referenced it, so cleanup goes through the one
// deletion rule instead of `ctx.storage.delete` (ADR-0046).
async function cleanupStoredUpload(
  ctx: Pick<ActionCtx, "runMutation">,
  storageId: StoredUploadId,
  failureTag: string
) {
  try {
    await ctx.runMutation(internal.files.releaseUploadedStorage, { storageId })
  } catch {
    console.warn(JSON.stringify({ _tag: failureTag }))
  }
}

export async function handleProfileImageUploadRequest(
  ctx: ProfileImageUploadCtx,
  request: Request
): Promise<Response> {
  let identity: Awaited<ReturnType<typeof requireIdentity>>
  try {
    identity = await requireIdentity(ctx)
  } catch {
    return jsonResponse(401, { error: "Unauthorized" })
  }

  const fileType = normalizeFileMimeType(request.headers.get("Content-Type"))
  if (!isAllowedProfileImageMimeType(fileType)) {
    return jsonResponse(415, { error: "Unsupported profile image type" })
  }

  // Fast pre-reject on the declared length; the capped read below enforces
  // the cap for chunked bodies that omit it.
  const contentLength = Number(request.headers.get("Content-Length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
    return jsonResponse(413, { error: "Profile image is too large" })
  }

  let rateLimit: {
    allowed: boolean
    retryAfterMs: number
  }
  try {
    rateLimit = await ctx.runMutation(api.rateLimits.consume, {
      bucket: "profile_image_upload",
    })
  } catch {
    console.warn(JSON.stringify({ _tag: "profile_image_rate_limit_failed" }))
    return jsonResponse(500, { error: "Profile image upload failed" })
  }
  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(rateLimit.retryAfterMs / 1000)
    )
    return jsonResponse(
      429,
      { error: "Profile image upload rate limit exceeded" },
      { "Retry-After": String(retryAfterSeconds) }
    )
  }

  const bodyRead = await readBodyCapped(request, MAX_FILE_SIZE, fileType)
  if (bodyRead.kind === "too_large") {
    return jsonResponse(413, { error: "Profile image is too large" })
  }
  if (bodyRead.kind === "invalid") {
    return jsonResponse(400, { error: "Invalid profile image body" })
  }
  const { blob } = bodyRead
  // Cheaply reject obvious mismatches before staging the body. This signature
  // check is only a prefilter; the staged image is fully decoded below before
  // any user record or storage URL can reference it.
  const header = new Uint8Array(
    await blob.slice(0, PROFILE_IMAGE_SNIFF_BYTES).arrayBuffer()
  )
  if (sniffProfileImageMimeType(header) !== fileType) {
    return jsonResponse(415, { error: "Unsupported profile image type" })
  }

  let storageId: StoredUploadId | undefined
  try {
    storageId = await ctx.storage.store(blob)
    const validation = await ctx.runAction(
      internal.profileImageValidation.validateStoredProfileImage,
      { storageId, fileType }
    )
    if (!validation.valid) {
      await cleanupStoredUpload(
        ctx,
        storageId,
        "profile_image_upload_cleanup_failed"
      )
      return jsonResponse(415, { error: "Unsupported profile image type" })
    }

    const profileImageUrl: string = await ctx.runMutation(
      internal.users.commitUploadedProfileImage,
      {
        workosUserId: identity.subject,
        storageId,
        fileType,
      }
    )
    return jsonResponse(200, { profileImageUrl })
  } catch {
    if (storageId !== undefined) {
      await cleanupStoredUpload(
        ctx,
        storageId,
        "profile_image_upload_cleanup_failed"
      )
    }
    console.warn(JSON.stringify({ _tag: "profile_image_upload_failed" }))
    return jsonResponse(500, { error: "Profile image upload failed" })
  }
}

type AttachmentUploadCtx = Pick<ActionCtx, "runMutation" | "storage">

// Browsers upload attachments straight to this origin, because Vercel caps a
// function body below MAX_FILE_SIZE. The ticket is a bearer credential only
// an authenticated mutation mints, and no cookie is involved, so any origin
// may present one.
const ATTACHMENT_UPLOAD_CORS = { "Access-Control-Allow-Origin": "*" }

export function handleAttachmentUploadPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...ATTACHMENT_UPLOAD_CORS,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": `Authorization, Content-Type, ${ATTACHMENT_NAME_HEADER}`,
      "Access-Control-Max-Age": "600",
    },
  })
}

function readAttachmentName(request: Request): string | undefined {
  const encoded = request.headers.get(ATTACHMENT_NAME_HEADER)
  if (!encoded) return undefined
  try {
    return decodeURIComponent(encoded) || undefined
  } catch {
    return undefined
  }
}

/**
 * Store an attachment and stage it for the user its upload ticket names, in
 * one request (ADR-0046). The client never sees or sends a storage id, and a
 * blob this request stored is released whenever staging refuses or fails.
 */
export async function handleAttachmentUploadRequest(
  ctx: AttachmentUploadCtx,
  request: Request
): Promise<Response> {
  const respond = (
    status: number,
    body: Record<string, unknown>,
    headers?: Record<string, string>
  ) => jsonResponse(status, body, { ...ATTACHMENT_UPLOAD_CORS, ...headers })
  const dailyLimitReached = () =>
    respond(429, {
      error: "Daily file upload limit reached",
      code: DAILY_FILE_LIMIT_CODE,
    })

  const authorization = request.headers.get("Authorization")
  const userId = verifyUploadTicket(
    authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined
  )
  if (!userId) return respond(401, { error: "Unauthorized" })

  const fileType = normalizeFileMimeType(request.headers.get("Content-Type"))
  if (!isAllowedFileMimeType(fileType)) {
    return respond(415, { error: "Unsupported file type" })
  }

  // Fast pre-reject on the declared length; the capped read below enforces
  // the cap for chunked bodies that omit it.
  const contentLength = Number(request.headers.get("Content-Length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
    return respond(413, { error: "File is too large" })
  }

  // Admit before reading the body, as /profile-image rate-limits first: a
  // replayed ticket past the daily limit or burst window stores nothing.
  const admission = await ctx
    .runMutation(internal.files.admitAttachmentUpload, { userId })
    .catch(() => null)
  if (!admission) {
    console.warn(JSON.stringify({ _tag: "attachment_upload_admission_failed" }))
    return respond(500, { error: "Attachment upload failed" })
  }
  if (admission.status === "refused") {
    return respond(403, { error: "Forbidden" })
  }
  if (admission.status === "daily_limit") return dailyLimitReached()
  if (admission.status === "rate_limited") {
    return respond(
      429,
      { error: "Too many uploads" },
      {
        "Retry-After": String(
          Math.max(1, Math.ceil(admission.retryAfterMs / 1000))
        ),
      }
    )
  }

  const bodyRead = await readBodyCapped(request, MAX_FILE_SIZE, fileType)
  if (bodyRead.kind === "too_large") {
    return respond(413, { error: "File is too large" })
  }
  if (bodyRead.kind === "invalid") {
    return respond(400, { error: "Invalid file body" })
  }

  let storageId: StoredUploadId | undefined
  try {
    storageId = await ctx.storage.store(bodyRead.blob)
    const attachmentId = await ctx.runMutation(
      internal.files.stageUploadedAttachment,
      {
        userId,
        storageId,
        fileName: readAttachmentName(request),
        fileType,
      }
    )
    if (!attachmentId) {
      await cleanupStoredUpload(
        ctx,
        storageId,
        "attachment_upload_cleanup_failed"
      )
      return dailyLimitReached()
    }
    return respond(200, { attachmentId })
  } catch {
    if (storageId !== undefined) {
      await cleanupStoredUpload(
        ctx,
        storageId,
        "attachment_upload_cleanup_failed"
      )
    }
    console.warn(JSON.stringify({ _tag: "attachment_upload_failed" }))
    return respond(500, { error: "Attachment upload failed" })
  }
}

http.route({
  path: "/chat-turn/worker",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get("Authorization")
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(401, { ok: false, error: "Missing bearer secret" })
    }
    const grantDigest = sha256Hex(authorization.slice("Bearer ".length))

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body" })
    }
    const { op, args } = (body ?? {}) as { op?: unknown; args?: unknown }
    if (
      typeof op !== "string" ||
      !(op in WORKER_OPS) ||
      !args ||
      typeof args !== "object"
    ) {
      return jsonResponse(400, { ok: false, error: "Invalid worker call" })
    }

    // The payload arrives as untyped network JSON; each op's mutation
    // validators are its runtime contract. This is the wire boundary's single
    // coercion — the dispatch table above keeps payload/validator agreement
    // compile-checked.
    const dispatch = WORKER_OPS[op as DurableWorkerOp] as (
      ctx: ActionCtx,
      args: Record<string, unknown>
    ) => Promise<unknown>

    try {
      // The mutation's return value rides back to the worker — the heartbeat's
      // renewed/paused/lost discriminant and the snapshot guard results are
      // branching inputs on the Next side, not fire-and-forget acks.
      const result = await dispatch(ctx, {
        ...(args as Record<string, unknown>),
        grantDigest,
      })
      return jsonResponse(200, { ok: true, result: result ?? null })
    } catch (error) {
      const rejection = grantRejectionCode(error)
      if (rejection) {
        return jsonResponse(401, {
          ok: false,
          code: rejection,
          error: GRANT_REJECTION_MESSAGES[rejection],
        })
      }
      // Generic body only: raw internal error text must not escape to the
      // caller — Convex argument-validation errors run BEFORE the grant check,
      // so this branch is reachable by an unauthenticated probe. The detail
      // stays in the deployment's function logs.
      console.warn(
        JSON.stringify({
          _tag: "chat_turn_worker_dispatch_failed",
          op,
          error: error instanceof Error ? error.message : String(error),
        })
      )
      return jsonResponse(400, { ok: false, error: "Invalid worker call" })
    }
  }),
})

http.route({
  path: "/profile-image",
  method: "POST",
  handler: httpAction(handleProfileImageUploadRequest),
})

http.route({
  path: ATTACHMENT_UPLOAD_PATH,
  method: "POST",
  handler: httpAction(handleAttachmentUploadRequest),
})

http.route({
  path: ATTACHMENT_UPLOAD_PATH,
  method: "OPTIONS",
  handler: httpAction(async () => handleAttachmentUploadPreflight()),
})

export default http
