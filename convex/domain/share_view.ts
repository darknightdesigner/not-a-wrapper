import type { UIMessage } from "ai"
import type { Doc, Id } from "../_generated/dataModel"
import { dedupeSources, getPartSources } from "../../lib/chat-messages/sources"
import {
  createBranchContext,
  getEffectiveParentIdFromContext,
  getSelectedPathMessagesFromContext,
} from "./message_branches"
import { isVisibleChatMessage } from "./message_visibility"

/**
 * Share view (ADR-0043): what a share link shows a stranger. Built from a
 * field allowlist, so nothing crosses unless it is named here: never the
 * system prompt, owner or internal ids, tool inputs or outputs, reasoning,
 * files, provider metadata, or run state.
 */
export type SharedSource = { url: string; title?: string }

export type SharedMessageView = {
  role: "user" | "assistant"
  text: string
  sources: SharedSource[]
}

export type SharedChatView = {
  title: string | null
  createdAt: number
  messages: SharedMessageView[]
}

// 128 random bits as hex. The shape differs from a chat publicId (a UUID),
// so a private chat URL can never pass as a share id.
const SHARE_ID_PATTERN = /^[0-9a-f]{32}$/

export function mintShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

export function isShareId(id: unknown): id is string {
  return typeof id === "string" && SHARE_ID_PATTERN.test(id)
}

function isShareableMessage(message: Doc<"messages">): boolean {
  return (
    (message.role === "user" || message.role === "assistant") &&
    message.status !== "awaiting_approval" &&
    isVisibleChatMessage(message)
  )
}

/** The snapshot tail at share time: the last shareable selected message. */
export function findShareTail(
  messages: Doc<"messages">[]
): Doc<"messages"> | undefined {
  return getSelectedPathMessagesFromContext(createBranchContext(messages))
    .filter(isShareableMessage)
    .at(-1)
}

/**
 * The shared path: the snapshot tail and its ancestors, oldest first. Later
 * turns, edits, and branch switches never change it. Null when the tail is
 * gone.
 */
export function selectSharedPath(
  messages: Doc<"messages">[],
  throughMessageId: Id<"messages">
): Doc<"messages">[] | null {
  const context = createBranchContext(messages)
  const byId = new Map(context.sortedMessages.map((m) => [m._id, m]))
  if (!byId.has(throughMessageId)) return null
  const path: Doc<"messages">[] = []
  const seen = new Set<Id<"messages">>()
  let current = byId.get(throughMessageId)
  while (current && !seen.has(current._id)) {
    seen.add(current._id)
    path.push(current)
    const parentId = getEffectiveParentIdFromContext(context, current)
    current = parentId ? byId.get(parentId) : undefined
  }
  return path.reverse().filter(isShareableMessage)
}

// Web citations only: provider source parts and the static web-search tools.
// A `dynamic-tool` part is an MCP call whose output may carry private URLs,
// and no other tool output is published.
const SOURCE_PART_TYPES = new Set([
  "source-url",
  "tool-web_search",
  "tool-google_search",
])

function isSourcePart(part: unknown): part is UIMessage["parts"][number] {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    typeof part.type === "string" &&
    SOURCE_PART_TYPES.has(part.type)
  )
}

function isWebUrl(url: unknown): url is string {
  if (typeof url !== "string") return false
  try {
    const { protocol } = new URL(url)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}

function sharedSources(parts: unknown): SharedSource[] {
  if (!Array.isArray(parts)) return []
  return dedupeSources(
    parts.filter(isSourcePart).flatMap(getPartSources)
  ).flatMap(({ url, title }) =>
    isWebUrl(url) ? [title ? { url, title } : { url }] : []
  )
}

export function projectSharedChat(
  share: Doc<"chatShares">,
  chat: Doc<"chats">,
  path: Doc<"messages">[]
): SharedChatView {
  const messages = path.flatMap((message): SharedMessageView[] => {
    if (message.role !== "user" && message.role !== "assistant") return []
    const text = message.content.trim()
    const sources =
      message.role === "assistant" ? sharedSources(message.parts) : []
    if (!text && sources.length === 0) return []
    return [{ role: message.role, text: message.content, sources }]
  })
  return {
    // The share-time title, never the live one (ADR-0043).
    title: share.title ?? null,
    createdAt: chat._creationTime,
    messages,
  }
}
