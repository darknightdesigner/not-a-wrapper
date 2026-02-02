---
allowed-tools: Bash, Read
description: Phase 3 - Run all verification checks
---

# Verification Phase

**Goal:** Verify code quality before committing.

## Verification Checklist

Run these checks in order:

### 1. TypeScript Check
```bash
bun run typecheck
```
Ensures all types are correct and no type errors exist.

### 2. Linter Check
```bash
bun run lint
```
Verifies code follows project style guidelines.

### 3. Tests (if applicable)
```bash
bun run test
```
Runs test suite for critical paths.

### 4. Build Check (optional, before major changes)
```bash
bun run build
```
Ensures production build succeeds.

## Quick Verify Command

Run all checks:
```bash
bun run typecheck && bun run lint && bun run test
```

## What to Fix

- **Type errors** → Fix type annotations, imports, or type definitions
- **Lint errors** → Fix formatting, unused imports, or style issues
- **Test failures** → Fix implementation or update tests (if requirements changed)
- **Build errors** → Fix compilation issues

## After Verification

Once all checks pass:
1. Review the changes: `git diff`
2. Stage changes: `git add .`
3. Commit with clear message (see `/commit` command)

## Reference

See `@.agents/workflows/development-cycle.md` for complete verification workflow.
