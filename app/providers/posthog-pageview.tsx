"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import { captureAnalyticsEvent } from "@/lib/analytics/deferred-analytics"

function PostHogPageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    const query = searchParams.toString()
    // PostHog loads after the composer handoff (ADR-0050), so the view's own
    // URL is passed rather than read when the queued event sends. Its
    // `before_send` drops the query string on auth routes.
    captureAnalyticsEvent("$pageview", {
      $current_url: window.origin + pathname + (query ? `?${query}` : ""),
      $host: window.location.host,
      $pathname: pathname,
    })
  }, [pathname, searchParams])

  return null
}

// No PostHog context provider: posthog-js loads after the composer handoff
// (ADR-0050), and `posthog-js/react` would pull it back into the initial
// bundle. Next requires a Suspense boundary around useSearchParams.
export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewTracker />
    </Suspense>
  )
}
