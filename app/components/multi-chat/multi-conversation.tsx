"use client"

import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container"
import { Loader } from "@/components/ui/loader"
import { ScrollButton } from "@/components/ui/scroll-button"
import { ExtendedMessageAISDK } from "@/lib/chat-store/messages/api"
import { getModelInfo } from "@/lib/models"
import { PROVIDERS } from "@/lib/providers"
import { cn } from "@/lib/utils"
import { UIMessage as MessageType } from "@ai-sdk/react"
import { useState } from "react"
import { Message } from "../chat/message"

type MessagePart = NonNullable<MessageType["parts"]>[number]
type TextPart = Extract<MessagePart, { type: "text" }>

// Helper: Extract text content from UIMessage parts array
function getMessageText(message: MessageType): string {
  const textParts = message.parts?.filter(
    (part): part is TextPart => part.type === "text"
  )
  if (!textParts || textParts.length === 0) return ""
  return textParts.map((part) => part.text || "").join("")
}

// Extract file attachments from parts array
function getMessageAttachments(
  message: MessageType
): Array<{ name: string; contentType: string; url: string }> | undefined {
  const fileParts = message.parts?.filter((p) => p.type === "file")
  if (!fileParts || fileParts.length === 0) return undefined
  return fileParts.map((p) => ({
    name: (p as { filename?: string }).filename || "file",
    contentType: (p as { mediaType?: string }).mediaType || "application/octet-stream",
    url: (p as { url?: string }).url || "",
  }))
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

type MultiModelConversationProps = {
  messageGroups: GroupedMessage[]
}

type ResponseCardProps = {
  response: GroupedMessage["responses"][0]
  group: GroupedMessage
}

function ResponseCard({ response, group }: ResponseCardProps) {
  const model = getModelInfo(response.model)
  const providerIcon = PROVIDERS.find((p) => p.id === model?.baseProviderId)
  
  // Extract text and attachments using helper functions
  const messageText = response.message ? getMessageText(response.message) : ""
  const messageAttachments = response.message ? getMessageAttachments(response.message) : undefined

  return (
    <div className="relative">
      <div className="bg-background pointer-events-auto relative rounded border p-3">
        <div className="text-muted-foreground mb-2 flex items-center gap-1">
          <span>
            {providerIcon?.icon && <providerIcon.icon className="size-4" />}
          </span>
          <span className="text-xs font-medium">{model?.name}</span>
        </div>

        {response.message ? (
          <Message
            id={response.message.id}
            variant="assistant"
            parts={
              response.message.parts || [
                { type: "text", text: messageText },
              ]
            }
            attachments={messageAttachments}
            onDelete={() => group.onDelete(response.model, response.message.id)}
            onEdit={(id, newText) => group.onEdit(response.model, id, newText)}
            onReload={() => group.onReload(response.model)}
            status={response.isLoading ? "streaming" : "ready"}
            isLast={response.isLoading === true}
            hasScrollAnchor={false}
            className="bg-transparent p-0 px-0"
          >
            {messageText}
          </Message>
        ) : response.isLoading ? (
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              assistant
            </div>
            <Loader variant="chat" />
          </div>
        ) : (
          <div className="text-muted-foreground text-sm italic">
            Waiting for response...
          </div>
        )}
      </div>
    </div>
  );
}

export function MultiModelConversation({
  messageGroups,
}: MultiModelConversationProps) {
  // State to manage the order of responses for each group
  const [groupResponses, setGroupResponses] = useState<
    Record<number, GroupedMessage["responses"]>
  >(() => {
    const initial: Record<number, GroupedMessage["responses"]> = {}
    messageGroups.forEach((group, index) => {
      initial[index] = [...group.responses]
    })
    return initial
  })
  const [prevMessageGroups, setPrevMessageGroups] = useState(messageGroups)

  // React 19 pattern: sync during render instead of useEffect
  if (messageGroups !== prevMessageGroups) {
    setPrevMessageGroups(messageGroups)
    const updated: Record<number, GroupedMessage["responses"]> = {}
    messageGroups.forEach((group, index) => {
      updated[index] = [...group.responses]
    })
    setGroupResponses(updated)
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-y-auto">
      <ChatContainerRoot className="relative w-full">
        <ChatContainerContent
          className="flex w-full flex-col items-center pt-20 pb-[134px]"
          style={{
            scrollbarGutter: "stable both-edges",
            scrollbarWidth: "none",
          }}
        >
          {messageGroups.length === 0
            ? null
            : messageGroups.map((group, groupIndex) => {
                // Extract text and attachments using helper functions
                const userMessageText = getMessageText(group.userMessage)
                const userMessageAttachments = getMessageAttachments(group.userMessage)
                
                return (
                  <div key={groupIndex} className="mb-10 w-full space-y-3">
                    <div className="mx-auto w-full max-w-3xl">
                      <Message
                        id={group.userMessage.id}
                        variant="user"
                        parts={
                          group.userMessage.parts || [
                            { type: "text", text: userMessageText },
                          ]
                        }
                        attachments={userMessageAttachments}
                        onDelete={() => {}}
                        onEdit={() => {}}
                        onReload={() => {}}
                        status="ready"
                        messageGroupId={
                          (group.userMessage as ExtendedMessageAISDK)
                            .message_group_id ?? null
                        }
                      >
                        {userMessageText}
                      </Message>
                    </div>
                    <div
                      className={cn(
                        "mx-auto w-full",
                        groupResponses[groupIndex]?.length > 1
                          ? "max-w-[1800px]"
                          : "max-w-3xl"
                      )}
                    >
                      <div className={cn("overflow-x-auto pl-6")}>
                        <div className="flex gap-4">
                          {(groupResponses[groupIndex] || group.responses).map(
                            (response) => {
                              return (
                                <div
                                  key={`${response.model}-${response.message?.id ?? "loading"}`}
                                  className="max-w-[420px] min-w-[320px] flex-shrink-0"
                                >
                                  <ResponseCard
                                    response={response}
                                    group={group}
                                  />
                                </div>
                              )
                            }
                          )}
                          {/* Spacer to create scroll padding - only when more than 2 items */}
                          <div className="w-px flex-shrink-0" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          <div className="absolute right-0 bottom-32 flex w-full max-w-3xl flex-1 items-end justify-center gap-4 pb-2 pl-6">
            <ScrollButton className="absolute top-[-50px] left-1/2 -translate-x-1/2" />
          </div>
        </ChatContainerContent>
      </ChatContainerRoot>
    </div>
  );
}
