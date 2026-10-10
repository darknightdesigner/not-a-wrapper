"use client"

import type { ReactNode } from "react"
import { PostHogPageView } from "./posthog-pageview"

// No PostHog context: posthog-js loads after the composer handoff (ADR-0050),
// and `posthog-js/react` would pull it back into the initial bundle.
export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <PostHogPageView />
      {children}
    </>
  )
}
