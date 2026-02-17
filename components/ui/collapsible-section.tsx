"use client"

import * as React from "react"
import { Collapsible } from "@base-ui/react/collapsible"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { cn } from "@/lib/utils"

type CollapsibleSectionProps = {
  /** Section title */
  title: string
  /** Optional icon before title */
  icon?: React.ReactNode
  /** Section content */
  children: React.ReactNode
  /** Initial expanded state */
  defaultOpen?: boolean
  /** localStorage key for persistence */
  storageKey?: string
  /** Additional className for the container */
  className?: string
  /** Semantic heading level for section title */
  headingLevel?: "h2" | "h3" | "h4"
}

export function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  storageKey,
  className,
  headingLevel = "h3",
}: CollapsibleSectionProps) {
  // Initialize with defaultOpen to match SSR
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  // Sync from localStorage on mount (client-only) to avoid hydration mismatch
  React.useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        setIsOpen(stored === "true")
      }
    }
  }, [storageKey])

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open)
      if (storageKey) {
        localStorage.setItem(storageKey, String(open))
      }
    },
    [storageKey]
  )

  const HeadingTag = headingLevel

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn("group/collapsible-section", className)}
    >
      <HeadingTag className="m-0">
        <Collapsible.Trigger
          className={cn(
            "group/collapsible-trigger flex h-(--sidebar-section-label-height) w-full items-center gap-1 rounded-md px-(--sidebar-section-label-padding-x) py-1.5 text-left",
            "text-xs font-medium text-muted-foreground/85",
            "hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
          )}
        >
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={10}
            className={cn(
              "ml-auto shrink-0 opacity-45 motion-safe:transition-all duration-150",
              "group-hover/collapsible-trigger:opacity-85 group-focus-visible/collapsible-trigger:opacity-85",
              isOpen ? "rotate-90" : "rotate-0"
            )}
          />
        </Collapsible.Trigger>
      </HeadingTag>

      <Collapsible.Panel
        className={cn(
          "overflow-hidden",
          "data-[open]:animate-collapsible-down",
          "data-[closed]:animate-collapsible-up"
        )}
      >
        <div className="pt-0.5">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
