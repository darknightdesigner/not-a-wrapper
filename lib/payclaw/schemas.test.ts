import { describe, expect, it } from "vitest"
import {
  payClawToolInputSchema,
  shippingAddressSchema,
  browserProviderSchema,
  paymentMethodSchema,
  jobResultSchema,
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
      paymentMethod: { type: "brex", cardId: "card_456" },
      browserProvider: "anchor",
    })

    expect(result.success).toBe(true)
  })
})

describe("jobResultSchema", () => {
  it("parses a successful physical product result", () => {
    const result = jobResultSchema.safeParse({
      success: true,
      productObtained: "Blue Widget",
      cardUsed: "4242",
      skillsUsed: ["shopify_checkout"],
    })

    expect(result.success).toBe(true)
    expect(result.data?.productObtained).toBe("Blue Widget")
  })

  it("parses a SaaS result with credentials", () => {
    const result = jobResultSchema.safeParse({
      success: true,
      credentials: "sk-abc123",
      skillsUsed: ["saas_signup"],
    })

    expect(result.success).toBe(true)
    expect(result.data?.credentials).toBe("sk-abc123")
  })

  it("accepts undefined result", () => {
    expect(jobResultSchema.safeParse(undefined).success).toBe(true)
  })
})
