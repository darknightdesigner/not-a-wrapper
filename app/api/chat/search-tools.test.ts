import { describe, expect, it } from "vitest"
import { shouldInjectSearchTools } from "./search-tools"

describe("shouldInjectSearchTools", () => {
  it("returns false when search is disabled by client preference", () => {
    expect(shouldInjectSearchTools(false, true)).toBe(false)
  })

  it("returns false for models with tools disabled", () => {
    expect(shouldInjectSearchTools(true, false)).toBe(false)
  })

  it("returns false for models with search capability disabled", () => {
    expect(shouldInjectSearchTools(true, { search: false })).toBe(false)
  })

  it("returns true when preference is on and model supports search", () => {
    expect(shouldInjectSearchTools(true, undefined)).toBe(true)
    expect(shouldInjectSearchTools(true, { search: true })).toBe(true)
  })
})
