import { afterEach, expect, it } from "vitest"
import {
  clearHighlightCacheForTests,
  readCachedHighlight,
  storeHighlight,
} from "./highlight-cache"

afterEach(() => {
  clearHighlightCacheForTests()
})

it("bounds variants of a single code by entries and characters", () => {
  const variant = (language: string) =>
    ({ code: "x", language, theme: "github-dark" }) as const

  // Fence labels are model-controlled: 201 labels for one code.
  for (let i = 0; i <= 200; i++) storeHighlight(variant(`l${i}`), "<i>")
  expect(readCachedHighlight(variant("l0"))).toBeNull()
  expect(readCachedHighlight(variant("l1"))).toBe("<i>")

  // Three 800K-char variants exceed the 2M character cap.
  clearHighlightCacheForTests()
  const big = "y".repeat(800_000)
  for (const language of ["a", "b", "c"]) storeHighlight(variant(language), big)
  expect(readCachedHighlight(variant("a"))).toBeNull()
  expect(readCachedHighlight(variant("c"))).toBe(big)
})
