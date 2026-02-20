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

## Gotchas

### React.memo comparators assume immutable props

If `prev` and `next` props share object references to mutable data (e.g., streaming message parts from the AI SDK), the comparator sees the **mutated** value on both sides. Deep equality checks don't help — both point to the same object. The AI SDK's streaming pipeline mutates part objects in place (`reasoningPart.text += chunk`), and `pushMessage` doesn't clone them. See `message.tsx` `areMessagesEqual` (line ~65) for the canonical example. Refer to `.cursor/skills/ai-sdk-v6/SKILL.md` for details on the mutation behavior.

### Always bypass content comparison for actively-streaming messages

The workaround for the mutable-props problem above:

```typescript
if (next.status === "streaming" && next.isLast) return false
```

This unconditionally re-renders the last streaming message, trading precision for correctness. The minor cost of extra re-renders during streaming is negligible compared to a frozen UI where reasoning text never appears.

### External mutable state requires defensive snapshotting

When integrating with any external system that mutates objects in place (AI SDK streaming, WebSocket handlers, imperative libraries), either **clone data at the boundary** before setting React state, or use `useRef` to snapshot values at render time for comparison. Without this, any `React.memo`, `useMemo`, or `useEffect` dependency check that relies on referential or value equality will silently break.

## Notes

<!-- TODO: Document multi-chat comparison patterns -->
<!-- TODO: Add sub-agent integration components -->
