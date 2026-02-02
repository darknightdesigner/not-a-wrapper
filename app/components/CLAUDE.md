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
│   ├── use-chat-operations.ts # Rate limiting, CRUD
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
export function Chat({ chatId, user, initialMessages }: ChatProps) {
  // 1. File handling
  const { files, setFiles, handleFileUploads, ... } = useFileUpload(user)
  
  // 2. Model selection
  const { selectedModel, setSelectedModel } = useModel(chat?.model)
  
  // 3. Chat operations
  const { ensureChatExists, checkLimitsAndNotify, ... } = useChatOperations({ ... })
  
  // 4. Core chat state (combines all the above)
  const { messages, input, submit, ... } = useChatCore({ ... })

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
| **Hook** | `use-chat-core.ts` | Typed props/returns, `useCallback`, clean separation |
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
