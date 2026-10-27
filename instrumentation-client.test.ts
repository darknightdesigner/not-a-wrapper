import { afterEach, expect, it, vi } from "vitest"
import * as Sentry from "@sentry/nextjs"
import { startDeferredAnalytics } from "./lib/analytics/deferred-analytics"
import { installChatUiObserver } from "./lib/observability/chat-ui-observer"

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock("./lib/analytics/deferred-analytics", () => ({ startDeferredAnalytics: vi.fn() }))
vi.mock("./lib/observability/chat-ui-observer", () => ({ installChatUiObserver: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  performance.clearMarks("chat-perf:replay_disabled_v1")
})

it.each([false, true])("keeps Sentry eager and defers Replay and PostHog for benchmark=%s", async (benchmark) => {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION", String(benchmark))
  vi.stubEnv("NEXT_PUBLIC_CHAT_UI_SAMPLE_RATE", "0")
  await import("./instrumentation-client")
  await vi.dynamicImportSettled()
  expect(installChatUiObserver).toHaveBeenCalledTimes(benchmark ? 1 : 0)
  expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
    replaysSessionSampleRate: benchmark ? 0 : 0.1,
    replaysOnErrorSampleRate: benchmark ? 0 : 1,
    tracesSampler: expect.any(Function),
    beforeSend: expect.any(Function),
  }))
  // Replay attaches after the composer handoff, never at init (ADR-0050).
  expect(vi.mocked(Sentry.init).mock.calls[0][0]).not.toHaveProperty("integrations")
  expect(startDeferredAnalytics).toHaveBeenCalledTimes(1)
  expect(performance.getEntriesByName("chat-perf:replay_disabled_v1")).toHaveLength(benchmark ? 1 : 0)
})
