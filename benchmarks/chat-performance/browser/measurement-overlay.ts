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

/**
 * Audited product-analytics text in instrumentation-client.ts, removed in order
 * before comparing. Only these exact hunks may differ; observer installation
 * and reporting are compared byte for byte.
 */
const PRODUCT_ANALYTICS_HUNKS = [
  // PostHog scroll-depth opt-out.
  "    // Document scroll-depth analytics force layout during nested chat scrolling.\n" +
    "    disable_scroll_properties: true,\n",
  // ADR-0050: eager Replay and PostHog (base) moved behind the composer handoff (head).
  'import posthog from "posthog-js"\n',
  "  // Deterministic captures exclude remotely configured/random replay work.\n" +
    "  integrations: chatUiBenchmark ? [] : [\n" +
    "    Sentry.replayIntegration({\n" +
    "      maskAllText: true,\n" +
    "      maskAllInputs: true,\n" +
    "      blockAllMedia: true,\n" +
    "    }),\n" +
    "  ],\n",
  "const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY\n\n" +
    "if (posthogKey && !posthog.__loaded) {\n" +
    "  posthog.init(posthogKey, {\n" +
    "    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,\n" +
    '    person_profiles: "identified_only",\n' +
    "    capture_pageview: false,\n" +
    "    ...(chatUiBenchmark ? { disable_session_recording: true } : {}),\n" +
    "  })\n" +
    "}\n\n",
  'import { startDeferredAnalytics } from "./lib/analytics/deferred-analytics"\n',
  "// Replay (with the rates above) and PostHog load after the composer handoff (ADR-0050).\n" +
    "startDeferredAnalytics()\n\n",
]

export function measurementBootstrap(source: string): string {
  return PRODUCT_ANALYTICS_HUNKS.reduce((text, hunk) => text.replace(hunk, ""), source)
}
