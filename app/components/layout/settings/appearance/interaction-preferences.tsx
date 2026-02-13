"use client"

import { Switch } from "@/components/ui/switch"
import { useUserPreferences } from "@/lib/user-preference-store/provider"

export function InteractionPreferences() {
  const {
    preferences,
    setPromptSuggestions,
    setShowToolInvocations,
    setShowConversationPreviews,
    setMultiModelEnabled,
    setWebSearchEnabled,
  } = useUserPreferences()

  return (
    <div className="space-y-6 pb-12">
      {/* Prompt Suggestions */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Prompt suggestions</h3>
            <p className="text-muted-foreground text-xs">
              Show suggested prompts when starting a new conversation
            </p>
          </div>
          <Switch
            checked={preferences.promptSuggestions}
            onCheckedChange={setPromptSuggestions}
          />
        </div>
      </div>
      {/* Tool Invocations */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Tool invocations</h3>
            <p className="text-muted-foreground text-xs">
              Show tool execution details in conversations
            </p>
          </div>
          <Switch
            checked={preferences.showToolInvocations}
            onCheckedChange={setShowToolInvocations}
          />
        </div>
      </div>
      {/* Conversation Previews */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Conversation previews</h3>
            <p className="text-muted-foreground text-xs">
              Show conversation previews in history
            </p>
          </div>
          <Switch
            checked={preferences.showConversationPreviews}
            onCheckedChange={setShowConversationPreviews}
          />
        </div>
      </div>
      {/* Multi-Model Chat */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Multi-model chat</h3>
            <p className="text-muted-foreground text-xs">
              Send prompts to multiple models at once
            </p>
          </div>
          <Switch
            checked={preferences.multiModelEnabled}
            onCheckedChange={setMultiModelEnabled}
          />
        </div>
      </div>
      {/* Web Search Default */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Web search default</h3>
            <p className="text-muted-foreground text-xs">
              Remember whether web search is enabled in new chats
            </p>
          </div>
          <Switch
            checked={preferences.webSearchEnabled}
            onCheckedChange={setWebSearchEnabled}
          />
        </div>
      </div>
    </div>
  )
}
