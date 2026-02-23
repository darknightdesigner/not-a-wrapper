# Workflow: Correctness-First Decision

Use this workflow for medium/high-risk tasks to prioritize robust, industry-standard solutions over quick fixes.

## Goal

- Preserve high implementation quality with explicit design decisions.
- Keep always-on context minimal by loading this workflow only when needed.

## Step 1: Risk Triage

Classify the task before coding:

- **Low risk:** localized refactor, copy changes, non-behavioral cleanup.
- **Medium risk:** behavior changes in one subsystem, moderate user impact.
- **High risk:** auth, schema/data model, API contracts, persistence, concurrency, migrations, billing/payments, security-critical paths.

If the task is medium/high risk, continue with this workflow.

## Step 2: Evaluate Approaches (Short ADR)

Document a brief decision note:

1. Problem and constraints.
2. Candidate approaches (2-3 options).
3. Chosen approach and why it is safer/clearer long-term.
4. Why alternatives were rejected.
5. Failure modes and rollback plan.

Keep it concise. This is for decision quality, not long-form documentation.

## Step 3: Industry-Standard Gate

Before introducing new patterns or dependencies, verify:

- Existing project pattern cannot reasonably solve the problem.
- Proposed approach is mature and actively maintained.
- Security and operational implications are acceptable.
- Migration and maintenance cost are understood.

If the new dependency is optional or convenience-only, prefer existing patterns.

## Step 4: Implementation Discipline

- Implement smallest change that satisfies the specification.
- Preserve existing architecture boundaries.
- Avoid speculative abstractions.
- Add concise comments only where logic is non-obvious.

## Step 5: Risk-Scaled Validation

- **Low risk:** targeted tests/checks for touched behavior.
- **Medium risk:** targeted + affected integration path tests.
- **High risk:** targeted + integration + regression/failure-mode checks.

Compilation, lint, and type checks are necessary but not sufficient for medium/high risk.

## Step 6: Final Review Checklist

- Chosen approach addresses root cause.
- Trade-offs were considered, not guessed.
- Changes match project patterns unless deviation is justified.
- Validation depth matches risk tier.
- Residual risks are explicitly noted in handoff/report.
