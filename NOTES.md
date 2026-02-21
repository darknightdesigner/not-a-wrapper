# Project Notes

Agentic memory for persistent context across sessions. AI agents should update this file with discoveries, decisions, and patterns.

---

## Session Log

### 2026-01-18 — Convex Migration Completed

- ✅ Completed migration from Supabase to Convex
- Cleaned up legacy Supabase type files and deprecated API stubs
- Updated documentation to reflect Convex patterns
- User data now sourced from Clerk (auth) + Convex (app data)

### 2026-01-14 — Project Context Setup

- Created core AI context files: `CLAUDE.md`, `NOTES.md`, `spec.md`, `plan.md`
- Reviewed existing `AGENTS.md` — comprehensive, includes gold standard examples
- Project was in active migration: Supabase → Convex (now complete)

---

## Decisions Made

| Date | Decision | Rationale | Reference |
|------|----------|-----------|-----------|
| 2026-01 | Use Convex over Supabase | Built-in RAG, real-time, TypeScript-first | `.agents/research/tech-stack-evaluation.md` |
| 2026-01 | Use Clerk for auth | Native integration with Convex + Flowglad | `.agents/research/tech-stack-evaluation.md` |
| 2026-01 | Use Flowglad for payments | Open-source, Clerk-native | `.agents/research/tech-stack-evaluation.md` |
| 2026-01 | Testing: critical paths only | AI responses non-deterministic | `AGENTS.md` |

---

## Patterns Discovered

### Optimistic Updates
Location: `lib/chat-store/chats/provider.tsx`
```typescript
// Store previous state → update optimistically → rollback on error
```

### Streaming API Response
Location: `app/api/chat/route.ts`
```typescript
// Uses Vercel AI SDK StreamingTextResponse
```

### Hook Composition
The chat feature uses composed hooks for separation of concerns:
- `useChatCore` — AI SDK integration
- `useChatOperations` — CRUD operations
- `useFileUpload` — File handling
- `useModel` — Model selection

---

## Known Issues

<!-- Add issues as discovered -->

| Issue | Status | Notes |
|-------|--------|-------|
| Supabase migration | ✅ Complete | All data operations now use Convex |
| Convex schema | ✅ Complete | See `convex/schema.ts` |
| Legacy docs | ⚠️ Partial | Some docs still reference old patterns |

---

## Performance Notes

<!-- Add performance findings -->

- [ ] Identify slow API routes
- [ ] Profile chat component rendering
- [ ] Measure context window usage

---

## Security Findings

<!-- Add security notes -->

- OAuth tokens must be encrypted at rest
- Never log API keys or session tokens
- Rate limiting implemented in chat operations

---

## Research To-Do

- [ ] Verify Context7 tool status (may be deprecated)
- [ ] Research MCP security best practices
- [ ] Document sub-agent token economics
- [ ] Test nested CLAUDE.md loading behavior

---

## Useful Commands

```bash
# Development
bun run dev                    # Start dev server
bun run typecheck              # Type check specific file: tsc --noEmit src/file.ts

# Debugging
bun run lint -- --fix          # Auto-fix lint issues
bun run build                  # Check for build errors

# Git
git diff --staged              # Review staged changes
git log --oneline -10          # Recent commits
```

---

*This file is maintained by AI agents. Human review encouraged.*
