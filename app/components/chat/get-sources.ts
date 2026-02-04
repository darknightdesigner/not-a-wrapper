import type { UIMessage as MessageAISDK } from "@ai-sdk/react"

export function getSources(parts: MessageAISDK["parts"]) {
  const sources = parts
    ?.filter(
      (part) => part.type === "source-url" || part.type === "tool-invocation"
    )
    .map((part) => {
      if (part.type === "source-url") {
        return part // In v5, the source-url part IS the source object
      }

      /* FIXME(@ai-sdk-upgrade-v5): The `part.toolInvocation.state` property has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#tool-part-type-changes-uimessage */
      if (part.type === "tool-invocation" &&
      part.toolInvocation.state === "result") {
        const result = part.toolInvocation.result

        /* FIXME(@ai-sdk-upgrade-v5): The `part.toolInvocation.toolName` property has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#tool-part-type-changes-uimessage */
        if (part.toolInvocation.toolName === "summarizeSources" &&
        result?.result?.[0]?.citations) {
          return result.result.flatMap((item: { citations?: unknown[] }) => item.citations || [])
        }

        return Array.isArray(result) ? result.flat() : result
      }

      return null
    })
    .filter(Boolean)
    .flat()

  const validSources =
    sources?.filter(
      (source) =>
        source && typeof source === "object" && source.url && source.url !== ""
    ) || []

  return validSources
}
