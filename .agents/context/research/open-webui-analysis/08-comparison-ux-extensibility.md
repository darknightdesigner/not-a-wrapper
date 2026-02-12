# Comparison: UX & Extensibility — Open WebUI vs. Not A Wrapper

> **Agent**: Agent 8
> **Phase**: 2 (Parallel)
> **Status**: Pending
> **Primary Dependency**: `04-ux-features-extensibility.md`
> **Also Read**: `01-architecture-code-quality.md`, `02-ai-engine-tools.md`, `02b-tool-infrastructure.md`, `03-data-layer-scalability.md`
> **Cross-Reference**: `competitive-feature-analysis.md` (prior ChatGPT/Claude comparison — contains detailed feature gap analysis against direct competitors)
> **Date**: —

> **Important**: Read ALL Phase 1 outputs before writing this document. Also read the existing competitive feature analysis — it already identifies prioritized gaps against ChatGPT and Claude. This document should add the Open WebUI perspective, NOT duplicate that prior work. Focus on: (1) features Open WebUI has that the prior analysis didn't cover, (2) implementation patterns worth studying, and (3) features to deliberately skip.

---

## Summary

<!-- 3-5 sentence executive summary -->

---

## 1. Feature Parity Matrix

<!-- Map EVERY Open WebUI feature to NaW status -->
<!-- DO NOT pre-judge severity. Leave the "Assessment" column for your analysis AFTER research. -->
<!-- The prior competitive-feature-analysis.md already covers ChatGPT/Claude gaps. Focus on what Open WebUI adds. -->

| Feature | Open WebUI | NaW Status | Adopt / Adapt / Skip | Rationale |
|---------|-----------|------------|----------------------|-----------|
| **Core Chat** | | | | |
| Streaming responses | Yes | Yes | N/A | Parity |
| Message editing | Yes | Yes | N/A | Parity |
| Message rating | Yes | No | | |
| Code blocks + syntax highlighting | Yes | Yes | N/A | Parity |
| LaTeX rendering | Yes | Yes (KaTeX) | N/A | Parity |
| Mermaid diagrams | Yes | No | | |
| **Model Management** | | | | |
| Multi-provider | Yes (Ollama + OpenAI-compat) | Yes (10 native) | N/A | NaW ahead |
| BYOK | Yes (per endpoint) | Yes (AES-256-GCM) | N/A | NaW ahead |
| Model builder (custom models) | Yes | No | | |
| Model arena (blind comparison) | Yes | Partial (explicit side-by-side) | | |
| **Tools & Functions** | | | | |
| Tool calling | Yes (BYOF Python) | No (empty ToolSet) | | |
| In-app tool editor | Yes | No | | |
| Pipeline framework | Yes | No | | |
| MCP integration | Yes | Library only | | |
| **RAG & Knowledge** | | | | |
| Document RAG | Yes (full pipeline) | No | | |
| Knowledge bases | Yes | No (Projects = org only) | | |
| `#` command for docs/URLs | Yes | No | | |
| **Code Execution** | | | | |
| Browser Python (Pyodide) | Yes | No | | |
| Server Jupyter | Yes | No | | |
| **Image Generation** | | | | |
| Multi-engine | Yes (4 engines) | No | | |
| Image editing | Yes | No | | |
| **Audio** | | | | |
| STT (5+ engines) | Yes | No | | |
| TTS (5+ engines) | Yes | No | | |
| Voice mode | Yes | No | | |
| **Memories** | | | | |
| Cross-conversation memory | Yes | No | | |
| Memory management UI | Yes | No | | |
| **Conversation Management** | | | | |
| Chat history | Yes | Yes | N/A | Parity |
| Folders | Yes | Yes (Projects) | N/A | Parity |
| Search | Yes | Partial (title-only) | | |
| Pinning | Yes | Yes | N/A | Parity |
| Archiving | Yes | No | | |
| Export | Yes | No | | |
| Sharing | Yes | Yes | N/A | Parity |
| **Team Features** | | | | |
| Channels (Team Chat) | Yes | No | | |
| Notes | Yes | No | | |
| Prompt Library | Yes | No | | |
| Evaluation/Arena | Yes | Partial | | |
| Artifact Storage | Yes | No | | |
| **Admin & Access Control** | | | | |
| Granular RBAC | Yes | Clerk-delegated | | |
| Groups | Yes | No | | |
| Admin panel | Yes (comprehensive) | Basic settings | | |
| **Localization & Platform** | | | | |
| i18n | Yes (50+ languages) | No | | |
| Keyboard Shortcuts | Yes (comprehensive) | Limited (Cmd+K only) | | |
| PWA | Yes | No | | |
| Plugin System | Yes (BYOF + pipelines) | No | | |

---

## 2. UX Design Comparison

### 2.1 Chat Interface

<!-- Side-by-side comparison of chat UX -->
<!-- Input area, message rendering, actions -->
<!-- Svelte vs. React rendering performance -->

### 2.2 Settings & Configuration

<!-- Open WebUI: comprehensive admin + user settings -->
<!-- NaW: focused user settings -->

### 2.3 Navigation & Information Architecture

<!-- How each organizes features -->
<!-- Sidebar design comparison -->
<!-- Discoverability of features -->

### 2.4 Rich Content Rendering

<!-- TipTap + CodeMirror + Chart.js + Mermaid + KaTeX + Leaflet (Open WebUI) -->
<!-- Markdown renderer + KaTeX (NaW) -->

---

## 3. Extensibility Architecture

### 3.1 Plugin/Extension System

<!-- Open WebUI: BYOF (Bring Your Own Function) + Pipelines -->
<!-- NaW: No plugin system -->
<!-- What a plugin system for NaW could look like — is it worth building? -->
<!-- Consider: does NaW's target audience (power users) need plugins, or is MCP sufficient? -->

### 3.2 API Extensibility

<!-- Open WebUI: REST API with OpenAPI docs -->
<!-- NaW: API routes + Convex functions -->
<!-- API key support comparison -->

### 3.3 Community & Ecosystem

<!-- Open WebUI: community integrations, 702 contributors, GPT Store equivalent -->
<!-- NaW: early-stage, smaller community -->
<!-- What community-building lessons can NaW learn? -->

---

## 4. i18n Gap Analysis

<!-- What it would take for NaW to add i18n -->
<!-- Framework options for Next.js (next-intl, etc.) -->
<!-- Estimated effort -->
<!-- Is this aligned with NaW's positioning? Power users are often English-first. -->

---

## 5. Admin Capabilities Gap

<!-- Full inventory of Open WebUI admin features NaW lacks -->
<!-- Which admin features matter most for NaW's positioning -->
<!-- Which are only relevant for self-hosted enterprise (LDAP, SCIM) and can be skipped? -->

---

## 6. Features to Adopt, Adapt, or Skip

### 6.1 Adopt (aligns with NaW positioning, clear implementation path)

<!-- Features that are essential for "universal AI interface" -->

### 6.2 Adapt (valuable concept, but NaW's implementation should differ)

<!-- Features where the concept is good but the implementation should be different -->
<!-- e.g., Open WebUI has 9 vector DBs — NaW should use Convex's built-in -->

### 6.3 Skip (doesn't align, not worth the effort, or actively harmful)

<!-- Features that don't fit NaW's positioning or architecture -->
<!-- e.g., Ollama-specific features, self-hosted-only features, LDAP/SCIM -->
<!-- Be specific about WHY to skip — "not aligned" isn't enough -->

---

## 7. Unexpected Findings

<!-- Anything surprising from the UX/extensibility comparison -->

---

## 8. Recommendations

<!-- Prioritized UX/extensibility recommendations -->
<!-- Each explicitly marked: ADOPT, ADAPT, or SKIP with rationale -->
<!-- Cross-reference with competitive-feature-analysis.md priorities to ensure alignment -->
<!-- Flag any conflicts with recommendations from other comparison tracks -->

---

**NaW Files Cross-Referenced**:
- `app/components/` — All UI components
- `app/components/chat/` — Chat components
- `app/components/layout/settings/` — Settings UI
- `components/ui/` — Design system
- `.agents/context/research/competitive-feature-analysis.md`

---

*Generated as part of Open WebUI competitive analysis. See `00-research-plan.md` for full plan.*
