# T3 Code performance references

Prefer the existing local checkout at `../T3Code`, relative to the main `not-a-wrapper` checkout, following the [open-source reference index](../../open-source-references/SKILL.md#p1--t3-code). From a managed worktree, use `git worktree list --porcelain` to locate the main checkout and resolve its sibling `T3Code` directory. Check that each local file exists before reading it; use its GitHub fallback if unavailable.

Paths below are relative to the T3 Code checkout. Read its current files directly. They are implementation examples, not evidence of the exact revision Theo used in the video. Consult its `AGENTS.md` before making changes there.

| Reference | Primary local file | GitHub fallback | Use for |
| --- | --- | --- | --- |
| Performance regression guide | `docs/internals/performance-regressions.md` | [Guide](https://github.com/pingdotgg/t3code/blob/main/docs/internals/performance-regressions.md) | Payload budgets, bounded history, startup, and benchmarks exercising the active transport. |
| Transport performance tests | `apps/server/src/orchestration-v2/ThreadTransportPerformance.test.ts` | [Tests](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/ThreadTransportPerformance.test.ts) | Contract encoding and payload regression checks. |
| Command performance tests | `packages/client-runtime/src/operations/commands.performance.test.ts` | [Tests](https://github.com/pingdotgg/t3code/blob/main/packages/client-runtime/src/operations/commands.performance.test.ts) | Measurements of command paths and redundant reads. |
| CI workflow | `.github/workflows/ci.yml` | [Workflow](https://github.com/pingdotgg/t3code/blob/main/.github/workflows/ci.yml) | How checks run in CI. |
| Package commands | `package.json` | [Commands](https://github.com/pingdotgg/t3code/blob/main/package.json) | Current benchmark and validation entry points. |

This repo's equivalent of the payload checks is `convex/payloadBudgets.seam.test.ts` (ADR-0049). The selected-path read has a budget but no bound yet; T3 Code's bounded recent-history window is the reference for bounding it.

Connection to the video: Theo discusses payload baselines and CI at [29:04](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=1744); search for `[29:04]` in the [local transcript](theo-transcript.md).
