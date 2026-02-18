import { describe, expect, it } from "vitest"
import {
  payClawToolInputSchema,
  shippingAddressSchema,
  browserProviderSchema,
  paymentMethodSchema,
  jobResultSchema,
  reportedDataSchema,
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

describe("jobResultSchema", () => {
  it("parses a successful physical product result with reportedData", () => {
    const result = jobResultSchema.safeParse({
      success: true,
      productObtained: "Blue Widget",
      orderNumber: "ORD-12345",
      cardUsed: "4242",
      reportedData: {
        orderNumber: "ORD-12345",
        total: "$18.99",
        items: ["Blue Widget x1"],
        shippingMethod: "Standard",
        trackingNumber: "1Z999AA10123456784",
        deliveryEstimate: "Feb 25, 2026",
        email: "jane@example.com",
      },
      skillsUsed: ["shopify_checkout"],
    })

    expect(result.success).toBe(true)
    expect(result.data?.reportedData?.trackingNumber).toBe("1Z999AA10123456784")
  })

  it("parses a SaaS result with credentials", () => {
    const result = jobResultSchema.safeParse({
      success: true,
      credentials: "sk-abc123",
      credentialIds: ["cred_001", "cred_002"],
      skillsUsed: ["saas_signup"],
    })

    expect(result.success).toBe(true)
    expect(result.data?.credentialIds).toEqual(["cred_001", "cred_002"])
  })

  it("accepts null result", () => {
    expect(jobResultSchema.safeParse(null).success).toBe(true)
  })

  it("accepts undefined result", () => {
    expect(jobResultSchema.safeParse(undefined).success).toBe(true)
  })
})

describe("reportedDataSchema", () => {
  it("allows unknown extra fields via catchall", () => {
    const result = reportedDataSchema.safeParse({
      orderNumber: "ORD-999",
      customVendorField: "some-value",
    })

    expect(result.success).toBe(true)
    expect(result.data?.orderNumber).toBe("ORD-999")
    expect((result.data as Record<string, unknown>)["customVendorField"]).toBe("some-value")
  })
})
