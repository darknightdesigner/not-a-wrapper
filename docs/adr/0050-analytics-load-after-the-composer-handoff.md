# ADR-0050: Analytics load after the composer handoff

**Status:** Accepted
**Date:** 2026-10-10
**Related:** ADR-0037 (responsiveness measurement), ADR-0047 (pre-hydration
composer input), ADR-0049 (count and payload ratchets);
[investigation](../performance/2026-10-10-clear-wins-investigation.md#win-4-get-analytics-off-the-critical-path)

## Context

`instrumentation-client.ts` started Sentry Replay (session rate 0.1, on-error
rate 1, so rrweb ran in every session) and PostHog eagerly, and the PostHog
provider imported `posthog-js/react`. PostHog's remote config records 100% of
sessions with `masking: null`. Two rrweb recorders, Sentry's core and the
posthog-js core were all in the build manifest's root main files, which every
page loads before hydration: 321.0 KiB gzip. On a 4x CPU, constrained-network
guest load of `/`, the editor became editable 7.8 s after navigation.

PostHog's default masks only form inputs, and the composer is a
contenteditable editor. With the production remote config, decoded PostHog
snapshots from scratch builds carried streamed probe text in clear in every
run. Chat messages and answers in production are almost certainly recorded in
clear (no production recording was viewed).

## Options

1. **`load` plus idle.** Rejected: `load` fired before hydration in most
   constrained loads.
2. **A root-provider effect.** Rejected: selective hydration can run it before
   the composer segment hydrates.
3. **Call a trigger from `components/ui/prompt-input.tsx`.** Works, but couples
   a UI primitive to analytics; the fallback's `hidden` attribute is already the
   ADR-0047 handoff contract.
4. **Sentry `lazyLoadIntegration`.** Rejected: it loads from
   `browser.sentry-cdn.com`, which the CSP in `next.config.ts` blocks.
5. **Defer `Sentry.init` too.** Worth up to 452 ms more on the constrained
   network, but loses hydration-time errors and early web vitals without a
   buffering shim. Revisit only with a trimmed tracing config.
6. **Eager Sentry core; Replay and PostHog after the composer handoff, then at
   idle.** Chosen.

## Decision

- **Eager Sentry core.** `Sentry.init` keeps errors, scrubbing,
  `tracesSampler`, `onRouterTransitionStart` and the web vitals ADR-0037 uses.
  It carries the replay rates but no Replay integration. Sentry's application
  key marks first-party bundles, and the eager third-party error filter drops
  browser errors only when every stack frame comes from unmarked code. Mixed
  stacks remain visible.
- **Trigger** (`lib/analytics/deferred-analytics.ts`). After the document is
  parsed, analytics wait until no visible `textarea.composer-fallback-textarea`
  remains: the editor hides it at mount (ADR-0047). A `MutationObserver` watches
  `hidden` attributes and child-list changes across the document, since a
  client re-render can replace or remove the fallback. Routes without the
  fallback are ready at parse. A 20 s cap loads analytics if the composer never
  hydrates. Loading then waits for `requestIdleCallback` (2 s timeout;
  `setTimeout` where it is missing).
- **Replay.** `Sentry.addIntegration(replayIntegration({ maskAllText,
  maskAllInputs, blockAllMedia }))`, imported through the one-line split point
  `lib/analytics/sentry-replay.ts` (39.8 KB gzip async; a dynamic
  `import("@sentry/nextjs")` would be 102.9 KB). The rates come from the init
  options when the integration attaches.
- **PostHog.** `import("posthog-js")`, then `init` with the previous options.
  `posthog-js/react` is gone because it pulls posthog-js into the initial set,
  and so is `PostHogProvider`: `app/providers/index.tsx` mounts the pageview
  tracker directly.
- **Pageviews.** `captureAnalyticsEvent` queues events until PostHog loads and
  stamps the call time as the event `timestamp`. The tracker passes
  `$current_url`, `$pathname` and `$host`, because PostHog fills unset
  properties at send time. It always sets `title` and `$prev_pageview_*` then,
  so a view queued across a client navigation gets the newer title. Accepted.
  If the posthog-js chunk fails to load, the error goes to Sentry and queued
  and later events are dropped.
- **URL privacy.** Auth routes carry emails, reset tokens and OAuth codes in
  the query string. One sanitizer drops the query from same-origin `/auth` and
  `/email-verification` URLs: `before_send` applies it to every string property
  of every event, queued pageviews included (`$current_url`, `$referrer` and
  their session-entry and initial copies), and
  `session_recording.maskCapturedNetworkRequestFn` applies it to the page URLs
  recordings store.
- **Recording privacy.** PostHog session recording masks all text and inputs
  on the client: `session_recording: { maskTextSelector: "*", maskAllInputs:
  true }`. posthog-js prefers client masking over the remote config, so this
  holds while the project setting is null or if it is loosened later. It masks
  text nodes and input values, not attribute values.
- **Benchmark builds** (perf flag on) keep both recorders off: no Replay,
  rates 0 and `disable_session_recording` (ADR-0037).
- **Ratchet** (`scripts/check-initial-js.ts`, after `bun run build:next` in the
  CI Build job). The root main files must stay within 225 KiB gzip. Neither
  they nor the root layout's chunks may contain `rrweb` (either recorder) or
  `persistence_name` (posthog-js core), so a static analytics import in a
  root-layout client component also fails. Lower the budget as other changes
  shrink the set (ADR-0049).
- **Paired gate.** `measurementBootstrap` in
  `benchmarks/chat-performance/browser/measurement-overlay.ts` rewrites only
  exact, audited analytics revisions of `instrumentation-client.ts` to the
  current text before comparing base and head. A revision applies whole or not
  at all, and a partial match fails closed. Observer installation and reporting
  still compare byte for byte.

## Consequences

- Initial JS falls from 321.0 to 219.4 KiB gzip in the CI build (219.5 KiB with
  analytics keys). In the investigation (constrained network, 4x CPU, guest
  `/`, n=10 per arm), editor editable and first live data arrived about 0.7 s
  sooner (-716 ms, 95% CI -1,037 to -644). The first keystroke does not move
  (ADR-0047 fallback). Total blocking time before the editor fell 269 ms;
  about 165 ms moved after it.
- Analytics started after editor editable in every scratch load: 42 of 42 in
  the investigation and 4 of 4 on this implementation (14 to 18 ms after the
  handoff, local). Replay attaches in buffer mode with rates 0.1 and 1.
- With the production remote config, probe text appeared in clear in 4 of 4
  snapshot sets without the masking option and 0 of 4 with it (masked text was
  recorded instead).
- Attribute values stay in clear, as before: every visible-text match left in
  the decoded snapshots was an attribute (meta `content`, `aria-label`). Signed-in
  recordings still carry chat and project titles (sidebar pin buttons'
  `aria-label`), file names (file chip labels) and activity `title`s. Masking
  them (`blockSelector` on those controls, or titles out of labels) is a
  separate decision.
- Errors before Replay attaches get no replay: hydration errors and everything
  until shortly after the handoff, seconds on slow networks. The Sentry error
  itself is still captured. Session replays miss page load.
- A `$pageview` is lost if the tab closes before PostHog loads, about 0.5 to
  0.9 s after the editor. The share of sessions affected is unverified.
- Work is moved, not removed: Replay costs about 206 ms and PostHog about
  290 ms of CPU per cold load at 4x. During streaming, PostHog recording costs
  about +570 ms per 6 s in a synthetic probe, with or without masking. Only
  turning PostHog recording off removes it; both recorders stay by decision.
- Signed-in loads use the same root chunks; their timing is verified only by
  the paired signed-in CI run.
- Renaming the fallback class or changing how the editor hides it must update
  `lib/analytics/deferred-analytics.ts`, or analytics wait for the 20 s cap.
