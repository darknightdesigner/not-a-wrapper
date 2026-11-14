import { authenticatedRoute } from "@/app/api/_lib/authenticated-route"
import { jsonError } from "@/app/api/_lib/convex"
import { getModelInfo } from "@/lib/models"
import { sanitizeExceptionForTelemetry } from "@/lib/observability/sentry-scrubbing"
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
// rate limit (60/min, 2,000/day) bounds spend instead of the chat allowance.
const AUTOCOMPLETE_MODEL_ID = "openrouter:meta-llama/llama-3.3-70b-instruct"

/**
 * Streams up to three completions as plain text, one per line. The rate limit
 * is admitted before the model call, so a refused call never reaches the
 * provider and the daily cap is a hard spend ceiling.
 */
export const POST = authenticatedRoute(
  async (req, { session }) => {
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
    const result = streamText({
      model: createLanguageModel(route),
      instructions: PROMPT_AUTOCOMPLETE_INSTRUCTIONS,
      prompt: buildPromptAutocompletePrompt(parsed.data),
      maxOutputTokens: 120,
      maxRetries: 0,
      timeout: 5_000,
      // A newer keystroke aborts this request; stop paying for it too.
      abortSignal: req.signal,
      providerOptions: {
        ...policy,
        openrouter: { ...policy.openrouter, provider: { sort: "latency" } },
      },
      onError: ({ error }) => {
        if (!req.signal.aborted) {
          // The raw error can carry the request body (typed text, titles).
          console.error(
            "Error in /api/prompt-autocomplete:",
            sanitizeExceptionForTelemetry(error).message
          )
        }
      },
    })

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
  },
  { rateLimit: { bucket: "prompt_autocomplete" } }
)
