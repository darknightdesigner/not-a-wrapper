---
allowed-tools: Read, Grep, Glob, Write, Bash
description: Generate or run tests for specified code
---

For the specified code:

1. **Analyze** - Identify critical paths and edge cases
2. **Generate** - Create test cases following project patterns
3. **Run** - Execute tests with `bun run test`

## Testing Philosophy (from AGENTS.md)

Focus on **critical paths only**:
- ✅ Auth flows, OAuth handling
- ✅ Message persistence, data transforms
- ✅ Rate limiting, validation
- ✅ Error handling edge cases

Skip:
- ❌ UI rendering tests (non-deterministic)
- ❌ AI response quality (monitor in prod)
- ❌ Visual regression (premature)

## Test Structure

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

Reference: `.agents/context/testing.md` for full guidelines.
