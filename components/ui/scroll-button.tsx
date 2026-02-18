"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type VariantProps } from "class-variance-authority"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown02Icon } from "@hugeicons-pro/core-stroke-rounded"
import { useStickToBottomContext } from "use-stick-to-bottom"

export type ScrollButtonProps = {
  className?: string
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function ScrollButton({
  className,
  variant = "outline",
  size = "sm",
  ...props
}: ScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        "h-10 w-10 rounded-full bg-popover/90 hover:bg-accent/90 dark:bg-popover/75 dark:hover:bg-accent/90 backdrop-blur-md transition-opacity duration-150 ease-out",
        !isAtBottom
          ? "opacity-100"
          : "pointer-events-none opacity-0",
        className
      )}
      onClick={() => scrollToBottom()}
      {...props}
    >
      <HugeiconsIcon icon={ArrowDown02Icon} size={20} className="size-5" />
    </Button>
  )
}

export { ScrollButton }
