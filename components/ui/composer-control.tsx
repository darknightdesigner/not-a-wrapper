import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ComposerControlProps = Omit<ButtonProps, "variant">

/**
 * Shared type and height for labeled composer controls (model trigger,
 * effort pill), so joined halves keep one hover surface. Height matches the
 * 36px icon buttons; callers own padding and corners.
 */
const composerTextControlClassName =
  "h-9 py-0 text-sm leading-5 font-normal"

/** Glyph size for a labeled composer control's leading icon. */
const COMPOSER_TEXT_CONTROL_ICON_SIZE = 16

/**
 * The shared secondary action inside the Composer.
 *
 * This module owns the complete interaction contract: token colors,
 * input-modality states, open-state styling, tap target, and the
 * Button primitive's scale animation. Callers own only their local geometry.
 */
function ComposerControl({ className, ...props }: ComposerControlProps) {
  return (
    <Button
      data-composer-control=""
      className={cn("composer-btn relative z-0", className)}
      variant="composer"
      {...props}
    />
  )
}

export {
  COMPOSER_TEXT_CONTROL_ICON_SIZE,
  ComposerControl,
  composerTextControlClassName,
  type ComposerControlProps,
}
