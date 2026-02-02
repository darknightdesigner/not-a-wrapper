# AI Context Setup Guide for Heavy Orchestration Projects

*Research compiled: January 2026*
*Last updated: January 13, 2026*

**Recent Updates:**
- Added Anthropic's official context management strategies (context rot, compaction, sub-agents)
- Updated to Claude 4.5 models (Opus 4.5, Sonnet 4.5, Haiku 4.5)
- Added four-phase coding cycle, TDD workflow, extended thinking, parallel tool calling
- **Expanded project structure** with nested CLAUDE.md, .claude/settings.json, numerical Cursor rules naming
- Added "When to Use Which File" decision matrix
- Added custom slash command documentation with frontmatter
- Added vid0 case study with finalized tech stack decisions (Convex + Clerk + Flowglad)
- Added practical sub-agent architecture example for YouTube content analysis
- Added gold standard code pattern examples from real codebase
- Added Convex + AI/RAG as context management backend option
- **COMPLETED:** Full project setup — all context files, nested CLAUDE.md files, Cursor rules, and Claude commands created

## Overview

This guide documents best practices for setting up context markdown files in coding projects that require heavy AI orchestration for research, planning, and execution. Based on 2025-2026 industry standards and practices, including official guidance from Anthropic's engineering documentation.

## The 2025 Context File Landscape

The industry has standardized around several key file types for AI agent context:

### 1. AGENTS.md - The Universal Standard
- **Adoption**: Used by 60,000+ open-source projects
- **Purpose**: Provides project-wide rules for any AI agent
- **Backing**: Adopted by OpenAI and the Agentic AI Foundation (AAIF)
- **Use Case**: Single source of truth for how AI should interact with your codebase

### 2. CLAUDE.md - Claude-Specific Context
- **Purpose**: Automatically pulled into Claude conversations
- **Best For**: Repository etiquette, developer environment setup, unexpected behaviors
- **Integration**: Native support in Claude Code and Claude API tools

### 3. .cursor/rules/*.mdc - Cursor's Modern Format
- **Status**: Replaced deprecated .cursorrules file
- **Structure**: Organized individual rule files in `.cursor/rules/` directory
- **Behavior**: Auto-included when matching files are referenced
- **Benefit**: Better organization, easier updates, more focused rule management

### 4. Model Context Protocol (MCP)
- **Origin**: Anthropic's open protocol (now under Linux Foundation/AAIF)
- **Purpose**: Standardizes how AI accesses data, tools, and services
- **Adoption**: Near-universal adoption across the ecosystem in 2025

### 5. .copilot-instructions.md - GitHub Copilot
- **Purpose**: Project-specific instructions for GitHub Copilot
- **Content**: App purpose, design decisions, coding standards
- **Behavior**: Read automatically by Copilot during code generation

## Recommended Project Structure

### Complete Structure

```
your-project/
├── AGENTS.md                    # Universal AI agent instructions (AAIF standard)
├── CLAUDE.md                    # Claude-specific context (root level)
├── .copilot-instructions.md     # GitHub Copilot instructions
├── spec.md                      # Requirements & architecture
├── plan.md                      # Implementation roadmap & scratchpad
├── NOTES.md                     # Agentic memory (structured note-taking)
│
├── context/                     # Organized context documents
│   ├── architecture.md          # System design, patterns, data models
│   ├── conventions.md           # Code style, naming, file organization
│   ├── api.md                   # API patterns, contracts, usage
│   ├── database.md              # Schema, queries, migrations
│   ├── testing.md               # Test structure, coverage, mocking
│   └── deployment.md            # Environment setup, CI/CD, infrastructure
│
├── src/
│   ├── CLAUDE.md                # Module-specific Claude context (nested)
│   ├── auth/
│   │   └── CLAUDE.md            # Auth module-specific context
│   └── api/
│       └── CLAUDE.md            # API module-specific context
│
├── .cursor/
│   └── rules/
│       ├── 001_core.mdc         # Core workspace rules (001-099)
│       ├── 002_security.mdc     # Security guidelines
│       ├── 100_typescript.mdc   # TypeScript rules (100-199)
│       ├── 101_react.mdc        # React/component rules
│       ├── 200_testing.mdc      # Testing patterns (200-299)
│       └── 201_api.mdc          # API patterns
│
├── .claude/
│   ├── settings.json            # Shared project settings (commit to git)
│   ├── settings.local.json      # Personal settings (gitignored)
│   └── commands/                # Custom slash commands
│       ├── refactor.md          # /refactor command
│       ├── test.md              # /test command
│       ├── review.md            # /review command
│       └── security/            # Namespaced commands
│           └── scan.md          # /scan command
│
└── memories/                    # Persistent agentic memory (optional)
    └── .gitkeep                 # Keep directory in version control
```

### Structure Explanation

#### Root-Level AI Context Files

| File | Purpose | Commit to Git? |
|------|---------|----------------|
| `AGENTS.md` | Universal instructions for ALL AI agents (OpenAI, Claude, Copilot, etc.) | ✅ Yes |
| `CLAUDE.md` | Claude-specific context, behaviors, and preferences | ✅ Yes |
| `.copilot-instructions.md` | GitHub Copilot-specific instructions | ✅ Yes |
| `NOTES.md` | Agentic memory for persistent context across sessions | ⚠️ Optional |

#### Nested CLAUDE.md Files (NEW)

Claude Code supports **hierarchical CLAUDE.md files** that provide module-specific context:

```
src/
├── CLAUDE.md              # General src/ guidelines
├── auth/
│   └── CLAUDE.md          # "This module handles OAuth2 and session management"
├── api/
│   └── CLAUDE.md          # "API routes follow REST conventions, see examples in users/"
└── components/
    └── CLAUDE.md          # "All components use Radix UI primitives"
```

**Benefits:**
- Claude loads only relevant instructions when working in specific directories
- Reduces context window usage
- Enables team members to document module-specific patterns

#### .cursor/rules/ Naming Convention

Use **numerical prefixes** for rule precedence (higher numbers override lower):

| Range | Category | Examples |
|-------|----------|----------|
| `001-099` | Core/workspace-wide rules | `001_core.mdc`, `002_security.mdc` |
| `100-199` | Language/framework rules | `100_typescript.mdc`, `101_react.mdc` |
| `200-299` | Pattern-specific rules | `200_testing.mdc`, `201_api.mdc` |

**Rule File Format:**
```yaml
---
description: TypeScript strict mode enforcement
globs: src/**/*.ts,src/**/*.tsx
---
- Use TypeScript strict mode for all files
- Prefer `unknown` over `any`
- Use explicit return types for exported functions
```

#### .claude/ Directory Structure

```
.claude/
├── settings.json          # Shared team settings
├── settings.local.json    # Personal settings (auto-gitignored)
└── commands/              # Custom slash commands
```

**settings.json Example:**
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test:*)",
      "Bash(bun test:*)",
      "Read(./context/**)"
    ],
    "deny": [
      "Bash(curl:*)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  },
  "defaultMode": "default"
}
```

**Permission Modes:**
| Mode | Behavior |
|------|----------|
| `default` | Prompts for permission on first use of each tool |
| `acceptEdits` | Auto-accepts file edit permissions |
| `plan` | Analysis only, no modifications |
| `bypassPermissions` | Skips all prompts (use with caution) |

#### Custom Slash Commands

**Basic Command (`.claude/commands/refactor.md`):**
```markdown
Refactor the selected code to improve:
- Readability and maintainability
- Performance where applicable
- Type safety
```

**Advanced Command with Frontmatter (`.claude/commands/security/scan.md`):**
```yaml
---
allowed-tools: Read, Grep, Glob
description: Run security vulnerability scan
model: claude-sonnet-4-5-20250929
---

Analyze the codebase for security vulnerabilities including:
- SQL injection risks
- XSS vulnerabilities  
- Exposed credentials
- Insecure configurations
- Dependency vulnerabilities

Output findings in a structured report format.
```

**Command Placeholders:**
- `$1`, `$2`, etc. — Positional arguments
- `$ARGUMENTS` — All arguments
- `@filepath` — Include file contents

#### Agentic Memory Files

**NOTES.md (Root Level):**
```markdown
# Project Notes

## Session: 2026-01-14
- Discovered auth module uses legacy JWT library
- TODO: Migrate to jose library
- Performance issue in /api/users endpoint due to N+1 query

## Decisions Made
- 2026-01-13: Using Zustand for state management (see spec.md for rationale)
- 2026-01-10: API versioning via URL prefix (/v1/, /v2/)

## Patterns Discovered
- Error handling: See src/lib/errors.ts for standard pattern
- API response format: { data, error, meta }
```

**memories/ Directory (Optional):**
For complex projects, use a dedicated directory:
```
memories/
├── architecture-decisions.md
├── debugging-sessions.md
├── performance-notes.md
└── security-findings.md
```

## When to Use Which File

Use this decision matrix to determine where to put information:

| Information Type | File | Reason |
|------------------|------|--------|
| Project overview, tech stack | `AGENTS.md` | Universal for all AI tools |
| Build/test commands | `AGENTS.md` | All agents need this |
| Code conventions & style | `AGENTS.md` or `context/conventions.md` | Universal, link for details |
| Claude-specific behaviors | `CLAUDE.md` | Only Claude reads this |
| Module-specific patterns | `src/[module]/CLAUDE.md` | Loaded only when in that directory |
| Permission boundaries | `AGENTS.md` + `.claude/settings.json` | Human-readable + enforced |
| GitHub Copilot specifics | `.copilot-instructions.md` | Only Copilot reads this |
| File-pattern rules in Cursor | `.cursor/rules/*.mdc` | Auto-attached by glob pattern |
| Reusable prompts | `.claude/commands/*.md` | Available as /slash commands |
| Persistent notes & discoveries | `NOTES.md` or `memories/` | Agentic memory across sessions |
| Feature requirements | `spec.md` | Planning before implementation |
| Current task status | `plan.md` | Living document during work |
| Architecture decisions | `context/architecture.md` | Long-term reference |

### File Overlap Strategy

When multiple files could contain similar information:

1. **AGENTS.md vs CLAUDE.md**
   - Put universal information in `AGENTS.md`
   - Put Claude-specific behaviors (extended thinking triggers, tool preferences) in `CLAUDE.md`
   - Use imports: `See @AGENTS.md for universal guidelines`

2. **CLAUDE.md vs .cursor/rules/**
   - `CLAUDE.md`: Prose-based context, explanations, examples
   - `.cursor/rules/*.mdc`: Glob-matched rules auto-attached to specific file types
   - Can coexist; rules are more targeted, CLAUDE.md is more comprehensive

3. **Root CLAUDE.md vs Nested CLAUDE.md**
   - Root: Project-wide patterns, universal preferences
   - Nested: Module-specific quirks, local patterns
   - Both are loaded (additive), nested provides additional context

4. **NOTES.md vs plan.md**
   - `plan.md`: Current task, next steps, blockers (temporary)
   - `NOTES.md`: Discoveries, decisions, patterns (persistent)

## Content Guide for Each File Type

### AGENTS.md (Primary Context File)

The main context file that all AI agents should read. Include:

```markdown
# [Project Name]

## Project Overview
- Purpose and goals
- Tech stack (frameworks, languages, tools)
- Key dependencies
- Architecture pattern (e.g., Next.js App Router, microservices)

## Code Conventions
- Naming conventions (files, functions, variables)
- Formatting standards
- Import/export patterns
- Comment style
- Type annotations approach

## Project Architecture
- Directory structure and organization
- Component hierarchy
- Data flow patterns
- State management approach
- API structure

## Key File Locations
- Entry points
- Configuration files
- Core components
- Utility functions
- Type definitions
- Test files

## Commands
Be explicit about exact command syntax:
- Build: `npm run build` or `bun run build`
- Type check: `tsc --noEmit [path/to/file.ts]`
- Run tests: `bun test [path/to/file.test.ts]`
- Format: `prettier --write [path]`
- Lint: `eslint [path]`
- Dev server: `npm run dev`

## Agent Permissions
### CAN do without asking:
- Read any file in the project
- Run linters and type checkers
- Run tests
- Format code
- Search codebase

### MUST ASK before:
- Installing new packages
- Modifying package.json
- Git operations (commit, push, branch, merge)
- Deleting files or directories
- Modifying CI/CD configuration
- Changing environment variables

## Best Practices
- Prefer composition over inheritance
- Keep components small and focused
- Write tests alongside new features
- Use TypeScript strict mode
- Document complex logic
- Follow existing patterns in the codebase

## Common Patterns
Show examples of established patterns:
- How to create a new component
- How to add an API route
- How to write a test
- How to handle errors
- How to manage state

## Constraints
- Performance requirements
- Browser/platform support
- Security considerations
- Accessibility standards
```

### spec.md (Planning Document)

Use before implementation starts:

```markdown
# Project Specification

## Requirements
- User stories
- Functional requirements
- Non-functional requirements (performance, security, etc.)

## Architecture Decisions
- Technology choices and rationale
- Design patterns to use
- Trade-offs and alternatives considered

## API Contracts
- Endpoints and methods
- Request/response formats
- Authentication/authorization
- Error handling

## Data Models
- Schema definitions
- Relationships
- Validation rules

## Testing Strategy
- Unit test approach
- Integration test approach
- E2E test approach
- Coverage goals
- Test data strategy

## Success Criteria
- Definition of done
- Performance benchmarks
- Quality gates
```

### plan.md (Task Breakdown & Scratchpad)

Use as a living document during implementation:

```markdown
# Implementation Plan

## Current Status
- [x] Completed task 1
- [ ] In progress: Task 2
- [ ] Pending: Task 3

## Next Steps
1. Implement X
2. Test Y
3. Refactor Z

## Blockers
- Need decision on: ...
- Waiting for: ...

## Notes
- Discovery: Found that...
- Reminder: Don't forget to...

## Decisions Made
- Date: Decision and rationale
```

### context/ Directory Files

#### architecture.md
```markdown
# System Architecture

## Overview
High-level system design

## Components
Detailed component descriptions

## Data Flow
How data moves through the system

## Patterns Used
- Design patterns
- Architectural patterns
- Integration patterns

## External Dependencies
- Third-party services
- APIs
- Libraries
```

#### conventions.md
```markdown
# Coding Conventions

## File Organization
- Naming conventions
- Directory structure rules
- Module organization

## Code Style
- Formatting rules
- Naming patterns
- Comment guidelines
- Type annotation style

## Import/Export
- Import order
- Re-export patterns
- Barrel file usage

## Error Handling
- Error types
- Error boundaries
- Logging approach
```

#### testing.md
```markdown
# Testing Guidelines

## Test Structure
- File naming
- Test organization
- Setup/teardown patterns

## Testing Patterns
- Mocking approach
- Fixture management
- Test data creation

## Coverage Requirements
- Minimum coverage
- Critical paths
- What to test vs. not test

## Running Tests
- Commands
- Watch mode
- CI integration
```

## Best Practices for Heavy AI Orchestration

### 1. Scope Management
**Break work into small, focused tasks**
- Avoid monolithic requests like "build the entire feature"
- Request one function, one bug fix, one component at a time
- Iterate: implement → test → refine → next task

**Example:**
❌ Bad: "Add authentication to the app"
✅ Good: "Create a login form component with email/password fields"

### 2. Command Optimization
**Be explicit about commands and their usage**

Agents can run commands on specific files, not just the entire project:
```markdown
## Type Checking
- Whole project: `tsc --noEmit`
- Specific file: `tsc --noEmit src/components/Header.tsx`
  ↑ This is much faster for incremental changes
```

### 3. Context Quality Over Quantity
**Reference examples instead of long explanations**

❌ Bad:
```markdown
When writing tests, make sure to use describe blocks,
have proper setup and teardown, mock external dependencies,
use meaningful test names...
```

✅ Good:
```markdown
Follow the testing pattern in `src/components/__tests__/Button.test.tsx`
```

**Link to existing files as patterns**
- "Follow the API structure in `src/app/api/users/route.ts`"
- "Use the same error handling as `src/lib/database.ts`"

### 4. Safety and Permissions
**Define clear boundaries**

```markdown
## Agent Permissions

### ✅ CAN do without asking:
- Read any project file
- Run linters (eslint, prettier)
- Run type checker (tsc)
- Run tests
- Search codebase
- View git history

### ❌ MUST ASK before:
- Installing packages (npm/bun install)
- Modifying package.json
- Git operations (commit, push, merge)
- Deleting files
- Modifying .env or secrets
- Changing CI/CD config
- Running production commands
```

### 5. Version Control as Safety Net
**Commit strategy for AI-assisted work**

- Commit after each completed task
- Use descriptive commit messages
- Treat commits as "save points in a game"
- Easy rollback if AI suggestions introduce bugs
- Review diffs before committing

**Workflow:**
```bash
# Before starting a task
git status  # Ensure clean working directory

# After AI completes a task
git diff    # Review changes
git add .   # Stage changes
git commit -m "feat: add user authentication form"

# If something goes wrong
git reset --hard HEAD  # Rollback to last commit
```

### 6. Spec-Driven Development
**Write specs BEFORE implementation**

This ensures you and the AI are aligned on goals before writing code.

**Workflow:**
1. Write `spec.md` with requirements
2. Create `plan.md` with implementation steps
3. Have AI review the plan
4. Implement step by step
5. Update `plan.md` as you go

### 7. Maintain Human Oversight
**Never trust AI output blindly**

- Review all generated code
- Test thoroughly
- Treat AI contributions like code from junior developers
- Verify security implications
- Check for edge cases

### 8. Test Integration and Automation
**Leverage CI/CD for safety**

- Run tests automatically
- Use linters and formatters
- Set up pre-commit hooks
- Create feedback loops where AI can debug its own failures

## Tools for Context Generation

### Repomix
**Package entire codebase into AI-friendly format**
- Website: https://repomix.com/
- Features:
  - Token counts per file
  - Respects .gitignore
  - Single file output for LLM consumption
  - Useful for sharing full context with AI

### gitingest / repo2txt
**Automated context dumping**
- Extract relevant codebase portions
- Convert repo to text format
- Useful for large projects
- Can filter by file types

### Context7
**Smart context packaging**
- Selective file inclusion
- Intelligent relevance detection
- Optimized for LLM context windows

## Advanced Context Engineering

### What is Context Engineering?
Context engineering is the deliberate process of designing, structuring, and providing relevant information to LLMs. It goes beyond prompt engineering by managing all inputs including:
- Instructions
- Memory/history
- Code examples
- Documentation
- Structured formats
- Configuration

### Key Strategies

**1. Hierarchical Context**
```
Level 1: Universal rules (AGENTS.md)
Level 2: Tool-specific rules (CLAUDE.md)
Level 3: Task-specific context (in prompts)
```

**2. Progressive Disclosure**
Start with overview, provide details on demand:
```markdown
## Database
We use Supabase PostgreSQL.
- Schema: See `context/database.md`
- Queries: See `src/lib/queries.ts`
- Migrations: See `supabase/migrations/`
```

**3. Pattern Libraries**
Collect examples of good implementations:
```markdown
## Patterns
- API Route: `src/app/api/example/route.ts`
- React Component: `src/components/Example.tsx`
- Test: `src/components/__tests__/Example.test.tsx`
- Hook: `src/hooks/useExample.ts`
```

### Context Window Management
**Be mindful of token limits**

#### Current Claude Models (January 2026)

| Model | Context Window | Max Output | Best For |
|-------|---------------|------------|----------|
| **Claude Opus 4.5** | 1M tokens | 64K tokens | Enterprise research, advanced coding, agent chains, large-scale context |
| **Claude Sonnet 4.5** | 200K tokens | 64K tokens | Hybrid reasoning, extended dialogues, fast prototyping |
| **Claude Haiku 4.5** | 200K tokens | 64K tokens | Real-time apps, chatbots, parallel sub-agent deployments |

#### Other Major Models

| Model | Context Window | Notes |
|-------|---------------|-------|
| GPT-4o | 128K tokens | OpenAI's multimodal flagship |
| Gemini Pro | 1M+ tokens | Google's long-context model |

**Key Features:**
- **Claude Opus 4.5** (released November 2025): 80.9% on SWE-bench Verified, "Endless Chat" feature with automatic context compression
- **Claude Haiku 4.5**: Matches Sonnet 4's coding performance at fraction of cost ($1/1M input, $5/1M output)

**Strategies:**
1. **Chunking**: Break large context into focused sections
2. **Referencing**: Point to files rather than including full content
3. **Summarization**: Provide high-level overviews with details on demand
4. **Prioritization**: Include most relevant context first

### Context Rot & Mitigation Strategies

**Context Rot** is a phenomenon identified by Anthropic where model outputs degrade due to information overload in long sessions. As conversations grow, irrelevant or stale information accumulates, reducing the signal-to-noise ratio and degrading response quality.

#### Anthropic's Official Mitigation Techniques

**1. Context Compaction**
Summarizing older messages or tool results when approaching token limits:
- Preserves recent and relevant information
- Reduces overall token usage
- Maintains agent effectiveness without exceeding constraints
- Anthropic reports **up to 54% improvements** in agent benchmarks using this technique

**2. Structured Note-Taking (Agentic Memory)**
Writing important information to external storage (e.g., `NOTES.md` file):
- Provides persistent memory beyond the context window
- Enables agents to track progress across extended tasks
- Maintains critical context and dependencies that would otherwise be lost
- Information is pulled back into context when needed

**3. Sub-Agent Architecture**
Delegating tasks to specialized agents with their own context windows:
- Each sub-agent has isolated context, system prompt, and toolset
- Prevents "polluting" the main conversation context
- Returns concise, processed results to the main agent
- Ideal for investigation, research, or specific technical tasks

**4. Context Editing**
Automatically clearing stale tool calls and results:
- Triggers when approaching token limits
- Removes outdated information while preserving critical data
- Prevents context exhaustion during long-running tasks
- Available via API beta header: `context-management-2025-06-27`

### Anthropic's Context Management Tools

Anthropic introduced dedicated tools in September 2025 for managing agent context:

#### Memory Tool
A file-based system allowing Claude to store and consult information outside the context window:

```markdown
## Capabilities
- Autonomous memory management (create, read, update, delete files in `/memories` directory)
- Persistent knowledge building across conversations
- Client-side operation for data privacy
- Reduces need to keep all information in context window

## Enabling
Add beta header: `context-management-2025-06-27` to API requests
```

#### CLAUDE.md Memory Hierarchy
Claude Code uses a hierarchical memory system through `CLAUDE.md` files:

| Memory Type | Location | Purpose |
|-------------|----------|---------|
| **Enterprise Policy** | `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS) | Organization-wide instructions, security policies |
| **Project Memory** | `./CLAUDE.md` | Team-shared, project-specific instructions |
| **User Memory** | `~/.claude/CLAUDE.md` | Personal preferences across all projects |

#### Backend Options for Persistent AI Memory

For applications requiring robust AI memory beyond file-based storage:

| Backend | Strengths | Best For |
|---------|-----------|----------|
| **Convex** | Built-in RAG, vector search, real-time, TypeScript-first | AI-first chat apps, real-time collaboration |
| **Supabase + pgvector** | PostgreSQL, open-source, self-hostable | Teams preferring SQL, existing Postgres infrastructure |
| **Pinecone** | Dedicated vector DB, scalable | High-volume similarity search |
| **Weaviate** | Open-source, multimodal | Self-hosted vector search with ML capabilities |

**Recommendation:** For AI-first applications, Convex's built-in RAG with namespace support and configurable embeddings provides excellent developer experience. See the [Case Study](#case-study-video-daddy-chat) for a practical example.

**Import Syntax:**
```markdown
See @README for project overview and @package.json for available npm commands.

# Additional Instructions
- git workflow @docs/git-instructions.md
```

### Four-Phase Coding Cycle (Anthropic's Recommended Workflow)

Anthropic recommends a structured four-phase approach for AI-assisted development:

#### Phase 1: Explore & Research
**Goal:** Gather context before writing any code

```markdown
## Best Practices
- Direct Claude to read relevant files or URLs
- Explicitly instruct: "Do NOT write code yet, just research"
- Use sub-agents to investigate specific details
- Keeps main context window focused

## Example Prompt
"Read the authentication module in /src/auth and understand how sessions
are currently managed. Do not write any code yet."
```

#### Phase 2: Plan & Strategize
**Goal:** Create a detailed implementation plan

```markdown
## Best Practices
- Have Claude outline steps to solve the problem
- Use extended thinking prompts: "think", "think hard", or "ultrathink"
- Externalize the plan (GitHub issue, markdown file) as a checkpoint
- Review and approve before implementation

## Example Prompt
"Based on your research, create a detailed plan for adding OAuth2 support.
Think hard about edge cases and security implications. Output the plan
to a GitHub issue."
```

#### Phase 3: Code & Verify
**Goal:** Implement the solution with continuous verification

```markdown
## Best Practices
- Implement only after plan is approved
- Mandate verification: run tests, linters, type checks
- Iterate until all checks pass
- Commit incrementally after each verified component

## Example Prompt
"Implement step 1 of the plan. After writing the code, run the tests
and type checker. Do not proceed to step 2 until all checks pass."
```

#### Phase 4: Commit & Finalize
**Goal:** Document and submit for review

```markdown
## Best Practices
- Commit with clear, descriptive messages
- Generate pull request for team review
- Update documentation (README, CHANGELOG)
- Archive learnings in CLAUDE.md for future reference

## Example Prompt
"Commit the OAuth2 implementation with a clear commit message. Create a
pull request and update the README with the new authentication flow."
```

### Test-Driven Development (TDD) with Claude

Anthropic's teams use TDD to produce reliable codebases. Here's the recommended workflow:

#### Step 1: Write Tests First
```markdown
## Prompt Example
"I'm following TDD. Write test cases for a user authentication service
based on these requirements: [requirements]. Do NOT write the implementation
yet - only the tests."
```

#### Step 2: Confirm Test Failure
```markdown
## Prompt Example
"Run the tests to confirm they fail as expected. This validates
that our tests are actually testing something."
```

#### Step 3: Commit the Tests
```markdown
## Prompt Example
"Commit these tests with message 'test: add user auth service tests'.
These establish our baseline for the implementation."
```

#### Step 4: Implement to Pass Tests
```markdown
## Prompt Example
"Now write the implementation code to make all tests pass. Do NOT
modify the tests - only write implementation code. Iterate until
all tests pass."
```

#### Benefits of TDD with Claude
- Ensures code meets specifications from the start
- Prevents implementation drift
- Creates self-documenting test suites
- Easier to catch regressions

### Extended Thinking with Claude

Claude 4.x models support "Extended Thinking" mode for complex problem-solving:

#### Enabling Extended Thinking

**In Claude.ai:**
1. Select a Claude 4 model or Claude 3.7 Sonnet
2. Click "Search and tools" button
3. Toggle "Extended thinking" option on

**Thinking Depth Prompts:**

| Prompt | Depth | Use Case |
|--------|-------|----------|
| `think` | Standard | General reasoning |
| `think hard` | Deeper | Complex problems |
| `ultrathink` | Maximum | Most complex tasks requiring deep analysis |

> **Note:** As of Claude Code v2.0.0, the "Thinking On/Off" toggle has simplified this. Only `ultrathink` remains as a command; others are deprecated in favor of the toggle.

#### Best Practices for Extended Thinking
```markdown
## General Instruction
"Please think about this problem thoroughly and in great detail.
Consider multiple approaches and show your complete reasoning."

## Multishot Prompting
Use <thinking> tags to demonstrate reasoning patterns in examples.

## Specific Requirements
Break complex instructions into numbered steps for methodical processing.
```

### Parallel Tool Calling Optimization

Claude 4.x models excel at parallel tool execution. Optimize by providing explicit instructions:

#### System Prompt Directive
```xml
<use_parallel_tool_calls>
For maximum efficiency, whenever you perform multiple independent operations,
invoke all relevant tools simultaneously rather than sequentially. Prioritize
calling tools in parallel whenever possible.

Examples:
- When reading 3 files, run 3 tool calls in parallel
- When running multiple read-only commands like `ls` or `list_dir`, run all in parallel
- Err on the side of maximizing parallel tool calls
</use_parallel_tool_calls>
```

#### Programmatic Tool Calling
For complex workflows, Claude can orchestrate tools through code:
- Enables parallel execution with efficient data processing
- Controls what information enters context
- Prevents context window overload
- Available via advanced tool use APIs

#### Token-Efficient Tool Use
For scenarios where parallel tool use is less likely:
- Add beta header: `token-efficient-tools-2025-02-19`
- Reduces latency and saves tokens
- Encourages parallel execution in Claude Sonnet 3.7+

## Emerging Standards

### llms.txt
**Standardized format for website/project contents**
- Designed for LLM consumption
- Convenient structured format
- Growing adoption for documentation

### AAIF (Agentic AI Foundation)
**Standards body under Linux Foundation**
- Oversees MCP development
- Coordinates ecosystem standards
- Includes AGENTS.md specification
- Backed by major AI companies

## Implementation Checklist

### Project Setup — Core Files
- [x] Create `AGENTS.md` with project overview, conventions, and commands
- [x] Create root `CLAUDE.md` with Claude-specific context
- [x] ~~Create `.copilot-instructions.md` if using GitHub Copilot~~ *(N/A — not using Copilot)*
- [x] Create `NOTES.md` for agentic memory / structured note-taking
- [x] Create `spec.md` for current/next features
- [x] Create `plan.md` as working document

### Project Setup — Context Directory
- [x] Set up `context/` directory structure
- [x] Write `context/architecture.md`
- [x] Write `context/conventions.md`
- [x] Write `context/testing.md`
- [x] Write `context/api.md` (if applicable)
- [x] Write `context/database.md` (if applicable)
- [x] Write `context/deployment.md`

### Project Setup — Nested CLAUDE.md Files
- [x] Identify key modules that need specific context
- [x] Create `app/CLAUDE.md` with general App Router guidelines
- [x] Create `app/api/CLAUDE.md` for API route patterns
- [x] Create `app/auth/CLAUDE.md` for auth module specifics
- [x] Create `app/components/CLAUDE.md` for app-specific components
- [x] Create `lib/CLAUDE.md` for shared utilities
- [x] Create `lib/ai/CLAUDE.md` for AI module specifics
- [x] Create `components/CLAUDE.md` for Shadcn UI components
- [x] Create `hooks/CLAUDE.md` for root-level hooks
- [x] Use `@` import syntax to reference shared documentation

### Project Setup — Cursor Rules (if using Cursor)
- [x] Create `.cursor/rules/` directory
- [x] Create `001_core.mdc` with workspace-wide rules
- [x] Create `002_security.mdc` with security guidelines
- [x] Create language-specific rules (`100_typescript.mdc`, `101_react_nextjs.mdc`)
- [x] Create pattern-specific rules (`200_testing.mdc`, `201_api.mdc`)
- [x] Use numerical prefixes for precedence (higher = higher priority)

### Project Setup — Claude Code Configuration
- [x] Create `.claude/settings.json` with team permissions
- [x] Configure allow/deny lists for commands and file access
- [x] Create `.claude/settings.local.json` for personal preferences (gitignored)
- [x] Set up `.claude/commands/` directory
- [x] Create common slash commands (`analyze.md`, `refactor.md`, `review.md`, `test.md`)
- [x] Create namespaced commands (`security/scan.md`)
- [x] Add frontmatter to commands that need specific tools or models

### Context Management (Anthropic Best Practices)
- [x] Configure CLAUDE.md memory hierarchy (enterprise/project/user)
- [x] Set up structured note-taking in `NOTES.md` or `memories/` directory
- [x] Define sub-agent architecture for complex tasks
- [x] Enable context management API headers if using extended features
- [x] Configure parallel tool calling in system prompts

### Development Workflow
- [x] Adopt four-phase coding cycle (Research → Plan → Code → Commit)
- [x] Implement TDD workflow with Claude
- [x] Enable extended thinking for complex tasks
- [x] Configure compaction strategies for long-running sessions
- [x] Set up commit-after-each-task workflow

### Git Configuration
- [ ] Add `.claude/settings.local.json` to `.gitignore`
- [ ] Add `memories/` to `.gitignore` (if personal) or commit (if team-shared)
- [ ] Commit all shared context files (`AGENTS.md`, `CLAUDE.md`, etc.)
- [ ] Commit `.claude/settings.json` and `.claude/commands/`

### Refinement
- [ ] Review and refine based on AI agent interactions
- [ ] Monitor for context rot in long sessions
- [ ] Update CLAUDE.md files with learnings and patterns
- [ ] Archive successful prompts to `.claude/commands/`
- [ ] Periodically review and clean up `NOTES.md`

## Key Mindset Principles

### 1. You Are the Accountable Engineer
The AI accelerates mechanical tasks, but you maintain:
- Strategic control
- Code review responsibility
- Quality assurance
- Security oversight
- Architecture decisions

### 2. Planning Prevents Wasted Cycles
Spending time on specs and plans upfront ensures you and the AI are aligned, preventing expensive rewrites.

### 3. Context is King
LLMs are only as good as the context you provide. Poor context leads to:
- Hallucinations
- Low-quality outputs
- Inconsistent code
- Security vulnerabilities

### 4. Iterate Incrementally
Small, focused tasks with rapid feedback loops outperform large, monolithic requests.

### 5. Test Everything
Treat AI-generated code with the same scrutiny as code from any developer. Test, review, and validate.

## Open Questions for Further Research

The following areas require additional investigation or clarification:

### Recently Resolved (vid0 Project)

| Question | Resolution | Reference |
|----------|------------|-----------|
| Convex vs Supabase for AI-first apps? | **Convex** — Built-in RAG, vector search, TypeScript-first | `docs/agents-research.md` |
| Auth provider for Convex + payments? | **Clerk** — Native integration with both Convex and Flowglad | `docs/agents-research.md` |
| Payments platform? | **Flowglad** — Open-source, Clerk-native, developer-friendly | `docs/agents-research.md` |
| Testing strategy for AI apps? | **Critical paths only** — Auth, data transforms, rate limiting | `docs/agents-research.md` |
| Sub-agent architecture? | **4-agent design** — Transcript, Title, Thumbnail, Analytics | `docs/agents-research.md` |

### Remaining Questions

### 1. Context7 Tool Status
- **Question:** Is Context7 still actively maintained and recommended?
- **Status:** Unable to find significant current documentation
- **Action:** Verify this recommendation is still valid before relying on it

### 2. Extended Context Window Availability
- **Question:** What are the exact requirements for accessing 1M token context windows?
- **Known:** Requires `context-1m-2025-08-07` beta header, organizations in usage tier 4 or custom rate limits
- **Action:** Confirm current availability and pricing

### 3. Claude Code v2.0.0 Thinking Commands
- **Question:** Are "think" and "think hard" commands fully deprecated?
- **Known:** Only "ultrathink" remains functional per GitHub issue #9072
- **Action:** Monitor for changes in future Claude Code releases

### 4. AGENTS.md vs CLAUDE.md Precedence
- **Question:** When both files exist, which takes precedence? How do they interact?
- **Action:** Test and document the interaction pattern

### 5. MCP Security Best Practices
- **Question:** What are the recommended security measures for MCP implementations?
- **Known:** Research has highlighted tool poisoning and unauthorized access vulnerabilities
- **Action:** Research and document security hardening guidelines (deferred for now)

### 6. Sub-Agent Token Economics
- **Question:** How are tokens counted when using sub-agents? Does each sub-agent have separate billing?
- **Action:** Research Anthropic's billing documentation for sub-agent usage

### 7. Nested CLAUDE.md Loading Behavior
- **Question:** When working in a subdirectory, does Claude load BOTH root CLAUDE.md and nested CLAUDE.md?
- **Known:** Documentation suggests nested files provide "additional" context, implying additive behavior
- **Action:** Test and document exact loading/precedence behavior

### 8. Cursor Rules vs CLAUDE.md Overlap
- **Question:** If both `.cursor/rules/` and `CLAUDE.md` exist, how do they interact in Cursor IDE?
- **Action:** Test precedence and document recommended deduplication strategy

## Resources

### Official Anthropic Documentation (Primary Sources)
- [Claude Documentation Portal](https://docs.anthropic.com/)
- [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) - September 2025
- [Claude 4 Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Context Windows Documentation](https://docs.anthropic.com/en/docs/build-with-claude/context-windows)
- [Context Management Tools](https://www.anthropic.com/news/context-management) - September 2025
- [Sub-agents Documentation](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [Claude Code Memory System](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) - November 2025
- [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) - October 2025
- [Extended Thinking Tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips)
- [How Anthropic Teams Use Claude Code](https://www.anthropic.com/news/how-anthropic-teams-use-claude-code)

### Prompt Engineering
- [Interactive Prompt Engineering Tutorial (GitHub)](https://github.com/anthropics/prompt-eng-interactive-tutorial)
- [6 Techniques for Effective Prompt Engineering (PDF)](https://www-cdn.anthropic.com/62df988c101af71291b06843b63d39bbd600bed8.pdf)
- [System Prompts Documentation](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts)
- [Using XML Tags](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Multishot Prompting](https://docs.anthropic.com/fr/docs/build-with-claude/prompt-engineering/multishot-prompting)
- [Chain of Thought Prompting](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought)
- [Long Context Tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)
- [Prompt Improver Tool](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-improver)

### Articles & Guides
- [Improve your AI code output with AGENTS.md](https://www.builder.io/blog/agents-md)
- [Agents.md: A Machine-Readable Alternative to README](https://research.aimultiple.com/agents-md/)
- [Claude Code: Best practices for agentic coding](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Spec-driven development: Using Markdown as a programming language](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-using-markdown-as-a-programming-language-when-building-with-ai/)
- [Mastering Project Context Files for AI Coding Agents](https://eclipsesource.com/blogs/2025/11/20/mastering-project-context-files-for-ai-coding-agents/)
- [My LLM coding workflow going into 2026](https://addyosmani.com/blog/ai-coding-workflow/)

### Standards & Protocols
- [Model Context Protocol (MCP) Documentation](https://docs.anthropic.com/en/docs/mcp)
- [Agentic AI Foundation (AAIF) - OpenAI Announcement](https://openai.com/index/agentic-ai-foundation/)
- [AGENTS.md Specification](https://openai.com/index/agentic-ai-foundation/)
- [llms.txt Specification](https://txt-llms.com/documentation)

### Tools
- [Repomix - Pack your codebase into AI-friendly formats](https://repomix.com/)
- [Cursor - Rules for AI](https://docs.cursor.com/context/rules-for-ai)
- [llms.txt Validator](https://llmtext.com/)

### Frameworks & Orchestration
- [Top AI Agent Orchestration Frameworks for Developers 2025](https://www.kubiya.ai/blog/ai-agent-orchestration-frameworks)
- [LLM Orchestration in 2025: Frameworks + Best Practices](https://orq.ai/blog/llm-orchestration)

### Deep Dives
- [Context Engineering: The New Backbone of Scalable AI Systems](https://www.qodo.ai/blog/context-engineering/)
- [GitHub - PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules)
- [Anthropic Model System Cards](https://www.anthropic.com/system-cards)

### Project-Specific Research (vid0)
- `docs/agents-research.md` — Comprehensive tech stack evaluation (Convex vs Supabase, auth, payments)
- `docs/youtube-transcript-evaluation.md` — YouTube transcript extraction research
- `AGENTS.md` — Finalized project configuration for AI agents

## Case Study: vid0

This section documents real-world decisions and patterns from the vid0 project—an AI-powered chat platform for YouTube content creators—as a practical example of applying the principles in this guide.

### Finalized Tech Stack (January 2026)

After comprehensive research comparing options, the following tech stack was selected:

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript | Latest stable, excellent DX |
| **Database** | **Convex** (migrating from Supabase) | Built-in AI/RAG, real-time, TypeScript-first |
| **Auth** | **Clerk** | Native Convex + Flowglad integration |
| **Payments** | **Flowglad** | Open-source, Clerk-native, developer-friendly |
| **AI** | Vercel AI SDK → Claude Opus 4.5 (primary) | Multi-provider abstraction |
| **State** | Zustand + TanStack Query | Lightweight, works well with streaming |
| **UI** | Shadcn/Radix + Tailwind 4 | Modern, accessible, customizable |

#### Why Convex Over Supabase?

For AI-first chat applications, Convex offers critical advantages:

| Factor | Supabase | Convex | Winner |
|--------|----------|--------|--------|
| Real-time | Manual subscriptions | Native reactive queries | **Convex** |
| AI/RAG | External only | **Built-in RAG, vector search** | **Convex** |
| TypeScript | Type generation needed | TypeScript-first | **Convex** |
| Schema | SQL migrations | Schema as code | **Convex** |
| Local dev | Docker support | No local testing | **Supabase** |
| Vendor lock-in | Open-source | Proprietary | **Supabase** |

**Decision:** Convex's built-in AI/RAG capabilities outweigh migration costs for an AI-first application.

#### Convex + Clerk + Flowglad Integration

```
┌────────────────────────────────────────────────────┐
│                  vid0 STACK                          │
├────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐   │
│  │                  CONVEX                      │   │
│  │  • Reactive database                         │   │
│  │  • Built-in AI/RAG & vector search          │   │
│  │  • Real-time sync                           │   │
│  │  • TypeScript-first                         │   │
│  └─────────────────────────────────────────────┘   │
│         ↓              ↓              ↓             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐     │
│  │  CLERK   │  │   FLOWGLAD   │  │ YOUTUBE  │     │
│  │   Auth   │←→│   Payments   │  │   API    │     │
│  │          │  │(Clerk-native)│  │          │     │
│  └──────────┘  └──────────────┘  └──────────┘     │
└────────────────────────────────────────────────────┘
```

**Benefits:** All three services are TypeScript-first, and Clerk is the recommended auth for both Convex and Flowglad, enabling seamless integration.

### Practical Sub-Agent Architecture

Based on Anthropic's sub-agent recommendations, here's a concrete implementation for YouTube content analysis:

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN ORCHESTRATOR                         │
│            (Primary Chat Agent - Claude Opus 4.5)           │
│                                                              │
│  Responsibilities:                                           │
│  - User conversation management                              │
│  - Task routing to sub-agents                                │
│  - Response synthesis                                        │
│  - Context compaction                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  TRANSCRIPT   │ │   TITLE/SEO   │ │  THUMBNAIL    │ │  ANALYTICS    │
│   ANALYZER    │ │   OPTIMIZER   │ │   ADVISOR     │ │  INTERPRETER  │
│               │ │               │ │               │ │               │
│ Model: Haiku  │ │ Model: Sonnet │ │ Model: Vision │ │ Model: Sonnet │
│               │ │               │ │               │ │               │
│ Tasks:        │ │ Tasks:        │ │ Tasks:        │ │ Tasks:        │
│ - Summarize   │ │ - Generate    │ │ - Analyze     │ │ - Interpret   │
│ - Extract     │ │   titles      │ │   images      │ │   metrics     │
│   key points  │ │ - SEO tags    │ │ - Suggest     │ │ - Identify    │
│ - Identify    │ │ - A/B tests   │ │   improvements│ │   trends      │
│   hooks       │ │ - Keywords    │ │ - Color/text  │ │ - Benchmarks  │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
```

#### Sub-Agent Specifications

| Agent | Model | System Prompt Focus | Input | Output |
|-------|-------|---------------------|-------|--------|
| **Transcript Analyzer** | Claude Haiku 4.5 | YouTube content analysis, hooks, retention | Video transcript | Summary, key points, hook recommendations |
| **Title/SEO Optimizer** | Claude Sonnet 4.5 | YouTube SEO, click psychology, A/B testing | Topic, keywords, niche | Title variants, tags, descriptions |
| **Thumbnail Advisor** | Claude Sonnet 4.5 + Vision | Visual design, CTR optimization | Thumbnail image | Analysis, improvement suggestions |
| **Analytics Interpreter** | Claude Sonnet 4.5 | YouTube metrics, benchmarks, growth | Analytics data | Insights, recommendations |

#### Implementation Phases

**Phase 1 (MVP):** Single agent with task-specific system prompts
```typescript
// Switch system prompt based on detected task type
const systemPrompt = getSystemPromptForTask(taskType)
// Simpler to implement, test, and iterate
```

**Phase 2 (Post-MVP):** True sub-agent architecture
```typescript
// Orchestrator pattern
async function handleUserRequest(request: UserRequest) {
  const taskType = await classifyTask(request)
  
  switch (taskType) {
    case 'transcript_analysis':
      return await transcriptAgent.analyze(request.transcript)
    case 'title_generation':
      return await titleAgent.generate(request.topic)
    case 'thumbnail_review':
      return await thumbnailAgent.analyze(request.imageUrl)
    case 'analytics_insight':
      return await analyticsAgent.interpret(request.metrics)
    default:
      return await mainAgent.converse(request)
  }
}
```

### Gold Standard Code Patterns

These patterns were identified as exemplary implementations to follow when creating new code:

| Pattern | Example File | Key Strengths |
|---------|--------------|---------------|
| **API Route** | `app/api/chat/route.ts` | Streaming, validation, auth, error handling |
| **Custom Hook** | `app/components/chat/use-chat-core.ts` | `useCallback`, typed returns, clean API |
| **Context Provider** | `lib/chat-store/chats/provider.tsx` | Optimistic updates, rollback on error |
| **React Component** | `app/components/chat/chat.tsx` | Dynamic imports, memoization, guard clauses |
| **Server Action** | `app/auth/login/actions.ts` | `"use server"`, guard clauses, redirects |
| **Error Handling** | `app/api/chat/utils.ts` | Structured errors, user-friendly messages |
| **Multi-Provider** | `lib/openproviders/index.ts` | TypeScript generics, factory pattern |
| **Configuration** | `lib/config.ts` | Centralized constants, type-safe |

#### Pattern: Optimistic Updates with Rollback

```typescript
// From lib/chat-store/chats/provider.tsx
const updateTitle = async (id: string, title: string) => {
  let previousState: Chats[] | null = null
  
  // 1. Store previous state for rollback
  setChats((prev) => {
    previousState = prev
    return prev.map((c) => c.id === id ? { ...c, title } : c)
  })
  
  try {
    // 2. Call API
    await updateChatTitle(id, title)
  } catch {
    // 3. Rollback on error
    if (previousState) setChats(previousState)
    toast({ title: "Failed to update title", status: "error" })
  }
}
```

#### Pattern: Hook Composition for Complex State

```
Chat.tsx (Orchestrator)
├── useChatCore          → Core chat state & AI SDK integration
├── useChatOperations    → Rate limiting, chat creation, deletion
├── useFileUpload        → File handling & attachments
├── useModel             → Model selection & persistence
└── useChatDraft         → Draft message persistence
```

Each hook has a single responsibility, uses proper memoization, and returns a clean typed interface.

### Testing Strategy: Critical Paths Only

For AI/chat applications with non-deterministic outputs, focus testing on critical paths:

| Testing Type | Priority | What to Test |
|--------------|----------|--------------|
| Type checking (`tsc`) | 🔴 Critical | All code |
| Linting (`eslint`) | 🔴 Critical | All code |
| Unit tests (Vitest) | 🟠 High | Auth, data transforms, rate limiting |
| E2E tests (Playwright) | 🟠 High | Core user flows (before launch) |
| Integration tests | 🟡 Medium | External APIs (after stable) |

**Skip for AI apps:**
- Snapshot testing for AI responses (too brittle)
- Visual regression testing (premature optimization)
- Testing AI response quality (monitor in production instead)

### Security Boundaries for AI Agents

Clear permission boundaries prevent accidental modifications:

#### ✅ AI CAN do freely:
- Read any source file
- Run: `tsc --noEmit`, `eslint`, `prettier`
- Run: `npm run dev`, `npm run build`, tests
- Search codebase, create files in `app/`, `lib/`, `components/`

#### ⚠️ AI MUST ASK before:
- `npm install` / `bun add` (any package)
- Modify: `package.json`, `tsconfig.json`, `next.config.*`
- Git operations (commit, push, branch)
- Auth logic (`lib/auth/`, `middleware.ts`)
- Delete files, database schema changes
- CI/CD configuration (`.github/workflows/`)

#### 🚫 AI is FORBIDDEN from:
- Reading/writing `.env*` files
- Force push to any branch
- Committing secrets or credentials
- Modifying production configs without review

### YouTube API Integration Strategy

For applications requiring YouTube data:

| Phase | API | Auth | Quota | Use Cases |
|-------|-----|------|-------|-----------|
| **MVP** | YouTube Data API v3 | API Key only | 10K units/day | Competitor analysis, video metadata |
| **Post-MVP** | YouTube Analytics API | OAuth 2.0 | 200 req/day (request increase) | CTR, retention, personal analytics |

**Key insight:** Search operations cost 100 units; use video IDs directly when possible.

### Context Management with Convex RAG

Convex's built-in RAG capabilities enable sophisticated context management:

```typescript
// Recommended approach after Convex migration
const compactContext = async (messages: Message[]) => {
  if (estimateTokens(messages) > CONTEXT_THRESHOLD) {
    const older = messages.slice(0, -10)  // Keep last 10 recent
    const summary = await summarize(older)
    return [{ role: 'system', content: summary }, ...messages.slice(-10)]
  }
  return messages
}

// Convex RAG for persistent memory
// - Store important facts in vector database
// - Retrieve relevant context per conversation
// - Namespace by user for isolation
```

### Project Setup Accomplishments

The AI context infrastructure is now fully established:

| Category | Files Created | Purpose |
|----------|---------------|---------|
| **Core Files** | `AGENTS.md`, `CLAUDE.md`, `NOTES.md`, `spec.md`, `plan.md` | Foundation for AI agents |
| **Context Docs** | 6 files in `context/` | Domain-specific reference |
| **Nested CLAUDE.md** | 8 module-specific files | Hierarchical context |
| **Cursor Rules** | 6 numbered `.mdc` files | Auto-attached by glob |
| **Claude Commands** | 5 slash commands | Reusable workflows |

### Next Steps

The research and context setup phases are complete. Implementation priorities:

1. **Immediate:** Create Convex project, set up Clerk, begin migration
2. **Short-term:** Implement YouTube Data API integration, basic chat with context
3. **Medium-term:** Add transcript analysis, sub-agent architecture, Flowglad payments

---

## Conclusion

Effective context engineering is the foundation of successful AI-assisted development. By investing time in proper documentation, clear conventions, and structured context files, you enable AI agents to work more effectively, reduce errors, and accelerate development while maintaining code quality.

### Key Takeaways

1. **Use the latest models appropriately**: Claude Opus 4.5 for complex tasks (1M token context), Haiku 4.5 for speed-critical applications
2. **Prevent context rot**: Implement compaction, structured notes, and sub-agent architectures for long-running tasks
3. **Follow the four-phase cycle**: Research → Plan → Code & Verify → Commit & Finalize
4. **Leverage TDD**: Write tests first to ensure AI-generated code meets specifications
5. **Use extended thinking**: Enable "ultrathink" for complex problem-solving
6. **Optimize tool calls**: Configure parallel tool execution for efficiency
7. **Maintain memory hierarchy**: Use CLAUDE.md files at enterprise, project, and user levels

The key is to treat context files as living documents that evolve with your project, continuously refining them based on what works and what doesn't in your AI interactions.

---

*This guide is based on official Anthropic documentation and industry research as of January 2026. Standards and tools continue to evolve rapidly in the AI development space. See the Open Questions section for areas requiring further research.*
