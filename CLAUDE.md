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

### Tool Usage
- **Maximize parallel tool calls** when operations are independent
- Read multiple files simultaneously when exploring a feature
- Run lint/typecheck after edits to catch issues early

## Project-Specific Behaviors

### When Working on Chat Features
- Reference `app/components/chat/use-chat-core.ts` for hook patterns
- Follow optimistic update pattern from `lib/chat-store/chats/provider.tsx`
- Streaming responses use Vercel AI SDK patterns

### When Working on API Routes
- Follow `app/api/chat/route.ts` as the gold standard
- Always validate input with proper error handling
- Use structured error responses: `{ error: string, code?: string }`

### When Working on UI Components
- Use Shadcn/Radix primitives from `components/ui/`
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
| `.agents/context/research/` | Research, evaluations, analyses |
| `.agents/context/decisions/` | Architecture Decision Records |
| `.agents/context/troubleshooting/` | Known issues & fixes |
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
- Write lasting research/analysis to `.agents/context/research/`
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

**This project prioritizes strict quality over quick fixes.** When facing lint or type errors:

### Hierarchy of Solutions

1. **Fix the code** — Always the first choice
2. **Refactor the pattern** — If the code is fundamentally incompatible
3. **Document exception** — Only with explicit user approval and clear reason
4. **Never**: Disable rules, add ignore comments, or downgrade deps without approval

### Forbidden Actions

- Setting ESLint rules to `"off"` or `"warn"` to bypass errors
- Adding `// @ts-ignore` (never acceptable)
- Adding `eslint-disable` comments without documented reason
- Suggesting "we can disable this check" as a solution
- Downgrading packages to avoid type/lint errors

### When You Encounter Errors

```markdown
✅ DO: "This error is because X. Here's how to fix the code properly..."
✅ DO: "This pattern violates React 19's ref rules. The correct pattern is..."
✅ DO: "I'll consult .agents/workflows/react-19-lint-fixes.md for the recommended fix."

❌ DON'T: "We can disable this rule in eslint.config.mjs..."
❌ DON'T: "Let me add // @ts-ignore to suppress this..."
❌ DON'T: "Should I turn off this check?"
```

### Reference for Fixes

- `.agents/workflows/react-19-lint-fixes.md` — React 19 / React Compiler patterns
- `.agents/context/conventions.md` — Quality gates and acceptable exceptions
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
