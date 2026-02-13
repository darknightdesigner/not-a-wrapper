# ADR 004: Provider-Aware History Adapters

- **Status**: Accepted
- **Date**: 2026-02-13
- **Supersedes**: N/A
- **Related plan**: `.agents/plans/provider-aware-history-adaptation.md`

## Context

Cross-provider replay failures in production were caused by provider-specific history invariants (tool pairing, reasoning adjacency, provider-linked IDs) not being represented in a single global sanitizer. The legacy binary approach (`anthropic passthrough`, `everyone else strip`) prevented some failures but discarded useful tool/reasoning context for providers that can safely consume it.

We needed a replay strategy that:

1. Prevents replay-shape errors across providers.
2. Preserves high-value context whenever valid for the target provider.
3. Keeps integration cost low at the `route.ts` conversion boundary.
4. Supports observability and provider-specific evolution.

## Decision

Adopt **Option A: sanitize-on-send with per-provider history adapters**.

Implementation shape:

- Adapt at the `UIMessage[]` layer before `convertToModelMessages()`.
- Route all history through `adaptHistoryForProvider(messages, providerId, context)`.
- Maintain one adapter per provider family (`openai`, `anthropic`, `google`, `openai-compatible`, `text-only`, and `default` fallback).
- Return structured `AdaptationResult` with stats and warnings for observability.

## Why Option A

- **Boundary fit**: integrates directly at the existing `route.ts` message-conversion seam.
- **Provider correctness**: encodes replay invariants where they differ, instead of global lowest-common-denominator stripping.
- **Incremental safety**: keeps post-conversion defenses (`hasProviderLinkedResponseIds`, `toPlainTextModelMessages`).
- **Operability**: emits structured adaptation stats/warnings for production monitoring.

## Rejected Options

### Option B: Dual-track history (canonical + provider-rendered)

Rejected because:

- Significant complexity increase (storage model, cache invalidation, synchronization between tracks).
- Higher risk of divergence bugs where rendered history and canonical history disagree.
- Larger migration and maintenance burden across API, persistence, and UI boundaries.
- Limited near-term value versus Option A for the immediate replay-error class.

### Option C: AST/IR message builders per provider

Rejected because:

- Over-engineering for current needs; introduces a full intermediate representation pipeline.
- High implementation and cognitive cost for contributors.
- Duplicates behavior already handled by AI SDK conversion and provider adapters.
- Slower iteration on provider quirks due to heavier abstraction layers.

## Consequences

Positive:

- Better replay reliability across provider switches.
- Higher context retention than strip-all sanitization.
- Explicit extension point for new providers/models.

Trade-offs:

- Ongoing adapter maintenance as provider contracts evolve.
- Additional test surface (contract + pipeline + cross-provider matrix).

## Reassessment Triggers

Revisit this decision if any of the following occurs:

1. Sustained replay-shape regressions despite adapter updates.
2. AI SDK conversion pipeline changes that make UI-layer adaptation insufficient.
3. New provider requirements demand richer state than `UIMessage[]` can represent.
4. Adapter count/complexity grows enough to justify a shared IR or compiler-style pipeline.
5. Observability shows high warning/drop rates that materially degrade response quality.
