"use client"

import { MultiModelConversation } from "@/app/components/multi-chat/multi-conversation"
import { useFileUpload } from "@/app/components/chat/use-file-upload"
import { toast } from "@/components/ui/toast"
import { convertAttachmentsToFiles } from "@/lib/ai/message-conversion"
import { getOrCreateGuestUserId } from "@/lib/api"
import { useChats } from "@/lib/chat-store/chats/provider"
import { ExtendedUIMessage, useMessages } from "@/lib/chat-store/messages/provider"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { useModel } from "@/lib/model-store/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { cn } from "@/lib/utils"
import { UIMessage as MessageType } from "@ai-sdk/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MultiChatInput } from "./multi-chat-input"
import { useMultiChat } from "./use-multi-chat"

// Extended message type that includes model property added by backend
type MessageWithModel = MessageType & {
  model?: string
}

type GroupedMessage = {
  userMessage: MessageType
  responses: {
    model: string
    message: MessageType
    isLoading?: boolean
    provider: string
  }[]
  onDelete: (model: string, id: string) => void
  onEdit: (model: string, id: string, newText: string) => void
  onReload: (model: string) => void
}

// v5 helper: Extract text content from UIMessage parts array
function getMessageText(message: MessageType): string {
  const textPart = message.parts?.find((p) => p.type === "text")
  return (textPart as { text?: string })?.text || ""
}

export function MultiChat() {
  const [prompt, setPrompt] = useState("")
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [multiChatId, setMultiChatId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { user } = useUser()
  const { models } = useModel()
  const { preferences } = useUserPreferences()
  const {
    files,
    setFiles,
    handleFileUploads,
    handleFileUpload,
    handleFileRemove,
  } = useFileUpload()
  const { chatId } = useChatSession()
  const { messages: persistedMessages, isLoading: messagesLoading, cacheAndAddMessage } =
    useMessages()
  const { createNewChat } = useChats()

  const availableModels = useMemo(() => {
    return models.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
    }))
  }, [models])

  const modelsFromPersisted = useMemo(() => {
    return persistedMessages
      .filter((msg) => (msg as MessageWithModel).model)
      .map((msg) => (msg as MessageWithModel).model as string)
  }, [persistedMessages])

  const modelsFromLastGroup = useMemo(() => {
    const userMessages = persistedMessages.filter((msg) => msg.role === "user")
    if (userMessages.length === 0) return []

    const lastUserMessage = userMessages[userMessages.length - 1]
    const lastUserIndex = persistedMessages.indexOf(lastUserMessage)

    const modelsInLastGroup: string[] = []
    for (let i = lastUserIndex + 1; i < persistedMessages.length; i++) {
      const msg = persistedMessages[i] as MessageWithModel
      if (msg.role === "user") break
      if (msg.role === "assistant" && msg.model) {
        modelsInLastGroup.push(msg.model)
      }
    }
    return modelsInLastGroup
  }, [persistedMessages])

  const allModelsToMaintain = useMemo(() => {
    const combined = [...new Set([...selectedModelIds, ...modelsFromPersisted])]
    return availableModels.filter((model) => combined.includes(model.id))
  }, [availableModels, selectedModelIds, modelsFromPersisted])

  const selectedModels = useMemo(
    () =>
      selectedModelIds
        .map((id) => models.find((model) => model.id === id))
        .filter(Boolean),
    [selectedModelIds, models]
  )

  const fileUploadState = useMemo<"supported" | "unsupported" | "no-selection">(
    () => {
      if (selectedModelIds.length === 0) return "no-selection"
      if (selectedModels.length !== selectedModelIds.length) return "unsupported"
      return selectedModels.every((model) => model?.vision)
        ? "supported"
        : "unsupported"
    },
    [selectedModelIds.length, selectedModels]
  )

  const fileUploadModelId = selectedModels[0]?.id

  useEffect(() => {
    if (selectedModelIds.length === 0 && modelsFromLastGroup.length > 0) {
      setSelectedModelIds(modelsFromLastGroup)
    }
  }, [selectedModelIds.length, modelsFromLastGroup])

  // Refs to avoid stale closures in onFinish callback (stream may finish after chatId/groupId change)
  const chatIdRef = useRef<string | null>(multiChatId || chatId)
  const messageGroupIdRef = useRef<string | null>(null)

  // Ref to track previous chatId for navigation detection
  const prevNavChatIdRef = useRef<string | null>(chatId)

  // Maps message text → messageGroupId so live useChat messages resolve to
  // the same group key as persisted messages (which use UUID-based keys).
  const textToGroupIdRef = useRef<Map<string, string>>(new Map())

  // Keep chatIdRef in sync with reactive state
  useEffect(() => {
    chatIdRef.current = multiChatId || chatId
  }, [multiChatId, chatId])

  // Clean up textToGroupIdRef entries once persisted — the bridge is no longer needed
  useEffect(() => {
    const map = textToGroupIdRef.current
    if (map.size === 0) return
    const persistedGroupIds = new Set(
      persistedMessages
        .filter((msg) => msg.messageGroupId)
        .map((msg) => msg.messageGroupId)
    )
    for (const [text, groupId] of map) {
      if (persistedGroupIds.has(groupId)) {
        map.delete(text)
      }
    }
  }, [persistedMessages])

  // Callback invoked when each model's stream finishes — persists the assistant response
  const handleModelFinish = useCallback((modelId: string, message: MessageType) => {
    const effectiveChatId = chatIdRef.current
    const effectiveGroupId = messageGroupIdRef.current
    if (!effectiveChatId) return

    const persistedMessage: ExtendedUIMessage = {
      ...message,
      model: modelId,
      messageGroupId: effectiveGroupId ?? undefined,
    }

    cacheAndAddMessage(persistedMessage, effectiveChatId)
  }, [cacheAndAddMessage])

  const modelChats = useMultiChat(allModelsToMaintain, handleModelFinish)

  // Ref to latest modelChats to avoid stale closures in the navigation effect
  // (modelChats changes every stream chunk, which would cause the effect to re-fire)
  const modelChatsRef = useRef(modelChats)
  modelChatsRef.current = modelChats

  // Handle chat transitions: stop all active streams and reset state when navigating away
  useEffect(() => {
    const prevChatId = prevNavChatIdRef.current
    prevNavChatIdRef.current = chatId

    // Only act when chatId actually changed
    if (prevChatId === chatId) return

    // Stop all active model streams and clear their messages
    if (prevChatId !== null) {
      modelChatsRef.current.forEach((chat) => {
        chat.stop()
        chat.setMessages([])
      })
    }

    // When navigating to home, reset all local state
    if (chatId === null) {
      setMultiChatId(null)
      messageGroupIdRef.current = null
      textToGroupIdRef.current.clear()
    }
  }, [chatId])

  const systemPrompt = useMemo(
    () => user?.system_prompt || SYSTEM_PROMPT_DEFAULT,
    [user?.system_prompt]
  )
  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])

  const createPersistedGroups = useCallback(() => {
    const persistedGroups: { [key: string]: GroupedMessage } = {}

    if (persistedMessages.length === 0) return persistedGroups

    const groups: {
      [key: string]: {
        userMessage: MessageType
        assistantMessages: MessageType[]
      }
    } = {}

    for (let i = 0; i < persistedMessages.length; i++) {
      const message = persistedMessages[i]

      if (message.role === "user") {
        // Prefer messageGroupId for grouping; fall back to text content for backward compat
        const groupKey = message.messageGroupId || getMessageText(message)
        if (!groups[groupKey]) {
          groups[groupKey] = {
            userMessage: message,
            assistantMessages: [],
          }
        }
      } else if (message.role === "assistant") {
        const modelId = (message as MessageWithModel).model
        // If the assistant message has a messageGroupId, use it to find its group directly
        const msgGroupId = message.messageGroupId
        if (msgGroupId && groups[msgGroupId]) {
          const isDuplicate = groups[msgGroupId].assistantMessages.some(
            (existing) => existing.id === message.id ||
              (modelId && (existing as MessageWithModel).model === modelId)
          )
          if (!isDuplicate) {
            groups[msgGroupId].assistantMessages.push(message)
          }
        } else {
          // Fallback: scan backward for the nearest user message
          let associatedUserMessage: (typeof persistedMessages)[number] | null = null
          for (let j = i - 1; j >= 0; j--) {
            if (persistedMessages[j].role === "user") {
              associatedUserMessage = persistedMessages[j]
              break
            }
          }

          if (associatedUserMessage) {
            const groupKey = associatedUserMessage.messageGroupId || getMessageText(associatedUserMessage)
            if (!groups[groupKey]) {
              groups[groupKey] = {
                userMessage: associatedUserMessage,
                assistantMessages: [],
              }
            }
            const isDuplicateFb = groups[groupKey].assistantMessages.some(
              (existing) => existing.id === message.id ||
                (modelId && (existing as MessageWithModel).model === modelId)
            )
            if (!isDuplicateFb) {
              groups[groupKey].assistantMessages.push(message)
            }
          }
        }
      }
    }

    Object.entries(groups).forEach(([groupKey, group]) => {
      if (group.userMessage) {
        persistedGroups[groupKey] = {
          userMessage: group.userMessage,
          responses: group.assistantMessages.map((msg, index) => {
            const model =
              (msg as MessageWithModel).model || selectedModelIds[index] || `model-${index}`
            const provider =
              models.find((m) => m.id === model)?.provider || "unknown"

            return {
              model,
              message: msg,
              isLoading: false,
              provider,
            }
          }),
          onDelete: () => {},
          onEdit: () => {},
          onReload: () => {},
        }
      }
    })

    return persistedGroups
  }, [persistedMessages, selectedModelIds, models])

  const messageGroups = useMemo(() => {
    const persistedGroups = createPersistedGroups()
    const liveGroups = { ...persistedGroups }

    modelChats.forEach((chat) => {
      for (let i = 0; i < chat.messages.length; i += 2) {
        const userMsg = chat.messages[i]
        const assistantMsg = chat.messages[i + 1]

        if (userMsg?.role === "user") {
          const messageText = getMessageText(userMsg)
          // Resolve to the UUID-based key used by persisted groups so
          // live and persisted data merge into a single group.
          const groupKey = textToGroupIdRef.current.get(messageText) || messageText

          if (!liveGroups[groupKey]) {
            liveGroups[groupKey] = {
              userMessage: userMsg,
              responses: [],
              onDelete: () => {},
              onEdit: () => {},
              onReload: () => {},
            }
          }

          if (assistantMsg?.role === "assistant") {
            const existingResponse = liveGroups[groupKey].responses.find(
              (r) => r.model === chat.model.id
            )

            if (!existingResponse) {
              liveGroups[groupKey].responses.push({
                model: chat.model.id,
                message: assistantMsg,
                isLoading: false,
                provider: chat.model.provider,
              })
            }
          } else if (
            chat.isLoading &&
            getMessageText(userMsg) === prompt &&
            selectedModelIds.includes(chat.model.id)
          ) {
            const placeholderMessage: MessageType = {
              id: `loading-${chat.model.id}`,
              role: "assistant",
              parts: [{ type: "text", text: "" }],
            }
            liveGroups[groupKey].responses.push({
              model: chat.model.id,
              message: placeholderMessage,
              isLoading: true,
              provider: chat.model.provider,
            })
          }
        }
      }
    })

    return Object.values(liveGroups)
  }, [createPersistedGroups, modelChats, prompt, selectedModelIds])

  const handleSubmit = useCallback(async (overridePrompt?: string) => {
    const promptToSend = (overridePrompt ?? prompt).trim()
    if (!promptToSend) return

    if (selectedModelIds.length === 0) {
      toast({
        title: "No models selected",
        description: "Please select at least one model to chat with.",
        status: "error",
      })
      return
    }

    if (files.length > 0 && fileUploadState !== "supported") {
      toast({
        title: "File uploads unavailable",
        description: "All selected models must support file uploads.",
        status: "error",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const uid = await getOrCreateGuestUserId(user)
      if (!uid) return

      const message_group_id = crypto.randomUUID()

      // Track text→groupId so the live grouping loop uses the same key
      // as createPersistedGroups (which keys by messageGroupId/UUID).
      textToGroupIdRef.current.set(promptToSend, message_group_id)

      let chatIdToUse = multiChatId || chatId
      if (!chatIdToUse) {
        const createdChat = await createNewChat(
          uid,
          promptToSend,
          selectedModelIds[0],
          !!user?.id
        )
        if (!createdChat) {
          throw new Error("Failed to create chat")
        }
        chatIdToUse = createdChat.id
        setMultiChatId(chatIdToUse)
        window.history.pushState(null, "", `/c/${chatIdToUse}`)
      }

      // Update refs so the onFinish callback captures the correct values
      chatIdRef.current = chatIdToUse
      messageGroupIdRef.current = message_group_id

      // Persist the user message to Convex before dispatching to models
      const userMessage: ExtendedUIMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        parts: [{ type: "text", text: promptToSend }],
        messageGroupId: message_group_id,
      }
      cacheAndAddMessage(userMessage, chatIdToUse)

      const selectedChats = modelChats.filter((chat) =>
        selectedModelIds.includes(chat.model.id)
      )

      let attachments: Array<{ name: string; contentType: string; url: string }> =
        []
      if (files.length > 0) {
        const uploaded = await handleFileUploads(chatIdToUse)
        if (uploaded === null) {
          setIsSubmitting(false)
          return
        }
        attachments = uploaded
      }

      await Promise.all(
        selectedChats.map(async (chat) => {
          const options = {
            body: {
              chatId: chatIdToUse,
              userId: uid,
              model: chat.model.id,
              isAuthenticated: !!user?.id,
              systemPrompt: systemPrompt,
              enableSearch: false,
              message_group_id,
            },
          }

          // v5: Use sendMessage instead of append
          chat.sendMessage(
            {
              text: promptToSend,
              files: attachments.length
                ? convertAttachmentsToFiles(attachments)
                : undefined,
            },
            options
          )
        })
      )

      setPrompt("")
      setFiles([])
    } catch (error) {
      console.error("Failed to send message:", error)
      toast({
        title: "Failed to send message",
        description: "Please try again.",
        status: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    prompt,
    selectedModelIds,
    user,
    modelChats,
    systemPrompt,
    multiChatId,
    chatId,
    createNewChat,
    files,
    handleFileUploads,
    fileUploadState,
    setFiles,
    cacheAndAddMessage,
  ])

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      handleSubmit(suggestion)
    },
    [handleSubmit]
  )

  const handleStop = useCallback(() => {
    modelChats.forEach((chat) => {
      if (chat.isLoading && selectedModelIds.includes(chat.model.id)) {
        chat.stop()
      }
    })
  }, [modelChats, selectedModelIds])

  const anyLoading = useMemo(
    () =>
      modelChats.some(
        (chat) => chat.isLoading && selectedModelIds.includes(chat.model.id)
      ),
    [modelChats, selectedModelIds]
  )

  const conversationProps = useMemo(() => ({ messageGroups }), [messageGroups])

  const inputProps = useMemo(
    () => ({
      value: prompt,
      onValueChange: setPrompt,
      onSuggestion: handleSuggestion,
      hasSuggestions: preferences.promptSuggestions && messageGroups.length === 0,
      onSend: handleSubmit,
      isSubmitting,
      files,
      onFileUpload: handleFileUpload,
      onFileRemove: handleFileRemove,
      selectedModelIds,
      onSelectedModelIdsChange: setSelectedModelIds,
      isUserAuthenticated: isAuthenticated,
      fileUploadState,
      fileUploadModelId,
      stop: handleStop,
      status: anyLoading ? ("streaming" as const) : ("ready" as const),
      anyLoading,
    }),
    [
      prompt,
      handleSubmit,
      handleSuggestion,
      preferences.promptSuggestions,
      messageGroups.length,
      isSubmitting,
      files,
      handleFileUpload,
      handleFileRemove,
      selectedModelIds,
      isAuthenticated,
      fileUploadState,
      fileUploadModelId,
      handleStop,
      anyLoading,
    ]
  )

  const showOnboarding = messageGroups.length === 0 && !messagesLoading

  return (
    <div
      className={cn(
        "@container/main relative flex h-full flex-col items-center",
        showOnboarding ? "justify-end md:justify-center" : "justify-end"
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {showOnboarding ? (
          <motion.div
            key="onboarding"
            className="absolute bottom-[60%] mx-auto max-w-[50rem] md:relative md:bottom-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            layout="position"
            layoutId="onboarding"
            transition={{ layout: { duration: 0 } }}
          >
            <h1 className="mb-6 text-3xl font-medium tracking-tight">
              What&apos;s on your mind?
            </h1>
          </motion.div>
        ) : (
          <motion.div
            key="conversation"
            className="w-full flex-1 overflow-hidden"
            layout="position"
            layoutId="conversation"
            transition={{
              layout: { duration: messageGroups.length === 1 ? 0.3 : 0 },
            }}
          >
            <MultiModelConversation {...conversationProps} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={cn(
          "z-50 mx-auto w-full max-w-3xl",
          showOnboarding ? "relative" : "absolute right-0 bottom-0 left-0"
        )}
        layout="position"
        layoutId="multi-chat-input-container"
        transition={{
          layout: { duration: messageGroups.length === 1 ? 0.3 : 0 },
        }}
      >
        <MultiChatInput {...inputProps} />
      </motion.div>
    </div>
  )
}
