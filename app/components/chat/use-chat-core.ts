import { syncRecentMessages } from "@/app/components/chat/syncRecentMessages"
import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { toast } from "@/components/ui/toast"
import { convertAttachmentsToFiles } from "@/lib/ai/message-conversion"
import { getOrCreateGuestUserId } from "@/lib/api"
import { useChats } from "@/lib/chat-store/chats/provider"
import { MESSAGE_MAX_LENGTH, SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { Attachment } from "@/lib/file-handling"
import { API_ROUTE_CHAT } from "@/lib/routes"
import type { UserProfile } from "@/lib/user/types"
import type { UIMessage } from "@ai-sdk/react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// Extended UIMessage type for optimistic updates that includes createdAt
type OptimisticUIMessage = UIMessage & { createdAt?: Date }

type UseChatCoreProps = {
  initialMessages: UIMessage[]
  draftValue: string
  /** Cache message locally and persist to Convex. Pass overrideChatId to handle stale closures during chat creation. */
  cacheAndAddMessage: (message: UIMessage, overrideChatId?: string) => void
  chatId: string | null
  user: UserProfile | null
  files: File[]
  createOptimisticAttachments: (
    files: File[]
  ) => Array<{ name: string; contentType: string; url: string }>
  setFiles: (files: File[]) => void
  checkLimitsAndNotify: (uid: string) => Promise<boolean>
  cleanupOptimisticAttachments: (attachments?: Array<{ url?: string }>) => void
  ensureChatExists: (uid: string, input: string) => Promise<string | null>
  handleFileUploads: (chatId: string) => Promise<Attachment[] | null>
  selectedModel: string
  clearDraft: () => void
  bumpChat: (chatId: string) => void
  deleteMessagesFromTimestamp: (timestamp: number) => Promise<void>
}

export function useChatCore({
  initialMessages,
  draftValue,
  cacheAndAddMessage,
  chatId,
  user,
  files,
  createOptimisticAttachments,
  setFiles,
  checkLimitsAndNotify,
  cleanupOptimisticAttachments,
  ensureChatExists,
  handleFileUploads,
  selectedModel,
  clearDraft,
  bumpChat,
  deleteMessagesFromTimestamp,
}: UseChatCoreProps) {
  // State management
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasDialogAuth, setHasDialogAuth] = useState(false)
  const [enableSearch, setEnableSearch] = useState(false)

  // State for tracking first message sent (prevents redirect after sending)
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)
  const prevChatIdRef = useRef<string | null>(chatId)
  const hydratedChatIdRef = useRef<string | null>(null)
  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])
  const systemPrompt = useMemo(
    () => user?.system_prompt || SYSTEM_PROMPT_DEFAULT,
    [user?.system_prompt]
  )

  // Search params handling
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt")

  // Manual input state management (v6 no longer returns input/setInput from useChat)
  const [input, setInput] = useState(draftValue || "")

  // Chats operations
  const { updateTitle } = useChats()

  // Handle errors directly in onError callback
  const handleError = useCallback((error: Error) => {
    console.error("Chat error:", error)
    console.error("Error message:", error.message)
    let errorMsg = error.message || "Something went wrong."

    if (errorMsg === "An error occurred" || errorMsg === "fetch failed") {
      errorMsg = "Something went wrong. Please try again."
    }

    toast({
      title: errorMsg,
      status: "error",
    })
  }, [])

  // Memoized transport for v6
  const transport = useMemo(
    () => new DefaultChatTransport({ api: API_ROUTE_CHAT }),
    []
  )

  // Initialize useChat with v6 API
  const {
    messages,
    sendMessage,
    regenerate,
    status,
    error,
    stop,
    setMessages,
  } = useChat({
    transport,
    messages: initialMessages,

    onFinish: async ({ message, isAbort, isError }) => {
      // Skip processing for aborted or errored responses
      if (isAbort || isError) return

      // Use effectiveChatId to handle stale closures during chat creation
      const effectiveChatId =
        chatId ||
        prevChatIdRef.current ||
        (typeof window !== "undefined"
          ? localStorage.getItem("guestChatId")
          : null)

      if (effectiveChatId) {
        cacheAndAddMessage(message, effectiveChatId)
      }

      try {
        if (!effectiveChatId) return
        await syncRecentMessages(effectiveChatId, setMessages, 2)
      } catch (error) {
        console.error("Message ID reconciliation failed: ", error)
      }
    },

    onError: handleError,
  })

  useEffect(() => {
    if (!chatId) return

    const isNewChat = hydratedChatIdRef.current !== chatId
    if (isNewChat) {
      setMessages(initialMessages)
      hydratedChatIdRef.current = chatId
      return
    }

    if (messages.length === 0 && initialMessages.length > 0) {
      setMessages(initialMessages)
    }
  }, [chatId, initialMessages, messages.length, setMessages])

  // Handle search params on mount
  useEffect(() => {
    if (prompt && typeof window !== "undefined") {
      requestAnimationFrame(() => setInput(prompt))
    }
  }, [prompt, setInput])

  // Reset messages when navigating from a chat to home
  useEffect(() => {
    if (
      prevChatIdRef.current !== null &&
      chatId === null &&
      messages.length > 0
    ) {
      setMessages([])
    }
    prevChatIdRef.current = chatId
  }, [chatId, messages.length, setMessages])

  // Submit action
  const submit = useCallback(async () => {
    setIsSubmitting(true)

    const uid = await getOrCreateGuestUserId(user)
    if (!uid) {
      setIsSubmitting(false)
      return
    }

    // Capture current input value before clearing
    const currentInput = input

    const optimisticId = `optimistic-${Date.now().toString()}`
    const optimisticAttachments =
      files.length > 0 ? createOptimisticAttachments(files) : []

    // Create optimistic message with v5 parts format (includes createdAt for app compatibility)
    const optimisticMessage: OptimisticUIMessage = {
      id: optimisticId,
      role: "user",
      createdAt: new Date(),
      parts: [
        { type: "text", text: currentInput },
        ...(optimisticAttachments.map((att) => ({
          type: "file" as const,
          filename: att.name,
          mediaType: att.contentType,
          url: att.url,
        }))),
      ],
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setInput("")

    const submittedFiles = [...files]
    setFiles([])

    // Helper to extract file URLs from parts for cleanup
    const getFileUrlsFromParts = () =>
      optimisticMessage.parts
        ?.filter((p) => p.type === "file")
        .map((p) => ({ url: (p as { url?: string }).url })) || []

    try {
      const allowed = await checkLimitsAndNotify(uid)
      if (!allowed) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        cleanupOptimisticAttachments(getFileUrlsFromParts())
        return
      }

      const currentChatId = await ensureChatExists(uid, currentInput)
      if (!currentChatId) {
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
        cleanupOptimisticAttachments(getFileUrlsFromParts())
        return
      }

      prevChatIdRef.current = currentChatId

      if (currentInput.length > MESSAGE_MAX_LENGTH) {
        toast({
          title: `The message you submitted was too long, please submit something shorter. (Max ${MESSAGE_MAX_LENGTH} characters)`,
          status: "error",
        })
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
        cleanupOptimisticAttachments(getFileUrlsFromParts())
        return
      }

      let attachments: Attachment[] | null = []
      if (submittedFiles.length > 0) {
        attachments = await handleFileUploads(currentChatId)
        if (attachments === null) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          cleanupOptimisticAttachments(getFileUrlsFromParts())
          return
        }
      }

      // v6: Use sendMessage with text and files, options in second param
      sendMessage(
        {
          text: currentInput,
          files: attachments?.length
            ? convertAttachmentsToFiles(attachments)
            : undefined,
        },
        {
          body: {
            chatId: currentChatId,
            userId: uid,
            model: selectedModel,
            isAuthenticated,
            systemPrompt: systemPrompt || SYSTEM_PROMPT_DEFAULT,
            enableSearch,
          },
        }
      )

      setHasSentFirstMessage(true) // Prevent redirect during chat creation
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
      cleanupOptimisticAttachments(getFileUrlsFromParts())
      // Pass currentChatId explicitly to handle stale closures during chat creation
      cacheAndAddMessage(optimisticMessage, currentChatId)
      clearDraft()

      if (messages.length > 0) {
        bumpChat(currentChatId)
      }
    } catch {
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
      cleanupOptimisticAttachments(getFileUrlsFromParts())
      toast({ title: "Failed to send message", status: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    user,
    files,
    createOptimisticAttachments,
    input,
    setMessages,
    setFiles,
    checkLimitsAndNotify,
    cleanupOptimisticAttachments,
    ensureChatExists,
    handleFileUploads,
    selectedModel,
    isAuthenticated,
    systemPrompt,
    enableSearch,
    sendMessage,
    cacheAndAddMessage,
    clearDraft,
    messages.length,
    bumpChat,
  ])

  const submitEdit = useCallback(
    async (messageId: string, newContent: string) => {
      // Block edits while sending/streaming
      if (isSubmitting || status === "submitted" || status === "streaming") {
        toast({
          title: "Please wait until the current message finishes sending.",
          status: "error",
        })
        return
      }

      if (!newContent.trim()) return

      if (!chatId) {
        toast({ title: "Missing chat.", status: "error" })
        return
      }

      // Find edited message
      const editIndex = messages.findIndex(
        (m) => String(m.id) === String(messageId)
      )
      if (editIndex === -1) {
        toast({ title: "Message not found", status: "error" })
        return
      }

      const target = messages[editIndex] as OptimisticUIMessage
      const cutoffTimestamp = target?.createdAt?.getTime()
      if (!cutoffTimestamp) {
        console.error("Unable to locate message timestamp.")
        return
      }

      if (newContent.length > MESSAGE_MAX_LENGTH) {
        toast({
          title: `The message you submitted was too long, please submit something shorter. (Max ${MESSAGE_MAX_LENGTH} characters)`,
          status: "error",
        })
        return
      }

      // Store original messages for potential rollback
      const originalMessages = [...messages]

      const optimisticId = `optimistic-edit-${Date.now().toString()}`

      // Extract file parts from target message for the edited message
      const targetFileParts =
        target.parts?.filter((p) => p.type === "file") || []

      // Create optimistic message with v5 parts format (includes createdAt for app compatibility)
      const optimisticEditedMessage: OptimisticUIMessage = {
        id: optimisticId,
        role: "user",
        createdAt: new Date(),
        parts: [{ type: "text", text: newContent }, ...targetFileParts],
      }

      try {
        const trimmedMessages = messages.slice(0, editIndex)
        setMessages([...trimmedMessages, optimisticEditedMessage])

        // Get user validation first (before any permanent deletions)
        const uid = await getOrCreateGuestUserId(user)
        if (!uid) {
          setMessages(originalMessages)
          toast({ title: "Please sign in and try again.", status: "error" })
          return
        }

        const allowed = await checkLimitsAndNotify(uid)
        if (!allowed) {
          setMessages(originalMessages)
          return
        }

        const currentChatId = await ensureChatExists(uid, newContent)
        if (!currentChatId) {
          setMessages(originalMessages)
          return
        }

        prevChatIdRef.current = currentChatId

        // Only persist deletions AFTER all validation passes
        // This prevents data loss if the edit is rejected
        try {
          const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
          await writeToIndexedDB("messages", {
            id: chatId,
            messages: trimmedMessages,
          })
        } catch {}

        // Delete messages from the edit point in Convex database
        // This ensures subsequent messages are removed from persistent storage
        await deleteMessagesFromTimestamp(cutoffTimestamp)

        // If this is an edit of the very first user message, update chat title
        if (editIndex === 0 && target.role === "user") {
          try {
            await updateTitle(currentChatId, newContent)
          } catch {}
        }

        // v5: Use sendMessage instead of append
        // First truncate messages to the edit point
        setMessages(trimmedMessages)

        // Convert target file parts to the format expected by sendMessage
        const targetFiles = targetFileParts.map((p) => ({
          type: "file" as const,
          filename: (p as { filename?: string }).filename || "file",
          mediaType: (p as { mediaType?: string }).mediaType || "application/octet-stream",
          url: (p as { url?: string }).url || "",
        }))

        sendMessage(
          {
            text: newContent,
            files: targetFiles.length > 0 ? targetFiles : undefined,
          },
          {
            body: {
              chatId: currentChatId,
              userId: uid,
              model: selectedModel,
              isAuthenticated,
              systemPrompt: systemPrompt || SYSTEM_PROMPT_DEFAULT,
              enableSearch,
            },
          }
        )

        // Remove optimistic message (sendMessage will add the real one)
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))

        bumpChat(currentChatId)
      } catch (error) {
        console.error("Edit failed:", error)
        setMessages(originalMessages)
        toast({ title: "Failed to apply edit", status: "error" })
      }
    },
    [
      chatId,
      messages,
      user,
      checkLimitsAndNotify,
      ensureChatExists,
      selectedModel,
      isAuthenticated,
      systemPrompt,
      enableSearch,
      sendMessage,
      setMessages,
      bumpChat,
      updateTitle,
      isSubmitting,
      status,
      deleteMessagesFromTimestamp,
    ]
  )

  // Handle suggestion
  const handleSuggestion = useCallback(
    async (suggestion: string) => {
      setIsSubmitting(true)
      const optimisticId = `optimistic-${Date.now().toString()}`

      // Create optimistic message with v5 parts format (includes createdAt for app compatibility)
      const optimisticMessage: OptimisticUIMessage = {
        id: optimisticId,
        role: "user",
        createdAt: new Date(),
        parts: [{ type: "text", text: suggestion }],
      }

      setMessages((prev) => [...prev, optimisticMessage])

      try {
        const uid = await getOrCreateGuestUserId(user)

        if (!uid) {
          setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
          return
        }

        const allowed = await checkLimitsAndNotify(uid)
        if (!allowed) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          return
        }

        const currentChatId = await ensureChatExists(uid, suggestion)

        if (!currentChatId) {
          setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
          return
        }

        prevChatIdRef.current = currentChatId

        // v5: Use sendMessage instead of append
        sendMessage(
          { text: suggestion },
          {
            body: {
              chatId: currentChatId,
              userId: uid,
              model: selectedModel,
              isAuthenticated,
              systemPrompt: SYSTEM_PROMPT_DEFAULT,
            },
          }
        )

        setHasSentFirstMessage(true) // Prevent redirect during chat creation
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
        // Persist user message with explicit chatId to handle stale closures
        cacheAndAddMessage(optimisticMessage, currentChatId)
      } catch {
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
        toast({ title: "Failed to send suggestion", status: "error" })
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      ensureChatExists,
      selectedModel,
      user,
      sendMessage,
      checkLimitsAndNotify,
      isAuthenticated,
      setMessages,
      cacheAndAddMessage,
    ]
  )

  // Handle reload (v5: renamed to regenerate)
  const handleReload = useCallback(async () => {
    const uid = await getOrCreateGuestUserId(user)
    if (!uid) {
      return
    }

    const options = {
      body: {
        chatId,
        userId: uid,
        model: selectedModel,
        isAuthenticated,
        systemPrompt: systemPrompt || SYSTEM_PROMPT_DEFAULT,
      },
    }

    regenerate(options)
  }, [user, chatId, selectedModel, isAuthenticated, systemPrompt, regenerate])

  // Handle input change - now with access to the real setInput function!
  const { setDraftValue } = useChatDraft(chatId)
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value)
      setDraftValue(value)
    },
    [setInput, setDraftValue]
  )

  return {
    // Chat state
    messages,
    input,
    status,
    error,
    stop,
    setMessages,
    setInput,
    isAuthenticated,
    systemPrompt,
    hasSentFirstMessage,
    setHasSentFirstMessage,

    // v5 API functions (exposed for direct access if needed)
    sendMessage,
    regenerate,

    // Component state
    isSubmitting,
    setIsSubmitting,
    hasDialogAuth,
    setHasDialogAuth,
    enableSearch,
    setEnableSearch,

    // Actions
    submit,
    handleSuggestion,
    handleReload,
    handleInputChange,
    submitEdit,
  }
}
