/**
 * @component Reasoning
 * @source prompt-kit
 * @upstream https://prompt-kit.com/docs/reasoning
 * @customized true
 * @customizations
 *   - Uses React 19 render-sync pattern instead of useEffect for streaming state
 *   - Upstream: `useEffect(() => { if (isStreaming...) }, [isStreaming])`
 *   - This project: Syncs state during render to avoid extra render cycle
 *   - This follows React 19 best practices for derived state patterns
 *   - This project also has a simpler version at `app/components/chat/reasoning.tsx`
 * @upgradeNotes
 *   - Do NOT revert to useEffect pattern for isStreaming state sync
 *   - Preserve the `if (isStreaming !== prevIsStreaming)` render-sync block
 *   - This pattern reduces render cycles and effect cleanup overhead
 */
"use client"

import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons-pro/core-stroke-rounded"
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Markdown } from "./markdown"

type ReasoningContextType = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

const ReasoningContext = createContext<ReasoningContextType | undefined>(
  undefined
)

function useReasoningContext() {
  const context = useContext(ReasoningContext)
  if (!context) {
    throw new Error(
      "useReasoningContext must be used within a Reasoning provider"
    )
  }
  return context
}

export type ReasoningProps = {
  children: React.ReactNode
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isStreaming?: boolean
}
function Reasoning({
  children,
  className,
  open,
  onOpenChange,
  isStreaming,
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [wasAutoOpened, setWasAutoOpened] = useState(false)
  const [prevIsStreaming, setPrevIsStreaming] = useState(isStreaming)

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen

  // React 19 pattern: sync during render instead of useEffect
  if (isStreaming !== prevIsStreaming) {
    setPrevIsStreaming(isStreaming)
    if (isStreaming && !wasAutoOpened) {
      if (!isControlled) setInternalOpen(true)
      setWasAutoOpened(true)
    }
    if (!isStreaming && wasAutoOpened) {
      if (!isControlled) setInternalOpen(false)
      setWasAutoOpened(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }

  return (
    <ReasoningContext.Provider
      value={{
        isOpen,
        onOpenChange: handleOpenChange,
      }}
    >
      <div className={className}>{children}</div>
    </ReasoningContext.Provider>
  )
}

export type ReasoningTriggerProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLButtonElement>

function ReasoningTrigger({
  children,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, onOpenChange } = useReasoningContext()

  return (
    <button
      className={cn("flex cursor-pointer items-center gap-2", className)}
      onClick={() => onOpenChange(!isOpen)}
      {...props}
    >
      <span className="text-primary">{children}</span>
      <div
        className={cn(
          "transform transition-transform",
          isOpen ? "rotate-180" : ""
        )}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={16} />
      </div>
    </button>
  )
}

export type ReasoningContentProps = {
  children: React.ReactNode
  className?: string
  markdown?: boolean
  contentClassName?: string
} & React.HTMLAttributes<HTMLDivElement>

function ReasoningContent({
  children,
  className,
  contentClassName,
  markdown = false,
  ...props
}: ReasoningContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const { isOpen } = useReasoningContext()
  const [contentHeight, setContentHeight] = useState(0)

  // Use useLayoutEffect to measure height before paint
  useLayoutEffect(() => {
    if (!innerRef.current) return

    const updateHeight = () => {
      if (innerRef.current) {
        setContentHeight(innerRef.current.scrollHeight)
      }
    }

    // Initial measurement
    updateHeight()

    // Observe for content changes
    const observer = new ResizeObserver(updateHeight)
    observer.observe(innerRef.current)

    return () => observer.disconnect()
  }, [children])

  const content = markdown ? (
    <Markdown>{children as string}</Markdown>
  ) : (
    children
  )

  return (
    <div
      ref={contentRef}
      className={cn(
        "overflow-hidden transition-[max-height] duration-150 ease-out",
        className
      )}
      style={{
        maxHeight: isOpen ? `${contentHeight}px` : "0px",
      }}
      {...props}
    >
      <div
        ref={innerRef}
        className={cn(
          "text-muted-foreground prose prose-sm dark:prose-invert",
          contentClassName
        )}
      >
        {content}
      </div>
    </div>
  )
}

export { Reasoning, ReasoningTrigger, ReasoningContent }
