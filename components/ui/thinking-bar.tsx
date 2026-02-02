/**
 * @component ThinkingBar
 * @source prompt-kit
 * @upstream https://prompt-kit.com/docs/thinking-bar
 * @customized true
 * @customizations
 *   - Adds `onClick` prop for navigation/expansion functionality
 *   - Shows ChevronRight icon on hover when onClick is provided
 *   - Upstream only has `onStop` prop; Not A Wrapper adds clickable thinking text
 *   - Uses local TextShimmer component (also customized)
 * @upgradeNotes
 *   - Preserve onClick prop and ChevronRight icon rendering
 *   - Maintain conditional button vs span rendering based on onClick
 *   - Verify TextShimmer import path remains correct
 */
"use client"

import { TextShimmer } from "@/components/ui/text-shimmer"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons-pro/core-stroke-rounded"

type ThinkingBarProps = {
  className?: string
  text?: string
  onStop?: () => void
  stopLabel?: string
  onClick?: () => void
}

export function ThinkingBar({
  className,
  text = "Thinking",
  onStop,
  stopLabel = "Answer now",
  onClick,
}: ThinkingBarProps) {
  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1 text-sm transition-opacity hover:opacity-80"
        >
          <TextShimmer className="font-medium">{text}</TextShimmer>
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-muted-foreground" />
        </button>
      ) : (
        <TextShimmer className="cursor-default font-medium">{text}</TextShimmer>
      )}
      {onStop ? (
        <button
          onClick={onStop}
          type="button"
          className="text-muted-foreground hover:text-foreground border-muted-foreground/50 hover:border-foreground border-b border-dotted text-sm transition-colors"
        >
          {stopLabel}
        </button>
      ) : null}
    </div>
  )
}
