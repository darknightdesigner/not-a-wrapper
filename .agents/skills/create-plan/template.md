# [Feature Name] — Execution Guide

> **Status**: Ready for Implementation
> **Decision**: [Option X — Brief description of chosen approach]
> **Priority**: [P0/P1/P2] — [One-line justification]
> **Timeline**: [X weeks] ([N phases])
> **Date**: [Creation date] | Revised: [Last revision date]

---

## How to Use This Plan

This plan is structured for AI agent step-by-step execution. Each phase is self-contained with:

- **Context to load** — files to read before starting the phase
- **Steps** — atomic actions in execution order
- **Verify** — how to confirm the phase is complete
- **Decision gates** — questions that must be answered before proceeding

Phases can be resumed independently. An agent starting at Phase 3 only needs to read Phase 3's context files, not the entire plan.

**Permission notes**: [List any phases that require explicit user approval per `AGENTS.md`, e.g., schema changes, package additions, auth modifications.]

---

## Decision Summary

**Implementing [Option X: Name].** [2-3 sentence description of what will be built and the approach.]

**Why [Option X]**: [Key reasons — speed, risk, alignment with codebase patterns, reusability.]

**Evolution path**: [v1 (this plan) → v1.1 (next improvement) → v2 (future vision).]

---

## Constants Reference

<!-- Define all shared constants here. Reference by name in phases. -->
<!-- Remove this section if no constants are needed. -->

All constants to add to `lib/config.ts`. Referenced by multiple phases.

```typescript
// [Feature] Constants
export const EXAMPLE_CONSTANT = "value"
export const EXAMPLE_LIMIT = 100
export const EXAMPLE_TIMEOUT_MS = 5000
```

---

## Schema Reference

<!-- Database schema changes, if applicable. Remove if not needed. -->

New Convex tables. This is the canonical schema — copy directly into `convex/schema.ts`.

```typescript
exampleTable: defineTable({
  userId: v.id("users"),
  name: v.string(),
  createdAt: v.number(),
})
  .index("by_user", ["userId"]),
```

---

## File Map

Every file to create or modify, organized by phase. Use as a progress tracker.

| Phase | File | Action |
|-------|------|--------|
| 0 | `path/to/file.ts` | Modify — [brief description] |
| 1 | `path/to/new-file.ts` | Create — [brief description] |
| 1 | `path/to/existing.ts` | Modify — [brief description] (**Ask First**) |
| 2 | `path/to/test.test.ts` | Create — [brief description] |

---

## Phase 0: [Spike / Proof of Concept]

<!-- Optional phase for validating assumptions before committing. -->
<!-- Remove if no spike is needed. -->

> **Goal**: [What assumption are we validating?]
> **Dependencies**: None.
> **Can run in parallel with**: Phase 1.

### Context to Load

- `path/to/relevant-file.ts` — [why this file matters]
- `path/to/pattern-reference.ts` — [what pattern to follow]

### Steps

1. [First atomic action]
2. [Second atomic action]
3. If [condition A] → use as primary approach for subsequent phases
4. If [condition B] → use fallback approach, update all references in this plan

### Verify

- [Specific verification criteria]
- [Exact command to run, e.g., `bun run typecheck`]

### Decision Gate

**[Decision name]**: [Question that must be answered before proceeding. This affects which approach is used in later phases.]

---

## Phase 1: [Foundation / Configuration]

> **Goal**: [One sentence describing the deliverable.]
> **Dependencies**: None.
> **Can run in parallel with**: Phase 0.

### Context to Load

- `path/to/file.ts` — [why to read this]
- `path/to/config.ts` — [what to look for]

### Steps

1. Read `path/to/file.ts` and [specific action]
   ```typescript
   // path/to/file.ts — add after the existing [section]
   export const NEW_THING = "value"
   ```
2. [Next step with code example]
3. [Continue with atomic steps]

### Verify

```bash
bun run typecheck  # No new errors
```

---

## Phase 2: [Core Logic / Data Layer]

> **Goal**: [One sentence describing the deliverable.]
> **Dependencies**: Phase 1 ([specific reason]).
> **Permission**: [Modifying X requires explicit user approval per `AGENTS.md`.]

### Context to Load

- `path/to/schema.ts` — existing table structure
- `path/to/pattern-reference.ts` — **pattern reference** for [specific pattern]
- `lib/config.ts` — constants from Phase 1

### Step 2.1: [Sub-step Name]

1. Read `path/to/file.ts` to understand [what]
2. [Action with code example]:
   ```typescript
   // path/to/file.ts
   export function newFunction() {
     // Implementation following pattern from pattern-reference.ts
   }
   ```

**Verify**: `bun run typecheck`

### Step 2.2: [Sub-step Name]

1. [Action]

| Function | Type | Description |
|----------|------|-------------|
| `functionA` | query | [What it does] |
| `functionB` | mutation | [What it does] |

**Verify**: `bun run typecheck`

---

## Phase 3: [Integration / Wiring]

> **Goal**: [One sentence describing the deliverable.]
> **Dependencies**: Phase 2 ([specific output needed]).
> **This is the critical integration phase** — read the existing code carefully before modifying.

### Context to Load

- `path/to/main-file.ts` — **read the entire file thoroughly** before making changes
- `path/to/new-module.ts` — the module from Phase 2

### Steps

1. Add import at the top:
   ```typescript
   import { newFunction } from "@/path/to/new-module"
   ```
2. After existing [section], add:
   ```typescript
   // Integration point — follows existing pattern
   const result = await newFunction(args)
   ```
3. [Error handling]:
   ```typescript
   } catch (error) {
     // Cleanup resources
     throw error
   }
   ```

### Verify

```bash
bun run typecheck
bun run lint
```

Then manual test:
1. [Test scenario A] — verify [expected outcome]
2. [Test scenario B] — verify [expected outcome]

---

## Phase 4: [UI / User-Facing Changes]

<!-- Remove if not applicable. -->

> **Goal**: [One sentence describing the deliverable.]
> **Dependencies**: Phase 2 (data layer).

### Context to Load

- `app/components/relevant/file.tsx` — being replaced/modified
- `app/components/relevant/pattern.tsx` — **pattern reference**

### Steps

1. Create `app/components/feature/new-component.tsx`:
   - [Component requirements]
   - [State management approach]
   - [Data fetching pattern]

2. Wire into layout:
   - Read `settings-content.tsx` — locate both mobile and desktop rendering paths
   - Replace [old component] with [new component]

### Verify

- UI renders correctly in both mobile and desktop layouts
- [Interactive functionality works]
- [Data operations succeed]

---

## Phase 5: [Testing / Validation]

> **Goal**: Verify the full integration end-to-end.
> **Dependencies**: All previous phases.

### Context to Load

- `path/to/core-logic.ts` — to write tests against

### Step 5.1: Unit Tests

| Test File | What It Tests |
|-----------|---------------|
| `path/__tests__/feature.test.ts` | [What it validates] |

### Step 5.2: Integration Test Checklist

Run manually:

- [ ] [Test scenario with expected outcome]
- [ ] [Error scenario with expected degradation]
- [ ] [Edge case with expected behavior]
- [ ] [Permission scenario — e.g., anonymous user cannot access]

### Verify

```bash
bun run test
bun run lint
bun run typecheck
bun run build
```

---

## Security Checklist

<!-- Remove if not applicable. Apply throughout all phases. -->

- [ ] All mutations verify user ownership via `ctx.auth.getUserIdentity()`
- [ ] Input validated and sanitized
- [ ] Secrets encrypted at rest (AES-256-GCM via `lib/encryption.ts`)
- [ ] Rate limiting applied before expensive operations
- [ ] Audit logging for sensitive actions (truncated previews, no PII)
- [ ] Feature flag gates all new logic
- [ ] Never log OAuth tokens, API keys, credentials, session tokens

---

## Critical Implementation Patterns

<!-- Document reusable patterns that appear across phases. -->

### [Pattern Name]

[Description of the pattern and where it applies.]

```typescript
// Example implementation
```

**Side-effects to handle:**
1. [Downstream impact]
2. [UI consideration]

### Error Propagation

| Failure Point | Behavior |
|---------------|----------|
| [Failure A] | [How it's handled — graceful degradation, retry, user notification] |
| [Failure B] | [How it's handled] |

---

## Architecture Reference

<!-- Preserves the full analysis for context. Not needed for execution — -->
<!-- refer only when making architectural decisions or when a phase raises questions. -->

### Current State

| Component | File | Status |
|-----------|------|--------|
| [Existing thing] | `path/to/file.ts` | [Working/Placeholder/Not started] |

### Option A: [Chosen Option Name]

**Architecture**: [1-2 sentence description.]

**Pros**: [Numbered list of advantages.]
**Cons**: [Numbered list of disadvantages.]

### Option B: [Alternative Name]

**Architecture**: [1-2 sentence description.]

**Pros**: [Brief.] **Cons**: [Brief.]
**Timeline**: [X weeks.] **Complexity**: [Low/Med/High.]

### Option C: [Alternative Name]

**Architecture**: [1-2 sentence description.]

**Pros**: [Brief.] **Cons**: [Brief.]
**Timeline**: [X weeks.] **Complexity**: [Low/Med/High.]

### Comparison Matrix

| Dimension | A: [Name] | B: [Name] | C: [Name] |
|-----------|-----------|-----------|-----------|
| Complexity | Low | High | High |
| Timeline | X weeks | Y weeks | Z weeks |
| Risk level | Low | Medium | High |
| Pattern alignment | Strong | Medium | Weak |
| v1 viability | **Best** | Good | Risky |

---

*Plan produced [date]. Optimized for AI agent execution. Based on: [key dependencies, versions, and context that informed this plan].*
