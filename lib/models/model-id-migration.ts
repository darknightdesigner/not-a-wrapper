import type { ModelIdKind } from "./types"

type ModelIdAlias = {
  sourceId: string
  targetId: string
  idKind: Extract<ModelIdKind, "alias">
  verifiedAgainst?: string
  lastVerifiedAt?: string
}

type ModelIdSuccessor = {
  sourceId: string
  targetId: string
  replacementModelId: string
  verifiedAgainst?: string
  lastVerifiedAt?: string
}

const MODEL_ID_ALIASES = [
  {
    sourceId: "deepseek-r1",
    targetId: "openrouter:deepseek/deepseek-r1:free",
    idKind: "alias",
    verifiedAgainst: "openrouter:deepseek/deepseek-r1:free",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "codestral-latest",
    targetId: "codestral-2508",
    idKind: "alias",
    verifiedAgainst: "codestral-2508",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "ministral-3b-latest",
    targetId: "ministral-3b-2512",
    idKind: "alias",
    verifiedAgainst: "ministral-3b-2512",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "ministral-8b-latest",
    targetId: "ministral-8b-2512",
    idKind: "alias",
    verifiedAgainst: "ministral-8b-2512",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "mistral-large-latest",
    targetId: "mistral-large-2512",
    idKind: "alias",
    verifiedAgainst: "mistral-large-2512",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "mistral-small-latest",
    targetId: "mistral-small-2506",
    idKind: "alias",
    verifiedAgainst: "mistral-small-2506",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "pixtral-large-latest",
    targetId: "pixtral-large-2411",
    idKind: "alias",
    verifiedAgainst: "pixtral-large-2411",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "o4-mini",
    targetId: "gpt-5-mini",
    idKind: "alias",
    verifiedAgainst: "gpt-5-mini-2025-08-07",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "claude-sonnet-4-5",
    targetId: "claude-sonnet-4-5-20250929",
    idKind: "alias",
    verifiedAgainst: "claude-sonnet-4-5-20250929",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "claude-haiku-4-5",
    targetId: "claude-haiku-4-5-20251001",
    idKind: "alias",
    verifiedAgainst: "claude-haiku-4-5-20251001",
    lastVerifiedAt: "2026-03-08",
  },
] as const satisfies readonly ModelIdAlias[]

const MODEL_ID_SUCCESSIONS = [
  {
    sourceId: "deepseek-v3",
    targetId: "openrouter:deepseek/deepseek-r1:free",
    replacementModelId: "openrouter:deepseek/deepseek-r1:free",
    verifiedAgainst: "openrouter:deepseek/deepseek-r1:free",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "mistral-small-2503",
    targetId: "mistral-small-2506",
    replacementModelId: "mistral-small-2506",
    verifiedAgainst: "mistral-small-2506",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "sonar-reasoning",
    targetId: "sonar-reasoning-pro",
    replacementModelId: "sonar-reasoning-pro",
    verifiedAgainst: "sonar-reasoning-pro",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "grok-4",
    targetId: "grok-4-0709",
    replacementModelId: "grok-4-0709",
    verifiedAgainst: "grok-4-0709",
    lastVerifiedAt: "2026-03-08",
  },
  {
    sourceId: "gpt-5.2",
    targetId: "gpt-5.4",
    replacementModelId: "gpt-5.4",
    verifiedAgainst: "gpt-5.4-2026-03-05",
    lastVerifiedAt: "2026-03-08",
  },
] as const satisfies readonly ModelIdSuccessor[]

const MODEL_ID_ALIAS_MAP = Object.fromEntries(
  MODEL_ID_ALIASES.map((entry) => [entry.sourceId, entry.targetId])
) as Record<string, string>

const MODEL_ID_SUCCESSOR_MAP = Object.fromEntries(
  MODEL_ID_SUCCESSIONS.map((entry) => [entry.sourceId, entry.targetId])
) as Record<string, string>

export function resolveLegacyAliasModelId(modelId: string): string {
  return MODEL_ID_ALIAS_MAP[modelId] ?? modelId
}

export function resolveCompatibilityModelId(modelId: string): string {
  const aliasResolvedModelId = resolveLegacyAliasModelId(modelId)
  return MODEL_ID_SUCCESSOR_MAP[aliasResolvedModelId] ?? aliasResolvedModelId
}

export function resolveModelId(modelId: string): string {
  return resolveCompatibilityModelId(modelId)
}

export function resolveModelIds(modelIds: readonly string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const modelId of modelIds) {
    const resolved = resolveModelId(modelId)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    normalized.push(resolved)
  }

  return normalized
}
