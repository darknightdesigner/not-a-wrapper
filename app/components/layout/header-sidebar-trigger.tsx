"use client"

import { useSidebar } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { SidebarLeftIcon } from "@hugeicons-pro/core-stroke-rounded"

type HeaderSidebarTriggerProps = React.HTMLAttributes<HTMLButtonElement>

export function HeaderSidebarTrigger({
  className,
  ...props
}: HeaderSidebarTriggerProps) {
  const { toggleSidebar, open } = useSidebar()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              "pointer-events-auto",
              "text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors",
              "inline-flex size-9 items-center justify-center focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              className
            )}
            {...props}
          />
        }
      >
        <HugeiconsIcon icon={SidebarLeftIcon} size={20} />
        <span className="sr-only">Toggle sidebar</span>
      </TooltipTrigger>
      <TooltipContent>
        {open
          ? "Close sidebar ⇧⌘S"
          : "Open sidebar ⇧⌘S"}
      </TooltipContent>
    </Tooltip>
  )
}
