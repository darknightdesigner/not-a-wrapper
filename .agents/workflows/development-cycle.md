# Development Workflows

This document outlines the standardized development workflows for Not A Wrapper, based on Anthropic's best practices for AI-assisted development.

## Overview

We follow a structured approach to ensure high-quality code, proper testing, and maintainable architecture. All workflows are designed to work seamlessly with Claude Code and other AI assistants.

## Four-Phase Coding Cycle

Anthropic's recommended workflow for AI-assisted development:

### Phase 1: Explore & Research

**Goal:** Gather context before writing any code

**Best Practices:**
- Direct Claude to read relevant files or URLs
- Explicitly instruct: "Do NOT write code yet, just research"
- Use sub-agents to investigate specific details
- Keep main context window focused

**Example Prompt:**
```
Read the authentication module in /app/auth and understand how sessions
are currently managed. Do not write any code yet.
```

**What to Research:**
- Existing patterns in the codebase
- Related files and dependencies
- Edge cases and error handling
- Security implications
- Performance considerations

### Phase 2: Plan & Strategize

**Goal:** Create a detailed implementation plan

**Best Practices:**
- Have Claude outline steps to solve the problem
- Use extended thinking prompts: "ultrathink" for complex problems
- Externalize the plan (GitHub issue, markdown file) as a checkpoint
- Review and approve before implementation

**Example Prompt:**
```
Based on your research, create a detailed plan for adding OAuth2 support.
Think hard about edge cases and security implications. Output the plan
to plan.md.
```

**Plan Should Include:**
- Step-by-step implementation approach
- Files to create/modify
- Dependencies to add
- Test cases to write
- Edge cases to handle
- Security considerations

### Phase 3: Code & Verify

**Goal:** Implement the solution with continuous verification

**Best Practices:**
- Implement only after plan is approved
- Mandate verification: run tests, linters, type checks
- Iterate until all checks pass
- Commit incrementally after each verified component

**Example Prompt:**
```
Implement step 1 of the plan. After writing the code, run the tests
and type checker. Do not proceed to step 2 until all checks pass.
```

**Verification Checklist:**
- [ ] TypeScript compiles: `bun run typecheck`
- [ ] Linter passes: `bun run lint`
- [ ] Tests pass: `bun run test`
- [ ] No console errors in dev mode
- [ ] Follows project patterns (see `@AGENTS.md`)

### Phase 4: Commit & Finalize

**Goal:** Document and submit for review

**Best Practices:**
- Commit with clear, descriptive messages
- Generate pull request for team review
- Update documentation (README, CHANGELOG)
- Archive learnings in `CLAUDE.md` or `NOTES.md` for future reference

**Example Prompt:**
```
Commit the OAuth2 implementation with a clear commit message. Create a
pull request and update the README with the new authentication flow.
```

**Commit Message Format:**
```
feat: add OAuth2 authentication support

- Implement Google OAuth2 provider
- Add session management
- Update auth middleware
- Add tests for auth flows

Closes #123
```

## Test-Driven Development (TDD) Workflow

Anthropic's teams use TDD to produce reliable codebases. Here's our workflow:

### Step 1: Write Tests First

**Prompt Example:**
```
I'm following TDD. Write test cases for a user authentication service
based on these requirements: [requirements]. Do NOT write the implementation
yet - only the tests.
```

**What to Test:**
- Happy path scenarios
- Error cases
- Edge cases
- Boundary conditions
- Security scenarios

### Step 2: Confirm Test Failure

**Prompt Example:**
```
Run the tests to confirm they fail as expected. This validates
that our tests are actually testing something.
```

**Why This Matters:**
- Ensures tests are actually checking behavior
- Prevents false positives
- Validates test setup

### Step 3: Commit the Tests

**Prompt Example:**
```
Commit these tests with message 'test: add user auth service tests'.
These establish our baseline for the implementation.
```

**Benefits:**
- Creates a clear checkpoint
- Documents expected behavior
- Enables easy rollback if needed

### Step 4: Implement to Pass Tests

**Prompt Example:**
```
Now write the implementation code to make all tests pass. Do NOT
modify the tests - only write implementation code. Iterate until
all tests pass.
```

**Iteration Process:**
1. Write minimal code to pass one test
2. Run tests
3. Refactor if needed
4. Move to next test
5. Repeat until all tests pass

### Benefits of TDD with Claude

- Ensures code meets specifications from the start
- Prevents implementation drift
- Creates self-documenting test suites
- Easier to catch regressions
- Forces consideration of edge cases upfront

## Extended Thinking for Complex Tasks

Claude 4.x models support "Extended Thinking" mode for complex problem-solving.

### When to Use Extended Thinking

- **Architectural decisions** - System design, major refactoring
- **Complex debugging** - Multi-step issues, performance problems
- **Security analysis** - Vulnerability assessment, threat modeling
- **Performance optimization** - Algorithm improvements, bottleneck analysis

### How to Enable

**In Claude Code:**
1. Toggle "Thinking On/Off" button in the interface
2. Or use `ultrathink` command for maximum depth

**Prompt Examples:**

**Standard Complex Problem:**
```
Please think about this problem thoroughly and in great detail.
Consider multiple approaches and show your complete reasoning.
```

**Maximum Depth (ultrathink):**
```
ultrathink: Design a scalable architecture for real-time chat with
100K concurrent users. Consider message ordering, delivery guarantees,
and failure scenarios.
```

### Best Practices

- Use for problems requiring deep analysis
- Break complex instructions into numbered steps
- Request reasoning to be shown explicitly
- Review the thinking process for insights

## Context Compaction Strategies

For long-running sessions, implement context management to prevent context rot.

### Strategy 1: Summarize Older Messages

**When:** Approaching token limits (80% of context window)

**How:**
```
Summarize the conversation so far, focusing on:
- Key decisions made
- Important discoveries
- Current state of implementation
- Next steps

Keep the last 10 messages in full detail.
```

### Strategy 2: Write to NOTES.md

**When:** Important discoveries or decisions are made

**How:**
```
Write this discovery to NOTES.md:
- [Discovery/Decision]
- Date: [today]
- Context: [brief explanation]
- Impact: [what this affects]
```

**Example:**
```markdown
## Session: 2026-01-14
- Discovered auth module uses legacy JWT library
- TODO: Migrate to jose library
- Performance issue in /api/users endpoint due to N+1 query
```

### Strategy 3: Reference External Files

**Instead of:**
```
[Long code block or explanation]
```

**Use:**
```
See @app/api/chat/route.ts for the streaming pattern.
Reference @.agents/context/api.md for API conventions.
```

### Strategy 4: Keep Recent Context

**Rule of Thumb:**
- Keep last 10 messages in full
- Summarize messages 11-50
- Archive messages 51+ to NOTES.md

## Commit-After-Each-Task Workflow

Treat commits as "save points" in development.

### Workflow Steps

1. **Before Starting:**
   ```bash
   git status  # Ensure clean working directory
   git pull    # Get latest changes
   ```

2. **After Each Task:**
   ```bash
   git diff              # Review changes
   bun run typecheck     # Verify types
   bun run lint          # Check style
   bun run test          # Run tests (if applicable)
   git add .             # Stage changes
   git commit -m "feat: [descriptive message]"
   ```

3. **If Something Goes Wrong:**
   ```bash
   git diff              # See what changed
   git reset --hard HEAD # Rollback to last commit
   ```

### Commit Message Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style (formatting, no logic change)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Format:**
```
<type>: <subject>

<body (optional)>

<footer (optional)>
```

**Examples:**
```
feat: add OAuth2 authentication

Implement Google OAuth2 provider with session management.
Add tests for auth flows.

Closes #123
```

```
fix: resolve N+1 query in user endpoint

Use batch loading to fetch user data efficiently.

Fixes #456
```

### Benefits

- Easy rollback if AI suggestions introduce bugs
- Clear history of incremental progress
- Better collaboration with team
- Easier to identify when issues were introduced

## Workflow Integration

### Combining Workflows

**Example: Complex Feature Implementation**

1. **Research Phase:**
   ```
   Research existing authentication patterns in the codebase.
   Review security best practices for OAuth2.
   ```

2. **Plan Phase:**
   ```
   Create detailed implementation plan in plan.md.
   Use ultrathink for security considerations.
   ```

3. **TDD Phase:**
   ```
   Write tests first for OAuth2 flow.
   Commit tests.
   Implement to pass tests.
   ```

4. **Code & Verify Phase:**
   ```
   Implement step by step.
   Run typecheck, lint, tests after each step.
   Commit after each verified component.
   ```

5. **Finalize Phase:**
   ```
   Update documentation.
   Create pull request.
   Archive learnings to NOTES.md.
   ```

### Workflow Commands

Use these slash commands for common workflows:

- `/research` - Start research phase
- `/plan` - Create implementation plan
- `/tdd` - Start TDD workflow
- `/verify` - Run all verification checks
- `/commit` - Commit with conventional message

## Best Practices Summary

1. **Always Research First** - Understand before implementing
2. **Plan Before Coding** - Externalize plans for review
3. **Test-Driven** - Write tests first for critical paths
4. **Verify Continuously** - Run checks after each change
5. **Commit Incrementally** - Treat commits as save points
6. **Use Extended Thinking** - For complex architectural decisions
7. **Manage Context** - Summarize, reference, and archive
8. **Document Learnings** - Update NOTES.md and CLAUDE.md

## References

- `@.agents/context/ai-context-engineering-guide.md` - Full context engineering guide
- `@AGENTS.md` - Project conventions and permissions
- `@CLAUDE.md` - Claude-specific behaviors
- `@.agents/context/testing.md` - Testing guidelines
- `@plan.md` - Current implementation plan

---

*This workflow is based on Anthropic's official best practices and industry standards as of January 2026.*
