"use client"

import { cn } from "@/lib/utils"
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { forwardRef, isValidElement, type ReactNode, type Ref } from "react"

type SidebarMenuItemProps = {
  /** Icon component from Hugeicons, or a custom React node */
  icon: IconSvgElement | ReactNode
  /** Label text */
  label: string
  /** Navigation href - renders as Link if provided */
  href?: string
  /** Click handler - used when no href (e.g., opens modal) */
  onClick?: () => void
  /** Trailing content (keyboard shortcuts, badges, etc.) */
  trailing?: ReactNode
  /** Test ID for e2e testing */
  testId?: string
  /** Additional className */
  className?: string
  /** Whether item is currently active */
  isActive?: boolean
}

const baseClassName = cn(
  "group/menu-item relative inline-flex w-full items-center rounded-md bg-transparent text-sm",
  // Explicit height for consistency with collapsed state (h-9 = 36px)
  "h-9 pointer-coarse:h-auto",
  // Spacing using CSS variables
  "gap-(--sidebar-item-gap) px-2 py-2 pointer-coarse:py-3",
  // Colors (instant hover — no transition)
  "text-primary hover:bg-accent/80 hover:text-foreground",
  // Focus states
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
)

/**
 * Unified sidebar menu item component.
 * 
 * Features:
 * - Icon wrapper pattern (ChatGPT style) for consistent alignment
 * - motion-safe: transitions for reduced motion support
 * - CSS variables for spacing
 */
export const SidebarMenuItem = forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  SidebarMenuItemProps
>(function SidebarMenuItem(
  { icon, label, href, onClick, trailing, testId, className, isActive },
  ref
) {
  // Check if icon is a React element (custom icon) vs Hugeicons IconSvgElement
  const isCustomIcon = isValidElement(icon)

  const content = (
    <>
      {/* Icon wrapper (ChatGPT pattern) for consistent alignment */}
      <div className="flex items-center justify-center shrink-0">
        {isCustomIcon ? (
          icon
        ) : (
          <HugeiconsIcon
            icon={icon as IconSvgElement}
            size={20}
            className="group-disabled/menu-item:opacity-50"
          />
        )}
      </div>
      <div className="flex min-w-0 grow items-center gap-(--sidebar-item-gap)">
        <span className="truncate">{label}</span>
      </div>
      {trailing && (
        <div className="text-muted-foreground ml-auto opacity-0 group-hover/menu-item:opacity-100">
          {trailing}
        </div>
      )}
    </>
  )

  const combinedClassName = cn(
    baseClassName,
    isActive && "bg-accent",
    className
  )

  const itemElement = href ? (
    <Link
      ref={ref as Ref<HTMLAnchorElement>}
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
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={combinedClassName}
      data-testid={testId}
      data-sidebar-item="true"
    >
      {content}
    </button>
  )

  return itemElement
})
