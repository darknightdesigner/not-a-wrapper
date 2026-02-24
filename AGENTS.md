# Not A Wrapper

Open-source multi-AI chat app with a unified model interface across providers.

## Primary Objective

Deliver correct, secure, maintainable changes with minimal, focused diffs.

## Context File Contract (Paper-Aligned)

- Keep this file minimal and high-signal.
- Include only mandatory constraints and critical patterns.
- Avoid broad repository overviews and generic checklists.
- Load deeper guidance from `.agents/` only when task-relevant.

## Implementation Philosophy (SHOULD)

- Prefer well-researched, industry-standard solutions over quick fixes.
- Extend existing project patterns instead of introducing parallel systems.
- Fix root causes instead of symptoms.
- Optimize for maintainability and clarity over short-term speed.
- If unsure, consult `.agents/research/` and document non-trivial trade-offs.

## Correctness-First Escalation (MUST)

- Use risk-based rigor: keep low-risk tasks lightweight, increase rigor for medium/high-risk tasks.
- Medium/high-risk changes require a brief approach decision before coding (options, trade-offs, chosen approach).
- High-risk triggers include: auth, schema/data model, API contracts, persistence, concurrency, migrations, billing/payments, and security-critical paths.
- Introducing a new dependency or architectural pattern requires explicit justification and at least one alternative considered.
- Validation depth must scale with risk; do not treat successful compilation as sufficient evidence of correctness.
- For the detailed process, load `.agents/workflows/correctness-decision-workflow.md` on demand.

## Non-Negotiable Rules

### Security (MUST)

- Never read/write `.env*` files.
- Never log or expose secrets, tokens, or credentials.
- Treat BYOK/API key data as encrypted-at-rest.

### Code Quality (MUST)

- No `// @ts-ignore`.
- No lint-rule bypassing (`eslint-disable`) without explicit documented approval.
- Do not downgrade or disable checks to "make it pass."
- Prefer source fixes over workarounds.

### Git Safety (MUST)

- Never create branches unless explicitly asked.
- Never force-push to shared branches.
- Avoid destructive git commands unless explicitly requested.

## Ask Before Making These Changes (MUST)

- Adding dependencies (`bun add ...`)
- Modifying `package.json`, `tsconfig*`, `next.config.*`
- Editing auth-critical paths (`app/auth/`, `middleware.ts`)
- Changing DB schema (`convex/schema.ts`)
- Changing CI/CD (`.github/workflows/`)
- Deleting files

## Required Project Patterns (MUST When Applicable)

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

## Execution Defaults (SHOULD)

1. Gather only the context needed for the current task.
2. Plan small, testable edits.
3. Implement focused changes.
4. Run only relevant checks (`lint`, `typecheck`, targeted tests).
5. Report key trade-offs and residual risks.

## On-Demand Context

Load only when needed:

- `.agents/context/`
- `.agents/skills/`
- `.agents/workflows/`
- `.agents/troubleshooting/`
- `.agents/context/glossary.md`

## Output Preferences (SHOULD)

- If asked to create a prompt, return it directly in chat unless a file is explicitly requested.
- Do not include timeline or effort estimates unless explicitly requested.

## Pull Request Baseline (SHOULD When Preparing PRs)

1. Run `git fetch origin` before branch comparisons.
2. Diff and log against `origin/main` (not local `main`).
3. Scope PR descriptions to commits in `origin/main..HEAD`.

## Cursor Cloud specific instructions

### Services

| Service | How to run | Notes |
|---------|-----------|-------|
| Next.js dev server | `bun run dev:next` | Runs on port 3000. Requires `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` env vars. |
| Convex dev sync | `bun run dev:convex` | Requires `CONVEX_DEPLOYMENT` env var and Convex account. |
| Both (default) | `bun run dev` | Runs Next.js + Convex concurrently. |

### Standard commands

See `package.json` scripts: `bun run lint`, `bun run typecheck`, `bun run test`.

### HugeIcons Pro stubs

`@hugeicons-pro/core-stroke-rounded` and `@hugeicons-pro/core-solid-rounded` are private packages requiring `HUGEICONS_LICENSE_KEY`. Without this key, `bun install` will fail with 401 errors. The update script automatically generates stub packages via `scripts/setup-hugeicons-stubs.js` so that lint, typecheck, tests, and the dev server all work. If the real license key is provided, set up `.npmrc` before `bun install`:

```
@hugeicons-pro:registry=https://npm.hugeicons.com
//npm.hugeicons.com/:_authToken=$HUGEICONS_LICENSE_KEY
```

### Gotchas

- `bun install` exits non-zero when HugeIcons Pro packages cannot be fetched, but it still installs all other packages. The stub script must run after `bun install` to fill in the missing packages.
- The app requires cloud services (Clerk for auth, Convex for DB) and will show runtime errors without valid credentials. This is expected in environments without secrets configured.
- Next.js 16 Turbopack performs static ESM analysis; Proxy-based module stubs do not work. Stubs must explicitly export every icon name used in the codebase.
