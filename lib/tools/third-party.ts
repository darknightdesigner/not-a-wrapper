// lib/tools/third-party.ts

import { tool } from "ai"
import { z } from "zod"
import type { ToolSet } from "ai"
import type { ToolMetadata } from "./types"

/**
 * Configuration for third-party tool loading.
 * The coordinator (route.ts) determines which capabilities to skip
 * based on what Layer 1 (built-in provider tools) already provides.
 * Route.ts only calls getThirdPartyTools when Layer 1 didn't provide search.
 */
export interface ThirdPartyToolOptions {
  /**
   * Skip loading search tools.
   * Set to true when Layer 1 already provides a search tool for this provider.
   * In practice, route.ts only calls getThirdPartyTools when Layer 1 didn't
   * provide search, so this will typically be false when called.
   * Kept for future extensibility (e.g., skip search but load other tools).
   */
  skipSearch?: boolean

  /**
   * Resolved Exa API key.
   * Key resolution order (handled by caller in route.ts):
   *   1. User BYOK key from Convex userKeys (Phase 5)
   *   2. Platform env var: process.env.EXA_API_KEY
   *   3. undefined (no key → skip Exa tools)
   *
   * The exa-js SDK requires an explicit key in its constructor —
   * it does not read from process.env. This is intentional: it ensures
   * BYOK keys are passed directly without env var manipulation.
   */
  exaKey?: string
}

/**
 * Returns third-party tools based on available API keys and capability flags.
 *
 * Uses the exa-js core SDK with a custom tool() wrapper instead of
 * @exalabs/ai-sdk, because the latter reads API keys from env vars only
 * and does not support explicit key passthrough needed for BYOK.
 *
 * This module is intentionally decoupled from Layer 1 (provider tools).
 * It does not know or check which providers have built-in search.
 * The `skipSearch` flag is set by the coordinator (route.ts).
 *
 * @param options - Configuration for which tools to load and with which keys
 * @returns A ToolSet with third-party tools, or empty object
 */
export async function getThirdPartyTools(
  options: ThirdPartyToolOptions
): Promise<{
  tools: ToolSet
  metadata: Map<string, ToolMetadata>
}> {
  const { skipSearch = false, exaKey } = options
  const tools: Record<string, unknown> = {}
  const metadata = new Map<string, ToolMetadata>()

  // Exa Search — skip if Layer 1 already provides search
  if (!skipSearch && exaKey) {
    try {
      // exa-js is a stateless HTTP client wrapper — no cleanup or after() needed.
      // Each call creates a fresh fetch request. No connection pool or persistent state.
      const Exa = (await import("exa-js")).default
      const exa = new Exa(exaKey)

      tools.web_search = tool({
        description:
          "Search the web for current information using AI-native semantic search. " +
          "Returns relevant web pages with titles, URLs, content snippets, and publication dates.",
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
            .max(200)
            .describe("The search query — be specific for better results"),
        }),
        execute: async ({ query }) => {
          const { results } = await exa.searchAndContents(query, {
            type: "auto",
            numResults: 5,
            text: { maxCharacters: 2000 },
            livecrawl: "fallback",
          })
          return results.map((r) => ({
            title: r.title ?? undefined,
            url: r.url,
            content: r.text?.slice(0, 2000),
            publishedDate: r.publishedDate ?? undefined,
          }))
        },
      })
      metadata.set("web_search", {
        displayName: "Web Search",
        source: "third-party",
        serviceName: "Exa",
        icon: "search",
        estimatedCostPer1k: 5, // $5/1K search requests (1-25 results per request)
      })
    } catch (err) {
      console.error("[tools/third-party] Failed to load Exa search:", err)
    }
  }

  return { tools: tools as ToolSet, metadata }
}
