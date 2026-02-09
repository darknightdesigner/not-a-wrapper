# Coding Conventions

> **Last Updated:** January 2026  
> **Purpose:** Ensure consistency across the codebase

## File Organization

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Components** | PascalCase | `ChatMessage.tsx`, `UserMenu.tsx` |
| **Hooks** | camelCase with `use` prefix | `use-chat-core.ts`, `useModel.ts` |
| **Utilities** | kebab-case | `file-handling.ts`, `sanitize.ts` |
| **Types** | PascalCase with descriptive suffix | `api.types.ts`, `database.types.ts` |
| **API Routes** | kebab-case directories | `api/create-chat/route.ts` |
| **Constants** | SCREAMING_SNAKE_CASE | `NON_AUTH_DAILY_MESSAGE_LIMIT` |

### Directory Structure Rules

```
app/                    # Next.js App Router
├── api/               # API routes only
├── auth/              # Auth-related pages
├── components/        # App-specific components (colocated)
├── hooks/             # App-specific hooks (colocated)
├── types/             # App-specific types
└── (routes)/          # Page routes

lib/                    # Shared utilities (importable via @/lib)
├── [feature]-store/   # Feature-specific state management
├── [feature]/         # Feature utilities
└── utils.ts           # General utilities

components/            # Shadcn UI components (shared)
└── ui/               # Primitives from Shadcn
```

### Colocation Rules

1. **App-specific components** go in `app/components/`
2. **Shared UI components** go in `components/`
3. **Feature hooks** colocated with their component
4. **Shared hooks** go in `lib/hooks/` or `hooks/`
5. **Types** colocated with their feature or in `app/types/`

## Code Style

### TypeScript

```typescript
// ✅ DO: Explicit types for exports
export function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}

// ❌ DON'T: Implicit any
export function calculateTotal(items) {  // missing type
  return items.reduce((sum, item) => sum + item.price, 0)
}

// ✅ DO: Use unknown with type guards
function handleError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// ❌ DON'T: Use any
function handleError(error: any): string {  // avoid any
  return error.message
}
```

### Type Definitions

```typescript
// ✅ DO: Define types in dedicated files or colocated
// app/types/api.types.ts
export type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  model: string
  isAuthenticated: boolean
  systemPrompt: string
  enableSearch: boolean
  message_group_id?: string
}

// ✅ DO: Use discriminated unions
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }
```

### React Components

```typescript
// ✅ DO: Prefer function components with explicit typing
export function ChatMessage({ message, onEdit }: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false)
  
  const handleSave = useCallback(() => {
    onEdit(message.id, newContent)
    setIsEditing(false)
  }, [message.id, onEdit])
  
  return (
    <div className="message">
      {/* ... */}
    </div>
  )
}

// ✅ DO: Export types alongside component
export type ChatMessageProps = {
  message: Message
  onEdit: (id: string, content: string) => void
}
```

### Hooks

```typescript
// ✅ DO: Return typed objects from hooks
export function useChatCore() {
  const [messages, setMessages] = useState<Message[]>([])
  
  const sendMessage = useCallback(async (content: string) => {
    // implementation
  }, [])
  
  // Return stable references with useMemo if needed
  return useMemo(() => ({
    messages,
    sendMessage,
    isLoading,
  }), [messages, sendMessage, isLoading])
}

// ✅ DO: Memoize expensive computations
const sortedMessages = useMemo(
  () => messages.sort((a, b) => a.timestamp - b.timestamp),
  [messages]
)

// ✅ DO: Memoize callbacks passed to children
const handleSubmit = useCallback((data: FormData) => {
  // implementation
}, [dependency])
```

## Import Order

Follow this order, separated by blank lines:

```typescript
// 1. React/Next.js imports
import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"

// 2. External library imports
import { z } from "zod"
import { toast } from "sonner"

// 3. Absolute imports from project (@/ aliases)
import { Button } from "@/components/ui/button"
import { useChatCore } from "@/app/components/chat/use-chat-core"
import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"

// 4. Relative imports
import { ChatMessage } from "./message"
import type { ChatProps } from "./types"
```

### Import Aliases

| Alias | Path | Use For |
|-------|------|---------|
| `@/components` | `./components` | Shared UI components |
| `@/lib` | `./lib` | Utilities, stores, config |
| `@/app` | `./app` | App-specific imports |

## Error Handling

### API Routes

```typescript
// ✅ DO: Structured error responses
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

// ✅ DO: Guard clauses at route entry
export async function POST(req: Request) {
  const { messages, chatId, userId } = await req.json()
  
  if (!messages || !chatId || !userId) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    )
  }
  
  // Continue with valid data...
}
```

### Client-Side

```typescript
// ✅ DO: Handle errors with user feedback
try {
  await updateChatTitle(id, title)
} catch (error) {
  // Rollback optimistic update
  if (previousState) setChats(previousState)
  
  // User feedback
  toast.error("Failed to update title")
  
  // Log for debugging (not sensitive data)
  console.error("Title update failed:", error)
}
```

## Comments & Documentation

### When to Comment

```typescript
// ✅ DO: Explain non-obvious business logic
// If editing, delete messages from cutoff BEFORE saving the new user message
if (ctx && editCutoffTimestamp) {
  await ctx.db
    .query("messages")
    .withIndex("by_chat_id", (q) => q.eq("chatId", chatId))
    .filter((q) => q.gte(q.field("createdAt"), editCutoffTimestamp))
    .collect()
    .then((msgs) => Promise.all(msgs.map((m) => ctx.db.delete(m._id))))
}

// ✅ DO: Mark TODOs with context
// TODO: Add pagination for large message histories
const messages = await ctx.db.query("messages").collect()

// ❌ DON'T: State the obvious
// Increment the counter
counter++
```

### JSDoc for Complex Functions

```typescript
/**
 * Validates user request and tracks usage against rate limits.
 * 
 * @param userId - The user's ID
 * @param model - The AI model being used
 * @param isAuthenticated - Whether the user is logged in
 * @returns true if valid, throws if rate limited
 * @throws {Error} When daily limit exceeded
 */
export async function validateAndTrackUsage({
  userId,
  model,
  isAuthenticated,
}: ValidationParams): Promise<boolean> {
  // implementation
}
```

## CSS & Styling

### Tailwind Conventions

```tsx
// ✅ DO: Use semantic class ordering
// Layout → Spacing → Sizing → Typography → Colors → Effects
<div className="flex items-center gap-4 p-4 w-full text-sm text-gray-600 bg-white rounded-lg shadow-sm">

// ✅ DO: Use cn() for conditional classes
import { cn } from "@/lib/utils"

<button className={cn(
  "px-4 py-2 rounded-md",
  variant === "primary" && "bg-blue-500 text-white",
  variant === "secondary" && "bg-gray-200 text-gray-800",
  disabled && "opacity-50 cursor-not-allowed"
)}>

// ❌ DON'T: Mix Tailwind with inline styles
<div className="flex" style={{ marginTop: "20px" }}>
```

### Component Styling

```tsx
// ✅ DO: Use Shadcn/Base UI primitives
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

// ✅ DO: Extend with className prop
export function CustomButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("custom-default", className)} {...props} />
}
```

## Testing Conventions

<!-- TODO: Add when tests are implemented -->

### Test File Naming

```
component.tsx         → component.test.tsx
use-hook.ts          → use-hook.test.ts
route.ts             → route.test.ts
```

### Test Structure

```typescript
describe("ComponentName", () => {
  describe("when condition", () => {
    it("should expected behavior", () => {
      // Arrange
      // Act  
      // Assert
    })
  })
})
```

## Quality Gates

This project prioritizes **strict testing over quick fixes**. All code must pass these gates before merge.

### Verification Commands

```bash
bun run lint        # Must pass with 0 errors
bun run typecheck   # Must pass with 0 errors  
bun run build       # Must complete successfully
bun run test        # Must pass (when tests exist)
```

### Strict Quality Rules

| Rule | Enforcement | Rationale |
|------|-------------|-----------|
| No `// @ts-ignore` | 🚫 Forbidden | Fix the type error properly |
| No `// @ts-expect-error` | ⚠️ Requires linked issue | Temporary only with tracking |
| No `eslint-disable` | ⚠️ Requires documented reason | Must explain why rule doesn't apply |
| No setting rules to `"off"` | 🚫 Forbidden | Fix the underlying code |
| No setting rules to `"warn"` | ⚠️ Temporary only | Must have fix plan documented |

### When Facing Lint/Type Errors

**DO:**
1. Read the error message and understand why it's flagged
2. Research the correct pattern (check gold standard examples)
3. Fix the code to comply with the rule
4. If the rule is wrong for this case, document why in a PR comment

**DON'T:**
1. Disable the rule globally
2. Add ignore comments without understanding the issue
3. Downgrade dependencies to avoid errors
4. Ask the user "should I disable this check?"

### Acceptable Exceptions

Only these patterns are acceptable with documentation:

```typescript
// ✅ OK: eslint-disable with clear reason
// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omitting dep for one-time init
useEffect(() => { init() }, [])

// ✅ OK: @ts-expect-error with linked issue  
// @ts-expect-error - TODO(#123): Fix type after library upgrade
const result = legacyFunction()

// ❌ NOT OK: Blanket disable without reason
// eslint-disable-next-line
doSomething()

// ❌ NOT OK: ts-ignore (never acceptable)
// @ts-ignore
brokenCode()
```

### Reference Documentation

When fixing lint errors, consult:
- `.agents/workflows/react-19-lint-fixes.md` — React 19 / React Compiler patterns
- Gold standard examples in `AGENTS.md`
- Official documentation linked in error messages

## Git Conventions

### Commit Messages

```
feat: add user authentication form
fix: resolve rate limiting bypass for guests
docs: update API documentation
refactor: extract chat message component
test: add unit tests for auth flow
chore: update dependencies
```

### Branch Naming

```
feature/user-authentication
fix/rate-limit-bypass
docs/api-documentation
refactor/chat-components
```

---

*See `@AGENTS.md` for gold standard code examples and `@.agents/context/architecture.md` for system design patterns.*
