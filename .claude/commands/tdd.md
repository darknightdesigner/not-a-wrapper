---
allowed-tools: Read, Write, Grep, Bash
description: Test-Driven Development workflow
---

# TDD Workflow

**Goal:** Write tests first, then implement to pass them.

## TDD Steps

### Step 1: Write Tests First

Write test cases based on requirements. **Do NOT write implementation yet.**

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('FeatureName', () => {
  it('should handle expected case', () => {
    // Arrange → Act → Assert
  })

  it('should handle error case', () => {
    // Test error boundaries
  })
})
```

### Step 2: Confirm Tests Fail

Run tests to verify they fail as expected:
```bash
bun run test [path/to/test.ts]
```

This validates that tests are actually checking behavior.

### Step 3: Commit the Tests

Commit tests with message:
```
test: add [feature] tests
```

This establishes the baseline for implementation.

### Step 4: Implement to Pass Tests

Write implementation code. **Do NOT modify tests** - only write code to make tests pass.

Iterate:
1. Write minimal code to pass one test
2. Run tests
3. Refactor if needed
4. Move to next test
5. Repeat until all pass

## What to Test (Critical Paths Only)

From `@AGENTS.md`:
- ✅ Auth flows, OAuth handling
- ✅ Message persistence, data transforms
- ✅ Rate limiting, validation
- ✅ Error handling edge cases

Skip:
- ❌ UI rendering tests
- ❌ AI response quality
- ❌ Visual regression

## Test Structure

Follow patterns in `.agents/context/testing.md`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('FeatureName', () => {
  beforeEach(() => {
    // Setup
  })

  describe('happy path', () => {
    it('should [expected behavior]', () => {
      // Arrange
      const input = ...
      
      // Act
      const result = ...
      
      // Assert
      expect(result).toBe(...)
    })
  })

  describe('error cases', () => {
    it('should handle [error scenario]', () => {
      // Test error handling
    })
  })
})
```

## Verification

After implementation:
```bash
bun run typecheck  # TypeScript check
bun run lint       # Linter
bun run test       # Run tests
```

## Reference

- `@.agents/workflows/development-cycle.md` - Complete TDD workflow
- `@.agents/context/testing.md` - Testing guidelines
- `@AGENTS.md` - Testing strategy
