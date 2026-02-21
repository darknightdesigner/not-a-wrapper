# Desktop CLI & Local File Access Research

> **Purpose:** Evaluate approaches to enable CLI execution and local file access, similar to Claude Desktop and Codex Desktop apps
>
> **Created:** February 2, 2026
>
> **Status:** 🔵 Research Needed

---

## Table of Contents

1. [Research Execution Guide](#research-execution-guide)
2. [Phase Overview](#phase-overview)
3. [Research Phases](#research-phases)
   - Phase 1: Architecture Foundation (Critical Path)
   - Phase 2: MCP Protocol Deep Dive
   - Phase 3: Security Model
   - Phase 4: File System Operations
   - Phase 5: CLI/Terminal Execution
   - Phase 6: Context & Intelligence
   - Phase 7: State & Memory
   - Phase 8: Performance & Reliability
   - Phase 9: Business & Legal
   - Phase 10: Advanced Capabilities
4. [Executive Summary](#executive-summary)
5. [Reference Implementations](#reference-implementations)
6. [Decision Matrix](#decision-matrix)
7. [Research Outputs Index](#research-outputs-index)
8. [AI Agent Research Protocol](#ai-agent-research-protocol)

---

## Research Execution Guide

### For AI Agents

This document is structured for **sequential phase execution**. Each phase is self-contained to maintain research coherence.

### Execution Rules

1. **Complete phases in order** — Later phases depend on earlier findings
2. **One phase per research session** — Don't combine phases
3. **Document outputs immediately** — Create research files before moving on
4. **Update parent document** — Mark questions as completed with links

### Phase Sizing Logic

| Phase Size | Questions | Use Case |
|------------|-----------|----------|
| **Small** | 6-8 questions | Simple, well-documented topics |
| **Medium** | 4-5 questions | Moderate complexity, some prototyping |
| **Large** | 2-3 questions | Deep technical investigation |
| **Critical** | 1-2 questions | Architecture-defining decisions |

### Before Each Phase

```markdown
## Pre-Phase Checklist
- [ ] Read this parent document's executive summary
- [ ] Review any completed research from prior phases
- [ ] Confirm dependencies from prior phases are answered
- [ ] Prepare research environment (browser, tools, APIs)
```

---

## Phase Overview

| Phase | Focus | Size | Dependencies | Priority |
|-------|-------|------|--------------|----------|
| **1** | Architecture Foundation | Critical | None | 🔴 Critical |
| **2** | MCP Protocol Deep Dive | Large | Phase 1 | 🔴 Critical |
| **3** | Security Model | Large | Phase 1, 2 | 🔴 Critical |
| **4** | File System Operations | Medium | Phase 1, 3 | 🟠 High |
| **5** | CLI/Terminal Execution | Medium | Phase 1, 3 | 🟠 High |
| **6** | Context & Intelligence | Large | Phase 1, 4 | 🟠 High |
| **7** | State & Memory | Medium | Phase 4, 5 | 🟡 Medium |
| **8** | Performance & Reliability | Medium | Phase 4, 5, 6 | 🟡 Medium |
| **9** | Business & Legal | Medium | Phase 1-8 | 🟡 Medium |
| **10** | Advanced Capabilities | Small | All prior | 🟢 Low |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RESEARCH DEPENDENCY GRAPH                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                          ┌─────────────────┐                            │
│                          │   PHASE 1       │                            │
│                          │  Architecture   │                            │
│                          │  (CRITICAL)     │                            │
│                          └────────┬────────┘                            │
│                                   │                                      │
│                    ┌──────────────┼──────────────┐                      │
│                    ▼              ▼              ▼                       │
│            ┌───────────┐  ┌───────────┐  ┌───────────┐                  │
│            │  PHASE 2  │  │  PHASE 3  │  │   Later   │                  │
│            │    MCP    │──│  Security │  │  Phases   │                  │
│            │  (LARGE)  │  │  (LARGE)  │  │           │                  │
│            └─────┬─────┘  └─────┬─────┘  └───────────┘                  │
│                  │              │                                        │
│                  └──────┬───────┘                                        │
│                         ▼                                                │
│              ┌─────────────────────┐                                    │
│              │    PHASE 4 & 5      │                                    │
│              │  File System & CLI  │                                    │
│              │     (MEDIUM)        │                                    │
│              └──────────┬──────────┘                                    │
│                         │                                                │
│           ┌─────────────┼─────────────┐                                 │
│           ▼             ▼             ▼                                  │
│    ┌───────────┐ ┌───────────┐ ┌───────────┐                            │
│    │  PHASE 6  │ │  PHASE 7  │ │  PHASE 8  │                            │
│    │  Context  │ │   State   │ │   Perf    │                            │
│    └─────┬─────┘ └─────┬─────┘ └─────┬─────┘                            │
│          └─────────────┼─────────────┘                                  │
│                        ▼                                                 │
│                 ┌───────────┐                                            │
│                 │  PHASE 9  │                                            │
│                 │ Business  │                                            │
│                 └─────┬─────┘                                            │
│                       ▼                                                  │
│                ┌───────────┐                                             │
│                │ PHASE 10  │                                             │
│                │ Advanced  │                                             │
│                └───────────┘                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Research Phases

---

### Phase 1: Architecture Foundation (CRITICAL)

> **Size:** Critical (1-2 questions)
> **Dependencies:** None
> **Output File:** `001-architecture-foundation.md`

This phase determines the entire project direction. Take time to deeply explore each option with prototypes.

#### Questions

| ID | Question | Why Critical |
|----|----------|--------------|
| **1.1** | Should we build a desktop app (Electron/Tauri) or a local agent that the web app connects to? | Determines entire tech stack, distribution model, and development effort |
| **1.2** | What are the concrete tradeoffs between Electron vs. Tauri vs. native apps for our use case? | Bundle size, security, performance, ecosystem, cross-platform |

#### Research Tasks

```markdown
## Required Investigation

### 1.1 Desktop App vs Local Agent

- [ ] Document Claude Desktop's architecture (how does it work?)
- [ ] Document Codex's architecture (is it documented? reverse-engineer if needed)
- [ ] Document Cursor's architecture (VS Code fork approach)
- [ ] Prototype: Minimal Tauri app that reads a file
- [ ] Prototype: Local agent (Node/Rust) with WebSocket, web app connects
- [ ] Compare: Development complexity for each approach
- [ ] Compare: Distribution/update mechanisms
- [ ] Compare: User experience (installation, first run, daily use)

### 1.2 Framework Evaluation

- [ ] Electron: Bundle size, memory usage, security model, auto-updates
- [ ] Tauri: Bundle size, Rust learning curve, WebView limitations, security
- [ ] Native (Swift/Kotlin): Platform-specific effort, performance, UX
- [ ] Create comparison matrix with weighted scores
```

#### Decision Options

| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| **A. Electron Desktop App** | Full control, proven (Claude, Cursor), large ecosystem | Large bundle (~200MB), Chromium overhead, memory | Medium |
| **B. Tauri Desktop App** | Small bundle (~10MB), Rust security, modern | Smaller ecosystem, WebView quirks, Rust expertise | Medium-High |
| **C. Local Agent (Daemon)** | Web UI stays, minimal install, lightweight | IPC complexity, service management, two codebases | Medium |
| **D. VS Code Extension** | Leverages existing IDE, familiar to devs | Limited to VS Code users, constrained by extension API | Low |
| **E. CLI + Web UI** | Simplest, portable, no GUI overhead | Split UX, manual coordination, less polished | Low |

#### Success Criteria

- [ ] Clear recommendation with confidence level
- [ ] Working prototype for recommended approach
- [ ] Documented technical risks and mitigations
- [ ] Estimated development effort for MVP

---

### Phase 2: MCP Protocol Deep Dive (LARGE)

> **Size:** Large (3 questions)
> **Dependencies:** Phase 1 (architecture decision affects MCP integration)
> **Output File:** `002-mcp-protocol-evaluation.md`

Deep investigation into Model Context Protocol for tool integration standardization.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **2.1** | What is the complete MCP specification and who maintains it? | Foundation for all tool integration decisions |
| **2.2** | What MCP servers already exist and can we use them? | Avoid rebuilding, leverage community |
| **2.3** | How hard is it to create custom MCP servers? | Extensibility assessment |

#### Research Tasks

```markdown
## Required Investigation

### 2.1 MCP Specification

- [ ] Find and read complete MCP specification
- [ ] Document: Message format (JSON-RPC? Custom?)
- [ ] Document: Transport options (stdio, HTTP, WebSocket)
- [ ] Document: Tool discovery and registration
- [ ] Document: Authentication model
- [ ] Document: Error handling patterns
- [ ] Document: Streaming response support
- [ ] Is MCP open standard or Anthropic-proprietary?
- [ ] What's the governance and versioning model?

### 2.2 Existing MCP Servers

- [ ] Research: @modelcontextprotocol/server-filesystem
- [ ] Research: @modelcontextprotocol/server-git
- [ ] Research: @modelcontextprotocol/server-sqlite
- [ ] Research: @modelcontextprotocol/server-puppeteer
- [ ] Search GitHub for community MCP servers
- [ ] Test: Connect to MCP servers from Claude Desktop
- [ ] Document: Which servers ship by default vs user-installed

### 2.3 Custom MCP Development

- [ ] Create minimal MCP server (hello world)
- [ ] Create MCP server with file read capability
- [ ] Document: Development tooling and debugging
- [ ] Document: Testing approaches
- [ ] Estimate: Time to build common operations as MCP servers
```

#### MCP Integration Options

| Option | Description | Effort | Ecosystem |
|--------|-------------|--------|-----------|
| **Adopt MCP fully** | Build app as MCP host | High | Full community tools |
| **MCP-compatible** | Support MCP servers as plugins | Medium | Community tools optional |
| **MCP-inspired** | Use similar patterns, custom protocol | Medium | Custom tools only |
| **Custom tooling** | Build proprietary tool system | Low-Medium | Custom tools only |

#### Success Criteria

- [ ] Complete understanding of MCP specification
- [ ] Working custom MCP server prototype
- [ ] Recommendation on MCP adoption level
- [ ] Catalog of useful existing MCP servers

---

### Phase 3: Security Model (LARGE)

> **Size:** Large (3 questions)
> **Dependencies:** Phase 1 (architecture), Phase 2 (MCP security model)
> **Output File:** `003-security-model.md`

Security is critical for local access. This phase defines the permission and sandboxing model.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **3.1** | What permission model should we use? (per-session, per-workspace, granular) | User trust vs. friction tradeoff |
| **3.2** | How do we sandbox CLI command execution? | Prevent destructive operations |
| **3.3** | What threats do we need to defend against? | Security architecture foundation |

#### Research Tasks

```markdown
## Required Investigation

### 3.1 Permission Models

- [ ] Study: Claude Desktop's permission model
- [ ] Study: Cursor's permission model
- [ ] Study: VS Code extension permission model
- [ ] Design: Permission levels (read, write, execute, network)
- [ ] Design: Scope options (file, folder, workspace, system)
- [ ] Design: Approval flow UX (modal, inline, persistent)
- [ ] User research: What level of control do users want?

### 3.2 Sandboxing Options

- [ ] Research: Docker container sandboxing (overhead, limitations)
- [ ] Research: macOS sandbox-exec (capabilities, limitations)
- [ ] Research: Linux seccomp/AppArmor (capabilities, limitations)
- [ ] Research: Windows sandboxing options
- [ ] Research: Firecracker/microVMs (overkill?)
- [ ] Prototype: Sandboxed command execution
- [ ] Benchmark: Performance impact of sandboxing options

### 3.3 Threat Modeling

- [ ] Threat: Prompt injection via file contents
- [ ] Threat: Destructive commands (rm -rf, etc.)
- [ ] Threat: Data exfiltration (curl to external)
- [ ] Threat: Privilege escalation
- [ ] Threat: Malicious MCP servers (supply chain)
- [ ] For each threat: Likelihood, Impact, Mitigation
```

#### Permission Model Options

| Model | Description | Security | UX |
|-------|-------------|----------|-----|
| **Ask Every Time** | Confirm each operation | High | Poor |
| **Session Approval** | Approve once per session | Medium-High | Good |
| **Workspace Trust** | Trust specific folders | Medium | Good |
| **Capability Groups** | Approve categories (read, write, exec) | Medium-High | Good |
| **Full Trust Mode** | User responsibility | Low | Excellent |

#### Success Criteria

- [ ] Recommended permission model with UX mockups
- [ ] Sandboxing recommendation with prototype
- [ ] Complete threat model with mitigations
- [ ] Security requirements document

---

### Phase 4: File System Operations (MEDIUM)

> **Size:** Medium (5 questions)
> **Dependencies:** Phase 1, Phase 3 (security model)
> **Output File:** `004-file-system-operations.md`

Define how file reading and writing works.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **4.1** | How should we scope file access? (workspace root, specific folders, all files) | Security boundary |
| **4.2** | How do we handle large files and token limits? | Context management |
| **4.3** | What's the permission model for file writes? | User trust, undo capability |
| **4.4** | Should we implement atomic writes with backups? | Data safety |
| **4.5** | How do we handle binary files vs. text files? | Different handling needed |

#### Research Tasks

```markdown
## Required Investigation

### Read Operations
- [ ] Define: Maximum file size to support
- [ ] Design: Chunking strategy for large files
- [ ] Design: Encoding detection (UTF-8, binary, etc.)
- [ ] Design: Symlink handling policy
- [ ] Research: File watching for auto-refresh (fs.watch, chokidar)

### Write Operations
- [ ] Design: Diff/patch format for edits
- [ ] Design: New file vs. edit existing distinction
- [ ] Design: Backup strategy before writes
- [ ] Design: Atomic write implementation
- [ ] Design: File permission (chmod) handling
- [ ] Research: Handling merge conflicts (external changes)
```

#### Success Criteria

- [ ] File access scoping policy defined
- [ ] Large file handling strategy
- [ ] Write permission flow documented
- [ ] Atomic write + backup prototype

---

### Phase 5: CLI/Terminal Execution (MEDIUM)

> **Size:** Medium (5 questions)
> **Dependencies:** Phase 1, Phase 3 (security model)
> **Output File:** `005-cli-terminal-execution.md`

Define safe command execution patterns.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **5.1** | How do we safely execute shell commands? | Security is critical |
| **5.2** | Should commands run in a sandbox? | Isolation vs. functionality |
| **5.3** | How do we handle long-running commands? | Background processes, timeouts |
| **5.4** | Should we implement command allowlists/blocklists? | Prevent destructive operations |
| **5.5** | How do we handle environment variables and PATH? | Execution environment |

#### Research Tasks

```markdown
## Required Investigation

### Command Execution
- [ ] Design: Which shell to use (user's default, bash, zsh)
- [ ] Design: Environment variable handling
- [ ] Design: Working directory management
- [ ] Design: stdout/stderr handling (streaming vs. buffered)
- [ ] Design: Interactive command handling (TTY, prompts)
- [ ] Design: Timeout strategy for runaway processes

### Command Classification
- [ ] Define: Safe commands (auto-approve): ls, cat, echo, pwd
- [ ] Define: Development commands (approve with context): npm, git status
- [ ] Define: Modifying commands (require confirmation): git commit, rm
- [ ] Define: Dangerous commands (block/strong warning): rm -rf, sudo
- [ ] Define: Forbidden commands (always block): accessing .env, credentials
- [ ] Design: How to handle piped commands and subshells
```

#### Command Categories

| Category | Examples | Policy |
|----------|----------|--------|
| **Safe** | `ls`, `cat`, `echo`, `pwd` | Auto-approve |
| **Development** | `npm install`, `git status`, `docker ps` | Approve with context |
| **Modifying** | `git commit`, `npm publish`, `rm` | Require confirmation |
| **Dangerous** | `rm -rf`, `sudo`, `curl \| bash` | Block or strong warning |
| **Forbidden** | Accessing `.env`, credentials | Always block |

#### Success Criteria

- [ ] Command execution architecture defined
- [ ] Command classification system complete
- [ ] Sandbox implementation prototype
- [ ] Long-running command handling design

---

### Phase 6: Context & Intelligence (LARGE)

> **Size:** Large (3 questions)
> **Dependencies:** Phase 1, Phase 4 (file access)
> **Output File:** `006-context-intelligence.md`

How to handle large codebases and enable semantic search.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **6.1** | How do we handle codebases that exceed context window limits? | Most real projects are 100K+ lines |
| **6.2** | Should we build a local vector index of the codebase? | Enables semantic code search |
| **6.3** | Should we integrate Language Server Protocol (LSP)? | Type info, definitions, references |

#### Research Tasks

```markdown
## Required Investigation

### 6.1 Context Window Management
- [ ] Research: How does Cursor handle context limits?
- [ ] Research: How does Codex handle context limits?
- [ ] Design: Context budget allocation (system prompt vs. files vs. conversation)
- [ ] Design: File prioritization (relevance, recency, user focus)
- [ ] Design: Chunking strategy for files > context limit
- [ ] Design: Sliding window vs. summary-based context management
- [ ] Design: Stale context detection and refresh

### 6.2 Codebase Indexing
- [ ] Research: Embedding models for code (OpenAI, Cohere, local)
- [ ] Research: Vector DB options (SQLite-vec, LanceDB, Pinecone)
- [ ] Design: Indexing strategy (full, lazy, background)
- [ ] Design: Multi-language project handling
- [ ] Design: Index sync with file changes
- [ ] Prototype: Index sample project, benchmark search latency
- [ ] Estimate: Storage overhead for typical projects

### 6.3 LSP Integration
- [ ] Research: TypeScript LSP integration
- [ ] Research: Python LSP integration
- [ ] Research: Multi-language LSP support
- [ ] Design: How to visualize code structure to AI
- [ ] Design: Fallback for projects without LSP support
```

#### Indexing Strategies

| Strategy | Description | Tradeoffs |
|----------|-------------|-----------|
| **Full index on open** | Index entire workspace at start | Slow startup, comprehensive |
| **Lazy indexing** | Index files as accessed | Fast startup, incomplete |
| **Background indexing** | Index incrementally | Good balance, complexity |
| **Cloud indexing** | Use cloud for embeddings | Fast, privacy concerns |
| **No indexing** | Grep/AST only | Simple, limited semantic |

#### Success Criteria

- [ ] Context management strategy defined
- [ ] Indexing approach recommended with prototype
- [ ] LSP integration plan (or rejection rationale)
- [ ] Performance benchmarks for search

---

### Phase 7: State & Memory (MEDIUM)

> **Size:** Medium (4 questions)
> **Dependencies:** Phase 4, Phase 5
> **Output File:** `007-state-memory.md`

Session persistence, AI memory, and undo capabilities.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **7.1** | How do we persist state between sessions? | Continuity of work |
| **7.2** | Should the AI learn user preferences over time? | Personalization |
| **7.3** | How do users undo AI-made changes? | Trust and safety |
| **7.4** | Should we create automatic git commits for AI changes? | Granular rollback |

#### Research Tasks

```markdown
## Required Investigation

### Session State
- [ ] Design: Where is state stored? (local file, IndexedDB, cloud)
- [ ] Design: State sync between web and local agent
- [ ] Design: Retention policy for old sessions
- [ ] Design: Interrupted operation recovery
- [ ] Design: Session forking for different approaches

### AI Memory
- [ ] Design: User preference storage (coding style, tools)
- [ ] Design: Project-specific knowledge persistence
- [ ] Design: Memory isolation across projects
- [ ] Design: "Notes" system for AI to write to

### Undo/Redo
- [ ] Compare: Git-based vs. backup files vs. in-memory history
- [ ] Design: Multi-file atomic rollback
- [ ] Design: Undo UI/UX
- [ ] Prototype: Undo mechanism for recommended approach
```

#### Undo Strategies

| Strategy | Description | Complexity |
|----------|-------------|------------|
| **Git-based** | Auto-commit each change, revert commits | Medium |
| **Backup files** | Keep `.bak` files before changes | Low |
| **In-memory history** | Track changes in session memory | Low |
| **Patch-based** | Store reverse patches | Medium |
| **Snapshot-based** | Periodic full snapshots | High |

#### Success Criteria

- [ ] Session persistence design
- [ ] AI memory approach (or decision to skip)
- [ ] Undo mechanism prototype
- [ ] State management architecture doc

---

### Phase 8: Performance & Reliability (MEDIUM)

> **Size:** Medium (4 questions)
> **Dependencies:** Phase 4, Phase 5, Phase 6
> **Output File:** `008-performance-reliability.md`

Latency, error handling, and resource management.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **8.1** | What are the latency budgets for each operation? | UX responsiveness |
| **8.2** | What happens if a multi-file operation fails midway? | Data integrity |
| **8.3** | How do we handle network failures during operations? | Resilience |
| **8.4** | How do we limit resource usage for large projects? | System stability |

#### Research Tasks

```markdown
## Required Investigation

### Latency
- [ ] Define: Target latency per operation type
- [ ] Design: Prefetching for likely-needed files
- [ ] Design: Progress indicators for long operations
- [ ] Benchmark: Actual latency in prototype implementations

### Error Handling
- [ ] Design: Partial failure handling for multi-file ops
- [ ] Design: Retry logic for transient failures
- [ ] Design: User-facing error messages
- [ ] Catalog: All failure scenarios to handle

### Resource Management
- [ ] Design: Memory limits for file caching
- [ ] Design: File handle limits
- [ ] Design: Handling projects with millions of files
- [ ] Design: Background indexing CPU throttling
```

#### Latency Budgets

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| File read | <100ms | <500ms | >1s |
| File write | <200ms | <1s | >3s |
| Command start | <100ms | <300ms | >1s |
| Index search | <200ms | <500ms | >2s |
| AI response (first token) | <1s | <3s | >5s |

#### Failure Scenarios

- [ ] File locked by another process
- [ ] Disk full
- [ ] Permission denied
- [ ] Network timeout during AI call
- [ ] AI response truncated
- [ ] Command hangs indefinitely
- [ ] Out of memory
- [ ] Agent crashes mid-operation

#### Success Criteria

- [ ] Latency budgets defined and validated
- [ ] Error handling patterns documented
- [ ] Resource management strategy
- [ ] Reliability requirements doc

---

### Phase 9: Business & Legal (MEDIUM)

> **Size:** Medium (5 questions)
> **Dependencies:** Phase 1-8 (need technical understanding)
> **Output File:** `009-business-legal.md`

Pricing, monetization, and legal considerations.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **9.1** | Is local access a free or premium feature? | Business model |
| **9.2** | How do we minimize token usage while maintaining quality? | Cost control |
| **9.3** | Who owns AI-generated code? What's our liability? | Legal clarity |
| **9.4** | How do we handle code with sensitive data? | Privacy |
| **9.5** | Do we need enterprise compliance (SOC 2, GDPR)? | Enterprise sales |

#### Research Tasks

```markdown
## Required Investigation

### Pricing & Business
- [ ] Research: Cursor pricing model
- [ ] Research: Windsurf pricing model
- [ ] Research: GitHub Copilot pricing model
- [ ] Calculate: Token costs for typical coding sessions
- [ ] Design: Pricing tiers (free, premium, enterprise)
- [ ] Design: BYOK implementation complexity
- [ ] Model: Different pricing scenarios

### Legal
- [ ] Research: AI-generated code ownership precedents
- [ ] Research: Competitor Terms of Service
- [ ] Consult: Legal review on liability for AI-caused damage
- [ ] Design: Privacy policy for local file access
- [ ] Research: Code license scanning tools
- [ ] Research: Enterprise compliance requirements

### Data Privacy
- [ ] Design: What data is sent to AI providers
- [ ] Design: Data retention policies
- [ ] Design: User control over data
- [ ] Design: Sensitive data detection (API keys, etc.)
```

#### Pricing Models

| Model | Description | Examples |
|-------|-------------|----------|
| **Free with limits** | Basic local access, limited operations | Cursor free tier |
| **Premium feature** | Part of paid plan | Claude Pro |
| **Usage-based** | Pay per operation | API pricing |
| **Unlimited premium** | Flat monthly fee | Cursor Pro |

#### Success Criteria

- [ ] Pricing recommendation
- [ ] Cost optimization strategies
- [ ] Legal requirements documented
- [ ] Privacy policy draft

---

### Phase 10: Advanced Capabilities (SMALL)

> **Size:** Small (6 questions)
> **Dependencies:** All prior phases
> **Output File:** `010-advanced-capabilities.md`

Future features: multi-repo, remote dev, collaboration, testing.

#### Questions

| ID | Question | Why It Matters |
|----|----------|----------------|
| **10.1** | Can users work across multiple repos simultaneously? | Monorepo, microservices |
| **10.2** | Should we support SSH to remote servers? | Cloud development |
| **10.3** | How do we handle WSL (Windows Subsystem for Linux)? | Windows developers |
| **10.4** | Can multiple users work on the same workspace? | Team scenarios |
| **10.5** | Should the AI be able to run tests and interpret results? | Quality assurance |
| **10.6** | Can the AI fix failing tests automatically? | Agentic capability |

#### Research Tasks

```markdown
## Required Investigation

### Multi-Repository
- [ ] Design: Cross-repo context handling
- [ ] Design: Git submodules support
- [ ] Design: Per-repo permission scoping

### Remote Development
- [ ] Research: SSH file access complexity
- [ ] Research: WSL integration approaches
- [ ] Research: Devcontainer support
- [ ] Priority ranking for remote scenarios

### Collaboration
- [ ] Design: Concurrent AI operations handling
- [ ] Design: Shared conversation history
- [ ] Design: Permission levels for team members

### Testing Integration
- [ ] Design: Test framework detection
- [ ] Design: Result parsing (pass/fail, errors)
- [ ] Design: Auto-fix capability scope
- [ ] Design: TDD workflow support
```

#### Remote Scenarios Priority

| Scenario | Complexity | Priority |
|----------|------------|----------|
| Local filesystem | Baseline | 🔴 MVP |
| WSL from Windows | Medium | 🟠 v1.1 |
| Docker container | Medium | 🟠 v1.1 |
| SSH to remote server | High | 🟡 v2 |
| Remote devcontainer | High | 🟡 v2 |
| Cloud IDE (Codespaces) | Very High | 🟢 Future |

#### Test Integration Levels

| Level | Description | Complexity |
|-------|-------------|------------|
| **Run tests** | Execute command, show output | Low |
| **Parse results** | Understand pass/fail | Medium |
| **Fix failures** | Auto-attempt fixes | High |
| **Generate tests** | Create new tests | High |
| **TDD workflow** | Full TDD support | Very High |

#### Success Criteria

- [ ] Feature prioritization for post-MVP
- [ ] Remote development roadmap
- [ ] Collaboration requirements (if needed)
- [ ] Testing integration scope

---

## Executive Summary

### Goal

Enable "Not A Wrapper" to have capabilities similar to:
- **Claude Desktop App** — File access, CLI execution via MCP (Model Context Protocol)
- **Codex Desktop App** — Agentic coding with file system and terminal access

### Current State

| Capability | Current | Target |
|------------|---------|--------|
| Chat with AI | ✅ Yes | ✅ Yes |
| Read local files | ❌ No | ✅ Yes |
| Write local files | ❌ No | ✅ Yes |
| Execute CLI commands | ❌ No | ✅ Yes |
| Access user's workspace | ❌ No | ✅ Yes |
| Real-time file watching | ❌ No | 🟡 Nice to have |

### Why This Matters

A web-only AI chat cannot:
- Access or modify files on the user's machine
- Run terminal commands (npm, git, docker, etc.)
- Interact with local development environments
- Read project context from the filesystem

---

## Reference Implementations

### Claude Desktop App

| Feature | How It Works |
|---------|--------------|
| **MCP (Model Context Protocol)** | Extensible protocol for tools |
| **File Access** | Via MCP "filesystem" server |
| **CLI Access** | Via MCP or native integration |
| **Architecture** | Electron app + local MCP servers |
| **Security** | User approves tool access per session |

### Codex Desktop App (OpenAI)

| Feature | How It Works |
|---------|--------------|
| **Terminal Access** | Direct shell execution |
| **File Operations** | Read/write via APIs |
| **Workspace Context** | Indexes project structure |
| **Architecture** | Likely Electron or native app |
| **Security** | Sandboxed execution, user approval |

### Cursor IDE

| Feature | How It Works |
|---------|--------------|
| **File Access** | Native VS Code file system APIs |
| **Terminal** | Integrated terminal via VS Code |
| **Architecture** | VS Code fork (Electron-based) |
| **AI Integration** | Custom sidebar + inline editing |

### Competitive Feature Matrix

| Feature | Claude Desktop | Codex | Cursor | Windsurf | Our Target |
|---------|---------------|-------|--------|----------|------------|
| File read | ✅ | ✅ | ✅ | ✅ | ✅ |
| File write | ✅ | ✅ | ✅ | ✅ | ✅ |
| CLI execution | ✅ | ✅ | ✅ | ✅ | ✅ |
| Git integration | ⚡ MCP | ✅ | ✅ | ✅ | ✅ |
| Multi-file edits | ? | ✅ | ✅ | ✅ | ✅ |
| Custom tools/MCP | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## Decision Matrix

### Weight Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| **User Experience** | 30% | Ease of use, minimal friction |
| **Security** | 25% | Safe by default, user control |
| **Development Effort** | 20% | Time to build and maintain |
| **Extensibility** | 15% | Future capabilities, MCP support |
| **Cross-Platform** | 10% | macOS, Windows, Linux support |

### Option Scoring (To Be Completed After Research)

| Option | UX | Security | Effort | Extensibility | Cross-Platform | Total |
|--------|-----|----------|--------|---------------|----------------|-------|
| Electron App | ? | ? | ? | ? | ? | ? |
| Tauri App | ? | ? | ? | ? | ? | ? |
| Local Agent | ? | ? | ? | ? | ? | ? |
| VS Code Extension | ? | ? | ? | ? | ? | ? |
| CLI + Web | ? | ? | ? | ? | ? | ? |

---

## Research Outputs Index

> Track all research outputs from this parent document.

| # | Topic | Phase | Questions | Status | Date | Link |
|---|-------|-------|-----------|--------|------|------|
| 001 | Architecture Foundation | 1 | 1.1, 1.2 | 🔵 Pending | — | — |
| 002 | MCP Protocol Evaluation | 2 | 2.1, 2.2, 2.3 | 🔵 Pending | — | — |
| 003 | Security Model | 3 | 3.1, 3.2, 3.3 | 🔵 Pending | — | — |
| 004 | File System Operations | 4 | 4.1-4.5 | 🔵 Pending | — | — |
| 005 | CLI/Terminal Execution | 5 | 5.1-5.5 | 🔵 Pending | — | — |
| 006 | Context & Intelligence | 6 | 6.1-6.3 | 🔵 Pending | — | — |
| 007 | State & Memory | 7 | 7.1-7.4 | 🔵 Pending | — | — |
| 008 | Performance & Reliability | 8 | 8.1-8.4 | 🔵 Pending | — | — |
| 009 | Business & Legal | 9 | 9.1-9.5 | 🔵 Pending | — | — |
| 010 | Advanced Capabilities | 10 | 10.1-10.6 | 🔵 Pending | — | — |

---

## AI Agent Research Protocol

> **For AI Agents:** When conducting research on any phase in this document, follow the output format and verification process below.

### Expected Output Format

When investigating questions from this document, create a **numbered markdown file** in the research folder:

```
.agents/research/
├── desktop-cli-local-access-evaluation.md  ← This document (parent)
├── 001-architecture-foundation.md          ← Phase 1 output
├── 002-mcp-protocol-evaluation.md          ← Phase 2 output
├── 003-security-model.md                   ← Phase 3 output
└── ...
```

### Required Sections in Research Output

Each research output file MUST include these sections:

```markdown
# [Phase Title]

> **Parent Document:** desktop-cli-local-access-evaluation.md
> **Phase:** [Phase number and name]
> **Questions Investigated:** [List question IDs from parent doc]
> **Research Date:** [Date]
> **Researcher:** [AI Agent identifier]
> **Status:** 🟢 Complete | 🟡 Partial | 🔴 Blocked

---

## Executive Summary

[2-3 paragraph summary of findings and recommendations]

---

## Research Methodology

- Sources consulted: [list]
- Tools/APIs tested: [list]
- Prototypes created: [yes/no, location if yes]

---

## Findings

### [Question ID]: [Question Text]

**Finding:** [Detailed findings with evidence]

**Evidence:**
- [Source 1]
- [Source 2]

**Confidence Level:** High | Medium | Low

[Repeat for each question...]

---

## Recommendations

| Option | Recommendation | Confidence | Effort |
|--------|----------------|------------|--------|
| [Option A] | ✅ Recommended | High | Medium |
| [Option B] | ⚠️ Consider | Medium | Low |
| [Option C] | ❌ Not Recommended | High | High |

**Primary Recommendation:** [State the recommended path]

**Rationale:** [Why this recommendation?]

---

## Uncertainties & Gaps

| Gap | Why It Matters | Suggested Next Step |
|-----|----------------|---------------------|
| [Gap 1] | [Impact] | [Action] |

---

## Dependencies for Next Phases

[What decisions/findings from this phase are required for later phases?]

---

## Sources & References

1. [Source Name](URL) — [Brief description]
2. [Source Name](URL) — [Brief description]
```

### Research Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RESEARCH WORKFLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SELECT PHASE                                                │
│     └─→ Choose next uncompleted phase from this document        │
│                                                                  │
│  2. CHECK DEPENDENCIES                                          │
│     └─→ Ensure prerequisite phases are completed                │
│                                                                  │
│  3. CONDUCT RESEARCH                                            │
│     ├─→ Web search for authoritative sources                    │
│     ├─→ Read official documentation                             │
│     ├─→ Test tools/APIs hands-on                                │
│     └─→ Create prototypes if specified                          │
│                                                                  │
│  4. DOCUMENT FINDINGS                                           │
│     └─→ Create NNN-[topic].md using template above              │
│                                                                  │
│  5. UPDATE PARENT DOCUMENT                                      │
│     ├─→ Update Research Outputs Index                           │
│     └─→ Note any blocking issues                                │
│                                                                  │
│  6. IDENTIFY NEXT PHASE                                         │
│     └─→ Determine which phase to research next                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Verification Prompt

> **For Review Agent:** Use this prompt to verify completed research.

```
You are a senior technical reviewer verifying AI-conducted research.

## Research to Review
- **Phase:** [Phase number and title]
- **File:** .agents/research/NNN-[topic].md

## Your Task

1. **Fact-Check Claims** — Verify against authoritative sources
2. **Identify Biases** — Look for confirmation, recency, vendor bias
3. **Evaluate Methodology** — Was the approach appropriate?
4. **Assess Confidence Levels** — Are they justified?
5. **Check for Gaps** — What was missed?
6. **Validate Recommendations** — Do findings support them?

## Output Format

### Verification Summary
- **Overall Assessment:** ✅ Verified | ⚠️ Needs Revision | ❌ Major Issues
- **Accuracy Score:** [1-10]
- **Completeness Score:** [1-10]

### Issues Found
| Issue | Severity | Location | Suggested Fix |
|-------|----------|----------|---------------|

### Final Recommendation
[Confirm, modify, or reject the original recommendation]
```

### Quality Standards

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Accuracy** | 30% | Claims are factually correct and sourced |
| **Completeness** | 25% | All questions in the phase addressed |
| **Actionability** | 20% | Findings lead to clear recommendations |
| **Clarity** | 15% | Well-organized, easy to understand |
| **Verifiability** | 10% | Another agent can verify findings |

---

## Open Questions Log

*Track questions that arise during research and their eventual answers.*

| Question | Phase | Date Asked | Status | Answer/Notes |
|----------|-------|------------|--------|--------------|
| Is MCP specification stable? | 2 | 2026-02-02 | 🔵 Open | — |

---

## Changelog

| Date | Changes |
|------|---------|
| 2026-02-02 | Initial research document created |
| 2026-02-02 | Added comprehensive research sections |
| 2026-02-03 | **Major restructure:** Reorganized for AI agent execution with prioritized phases |
| 2026-02-03 | Added phase dependency graph |
| 2026-02-03 | Grouped questions by complexity and phase requirements |
| 2026-02-03 | Removed context budget references |

---

*Research document for evaluating CLI and local file access capabilities.*
