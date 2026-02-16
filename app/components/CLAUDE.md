# App Components — Claude Context

This directory contains app-specific React components for Not A Wrapper.

> See `@components/CLAUDE.md` for Shadcn UI primitives.
> Gold standard: `app/components/chat/chat.tsx`

## Structure Overview

```
components/
├── chat/             # Main chat experience (gold standard)
│   ├── chat.tsx              # Orchestrator component
│   ├── chat-container.tsx    # Layout wrapper
│   ├── conversation.tsx      # Message list
│   ├── message.tsx           # Single message
│   ├── message-assistant.tsx # AI response with reasoning
│   ├── message-user.tsx      # User message with edit
│   ├── use-chat-core.ts      # Core chat hook (gold standard)
│   ├── use-chat-edit.ts      # Message edit flow (extracted from core)
│   ├── use-chat-operations.ts # Rate limits, chat creation (pure async utils)
│   ├── use-file-upload.ts    # File handling
│   └── use-model.ts          # Model selection
├── chat-input/       # Input area components
├── history/          # Chat history sidebar
├── layout/           # App shell components
│   ├── header.tsx
│   ├── sidebar/
│   ├── settings/
│   └── feedback/
├── multi-chat/       # Multi-model comparison view
└── suggestions/      # Prompt suggestions
```

## Key Patterns

### Hook Composition (chat.tsx)

```typescript
// Orchestrator pattern: compose multiple hooks
export function Chat() {
  // 1. File handling
  const { files, setFiles, handleFileUploads, ... } = useFileUpload()
  
  // 2. Model selection
  const { selectedModel, handleModelChange } = useModel({ ... })
  
  // 3. Chat operations (pure async utilities — no React state)
  const { checkLimitsAndNotify, ensureChatExists } = useChatOperations({ ... })
  
  // 4. Core chat state (combines all the above; internally uses useChatEdit)
  const { messages, submit, submitEdit, ... } = useChatCore({ ... })

  // 5. Local handlers that need setMessages from core
  const handleDelete = useCallback((id) => setMessages(...), [setMessages])

  return <ChatContainer>...</ChatContainer>
}
```

### Custom Hook Pattern (use-chat-core.ts)

```typescript
export function useChatCore({
  initialMessages,
  chatId,
  user,
  selectedModel,
  // ... other dependencies
}: UseChatCoreProps) {
  // State
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Memoized values
  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])
  
  // Stable callbacks
  const submit = useCallback(async () => {
    // Implementation with optimistic updates
  }, [/* dependencies */])

  // Return typed interface
  return {
    messages,
    submit,
    isSubmitting,
    // ...
  }
}
```

### Optimistic Updates Pattern

```typescript
// 1. Create optimistic message
const optimisticMessage = {
  id: `optimistic-${Date.now()}`,
  content: input,
  role: "user" as const,
  createdAt: new Date(),
}

// 2. Add to UI immediately
setMessages((prev) => [...prev, optimisticMessage])

// 3. Clear input
setInput("")

try {
  // 4. Perform actual operation
  await handleSubmit(options)
  
  // 5. Remove optimistic, real message comes via stream
  setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
} catch {
  // 6. Rollback on error
  setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
  toast({ title: "Failed to send", status: "error" })
}
```

## Component Conventions

1. **Client Components**: All interactive components use `"use client"`
2. **Props Interface**: Define `ComponentProps` type above component
3. **Memoization**: Use `useMemo` for derived state, `useCallback` for handlers
4. **Error Handling**: Show user-friendly toasts, log details to console

## Gold Standard Files

| Pattern | File | Key Strengths |
|---------|------|---------------|
| **Core Hook** | `use-chat-core.ts` | `executeSend` shared pipeline, ref-based input, debounced drafts |
| **Extracted Hook** | `use-chat-edit.ts` | Single-concern extraction, shared ref threading via props |
| **Async Utils Hook** | `use-chat-operations.ts` | Pure async utilities, no React state dependency |
| **Component** | `chat.tsx` | Hook composition, dynamic imports, guard clauses |
| **Message** | `message-assistant.tsx` | Reasoning display, streaming support |

## Layout Components

```
layout/
├── layout-app.tsx    # Main app shell with sidebar
├── header.tsx        # Top navigation
├── sidebar/          # Chat list, projects
│   ├── app-sidebar.tsx
│   └── sidebar-item.tsx
└── settings/         # User preferences
    ├── settings-content.tsx
    └── models/
```

## Notes

<!-- TODO: Document multi-chat comparison patterns -->
<!-- TODO: Add sub-agent integration components -->
