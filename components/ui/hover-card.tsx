"use client"

import * as React from "react"
import { PreviewCard as HoverCardPrimitive } from "@base-ui/react/preview-card"
import { adaptAsChild } from "@/lib/as-child-adapter"

import { cn } from "@/lib/utils"

function HoverCard({
  openDelay: _openDelay,
  closeDelay: _closeDelay,
  ...props
}: HoverCardPrimitive.Root.Props & {
  /** @deprecated No Base UI equivalent on PreviewCard. Accepted for backward compat. */
  openDelay?: number
  /** @deprecated No Base UI equivalent on PreviewCard. Accepted for backward compat. */
  closeDelay?: number
}) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  asChild,
  children,
  ...props
}: HoverCardPrimitive.Trigger.Props & { asChild?: boolean }) {
  const adapted = adaptAsChild(asChild, children)
  return (
    <HoverCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      render={adapted.render}
      {...props}
    >
      {adapted.children}
    </HoverCardPrimitive.Trigger>
  )
}

function HoverCardContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  ...props
}: HoverCardPrimitive.Popup.Props &
  Pick<
    HoverCardPrimitive.Positioner.Props,
    "align" | "side" | "sideOffset"
  >) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <HoverCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "bg-popover text-popover-foreground data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden",
            className
          )}
          {...props}
        />
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
