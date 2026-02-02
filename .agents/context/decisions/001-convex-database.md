# ADR-001: Convex as Primary Database

## Status

**Accepted** — January 2025

## Context

The project needed a database solution for:
- Real-time chat message synchronization
- User session and preference storage
- File attachment storage
- Future RAG/vector search for AI memory

Previously using Supabase, but facing friction with:
- Manual subscription management for real-time
- Separate file storage configuration
- Type generation complexity

## Decision

Use **Convex** as the primary database and backend.

## Rationale

### Why Convex

| Feature | Convex | Supabase |
|---------|--------|----------|
| Real-time | Native reactive queries | Manual subscriptions |
| TypeScript | First-class, schema-derived | Generated types |
| File storage | Built-in | Separate S3 config |
| Vector search | Built-in RAG | pgvector extension |
| Auth | Native Clerk integration | JWT config |

### Key Benefits

1. **Real-time by default** — `useQuery()` automatically subscribes
2. **TypeScript-first** — Schema types flow to client
3. **Unified platform** — DB, storage, functions in one
4. **Built-in RAG** — Ready for AI memory features

### Trade-offs Accepted

- ❌ No local development (cloud-only)
- ❌ Vendor lock-in (proprietary)
- ❌ No raw SQL access
- ✅ Faster development velocity
- ✅ Better DX for real-time features

## Consequences

### Positive

- Eliminated manual subscription management
- Simplified file upload flow
- Type safety from schema to UI
- Ready for vector search when needed

### Negative

- Must be online to develop
- Migration required existing data transfer
- Learning curve for Convex patterns

## Implementation Notes

- Schema: `convex/schema.ts`
- Functions: `convex/*.ts`
- Auth config: `convex/auth.config.js`
- Client: `lib/chat-store/` providers

### Security Pattern

All mutations must follow:
```typescript
const identity = await ctx.auth.getUserIdentity()
// → user lookup → ownership check → operate
```

## References

- Convex docs: https://docs.convex.dev
- Migration PR: [link if available]
- `context/database.md` for patterns
