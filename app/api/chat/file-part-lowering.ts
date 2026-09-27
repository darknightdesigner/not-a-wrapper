import { isImageMediaType, isPdfMediaType } from "@/lib/file/policy"
import type { UIMessage } from "ai"
import type { AdaptationContext } from "./adapters/types"

// Model-bound only: canonical history keeps every file part. Text-like files
// are already inlined by text-file-parts.ts, so a file part reaching this pass
// is one the target route takes natively (images and PDFs on a vision route)
// or one no route takes. The rest become a short note, so an old image or an
// unsupported upload cannot fail every later turn after a model switch
// (LobeHub's vision downgrade, HuggingChat's multimodal-only image replay).
// The current turn's own images still require a vision route at admission.

type MessagePart = UIMessage["parts"][number]
type FilePart = Extract<MessagePart, { type: "file" }>

export type FilePartLoweringResult = {
  messages: UIMessage[]
  loweredCount: number
}

function routeTakesFile(part: FilePart, context: AdaptationContext): boolean {
  return (
    context.vision === true &&
    (isImageMediaType(part.mediaType) || isPdfMediaType(part.mediaType))
  )
}

function omittedFileNote(part: FilePart): string {
  const name = part.filename?.trim() || "file"
  return isImageMediaType(part.mediaType)
    ? `[Image "${name}" omitted: this model cannot view images.]`
    : `[File "${name}" omitted: this model cannot read this file type.]`
}

export function lowerUnsupportedFileParts(
  messages: readonly UIMessage[],
  context: AdaptationContext
): FilePartLoweringResult {
  let loweredCount = 0
  const lowered = messages.map((message) => {
    if (
      !message.parts.some(
        (part) => part.type === "file" && !routeTakesFile(part, context)
      )
    ) {
      return message
    }
    return {
      ...message,
      parts: message.parts.map((part): MessagePart => {
        if (part.type !== "file" || routeTakesFile(part, context)) return part
        loweredCount += 1
        return { type: "text", text: omittedFileNote(part) }
      }),
    }
  })

  return { messages: lowered, loweredCount }
}
