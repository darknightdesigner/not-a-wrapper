import { ModelConfig } from "@/lib/models/types"

/**
 * Curated default model order for the model selector.
 * Models in this list appear first, in the exact order specified.
 * Models not in this list preserve their original array-declaration order.
 */
export const DEFAULT_MODEL_ORDER: string[] = [
  // Top 3 Anthropic (most recent first)
  "claude-opus-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  // Top 3 OpenAI (most recent first)
  "gpt-5.2",
  "o4-mini",
  "gpt-5",
  // Top 1 Google
  "gemini-3-pro-preview",
  // Top 1 Grok
  "grok-4-1-fast-reasoning",
  // Remaining popular models
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gpt-5-mini",
  "deepseek-r1",
  "grok-4",
  "mistral-large-latest",
  "pixtral-large-latest",
]

/**
 * Utility function to filter and sort models based on favorites, search, and visibility
 * @param models - All available models
 * @param favoriteModels - Array of favorite model IDs
 * @param searchQuery - Search query to filter by model name
 * @param isModelHidden - Function to check if a model is hidden
 * @returns Filtered and sorted models
 */
export function filterAndSortModels(
  models: ModelConfig[],
  favoriteModels: string[],
  searchQuery: string,
  isModelHidden: (modelId: string) => boolean
): ModelConfig[] {
  return models
    .filter((model) => !isModelHidden(model.id))
    .filter((model) => {
      // If user has favorite models, only show favorites
      if (favoriteModels && favoriteModels.length > 0) {
        return favoriteModels.includes(model.id)
      }
      // If no favorites, show all models
      return true
    })
    .filter((model) =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // If user has favorite models, maintain their order
      if (favoriteModels && favoriteModels.length > 0) {
        const aIndex = favoriteModels.indexOf(a.id)
        const bIndex = favoriteModels.indexOf(b.id)
        return aIndex - bIndex
      }

      // Fallback: curated showcase order
      const aOrder = DEFAULT_MODEL_ORDER.indexOf(a.id)
      const bOrder = DEFAULT_MODEL_ORDER.indexOf(b.id)
      const aInList = aOrder !== -1
      const bInList = bOrder !== -1

      if (aInList && bInList) return aOrder - bOrder
      if (aInList) return -1
      if (bInList) return 1
      return 0 // preserve original array-declaration order
    })
}
