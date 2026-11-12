import { Icon, type IconProps } from "@/components/ui/icon"
import { RiCheckLine } from "@remixicon/react"

type MenuLeadingIconProps = {
  icon: IconProps["icon"]
}

/**
 * Stable leading slot for floating-menu rows. The slot intentionally preserves
 * the existing 20px slot / 18px glyph geometry while menu rows own the gap.
 */
function MenuLeadingIcon({ icon }: MenuLeadingIconProps) {
  return <Icon icon={icon} slotSize="var(--floating-menu-leading-slot-size)" />
}

/** Selected-state check for menu rows; shares the leading icon geometry. */
function MenuCheckIcon() {
  return (
    <Icon
      icon={RiCheckLine}
      slotSize="var(--floating-menu-leading-slot-size)"
    />
  )
}

export { MenuCheckIcon, MenuLeadingIcon }
