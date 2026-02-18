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
})
