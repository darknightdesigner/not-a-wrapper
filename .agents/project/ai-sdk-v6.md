# AI SDK v6 (Vercel) - Agent Implementation Guide

Purpose: concise, correct patterns for AI SDK v6 usage and links to canonical docs.

## Core patterns (server)

1) Streamed chat responses (App Router route handlers)
- Use `streamText()` for LLM output.
- Convert UI messages to model messages with `await convertToModelMessages(...)`.
- Return a UI message stream response with `toUIMessageStreamResponse()`.
- Prefer `sendReasoning: true` and `sendSources: true` when needed.

Docs:
- Generating and streaming text: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
- `streamText` reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- Stream protocol (UI data stream): https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

2) Structured data (v6 preferred)
- `generateObject` / `streamObject` are deprecated in v6.
- Use `generateText` or `streamText` with `output: Output.object(...)`.

Docs:
- Migration guide (v5 -> v6): https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
- Generating structured data: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data

3) Tool calling
- Define tools with `tool({ description, inputSchema, execute })`.
- Enable strict validation per tool using `strict: true`.
- For sensitive tools, use `needsApproval: true` (or a function) and handle
  approval requests with `tool-approval-response` parts or `addToolApprovalResponse` in UI.
- Use `stopWhen: stepCountIs(n)` for multi-step tool loops.

Docs:
- Tools and tool calling: https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling

4) Message conversion
- `convertToModelMessages(...)` is async in v6 (await it).

Docs:
- Migration guide (async conversion): https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0

## Core patterns (client)

1) Chat UI
- Use `useChat` from `@ai-sdk/react`.
- It is transport-based; default transport uses `/api/chat`.
- Use `addToolOutput` and `addToolApprovalResponse` for tool flows.

Docs:
- `useChat` reference: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- Chatbot guides: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot

2) Stream handling
- For custom stream processing, use `readUIMessageStream(...)`.
- When implementing custom backends, follow the stream protocol and set
  `x-vercel-ai-ui-message-stream: v1`.

Docs:
- Reading UIMessage streams: https://sdk.vercel.ai/docs/ai-sdk-ui/reading-ui-message-streams
- Stream protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

## Common server response helpers

- `result.toUIMessageStreamResponse({ sendReasoning, sendSources, onError })`
- `createUIMessageStreamResponse({ stream })` for custom stream wiring.

Docs:
- `createUIMessageStreamResponse`: https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response

## Migration highlights (v5 -> v6)

- `CoreMessage` removed -> use `ModelMessage` and `convertToModelMessages`.
- `generateObject` / `streamObject` deprecated -> use `Output.*`.
- Tool strictness is per-tool (`strict: true`).
- `Tool.toModelOutput` now receives `{ output }`.
- `ToolCallOptions` renamed to `ToolExecutionOptions`.

Docs:
- Migration guide: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0

## Recommended reading order

1) Foundations overview: https://ai-sdk.dev/docs/foundations/overview
2) Generating text + streaming: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
3) Tool calling: https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
4) Stream protocol + UI message streams:
   - https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
   - https://sdk.vercel.ai/docs/ai-sdk-ui/reading-ui-message-streams
5) Migration guide (v6): https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
