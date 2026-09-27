import * as fileType from "file-type"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  ACCEPTED_FILE_PICKER_TYPES,
  MAX_FILE_SIZE,
  validateFile,
} from "./validation"

vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(),
}))

function createTestFile({
  size = 1024,
  type = "",
  headerBuffer = new ArrayBuffer(16),
  slice,
}: {
  size?: number
  type?: string
  headerBuffer?: ArrayBuffer
  slice?: File["slice"]
} = {}): File {
  return {
    name: "upload.bin",
    size,
    type,
    slice:
      slice ??
      (() =>
        ({
          arrayBuffer: async () => headerBuffer,
        }) as Blob),
  } as unknown as File
}

describe("file validation", () => {
  beforeEach(() => {
    vi.mocked(fileType.fileTypeFromBuffer).mockReset()
  })

  it("keeps file picker accept types in sync with MIME types and extensions", () => {
    expect(ACCEPTED_FILE_PICKER_TYPES).toContain("image/png")
    expect(ACCEPTED_FILE_PICKER_TYPES).toContain(".png")
    expect(ACCEPTED_FILE_PICKER_TYPES).toContain("application/pdf")
    expect(ACCEPTED_FILE_PICKER_TYPES).toContain(".pdf")
  })

  it("rejects files larger than the existing 10MB limit before reading bytes", async () => {
    const slice = vi.fn() as unknown as File["slice"]
    const file = createTestFile({
      size: MAX_FILE_SIZE + 1,
      slice,
    })

    await expect(validateFile(file)).resolves.toEqual({
      isValid: false,
      error: "File size exceeds 10MB limit",
    })
    expect(slice).not.toHaveBeenCalled()
    expect(fileType.fileTypeFromBuffer).not.toHaveBeenCalled()
  })

  it("sniffs a browser-compatible Uint8Array header slice", async () => {
    const headerBuffer = new ArrayBuffer(4)
    new Uint8Array(headerBuffer).set([0x89, 0x50, 0x4e, 0x47])
    const sliceArrayBuffer = vi.fn(async () => headerBuffer)
    const slice = vi.fn(
      () =>
        ({
          arrayBuffer: sliceArrayBuffer,
        }) as unknown as Blob
    ) as unknown as File["slice"]
    vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue({
      ext: "png",
      mime: "image/png",
    })

    await expect(
      validateFile(createTestFile({ slice }))
    ).resolves.toMatchObject({ isValid: true })

    expect(slice).toHaveBeenCalledWith(0, 4100)
    expect(sliceArrayBuffer).toHaveBeenCalledTimes(1)
    const [header] = vi.mocked(fileType.fileTypeFromBuffer).mock.calls[0] ?? []
    expect(header).toBeInstanceOf(Uint8Array)
    expect(header).toHaveLength(4)
  })

  it("rejects unsupported or undetectable file types with the existing message", async () => {
    vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue(undefined)

    await expect(validateFile(createTestFile())).resolves.toEqual({
      isValid: false,
      error: "File type not supported or doesn't match its extension",
    })
  })

  it.each([
    ["notes.txt", "", "text/plain"],
    ["notes.md", "", "text/markdown"],
    ["config.json", "application/json", "application/json"],
    // Windows with Excel installed reports .csv this way.
    ["data.csv", "application/vnd.ms-excel", "text/csv"],
  ])(
    "uploads undetectable text %s as its extension's type",
    async (name, reportedType, uploadType) => {
      vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue(undefined)
      const result = await validateFile(
        new File(["name,value\nalice,1\n"], name, { type: reportedType })
      )

      expect(result.isValid && result.file.type).toBe(uploadType)
    }
  )

  it("rejects declared text files when undetected bytes are binary-like", async () => {
    vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue(undefined)

    await expect(
      validateFile(
        createTestFile({
          type: "text/plain",
          headerBuffer: new Uint8Array([0x00, 0x01, 0x02]).buffer,
        })
      )
    ).resolves.toEqual({
      isValid: false,
      error: "File type not supported or doesn't match its extension",
    })
  })

  it("rejects detected unsupported MIME types even when the file is declared as text", async () => {
    vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue({
      ext: "zip",
      mime: "application/zip",
    })

    await expect(
      validateFile(createTestFile({ type: "text/plain" }))
    ).resolves.toEqual({
      isValid: false,
      error: "File type not supported or doesn't match its extension",
    })
  })

  it("uploads detected allowed types as the detected type", async () => {
    vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue({
      ext: "png",
      mime: "image/png",
    })
    const result = await validateFile(
      new File(["png"], "photo.jpg", { type: "image/jpeg" })
    )

    expect(result.isValid && result.file.type).toBe("image/png")
  })

  it("limits a text-only model to text, by content rather than name", async () => {
    vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue({
      ext: "pdf",
      mime: "application/pdf",
    })
    await expect(
      validateFile(new File(["%PDF"], "notes.txt"), { vision: false })
    ).resolves.toEqual({
      isValid: false,
      error: "This model reads text files only",
    })

    vi.mocked(fileType.fileTypeFromBuffer).mockResolvedValue(undefined)
    const text = await validateFile(new File(["a,b\n"], "data.csv"), {
      vision: false,
    })
    expect(text.isValid && text.file.type).toBe("text/csv")
  })
})
