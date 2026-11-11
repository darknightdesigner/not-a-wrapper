import { ComposerControl } from "@/components/ui/composer-control"
import type { ComponentProps } from "react"

type ComposerIconButtonProps = Omit<
  ComponentProps<typeof ComposerControl>,
  "size"
> & {
  /** `filled` rests on a tint chip (the + button); `plain` stays ghost. */
  tone?: "plain" | "filled"
}

/** Shared 36px icon control used inside the unified composer surface. */
function ComposerIconButton({
  className,
  tone = "plain",
  ...props
}: ComposerIconButtonProps) {
  return (
    <ComposerControl
      className={className}
      size="icon"
      data-composer-control-tone={tone}
      {...props}
    />
  )
}

export { ComposerIconButton, type ComposerIconButtonProps }
