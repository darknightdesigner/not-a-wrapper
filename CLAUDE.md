# Claude Overlay (Minimal)

Claude-specific guidance for this repository. Universal rules live in `AGENTS.md`.

## First Principle

Follow `AGENTS.md` as the source of truth for implementation philosophy, safety, and quality.

## Response Style

- Be concise and direct.
- Use code references when helpful.
- Prefer focused diffs over large rewrites.
- Do not provide timeline or effort estimates unless explicitly requested.

## Execution Style

- Use parallel tool calls when operations are independent.
- Read only the files needed for the current task; avoid broad exploration by default.
- After substantive edits, run relevant validation (`lint`, `typecheck`, targeted tests).

## Task-Specific References

- Chat flows: `app/components/chat/use-chat-core.ts`
- API routes: `app/api/chat/route.ts`
- Chat state patterns: `lib/chat-store/chats/provider.tsx`
- UI composition patterns: `components/ui/` and `app/components/`

## Context Loading Rule

Load deeper docs only when needed for the task:

- `.agents/context/`
- `.agents/skills/`
- `.agents/workflows/`
- `.agents/troubleshooting/`

## Prompt Output Default

If asked to "create a prompt", return it in chat unless the user explicitly asks for a file.

## Notes

- Keep this file short and Claude-specific.
- Do not duplicate policy from `AGENTS.md` unless a contradiction must be resolved.
