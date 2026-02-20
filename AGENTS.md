# Not A Wrapper

Open-source multi-AI chat application with unified model interface. Supports 100+ models across 8 providers with multi-model comparison, BYOK, and local model support.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | Convex (reactive DB + built-in RAG) |
| Auth | Clerk |
| Payments | Flowglad |
| AI | Vercel AI SDK → Multi-provider (OpenAI, Claude, Gemini, etc.) |
| State | Zustand + TanStack Query |
| UI | Shadcn/Base UI + Tailwind 4 |

## Commands

```bash
bun install        # Install deps
bun run dev        # Dev server (:3000)
bun run dev:clean  # Dev server with fresh .next cache
bun run lint       # ESLint
bun run typecheck  # tsc --noEmit
bun run build      # Production build
bun run test       # Vitest (critical paths)
```

## Context System

This project uses a structured context system for AI assistants:

| Location | Purpose | When Loaded |
|----------|---------|-------------|
| `AGENTS.md` | Quick reference (this file) | Always |
| `.cursor/rules/` | Cursor-specific patterns | Auto by Cursor |
| `.agents/context/` | Domain knowledge & references | On-demand |
| `.agents/context/glossary.md` | Domain terminology | On-demand |
| `.agents/context/research/` | Research, evaluations, analyses | On-demand |
| `.agents/context/decisions/` | Architecture Decision Records | On-demand |
| `.agents/context/troubleshooting/` | Known issues & fixes | On-demand |
| `.agents/plans/` | Implementation plans | On-demand |
| `.agents/skills/` | Multi-step task guides | On-demand |
| `.agents/workflows/` | Development procedures | On-demand |
| `.agents/archive/` | Superseded documents | On-demand |

### Key Skills

**Load skills BEFORE starting work** when a task matches the trigger.

| Skill | Use When |
|-------|----------|
| `add-ai-provider` | Integrating new AI service |
| `add-model` | Adding model to existing provider |
| `convex-function` | Creating database functions |

> Skills contain checklists and patterns that prevent common mistakes. Load via `@.agents/skills/[name]/SKILL.md`

### Workflows

| Workflow | Use When |
|----------|----------|
| `new-feature.md` | Implementing new features |
| `debugging.md` | Troubleshooting issues |
| `release.md` | Releasing new versions |

### Architecture Decisions

| ADR | Topic |
|-----|-------|
| `001-convex-database.md` | Why Convex over Supabase |
| `002-vercel-ai-sdk.md` | Multi-provider abstraction |
| `003-optimistic-updates.md` | State update pattern |

## Directory Structure

```
app/                    # Next.js App Router
├── api/               # API routes (streaming)
├── auth/              # Auth pages/actions
├── c/[chatId]/        # Chat pages
├── p/[projectId]/     # Project pages
├── share/             # Public share pages
└── components/chat/   # Chat UI

lib/                    # Shared utilities
├── chat-store/        # Chat state
├── config.ts          # Constants
├── models/            # AI model definitions
└── openproviders/     # AI provider abstraction

components/            # Shadcn UI components (Base UI primitives)
convex/               # Convex DB schema & functions

.agents/               # AI context & knowledge base
├── context/          # Domain knowledge & references
│   ├── decisions/   # Architecture Decision Records
│   ├── research/    # Research & evaluations
│   └── troubleshooting/ # Known issues & fixes
├── plans/            # Implementation plans
├── skills/           # Multi-step task guides
├── workflows/        # Development procedures
└── archive/          # Superseded documents

.cursor/rules/         # Cursor-specific rules
```

## Gold Standard Examples

| Pattern | File |
|---------|------|
| API Route | `app/api/chat/route.ts` |
| Provider History Adapter Registry | `app/api/chat/adapters/index.ts` |
| Custom Hook | `app/components/chat/use-chat-core.ts` |
| Context Provider | `lib/chat-store/chats/provider.tsx` |
| Component | `app/components/chat/chat.tsx` |

## Implementation Philosophy

**Prefer well-researched, industry-standard solutions over quick fixes.**

When implementing features or fixing bugs:

1. **Research first** — Understand the problem domain and established solutions before writing code
2. **Use proven patterns** — Prefer battle-tested approaches (design patterns, established libraries, documented techniques) over novel or ad-hoc solutions
3. **Optimize for maintainability** — Long-term code health over short-term velocity
4. **Extend existing conventions** — Follow and build upon the codebase's established patterns
5. **Evaluate trade-offs** — When multiple approaches exist, analyze pros/cons before committing

> When unsure, consult `.agents/context/research/` for prior analysis or create a new research document before implementing.

## Prompt Delivery Default

When the user asks to "create a prompt" (or similar), return the prompt directly in chat.
Do not create a markdown file unless the user explicitly asks for a file.
If ambiguous, prefer chat output.

## Critical Patterns

### Streaming Responses (MUST)

```typescript
// ALWAYS use toUIMessageStreamResponse for AI chat (AI SDK v6)
return result.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
  onError: (error) => extractErrorMessage(error),
})
```

### Convex Auth Pattern (MUST)

```typescript
// All mutations modifying user data:
const identity = await ctx.auth.getUserIdentity()
if (!identity) throw new Error("Not authenticated")
// ... lookup user, verify ownership, then operate
```

### Optimistic Updates

```typescript
// Store previous → Update optimistic → Rollback on error
let previous = null
setState((prev) => { previous = prev; return updated })
try { await mutation() } 
catch { if (previous) setState(previous) }
```

## AI Agent Permissions

### ✅ Allowed

- Read any source file
- Run: `dev`, `build`, `lint`, `typecheck`, `test`
- Create/edit in: `app/`, `lib/`, `components/`, `hooks/`
- Create/edit documentation in: `.agents/` (follow `.cursor/rules/070-documentation.mdc`)

### ⚠️ Ask First

- `bun add <package>`
- Modify: `package.json`, `tsconfig.json`, `next.config.*`
- Git operations
- Auth logic (`app/auth/`, `middleware.ts`)
- Delete files
- DB schema (`convex/schema.ts`)
- CI/CD (`.github/workflows/`)

### 🚫 Forbidden

- Read/write `.env*` files
- Force push or commit secrets
- `// @ts-ignore` (never acceptable)
- `eslint-disable` without documented reason
- Disabling lint rules to bypass errors

## Security

**Never log:** OAuth tokens, API keys, credentials, session tokens

**Encrypt at rest:** User-provided API keys (BYOK) via AES-256-GCM

**Rate limiting:** Check BEFORE calling `streamText()`

## Key Terminology

> Full glossary: `.agents/context/glossary.md`

| Term | Meaning |
|------|---------|
| Model | Config object, ID string, or SDK instance (context-dependent) |
| providerId | Internal ID for API key lookups (`"anthropic"`) |
| baseProviderId | AI SDK identifier (`"claude"`) |
| parts | AI SDK message content array (text, tools, reasoning) |
| BYOK | Bring Your Own Key |

## Environment Variables

```bash
# Required
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
CSRF_SECRET=
ENCRYPTION_KEY=  # Must be 32 bytes base64

# AI Providers (at least one)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

See `.env.example` for complete documentation.

## Development Workflow

Four-phase cycle: **Research → Plan → Code & Verify → Commit**

Use `ultrathink` for complex architectural decisions.

See `.agents/workflows/development-cycle.md` for details.

---

*~200 lines. For detailed patterns, see `.cursor/rules/` and `.agents/skills/`.*
