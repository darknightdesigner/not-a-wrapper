---
allowed-tools: Bash, Read, Grep
description: Phase 4 - Commit with conventional commit message
---

# Commit Phase

**Goal:** Commit changes with clear, conventional commit messages.

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <subject>

<body (optional)>

<footer (optional)>
```

## Commit Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style (formatting, no logic change)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

## Examples

### Simple Feature
```
feat: add OAuth2 authentication

Implement Google OAuth2 provider with session management.
Add tests for auth flows.

Closes #123
```

### Bug Fix
```
fix: resolve N+1 query in user endpoint

Use batch loading to fetch user data efficiently.

Fixes #456
```

### Test Addition
```
test: add user auth service tests

Cover happy path and error scenarios.
```

## Workflow

1. **Review changes:**
   ```bash
   git status
   git diff
   ```

2. **Stage changes:**
   ```bash
   git add .
   # Or specific files: git add path/to/file.ts
   ```

3. **Commit:**
   ```bash
   git commit -m "type: subject" -m "body"
   ```

## Before Committing

Ensure:
- [ ] All verification checks pass (`/verify`)
- [ ] Changes are reviewed (`git diff`)
- [ ] Commit message follows conventions
- [ ] No secrets or credentials in changes
- [ ] No `.env*` files committed

## Reference

See `@.agents/workflows/development-cycle.md` for complete commit workflow and best practices.
