import { expect, it, vi } from "vitest"

const { withSentryConfig } = vi.hoisted(() => ({
  withSentryConfig: vi.fn((config, options) => ({ config, options })),
}))

vi.mock("@sentry/nextjs", () => ({ withSentryConfig }))

it("marks first-party bundles for Sentry's client error filter", async () => {
  await import("./next.config")

  expect(withSentryConfig).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ applicationKey: "not-a-wrapper" })
  )
})
