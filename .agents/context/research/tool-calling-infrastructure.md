# Tool Calling Infrastructure Research

> **Date**: February 11, 2026
> **Status**: ✅ Research Complete
> **Scope**: Industry analysis of tool calling patterns for AI chat applications
> **Related**: `.agents/plans/tool-calling-infrastructure-research.md` (research prompt)

> [!NOTE]
> ## Review Notes (February 2026)
>
> **Reviewer**: Automated audit agent
> **Methodology**: Codebase file reads (10 files), web verification (12+ searches), official AI SDK docs fetch (3 provider pages)
>
> ### Completeness
> - [x] **Section 2 (API-as-a-Tool Providers)**: All three providers (Exa, Tavily, Firecrawl) have API structure, pricing, AI SDK integration with code examples, MCP server availability, and differentiating characteristics. *(One issue: the `firecrawl-aisdk` package name could not be verified on npm — see Accuracy Issues below.)*
> - [x] **Section 3 (Platform Architectures)**: ChatGPT, Claude, Gemini, and Vercel AI SDK all have built-in tools listed, extensibility mechanism, tool approval model, and architecture pattern summary.
>   - *Minor gap*: The original prompt asked about "v0 / Vercel Chat" as a separate research question, but the document does not have a dedicated subsection for it. This was implicitly folded into Section 3.4 (Vercel AI SDK). Not blocking but worth noting.
> - [x] **Section 4 (Industry Patterns)**: Each subsection identifies a consensus level (universal/emerging) and provides evidence from multiple platforms.
> - [x] **Section 5 (Gap Analysis)**: Strengths and weaknesses are highly specific to the codebase with accurate file paths and line numbers. Comparison matrix is complete with no empty cells.
> - [x] **Section 6 (Recommendations)**: Recommendations are prioritized (P0-P3). Effort estimates include file-level specificity. Implementation roadmap is phased with dependencies between phases documented.
> - [x] **Section 7 (Appendix)**: Code examples use AI SDK v6 patterns (`stopWhen: stepCountIs()`, `ToolSet` type). Reference links are real URLs from official domains (verified by domain inspection; not all 40+ links individually fetched).
>
> ### Accuracy Issues
>
> **1. `firecrawl-aisdk` package name — UNVERIFIED (Section 2.3, 2.4, 3.4, 7.1)**
> Multiple npm searches did not find a package named `firecrawl-aisdk`. The published Firecrawl packages on npm are `@mendable/firecrawl` (v4.11.4) and `@mendable/firecrawl-js` (v4.12.0). The Firecrawl docs do describe Vercel AI SDK tool integration, but the tool exports (`scrapeTool`, `searchTool`, etc.) may come from the main SDK package rather than a separate `firecrawl-aisdk` package. **Before implementing, verify the correct package name by checking `npm info firecrawl-aisdk` or the Firecrawl Vercel AI SDK docs page.**
>
> **2. `anthropic.tools.webSearch_20250305()` identifier — UNVERIFIED (Sections 3.4, 5.2, 6.1, 7.1)**
> The Anthropic AI SDK provider page (ai-sdk.dev) documents these tools: `bash_20250124`, `bash_20241022`, `memory_20250818`, `textEditor_20250728`, `textEditor_20250124`, `textEditor_20241022`, `computer_20251124`, `computer_20250124`. The page was truncated before reaching a web search section. The date suffix `_20250305` (March 5, 2025) predates Anthropic's web search announcement (May 7, 2025), making it suspect. The Anthropic native API's `web_search` tool is confirmed, and the AI SDK likely wraps it (consistent with the pattern for other Anthropic tools), but the **exact identifier may differ** (e.g., `webSearch_20250507` or another date). **Verify before implementing by checking the `@ai-sdk/anthropic` package exports or the full AI SDK Anthropic provider docs page.**
>
> **3. The research document describes truncation via `truncatePreview()` (Section 5.1) — ACCURATE but the truncation in `route.ts` is done inline**
> The research correctly identifies truncation to 500 characters in `convex/mcpToolCallLog.ts` via the `truncatePreview()` helper. However, in `route.ts:387-389`, truncation is done inline with `.slice(0, 500)` — the `truncatePreview()` function is only used inside the Convex mutation handler (lines 70-74), not in the route. Both truncate to 500 chars but via different mechanisms. This is a minor clarification, not an error.
>
> ### Accuracy Confirmations (High-Priority Claims Verified)
>
> - **`openai.tools.webSearch({})`** — CONFIRMED. AI SDK OpenAI provider page shows this exact API with configuration options (`searchContextSize`, `userLocation`, `filters`). Also confirmed: `openai.tools.fileSearch()`, `openai.tools.imageGeneration()`, `openai.tools.codeInterpreter()`, `openai.tools.mcp()`.
> - **`google.tools.googleSearch({})`** — CONFIRMED. AI SDK Google provider page shows `google.tools.googleSearch({})` with configuration options (`mode`, `dynamicThreshold`). Also confirmed: `google.tools.codeExecution({})`, `google.tools.urlContext({})`, `google.tools.fileSearch({})`.
> - **`gateway.tools.perplexitySearch()`** — CONFIRMED. Imported from `"ai"` package. Pricing confirmed at $5/1K requests. Vercel docs also show import from `"@ai-sdk/gateway"`.
> - **`stopWhen: stepCountIs(n)` replaces `maxSteps`** — CONFIRMED. AI SDK v6 docs and loop control page confirm this. Default is `stepCountIs(20)`.
> - **`prepareStep` callback** — CONFIRMED. AI SDK agents docs confirm async callback receiving `stepNumber`, `messages`, etc., with ability to override `model`, `tools`, `activeTools` per step.
> - **`@exalabs/ai-sdk`** — CONFIRMED. GitHub: `exa-labs/ai-sdk`. Exports `webSearch()`. Reads `EXA_API_KEY` from environment.
> - **`@tavily/ai-sdk`** — CONFIRMED. GitHub: `tavily-ai/ai-sdk`. Exports `tavilySearch()`, `tavilyExtract()`, `tavilyCrawl()`, `tavilyMap()`.
> - **Exa pricing ($5/1K search requests)** — CONFIRMED. Exa pricing page shows $5/1K for Fast/Auto/Neural search (1-25 results).
> - **Tavily pricing (free tier 1,000 credits/month, $0.008/credit PAYG)** — CONFIRMED.
> - **All codebase line numbers and variable names** — CONFIRMED. Every file reference in Sections 5.1 and 5.2 was verified against the actual codebase. Line numbers, variable names, constant values, and logic descriptions are accurate.
> - **`serverId` is a required field in `mcpToolCallLog`** — CONFIRMED. `convex/schema.ts:161` shows `serverId: v.id("mcpServers")` (not `v.optional`).
> - **Provider package versions** — CONFIRMED. `package.json` shows `@ai-sdk/openai: ^3.0.26`, `@ai-sdk/anthropic: ^3.0.41`, `@ai-sdk/google: ^3.0.24` — all match the document.
>
> ### Attention Items for Project Owner
>
> 1. **[Cost Implication]**: The "zero-cost quick win" framing (Section 6.1, Priority 1) is accurate regarding setup cost (zero new dependencies, zero new API keys) but may understate marginal cost. Provider web search tools (OpenAI, Anthropic, Google) add per-request charges billed through the provider's API — they are not free to invoke. OpenAI web search has a `searchContextSize` option that affects cost. Anthropic web search costs are usage-based. Google Search grounding billing started January 5, 2026. Recommend clarifying "zero setup cost" vs "zero marginal cost" when presenting to stakeholders.
>
> 2. **[Verify Before Implementing]**: Two package/API identifiers could not be confirmed — `firecrawl-aisdk` and `anthropic.tools.webSearch_20250305()`. For Phase A implementation, this affects the Anthropic provider tool specifically. Recommend verifying the exact `@ai-sdk/anthropic` export name before coding `lib/tools/provider.ts`. The OpenAI and Google tools are fully confirmed and can proceed immediately.
>
> 3. **[Architectural Decision Required]**: Phase B (Section 6.3) requires choosing between Exa and Tavily for universal search fallback. Key tradeoffs: Exa has stronger semantic search quality and livecrawling; Tavily has a more generous free tier (1,000 credits/month vs Exa's one-time $10 credit) and broader capability set (search + extract + crawl + map). Tavily's credit-based pricing is simpler to explain to self-hosters. Neither package is currently in `package.json` — this is the only new dependency decision.
>
> 4. **[Security Consideration]**: Phase C recommends removing the `ENABLE_MCP=true` gate (Section 6.3). This is a deployment-level decision, not just a code change. Currently the flag protects against unexpected MCP behavior in production. If built-in tools are added first (Phase A), the gate becomes less critical since users get tools without MCP. However, removing it for self-hosters means MCP is always available for authenticated users — ensure the existing security layers (URL validation, DNS rebinding guard, circuit breaker, approval system) are sufficient before removing.
>
> 5. **[Missing from Research]**: The original prompt specifically asked about "v0 / Vercel Chat: How does Vercel's own v0 product handle tool calling internally?" The research document does not address this as a separate analysis point. This is a minor gap — v0's internal architecture is likely not publicly documented — but worth noting if competitive intelligence on Vercel's own product was desired. **(Resolved — see Section 3.5)**
>
> 6. **[Edge Case Not Addressed]**: Section 6.2 proposes `lib/tools/provider.ts` with `getProviderTools(providerId)`, but doesn't address what happens when the provider API key is missing. Currently, `route.ts:142-163` validates API key availability before model creation. If built-in tools try to invoke `openai.tools.webSearch({})` but no OpenAI key exists, the provider SDK will throw a 401. The implementation should either: (a) check key availability before including provider tools, or (b) let the error propagate and be handled by the existing error path. Recommend option (a) for a clean UX. **(Resolved — see Section 6.2)**
>
> 7. **[`gateway` Import Path]**: Web verification found two import paths for `gateway`: `import { gateway } from "ai"` (shown in Vercel docs) and `import { gateway } from "@ai-sdk/gateway"` (shown in Vercel blog posts). The research document uses `from "ai"` in Section 7.1 code examples. Both may work, but implementers should verify which is canonical in the installed `ai` package version (^6.0.78). **(Resolved — see Section 7.1)**
>
> ### Suggested Corrections
>
> 1. **Section 2.3**: Add a note that the `firecrawl-aisdk` package name needs verification. The correct package may be `@mendable/firecrawl-js` with tool exports, or a separate package under a different name. Update the comparison table (Section 2.4) accordingly if the name changes.
>
> 2. **Sections 3.4 and 6.1**: Add a note that `anthropic.tools.webSearch_20250305()` identifier needs verification against the actual `@ai-sdk/anthropic` package exports. The date suffix may differ from `_20250305`.
>
> 3. **Section 6.1 "zero-cost quick win"**: Consider rephrasing to "zero-setup quick win" to avoid confusion about marginal API costs. Add a brief note about per-request costs for provider search tools.
>
> 4. **Section 6.2 code example**: Add an API key availability check before including provider tools in `getProviderTools()`, or document that errors will be handled by the existing error path in route.ts.
>
> ### Overall Assessment
>
> This is a high-quality, thorough research document that is **ready to be used for implementation planning with the caveats noted above**. The codebase analysis is exceptionally accurate — every file path, line number, variable name, and architectural description was verified against the actual code. The industry analysis is comprehensive and well-sourced. The two unverified package/API identifiers (`firecrawl-aisdk`, `anthropic.tools.webSearch_20250305()`) are easy to resolve before implementation and do not undermine the document's strategic recommendations. Phase A (provider-specific web search for OpenAI and Google) can proceed immediately with confirmed APIs; the Anthropic tool identifier should be verified first.

---

## 1. Executive Summary

- **The industry has converged on a hybrid model**: Every major AI chat platform (ChatGPT, Claude, Gemini) offers a curated set of built-in tools (web search, code execution, image generation) alongside user-extensible tool systems. Not A Wrapper's MCP-only approach is an outlier.
- **Web search is table stakes**: All competing platforms ship web search as a zero-configuration, built-in capability. Not A Wrapper currently requires users to configure an MCP server to get web search — the single highest-friction gap.
- **The Vercel AI SDK v6 has first-class support for both built-in and MCP tools**: Provider-specific tools (`openai.tools.webSearch()`, `anthropic.tools.webSearch_20250305()`, `google.tools.googleSearch()`), gateway tools (`gateway.tools.perplexitySearch()`), third-party tool packages (`@exalabs/ai-sdk`, `@tavily/ai-sdk`, `firecrawl-aisdk`), and MCP tools (`createMCPClient`) all coexist in the same `tools` parameter of `streamText`/`generateText`. The SDK is architected for hybrid tool architectures.
- **MCP is gaining adoption but is not yet universal**: As of early 2026, MCP is supported by Claude, OpenAI (Responses API), Cursor, VS Code, and many developer tools, but production deployment still requires solving orchestration, security, and connection management challenges.
- **Highest-impact recommendation**: Add provider-specific web search tools (`openai.tools.webSearch()`, `anthropic.tools.webSearch_20250305()`, `google.tools.googleSearch()`) as zero-configuration built-in tools. These require zero new dependencies — the packages are already installed (`@ai-sdk/openai` ^3.0.26, `@ai-sdk/anthropic` ^3.0.41, `@ai-sdk/google` ^3.0.24). This gives ~30 models instant web search with a ~15-line change to `app/api/chat/route.ts`. Third-party packages (`@exalabs/ai-sdk`, `@tavily/ai-sdk`) can then provide universal search for the remaining providers.

---

## 2. API-as-a-Tool Provider Analysis

### 2.1 Exa.ai

**Overview**: Exa.ai is a web search API designed specifically for AI agents and RAG applications. Unlike traditional search APIs that return ranked lists of URLs, Exa uses embeddings-based "meaning search" to return semantically relevant results with full page content — structured for direct LLM consumption.

**What makes it "AI-native"**:
- Results include cleaned, parsed page text (not raw HTML), truncated to configurable character limits per result
- Supports neural/semantic search (`type: "auto"`, `"neural"`, `"deep"`) alongside traditional keyword search
- Per-result AI-generated summaries via `summary: true`
- Livecrawling with fallback ensures fresh content even for recently published pages
- Category filtering (company, news, research paper, github, PDF, etc.) narrows results for domain-specific queries
- Content extraction returns structured text, highlights, subpages, links, and image links

**API structure**:
- Core endpoints: `POST /search`, `POST /contents`, `POST /answer`, `POST /research`
- Authentication: Bearer token via `EXA_API_KEY`
- Rate limits: /search 5 QPS, /contents 50 QPS, /answer 5 QPS, /research 15 concurrent tasks

**Pricing model** (usage-based):
- Search: $5 per 1,000 requests
- Contents: $1 per 1,000 pages (text), $1 per 1,000 (highlights), $1 per 1,000 (summaries)
- Answer: $5 per 1,000 answers
- Research: $5 per 1,000 agent searches + $5 per 1,000 page reads + $5 per 1M reasoning tokens
- Free tier: $10 in credits, no credit card required

**Vercel AI SDK integration** (`@exalabs/ai-sdk`):
- NPM package: `@exalabs/ai-sdk` (published by Exa Labs, MIT licensed)
- Exports a `webSearch()` function that returns an AI SDK-compatible `tool()` object
- Reads `EXA_API_KEY` from environment automatically
- Highly configurable: `type`, `numResults`, `category`, `contents`, `includeDomains`, `excludeDomains`, date filters, text filters, livecrawl settings
- Full TypeScript types included (`ExaSearchConfig`, `ExaSearchResult`)

```typescript
// Exa web search as a Vercel AI SDK tool
import { generateText, stepCountIs } from "ai";
import { webSearch } from "@exalabs/ai-sdk";

const { text } = await generateText({
  model: "anthropic/claude-sonnet-4.5",
  prompt: "Tell me the latest developments in AI",
  tools: { webSearch: webSearch() },
  stopWhen: stepCountIs(3),
});
```

**MCP server**:
- Exa provides an open-source MCP server (`exa-labs/exa-mcp-server`) and a hosted endpoint at `https://mcp.exa.ai/mcp`
- Supported by Cursor, VS Code, Claude Desktop, Codex, Gemini CLI, v0, and other MCP clients
- Tools exposed: web search, code search, company research

**OpenAI SDK compatibility**:
- Exa also exposes OpenAI-compatible endpoints (`/chat/completions`, `/responses`) as a drop-in replacement for OpenAI's API, routing to their `/answer` or `/research` endpoints as appropriate

### 2.2 Tavily

**Overview**: Tavily is a search API optimized for AI agents and LLMs, offering real-time web search, content extraction, site crawling, and site mapping. It positions itself as purpose-built for agentic workflows with clean, structured responses.

**What makes it "AI-native"**:
- Responses are structured JSON with `answer` (AI-generated direct answer), `results` (with URL, title, content, score), and `response_time`
- Supports `topic` filtering: `"general"`, `"news"`, `"finance"`
- `searchDepth` modes: `"basic"` (fast, 1 credit) and `"advanced"` (comprehensive, 2 credits)
- `includeAnswer: true` generates a synthesized answer alongside search results
- Time range filtering: `"day"`, `"week"`, `"month"`, `"year"`
- Domain inclusion/exclusion for targeted searches

**API structure**:
- Core endpoints: `POST /search`, `POST /extract`, `POST /crawl`, `POST /map`, `POST /research`
- Authentication: Bearer token via `TAVILY_API_KEY`
- SDKs: Python (`tavily-python`), JavaScript (`@tavily/core`)

**Pricing model** (credit-based):
- Free tier: 1,000 API credits/month
- Pay-as-you-go: $0.008 per credit
- Monthly plans: Project ($30/4K credits), Bootstrap ($100/15K credits), Startup ($220/38K credits), Growth ($500/100K credits)
- Credit costs: Basic search = 1 credit; Advanced search = 2 credits; Extract = 1 credit per 5 URLs
- Student program: free access

**Vercel AI SDK integration** (`@tavily/ai-sdk`):
- NPM package: `@tavily/ai-sdk`
- Exports four tool functions: `tavilySearch()`, `tavilyExtract()`, `tavilyCrawl()`, `tavilyMap()`
- Each returns an AI SDK-compatible tool object
- Reads `TAVILY_API_KEY` from environment automatically
- Documented as compatible with "AI SDK v5" (works with v6 as well)

```typescript
// Tavily tools for Vercel AI SDK
import { tavilySearch, tavilyExtract, tavilyCrawl, tavilyMap } from "@tavily/ai-sdk";
import { generateText, stepCountIs } from "ai";

const result = await generateText({
  model: "openai/gpt-5-mini",
  prompt: "Research the company at tavily.com",
  tools: {
    tavilySearch: tavilySearch({ searchDepth: "advanced" }),
    tavilyExtract: tavilyExtract(),
    tavilyCrawl: tavilyCrawl(),
    tavilyMap: tavilyMap(),
  },
  stopWhen: stepCountIs(5),
});
```

**MCP server**:
- Published as `@tavily/mcp` on NPM and on GitHub (`tavily-ai/tavily-mcp`)
- Tools: `tavily_web_search`, `tavily_answer_search`, `tavily_news_search`, `extract`
- Compatible with Claude Desktop, Cursor, and other MCP clients

**Comparison to Exa**:
- Tavily is more focused on breadth of capabilities (search + extract + crawl + map) while Exa focuses on depth of search quality (neural/semantic search, embeddings)
- Tavily's credit-based pricing is simpler to understand; Exa's usage-based pricing is more granular
- Both offer AI SDK packages and MCP servers
- Tavily's `tavilySearch` supports `topic` and `timeRange` filters that Exa handles through `category` and date filters
- Exa has stronger livecrawling and content freshness guarantees

### 2.3 Firecrawl

**Overview**: Firecrawl positions itself as "The Web Data API for AI" — a comprehensive web scraping, crawling, searching, and structured extraction platform designed for AI agent consumption. It goes beyond search into deep content extraction and site mapping.

**Core capabilities**:
- **Scrape**: Convert any single URL to clean markdown/text for LLM consumption
- **Crawl**: Crawl entire websites with configurable depth and breadth limits
- **Search**: Web search with full page content returned (2 credits per 10 results)
- **Map**: Discover and list all URLs on a website
- **Extract/Agent**: Schema-driven structured data extraction using LLMs (the "Agent" successor finds sources automatically)

**What differentiates it**:
- Firecrawl is the only provider that handles JavaScript-rendered pages via headless browser infrastructure
- Structured extraction with JSON schema support — define the output shape and Firecrawl extracts matching data
- Batch operations for processing multiple URLs concurrently
- Async jobs with polling for long-running crawl/extract operations
- Open-source core (`firecrawl/firecrawl` on GitHub) with cloud and self-hosted options

**API structure**:
- v2 endpoints: `POST /scrape`, `POST /batch-scrape`, `POST /crawl`, `POST /map`, `POST /search`, `POST /extract`, `POST /agent`
- Authentication: Bearer token via `FIRECRAWL_API_KEY`
- SDKs: Python, JavaScript/TypeScript, Go, Rust

**Pricing model** (credit-based, subscription):
- Free: 500 credits (one-time), 2 concurrent requests
- Hobby: 3,000 credits/month, $9 per extra 1K credits
- Standard: 100,000 credits/month, $47 per extra 35K credits ($129/month)
- Growth: 500,000 credits/month ($499/month)
- Scale: 1,000,000 credits/month ($599/month billed yearly)
- Credit costs: Scrape/Crawl/Map = 1 credit/page; Search = 2 credits per 10 results

**Vercel AI SDK integration** (`firecrawl-aisdk`):
- NPM package: `firecrawl-aisdk`
- Exports pre-built tool objects (not factory functions): `scrapeTool`, `searchTool`, `mapTool`, `crawlTool`, `batchScrapeTool`, `extractTool`, `pollTool`, `statusTool`, `cancelTool`
- Tools are directly importable and passable to `streamText`/`generateText`
- Async operations (crawl, batch-scrape, extract) require including `pollTool` for status checking

```typescript
// Firecrawl tools for Vercel AI SDK
import { generateText } from "ai";
import { searchTool, scrapeTool } from "firecrawl-aisdk";

const { text } = await generateText({
  model: "openai/gpt-5-mini",
  prompt: "Search for Firecrawl, scrape the top result, and explain what it does",
  tools: { search: searchTool, scrape: scrapeTool },
});
```

**MCP server**:
- Firecrawl provides an MCP server at `firecrawl-mcp` (NPM package, also via `npx`)
- Tools: scrape, search, map, crawl, batch-scrape, extract, stream
- Supports SSE/HTTP transports, rate limiting, retries, cloud and self-hosted deployment

### 2.4 Common Patterns Across Providers

All three providers share a consistent integration architecture:

| Pattern | Exa | Tavily | Firecrawl |
|---------|-----|--------|-----------|
| **AI SDK package** | `@exalabs/ai-sdk` | `@tavily/ai-sdk` | `firecrawl-aisdk` |
| **Export style** | Factory function (`webSearch()`) | Factory functions (`tavilySearch()`, etc.) | Pre-built tool objects (`searchTool`, etc.) |
| **MCP server** | Yes (hosted + open-source) | Yes (NPM + GitHub) | Yes (NPM + self-hostable) |
| **Dual SDK+MCP** | Yes | Yes | Yes |
| **Env var auto-read** | Yes (`EXA_API_KEY`) | Yes (`TAVILY_API_KEY`) | Yes (`FIRECRAWL_API_KEY`) |
| **TypeScript types** | Full | Full | Full |
| **OpenAI compatibility** | Yes (drop-in endpoints) | No | No |

**Key shared patterns**:

1. **Pre-built Vercel AI SDK `tool()` wrappers**: All three publish NPM packages that export tools directly compatible with `streamText({ tools })` and `generateText({ tools })`. This eliminates the need for developers to write Zod schemas or `execute` functions.

2. **MCP servers as a parallel integration channel**: All three also publish MCP servers, offering two independent integration paths. The AI SDK packages are better for programmatic/server-side integration; MCP servers are better for IDE and desktop app integrations.

3. **Environment variable convention**: All use a `*_API_KEY` environment variable that their packages read automatically, matching the Vercel AI SDK provider convention.

4. **LLM-optimized response formats**: All return cleaned, structured text (not raw HTML) with metadata (titles, URLs, dates, scores) designed for LLM context windows.

5. **Configurable depth vs. cost tradeoffs**: All offer basic vs. advanced modes that trade API credits for more thorough results.

---

## 3. Platform Architecture Comparison

### 3.1 ChatGPT (OpenAI)

**Built-in tools** (available in ChatGPT and via the Responses API):
- **Web search**: Real-time web search integrated into all models. In the API: `{ type: "web_search" }` in the `tools` array. Configurable with `searchContextSize` ("low", "medium", "high") for cost/quality tradeoff.
- **Code interpreter**: Sandboxed Python execution environment. Runs model-generated code, returns results and files. In the API: `{ type: "code_interpreter" }`.
- **Image generation**: GPT Image model for generating and editing images. In the API: `{ type: "image_generation" }`.
- **File search**: Vector-based search over uploaded files using vector stores. In the API: `{ type: "file_search", vector_store_ids: [...] }`.
- **Computer use**: Agent-controlled browser/computer interaction for agentic workflows.
- **Shell**: Run shell commands in hosted containers or local runtime.
- **Apply patch**: Structured diffs for code modification.
- **Skills**: Versioned skill bundles for reuse.

**User-configured tools (function calling)**:
- Developers define functions with JSON Schema parameters and register them in API requests
- Model returns structured function calls with validated JSON arguments
- `strict: true` mode guarantees arguments match the schema exactly (Structured Outputs)
- Developer executes the function and feeds the result back to the model

**Remote MCP servers** (in the Responses API):
- Native MCP support: `{ type: "mcp", server_url: "https://...", require_approval: "never" }` directly in the `tools` array
- The Responses API connects to remote MCP servers, discovers tools, and makes them available to the model
- Approval policies: `"never"`, `"always"`, or per-tool configuration

**GPT Actions** (in ChatGPT product):
- OpenAPI specification-based tool definitions
- Developers provide an OpenAPI YAML/JSON spec, and ChatGPT converts endpoints into callable actions
- Authentication support: OAuth, API key, service-level
- Used in custom GPTs and the ChatGPT Actions marketplace

**Tool approval model**:
- Built-in tools: pre-approved, no user consent needed
- Function calling: developer-controlled, runs in developer's infrastructure
- Remote MCP: configurable approval policies (`require_approval`)
- GPT Actions: reviewed during GPT publication process

**Architecture pattern**: OpenAI uses a **three-tier model**: (1) platform-managed built-in tools with zero configuration, (2) developer-defined function calling for custom logic, (3) remote MCP for third-party service integration. All three types coexist in the same `tools` array in the Responses API.

### 3.2 Claude (Anthropic)

**Built-in tools (server-side)**:
- **Web search** (`web_search`): Real-time web search with source citations. Configurable with `maxUses`, `allowedDomains`, `blockedDomains`, `userLocation`.
- **Code execution**: JavaScript execution in the Analysis tool (claude.ai product) and Python/JS execution via API.
- **Bash tool** (`bash`): Shell command execution for agent workflows.
- **Text editor** (`text_editor`): File viewing and editing tool for coding agents.
- **Web fetch** (`web_fetch`): HTTP requests to retrieve web content.
- **Computer use** (`computer`): Desktop interaction via screenshots and mouse/keyboard control.
- **Memory**: Persistent memory across conversations.

**Artifacts** (claude.ai product):
- Claude generates standalone content (code, documents, SVGs, React components) rendered in a sidebar
- Artifacts are versioned, editable, downloadable
- Available on all plans (Free/Pro/Max/Team/Enterprise)

**API-level tool use**:
- Tools are defined with `name`, `description`, and `input_schema` (JSON Schema) in the API request
- Model returns `tool_use` content blocks with `name` and `input`
- Developer executes the tool and returns a `tool_result` content block
- Supports streaming tool use with fine-grained tool streaming

**MCP integration**:
- Claude Desktop and Claude Code support MCP server connections
- MCP Connector feature allows connecting Claude to external services via MCP
- API supports MCP through the standard tool-calling mechanism (developer manages MCP client)

**Tool result format**:
- Tool results are `content` arrays containing `text` and/or `image` blocks
- Supports `is_error: true` for indicating tool failures
- Streaming behavior: tool calls and results can be streamed incrementally with `fine-grained tool streaming`

**Architecture pattern**: Anthropic uses a **two-tier model**: (1) built-in server tools (web search, bash, text editor, web fetch, code execution, computer use) that are activated by including them in the API request, (2) developer-defined tools with full JSON Schema definitions. MCP is supported as a client-side integration pattern rather than as a first-class API-level feature.

### 3.3 Gemini (Google)

**Grounding with Google Search**:
- Enables the `google_search` tool to connect models to real-time web results
- Model auto-generates search queries, synthesizes results, and returns grounded responses
- `groundingMetadata` includes search queries, web results, and citations for verification
- Billing for Gemini 3 grounding started January 5, 2026

**Code execution**:
- Built-in `code_execution` tool runs Python code generated by the model
- Returns executable code and execution results to the model
- Supports iterative code-based reasoning (model can run code, see results, and iterate)
- Python only; max ~30s runtime; no file I/O in some environments
- Enabled by adding a `code_execution` tool in the `GenerateContent` request

**Function calling**:
- Similar to OpenAI: developers declare function signatures with JSON Schema parameters via `tools/function_declarations`
- Model returns `function_call` objects with name and arguments
- Developer executes and returns `function_response`
- Supports `ANY` (force tool call), `NONE` (disable), and `AUTO` (model decides) modes

**Extensions architecture** (Google AI / Vertex AI):
- Pre-built extensions for Google services (Google Search, Google Maps, Google Flights, Google Hotels)
- Extensions are Google-managed, server-side integrations
- Users can enable/disable extensions per request

**Gemini CLI tools**:
- The Gemini CLI defines a `Tool` interface with `name`, `description`, `parameterSchema`, `execute`, etc.
- Built-in CLI tools: file operations, shell commands, web fetch, search
- `ToolRegistry` for discovering and managing tools

**Architecture pattern**: Google uses a **three-tier model** similar to OpenAI: (1) built-in grounding tools (Google Search, code execution) as first-class features, (2) function calling for developer-defined tools, (3) extensions for Google service integrations.

### 3.4 Vercel AI SDK — Canonical Patterns

The Vercel AI SDK v6 (released December 22, 2025) provides the canonical tool-calling framework used by Not A Wrapper. Understanding its patterns deeply is critical for architecture decisions.

**`tool()` definition**:
```typescript
import { tool } from "ai";
import { z } from "zod";

const weatherTool = tool({
  description: "Get the weather in a location",
  inputSchema: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});
```

Key properties:
- `description`: Influences when the model picks the tool
- `inputSchema`: Zod schema (or JSON Schema via `jsonSchema()`) for input validation
- `execute`: Optional async function — omit to forward tool calls to client
- `strict`: Enable provider-level schema validation (when supported)
- `needsApproval`: Boolean or async function for tool execution approval

**`streamText` with tools**:
```typescript
const result = streamText({
  model: "anthropic/claude-sonnet-4.5",
  tools: { weather: weatherTool },
  stopWhen: stepCountIs(5),
  prompt: "What is the weather in San Francisco?",
});
```

**`stopWhen` (replaces `maxSteps`)**:
- Controls the agentic loop: `stepCountIs(n)` stops after `n` steps when tools are called
- Without `stopWhen`, the model generates one step only (no tool result follow-up)
- The stopping condition is only evaluated when the last step contains tool results

**`onStepFinish` callback**:
```typescript
onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
  // Custom logic per step: logging, approval, context switching
}
```

**`prepareStep` callback** (new in v6):
```typescript
prepareStep: async ({ model, stepNumber, steps, messages }) => {
  if (stepNumber === 0) {
    return {
      model: differentModel,          // Switch models per step
      toolChoice: { type: "tool", toolName: "tool1" }, // Force tool
      activeTools: ["tool1"],          // Restrict available tools
    };
  }
}
```

This is powerful for:
- Restricting `activeTools` per step (minimize attack surface)
- Forcing specific tool calls on certain steps
- Swapping models mid-loop (e.g., cheaper model for tool planning, better model for synthesis)
- Message compression for long loops

**Tool execution approval** (`needsApproval`):
- When `true`, `generateText`/`streamText` return `tool-approval-request` parts instead of executing
- Application collects user approval, sends `tool-approval-response`, and calls model again
- Supports dynamic approval via async function: `needsApproval: async ({ amount }) => amount > 1000`

**Dynamic tools** (`dynamicTool`):
- For tools with schemas unknown at compile time (MCP tools, user-defined functions)
- Input/output typed as `unknown`; runtime validation required

**Preliminary tool results** (generator functions):
- Tools can `yield` intermediate results before the final value
- Useful for streaming status updates during tool execution

**Tool choice modes**:
- `"auto"` (default): model decides whether to call tools
- `"required"`: model must call a tool
- `"none"`: model must not call tools
- `{ type: "tool", toolName: "specific" }`: force a specific tool

**Provider-specific built-in tools** (via AI SDK provider packages):
- `openai.tools.webSearch({})` — OpenAI's native web search
- `anthropic.tools.webSearch_20250305()` — Anthropic's native web search
- `google.tools.googleSearch({})` — Google Search grounding
- `vertex.tools.googleSearch({})` / `vertex.tools.enterpriseWebSearch({})` — Google Vertex

**Gateway tools** (via `gateway` from `ai`):
- `gateway.tools.perplexitySearch()` — Perplexity search, works with any model, $5/1K requests
- `gateway.tools.parallelSearch()` — Parallel AI search, works with any model, $5/1K requests

**Third-party tool packages** (community):
- `@exalabs/ai-sdk` → `webSearch()`
- `@tavily/ai-sdk` → `tavilySearch()`, `tavilyExtract()`, `tavilyCrawl()`, `tavilyMap()`
- `firecrawl-aisdk` → `scrapeTool`, `searchTool`, `mapTool`, `crawlTool`, etc.
- `@perplexity-ai/ai-sdk` → `perplexitySearch()`
- `@parallel-web/ai-sdk-tools` → `searchTool`, `extractTool`

**MCP tools** (via `@ai-sdk/mcp`):
```typescript
import { createMCPClient } from "@ai-sdk/mcp";

const mcpClient = await createMCPClient({
  transport: { type: "http", url: "https://your-server.com/mcp" },
});
const tools = await mcpClient.tools();
const result = streamText({ model, tools, prompt });
```

- Supports HTTP (recommended for production), SSE, and stdio transports
- Schema discovery (auto-list all tools) or schema definition (explicit Zod schemas for type safety)
- Typed tool outputs via `outputSchema`
- MCP resources and prompts also supported
- OAuth authorization support via `authProvider`

**Architecture pattern**: The Vercel AI SDK is explicitly designed for a **multi-layer tool architecture**. All tool types — built-in provider tools, gateway tools, third-party tools, custom `tool()` definitions, and MCP tools — resolve to the same `ToolSet` type and are passed in the same `tools` parameter. This is the key architectural insight: **built-in and MCP tools are not competing patterns; they are composable layers**.

### 3.5 v0 / Vercel Chat

v0 (v0.dev) uses a **hybrid architecture** of built-in agentic tools and MCP for extensibility. Observable built-in capabilities include:

- **Web search**: A `SearchWeb` subagent performs real-time queries with citation tracking and clickable source links — zero-configuration, available to all users.
- **Site inspection**: Automated screenshot capture, visual analysis, and content extraction for inspecting websites and responsive layouts.
- **Automatic error fixing**: An autofix system that detects and resolves missing dependencies, syntax errors, runtime bugs, and import issues during code generation.
- **Code execution**: v0 generates, runs, and iterates on code in sandboxed environments as part of its core workflow.

For extensibility, v0 supports **MCP integrations** via two channels: (1) bring-your-own MCP servers configured manually with multiple auth modes, and (2) Vercel Marketplace presets (Context7, Linear, Notion, Sentry, Zapier, PostHog, etc.) that expose tools with no additional setup. v0 also publishes an **AI Tools SDK** (`@v0-sdk/ai-tools`) that exposes 20+ platform tools (chat, project, deployment management) to external LLMs via the standard AI SDK `tools` parameter.

v0's internal architecture is not publicly documented at a code level — no blog posts or engineering articles describe the tool orchestration layer in detail. However, the observable pattern — built-in tools for common capabilities (search, code, inspection) plus MCP for third-party integrations — mirrors the hybrid model used by ChatGPT and Claude, and is consistent with the Vercel AI SDK's multi-layer tool architecture described in Section 3.4. Sources: [v0 Agentic Features docs](https://v0.app/docs/agentic-features), [v0 MCP docs](https://v0.dev/docs/MCP), [v0 AI Tools SDK](https://v0.dev/docs/api/platform/packages/ai-tools).

---

## 4. Industry Standard Patterns

### 4.1 Built-in vs User-Configured Tools

**Consensus level: Universal**

Every major platform follows the same pattern: a curated set of built-in tools for common capabilities, plus an extensibility mechanism for custom/third-party tools.

| Platform | Built-in Tools | Extensibility Mechanism |
|----------|---------------|------------------------|
| ChatGPT | Web search, code interpreter, image gen, file search, computer use, shell | Function calling + Remote MCP + GPT Actions |
| Claude | Web search, code execution, bash, text editor, web fetch, computer use | API tool use + MCP connector |
| Gemini | Google Search grounding, code execution | Function calling + Extensions |
| Vercel AI SDK | Provider tools + Gateway tools | `tool()` definitions + MCP + third-party packages |

The standard split is:
- **Built-in tools**: Zero-configuration, platform-managed, optimized for the most common use cases (search, code, images)
- **User-configured tools**: Require setup but offer unlimited flexibility for domain-specific integrations

### 4.2 Tool Registries & Discovery

**Consensus level: Emerging**

- **OpenAI**: No formal registry; tools are declared per-request in the API. GPT Actions use OpenAPI specs. MCP servers are referenced by URL.
- **Anthropic**: No formal registry; tools are declared per-request. MCP servers are configured in client settings.
- **Google**: Extensions are a form of registry (Google-managed services). Function declarations are per-request.
- **Vercel AI SDK**: Provider registry (`createProviderRegistry`) for models; no formal tool registry, but the `tools` parameter acts as an ad-hoc registry per call. Third-party packages provide "pre-registered" tools.
- **MCP ecosystem**: The MCP directory (model-context-protocol.com) and community listings act as informal registries. No formal, automated discovery protocol yet — the MCP roadmap includes "registry GA" as a planned feature.

**Schema standards**:
- JSON Schema is the universal schema language for tool parameters (used by OpenAI, Anthropic, Google, and Vercel AI SDK)
- Zod schemas (Vercel AI SDK) compile to JSON Schema under the hood
- OpenAPI specs are used by GPT Actions and some MCP servers
- MCP tool schemas are JSON Schema-based

### 4.3 Safety & Approval

**Consensus level: Emerging**

- **Pre-approved built-in tools**: All platforms treat their built-in tools (search, code execution) as pre-approved. Users opt in by enabling a tool, not by approving each invocation.
- **Developer-controlled function calling**: The developer is responsible for safety — they control what the execute function does.
- **Third-party tool approval**:
  - OpenAI: `require_approval` field on MCP tools (`"never"`, `"always"`, per-tool)
  - Vercel AI SDK: `needsApproval` property on tools (boolean or async function for dynamic approval)
  - Claude: MCP tools require user configuration; no per-invocation approval in the API
- **Dynamic approval**: The Vercel AI SDK's `needsApproval: async (input) => condition` pattern is the most flexible approach, allowing approval decisions based on tool input (e.g., approve small payments automatically, require approval for large ones).

### 4.4 Agentic Loops & Step Management

**Consensus level: Universal**

- **Step limits**: All platforms implement some form of step/iteration limit to prevent infinite loops
  - Vercel AI SDK: `stopWhen: stepCountIs(n)` — configurable per call
  - OpenAI: Managed internally in the Responses API; `max_output_tokens` as a budget
  - Claude: API returns after each tool call; developer manages the loop
  - Gemini: Similar to Claude; developer manages iteration
- **Standard pattern**: The `text → tool call → tool result → text` loop is universal. The Vercel AI SDK automates this loop with `stopWhen`; other APIs require the developer to implement it.
- **Progress indicators**: Streaming partial results during tool execution is supported by all platforms. The Vercel AI SDK's `preliminary tool results` (generator functions yielding intermediate status) is the most developer-friendly approach.
- **Loop prevention**: Beyond step count limits, best practices include:
  - Reducing `activeTools` per step (Vercel AI SDK `prepareStep`)
  - System prompts instructing "do not retry denied tools"
  - Token budget limits
  - Timeout/abort signals (Vercel AI SDK forwards `abortSignal` to tool executions)

### 4.5 Result Rendering

**Consensus level: Emerging**

- **ChatGPT**: Rich, tool-specific rendering — code output with syntax highlighting, images inline, web citations with source cards, interactive charts from code interpreter
- **Claude**: Artifacts for rich content (code, SVGs, React components), collapsible tool use details, source citations for web search
- **Gemini**: Grounding metadata with clickable citations, code execution output blocks
- **Vercel AI SDK UI**: The `useChat` hook surfaces tool calls and results via `message.parts` (type `tool-invocation`). Developers control rendering:
  - Tool calls can be rendered as pending/loading states
  - Tool results can be rendered as custom UI components (Generative UI pattern)
  - The `data-tool-status` stream event allows custom status updates during execution

**Best UX patterns**:
- Collapsible tool invocation cards (show name + brief result, expand for full details)
- Inline citations for search results (clickable source links)
- Progressive loading states (skeleton UI during tool execution)
- Tool-specific renderers (code blocks for code execution, image previews for image generation, tables for data)

### 4.6 Streaming with Tools

**Consensus level: Universal**

The standard pattern across all platforms:

1. **Text streaming begins** → partial text tokens streamed to UI
2. **Tool call detected** → tool name and arguments streamed (Vercel AI SDK: `onInputStart`, `onInputDelta`, `onInputAvailable`)
3. **Tool execution** → loading state shown, optional intermediate results (Vercel AI SDK: generator function `yield`)
4. **Tool result returned** → tool result added to context
5. **Text streaming resumes** → model synthesizes tool results into response
6. **Repeat** if more tools needed (up to `stopWhen` limit)

The Vercel AI SDK provides the most granular control:
- `streamText` returns `fullStream` with typed events: `text-delta`, `tool-call`, `tool-result`, `tool-call-streaming-start`, `tool-call-delta`
- `toUIMessageStream()` / `toUIMessageStreamResponse()` converts this to a stream consumable by `useChat`
- `onStepFinish` fires after each complete step for logging/approval
- `createUIMessageStream` with `writer` allows injecting custom stream events (e.g., `data-tool-status`)

### 4.7 MCP Adoption Status

**Consensus level: Emerging — growing rapidly but not yet universal**

**Current adoption (as of February 2026)**:
- **Anthropic**: Claude Desktop, Claude Code, and the API (via MCP connector) all support MCP
- **OpenAI**: Responses API supports remote MCP servers natively (`type: "mcp"`)
- **Vercel**: AI SDK v6 has first-class MCP support via `createMCPClient`; Vercel also supports deploying MCP servers on their platform
- **IDE clients**: Cursor, VS Code, JetBrains IDEs, Xcode, Zed, Windsurf all support MCP
- **Developer tools**: GitHub Copilot, Codex, Gemini CLI support MCP
- **Community**: Thousands of community-built MCP servers listed in directories (model-context-protocol.com, mcp.so)

**Production limitations**:
- **Cold start latency**: MCP server connections take time to establish, especially with remote HTTP transport
- **Connection management**: Per-request client creation (as Not A Wrapper does) is necessary in serverless environments but adds overhead
- **Statelessness vs. sessions**: The MCP spec supports sessions, but serverless environments require stateless patterns
- **Security**: MCP security (auth, token management, request validation) is left to implementers; no standard security model yet
- **Error handling**: MCP error handling is basic; production deployments need custom retry/circuit-breaker logic
- **Scaling**: Running MCP servers at scale requires solving multitenancy, rate limiting, and observability
- **Async operations**: The MCP spec is evolving to better support async/long-running operations

**MCP roadmap priorities** (from modelcontextprotocol.io/development/roadmap):
- Async operations and statelessness/scalability improvements
- Server identity and authentication standards
- Official extensions and registry GA
- Validation tooling

**Competing standards**: MCP is the de facto standard. No significant competing protocol has gained traction. OpenAPI specs (used by GPT Actions) serve a different purpose (REST API integration vs. tool protocol). The industry appears to be consolidating around MCP for tool extensibility.

---

## 5. Not A Wrapper Gap Analysis

### 5.1 Current Architecture Strengths

Code review reveals a production-grade MCP implementation with several standout design decisions:

1. **Production-grade orchestration pipeline** (`lib/mcp/load-tools.ts`): The `loadUserMcpTools()` function implements a robust 7-stage pipeline — parallel config/approval fetch from Convex, circuit breaker filtering (3-failure threshold via `lib/mcp/circuit-breaker.ts`), DNS rebinding validation via `validateResolvedUrl()`, parallel client creation with `Promise.allSettled()`, timeout racing with orphaned client cleanup, tool namespacing, and approval filtering. Total latency is `max(individual server times)`, not the sum — a slow server does not block fast servers.

2. **Deterministic tool namespacing** (`lib/mcp/load-tools.ts:81-89`): The `slugify()` function converts server names to stable, URL-safe slugs (`"My GitHub Server"` → `"my_github_server"`). Tools are namespaced as `${serverSlug}_${toolName}`. The code explicitly documents that slugs are immutable once tools are used in a conversation — changing the slug would orphan historical tool-call and tool-result parts in message history.

3. **Layered security model**: Three defense layers protect against SSRF and unauthorized access:
   - URL validation duplicated in both `convex/mcpServers.ts` (Convex runtime) and `lib/mcp/url-validation.ts` (Node.js runtime), blocking private IPs, localhost, `.local` hostnames, and reserved IPv6 ranges
   - DNS rebinding guard (`validateResolvedUrl()` in `lib/mcp/url-validation.ts:151-211`) resolves hostnames and rejects any that resolve to private IPs — defense-in-depth beyond pure string validation
   - AES-256-GCM encrypted auth (`buildAuthHeaders()` in `load-tools.ts:95-125`) decrypts stored server credentials using the same pattern as BYOK API keys

4. **Per-tool approval system** (`convex/mcpToolApprovals.ts`): The v1 trust model auto-approves all tools when a server is added (`bulkApprove` mutation), but individual tools can be disabled afterward (`toggleApproval`). The approval check in `load-tools.ts:321` defaults to approved: `approvalMap.get(approvalKey) ?? true`. Four Convex indexes on the approvals table enable efficient lookups from every access pattern.

5. **Privacy-conscious audit logging** (`convex/mcpToolCallLog.ts`): Tool inputs and outputs are truncated to 500 characters (`truncatePreview()`) before persistence — explicitly to avoid storing PII or tokens that MCP tools may process. The `userId` field is always derived from auth context, never from client input.

6. **Full observability stack**: PostHog receives two event types — `mcp_tool_load` (per request: server count, tool count, failed servers, load time in ms) and `mcp_tool_call` (per invocation: tool name, server name, success/failure, chat ID). Connection status (`lastConnectedAt`, `lastError`) is tracked in Convex per server. All analytics writes are fire-and-forget to avoid blocking the streaming response.

7. **Graceful degradation**: Failed MCP servers are silently skipped. If ALL servers fail, the chat proceeds without tools (`route.ts:211-212` — `mcpTools` remains an empty object). The circuit breaker prevents repeatedly hitting known-bad servers. Client cleanup runs via `after()` for the happy path and in the `catch` block for errors, preventing resource leaks in both cases.

8. **Broad model compatibility**: Of ~55 models defined across 10 provider files, only ~12 have `tools: false` (all Perplexity models and Ministral 3B). The gate check uses `modelConfig.tools !== false` (`route.ts:178`), meaning `undefined` still allows tools — a permissive, forward-compatible default.

### 5.2 Current Architecture Weaknesses

1. **Zero built-in tools — the critical gap**: The sole tool injection point is `route.ts:262`: `tools: mcpTools`. There is no mechanism for built-in tools anywhere in the codebase. No `lib/tools/` directory exists, no `getBuiltInTools()` function, no concept of non-MCP tools. When a user starts Not A Wrapper for the first time, they have a chat interface with zero tool capabilities — while ChatGPT, Claude, and Gemini all provide web search, code execution, and more out of the box.

2. **Unused provider-specific tool capabilities**: The codebase already depends on `@ai-sdk/openai` (^3.0.26), `@ai-sdk/anthropic` (^3.0.41), and `@ai-sdk/google` (^3.0.24) — all of which export provider-managed search tools (`openai.tools.webSearch()`, `anthropic.tools.webSearch_20250305()`, `google.tools.googleSearch()`). These require zero additional API keys since they use the existing provider credentials configured in `route.ts:143-152`. They are not used anywhere in the codebase.

3. **Binary, server-wide feature gate**: MCP is gated by `process.env.ENABLE_MCP === "true"` (`route.ts:177`). This is an all-or-nothing server-level flag with no per-user or gradual rollout capability. Self-hosters must discover and set this flag — users who don't know about it get no tool capabilities.

4. **Anonymous users completely excluded from tools**: The MCP gate requires `isAuthenticated` (`route.ts:175`). No path exists for anonymous users to access any tools, including potential zero-cost built-in tools like provider search.

5. **Per-request MCP client creation overhead**: The serverless (Vercel) constraint requires creating fresh MCP clients for every chat request. `loadUserMcpTools()` documents typical latency of 500ms-2s depending on server count and responsiveness. Competing platforms' built-in tools incur no such overhead — they're provider-side capabilities that add minimal latency.

6. **Tool UI shows raw namespaced names**: `tool-invocation.tsx:216-218` contains a NOTE acknowledging that the UI shows full namespaced names (e.g., `my_github_server_create_issue`) rather than clean display names. The fix requires passing `toolServerMap` from the chat route via stream metadata — planned for v1.1 but not yet implemented.

7. **Generic tool result rendering**: `tool-invocation.tsx` uses a single generic renderer for all tools. It has smart detection for search-result-shaped arrays (objects with `url`/`title`/`snippet` get linked cards) and objects with `html_url`, but no tool-specific renderers. All tools get the same wrench icon and collapsible card treatment — no visual distinction between a web search, a GitHub API call, or a database query.

8. **Audit schema hardcoded to MCP**: The `mcpToolCallLog` table in `convex/schema.ts:161` requires `serverId: v.id("mcpServers")` — a required foreign key referencing the mcpServers table. Built-in tool calls cannot be logged to this table without schema changes (either making `serverId` optional or adding a `source` discriminator field).

9. **Defined but unenforced limits**: `MAX_TOOL_RESULT_SIZE` (100KB) is defined in `lib/config.ts:195` but is not enforced anywhere in `load-tools.ts` or `route.ts`. The non-tool `maxSteps` value of 10 (`route.ts:212`) is hardcoded rather than being a named constant.

10. **`enableSearch` is model-level, not tool-level**: The `ChatRequest` type includes `enableSearch` (`route.ts:38`), which is passed to `modelConfig.apiSdk(apiKey, { enableSearch })` at line 166. Some OpenRouter models use this to enable provider-level web plugins. However, this is opaque to the user — search happens behind the scenes with no visible tool calls, no audit trail, and no multi-step search capability. It is a fundamentally different mechanism from search-as-a-tool.

### 5.3 Comparison Matrix

| Capability | ChatGPT | Claude | Gemini | Not A Wrapper | Gap Level |
|------------|---------|--------|--------|---------------|-----------|
| Built-in web search | Yes — native `web_search` tool, zero config | Yes — `web_search` server tool, zero config | Yes — Google Search grounding, zero config | No — requires user to configure an MCP search server | **Critical** |
| Built-in code execution | Yes — sandboxed Python (Code Interpreter) | Yes — JS/Python (Analysis tool + API bash/code tools) | Yes — Python execution (`code_execution` tool) | No | **High** |
| Built-in image generation | Yes — GPT Image model (`image_generation` tool) | No (artifacts for SVG/diagrams only) | No (separate Imagen API, not integrated as tool) | No | Medium |
| User-configured tools | Yes — function calling + GPT Actions (OpenAPI) + remote MCP | Yes — API tool use (JSON Schema definitions) | Yes — function calling (`function_declarations`) | Yes — MCP servers only (max 10/user, 50 tools/request) | Low |
| MCP support | Yes — native in Responses API (`type: "mcp"`) | Yes — Claude Desktop, Claude Code, MCP Connector | Partial — Gemini CLI only | Yes — full production implementation with circuit breaker, encrypted auth, DNS validation, audit logging | **Strength** |
| Tool approval flow | Configurable per MCP server (`require_approval`) | Limited — user configures which servers to trust | Limited — extensions enabled/disabled | Yes — per-tool approval with auto-approve default, individual toggle via `mcpToolApprovals` table | **Strength** |
| Tool result rendering | Rich — syntax-highlighted code, inline images, citation cards, interactive charts | Rich — artifacts (code, SVG, React components), collapsible details, source citations | Good — grounding metadata with clickable citations | Basic — generic collapsible cards with JSON pretty-print; smart search result detection for URL/title/snippet arrays | Medium |
| Agentic multi-step | Yes — managed loop, internal step limits | Yes — developer-managed loop via API | Yes — developer-managed loop via API | Yes — `stopWhen: stepCountIs(20)` with MCP, `stepCountIs(10)` without tools | Low |
| Zero-config experience | Yes — all built-in tools active by default | Yes — web search, code execution active by default | Yes — grounding available by default | No — requires `ENABLE_MCP=true` env var, Clerk auth, and MCP server configuration | **Critical** |
| Tool observability | Limited — usage metadata in API response | Limited — tool use visible in API response | Limited — grounding metadata | Strong — PostHog analytics per tool call, Convex audit log with truncated input/output previews, circuit breaker state, connection status tracking | **Strength** |

---

## 6. Recommendations

### 6.1 High-Impact Built-in Tools to Add

**Priority 1: Provider-Specific Web Search (Critical — zero-cost quick win)**

The codebase already depends on `@ai-sdk/openai` (^3.0.26), `@ai-sdk/anthropic` (^3.0.41), and `@ai-sdk/google` (^3.0.24). All three v3 provider packages export provider-managed search tools that require zero additional API keys — they use the existing provider credentials already configured in `route.ts:143-152` (the `envKeyMap` lookup).

Implementation:
- `openai.tools.webSearch({})` for OpenAI models (GPT-5.x, GPT-4.x, o3, o4-mini — 9 models)
- `anthropic.tools.webSearch_20250305()` for Anthropic models (Claude 4.6, 4.5, 4 — 4 models)
- `google.tools.googleSearch({})` for Gemini models (Gemini 2.5, 3 Pro, Gemma — 5 models)

**Why this is the highest-priority item**: These tools are available in packages we already ship. Zero infrastructure cost, zero new API keys, zero cold start latency. The provider handles search server-side. This gives ~18 direct-provider models (plus ~14 OpenRouter equivalents) instant web search capability.

**Limitation**: Only works for OpenAI, Anthropic, and Google models. xAI/Grok, Mistral, DeepSeek, OpenRouter (non-proxied), and Ollama models would not get provider search. A fallback strategy is needed (see Priority 2).

**Priority 2: Third-Party Search Tool for Universal Coverage (High)**

For models without provider-specific search, add a third-party search tool:
- **Recommended**: `@exalabs/ai-sdk` → `webSearch()` — AI-native semantic search, $5/1K requests, LLM-optimized response format, reads `EXA_API_KEY` from environment
- **Alternative**: `@tavily/ai-sdk` → `tavilySearch()` — broader capability set (search + extract + crawl + map), credit-based pricing, reads `TAVILY_API_KEY` from environment

This tool would serve as:
1. A fallback when provider-specific search isn't available (xAI, Mistral, OpenRouter, Ollama)
2. A BYOK option for users who provide their own Exa/Tavily API key
3. The default search for non-provider models (requires a platform-level API key — `EXA_API_KEY` or `TAVILY_API_KEY` in server environment variables)

Neither package is currently in `package.json` — one new dependency is required.

**Priority 3: URL/Content Extraction (High)**

- `@tavily/ai-sdk` → `tavilyExtract()` or `firecrawl-aisdk` → `scrapeTool`
- Users frequently paste URLs and ask "summarize this page" — without an extraction tool, the model can only guess what's at the URL
- Pairs naturally with web search (search → extract top results for deeper analysis)

**Priority 4: Code Execution (Medium-High)**

- Anthropic's analysis tool via `@ai-sdk/anthropic` for Claude models
- Google's `code_execution` tool via `@ai-sdk/google` for Gemini models
- Higher complexity than search — requires understanding provider-specific sandboxing and result formats
- Significant differentiator for data analysis and computational queries

**Priority 5: Image Generation (Medium)**

- OpenAI's `image_generation` tool via `@ai-sdk/openai` for GPT models
- Growing user expectation, but not blocking for core chat functionality

### 6.2 Proposed Hybrid Architecture

The architecture adds two new layers to the existing MCP system. All tool types merge into a single `ToolSet` before being passed to `streamText()` — the Vercel AI SDK is explicitly designed for this composability (all tool types resolve to the same `ToolSet` type).

```
┌──────────────────────────────────────────────────────────────┐
│               app/api/chat/route.ts                          │
│               streamText({ tools: allTools })                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  Merged ToolSet                         │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌────────────┐  ┌───────────────┐  │  │
│  │  │  Layer 1:     │  │ Layer 2:   │  │  Layer 3:     │  │  │
│  │  │  Built-in     │  │ Third-     │  │  MCP Tools    │  │  │
│  │  │  Provider     │  │ party      │  │  (existing)   │  │  │
│  │  │  Tools        │  │ BYOK       │  │               │  │  │
│  │  │               │  │ Tools      │  │               │  │  │
│  │  │ NEW module:   │  │ NEW module:│  │ lib/mcp/      │  │  │
│  │  │ lib/tools/    │  │ lib/tools/ │  │ load-tools.ts │  │  │
│  │  │ provider.ts   │  │ byok.ts    │  │ (unchanged)   │  │  │
│  │  └──────────────┘  └────────────┘  └───────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

Layer 1: Built-in Provider Tools (lib/tools/provider.ts) — NEW
  - Input: provider string from getProviderForModel() (route.ts:127)
  - openai  → openai.tools.webSearch({})
  - anthropic → anthropic.tools.webSearch_20250305()
  - google  → google.tools.googleSearch({})
  - Other providers → skip (Layer 2 fallback)
  - Zero additional config. Uses existing provider API keys.

Layer 2: Third-Party BYOK Tools (lib/tools/byok.ts) — NEW
  - Input: user's BYOK API keys from Convex userKeys table
  - EXA_API_KEY present → webSearch() from @exalabs/ai-sdk
  - TAVILY_API_KEY present → tavilySearch() from @tavily/ai-sdk
  - Or: platform-level API key for universal search on non-provider models

Layer 3: MCP Tools (lib/mcp/load-tools.ts) — EXISTING, NO CHANGES
  - loadUserMcpTools() continues to work exactly as-is
  - Namespacing, approval, circuit breaker, audit logging preserved
```

**Concrete integration in `app/api/chat/route.ts`:**

The change is surgical. The existing MCP tool loading block (lines 168-209) is cleanly isolated with clear boundaries. Built-in tools are added in a parallel block before it, and both are merged before `streamText()`:

```typescript
// NEW: Built-in tool loading (insert after line 167, before MCP block)
// -----------------------------------------------------------------------
// Built-in Tool Loading
// Zero-config, provider-specific tools — no auth or feature flag required
// -----------------------------------------------------------------------
let builtInTools: ToolSet = {} as ToolSet

if (modelConfig.tools !== false) {
  const { getProviderTools } = await import("@/lib/tools/provider")
  builtInTools = getProviderTools(provider)
}

// EXISTING: MCP Tool Loading block (lines 168-209) — unchanged

// CHANGED: Replace lines 211-212 with:
const allTools = { ...builtInTools, ...mcpTools } as ToolSet
const hasTools = Object.keys(allTools).length > 0
const maxSteps = hasTools ? MCP_MAX_STEP_COUNT : 10

// CHANGED: streamText call at line 262 — replace `tools: mcpTools` with:
tools: allTools,
```

**Tool resolution order**: Built-in tools load first (synchronous, no network calls), MCP tools load second (async, may add latency). If an MCP tool has the same key as a built-in tool, the MCP tool wins (object spread order: `{ ...builtIn, ...mcp }`). In practice, MCP tools are namespaced (`serverslug_toolname`) so key collisions are extremely unlikely.

**Configuration model**:
- Built-in tools: enabled by default when `modelConfig.tools !== false`. Can be disabled via a new user preference (`enableBuiltInTools` in the existing `userPreferences` table in `convex/schema.ts`).
- BYOK tools: enabled when the user provides the corresponding API key. The existing `userKeys` Convex table and encryption pattern (`lib/encryption.ts`) can be reused.
- MCP tools: no changes to existing system.

**API key handling for provider tools**: Provider-specific tools (Layer 1) use the same API key as the model itself. The existing key validation in `route.ts:129-163` ensures a valid key is available — either a user BYOK key (lines 129-136) or a server environment variable (lines 142-152) — before the model is created at line 166. If execution reaches the built-in tool loading block, the provider key is guaranteed to be valid, since `modelConfig.apiSdk(apiKey, ...)` would have already thrown on an invalid or missing key. No additional key check is needed in `getProviderTools()`. This assumption does **not** hold for Phase B BYOK tools (Exa, Tavily, Firecrawl), which require separate API keys (`EXA_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`). The `lib/tools/byok.ts` module must perform its own key presence checks and only include tools for which a valid key is available.

### 6.3 Implementation Roadmap

**Phase A: Provider-Specific Web Search (1-2 days)**

Scope: Add zero-config web search for OpenAI, Anthropic, and Google models.

Files to create:
- `lib/tools/provider.ts` — new module (~40 lines): `getProviderTools(providerId: string): ToolSet` returns provider-specific search tools

Files to modify:
- `app/api/chat/route.ts` — add ~15 lines: import `getProviderTools`, load built-in tools before MCP block, merge both into `allTools`, pass to `streamText()`. Change `hasMcpTools` check to `hasTools`.
- `lib/config.ts` — extract the hardcoded `10` into a named constant `DEFAULT_MAX_STEP_COUNT`

**Why it's fast**: All required packages are already installed. No new dependencies. No Convex schema changes. No UI changes needed. The `provider` variable is already computed at `route.ts:127` via `getProviderForModel()`. The `ToolSet` type from AI SDK v6 natively supports mixing provider tools with MCP tools in the same object.

**Phase B: Universal Search Fallback (2-3 days)**

Scope: Add search for providers without native search tools (xAI, Mistral, OpenRouter, Ollama — ~25 models).

New dependencies: `@exalabs/ai-sdk` or `@tavily/ai-sdk` (one new package)

Files to create:
- `lib/tools/byok.ts` — new module (~50 lines): `getByokTools(userApiKeys?: Record<string, string>): ToolSet` returns third-party tools based on available API keys

Files to modify:
- `app/api/chat/route.ts` — ~10 additional lines: load BYOK tools, merge into `allTools`

Platform decision needed: provide a platform-level search API key (e.g., `EXA_API_KEY` in the server environment, analogous to how provider API keys work), or require users to bring their own via the existing BYOK key storage.

**Phase C: Remove Feature Gate + UI Polish (2-3 days)**

Scope: Remove `ENABLE_MCP=true` requirement. Improve tool display names and add tool-type icons.

Files to modify:
- `app/api/chat/route.ts` — remove `process.env.ENABLE_MCP === "true"` check from line 177
- `app/components/chat/tool-invocation.tsx` — add tool name display logic: strip namespace prefix for MCP tools using `toolServerMap` metadata (the v1.1 TODO noted at line 216-218), show clean names for built-in tools. Add tool-type icons (search icon for search tools, code icon for code execution, wrench for generic MCP tools).
- Consider: set `showToolInvocations` default to `true` in `convex/schema.ts` `userPreferences` table, since tools will now be a first-class feature

**Phase D: Audit Schema Generalization (1-2 days)**

Scope: Enable logging for built-in tool calls alongside MCP tool calls.

Files to modify:
- `convex/schema.ts` — make `serverId` optional in `mcpToolCallLog` table, add `source: v.optional(v.union(v.literal("builtin"), v.literal("mcp"), v.literal("byok")))` field
- `convex/mcpToolCallLog.ts` — update `log` mutation to accept optional `serverId` and new `source` field
- `app/api/chat/route.ts` — extend `onFinish` tool logging to also log built-in tool calls (identify as tools NOT present in `mcpToolServerMap`)

**Phase E: Tool Discovery UI (5-7 days)**

Scope: Build a user-facing tool management interface in the settings panel.

Files to create:
- `app/components/layout/settings/tools/` — new settings panel with:
  - Built-in tool enable/disable toggles
  - BYOK API key entry for Exa/Tavily/Firecrawl (reuse existing encrypted key storage pattern from `convex/userKeys.ts` and `lib/encryption.ts`)
  - MCP server status dashboard (leveraging existing `lastConnectedAt`/`lastError` fields)

**Phase F: Code Execution (1-2 weeks)**

Scope: Add code execution for Claude and Gemini models.

This phase requires:
- Understanding Anthropic's analysis tool sandbox model and result format
- Understanding Gemini's `code_execution` result format
- Building a dedicated code output renderer in `tool-invocation.tsx` (syntax highlighting, stdout/stderr blocks, file outputs)
- Security review for open-source deployment implications

### 6.4 Effort Estimates

| Item | Effort | Files Changed | Dependencies | Priority |
|------|--------|---------------|-------------|----------|
| Provider-specific web search (`lib/tools/provider.ts`) | S (1-2 days) | 1 new, 2 modified (`route.ts`, `config.ts`) | None — packages already installed | **P0 — Critical** |
| Merge built-in + MCP tools in `route.ts` | S (included in above) | `route.ts` only (~15 lines) | Provider tools above | **P0 — Critical** |
| Third-party search fallback (`lib/tools/byok.ts`) | S-M (2-3 days) | 1 new, 1 modified (`route.ts`) | `@exalabs/ai-sdk` or `@tavily/ai-sdk` (new dep) | **P1 — High** |
| Remove `ENABLE_MCP` feature gate | S (< 1 day) | `route.ts` line 177 only | Confidence in tool stability | **P1 — High** |
| Tool UI name cleanup + icons | M (2-3 days) | `tool-invocation.tsx`, `message-assistant.tsx` | None | **P1 — High** |
| Generalize audit schema for all tool types | S-M (1-2 days) | `convex/schema.ts`, `convex/mcpToolCallLog.ts`, `route.ts` | None | **P1 — High** |
| URL extraction tool | S (1 day) | `lib/tools/byok.ts` | `@tavily/ai-sdk` or `firecrawl-aisdk` (new dep) | **P1 — High** |
| BYOK API key settings UI | M (3-4 days) | New settings panel components, reuse `convex/userKeys.ts` pattern | BYOK tools above | **P2 — Medium** |
| Tool enable/disable per user | M (2-3 days) | `convex/schema.ts` (`userPreferences`), settings UI, `route.ts` | Settings UI above | **P2 — Medium** |
| Code execution (Claude + Gemini) | L (1-2 weeks) | New renderer in `tool-invocation.tsx`, `lib/tools/provider.ts`, `route.ts` | Security review | **P3 — Future** |
| Tool discovery/recommendation UI | L (5-7 days) | New components in `app/components/layout/settings/tools/` | Settings UI above | **P3 — Future** |

_Effort scale: S = 1-2 days, M = 3-5 days, L = 1-2 weeks_

**Key insight from codebase review**: The existing architecture makes Phase A remarkably easy. The MCP tool loading block in `route.ts` (lines 168-209) is cleanly isolated with clear boundaries. The `provider` variable is already computed at line 127 via `getProviderForModel()`. The `ToolSet` type from AI SDK v6 natively supports mixing provider tools with MCP tools in a single object — they are just `Record<string, ToolDefinition>` under the hood. No refactoring of `load-tools.ts` is needed — it continues to work exactly as-is, with its output merged alongside built-in tools. The `LoadToolsResult` type and the entire MCP orchestration pipeline are untouched.

---

## 7. Appendix

### 7.1 Code Examples

#### Exa.ai as a Built-in Tool

Using the pre-built `@exalabs/ai-sdk` package:

```typescript
// lib/tools/exa-search.ts
import { webSearch } from "@exalabs/ai-sdk";

/**
 * Exa web search tool for BYOK users who provide an EXA_API_KEY.
 * Uses the @exalabs/ai-sdk package which reads EXA_API_KEY from env.
 */
export function createExaSearchTool(apiKey?: string) {
  // The package reads EXA_API_KEY from process.env by default
  // For BYOK, we'd need to set it per-request or fork the package
  return webSearch({
    type: "auto",
    numResults: 5,
    contents: {
      text: { maxCharacters: 2000 },
      livecrawl: "fallback",
      summary: true,
    },
  });
}
```

Using the raw Exa JS SDK with a custom `tool()` definition (for BYOK support):

```typescript
// lib/tools/exa-search-custom.ts
import { tool } from "ai";
import { z } from "zod";
import Exa from "exa-js";

export function createExaSearchTool(apiKey: string) {
  const exa = new Exa(apiKey);

  return tool({
    description: "Search the web for current information using Exa AI-native search",
    inputSchema: z.object({
      query: z.string().min(1).max(200).describe("The search query"),
    }),
    execute: async ({ query }) => {
      const { results } = await exa.searchAndContents(query, {
        livecrawl: "fallback",
        numResults: 5,
        text: { maxCharacters: 2000 },
      });
      return results.map((result) => ({
        title: result.title,
        url: result.url,
        content: result.text?.slice(0, 2000),
        publishedDate: result.publishedDate,
      }));
    },
  });
}
```

#### Built-in Tool Registry Pattern

```typescript
// lib/tools/built-in-tools.ts
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
// `gateway` is re-exported from "ai" — this is the canonical import per Vercel docs.
// Alternative: `import { gateway } from "@ai-sdk/gateway"` (separate package for
// explicit Gateway provider instances; not required for gateway.tools access).
// Both gateway.tools.perplexitySearch() and gateway.tools.parallelSearch() are
// confirmed in Vercel AI Gateway docs (February 2026).
import { gateway } from "ai";
import type { ToolSet } from "ai";

type ProviderId = "openai" | "anthropic" | "google" | string;

/**
 * Returns the appropriate built-in web search tool based on the model's provider.
 * Falls back to gateway.tools.perplexitySearch() for providers without native search.
 */
export function getBuiltInSearchTool(providerId: ProviderId): ToolSet {
  switch (providerId) {
    case "openai":
      return { web_search: openai.tools.webSearch({}) };
    case "anthropic":
      return { web_search: anthropic.tools.webSearch_20250305() };
    case "google":
      return { web_search: google.tools.googleSearch({}) };
    default:
      // Fallback: use gateway Perplexity search (works with any model)
      return { web_search: gateway.tools.perplexitySearch() };
  }
}

/**
 * Returns all built-in tools for a given model provider.
 * Extensible — add more tools here as they become available.
 */
export function getBuiltInTools(providerId: ProviderId): ToolSet {
  return {
    ...getBuiltInSearchTool(providerId),
    // Future: add code execution, image generation, etc.
  };
}
```

#### Hybrid Tool Merging

```typescript
// Conceptual pattern — see Section 6.2 for the precise codebase-specific integration
import { streamText, type ToolSet } from "ai";
import { getBuiltInTools } from "@/lib/tools/built-in-tools";
import { getBYOKTools } from "@/lib/tools/byok-tools";
import { loadMCPTools } from "@/lib/mcp/load-tools";

async function buildToolSet(
  providerId: string,
  userApiKeys: Record<string, string>,
  mcpServers: MCPServerConfig[],
  enableBuiltIn: boolean,
  enableMCP: boolean,
): Promise<ToolSet> {
  const tools: ToolSet = {};

  // Layer 1: Built-in tools (zero-config, provider-specific)
  if (enableBuiltIn) {
    const builtIn = getBuiltInTools(providerId);
    Object.assign(tools, builtIn);
  }

  // Layer 2: BYOK tools (user-provided API keys)
  const byokTools = getBYOKTools(userApiKeys);
  Object.assign(tools, byokTools);

  // Layer 3: MCP tools (user-configured servers)
  if (enableMCP && mcpServers.length > 0) {
    const mcpTools = await loadMCPTools(mcpServers);
    Object.assign(tools, mcpTools);
  }

  return tools;
}

// Usage in the route handler
const tools = await buildToolSet(
  model.providerId,
  user.apiKeys,
  user.mcpServers,
  true,  // enableBuiltIn
  true,  // enableMCP
);

const result = streamText({
  model: selectedModel,
  tools,
  stopWhen: stepCountIs(20),
  messages,
  onStepFinish({ toolCalls, toolResults }) {
    // Log tool usage for analytics
  },
});

return result.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
});
```

### 7.2 Reference Links

#### Exa.ai
- Exa API product page: https://exa.ai/exa-api
- Exa documentation: https://docs.exa.ai/
- Exa Vercel AI SDK integration: https://docs.exa.ai/reference/vercel
- Exa AI SDK GitHub repo: https://github.com/exa-labs/ai-sdk
- Exa MCP server: https://docs.exa.ai/reference/exa-mcp
- Exa MCP server GitHub: https://github.com/exa-labs/exa-mcp-server
- Exa pricing: https://exa.ai/pricing
- Exa rate limits: https://docs.exa.ai/reference/rate-limits

#### Tavily
- Tavily documentation: https://docs.tavily.com/
- Tavily Vercel AI SDK integration: https://docs.tavily.com/documentation/integrations/vercel
- Tavily AI SDK GitHub: https://github.com/tavily-ai/ai-sdk
- Tavily MCP server: https://docs.tavily.com/documentation/mcp
- Tavily pricing: https://www.tavily.com/pricing
- Tavily credits & pricing: https://docs.tavily.com/documentation/api-credits

#### Firecrawl
- Firecrawl documentation: https://docs.firecrawl.dev/
- Firecrawl Vercel AI SDK integration: https://docs.firecrawl.dev/developer-guides/llm-sdks-and-frameworks/vercel-ai-sdk
- Firecrawl MCP server: https://www.firecrawl.dev/mcp
- Firecrawl GitHub: https://github.com/firecrawl/firecrawl
- Firecrawl pricing: https://firecrawl.dev/pricing

#### OpenAI
- OpenAI using tools: https://platform.openai.com/docs/guides/tools
- OpenAI function calling: https://platform.openai.com/docs/guides/function-calling
- OpenAI code interpreter: https://platform.openai.com/docs/guides/tools-code-interpreter
- OpenAI web search tool: https://platform.openai.com/docs/guides/tools-web-search
- OpenAI remote MCP: https://platform.openai.com/docs/guides/tools-connectors-mcp
- OpenAI GPT Actions: https://platform.openai.com/docs/actions/introduction
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses

#### Anthropic
- Claude tool use overview: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
- Claude built-in tools (bash): https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/bash-tool
- Claude web search tool: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
- Claude web fetch tool: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-fetch-tool
- Claude computer use tool: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool
- Claude fine-grained tool streaming: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/fine-grained-tool-streaming
- Claude MCP connector: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- Claude analysis tool (product): https://support.anthropic.com/en/articles/10008684
- Claude artifacts (product): https://support.anthropic.com/en/articles/9487310

#### Google Gemini
- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Gemini code execution: https://ai.google.dev/gemini-api/docs/code-execution
- Gemini grounding with Google Search: https://ai.google.dev/gemini-api/docs/grounding
- Gemini CLI tools API: https://google-gemini.github.io/gemini-cli/docs/core/tools-api.html

#### Vercel AI SDK
- AI SDK v6 announcement: https://vercel.com/blog/ai-sdk-6
- AI SDK tool calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI SDK MCP tools: https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools
- AI SDK web search agent cookbook: https://ai-sdk.dev/cookbook/node/web-search-agent
- AI SDK foundations — tools: https://ai-sdk.dev/docs/foundations/tools
- AI SDK agents overview: https://ai-sdk.dev/docs/agents/overview
- AI SDK loop control: https://ai-sdk.dev/docs/agents/loop-control
- AI SDK streamText reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text
- AI SDK tool reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/tool
- AI SDK createMCPClient reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client
- AI SDK chatbot tool usage: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
- Vercel AI Gateway web search: https://vercel.com/docs/ai-gateway/web-search
- Vercel deploy MCP servers: https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel

#### MCP (Model Context Protocol)
- MCP specification: https://modelcontextprotocol.io/
- MCP roadmap: https://modelcontextprotocol.io/development/roadmap
- MCP announcement (Anthropic): https://anthropic.com/news/model-context-protocol
- MCP directory: https://model-context-protocol.com/
- Running MCP in production (ByteBridge, Jan 2026): https://bytebridge.medium.com/what-it-takes-to-run-mcp-model-context-protocol-in-production-3bbf19413f69
- GitHub MCP docs: https://docs.github.com/en/copilot/concepts/about-mcp

#### Industry Architecture
- Google Cloud: Choose a design pattern for agentic AI: https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system
- Microsoft: Architecting agent solutions: https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/architecture/overview

---

_Research complete. All sections reflect findings from web research (Phase 1), codebase analysis (Phase 2), and synthesis (Phase 3). Code references are based on the codebase as of February 11, 2026._
