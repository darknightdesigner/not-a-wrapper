import { describe, expect, it } from "vitest"
import {
  convertFromApiFormat,
  convertToApiFormat,
  defaultPreferences,
} from "./utils"

describe("user preference webSearchEnabled defaults", () => {
  it("defaults webSearchEnabled to true when missing", () => {
    const converted = convertFromApiFormat({})
    expect(converted.webSearchEnabled).toBe(true)
  })

  it("keeps persisted false as false", () => {
    const converted = convertFromApiFormat({ web_search_enabled: false })
    expect(converted.webSearchEnabled).toBe(false)
  })

  it("keeps persisted true as true", () => {
    const converted = convertFromApiFormat({ web_search_enabled: true })
    expect(converted.webSearchEnabled).toBe(true)
  })

  it("includes web_search_enabled in outbound payload", () => {
    expect(convertToApiFormat({ webSearchEnabled: false })).toEqual({
      web_search_enabled: false,
    })
  })

  it("keeps defaultPreferences webSearchEnabled true", () => {
    expect(defaultPreferences.webSearchEnabled).toBe(true)
  })
})
