# AI Agent Task: Fix Phase 1.5 Remaining Issues

## Context

A code review of the AI SDK v5 upgrade (Phase 1.5) identified one remaining issue that must be fixed before proceeding to Phase 2. The tool-related patterns have FIXME markers and are correctly deferred to Phase 4.

**Key Documents:**
- Execution plan: `.agents/plans/ai-sdk-v6-upgrade-execution.md`
- Research document: `.agents/archive/ai-sdk-upgrade-research.md`

## Issue to Fix

### 1. Fix `sources-list.tsx` — Property Rename

**File:** `app/components/chat/sources-list.tsx`
**Line:** 97

**Problem:** The v5 `SourceUrlUIPart` type uses `sourceId`, not `id`. The current code causes a type error.

**Current (WRONG):**
```typescript
<li key={source.id} className="flex items-center text-sm">
```

**Required Fix:**
```typescript
<li key={source.sourceId} className="flex items-center text-sm">
```

**Verification:** After the fix, this error should disappear from typecheck:
```
app/components/chat/sources-list.tsx(97,37): error TS2339: Property 'id' does not exist on type 'SourceUrlUIPart'.
```

## Instructions

1. **Read** `app/components/chat/sources-list.tsx` to confirm the current state
2. **Apply** the fix: change `source.id` to `source.sourceId` on line 97
3. **Verify** by running `bun run typecheck 2>&1 | grep sources-list` — should show no errors for this file
4. **Update** the execution plan to document the fix

## Execution Plan Update

After applying the fix, update `.agents/plans/ai-sdk-v6-upgrade-execution.md`:

In the "Phase 1.5 Review Findings" section (around line 191), add a row to the table:

```markdown
| `source.id` → `source.sourceId` | `sources-list.tsx` | Property access updated |
```

## Verification Commands

```bash
# Check that sources-list.tsx has no type errors
bun run typecheck 2>&1 | grep sources-list

# Count remaining errors (should be slightly fewer than 188)
bun run typecheck 2>&1 | grep -c "error TS"
```

## Do NOT Change

The following files have FIXME markers for Phase 4 work. Do NOT attempt to fix them now:

- `app/components/chat/get-sources.ts` — tool patterns (Phase 4)
- `app/components/chat/message-assistant.tsx` — tool patterns (Phase 4)
- `app/components/chat/tool-invocation.tsx` — tool patterns (Phase 4)

## Expected Outcome

- `sources-list.tsx` compiles without the `source.id` type error
- Execution plan updated to reflect the fix
- Phase 1.5 can be marked complete
- Ready to proceed to Phase 2 (Server-Side Migration)

## Success Criteria

1. `bun run typecheck 2>&1 | grep sources-list` returns no errors
2. The fix is a single property rename (`id` → `sourceId`)
3. Execution plan documents the change
