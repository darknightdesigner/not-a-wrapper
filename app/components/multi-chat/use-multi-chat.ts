import { toast } from "@/components/ui/toast"
import type { UIMessage } from "@ai-sdk/react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useMemo, useRef } from "react"

type ModelConfig = {
  id: string
  name: string
  provider: string
}

type ModelChat = {
  model: ModelConfig
  messages: any[]
  isLoading: boolean
  error: Error | undefined
  sendMessage: (message: any, options?: any) => void
  stop: () => void
  setMessages: (messages: any[]) => void
}

// Maximum number of models we support
const MAX_MODELS = 10

// Memoize transports at module level to avoid recreating them
const transports = Array.from(
  { length: MAX_MODELS },
  () => new DefaultChatTransport({ api: "/api/chat" })
)

// Patterns that indicate an API key / auth problem
const AUTH_ERROR_PATTERNS = [
  "api key",
  "authentication",
  "unauthorized",
  "MISSING_API_KEY",
] as const

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p))
}

export function useMultiChat(
  models: ModelConfig[],
  onFinish?: (modelId: string, message: UIMessage) => void
): ModelChat[] {
  // Track which providers have already shown an auth error toast this cycle
  // to avoid spamming the user with duplicates (e.g. 3 Claude models = 1 toast)
  const toastedAuthProvidersRef = useRef<Set<string>>(new Set())

  // Create a fixed number of useChat hooks to avoid conditional hook calls
  const chatHooks = Array.from({ length: MAX_MODELS }, (_, index) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useChat({
      onFinish: ({ message, isAbort, isDisconnect, isError }) => {
        if (isAbort || isDisconnect || isError) return
        const model = models[index]
        if (model && onFinish) {
          onFinish(model.id, message)
        }
      },
      onError: (error) => {
        const model = models[index]
        if (model) {
          console.error(`Error with ${model.name}:`, error)

          // For auth errors, deduplicate toasts per provider so the user
          // doesn't get N identical notifications when N models from the
          // same provider all fail with the same invalid key.
          if (isAuthError(error.message)) {
            const provider = model.provider
            if (toastedAuthProvidersRef.current.has(provider)) return
            toastedAuthProvidersRef.current.add(provider)

            // Clear after a short delay so future submissions can show again
            setTimeout(() => {
              toastedAuthProvidersRef.current.delete(provider)
            }, 5000)

            toast({
              title: `${provider} API key error`,
              description: error.message,
              status: "error",
            })
          } else {
            toast({
              title: `Error with ${model.name}`,
              description: error.message,
              status: "error",
            })
          }
        }
      },
      transport: transports[index],
    })
  )

  // Map only the provided models to their corresponding chat hooks
  const activeChatInstances = useMemo(() => {
    const instances = models.slice(0, MAX_MODELS).map((model, index) => {
      const chatHook = chatHooks[index]

      return {
        model,
        messages: chatHook.messages,
        // v5: isLoading is derived from status !== 'ready'
        isLoading: chatHook.status !== "ready",
        error: chatHook.error,
        // v5: use sendMessage instead of append
        sendMessage: (message: any, options?: any) => {
          return chatHook.sendMessage(message, options)
        },
        stop: chatHook.stop,
        setMessages: chatHook.setMessages,
      }
    })

    return instances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, ...chatHooks.flatMap((chat) => [chat.messages, chat.status])])

  return activeChatInstances
}
