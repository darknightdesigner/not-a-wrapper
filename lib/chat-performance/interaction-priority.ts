import { useCallback, useEffect, useRef } from "react"

/**
 * Interaction priority over streaming paint (ADR-0016). A click-opened popup
 * becomes visible through a React update Base UI schedules from
 * requestAnimationFrame (its starting -> idle flip). A streaming publication
 * in the next frame is a synchronous render that runs first and delays it.
 * While a hold is active, streaming publications wait for a later frame.
 * Every hold expires after HOLD_CAP_MS, so streaming can never stall.
 */
const HOLD_CAP_MS = 300

const holds = new Set<{ expiresAt: number }>()

/** Holds streaming paint until the returned release runs or the cap passes. */
export function holdStreamingPaint(): () => void {
  const hold = { expiresAt: performance.now() + HOLD_CAP_MS }
  holds.add(hold)
  return () => {
    holds.delete(hold)
  }
}

export function isStreamingPaintHeld(): boolean {
  const now = performance.now()
  for (const hold of holds) {
    if (hold.expiresAt > now) return true
    holds.delete(hold)
  }
  return false
}

/**
 * Root callbacks for a click-opened popup primitive: open intent holds
 * streaming paint until the open completes (Base UI waits for the starting
 * style to clear), the popup closes, or the root unmounts. Hover opens never
 * hold, so hovering cannot stutter a stream.
 */
export function useOpenIntentPriority<Details extends { reason: string }>(
  onOpenChange: ((open: boolean, details: Details) => void) | undefined,
  onOpenChangeComplete: ((open: boolean) => void) | undefined
) {
  const release = useRef<(() => void) | null>(null)
  const releaseHold = useCallback(() => {
    release.current?.()
    release.current = null
  }, [])
  useEffect(() => releaseHold, [releaseHold])

  return {
    onOpenChange: (open: boolean, details: Details) => {
      releaseHold()
      if (open && details.reason !== "trigger-hover")
        release.current = holdStreamingPaint()
      onOpenChange?.(open, details)
    },
    onOpenChangeComplete: (open: boolean) => {
      if (open) releaseHold()
      onOpenChangeComplete?.(open)
    },
  }
}
