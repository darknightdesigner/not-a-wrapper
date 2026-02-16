"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({
  delay,
  ...props
}: TooltipPrimitive.Root.Props & {
  /** Per-tooltip delay override (wraps in its own TooltipProvider). */
  delay?: number
}) {
  const root = <TooltipPrimitive.Root data-slot="tooltip" {...props} />

  // Only wrap in a per-instance TooltipProvider when an explicit delay override
  // is needed. Otherwise inherit the app-level provider (layout.tsx) to avoid
  // redundant context providers and preserve the global delay setting.
  if (delay !== undefined) {
    return <TooltipProvider delay={delay}>{root}</TooltipProvider>
  }

  return root
}

function TooltipTrigger({
  ...props
}: TooltipPrimitive.Trigger.Props) {
  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
  )
}

function TooltipContent({
  className,
  sideOffset = 8,
  side = "top",
  align = "center",
  children,
  hideArrow = true,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "side" | "sideOffset"
  > & {
    hideArrow?: boolean
  }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "bg-foreground text-background z-50 w-fit rounded-md px-2 py-1 text-xs font-medium text-balance",
            className
          )}
          {...props}
        >
          {children}
          {!hideArrow && (
            <TooltipPrimitive.Arrow className="z-50 [&>svg]:fill-foreground">
              <svg width="12" height="6" viewBox="0 0 12 6">
                <path d="M0 6L6 0L12 6H0Z" />
              </svg>
            </TooltipPrimitive.Arrow>
          )}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
