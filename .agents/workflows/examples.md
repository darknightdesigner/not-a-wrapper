# Workflow Examples

Practical examples of the development workflows in action.

## Example 1: Adding a New API Endpoint

### Phase 1: Research

**Prompt:**
```
/research

I need to add a new API endpoint for fetching user analytics.
Research how API routes are structured in this project.
```

**Research Output:**
```markdown
## Research Summary

### Existing Patterns Found
- API routes in `app/api/` follow Next.js App Router conventions
- Gold standard: `app/api/chat/route.ts` - streaming, validation, auth
- Error handling pattern: `app/api/chat/utils.ts` - structured errors

### Dependencies Identified
- Clerk for authentication (`@clerk/nextjs`)
- Convex for data (after migration)
- Vercel AI SDK patterns for responses

### Edge Cases to Consider
- Unauthenticated requests → 401
- Invalid user ID → 404
- Rate limiting for analytics endpoints
- Data privacy (users can only see their own analytics)

### Security Considerations
- Verify user owns the requested analytics
- Sanitize input parameters
- Rate limit expensive queries

### Next Steps
- Plan endpoint structure
- Define request/response types
- Plan test cases
```

### Phase 2: Plan

**Prompt:**
```
/plan

Create a detailed plan for the user analytics endpoint based on the research.
```

**Plan Output:**
```markdown
## Implementation Plan: User Analytics Endpoint

### Overview
Create `/api/users/[userId]/analytics` endpoint to fetch user analytics data.

### Steps
1. Create route file: `app/api/users/[userId]/analytics/route.ts`
2. Add authentication check (Clerk)
3. Add authorization check (user can only access own data)
4. Implement data fetching logic
5. Add error handling
6. Add rate limiting
7. Write tests

### Files to Create/Modify
- `app/api/users/[userId]/analytics/route.ts` - New endpoint
- `app/api/users/[userId]/analytics/route.test.ts` - Tests
- `lib/types/analytics.ts` - Type definitions (if needed)

### Dependencies
- `@clerk/nextjs` - Authentication
- Convex client - Data fetching

### Test Cases
- [ ] Returns 401 for unauthenticated requests
- [ ] Returns 403 for accessing another user's analytics
- [ ] Returns 200 with analytics data for own user
- [ ] Handles invalid userId gracefully
- [ ] Respects rate limits

### Edge Cases
- User doesn't exist → 404
- No analytics data yet → 200 with empty data
- Database error → 500 with error message

### Security Considerations
- Verify `userId` matches authenticated user
- Sanitize all input parameters
- Rate limit: 10 requests per minute per user

### Performance Notes
- Cache analytics data for 5 minutes
- Use Convex reactive queries efficiently
```

### Phase 3: Code & Verify

**Prompt:**
```
Implement step 1-3 of the plan. After each step, run /verify.
```

**Implementation:**
```typescript
// app/api/users/[userId]/analytics/route.ts
import { auth } from '@clerk/nextjs'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  // Step 1: Authentication
  const { userId: authUserId } = auth()
  if (!authUserId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Step 2: Authorization
  if (authUserId !== params.userId) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    )
  }

  // Step 3: Implementation continues...
}
```

**Verification:**
```bash
bun run typecheck  # ✅ Passes
bun run lint       # ✅ Passes
```

### Phase 4: Commit

**Prompt:**
```
/commit

Commit the analytics endpoint implementation.
```

**Result:**
```bash
git commit -m "feat: add user analytics endpoint

Implement GET /api/users/[userId]/analytics with:
- Authentication via Clerk
- Authorization checks
- Error handling
- Rate limiting

Add tests for auth, authorization, and data fetching.

Closes #123"
```

## Example 2: TDD Workflow for Data Transform

### Step 1: Write Tests First

**Prompt:**
```
/tdd

I need a function to transform YouTube transcript timestamps.
Write tests first for:
- Converting seconds to MM:SS format
- Handling edge cases (0, negative, > 1 hour)
- Rounding to nearest second
```

**Test Output:**
```typescript
// lib/utils/transcript.test.ts
import { describe, it, expect } from 'vitest'
import { formatTimestamp } from './transcript'

describe('formatTimestamp', () => {
  it('should format seconds to MM:SS', () => {
    expect(formatTimestamp(125)).toBe('02:05')
    expect(formatTimestamp(3661)).toBe('61:01')
  })

  it('should handle zero seconds', () => {
    expect(formatTimestamp(0)).toBe('00:00')
  })

  it('should round to nearest second', () => {
    expect(formatTimestamp(125.7)).toBe('02:06')
  })

  it('should throw error for negative values', () => {
    expect(() => formatTimestamp(-1)).toThrow('Invalid timestamp')
  })
})
```

### Step 2: Confirm Tests Fail

```bash
bun run test lib/utils/transcript.test.ts
# ✅ Tests fail as expected (function doesn't exist)
```

### Step 3: Commit Tests

```bash
git commit -m "test: add timestamp formatting tests"
```

### Step 4: Implement to Pass Tests

**Prompt:**
```
Now implement formatTimestamp to make all tests pass.
```

**Implementation:**
```typescript
// lib/utils/transcript.ts
export function formatTimestamp(seconds: number): string {
  if (seconds < 0) {
    throw new Error('Invalid timestamp')
  }

  const rounded = Math.round(seconds)
  const minutes = Math.floor(rounded / 60)
  const secs = rounded % 60

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
```

**Verification:**
```bash
bun run test lib/utils/transcript.test.ts
# ✅ All tests pass
```

## Example 3: Complex Feature with Extended Thinking

### Research Phase

**Prompt:**
```
/research

I need to implement real-time chat with message ordering guarantees.
Research how real-time features are currently implemented.
```

### Plan Phase with Extended Thinking

**Prompt:**
```
/plan

ultrathink: Design a scalable real-time chat system with:
- Message ordering guarantees
- Delivery confirmation
- Failure recovery
- Support for 100K concurrent users

Create a detailed architecture plan.
```

**Extended Thinking Output:**
```
[Claude shows detailed reasoning about:
- Message queue architecture
- Ordering strategies (vector clocks, sequence numbers)
- Delivery guarantees (at-least-once, exactly-once)
- Failure scenarios and recovery
- Scaling considerations
- Trade-offs between consistency and performance]
```

**Plan Created:**
```markdown
## Implementation Plan: Real-Time Chat with Ordering

### Architecture Decision
Use Convex reactive queries with sequence numbers for ordering.
Vector clocks for conflict resolution.

### Steps
1. Add sequence number to message schema
2. Implement message ordering logic
3. Add delivery confirmation system
4. Implement failure recovery
5. Add tests for ordering guarantees
...
```

## Example 4: Context Compaction in Long Session

### Scenario
Working on a complex feature, conversation is getting long.

**Prompt:**
```
Summarize our conversation so far:
- Key decisions made: [list]
- Current implementation state: [status]
- Next steps: [what's next]

Keep the last 10 messages in full detail.
Write important discoveries to NOTES.md.
```

**Result:**
- Older messages summarized
- Recent context preserved
- Key findings written to `NOTES.md`:
  ```markdown
  ## Session: 2026-01-14
  - Decision: Use Convex reactive queries for real-time chat
  - Discovery: Message ordering requires sequence numbers
  - TODO: Implement delivery confirmation
  ```

## Example 5: Incremental Commit Workflow

### Task: Add OAuth2 Provider

**After Step 1 (Research):**
```bash
git commit -m "docs: research OAuth2 implementation patterns"
```

**After Step 2 (Plan):**
```bash
git commit -m "docs: add OAuth2 implementation plan"
```

**After Step 3 (Tests):**
```bash
git commit -m "test: add OAuth2 flow tests"
```

**After Step 4 (Implementation Part 1):**
```bash
git commit -m "feat: add OAuth2 provider configuration"
```

**After Step 5 (Implementation Part 2):**
```bash
git commit -m "feat: implement OAuth2 callback handler"
```

**After Step 6 (Final):**
```bash
git commit -m "feat: complete OAuth2 integration

- Add session management
- Update auth middleware
- Add error handling

Closes #456"
```

**Benefits:**
- Easy to rollback if something breaks
- Clear history of incremental progress
- Each commit is a working checkpoint

## Best Practices Demonstrated

1. **Always Research First** - Understand before implementing
2. **Plan Before Coding** - Externalize plans for review
3. **Test-Driven** - Write tests first for critical paths
4. **Verify Continuously** - Run checks after each change
5. **Commit Incrementally** - Treat commits as save points
6. **Use Extended Thinking** - For complex architectural decisions
7. **Manage Context** - Summarize, reference, and archive

## Reference

- `@.agents/workflows/development-cycle.md` - Complete workflow documentation
- `@AGENTS.md` - Project conventions
- `@CLAUDE.md` - Claude-specific behaviors

---

*These examples demonstrate real-world application of the development workflows.*
