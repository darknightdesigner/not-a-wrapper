/** The original product revision; this overlay adds measurement hooks only. */
export const LEGACY_MEASUREMENT_BASE =
  "af97141b973e530ce579bea573a3534eb33a8d60"

export const LEGACY_MEASUREMENT_PATCH =
  "benchmarks/chat-performance/browser/measurement-overlay.patch"

/** Copy these exact implementations from the candidate into the legacy checkout. */
export const MEASUREMENT_FILES = [
  "lib/observability/chat-ui-observer.ts",
  "lib/observability/chat-ui-events.ts",
  "lib/observability/chat-performance.ts",
  "lib/observability/chat-responsiveness.ts",
  "lib/observability/composer-paint.ts",
] as const

/** Audit boundary for the patch. These files retain the original product code. */
export const MEASUREMENT_HOOK_FILES = [
  "instrumentation-client.ts",
  "app/components/chat-input/button-plus-menu.tsx",
  "app/components/chat-input/composer.tsx",
  "app/components/chat/message-assistant.tsx",
  "app/components/chat/thread-scroll-anchors.ts",
  "app/components/chat/thread-scroll-target.ts",
  "app/components/chat/thread-scroll.tsx",
  "app/components/chat/use-detachable-chat-stream.ts",
  "lib/chat-performance/message-throttle.ts",
  "lib/user-store/provider.tsx",
] as const

const SCROLL_DEPTH_OPT_OUT =
  "    // Document scroll-depth analytics force layout during nested chat scrolling.\n" +
  "    disable_scroll_properties: true,\n"
const BENCHMARK_RECORDING_OFF =
  "    ...(chatUiBenchmark ? { disable_session_recording: true } : {}),\n"

/** One audited change: exact earlier hunks and their replacements. */
type AnalyticsRevision = ReadonlyArray<readonly [before: string, after: string]>

/**
 * Audited product-analytics revisions of instrumentation-client.ts, oldest
 * first. Only these exact hunks are rewritten to their successors; everything
 * else, analytics start, observer installation and reporting included, must
 * match byte for byte.
 */
const ANALYTICS_REVISIONS: readonly AnalyticsRevision[] = [
  // PostHog scroll-depth opt-out.
  [[
    "    capture_pageview: false,\n" + BENCHMARK_RECORDING_OFF,
    "    capture_pageview: false,\n" + SCROLL_DEPTH_OPT_OUT + BENCHMARK_RECORDING_OFF,
  ]],
  // ADR-0050: eager Replay and PostHog move behind the composer handoff.
  [
    [
      'import posthog from "posthog-js"\n',
      'import { startDeferredAnalytics } from "./lib/analytics/deferred-analytics"\n',
    ],
    [
      "  // Deterministic captures exclude remotely configured/random replay work.\n" +
        "  integrations: chatUiBenchmark ? [] : [\n" +
        "    Sentry.replayIntegration({\n" +
        "      maskAllText: true,\n" +
        "      maskAllInputs: true,\n" +
        "      blockAllMedia: true,\n" +
        "    }),\n" +
        "  ],\n",
      "",
    ],
    [
      "const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY\n\n" +
        "if (posthogKey && !posthog.__loaded) {\n" +
        "  posthog.init(posthogKey, {\n" +
        "    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,\n" +
        '    person_profiles: "identified_only",\n' +
        "    capture_pageview: false,\n" +
        SCROLL_DEPTH_OPT_OUT +
        BENCHMARK_RECORDING_OFF +
        "  })\n" +
        "}\n\n",
      "// Replay (with the rates above) and PostHog load after the composer handoff (ADR-0050).\n" +
        "startDeferredAnalytics()\n\n",
    ],
  ],
]

/**
 * Upgrades an audited older bootstrap to the current text. A revision applies
 * whole or not at all; a partial or repeated match fails closed.
 */
export function measurementBootstrap(source: string): string {
  return ANALYTICS_REVISIONS.reduce((text, revision, index) => {
    const matches = revision.map(([before]) => text.split(before).length - 1)
    if (matches.every((count) => count === 0)) return text
    if (matches.some((count) => count !== 1))
      throw new Error(
        `Measurement bootstrap partially matches audited analytics revision ${index + 1}; review a measurement-only overlay before comparing`,
      )
    return revision.reduce((next, [before, after]) => next.replace(before, after), text)
  }, source)
}
