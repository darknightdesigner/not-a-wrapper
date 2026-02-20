# Streaming UI Rendering Troubleshooting Guide

## Purpose

Use this guide when streaming AI responses render incorrectly — content appears all at once, specific phases don't stream incrementally, or components fail to re-render during active streaming.

## Symptoms

Look for one or more of these runtime symptoms:

1. Streaming content appears fully formed instead of incrementally.
2. Component doesn't re-render during a specific streaming phase (reasoning, text, tool).
3. React DevTools shows `Conversation` re-rendering but `Message` child does not.
4. Content is correct when streaming completes but wrong (empty or stale) during streaming.
5. Reasoning block appears only when text content begins, skipping the thinking phase.
6. Tool invocation state appears stuck at `call` and never transitions to `output-available`.

## Diagnostic Steps

### Step 1: Verify component re-renders

In `MessageInner` (message.tsx ~line 112), add a temporary log:

```typescript
console.log('Message render', id, getReasoningContent(parts)?.length, status)
```

If this does not fire during streaming, the memo comparator is blocking re-renders.

### Step 2: Verify parent sees changing data

In `Conversation` (conversation.tsx ~line 84), log the last message's parts on each render:

```typescript
const last = messages[messages.length - 1]
console.log('Conversation render', last?.id, last?.parts?.length, last?.parts?.find(p => p.type === 'reasoning')?.text?.length)
```

If `Conversation` logs show growing lengths but `MessageInner` doesn't re-render, the issue is in the memo comparator or reference identity.

### Step 3: Inspect the memo comparator

In `areMessagesEqual` (message.tsx ~line 65), add:

```typescript
console.log('memo check', {
  samePartsRef: Object.is(prev.parts, next.parts),
  prevReasoning: getReasoningContent(prev.parts)?.length,
  nextReasoning: getReasoningContent(next.parts)?.length,
  prevText: getTextContent(prev.parts)?.length,
  nextText: getTextContent(next.parts)?.length,
})
```

**Key signal**: If `prevReasoning` and `nextReasoning` are always equal but `Conversation` sees different lengths, the parts object is being mutated in place — prev props were retroactively changed.

### Step 4: Check reference identity

If `Object.is(prev.parts, next.parts)` is `true`, the same mutable array reference leaked through the AI SDK's `pushMessage` path (first write for a new message). Subsequent writes use `replaceMessage` which calls `structuredClone`, producing new references.

### Step 5: Verify AI SDK version behavior

Check `node_modules/ai/dist/index.mjs` for the `pushMessage` implementation. If it does not clone the message before inserting into state, the first write leaks a mutable reference. Compare with `replaceMessage` which should use `structuredClone`.

## Known Issues

| Symptom | Root Cause | Workaround |
|---------|-----------|------------|
| Reasoning doesn't stream incrementally | `pushMessage` leaks mutable ref; in-place `reasoningPart.text += delta` mutates prev props, so memo comparator sees equal content | `areMessagesEqual` returns `false` for streaming last message (line 73 of message.tsx) |
| Text content appears all at once | Same pattern — `textPart.text += delta` on shared reference | Same workaround: bypass memo during active streaming |
| Tool invocation state stuck | `toolPart.state` mutated in place on shared ref; comparator sees same `state` string | Covered by same streaming bypass; verify `getToolSignature` checks `part.state` |
| Reasoning appears only when text starts | Reasoning phase mutations invisible to React until `replaceMessage` fires on text phase | Streaming bypass ensures every write triggers re-render |

## Key Files

| File | Role in Streaming Pipeline |
|------|---------------------------|
| `node_modules/ai/dist/index.mjs` | `processUIMessageStream`: parses SSE, mutates part objects in place, calls `write()` |
| `node_modules/@ai-sdk/react/dist/index.mjs` | `ReactChatState`: `pushMessage` (no clone) vs `replaceMessage` (structuredClone), callback-based notification |
| `node_modules/ai/dist/index.mjs` | `SerialJobExecutor`: serializes `write()` calls, affects React batching timing |
| `app/components/chat/conversation.tsx` | Maps messages to `<Message>` components, passes `status` and `parts` |
| `app/components/chat/message.tsx` | `React.memo` with `areMessagesEqual` comparator; content extraction helpers |
| `app/components/chat/message-assistant.tsx` | Renders reasoning, text, tool invocations; derives display state from parts |
| `app/components/chat/reasoning.tsx` | Renders reasoning text with expand/collapse; receives `reasoning` string prop |

## Architecture Summary

```
SSE stream
  → processUIMessageStream (mutates part objects: part.text += delta)
    → write() serialized by SerialJobExecutor
      → pushMessage (1st write, no clone) / replaceMessage (subsequent, structuredClone)
        → callback notification → React setState
          → Conversation re-renders → Message memo check → MessageAssistant → Reasoning
```

The critical invariant: React.memo compares prev and next props by value. If the same object reference is shared between prev and next (due to pushMessage not cloning), in-place mutations make prev and next always appear equal, suppressing re-renders.

## Related Context

- `.cursor/skills/ai-sdk-v6/SKILL.md` — Client Streaming Internals section
- `.agents/workflows/react-19-lint-fixes.md` — React Compiler memoization behavior
- `app/components/CLAUDE.md` — Component gotchas and hook patterns
