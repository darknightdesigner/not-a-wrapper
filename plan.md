# Implementation Plan

Living document for tracking current work and next steps.

---

## Current Sprint

### Focus: Prompt-Kit Component Update

**Goal**: Consolidate all prompt-kit components into `components/ui/`, install missing components, and update existing ones to latest versions.

---

## Task Status

### ✅ Completed
- [x] Research tech stack decisions (Convex, Clerk, Flowglad)
- [x] Document decisions in `docs/agents-research.md`
- [x] Create `AGENTS.md` with project overview
- [x] Create `CLAUDE.md` with Claude-specific context
- [x] Create `.copilot-instructions.md` for GitHub Copilot
- [x] Create `NOTES.md` for agentic memory
- [x] Create `spec.md` for requirements
- [x] Create `plan.md` (this file)
- [x] Create context directory structure
  - [x] `context/architecture.md`
  - [x] `context/conventions.md`
  - [x] `context/testing.md`
  - [x] `context/api.md`
  - [x] `context/database.md`
  - [x] `context/deployment.md`
- [x] Set up `.cursor/rules/` directory
  - [x] `001_core.mdc` (core workspace rules)
  - [x] `002_security.mdc` (security guidelines)
  - [x] `100_typescript.mdc` (TypeScript conventions)
  - [x] `101_react_nextjs.mdc` (React/Next.js patterns)
  - [x] `200_testing.mdc` (testing patterns)
  - [x] `201_api.mdc` (API patterns)
- [x] Configure `.claude/` directory
  - [x] `settings.json` (team permissions)
  - [x] `commands/analyze.md`
  - [x] `commands/refactor.md`
  - [x] `commands/review.md`
  - [x] `commands/test.md`
  - [x] `commands/security/scan.md`
- [x] Create nested CLAUDE.md files
  - [x] `app/CLAUDE.md`
  - [x] `app/api/CLAUDE.md`
  - [x] `app/auth/CLAUDE.md`
  - [x] `app/components/CLAUDE.md`
  - [x] `lib/CLAUDE.md`
  - [x] `lib/ai/CLAUDE.md`
  - [x] `components/CLAUDE.md`
  - [x] `hooks/CLAUDE.md`
- [x] Implement Development Workflow
  - [x] Create `docs/workflows.md` with four-phase cycle, TDD, extended thinking
  - [x] Create workflow commands: `/research`, `/plan`, `/tdd`, `/verify`, `/commit`
  - [x] Update `CLAUDE.md` with workflow references
  - [x] Update `AGENTS.md` with workflow overview
  - [x] Create `docs/workflow-examples.md` with practical examples

### ✅ Recently Completed (Sprint 3)
- [x] Set up Convex project
  - [x] Install Convex: `bun add convex`
  - [x] Run `npx convex init`
  - [x] Create `convex/schema.ts`
  - [x] Configure Clerk integration
- [x] Complete Convex migration from Supabase
- [x] Set up Clerk authentication
- [x] Split login/sign-up routes with reactive user sync
- [x] Clean up legacy Supabase files

### 🔄 In Progress
- [ ] Prompt-Kit component consolidation (see `docs/prompt-kit-update-plan.md`)
  - [ ] **Phase 1**: Pre-flight checks & install dependencies
  - [ ] **Phase 2**: Backup existing components
  - [ ] **Phase 3**: Migrate 9 components from `prompt-kit/` to `ui/`
  - [ ] **Phase 4**: Install 7 missing components (tool, source, chain-of-thought, etc.)
  - [ ] **Phase 5**: Update existing components to latest versions
  - [ ] **Phase 6**: Final verification (typecheck, lint, build)

### 📋 Next Up
- [ ] Model comparison analytics
  - [ ] Response time tracking
  - [ ] Token usage comparison
  - [ ] Cost analysis per response
- [ ] Smart model routing
  - [ ] Task-based auto-selection
  - [ ] Cost/quality optimization

### 🔮 Backlog
- [ ] Sub-agent architecture implementation
- [ ] Model chains and workflow automation
- [ ] Advanced multi-model UI (diff view, voting)
- [ ] Flowglad payment setup
- [ ] API access for developers

---

## Blockers

<!-- Track blockers here -->

| Blocker | Status | Resolution |
|---------|--------|------------|
| None currently | - | - |

---

## Decisions Pending

<!-- Decisions that need to be made -->

1. **Loader naming**: Keep both `loader.tsx` (12+ variants) and `loader-dots.tsx` (simple)?
2. **Model routing**: How to automatically select best model for task?
3. **Response caching**: Cache identical prompts for cost savings?

---

## Notes from Current Work

<!-- Scratch space for current session -->

### 2026-01-19

**Current Focus:** Prompt-Kit Component Update

Before YouTube integration, consolidating UI components:
1. Migrate 9 components from `components/prompt-kit/` → `components/ui/`
2. Install 7 missing components (tool, source, chain-of-thought, feedback-bar, steps, system-message, image)
3. Update existing components to latest prompt-kit versions
4. Verify all imports updated to `@/components/ui/`

See `docs/prompt-kit-update-plan.md` for detailed execution steps.

### 2026-01-18

**Convex Migration Complete!** Successfully migrated from Supabase to Convex:
- All data operations now use Convex
- Clerk authentication integrated
- Legacy Supabase files cleaned up
- User data sourced from Clerk (auth) + Convex (app data)

### 2026-01-13

**AI Context Setup Complete!** All foundational AI context files are now in place:

**Core Files:**
- `AGENTS.md` — Universal rules for all AI agents
- `CLAUDE.md` — Claude-specific behaviors and preferences
- `NOTES.md` — Persistent memory across sessions
- `spec.md` — Requirements and architecture decisions
- `plan.md` — This working document

**Context Directory (6 files):**
- `context/architecture.md`, `context/conventions.md`, `context/testing.md`
- `context/api.md`, `context/database.md`, `context/deployment.md`

**Nested CLAUDE.md Files (8 files):**
- `app/CLAUDE.md`, `app/api/CLAUDE.md`, `app/auth/CLAUDE.md`, `app/components/CLAUDE.md`
- `lib/CLAUDE.md`, `lib/ai/CLAUDE.md`, `components/CLAUDE.md`, `hooks/CLAUDE.md`

---

## Quick Reference

### Commands
```bash
bun run dev          # Start dev server
bun run lint         # Check for issues
bun run typecheck    # TypeScript check
bun run build        # Production build
```

### Key Files
- `AGENTS.md` — Project overview for AI
- `spec.md` — Requirements
- `docs/agents-research.md` — Tech decisions

### Gold Standard Patterns
- API Route: `app/api/chat/route.ts`
- Hook: `app/components/chat/use-chat-core.ts`
- Provider: `lib/chat-store/chats/provider.tsx`
- Component: `app/components/chat/chat.tsx`

---

## Sprint History

### Sprint 1 (Completed)
- ✅ Initial research phase
- ✅ Tech stack decisions
- ✅ AGENTS.md creation

### Sprint 2 (Completed)
- ✅ AI context file setup (all files created)
- ✅ Context directory with 6 domain-specific docs
- ✅ Cursor rules with 6 numbered rule files
- ✅ Claude commands with 5 slash commands
- ✅ Nested CLAUDE.md files (8 modules covered)

### Sprint 3 (Completed)
- ✅ Convex project setup
- ✅ Clerk authentication
- ✅ Database migration (Supabase → Convex)
- ✅ Auth route split (login/sign-up)

### Sprint 4 (Current)
- 🔄 Prompt-Kit component consolidation
- 📋 Install missing AI chat components
- 📋 Update existing components to latest

### Sprint 5 (Next)
- 📋 Model comparison analytics
- 📋 Smart model routing
- 📋 Multi-model UI enhancements

---

## Future Research & Open Questions

### JSX Preview Component

- **Description**: prompt-kit has a `jsx-preview.tsx` component that renders JSX strings as React components dynamically
- **Potential use cases for Not A Wrapper**:
  - Dynamic code previews from AI responses
  - Interactive component visualization
  - Generative UI features (dynamic component rendering from AI responses)
- **Considerations**:
  - Security: Requires careful sanitization of JSX strings before rendering
  - Bundle size: Adds ~50KB for JSX parsing/rendering runtime
  - Performance: Needs debouncing for streaming responses to avoid excessive re-renders
- **Status**: Evaluate when implementing generative UI features
- **Reference**: https://prompt-kit.com/docs and `docs/prompt-kit-analysis.md`

### LLM Context Files

- **Description**: prompt-kit provides `llms.txt` and `llms-full.txt` for AI-assisted development
- **Purpose**: Gives AI assistants (Claude, Copilot, etc.) context about component APIs and usage patterns
- **Potential for Not A Wrapper**:
  - Create `/public/llms.txt` documenting customized prompt-kit components
  - Include component customizations, upgrade notes, and usage examples
  - Help AI assistants understand project-specific patterns vs upstream prompt-kit
- **Status**: Consider when AI-assisted development becomes a priority
- **Reference**: https://prompt-kit.com/llms.txt

---

*Update this file as work progresses. AI agents should check and update task status.*
