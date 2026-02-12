"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ACCEPTED_FILE_PICKER_TYPES } from "@/lib/file-handling"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AttachmentIcon,
  Globe02Icon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { useRef } from "react"
import { PopoverContentAuth } from "./popover-content-auth"

type ButtonPlusMenuProps = {
  onFileUpload: (files: File[]) => void
  isUserAuthenticated: boolean
  isFileUploadAvailable: boolean
  enableSearch: boolean
  onToggleSearch: (enabled: boolean) => void
  hasSearchSupport: boolean
}

export function ButtonPlusMenu({
  onFileUpload,
  isUserAuthenticated,
  isFileUploadAvailable,
  enableSearch,
  onToggleSearch,
  hasSearchSupport,
}: ButtonPlusMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Unauthenticated: show auth popover instead of dropdown
  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="border-border dark:bg-secondary size-9 rounded-full border bg-transparent"
                type="button"
                aria-label="More options"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" hideArrow>
            More options
          </TooltipContent>
        </Tooltip>
        <PopoverContentAuth />
      </Popover>
    )
  }

  return (
    <>
      {/* Hidden file input for programmatic file selection */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_PICKER_TYPES}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) {
            onFileUpload(Array.from(e.target.files))
            e.target.value = "" // allow re-selecting the same file
          }
        }}
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="border-border dark:bg-secondary size-9 rounded-full border bg-transparent"
                type="button"
                aria-label="More options"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" hideArrow>
            More options
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuItem
            disabled={!isFileUploadAvailable}
            onClick={() => fileInputRef.current?.click()}
          >
            <HugeiconsIcon icon={AttachmentIcon} size={16} />
            Add files or photos
          </DropdownMenuItem>
          {hasSearchSupport && (
            <DropdownMenuItem
              onClick={() => onToggleSearch(!enableSearch)}
            >
              <HugeiconsIcon icon={Globe02Icon} size={16} />
              Web search
              {enableSearch && (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={14}
                  className="ml-auto"
                />
              )}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
