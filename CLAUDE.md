# Claude-Specific Context

This file contains Claude-specific behaviors, preferences, and context for the Not A Wrapper project.

> See `@AGENTS.md` for universal guidelines that apply to all AI agents.

## Claude Preferences

### Thinking Mode
- Use **extended thinking** for complex architectural decisions
- Use `ultrathink` trigger for multi-step refactoring or debugging sessions
- Standard thinking is fine for simple edits and additions

### Response Style
- Be concise; avoid over-explaining obvious code
- Use code references (`startLine:endLine:filepath`) when discussing existing code
- Prefer showing small, focused diffs over full file rewrites
- **Never include timeline or effort estimates** (e.g., "~30 min", "2 hours", "Day 1") unless the user explicitly asks for them — AI time estimates are unreliable

### Tool Usage
- **Maximize parallel tool calls** when operations are independent
- Read multiple files simultaneously when exploring a feature
- Run lint/typecheck after edits to catch issues early

## Project-Specific Behaviors

### Prompt Delivery Default
- When the user asks to "create a prompt" (or similar), return the prompt directly in chat
- Do not create a markdown file unless the user explicitly asks for a file
- If ambiguous, prefer chat output

### When Working on Chat Features
- Reference `app/components/chat/use-chat-core.ts` for hook patterns
- Follow optimistic update pattern from `lib/chat-store/chats/provider.tsx`
- Streaming responses use Vercel AI SDK patterns

### When Working on API Routes
- Follow `app/api/chat/route.ts` as the gold standard
- Always validate input with proper error handling
- Use structured error responses: `{ error: string, code?: string }`

### When Working on UI Components
- Use Shadcn/Base UI primitives from `components/ui/`
- Follow existing patterns in `app/components/`
- Prefer composition over configuration

## Memory Hierarchy

This project uses the following memory structure:

```
CLAUDE.md (this file) → Project-level Claude context
├── app/CLAUDE.md → App-specific patterns
├── lib/CLAUDE.md → Library patterns
└── ~/.claude/CLAUDE.md → Personal user preferences
```

## Import Syntax for Context

When you need additional context, use the `@` import syntax:

```markdown
@AGENTS.md                              # Project overview, commands, permissions
@.agents/context/glossary.md            # Domain terminology definitions
@.agents/skills/add-ai-provider/        # Adding new AI providers
@.agents/skills/add-model/              # Adding new models
@.agents/skills/convex-function/        # Creating database functions
@.agents/workflows/development-cycle.md # Development workflows (four-phase cycle, TDD)
@lib/config.ts                          # Centralized configuration constants
```

## Context System

| Location | Purpose |
|----------|---------|
| `.agents/context/` | Architecture, API, database, and deployment docs |
| `.agents/context/glossary.md` | Domain terminology (Model, providerId, parts, etc.) |
| `.agents/research/` | Research, evaluations, analyses |
| `.agents/troubleshooting/` | Known issues & fixes |
| `.agents/design/` | Design references & UI research |
| `.agents/plans/` | Implementation plans |
| `.agents/skills/` | Multi-step task guides |
| `.agents/workflows/` | Development workflows and procedures |
| `.agents/archive/` | Superseded documents |
| `.cursor/rules/` | Cursor-specific patterns (auto-loaded) |

> **Documentation rule**: All AI-generated markdown belongs in `.agents/`. See `.cursor/rules/070-documentation.mdc` for placement guide.

## Development Workflow

This project follows Anthropic's four-phase coding cycle. See `@.agents/workflows/development-cycle.md` for complete details.

### Quick Reference

**Phase 1: Research** → Gather context, read files, understand patterns
**Phase 2: Plan** → Create detailed plan, use `ultrathink` for complex problems
**Phase 3: Code & Verify** → Implement step-by-step, verify after each step
**Phase 4: Commit** → Commit incrementally with clear messages

### Extended Thinking

Use extended thinking (`ultrathink`) for:
- Architectural decisions
- Complex debugging sessions
- Security analysis
- Performance optimization

Toggle "Thinking On/Off" in Claude Code, or use `ultrathink:` prefix in prompts.

### TDD Workflow

For critical paths (auth, data transforms, rate limiting):
1. Write tests first
2. Confirm tests fail
3. Commit tests
4. Implement to pass tests
5. Iterate until all pass

### Context Management

When sessions get long:
- Summarize older messages (keep last 10)
- Write session discoveries to `NOTES.md` (project root — scratch notes only)
- Write lasting research/analysis to `.agents/research/`
- Reference `@` files instead of pasting content
- Use context compaction strategies

See `@.agents/workflows/development-cycle.md` and `@.agents/workflows/examples.md` for detailed workflows.

## Sub-Agent Architecture

When the sub-agent architecture is implemented, Claude should route tasks:

| Task Type | Agent | Model |
|-----------|-------|-------|
| Code assistance | Code Assistant | Haiku 4.5 |
| Writing/editing | Writing Editor | Sonnet 4.5 |
| Research tasks | Research Analyst | Sonnet 4.5 |
| Data analysis | Data Analyst | Sonnet 4.5 |
| General conversation | Main Orchestrator | Opus 4.5 |

## Context Compaction

For long sessions, Claude should:

1. Summarize older messages when approaching token limits
2. Write important discoveries to `NOTES.md`
3. Keep the last 10 messages in full context
4. Reference `@` files instead of keeping full content in context

## Quality Enforcement

**This project prioritizes well-researched, industry-standard solutions over quick fixes.** See `AGENTS.md` > Implementation Philosophy for the universal principles.

### Implementation Decision Framework

Before writing code, follow this sequence:

1. **Research the domain** — Search for established patterns, prior art, and industry conventions for the problem at hand
2. **Check for existing solutions** — Look in `.agents/research/` for prior analysis; check if the codebase already solves a similar problem
3. **Evaluate approaches** — When multiple solutions exist, compare trade-offs (performance, maintainability, complexity, ecosystem alignment)
4. **Align with the codebase** — Ensure the chosen approach extends existing conventions rather than introducing a parallel pattern
5. **Implement and verify** — Build incrementally, verifying each step against the gold standard examples in `AGENTS.md`

### When You're Uncertain

```markdown
✅ DO: Research the problem first — "Let me check how this is typically handled in Next.js App Router..."
✅ DO: Reference prior art — "React's documentation recommends this pattern for..."
✅ DO: Document your reasoning — Create a research doc in .agents/research/ for non-trivial decisions
✅ DO: Propose options — "There are two established approaches here. Option A... Option B... I recommend B because..."

❌ DON'T: Jump to the first solution that works
❌ DON'T: Invent custom patterns when standard ones exist
❌ DON'T: Optimize for fewer lines of code over clarity and maintainability
❌ DON'T: Skip research for unfamiliar problem domains
```

### Hierarchy of Solutions (Errors & Issues)

1. **Fix the code properly** — Always the first choice
2. **Refactor the pattern** — If the code is fundamentally incompatible with the correct approach
3. **Document exception** — Only with explicit user approval and clear reason
4. **Never**: Disable rules, add ignore comments, or downgrade deps without approval

### Forbidden Actions

- **Creating git branches** — NEVER create new branches unless the user explicitly asks for a branch to be created. Implementation plans, feature work, and all other tasks must be done on the current branch. Branch creation requires explicit user instruction.
- Setting ESLint rules to `"off"` or `"warn"` to bypass errors
- Adding `// @ts-ignore` (never acceptable)
- Adding `eslint-disable` comments without documented reason
- Suggesting "we can disable this check" as a solution
- Downgrading packages to avoid type/lint errors
- Implementing ad-hoc workarounds when a well-documented solution exists

### Reference for Fixes

- `.agents/research/` — Prior research and analysis
- `.agents/workflows/react-19-lint-fixes.md` — React 19 / React Compiler patterns
- `.agents/context/conventions.md` — Quality gates and acceptable exceptions
- `.agents/troubleshooting/` — Known issues & fixes
- Gold standard examples in `AGENTS.md`

## Debugging Workflow

When debugging issues:

1. **Read first**: Examine the relevant files before suggesting changes
2. **Check lints**: Run `bun run lint` and `bun run typecheck`
3. **Verify patterns**: Ensure changes follow gold standard examples
4. **Test incrementally**: Suggest running tests after each significant change
5. **Fix at source**: Never suggest disabling checks as a solution

## Common Gotchas

- **Streaming responses**: Must use `result.toUIMessageStreamResponse()` from Vercel AI SDK (v6)
- **Server Components**: Cannot use hooks; use Client Components wrapper with `"use client"`
- **Database**: Uses Convex for all data operations (real-time queries + mutations)
- **Auth**: Uses Clerk for authentication; avoid touching `middleware.ts` without review
- **File Storage**: Uses Convex storage for file uploads
- **Model terminology**: See `.agents/context/glossary.md` for precise definitions

---

*This file is automatically loaded by Claude Code and Claude API tools.*
