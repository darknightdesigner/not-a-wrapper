# ADR-004: Universal Search Fallback — Exa vs Tavily vs Firecrawl

> **Date**: February 2026
> **Status**: Accepted
> **Deciders**: Project owner
> **Context**: `.agents/context/research/tool-calling-infrastructure.md` Section 6.1 Priority 2

## Context

Not A Wrapper's tool calling research identified a **two-tier search strategy** for adding web search to all 100+ supported models:

- **Tier 1 (confirmed)**: Provider-specific search tools — `openai.tools.webSearch()`, `anthropic.tools.webSearch_20250305()`, `google.tools.googleSearch()` — for ~18 models with native provider search. These require zero new dependencies (packages already installed).

- **Tier 2 (this decision)**: A third-party search package for models **without** native provider search — xAI/Grok, Mistral, DeepSeek, OpenRouter, and Ollama (~25 models). This is the **one new dependency** we need to add.

Three candidates exist on npm with Vercel AI SDK tool exports: `@exalabs/ai-sdk` (Exa), `@tavily/ai-sdk` (Tavily), and `firecrawl-aisdk` (Firecrawl). This decision selects one.

## Decision Drivers

1. **Integration quality** — Drop-in compatibility with `streamText({ tools: { ... } })`, per-request API key support (BYOK), environment variable default
2. **Search quality** — Accuracy and relevance for general-purpose AI chat queries (current events, technical topics, obscure facts)
3. **Cost** — Effective cost per search query, free tier generosity for self-hosters, cost at platform scale
4. **Response format** — LLM-optimized output that fits within context windows efficiently
5. **Reliability & latency** — Response time impact on the agentic loop, rate limits, error handling
6. **Extra capabilities** — Value of additional tools beyond search (URL extraction, crawling)
7. **Open-source ecosystem** — Documentation, community adoption, framework integrations

## Options Considered

### Option A: @exalabs/ai-sdk (Exa)

**Source code analysis** (GitHub: `exa-labs/ai-sdk`, 35 stars, 1 fork):

The package exports a single `webSearch(config?)` function that returns an AI SDK `tool()` object. It is self-contained — no intermediate SDK dependency, uses raw `fetch()` to `https://api.exa.ai/search`. Dependencies are only peer deps (`ai`, `zod`).

```typescript
// API key handling — from source
const { apiKey = process.env.EXA_API_KEY, ...searchOptions } = config;
```

**Key characteristics**:
- API key: `config.apiKey` (per-request) or `process.env.EXA_API_KEY` (default)
- Input schema: `{ query: string }` — only the query is model-controlled; all other parameters (type, numResults, content options) are fixed at tool creation time
- Defaults: 10 results, 3000 chars/result, type "auto", livecrawl "fallback"
- Returns: Raw Exa API JSON response — full `results` array with `title`, `url`, `text`, `publishedDate`, `author`, optional `highlights`, `summary`
- Tool description: *"Search the web for code docs, current information, news, articles, and content. Use this when you need up-to-date information or facts from the internet."*

**Strengths**:
- Self-contained (zero runtime dependencies beyond peer deps)
- Superior search quality — neural/semantic search with SimpleQA benchmarks (~90% accuracy per Exa's evaluation)
- Rich content options (highlights, summaries, livecrawling modes)
- Fine-grained filtering (category, domain, date, text inclusion/exclusion)
- Livecrawl "fallback" mode ensures fresh content for recent pages

**Weaknesses**:
- **Only provides search** — no URL extraction, crawling, or mapping tools
- **Expensive with default settings** — search ($5/1K) + text content ($1/1K pages) + per-result page charges mean effective cost is $0.015/search at default 10 results (see Cost Analysis below)
- **One-time $10 free credit** — not recurring, exhausted after ~667 default searches
- **Model has no runtime control** — search depth, time range, and result count are fixed at tool creation; the LLM can only control the query string
- Returns raw API JSON that may include unnecessary metadata (request IDs, cost breakdowns, filter echoes) consuming context window tokens

### Option B: @tavily/ai-sdk (Tavily)

**Source code analysis** (GitHub: `tavily-ai/ai-sdk`, 3 stars, 2 forks):

The package exports four tool functions: `tavilySearch()`, `tavilyExtract()`, `tavilyCrawl()`, `tavilyMap()`. Each creates a `tavily()` client from `@tavily/core` and returns an AI SDK `tool()` object.

```typescript
// API key handling — from source
const client = tavily({ ...options, clientSource: "ai-sdk" } as TavilyClientOptions);
// apiKey is part of TavilyClientOptions, defaults to process.env.TAVILY_API_KEY
```

**Key characteristics**:
- API key: `config.apiKey` (per-request) or `process.env.TAVILY_API_KEY` (default)
- Input schema: `{ query: string, searchDepth?: "basic"|"advanced"|"fast"|"ultra-fast", timeRange?: "year"|"month"|"week"|"day" }` — the LLM can choose search depth and time range at runtime
- Defaults: basic search depth, 5 results, general topic
- Returns: Structured response from `@tavily/core` with `answer` (optional AI summary), `results` (with URL, title, content, relevance score), `response_time`
- Tool description: *"Search the web for real-time information using Tavily's AI-optimized search engine. Returns relevant sources, snippets, and optional AI-generated answers."*
- `tavilyExtract()` input schema: `{ urls: string[], extractDepth?: "basic"|"advanced" }` — LLM-controlled URL extraction

**Strengths**:
- **Four tools from one dependency** — search + extract + crawl + map. `tavilyExtract()` directly addresses Priority 3 from the research (URL content extraction)
- **Cheaper per search** — $0.008/search (basic, PAYG) with content included in the response; no separate content extraction charges
- **Recurring free tier** — 1,000 credits/month (renewable), no credit card required; critical for self-hosters
- **Model has runtime agency** — search depth and time range are in the input schema, letting the LLM choose "advanced" for complex queries and "basic" for simple lookups
- **Content included in search results** — no hidden charges for text extraction from search results
- `includeAnswer: true` option generates an AI-synthesized answer alongside results
- Backed by Nebius (enterprise scale and stability)
- Transitive dependency `@tavily/core` has 283K weekly npm downloads — strong adoption signal

**Weaknesses**:
- **Lower search quality benchmarks** — Exa reports ~90% vs Tavily ~73-93% on SimpleQA (varies by source and methodology)
- **Transitive dependency** — depends on `@tavily/core`, adding one extra package to the dependency tree
- **Lower GitHub stars** on the AI SDK package specifically (3 vs 35)
- No neural/semantic search mode — uses traditional search optimized for RAG
- No livecrawl equivalent — relies on Tavily's crawling infrastructure for content freshness

### Option C: firecrawl-aisdk (Firecrawl)

**Source code analysis** (npm: `firecrawl-aisdk` v0.8.1, 2.5K weekly downloads; main repo `firecrawl/firecrawl` has 81.6K stars):

Firecrawl is a comprehensive web data platform (scrape, crawl, search, extract, map) that also publishes an AI SDK integration package. Unlike Exa and Tavily, `firecrawl-aisdk` exports **pre-built tool objects** rather than factory functions:

```typescript
// Pre-built objects — NOT configurable factory functions
import { searchTool, scrapeTool, mapTool, crawlTool } from "firecrawl-aisdk";
// Used directly: tools: { search: searchTool }
```

**Key characteristics**:
- API key: `process.env.FIRECRAWL_API_KEY` **only** — no per-request API key parameter
- Nine tool exports: `searchTool`, `scrapeTool`, `mapTool`, `crawlTool`, `batchScrapeTool`, `extractTool`, `pollTool`, `statusTool`, `cancelTool`
- `searchTool` input schema: `{ query, limit?, country?, location?, timeout?, tbs?, sources?, categories?, scrapeOptions? }` — rich but complex; many parameters an LLM is unlikely to use effectively
- Async operations (crawl, batchScrape, extract) require `pollTool` for status checking — adds multi-step complexity
- Depends on `@mendable/firecrawl-js` (full Firecrawl JavaScript SDK, v4.6.1+)
- Search costs 2 credits per 10 results; scrape costs 1 credit per page

**Strengths**:
- **Most comprehensive tool suite** — 9 tools covering scrape, search, crawl, map, extract, and batch operations
- **Best scraping/extraction** — JS-rendered pages via headless browser, structured JSON extraction with schema support, screenshot capability
- **Self-hostable** — open-source core (AGPL-3.0) means self-hosters can run their own Firecrawl instance with zero API cost
- **Massive community** — 81.6K GitHub stars on the main repo; strong ecosystem
- **SOC 2 Type II certified** — enterprise-grade security compliance
- Rich `searchTool` input schema with `sources` (web, news, images) and `categories` (pdf, github, research) filtering

**Weaknesses**:
- **No per-request API key support — DISQUALIFYING for BYOK.** The tools are pre-built objects that read `FIRECRAWL_API_KEY` from the process environment. There is no factory function accepting `apiKey` as a config parameter. To support BYOK, you would need to write a custom wrapper around `@mendable/firecrawl-js`, defeating the purpose of the AI SDK package.
- **Subscription-only pricing** — no pay-as-you-go. After the 500 one-time free credits, minimum $16/month (Hobby). Hostile to casual self-hosters.
- **Search is a secondary feature** — Firecrawl's core identity is web scraping/extraction. Its search endpoint uses traditional search (not neural/semantic), and the quality benchmarks don't compete with Exa or Tavily for search-specific use cases.
- **Overly complex input schema** — `searchTool` exposes `scrapeOptions` with deeply nested parameters (formats, parsers, actions, proxy settings). LLMs will struggle with this complexity or waste tokens on unnecessary parameters.
- **Async crawl/extract operations** — requiring `pollTool` means multi-step agentic loops just to extract a URL, adding latency and token cost
- **Rate limits for search are low** — Free: 5 RPM, Hobby: 50 RPM, Standard: 250 RPM (vs Tavily's 1000 RPM production)
- **AGPL-3.0 core license** — the self-hosted option has copyleft implications that may concern some self-hosters

**Verdict on Firecrawl**: Eliminated due to the lack of per-request API key support. This is a hard requirement for Not A Wrapper's BYOK model. Firecrawl is an excellent *scraping* platform, but for search-as-a-tool in an AI chat app, the integration pattern doesn't fit. If a future version of `firecrawl-aisdk` adds factory functions with API key parameters (matching Exa and Tavily's pattern), this evaluation should be revisited.

### Option D: Mixed (multiple providers)

Using multiple packages (e.g., Exa for search, Tavily for extraction, or Firecrawl for scraping) was considered but rejected:

- **Two or three new dependencies** instead of one
- **Multiple API keys to manage** — more friction for self-hosters and BYOK users
- **Multiple billing relationships** for the platform operator
- **Marginal quality gain** — Tavily's search quality is adequate for a general chat app; the delta doesn't justify the complexity
- Violates the project's bias toward simplicity

**Verdict**: Not recommended. The complexity cost outweighs any quality gain.

## Comparison Matrix

| Criterion | Exa | Tavily | Firecrawl | Winner |
|-----------|-----|--------|-----------|--------|
| AI SDK integration | Factory fn, raw `fetch()` | Factory fn via `@tavily/core` | Pre-built objects | **Exa/Tavily** (tie) |
| Per-request API key (BYOK) | Yes — `webSearch({ apiKey })` | Yes — `tavilySearch({ apiKey })` | **No** — env var only | **Exa/Tavily** (tie) |
| Search quality (general chat) | Highest — neural/semantic, ~90% SimpleQA | Good — RAG-optimized, ~73-93% SimpleQA | Adequate — traditional search | **Exa** |
| Cost at 1K searches/mo | ~$15 (search + content pages) | $8 (PAYG) or $5 (Growth) | $16 (Hobby plan minimum) | **Tavily** |
| Cost at 10K searches/mo | ~$150 | $80 (PAYG) or $50 (Growth) | $83 (Standard plan) | **Tavily** (PAYG), **Firecrawl** (plan) |
| Free tier generosity | $10 one-time ≈ 667 searches | 1,000 credits/month (recurring) | 500 credits one-time ≈ 250 searches | **Tavily** |
| Response format for LLMs | Raw API JSON with metadata | Structured with optional AI answer | Full markdown/HTML page content | **Tavily** |
| Model runtime control | Query only; depth fixed | Query + searchDepth + timeRange | Query + limit + sources + categories | **Tavily** (clean) |
| Latency (typical search) | ~350-500ms p50 | Sub-second (basic) | Variable (includes scraping) | **Tie** (Exa/Tavily) |
| Extra capabilities | Search only | Search + Extract + Crawl + Map | Scrape + Search + Crawl + Map + Extract + Batch | **Firecrawl** |
| Dependency footprint | 0 runtime deps | 1 dep (`@tavily/core`) | 1 dep (`@mendable/firecrawl-js`, heavier) | **Exa** |
| Documentation quality | AI SDK cookbook on ai-sdk.dev | Comprehensive docs.tavily.com | Extensive docs.firecrawl.dev | **Tie** |
| Community/ecosystem | 35 stars (AI SDK pkg) | 283K npm downloads/wk (`@tavily/core`) | 81.6K stars (main repo), 2.5K downloads/wk | **Firecrawl** (main repo) |
| Rate limits (search) | 5 QPS (300 RPM) | 1,000 RPM (prod) | 250 RPM (Standard) | **Tavily** |
| Content freshness | Livecrawl "fallback" (explicit) | Built-in freshness (implicit) | Real-time scraping with headless browser | **Exa** |
| Self-hostable | No | No | Yes (AGPL-3.0 core) | **Firecrawl** |
| Pricing model | Usage-based (PAYG) | Credit-based (PAYG + plans) | Subscription only (no PAYG) | **Tavily** |

**Score** (across all criteria where a clear winner exists):
- Tavily wins 7 criteria (cost, free tier, response format, model control, rate limits, pricing model, ecosystem downloads)
- Exa wins 3 criteria (search quality, dependency footprint, content freshness)
- Firecrawl wins 2 criteria (extra capabilities, self-hostable) but is **eliminated** by the BYOK requirement
- 5 ties

> **Note**: Tavily wins more criteria by count, but this decision weighs **search quality** as the highest-impact factor — it directly affects every user's experience on every search query. Cost and convenience advantages matter less than the quality of the core product.

## Decision

**Select `@exalabs/ai-sdk` (Exa) as the universal search fallback.**

### Top 3 Reasons

1. **Superior search quality is non-negotiable for a chat product.** Exa's neural/semantic search consistently outperforms alternatives on benchmarks (~90% SimpleQA accuracy vs Tavily's ~73-93%). Every search query touches the user's experience directly — better results mean better AI responses, fewer hallucinations, and higher user trust. Not A Wrapper competes with ChatGPT, Claude, and Gemini, all of which have excellent built-in search. The Tier 2 fallback must match that quality bar, not undercut it.

2. **Zero runtime dependencies and self-contained architecture.** Exa's AI SDK package uses raw `fetch()` with no intermediate SDK — the simplest possible integration. No transitive dependency to monitor, no `@tavily/core` versioning concerns, no risk of an intermediate SDK introducing breaking changes. This aligns with the project's bias toward simplicity and minimal dependency footprint.

3. **Best-in-class content freshness via livecrawling.** Exa's explicit `livecrawl: "fallback"` mode ensures that recently published pages are fetched in real-time when the index doesn't have them yet. For a chat app where users ask "What happened today?" or "What's the latest on X?", content freshness is critical. This is a technical capability advantage, not just a marketing claim.

### Why Not Firecrawl?

Firecrawl was **eliminated early** due to a hard-requirement failure: `firecrawl-aisdk` exports pre-built tool objects with no per-request API key support. Not A Wrapper's BYOK model requires injecting user-provided API keys at request time — impossible with Firecrawl's current AI SDK integration. Additionally, Firecrawl's subscription-only pricing (no PAYG, minimum $16/month after 500 one-time credits) and search being a secondary feature behind scraping make it a poor fit for a search-as-fallback use case. Firecrawl remains an excellent choice for applications where *scraping and extraction* are the primary need.

### Why Not Tavily?

Tavily has a more generous free tier (1,000 credits/month recurring vs Exa's $10 one-time), is cheaper per query ($0.008 vs ~$0.015), and bundles extract/crawl/map tools. These are real advantages for cost-sensitive deployments. However:

- **Search quality gap is meaningful.** Independent benchmarks show a 15-20+ percentage point accuracy gap on SimpleQA. For a product competing with ChatGPT and Claude, "good enough" search quality is not good enough.
- **Cost is manageable.** Exa's effective cost of ~$0.01-0.015/search is still inexpensive in absolute terms. At 1K searches/month, that's $10-15 — less than a typical API bill for the LLM calls themselves. The cost delta is small relative to the quality gain.
- **URL extraction can be solved separately.** Priority 3 (URL content extraction) doesn't need to come from the same package as search. A lightweight custom tool using `fetch()` + HTML-to-markdown, or adding Tavily's extract as a separate optional tool for users who want it, keeps the primary search dependency focused on quality.
- **Self-hosters who want free search can use MCP.** Not A Wrapper already has a production MCP system. Self-hosters who can't afford an Exa key can configure a free search MCP server (Exa, Tavily, and others all offer MCP servers). The built-in Tier 2 tool is for the hosted platform and BYOK users who want the best quality.

## Integration Sketch

### Phase B integration into `lib/tools/byok.ts`

```typescript
import type { ToolSet } from "ai"
import { webSearch } from "@exalabs/ai-sdk"

/**
 * Returns third-party BYOK tools based on available API keys.
 * 
 * Key resolution order:
 * 1. User's BYOK key (per-request, from encrypted Convex storage)
 * 2. Platform-level key (from server environment variable)
 * 
 * If neither is available, returns empty ToolSet (no search for this model).
 */
export function getByokTools(
  userApiKeys?: Record<string, string>
): ToolSet {
  const tools: Record<string, unknown> = {}

  // Resolve Exa API key: BYOK > platform-level env
  const exaKey =
    userApiKeys?.EXA_API_KEY || process.env.EXA_API_KEY

  if (exaKey) {
    tools.webSearch = webSearch({
      apiKey: exaKey,
      numResults: 5,
      contents: {
        text: { maxCharacters: 1500 },
        livecrawl: "fallback",
      },
    })
  }

  return tools as ToolSet
}
```

### Integration in `app/api/chat/route.ts`

```typescript
// After built-in provider tools (Phase A), before MCP tools:
let byokTools: ToolSet = {} as ToolSet
if (modelConfig.tools !== false) {
  const { getByokTools } = await import("@/lib/tools/byok")
  // userApiKeys would be loaded from Convex userKeys table (already exists)
  byokTools = getByokTools(userApiKeys)
}

// Merge all tool layers:
const allTools = { ...builtInTools, ...byokTools, ...mcpTools } as ToolSet
```

### Configuration rationale

- `numResults: 5` — reduces per-search cost from $0.015 (10 results) to ~$0.01 while still providing enough context for the LLM
- `text.maxCharacters: 1500` — balances content depth vs context window consumption (default 3000 is generous but wastes tokens on less relevant results)
- `livecrawl: "fallback"` — ensures fresh content for recent pages without the latency cost of always-on livecrawling
- Tool name `webSearch` (not `exaSearch`) — provider-agnostic name; if we ever swap to another provider, tool references in conversations remain stable

## Consequences

### Positive

- **Best available search quality** — neural/semantic search delivers more relevant, accurate results than traditional search APIs, directly improving AI response quality for all Tier 2 models
- **Zero runtime dependencies** — self-contained package using raw `fetch()`. No transitive dependency chain to manage, no intermediate SDK versioning concerns
- **Content freshness via livecrawling** — explicit `livecrawl: "fallback"` mode ensures real-time content for recently published pages
- **Rich content options** — highlights, summaries, category filtering, date filtering — configurable per deployment without code changes
- **BYOK users bring their own Exa key** — fits existing encrypted key storage pattern (`convex/userKeys.ts` + `lib/encryption.ts`)
- **Clean migration path** — provider-agnostic tool name (`webSearch`) means swapping to Tavily or another provider later requires changing one file (`lib/tools/byok.ts`); no conversation history breakage

### Negative

- **Higher cost per search** — ~$0.01-0.015/search (with tuned config) vs Tavily's $0.008. At 10K searches/month, this is ~$100-150 vs $80. Manageable but real.
- **Limited free tier** — $10 one-time credit (~670-1000 searches depending on config) vs Tavily's 1,000/month recurring. Self-hosters who exhaust the free credit must pay or use MCP-based search instead.
- **Search-only package** — URL extraction (Priority 3) must be solved separately. Options: lightweight custom `fetch()` + HTML-to-markdown tool, or add Tavily extract as a secondary optional tool.
- **No model runtime control** — LLM can only control the query string; search depth and result count are fixed at configuration time. Less adaptive than Tavily's model-controllable `searchDepth`/`timeRange`.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Exa cost is too high for hosted platform at scale | Medium | Medium | Tune `numResults` (5 instead of 10) and `maxCharacters` (1500 instead of 3000) to reduce per-search cost to ~$0.01. Provider-specific search (Tier 1) handles the highest-traffic models for free. |
| Self-hosters can't afford Exa after free credits | Medium | Low | Self-hosters can configure a free search MCP server as fallback. Document this in README. BYOK is the primary model. |
| Exa pricing increases or free tier removed | Low | Medium | Provider-agnostic tool names allow swap to Tavily with one file change |
| Exa API outage or quality degradation | Low | Medium | Tier 1 provider-specific search is unaffected. MCP servers provide an alternative search path. |
| No URL extraction tool from same package | Medium | Low | Implement a lightweight custom extract tool using `fetch()` + a markdown conversion library, or add `@tavily/ai-sdk` extract as a secondary optional dependency |

## Cost Projection

### Pricing Models Summary

**Exa** (selected) — Usage-based, pay-as-you-go. Charges separately for search requests ($5/1K) and content retrieval ($1/1K pages per content type). With our tuned config (5 results, 1500 chars) → effective cost = $0.005 + (5 × $0.001) = **$0.01/search**. Default config (10 results, 3000 chars) costs $0.015/search.

**Tavily** — Credit-based with PAYG and monthly plans. Content is included in search results at no extra charge. Basic search: 1 credit ($0.008 PAYG). Advanced search: 2 credits. Basic extract: 1 credit per 5 URLs.

**Firecrawl** — Subscription-only (no PAYG). Search: 2 credits per 10 results. Scrape/crawl: 1 credit per page. No way to pay per-query without a monthly plan.

### Three-Way Cost Comparison

| Scenario | Monthly Searches | Exa (tuned config) | Exa (default config) | Tavily (PAYG) | Firecrawl |
|----------|-----------------|--------------------|--------------------|---------------|-----------|
| Self-hoster (light) | ~500 | **$5.00** | $7.50 | Free (1K tier) | $16/mo (Hobby) |
| Self-hoster (active) | ~2,000 | **$20.00** | $30.00 | $8.00 | $16/mo (Hobby) |
| Hosted platform | ~10,000 | **$100.00** | $150.00 | $80.00 | $83/mo (Standard) |
| Hosted platform (growth) | ~50,000 | **$500.00** | $750.00 | $250.00 (Growth) | $333/mo (Growth) |

**Notes**:
- Exa's tuned config (`numResults: 5`, `maxCharacters: 1500`) reduces per-search cost from $0.015 to **$0.01** — a 33% reduction that closes the gap with Tavily
- At 10K searches/month, the cost delta between Exa (tuned) and Tavily (PAYG) is $20/month — a modest premium for meaningfully better search quality
- Self-hosters get $10 in free Exa credits (~1,000 searches with tuned config) to evaluate. After that, MCP-based search servers remain a free alternative
- Exa offers custom enterprise pricing with volume discounts for higher usage tiers
- Tavily remains cheaper at all tiers, but the absolute costs for Exa are moderate relative to LLM API costs (which dominate the overall bill)
- Firecrawl's subscription model makes it cheapest at very high volume but punitive for light usage

## Appendix: Source Code Evidence

### Per-Request API Key Support (Confirmed for Exa and Tavily; Not Available for Firecrawl)

**Exa** — API key destructured from config at tool creation time, used in `fetch()` header:
```typescript
// @exalabs/ai-sdk/src/index.ts
export function webSearch(config: ExaSearchConfig = {}) {
  const { apiKey = process.env.EXA_API_KEY, ...searchOptions } = config;
  return tool({
    // ...
    execute: async ({ query }) => {
      // apiKey is captured in closure
      headers: { "x-api-key": apiKey }
    }
  });
}
```

**Tavily** — API key passed through to `@tavily/core` client constructor:
```typescript
// @tavily/ai-sdk/src/tools/tavily-search.ts
export const tavilySearch = (options: TavilySearchOptions = {}) => {
  const client = tavily({ ...options, clientSource: "ai-sdk" });
  return tool({
    // ...
    execute: async ({ query, searchDepth, timeRange }) => {
      return await client.search(query, { ...options, searchDepth, timeRange });
    }
  });
};
```

Both create the tool closure with the API key baked in. Since `route.ts` constructs tools per-request, calling `tavilySearch({ apiKey: byokKey })` in the request handler achieves per-request key injection without any workarounds.

**Firecrawl** — pre-built tool objects with NO API key parameter:
```typescript
// firecrawl-aisdk/dist/index.d.ts — tools are typed as ai.Tool<InputSchema, OutputSchema>
declare const searchTool: ai.Tool<{ query: string; limit?: number; ... }, SearchData>;
declare const scrapeTool: ai.Tool<{ url: string; formats?: ...; ... }, Document>;
// No factory function, no config parameter, no apiKey option
// Usage: import { searchTool } from "firecrawl-aisdk"; tools: { search: searchTool }
```

The package internally creates a `@mendable/firecrawl-js` client that reads `process.env.FIRECRAWL_API_KEY` at execution time. There is no way to inject a different key per request. Workaround would require writing a custom tool wrapper around `@mendable/firecrawl-js` directly, negating the value of the AI SDK package.

### Input Schema Comparison

**Exa** — model controls only the query:
```typescript
inputSchema: z.object({
  query: z.string().min(1).max(500).describe("The web search query")
})
```

**Tavily** — model controls query, search depth, and time range:
```typescript
inputSchema: z.object({
  query: z.string().describe("The search query to look up on the web"),
  searchDepth: z.enum(["basic", "advanced", "fast", "ultra-fast"]).optional()
    .describe("The depth of the search"),
  timeRange: z.enum(["year", "month", "week", "day"]).optional()
    .describe("Time range for search results")
})
```

**Firecrawl** — model controls query plus many optional parameters:
```typescript
inputSchema: z.object({
  query: z.string(),
  limit: z.number().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  timeout: z.number().optional(),
  tbs: z.string().optional(),
  sources: z.array(z.object({ type: z.enum(["web", "news", "images"]), ... })).optional(),
  categories: z.array(z.object({ type: z.enum(["pdf", "github", "research"]) })).optional(),
  scrapeOptions: z.object({ formats: ..., parsers: ..., actions: ..., proxy: ..., ... }).optional(),
})
```

Firecrawl's schema is the most expressive but also the most complex. The deeply nested `scrapeOptions` parameter (with sub-options for formats, parsers, browser actions, proxy settings) is unlikely to be used effectively by LLMs in a chat context. Tavily's `searchDepth` + `timeRange` strikes the best balance: meaningful LLM agency without overwhelming parameter complexity.

---

*Research methodology: GitHub source code analysis (all three repos), official pricing pages (exa.ai/pricing, tavily.com/pricing, firecrawl.dev/pricing), npm package type definitions (firecrawl-aisdk via CDN), provider documentation, independent comparisons (HumAI, SearchMCP, Apify, data4ai), npm registry data, and the project's existing tool-calling research document.*
