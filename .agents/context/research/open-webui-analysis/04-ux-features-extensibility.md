# Open WebUI: UX, Features, Extensibility & Community Analysis

> **Agent**: Agent 4
> **Phase**: 1 (Parallel)
> **Status**: Pending
> **Date**: —
> **Source**: [open-webui/open-webui](https://github.com/open-webui/open-webui) @ main

> **Scope Boundary**: This agent owns the **user-facing surface** — feature inventory, UX patterns, UI components, design system, i18n, RBAC, admin panel, plugin/extension system, developer experience, and community/growth dynamics. The *backend implementation* of AI features (tool execution, RAG pipeline, streaming mechanics) belongs to Agents 2A and 2B. Focus on what users see and interact with, and on how the project sustains its community.

---

## Summary

<!-- 3-5 sentence executive summary of findings -->

---

## 1. Complete Feature Inventory

### 1.1 Core Chat

<!-- Message types, streaming, editing, regeneration -->
<!-- Message rating (thumbs up/down) -->
<!-- Code blocks, markdown, LaTeX, Mermaid -->
<!-- File attachments in chat -->

### 1.2 Model Interaction

<!-- Model selection, switching -->
<!-- Many-model conversations -->
<!-- Model builder (custom models) -->
<!-- Model arena/evaluation -->
<!-- Default models, pinned models -->

### 1.3 Tools & Integrations

<!-- Function calling UI (what users see, not backend plumbing) -->
<!-- Tool workspace (code editor) -->
<!-- Pipeline framework (user perspective) -->
<!-- MCP tool servers (configuration UX) -->
<!-- Google Drive integration -->
<!-- OneDrive/SharePoint integration -->

### 1.4 RAG & Knowledge

<!-- Document upload and processing (user flow) -->
<!-- Knowledge base management UI -->
<!-- `#` command for document/URL injection -->
<!-- Web browsing capability -->

### 1.5 Code Execution

<!-- Pyodide browser execution (user experience) -->
<!-- Jupyter server execution (user experience) -->
<!-- Code interpreter mode -->
<!-- Result display (stdout, charts, files) -->

### 1.6 Image Generation & Editing

<!-- Generation engines (user-facing UX) -->
<!-- Image editing UX -->
<!-- Prompt generation from context -->

### 1.7 Audio/Voice

<!-- STT interface -->
<!-- TTS interface -->
<!-- Voice/video call mode UX -->
<!-- Voice mode prompt template -->

### 1.8 Memories

<!-- Automatic memory extraction (user experience) -->
<!-- Manual memory management UI -->
<!-- How are memories surfaced to users? -->

### 1.9 Web Search

<!-- Search toggle UX -->
<!-- Source citation display -->
<!-- How users discover and control search -->

### 1.10 Conversation Management

<!-- Chat history sidebar -->
<!-- Search across conversations -->
<!-- Folders -->
<!-- Pinning, archiving -->
<!-- Export (format options, UX) -->
<!-- Share links -->

### 1.11 Channels (Team Chat)

<!-- Real-time team communication -->
<!-- Channel creation and management -->
<!-- Message threading -->
<!-- How mature is this feature? Usage signals? -->

### 1.12 Notes

<!-- Personal note-taking -->
<!-- Note organization -->
<!-- How does this relate to chat? Is it a standalone feature? -->

### 1.13 Prompt Library

<!-- Prompt creation and management -->
<!-- Community sharing -->
<!-- Prompt templates -->

### 1.14 Evaluation/Arena

<!-- Blind A/B model comparison (user flow) -->
<!-- Voting system UX -->
<!-- Leaderboard -->

### 1.15 Artifact Storage

<!-- Key-value storage API -->
<!-- Journals, trackers, leaderboards -->
<!-- Personal and shared data scopes -->

---

## 2. UI Component Architecture

### 2.1 Design System

<!-- Component library (bits-ui) -->
<!-- Custom components inventory -->
<!-- Styling approach (Tailwind 4, CSS) -->
<!-- Typography, colors, spacing conventions -->

### 2.2 Rich Text Editing

<!-- TipTap editor integration -->
<!-- Extensions (mentions, code blocks, images, tables, YouTube, links) -->
<!-- Bubble menu, floating menu, drag handle -->

### 2.3 Code Editing

<!-- CodeMirror integration -->
<!-- Language support -->
<!-- Theme (one-dark) -->

### 2.4 Data Visualization

<!-- Chart.js integration -->
<!-- Vega/Vega-Lite for data viz -->
<!-- Mermaid diagram rendering -->

### 2.5 Map Integration

<!-- Leaflet maps -->
<!-- Use cases -->

### 2.6 Document Rendering

<!-- KaTeX for math -->
<!-- Marked for markdown -->
<!-- highlight.js for code -->
<!-- Mermaid for diagrams -->

**Files to examine**:
- `src/lib/components/` (all subdirectories)

---

## 3. i18n (Internationalization)

<!-- i18next setup -->
<!-- Number of supported languages -->
<!-- Translation coverage and quality -->
<!-- Contribution process for new languages -->
<!-- Parser configuration -->

**Files to examine**:
- `src/lib/i18n/`
- `i18next-parser.config.ts`

---

## 4. RBAC & Access Control

### 4.1 Role Model

<!-- User roles (admin, user, pending) -->
<!-- Group system -->
<!-- Permission granularity -->

### 4.2 Model Access Control

<!-- Per-model permissions -->
<!-- Group-based model access -->

### 4.3 Admin Controls

<!-- Feature toggles (what can be enabled/disabled) -->
<!-- User management -->
<!-- Configuration management via admin UI -->

**Files to examine**:
- `backend/open_webui/routers/groups.py`
- `backend/open_webui/utils/access_control.py`
- `src/lib/components/admin/`

---

## 5. Plugin & Pipeline System

### 5.1 Functions (BYOF)

<!-- How users write custom functions -->
<!-- Function types (filter, action, pipe) -->
<!-- Code editor in workspace -->
<!-- Dependency management -->
<!-- Sandboxing (RestrictedPython) -->

### 5.2 Pipelines

<!-- Pipeline framework architecture -->
<!-- Pipeline types -->
<!-- External pipeline servers -->
<!-- OpenAI URL redirection pattern -->

### 5.3 Tool Servers

<!-- External tool server connections -->
<!-- Discovery and registration -->
<!-- Tool manifest format -->

**Files to examine**:
- `backend/open_webui/routers/functions.py`
- `backend/open_webui/routers/pipelines.py`
- `backend/open_webui/routers/tools.py`
- `backend/open_webui/utils/plugin.py`

---

## 6. Admin Panel

<!-- Feature toggle inventory (count and categorize) -->
<!-- User management capabilities -->
<!-- System settings breadth -->
<!-- Connection management (Ollama, OpenAI, etc.) -->
<!-- Document and RAG settings -->
<!-- Web search configuration -->
<!-- Image generation settings -->
<!-- Audio settings -->
<!-- Security settings (LDAP, OAuth) -->

---

## 7. Keyboard Shortcuts

<!-- Catalog all shortcuts -->
<!-- Implementation pattern -->
<!-- Customizability -->

**Files to examine**:
- `src/lib/shortcuts.ts`

---

## 8. Developer Experience

### 8.1 API Quality

<!-- REST API design consistency -->
<!-- Documentation (OpenAPI/Swagger) -->
<!-- API versioning strategy -->
<!-- Error messages and codes — are they standardized? -->

### 8.2 Contribution Model

<!-- PR process — can a new contributor ship a feature within a week? -->
<!-- Code of conduct -->
<!-- Issue templates -->
<!-- CI/CD pipeline -->
<!-- What is the onboarding friction for new contributors? -->

### 8.3 Extension Points

<!-- Where developers can extend the system -->
<!-- Plugin API stability -->
<!-- Event hooks -->

### 8.4 Documentation

<!-- Docs quality and coverage -->
<!-- Setup guides -->
<!-- API reference -->

---

## 9. Community, Growth & Adoption

<!-- How did Open WebUI reach 124k stars? What drove adoption? -->
<!-- What was the growth trajectory? (check star history, contributor growth) -->
<!-- Community governance model (who makes decisions?) -->
<!-- Communication channels (Discord, GitHub Discussions, etc.) -->
<!-- What features seem most popular based on community signals? -->
<!-- What features seem underused based on community signals? -->
<!-- How do they handle community contributions? Acceptance rate? Response time? -->
<!-- What is their release cadence? -->
<!-- How does community engagement compare to project size? -->
<!-- What can NaW learn about community building from their approach? -->

---

## 10. PWA & Mobile

<!-- Progressive Web App setup -->
<!-- Offline capabilities -->
<!-- Mobile-specific UI adaptations -->

---

## 11. Tech Debt, Pain Points & Maintenance Burden

<!-- What do users complain about most? (Check GitHub issues, Discord) -->
<!-- What features feel half-baked or abandoned? -->
<!-- Is the UI consistent, or does it feel like it was built by many different contributors? -->
<!-- What is the cost of feature breadth on UX coherence? -->
<!-- Are there accessibility issues? -->
<!-- What breaks when the project updates? -->

---

## 12. Key Patterns Worth Studying

<!-- Specific UX/extensibility patterns with file references -->
<!-- Feature discoverability patterns -->
<!-- Admin panel patterns -->

---

## 13. Concerns & Anti-Patterns

<!-- UX issues, extensibility limitations, DX problems -->
<!-- Feature bloat indicators -->

---

## 14. Unexpected Findings

<!-- Document anything surprising, noteworthy, or not covered by the sections above -->
<!-- Clever solutions, hidden complexity, undocumented behavior, etc. -->

---

## 15. Recommendations Preview

<!-- Top 3-5 UX/extensibility/community recommendations for NaW -->
<!-- For each: what to adopt, what to adapt, what to deliberately skip (and why) -->

---

*Generated as part of Open WebUI competitive analysis. See `00-research-plan.md` for full plan.*
