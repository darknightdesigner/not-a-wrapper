# Research Plan: Chat Widget Cards — Achieving Visual Parity with ChatGPT

> **Created**: February 20, 2026
> **Status**: Plan (not yet executed)
> **Goal**: Research how ChatGPT renders rich interactive widget cards (news carousels, source cards, inline citation badges, structured tool-output UIs) and develop actionable recommendations for implementing equivalent capabilities in Not A Wrapper.
> **Related**: [markdown-rendering-audit.md](../markdown-rendering-audit.md), [competitive-feature-analysis.md](../competitive-feature-analysis.md)

---

## Table of Contents

1. [Background & Motivation](#1-background--motivation)
2. [Research Scope](#2-research-scope)
3. [Phase 1: Reverse-Engineer ChatGPT's Widget System](#phase-1-reverse-engineer-chatgpts-widget-system)
4. [Phase 2: Survey Official Documentation & Standards](#phase-2-survey-official-documentation--standards)
5. [Phase 3: Open-Source Implementations & Prior Art](#phase-3-open-source-implementations--prior-art)
6. [Phase 4: Widget Libraries, Plugins & Component Ecosystems](#phase-4-widget-libraries-plugins--component-ecosystems)
7. [Phase 5: Server-Driven UI Patterns & Protocols](#phase-5-server-driven-ui-patterns--protocols)
8. [Phase 6: Metadata Enrichment & Link Preview Services](#phase-6-metadata-enrichment--link-preview-services)
9. [Phase 7: Evaluate, Compare & Recommend](#phase-7-evaluate-compare--recommend)
10. [Output Artifacts](#output-artifacts)
11. [Research Constraints](#research-constraints)

---

## 1. Background & Motivation

When ChatGPT answers "What are the top news highlights right now?", it renders:

1. **A horizontal carousel of news article cards** — each card has a thumbnail image, source favicon, source name, article title, snippet, and date
2. **Inline citation badges** — pill-shaped labels (e.g., `Reuters`, `Fox News +1`) placed directly after the claim they support
3. **A collapsible "Sources" footer** — favicon row summarizing all referenced sources

Not A Wrapper (using the same GPT 5.2 model via API) answers the same question with **better content quality** (more substantive, deeper analysis, better source selection) but renders everything as **plain markdown with inline hyperlinks**. The visual gap undermines perceived quality.

This research plan investigates how to close that visual gap by understanding the technical mechanisms behind ChatGPT's widget cards and evaluating all viable approaches for implementing equivalent capabilities.

### What We Already Know

From our initial investigation (conversation 2026-02-20):

- ChatGPT uses a **server-driven UI** architecture where structured tool outputs (not markdown) drive rich widget rendering
- The `web_search_preview` tool returns structured metadata (URL, title, image, source name, date, snippet) alongside text
- ChatGPT's frontend has a **component registry** that maps tool output schemas to React widget components
- The cards are rendered **outside** the markdown pipeline — they're a separate rendering layer
- NaW already has `source-url` parts from AI SDK v6, `SourcesList` (collapsible), and `LinkMarkdown` (favicon pills)
- NaW's `message-assistant.tsx` already has a multi-part rendering pipeline (reasoning → tools → images → text → sources)

### Success Criteria

The research is complete when we can answer:

1. What is the exact data flow from web search tool → structured metadata → widget component?
2. What open-source projects have implemented similar widget card systems?
3. What libraries, protocols, or standards exist for server-driven UI in chat?
4. What metadata enrichment strategy gives the best cost/quality tradeoff?
5. Which implementation approach best fits NaW's existing architecture (Next.js, AI SDK v6, Convex)?

---

## 2. Research Scope

### In Scope

- ChatGPT's widget card rendering (news cards, source badges, citation system)
- Claude.ai's source rendering and Artifacts system (for comparison)
- Gemini's grounding citations and source cards
- Perplexity's citation-first card design
- Open-source AI chat UIs (Open WebUI, LibreChat, LobeChat, ChatBot UI, HuggingChat)
- Vercel AI SDK v6 structured output capabilities
- Server-driven UI patterns (SDUI) used by Meta, Airbnb, Shopify
- Link preview / Open Graph metadata services
- React component libraries for cards, carousels, and citation UIs
- Streaming-compatible widget rendering
- Accessibility considerations for rich widgets in chat

### Out of Scope

- Artifacts / Canvas (interactive code execution) — separate research track
- Image generation inline — separate feature
- Voice/audio widget rendering
- Mobile-native widget rendering (focus is web/React)

---

## Phase 1: Reverse-Engineer ChatGPT's Widget System

**Objective**: Document exactly how ChatGPT transforms web search results into visual widget cards.

### 1.1 Network Traffic Analysis

Inspect ChatGPT's API responses when web search is active:

- [ ] Use browser DevTools on `chatgpt.com` to capture the streaming response payload when asking a news question
- [ ] Document the response format — identify where structured card data lives vs. where markdown text lives
- [ ] Identify all field names in the search result schema (title, url, image, snippet, source, date, favicon, etc.)
- [ ] Determine if card data arrives as a separate event/chunk in the SSE stream or is embedded in the text response
- [ ] Check if citation markers in the text (`[Reuters]`, `[1]`, etc.) have a standardized format the frontend parses

### 1.2 Frontend Component Analysis

Inspect ChatGPT's rendered DOM to understand the widget component structure:

- [ ] Document the DOM structure of a news article card (elements, classes, data attributes)
- [ ] Document the DOM structure of an inline citation badge
- [ ] Document the carousel/grid container (horizontal scroll, responsive behavior, card count)
- [ ] Identify any `data-*` attributes or class patterns that reveal the component framework
- [ ] Check if cards are rendered as part of the message content or as a separate sibling element
- [ ] Note the placement order: do cards appear above, below, or interleaved with the markdown text?

### 1.3 Tool Output Schema Documentation

Research OpenAI's official documentation for the `web_search_preview` tool:

- [ ] Search OpenAI API docs for `web_search_preview` tool output schema
- [ ] Search OpenAI API docs for `web_search` tool configuration
- [ ] Document the official response format for search results
- [ ] Identify if the structured metadata (images, dates) is part of the tool result or fetched separately by the frontend
- [ ] Check if the Responses API returns different search metadata than the Chat Completions API
- [ ] Document any differences between what the API returns vs. what `chatgpt.com` renders (i.e., does the frontend enrich the data further?)

### Research Sources (Phase 1)

| Source | URL/Method | What to Look For |
|--------|-----------|------------------|
| OpenAI API Docs — Web Search | `https://platform.openai.com/docs/guides/tools-web-search` | Tool output schema, structured fields |
| OpenAI API Reference — Responses | `https://platform.openai.com/docs/api-reference/responses` | Response format with search annotations |
| OpenAI Cookbook | `https://github.com/openai/openai-cookbook` | Examples of web search result rendering |
| ChatGPT DevTools | Browser F12 on `chatgpt.com` | Network tab SSE payloads, DOM inspection |
| OpenAI Community Forum | `https://community.openai.com` | Discussions about search result format |
| Twitter/X | Search `chatgpt web search API response format` | Developer observations and reverse-engineering |

### Deliverable

`phase-1-chatgpt-widget-architecture.md` — Documented schema, data flow diagram, and component hierarchy for ChatGPT's widget card system.

---

## Phase 2: Survey Official Documentation & Standards

**Objective**: Catalog official documentation from AI providers and UI frameworks on rendering rich tool outputs in chat.

### 2.1 Vercel AI SDK v6 — Structured Tool Outputs

- [ ] Read AI SDK v6 docs on `tool` definition with `experimental_toToolResultContent` and structured returns
- [ ] Read AI SDK v6 docs on `source-url` part type — what fields are available?
- [ ] Research AI SDK v6 `onToolCall` and `onToolResult` hooks for client-side enrichment
- [ ] Check if AI SDK v6 has a concept of "annotations" or "metadata" on message parts
- [ ] Search for AI SDK examples that render custom React components from tool results
- [ ] Review `@ai-sdk/ui-utils` for any widget-related utilities
- [ ] Check Vercel's AI chatbot template (`ai-chatbot`) for tool result rendering patterns

**Key URLs**:
- `https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling`
- `https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-protocol`
- `https://sdk.vercel.ai/docs/ai-sdk-ui/streaming-custom-data`
- `https://github.com/vercel/ai-chatbot`
- `https://github.com/vercel/ai/tree/main/examples`

### 2.2 OpenAI — Structured Outputs & Annotations

- [ ] Read OpenAI docs on Structured Outputs (`response_format: { type: "json_schema" }`)
- [ ] Read OpenAI docs on annotations in the Responses API
- [ ] Check if the `web_search_preview` tool returns `url_citation` annotations with OG metadata
- [ ] Document any official guidance on rendering search results in custom UIs

**Key URLs**:
- `https://platform.openai.com/docs/guides/structured-outputs`
- `https://platform.openai.com/docs/api-reference/responses/object` (annotations field)

### 2.3 Google Gemini — Grounding & Citations

- [ ] Read Gemini API docs on grounding with Google Search
- [ ] Document the `groundingMetadata` response field — what structured data does it return?
- [ ] Check if Gemini returns `searchEntryPoint`, `groundingChunks`, `groundingSupports` with image/card metadata
- [ ] Review how `gemini.google.com` renders grounding citations in its UI

**Key URLs**:
- `https://ai.google.dev/gemini-api/docs/grounding`
- `https://ai.google.dev/api/rest/v1beta/GroundingMetadata`

### 2.4 Anthropic Claude — Tool Use & Source Rendering

- [ ] Read Anthropic docs on tool use response format
- [ ] Check if Claude's `web_search` tool (if available) returns structured metadata
- [ ] Document how `claude.ai` renders citations from its web search
- [ ] Note any MCP (Model Context Protocol) patterns for structured tool outputs

**Key URLs**:
- `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use`
- `https://modelcontextprotocol.io/docs`

### 2.5 Server-Driven UI Standards

- [ ] Research Meta's Server-Driven UI pattern (used in Facebook, Instagram)
- [ ] Read Airbnb's blog post on Server-Driven UI ("A Deep Dive into Airbnb's Server-Driven UI System")
- [ ] Review Shopify's Hydrogen framework for server-component-driven UI patterns
- [ ] Research JSON-based UI specification formats (JSON:API, Hypermedia, HTMX patterns)
- [ ] Check if there's an emerging standard for "AI chat widget protocol"

### Deliverable

`phase-2-official-docs-survey.md` — Comprehensive catalog of official documentation, supported schemas, and provider-specific capabilities for structured tool output rendering.

---

## Phase 3: Open-Source Implementations & Prior Art

**Objective**: Find and analyze open-source AI chat projects that render rich widget cards from tool results.

### 3.1 Open WebUI

- [ ] Clone/browse `https://github.com/open-webui/open-webui`
- [ ] Find how web search results are rendered (search for citation, source, card components)
- [ ] Document the component hierarchy for search result rendering
- [ ] Note the data flow: API response → state → widget component
- [ ] Check if they use a plugin/extension system for custom widgets

### 3.2 LibreChat

- [ ] Browse `https://github.com/danny-avila/LibreChat`
- [ ] Search for citation/source rendering in the React frontend
- [ ] Document any structured tool output → widget mapping
- [ ] Check for Bing/Google search result card rendering

### 3.3 LobeChat

- [ ] Browse `https://github.com/lobehub/lobe-chat`
- [ ] Search for plugin rendering system (LobeChat has a plugin architecture)
- [ ] Document how plugins render custom UI within chat messages
- [ ] Check for search result cards, link previews, or structured output widgets
- [ ] Note LobeChat's `renderPlugin` pattern

### 3.4 Vercel AI Chatbot Template

- [ ] Browse `https://github.com/vercel/ai-chatbot`
- [ ] Search for tool result rendering (weather, stock, search examples)
- [ ] Document the pattern for mapping tool names to React components
- [ ] Note how they handle streaming + widget rendering lifecycle

### 3.5 ChatBot UI

- [ ] Browse `https://github.com/mckaywrigley/chatbot-ui`
- [ ] Search for any structured output or widget rendering

### 3.6 HuggingChat

- [ ] Browse `https://github.com/huggingface/chat-ui`
- [ ] Search for web search citation rendering (HuggingChat uses web search)
- [ ] Document the Svelte component pattern for source cards

### 3.7 Perplexity-Inspired Projects

- [ ] Search GitHub for `perplexity clone citation cards`
- [ ] Search for `perplexity-style search UI react`
- [ ] Document any open-source implementations of Perplexity's citation card system

### 3.8 Morphic (Vercel)

- [ ] Browse `https://github.com/miurla/morphic`
- [ ] This is a Perplexity-like search app built with AI SDK — document their search result card rendering
- [ ] Note the `SearchResults` component pattern

### 3.9 Additional Projects

- [ ] Search GitHub for repos tagged `ai-chat-widget`, `search-result-cards`, `citation-ui`
- [ ] Search npm for packages: `react-search-cards`, `chat-widget-cards`, `link-preview-card`
- [ ] Check Product Hunt for AI chat apps with notable widget/card UIs

### For Each Project, Document

1. **Tech stack** (React/Svelte/Vue, styling, state management)
2. **Data flow** (how tool outputs become widget props)
3. **Component architecture** (card component, container, responsive behavior)
4. **Streaming compatibility** (do widgets render during streaming or only after?)
5. **Extensibility** (can new widget types be added easily?)
6. **Code quality** (maintainable? well-typed? accessible?)
7. **Screenshots** (capture representative examples)

### Deliverable

`phase-3-open-source-analysis.md` — Comparative analysis of open-source widget card implementations with architecture diagrams, code excerpts, and quality assessments.

---

## Phase 4: Widget Libraries, Plugins & Component Ecosystems

**Objective**: Evaluate ready-made React component libraries, UI kits, and plugins that could accelerate widget card implementation.

### 4.1 Link Preview Components

- [ ] Evaluate `react-link-preview` — does it fetch OG metadata and render cards?
- [ ] Evaluate `@microlink/react` (Microlink SDK) — automatic link preview cards
- [ ] Evaluate `react-tiny-link` — lightweight link preview
- [ ] Evaluate `opengraph-react` — OG metadata fetching + rendering
- [ ] Compare: bundle size, API dependency, customizability, SSR support

### 4.2 Card / Carousel Components

- [ ] Evaluate `embla-carousel-react` — lightweight carousel (already popular in Shadcn ecosystem)
- [ ] Evaluate `swiper` — full-featured carousel/slider
- [ ] Evaluate `keen-slider` — performant, lightweight slider
- [ ] Evaluate `nuka-carousel` — Formidable Labs carousel
- [ ] Compare: bundle size, touch support, accessibility, responsive behavior, Tailwind compatibility

### 4.3 Citation / Reference Components

- [ ] Search npm for `react-citation`, `react-footnote`, `react-reference`
- [ ] Evaluate Prompt Kit's `Source` component (`components/ui/source.tsx` — already in codebase)
- [ ] Research academic citation UI patterns (Google Scholar, Semantic Scholar)
- [ ] Check if any design system (Material UI, Ant Design, Chakra) has citation/source components

### 4.4 Chat-Specific Widget Libraries

- [ ] Evaluate `@chatscope/chat-ui-kit-react` — does it support custom message types?
- [ ] Evaluate `stream-chat-react` (Stream) — widget message extensions
- [ ] Evaluate `@sendbird/uikit-react` — structured message types
- [ ] Check if any of these support custom "card" message types

### 4.5 Markdown Extensions for Widgets

- [ ] Research `remark` / `rehype` plugins that could render structured blocks as widgets
- [ ] Evaluate `rehype-external-links` for link enrichment
- [ ] Research if `react-markdown` supports custom node types beyond standard HTML
- [ ] Check if Streamdown has widget/card plugin support
- [ ] Search for `remark-embed`, `remark-card`, `remark-link-preview` plugins

### 4.6 Shadcn/Base UI Patterns

- [ ] Check Shadcn registry for card, carousel, or hover-card components
- [ ] Evaluate `HoverCard` from Base UI for inline link previews
- [ ] Check Shadcn's card component for structured content display
- [ ] Review Shadcn/Vercel templates for any chat widget patterns

### Deliverable

`phase-4-libraries-evaluation.md` — Evaluation matrix of all candidate libraries with bundle size, API surface, accessibility, streaming compatibility, and NaW integration feasibility scores.

---

## Phase 5: Server-Driven UI Patterns & Protocols

**Objective**: Research architectural patterns for mapping structured data to UI components in a streaming chat context.

### 5.1 Component Registry Pattern

Research how to build a registry that maps tool output types to React components:

- [ ] Document Meta's SDUI component registry (public talks, blog posts)
- [ ] Document Vercel AI Chatbot's tool→component mapping pattern
- [ ] Research React Server Components as a SDUI mechanism
- [ ] Evaluate a discriminated union approach: `{ type: "search_cards" } → <SearchCards />`
- [ ] Consider extensibility: how to add new widget types without modifying the registry core

### 5.2 Streaming-Compatible Widget Rendering

Research how to render structured widgets during streaming:

- [ ] When should cards appear? (a) After tool completes, (b) Progressively as data arrives, (c) After full message
- [ ] How to handle the transition from "tool loading" → "card rendered" → "text continues"
- [ ] Research skeleton/placeholder patterns for cards loading during streaming
- [ ] Check how NaW's current tool invocation rendering lifecycle maps to this

### 5.3 Inline Citation Replacement

Research how to replace citation markers in streamed text with interactive components:

- [ ] Document ChatGPT's citation marker format and frontend parsing
- [ ] Research Perplexity's `[1]` → badge replacement system
- [ ] Evaluate: parse citations in markdown (custom remark plugin) vs. post-process rendered HTML vs. custom React component in markdown renderer
- [ ] Consider streaming: citations reference sources that may not have loaded yet

### 5.4 Data Enrichment Pipeline

Research where in the pipeline to enrich source data with metadata:

- [ ] **Option A**: Server-side enrichment in `route.ts` — fetch OG metadata before sending to client
- [ ] **Option B**: Client-side enrichment — frontend fetches metadata for each source URL
- [ ] **Option C**: Proxy/edge enrichment — dedicated API route or edge function for metadata
- [ ] **Option D**: Pre-cached enrichment — maintain a metadata cache (Convex or Redis) for known domains
- [ ] Compare: latency, cost, cache hit rates, streaming compatibility, cold start behavior

### Deliverable

`phase-5-sdui-patterns.md` — Architecture patterns document with data flow diagrams, component registry design, and streaming integration strategy.

---

## Phase 6: Metadata Enrichment & Link Preview Services

**Objective**: Evaluate services and techniques for fetching rich metadata (images, titles, descriptions) from URLs.

### 6.1 Open Graph Metadata Fetching

- [ ] Document the Open Graph protocol (`og:title`, `og:image`, `og:description`, `og:site_name`)
- [ ] Evaluate server-side OG fetching: `open-graph-scraper` (npm), `metascraper` (npm), `unfurl.js`
- [ ] Benchmark response times for fetching OG metadata from 10 common news sites
- [ ] Document edge cases: paywalled sites, dynamic SPAs, missing OG tags, rate limiting

### 6.2 Link Preview APIs (Third-Party)

- [ ] Evaluate **Microlink API** (`https://api.microlink.io`) — pricing, rate limits, data quality
- [ ] Evaluate **LinkPreview API** (`https://www.linkpreview.net`) — pricing, accuracy
- [ ] Evaluate **OpenGraph.io** (`https://opengraph.io`) — features, pricing
- [ ] Evaluate **jsonlink.io** — free tier, reliability
- [ ] Evaluate **Iframely** (`https://iframely.com`) — enterprise-grade, oEmbed support
- [ ] Compare: cost at 1K/10K/100K requests per month, latency, data fields returned, reliability

### 6.3 Self-Hosted Metadata Fetching

- [ ] Evaluate running `metascraper` or `open-graph-scraper` in a Vercel Edge Function
- [ ] Evaluate a Convex action for OG metadata fetching with caching
- [ ] Estimate Vercel Edge Function costs for metadata fetching at scale
- [ ] Research caching strategies: CDN cache headers, Convex document cache, in-memory LRU

### 6.4 Favicon Services

- [ ] Document Google Favicon API (`https://www.google.com/s2/favicons?domain=...`) — already used in NaW
- [ ] Evaluate `https://icon.horse/icon/` as an alternative
- [ ] Evaluate `https://favicone.com/` — reliability, resolution options
- [ ] Compare quality across services for major news domains

### 6.5 Image Proxy & Optimization

- [ ] Research how to proxy external OG images through Next.js Image Optimization
- [ ] Evaluate `next/image` with `remotePatterns` for dynamic external images
- [ ] Consider image CDN services (Cloudinary, imgix) for on-the-fly resizing
- [ ] Document fallback strategies when OG images are missing or broken

### Deliverable

`phase-6-metadata-enrichment.md` — Service comparison matrix, cost projections, caching strategy recommendations, and fallback handling patterns.

---

## Phase 7: Evaluate, Compare & Recommend

**Objective**: Synthesize all research into three concrete, industry-standard recommendations with detailed pros/cons analysis.

### 7.1 Evaluation Criteria

Score each approach (1–5) across these dimensions:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **User experience** | 25% | Visual quality, interactivity, perceived quality improvement |
| **Implementation effort** | 20% | Engineering time, complexity, risk of regressions |
| **Architecture fit** | 20% | Alignment with NaW's stack (Next.js, AI SDK v6, Convex, streaming pipeline) |
| **Performance** | 15% | Bundle size impact, streaming latency, metadata fetch overhead |
| **Maintainability** | 10% | Long-term maintenance burden, upgrade path, dependency health |
| **Extensibility** | 10% | Ability to add new widget types (weather, stocks, maps, code execution) beyond search cards |

### 7.2 Develop Three Recommendations

Each recommendation should represent a distinct strategy on the effort/impact spectrum:

#### Recommendation A: Minimal — Enhance Existing Pipeline

*Lowest effort, quickest win*

- Enrich `source-url` parts with OG metadata
- Upgrade `SourcesList` to render cards instead of a flat list
- Add inline citation badge replacement in markdown
- No new architectural patterns

#### Recommendation B: Moderate — Component Registry + Server Enrichment

*Balanced effort/impact*

- Build a typed component registry mapping tool output types to widget React components
- Add server-side OG metadata fetching in `route.ts` or dedicated edge function
- Create `SearchResultCard`, `SourceCarousel`, `InlineCitation` components
- Integrate with existing `message-assistant.tsx` rendering pipeline

#### Recommendation C: Full — Server-Driven UI Widget System

*Maximum capability, highest effort*

- Implement a full SDUI widget protocol for chat messages
- Support arbitrary widget types (search cards, weather, stocks, maps, code, files)
- Build a widget plugin system for extensibility
- Consider Streamdown migration for the text layer

### 7.3 For Each Recommendation, Document

1. **Architecture diagram** — data flow from API to rendered widget
2. **Component inventory** — every new component needed
3. **Estimated effort** — person-days for each phase
4. **Pros** — specific advantages with evidence from research
5. **Cons** — specific risks, costs, and tradeoffs
6. **Dependencies** — npm packages, services, API keys needed
7. **Migration path** — how to incrementally adopt without breaking existing functionality
8. **Streaming compatibility** — how widgets interact with the streaming lifecycle
9. **Accessibility** — ARIA patterns, keyboard navigation, screen reader support

### 7.4 Final Comparison Matrix

| Dimension | Rec A (Minimal) | Rec B (Moderate) | Rec C (Full SDUI) |
|-----------|----------------|------------------|-------------------|
| Effort | ? days | ? days | ? days |
| Visual parity with ChatGPT | ?% | ?% | ?% |
| Bundle size impact | +? KB | +? KB | +? KB |
| New dependencies | ? | ? | ? |
| Extensibility | Low | Medium | High |
| Risk | Low | Medium | Medium-High |

### 7.5 Recommended Implementation Sequence

Regardless of which recommendation is chosen, provide a phased rollout plan:

1. Phase 1: Quick wins (inline citations, card upgrade)
2. Phase 2: Metadata enrichment pipeline
3. Phase 3: Full widget system (if Rec B or C)

### Deliverable

`phase-7-recommendations.md` — The final recommendations document with all three options, comparison matrix, and recommended implementation sequence.

---

## Output Artifacts

When all phases are complete, the `chat-widgets/` directory should contain:

```
.agents/design/chatgpt-reference/chat-widgets/
├── RESEARCH-PLAN.md                          ← This file
├── phase-1-chatgpt-widget-architecture.md    ← ChatGPT reverse-engineering
├── phase-2-official-docs-survey.md           ← Provider docs & standards
├── phase-3-open-source-analysis.md           ← OSS implementations
├── phase-4-libraries-evaluation.md           ← Component libraries & plugins
├── phase-5-sdui-patterns.md                  ← Architecture patterns
├── phase-6-metadata-enrichment.md            ← Metadata services & caching
├── phase-7-recommendations.md                ← Final 3 recommendations
└── assets/                                   ← Screenshots, diagrams
```

---

## Research Constraints

### Technical Context

- **Framework**: Next.js 16, React 19, TypeScript
- **AI SDK**: Vercel AI SDK v6 (streaming, tool calling, `source-url` parts)
- **Database**: Convex (reactive, can be used for metadata caching)
- **UI**: Shadcn/Base UI + Tailwind 4
- **Current rendering**: `react-markdown` with remark/rehype pipeline, per-block memoization
- **Current source rendering**: `SourcesList` (collapsible) + `LinkMarkdown` (inline favicon pills)
- **Streaming**: SSE-based, must not block or delay text streaming

### Quality Standards

- All recommendations must be **production-grade**, not prototypes
- Accessibility (WCAG 2.1 AA) is non-negotiable for any widget component
- Performance budgets: widgets should not add >100ms to perceived message render time
- Bundle size: lazy-load anything >20KB that isn't needed for every message

### Research Methodology

- Prefer **primary sources** (official docs, source code) over blog posts
- When citing open-source code, include **specific file paths and line numbers**
- When evaluating libraries, check **npm download trends**, **last publish date**, **open issues count**
- All cost estimates should include **free tier limits** and **projected costs at NaW's scale**
- Screenshot or archive any key findings that might disappear (blog posts, tweets)

### Agent Instructions

When executing this research plan:

1. **Execute phases sequentially** — each phase builds on the previous
2. **Write deliverables as you go** — don't wait until the end
3. **Be skeptical of outdated information** — verify all findings against 2026-current docs
4. **Prioritize actionable findings** — skip theoretical deep dives that don't inform implementation
5. **Cross-reference across phases** — note when Phase 3 findings contradict Phase 2 docs, etc.
6. **Flag uncertainties** — mark any finding with confidence level (High/Medium/Low) and note what would increase confidence
7. **Include code snippets** — for library evaluations, include minimal usage examples
8. **Test when possible** — if a library can be installed and tested quickly, do it

---

*Plan created February 20, 2026. Ready for execution.*
