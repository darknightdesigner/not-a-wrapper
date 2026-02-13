import { describe, expect, it, vi } from "vitest"
import {
  persistWebSearchToggle,
  resolveWebSearchEnabled,
} from "./web-search"

describe("web search preference helper", () => {
  it("resolves undefined to true", () => {
    expect(resolveWebSearchEnabled(undefined)).toBe(true)
  })

  it("preserves explicit false", () => {
    expect(resolveWebSearchEnabled(false)).toBe(false)
  })

  it("persists and updates local state immediately", () => {
    const setEnableSearch = vi.fn()
    const persistPreference = vi.fn()

    persistWebSearchToggle(true, setEnableSearch, persistPreference)

    expect(setEnableSearch).toHaveBeenCalledWith(true)
    expect(persistPreference).toHaveBeenCalledWith(true)
  })
})
