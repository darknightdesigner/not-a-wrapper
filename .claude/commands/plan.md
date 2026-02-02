---
allowed-tools: Read, Write, Grep, Glob
description: Phase 2 - Create detailed implementation plan
model: claude-opus-4-5-20250929
---

# Planning Phase

**Goal:** Create a detailed implementation plan before coding.

## Instructions

1. **Review research** - Use findings from research phase
2. **Break into steps** - Divide work into small, focused tasks
3. **Consider edge cases** - Plan error handling and validation
4. **Think about testing** - Identify what needs tests
5. **Use extended thinking** - For complex problems, use `ultrathink`

## Plan Structure

Create or update `plan.md` with:

```markdown
## Implementation Plan: [Feature Name]

### Overview
[Brief description of what we're building]

### Steps
1. [Step 1 - specific and actionable]
2. [Step 2 - specific and actionable]
3. [Step 3 - specific and actionable]

### Files to Create/Modify
- `path/to/file.ts` - [Purpose]

### Dependencies
- [Package/import needed]

### Test Cases
- [ ] [Test case 1]
- [ ] [Test case 2]

### Edge Cases
- [Edge case and how to handle]

### Security Considerations
- [Security note]

### Performance Notes
- [Performance consideration]
```

## Best Practices

- **Be specific** - Each step should be clear and actionable
- **Think ahead** - Consider dependencies between steps
- **Plan tests** - Identify critical paths that need testing
- **Consider errors** - Plan error handling for each step
- **Review before coding** - Get approval before implementation

## Extended Thinking

For complex architectural decisions, use:
```
ultrathink: [Your complex problem here]
```

This enables maximum depth analysis for:
- System design
- Security architecture
- Performance optimization
- Complex refactoring

## Reference

See `@.agents/workflows/development-cycle.md` for complete planning guidelines.
