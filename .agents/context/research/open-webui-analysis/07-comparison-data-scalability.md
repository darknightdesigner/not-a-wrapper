# Comparison: Data Layer & Scalability — Open WebUI vs. Not A Wrapper

> **Agent**: Agent 7
> **Phase**: 2 (Parallel)
> **Status**: Pending
> **Primary Dependency**: `03-data-layer-scalability.md`
> **Also Read**: `01-architecture-code-quality.md`, `02-ai-engine-tools.md`, `02b-tool-infrastructure.md`, `04-ux-features-extensibility.md`
> **Cross-Reference**: `competitive-feature-analysis.md` (prior ChatGPT/Claude comparison)
> **Date**: —

> **Important**: Read ALL Phase 1 outputs before writing this document. Your primary focus is data/scalability (doc 03), but context from other tracks prevents siloed analysis.

---

## Summary

<!-- 3-5 sentence executive summary -->

---

## 1. Database Philosophy

| Dimension | Open WebUI | Not A Wrapper | Trade-off Assessment |
|-----------|-----------|---------------|---------------------|
| Engine | SQLAlchemy (SQLite/PostgreSQL) | Convex (managed reactive DB) | |
| Schema | Explicit Python models + Alembic migrations | TypeScript schema, auto-managed | |
| Queries | SQL via ORM | Convex query/mutation functions | |
| Real-time | Manual (socket.io) | Automatic (Convex subscriptions) | |
| Vector search | 9 external vector DBs | Built-in (unused) | |
| Type safety | Pydantic models (backend only) | End-to-end TypeScript | |

<!-- Deep comparison of approaches -->
<!-- When does each model win? Be specific about workloads. -->

---

## 2. Schema Design Comparison

<!-- Compare table/collection designs for key entities -->
<!-- Users, chats, messages, files, etc. -->
<!-- Relationship modeling approaches -->
<!-- Schema evolution approaches — which is less painful? -->

---

## 3. Caching

| Dimension | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Server cache | Redis + aiocache | None (serverless, stateless) | |
| Client cache | Svelte stores | Zustand + TanStack Query | |
| Session cache | Redis-backed sessions | Clerk (managed) | |
| Model cache | In-memory + Redis | TanStack Query stale-while-revalidate | |

<!-- Analysis: does NaW need server-side caching? What problems would it solve? -->
<!-- What would a caching layer look like with Convex? (Convex has its own caching) -->
<!-- Is the lack of caching a real problem or a non-issue given Convex? -->

---

## 4. Real-Time Architecture

| Dimension | Open WebUI | Not A Wrapper | Trade-off Assessment |
|-----------|-----------|---------------|---------------------|
| Technology | socket.io + Redis pub/sub | Convex subscriptions | |
| Setup complexity | High (manual event handling) | Low (automatic with useQuery) | |
| Scalability | Redis-backed multi-node | Managed by Convex | |
| Feature scope | Chat, presence, model usage | Database queries | |
| Collaborative editing | Yjs + ProseMirror + pycrdt | Not implemented | |

<!-- Trade-off analysis -->
<!-- What NaW gets "for free" with Convex vs. what it can't do -->
<!-- Is the collaborative editing (Yjs) worth studying for NaW? -->

---

## 5. File Storage

| Dimension | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Options | Local, S3, GCS, Azure Blob | Convex storage | |
| Configuration | Admin-configurable | Automatic | |
| Processing | Compression, extraction, OCR | Basic upload + serve | |

---

## 6. Deployment & Scaling

| Dimension | Open WebUI | Not A Wrapper | Trade-off Assessment |
|-----------|-----------|---------------|---------------------|
| Model | Self-hosted (Docker/K8s/bare-metal) | Managed (Vercel + Convex) | |
| Horizontal | Redis sessions, multi-worker uvicorn | Automatic (serverless) | |
| GPU support | Native (:cuda, :ollama images) | N/A (cloud API only) | |
| Offline | Fully offline capable | Requires internet | |
| Ops burden | High (manage infra, updates, backups) | Low (managed services) | |

<!-- Self-hosted vs. managed trade-offs — be honest about both sides -->
<!-- What NaW gains and loses from serverless -->
<!-- What use cases does each approach serve better? -->

---

## 7. Observability

| Dimension | Open WebUI | Not A Wrapper | Adopt / Adapt / Skip |
|-----------|-----------|---------------|----------------------|
| Tracing | OpenTelemetry (full stack) | None | |
| Metrics | OpenTelemetry + custom | PostHog (analytics) | |
| Audit | Custom audit middleware | None | |
| Logging | Loguru (structured) | console.log (basic) | |

<!-- What NaW should adopt for observability — this is a clear gap -->
<!-- What's the Vercel-native approach to observability? -->

---

## 8. Gaps & Opportunities

<!-- Where NaW's data layer falls short — with concrete impact assessment -->
<!-- Where NaW's approach is inherently better — protect these advantages -->
<!-- What would require architectural change vs. incremental improvement -->

---

## 9. Unexpected Findings

<!-- Anything surprising from the data/scalability comparison -->

---

## 10. Recommendations

<!-- Prioritized data/scalability recommendations -->
<!-- Each explicitly marked: ADOPT, ADAPT, or SKIP with rationale -->
<!-- Note which patterns are irrelevant to NaW's managed infrastructure -->
<!-- Flag any conflicts with recommendations from other comparison tracks -->

---

**NaW Files Cross-Referenced**:
- `convex/schema.ts`
- `convex/` (all functions)
- `lib/chat-store/`
- `.agents/context/database.md`

---

*Generated as part of Open WebUI competitive analysis. See `00-research-plan.md` for full plan.*
