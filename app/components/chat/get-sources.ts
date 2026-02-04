import type { UIMessage as MessageAISDK } from "@ai-sdk/react"
import type { SourceUrlUIPart, ToolUIPart } from "ai"

// Source type for validation
interface SourceLike {
  url: string
  title?: string
  sourceId?: string
}

// v5 helper: Check if part is a tool part (type starts with "tool-")
function isToolPart(part: NonNullable<MessageAISDK["parts"]>[number]): part is ToolUIPart {
  return part.type.startsWith("tool-")
}

// v5 helper: Get tool name from ToolUIPart (in v5, it's extracted from the type: "tool-{toolName}")
function getToolNameFromPart(part: ToolUIPart): string {
  // In v5, tool parts have type like "tool-exa_search", "tool-summarizeSources", etc.
  // The toolName is part of the type string after "tool-"
  return part.type.replace(/^tool-/, "")
}

// Type guard to check if an object is a valid source
function isValidSource(source: unknown): source is SourceLike {
  return (
    source !== null &&
    typeof source === "object" &&
    "url" in source &&
    typeof (source as SourceLike).url === "string" &&
    (source as SourceLike).url !== ""
  )
}

export function getSources(parts: MessageAISDK["parts"]): SourceUrlUIPart[] {
  const sources = parts
    ?.filter(
      (part) => part.type === "source-url" || isToolPart(part)
    )
    .map((part) => {
      if (part.type === "source-url") {
        return part // In v5, the source-url part IS the source object
      }

      // v5: Tool parts are flat - use part.state, part.output, etc. instead of part.toolInvocation.*
      if (isToolPart(part) && part.state === "output-available") {
        const result = part.output as unknown
        const toolName = getToolNameFromPart(part)

        // Handle summarizeSources tool which returns citations
        if (toolName === "summarizeSources") {
          const typedResult = result as { result?: Array<{ citations?: unknown[] }> } | undefined
          if (typedResult?.result?.[0]?.citations) {
            return typedResult.result.flatMap((item) => item.citations || [])
          }
        }

        return Array.isArray(result) ? result.flat() : result
      }

      return null
    })
    .filter(Boolean)
    .flat()

  // Filter and convert to SourceUrlUIPart format
  const validSources = (sources || [])
    .filter(isValidSource)
    .map((source): SourceUrlUIPart => ({
      type: "source-url",
      sourceId: source.sourceId || source.url,
      url: source.url,
      title: source.title || source.url,
    }))

  return validSources
}
