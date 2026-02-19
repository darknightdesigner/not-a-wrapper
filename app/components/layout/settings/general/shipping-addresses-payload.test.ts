import { describe, expect, it } from "vitest"
import {
  buildCreateShippingAddressPayload,
  buildUpdateShippingAddressPayload,
} from "@/lib/shipping-addresses/payload"

const baseForm = {
  label: " Home ",
  name: " Jane Doe ",
  email: " jane@example.com ",
  phone: " +1 (555) 123-4567 ",
  line1: " 123 Main St ",
  city: " New York ",
  state: " NY ",
  postalCode: " 10001 ",
}

describe("shipping-addresses payload builders", () => {
  it("omits line2 on create when user leaves it empty", () => {
    const payload = buildCreateShippingAddressPayload({
      ...baseForm,
      line2: "   ",
    })

    expect(payload).toEqual({
      label: "Home",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1 (555) 123-4567",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US",
      line2: undefined,
    })
  })

  it("sends explicit null line2 on update when user clears it", () => {
    const payload = buildUpdateShippingAddressPayload({
      ...baseForm,
      line2: "",
    })

    expect(payload).toEqual({
      label: "Home",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1 (555) 123-4567",
      line1: "123 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US",
      line2: null,
    })
  })

  it("sends trimmed line2 value on update when present", () => {
    const payload = buildUpdateShippingAddressPayload({
      ...baseForm,
      line2: " Apt 9B ",
    })

    expect(payload.line2).toBe("Apt 9B")
  })
})
