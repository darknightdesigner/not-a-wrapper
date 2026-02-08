import { toast } from "@/components/ui/toast"
import type { UIMessage } from "@ai-sdk/react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useMemo } from "react"

type ModelConfig = {
  id: string
  name: string
  provider: string
}

type ModelChat = {
  model: ModelConfig
  messages: any[]
  isLoading: boolean
  sendMessage: (message: any, options?: any) => void
  stop: () => void
}

// Maximum number of models we support
const MAX_MODELS = 10

// Memoize transports at module level to avoid recreating them
const transports = Array.from(
  { length: MAX_MODELS },
  () => new DefaultChatTransport({ api: "/api/chat" })
)

export function useMultiChat(
  models: ModelConfig[],
  onFinish?: (modelId: string, message: UIMessage) => void
): ModelChat[] {
  // Create a fixed number of useChat hooks to avoid conditional hook calls
  const chatHooks = Array.from({ length: MAX_MODELS }, (_, index) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useChat({
      onFinish: ({ message, isAbort, isError }) => {
        if (isAbort || isError) return
        const model = models[index]
        if (model && onFinish) {
          onFinish(model.id, message)
        }
      },
      onError: (error) => {
        const model = models[index]
        if (model) {
          console.error(`Error with ${model.name}:`, error)
          toast({
            title: `Error with ${model.name}`,
            description: error.message,
            status: "error",
          })
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
        // v5: use sendMessage instead of append
        sendMessage: (message: any, options?: any) => {
          return chatHook.sendMessage(message, options)
        },
        stop: chatHook.stop,
      }
    })

    return instances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, ...chatHooks.flatMap((chat) => [chat.messages, chat.status])])

  return activeChatInstances
}
