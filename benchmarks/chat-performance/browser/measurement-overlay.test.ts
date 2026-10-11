import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { measurementBootstrap } from "./measurement-overlay"

const head = readFileSync("instrumentation-client.ts", "utf8")

/** Replaces one exact hunk; throws unless it occurs exactly once. */
function swap(text: string, from: string, to: string) {
  if (text.split(from).length !== 2) throw new Error(`Expected exactly one match for ${JSON.stringify(from)}`)
  return text.replace(from, to)
}

const deferredImport = 'import { startDeferredAnalytics } from "./lib/analytics/deferred-analytics"\n'
const eagerImport = 'import posthog from "posthog-js"\n'
const scrollDepthOptOut = `    // Document scroll-depth analytics force layout during nested chat scrolling.
    disable_scroll_properties: true,
`
// The base before ADR-0050 (c430fb2c): Replay and PostHog initialized eagerly.
const preAdr0050: ReadonlyArray<readonly [current: string, previous: string]> = [
  [deferredImport, eagerImport],
  ["  replaysSessionSampleRate", `  // Deterministic captures exclude remotely configured/random replay work.
  integrations: chatUiBenchmark ? [] : [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate`],
  [`// Replay (with the rates above) and PostHog load after the composer handoff (ADR-0050).
startDeferredAnalytics()
`, `const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (posthogKey && !posthog.__loaded) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false,
${scrollDepthOptOut}    ...(chatUiBenchmark ? { disable_session_recording: true } : {}),
  })
}
`],
]
const base = preAdr0050.reduce((text, [current, previous]) => swap(text, current, previous), head)

describe("measurement bootstrap", () => {
  it("upgrades audited older bootstraps to the current one", () => {
    expect(measurementBootstrap(head)).toBe(head)
    expect(measurementBootstrap(base)).toBe(head)
    // The legacy overlay base also predates the scroll-depth opt-out.
    expect(measurementBootstrap(swap(base, scrollDepthOptOut, ""))).toBe(head)
  })

  it("fails closed on any other difference", () => {
    for (const changed of [
      swap(head, 'import("./lib/observability/chat-ui-observer")', 'import("./lib/observability/other-observer")'),
      swap(head, "resumeOnVisible: !chatUiBenchmark", "resumeOnVisible: true"),
      swap(head, "Math.random() < Math.min", "Math.random() <= Math.min"),
      swap(head, '_tag: "chat_ui_perf"', '_tag: "chat_ui"'),
      swap(head, 'performance.mark("chat-perf:replay_disabled_v1")', 'performance.mark("chat-perf:other")'),
      swap(head, "startDeferredAnalytics()\n", ""),
    ]) {
      expect(measurementBootstrap(changed)).not.toBe(measurementBootstrap(base))
    }
    expect(() => measurementBootstrap(swap(base, eagerImport, deferredImport))).toThrow(/partially matches/)
  })
})
