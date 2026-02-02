# Workflow: Add New Feature

Step-by-step procedure for implementing new features in Not A Wrapper.

## Prerequisites

- [ ] Feature requirements are clear
- [ ] You have access to run dev server
- [ ] No uncommitted changes in working directory

## Phase 1: Research

**Goal:** Understand existing patterns before writing code.

### Steps

1. **Identify affected areas**
   ```
   Which layers does this feature touch?
   - [ ] UI components (app/components/)
   - [ ] API routes (app/api/)
   - [ ] Database (convex/)
   - [ ] State management (lib/*-store/)
   - [ ] Utilities (lib/)
   - [ ] Pages (app/c/, app/p/, app/share/)
   ```

2. **Read gold standard examples**
   - API route: `app/api/chat/route.ts`
   - Hook: `app/components/chat/use-chat-core.ts`
   - Provider: `lib/chat-store/chats/provider.tsx`
   - Component: `app/components/chat/chat.tsx`

3. **Check for existing patterns**
   - Search codebase for similar features
   - Review `.cursor/rules/` for applicable patterns
   - Check `.agents/skills/` for relevant guides

4. **Note dependencies**
   - External packages needed
   - Internal modules to import
   - Types to extend

## Phase 2: Plan

**Goal:** Create detailed implementation plan.

### Steps

1. **Create/update plan.md**
   ```markdown
   ## Feature: [Name]
   
   ### Overview
   [What this feature does]
   
   ### Implementation Steps
   1. [Step 1]
   2. [Step 2]
   
   ### Files to Create/Modify
   - `path/to/file.ts` — [Purpose]
   
   ### Test Cases
   - [ ] [Test case]
   ```

2. **Consider edge cases**
   - Error states
   - Loading states
   - Empty states
   - Permission checks

3. **Review security implications**
   - Auth requirements
   - Data validation
   - Rate limiting needs

4. **Get approval** (if significant change)

## Phase 3: Implement

**Goal:** Build the feature incrementally.

### Steps

1. **Database layer** (if needed)
   ```bash
   # Add to convex/schema.ts
   # Create convex/[feature].ts
   # Follow .agents/skills/convex-function/SKILL.md
   ```

2. **API layer** (if needed)
   ```bash
   # Create app/api/[feature]/route.ts
   # Follow .cursor/rules/050-api-routes.mdc
   ```

3. **State management** (if needed)
   ```bash
   # Create lib/[feature]-store/provider.tsx
   # Follow optimistic update pattern
   ```

4. **UI components**
   ```bash
   # Create app/components/[feature]/
   # Follow .cursor/rules/020-react-components.mdc
   ```

5. **Verify after each step**
   ```bash
   bun run typecheck
   bun run lint
   ```

## Phase 4: Verify

**Goal:** Ensure quality before committing.

### Steps

1. **Run all checks**
   ```bash
   bun run typecheck && bun run lint && bun run test
   ```

2. **Manual testing**
   - [ ] Feature works as expected
   - [ ] Error cases handled gracefully
   - [ ] No console errors
   - [ ] Responsive on mobile

3. **Review changes**
   ```bash
   git diff
   ```

## Phase 5: Commit

**Goal:** Document changes properly.

### Steps

1. **Stage changes**
   ```bash
   git add .
   ```

2. **Commit with conventional message**
   ```bash
   git commit -m "feat: [description]"
   ```

3. **Push for review** (if applicable)
   ```bash
   git push origin [branch]
   ```

## Troubleshooting

### Type errors after adding Convex function

- Run `npx convex dev` to regenerate types
- Check `convex/_generated/` is up to date

### Component not re-rendering

- Check `useCallback`/`useMemo` dependencies
- Verify optimistic state is being merged correctly

### API route returning 500

- Check middleware.ts isn't blocking
- Verify auth pattern is correct
- Check Convex function exists and is exported

## Reference

- `.agents/workflows/development-cycle.md` — Four-phase cycle details
- `.agents/skills/` — Task-specific guides
- `.cursor/rules/` — Pattern enforcement
