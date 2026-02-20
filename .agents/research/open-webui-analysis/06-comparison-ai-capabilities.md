# Comparison: AI Capabilities — Open WebUI vs. Not A Wrapper

> **Agent**: Agent 6
> **Phase**: 2 (Parallel)
> **Status**: Complete
> **Primary Dependency**: `02-ai-engine-tools.md`, `02b-tool-infrastructure.md`
> **Also Read**: `01-architecture-code-quality.md`, `03-data-layer-scalability.md`, `04-ux-features-extensibility.md`
> **Cross-Reference**: `competitive-feature-analysis.md` (prior ChatGPT/Claude comparison), `.agents/plans/tool-calling-infrastructure.md`, `.agents/plans/phase-7-future-tool-integrations.md`, `.agents/plans/cross-conversation-memory.md`
> **Date**: February 12, 2026

> **Important**: All Phase 1 outputs (01–04 plus 02b) were read before writing this document. Primary focus is AI capabilities (docs 02 + 02b), with architecture, data, and UX tracks providing cross-cutting context. Existing NaW tool-calling infrastructure and memory plans were cross-referenced to avoid contradicting prior decisions.

---

## Summary

Open WebUI's AI capabilities are the broadest in the open-source chat space — 11 vector DBs, 24+ search providers, 4 image engines, 5+ STT/TTS engines, a Python BYOF tool system, and MCP integration — but this breadth comes at the cost of a fragile middleware monolith (~2,000 lines), unsandboxed `exec()` code execution, and no provider failover. Not A Wrapper's Vercel AI SDK approach is structurally superior for provider abstraction (type-safe, SDK-native, 10 providers) and its 3-layer tool architecture (provider tools → Exa fallback → MCP) is already better designed than Open WebUI's flat tool picker. The key adoption targets are: the unified tool server interface pattern (MCP + OpenAPI through one abstraction), memory with dual-storage and tool exposure, built-in tool conditional injection (global config AND per-model capability gating), and task model separation for cost optimization. The key capabilities structurally blocked by NaW's serverless/TypeScript stack are: local model inference, local Whisper/sentence-transformers, stdio MCP transport, persistent Python tool execution, and long-lived WebSocket connections. For each blocked capability, API-based alternatives exist that are viable in NaW's architecture.

## Input Traceability (Required)

Key Phase 1 claim IDs used in this comparison:

- `A2A-*`: A2A-C01 (dual proxy), A2A-C02 (OpenAI-compat proxy), A2A-C03 (middleware monolith), A2A-C04 (no failover), A2A-C05 (model cache TTL), A2A-C07 (30-retry tool loop), A2A-C08 (content blocks), A2A-C09 (arena/Elo), A2A-C10 (post-processing tasks), A2A-C11 (custom model wrapping), A2A-C13 (reasoning tag detection), A2A-C14 (unlimited timeout), A2A-C15 (reasoning model handling)
- `A2B-*`: A2B-C01 (exec() no sandbox), A2B-C02 (runtime pip install), A2B-C03 (Valves system), A2B-C04 (auto-generated tool specs), A2B-C05 (unified tool server interface), A2B-C06 (vector DB ABC), A2B-C07 (memory dual storage), A2B-C08 (24+ web search providers), A2B-C09 (hybrid RAG), A2B-C10 (4 image engines), A2B-C11 (5 STT + 4 TTS), A2B-C12 (25+ built-in tools), A2B-C13 (80+ RAG config params), A2B-C14 (8+ extraction engines)
- `A1-*`: A1-C01 (2000-line main.py), A1-C03 (350+ config vars), A1-C04 (disabled CI), A1-C06 (custom auth), A1-C12 (default JWT secret)
- `A3-*`: A3-C02 (JSON blob chat storage), A3-C05 (11 vector DBs), A3-C06 (socket.io real-time), A3-C10 (OpenTelemetry)
- `A4-*`: A4-C04 (unsandboxed exec), A4-C09 (tool execution bugs), A4-C12 (TipTap rich editor), A4-C13 (UI performance issues), A4-C15 (inline triggers), A4-C16 (silent RAG failures)

---

## Comparison Evidence Table (Required)

| claim_id | comparison_claim | phase1_claim_refs | confidence | stack_fit_for_naw | comparability | notes |
|----------|------------------|-------------------|------------|-------------------|---------------|-------|
| A6-C01 | NaW's Vercel AI SDK multi-provider abstraction is structurally superior to OWUI's dual-proxy approach — type-safe, SDK-native features (structured outputs, reasoning), no format conversion overhead | A2A-C01, A2A-C02 | High | Strong | Conditionally Comparable | OWUI proxy enables arbitrary OpenAI-compat endpoints; NaW requires SDK support |
| A6-C02 | OWUI's middleware monolith (~2000 lines, 10+ concerns) is a maintenance anti-pattern that NaW's route.ts + separate tool layers already avoids | A2A-C03, A1-C01 | High | Strong | Directly Comparable | NaW's layered architecture (route.ts ← provider.ts ← third-party.ts ← MCP) is cleaner |
| A6-C03 | Neither system has provider-level failover; NaW should add it as both face the same gap | A2A-C04, A2A-C14 | High | Strong | Directly Comparable | Easy to add via AI SDK retry/fallback wrappers; high user impact |
| A6-C04 | OWUI's unsandboxed exec() tool system is a security anti-pattern; NaW's MCP + typed built-in tools approach is safer by design | A2B-C01, A2B-C02, A4-C04 | High | Strong | Conditionally Comparable | OWUI exec() enables rapid plugin creation but at critical security cost |
| A6-C05 | OWUI's unified tool server interface (local + OpenAPI + MCP through one picker) is a clean pattern NaW should adopt | A2B-C05 | High | Strong | Directly Comparable | NaW's 3-layer architecture is compatible; unifying the surface for MCP + built-in tools is straightforward |
| A6-C06 | OWUI's built-in tool conditional injection (global config AND per-model capabilities) should be adopted; aligns with NaW's planned ToolCapabilities type | A2B-C12 | High | Strong | Directly Comparable | Phase 7.0 ToolCapabilities is the NaW equivalent — validates the approach |
| A6-C07 | Convex built-in vector search makes NaW's RAG path simpler than OWUI's 11-backend abstraction; adopt pipeline quality (hybrid BM25, reranking) not backend breadth | A2B-C06, A2B-C09, A3-C05 | High | Strong | Conditionally Comparable | OWUI breadth is self-hosted flexibility NaW doesn't need |
| A6-C08 | OWUI's memory system (SQL + vector dual-storage + tool exposure) maps cleanly to NaW's Convex; validates cross-conversation-memory plan Option B | A2B-C07 | High | Strong | Directly Comparable | Convex unifies storage + vector search → simpler than OWUI's dual-backend |
| A6-C09 | OWUI's 24+ web search providers are overkill; NaW's Layer 1 (provider-native) + Layer 2 (Exa fallback) strategy already covers 95%+ of use cases | A2B-C08 | High | Strong | Conditionally Comparable | Single well-integrated provider beats 24 poorly-tested ones |
| A6-C10 | Pyodide (browser WASM Python) and Jupyter (server) code execution are Not Comparable for NaW; provider sandboxes + E2B are the viable paths | A2B-C10 | High | Weak | Not Comparable | Phase 7.5 (provider code execution) already plans the correct approach |
| A6-C11 | OWUI's STT/TTS multi-engine support includes Python-only options (local Whisper, Transformers TTS) structurally blocked for NaW; API-based engines (OpenAI, Deepgram, ElevenLabs) are viable | A2B-C11 | High | Partial | Conditionally Comparable | 3 of 5 STT and 3 of 4 TTS engines work via API in TypeScript |
| A6-C12 | OWUI's custom model wrapping (base_model_id → overrides) is an elegant UX pattern NaW should adapt for user-created model presets | A2A-C11 | High | Strong | Directly Comparable | Convex `customModels` table with baseModelId, systemPrompt, params |
| A6-C13 | OWUI's task model separation (cheap model for title/tag gen) is a proven cost optimization NaW should adopt | A2A-C10 | High | Strong | Directly Comparable | Add taskModel field to user preferences; fall back to chat model |
| A6-C14 | OWUI's content block architecture (typed blocks with metadata) aligns with NaW's AI SDK parts system; reasoning display with duration tracking is directly adoptable | A2A-C08, A2A-C13 | Medium | Strong | Directly Comparable | AI SDK UIMessage.parts already provides the foundation |
| A6-C15 | OWUI's tool execution reliability is the #1 user complaint; NaW must prioritize visible failure feedback for all tool operations | A4-C09, A4-C16 | High | Strong | Directly Comparable | Tool error states, context truncation warnings, RAG failure alerts |
| A6-C16 | OWUI's Valves pattern (typed Pydantic plugin config) is adaptable to NaW via Zod schemas for tool/integration configuration | A2B-C03 | High | Partial | Conditionally Comparable | Pydantic → Zod translation is mechanical; admin/user split directly applicable |
| A6-C17 | OWUI's 30-retry tool call loop with no rate limiting is a resource exhaustion risk; NaW should cap multi-step chains and use prepareStep for progressive restriction | A2A-C07 | High | Strong | Directly Comparable | Phase 7.4 prepareStep already plans this; validated by OWUI's cautionary example |
| A6-C18 | OWUI's MCP integration treats MCP as one tool server type among many; NaW should similarly unify MCP alongside built-in tools rather than treating it as a separate system | A2B-C05 | High | Strong | Directly Comparable | NaW Layer 3 MCP already coexists; surface unification in UI/settings is the gap |
| A6-C19 | OWUI's image generation as file upload (persisted, linked to messages) is a better pattern than transient base64; NaW should adopt for any future image gen | A2B-C10 | Medium | Strong | Directly Comparable | Convex file storage provides the same persistence model |
| A6-C20 | OWUI's arena/Elo system requires Python-only embedding deps and critical mass; NaW's explicit multi-model comparison is more transparent | A2A-C09 | Medium | Weak | Conditionally Comparable | Skip Elo; enhance explicit side-by-side with user ratings if demand emerges |

---

## 1. Provider Abstraction

| Capability | Open WebUI | Not A Wrapper | Verdict |
|-----------|-----------|---------------|---------|
| Approach | Ollama proxy + OpenAI-compatible proxy (raw HTTP) | Vercel AI SDK multi-provider (SDK-native) | **NaW wins** — type safety, SDK features, no format conversion |
| Provider count | Ollama + any OpenAI-compat endpoint (unlimited) | 10 native providers, 73+ models (SDK-gated) | **Trade-off** — OWUI is more open-ended; NaW is more reliable per provider |
| BYOK | Users configure endpoints + keys (plaintext in memory) | AES-256-GCM encrypted per-provider keys | **NaW wins** — encrypted at rest, better security |
| Model metadata | Basic (from API — name, capabilities) | Rich (speed, cost, context, capabilities, reasoning flags) | **NaW wins** — enables model selection UX, cost optimization |
| Failover | None (A2A-C04); hung provider blocks indefinitely (A2A-C14) | None (same gap) | **Tie — both need improvement** |
| Reasoning model handling | Hardcoded string prefix check for o1/o3/o4/gpt-5 (A2A-C15) | SDK-native via Vercel AI SDK model configs | **NaW wins** — SDK handles provider-specific quirks |
| Azure special-casing | ~50 lines of URL rewriting, payload filtering (A2A-C12) | Handled by `@ai-sdk/azure` provider | **NaW wins** — provider-level abstraction, no custom code |

**Deep analysis**: Open WebUI's proxy-first architecture treats every non-Ollama provider as "OpenAI-compatible" — a lowest-common-denominator approach that works broadly but prevents using provider-specific SDK features (structured outputs, native tool calling, vision APIs, reasoning indicators). NaW's Vercel AI SDK approach provides type-safe interfaces per provider with automatic format handling, streaming, and token counting. The trade-off: OWUI can add any endpoint with a URL + key, while NaW requires `@ai-sdk/<provider>` support. In practice, the AI SDK covers all major providers, and the reliability benefit of SDK-native integration outweighs the flexibility of raw proxy.

**Provider failover is the shared gap.** Neither system retries failed requests, uses circuit breakers, or falls back to alternative models. OWUI's `AIOHTTP_CLIENT_TIMEOUT = None` (unlimited) is especially dangerous — a hung provider blocks server resources indefinitely. NaW should add provider-level retry with exponential backoff and configurable timeouts via AI SDK's built-in retry options.

---

## 2. Chat Completion Pipeline

| Capability | Open WebUI | Not A Wrapper |
|-----------|-----------|---------------|
| Architecture | `middleware.py` (~2000 lines): filter functions → memory injection → tool resolution → provider call → streaming → tool execution loop → post-processing | `route.ts` (~350 lines): auth → tool loading → `streamText()` → `toUIMessageStreamResponse()` |
| Middleware composition | Single deeply-nested function with shared mutable state; filter functions are the only composable element | No middleware pipeline; tool loading is layered (provider → third-party → MCP); AI SDK handles streaming |
| Streaming | SSE with content-block architecture (text, reasoning, tool_calls, code_interpreter, solution); custom tag detection | AI SDK `toUIMessageStreamResponse()` with `parts` (text, reasoning, tool-result); SDK-native streaming |
| Post-processing | 8+ configurable tasks (title, tags, follow-ups, emoji, autocomplete, MoA, image prompts, query gen) via dedicated task model | Title generation only; other tasks not implemented |
| Error handling | Inconsistent — mix of HTTPException and raw JSON; no centralized error format | Structured error responses: `{ error: string, code?: string }` with `extractErrorMessage()` |
| Tool call loop | Up to 30 retries by default (`CHAT_RESPONSE_MAX_TOOL_CALL_RETRIES`); no rate limiting | AI SDK `maxSteps` (configurable); Phase 7.4 `prepareStep` planned for progressive restriction |
| Real-time persistence | Optional per-delta DB writes (`ENABLE_REALTIME_CHAT_SAVE`) | Convex mutation after completion; real-time via Convex subscriptions |

**Key lessons from OWUI's pipeline:**

1. **Task model separation (ADOPT)**: Using a cheaper model (e.g., GPT-4o-mini) for auxiliary tasks like title and tag generation is proven cost optimization. OWUI's `TASK_MODEL` / `TASK_MODEL_EXTERNAL` pattern should be adapted as a user-configurable `taskModel` preference.

2. **Content block architecture (ADAPT)**: OWUI's typed content blocks with metadata (timestamps, duration, attributes) for reasoning display map well to NaW's AI SDK `parts` system. The key learning is: track block-level timing for "Thought for N seconds" display and support rich serialization for complex multi-step responses.

3. **Tool call limiting (ADOPT)**: OWUI's 30-retry default with no throttling is a cautionary example. NaW's Phase 7.4 `prepareStep` approach (progressive tool restriction after N steps) is the correct pattern — validated by OWUI's failure to implement it.

4. **Skip the middleware monolith pattern**: OWUI's single-function middleware orchestrating 10+ concerns is the highest-risk maintenance bottleneck in their codebase (A2A-C03). NaW's layered architecture (route.ts → provider.ts → third-party.ts → MCP) is already better decomposed.

---

## 3. Tool Calling / Function Calling

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Tool calling | Native Python BYOF + tool servers (OpenAPI + MCP) | 3-layer architecture: provider tools → Exa → MCP | **ADAPT** — adopt unified surface |
| Tool authoring | In-app Python code editor with auto-install deps | Not implemented; MCP for extensibility | **SKIP** — never exec() user code |
| Tool execution | Server-side Python via `exec()` — no sandboxing (A2B-C01) | Provider-side (Layer 1), API-based (Layer 2), MCP (Layer 3) | **SKIP** — NaW's approach is safer |
| Tool UI | Tool workspace + result display + Valves config | `tool-invocation.tsx` (renderer) + `SingleToolCard` | **ADAPT** — add error states, approval UI |
| Built-in tools | 25+ conditionally injected (global config AND model caps) (A2B-C12) | Web search (Layer 1 + 2); MCP (Layer 3) | **ADOPT** — conditional injection pattern |
| Tool spec generation | LangChain `convert_to_openai_function` from Python signatures (A2B-C04) | Zod schemas via AI SDK `tool()` | **NaW wins** — Zod is more type-safe |
| Tool result handling | Manual extraction with ast.literal_eval + JSON fallback | AI SDK-native tool result protocol | **NaW wins** — SDK handles parsing |
| Valves (typed tool config) | Pydantic models → auto-generated config UI (A2B-C03) | Not implemented | **ADAPT** — Zod schemas → settings UI |

**NaW's 3-layer tool architecture is already better designed than OWUI's flat tool system.** OWUI merges local Python tools, OpenAPI servers, and MCP servers into one `tools_dict` — clean at the API level but dangerous at the execution level (all run in the same unsandboxed process). NaW separates concerns: Layer 1 (provider-native, zero new deps), Layer 2 (third-party APIs with BYOK), Layer 3 (MCP, user-configured). Each layer has distinct security properties, cost models, and failure modes.

**What NaW should adopt from OWUI's tool system:**

1. **Unified tool surface in UI/settings** (A2B-C05): Users should see all tools (built-in, third-party, MCP) in one place with consistent access control. NaW's layers are architecturally separate but should appear unified to users.

2. **Built-in tool conditional injection** (A2B-C12): OWUI's dual-gate pattern (global config enabled AND model has capability) prevents offering tools to models that can't use them. This directly validates NaW's Phase 7.0 `ToolCapabilities` type.

3. **Valves-equivalent typed configuration** (A2B-C03): The Pydantic → auto-generated UI pattern is the most portable pattern in OWUI's tool system. NaW should implement Zod schema → settings UI generation for per-tool configuration (admin-level and per-user).

**What NaW must NOT adopt:**

1. **`exec()` for user code** (A2B-C01, A4-C04): No sandboxing, no module restrictions, no AST filtering. Any user with tool creation permission can execute arbitrary Python on the server. NaW must rely on MCP for extensibility and typed built-in tools for core capabilities.

2. **Runtime pip install** (A2B-C02): Tool frontmatter triggers arbitrary package installation. NaW tools must work within the existing runtime.

---

## 4. MCP Integration

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| MCP version | `mcp==1.25.0` | `@ai-sdk/mcp` (library exists) | — |
| Integration depth | Built into chat pipeline via `TOOL_SERVER_CONNECTIONS` | Layer 3 via `loadUserMcpTools()` | **ADAPT** — deepen config surface |
| Transport | SSE, streamable HTTP (stdio not viable — long-running backend still has process lifecycle) | SSE only (serverless constraint) | **Comparable constraint** |
| Configuration | Admin-managed tool server connections with auth types (bearer, none, session, OAuth 2.1) | Settings placeholder; user-configured per-session | **ADAPT** — add OAuth 2.1 support |
| Access control | Per-tool-server ACLs with user/group IDs, same as local tools | Per-user MCP connections | **ADAPT** — add shared team configs |
| Discovery | MCP tools listed alongside local tools in unified picker | MCP tools merged into `allTools` in route.ts | **Comparable** |
| Auth | Supports OAuth 2.1 via `oauth_client_manager` | Not implemented | **ADOPT** — MCP OAuth 2.1 support |

**Both systems face the same stdio transport limitation** — OWUI's long-running backend can't maintain stdio MCP connections across request boundaries either (the process lifecycle is longer but still bounded by deployment). SSE and streamable HTTP are the production-viable transports for both platforms.

**NaW's MCP integration is architecturally sound** (Layer 3 in route.ts) but lacks OWUI's configuration richness. Key gaps:

1. **OAuth 2.1 for MCP servers**: OWUI supports `auth_type: "oauth_2.1"` with an OAuth client manager. NaW should add this for enterprise MCP servers that require OAuth authentication.

2. **Shared team MCP configurations**: OWUI allows admin-managed tool server connections shared across users. NaW's current per-user MCP setup doesn't support team-wide tool server deployments.

3. **Tool server connection management UI**: OWUI has a dedicated admin panel for managing tool server connections. NaW needs a similar UI for adding, testing, and managing MCP servers.

---

## 5. RAG (Retrieval Augmented Generation)

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Vector DBs | 11 options (ChromaDB, PGVector, Qdrant, Milvus, etc.) behind `VectorDBBase` ABC (A2B-C06) | Convex built-in vector search (unused) | **SKIP backend breadth; ADOPT Convex vector** |
| Embedding | Local (sentence-transformers) + API (OpenAI, Ollama, Azure) with batch processing | Not implemented | **ADAPT** — API-based only (OpenAI, Cohere) |
| Content extraction | 8+ engines (Tika, Docling, Document Intelligence, Mistral OCR, etc.) (A2B-C14) | File upload only (no extraction pipeline) | **ADAPT** — start with 1-2 API-based extractors |
| Chunking | Configurable: RecursiveCharacterTextSplitter, TokenTextSplitter, MarkdownHeaderTextSplitter | Not implemented | **ADOPT** — start with RecursiveCharacter |
| Retrieval | Top-K + reranking (cross-encoder, ColBERT, Jina) + hybrid BM25 (A2B-C09) | Not implemented | **ADAPT** — Top-K via Convex, defer reranking |
| Knowledge bases | Full CRUD + `#` command for injection + access control | Projects (org only, no RAG) | **ADAPT** — knowledge bases via Convex docs |
| Config surface | 80+ RAG parameters via admin API (A2B-C13) | None | **SKIP** — sensible defaults, minimal config |

**Convex is NaW's RAG superpower.** OWUI needs 11 vector DB backends because self-hosted users have diverse infrastructure. NaW has Convex built-in vector search — zero external dependencies, automatic indexing, and reactive queries. The focus should be on pipeline quality (embedding → chunking → retrieval) not backend breadth.

**RAG adoption strategy for NaW:**

1. **Phase 1**: Add vector index to Convex schema, implement API-based embedding (OpenAI `text-embedding-3-small`), basic Top-K retrieval. Estimated 1 week.
2. **Phase 2**: Add document processing (PDF, text extraction via API), chunking with `RecursiveCharacterTextSplitter` equivalent. 1–2 weeks.
3. **Phase 3**: Knowledge base CRUD, `#` command injection (from A4-C15 inline triggers). 1 week.
4. **Defer**: Hybrid BM25, reranking, multiple extraction engines. Add when user demand proves need.

**OWUI's 80+ RAG config parameters are anti-pattern** (A2B-C13). Configuration-as-feature creates admin UX burden and makes the system fragile. NaW should ship with sensible defaults (chunk size 512, overlap 50, Top-K 5) and expose minimal configuration.

---

## 6. Code Execution

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Browser-side | Pyodide (WASM Python) — ~10MB bundle (A2B-C10) | Not implemented | **SKIP** — massive bundle, Python-only |
| Server-side | Jupyter integration (separate deployment) | Not implemented | **SKIP** — operational complexity |
| Code interpreter | Dedicated mode with prompt template + 5-retry loop | Not implemented | **ADAPT** — provider sandboxes first |
| Output | stdout, charts, files (via Pyodide/Jupyter) | Not implemented | **ADAPT** — syntax-highlighted code blocks |
| Provider sandboxes | Not used (relies on Pyodide/Jupyter) | Planned: Google, Anthropic, OpenAI (Phase 7.5) | **NaW's planned approach is better** |

**NaW's Phase 7.5 (provider code execution) is the correct architecture.** Instead of bundling Pyodide (~10MB WASM) or requiring Jupyter deployment, NaW will use provider-native sandboxes:

- **Google Gemini**: `google.tools.codeExecution({})` — native, included in token pricing
- **Anthropic Claude**: Analysis tool (beta) — sandboxed code execution
- **OpenAI**: Code Interpreter — Responses API integration

This approach has zero new dependencies, leverages provider-managed sandboxes (better security than self-managed), and works within serverless constraints. E2B (third-party sandbox API) provides a universal fallback for models without native code execution.

**OWUI's Pyodide approach has significant costs**: ~10MB+ compressed bundle size, browser-only (server rendering impossible), limited to packages in the Pyodide ecosystem, and client-side security model. The Jupyter approach requires separate server deployment. Neither is compatible with NaW's serverless architecture.

---

## 7. Image Generation

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Engines | DALL-E 2/3, GPT-IMAGE 1/1.5, Gemini Imagen 3.0, ComfyUI, AUTOMATIC1111 (A2B-C10) | Not implemented | **ADAPT** — API-based only (DALL-E, Gemini) |
| Image editing | Yes (multi-engine: OpenAI, Gemini, ComfyUI edit workflows) | Not implemented | **ADAPT** — API-based editing via OpenAI/Gemini |
| Prompt generation | AI-generated image prompts from context | Not implemented | **SKIP** — low priority |
| Storage | Generated images uploaded to file storage, linked to messages | Not implemented | **ADOPT** — Convex file storage pattern |

**Only API-based engines are relevant for NaW.** ComfyUI and AUTOMATIC1111 require self-hosted GPU servers — Not Comparable for serverless. DALL-E and Gemini Imagen are API-accessible and BYOK-compatible.

**OWUI's image-as-file-upload pattern is worth adopting** (A6-C19): Generated images are persisted to file storage and linked to chat messages rather than returned as transient base64 blobs. This enables: persistent image access, file management UI, and consistent storage infrastructure.

---

## 8. Audio (STT/TTS)

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| STT engines | Local Whisper (faster-whisper), OpenAI, Deepgram, Azure, Mistral (A2B-C11) | Not implemented | **ADAPT** — OpenAI, Deepgram, Azure (API-based) |
| TTS engines | OpenAI, ElevenLabs, Azure, Transformers (local) (A2B-C11) | Not implemented | **ADAPT** — OpenAI, ElevenLabs (API-based) |
| Voice mode | Full voice/video call UI with push-to-talk, continuous listening | Not implemented | **ADAPT** — start with STT input + TTS output |
| Audio processing | Format detection, compression, silence-based splitting, parallel chunk transcription | Not implemented | **ADAPT** — basic format handling |
| Caching | TTS cached on disk via SHA-256 hash | Not implemented | **ADAPT** — Convex storage or client cache |

**Python-only capabilities (local Whisper, Transformers TTS) are structurally blocked** for NaW — they require persistent Python runtimes with GPU access. The API-based engines are viable:

| Engine | Transport | BYOK-compatible | Serverless-compatible |
|--------|-----------|-----------------|----------------------|
| OpenAI Whisper API | REST | Yes | Yes |
| Deepgram | REST/WebSocket | Yes | REST: Yes, WS: No |
| Azure Speech | REST | Yes | Yes |
| Mistral STT | REST | Yes | Yes |
| OpenAI TTS | REST | Yes | Yes |
| ElevenLabs TTS | REST | Yes | Yes |

**Priority**: OpenAI STT/TTS first (simplest, widest BYOK coverage), then Deepgram (lower latency, better accuracy for some use cases).

---

## 9. Memory System

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Storage | SQL table + per-user vector collection (dual) (A2B-C07) | Planned: Convex table + vector index (Option B in plan) | **ADOPT** — Convex simplifies dual-storage |
| Creation | Auto-extract via middleware + `save_memory` built-in tool | Planned: `save_memory` tool (same approach) | **ADOPT** — validated pattern |
| Retrieval | Embed query → vector similarity search → inject into system prompt | Planned: Option B (semantic retrieval) | **ADOPT** — Convex vector search |
| Management | Full CRUD UI at `/memories` | Planned: Memory tab in Settings | **ADOPT** — same UX pattern |
| Tool exposure | `search_memories`, `add_memory`, `replace_memory_content` as built-in tools | Planned: `save_memory` tool only | **ADAPT** — add search + replace tools |
| Feature gating | `ENABLE_MEMORIES` flag + per-user permission | Planned: per-user toggle | **ADOPT** |

**OWUI's memory system validates NaW's cross-conversation-memory plan.** The architecture maps directly:

| OWUI Component | NaW Equivalent |
|---------------|----------------|
| SQL `memory` table | Convex `memories` table |
| Per-user vector collection | Convex vector index on `memories` |
| Memory query → vector similarity | `ctx.vectorSearch("memories", ...)` |
| System prompt injection | `effectiveSystemPrompt + memoryBlock` in route.ts |
| `search_memories` / `add_memory` / `replace_memory_content` tools | Add to tool set in route.ts |

**Key enhancement over OWUI**: NaW should implement three memory tools (search, add, replace) instead of just `save_memory`. OWUI's `search_memories` tool allows the model to proactively check for relevant context, and `replace_memory_content` enables correcting outdated memories — both are more capable than passive system prompt injection alone.

**This validates Option B (semantic retrieval) over Option A (full injection)** in NaW's memory plan. OWUI's implementation shows that semantic retrieval (vector search → Top-K relevant memories) works in production, and full injection would waste tokens on irrelevant memories.

---

## 10. Web Search

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Providers | 24+ (SearXNG, Google, Brave, Tavily, Exa, etc.) (A2B-C08) | Layer 1: provider-native (OpenAI, Anthropic, Google, xAI); Layer 2: Exa fallback | **NaW's approach is better** |
| Result injection | Embedding + retrieval pipeline OR direct bypass (`BYPASS_WEB_SEARCH_EMBEDDING_AND_RETRIEVAL`) | Inline via model webSearch flag (Layer 1) or tool result (Layer 2) | **NaW wins** — simpler, SDK-native |
| Configuration | Admin-configurable per provider (40+ config fields) | `enableSearch` toggle (client) + BYOK key (Layer 2) | **NaW wins** — minimal config |
| Dispatch | `WEB_SEARCH_ENGINE` config string → module import | `enableSearch` → Layer 1 if provider supports → Layer 2 Exa fallback | **NaW wins** — automatic fallback |

**NaW's 3-layer search strategy is superior to OWUI's 24-provider approach.** NaW's Layer 1 uses provider-native search (zero new deps, best integration) with automatic Layer 2 Exa fallback for providers without native search. This covers 100% of models with two well-tested paths, versus OWUI's 24 poorly-tested providers where most users likely configure only one.

---

## 11. Model Management

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Custom models | Model builder (UI): system prompts, params, access control (A2A-C11) | Not implemented | **ADAPT** — user-created presets |
| Model arena | Blind A/B comparison with Elo voting (A2A-C09) | Multi-model side-by-side (explicit selection) | **SKIP Elo; keep explicit** |
| Model discovery | Pull from Ollama + configure OpenAI endpoints | Static model registry (code) + model settings | **ADAPT** — add dynamic model list |
| Task model | Dedicated cheaper model for title/tags/follow-ups (A2A-C10) | Not implemented | **ADOPT** — high-impact cost optimization |
| Model access control | Per-model ACLs with user/group IDs (A4-C20) | Not implemented | **ADAPT** — Convex ACLs |

**Custom model wrapping** (A2A-C11) is the highest-value feature here. Users create "personas" — a model + system prompt + parameter overrides — that appear as standalone models in the selector. This enables:
- A "Python Tutor" preset wrapping Claude 3.5 Sonnet with a coding system prompt
- A "Creative Writer" preset wrapping GPT-4o with high temperature
- Admin-curated model experiences with cost-tiered access control

NaW should implement via a Convex `customModels` table with `baseModelId`, `systemPrompt`, `params`, and `accessControl` fields.

---

## 12. Capabilities Structurally Blocked by NaW's Stack

| Blocked Capability | Constraint | Workaround | Viability | Ops/Security Trade-offs |
|-------------------|------------|-----------|-----------|------------------------|
| **Local model inference** (Ollama, llama.cpp) | Serverless = no persistent GPU process | None viable; fundamentally incompatible with Vercel | Not viable | N/A — different product category |
| **stdio MCP transport** | Serverless = no persistent child processes | SSE and streamable HTTP transports only | Full coverage via SSE | None — SSE is the production standard |
| **Local Whisper STT** | Requires Python + GPU + model files (~1.5GB) | OpenAI Whisper API, Deepgram API | Full feature parity via API | API cost (~$0.006/min); latency +200-500ms vs local |
| **Local sentence-transformers** | Requires Python + PyTorch + model download | OpenAI embedding API, Cohere embedding API | Full feature parity via API | API cost (~$0.0001/1K tokens); faster cold start |
| **Pyodide browser execution** | 10MB+ WASM bundle, Python-only | Provider sandboxes (Gemini, Claude, OpenAI), E2B API | Better security, multi-language | E2B: ~$0.001/session; provider: included in token cost |
| **Jupyter server execution** | Requires separate persistent server deployment | Provider sandboxes, E2B API | Same as Pyodide workaround | Eliminates server management overhead |
| **Local Transformers TTS** | Requires Python + PyTorch + model files | OpenAI TTS API, ElevenLabs API | Full feature parity via API | API cost varies; better voice quality via ElevenLabs |
| **Persistent WebSocket** | Serverless functions have 60s max duration | Convex real-time subscriptions (automatic); SSE for streaming | Full coverage | Convex subscriptions are structurally superior for real-time |
| **Python BYOF plugins** | TypeScript-only runtime | MCP for extensibility; typed built-in tools | Full extensibility via MCP | MCP requires external server; TypeScript tools are safer |
| **Redis shared state** | No persistent backend process | Convex reactive queries (automatic cross-client sync) | Structurally superior | Convex handles this natively — no Redis needed |
| **ComfyUI / AUTOMATIC1111** | Require self-hosted GPU servers | DALL-E API, Gemini Imagen API | Comparable for standard use; less flexible for custom workflows | API cost; no custom model fine-tuning |

**Key insight**: Every blocked capability has a viable API-based workaround that is often *superior* in the serverless context (lower ops burden, better security, faster cold starts). The only truly unrecoverable gap is local model inference — which is a fundamentally different product category (self-hosted AI vs. cloud AI interface).

---

## 13. Unexpected Findings

1. **OWUI's tool execution is the #1 user complaint** (A4-C09): 67+ comments on a single bug thread about HTML entity encoding corruption in multi-turn tool calls. Tool results silently disappear at scale. This is not a surface bug — it reflects the fragility of the middleware monolith. NaW must treat tool reliability as a first-class concern, not just feature completeness.

2. **OWUI's OpenAI annotation-to-citation pipeline is elegant** (A2A, Section 7): The middleware automatically converts OpenAI `url_citation` annotations into source events for the UI citation system. This means OpenAI's built-in web search citations integrate seamlessly with OWUI's own RAG citations. NaW should implement similar annotation passthrough for provider-specific citation formats.

3. **OWUI's Mixture of Agents (MoA) endpoint** synthesizes multiple model responses into a unified answer using a customizable template. This goes beyond simple side-by-side comparison and could evolve NaW's multi-model feature into a "best answer synthesis" capability.

4. **OWUI's configurable stream chunk size** (`CHAT_RESPONSE_STREAM_DELTA_CHUNK_SIZE`) is a useful production tuning knob NaW doesn't expose. Lower values = faster perceived responsiveness; higher values = less event overhead.

5. **OWUI's `SAFE_MODE` env var deactivates all user-uploaded functions on startup** — indicating past security incidents with the exec()-based plugin system. This validates NaW's decision to avoid server-process code execution entirely.

6. **Both systems share the same MCP transport constraint**: Despite OWUI having a long-running backend, it still can't maintain stdio MCP connections reliably across request boundaries. SSE is the production-viable transport for both architectures, making the serverless constraint less limiting than initially assumed.

---

## 14. Recommendations

| Recommendation | Verdict | Confidence | Evidence Count | User Impact (1-5) | Feasibility (1-5) | Time to Value | Ops Cost Impact | Security Impact | Dependencies | Risk if Wrong |
|----------------|---------|------------|----------------|-------------------|-------------------|---------------|-----------------|-----------------|--------------|---------------|
| **R1: Adopt unified tool surface** — Surface all tools (built-in, third-party, MCP) through one UI with consistent access control and display | ADOPT | High | 3 (A2B-C05, A2B-C12, A6-C05) | 4 | 4 | Weeks | Low | Neutral | Tool calling infrastructure (Phases 1-5 complete) | Low — clean architecture regardless |
| **R2: Adopt built-in tool conditional injection** — Gate tool injection on global config AND per-model capabilities via `ToolCapabilities` type | ADOPT | High | 2 (A2B-C12, A6-C06) | 3 | 5 | Days | Low | Positive | Phase 7.0 (ToolCapabilities type) | Low — prevents invalid tool/model combos |
| **R3: Adapt memory with semantic retrieval + 3 tools** — Implement cross-conversation memory using Convex vector search with `search_memories`, `add_memory`, `replace_memory_content` tools | ADAPT | High | 3 (A2B-C07, A6-C08, cross-conversation-memory plan) | 5 | 4 | Weeks | Low | Neutral | Convex vector index; cross-conversation-memory plan Option B | Medium — memory quality depends on embedding + extraction |
| **R4: Adopt task model separation** — Allow users to configure a cheaper model for title/tag generation | ADOPT | High | 2 (A2A-C10, A6-C13) | 3 | 5 | Days | Low (reduces cost) | Neutral | Model config infrastructure | Low — worst case is unused config |
| **R5: Adapt custom model presets** — User-created model wrappers with system prompt, params, access control | ADAPT | High | 2 (A2A-C11, A6-C12) | 4 | 4 | Weeks | Low | Neutral | Convex schema addition, model selector update | Low — worst case is underused feature |
| **R6: Adopt visible failure feedback for tools** — Never silently drop context, tool results, or RAG content | ADOPT | High | 3 (A4-C09, A4-C16, A6-C15) | 5 | 4 | Days–Weeks | Low | Positive | Tool invocation UI, chat UI updates | Very Low — transparency always beats silence |
| **R7: Add provider-level failover** — Retry with exponential backoff and configurable timeouts | ADOPT | High | 2 (A2A-C04, A2A-C14, A6-C03) | 4 | 4 | Days | Low | Neutral | AI SDK retry configuration | Low — worst case is marginally slower cold path |
| **R8: Adapt Valves concept via Zod schemas** — Auto-generated tool/integration config UI from Zod schemas with admin/user tiers | ADAPT | High | 2 (A2B-C03, A6-C16) | 3 | 3 | Weeks | Low | Neutral | Zod (already in stack), settings UI infrastructure | Low — well-understood pattern |
| **R9: Adapt RAG with Convex vector search** — Pipeline: API embedding → chunking → Convex vector index → Top-K retrieval | ADAPT | High | 3 (A2B-C06, A2B-C09, A6-C07) | 5 | 3 | Weeks–Months | Low | Neutral | Convex vector index, embedding API key | Medium — RAG quality requires tuning |
| **R10: Skip multi-backend abstraction breadth** — Use 1 vector DB (Convex), 1-2 search providers (provider-native + Exa), 1-2 image APIs (DALL-E + Gemini) | SKIP (the pattern) | High | 4 (A2B-C06, A2B-C08, A2B-C13, A6-C09) | N/A | N/A | N/A | Reduced | Neutral | None | Low — can add backends later |
| **R11: Skip Python BYOF and exec() tool model** — Never execute user code in server process; rely on MCP for extensibility | SKIP | High | 3 (A2B-C01, A2B-C02, A4-C04) | N/A | N/A | N/A | N/A | Critical positive | MCP infrastructure | Medium — MCP must be robust enough for power users |
| **R12: Skip Elo arena system** — Keep explicit multi-model comparison; add simple ratings if demand emerges | SKIP | Medium | 2 (A2A-C09, A6-C20) | 1 | N/A | N/A | N/A | Neutral | N/A | Medium — if blind eval demand is high, revisit |
| **R13: Adapt MCP OAuth 2.1 support** — Add OAuth authentication for enterprise MCP servers | ADAPT | Medium | 2 (A2B-C05, A6-C18) | 3 | 3 | Weeks | Low | Positive | MCP infrastructure, OAuth client | Low — standard auth pattern |
| **R14: Adapt image generation as file upload pattern** — Persist generated images to Convex storage, link to messages | ADAPT | Medium | 1 (A6-C19) | 3 | 4 | Days | Low | Neutral | Convex file storage, image gen capability | Low — better than transient base64 |
| **R15: Adapt citation annotation passthrough** — Convert provider-specific citation formats into unified source display | ADAPT | Medium | 1 (A2A, unexpected finding) | 3 | 4 | Days | Low | Neutral | Chat UI citation components | Low — improves search result display |

---

## Conflict Ledger (Required)

| Conflict ID | With Doc | Conflict Summary | Proposed Resolution | Escalate to Phase 3? |
|-------------|----------|------------------|---------------------|----------------------|
| A6-X01 | `05-comparison-architecture.md` | Architecture comparison may recommend unified middleware; this doc recommends keeping layered separation | Resolve in favor of layered separation — OWUI's middleware monolith is their biggest pain point (A2A-C03). NaW's route.ts → provider.ts → third-party.ts → MCP layering is demonstrably better. | No — clear evidence |
| A6-X02 | `cross-conversation-memory.md` | Memory plan offers Option A (full injection) and Option B (semantic retrieval). This doc recommends Option B based on OWUI evidence. | Recommend Option B — OWUI's production memory system uses semantic retrieval successfully. Full injection wastes tokens on irrelevant memories and doesn't scale past ~50 memories. | No — OWUI validates Option B |
| A6-X03 | `08-comparison-ux-extensibility.md` | UX comparison may recommend plugin system for extensibility. This doc recommends MCP-only extensibility (no exec()). | Resolve in favor of MCP-only. Plugin systems require code execution; MCP provides equivalent extensibility without server-process security risk. The Valves config pattern is adoptable independently of code execution. | Yes — UX agent may have different extensibility assessment |
| A6-X04 | `phase-7-future-tool-integrations.md` | Phase 7 plans Firecrawl as second tool provider. This doc validates the approach but notes OWUI's 24-provider breadth as cautionary. | No conflict — Phase 7 deliberately follows "rule of three" (refactor at 3rd provider), which avoids OWUI's breadth trap. Keep the plan as-is. | No — aligned |
| A6-X05 | `tool-calling-infrastructure.md` | Parent plan's Phase 7.0 `ToolCapabilities` is validated by OWUI's built-in tool conditional injection pattern (A2B-C12). | No conflict — OWUI evidence strengthens the case for `ToolCapabilities`. Recommend accelerating Phase 7.0. | No — aligned |
| A6-X06 | `07-comparison-data-scalability.md` | Data comparison may assess Convex vector search maturity differently than this doc's RAG recommendation. | If data agent identifies Convex vector search limitations, RAG recommendation (R9) may need to include an abstraction layer. Currently assessed as sufficient based on documented Convex capabilities. | Yes — depends on data agent's assessment |

---

**NaW Files Cross-Referenced**:
- `app/api/chat/route.ts` — Gold standard API route; tool loading coordinator
- `lib/mcp/` — MCP client (Layer 3)
- `lib/openproviders/` — AI provider abstraction
- `lib/tools/provider.ts` — Provider tool resolution (Layer 1)
- `lib/tools/third-party.ts` — Third-party tools (Layer 2)
- `lib/tools/types.ts` — ToolMetadata, ToolSource, ToolCapabilities
- `app/components/chat/tool-invocation.tsx` — Tool UI renderer
- `.agents/plans/tool-calling-infrastructure.md` — 7-phase tool infrastructure plan
- `.agents/plans/phase-7-future-tool-integrations.md` — Future tool integrations (Phase 7 expansion)
- `.agents/plans/cross-conversation-memory.md` — Memory persistence plan (Options A and B)

---

*Generated as part of Open WebUI competitive analysis. See `00-research-plan.md` for full plan.*
