import { describe, expect, it } from "vitest"
import { buildUpdateShippingAddressPayload } from "../lib/shipping-addresses/payload"
import { buildShippingAddressPatch } from "./shippingAddressPatch"
import { shippingAddressSchema } from "../lib/payclaw/schemas"

describe("shipping address client/server contract", () => {
  it("clears line2 in patch when user clears line2 in the form", () => {
    const updatePayload = buildUpdateShippingAddressPayload({
      label: "Home",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1 (555) 123-4567",
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
    expect(patch).toHaveProperty("email", "jane@example.com")
    expect(patch).toHaveProperty("phone", "+1 (555) 123-4567")
  })

  it("Convex document with all fields maps to valid PayClaw ShippingAddress", () => {
    // Simulates the cleanDefaultShippingAddress builder in route.ts (lines 423–434).
    const convexDoc = {
      _id: "j97abc" as any,
      _creationTime: 1234567890,
      userId: "k97xyz" as any,
      label: "Home",
      isDefault: true,
      createdAt: 1234567890,
      name: "Jane Doe",
      line1: "123 Main St",
      line2: "Apt 4B",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US",
      phone: "+15551234567",
      email: "jane@example.com",
    }

    const mapped = {
      name: convexDoc.name,
      line1: convexDoc.line1,
      line2: convexDoc.line2,
      city: convexDoc.city,
      state: convexDoc.state,
      postalCode: convexDoc.postalCode,
      country: convexDoc.country,
      phone: convexDoc.phone,
      email: convexDoc.email,
    }

    const result = shippingAddressSchema.safeParse(mapped)
    expect(result.success).toBe(true)
  })

  it("legacy Convex document without phone/email maps to valid PayClaw ShippingAddress", () => {
    const legacyDoc = {
      _id: "j97abc" as any,
      _creationTime: 1234567890,
      userId: "k97xyz" as any,
      label: "Work",
      isDefault: false,
      createdAt: 1234567890,
      name: "Jane Doe",
      line1: "456 Corporate Blvd",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US",
    }

    const mapped = {
      name: legacyDoc.name,
      line1: legacyDoc.line1,
      line2: undefined,
      city: legacyDoc.city,
      state: legacyDoc.state,
      postalCode: legacyDoc.postalCode,
      country: legacyDoc.country,
      phone: undefined,
      email: undefined,
    }

    const result = shippingAddressSchema.safeParse(mapped)
    expect(result.success).toBe(true)
  })
})
