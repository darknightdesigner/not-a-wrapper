/** @vitest-environment jsdom */
import * as Sentry from "@sentry/nextjs"
import posthog from "posthog-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("@sentry/nextjs", () => ({
  addIntegration: vi.fn(),
  replayIntegration: vi.fn((options: object) => ({ name: "Replay", options })),
  captureException: vi.fn(),
}))
vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), capture: vi.fn(), __loaded: false },
}))

async function start(benchmark: boolean) {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION", String(benchmark))
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-key")
  document.body.innerHTML =
    '<textarea class="composer-fallback-textarea"></textarea>'
  const analytics = await import("./deferred-analytics")
  analytics.startDeferredAnalytics()
  return analytics
}

beforeEach(() => vi.useFakeTimers({ now: 1_000 }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  document.body.innerHTML = ""
})

it("loads after the composer handoff and keeps queued pageview properties and time", async () => {
  const { captureAnalyticsEvent } = await start(false)
  const properties = { $current_url: "http://localhost/c/1", $pathname: "/c/1" }
  captureAnalyticsEvent("$pageview", properties)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(Sentry.addIntegration).not.toHaveBeenCalled()
  expect(posthog.init).not.toHaveBeenCalled()

  document.querySelector("textarea")!.hidden = true
  await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled())
  expect(Sentry.addIntegration).toHaveBeenCalledWith({
    name: "Replay",
    options: { maskAllText: true, maskAllInputs: true, blockAllMedia: true },
  })
  expect(posthog.init).toHaveBeenCalledWith("test-key", expect.objectContaining({
    capture_pageview: false,
    session_recording: expect.objectContaining({
      maskTextSelector: "*",
      maskAllInputs: true,
    }),
  }))
  expect(vi.mocked(posthog.init).mock.calls[0][1]).not.toHaveProperty("disable_session_recording")
  expect(posthog.capture).toHaveBeenCalledWith("$pageview", properties, {
    timestamp: new Date(1_000),
  })
})

it("drops the query string from same-origin auth URLs on events and recordings", async () => {
  await start(false)
  document.querySelector("textarea")!.hidden = true
  await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled())
  const options = vi.mocked(posthog.init).mock.calls[0][1]
  const sanitize = options?.before_send
  if (typeof sanitize !== "function") throw new Error("before_send missing")
  const origin = window.location.origin
  const kept = {
    $session_entry_url: `${origin}/c/1?q=1`,
    $initial_referrer: "https://example.com/auth/login?q=1",
  }
  expect(sanitize({
    uuid: "1",
    event: "$autocapture",
    properties: {
      $current_url: `${origin}/email-verification?email=a%40b.co#x`,
      $referrer: `${origin}/auth/reset-password?token=t`,
      ...kept,
    },
    $set_once: { $initial_current_url: `${origin}/auth?email=a%40b.co` },
  })).toEqual({
    uuid: "1",
    event: "$autocapture",
    properties: {
      $current_url: `${origin}/email-verification#x`,
      $referrer: `${origin}/auth/reset-password`,
      ...kept,
    },
    $set_once: { $initial_current_url: `${origin}/auth` },
  })
  const request = { entryType: "navigation", startTime: 0, duration: 0 }
  expect(options?.session_recording?.maskCapturedNetworkRequestFn?.({
    ...request,
    name: `${origin}/auth/callback?code=c`,
  })).toEqual({ ...request, name: `${origin}/auth/callback` })
})

it("loads at the 20 s cap without a handoff, recorders off in benchmark builds", async () => {
  await start(true)
  await vi.advanceTimersByTimeAsync(19_999)
  expect(posthog.init).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await vi.waitFor(() => expect(posthog.init).toHaveBeenCalledWith("test-key",
    expect.objectContaining({ disable_session_recording: true })))
  expect(Sentry.addIntegration).not.toHaveBeenCalled()
})
