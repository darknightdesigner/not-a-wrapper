# Web Search Defaults in AI Chat Applications

> Research conducted: February 12, 2026
> Purpose: Understand how major AI chat apps handle web search defaults, UX patterns, and technical implementation options for Not A Wrapper.

---

## 1. How Major AI Chat Apps Handle Web Search

### ChatGPT (OpenAI)

**Approach: Auto-detect with manual override**

- Web search is **default-on** — ChatGPT automatically decides whether to search based on the query
- The model triggers search when:
  - User explicitly asks to search ("search", "latest news", "check online")
  - Query requires **fresh/time-sensitive info** (stock prices, sports, weather)
  - Topic is **niche/highly specific** (startup pricing, local restaurant menus)
  - **Accuracy is critical** and outdated info could be misleading (regulations, library versions)
- The model **skips search** when: answer is stable (historical facts, math, physics)
- Users can manually trigger search via the search icon or typing "/"
- Sources and citations are shown inline in responses
- Uses OpenAI's own web index (OAI-Searchbot) + Microsoft Bing partnership
- Memory integration: if enabled, ChatGPT uses saved memories to enhance search queries

**API (Responses API):**
- `web_search_preview` tool available for developers
- Streaming support with `in_progress`, `searching`, `completed` states
- Pricing: included in token costs (no separate per-search fee disclosed publicly)

### Claude (Anthropic)

**Approach: Opt-in tool with smart auto-triggering**

- Web search launched May 2025 on API, May 27 globally on all plans
- **Not default-on** — users must enable it in chat settings (toggle)
- Once enabled, Claude **auto-determines** when to search
- Can conduct multiple progressive searches for deeper research
- Web fetch tool added September 2025 for analyzing specific URLs

**API:**
- Tool type: `web_search_20250305`
- **Pricing: $10 per search query** (separate from token costs)
- Key params: `max_uses`, `allowed_domains`, `blocked_domains`, `user_location`
- Available on: Opus 4.6/4.5, Sonnet 4.5/4, Haiku 4.5
- Admin controls: domain allow/block lists for organizations

### Perplexity

**Approach: Always-on (search-first architecture)**

- Web search is **always on** — it's the core product identity
- Every query triggers real-time web retrieval (200M+ daily queries)
- Built custom Search API after finding commercial APIs insufficient
- Uses hybrid retrieval: intelligent crawling + external APIs + context-rich snippet extraction
- Treats individual sections/spans of documents as first-class units (not whole pages)
- Multi-stage ranking pipeline with distributed indexing
- Self-hosted reasoning models (DeepSeek R1) for summarization
- Semantic search via neural networks + embedding-based retrieval
- Every response includes citations by default

### Google Gemini

**Approach: Developer-configurable grounding tool**

- **Grounding with Google Search** is a configurable tool, not default-on
- When enabled via `google_search` tool, model auto-decides when to search
- Returns `groundingMetadata` with search queries, web results, citations
- Supported on all Gemini 1.5+ models

**API:**
- Tool: `google.tools.googleSearch({})`
- **Pricing: $35 per 1,000 grounded queries** ($0.035/query)
- Gemini 3 billing started January 5, 2026
- Free testing in Google AI Studio

---

## 2. Open-Source Projects

### LibreChat

**Approach: Admin-configurable defaults with UI toggle**

- `webSearch` toggle in Interface Config — **defaults to `true`** (visible)
- Web search button is shown by default in chat interface
- Admins control via `librechat.yaml`:
  - Search providers: Serper, SearXNG
  - Scrapers: Firecrawl, Serper
  - Rerankers: Jina, Cohere
- Agents config: `web_search` defaults to enabled in capabilities list
- Safe search mode enabled by default
- Can be disabled per-agent by removing from capabilities array

### Open WebUI

**Approach: Global admin config + per-chat RAG toggle**

- Web search configured globally via environment variables
- `ENABLE_RAG_WEB_SEARCH: True` enables the feature
- Supports multiple engines: SearXNG (free), Brave, Google PSE, etc.
- Users prefix queries with `#` + URL to fetch specific pages
- Native Function Calling for agentic search (models autonomously explore web)
- Results can be saved to Knowledge Base
- **No granular per-chat toggle** — more of a global on/off pattern
- Context length warning: web pages typically 4,000-8,000+ tokens

### ChatKit (Third-party UI)

- Toggle button appears **next to model name** in chat interface
- **State persists across chats**: if enabled in one chat, new chats inherit the setting
- Models with built-in search (Perplexity, Cohere) search internally
- Other models use function calling with DuckDuckGo/Google

---

## 3. Vercel AI SDK Implementation Patterns

### Two Approaches

The AI SDK supports two fundamentally different approaches:

#### A. Native Provider Search (Built-in)
Models with built-in web search — faster, no extra cost per search, less control.

```typescript
// OpenAI Responses API
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const { text, sources } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'What happened last week?',
  tools: {
    web_search: openai.tools.webSearch({}),
  },
});

// Google Gemini Grounding
import { google } from '@ai-sdk/google';
const { text, sources, providerMetadata } = await generateText({
  model: 'google/gemini-2.5-flash',
  tools: {
    google_search: google.tools.googleSearch({}),
  },
  prompt: 'Latest SF news',
});

// Perplexity (always-on, no tools needed)
const { text, sources } = await generateText({
  model: 'perplexity/sonar-pro',
  prompt: 'Latest AI developments?',
});
```

#### B. External Tool Search (Flexible)
Third-party search tools — works with any model, more control, extra cost.

```typescript
// Vercel AI Gateway — Provider-agnostic Perplexity search
import { gateway } from '@ai-sdk/gateway';
// Uses gateway.tools.perplexitySearch()
// $5 per 1,000 requests

// Exa Search
import { webSearch } from '@exalabs/ai-sdk';
const { text } = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  tools: { webSearch: webSearch() },
  stopWhen: stepCountIs(3),
});

// Tavily Search
import { tavilySearch, tavilyExtract } from '@tavily/ai-sdk';
const { text } = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  tools: {
    webSearch: tavilySearch(),
    webExtract: tavilyExtract(),
  },
  stopWhen: stepCountIs(3),
});

// Perplexity Search (as tool for any model)
import { perplexitySearch } from '@perplexity-ai/ai-sdk';
const { text } = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  tools: { search: perplexitySearch() },
  stopWhen: stepCountIs(3),
});
```

### Key Technical Details

- **Multi-step tool calls**: Use `stopWhen: stepCountIs(n)` for tool → response flow
- **Sources**: All approaches return `sources` array with URLs and titles
- **Provider metadata**: Google returns `providerMetadata.google.groundingMetadata`
- **Streaming**: Works with both `generateText` and `streamText`
- **Vercel AI Gateway**: Provider-agnostic search via `@ai-sdk/gateway` package

### Vercel AI Gateway Perplexity Search

Provider-agnostic web search that works with any model:
- **Pricing: $5 per 1,000 requests** ($0.005/query)
- Configurable: `maxResults` (1-20), `maxTokens`, language/domain/recency filters
- Accessed via `gateway.tools.perplexitySearch()`

---

## 4. UX Best Practices for Web Search Toggle

### Toggle Placement
- **ChatKit pattern**: Button next to model name — prominent, model-specific context
- **ChatGPT pattern**: Search icon in input area + "/" shortcut — accessible but not obtrusive
- **Claude pattern**: Toggle in chat settings — more intentional, less discoverable
- **LibreChat pattern**: Toolbar button in chat interface — always visible

### State Persistence
- **Best practice**: Toggle state persists across new chats (ChatKit pattern)
- Reduces friction for users who consistently want search on/off
- Per-chat override should still be available

### Visual Feedback
- Show search indicator when model is actively searching
- Display source citations inline with responses
- Progress states: `searching...` → `found X sources` → cited response

### Discoverability
- New users should understand search is available (onboarding hint or default-on)
- Power users need quick toggle without disrupting flow
- Keyboard shortcut for toggling (ChatGPT's "/" pattern)

---

## 5. Comparison: Default Strategies

| Strategy | Examples | Pros | Cons |
|----------|----------|------|------|
| **Always-on** | Perplexity | Consistent behavior, always current, no user decision needed | Higher cost per query, slower responses, unnecessary for knowledge-based queries |
| **Auto-detect** | ChatGPT | Smart — only searches when needed, saves cost, feels magical | Unpredictable, user can't control when search happens, model may misjudge |
| **Opt-in toggle** | Claude, LibreChat | User control, clear expectations, cost-conscious | Lower discoverability, extra friction, users may forget to enable |
| **Per-model** | ChatKit | Different models have different search capabilities, appropriate defaults | Complex UX, confusing for non-technical users |
| **User preference** | (recommended hybrid) | User sets their default, overridable per-chat | Requires settings UI, needs good defaults |

### Recommended Approach for Not A Wrapper

Given the multi-provider architecture, a **hybrid approach** is recommended:

1. **Global user preference**: "Enable web search by default" toggle in settings (default: ON for models that support it)
2. **Per-chat override**: Toggle in chat input toolbar (inherits from user preference)
3. **Smart provider routing**:
   - Models with native search (Perplexity Sonar): always search, no extra cost
   - Models with provider search (OpenAI, Gemini, Claude): use native provider tools
   - Models without search: use Vercel AI Gateway Perplexity search or custom tool
4. **Visual feedback**: Search indicator during search, citations in response
5. **Cost awareness**: Show estimated cost impact when toggling search on (for BYOK users)

---

## 6. Cost Comparison

| Provider/Tool | Cost per Search | Notes |
|--------------|-----------------|-------|
| Perplexity Sonar (native) | Included in token costs | ~$1/1M input tokens |
| OpenAI web_search | Included in token costs | No separate search fee disclosed |
| Google Grounding | $0.035/query | $35 per 1,000 queries |
| Anthropic web_search | **$10/query** | Very expensive, separate from tokens |
| Vercel AI Gateway (Perplexity) | $0.005/query | $5 per 1,000 requests |
| Exa | Varies | Based on plan |
| Tavily | Varies | Based on plan |

**Key insight**: Anthropic's web search is 200x more expensive per query than Vercel AI Gateway's Perplexity search. For BYOK users, cost transparency is critical.

---

## 7. Implementation Recommendations for Not A Wrapper

### Phase 1: Foundation
1. Add web search toggle to chat input toolbar
2. Store preference per-user in Convex (`webSearchEnabled: boolean`)
3. Persist toggle state across new chats
4. Implement with Vercel AI Gateway Perplexity search (provider-agnostic, cheapest)

### Phase 2: Provider-Native Search
1. Route to native search for supported providers:
   - OpenAI: `openai.tools.webSearch({})`
   - Google: `google.tools.googleSearch({})`
   - Perplexity: built-in (no tool needed)
2. Fall back to Gateway Perplexity search for unsupported providers

### Phase 3: Advanced
1. Auto-detect mode: model decides when to search (like ChatGPT)
2. Per-model search defaults in model config
3. Citation rendering in chat UI
4. Search result caching to reduce costs
5. Admin controls for self-hosted deployments

### Technical Architecture

```
User toggles "Search" → 
  Chat sends { webSearchEnabled: true } →
    API route checks provider:
      if (provider has native search) → add provider search tool
      else → add gateway.tools.perplexitySearch()
    streamText({ tools: { ...searchTools }, ... })
    → Response includes sources[] → 
      UI renders citations
```

---

## Sources

- [ChatGPT Search](https://help.openai.com/en/articles/9237897-chatgpt-search)
- [OpenAI Web Search API](https://platform.openai.com/docs/guides/tools-web-search)
- [Anthropic Web Search API](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search-tool)
- [Anthropic Web Search Blog](https://www.anthropic.com/news/web-search-api)
- [Perplexity Architecture](https://www.frugaltesting.com/blog/behind-perplexitys-architecture-how-ai-search-handles-real-time-web-data)
- [Perplexity Search API](https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api)
- [Gemini Grounding](https://ai.google.dev/gemini-api/docs/grounding)
- [LibreChat Web Search](https://www.librechat.ai/docs/features/web_search)
- [Open WebUI RAG](https://docs.openwebui.com/features/rag/)
- [Vercel AI SDK Web Search Agent](https://sdk.vercel.ai/cookbook/node/web-search-agent)
- [Vercel AI Gateway Web Search](https://vercel.com/docs/ai-gateway/web-search)
- [Vercel + Perplexity Blog](https://vercel.com/blog/use-perplexity-web-search-with-vercel-ai-gateway)
