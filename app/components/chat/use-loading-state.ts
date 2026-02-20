import type { UIMessage as MessageAISDK } from "@ai-sdk/react"
import type { ToolUIPart } from "ai"
import { getStaticToolName, isStaticToolUIPart } from "ai"
import { useMemo } from "react"

type LoadingStateInput = {
  status: "streaming" | "ready" | "submitted" | "error"
  isLast: boolean
  parts?: MessageAISDK["parts"]
  contentNullOrEmpty: boolean
  showToolInvocations: boolean
}

type LoadingStateOutput = {
  showDots: boolean
  showToolProgress: boolean
  showImageGenProgress: boolean
  activeToolNames: string[]
}

type ImageResult = { title: string; imageUrl: string; sourceUrl: string }

export function useLoadingState({
  status,
  isLast,
  parts,
  contentNullOrEmpty,
  showToolInvocations,
}: LoadingStateInput): LoadingStateOutput {
  return useMemo(() => {
    const isLastStreaming = status === "streaming" && isLast

    // Suppress generating dots only when reasoning has visible text.
    const hasVisibleReasoning =
      parts?.some(
        (part) =>
          part.type === "reasoning" &&
          typeof part.text === "string" &&
          part.text.trim().length > 0
      ) ?? false

    const toolInvocationParts =
      parts?.filter((part): part is ToolUIPart => isStaticToolUIPart(part)) ?? []
    const hasVisibleTools = Boolean(
      toolInvocationParts.length > 0 && showToolInvocations
    )
    const inProgressToolParts = toolInvocationParts.filter(
      (part) => part.state !== "output-available"
    )
    const activeToolNames = Array.from(
      new Set(inProgressToolParts.map((part) => getStaticToolName(part)))
    )
    const showToolProgress =
      isLastStreaming && showToolInvocations && inProgressToolParts.length > 0

    const imageGenerationToolNames = new Set(["imageGeneration", "image_generation"])
    const showImageGenProgress =
      isLastStreaming &&
      inProgressToolParts.some((part) =>
        imageGenerationToolNames.has(getStaticToolName(part))
      )

    const searchImageResults: ImageResult[] =
      parts
        ?.filter(
          (part): part is ToolUIPart =>
            isStaticToolUIPart(part) &&
            part.state === "output-available" &&
            getStaticToolName(part) === "imageSearch" &&
            (part.output as { content?: Array<{ type: string }> })?.content?.[0]
              ?.type === "images"
        )
        .flatMap((part) => {
          const output = part.output as {
            content?: Array<{ type: string; results?: ImageResult[] }>
          }
          return output?.content?.[0]?.results ?? []
        }) ?? []

    const hasVisibleImages = searchImageResults.length > 0

    const showDots =
      isLastStreaming &&
      contentNullOrEmpty &&
      !hasVisibleReasoning &&
      !hasVisibleTools &&
      !hasVisibleImages &&
      !showToolProgress &&
      !showImageGenProgress

    return {
      showDots,
      showToolProgress,
      showImageGenProgress,
      activeToolNames,
    }
  }, [status, isLast, parts, contentNullOrEmpty, showToolInvocations])
}
