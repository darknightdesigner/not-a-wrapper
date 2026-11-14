"use client"

import { useChats } from "@/lib/chat-store/chats/provider"
import { sortByRecency } from "@/lib/chat-store/chats/sidebar-window"
import { CHAT_TITLE_PLACEHOLDER } from "@/lib/chat-title"
import { fetchClient } from "@/lib/fetch"
import {
  continuesTyped,
  keepShownOrder,
  PROMPT_AUTOCOMPLETE_DEBOUNCE_MS,
  PROMPT_AUTOCOMPLETE_MAX_TOPICS,
  streamCompletions,
  toAutocompleteQuery,
  type PromptAutocompleteRequest,
} from "@/lib/prompt-autocomplete"
import {
  keepPreviousData,
  experimental_streamedQuery as streamedQuery,
  useQuery,
} from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

async function* readText(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

/** Each completion as soon as the server finishes its line. */
async function* fetchCompletions(
  body: PromptAutocompleteRequest,
  signal: AbortSignal
) {
  const response = await fetchClient("/api/prompt-autocomplete", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok || !response.body) {
    throw new Error(`Autocomplete ${response.status}`)
  }
  yield* streamCompletions(readText(response.body), body.query)
}

/**
 * Up to three continuations of `text`, in stable slots. The request waits for
 * a 200ms typing pause and streams; cached continuations keep narrowing on
 * every keystroke, so the list tracks typing without waiting on the network.
 */
export function usePromptAutocomplete({
  text,
  enabled,
}: {
  text: string
  enabled: boolean
}): { typed: string; completions: readonly string[] } {
  const { chats } = useChats()
  const query = enabled ? toAutocompleteQuery(text) : null
  // Starts empty so a draft present on mount also waits for the debounce.
  const [requested, setRequested] = useState<string | null>(null)
  if (query === null && requested !== null) setRequested(null)

  useEffect(() => {
    if (query === null) return
    const timer = window.setTimeout(
      () => setRequested(query),
      PROMPT_AUTOCOMPLETE_DEBOUNCE_MS
    )
    return () => window.clearTimeout(timer)
  }, [query])

  // Recently active titles, as the sidebar orders them, personalize the
  // completions.
  const topics = useMemo(
    () =>
      sortByRecency(chats)
        .flatMap(({ title: rawTitle }) => {
          // Blank titles carry nothing, so trim before checking.
          const title = rawTitle?.trim()
          return title && title !== CHAT_TITLE_PLACEHOLDER
            ? [title.slice(0, 120)]
            : []
        })
        .slice(0, PROMPT_AUTOCOMPLETE_MAX_TOPICS),
    [chats]
  )

  const { data, isFetching } = useQuery<string[]>({
    queryKey: ["prompt-autocomplete", requested],
    queryFn: streamedQuery({
      streamFn: ({ signal }) =>
        fetchCompletions({ query: requested!, topics }, signal),
    }),
    enabled: requested !== null,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const [shown, setShown] = useState<readonly string[]>([])
  const stillTyped = (rows: readonly string[]) =>
    query === null ? [] : rows.filter((row) => continuesTyped(row, query))
  const streamed = stillTyped(data ?? [])
  const valid = stillTyped(shown)
  // The list never shrinks mid-stream: valid rows stay until the stream has
  // as many, then swap in one frame. An empty list fills row by row.
  const completions = keepShownOrder(
    isFetching && valid.length > streamed.length ? valid : streamed,
    shown
  )
  if (
    completions.length !== shown.length ||
    completions.some((row, index) => row !== shown[index])
  ) {
    setShown(completions)
  }

  return { typed: query ?? "", completions }
}
