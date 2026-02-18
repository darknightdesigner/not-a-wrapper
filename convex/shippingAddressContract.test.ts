import { describe, expect, it } from "vitest"
import { buildUpdateShippingAddressPayload } from "@/app/components/layout/settings/general/shipping-addresses-payload"
import { buildShippingAddressPatch } from "./shippingAddressPatch"

describe("shipping address client/server contract", () => {
  it("clears line2 in patch when user clears line2 in the form", () => {
    const updatePayload = buildUpdateShippingAddressPayload({
      label: "Home",
      name: "Jane Doe",
      line1: "123 Main St",
      line2: "   ",
      city: "New York",
      state: "NY",
      postalCode: "10001",
    })

    const patch = buildShippingAddressPatch(updatePayload)

    expect(updatePayload.line2).toBeNull()
    expect(patch).toMatchObject({
      label: "Home",
      name: "Jane Doe",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US",
    })
    expect(patch).toHaveProperty("line2", undefined)
  })
})
