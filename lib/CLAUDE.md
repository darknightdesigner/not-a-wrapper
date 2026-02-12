# Lib Directory — Claude Context

This directory contains shared utilities, state management, and business logic.

> See `@AGENTS.md` for universal guidelines.
> Gold standard provider: `lib/chat-store/chats/provider.tsx`

## Structure Overview

```
lib/
├── chat-store/       # Chat state management (gold standard)
│   ├── chats/            # Chat list provider
│   │   ├── api.ts        # CRUD operations
│   │   └── provider.tsx  # Context provider
│   ├── messages/         # Message state
│   └── session/          # Session management
├── model-store/      # Selected model state
├── user-store/       # User profile state
├── user-preference-store/  # User preferences
├── models/           # AI model definitions
│   ├── data/             # Per-provider model configs
│   └── types.ts          # Model type definitions
├── openproviders/    # AI provider abstraction
│   ├── index.ts          # Factory pattern (gold standard)
│   ├── provider-map.ts   # Model → provider mapping
│   └── types.ts
├── mcp/              # MCP server loading utilities
├── tanstack-query/   # Query client provider
├── config.ts         # Centralized constants (gold standard)
└── utils.ts          # General utilities
```

## Key Patterns

### Context Provider with Optimistic Updates

```typescript
// lib/chat-store/chats/provider.tsx
export function ChatsProvider({ userId, children }: Props) {
  const [chats, setChats] = useState<Chats[]>([])

  const updateTitle = async (id: string, title: string) => {
    // 1. Store previous state
    let previousState: Chats[] | null = null
    
    // 2. Optimistic update
    setChats((prev) => {
      previousState = prev
      return prev.map((c) => c.id === id ? { ...c, title } : c)
    })

    try {
      // 3. Persist to database
      await updateChatTitle(id, title)
    } catch {
      // 4. Rollback on failure
      if (previousState) setChats(previousState)
      toast({ title: "Failed to update", status: "error" })
    }
  }

  return (
    <ChatsContext.Provider value={{ chats, updateTitle, ... }}>
      {children}
    </ChatsContext.Provider>
  )
}
```

### AI Provider Factory (openproviders/index.ts)

```typescript
// Multi-provider abstraction using Vercel AI SDK
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"

export function getProvider(provider: ProviderType, apiKey?: string) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })
    case "anthropic":
      return createAnthropic({ apiKey })
    // ...
  }
}
```

### Centralized Configuration (config.ts)

```typescript
// All constants in one place
export const NON_AUTH_DAILY_MESSAGE_LIMIT = 5
export const AUTH_DAILY_MESSAGE_LIMIT = 1000
export const MODEL_DEFAULT = "gpt-5.2"
export const APP_NAME = "Not A Wrapper"
export const SYSTEM_PROMPT_DEFAULT = `...`
```

## State Management Layers

```
┌─────────────────────────────────────────┐
│           React Context Providers       │
│  (ChatsProvider, UserProvider, etc.)    │
├─────────────────────────────────────────┤
│          TanStack Query (cache)         │
├─────────────────────────────────────────┤
│       IndexedDB (local persistence)     │
├─────────────────────────────────────────┤
│          Convex (remote DB)             │
└─────────────────────────────────────────┘
```

## Model Configuration

```typescript
// lib/models/data/claude.ts
export const CLAUDE_MODELS: Model[] = [
  {
    id: "claude-opus-4-5-20241216",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    contextWindow: 1000000,
    maxOutput: 64000,
    apiSdk: (apiKey, options) => createAnthropic({ apiKey })(modelId, options),
  },
  // ...
]
```

## File Conventions

| File | Purpose |
|------|---------|
| `api.ts` | CRUD operations, server communication |
| `provider.tsx` | React Context provider |
| `types.ts` | TypeScript types |
| `utils.ts` | Helper functions |

## Convex Integration

Database operations are handled by Convex. See `convex/` directory for:

```
convex/
├── schema.ts         # Database schema
├── chats.ts          # Chat functions
├── messages.ts       # Message functions
├── users.ts          # User functions
├── projects.ts       # Project functions
└── _generated/       # Auto-generated types
```

### Using Convex in Components

```typescript
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"

// Query data
const chats = useQuery(api.chats.list, { userId })

// ✅ Use "skip" for conditional queries
const messages = useQuery(
  api.messages.get,
  isValidId ? { chatId } : "skip"
)

// ❌ Don't pass undefined/null IDs - may cause errors
// const messages = useQuery(api.messages.get, { chatId: undefined })

// Mutate data
const createChat = useMutation(api.chats.create)
await createChat({ title: "New Chat", userId })
```

## Notes

- Auth handled by Clerk (see `app/auth/CLAUDE.md`)
- Database operations use Convex reactive queries
- Local persistence for drafts uses IndexedDB via `idb-keyval`
