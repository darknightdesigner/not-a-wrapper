"use client"

import { MultiModelSelector } from "@/components/common/multi-model-selector/base"
import { PromptSystem } from "@/app/components/suggestions/prompt-system"
import { ButtonFileUpload } from "@/app/components/chat-input/button-file-upload"
import { FileList } from "@/app/components/chat-input/file-list"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUp02Icon,
  StopCircleIcon,
  AttachmentIcon,
} from "@hugeicons-pro/core-stroke-rounded"
import React, { useCallback } from "react"

type MultiChatInputProps = {
  value: string
  onValueChange: (value: string) => void
  onSuggestion: (suggestion: string) => void
  hasSuggestions?: boolean
  onSend: () => void
  isSubmitting?: boolean
  files: File[]
  onFileUpload: (files: File[]) => void
  onFileRemove: (file: File) => void
  selectedModelIds: string[]
  onSelectedModelIdsChange: (modelIds: string[]) => void
  isUserAuthenticated: boolean
  fileUploadState: "supported" | "unsupported" | "no-selection"
  fileUploadModelId?: string
  stop: () => void
  status?: "submitted" | "streaming" | "ready" | "error"
  anyLoading?: boolean
}

export function MultiChatInput({
  value,
  onValueChange,
  onSuggestion,
  hasSuggestions,
  onSend,
  isSubmitting,
  selectedModelIds,
  onSelectedModelIdsChange,
  isUserAuthenticated,
  files,
  onFileUpload,
  onFileRemove,
  fileUploadState,
  fileUploadModelId,
  stop,
  status,
  anyLoading,
}: MultiChatInputProps) {
  const isOnlyWhitespace = (text: string) => !/[^\s]/.test(text)

  const renderFileUpload = () => {
    if (fileUploadState === "supported" && fileUploadModelId) {
      return (
        <ButtonFileUpload
          onFileUpload={onFileUpload}
          isUserAuthenticated={isUserAuthenticated}
          model={fileUploadModelId}
        />
      )
    }

    const message =
      fileUploadState === "no-selection"
        ? "Select at least one model to upload files."
        : "Some selected models don't support file uploads."

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
                aria-label="Add files"
              >
                <HugeiconsIcon icon={AttachmentIcon} size={16} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" hideArrow>Add files</TooltipContent>
        </Tooltip>
        <PopoverContent className="p-2">
          <div className="text-secondary-foreground text-sm">{message}</div>
        </PopoverContent>
      </Popover>
    )
  }

  const handleSend = useCallback(() => {
    if (isSubmitting || anyLoading) {
      return
    }

    if (status === "streaming") {
      stop()
      return
    }

    onSend()
  }, [isSubmitting, anyLoading, onSend, status, stop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSubmitting || anyLoading) {
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && status === "streaming") {
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (isOnlyWhitespace(value)) {
          return
        }

        e.preventDefault()
        onSend()
      }
    },
    [isSubmitting, anyLoading, onSend, status, value]
  )

  return (
    <div className="relative flex w-full flex-col gap-4">
      {hasSuggestions && (
        <PromptSystem
          onValueChange={onValueChange}
          onSuggestion={onSuggestion}
          value={value}
        />
      )}
      <div className="relative order-2 px-2 pb-3 sm:pb-4 md:order-1">
        <PromptInput
          className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
          maxHeight={200}
          value={value}
          onValueChange={onValueChange}
        >
          <FileList files={files} onFileRemove={onFileRemove} />
          <PromptInputTextarea
            placeholder="Ask all selected models..."
            onKeyDown={handleKeyDown}
            className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
          />
          <PromptInputActions className="mt-5 w-full justify-between px-3 pb-3">
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {renderFileUpload()}
              <MultiModelSelector
                selectedModelIds={selectedModelIds}
                setSelectedModelIds={onSelectedModelIdsChange}
              />
            </div>
            <PromptInputAction
              tooltip={status === "streaming" ? "Stop" : "Send"}
            >
              <Button
                size="sm"
                className="size-9 rounded-full transition-all duration-300 ease-out"
                disabled={
                  !value ||
                  isSubmitting ||
                  anyLoading ||
                  isOnlyWhitespace(value) ||
                  selectedModelIds.length === 0
                }
                type="button"
                onClick={handleSend}
                aria-label={status === "streaming" ? "Stop" : "Send message"}
              >
                {status === "streaming" || anyLoading ? (
                  <HugeiconsIcon icon={StopCircleIcon} size={16} />
                ) : (
                  <HugeiconsIcon icon={ArrowUp02Icon} size={20} strokeWidth={2.5} className="size-5" />
                )}
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  )
}
