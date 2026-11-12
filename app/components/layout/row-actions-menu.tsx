"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon, type IconProps } from "@/components/ui/icon"
import { useIntentPrefetch } from "@/components/ui/intent-prefetch"
import { MenuLeadingIcon } from "@/components/ui/menu-leading-icon"
import { useBreakpoint } from "@/hooks/use-breakpoint"
import { Spinner } from "@/components/ui/spinner"
import { RiMoreFill } from "@remixicon/react"
import { Fragment, type ReactElement } from "react"
import {
  trailingIconButtonClassName,
  TrailingIconChip,
} from "./sidebar/trailing-icon-button"

export type RowActionItem = {
  key: string
  /** Drawn in the shared menu icon slot; the spinner replaces it while `loading`. */
  icon: IconProps["icon"]
  label: string
  ariaLabel?: string
  onSelect: () => void
  variant?: "default" | "destructive"
  loading?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  /** Warms a lazy follow-up surface from focus, hover, touch, or visibility. */
  prefetch?: () => void | Promise<unknown>
}

type RowActionsMenuProps = {
  items: RowActionItem[]
  /** Custom trigger; falls back to the shared ⋯ chip. */
  trigger?: ReactElement
  triggerAriaLabel?: string
  contentAlign?: "start" | "center" | "end"
  contentSide?: "top" | "right" | "bottom" | "left"
  onOpenChange?: (open: boolean) => void
}

/**
 * The single row-actions dropdown every chat and project actions menu runs
 * through: the shared ⋯ trigger chip, the mobile-safe dropdown shell, and
 * config-driven items. Callers pass their item set and own their own
 * confirmation dialogs (the "Delete" item just fires `onSelect`).
 */
export function RowActionsMenu({
  items,
  trigger,
  triggerAriaLabel,
  contentAlign = "start",
  contentSide = "bottom",
  onOpenChange,
}: RowActionsMenuProps) {
  const isMobile = useBreakpoint(768)

  const defaultTrigger = (
    <button
      type="button"
      className={trailingIconButtonClassName}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      aria-label={triggerAriaLabel ?? "Open actions"}
    />
  )

  return (
    <DropdownMenu
      // shadcn/ui pointer-events-none issue on mobile
      modal={isMobile ? true : false}
      onOpenChange={onOpenChange}
    >
      <DropdownMenuTrigger render={trigger ?? defaultTrigger}>
        {/* No color class: the glyph inherits the trigger's currentColor so it
            tracks the tertiary→foreground hover shift. Only rendered for the
            default trigger; a custom trigger brings its own content. */}
        {!trigger && (
          <TrailingIconChip>
            <Icon icon={RiMoreFill} slotSize={20} />
          </TrailingIconChip>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={contentSide}
        align={contentAlign}
        className="w-max"
        animated={false}
      >
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.separatorBefore && <DropdownMenuSeparator />}
            <RowActionMenuItem item={item} />
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RowActionMenuItem({ item }: { item: RowActionItem }) {
  const intentRef = useIntentPrefetch<HTMLDivElement>(item.prefetch)

  return (
    <DropdownMenuItem
      ref={intentRef}
      variant={item.variant}
      disabled={item.disabled}
      aria-label={item.ariaLabel}
      onClick={(event) => {
        event.stopPropagation()
        item.onSelect()
      }}
    >
      {item.loading ? (
        <Spinner slotSize="var(--floating-menu-leading-slot-size)" />
      ) : (
        <MenuLeadingIcon icon={item.icon} />
      )}
      {item.label}
    </DropdownMenuItem>
  )
}
