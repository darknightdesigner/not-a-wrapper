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
}

export function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  storageKey,
  className,
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

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn("group/collapsible-section", className)}
    >
      <Collapsible.Trigger
        className={cn(
          "flex w-full items-center gap-1 px-2 py-1.5",
          "text-sm font-medium text-muted-foreground",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
        )}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          className={cn(
            "shrink-0 motion-safe:transition-all duration-150",
            isOpen
              ? "rotate-90 opacity-0 group-hover/collapsible-section:opacity-100"
              : "opacity-100"
          )}
        />
      </Collapsible.Trigger>

      <Collapsible.Panel
        className={cn(
          "overflow-hidden",
          "data-[open]:animate-collapsible-down",
          "data-[closed]:animate-collapsible-up"
        )}
      >
        <div className="pt-1">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
