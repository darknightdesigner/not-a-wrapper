import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { GlobeIcon } from "@hugeicons-pro/core-stroke-rounded"
import React from "react"
import { PopoverContentAuth } from "./popover-content-auth"

type ButtonSearchProps = {
  isSelected?: boolean
  onToggle?: (isSelected: boolean) => void
  isAuthenticated: boolean
}

export function ButtonSearch({
  isSelected = false,
  onToggle,
  isAuthenticated,
}: ButtonSearchProps) {
  const handleClick = () => {
    const newState = !isSelected
    onToggle?.(newState)
  }

  if (!isAuthenticated) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="rounded-full"
          >
            <HugeiconsIcon icon={GlobeIcon} size={20} />
            Search
          </Button>
        </PopoverTrigger>
        <PopoverContentAuth />
      </Popover>
    )
  }

  return (
    <Button
      variant="ghost"
      className={cn(
        "rounded-full transition-all duration-150 has-[>svg]:px-1.75 md:has-[>svg]:px-3",
        isSelected &&
          "bg-[#E5F3FE] text-[#0091FF] hover:bg-[#E5F3FE] hover:text-[#0091FF]"
      )}
      onClick={handleClick}
    >
      <HugeiconsIcon icon={GlobeIcon} size={20} />
      <span className="hidden md:block">Search</span>
    </Button>
  )
}
