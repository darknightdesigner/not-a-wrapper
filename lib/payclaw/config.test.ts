import { afterEach, describe, expect, it, vi } from "vitest"
import { getPayClawConfig } from "./config"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

describe("getPayClawConfig", () => {
  it("returns null when PAYCLAW_API_KEY is missing", () => {
    delete process.env.PAYCLAW_API_KEY
    process.env.PAYCLAW_APP_URL = "https://payclaw.example.com"

    expect(getPayClawConfig()).toBeNull()
  })

  it("returns null when PAYCLAW_APP_URL is missing", () => {
    process.env.PAYCLAW_API_KEY = "pk_test"
    delete process.env.PAYCLAW_APP_URL

    expect(getPayClawConfig()).toBeNull()
  })

  it("returns config when only required env vars are set", () => {
    process.env.PAYCLAW_API_KEY = "pk_test"
    process.env.PAYCLAW_APP_URL = "https://payclaw.example.com"
    delete process.env.PAYCLAW_USER_EMAIL
    delete process.env.PAYCLAW_CARD_ID

    expect(getPayClawConfig()).toEqual({
      apiKey: "pk_test",
      appBaseUrl: "https://payclaw.example.com",
    })
  })

  it("normalizes PAYCLAW_APP_URL by stripping trailing slash", () => {
    process.env.PAYCLAW_API_KEY = "pk_test"
    process.env.PAYCLAW_APP_URL = "https://payclaw.example.com/"

    expect(getPayClawConfig()).toEqual({
      apiKey: "pk_test",
      appBaseUrl: "https://payclaw.example.com",
    })
  })
})
