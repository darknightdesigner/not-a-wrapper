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
  isSearchDisabled: boolean
}

export function ButtonPlusMenu({
  onFileUpload,
  isUserAuthenticated,
  isFileUploadAvailable,
  enableSearch,
  onToggleSearch,
  isSearchDisabled,
}: ButtonPlusMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Unauthenticated: show auth popover instead of dropdown
  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-border dark:bg-secondary size-9 rounded-full border bg-transparent"
                    type="button"
                    aria-label="More options"
                  />
                }
              />
            }
          >
            <HugeiconsIcon icon={Add01Icon} size={16} />
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
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-border dark:bg-secondary size-9 rounded-full border bg-transparent"
                    type="button"
                    aria-label="More options"
                  />
                }
              />
            }
          >
            <HugeiconsIcon icon={Add01Icon} size={16} />
          </TooltipTrigger>
          <TooltipContent side="bottom" hideArrow>
            More options
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="start">
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuItem
                  aria-disabled={!isFileUploadAvailable || undefined}
                  className={!isFileUploadAvailable ? "cursor-not-allowed opacity-50" : ""}
                  onClick={() => {
                    if (!isFileUploadAvailable) return
                    fileInputRef.current?.click()
                  }}
                />
              }
            >
              <HugeiconsIcon icon={AttachmentIcon} size={16} />
              Add files or photos
            </TooltipTrigger>
            {!isFileUploadAvailable && (
              <TooltipContent side="right" sideOffset={4}>
                This model doesn&apos;t support file uploads
              </TooltipContent>
            )}
          </Tooltip>
          {/* Web search — always visible, stays open on click (toggle behavior). */}
          {/* Disabled with tooltip when model can't use tools (e.g., Perplexity). */}
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuItem
                  closeOnClick={false}
                  className={isSearchDisabled ? "cursor-not-allowed opacity-50" : ""}
                  onClick={() => {
                    if (isSearchDisabled) return
                    onToggleSearch(!enableSearch)
                  }}
                />
              }
            >
              <HugeiconsIcon icon={Globe02Icon} size={16} />
              Web search
              {!isSearchDisabled && enableSearch && (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={14}
                  className="ml-auto"
                />
              )}
            </TooltipTrigger>
            {isSearchDisabled && (
              <TooltipContent side="right" sideOffset={4}>
                This model doesn&apos;t support web search
              </TooltipContent>
            )}
          </Tooltip>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
