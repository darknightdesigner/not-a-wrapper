import { serialize } from "node:v8"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readCachedHighlight } from "./highlight-cache"
import { highlightCode, resetShikiClientForTests } from "./shiki-client"

const loader = vi.hoisted(() => {
  const state = {
    core: Promise.resolve(),
    grammar: Promise.resolve(),
  }
  const codeToHtml = vi.fn(() => "highlighted")
  const loadLanguage = vi.fn(() => state.grammar)
  const createHighlighterCore = vi.fn(async () => {
    await state.core
    return { codeToHtml, loadLanguage }
  })
  return { state, codeToHtml, loadLanguage, createHighlighterCore }
})

vi.mock("shiki/core", () => ({
  createHighlighterCore: loader.createHighlighterCore,
}))

const input = {
  code: "const current = 1",
  language: "ts",
  theme: "github-light",
} as const

beforeEach(() => {
  resetShikiClientForTests()
  vi.clearAllMocks()
  loader.state.core = Promise.resolve()
  loader.state.grammar = Promise.resolve()
})

describe("highlight cancellation before tokenization", () => {
  it("does not initialize resources for an already-aborted request", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      highlightCode({ ...input, signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(loader.createHighlighterCore).not.toHaveBeenCalled()
    expect(loader.codeToHtml).not.toHaveBeenCalled()
  })

  it("skips an obsolete request after shared core loading while the current request completes", async () => {
    const gate = Promise.withResolvers<void>()
    loader.state.core = gate.promise
    const controller = new AbortController()
    const obsolete = highlightCode({
      ...input,
      code: "obsolete",
      signal: controller.signal,
    })
    const rejected = expect(obsolete).rejects.toMatchObject({ name: "AbortError" })
    const current = highlightCode(input)

    controller.abort()
    gate.resolve()

    await rejected
    await expect(current).resolves.toBe("highlighted")
    expect(loader.createHighlighterCore).toHaveBeenCalledTimes(1)
    expect(loader.codeToHtml).toHaveBeenCalledExactlyOnceWith(input.code, {
      lang: "typescript",
      theme: input.theme,
    })
  })

  it.each([false, true])("skips obsolete tokenization after grammar loading (failure: %s)", async (fails) => {
    const gate = Promise.withResolvers<void>()
    loader.state.grammar = gate.promise
    const controller = new AbortController()
    const obsolete = highlightCode({
      ...input,
      code: "obsolete",
      signal: controller.signal,
    })
    const rejected = expect(obsolete).rejects.toMatchObject({ name: "AbortError" })
    const current = highlightCode(input)
    await vi.waitFor(() => expect(loader.loadLanguage).toHaveBeenCalledTimes(1))

    controller.abort()
    if (fails) gate.reject(new Error("grammar unavailable"))
    else gate.resolve()

    await rejected
    await expect(current).resolves.toBe("highlighted")
    expect(loader.codeToHtml).toHaveBeenCalledExactlyOnceWith(input.code, {
      lang: fails ? "text" : "typescript",
      theme: input.theme,
    })
  })
})

describe("highlight input and cache", () => {
  it("tokenizes a one-byte copy of code sliced from an em-dash message", async () => {
    // V8 serialization tags one-byte strings with '"' and two-byte with 'c'.
    const isOneByte = (value: string) => serialize(value)[2] === 0x22
    const message = `Intro \u2014 \u201cquoted\u201d\n${input.code}`
    const sliced = message.slice(message.indexOf(input.code))
    expect(isOneByte(sliced)).toBe(false)

    await highlightCode({ ...input, code: sliced })
    const tokenized = loader.codeToHtml.mock.calls[0]?.at(0)
    expect(tokenized).toBe(input.code)
    expect(isOneByte(String(tokenized))).toBe(true)
  })

  it("serves a repeated tuple from the cache without running Shiki", async () => {
    await expect(highlightCode(input)).resolves.toBe("highlighted")
    expect(readCachedHighlight(input)).toBe("highlighted")
    await expect(highlightCode(input)).resolves.toBe("highlighted")
    expect(loader.codeToHtml).toHaveBeenCalledTimes(1)
  })
})
