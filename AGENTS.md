# Not A Wrapper

Open-source multi-AI chat app with a unified model interface across providers.

## Primary Objective

Deliver correct, secure, maintainable changes with minimal, focused diffs.

## Implementation Philosophy (Highest Priority)

Prefer well-researched, industry-standard solutions over quick fixes.

When implementing features or fixing bugs:

1. Research first: understand established patterns before coding.
2. Prefer proven approaches: use battle-tested libraries and conventions.
3. Extend existing project patterns instead of introducing parallel systems.
4. Fix root causes, not symptoms.
5. Optimize for maintainability and clarity over short-term speed.
6. Evaluate trade-offs when multiple valid options exist, then choose deliberately.

If unsure, consult `.agents/research/` first and document reasoning for non-trivial choices.

## Study-Aligned Context Rule

Keep this file minimal and high signal.

- Include only hard constraints and critical project patterns.
- Do not add broad repository overviews or generic advice here.
- Keep deeper guidance in `.agents/` and load it only when task-relevant.

## Core Commands

```bash
bun install
bun run dev
bun run dev:clean
bun run lint
bun run typecheck
bun run build
bun run test
```

## Non-Negotiable Rules

### Security

- Never read/write `.env*` files.
- Never log or expose secrets, tokens, or credentials.
- Treat BYOK/API key data as encrypted-at-rest.

### Code Quality

- No `// @ts-ignore`.
- No lint-rule bypassing (`eslint-disable`) without explicit documented approval.
- Do not downgrade or disable checks to "make it pass."
- Prefer source fixes over workarounds.

### Git Safety

- Never create branches unless explicitly asked.
- Never force-push to shared branches.
- Avoid destructive git commands unless explicitly requested.

## Ask Before Making These Changes

- Adding dependencies (`bun add ...`)
- Modifying `package.json`, `tsconfig*`, `next.config.*`
- Editing auth-critical paths (`app/auth/`, `middleware.ts`)
- Changing DB schema (`convex/schema.ts`)
- Changing CI/CD (`.github/workflows/`)
- Deleting files

## Critical Project Patterns

### Streaming Responses (AI SDK v6)

```typescript
return result.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
  onError: (error) => extractErrorMessage(error),
})
```

### Convex Auth Pattern

```typescript
const identity = await ctx.auth.getUserIdentity()
if (!identity) throw new Error("Not authenticated")
// verify ownership before user-scoped mutations
```

### Optimistic Update Pattern

```typescript
let previous = null
setState((prev) => {
  previous = prev
  return updated
})
try {
  await mutation()
} catch {
  if (previous) setState(previous)
}
```

## Golden References

- API route pattern: `app/api/chat/route.ts`
- Adapter registry: `app/api/chat/adapters/index.ts`
- Chat hook pattern: `app/components/chat/use-chat-core.ts`
- Chat store provider: `lib/chat-store/chats/provider.tsx`
- Chat component pattern: `app/components/chat/chat.tsx`

## Execution Loop

1. Gather only the context needed for the current task.
2. Plan small, testable edits.
3. Implement focused changes.
4. Verify with relevant checks (`lint`, `typecheck`, targeted tests).
5. Report key trade-offs and residual risks.

## On-Demand Context

Load only when needed:

- `.agents/context/`
- `.agents/skills/`
- `.agents/workflows/`
- `.agents/troubleshooting/`
- `.agents/context/glossary.md`

## Output Preferences

- If asked to create a prompt, return it directly in chat unless a file is explicitly requested.
- Do not include timeline or effort estimates unless explicitly requested.

## Pull Request Baseline

1. Run `git fetch origin` before branch comparisons.
2. Diff and log against `origin/main` (not local `main`).
3. Scope PR descriptions to commits in `origin/main..HEAD`.
