# Comparison: AI Capabilities — Open WebUI vs. Not A Wrapper

> **Agent**: Agent 6
> **Phase**: 2 (Parallel)
> **Status**: Pending
> **Primary Dependency**: `02-ai-engine-tools.md`, `02b-tool-infrastructure.md`
> **Also Read**: `01-architecture-code-quality.md`, `03-data-layer-scalability.md`, `04-ux-features-extensibility.md`
> **Cross-Reference**: `competitive-feature-analysis.md` (prior ChatGPT/Claude comparison), `.agents/plans/tool-calling-infrastructure.md`, `.agents/plans/phase-7-future-tool-integrations.md`
> **Date**: —

> **Important**: Read ALL Phase 1 outputs before writing this document. Your primary focus is AI capabilities (docs 02 + 02b), but context from architecture and UX tracks prevents siloed analysis. Also read the existing tool-calling and integration plans to avoid contradicting prior decisions.

---

## Summary

<!-- 3-5 sentence executive summary -->

---

## 1. Provider Abstraction

| Capability | Open WebUI | Not A Wrapper | Verdict |
|-----------|-----------|---------------|---------|
| Approach | Ollama proxy + OpenAI-compatible proxy | Vercel AI SDK multi-provider | |
| Provider count | Ollama + any OpenAI-compat endpoint | 10 native providers, 73+ models | |
| BYOK | Users configure endpoints + keys | AES-256-GCM encrypted per-provider keys | |
| Model metadata | Basic (from API) | Rich (speed, cost, context, capabilities) | |

<!-- Deep comparison of abstraction approaches -->
<!-- Which is more maintainable? More flexible? -->
<!-- What are the fundamental trade-offs? -->

---

## 2. Chat Completion Pipeline

<!-- Open WebUI: middleware.py process_chat_payload → provider → process_chat_response -->
<!-- NaW: streamText() → toUIMessageStreamResponse() via Vercel AI SDK -->
<!-- Compare: flexibility, streaming, error handling, post-processing -->
<!-- What does Open WebUI's middleware do that NaW should consider? -->

---

## 3. Tool Calling / Function Calling

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Tool calling | Native Python BYOF + tool servers | Empty (tools: {} as ToolSet) | |
| Tool authoring | In-app code editor + auto-install deps | Not implemented | |
| Tool execution | Server-side Python (RestrictedPython) | Not implemented | |
| Tool UI | Tool workspace + result display | tool-invocation.tsx (renderer only) | |

<!-- How Open WebUI's tool system works in detail -->
<!-- What NaW can learn for its tool-calling-infrastructure plan -->
<!-- What is structurally impossible in NaW's serverless environment? -->

---

## 4. MCP Integration

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| MCP version | mcp==1.25.0 | @ai-sdk/mcp (library exists) | |
| Integration depth | Built into chat pipeline | Not wired into chat | |
| Transport | SSE, stdio (long-running backend) | SSE only (serverless constraint) | |
| Configuration | Tool server connections config | Settings placeholder only | |

<!-- How Open WebUI integrates MCP -->
<!-- What NaW's serverless constraint means for MCP — be specific about what's blocked -->
<!-- Lessons for NaW's MCP integration plan -->

---

## 5. RAG (Retrieval Augmented Generation)

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Vector DBs | 9 options (ChromaDB, PGVector, Qdrant, etc.) | Convex built-in (unused) | |
| Embedding | Local (sentence-transformers) + API | Not implemented | |
| Content extraction | 9 engines (Tika, Docling, etc.) | File upload only | |
| Chunking | Configurable (size, overlap, strategies) | Not implemented | |
| Retrieval | Top-K + reranking + hybrid BM25 | Not implemented | |
| Knowledge bases | Full CRUD + # command | Projects (org only) | |

<!-- How NaW could leverage Convex's built-in vector search — this is a key advantage -->
<!-- What's worth adopting from Open WebUI's RAG pipeline vs. what's unnecessary breadth -->
<!-- NaW doesn't need 9 vector DBs — Convex is the answer. Focus on pipeline quality. -->

---

## 6. Code Execution

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Browser-side | Pyodide (WASM Python) | Not implemented | |
| Server-side | Jupyter integration | Not implemented | |
| Code interpreter | Dedicated mode with prompt template | Not implemented | |
| Output | stdout, charts, files | Not implemented | |

<!-- Architecture analysis of Pyodide integration — bundle size? Load time? -->
<!-- Feasibility for NaW: WASM vs. E2B vs. other approaches -->
<!-- What is the serverless-compatible path? -->

---

## 7. Image Generation

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Engines | DALL-E, Gemini, ComfyUI, AUTOMATIC1111 | Not implemented | |
| Image editing | Yes (multi-engine) | Not implemented | |
| Prompt generation | AI-generated prompts from context | Not implemented | |

<!-- NaW should use BYOK provider APIs, not 4 self-hosted engines -->

---

## 8. Audio (STT/TTS)

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| STT engines | Local Whisper, OpenAI, Deepgram, Azure, Mistral | Not implemented | |
| TTS engines | Azure, ElevenLabs, OpenAI, Transformers, WebAPI | Not implemented | |
| Voice mode | Full voice/video call UI | Not implemented | |

<!-- What capabilities require Python (local Whisper) vs. what works in TypeScript (API-based)? -->

---

## 9. Memory System

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Storage | Database-backed memories | Not implemented | |
| Creation | Auto-extract + manual | Not implemented | |
| Retrieval | Inject into system prompt | Not implemented | |
| Management | Full CRUD UI | Not implemented | |

<!-- How NaW could build this with Convex vector search — cross-ref with existing memory plan -->

---

## 10. Web Search

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Providers | 15+ (SearXNG, Google, Brave, Tavily, etc.) | Per-model gating (single provider) | |
| Result injection | Embedding + retrieval or direct bypass | Inline via model webSearch flag | |
| Configuration | Admin-configurable per provider | .env only | |

---

## 11. Model Management

| Capability | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Custom models | Model builder (UI) with system prompts, params | Not implemented | |
| Model arena | Blind A/B comparison with voting | Multi-model side-by-side (explicit) | |
| Model discovery | Pull from Ollama + configure OpenAI endpoints | Static model registry (code) | |

---

## 12. Capabilities Structurally Blocked by NaW's Stack

<!-- Explicitly list what NaW CANNOT do because of serverless + TypeScript constraints -->
<!-- e.g., local model inference, stdio MCP, persistent WebSocket connections, local Whisper -->
<!-- For each: explain the constraint, and whether there's a workaround -->

---

## 13. Unexpected Findings

<!-- Anything surprising from the AI capabilities comparison -->

---

## 14. Recommendations

<!-- Prioritized AI capability recommendations -->
<!-- Each explicitly marked: ADOPT (build it), ADAPT (modify approach for NaW), or SKIP (don't build, with rationale) -->
<!-- Cross-reference with existing NaW plans to flag alignment or conflicts -->
<!-- Flag any conflicts with recommendations from other comparison tracks -->

---

**NaW Files Cross-Referenced**:
- `app/api/chat/route.ts`
- `lib/mcp/`
- `lib/openproviders/`
- `app/components/chat/tool-invocation.tsx`
- `.agents/plans/tool-calling-infrastructure.md`
- `.agents/plans/phase-7-future-tool-integrations.md`
- `.agents/plans/cross-conversation-memory.md`

---

*Generated as part of Open WebUI competitive analysis. See `00-research-plan.md` for full plan.*
