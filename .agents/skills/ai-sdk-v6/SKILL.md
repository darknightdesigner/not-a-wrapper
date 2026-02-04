---
name: ai-sdk-v6
description: Implement Vercel AI SDK v6 features correctly in this repo (streamText, UI message streams, tool calling, Output object, async message conversion). Use when building or updating AI routes or chat flows with AI SDK v6.
---

# AI SDK v6 (Vercel) Implementation

Use this skill when adding or updating AI SDK v6 usage in `app/api/` routes or chat UI flows.

## Prerequisites

- [ ] You know whether this is server (route handler) or client (UI) work.
- [ ] You can reference the existing patterns in `app/api/chat/route.ts` and `app/components/chat/use-chat-core.ts`.

## Quick Reference

| Area | Default Pattern |
|------|-----------------|
| Server streaming | `streamText(...)` → `result.toUIMessageStreamResponse(...)` |
| Message conversion | `await convertToModelMessages(...)` (async in v6) |
| Structured output | `output: Output.object({...})` (no `generateObject/streamObject`) |
| Tool calling | `tools: { name: tool({ inputSchema, execute, strict }) }` |
| Client UI | `useChat` from `@ai-sdk/react` |
| Stream protocol | `x-vercel-ai-ui-message-stream: v1` |

## Step-by-Step Checklist (Server)

1) **Validate input + auth**
- [ ] Validate request body and required params.
- [ ] Apply rate limiting **before** `streamText()`.
- [ ] Use repo auth patterns if touching user data.

2) **Convert messages**
- [ ] Convert UI messages with `await convertToModelMessages(...)`.
- [ ] Do not use deprecated `CoreMessage`.

3) **Call the model**
- [ ] Use `streamText({ model, messages, tools, output, ... })`.
- [ ] Add tool definitions with `tool({ description, inputSchema, execute, strict: true })`.
- [ ] For sensitive tools, set `needsApproval: true` and handle approval UI.
- [ ] For structured data, use `output: Output.object({ schema, name, description })`.

4) **Return the UI stream**
- [ ] Use `result.toUIMessageStreamResponse({ sendReasoning, sendSources, onError })`.
- [ ] If wiring a custom stream, use `createUIMessageStreamResponse({ stream })`.
- [ ] Ensure the stream protocol header is `x-vercel-ai-ui-message-stream: v1`.

## Step-by-Step Checklist (Client)

1) **Chat UI**
- [ ] Use `useChat` from `@ai-sdk/react` (transport-based, default `/api/chat`).
- [ ] Keep UI message state consistent with the server stream protocol.

2) **Tools + approvals**
- [ ] Use `addToolOutput` for tool results.
- [ ] Use `addToolApprovalResponse` for approval flows.

3) **Custom streaming**
- [ ] For manual stream parsing, use `readUIMessageStream(...)`.
- [ ] Match the server’s stream protocol and message parts.

## Do / Don’t (Repo-Specific)

**Do**
- Use `toUIMessageStreamResponse()` for streaming chat responses.
- Use `Output.object(...)` for structured data in v6.
- Await `convertToModelMessages(...)`.
- Follow `app/api/chat/route.ts` as the server gold standard.
- Keep tool schemas strict and validated.

**Don’t**
- Don’t use `generateObject` or `streamObject` (deprecated in v6).
- Don’t return raw `ReadableStream` without UI message stream helpers.
- Don’t skip the rate limit check before `streamText()`.
- Don’t use legacy `CoreMessage` types.

## Internal References

- Server streaming pattern: `app/api/chat/route.ts`
- Client chat flow: `app/components/chat/use-chat-core.ts`
- SDK guidance: `.agents/context/ai-sdk-v6.md`

## Official Docs (AI SDK v6)

- Foundations overview: https://ai-sdk.dev/docs/foundations/overview
- Generating & streaming text: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
- `streamText` reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- Structured data with Output: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- Tools & tool calling: https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
- UI stream protocol: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
- Reading UI message streams: https://sdk.vercel.ai/docs/ai-sdk-ui/reading-ui-message-streams
- `convertToModelMessages`: https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages
- `useChat` reference: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- Migration guide (v6): https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
