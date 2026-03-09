import { getModelInfo } from "@/lib/models"
import { resolveModelId } from "@/lib/models/model-id-migration"
import type { Provider } from "./types"

export function getProviderForModel(model: string): Provider {
  const resolvedModel = resolveModelId(model)

  if (resolvedModel.startsWith("openrouter:")) {
    return "openrouter"
  }

  const provider = getModelInfo(resolvedModel)?.providerId
  if (provider) return provider

  throw new Error(`Unknown provider for model: ${resolvedModel}`)
}
