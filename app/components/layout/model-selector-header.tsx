"use client"

import { ModelSelector } from "@/components/common/model-selector/base"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { useMultiModelSelection } from "@/lib/model-store/multi-model-provider"
import { resolvePreferredModelId } from "@/lib/model-store/utils"
import { useModel } from "@/lib/model-store/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { useCallback, useMemo } from "react"

/**
 * Header-level model selector that adapts to single or multi-model mode.
 *
 * - Single-model mode: Shows the current chat's persisted model (when inside
 *   a thread) or the user's last-used model (on the home/new-chat page).
 *   Changing the model persists to both the chat record and localStorage.
 * - Multi-model mode: Selects multiple models via shared
 *   `MultiModelSelectionProvider`, keeping the header and input area in sync.
 */
export function ModelSelectorHeader() {
  const { models, lastUsedModel, setLastUsedModel, favoriteModels } = useModel()
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const isMultiModelEnabled = preferences.multiModelEnabled
  const { selectedModelIds, setSelectedModelIds } = useMultiModelSelection()

  const { chatId } = useChatSession()
  const { getChatById, updateChatModel } = useChats()

  const currentChat = useMemo(
    () => (chatId ? getChatById(chatId) : null),
    [chatId, getChatById]
  )

  const isAuthenticated = !!user?.id

  const effectiveModel = useMemo(
    () =>
      resolvePreferredModelId({
        models,
        isAuthenticated,
        currentModelId: currentChat?.model,
        preferredModelIds: [
          lastUsedModel,
          favoriteModels[0],
        ],
      }),
    [currentChat?.model, favoriteModels, isAuthenticated, lastUsedModel, models]
  )

  const handleSingleModelChange = useCallback(
    (modelId: string) => {
      setLastUsedModel(modelId)

      if (chatId && user?.id) {
        updateChatModel(chatId, modelId).catch((err) =>
          console.error("Failed to update chat model:", err)
        )
      }
    },
    [setLastUsedModel, chatId, user?.id, updateChatModel]
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
