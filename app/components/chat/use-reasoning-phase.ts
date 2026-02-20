"use client"

import type { UIMessage } from "@ai-sdk/react"
import { useEffect, useMemo, useRef, useState } from "react"

export type ReasoningPhase = {
  phase: "idle" | "thinking" | "complete"
  reasoningText: string
  durationSeconds: number | undefined
  isReasoningStreaming: boolean
}

type UseReasoningPhaseParams = {
  parts: UIMessage["parts"] | undefined
  status: "streaming" | "ready" | "submitted" | "error"
  isLast: boolean
  /** Server-persisted reasoning duration in ms (from messageMetadata). */
  persistedDurationMs?: number
}

export function useReasoningPhase({
  parts,
  status,
  isLast,
  persistedDurationMs,
}: UseReasoningPhaseParams): ReasoningPhase {
  // Derive phase and text from parts
  const { phase, reasoningText } = useMemo(() => {
    // Consolidate all reasoning parts (GPT may emit multiple)
    const reasoningParts = parts?.filter((p) => p.type === "reasoning") ?? []

    if (reasoningParts.length === 0) {
      return { phase: "idle" as const, reasoningText: "" }
    }

    const text = reasoningParts.map((p) => p.text).join("\n\n")
    const hasVisibleTextContent =
      parts?.some((p) => p.type === "text" && p.text.trim().length > 0) ?? false

    // If response text has started but reasoning never produced visible content,
    // treat reasoning as absent so the thinking UI disappears.
    if (!text.trim() && hasVisibleTextContent) {
      return { phase: "idle" as const, reasoningText: "" }
    }

    // Check if any reasoning part is actively streaming
    const isAnyStreaming = reasoningParts.some(
      (p) => (p as { state?: string }).state === "streaming"
    )

    if (isAnyStreaming) {
      return { phase: "thinking" as const, reasoningText: text }
    }

    // Check if explicitly done
    const isAnyDone = reasoningParts.some(
      (p) => (p as { state?: string }).state === "done"
    )

    if (isAnyDone || status === "ready" || status === "error") {
      return { phase: "complete" as const, reasoningText: text }
    }

    // Fallback: state is undefined but reasoning text exists — treat as complete
    if (text) {
      return { phase: "complete" as const, reasoningText: text }
    }

    // Reasoning part exists but no text yet (model just started) — thinking
    return { phase: "thinking" as const, reasoningText: "" }
  }, [parts, status])

  // Client-side timer.
  // React 19 render-sync pattern: reset tickedSeconds when entering thinking.
  // The interval in useEffect ticks every second while shouldRunTimer is true.
  // When phase leaves "thinking", the interval stops and tickedSeconds
  // holds the frozen final value.
  const startTimestampRef = useRef<number | null>(null)
  const [tickedSeconds, setTickedSeconds] = useState(0)
  const [prevPhase, setPrevPhase] = useState(phase)

  const shouldRunTimer = isLast && phase === "thinking"

  // React 19 render-sync: reset timer state when entering thinking phase
  if (phase !== prevPhase) {
    setPrevPhase(phase)
    if (phase === "thinking" && isLast) {
      setTickedSeconds(0)
    }
  }

  // Tick every second while thinking
  useEffect(() => {
    if (!shouldRunTimer) return

    const start = Date.now()
    startTimestampRef.current = start

    const interval = setInterval(() => {
      setTickedSeconds(Math.round((Date.now() - start) / 1000))
    }, 1000)

    return () => {
      clearInterval(interval)
      // Freeze final value on cleanup
      if (startTimestampRef.current !== null) {
        setTickedSeconds(
          Math.round((Date.now() - startTimestampRef.current) / 1000)
        )
        startTimestampRef.current = null
      }
    }
  }, [shouldRunTimer])

  // Compute final durationSeconds.
  // Priority: live timer (last message) > server-persisted duration (historical)
  let durationSeconds: number | undefined

  if (isLast && (phase === "thinking" || phase === "complete")) {
    durationSeconds = tickedSeconds > 0 ? tickedSeconds : undefined
  } else if (persistedDurationMs !== undefined) {
    durationSeconds = Math.round(persistedDurationMs / 1000)
  } else {
    durationSeconds = undefined
  }

  return {
    phase,
    reasoningText,
    durationSeconds,
    isReasoningStreaming: phase === "thinking",
  }
}
