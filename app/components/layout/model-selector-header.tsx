"use client"

import { ModelSelector } from "@/components/common/model-selector/base"
import { MODEL_DEFAULT } from "@/lib/config"
import { useModel } from "@/lib/model-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { useCallback, useMemo } from "react"

/**
 * Header-level model selector for single-model mode.
 *
 * Displays the currently-selected model and allows switching via the shared
 * `ModelSelector` dropdown. Unlike the chat-input selector, this component
 * operates outside of a chat context — it reads/writes `lastUsedModel` from
 * the global `ModelProvider` rather than persisting to a specific chat record.
 */
export function ModelSelectorHeader() {
  const { lastUsedModel, setLastUsedModel, favoriteModels } = useModel()
  const { user } = useUser()

  const isAuthenticated = !!user?.id

  // Effective model follows the same priority as use-model.ts but without
  // chat-level override: lastUsedModel > first favorite > default.
  const effectiveModel = useMemo(
    () => lastUsedModel || favoriteModels[0] || MODEL_DEFAULT,
    [lastUsedModel, favoriteModels]
  )

  const handleModelChange = useCallback(
    (modelId: string) => {
      setLastUsedModel(modelId)
    },
    [setLastUsedModel]
  )

  return (
    <ModelSelector
      mode="single"
      selectedModelId={effectiveModel}
      setSelectedModelId={handleModelChange}
      isUserAuthenticated={isAuthenticated}
    />
  )
}
