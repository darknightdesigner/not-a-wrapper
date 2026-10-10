import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { measurementBootstrap } from "./measurement-overlay"

const head = readFileSync("instrumentation-client.ts", "utf8")
// The base before ADR-0050 (c430fb2c): Replay and PostHog initialized eagerly.
const base = head
  .replace(
    'import { startDeferredAnalytics } from "./lib/analytics/deferred-analytics"\n',
    'import posthog from "posthog-js"\n'
  )
  .replace("  replaysSessionSampleRate", `  // Deterministic captures exclude remotely configured/random replay work.
  integrations: chatUiBenchmark ? [] : [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate`)
  .replace(/\/\/ Replay \(with[^\n]*\nstartDeferredAnalytics\(\)\n/, `const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (posthogKey && !posthog.__loaded) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false,
    // Document scroll-depth analytics force layout during nested chat scrolling.
    disable_scroll_properties: true,
    ...(chatUiBenchmark ? { disable_session_recording: true } : {}),
  })
}
`)

describe("measurement bootstrap", () => {
  it("ignores the audited analytics move", () => {
    expect(base).not.toBe(head)
    expect(measurementBootstrap(head)).not.toMatch(/posthog|startDeferredAnalytics/i)
    expect(measurementBootstrap(base)).toBe(measurementBootstrap(head))
  })

  it("still compares observer installation and reporting", () => {
    for (const changed of [
      head.replace('import("./lib/observability/chat-ui-observer")', 'import("./lib/observability/other-observer")'),
      head.replace("resumeOnVisible: !chatUiBenchmark", "resumeOnVisible: true"),
      head.replace("Math.random() < Math.min", "Math.random() <= Math.min"),
      head.replace('_tag: "chat_ui_perf"', '_tag: "chat_ui"'),
      head.replace('performance.mark("chat-perf:replay_disabled_v1")', 'performance.mark("chat-perf:other")'),
    ]) {
      expect(changed).not.toBe(head)
      expect(measurementBootstrap(changed)).not.toBe(measurementBootstrap(base))
    }
  })
})
