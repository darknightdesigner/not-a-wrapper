"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { adaptAsChild } from "@/lib/as-child-adapter"

function Collapsible({
  ...props
}: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  asChild,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props & { asChild?: boolean }) {
  const adapted = adaptAsChild(asChild, children)
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      render={adapted.render}
      {...props}
    >
      {adapted.children}
    </CollapsiblePrimitive.Trigger>
  )
}

function CollapsibleContent({
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
