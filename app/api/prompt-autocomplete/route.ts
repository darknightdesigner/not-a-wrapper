import {
  authenticatedRoute,
  enforceRateLimit,
} from "@/app/api/_lib/authenticated-route"
import { jsonError } from "@/app/api/_lib/convex"
import { getModelInfo } from "@/lib/models"
import { createLanguageModel } from "@/lib/openproviders/create-language-model"
import { resolveRequestPolicyOptions } from "@/lib/openproviders/request-shaping"
import { deriveProviderSafetyIdentifier } from "@/lib/openproviders/safety-identifier"
import {
  buildPromptAutocompletePrompt,
  PROMPT_AUTOCOMPLETE_INSTRUCTIONS,
  promptAutocompleteRequestSchema,
  streamCompletions,
} from "@/lib/prompt-autocomplete"
import { streamText } from "ai"

// Benchmarked fastest with usable phrasing (ADR-0052): first line ~0.3s on
// OpenRouter's lowest-latency host. Runs on the platform key; the per-user
// rate limit bounds spend instead of the chat allowance.
const AUTOCOMPLETE_MODEL_ID = "openrouter:meta-llama/llama-3.3-70b-instruct"

/** Streams up to three completions as plain text, one per line. */
export const POST = authenticatedRoute(async (req, { session, convex }) => {
  const parsed = promptAutocompleteRequestSchema.safeParse(
    await req.json().catch(() => null)
  )
  if (!parsed.success) return jsonError("Invalid request", 400)

  const route = getModelInfo(AUTOCOMPLETE_MODEL_ID)
  if (!route) return jsonError("Autocomplete unavailable", 503)

  const policy = resolveRequestPolicyOptions(route.providerId, {
    searchToolsActive: false,
    appToolsActive: false,
    safetyIdentifier: deriveProviderSafetyIdentifier({
      kind: "user",
      id: session.userId,
    }),
  })
  // The rate-limit round trip overlaps the model's first token; a refused
  // call aborts the model before any output is sent.
  const refuse = new AbortController()
  const limited = enforceRateLimit(convex, { bucket: "prompt_autocomplete" })
  const result = streamText({
    model: createLanguageModel(route),
    instructions: PROMPT_AUTOCOMPLETE_INSTRUCTIONS,
    prompt: buildPromptAutocompletePrompt(parsed.data),
    maxOutputTokens: 120,
    maxRetries: 0,
    timeout: 5_000,
    // A newer keystroke aborts this request; stop paying for it too.
    abortSignal: AbortSignal.any([req.signal, refuse.signal]),
    providerOptions: {
      ...policy,
      openrouter: { ...policy.openrouter, provider: { sort: "latency" } },
    },
    onError: ({ error }) => {
      if (!req.signal.aborted && !refuse.signal.aborted) {
        console.error("Error in /api/prompt-autocomplete:", error)
      }
    },
  })

  const rateLimitError = await limited.catch((error: unknown) => {
    refuse.abort()
    throw error
  })
  if (rateLimitError) {
    refuse.abort()
    return rateLimitError
  }

  const completions = streamCompletions(result.textStream, parsed.data.query)
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await completions.next()
        if (next.done) controller.close()
        else controller.enqueue(encoder.encode(`${next.value}\n`))
      },
      async cancel() {
        await completions.return(undefined)
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  )
})
