# Research Prompt: Tool Calling Infrastructure

> **Status**: Ready for Research
> **Priority**: P1 — Strategic
> **Date**: February 11, 2026
> **Output**: `.agents/context/research/tool-calling-infrastructure.md`

---

## Instructions

You are a research agent. Your task is to produce a comprehensive research document at **`.agents/context/research/tool-calling-infrastructure.md`**. The document must follow the exact output structure defined below.

Use web search, official documentation, and codebase analysis to fill every section with substantive findings. Do not leave placeholder text — every section must contain real content. If information is unavailable or uncertain, state that explicitly.

After completing the research document, return here and update the **Status** above to `✅ Research Complete`.

---

## Research Objective

Research and document the industry-standard approaches to tool calling infrastructure in AI chat applications. Understand how leading companies architect their tool ecosystems, how API-as-a-tool providers (like Exa.ai) design their developer experience, and how our current MCP-only approach compares. Produce actionable recommendations for evolving Not A Wrapper's tool calling architecture.

---

## Research Questions

### 1. API-as-a-Tool Providers (Exa, Tavily, etc.)

Investigate how companies that sell "AI-native APIs" design their products to be consumed as tools by AI applications:

- **Exa.ai**: How does their search API work? What makes it "AI-native" vs a traditional search API? How do they structure their API responses for optimal LLM consumption? What SDK/integration patterns do they offer (Vercel AI SDK tool wrapper, LangChain tool, raw REST)?
- **Tavily**: Same analysis — how does their search API differ from Exa? What's their developer experience for integrating as a tool?
- **Firecrawl**: How do they position web scraping as an AI tool? What's their integration surface?
- **What patterns do these providers share?** Do they all provide pre-built Vercel AI SDK `tool()` definitions? Do they publish MCP servers? Do they offer both?

### 2. Platform Tool Calling Architectures

Research how major AI chat platforms implement tool calling:

- **ChatGPT (OpenAI)**: How does their tool/plugin/GPT Actions system work? What's the architecture — built-in tools (code interpreter, DALL-E, browsing) vs user-configured tools (GPT Actions via OpenAPI specs)? How do they handle tool approval, sandboxing, and result rendering?
- **Claude (Anthropic)**: How does claude.ai handle tools? Built-in tools (analysis tool, artifacts) vs MCP integrations vs API-level tool use? What's their computer use / tool use API architecture?
- **Gemini (Google)**: How does Google implement grounding, search, code execution as tools? What's their "extensions" architecture?
- **Vercel AI SDK**: What is the canonical way to implement tool calling with the AI SDK? How do `tool()`, `streamText({ tools })`, `maxSteps`, and `onStepFinish` work together? What patterns does Vercel recommend for production tool calling?
- **v0 / Vercel Chat**: How does Vercel's own v0 product handle tool calling internally? Do they use built-in tools, MCP, or a hybrid?

### 3. Industry Standard Patterns

Identify the emerging consensus on tool calling architecture:

- **Built-in vs User-configured**: What's the standard split? Do most platforms offer a set of "blessed" built-in tools (search, code execution, image generation) alongside user-extensible tool systems?
- **Tool registries**: How are tools discovered, registered, and managed? Is there a standard schema (OpenAPI, MCP tool schema, JSON Schema)?
- **Tool approval and safety**: How do platforms handle tool approval flows? Pre-approved built-in tools vs explicit user consent for third-party tools?
- **Agentic loops**: What's the standard `maxSteps` / iteration pattern? How do platforms prevent infinite tool loops? What's the UX for multi-step tool use?
- **Tool result rendering**: How are tool results displayed to users? Raw JSON vs rich UI cards vs inline rendering? Do platforms use tool-specific renderers?
- **Streaming with tools**: How do platforms handle streaming when tools are involved? Is there a standard pattern for streaming text → tool call → tool result → more text?
- **MCP adoption**: How widely adopted is MCP as a standard? Is it becoming the universal tool protocol, or are there competing standards? What are MCP's limitations in production (cold start, connection management, error handling)?

### 4. Our Current Architecture — Gap Analysis

Analyze Not A Wrapper's current approach against industry standards:

**Current state (document from codebase scan):**
- Tool calling is **exclusively MCP-based** — no built-in tools
- Gated behind `ENABLE_MCP=true` environment variable
- Per-request MCP client creation (stateless serverless pattern)
- Tools loaded from user-configured MCP servers stored in Convex
- Tool namespacing: `${serverSlug}_${toolName}`
- Max 50 tools per request, max 20 steps, 5s connection timeout
- UI renders tool invocations with collapsible cards showing args/results
- User preference toggle for showing/hiding tool invocations
- Tool approval system per individual tool
- Audit logging to `mcpToolCallLog` Convex table

**Questions to answer:**
- What are the **advantages** of our MCP-only approach? (flexibility, no vendor lock-in, user control)
- What are the **disadvantages**? (no out-of-the-box tools, cold start latency, user must configure everything, no search/code execution by default)
- How does our approach compare to ChatGPT's hybrid (built-in + actions) model?
- Should we add **built-in tools** alongside MCP? If so, which ones have the highest impact? (web search, code execution, image generation, file operations?)
- How would built-in tools coexist with MCP tools in `streamText({ tools })`?
- What's the migration path from pure-MCP to a hybrid approach?

---

## Research Methodology

### Phase 1: Web Research (Primary)
- Search for official documentation: Exa.ai docs, Tavily docs, Vercel AI SDK tool calling docs, OpenAI tool use docs, Anthropic tool use docs, Google Gemini extensions docs
- Search for blog posts and engineering articles about tool calling architecture at scale
- Search for MCP adoption reports and comparisons (MCP vs OpenAPI tools vs function calling)
- Search for Vercel AI SDK examples of built-in tool patterns (e.g., `@ai-sdk/google` grounding, `@ai-sdk/openai` built-in tools)

### Phase 2: Codebase Analysis
- Read `app/api/chat/route.ts` — current tool integration point
- Read `lib/mcp/load-tools.ts` — current tool loading architecture
- Read `lib/config.ts` — current MCP constants
- Read `lib/models/data/*.ts` — model tool capability flags
- Read `app/components/chat/tool-invocation.tsx` — current tool UI rendering
- Read `convex/mcpServers.ts` and `convex/mcpToolCallLog.ts` — current tool data model

### Phase 3: Synthesis
- Compare architectures in a decision matrix
- Identify highest-impact gaps
- Propose concrete recommendations with implementation effort estimates
- Draft an architecture for a hybrid built-in + MCP tool system

---

## Key Search Queries

```
exa.ai API integration vercel ai sdk tool calling 2026
tavily search API ai sdk tool integration
vercel ai sdk tool calling best practices 2026
vercel ai sdk built-in tools maxSteps streamText
openai function calling vs tool use architecture 2026
anthropic tool use MCP architecture production
chatgpt gpt actions tools architecture
google gemini extensions grounding tools api
MCP model context protocol adoption 2026 production
ai chat application built-in tools architecture
tool calling infrastructure ai application best practices
firecrawl ai tool integration
ai sdk @tool decorator pattern vercel
streaming tool calls vercel ai sdk pattern
```

---

## Output: Research Document Structure

Generate the research file at **`.agents/context/research/tool-calling-infrastructure.md`** with exactly this structure. Fill every section with substantive findings from your research.

```markdown
# Tool Calling Infrastructure Research

> **Date**: February 11, 2026
> **Status**: ✅ Research Complete
> **Scope**: Industry analysis of tool calling patterns for AI chat applications
> **Related**: `.agents/plans/tool-calling-infrastructure-research.md` (this prompt)

---

## 1. Executive Summary

[3-5 bullet points of the most important findings. What is the industry converging on? Where does Not A Wrapper stand? What's the single highest-impact recommendation?]

---

## 2. API-as-a-Tool Provider Analysis

### 2.1 Exa.ai
[How their search API works. What makes it "AI-native". API structure, pricing model, SDK integrations (Vercel AI SDK, LangChain, MCP). Example code for integrating Exa as a tool.]

### 2.2 Tavily
[Same analysis. How it differs from Exa. Speed, cost, response format. Integration patterns.]

### 2.3 Firecrawl
[Web scraping as an AI tool. Crawl vs scrape vs extract. Integration surface.]

### 2.4 Common Patterns Across Providers
[What do these providers share? Pre-built tool() wrappers? MCP servers? Dual SDK+MCP support? Standard response shapes?]

---

## 3. Platform Architecture Comparison

### 3.1 ChatGPT (OpenAI)
[Built-in tools (code interpreter, DALL-E, browsing, deep research). GPT Actions (OpenAPI spec). Plugin/connector architecture. Approval model. Sandboxing. Result rendering.]

### 3.2 Claude (Anthropic)
[Built-in tools (analysis, artifacts, computer use). MCP integrations. API-level tool use. Tool result format. Streaming behavior with tools.]

### 3.3 Gemini (Google)
[Grounding with Google Search. Code execution. Extensions architecture. Function calling API. Vertex AI tool patterns.]

### 3.4 Vercel AI SDK — Canonical Patterns
[tool() definition. streamText({ tools }) usage. maxSteps and step management. onStepFinish callback. Tool choice modes. Multi-step agentic patterns. activeTools for context management. Code examples using AI SDK v6.]

---

## 4. Industry Standard Patterns

### 4.1 Built-in vs User-Configured Tools
[What's the standard split? Summary table. Is there consensus?]

### 4.2 Tool Registries & Discovery
[How tools are registered. Schema standards (OpenAPI, MCP, JSON Schema). Discovery mechanisms.]

### 4.3 Safety & Approval
[Approval flows. Pre-approved built-in vs consent for third-party. Sandboxing. Rate limiting tools.]

### 4.4 Agentic Loops & Step Management
[maxSteps patterns. Preventing infinite loops. UX for multi-step tool use. Progress indicators.]

### 4.5 Result Rendering
[Raw JSON vs rich UI cards. Tool-specific renderers. Inline vs collapsible. Best UX patterns.]

### 4.6 Streaming with Tools
[Text → tool call → result → text pattern. How streaming works during tool execution. Loading states.]

### 4.7 MCP Adoption Status
[Adoption level as of Feb 2026. Which platforms support it natively? Limitations (cold start, connection, error handling). Competing standards.]

---

## 5. Not A Wrapper Gap Analysis

### 5.1 Current Architecture Strengths
[What our MCP-only approach does well. Unique positioning.]

### 5.2 Current Architecture Weaknesses
[What we're missing compared to competitors. Friction points for users.]

### 5.3 Comparison Matrix

| Capability | ChatGPT | Claude | Gemini | Not A Wrapper | Gap Level |
|------------|---------|--------|--------|---------------|-----------|
| Built-in web search | ... | ... | ... | ... | ... |
| Built-in code execution | ... | ... | ... | ... | ... |
| Built-in image generation | ... | ... | ... | ... | ... |
| User-configured tools | ... | ... | ... | ... | ... |
| MCP support | ... | ... | ... | ... | ... |
| Tool approval flow | ... | ... | ... | ... | ... |
| Tool result UI | ... | ... | ... | ... | ... |
| Agentic multi-step | ... | ... | ... | ... | ... |

---

## 6. Recommendations

### 6.1 High-Impact Built-in Tools to Add
[Prioritized list. For each: what it is, why it's high-impact, effort estimate, dependencies.]

### 6.2 Proposed Hybrid Architecture
[How built-in tools and MCP tools coexist. Architecture diagram (text-based). Tool resolution order. Configuration model.]

### 6.3 Implementation Roadmap
[Phased plan. What to build first. Dependencies between phases.]

### 6.4 Effort Estimates

| Item | Effort | Dependencies | Priority |
|------|--------|-------------|----------|
| ... | ... | ... | ... |

---

## 7. Appendix

### 7.1 Code Examples

#### Exa.ai as a Built-in Tool
[Concrete tool() definition for Exa integration in our codebase]

#### Built-in Tool Registry Pattern
[How to define and register built-in tools alongside MCP tools in app/api/chat/route.ts]

#### Hybrid Tool Merging
[Code showing how built-in + MCP tools merge before passing to streamText()]

### 7.2 Reference Links
[All documentation URLs, blog posts, and sources cited in this research]
```

---

## Success Criteria

The research is complete when:

1. Each major provider's tool API is documented with integration patterns
2. Each major platform's tool architecture is compared
3. Industry-standard patterns are identified with consensus level (universal, emerging, niche)
4. A clear gap analysis shows where Not A Wrapper stands relative to competitors
5. Concrete recommendations are prioritized by impact and effort
6. Code examples show what a built-in tool integration would look like in our codebase
7. A hybrid architecture diagram is proposed that combines built-in tools + MCP
8. The file exists at `.agents/context/research/tool-calling-infrastructure.md` with no placeholder text

---

## Notes for the Research Agent

- **Use extended thinking** (`ultrathink`) — this is a strategic architecture research task
- **Prioritize primary sources** — official docs over blog posts, engineering articles over opinion pieces
- **Be specific about Vercel AI SDK v6** — our codebase uses `toUIMessageStreamResponse`, not the legacy `toDataStreamResponse`
- **Include code examples** — show concrete `tool()` definitions, not just descriptions
- **Flag uncertainty** — if a pattern is speculative or based on limited evidence, say so
- **Consider our constraints** — serverless (Vercel), Convex database, open-source, BYOK model — recommendations must work within these boundaries
- **Write directly to the output file** — do not return the research as a response; write it to `.agents/context/research/tool-calling-infrastructure.md`
