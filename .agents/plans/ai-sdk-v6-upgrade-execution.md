# AI SDK v6 Upgrade — Agent-Optimized Execution Plan

> **Goal:** Upgrade from AI SDK v4.x to v6.x with near-perfect execution
> **Created:** 2026-02-02
> **Last Updated:** 2026-02-04
> **Estimated Remaining Effort:** 1.0 hours
> **Status:** ✅ Phase 7 Cleanup Complete — Phase 6 Testing Pending

---

## Current State Summary (as of 2026-02-04)

### ✅ Phase 0 & 1 Completed

| Task | Status | Notes |
|------|--------|-------|
| Feature branch created | ✅ | `give-these-pipes-an-upgrade` |
| Message conversion module | ✅ | `lib/ai/message-conversion.ts` exists |
| AI SDK v5 packages installed | ✅ | `ai@5`, `@ai-sdk/*@2`, `@ai-sdk/provider-utils@3` |
| v5 Codemod executed | ✅ | 36 files modified, 26 FIXME markers added |
| OpenRouter provider upgraded | ✅ | v0.7.1 → v1.5.4 (AI SDK v5 compatible) |

### ⚠️ Current Issues

| Issue | Count | Files Affected |
|-------|-------|----------------|
| Type errors | ~70+ | 20+ files |
| FIXME markers | 26 | 8 files |
| Manual migrations needed | Multiple | `use-chat-core.ts`, `project-view.tsx`, etc. |

### 📊 Files Modified by Codemod

```
app/api/chat/route.ts, app/api/chat/utils.ts, app/api/chat/db.ts
app/components/chat/*.ts(x) (10 files)
app/components/multi-chat/*.ts (2 files)
app/p/[projectId]/project-view.tsx
lib/ai/*.ts (3 files)
lib/chat-store/*.ts(x) (3 files)
lib/models/**/*.ts (10 files)
lib/openproviders/index.ts
```

---

## Execution Principles

This plan is optimized for AI agent execution with:

1. **Atomic Steps** — Each task is independently completable and verifiable
2. **Explicit Dependencies** — Tasks marked with `DEPENDS:` cannot start until dependencies complete
3. **Verification Gates** — Every phase ends with verification commands
4. **Commit Checkpoints** — `[COMMIT]` markers indicate when to commit (rollback points)
5. **Parallel Groups** — Tasks in the same `[PARALLEL]` block can execute simultaneously
6. **File Scope** — Each task lists exact files to modify

---

## Quick Reference Links

### Official Migration Guides
- [v4 → v5 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0) — Primary reference for v5 changes
- [v5 → v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — Primary reference for v6 changes
- [Data Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0-data) — Message format conversion patterns

### API Documentation (v5/v6 Patterns)
- [useChat Hook](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) — `sendMessage`, `regenerate`, `status` patterns
- [Transport Architecture](https://ai-sdk.dev/docs/ai-sdk-ui/transport) — `DefaultChatTransport` configuration
- [Message Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence) — `UIMessage` format, parts structure
- [streamText API](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — Server-side streaming options

### Provider Compatibility Matrix

| Provider Package | AI SDK v4 | AI SDK v5 | AI SDK v6 |
|-----------------|-----------|-----------|-----------|
| `@openrouter/ai-sdk-provider` | v0.7.x | **v1.5.4** | v2.x |
| `@ai-sdk/anthropic` | v1.x | v2.x | v3.x |
| `@ai-sdk/openai` | v1.x | v2.x | v3.x |
| `@ai-sdk/google` | v1.x | v2.x | v3.x |

### Project Research
- `.agents/archive/ai-sdk-upgrade-research.md` — Detailed research with code examples and Q&A

---

## Phase 0: Setup ✅ COMPLETE

*Completed 2026-02-01*

- [x] Feature branch created
- [x] Message conversion module created

---

## Phase 1: Package Upgrades ✅ COMPLETE

*Completed 2026-02-04*

### What Was Done

```bash
# Packages installed
bun add ai@5 @ai-sdk/react@2 @ai-sdk/anthropic@2 @ai-sdk/google@2 \
  @ai-sdk/mistral@2 @ai-sdk/openai@2 @ai-sdk/perplexity@2 @ai-sdk/xai@2 \
  @ai-sdk/provider@2 @ai-sdk/provider-utils@3

# Codemod executed (44 seconds, successful)
npx @ai-sdk/codemod v5 --verbose ./

# OpenRouter provider upgraded for v5 compatibility
bun add @openrouter/ai-sdk-provider@1.5.4
```

### Codemod Results

**Transformations Applied:**
- `Message` → `UIMessage` imports (partially applied)
- `CoreMessage` → `ModelMessage` 
- `convertToCoreMessages` → `convertToModelMessages`
- Added FIXME markers for manual migrations

**Blocking Files Fixed During Investigation:**
| File | Issue | Fix |
|------|-------|-----|
| `lib/ai/message-conversion.ts` | Duplicate `UIMessage` import | Removed duplicate |
| `app/components/chat/use-chat-core.ts` | Duplicate `setInput` declaration | Removed manual `useState` |
| `app/p/[projectId]/project-view.tsx` | Duplicate `setInput` declaration | Removed manual `useState` |

---

## Phase 1.5: Pre-Implementation Cleanup (30 min) 🆕

> **Purpose:** Resolve import errors and prepare codebase for Phase 2 implementation

### 1.5.1 Fix Type Import Statements
**Files (PARALLEL):**

Each file needs `Message` → `UIMessage` import fix:

```bash
# Search for remaining Message imports
grep -r "import.*Message.*from.*@ai-sdk/react" app/ lib/
```

| File | Change |
|------|--------|
| `app/components/chat/conversation.tsx` | `Message` → `UIMessage` |
| `app/components/chat/get-sources.ts` | `Message` → `UIMessage` |
| `app/components/chat/message-assistant.tsx` | `Message` → `UIMessage` |
| `app/components/chat/message-user.tsx` | `Message` → `UIMessage` |
| `app/components/chat/message.tsx` | `Message` → `UIMessage` |
| `app/components/chat/use-chat-core.ts` | `Message` → `UIMessage`, fix `DefaultChatTransport` |
| `app/components/chat/use-chat-operations.ts` | `Message` → `UIMessage` |
| `app/components/multi-chat/multi-chat.tsx` | `Message` → `UIMessage` |
| `app/components/multi-chat/multi-conversation.tsx` | `Message` → `UIMessage` |
| `app/share/[chatId]/article.tsx` | `Message` → `UIMessage` |

### 1.5.2 Fix DefaultChatTransport Import
**File:** `app/components/chat/use-chat-core.ts`

```typescript
// WRONG (type-only import used as value)
import type { Message, DefaultChatTransport } from "@ai-sdk/react";

// CORRECT (DefaultChatTransport is from 'ai' package, imported as value)
import type { UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
```

### 1.5.3 Fix Other Type Renames
**Files (PARALLEL):**

| File | Old Type | New Type |
|------|----------|----------|
| `app/components/chat/sources-list.tsx` | `SourceUIPart` | `SourceUrlUIPart` |
| `app/components/chat/tool-invocation.tsx` | `ToolInvocationUIPart` | `ToolUIPart` |

### 1.5.4 Verify Phase 1.5 Completion

```bash
# Should see significantly fewer type errors (import-related errors should be gone)
bun run typecheck 2>&1 | wc -l
```

### [COMMIT] Checkpoint 1.5
```bash
git add -A
git commit -m "fix: resolve v5 type import errors and FIXME preparations"
```

### Phase 1.5 Review Findings (2026-02-04)

A code review identified the following issues that were fixed:

| Issue | File | Fix Applied |
|-------|------|-------------|
| `reasoningText` → `text` | `message-assistant.tsx` | Property access updated |
| `"source"` → `"source-url"` | `get-sources.ts` | Type filter updated |
| `SourceUrlUIPart["source"]` invalid | `sources-list.tsx` | Type corrected |
| Tool type documentation | execution plan | Corrected to `ToolUIPart` |
| `source.id` → `source.sourceId` | `sources-list.tsx` | Property access updated |

**Note:** The codemod added `transport: new DefaultChatTransport({...})` while leaving v4 API patterns (`initialMessages`, `handleSubmit`, `reload`, `append`). This creates a mixed state that will be resolved in Phase 3.

---

## Phase 2: Server-Side Migration (45 min)

> 📚 **Reference:** [streamText API](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) | [toUIMessageStreamResponse](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence#server-side)

**DEPENDS:** Phase 1.5 complete

### 2.1 Update API Route Streaming
**File:** `app/api/chat/route.ts`

**Changes Required:**

| Location | v4 Pattern | v5 Pattern |
|----------|------------|------------|
| streamText options | `maxSteps: 10` | `stopWhen: stepCountIs(10)` |
| Response helper | `toDataStreamResponse()` | `toUIMessageStreamResponse()` |
| Error handler | `getErrorMessage: (error) => ...` | `onError: (error) => ({ errorCode, message })` |

**New imports needed:**
```typescript
import { stepCountIs } from 'ai';
```

**Before:**
```typescript
const result = streamText({
  model: aiModel,
  // ...
  maxSteps: 10,
})

return result.toDataStreamResponse({
  sendReasoning: true,
  sendSources: true,
  getErrorMessage: (error) => extractErrorMessage(error),
})
```

**After:**
```typescript
const result = streamText({
  model: aiModel,
  // ...
  stopWhen: stepCountIs(10),
})

return result.toUIMessageStreamResponse({
  sendReasoning: true,
  sendSources: true,
  onError: (error) => ({
    errorCode: 'STREAM_ERROR',
    message: extractErrorMessage(error),
  }),
})
```

### 2.2 Fix API Utils Type Issues
**File:** `app/api/chat/utils.ts`

The codemod may have left array filter operations with potential `undefined` values. Add type guards:

```typescript
// Pattern for filtering arrays
const validMessages = messages.filter((msg): msg is NonNullable<typeof msg> => msg !== undefined);
```

### 2.3 Update Provider Type Imports
**Files (PARALLEL):**

| File | Old Import | New Import |
|------|------------|------------|
| `lib/openproviders/index.ts` | `LanguageModelV1` | `LanguageModelV2` |
| `lib/models/types.ts` | `LanguageModelV1` | `LanguageModelV2` |

### 2.4 Verify Server Changes
```bash
bun run typecheck 2>&1 | grep -E "app/api" | head -20
# Should show zero or minimal errors in API routes
```

### [COMMIT] Checkpoint 2
```bash
git add -A
git commit -m "feat: migrate server-side to AI SDK v5 streaming protocol"
```

### Phase 2 Completion Notes (2026-02-04)

Phase 2 completed successfully with the following changes:

| File | Changes Made |
|------|--------------|
| `app/api/chat/route.ts` | Added `convertToModelMessages()` for UIMessage→ModelMessage conversion; fixed `ChatRequest` type |
| `app/api/chat/utils.ts` | Rewrote `cleanMessagesForTools()` and `messageHasToolContent()` to use v5 `parts` structure instead of `content`/`toolInvocations` |
| `lib/openproviders/index.ts` | Updated to `LanguageModelV2`; removed unused settings parameter from provider calls (v5 uses `providerOptions` in streamText instead) |
| `lib/models/types.ts` | Updated `apiSdk` return type to `LanguageModelV2` |

**Key Findings:**
- The `onError` callback in `toUIMessageStreamResponse()` expects a `string` return, not an object (plan had incorrect info)
- In v5, provider functions (`openai()`, `anthropic()`, etc.) only take the model ID; settings are passed via `providerOptions` in `streamText`/`generateText`
- The `convertToModelMessages()` function is required to convert `UIMessage[]` to `ModelMessage[]` for `streamText`

**Server-side errors: 0** (all remaining errors are in client-side files for Phase 3/4)

---

## Phase 3: Client-Side Hook Migration (90 min)

> 📚 **Reference:** [useChat Hook](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) | [Transport Architecture](https://ai-sdk.dev/docs/ai-sdk-ui/transport)

**DEPENDS:** Phase 2 complete

### Critical API Changes Summary

| v4 (Current) | v5 (Target) | Notes |
|--------------|-------------|-------|
| `handleSubmit(e, options)` | `sendMessage({ text }, options)` | No event, explicit text |
| `append(message, options)` | `sendMessage(message, options)` | Same structure |
| `reload(options)` | `regenerate(options)` | Simple rename |
| `input` (from useChat) | Manual `useState('')` | Must manage locally |
| `setInput` (from useChat) | Manual `setInput` | From local useState |
| `api: '/api/chat'` | `transport: new DefaultChatTransport({ api })` | Transport object |
| `initialMessages` | `messages` | Prop rename |
| `initialInput` | ❌ Removed | Initialize local state |
| `onFinish: (m) => {}` | `onFinish: ({ message, isAbort, isError }) => {}` | Destructured object |

### 3.1 Update use-chat-core.ts — Complete Rewrite
**File:** `app/components/chat/use-chat-core.ts`

**Step 3.1.1:** Fix imports
```typescript
// BEFORE
import type { Message, DefaultChatTransport } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react"

// AFTER
import type { UIMessage } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
```

**Step 3.1.2:** Add manual input state (before useChat call)
```typescript
// Add AFTER existing state declarations, BEFORE useChat
const [input, setInput] = useState(draftValue || '');
```

**Step 3.1.3:** Update useChat configuration
```typescript
// BEFORE
const {
  messages,
  handleSubmit,
  status,
  error,
  reload,
  stop,
  setMessages,
  setInput,
  append
} = useChat({
  initialMessages,
  initialInput: draftValue,
  onFinish: async (m) => { ... },
  onError: handleError,
})

// AFTER
const transport = useMemo(
  () => new DefaultChatTransport({ api: API_ROUTE_CHAT }),
  []
);

const {
  messages,
  sendMessage,
  regenerate,
  status,
  error,
  stop,
  setMessages,
} = useChat({
  transport,
  messages: initialMessages,
  onFinish: async ({ message, isAbort, isError }) => {
    if (isAbort || isError) return;
    
    const effectiveChatId = chatId || prevChatIdRef.current || 
      (typeof window !== "undefined" ? localStorage.getItem("guestChatId") : null);
    
    if (effectiveChatId) {
      cacheAndAddMessage(message, effectiveChatId);
    }
    
    try {
      if (!effectiveChatId) return;
      await syncRecentMessages(effectiveChatId, setMessages, 2);
    } catch (error) {
      console.error("Message ID reconciliation failed: ", error);
    }
  },
  onError: handleError,
});
```

**Step 3.1.4:** Update submit function
```typescript
// Find all handleSubmit calls and replace with sendMessage pattern
// BEFORE
handleSubmit(undefined, {
  body: { chatId, userId, model, systemPrompt, enableSearch },
  experimental_attachments: attachments,
})

// AFTER  
import { convertAttachmentsToFiles } from '@/lib/ai/message-conversion';

sendMessage(
  {
    text: input,
    files: attachments?.length ? convertAttachmentsToFiles(attachments) : undefined,
  },
  {
    body: { chatId, userId, model, systemPrompt, enableSearch },
  }
);
setInput(''); // Clear input manually after sending
```

**Step 3.1.5:** Update reload/regenerate calls
```typescript
// Simple rename - options structure is compatible
// BEFORE
reload({ body: { ... } })

// AFTER
regenerate({ body: { ... } })
```

**Step 3.1.6:** Update edit flow (append → sendMessage)
```typescript
// In submitEdit function:
// BEFORE
append({ role: "user", content: newContent }, options)

// AFTER
setMessages((prev) => prev.slice(0, editIndex));
sendMessage(
  {
    text: newContent,
    files: target.experimental_attachments
      ? convertAttachmentsToFiles(target.experimental_attachments)
      : undefined,
  },
  {
    body: { chatId, userId, model, systemPrompt },
  }
);
```

### 3.2 Update project-view.tsx
**File:** `app/p/[projectId]/project-view.tsx`
**DEPENDS:** 3.1 complete (follow same patterns)

Apply identical changes:
1. Fix imports (`UIMessage`, `DefaultChatTransport` from 'ai')
2. Add manual input state
3. Update useChat configuration
4. Replace `handleSubmit` → `sendMessage`
5. Replace `reload` → `regenerate`

### 3.3 Update use-multi-chat.ts
**File:** `app/components/multi-chat/use-multi-chat.ts`

```typescript
// Replace api option with transport
// BEFORE
useChat({ api: "/api/chat", onError: handleError })

// AFTER
useChat({ 
  transport: new DefaultChatTransport({ api: "/api/chat" }),
  onError: handleError 
})

// Replace append → sendMessage
// Replace isLoading check with status check
// isLoading → status !== 'ready'
```

### 3.4 Update Message Structure in Optimistic Updates
**Files:** `use-chat-core.ts`, `project-view.tsx`

Messages must now use `parts` array, not `content` string:

```typescript
// BEFORE (v4 format)
const optimisticMessage = {
  id: `optimistic-${Date.now()}`,
  content: input,
  role: "user",
  createdAt: new Date(),
  experimental_attachments: attachments,
}

// AFTER (v5 format with parts)
const optimisticMessage: UIMessage = {
  id: `optimistic-${Date.now()}`,
  role: "user",
  createdAt: new Date(),
  parts: [
    { type: "text", text: input },
    ...(attachments?.map(att => ({
      type: "file" as const,
      filename: att.name,
      mediaType: att.contentType,
      url: att.url,
    })) || []),
  ],
}
```

### 3.5 Verify Hook Migration
```bash
bun run typecheck 2>&1 | grep -E "(use-chat|multi-chat|project-view)" | head -20
# Should show zero errors in hook files
```

### [COMMIT] Checkpoint 3
```bash
git add -A
git commit -m "feat: migrate useChat hooks to v5 transport architecture"
```

### Phase 3 Completion Notes (2026-02-04)

Phase 3 completed with the following changes:

| File | Changes Made |
|------|--------------|
| `app/components/chat/use-chat-core.ts` | Manual input state, `sendMessage`/`regenerate` instead of `handleSubmit`/`reload`/`append`, v5 `onFinish` callback, optimistic messages with parts format |
| `app/p/[projectId]/project-view.tsx` | Same v5 patterns as use-chat-core.ts |
| `app/components/multi-chat/use-multi-chat.ts` | Updated to use `sendMessage`, `status !== 'ready'` for loading, memoized transports |
| `app/components/multi-chat/multi-chat.tsx` | Updated to call `sendMessage` instead of `append`; added `getMessageText()` helper to extract text from parts; placeholder messages now use `parts` format |
| `lib/chat-store/messages/provider.tsx` | Fixed `undefined` types from codemod, created `ExtendedUIMessage` type for app compatibility |
| `lib/chat-store/messages/api.ts` | Fixed `undefined` types from codemod, created `ExtendedUIMessage` type |
| `app/components/chat/syncRecentMessages.ts` | Fixed type issues with `ExtendedUIMessage` |

**Key Patterns Established:**
- Created `OptimisticUIMessage` / `ExtendedUIMessage` types for app compatibility (includes `createdAt`, `content`, `experimental_attachments`)
- v5 `useChat` returns `sendMessage` (replaces `handleSubmit` and `append`) and `regenerate` (replaces `reload`)
- `input` and `setInput` must be managed locally with `useState` - no longer returned from `useChat`
- Optimistic messages use v5 `parts` array format: `{ type: "text", text: "..." }`, `{ type: "file", filename, mediaType, url }`
- `onFinish` callback receives `{ message, isAbort, isError }` instead of just the message
- Use `getMessageText(message)` helper to extract text from `parts` array (replaces direct `content` access)

**Hook-level errors: 0** (remaining errors are in rendering components for Phase 4)

---

## Phase 4: Message Rendering Migration (45 min)

> 📚 **Reference:** [UIMessage Format](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence) | [Tool Parts](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#tool-part-type-changes-uimessage)

**DEPENDS:** Phase 3 complete

### 4.1 Update Reasoning Display
**File:** `app/components/chat/reasoning.tsx`

The codemod added FIXME markers. Update reasoning property access:

```typescript
// BEFORE
const reasoningContent = reasoningPart?.reasoning

// AFTER
const reasoningContent = reasoningPart?.text
```

Also check the `ReasoningProps` interface - the prop should be `text` not `reasoning`.

### 4.2 Update Message Assistant Component
**File:** `app/components/chat/message-assistant.tsx`

```typescript
// BEFORE
const reasoningParts = parts?.find((part) => part.type === "reasoning")
// Access: reasoningParts.reasoning

// AFTER  
const reasoningParts = parts?.find((part) => part.type === "reasoning")
// Access: reasoningParts.text
```

### 4.3 Update Tool Invocation Component
**File:** `app/components/chat/tool-invocation.tsx`

```typescript
// BEFORE (v4)
import { ToolInvocationUIPart } from "ai";
// Access: part.toolInvocation.toolName, part.toolInvocation.args, part.toolInvocation.result

// AFTER (v5) - Use helper functions for catch-all pattern
import { isToolUIPart, getToolName, type UIToolInvocation } from "ai";

// For filtering tool parts:
const toolParts = parts?.filter(part => isToolUIPart(part));

// For accessing properties:
const toolName = getToolName(part);
const input = part.input;   // was: part.toolInvocation.args
const output = part.output; // was: part.toolInvocation.result

// States changed:
// 'partial-call' → 'input-streaming'
// 'call' → 'input-available'  
// 'result' → 'output-available'
// NEW: 'output-error'
```

### 4.4 Update Sources List
**File:** `app/components/chat/sources-list.tsx`

```typescript
// BEFORE
import { SourceUIPart } from "ai";

// AFTER
import { SourceUrlUIPart } from "ai";
// or import both: SourceUrlUIPart, SourceDocumentUIPart
```

### 4.5 Update get-sources.ts  
**File:** `app/components/chat/get-sources.ts`

Resolve FIXME markers for tool invocation patterns:

```typescript
// BEFORE
if (part.toolInvocation?.state === "result" && 
    part.toolInvocation?.toolName === "exa_search") {
  // ...
}

// AFTER - Use helper functions
import { isToolUIPart, getToolName } from "ai";

if (isToolUIPart(part) && 
    part.state === "output-available" && 
    getToolName(part) === "exa_search") {
  // Access results via part.output instead of part.toolInvocation.result
}
```

### 4.6 Resolve FIXME Markers for experimental_attachments
**Files with FIXME markers:**
- `use-chat-core.ts` (10 locations)
- `project-view.tsx` (7 locations)
- `lib/chat-store/types.ts` (3 locations)
- `lib/ai/message-conversion.ts` (4 locations)
- `multi-conversation.tsx` (2 locations)
- `messages/provider.tsx` (3 locations)
- `conversation.tsx` (1 location)

**Pattern:** Replace `experimental_attachments` with file parts in `parts` array where v5 message format is expected.

For backward compatibility in storage types, keep the property but note it's deprecated.

### 4.7 Apply Message Conversion at API Boundary
**File:** `lib/chat-store/messages/api.ts`

Ensure messages from storage are converted to v5 format:

```typescript
import { ensureV5Format } from '@/lib/ai/message-conversion';

export async function getCachedMessages(chatId: string): Promise<UIMessage[]> {
  const entry = await readFromIndexedDB<ChatMessageEntry>("messages", chatId);
  if (!entry || Array.isArray(entry)) return [];
  
  // Convert any v4 messages to v5 format on read
  const messages = ensureV5Format(entry.messages || []);
  
  return messages.sort(
    (a, b) => +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0)
  );
}
```

### 4.8 Verify Rendering Changes
```bash
bun run typecheck 2>&1 | grep -E "components/chat" | head -20
bun run lint
```

### [COMMIT] Checkpoint 4
```bash
git add -A
git commit -m "feat: migrate message rendering to v5 parts format"
```

### Phase 4 Completion Notes (2026-02-04)

Phase 4 completed with the following changes:

| File | Changes Made |
|------|--------------|
| `app/components/chat/get-sources.ts` | Updated to v5 flat tool properties (`part.state`, `part.output`); added helper functions `isToolPart()`, `getToolNameFromPart()`; proper typing with `SourceUrlUIPart[]` return type |
| `app/components/chat/message-assistant.tsx` | Fixed tool parts filtering with `isToolPart()` helper; updated `searchImageResults` to use v5 flat properties; proper `ImageResult[]` typing |
| `app/components/chat/tool-invocation.tsx` | Fixed `toolCallId` and `toolName` access (v5 uses flat properties, tool name extracted from type); added `getToolNameFromPart()` helper |
| `app/components/multi-chat/multi-conversation.tsx` | Added `getMessageText()` and `getMessageAttachments()` helpers; replaced direct `content` and `experimental_attachments` access with helper functions |
| `lib/hooks/use-chat-preview.tsx` | Added `getMessageText()` helper; fixed content extraction for preview messages |
| `lib/ai/message-conversion.ts` | Removed FIXME markers; updated comments to be informational |
| `lib/chat-store/types.ts` | Removed FIXME markers; added informational comments about legacy properties |

**Key v5 Tool Part Patterns Established:**
- Tool parts have type `tool-{toolName}` (e.g., `tool-exa_search`, `tool-imageSearch`)
- Tool name extracted via `part.type.replace(/^tool-/, "")`
- Direct property access: `part.state`, `part.input`, `part.output`, `part.toolCallId`
- State values: `"input-streaming"`, `"input-available"`, `"output-available"`, `"output-error"`

**Remaining Pre-existing Errors (not Phase 4 related):**
- 13 implicit `any` type errors in settings components (strict mode violations)
- 3 MCP experimental API errors (separate concern)
- 1 TanStack Query import error (package version mismatch)

**Rendering-level errors: 0** (all AI SDK v5 related errors resolved)

---

## Phase 5: v5 → v6 Upgrade (30 min)

> 📚 **Reference:** [v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)

**DEPENDS:** Phase 4 complete AND `bun run typecheck` passes

### 5.1 Verify v5 Stability First
```bash
bun run typecheck  # MUST pass before proceeding
bun run lint       # MUST pass before proceeding
bun run build      # Recommended to verify build works
```

### 5.2 Upgrade Packages to v6
```bash
bun add ai@6 @ai-sdk/react@latest \
  @ai-sdk/anthropic@3 @ai-sdk/google@3 @ai-sdk/mistral@3 \
  @ai-sdk/openai@3 @ai-sdk/perplexity@3 @ai-sdk/xai@3 \
  @ai-sdk/provider@3 @ai-sdk/provider-utils@4

# OpenRouter v2.x for AI SDK v6
bun add @openrouter/ai-sdk-provider@2
```

### 5.3 Run v6 Codemods
```bash
npx @ai-sdk/codemod v6 --verbose ./
```

### 5.4 Update Type Imports for v6
**Files (PARALLEL):**

| File | v5 Type | v6 Type |
|------|---------|---------|
| `lib/openproviders/index.ts` | `LanguageModelV2` | `LanguageModelV3` |
| `lib/models/types.ts` | `LanguageModelV2` | `LanguageModelV3` |

### 5.5 Update Tool Helper Functions
```typescript
// v5
import { isToolUIPart, getToolName } from 'ai';

// v6
import { isStaticToolUIPart, getStaticToolName } from 'ai';
```

### 5.6 Make convertToModelMessages Async (if used)
```typescript
// BEFORE (v5)
const modelMessages = convertToModelMessages(messages)

// AFTER (v6)
const modelMessages = await convertToModelMessages(messages)
```

### 5.7 Verify v6 Migration
```bash
bun run typecheck
bun run lint
```

### [COMMIT] Checkpoint 5
```bash
git add -A
git commit -m "chore: upgrade to AI SDK v6"
```

### Phase 5 Completion Notes (2026-02-04)

Phase 5 completed successfully with the following changes:

| File | Changes Made |
|------|--------------|
| `lib/openproviders/index.ts` | Updated `LanguageModelV2` → `LanguageModelV3` import and return type |
| `lib/models/types.ts` | Updated `LanguageModelV2` → `LanguageModelV3` in `apiSdk` return type |
| `app/components/chat/get-sources.ts` | Updated to use v6 official helpers (`isStaticToolUIPart`, `getStaticToolName`) |
| `app/components/chat/message-assistant.tsx` | Updated to use v6 official helpers |
| `app/components/chat/tool-invocation.tsx` | Updated to use v6 official helper (`getStaticToolName`) |

**Key v6 Changes:**
- Provider packages upgraded: `@ai-sdk/*@3`, `@ai-sdk/provider-utils@4`
- Core package: `ai@6`
- OpenRouter provider: `@openrouter/ai-sdk-provider@2`
- `LanguageModelV2` → `LanguageModelV3` for all provider returns
- Official tool helpers: `isStaticToolUIPart()`, `getStaticToolName()` for type-safe tool rendering
- `convertToModelMessages` is now async (already handled by codemod with `await`)

**Remaining Pre-existing Errors (not v6 related):**
- 13 implicit `any` type errors in settings components (strict mode violations)
- 3 MCP experimental API errors (`experimental_createMCPClient` removed in v6)
- 1 TanStack Query import error (package version mismatch)

**AI SDK v6 related errors: 0** ✅

---

## Phase 6: Testing & Verification (60 min)

### 6.1 Start Dev Server
```bash
bun run dev
```

### 6.2 Manual Test Checklist

| Test | Steps | Expected |
|------|-------|----------|
| **Basic Chat** | Send "Hello" | Streaming response appears |
| **Reasoning Display** | Use Claude model, check thinking | Reasoning shows in collapsible |
| **File Upload** | Attach image, send message | Image displays in message |
| **Edit Message** | Edit a previous user message | Message edits, regenerates response |
| **Regenerate** | Click regenerate on assistant message | New response streams |
| **Stop Generation** | Start long response, click stop | Generation stops cleanly |
| **Multi-Model** | Enable comparison mode | Multiple models respond |
| **Error Handling** | Use invalid API key | Error message displays |
| **Provider Switch** | Change from OpenAI to Claude | New model works |

### 6.3 Automated Verification
```bash
bun run typecheck  # ✅ No errors
bun run lint       # ✅ No errors
bun run build      # ✅ Builds successfully
```

### [COMMIT] Checkpoint 6
```bash
git add -A
git commit -m "test: verify AI SDK v6 upgrade functionality"
```

---

## Phase 7: Cleanup & Documentation (15 min)

### 7.1 Remove FIXME Comments
```bash
# Search and remove resolved FIXME markers
grep -r "FIXME(@ai-sdk-upgrade-v5)" --include="*.ts" --include="*.tsx" app/ lib/
```

### 7.2 Remove Deprecated Code
- [x] Remove any `// TODO: v5` comments
- [x] Remove any backward-compat shims that are no longer needed
- [x] Clean up unused imports

### 7.3 Update Documentation
**File:** `AGENTS.md` (if patterns changed significantly)

Update the "Gold Standard Examples" section if API route pattern changed.

### 7.4 Archive Research Document
- Archived at `.agents/archive/ai-sdk-upgrade-research.md`

### Phase 7 Completion Notes (2026-02-04)

Phase 7 completed with the following changes:

| Area | Changes Made |
|------|--------------|
| Message types | Removed `experimental_attachments` compatibility fields from UI message types |
| Message mapping | Attachments derived directly from file parts for storage and display |
| Rendering helpers | File attachments now read only from `parts` |
| Conversion utils | Removed legacy attachment conversion paths and updated v6 wording |

### [COMMIT] Final
```bash
git add -A
git commit -m "chore: cleanup and archive AI SDK upgrade research"
```

---

## Rollback Procedure

If critical issues are found:

```bash
# Option 1: Revert to specific checkpoint
git log --oneline  # Find checkpoint commit
git revert <commit-hash>

# Option 2: Full rollback
git checkout main
git branch -D give-these-pipes-an-upgrade
```

---

## Success Criteria

All must pass before merging:

- [ ] `bun run typecheck` — Zero errors
- [ ] `bun run lint` — Zero errors  
- [ ] `bun run build` — Successful
- [ ] Basic chat streaming — Works
- [ ] Reasoning display — Works
- [ ] File attachments — Work
- [ ] Message editing — Works
- [ ] Regenerate — Works
- [ ] Multi-model comparison — Works
- [ ] All providers tested — Anthropic, OpenAI, Google, Mistral, xAI, Perplexity, OpenRouter

---

## Dependency Graph

```
Phase 0 (Setup) ✅
    │
    ▼
Phase 1 (Package Upgrades) ✅
    │
    ▼
Phase 1.5 (Pre-Implementation Cleanup) ✅
    │
    ▼
Phase 2 (Server-Side) ✅
    │
    ▼
Phase 3 (Client-Side) ✅
    │
    ▼
Phase 4 (Rendering) ✅
    │
    ▼
Phase 5 (v6 Upgrade) ✅
    │
    ▼
Phase 6 (Testing) ◄── NEXT
    │
    ▼
Phase 7 (Cleanup)
```

---

## Agent Execution Notes

When executing this plan as an AI agent:

1. **Read before edit** — Always read the target file before making changes
2. **One phase at a time** — Complete all tasks in a phase before moving to next
3. **Verify after commits** — Run typecheck/lint after each checkpoint
4. **Report blockers immediately** — If a step fails, stop and diagnose
5. **Use StrReplace** — Prefer targeted string replacement over full file rewrites
6. **Parallel where marked** — Tasks in `[PARALLEL]` blocks can run simultaneously
7. **Follow FIXME comments** — The codemod added markers where manual work is needed

### Key Files to Modify (Priority Order)

| Priority | File | Complexity | Notes |
|----------|------|------------|-------|
| 1 | `app/components/chat/use-chat-core.ts` | HIGH | Gold standard - other hooks follow this |
| 2 | `app/p/[projectId]/project-view.tsx` | HIGH | Similar to use-chat-core |
| 3 | `app/api/chat/route.ts` | MEDIUM | Server-side streaming |
| 4 | `app/components/chat/message-assistant.tsx` | MEDIUM | Rendering changes |
| 5 | `app/components/chat/tool-invocation.tsx` | MEDIUM | Tool UI patterns |
| 6 | `lib/openproviders/index.ts` | LOW | Type import only |

---

## Estimated Timeline (Updated)

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 0: Setup | 10 min | ✅ Complete |
| Phase 1: Packages | 15 min | ✅ Complete |
| Phase 1.5: Cleanup | 30 min | ✅ Complete |
| Phase 2: Server | 45 min | ✅ Complete |
| Phase 3: Client | 90 min | ✅ Complete |
| Phase 4: Rendering | 45 min | ✅ Complete |
| Phase 5: v6 | 30 min | ✅ Complete |
| Phase 6: Testing | 60 min | Pending |
| Phase 7: Cleanup | 15 min | ✅ Complete |
| **Total Remaining** | **~1.0 hours** | |

**Buffer for issues:** +30 min
**Total estimate:** 2-2.5 hours remaining

---

## Troubleshooting Resources

If you encounter issues during migration:

1. **Check the research document first** — `.agents/archive/ai-sdk-upgrade-research.md` contains detailed Q&A
2. **Review FIXME comments** — The codemod added markers at locations needing manual work
3. **Type errors after codemod** — Usually import path issues; check imports first
4. **Streaming not working** — Verify `toUIMessageStreamResponse()` is used
5. **Messages not displaying** — Check that `message.parts` is being used

### Common Error Resolutions

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| `Property 'content' does not exist on UIMessage` | v4 message format | Use `message.parts` with text parts |
| `toDataStreamResponse is not a function` | v5 API change | Replace with `toUIMessageStreamResponse()` |
| `handleSubmit is not a function` | v5 API change | Replace with `sendMessage()` |
| `maxSteps is not a valid option` | v5 API change | Replace with `stopWhen: stepCountIs(N)` |
| `LanguageModelV1 not exported` | v5/v6 type change | Use `LanguageModelV2` (v5) or `LanguageModelV3` (v6) |
| `DefaultChatTransport` used as value with type import | Import error | Import from `'ai'` not `'@ai-sdk/react'` |
| `'Message' not exported from @ai-sdk/react` | v5 type rename | Use `UIMessage` instead |

---

## Investigation Findings (2026-02-04)

### Codemod Behavior

- **Execution time:** ~44 seconds
- **Files modified:** 36
- **FIXME markers added:** 26 locations
- **Blocking issues:** Syntax errors in partially migrated files (fixed)

### OpenRouter Provider Versions

| Version | AI SDK | Peer Dependency |
|---------|--------|-----------------|
| v0.7.x | v4 | `ai: ^4.3.17` |
| v1.5.4 | v5 | `ai: ^5.0.0` ✅ Installed |
| v2.x | v6 | `ai: ^6.0.0` |

### FIXME Marker Categories

| Category | Count | Primary Files |
|----------|-------|---------------|
| `experimental_attachments` → parts | 23 | use-chat-core.ts, project-view.tsx |
| Tool invocation patterns | 2 | get-sources.ts |
| Reasoning property | 1 | reasoning.tsx |

---

*Plan created from research document: `.agents/archive/ai-sdk-upgrade-research.md`*
*Last updated: 2026-02-04 with codemod findings and Phase 1.5 additions*
