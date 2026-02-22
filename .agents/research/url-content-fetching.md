# URL Content Fetching Capability for AI Chat

> **Status**: Research Complete
> **Date**: 2026-02-22
> **Scope**: Architecture, libraries, security, context budgets, specialized extractors, caching
> **Related**: `.agents/plans/phase-7-future-tool-integrations.md` (Sub-Phase 7.7)

---

## Table of Contents

1. [Production Landscape Survey](#1-production-landscape-survey)
2. [HTML-to-Text Conversion](#2-html-to-text-conversion)
3. [Security Considerations](#3-security-considerations)
4. [Context Budget Management](#4-context-budget-management)
5. [Architecture Placement](#5-architecture-placement)
6. [Specialized Content Types](#6-specialized-content-types)
7. [Hosted Services and APIs](#7-hosted-services-and-apis)
8. [Caching Strategy](#8-caching-strategy)
9. [Recommendations](#9-recommendations)

---

## 1. Production Landscape Survey

### How Major Platforms Implement URL Fetching

| Platform | Architecture | JS Rendering | Content Budget | URL Source Restriction |
|----------|-------------|-------------|----------------|----------------------|
| ChatGPT | Server-side, proprietary | Yes (Atlas/Chromium) | Auto-summarization | Model constructs queries |
| Perplexity | Server-side, hybrid RAG | Unknown | `max_tokens_per_page` | Model-driven |
| Claude | Server-side, API tool | No (HTML only) | `max_content_tokens` + dynamic filtering | User-provided URLs only |
| Open WebUI | Server-side, dual-mode | No | 50K char hard cap | Model-driven |
| LibreChat | Server-side, Firecrawl | Yes (via Firecrawl) | Reranker truncation | Search-driven |
| LobeChat | Serverless plugin | No | Plugin-level | Explicit URL input |

### ChatGPT / OpenAI

Server-side with proprietary infrastructure. Reasoning models (o3, GPT-5) get two page-level actions beyond search: `open_page` (accesses a webpage) and `find_in_page` (searches within an opened page). The model doesn't read entire pages — it fans out short sub-queries, skims titles and introductions (~500–1,000 chars), and extracts answer blocks under headings. The Atlas browser (Oct 2025) runs a full Chromium-based browser via the OWL architecture.

### Claude / Anthropic

Two versions of the `web_fetch` tool:

| Version | Features |
|---------|----------|
| `web_fetch_20250910` | Basic fetch + PDF extraction |
| `web_fetch_20260209` | Adds dynamic filtering (Opus 4.6, Sonnet 4.6) |

Dynamic filtering enables Claude to write and execute code that filters fetched content *before* it enters the context window — achieving ~24% input token reduction and ~11% quality improvement. Anti-exfiltration measure: Claude cannot dynamically construct URLs; it can only fetch URLs explicitly provided by the user or from previous search/fetch results.

Configuration surface:
- `max_content_tokens` — hard cap on content length
- `max_uses` — limits fetches per request
- `allowed_domains` / `blocked_domains` — domain restrictions

### Perplexity

Three-stage RAG pipeline: hybrid retrieval → content fetching → grounded generation. Agent API exposes `web_search` (with `max_tokens_per_page`) and `fetch_url` (full page content). Content is fetched on-demand per query and not stored.

### Open WebUI (Open Source)

Agentic mode exposes `search_web` and `fetch_url` tools. `fetch_url` retrieves full page text, hard-capped at 50,000 characters, injected directly into context (no Vector DB, no chunking). Requires frontier models (GPT-5, Claude 4.5+) for effective multi-step tool use. No JS rendering.

### LibreChat (Open Source)

Three-component pipeline: **Search** (Serper/SearXNG) → **Scrape** (Firecrawl) → **Rerank** (Jina/Cohere). Firecrawl handles JS rendering and markdown conversion. Scraper timeout defaults to 7,500ms. Open enhancement request for direct URL fetching beyond search results.

### Common Patterns

1. Content extraction is always **server-side** (never client-side)
2. Trend toward **direct context injection** of filtered content over RAG chunking
3. Token/character limits enforced to prevent context overflow
4. Modern approaches (Claude's dynamic filtering, OpenAI's `find_in_page`) extract **relevant portions** rather than full pages
5. **Markdown** is the preferred output format (token-efficient, preserves structure)

### Vercel AI SDK

No built-in URL fetch tool — composable approach. Ready-made third-party integrations:

| Package | Tool |
|---------|------|
| `@tavily/ai-sdk` (v0.4.1) | `tavilyExtract()` — URL content extraction + search |
| `@exalabs/ai-sdk` | `webSearch()` — search + content extraction |
| `@parallel-web/ai-sdk-tools` | `searchTool` + `extractTool` |

The `@tavily/ai-sdk` `tavilyExtract()` tool is particularly relevant — it extracts clean, structured content from URLs with configurable `format` (markdown/text) and `extractDepth` (basic/advanced). ~4.6K weekly downloads.

---

## 2. HTML-to-Text Conversion

### The Standard Pipeline

The dominant pattern for HTML → LLM-ready text:

```
Raw HTML → [DOM Parser] → [Content Extraction] → [Markdown Conversion] → Clean Markdown
             jsdom          Readability.js           Turndown
```

Achieves **~70–80% token reduction** vs raw HTML.

### Article Extraction Libraries

| Library | Version | Weekly Downloads | Bundle (min+gz) | Dependencies | Quality |
|---------|---------|-----------------|-----------------|-------------|---------|
| `@mozilla/readability` | 0.6.0 | ~500K | ~15 KB | 0 | Excellent (articles) |
| `@extractus/article-extractor` | 8.0.20 | ~11.5K | Larger | Multiple | Good (rich metadata) |
| `cheerio` | 1.0.0 | ~8M | ~50 KB | 5+ (parse5) | Flexible (manual selectors) |

**`@mozilla/readability`** is the clear winner for general-purpose extraction:
- Battle-tested (powers Firefox Reader View on billions of page loads)
- Zero dependencies, small footprint
- Returns `{ title, content (HTML), textContent, excerpt, byline }`
- Used by Jina Reader internally
- Requires a DOM environment (`jsdom` on server side)
- Modifies DOM in-place (clone the document first)
- Optimized for articles; weaker on forums, product pages, search results

### Markdown Conversion

| Library | Version | Weekly Downloads | Bundle (min+gz) | Speed |
|---------|---------|-----------------|-----------------|-------|
| `turndown` | 7.2.0 | ~2.37M | 3.96 KB | Baseline |
| `node-html-markdown` | 1.3.0 | ~328K | ~8 KB | **1.57x faster** |

Performance benchmarks (reused instance):

| Input Size | `node-html-markdown` | `turndown` |
|------------|---------------------|-----------|
| 100 KB | 17 ms | 27 ms |
| 1 MB | 176 ms | 280 ms |

**`turndown`** has 7x larger ecosystem, plugin system (GFM tables/strikethrough), and is used by Jina Reader in production. **`node-html-markdown`** is consistently faster but has fewer community integrations.

Recommendation: **`turndown`** for ecosystem maturity. The 1.57x speed difference is negligible for single-page fetches (27ms vs 17ms at 100KB).

### DOM Parsing (Server-Side)

| Library | Import Time | HTML Parse | Dependencies |
|---------|------------|------------|-------------|
| `jsdom` | 333 ms | 256 ms | 20+ |
| `happy-dom` | 45 ms | 26 ms | Few |
| `linkedom` | Fast | Fast | Few |

**`jsdom`** is required by `@mozilla/readability` and has the most complete browser emulation (~14M weekly downloads). `happy-dom` is 7.4x faster but less comprehensive. For this use case, `jsdom` is the correct choice because Readability depends on its DOM fidelity.

### JavaScript-Rendered Content

| Content Type | Approach | Cost |
|-------------|----------|------|
| Static HTML (articles, blogs, docs) | `fetch` + `jsdom` + Readability | Minimal |
| SPA / JS-rendered | Playwright/Puppeteer or hosted service (Jina/Firecrawl) | High |
| Known site structures | `fetch` + `cheerio` + custom selectors | Minimal |

Static HTML covers the vast majority of URLs users share in chat (articles, documentation, blog posts). JS-rendered SPAs are an edge case that can be handled by falling back to Jina Reader or Firecrawl.

### Token Reduction Benchmarks

| Content Type | Raw HTML Tokens | After Readability+Turndown | Reduction |
|-------------|----------------|---------------------------|-----------|
| Blog post | ~16,000 | ~3,150 | **80%** |
| E-commerce page | ~40,000 | ~2,000 | **95%** |
| News article | 15–25K | 2–5K | **75–80%** |
| Documentation | 10–30K | 3–8K | **70–75%** |
| Wikipedia | 20–80K | 5–20K | **60–75%** |

Markdown-formatted content shows **35% better RAG accuracy** vs raw HTML.

### Emerging Alternatives

**ReaderLM-v2** (Jina AI, Jan 2025): 1.5B parameter model trained specifically for HTML → Markdown. Handles complex elements (code fences, nested lists, tables, LaTeX) with 512K token context. 15–20% better than GPT-4o on extraction benchmarks. Available via Jina API. Trade-off: requires model inference vs zero-cost heuristic conversion.

**MinerU-HTML / Dripper** (ICLR 2026): 0.6B parameter model for semantic block classification. Reduces HTML to 22% of original tokens while preserving structure. 81.58% ROUGE-N F1 vs Readability's 64.91%. Requires running a small model — heavier infrastructure.

Neither is practical for the MVP, but both indicate the direction the field is heading.

---

## 3. Security Considerations

### SSRF (Server-Side Request Forgery)

The primary risk of server-side URL fetching. Must block:

- **Private IPs**: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- **Loopback**: `127.0.0.0/8`, `::1`
- **Link-local**: `169.254.0.0/16`, `fe80::/10`
- **Cloud metadata endpoints**: AWS `169.254.169.254`, GCP `metadata.google.internal`, Azure `169.254.169.254`
- **Alternative IP representations**: Octal (`0177.0.0.1`), hex (`0x7f000001`), IPv6-mapped IPv4 (`::ffff:127.0.0.1`), decimal integer (`2130706433`)
- **URL schemes**: Only `http:` and `https:`. Block `file:`, `ftp:`, `data:`, `javascript:`, etc.

### DNS Rebinding Prevention

Attacker's DNS initially resolves to a public IP (passes validation), then TTL expires and resolves to `127.0.0.1` (actual request hits internal network). Mitigation requires resolving DNS *and pinning the resolved IP* for the actual request — no gap between validation and connection (TOCTOU).

### Node.js SSRF Protection Libraries

| Library | Weekly Downloads | DNS Rebinding | Cloud Metadata | TypeScript |
|---------|-----------------|---------------|----------------|-----------|
| `ssrf-agent-guard` (v1.1, Jan 2026) | New | Yes | AWS/GCP/Azure/Oracle/DO/K8s | Yes |
| `request-filtering-agent` | ~101K | No | Partial | No |
| `ssrf-req-filter` | ~45K | Open issue | No | No |

**`ssrf-agent-guard`** is the most feature-complete pure-TypeScript option (MIT, Jan 2026):
- Blocks private/reserved IPs + cloud metadata endpoints
- DNS rebinding detection
- Policy-based domain filtering (allowlists, denylists, TLD blocking)
- Multiple modes (block/report/allow)
- Works with axios, node-fetch, native fetch via http.Agent wrapping
- Only 6 releases, 2 contributors — newer library, less battle-tested

**`request-filtering-agent`** has the widest adoption (~101K weekly downloads) but lacks DNS rebinding protection and cloud metadata blocking.

For defense-in-depth, layer: URL normalization (WHATWG URL API) + protocol restriction + DNS resolution with IP classification + redirect validation at each hop.

### Response Handling

| Control | Recommended Value | Rationale |
|---------|-------------------|-----------|
| Content-type allowlist | `text/html`, `text/plain`, `application/json`, `application/xml`, `application/pdf` | Reject binary, media, executables |
| Response size limit | 5 MB raw | Generous for HTML; content will be compressed to markdown |
| Redirect hops | 3–5 maximum | Validate each destination against SSRF rules |
| Connection timeout | 5–10 seconds | Prevent hanging connections |
| Total timeout | 15 seconds | Match existing `TOOL_EXECUTION_TIMEOUT_MS` |
| Streaming cutoff | AbortController at size limit | Don't buffer the entire response before checking |

### Rate Limiting

| Dimension | Recommended Limit | Rationale |
|-----------|-------------------|-----------|
| Per-user per hour | 30 fetches | Prevents sustained abuse |
| Per-conversation turn | 5 fetches | Matches existing step limits |
| Per-domain per minute | 3 requests | Prevents hammering a single site |
| Anonymous users | 10 fetches per day | Daily message limit is the primary control |

### Legal/Ethical

- **User-initiated fetches** (user shares a URL) are analogous to a browser acting on behalf of the user — distinct from autonomous crawling. ChatGPT, Perplexity, and Claude all fetch user-provided URLs without robots.txt checks.
- **Robots.txt**: Voluntary protocol (RFC 9309). For user-initiated fetches, treat like a user agent. Not legally binding.
- **Mitigation**: Rate limit aggressively, don't cache/redistribute content long-term, attribute sources in responses.
- Set a descriptive `User-Agent` header (e.g., `NotAWrapper/1.0 (User-initiated content fetch)`).

---

## 4. Context Budget Management

### Token Reduction from Extraction

The extraction pipeline (Readability + Turndown) provides massive token savings:

| Page Type | Raw HTML Tokens | After Extraction | Reduction |
|-----------|----------------|-----------------|-----------|
| Blog post | ~16,000 | ~3,150 | 80% |
| E-commerce | ~40,000 | ~2,000 | 95% |
| News article | 15–25K | 2–5K | 75–80% |

### Token Counting

| Approach | Speed | Accuracy | Portability |
|----------|-------|----------|-------------|
| `characters / 4` heuristic | Instant | ±15% | All models |
| `js-tiktoken` (exact BPE) | 1,494–31,334 ops/sec | Exact for OpenAI | OpenAI only |
| `@dqbd/tiktoken` (WASM) | 1,992 ops/sec | Exact for OpenAI | OpenAI only |

**Recommendation**: Use `content.length / 4` heuristic for budget gating at fetch time. Different providers tokenize differently — the heuristic is more portable than exact counting with one tokenizer. Reserve exact counting for when approaching hard limits.

English prose ratios: ~176 tokens per 1,000 characters (GPT-4o), ~185 tokens per 1,000 characters (GPT-4/cl100k).

### Budget Framework

For a 128K context window model:

```
┌──────────────────────────────────────────────────┐
│         USABLE CONTEXT: ~100K tokens             │
│       (128K window - 28K safety margin)          │
├──────────────────────────────────────────────────┤
│                                                  │
│  Fixed Costs:                           7–15K    │
│  ├── System prompt                      2–5K     │
│  ├── Tool definitions                   2–5K     │
│  └── Static instructions                3–5K     │
│                                                  │
│  Variable Costs:                        50–70K   │
│  ├── Conversation history               10–30K   │
│  ├── Fetched web content                20–40K   │
│  └── Tool results (non-web)             5–10K    │
│                                                  │
│  Reserved:                              8–15K    │
│  ├── Response generation                4–8K     │
│  └── Reasoning overhead                 4–8K     │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Allocation rule**: Fetched content budget = `min(user_limit, model_context_window * 0.25)`.

20–25% of the model's practical context limit is the sweet spot — enough to be useful, conservative enough to leave room for conversation history and response generation.

### Model-Aware Defaults

| Model Family | Context Window | Practical Limit (~65%) | Content Budget (25%) |
|-------------|---------------|----------------------|---------------------|
| GPT-4o / GPT-5 | 128K | ~83K | 20K |
| Claude Sonnet/Opus | 200K | ~130K | 30K |
| Gemini 1.5 Pro | 1M | ~650K | 100K |
| Small models (32K) | 32K | ~21K | 5K |

Models claiming large context windows become unreliable well before the advertised limit. Performance degrades at ~65% of advertised capacity with "sudden performance drops rather than gradual degradation."

### Smart Truncation

Truncation priority order:
1. Section/heading boundaries (best)
2. Paragraph boundaries (good)
3. Sentence boundaries (acceptable)
4. Word boundaries (minimum viable)

Never truncate at arbitrary character offsets — boundary-aware truncation preserves significantly more useful information at the same token count.

### Monitoring Thresholds

| Context Occupancy | Action |
|-------------------|--------|
| < 70% | Normal operation |
| 70% | Soft cap — trigger history summarization |
| 85–90% | Hard cap — refuse new tool calls or drop low-value chunks |
| 95%+ | Emergency compression |

---

## 5. Architecture Placement

### Options Analysis

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **A. Layer 2 standalone tool** | Add `content_extract` alongside `web_search` in `lib/tools/third-party.ts` | Minimal change, follows existing patterns, model decides when to use it | New tool name in all providers |
| **B. Search enhancement** | Automatically fetch full content for top search results | Better UX for "search and read" | Wastes tokens/money on results the model doesn't need |
| **C. Provider-native** | Use each provider's own fetch tool where available | Highest quality (Claude's dynamic filtering) | Only Anthropic has this; inconsistent across providers |
| **D. MCP server** | Optional MCP server users install | Zero default footprint | Requires opt-in configuration, not discoverable |
| **E. Separate "browsing" mode** | Toggle between search and browse modes | Clear UX intent | Complicates the interface, ChatGPT-style complexity |

### Recommendation: A (Layer 2 Standalone) with Exa as MVP Backend

**Rationale**: The existing Phase 7.7 plan in `.agents/plans/phase-7-future-tool-integrations.md` already describes this approach with Exa's `getContents()`. It requires:
- Zero new dependencies (Exa SDK already installed)
- Minimal code change (~30 lines in `lib/tools/third-party.ts`)
- Same API key as search (unified BYOK billing)
- $1/1K pages (cheaper than search at $5/1K)

**Enhancement path** (post-MVP):
1. **MVP**: Exa `getContents()` — zero new deps, immediate value
2. **V2**: Self-hosted pipeline (`fetch` + `@mozilla/readability` + `turndown`) — zero per-request cost, better for high-volume
3. **V3**: Specialized extractors (YouTube transcripts, GitHub, PDFs) — highest quality per content type
4. **V4**: Jina Reader fallback for JS-rendered pages — covers the SPA edge case

### Access Control

| User Type | Recommendation | Rationale |
|-----------|----------------|-----------|
| Authenticated | Full access, 30 fetches/hour | Primary user base |
| Anonymous | Allowed, 10 fetches/day | At $1/1K pages, worst case ~$0.01/day per anonymous user. Daily message limit is the real control. |
| BYOK | Full access, their own API costs | Same Exa key handles search and extraction |

### Tool Decision: Model-Driven (`toolChoice: "auto"`)

The model should decide when to use `content_extract` based on user intent. No proactive URL extraction — URLs appear in code snippets, reference links, and other contexts where fetching would be wrong. Claude, GPT-5, and Gemini all demonstrate good judgment about when URL content is needed vs. when the URL is just a reference.

---

## 6. Specialized Content Types

### Value vs Complexity Assessment

| Extractor | Value | Complexity | Verdict | Priority |
|-----------|-------|------------|---------|----------|
| YouTube transcripts | Very High — unique content AI can't get otherwise | Low (one npm package) | **Must have** | V3 |
| PDF | High — common link type, needs specialized parsing | Low (`unpdf`, one function) | **Must have** | V3 |
| GitHub | High — structured data (issues, code, README) | Low-Medium (Octokit, REST API) | **Must have** | V3 |
| Wikipedia | Medium — cleaner than generic scraping | Very Low (REST API, no auth) | **Worth it** | V3 |
| Twitter/X | Medium — tweets are short | Low (oEmbed, free) but unreliable for threads | **Worth it** | V4 |

### YouTube

Neither ChatGPT nor Claude can reliably extract YouTube transcripts today. This is a real differentiation opportunity.

| Library | Version | Weekly Downloads | Notes |
|---------|---------|-----------------|-------|
| `youtube-transcript` | 1.2.1 | 135.6K | Most popular, zero deps, MIT |
| `youtube-transcript-plus` | 1.2.0 | Growing | Fork with proxy/custom-fetch support (Feb 2026) |

```typescript
import { YoutubeTranscript } from 'youtube-transcript';
const transcript = await YoutubeTranscript.fetchTranscript('dQw4w9WgXcQ');
// Returns: [{ text: string, duration: number, offset: number, lang?: string }]
```

Uses unofficial YouTube endpoints (timedtext API). Technically violates YouTube ToS. Widely tolerated at low volume with rate limiting and caching. The official YouTube Data API v3 cannot download transcript text.

### PDF

| Library | Weekly Downloads | Serverless | Notes |
|---------|-----------------|------------|-------|
| `unpdf` | 266.8K | Yes | Modern, zero deps, recommended |
| `pdf-parse` | ~2.2M | No | Most downloaded but unmaintained |
| `pdfjs-dist` | High | No | Low-level, maximum control |

**`unpdf`** is the clear winner — zero dependencies, works in Node.js/Bun/Deno/Cloudflare Workers, bundles PDF.js v5.4:

```typescript
import { extractText, getDocumentProxy } from 'unpdf';
const buffer = await fetch(pdfUrl).then(r => r.arrayBuffer());
const pdf = await getDocumentProxy(new Uint8Array(buffer));
const { totalPages, text } = await extractText(pdf, { mergePages: true });
```

Quality: excellent for text, poor for tables (loses structure), no OCR for scanned PDFs. A 100-page PDF ≈ 30–50K tokens.

### GitHub

GitHub REST API with `@octokit/rest` (~3.5M weekly downloads). Rate limits: 60 req/hour unauthenticated, 5,000 req/hour authenticated. Standard pattern for "summarize this repo": fetch README + repo metadata + directory tree + package.json.

URL detection covers:
- `github.com/{owner}/{repo}` → README + metadata
- `github.com/{owner}/{repo}/issues/{number}` → issue body + comments
- `github.com/{owner}/{repo}/pull/{number}` → PR description + diff stats
- `github.com/{owner}/{repo}/blob/{branch}/{path}` → file content

### Wikipedia

REST API at `en.wikipedia.org/api/rest_v1/` provides clean endpoints. No auth required. `wikipedia` npm package (v2.1.2) provides `page.summary()` and `page.content()`. `wtf_wikipedia` (v10.4.1, 6.7K weekly downloads) parses wikitext into structured sections.

### Architecture: URL Router Pattern

```
User shares URL → URL Detector (regex) → Specialized Extractor or Generic Fallback
                                          ↓
                                   Normalized Output: { type, title, content (markdown), metadata, sourceUrl, tokenEstimate }
```

All extractors return the same `ExtractedContent` shape, keeping downstream LLM prompt logic consistent regardless of source type. The generic fallback (Exa `getContents` for MVP, Readability+Turndown for V2) handles the long tail.

---

## 7. Hosted Services and APIs

### Comparison Matrix

| Service | Best For | JS Render | Pricing | Self-Host | Latency |
|---------|----------|-----------|---------|-----------|---------|
| **Exa `getContents`** | Search + extraction pipeline | Yes (internal) | $1/1K pages | No | Fast (cached) |
| **Jina Reader** (`r.jina.ai`) | Simple URL → Markdown | Yes (headless Chrome) | Free 1M tokens, then token-based | Yes (Apache 2.0) | Fast |
| **Tavily Extract** (`@tavily/ai-sdk`) | AI SDK integration | Unknown | Credit-based | No | Medium |
| **Firecrawl** | Structured extraction + crawling | Yes (Chromium) | Free 500 credits, $16–$599/mo | Yes (AGPL, Docker) | Medium |
| **Browserless** | Full browser automation | Yes | Free 1K units, $200–$500/mo | Yes | Variable |

### Exa `getContents()` — MVP Backend

Already integrated via `exa-js`. `getContents()` fetches and extracts content from specific URLs:

```typescript
const results = await exa.getContents(urls, {
  text: { maxCharacters: 10000 },
});
```

- **$1/1K pages** (vs $5/1K search requests)
- Returns from Exa's cache (instant), falls back to live crawl
- Content extraction options: text (markdown), highlights (AI excerpts), summary (LLM-generated)
- Same API key as search — unified BYOK
- No new dependency

### Jina Reader — JS-Rendered Fallback

Prefix any URL with `https://r.jina.ai/` → returns clean Markdown. Uses Readability + Turndown internally, with Puppeteer for JS rendering. Processes 100 billion tokens daily. Open source (Apache 2.0).

- Free tier: ~1M tokens (IP-based rate limits)
- Supports CSS selectors, image captions, PDF reading
- ReaderLM-v2 option for higher quality (3x token cost)
- No npm package needed — simple HTTP API

### Tavily Extract — AI SDK Native

The `@tavily/ai-sdk` (v0.4.1) provides a `tavilyExtract()` tool that plugs directly into Vercel AI SDK's `tools` parameter:

```typescript
import { tavilyExtract } from "@tavily/ai-sdk";
tools: { extract: tavilyExtract({ format: "markdown" }) }
```

Cleanest integration for AI SDK, but adds a new dependency and API key. ~4.6K weekly downloads.

### Self-Hosted Pipeline — Long-Term

For zero per-request cost:

```typescript
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

async function fetchAndExtract(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article) return '';
  return new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
    .turndown(article.content);
}
```

Dependencies: `jsdom` (~14M/wk), `@mozilla/readability` (~500K/wk), `turndown` (~2.37M/wk). Total: ~3 new dependencies. Full pipeline: ~300–500ms per page.

---

## 8. Caching Strategy

### Should Fetched Content Be Cached?

**Yes, with short TTL and per-user isolation.**

Web page content changes. Caching too aggressively returns stale data; not caching at all wastes API credits and increases latency for repeated URLs (common in multi-turn conversations about the same page).

### Recommended Approach

| Dimension | Recommendation | Rationale |
|-----------|----------------|-----------|
| **TTL** | 15–30 minutes | Long enough for multi-turn conversations about the same URL; short enough that content stays fresh |
| **Scope** | Shared cache (same URL = same content) | No privacy concern — content is publicly accessible by URL. Shared cache maximizes hit rate. |
| **Storage** | In-memory (Map or LRU cache) for MVP | No infrastructure dependency. Process-level cache is fine for single-server deployments. |
| **Key** | Normalized URL (strip tracking params, normalize case) | Prevent duplicate fetches for equivalent URLs |
| **Eviction** | LRU with 500-entry cap | Prevents unbounded memory growth |
| **Privacy** | Don't log URLs fetched | URLs can reveal user interests and browsing patterns |

### Implementation Sketch

```typescript
const cache = new Map<string, { content: string; fetchedAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ENTRIES = 500;

function getCached(url: string): string | null {
  const entry = cache.get(normalizeUrl(url));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(normalizeUrl(url));
    return null;
  }
  return entry.content;
}
```

### What Not To Cache

- URLs with authentication tokens or session-specific content
- Content fetched via POST or non-idempotent requests
- Error responses (cache misses, not failures)

### Scaling Beyond In-Memory

If the application scales to multiple server instances, migrate to Redis or Convex-backed cache. Redis LangCache provides semantic caching (matches semantically similar queries to cached results) — relevant for search results but overkill for URL content caching where the key is the exact URL.

---

## 9. Recommendations

### Progressive Enhancement Path

| Phase | What | Dependencies | Per-Request Cost | Coverage |
|-------|------|-------------|-----------------|---------|
| **MVP** | Exa `getContents()` tool in Layer 2 | None (Exa already installed) | $1/1K pages | Static HTML, cached pages |
| **V2** | Self-hosted Readability + Turndown pipeline | `jsdom`, `@mozilla/readability`, `turndown` | $0 | Static HTML (no JS rendering) |
| **V3** | Specialized extractors (YouTube, PDF, GitHub, Wikipedia) | `youtube-transcript`, `unpdf`, `@octokit/rest`, `wikipedia` | $0 (mostly) | Structured content from known platforms |
| **V4** | Jina Reader fallback for JS-rendered pages | None (HTTP API) | Token-based | SPAs, JS-rendered content |
| **V5** | SSRF hardening + production rate limiting | `ssrf-agent-guard` or `request-filtering-agent` | $0 | Security |

### MVP Specification (Phase 7.7 Alignment)

The MVP aligns with the existing plan in `.agents/plans/phase-7-future-tool-integrations.md` Sub-Phase 7.7:

**Tool name**: `content_extract`
**Location**: `lib/tools/third-party.ts` (alongside `web_search`)
**Backend**: Exa `getContents()`
**Input**: `{ urls: z.array(z.string().url()).min(1).max(5) }`
**Output**: `{ ok, data: [{ url, title, content }], error, meta }`
**Content limit**: 10,000 characters per URL (≈2,500 tokens)
**Cost**: $1/1K pages (`estimatedCostPer1k: 1`)
**Timeout**: 15s (existing `TOOL_EXECUTION_TIMEOUT_MS`)
**Access**: All users (authenticated and anonymous)
**Tool metadata**: `{ displayName: "Read Page", source: "third-party", serviceName: "Exa", readOnly: true }`

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model triggers fetch | `toolChoice: "auto"` | Model judges intent better than URL regex |
| Content format | Markdown | Token-efficient, preserves structure, industry standard |
| Content budget default | 10K chars (MVP), model-aware in V2 | Conservative start; can increase based on usage data |
| Caching | In-memory LRU, 15-min TTL | Simple, effective for multi-turn conversations |
| SSRF protection | `ssrf-agent-guard` (V5) | Most complete TypeScript library; not needed for MVP since Exa handles fetching |
| Specialized extractors | V3 (after generic works) | YouTube transcripts are the highest-value differentiator |

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Exa extraction quality varies by page | Medium — some pages return poor content | V2 self-hosted pipeline as fallback; Jina Reader for JS-rendered pages |
| Exa service outage | High — tool becomes unavailable | Timeout + graceful error messaging; V2 self-hosted pipeline as backup |
| SSRF vulnerability (V2 self-hosted) | Critical — server-side URL fetching | Defer self-hosted fetching to V5 with proper SSRF protection |
| Context budget overflow | Medium — degraded model performance | `chars / 4` budget gating; smart truncation at paragraph boundaries |
| YouTube scraping breaks | Medium — unofficial API can change | Cache transcripts; degrade gracefully to generic page scraping |
| Cost at scale | Low — $1/1K pages is cheap | BYOK passes cost to user; platform key has existing billing controls |

### Dependencies Summary

| Phase | New Dependencies | Bundle Impact |
|-------|-----------------|---------------|
| MVP | None | None |
| V2 | `jsdom`, `@mozilla/readability`, `turndown` | ~2 MB (server-only, no client bundle impact) |
| V3 | `youtube-transcript`, `unpdf`, `wikipedia` | ~200 KB (server-only) |
| V4 | None (HTTP API to Jina) | None |
| V5 | `ssrf-agent-guard` | ~50 KB (server-only) |

---

## Appendix A: Tavily as Alternative to Exa

The `@tavily/ai-sdk` (v0.4.1) provides `tavilyExtract()` that plugs directly into AI SDK's tool system. It handles URL extraction with configurable format (markdown/text) and depth (basic/advanced). Extract API supports up to 20 URLs simultaneously.

**Comparison with Exa `getContents()`**:

| Dimension | Exa | Tavily |
|-----------|-----|--------|
| Already integrated | Yes (`exa-js`) | No (new dependency) |
| AI SDK plugin | Via `@exalabs/ai-sdk` (not used due to BYOK) | Via `@tavily/ai-sdk` |
| Pricing | $1/1K pages | Credit-based (varies) |
| BYOK support | Yes (explicit key constructor) | Yes (API key param) |
| Batch size | Unlimited | 20 URLs |
| Output format | Text, highlights, summary | Markdown, text |

**Verdict**: Exa is the correct MVP choice — already integrated, zero new dependencies, cheaper, proven in the codebase.

## Appendix B: Full Library Reference

| Library | npm Package | Version | Weekly Downloads | License |
|---------|-------------|---------|-----------------|---------|
| Readability | `@mozilla/readability` | 0.6.0 | ~500K | Apache 2.0 |
| Turndown | `turndown` | 7.2.0 | ~2.37M | MIT |
| jsdom | `jsdom` | latest | ~14M | MIT |
| node-html-markdown | `node-html-markdown` | 1.3.0 | ~328K | MIT |
| unpdf | `unpdf` | latest | 266.8K | MIT |
| youtube-transcript | `youtube-transcript` | 1.2.1 | 135.6K | MIT |
| youtube-transcript-plus | `youtube-transcript-plus` | 1.2.0 | Growing | MIT |
| wikipedia | `wikipedia` | 2.1.2 | Moderate | MIT |
| wtf_wikipedia | `wtf_wikipedia` | 10.4.1 | 6.7K | MIT |
| ssrf-agent-guard | `ssrf-agent-guard` | 1.1 | New | MIT |
| request-filtering-agent | `request-filtering-agent` | latest | ~101K | MIT |
| Tavily AI SDK | `@tavily/ai-sdk` | 0.4.1 | ~4.6K | MIT |
| Exa SDK | `exa-js` | latest | Moderate | MIT |
