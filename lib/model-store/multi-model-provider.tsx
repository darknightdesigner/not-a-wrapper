"use client"

import { MODEL_DEFAULT } from "@/lib/config"
import { resolveModelIds } from "@/lib/models/model-id-migration"
import { useModel } from "@/lib/model-store/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

type MultiModelContextType = {
  selectedModelIds: string[]
  setSelectedModelIds: (ids: string[]) => void
}

const MultiModelContext = createContext<MultiModelContextType | undefined>(
  undefined
)

/**
 * Provides shared multi-model selection state.
 *
 * When multi-model mode is enabled, both the header selector and the
 * chat input need to read/write the same list of selected model IDs.
 * This context lifts that state above both components so they stay
 * in sync.
 */
export function MultiModelSelectionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { lastUsedModel, setLastUsedModel } = useModel()
  const { preferences } = useUserPreferences()
  const isMultiModelEnabled = preferences.multiModelEnabled

  const [selectedModelIds, setSelectedModelIdsState] = useState<string[]>([])

  // React 19 pattern: sync during render instead of useEffect.
  // Track previous multiModelEnabled to detect toggles.
  const [prevMultiModelEnabled, setPrevMultiModelEnabled] =
    useState(isMultiModelEnabled)

  if (isMultiModelEnabled !== prevMultiModelEnabled) {
    setPrevMultiModelEnabled(isMultiModelEnabled)
    if (!isMultiModelEnabled) {
      // Mode turned off — clear selection
      setSelectedModelIdsState([])
    } else if (selectedModelIds.length === 0) {
      // Mode turned on — seed with last used model
      setSelectedModelIdsState([lastUsedModel || MODEL_DEFAULT])
    }
  }

  // Keep lastUsedModel in sync when selection changes
  const setSelectedModelIds = useCallback(
    (ids: string[]) => {
      const normalizedIds = resolveModelIds(ids)
      setSelectedModelIdsState(normalizedIds)
      if (normalizedIds.length > 0) {
        setLastUsedModel(normalizedIds[0])
      }
    },
    [setLastUsedModel]
  )

  const value = useMemo(
    () => ({ selectedModelIds, setSelectedModelIds }),
    [selectedModelIds, setSelectedModelIds]
  )

  return (
    <MultiModelContext.Provider value={value}>
      {children}
    </MultiModelContext.Provider>
  )
}

export function useMultiModelSelection() {
  const context = useContext(MultiModelContext)
  if (context === undefined) {
    throw new Error(
      "useMultiModelSelection must be used within a MultiModelSelectionProvider"
    )
  }
  return context
}
