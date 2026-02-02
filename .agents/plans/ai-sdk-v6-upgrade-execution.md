# AI SDK v6 Upgrade — Agent-Optimized Execution Plan

> **Goal:** Upgrade from AI SDK v4.x to v6.x with near-perfect execution
> **Created:** 2026-02-02
> **Estimated Effort:** 8-12 hours
> **Status:** 🚀 Ready to Execute

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

## Pre-Flight Checklist

Before starting, verify:

```bash
# Must pass before starting
bun run typecheck  # ✅ No errors
bun run lint       # ✅ No errors
git status         # ✅ Clean working tree (or stash changes)
```

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

### Codemods & Changelogs
- [AI SDK Codemods](https://github.com/vercel/ai/tree/main/packages/codemod) — Automated transformations
- [AI SDK Changelog](https://github.com/vercel/ai/blob/main/CHANGELOG.md) — Detailed change history
- [AI SDK Releases](https://github.com/vercel/ai/releases) — Release notes

### Provider Documentation
- [OpenRouter v2.x Provider](https://github.com/openrouter/ai-sdk-provider) — v6-compatible provider

### Project Research
- `.agents/context/research/ai-sdk-upgrade-research.md` — Detailed research with code examples and Q&A

---

## Phase 0: Setup (10 min)

### 0.1 Create Feature Branch
```bash
git checkout -b feat/ai-sdk-v6-upgrade
```

### 0.2 Create Message Conversion Module
**File:** `lib/ai/message-conversion.ts` (NEW)

```typescript
/**
 * AI SDK Message Format Conversion Utilities
 * 
 * Provides runtime conversion between v4 (content string) and v5+ (parts array)
 * message formats to enable migration without database changes.
 */

import type { UIMessage } from 'ai';

// v4 message shape (for reference)
interface V4Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: Date;
  experimental_attachments?: Array<{
    name: string;
    contentType: string;
    url: string;
  }>;
}

/**
 * Type guard: Check if message is already in v5+ format
 */
export function isV5Format(message: unknown): message is UIMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'parts' in message &&
    Array.isArray((message as UIMessage).parts)
  );
}

/**
 * Convert v4 message format to v5 UIMessage format
 */
export function convertV4ToV5Message(v4Message: V4Message): UIMessage {
  const parts: UIMessage['parts'] = [];

  // Convert content string to text part
  if (v4Message.content) {
    parts.push({ type: 'text', text: v4Message.content });
  }

  // Convert experimental_attachments to file parts
  if (v4Message.experimental_attachments?.length) {
    for (const att of v4Message.experimental_attachments) {
      parts.push({
        type: 'file',
        filename: att.name,
        mediaType: att.contentType,
        url: att.url,
      } as UIMessage['parts'][number]);
    }
  }

  return {
    id: v4Message.id,
    role: v4Message.role,
    parts,
    createdAt: v4Message.createdAt,
  };
}

/**
 * Batch convert messages, handling mixed formats gracefully
 */
export function ensureV5Format(messages: unknown[]): UIMessage[] {
  return messages.map((msg) =>
    isV5Format(msg) ? msg : convertV4ToV5Message(msg as V4Message)
  );
}

/**
 * Convert v4 attachments to v5 file format for sendMessage
 */
export function convertAttachmentsToFiles(
  attachments?: Array<{ name: string; contentType: string; url: string }>
): Array<{ type: 'file'; filename: string; mediaType: string; url: string }> | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((att) => ({
    type: 'file' as const,
    filename: att.name,
    mediaType: att.contentType,
    url: att.url,
  }));
}
```

### [COMMIT] Checkpoint 0
```bash
git add -A
git commit -m "chore: add message format conversion utilities for AI SDK v5 migration"
```

**Verification:**
```bash
bun run typecheck  # Should pass
```

---

## Phase 1: Package Upgrades (15 min)

### 1.1 Upgrade to AI SDK v5
**DEPENDS:** Phase 0 complete

```bash
# Install v5 packages (exact versions for reproducibility)
bun add ai@5 @ai-sdk/react@2 \
  @ai-sdk/anthropic@2 @ai-sdk/google@2 @ai-sdk/mistral@2 \
  @ai-sdk/openai@2 @ai-sdk/perplexity@2 @ai-sdk/xai@2 \
  @ai-sdk/provider@2 @ai-sdk/provider-utils@3
```

### 1.2 Run v5 Codemods
```bash
# Automated transformations
npx @ai-sdk/codemod v5
```

### 1.3 Verify Codemod Results
```bash
git diff --stat  # Review what changed
bun run typecheck 2>&1 | head -50  # Expect errors - we'll fix them
```

### [COMMIT] Checkpoint 1
```bash
git add -A
git commit -m "chore: upgrade AI SDK packages to v5 and run codemods"
```

---

## Phase 2: Server-Side Migration (45 min)

> 📚 **Reference:** [streamText API](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) | [toUIMessageStreamResponse](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence#server-side)

### 2.1 Update API Route Streaming
**File:** `app/api/chat/route.ts`
**DEPENDS:** Phase 1 complete

**Changes Required:**

| Line | Change |
|------|--------|
| ~145 | `maxSteps: 10` → `stopWhen: stepCountIs(10)` |
| ~155 | `toDataStreamResponse()` → `toUIMessageStreamResponse()` |
| ~158 | `getErrorMessage: (error)` → `onError: (error)` |

**New imports:**
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

### 2.2 Update Type Imports
**Files (PARALLEL):**
- `lib/ai/context-management.ts` — `Message` → `UIMessage`
- `lib/chat-store/messages/api.ts` — `Message` → `UIMessage`
- `lib/openproviders/index.ts` — `LanguageModelV1` → `LanguageModelV2`
- `lib/models/types.ts` — `LanguageModelV1` → `LanguageModelV2`

### 2.3 Verify Server Changes
```bash
bun run typecheck 2>&1 | grep -E "(error|Error)" | head -20
```

### [COMMIT] Checkpoint 2
```bash
git add -A
git commit -m "feat: migrate server-side to AI SDK v5 streaming protocol"
```

---

## Phase 3: Client-Side Hook Migration (90 min)

> 📚 **Reference:** [useChat Hook](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) | [Transport Architecture](https://ai-sdk.dev/docs/ai-sdk-ui/transport) | [Migration Guide §useChat](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#usechat-hook)

This is the most complex phase. Follow steps precisely.

### 3.1 Update use-chat-core.ts — Input State
**File:** `app/components/chat/use-chat-core.ts`
**DEPENDS:** Phase 2 complete

**Step 3.1.1:** Add manual input state management

```typescript
// At top of hook, AFTER existing state declarations
const [input, setInput] = useState(draftValue || '');

// Remove reliance on useChat's input/setInput
```

**Step 3.1.2:** Update useChat configuration

```typescript
// BEFORE
const { messages, input, setInput, handleSubmit, append, reload, status, setMessages, stop } = useChat({
  api: "/api/chat",
  initialMessages,
  initialInput: draftValue,
  onFinish: (m) => { ... },
  onError: handleError,
})

// AFTER
import { DefaultChatTransport } from 'ai';

const transport = useMemo(
  () => new DefaultChatTransport({ api: '/api/chat' }),
  []
);

const { messages, sendMessage, regenerate, status, setMessages, stop } = useChat({
  transport,
  messages: initialMessages,
  onFinish: ({ message, isAbort, isError }) => {
    if (isAbort || isError) return;
    cacheAndAddMessage(message, effectiveChatId);
    // ... existing logic
  },
  onError: handleError,
})
```

### 3.2 Update Submit Handler
**File:** `app/components/chat/use-chat-core.ts`

**Find:** `handleSubmit` usage
**Replace with:** `sendMessage` pattern

```typescript
// BEFORE
handleSubmit(undefined, {
  body: { chatId, userId, model, systemPrompt, enableSearch },
  experimental_attachments: attachments,
})

// AFTER
sendMessage(
  {
    text: input,
    files: attachments ? convertAttachmentsToFiles(attachments) : undefined,
  },
  {
    body: { chatId, userId, model, systemPrompt, enableSearch },
  }
);
setInput(''); // Clear input manually
```

### 3.3 Update Edit Flow
**File:** `app/components/chat/use-chat-core.ts`

**Find:** `submitEdit` function using `append`
**Update:** Use `sendMessage` with proper message trimming

```typescript
// The edit flow:
// 1. Trim messages to edit point
// 2. Send new message with updated content
// 3. Let server regenerate response

// In submitEdit:
setMessages((prev) => prev.slice(0, editIndex));
sendMessage(
  {
    text: newContent,
    files: target.experimental_attachments
      ? convertAttachmentsToFiles(target.experimental_attachments)
      : undefined,
  },
  {
    body: {
      chatId: currentChatId,
      userId: uid,
      model: selectedModel,
      systemPrompt,
    },
  }
);
```

### 3.4 Update Reload/Regenerate
**File:** `app/components/chat/use-chat-core.ts`

**Find:** `reload(options)` calls
**Replace:** `regenerate(options)` — same options structure works!

```typescript
// BEFORE
reload({
  body: { chatId, userId, model, systemPrompt },
})

// AFTER (simple rename)
regenerate({
  body: { chatId, userId, model, systemPrompt },
})
```

### 3.5 Update Input Change Handler
**File:** `app/components/chat/use-chat-core.ts`

```typescript
// BEFORE
const handleInputChange = useCallback(
  (value: string) => {
    setInput(value)      // From useChat
    setDraftValue(value)
  },
  [setInput, setDraftValue]
)

// AFTER
const handleInputChange = useCallback(
  (value: string) => {
    setInput(value)      // From useState (local)
    setDraftValue(value)
  },
  [setDraftValue] // setInput from useState is stable, can omit
)
```

### 3.6 Verify Hook Migration
```bash
bun run typecheck 2>&1 | grep "use-chat-core" | head -20
```

### [COMMIT] Checkpoint 3
```bash
git add -A
git commit -m "feat: migrate useChat hook to v5 transport architecture"
```

---

## Phase 4: Message Rendering Migration (45 min)

> 📚 **Reference:** [UIMessage Format](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence) | [Data Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0-data)

### 4.1 Update Message Parts Rendering
**Files (PARALLEL):**
- `app/components/chat/message-assistant.tsx`
- `app/components/chat/tool-invocation.tsx`
- Any file rendering `message.parts`

**Key Changes:**

| v4 Pattern | v5 Pattern |
|------------|------------|
| `part.reasoning` | `part.text` (on reasoning parts) |
| `part.type === "tool-invocation"` | `isStaticToolUIPart(part)` |
| `part.toolInvocation.toolName` | `getStaticToolName(part)` |
| `part.toolInvocation.args` | `part.input` |
| `part.toolInvocation.result` | `part.output` |

**Example transformation:**
```typescript
// BEFORE
const reasoningParts = parts?.find((part) => part.type === "reasoning")
const reasoningContent = reasoningParts?.reasoning

// AFTER
const reasoningParts = parts?.find((part) => part.type === "reasoning")
const reasoningContent = reasoningParts?.text
```

### 4.2 Update File Part Properties
**Files:** Any rendering file attachments

| v4 Property | v5 Property |
|-------------|-------------|
| `part.contentType` | `part.mediaType` |
| `part.name` | `part.filename` |

### 4.3 Apply Message Conversion at API Boundary
**File:** `lib/chat-store/messages/api.ts`

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

### 4.4 Verify Rendering Changes
```bash
bun run typecheck
bun run lint
```

### [COMMIT] Checkpoint 4
```bash
git add -A
git commit -m "feat: migrate message rendering to v5 parts format"
```

---

## Phase 5: v5 → v6 Upgrade (30 min)

> 📚 **Reference:** [v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) | [AI SDK v6 Codemods](https://github.com/vercel/ai/tree/main/packages/codemod)

### 5.1 Upgrade Packages to v6
**DEPENDS:** Phase 4 complete and verified

```bash
bun add ai@6 @ai-sdk/react@latest \
  @ai-sdk/anthropic@3 @ai-sdk/google@3 @ai-sdk/mistral@3 \
  @ai-sdk/openai@3 @ai-sdk/perplexity@3 @ai-sdk/xai@3 \
  @ai-sdk/provider@3 @ai-sdk/provider-utils@4 \
  @openrouter/ai-sdk-provider@2
```

### 5.2 Run v6 Codemods
```bash
npx @ai-sdk/codemod v6
```

### 5.3 Update Type Imports for v6
**Files (PARALLEL):**
- `lib/openproviders/index.ts` — `LanguageModelV2` → `LanguageModelV3`
- `lib/models/types.ts` — `LanguageModelV2` → `LanguageModelV3`

### 5.4 Update Tool Helper Functions (if used)
```typescript
// v5
import { isToolUIPart, getToolName } from 'ai';

// v6
import { isStaticToolUIPart, getStaticToolName } from 'ai';
```

### 5.5 Make convertToModelMessages Async (if used)
```typescript
// BEFORE
const modelMessages = convertToModelMessages(messages)

// AFTER
const modelMessages = await convertToModelMessages(messages)
```

### 5.6 Verify v6 Migration
```bash
bun run typecheck
bun run lint
```

### [COMMIT] Checkpoint 5
```bash
git add -A
git commit -m "chore: upgrade to AI SDK v6"
```

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

### 7.1 Remove Deprecated Code
- [ ] Remove any `// TODO: v5` comments
- [ ] Remove any backward-compat shims that are no longer needed
- [ ] Clean up unused imports

### 7.2 Update Documentation
**File:** `AGENTS.md` (if patterns changed significantly)

Update the "Gold Standard Examples" section if API route pattern changed.

### 7.3 Archive Research Document
```bash
mv .agents/context/research/ai-sdk-upgrade-research.md .agents/archive/
```

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
git branch -D feat/ai-sdk-v6-upgrade
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
Phase 0 (Setup)
    │
    ▼
Phase 1 (Package Upgrades)
    │
    ▼
Phase 2 (Server-Side) ──────┐
    │                       │
    ▼                       │
Phase 3 (Client-Side) ◄─────┘
    │
    ▼
Phase 4 (Rendering)
    │
    ▼
Phase 5 (v6 Upgrade)
    │
    ▼
Phase 6 (Testing)
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

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 0: Setup | 10 min | 10 min |
| Phase 1: Packages | 15 min | 25 min |
| Phase 2: Server | 45 min | 1h 10m |
| Phase 3: Client | 90 min | 2h 40m |
| Phase 4: Rendering | 45 min | 3h 25m |
| Phase 5: v6 | 30 min | 3h 55m |
| Phase 6: Testing | 60 min | 4h 55m |
| Phase 7: Cleanup | 15 min | **5h 10m** |

**Buffer for issues:** +2-3 hours
**Total estimate:** 6-8 hours

---

## Troubleshooting Resources

If you encounter issues during migration:

1. **Check the research document first** — `.agents/context/research/ai-sdk-upgrade-research.md` contains detailed Q&A for common scenarios
2. **Review GitHub Issues** — [AI SDK Issues](https://github.com/vercel/ai/issues) for similar problems
3. **Consult the Changelog** — [CHANGELOG.md](https://github.com/vercel/ai/blob/main/CHANGELOG.md) for breaking change details
4. **Type errors after codemod** — Run `bun run typecheck 2>&1 | head -50` to see first errors; often import path issues
5. **Streaming not working** — Verify `toUIMessageStreamResponse()` is used (not `toDataStreamResponse()`)
6. **Messages not displaying** — Check that `message.parts` is being used, not `message.content`

### Common Error Resolutions

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| `Property 'content' does not exist on UIMessage` | v4 message format | Use `message.parts` with text parts |
| `toDataStreamResponse is not a function` | v5 API change | Replace with `toUIMessageStreamResponse()` |
| `handleSubmit is not a function` | v5 API change | Replace with `sendMessage()` |
| `maxSteps is not a valid option` | v5 API change | Replace with `stopWhen: stepCountIs(N)` |
| `LanguageModelV1 not exported` | v5/v6 type change | Use `LanguageModelV2` (v5) or `LanguageModelV3` (v6) |

---

*Plan created from research document: `.agents/context/research/ai-sdk-upgrade-research.md`*
