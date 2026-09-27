"use client"

import { SystemMessage } from "@/components/ui/system-message"
import * as Sentry from "@sentry/nextjs"
import { catchError, type ErrorInfo } from "next/error"
import { useEffect } from "react"

/** Shared UI for render failures caught by `app/error.tsx` and the shell. */
export function RouteErrorFallback({
  error,
  retry,
}: Pick<ErrorInfo, "error" | "retry">) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <SystemMessage
        variant="error"
        fill
        role="alert"
        cta={{ label: "Retry", onClick: retry }}
      >
        Something went wrong.
      </SystemMessage>
    </div>
  )
}

/**
 * Boundary for the shell's main pane. Chat is owned by the persistent (chat)
 * layout, so a segment `error.tsx` can only catch its throws by replacing the
 * whole shell; this keeps the sidebar usable to leave or delete the chat.
 * `catchError` clears on client navigation and lets `notFound()` through.
 */
export const MainContentErrorBoundary = catchError(
  function MainContentErrorFallback(
    _props: Record<string, unknown>,
    { error, retry }: ErrorInfo
  ) {
    return <RouteErrorFallback error={error} retry={retry} />
  }
)
