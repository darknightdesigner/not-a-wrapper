"use client"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipMultiline,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function TooltipMultilineDemo() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>
        Retry
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <TooltipMultiline>
          <span>Try again...</span>
          <span className="text-[var(--text-tertiary)]">Using GPT-5.5</span>
        </TooltipMultiline>
      </TooltipContent>
    </Tooltip>
  )
}
