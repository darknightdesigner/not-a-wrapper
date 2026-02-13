# ADR 005: Provider-Neutral Replay Compiler

- **Status**: Accepted
- **Date**: 2026-02-13
- **Supersedes**: N/A
- **Related ADRs**:
  - `.agents/context/decisions/004-provider-history-adapters.md`
  - `.agents/context/decisions/002-vercel-ai-sdk.md`
- **Related plan**: `.agents/plans/provider-neutral-replay-compiler.md`

## Context

Cross-provider replay failures were still occurring after provider-aware history adapters because provider-native tool payloads are not stable across vendors. The most visible production issue class was replaying OpenAI-shaped `web_search` payloads into non-OpenAI targets.

The system needed to preserve useful replay context while preventing request-shape failures at provider boundaries, without introducing high-risk storage migrations.

Constraints:

1. Must remain additive and reversible behind a feature flag.
2. Must not break current adapter pipeline during migration.
3. Must degrade safely (warnings + fallback) instead of failing user requests.
4. Must provide observability for dropped or transformed replay artifacts.

## Decision

Adopt **Option C-lite: provider-neutral replay normalization + provider compilers** in front of the existing adapter pipeline.

Pipeline:

1. Normalize stored `UIMessage[]` into a provider-neutral replay representation.
2. Compile normalized replay into target-provider-safe history.
3. Run existing provider adaptation/finalization safeguards.
4. If normalization or compilation fails, fall back to legacy adapter behavior with structured warnings.

Feature gating:

- Controlled by `HISTORY_REPLAY_COMPILER_V1`.
- Replay normalizer schema version tracked by `HISTORY_REPLAY_NORMALIZER_VERSION`.

## Alternatives Considered

### Option A: Adapter-only patching

Keep expanding provider adapters with one-off replay sanitizers and shape patches.

Why rejected:

- Repeatedly reintroduces the same bug class as payload formats diverge.
- Weak contract boundaries; behavior spread across adapter conditionals.
- Harder to verify exhaustively with provider-switch test matrices.

### Option B: Dual storage model (canonical + provider-rendered history)

Store both canonical chat history and provider-specific rendered replay snapshots.

Why rejected:

- Requires schema/storage migration and synchronization logic.
- Higher complexity for cache invalidation and write-path consistency.
- Larger blast radius than needed for current replay-shape incidents.

### Option C (full): Provider IR/AST-first architecture end-to-end

Move all history handling to a rich intermediate representation and provider codegen.

Why rejected (for now):

- Strong long-term model but over-scoped for immediate reliability fixes.
- Slower delivery and larger cognitive load for contributors.
- Option C-lite captures most value with lower migration risk.

## Consequences

Positive:

- Eliminates core cross-provider replay-shape failures for supported tool families.
- Makes replay contracts explicit, testable, and observable.
- Provides a scalable path for adding providers/tools incrementally.

Trade-offs:

- Introduces another layer (normalizer + compiler) to maintain.
- Requires ongoing compiler updates as provider contracts evolve.
- Increases test surface area (normalizer, compiler contracts, matrix tests, fallback paths).

## Rollout Strategy

1. **Ship dark**: land compiler path behind `HISTORY_REPLAY_COMPILER_V1=false` default if needed by environment strategy.
2. **Canary enablement**: enable for controlled traffic, monitor warning and fallback rates.
3. **Broad enablement**: flip default once matrix and incident regressions remain stable.
4. **Legacy path retention window**: keep legacy fallback for at least one clean telemetry window.

Operational checkpoints before broad enablement:

- No replay-shape crash regressions in cross-provider tests.
- Warning rates stable and mostly expected (unknown/unsupported tool shapes).
- Fallback activation low and trending down.

## Rollback Strategy

Immediate rollback path:

1. Disable `HISTORY_REPLAY_COMPILER_V1`.
2. Revert to legacy adapter-only replay path without schema/data migration.
3. Preserve structured logs for post-incident analysis (`history_replay_normalize`, `history_replay_compile`, fallback signals).

Rollback triggers:

- Elevated replay failures after enabling compiler path.
- Unexpected high fallback volume indicating compiler contract drift.
- Provider-specific regressions that cannot be mitigated quickly with targeted compiler patches.

## Test Strategy

Testing is split by boundary to isolate regressions:

1. **Normalizer tests**:
   - Provider-native search payloads normalize to canonical replay shape.
   - Malformed/unknown payloads produce warnings, never throw.

2. **Compiler contract tests**:
   - Anthropic compiler only emits provider-safe replay structures.
   - OpenAI compiler preserves reasoning/tool/result atomicity constraints.

3. **Cross-provider regression tests**:
   - Incident fixture coverage (OpenAI -> Anthropic `web_search` replay class).
   - Matrix coverage for supported provider switches.

4. **Fallback-path tests**:
   - Compile failure path preserves text continuity and does not fail request.
   - Warning/stats emission is present and payload-safe.

5. **Operational verification**:
   - Structured logs include shape metadata, warning codes, and drop counts.
   - Logs avoid sensitive content (no secrets, no raw provider payload dumps).

Definition of done:

- `bun run test`, `bun run typecheck`, and `bun run lint` pass for replay/compiler changes.
- Incident regression fixture remains green.
- Feature-flag rollback validated in staging/preview.

## Reassessment Triggers

Revisit this ADR if:

1. Provider replay requirements outgrow the current normalized model.
2. Unsupported tool families create unacceptable fallback frequency.
3. Compiler complexity approaches full IR needs, making Option C preferable.
4. AI SDK/provider contract changes invalidate current replay compile assumptions.
