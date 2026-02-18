import { describe, expect, it } from "vitest"
import { shouldNewAddressBeDefault } from "./shippingAddressDefaulting"

describe("shouldNewAddressBeDefault", () => {
  it("returns true when no addresses exist", () => {
    const result = shouldNewAddressBeDefault([], undefined)
    expect(result).toBe(true)
  })

  it("returns false when a default already exists and request is omitted", () => {
    const result = shouldNewAddressBeDefault([{ isDefault: true }], undefined)
    expect(result).toBe(false)
  })

  it("returns false when a default already exists and request is false", () => {
    const result = shouldNewAddressBeDefault([{ isDefault: true }], false)
    expect(result).toBe(false)
  })

  it("returns true when request explicitly asks for default", () => {
    const result = shouldNewAddressBeDefault([{ isDefault: true }], true)
    expect(result).toBe(true)
  })

  it("returns true when addresses exist but none is default", () => {
    const result = shouldNewAddressBeDefault(
      [{ isDefault: false }, { isDefault: false }],
      undefined
    )
    expect(result).toBe(true)
  })

  it("returns true when addresses exist with no default even if request is false", () => {
    const result = shouldNewAddressBeDefault([{ isDefault: false }], false)
    expect(result).toBe(true)
  })
})
