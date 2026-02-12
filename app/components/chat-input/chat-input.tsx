"use client"

import { ModelSelector } from "@/components/common/model-selector/base"
import {
  FileUpload,
  FileUploadContent,
} from "@/components/ui/file-upload"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { Button } from "@/components/ui/button"
import { ACCEPTED_FILE_PICKER_TYPES } from "@/lib/file-handling"
import { getModelInfo } from "@/lib/models"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUp02Icon,
  FileUploadIcon,
  StopCircleIcon,
} from "@hugeicons-pro/core-stroke-rounded"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { PromptSystem } from "../suggestions/prompt-system"
import { ButtonPlusMenu } from "./button-plus-menu"
import { FileList } from "./file-list"

type ChatInputProps = {
  value: string
  onValueChange: (value: string) => void
  onSend: () => void
  isSubmitting?: boolean
  hasMessages?: boolean
  files: File[]
  onFileUpload: (files: File[]) => void
  onFileRemove: (file: File) => void
  onSuggestion: (suggestion: string) => void
  hasSuggestions?: boolean
  onSelectModel: (model: string) => void
  selectedModel: string
  isUserAuthenticated: boolean
  stop: () => void
  status?: "submitted" | "streaming" | "ready" | "error"
  setEnableSearch: (enabled: boolean) => void
  enableSearch: boolean
  quotedText?: { text: string; messageId: string } | null
}

export function ChatInput({
  value,
  onValueChange,
  onSend,
  isSubmitting,
  files,
  onFileUpload,
  onFileRemove,
  onSuggestion,
  hasSuggestions,
  onSelectModel,
  selectedModel,
  isUserAuthenticated,
  stop,
  status,
  setEnableSearch,
  enableSearch,
  quotedText,
}: ChatInputProps) {
  const selectModelConfig = getModelInfo(selectedModel)
  // Web search is disabled only when the model explicitly can't accept tool calls
  // (tools: false) or has opted out of search (webSearch: false).
  // All other models get search via Layer 1 (provider-native) or Layer 2 (Exa fallback).
  const isSearchDisabled =
    selectModelConfig?.tools === false || selectModelConfig?.webSearch === false
  const isFileUploadAvailable = Boolean(selectModelConfig?.vision)
  const isOnlyWhitespace = (text: string) => !/[^\s]/.test(text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    if (isSubmitting) {
      return
    }

    if (status === "streaming") {
      stop()
      return
    }

    onSend()
  }, [isSubmitting, onSend, status, stop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSubmitting) {
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
    [isSubmitting, onSend, status, value]
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const hasImageContent = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      )

      if (!isUserAuthenticated && hasImageContent) {
        e.preventDefault()
        return
      }

      if (isUserAuthenticated && hasImageContent) {
        const imageFiles: File[] = []

        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile()
            if (file) {
              const newFile = new File(
                [file],
                `pasted-image-${Date.now()}.${file.type.split("/")[1]}`,
                { type: file.type }
              )
              imageFiles.push(newFile)
            }
          }
        }

        if (imageFiles.length > 0) {
          onFileUpload(imageFiles)
        }
      }
      // Text pasting will work by default for everyone
    },
    [isUserAuthenticated, onFileUpload]
  )

  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (quotedText) {
      const current = valueRef.current
      const quoted = quotedText.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
      onValueChange(current ? `${current}\n\n${quoted}\n\n` : `${quoted}\n\n`)

      requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [quotedText, onValueChange])

  useEffect(() => {
    if (isSearchDisabled && enableSearch) {
      setEnableSearch?.(false)
    }
  }, [isSearchDisabled, enableSearch, setEnableSearch])

  return (
    <div className="relative flex w-full flex-col gap-4">
      {hasSuggestions && (
        <PromptSystem
          onValueChange={onValueChange}
          onSuggestion={onSuggestion}
          value={value}
        />
      )}
      <FileUpload
        onFilesAdded={onFileUpload}
        multiple
        accept={ACCEPTED_FILE_PICKER_TYPES}
        disabled={!isUserAuthenticated || !isFileUploadAvailable}
      >
        <div
          className="relative order-2 px-2 pb-3 sm:pb-4 md:order-1"
          onClick={() => textareaRef.current?.focus()}
        >
          <PromptInput
            className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
            maxHeight={200}
            value={value}
            onValueChange={onValueChange}
          >
            <FileList files={files} onFileRemove={onFileRemove} />
            <PromptInputTextarea
              ref={textareaRef}
              placeholder="Ask anything..."
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
            />
            <PromptInputActions className="mt-3 w-full justify-between p-2">
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <ButtonPlusMenu
                  onFileUpload={onFileUpload}
                  isUserAuthenticated={isUserAuthenticated}
                  isFileUploadAvailable={isFileUploadAvailable}
                  enableSearch={enableSearch}
                  onToggleSearch={setEnableSearch}
                  isSearchDisabled={isSearchDisabled}
                />
                <ModelSelector
                  selectedModelId={selectedModel}
                  setSelectedModelId={onSelectModel}
                  isUserAuthenticated={isUserAuthenticated}
                  className="rounded-full"
                />
              </div>
              <PromptInputAction
                tooltip={status === "streaming" ? "Stop" : "Send"}
              >
                <Button
                  size="sm"
                  className="size-9 rounded-full transition-all duration-300 ease-out"
                  disabled={!value || isSubmitting || isOnlyWhitespace(value)}
                  type="button"
                  onClick={handleSend}
                  aria-label={status === "streaming" ? "Stop" : "Send message"}
                >
                  {status === "streaming" ? (
                    <HugeiconsIcon icon={StopCircleIcon} size={16} />
                  ) : (
                    <HugeiconsIcon icon={ArrowUp02Icon} size={20} strokeWidth={2.5} className="size-5" />
                  )}
                </Button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
        </div>
        <FileUploadContent>
          <div className="border-input bg-background flex flex-col items-center rounded-lg border border-dashed p-8">
            <HugeiconsIcon icon={FileUploadIcon} size={32} className="text-muted-foreground" />
            <span className="mt-4 mb-1 text-lg font-medium">Drop files here</span>
            <span className="text-muted-foreground text-sm">
              Drop files here to add them to the conversation
            </span>
          </div>
        </FileUploadContent>
      </FileUpload>
    </div>
  )
}
