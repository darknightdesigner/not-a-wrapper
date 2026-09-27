import type { ConvexReactClient } from "convex/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FileUploadLimitError, uploadStagedFile } from "./file-handling"

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
      response = { error: "Daily file upload limit reached" }
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
})
