import { describe, expect, it } from "vitest"
import {
  payClawToolInputSchema,
  shippingAddressSchema,
  browserProviderSchema,
  paymentMethodSchema,
} from "./schemas"

describe("payclaw schemas", () => {
  it("requires shippingAddress.name when shippingAddress is provided", () => {
    const result = shippingAddressSchema.safeParse({
      line1: "1 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US",
    })

    expect(result.success).toBe(false)
  })

  it("accepts shippingAddress with phone and email", () => {
    const result = shippingAddressSchema.safeParse({
      name: "Jane Doe",
      line1: "1 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US",
      phone: "+1-555-0100",
      email: "jane@example.com",
    })

    expect(result.success).toBe(true)
  })

  it("accepts paymentMethod brex with cardId", () => {
    expect(
      paymentMethodSchema.safeParse({
        type: "brex",
        cardId: "card_123",
      }).success
    ).toBe(true)
  })

  it("accepts paymentMethod wex", () => {
    expect(paymentMethodSchema.safeParse({ type: "wex" }).success).toBe(true)
  })

  it("rejects invalid browserProvider", () => {
    expect(browserProviderSchema.safeParse("invalid").success).toBe(false)
  })

  it("supports direct buy payload in tool input", () => {
    const result = payClawToolInputSchema.safeParse({
      url: "https://example.com/product/123",
      maxSpend: 1500,
    })

    expect(result.success).toBe(true)
  })

  it("supports indirect buy payload in tool input", () => {
    const result = payClawToolInputSchema.safeParse({
      url: "https://example.com",
      product: "Pro Plan",
      maxSpend: 2500,
      paymentMethod: { type: "wex" },
      browserProvider: "anchor",
    })

    expect(result.success).toBe(true)
  })
})
