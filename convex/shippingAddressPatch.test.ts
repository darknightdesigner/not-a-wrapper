import { describe, expect, it } from "vitest"
import { buildShippingAddressPatch } from "./shippingAddressPatch"

describe("buildShippingAddressPatch", () => {
  it("sets line2 when provided as a string", () => {
    const patch = buildShippingAddressPatch({ line2: "Suite 500" })

    expect(patch).toEqual({ line2: "Suite 500" })
  })

  it("clears line2 when provided as null", () => {
    const patch = buildShippingAddressPatch({ line2: null })

    expect(patch).toEqual({ line2: undefined })
  })

  it("omits line2 when not provided", () => {
    const patch = buildShippingAddressPatch({ city: "New York" })

    expect("line2" in patch).toBe(false)
    expect(patch).toEqual({ city: "New York" })
  })

  it("sets email when provided as a string", () => {
    const patch = buildShippingAddressPatch({ email: "jane@example.com" })
    expect(patch).toEqual({ email: "jane@example.com" })
  })

  it("clears email when provided as null", () => {
    const patch = buildShippingAddressPatch({ email: null })
    expect(patch).toEqual({ email: undefined })
  })

  it("omits email when not provided", () => {
    const patch = buildShippingAddressPatch({ city: "Boston" })
    expect("email" in patch).toBe(false)
  })

  it("sets phone when provided as a string", () => {
    const patch = buildShippingAddressPatch({ phone: "+15551234567" })
    expect(patch).toEqual({ phone: "+15551234567" })
  })

  it("clears phone when provided as null", () => {
    const patch = buildShippingAddressPatch({ phone: null })
    expect(patch).toEqual({ phone: undefined })
  })

  it("omits phone when not provided", () => {
    const patch = buildShippingAddressPatch({ name: "Jane" })
    expect("phone" in patch).toBe(false)
  })
})
