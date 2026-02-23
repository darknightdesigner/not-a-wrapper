# Claude Overlay (Minimal)

Claude-specific guidance for this repository. Universal rules live in `AGENTS.md`.

## First Principle

Follow `AGENTS.md` as the source of truth for implementation philosophy, safety, and quality.

## Claude-Specific Deltas (Only)

- Use parallel tool calls when operations are independent.
- Read only task-relevant files; avoid broad exploration by default.
- If a task is medium/high risk, load `.agents/workflows/correctness-decision-workflow.md` before implementation.
- After substantive edits, run relevant validation (`lint`, `typecheck`, targeted tests).
- Be concise and direct.
- Do not provide timeline or effort estimates unless explicitly requested.

## Notes

- Keep this file short and Claude-specific.
- Do not duplicate policy from `AGENTS.md` unless a contradiction must be resolved.
