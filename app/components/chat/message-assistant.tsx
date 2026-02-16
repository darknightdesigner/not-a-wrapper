import { Loader } from "@/components/ui/loader"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ui/message"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { cn } from "@/lib/utils"
import type { UIMessage as MessageAISDK } from "@ai-sdk/react"
import type { ToolUIPart } from "ai"
import { isStaticToolUIPart, getStaticToolName } from "ai"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  RefreshIcon,
  Tick02Icon,
  Copy01Icon,
  Alert02Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { useCallback, useRef } from "react"
import { getSources } from "./get-sources"
import { QuoteButton } from "./quote-button"
import { Reasoning } from "./reasoning"
import { SearchImages } from "./search-images"
import { SourcesList } from "./sources-list"
import { ToolInvocation } from "./tool-invocation"
import { useAssistantMessageSelection } from "./useAssistantMessageSelection"
import { useLoadingState } from "./use-loading-state"

type MessageAssistantProps = {
  children: string
  isLast?: boolean
  hasScrollAnchor?: boolean
  copied?: boolean
  copyToClipboard?: () => void
  onReload?: () => void
  parts?: MessageAISDK["parts"]
  status?: "streaming" | "ready" | "submitted" | "error"
  className?: string
  messageId: string
  onQuote?: (text: string, messageId: string) => void
  finishReason?: string
}

function formatToolProgressLabel(toolName: string): string {
  switch (toolName) {
    case "web_search":
    case "google_search":
      return "Searching the web"
    case "imageGeneration":
    case "image_generation":
      return "Generating image"
    default: {
      const readableName = toolName
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim()
      const normalized =
        readableName.length > 0
          ? readableName.charAt(0).toUpperCase() + readableName.slice(1)
          : "Running tool"
      return `Running ${normalized}`
    }
  }
}

export function MessageAssistant({
  children,
  isLast,
  hasScrollAnchor,
  copied,
  copyToClipboard,
  onReload,
  parts,
  status,
  className,
  messageId,
  onQuote,
  finishReason,
}: MessageAssistantProps) {
  const { preferences } = useUserPreferences()
  const sources = getSources(parts || [])
  
  // v6: Filter tool parts using official helper
  const toolInvocationParts = parts?.filter((part): part is ToolUIPart =>
    isStaticToolUIPart(part)
  )
  
  const reasoningParts = parts?.find((part) => part.type === "reasoning")
  const contentNullOrEmpty = children === null || children === ""
  const isLastStreaming = status === "streaming" && isLast
  
  // Type for image search results
  type ImageResult = { title: string; imageUrl: string; sourceUrl: string }
  
  // v6: Use flat properties and official helper for tool name
  const searchImageResults: ImageResult[] =
    parts
      ?.filter((part): part is ToolUIPart =>
        isStaticToolUIPart(part) &&
        part.state === "output-available" &&
        getStaticToolName(part) === "imageSearch" &&
        (part.output as { content?: Array<{ type: string }> })?.content?.[0]?.type === "images"
      )
      .flatMap((part) => {
        const output = part.output as { content?: Array<{ type: string; results?: ImageResult[] }> }
        return output?.content?.[0]?.results ?? []
      }) ?? []

  const {
    showDots: showStreamingLoader,
    showThinking,
    showToolProgress,
    showImageGenProgress,
    activeToolNames,
  } = useLoadingState({
    status: status ?? "ready",
    isLast: isLast ?? false,
    parts,
    contentNullOrEmpty,
    showToolInvocations: preferences.showToolInvocations,
  })

  const isQuoteEnabled = !preferences.multiModelEnabled
  const messageRef = useRef<HTMLDivElement>(null)
  const { selectionInfo, clearSelection } = useAssistantMessageSelection(
    messageRef,
    isQuoteEnabled
  )
  const handleQuoteBtnClick = useCallback(() => {
    if (selectionInfo && onQuote) {
      onQuote(selectionInfo.text, selectionInfo.messageId)
      clearSelection()
    }
  }, [selectionInfo, onQuote, clearSelection])

  return (
    <Message
      className={cn(
        "group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2",
        hasScrollAnchor && "min-h-scroll-anchor",
        className
      )}
    >
      <div
        ref={messageRef}
        className={cn(
          "relative flex min-w-full flex-col gap-2",
          isLast && "pb-8"
        )}
        {...(isQuoteEnabled && { "data-message-id": messageId })}
      >
        {reasoningParts && reasoningParts.text && (
          <Reasoning
            reasoning={reasoningParts.text}
            isStreaming={status === "streaming"}
          />
        )}

        {showThinking && (
          <Loader variant="loading-dots" text="Thinking" />
        )}

        {toolInvocationParts &&
          toolInvocationParts.length > 0 &&
          preferences.showToolInvocations && (
            <ToolInvocation toolInvocations={toolInvocationParts} />
          )}

        {showToolProgress && (
          <Loader
            variant="loading-dots"
            text={
              activeToolNames.length === 1
                ? formatToolProgressLabel(activeToolNames[0])
                : "Running tools"
            }
          />
        )}

        {searchImageResults.length > 0 && (
          <SearchImages results={searchImageResults} />
        )}

        {showImageGenProgress && (
          <Loader variant="loading-dots" text="Generating image" />
        )}

        {showStreamingLoader && <Loader variant="chat" />}

        {contentNullOrEmpty ? null : (
          <MessageContent
            className={cn(
              "prose dark:prose-invert relative min-w-full bg-transparent p-0",
              "prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-base prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto"
            )}
            markdown={true}
          >
            {children}
          </MessageContent>
        )}
        {sources && sources.length > 0 && <SourcesList sources={sources} />}

        {finishReason === "length" && status !== "streaming" && (
          <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            <HugeiconsIcon icon={Alert02Icon} size={14} className="text-amber-500 dark:text-amber-400" />
            <span>
              Response may be incomplete due to output length limits.
              {onReload && (
                <button
                  type="button"
                  onClick={onReload}
                  className="text-primary ml-1 underline underline-offset-2 hover:no-underline"
                >
                  Regenerate
                </button>
              )}
            </span>
          </div>
        )}

        {Boolean(isLastStreaming || contentNullOrEmpty) ? null : (
          <MessageActions
            className={cn(
              "-ml-2 flex gap-0"
            )}
          >
            <MessageAction
              tooltip={copied ? "Copied!" : "Copy text"}
              side="bottom"
            >
              <button
                className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg bg-transparent transition"
                aria-label="Copy text"
                onClick={copyToClipboard}
                type="button"
              >
                {copied ? (
                  <HugeiconsIcon icon={Tick02Icon} size={20} />
                ) : (
                  <HugeiconsIcon icon={Copy01Icon} size={20} />
                )}
              </button>
            </MessageAction>
            {isLast ? (
              <MessageAction
                tooltip="Regenerate"
                side="bottom"
                delay={0}
              >
                <button
                  className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg bg-transparent transition"
                  aria-label="Regenerate"
                  onClick={onReload}
                  type="button"
                >
                  <HugeiconsIcon icon={RefreshIcon} size={20} />
                </button>
              </MessageAction>
            ) : null}
          </MessageActions>
        )}

        {isQuoteEnabled && selectionInfo && selectionInfo.messageId && (
          <QuoteButton
            mousePosition={selectionInfo.position}
            onQuote={handleQuoteBtnClick}
            messageContainerRef={messageRef}
            onDismiss={clearSelection}
          />
        )}
      </div>
    </Message>
  );
}
