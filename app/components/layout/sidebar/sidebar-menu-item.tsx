"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { forwardRef } from "react"

type SidebarMenuItemProps = {
  /** Icon component from Hugeicons */
  icon: IconSvgElement
  /** Label text */
  label: string
  /** Navigation href - renders as Link if provided */
  href?: string
  /** Click handler - used when no href (e.g., opens modal) */
  onClick?: () => void
  /** Trailing content (keyboard shortcuts, badges, etc.) */
  trailing?: React.ReactNode
  /** Test ID for e2e testing */
  testId?: string
  /** Additional className */
  className?: string
  /** Whether item is currently active */
  isActive?: boolean
}

const baseClassName =
  "group/menu-item hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center gap-2 rounded-md bg-transparent px-2 py-2 pointer-coarse:py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// Icon-only styles when sidebar is collapsed
const collapsedClassName =
  "group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"

/**
 * Unified sidebar menu item component with icon mode support.
 *
 * - Uses <Link> for navigation items (SEO, prefetch, right-click menu)
 * - Uses <button> for interactive items (modals, actions)
 * - Shows tooltip with label when sidebar is collapsed
 * - Consistent icon sizing (20x20)
 */
export const SidebarMenuItem = forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  SidebarMenuItemProps
>(function SidebarMenuItem(
  { icon, label, href, onClick, trailing, testId, className, isActive },
  ref
) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const content = (
    <>
      <HugeiconsIcon
        icon={icon}
        size={20}
        className="shrink-0 group-disabled/menu-item:opacity-50"
      />
      {/* Hide label when collapsed */}
      <div className="flex min-w-0 grow items-center gap-1.5 group-data-[collapsible=icon]:hidden">
        <span className="truncate">{label}</span>
      </div>
      {/* Hide trailing when collapsed */}
      {trailing && (
        <div className="text-muted-foreground ml-auto opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
          {trailing}
        </div>
      )}
    </>
  )

  const combinedClassName = cn(
    baseClassName,
    collapsedClassName,
    isActive && "bg-accent",
    className
  )

  const itemElement = href ? (
    <Link
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={href}
      className={combinedClassName}
      data-testid={testId}
      data-sidebar-item="true"
      prefetch
    >
      {content}
    </Link>
  ) : (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={combinedClassName}
      data-testid={testId}
      data-sidebar-item="true"
    >
      {content}
    </button>
  )

  // Wrap in tooltip when collapsed
  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{itemElement}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return itemElement
})
