"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { adaptAsChild } from "@/lib/as-child-adapter"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  delayDuration,
  skipDelayDuration: _skipDelayDuration,
  ...props
}: TooltipPrimitive.Provider.Props & {
  /** @deprecated Use `delay` instead. Radix compat alias. */
  delayDuration?: number
  /** @deprecated No Base UI equivalent. Accepted for backward compat. */
  skipDelayDuration?: number
}) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delayDuration ?? delay}
      {...props}
    />
  )
}

function Tooltip({
  delayDuration,
  ...props
}: TooltipPrimitive.Root.Props & {
  /** @deprecated Use TooltipProvider `delay` instead. Radix compat alias. */
  delayDuration?: number
}) {
  return (
    <TooltipProvider {...(delayDuration !== undefined ? { delay: delayDuration } : {})}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  asChild,
  children,
  ...props
}: TooltipPrimitive.Trigger.Props & { asChild?: boolean }) {
  const adapted = adaptAsChild(asChild, children)
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      render={adapted.render}
      {...props}
    >
      {adapted.children}
    </TooltipPrimitive.Trigger>
  )
}

function TooltipContent({
  className,
  sideOffset = 0,
  side = "top",
  align = "center",
  children,
  hideArrow = false,
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
            "bg-foreground text-background z-50 w-fit origin-(--transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
            className
          )}
          {...props}
        >
          {children}
          {!hideArrow && (
            <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
          )}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
