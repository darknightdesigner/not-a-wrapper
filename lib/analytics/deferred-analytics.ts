import * as Sentry from "@sentry/nextjs"
import type { PostHog, Properties } from "posthog-js"

const chatUiBenchmark =
  process.env.NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION === "true"
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const COMPOSER_FALLBACK = "textarea.composer-fallback-textarea"
/** Analytics still load if the composer never hydrates. */
const COMPOSER_WAIT_LIMIT_MS = 20_000
const IDLE_TIMEOUT_MS = 2_000

let resolvePostHog: (posthog: PostHog) => void = () => {}
const posthogReady = new Promise<PostHog>((resolve) => {
  resolvePostHog = resolve
})

/** ADR-0047 handoff: the editor hides the server fallback when it mounts. */
function composerHandedOff() {
  const fallback =
    document.querySelector<HTMLTextAreaElement>(COMPOSER_FALLBACK)
  return !fallback || fallback.hidden
}

function afterComposerHandoff(run: () => void) {
  const check = () => {
    if (composerHandedOff()) return run()
    const finish = () => {
      observer.disconnect()
      clearTimeout(cap)
      run()
    }
    // Subtree, not the element: a client re-render can replace the fallback.
    const observer = new MutationObserver(() => {
      if (composerHandedOff()) finish()
    })
    const cap = setTimeout(finish, COMPOSER_WAIT_LIMIT_MS)
    observer.observe(document.documentElement, {
      subtree: true,
      attributeFilter: ["hidden"],
    })
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", check, { once: true })
  } else check()
}

function whenIdle(run: () => void) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
  } else setTimeout(run, 0)
}

function loadAnalytics() {
  // Benchmark builds keep both recorders off (ADR-0037).
  if (!chatUiBenchmark) {
    import("./sentry-replay")
      .then(({ replayIntegration }) =>
        Sentry.addIntegration(
          replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
          })
        )
      )
      .catch((error) => Sentry.captureException(error))
  }
  if (!posthogKey) return
  import("posthog-js")
    .then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(posthogKey, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          person_profiles: "identified_only",
          capture_pageview: false,
          // Document scroll-depth analytics force layout during nested chat scrolling.
          disable_scroll_properties: true,
          // Chat text is user content: recordings mask text nodes and input
          // values. Attribute values (an `aria-label` with a chat title) are not.
          session_recording: { maskTextSelector: "*", maskAllInputs: true },
          ...(chatUiBenchmark ? { disable_session_recording: true } : {}),
        })
      }
      resolvePostHog(posthog)
    })
    .catch((error) => Sentry.captureException(error))
}

/**
 * Loads Sentry Replay and PostHog after the composer handoff, then at idle,
 * so neither competes with hydration (ADR-0050).
 */
export function startDeferredAnalytics() {
  afterComposerHandoff(() => whenIdle(loadAnalytics))
}

/**
 * Queues a PostHog event until PostHog loads. Callers pass page properties
 * explicitly because PostHog reads unset ones at send time.
 */
export function captureAnalyticsEvent(event: string, properties: Properties) {
  if (!posthogKey) return
  const timestamp = new Date()
  void posthogReady.then((posthog) =>
    posthog.capture(event, properties, { timestamp })
  )
}
