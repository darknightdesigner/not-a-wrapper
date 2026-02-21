"use client"

import { ModelSelector } from "@/components/common/model-selector/base"
import { MODEL_DEFAULT } from "@/lib/config"
import { useMultiModelSelection } from "@/lib/model-store/multi-model-provider"
import { useModel } from "@/lib/model-store/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { useCallback, useMemo } from "react"

/**
 * Header-level model selector that adapts to single or multi-model mode.
 *
 * - Single-model mode: Selects one active model via `lastUsedModel`.
 * - Multi-model mode: Selects multiple models via shared
 *   `MultiModelSelectionProvider`, keeping the header and input area in sync.
 */
export function ModelSelectorHeader() {
  const { lastUsedModel, setLastUsedModel, favoriteModels } = useModel()
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const isMultiModelEnabled = preferences.multiModelEnabled
  const { selectedModelIds, setSelectedModelIds } = useMultiModelSelection()

  const isAuthenticated = !!user?.id

  const effectiveModel = useMemo(
    () => lastUsedModel || favoriteModels[0] || MODEL_DEFAULT,
    [lastUsedModel, favoriteModels]
  )

  const handleSingleModelChange = useCallback(
    (modelId: string) => {
      setLastUsedModel(modelId)
    },
    [setLastUsedModel]
  )

  if (isMultiModelEnabled) {
    return (
      <ModelSelector
        mode="multi"
        selectedModelIds={selectedModelIds}
        setSelectedModelIds={setSelectedModelIds}
        isUserAuthenticated={isAuthenticated}
      />
    )
  }

  return (
    <ModelSelector
      mode="single"
      selectedModelId={effectiveModel}
      setSelectedModelId={handleSingleModelChange}
      isUserAuthenticated={isAuthenticated}
    />
  )
}
