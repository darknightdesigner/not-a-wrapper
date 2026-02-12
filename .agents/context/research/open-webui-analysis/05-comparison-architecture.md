# Comparison: Architecture — Open WebUI vs. Not A Wrapper

> **Agent**: Agent 5
> **Phase**: 2 (Parallel)
> **Status**: Pending
> **Primary Dependency**: `01-architecture-code-quality.md`
> **Also Read**: `02-ai-engine-tools.md`, `02b-tool-infrastructure.md`, `03-data-layer-scalability.md`, `04-ux-features-extensibility.md`
> **Cross-Reference**: `competitive-feature-analysis.md` (prior ChatGPT/Claude comparison)
> **Date**: —

> **Important**: Read ALL Phase 1 outputs before writing this document. Your primary focus is architecture (doc 01), but context from other tracks prevents siloed analysis.

---

## Summary

<!-- 3-5 sentence executive summary of architectural comparison -->

---

## 1. Fundamental Architecture Comparison

### 1.1 Monolith vs. Serverless Full-Stack

| Dimension | Open WebUI | Not A Wrapper |
|-----------|-----------|---------------|
| Backend | Python FastAPI (long-running process) | Next.js API Routes (Vercel serverless) |
| Frontend | SvelteKit (bundled into same container) | Next.js 16 (React 19, separate deployment) |
| Runtime model | Persistent server process | Ephemeral function invocations |
| State | In-process state, Redis for sharing | Stateless; all state in Convex/client |

<!-- Analysis of trade-offs: when does each model win? -->
<!-- Impact on feature capabilities (e.g., WebSocket, long-running tasks, stdio MCP, local models) -->
<!-- What capabilities does Open WebUI have BECAUSE of its persistent process model that NaW structurally cannot have? -->

### 1.2 Language Stack

| Dimension | Open WebUI | Not A Wrapper |
|-----------|-----------|---------------|
| Backend language | Python 3.11+ | TypeScript (via Next.js) |
| Frontend language | TypeScript (Svelte) | TypeScript (React) |
| Shared types | No (Python ↔ TypeScript boundary) | Yes (end-to-end TypeScript) |
| AI ecosystem access | Python ML libs (transformers, sentence-transformers) | Vercel AI SDK (JavaScript) |

<!-- Trade-off analysis — this is NOT neutral. Python has the best ML ecosystem. -->
<!-- What can Open WebUI do BECAUSE it's Python that NaW structurally cannot? (local model inference, local Whisper, sentence-transformers) -->
<!-- What does NaW gain from end-to-end TypeScript? (type safety, shared types, simpler toolchain) -->

---

## 2. Backend Organization

### 2.1 Router/Route Architecture

<!-- Open WebUI: 24 explicit FastAPI routers -->
<!-- NaW: Next.js API routes (file-based) -->
<!-- Compare: organization, discoverability, testing -->

### 2.2 Middleware & Request Pipeline

<!-- Open WebUI: explicit middleware chain in main.py -->
<!-- NaW: Next.js middleware.ts + Convex auth -->
<!-- Compare: flexibility, complexity, debugging -->

### 2.3 Configuration Management

<!-- Open WebUI: massive config.py + env.py (hundreds of env vars), admin UI override -->
<!-- NaW: lib/config.ts + .env (compact) -->
<!-- Compare: power vs. simplicity — is Open WebUI's config complexity a feature or a burden? -->

---

## 3. Frontend Architecture

### 3.1 Framework Comparison

<!-- SvelteKit vs. Next.js 16 -->
<!-- Svelte 5 runes vs. React 19 hooks -->
<!-- Component model differences -->
<!-- SSR/CSR strategy differences -->

### 3.2 State Management

<!-- Svelte stores (writable/derived) vs. Zustand + TanStack Query -->
<!-- Data flow patterns -->
<!-- Real-time data handling -->

### 3.3 UI Component Systems

<!-- bits-ui + TipTap + CodeMirror vs. Shadcn/Base UI -->
<!-- Rich text editing comparison -->
<!-- Design system maturity -->

---

## 4. Database & Data Access

<!-- SQLAlchemy + explicit sessions vs. Convex reactive DB -->
<!-- Manual migrations (Alembic) vs. auto-managed schema -->
<!-- Query patterns comparison -->
<!-- Real-time: manual socket.io vs. automatic Convex subscriptions -->

---

## 5. Auth Architecture

<!-- Custom JWT + OAuth + LDAP + SCIM vs. Clerk (managed) -->
<!-- Trade-offs: control vs. simplicity -->
<!-- Enterprise features comparison -->
<!-- Which approach scales better for different user segments? -->

---

## 6. Testing & Quality

<!-- Testing strategies comparison -->
<!-- Lint/type checking comparison -->
<!-- CI/CD comparison -->

---

## 7. Deployment & DevOps

<!-- Self-hosted Docker/K8s vs. Vercel managed -->
<!-- Operational complexity comparison -->
<!-- Scaling model comparison -->

---

## 8. Architectural Strengths to Adopt

<!-- What Open WebUI does architecturally that NaW should learn from -->
<!-- Specific patterns, not just concepts -->
<!-- For each: specify adopt (copy), adapt (modify for NaW stack), or why it's worth studying -->

---

## 9. Architectural Weaknesses to Avoid

<!-- What Open WebUI does that NaW should NOT copy -->
<!-- Configuration bloat, coupling issues, etc. -->
<!-- For each: what they do, why it's a problem, what NaW should do instead -->

---

## 10. NaW Architectural Advantages to Protect

<!-- Where NaW's architecture is genuinely better -->
<!-- End-to-end TypeScript, Convex real-time, serverless simplicity, etc. -->
<!-- Risks: which proposed changes could erode these advantages? -->

---

## 11. Unexpected Findings

<!-- Document anything surprising, noteworthy, or not covered by the sections above -->

---

## 12. Recommendations

<!-- Prioritized architectural recommendations -->
<!-- Each with: what to change, why, estimated effort, impact -->
<!-- Explicitly mark each as: ADOPT (copy pattern), ADAPT (modify for NaW), or SKIP (don't copy, with rationale) -->
<!-- Flag any conflicts with recommendations from other comparison tracks -->

---

**NaW Files Cross-Referenced**:
- `app/api/chat/route.ts`
- `lib/chat-store/`
- `convex/schema.ts`
- `.agents/context/architecture.md`
- `middleware.ts`

---

*Generated as part of Open WebUI competitive analysis. See `00-research-plan.md` for full plan.*
