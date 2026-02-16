"use client"

import { useKeyShortcut } from "@/app/hooks/use-key-shortcut"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import { PencilEdit02Icon } from "@hugeicons-pro/core-stroke-rounded"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

export function ButtonNewChat() {
  const pathname = usePathname()
  const router = useRouter()

  useKeyShortcut(
    (e) => (e.key === "u" || e.key === "U") && e.metaKey && e.shiftKey,
    () => router.push("/")
  )

  if (pathname === "/") return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground hover:bg-muted bg-background rounded-full p-1.5 transition-colors"
            prefetch
            aria-label="New chat"
          />
        }
      >
        <HugeiconsIcon icon={PencilEdit02Icon} size={24} />
      </TooltipTrigger>
      <TooltipContent>New chat ⌘⇧U</TooltipContent>
    </Tooltip>
  )
}
