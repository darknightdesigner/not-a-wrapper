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
import { StopBulkRoundedIcon } from "@/lib/icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUp02Icon,
  AttachmentIcon,
  Globe02Icon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { resolveComposerPrimaryActionState } from "@/app/components/chat-input/primary-action-state"
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
  enableSearch: boolean
  setEnableSearch: (enabled: boolean) => void
  searchSupportState: "supported" | "unsupported" | "no-selection"
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
  enableSearch,
  setEnableSearch,
  searchSupportState,
}: MultiChatInputProps) {
  const isOnlyWhitespace = (text: string) => !/[^\s]/.test(text)
  const isStreaming = status === "streaming" || Boolean(anyLoading)

  const primaryAction = resolveComposerPrimaryActionState({
    isStreaming,
    isAbortable: Boolean(anyLoading),
    canSend:
      !isSubmitting &&
      !Boolean(anyLoading) &&
      !isOnlyWhitespace(value) &&
      selectedModelIds.length > 0,
  })

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
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-border dark:bg-secondary size-9 rounded-full border bg-transparent"
                    type="button"
                    aria-label="Add files"
                  />
                }
              />
            }
          >
            <HugeiconsIcon icon={AttachmentIcon} size={16} />
          </TooltipTrigger>
          <TooltipContent side="bottom" hideArrow>Add files</TooltipContent>
        </Tooltip>
        <PopoverContent className="p-2">
          <div className="text-secondary-foreground text-sm">{message}</div>
        </PopoverContent>
      </Popover>
    )
  }

  const renderWebSearchToggle = () => {
    const isSearchDisabled = searchSupportState !== "supported"
    const message =
      searchSupportState === "no-selection"
        ? "Select at least one model to use web search."
        : "None of the selected models support web search."

    if (!isSearchDisabled) {
      return (
        <Button
          size="sm"
          variant="secondary"
          className="border-border dark:bg-secondary size-9 rounded-full border bg-transparent"
          type="button"
          aria-label="Toggle web search"
          onClick={() => setEnableSearch(!enableSearch)}
        >
          <HugeiconsIcon icon={enableSearch ? Tick02Icon : Globe02Icon} size={16} />
        </Button>
      )
    }

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
                    aria-label="Web search unavailable"
                  />
                }
              />
            }
          >
            <HugeiconsIcon icon={Globe02Icon} size={16} />
          </TooltipTrigger>
          <TooltipContent side="bottom" hideArrow>Web search</TooltipContent>
        </Tooltip>
        <PopoverContent className="p-2">
          <div className="text-secondary-foreground text-sm">{message}</div>
        </PopoverContent>
      </Popover>
    )
  }

  const handlePrimaryActionClick = useCallback(() => {
    if (primaryAction.disabled) {
      return
    }

    if (primaryAction.intent === "stop") {
      stop()
      return
    }

    onSend()
  }, [onSend, primaryAction.disabled, primaryAction.intent, stop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) {
        return
      }

      if (primaryAction.mode === "stop") {
        return
      }

      if (!primaryAction.disabled) {
        e.preventDefault()
        onSend()
      }
    },
    [onSend, primaryAction.disabled, primaryAction.mode]
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
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {renderFileUpload()}
              {renderWebSearchToggle()}
              <MultiModelSelector
                selectedModelIds={selectedModelIds}
                setSelectedModelIds={onSelectedModelIdsChange}
              />
            </div>
            <PromptInputAction
              tooltip={primaryAction.tooltip}
            >
              <Button
                size="sm"
                className="size-9 rounded-full transition-all duration-300 ease-out"
                disabled={primaryAction.disabled}
                type="button"
                onClick={handlePrimaryActionClick}
                aria-label={primaryAction.ariaLabel}
              >
                {primaryAction.mode === "stop" ? (
                  <HugeiconsIcon icon={StopBulkRoundedIcon} size={16} />
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
