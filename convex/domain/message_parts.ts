import { getConvexSize, type Value } from "convex/values"
import { extractTextFromMessageParts } from "./message_facts"

export { extractTextFromMessageParts } from "./message_facts"

/**
 * Stored `content` + `parts` budget for one message document. Convex rejects a
 * document over 1 MiB and rolls the whole write back, so an oversized snapshot
 * or completion used to lose everything after the last write that fit. The
 * remaining 128 KiB holds the other fields and later approval-state patches.
 */
const MESSAGE_PAYLOAD_BUDGET_BYTES = 896 * 1024

/** Smaller payloads stay: their omission marker would save next to nothing. */
const MIN_OMITTED_PAYLOAD_BYTES = 1024

/** Tool states whose input is history; a pending call's input is validated. */
const SETTLED_TOOL_STATES: ReadonlySet<Value | undefined> = new Set([
  "output-available",
  "output-error",
  "output-denied",
])

type PartRecord = { [key: string]: Value | undefined }

function isRecord(value: Value | undefined): value is PartRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof ArrayBuffer)
  )
}

function isToolPart(part: PartRecord): boolean {
  return (
    part.type === "dynamic-tool" ||
    (typeof part.type === "string" && part.type.startsWith("tool-"))
  )
}

function kib(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KB`
}

function omitToolPayloads(part: PartRecord): PartRecord {
  const next: PartRecord = { ...part }
  const fields = SETTLED_TOOL_STATES.has(part.state)
    ? ["output", "errorText", "input"]
    : ["output", "errorText"]
  for (const field of fields) {
    const value = part[field]
    const bytes = getConvexSize(value)
    if (bytes < MIN_OMITTED_PAYLOAD_BYTES) continue
    next[field] =
      typeof value === "string"
        ? `[Omitted to fit the message size limit: ${kib(bytes)}]`
        : // The `_truncated` envelope the tool layer already emits
          // (lib/tools/utils.ts), so replay and tool cards read it as-is.
          {
            _truncated: true,
            _originalSizeBytes: bytes,
            _hint: "Omitted to fit the message size limit.",
          }
  }
  return next
}

/**
 * Keeps the head of `text`, removing at least `bytes` UTF-8 bytes (each UTF-16
 * unit is at least one byte), and marks the cut.
 */
function truncateText(text: string, bytes: number): string {
  const marker = "\n\n[Truncated to fit the message size limit]"
  let keep = Math.max(0, text.length - bytes - marker.length)
  // Never split a surrogate pair.
  if (keep > 0 && /[\uD800-\uDBFF]/.test(text[keep - 1] ?? "")) keep--
  return text.slice(0, keep) + marker
}

type CappedMessagePayload = {
  content: string
  parts: unknown
  /** Bytes removed to fit; 0 when the payload is stored as given. */
  omittedBytes: number
}

/**
 * Fits an assistant payload under MESSAGE_PAYLOAD_BUDGET_BYTES, oldest material
 * first so the newest steps and the final answer survive longest: settled tool
 * payloads, then reasoning text, then answer text. Every cut leaves an explicit
 * marker. `content` mirrors the text parts, so it is re-derived when answer
 * text is cut.
 */
export function capMessagePayload(
  content: string,
  parts: unknown
): CappedMessagePayload {
  if (!Array.isArray(parts)) return { content, parts, omittedBytes: 0 }
  // `parts` is a `v.any()` column, so every element is a Convex value.
  const next: Value[] = [...parts]
  let contentBytes = getConvexSize(content)
  let partsBytes = getConvexSize(next)
  const originalBytes = contentBytes + partsBytes
  if (originalBytes <= MESSAGE_PAYLOAD_BUDGET_BYTES) {
    return { content, parts, omittedBytes: 0 }
  }

  const overBytes = () =>
    contentBytes + partsBytes - MESSAGE_PAYLOAD_BUDGET_BYTES
  const compactOldestFirst = (
    matches: (part: PartRecord) => boolean,
    compact: (part: PartRecord) => PartRecord
  ) => {
    for (let index = 0; index < next.length && overBytes() > 0; index++) {
      const part = next[index]
      if (!isRecord(part) || !matches(part)) continue
      const compacted = compact(part)
      partsBytes += getConvexSize(compacted) - getConvexSize(part)
      if (part.type === "text") {
        contentBytes += getConvexSize(compacted.text) - getConvexSize(part.text)
      }
      next[index] = compacted
    }
  }
  const isTextOf = (type: string) => (part: PartRecord) =>
    part.type === type && typeof part.text === "string"

  compactOldestFirst(isToolPart, omitToolPayloads)
  compactOldestFirst(isTextOf("reasoning"), (part) => ({
    ...part,
    text: truncateText(String(part.text), overBytes()),
  }))
  if (overBytes() > 0) {
    content = extractTextFromMessageParts(next)
    contentBytes = getConvexSize(content)
    // Each byte cut from a text part is also cut from `content`.
    compactOldestFirst(isTextOf("text"), (part) => ({
      ...part,
      text: truncateText(String(part.text), Math.ceil(overBytes() / 2)),
    }))
    content = extractTextFromMessageParts(next)
  }

  return {
    content,
    parts: next,
    omittedBytes:
      originalBytes - (getConvexSize(content) + getConvexSize(next)),
  }
}
