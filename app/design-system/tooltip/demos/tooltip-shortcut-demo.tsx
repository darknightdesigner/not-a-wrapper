"use client"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function TooltipShortcutDemo() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>
        Search
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <TooltipShortcut label="Search chats">
          <Kbd label="Command">⌘</Kbd>
          <Kbd>K</Kbd>
        </TooltipShortcut>
      </TooltipContent>
    </Tooltip>
  )
}
