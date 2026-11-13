import { z } from "zod"

/**
 * Prompt autocomplete for the new-chat composer, modeled on Grok's: the client
 * debounces the typed text, a fast model streams up to three continuations
 * (one per line), and cached continuations keep narrowing locally while the
 * next request is in flight. Pure helpers here are shared by the route and the composer.
 */

export const PROMPT_AUTOCOMPLETE_MAX_ITEMS = 3
export const PROMPT_AUTOCOMPLETE_MAX_QUERY_LENGTH = 50
export const PROMPT_AUTOCOMPLETE_DEBOUNCE_MS = 200
const MAX_COMPLETION_LENGTH = 120
/** Recent chat titles sent for personalization; more makes models dwell on
 * them. */
export const PROMPT_AUTOCOMPLETE_MAX_TOPICS = 12

export const promptAutocompleteRequestSchema = z.object({
  query: z.string().min(2).max(PROMPT_AUTOCOMPLETE_MAX_QUERY_LENGTH),
  /** Recent chat titles, newest first. Personalizes without a server read. */
  topics: z.array(z.string().trim().min(1).max(120)).max(PROMPT_AUTOCOMPLETE_MAX_TOPICS),
})

export type PromptAutocompleteRequest = z.infer<
  typeof promptAutocompleteRequestSchema
>

/** The text worth completing, or null: one short line that isn't a `/` or `@`
 * command. Leading whitespace is ignored; trailing spaces are kept so "how "
 * and "how" ask for different continuations. */
export function toAutocompleteQuery(text: string): string | null {
  const typed = text.trimStart()
  if (
    typed.trim().length < 2 ||
    typed.length > PROMPT_AUTOCOMPLETE_MAX_QUERY_LENGTH ||
    typed.includes("\n") ||
    typed.startsWith("/") ||
    typed.startsWith("@")
  ) {
    return null
  }
  return typed
}

/** A completion still applies while it strictly extends what is typed. */
export function continuesTyped(completion: string, typed: string): boolean {
  return (
    completion.length > typed.length &&
    completion.toLowerCase().startsWith(typed.toLowerCase())
  )
}

/** The composer text after accepting a completion: the user's own characters
 * stay as typed and only the continuation is appended. */
export function acceptCompletion(
  draft: string,
  typed: string,
  completion: string
): string {
  return draft + completion.slice(typed.length)
}

/**
 * Keep rows that are still shown in their current slots and fill the rest
 * with new arrivals, so the list never reshuffles under the pointer or the
 * keyboard highlight while results refresh.
 */
export function keepShownOrder(
  next: readonly string[],
  shown: readonly string[]
): string[] {
  const incoming = new Set(next)
  const kept = shown.filter((row) => incoming.has(row))
  const keptSet = new Set(kept)
  const fresh = next.filter((row) => !keptSet.has(row))
  const ordered: string[] = []
  for (const row of shown.slice(0, next.length)) {
    if (keptSet.has(row)) ordered.push(row)
    else if (fresh.length > 0) ordered.push(fresh.shift()!)
  }
  return [...ordered, ...fresh]
}

export const PROMPT_AUTOCOMPLETE_INSTRUCTIONS = `You autocomplete messages typed into an AI assistant. Predict ${PROMPT_AUTOCOMPLETE_MAX_ITEMS} complete messages that begin with the typed text, one per line.
- Each is a full, specific request a person would actually send: 4 to 10 words with a clear subject, never cut off after a verb or article.
- Each line starts with the typed text exactly as typed, then continues it.
- Lines 1 and 2 are popular, general requests anyone might type.
- Line 3 may relate to one of the user's recent topics if it fits naturally; otherwise make it general too.
- Never include people's names.
- No numbering, quotes, or final period. No other text.

Example
Typed: what's a good way to rem
what's a good way to remember people's names
what's a good way to remove rust from tools
what's a good way to remodel a tiny bathroom`

export function buildPromptAutocompletePrompt({
  query,
  topics,
}: PromptAutocompleteRequest): string {
  const recent = topics.length > 0 ? topics.join("; ") : "none"
  return `Recent topics: ${recent}\n\nTyped: ${query}`
}

/** One model line → a completion that extends the query in the user's own
 * casing, or null. */
function toCompletion(line: string, query: string): string | null {
  const cleaned = line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/[.!?。]+$/u, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!continuesTyped(cleaned, query)) return null
  const completion = (query + cleaned.slice(query.length)).trimEnd()
  return completion.length > query.trimEnd().length
    ? completion.slice(0, MAX_COMPLETION_LENGTH)
    : null
}

/**
 * Model text chunks → distinct completions, each yielded as soon as its line
 * ends, so the first suggestion shows before the model finishes the rest.
 */
export async function* streamCompletions(
  chunks: AsyncIterable<string>,
  query: string
): AsyncGenerator<string> {
  const seen = new Set<string>()
  let buffer = ""
  const accept = (line: string) => {
    const completion = toCompletion(line, query)
    if (!completion || seen.has(completion.toLowerCase())) return null
    seen.add(completion.toLowerCase())
    return completion
  }
  for await (const chunk of chunks) {
    buffer += chunk
    let newline: number
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const completion = accept(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      if (!completion) continue
      yield completion
      if (seen.size === PROMPT_AUTOCOMPLETE_MAX_ITEMS) return
    }
  }
  const last = accept(buffer)
  if (last) yield last
}
