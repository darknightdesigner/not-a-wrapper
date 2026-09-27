import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import {
  ATTACHMENT_NAME_HEADER,
  DAILY_FILE_LIMIT_CODE,
} from "../lib/file/policy"
import type { Id } from "./_generated/dataModel"
import {
  handleAttachmentUploadRequest,
  handleProfileImageUploadRequest,
} from "./http"
import { signUploadTicket, UPLOAD_TICKET_TTL_MS } from "./lib/uploadTicket"

vi.mock("./workosAuth", () => ({
  authKit: { registerRoutes: vi.fn() },
}))

const storageId = "storage-profile-image" as Id<"_storage">
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

function createUploadHarness() {
  const getUserIdentity = vi.fn().mockResolvedValue({
    issuer: "https://auth.test",
    subject: "workos-user-1",
    tokenIdentifier: "https://auth.test|workos-user-1",
  })
  const runMutation = vi
    .fn()
    .mockResolvedValueOnce({ allowed: true, retryAfterMs: 0 })
    .mockResolvedValueOnce("https://images.test/avatar.png")
  const runAction = vi.fn().mockResolvedValue({ valid: true })
  const store = vi.fn().mockResolvedValue(storageId)
  const deleteStoredFile = vi.fn()

  return {
    ctx: {
      auth: { getUserIdentity },
      runAction,
      runMutation,
      storage: { delete: deleteStoredFile, store },
    } as unknown as Parameters<typeof handleProfileImageUploadRequest>[0],
    deleteStoredFile,
    getUserIdentity,
    runAction,
    runMutation,
    store,
  }
}

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

function pngBlob() {
  return new Blob([PNG_MAGIC], { type: "image/png" })
}

function imageRequest(body: Blob = pngBlob(), headers: HeadersInit = {}) {
  return new Request("https://convex.test/profile-image", {
    method: "POST",
    headers: { "Content-Type": body.type, ...headers },
    body,
  })
}

describe("profile image HTTP upload", () => {
  afterEach(() => {
    consoleWarnSpy.mockClear()
  })

  afterAll(() => {
    consoleWarnSpy.mockRestore()
  })

  it("rejects unauthenticated uploads before consuming quota or storing data", async () => {
    const harness = createUploadHarness()
    harness.getUserIdentity.mockRejectedValue(new Error("Invalid token"))

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest()
    )

    expect(response.status).toBe(401)
    expect(harness.runAction).not.toHaveBeenCalled()
    expect(harness.runMutation).not.toHaveBeenCalled()
    expect(harness.store).not.toHaveBeenCalled()
  })

  it("rejects unsupported files before consuming quota or storing data", async () => {
    const harness = createUploadHarness()

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest(new Blob(["file"], { type: "application/pdf" }))
    )

    expect(response.status).toBe(415)
    expect(harness.runAction).not.toHaveBeenCalled()
    expect(harness.runMutation).not.toHaveBeenCalled()
    expect(harness.store).not.toHaveBeenCalled()
  })

  it("enforces the authenticated upload rate limit before storing data", async () => {
    const harness = createUploadHarness()
    harness.runMutation.mockReset().mockResolvedValue({
      allowed: false,
      retryAfterMs: 1_500,
    })

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest()
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("2")
    expect(harness.runMutation.mock.calls[0]?.[1]).toEqual({
      bucket: "profile_image_upload",
    })
    expect(harness.runAction).not.toHaveBeenCalled()
    expect(harness.store).not.toHaveBeenCalled()
  })

  it("rejects bodies whose bytes don't match the declared image type", async () => {
    const harness = createUploadHarness()

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest(new Blob(["not a png"], { type: "image/png" }))
    )

    expect(response.status).toBe(415)
    expect(harness.runAction).not.toHaveBeenCalled()
    expect(harness.store).not.toHaveBeenCalled()
  })

  it("stores the request body itself and commits only that new storage id", async () => {
    const harness = createUploadHarness()

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest()
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      profileImageUrl: "https://images.test/avatar.png",
    })
    expect(harness.store).toHaveBeenCalledWith(expect.any(Blob))
    expect(harness.runAction.mock.calls[0]?.[1]).toEqual({
      storageId,
      fileType: "image/png",
    })
    expect(harness.runMutation.mock.calls[1]?.[1]).toEqual({
      workosUserId: "workos-user-1",
      storageId,
      fileType: "image/png",
    })
    expect(harness.runAction.mock.invocationCallOrder[0]).toBeLessThan(
      harness.runMutation.mock.invocationCallOrder[1] ??
        Number.POSITIVE_INFINITY
    )
    expect(harness.deleteStoredFile).not.toHaveBeenCalled()
  })

  it("deletes a signature-matching JPEG that fails full decoding", async () => {
    const harness = createUploadHarness()
    harness.runAction.mockResolvedValue({ valid: false })
    const fakeJpeg = new Blob(
      [new Uint8Array([0xff, 0xd8, 0xff]), "not an image"],
      { type: "image/jpeg" }
    )

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest(fakeJpeg)
    )

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported profile image type",
    })
    expect(harness.runAction).toHaveBeenCalledTimes(1)
    expect(harness.deleteStoredFile).toHaveBeenCalledWith(storageId)
    expect(harness.runMutation).toHaveBeenCalledTimes(1)
  })

  it("cleans up and returns a generic error when decoder validation fails", async () => {
    const harness = createUploadHarness()
    harness.runAction.mockRejectedValue(new Error("Decoder unavailable"))

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest()
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "Profile image upload failed",
    })
    expect(harness.deleteStoredFile).toHaveBeenCalledWith(storageId)
    expect(harness.runMutation).toHaveBeenCalledTimes(1)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      JSON.stringify({ _tag: "profile_image_upload_failed" })
    )
  })

  it("deletes the newly stored file when the owner-bound commit fails", async () => {
    const harness = createUploadHarness()
    harness.runMutation
      .mockReset()
      .mockResolvedValueOnce({ allowed: true, retryAfterMs: 0 })
      .mockRejectedValueOnce(new Error("Commit failed"))

    const response = await handleProfileImageUploadRequest(
      harness.ctx,
      imageRequest()
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "Profile image upload failed",
    })
    expect(harness.deleteStoredFile).toHaveBeenCalledWith(storageId)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      JSON.stringify({ _tag: "profile_image_upload_failed" })
    )
  })
})

describe("attachment HTTP upload", () => {
  const owner = "user-owner" as Id<"users">
  const attachmentStorageId = "storage-attachment" as Id<"_storage">

  beforeEach(() =>
    vi.stubEnv(
      "CHAT_ADMISSION_SECRET",
      "test-chat-admission-secret-with-32-bytes"
    )
  )
  afterEach(() => vi.unstubAllEnvs())

  function createAttachmentHarness(
    staged: string | null = "attachment-1",
    admission: { status: string } = { status: "allowed" }
  ) {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce(admission)
      .mockResolvedValueOnce(staged)
    const store = vi.fn().mockResolvedValue(attachmentStorageId)
    const deleteStoredFile = vi.fn()
    return {
      ctx: {
        runMutation,
        storage: { delete: deleteStoredFile, store },
      } as unknown as Parameters<typeof handleAttachmentUploadRequest>[0],
      deleteStoredFile,
      runMutation,
      store,
    }
  }

  function uploadRequest(ticket: string) {
    return new Request("https://convex.test/attachments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ticket}`,
        "Content-Type": "text/plain",
        [ATTACHMENT_NAME_HEADER]: encodeURIComponent("notes é.txt"),
      },
      body: new Blob(["hello"], { type: "text/plain" }),
    })
  }

  it("stages the stored blob for the ticket's user and stores nothing under a forged or expired ticket", async () => {
    const ticket = signUploadTicket(owner)
    const [, expiresAt, signature] = ticket.split(".")
    for (const refused of [
      `user-other.${expiresAt}.${signature}`,
      signUploadTicket(owner, Date.now() - UPLOAD_TICKET_TTL_MS - 1),
    ]) {
      const harness = createAttachmentHarness()
      const response = await handleAttachmentUploadRequest(
        harness.ctx,
        uploadRequest(refused)
      )
      expect(response.status).toBe(401)
      expect(harness.store).not.toHaveBeenCalled()
    }

    const harness = createAttachmentHarness()
    const response = await handleAttachmentUploadRequest(
      harness.ctx,
      uploadRequest(ticket)
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      attachmentId: "attachment-1",
    })
    expect(harness.runMutation.mock.calls[0]?.[1]).toEqual({ userId: owner })
    expect(harness.runMutation.mock.calls[1]?.[1]).toEqual({
      userId: owner,
      storageId: attachmentStorageId,
      fileName: "notes é.txt",
      fileType: "text/plain",
    })
  })

  it("stores nothing when admission refuses, and deletes the blob it stored when staging refuses", async () => {
    const overLimit = createAttachmentHarness(null, { status: "daily_limit" })
    const refused = await handleAttachmentUploadRequest(
      overLimit.ctx,
      uploadRequest(signUploadTicket(owner))
    )
    expect(refused.status).toBe(429)
    await expect(refused.json()).resolves.toMatchObject({
      code: DAILY_FILE_LIMIT_CODE,
    })
    expect(overLimit.store).not.toHaveBeenCalled()

    // Concurrent uploads can all pass admission; staging stays authoritative.
    const raced = createAttachmentHarness(null)
    const response = await handleAttachmentUploadRequest(
      raced.ctx,
      uploadRequest(signUploadTicket(owner))
    )
    expect(response.status).toBe(429)
    expect(raced.deleteStoredFile).toHaveBeenCalledWith(attachmentStorageId)
  })
})
