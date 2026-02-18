import { afterEach, describe, expect, it, vi } from "vitest"
import type { PayClawConfig } from "./config"
import { createJob, PayClawApiError } from "./client"

const BASE_CONFIG: PayClawConfig = {
  apiKey: "pk_test",
  appBaseUrl: "https://payclaw.example.com",
}

const BASE_CONFIG_WITH_DEFAULT_CARD: PayClawConfig = {
  ...BASE_CONFIG,
  defaultCardId: "card_default_123",
}

function mockCreatedResponse(status: "created" | "retry" | "active" | "completed" | "failed" | "cancelled" = "created") {
  return new Response(JSON.stringify({ jobId: "job_123", status }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  })
}

function getRequestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  const rawBody = init?.body
  if (typeof rawBody !== "string") {
    throw new Error("Expected JSON string body")
  }
  return JSON.parse(rawBody) as Record<string, unknown>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createJob request mapping", () => {
  it("sends direct payload shape for product-page URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockCreatedResponse())
    vi.stubGlobal("fetch", fetchMock)

    await createJob(
      {
        url: "https://example.com/product/123",
        maxSpend: 1500,
        shippingAddress: {
          name: "Jane Doe",
          line1: "1 Main St",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "US",
        },
        paymentMethod: { type: "brex", cardId: "card_abc" },
        browserProvider: "anchor",
      },
      BASE_CONFIG
    )

    const body = getRequestBody(fetchMock)
    expect(body).toMatchObject({
      url: "https://example.com/product/123",
      maxSpend: 1500,
      browserProvider: "anchor",
      paymentMethod: { type: "brex", cardId: "card_abc" },
    })
    expect(body).toHaveProperty("shippingAddress")
    expect(body).not.toHaveProperty("vendor")
    expect(body).not.toHaveProperty("product")
    expect(body).not.toHaveProperty("userEmail")
    expect(body).not.toHaveProperty("cardId")
  })

  it("sends indirect payload shape for vendor + product flow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockCreatedResponse())
    vi.stubGlobal("fetch", fetchMock)

    await createJob(
      {
        url: "https://example.com/some/path",
        product: "Pro Plan",
        maxSpend: 2500,
      },
      BASE_CONFIG
    )

    const body = getRequestBody(fetchMock)
    expect(body).toEqual({
      vendor: "https://example.com",
      product: "Pro Plan",
      maxSpend: 2500,
    })
    expect(body).not.toHaveProperty("url")
    expect(body).not.toHaveProperty("userEmail")
    expect(body).not.toHaveProperty("cardId")
  })

  it("injects default payment method when PAYCLAW_CARD_ID is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockCreatedResponse())
    vi.stubGlobal("fetch", fetchMock)

    await createJob(
      {
        url: "https://example.com/product/123",
        maxSpend: 1500,
      },
      BASE_CONFIG_WITH_DEFAULT_CARD
    )

    const body = getRequestBody(fetchMock)
    expect(body).toMatchObject({
      url: "https://example.com/product/123",
      maxSpend: 1500,
      paymentMethod: { type: "brex", cardId: "card_default_123" },
    })
  })

  it("prefers explicit paymentMethod over default card", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockCreatedResponse())
    vi.stubGlobal("fetch", fetchMock)

    await createJob(
      {
        url: "https://example.com/product/123",
        maxSpend: 1500,
        paymentMethod: { type: "wex" },
      },
      BASE_CONFIG_WITH_DEFAULT_CARD
    )

    const body = getRequestBody(fetchMock)
    expect(body).toMatchObject({
      url: "https://example.com/product/123",
      maxSpend: 1500,
      paymentMethod: { type: "wex" },
    })
  })
})

describe("createJob error handling", () => {
  it("throws PayClawApiError with parsed API payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid API key", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      createJob(
        {
          url: "https://example.com/product/123",
          maxSpend: 1000,
        },
        BASE_CONFIG
      )
    ).rejects.toMatchObject({
      name: "PayClawApiError",
      statusCode: 401,
      code: "UNAUTHORIZED",
      message: "Invalid API key",
    } satisfies Partial<PayClawApiError>)
  })
})

describe("createJob response parsing", () => {
  it("accepts non-created valid upstream job statuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockCreatedResponse("active"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      createJob(
        {
          url: "https://example.com/product/123",
          maxSpend: 1000,
        },
        BASE_CONFIG
      )
    ).resolves.toEqual({ jobId: "job_123", status: "active" })
  })
})
