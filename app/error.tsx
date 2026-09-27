"use client"

import { RouteErrorFallback } from "@/app/components/layout/route-error-fallback"
import type { ErrorInfo } from "next/error"

/**
 * Segment boundary under the root layout: providers and theme stay mounted
 * when a child segment throws outside the shell's main-pane boundary.
 */
export default function RootSegmentError({ error, retry }: ErrorInfo) {
  return <RouteErrorFallback error={error} retry={retry} />
}
