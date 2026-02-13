# API Routes — Claude Context

This directory contains Next.js API routes for the Not A Wrapper backend.

> See `@AGENTS.md` for universal guidelines. Gold standard: `app/api/chat/route.ts`

## Structure Overview

```
api/
├── chat/             # Main chat streaming endpoint (gold standard)
│   ├── route.ts      # POST handler with streaming
│   ├── adapters/      # Provider-aware history adaptation (pre-conversion)
│   ├── api.ts        # Business logic (validation, storage)
│   ├── db.ts         # Database operations
│   └── utils.ts      # Error handling utilities
├── create-chat/      # Chat creation
├── models/           # Available AI models
├── providers/        # AI provider info
├── rate-limits/      # Usage tracking
├── user-keys/        # BYOK (Bring Your Own Key)
├── user-preferences/ # User settings
└── projects/         # Project management
```

## Key Patterns

### Streaming Response (chat/route.ts)

```typescript
import { streamText } from "ai"
import { auth } from "@clerk/nextjs/server"

export async function POST(req: Request) {
  // 1. Validate auth
  const { userId } = await auth()
  
  // 2. Validate request
  const { messages, chatId, model } = await req.json()
  if (!messages || !chatId) {
    return new Response(JSON.stringify({ error: "Missing information" }), { status: 400 })
  }

  // 3. Validate usage
  await validateAndTrackUsage({ userId, model, isAuthenticated: !!userId })

  // 4. Stream response
  const result = streamText({
    model: modelConfig.apiSdk(apiKey, { enableSearch }),
    system: systemPrompt,
    messages,
    onFinish: async ({ response }) => {
      // Store assistant message to Convex
      await storeAssistantMessage({ chatId, messages: response.messages })
    },
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    sendSources: true,
    onError: (error) => extractErrorMessage(error),
  })
}
```

### Provider History Adapters (chat/adapters/)

Use provider-specific adapters to normalize `UIMessage[]` history before `convertToModelMessages()`:

- `adaptHistoryForProvider(messages, providerId, context)` is the single entry point.
- Each adapter implements `ProviderHistoryAdapter` and encodes replay invariants for one provider family.
- Keep adapters pure and non-mutating; route-level observability should use `AdaptationResult.stats` and `warnings`.
- Preserve `hasProviderLinkedResponseIds()` and `toPlainTextModelMessages()` fallback in `chat/utils.ts` as defense-in-depth after conversion.

### Error Handling (utils.ts)

```typescript
export function createErrorResponse(error: { code?: string; message?: string; statusCode?: number }) {
  // Map error codes to user-friendly messages
  // Return appropriate HTTP status codes
}

export function extractErrorMessage(error: unknown): string {
  // Extract user-friendly error message from various error types
}
```

### Route Configuration

```typescript
// Set max duration for streaming routes
export const maxDuration = 60  // 60 seconds

// Define request type for validation
type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  model: string
  // ...
}
```

## Conventions

1. **File Structure**: Each API folder has `route.ts` (handler) + `api.ts` (logic)
2. **Validation**: Always validate required fields at the start
3. **Error Responses**: Use `{ error: string, code?: string }` format
4. **Auth Check**: Use `isAuthenticated` flag from client, validate server-side
5. **Rate Limiting**: Check limits before processing expensive operations

## Common Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Main chat streaming |
| `/api/create-chat` | POST | Create new chat |
| `/api/models` | GET | List available models |
| `/api/rate-limits` | GET | Check user limits |
| `/api/user-keys` | GET/POST | Manage API keys |

## Security Considerations

- **Never log**: API keys, tokens, user credentials
- **Always validate**: User ownership before mutations
- **Rate limit**: All expensive operations
- **BYOK**: User keys are encrypted at rest

## Testing

```bash
# Health check
curl http://localhost:3000/api/health

# Models list
curl http://localhost:3000/api/models
```

## Notes

- Database operations use Convex (see `convex/` directory)
- Authentication handled by Clerk (see `app/auth/CLAUDE.md`)
- Webhooks for Clerk user sync at `/api/webhooks/clerk`
