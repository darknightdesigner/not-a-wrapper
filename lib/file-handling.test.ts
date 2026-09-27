import type { ConvexReactClient } from "convex/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  FileUploadLimitError,
  uploadBinaryWithProgress,
  uploadStagedFile,
} from "./file-handling"
import { DAILY_FILE_LIMIT_CODE } from "./file/policy"

function createTestFile(name: string): File {
  return {
    name,
    size: 1024,
    type: "image/png",
  } as unknown as File
}

describe("file handling", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("turns an upload ticket quota denial into a client-side limit error", async () => {
    const convex = {
      mutation: vi.fn().mockResolvedValue(null),
    } as unknown as ConvexReactClient

    await expect(
      uploadStagedFile(convex, createTestFile("over-limit.png"))
    ).rejects.toBeInstanceOf(FileUploadLimitError)
  })

  it("presents its upload ticket and turns a staging quota race into a client-side limit error", async () => {
    const convex = {
      mutation: vi.fn().mockResolvedValueOnce({
        url: "https://deployment.convex.site/attachments",
        ticket: "ticket-1",
      }),
    } as unknown as ConvexReactClient
    const setRequestHeader = vi.fn()
    class MockXMLHttpRequest extends EventTarget {
      status = 429
      response = {
        error: "Daily file upload limit reached",
        code: DAILY_FILE_LIMIT_CODE,
      }
      responseType = ""
      upload = new EventTarget()
      open = vi.fn()
      setRequestHeader = setRequestHeader
      abort = vi.fn(() => this.dispatchEvent(new Event("abort")))
      send = vi.fn(() => this.dispatchEvent(new Event("load")))
    }
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest)

    await expect(
      uploadStagedFile(convex, createTestFile("raced.png"))
    ).rejects.toBeInstanceOf(FileUploadLimitError)
    expect(setRequestHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer ticket-1"
    )
  })

  it("lets an upload cancelled after its body was sent resolve, so the caller can release the staged row", async () => {
    const controller = new AbortController()
    const abort = vi.fn()
    class MockXMLHttpRequest extends EventTarget {
      status = 0
      response: unknown = null
      responseType = ""
      upload = new EventTarget()
      open = vi.fn()
      setRequestHeader = vi.fn()
      abort = abort
      send = vi.fn(() => {
        this.upload.dispatchEvent(new Event("load"))
        // The server still stores and stages the file it fully received.
        controller.abort()
        this.status = 200
        this.response = { attachmentId: "attachment-1" }
        this.dispatchEvent(new Event("load"))
      })
    }
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest)

    await expect(
      uploadBinaryWithProgress(
        { url: "https://deployment.convex.site/attachments", ticket: "t" },
        createTestFile("sent.png"),
        { signal: controller.signal }
      )
    ).resolves.toBe("attachment-1")
    expect(abort).not.toHaveBeenCalled()
  })
})
