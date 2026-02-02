# API Patterns & Contracts

> **Last Updated:** January 2026  
> **Gold Standard:** `app/api/chat/route.ts`

## Overview

All API routes follow Next.js Route Handlers pattern with consistent error handling, validation, and response formats.

## API Structure

```
app/api/
├── chat/                    # Main chat endpoint (streaming)
│   ├── route.ts            # POST - Send message, stream response
│   ├── api.ts              # Business logic
│   ├── db.ts               # Database operations
│   └── utils.ts            # Error handling utilities
├── create-chat/            # Chat creation
│   ├── route.ts            # POST - Create new chat
│   └── api.ts              # Business logic
├── create-guest/           # Guest session creation
│   └── route.ts            # POST - Create anonymous user
├── csrf/                   # CSRF token endpoint
│   └── route.ts            # GET - Generate CSRF token
├── health/                 # Health check
│   └── route.ts            # GET - Service health
├── models/                 # Available AI models
│   └── route.ts            # GET - List models
├── projects/               # Project management
│   ├── route.ts            # GET/POST - List/Create projects
│   └── [projectId]/
│       └── route.ts        # GET/PUT/DELETE - Single project
├── providers/              # AI provider status
│   └── route.ts            # GET - Provider availability
├── rate-limits/            # Usage tracking
│   ├── route.ts            # GET - Current usage
│   └── api.ts              # Business logic
├── user-keys/              # API key management
│   └── route.ts            # GET/POST/DELETE - Manage keys
└── user-preferences/       # User settings
    ├── route.ts            # GET/PUT - Preferences
    └── favorite-models/
        └── route.ts        # GET/PUT - Favorite models
```

## Request/Response Patterns

### Standard Response Format

```typescript
// Success response
type SuccessResponse<T> = {
  data: T
}

// Error response
type ErrorResponse = {
  error: string
  code?: string  // Machine-readable error code
}

// Example usage
return new Response(
  JSON.stringify({ data: { chatId: "123", title: "New Chat" } }),
  { status: 200 }
)

return new Response(
  JSON.stringify({ error: "Missing required fields", code: "VALIDATION_ERROR" }),
  { status: 400 }
)
```

### Streaming Response

```typescript
// For AI chat responses, use Vercel AI SDK streaming
import { streamText } from "ai"

const result = streamText({
  model: modelConfig.apiSdk(apiKey),
  system: systemPrompt,
  messages: messages,
})

return result.toDataStreamResponse({
  sendReasoning: true,
  sendSources: true,
  getErrorMessage: (error) => extractErrorMessage(error),
})
```

## Authentication

### Session Validation

```typescript
// Validate session in API route using Clerk
import { auth } from "@clerk/nextjs/server"

export async function POST(req: Request) {
  const { userId } = await auth()
  
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    )
  }
  
  // Continue with authenticated request...
}
```

### CSRF Protection

All state-changing requests (POST, PUT, DELETE) require CSRF token:

```typescript
// Client-side: Include token in headers
const response = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-csrf-token": csrfToken,
  },
  body: JSON.stringify(data),
})

// Server-side: Validated in middleware.ts
```

## Error Handling

### Error Response Utility

```typescript
// app/api/chat/utils.ts
export function createErrorResponse(error: {
  code?: string
  message?: string
  statusCode?: number
}): Response {
  const statusCode = error.statusCode || 500
  const message = error.message || "An unexpected error occurred"
  
  return new Response(
    JSON.stringify({ error: message, code: error.code }),
    { status: statusCode }
  )
}

// Extract user-friendly error messages
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for known error patterns
    if (error.message.includes("rate limit")) {
      return "Rate limit exceeded. Please try again later."
    }
    if (error.message.includes("invalid_api_key")) {
      return "Invalid API key. Please check your settings."
    }
    return error.message
  }
  return "An unexpected error occurred"
}
```

### Error Status Codes

| Code | Use Case |
|------|----------|
| `400` | Invalid request (missing fields, validation failed) |
| `401` | Not authenticated |
| `403` | Not authorized (CSRF failed, insufficient permissions) |
| `404` | Resource not found |
| `429` | Rate limited |
| `500` | Internal server error |

## Core Endpoints

### POST /api/chat

Main chat endpoint with streaming response.

**Request:**
```typescript
type ChatRequest = {
  messages: MessageAISDK[]      // Conversation history
  chatId: string                // Chat identifier
  userId: string                // User identifier
  model: string                 // AI model ID
  isAuthenticated: boolean      // Auth status
  systemPrompt: string          // Custom system prompt
  enableSearch: boolean         // Enable web search
  message_group_id?: string     // For message grouping
  editCutoffTimestamp?: string  // For message editing
}
```

**Response:** Streaming text response (SSE)

**Headers:**
```
Content-Type: text/event-stream
Transfer-Encoding: chunked
```

### POST /api/create-chat

Create a new chat.

**Request:**
```typescript
type CreateChatRequest = {
  userId: string
  model?: string
  projectId?: string
}
```

**Response:**
```typescript
type CreateChatResponse = {
  data: {
    id: string
    title: string | null
    model: string
    created_at: string
  }
}
```

### GET /api/rate-limits

Get current usage limits.

**Response:**
```typescript
type RateLimitsResponse = {
  data: {
    dailyMessageCount: number
    dailyLimit: number
    remainingMessages: number
    dailyProMessageCount: number
    dailyProLimit: number
    resetsAt: string
  }
}
```

### POST /api/user-keys

Store encrypted API key.

**Request:**
```typescript
type UserKeyRequest = {
  provider: string      // "openai", "anthropic", etc.
  apiKey: string        // Will be encrypted server-side
}
```

**Response:**
```typescript
type UserKeyResponse = {
  data: {
    provider: string
    hasKey: boolean
  }
}
```

## Validation Patterns

### Request Validation

```typescript
import { z } from "zod"

// Define schema
const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  chatId: z.string().uuid(),
  userId: z.string(),
  model: z.string(),
})

// Validate in route
export async function POST(req: Request) {
  const body = await req.json()
  
  const result = chatRequestSchema.safeParse(body)
  if (!result.success) {
    return new Response(
      JSON.stringify({ 
        error: "Invalid request",
        code: "VALIDATION_ERROR",
        details: result.error.flatten(),
      }),
      { status: 400 }
    )
  }
  
  const { messages, chatId, userId, model } = result.data
  // Continue with validated data...
}
```

### Guard Clauses

```typescript
export async function POST(req: Request) {
  const { messages, chatId, userId } = await req.json()
  
  // Guard: Required fields
  if (!messages || !chatId || !userId) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    )
  }
  
  // Guard: Array not empty
  if (messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "Messages cannot be empty" }),
      { status: 400 }
    )
  }
  
  // Guard: Valid model
  const modelConfig = allModels.find((m) => m.id === model)
  if (!modelConfig) {
    return new Response(
      JSON.stringify({ error: `Model ${model} not found` }),
      { status: 400 }
    )
  }
  
  // Continue with valid request...
}
```

## Rate Limiting

### Configuration

```typescript
// lib/config.ts
export const NON_AUTH_DAILY_MESSAGE_LIMIT = 5
export const AUTH_DAILY_MESSAGE_LIMIT = 1000
export const DAILY_LIMIT_PRO_MODELS = 500
export const DAILY_FILE_UPLOAD_LIMIT = 5
```

### Implementation

```typescript
// Rate limiting is handled via Convex mutations
// See convex/usage.ts for implementation

// Client-side usage check
const { allowed, count } = await checkAndIncrementUsage({
  isProModel: modelConfig.tier === "pro",
})

if (!allowed) {
  throw new Error("Daily message limit exceeded")
}

// The Convex mutation handles:
// - Checking if daily reset is needed (midnight Pacific)
// - Incrementing the count atomically
// - Returning whether the request is allowed
```
```

## Client Integration

### Fetch Wrapper

```typescript
// lib/fetch.ts
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const csrfToken = getCsrfToken()
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
      ...options.headers,
    },
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Request failed")
  }
  
  return response.json()
}
```

### TanStack Query Integration

```typescript
// Example query
const { data, isLoading, error } = useQuery({
  queryKey: ["rate-limits", userId],
  queryFn: () => apiFetch<RateLimitsResponse>("/api/rate-limits"),
  staleTime: 60 * 1000, // 1 minute
})

// Example mutation
const mutation = useMutation({
  mutationFn: (data: CreateChatRequest) => 
    apiFetch<CreateChatResponse>("/api/create-chat", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["chats"] })
  },
})
```

## Security Considerations

### Never Log Sensitive Data

```typescript
// ✅ DO: Log sanitized information
console.log("Chat request:", { chatId, model, messageCount: messages.length })

// ❌ DON'T: Log sensitive data
console.log("Request:", { apiKey, messages, userEmail })
```

### API Key Handling

```typescript
// API keys are encrypted before storage
// See lib/encryption.ts for implementation

// User keys are decrypted only when needed
const apiKey = await getEffectiveApiKey(userId, provider)
// apiKey is used immediately, not logged or stored in state
```

---

*See `@app/api/chat/route.ts` for the gold standard implementation and `@.agents/context/architecture.md` for data flow patterns.*
