# Skill Gap Analysis & Proposals — February 2026

> Deep research report: codebase analysis, Vercel AI SDK v6 documentation audit, and critical skill proposals for the Not A Wrapper project.

---

## Section 1: Codebase Summary

### Feature Inventory

| Category | Features |
|----------|----------|
| **Core Chat** | Multi-model streaming (7 providers, 100+ models), side-by-side comparison (up to 10 models), message editing + regeneration, draft persistence |
| **Auth & Access** | Clerk auth, anonymous usage (5/day with restricted models), BYOK (AES-256-GCM encrypted keys), rate limiting (multi-tier) |
| **AI Capabilities** | Reasoning/thinking display (Anthropic adaptive, Google thinkingConfig, OpenAI/xAI reasoningEffort), web search (3-layer: provider → Exa → fallback), MCP integration (up to 10 servers), platform tools (Flowglad Pay) |
| **Data** | Convex real-time database, optimistic update pattern, tool call audit logging, chat sharing, projects |
| **UI** | Base UI primitives, file uploads (Convex storage), prompt suggestions, pinned chats, truncation detection |

### AI SDK Usage Map (33 files)

**Server-side (`ai` package):** `route.ts` (streamText, convertToModelMessages, stopWhen, UIMessage, ModelMessage), `utils.ts` (UIMessage, ModelMessage), `third-party.ts` / `platform.ts` / `provider.ts` / `mcp-wrapper.ts` (tool, ToolSet), all 6 adapters + replay system (UIMessage), `syncRecentMessages.ts` (UIMessage), `context-management.ts` (UIMessage aliased as AIMessage).

**Client-side (`@ai-sdk/react` + `ai`):** `use-chat-core.ts` / `use-multi-chat.ts` / `project-view.tsx` (useChat, DefaultChatTransport, UIMessage), `message.tsx` / `message-assistant.tsx` (UIMessage, ToolUIPart, isStaticToolUIPart, getStaticToolName), `get-sources.ts` / `use-loading-state.ts` (SourceUrlUIPart, ToolUIPart), `use-chat-edit.ts` / `conversation.tsx` / `multi-conversation.tsx` / `article.tsx` (UIMessage).

**Provider SDKs:** `openproviders/index.ts` (createOpenAI, createAnthropic, createGoogleGenerativeAI, createMistral, createPerplexity, createXai), `provider.ts` (dynamic imports for search tools), `load-tools.ts` / `load-mcp-from-*.ts` (createMCPClient from @ai-sdk/mcp).

### Existing Skills Coverage

| Skill | Covers Well | Gaps |
|-------|------------|------|
| `ai-sdk-v6` | Server streaming pattern, message conversion, tool calling basics, mutable parts gotcha, client useChat | No coverage of: history adaptation, provider-specific providerOptions, multi-model comparison, MCP integration, prepareStep/stopWhen details, transport customization, Output.array()/choice()/json(), message metadata, data parts, dynamic tools |
| `multiple-tool-calling-design-pattern` | 6-phase lifecycle, provider approaches, 3-layer architecture, safety boundaries, prepareStep, needsApproval | No coverage of: Layer 4 (platform tools), MCP wrapper details (timeout/circuit-breaker/cleanup), tool result envelope pattern, actual file paths for new tool implementation, tool metadata system, readOnly gate |

### Critical Friction Points Identified

1. **History adaptation system** — 8+ files across 3 stages (normalization, compilation, adaptation), 6 provider-specific adapters, feature-flagged replay compiler
2. **Provider options / reasoning config** — Conditional providerOptions block with Anthropic 3-path logic, search tool interaction workaround, per-provider thinking modes
3. **Multi-model comparison** — Non-obvious fixed-hook pattern (10 useChat instances) that breaks if an agent tries conditional hooks
4. **MCP integration end-to-end** — Load, namespace, wrap (timeout/truncation), cleanup via `after()` + catch-block, circuit breaker
5. **BYOK key resolution** — Different resolution paths for model creation vs. search tools vs. Exa keys, spanning 5 files
6. **Streaming UI lifecycle** — Transport → useChat → message parts → mutable gotcha → React.memo bypass → status-based rendering
7. **Anonymous user flow** — Completely different path: guest ID, local chats, restricted models, separate rate limiting
8. **DefaultChatTransport memoization** — Must be memoized or module-level; render-body creation causes reconnections

---

## Section 2: SDK Research Findings

### Core Concepts (v6)

**Architecture layers:** AI SDK Core (server: streamText, generateText, tool, Output) → AI SDK UI (client: useChat, DefaultChatTransport, UIMessage) → Provider packages (@ai-sdk/openai, @ai-sdk/anthropic, etc.)

**Message type hierarchy:**
- `UIMessage` — client-side, parts-based, for rendering (NO `content` string field)
- `ModelMessage` — server-side, for provider APIs (replaces deprecated `CoreMessage`)
- `convertToModelMessages()` — async bridge between them

**Stream protocol:** SSE with `x-vercel-ai-ui-message-stream: v1` header. 20+ chunk types following start/delta/end lifecycle pattern (text, reasoning, tool-input, tool-output, source, file, data, step boundaries, finish/abort).

### Key v6 Breaking Changes

| What Changed | v4/v5 | v6 |
|-------------|-------|-----|
| Message type | `Message` with `content: string` | `UIMessage` with `parts: Part[]` |
| Server message | `CoreMessage` | `ModelMessage` |
| Conversion | `convertToCoreMessages()` (sync) | `convertToModelMessages()` (async) |
| Tool parts | `type: 'tool-invocation'` | `type: 'tool-${toolName}'` |
| Tool fields | `args`, `result`, `parameters` | `input`, `output`, `inputSchema` |
| Tool states | `partial-call`, `call`, `result` | 7 states including `approval-requested`, `output-error` |
| Reasoning | `part.reasoning` | `part.text` (on reasoning part) |
| Files | `mimeType`, `data` | `mediaType`, `url` |
| Sources | `type: 'source'` | `type: 'source-url'` or `type: 'source-document'` |
| Step control | `maxSteps: N` | `stopWhen: stepCountIs(N)` (more flexible) |
| Object gen | `generateObject()` / `streamObject()` | `generateText({ output: Output.object() })` |
| Input state | Managed by useChat (`input`, `setInput`, `handleSubmit`) | Not managed — use `useState` manually |
| API config | `useChat({ api: '/api/chat' })` | `useChat({ transport: new DefaultChatTransport({ api }) })` |
| Append msg | `append()` | `sendMessage()` |
| Reload | `reload()` | `regenerate()` |
| Tool output | `addToolResult` | `addToolOutput` (deprecated alias kept) |
| Agent class | `Experimental_Agent` | `ToolLoopAgent` |
| Model interface | `LanguageModelV2` | `LanguageModelV3` |

### SDK Features NaW Doesn't Use Yet

| Feature | SDK API | Potential Benefit |
|---------|---------|------------------|
| **Middleware** | `wrapLanguageModel({ model, middleware })` | Logging, caching, guardrails, RAG augmentation — model-agnostic |
| **Provider Registry** | `createProviderRegistry()` | Replace custom `openproviders` with SDK-native pattern |
| **Telemetry** | `experimental_telemetry: { isEnabled: true }` | OpenTelemetry spans for all LLM calls — replace custom PostHog instrumentation |
| **Data Parts** | `DataUIPart` with typed schemas | Custom structured data in stream (e.g., cost info, model metadata) |
| **Message Metadata** | `messageMetadata` in `toUIMessageStreamResponse` | Per-message token counts, latency, model info |
| **sendAutomaticallyWhen** | `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` | Automate client-side tool result submission |
| **Dynamic Tools** | `DynamicToolUIPart` with `dynamic: true` | Better MCP tool type safety |
| **Tool Approval** | `needsApproval` + `addToolApprovalResponse` | Human-in-the-loop for Flowglad Pay |
| **Resume Stream** | `resume: true` + `resumeStream()` | Reconnect after network errors |
| **Output.array()** | `output: Output.array({ schema })` with `elementStream` | Streaming list generation |
| **Output.choice()** | `output: Output.choice({ values })` | Classification tasks |
| **Embeddings** | `embed()` / `embedMany()` | Semantic search, RAG |
| **Image Generation** | `generateImage()` | Could integrate image models |
| **DirectChatTransport** | `new DirectChatTransport({ agent })` | Server-side rendering, testing |
| **Smooth Stream** | `experimental_transform: smoothStream()` | Visual smoothing of token delivery |
| **Custom Middleware** | `extractReasoningMiddleware`, `defaultSettingsMiddleware` | Standardize reasoning extraction, default settings |
| **createUIMessageStream** | `createUIMessageStream({ execute })` | Multi-model orchestration in single stream |
| **pruneMessages** | Helper for message history trimming | Context window management |

### Key Gotchas from SDK Docs

1. `convertToModelMessages` is async — forgetting `await` causes runtime errors, not compile errors
2. `sendSources` defaults to `false` in `toUIMessageStreamResponse` — must opt in
3. `sendReasoning` defaults to `true` — reasoning is sent unless explicitly disabled
4. Tool part types are `tool-${toolName}`, not generic `tool-invocation` — must use type guards
5. `onError` in `UIMessageStreamOptions` returns a string, while `onError` in `ChatInit` receives an Error
6. `body` and `headers` in transport accept functions (Resolvable<T>) for dynamic values
7. `stopWhen` only triggers after steps with tool results, not on every step
8. OpenAI defaults to Responses API in v6 — use `openai.chat()` for Chat Completions API
9. `readUIMessageStream` yields the SAME mutated message object — root cause of the mutable-props issue
10. `providerExecuted` flag on tool parts — provider-executed tools (like OpenAI web search) don't call `execute()`

---

## Section 3: Skill Proposals

### P0 — Blocks Common Workflows

---

#### 1. `history-adaptation-system`

**Description:** Navigate and modify the cross-model history adaptation pipeline (adapters, replay compiler, normalization) that transforms UIMessages when users switch between AI providers.

**Trigger conditions:**
- Working on cross-model chat history bugs
- Adding a new provider adapter
- Modifying the replay compiler
- Fixing message rendering after model switching
- Any work touching `app/api/chat/adapters/` or `app/api/chat/replay/`

**Why it's critical:** This is the most complex subsystem in the codebase (8+ files across 3 stages). An agent asked to fix a cross-model replay bug would need to understand the full pipeline: normalization → compilation → adaptation → post-conversion defense-in-depth. Without a skill, an agent would likely modify the wrong adapter, miss the replay compiler feature flag, or break the OpenAI provider-linked ID fallback. The logic is distributed across `adapters/` (6 files), `replay/` (2 files), and `utils.ts` — no single file reveals the full pipeline.

**Key sections:**
- Full pipeline diagram: UIMessage[] → resolveAdapter → normalize → compile → adapt → convertToModelMessages → OpenAI fallback
- Adapter registry: how providerId maps to adapter, OpenRouter implicit resolution via `extractUnderlyingProvider()`
- Each adapter's specific behavior (OpenAI strips provider IDs, Anthropic preserves reasoning, Google thought signatures, text-only for Perplexity)
- Replay compiler feature flag (`HISTORY_REPLAY_COMPILER_V1`)
- Post-conversion defense: `hasProviderLinkedResponseIds()` → `toPlainTextModelMessages()` fallback
- Testing strategy for cross-model scenarios
- Decision tree: when to modify an adapter vs. the normalizer vs. the compiler

**Overlap analysis:** Neither existing skill covers this. The `ai-sdk-v6` skill mentions `convertToModelMessages` but not the adaptation layer above it.

**Priority:** P0 — Any multi-model chat bug requires understanding this system.

---

#### 2. `streaming-ui-lifecycle`

**Description:** Understand the full streaming data flow from API route through useChat to message components, including transport memoization, mutable parts, React.memo bypass, status-based rendering, and onFinish persistence.

**Trigger conditions:**
- Building new chat UI components
- Fixing rendering bugs during streaming
- Modifying message persistence logic
- Working on the transport layer
- Creating a new chat surface (like multi-chat or project chat)

**Why it's critical:** The streaming lifecycle spans 6+ files and has multiple non-obvious behaviors. The mutable parts gotcha (documented in `ai-sdk-v6` skill) is just one piece — an agent also needs to know: (1) DefaultChatTransport must be memoized, (2) `onFinish` is where persistence happens, (3) `syncRecentMessages` reconciles optimistic IDs, (4) status drives all UI state (`submitted` → `streaming` → `ready`), (5) `sendMessage` options.body is how client context reaches the server. Without this skill, an agent would likely create DefaultChatTransport in the render body (causing reconnections), miss the status-based guards, or break the persistence pipeline.

**Key sections:**
- End-to-end data flow diagram: sendMessage → transport → POST /api/chat → streamText → toUIMessageStreamResponse → SSE → useChat state → message components
- Transport creation rules (memoize with useMemo or module-level)
- useChat return values: messages, status, sendMessage, regenerate, stop, error
- Status lifecycle and UI guards (disable input during streaming, show stop button, etc.)
- onFinish pipeline: cacheAndAddMessage → syncRecentMessages (ID reconciliation)
- Mutable parts recap with component-level patterns
- Creating a new chat surface (checklist: transport, useChat, body params, onFinish, onError)
- Multi-chat variant: fixed-hook pattern, why conditional hooks are forbidden

**Overlap analysis:** Extends `ai-sdk-v6` skill which covers the mutable parts gotcha. This skill provides the full lifecycle context that the existing skill lacks.

**Priority:** P0 — Every UI change to the chat requires understanding this flow.

---

#### 3. `provider-reasoning-config`

**Description:** Correctly configure providerOptions for reasoning/thinking models across Anthropic, Google, OpenAI, and xAI, including the Anthropic adaptive thinking mode and search tool interaction workaround.

**Trigger conditions:**
- Adding reasoning support for a new model
- Modifying thinking/reasoning display behavior
- Fixing issues with extended thinking output
- Changing `providerOptions` in route.ts
- Adding a new reasoning-capable model to the registry

**Why it's critical:** The `providerOptions` block in `route.ts` (lines 690-736) has intricate conditional logic. Anthropic alone has 3 code paths: (1) adaptive mode for Opus 4.6+, (2) enabled mode with `budgetTokens` set to `maxOutputTokens` (a workaround for search tool interaction), (3) legacy enabled mode. An agent adding a new reasoning model (e.g., a future Gemini thinking model) would likely misconfigure this, producing no reasoning output or breaking search tools. The logic requires understanding `ModelConfig.thinkingMode`, the `reasoningText` capability flag, and SDK limitations documented only in code comments.

**Key sections:**
- ModelConfig fields: `thinkingMode`, `reasoningText`, `maxOutputTokens`
- Provider-specific configuration:
  - Anthropic: `thinking.type = 'enabled'`, `budgetTokens`, adaptive mode (`thinking.type = 'adaptive'`), search workaround
  - Google: `thinkingConfig.includeThoughts = true`
  - OpenAI: `reasoningEffort: 'medium'`
  - xAI: `reasoningEffort: 'medium'`
- The Anthropic search tool workaround (setting budgetTokens = maxOutputTokens when search is active)
- Adding reasoning to a new model (checklist: model data, thinkingMode, providerOptions block, UI rendering)
- sendReasoning in toUIMessageStreamResponse (defaults to true)
- Client-side: ReasoningUIPart rendering, state tracking (`streaming` vs `done`)

**Overlap analysis:** Not covered by any existing skill. The `ai-sdk-v6` skill doesn't mention providerOptions or reasoning configuration at all.

**Priority:** P0 — Wrong reasoning config causes silent failures (no output) or SDK errors.

---

### P1 — Prevents Frequent Mistakes

---

#### 4. `add-tool-layer`

**Description:** Add a new tool layer (category of tools) to the 4-layer tool system, covering capability gates, metadata registration, merge priority, audit logging, and prepareStep restriction.

**Trigger conditions:**
- Adding a new category of tools (e.g., code execution, file operations)
- Modifying tool injection logic in route.ts
- Working on tool metadata or the readOnly gate
- Adding a tool that needs prepareStep restriction

**Why it's critical:** Adding a new tool requires coordinating 6+ files: define the tool (lib/tools/), register metadata (lib/tools/types.ts), add capability gate (route.ts), handle merge priority, add audit logging, and configure prepareStep restriction. Missing any step produces subtle bugs — a tool without `readOnly: false` metadata gets silently blocked after step 3. An agent wouldn't know about the prepareStep threshold without reading deeply into route.ts.

**Key sections:**
- Tool layer architecture (4 layers with merge priority)
- Step-by-step: creating a new tool definition with `tool()` factory
- ToolCapabilities type system and capability gates
- Metadata registration: `allToolMetadata` and the `readOnly` flag
- prepareStep restriction: `PREPARE_STEP_THRESHOLD` and how tools are filtered
- Merge priority rules (MCP wins collisions)
- Audit logging: toolCallLog Convex table, source discriminator
- Tool result envelope pattern (`{ ok, data, error }`)
- BYOK key handling for tool-specific API keys
- Safety boundaries: timeout, truncation, step budget

**Overlap analysis:** Extends `multiple-tool-calling-design-pattern` which covers the conceptual architecture but not the step-by-step implementation details for adding a new layer.

**Priority:** P1 — New tool categories are a common feature request.

---

#### 5. `mcp-integration`

**Description:** End-to-end guide for the MCP (Model Context Protocol) integration: server configuration, tool loading, namespacing, wrapping (timeout/circuit-breaker/truncation), cleanup, and error handling.

**Trigger conditions:**
- Modifying MCP tool loading or configuration
- Fixing MCP timeout or circuit breaker issues
- Adding new MCP transport types
- Working on MCP server settings UI
- Debugging MCP tool execution failures

**Why it's critical:** MCP integration spans 5+ files with non-obvious patterns. The cleanup via `after()` is particularly subtle — it runs after streaming completes (even on error), but there's also a catch-block cleanup path. The circuit breaker with `MAX_CONSECUTIVE_MCP_FAILURES` silently disables failing servers. Namespacing (`${serverSlug}_${toolName}`) affects tool identification throughout the pipeline. An agent modifying the MCP flow must preserve both cleanup paths, understand the wrapping chain (load → namespace → wrap with timeout/truncation → merge), and know about the 10-server limit.

**Key sections:**
- MCP architecture: server config → load-tools.ts → parallel loading with timeout → namespace → wrap → merge
- Server configuration schema (Convex `mcpServers` table, 10-server limit)
- Transport types: URL-based (SSE), local stdio
- Tool namespacing: `${serverSlug}_${toolName}` convention
- Wrapping chain: mcp-wrapper.ts (timeout, timing, truncation)
- Cleanup: `after()` registration + catch-block cleanup (both required)
- Circuit breaker: `MAX_CONSECUTIVE_MCP_FAILURES`, per-server failure tracking
- Error handling: graceful degradation when MCP servers are unreachable
- Audit logging for MCP tools (source: 'mcp')
- Dynamic tools: MCP tools appear as `DynamicToolUIPart` on the client

**Overlap analysis:** The `multiple-tool-calling-design-pattern` skill mentions Layer 3 (MCP) conceptually but provides no implementation guidance.

**Priority:** P1 — MCP is a differentiating feature and a common source of issues.

---

#### 6. `chat-state-management`

**Description:** Understand and modify the Convex-based chat state management system with reactive queries, optimistic operations overlay, and the dual-path (authenticated vs. anonymous) persistence model.

**Trigger conditions:**
- Modifying chat CRUD operations (create, delete, rename, pin)
- Working on the optimistic update layer
- Adding new chat metadata fields
- Fixing state synchronization issues
- Working on anonymous user chat persistence

**Why it's critical:** The chat store uses a unique pattern: Convex reactive queries provide the source of truth, but optimistic operations are overlaid via an `optimisticOps` array that gets applied on every render. This is not a standard React state pattern — an agent would likely try to use useState or useReducer. The anonymous user flow adds another dimension: local-prefixed IDs bypass Convex entirely. Adding a new chat field requires updating the schema, the provider, and the optimistic operation types.

**Key sections:**
- Architecture: `ChatsProvider` with `useQuery` (Convex) + `optimisticOps` overlay
- Optimistic operation types: `OptimisticAdd`, `OptimisticUpdate`, `OptimisticDelete`
- Operation lifecycle: add op → call mutation → replace/remove op (success/failure)
- Anonymous user flow: `local-` prefix, localStorage persistence, no Convex
- Adding a new chat field (checklist: schema, Convex mutation, provider state, optimistic type)
- Message persistence: `cacheAndAddMessage` → `syncRecentMessages` (ID reconciliation)
- Common pitfalls: stale optimistic ops, race conditions between server and optimistic state

**Overlap analysis:** Not covered by any existing skill. The `convex-function` skill covers creating database functions but not the chat state management pattern.

**Priority:** P1 — Any chat feature modification requires understanding this pattern.

---

#### 7. `ai-sdk-middleware`

**Description:** Implement AI SDK middleware for cross-cutting concerns (logging, caching, guardrails, default settings) using wrapLanguageModel, middleware composition, and the built-in middleware library.

**Trigger conditions:**
- Adding observability/logging to LLM calls
- Implementing response caching
- Adding guardrails (content filtering, PII redaction)
- Applying default model settings across providers
- Extracting reasoning from non-standard formats

**Why it's critical:** NaW currently has no middleware layer — all cross-cutting concerns (logging, analytics, reasoning extraction) are handled ad-hoc in route.ts callbacks. The SDK provides `wrapLanguageModel` with composable middleware that could replace significant custom code. Without a skill, an agent would continue adding logic to route.ts callbacks instead of using the middleware pattern. Key gotchas: middleware composition order matters (first wraps outermost), streaming guardrails are complex (content unknown until completion), and `transformParams` vs `wrapGenerate` vs `wrapStream` serve different purposes.

**Key sections:**
- Core API: `wrapLanguageModel({ model, middleware })` and `wrapLanguageModel({ model, middleware: [a, b] })`
- Three middleware functions: `transformParams`, `wrapGenerate`, `wrapStream`
- Built-in middleware: `extractReasoningMiddleware`, `defaultSettingsMiddleware`, `simulateStreamingMiddleware`, `extractJsonMiddleware`, `addToolInputExamplesMiddleware`
- Custom middleware patterns: logging, caching, RAG augmentation, guardrails
- Composition order: `middleware: [first, second]` applies as `first(second(model))`
- Per-request metadata via `providerOptions` for middleware context
- Migration path: replacing route.ts ad-hoc logic with middleware
- Gotchas: streaming guardrails can't filter until stream completes; use `wrapStream` with TransformStream

**Overlap analysis:** Not covered by any existing skill. This is a pure SDK feature that NaW doesn't use yet.

**Priority:** P1 — Would significantly improve code organization and enable new capabilities.

---

#### 8. `provider-registry-pattern`

**Description:** Use the AI SDK's customProvider and createProviderRegistry to replace or augment the custom openproviders abstraction, with model aliasing, default settings, and provider-agnostic model resolution.

**Trigger conditions:**
- Refactoring the openproviders layer
- Adding a new AI provider
- Creating model aliases or groups
- Applying default settings across providers
- Evaluating SDK-native provider management

**Why it's critical:** NaW has a custom `openproviders()` function with manual provider-to-model mapping. The SDK now provides `customProvider()` and `createProviderRegistry()` that could replace much of this logic with a standardized, type-safe pattern. An agent working on the provider layer should know both approaches and when to use each. The SDK's `customProvider` supports model aliasing (`opus` → `claude-opus-4-20250514`), default settings middleware, and model allowlisting — features currently implemented manually.

**Key sections:**
- Current architecture: `openproviders()` → `getProviderForModel()` → `MODEL_PROVIDER_MAP` → provider factory
- SDK alternative: `customProvider({ languageModels, fallbackProvider })`
- SDK registry: `createProviderRegistry({ openai, anthropic, google })` with `registry.languageModel('openai:gpt-5.1')`
- Model aliasing with customProvider: `{ opus: anthropic('claude-opus-4-20250514') }`
- Default settings via middleware integration
- Comparison: when to keep custom openproviders vs. migrate to SDK registry
- BYOK key threading: how to maintain per-user keys with the registry pattern

**Overlap analysis:** The `add-ai-provider` skill covers adding a provider to the existing custom system. This skill would document the SDK-native alternative and migration considerations.

**Priority:** P1 — Important for architectural decisions around the provider layer.

---

#### 9. `useChat-transport-patterns`

**Description:** Correctly configure and customize useChat transports including DefaultChatTransport, TextStreamChatTransport, DirectChatTransport, memoization rules, dynamic body/headers, and prepareSendMessagesRequest.

**Trigger conditions:**
- Creating a new chat surface or chat-like UI
- Customizing how messages are sent to the server
- Adding dynamic request headers (e.g., auth tokens)
- Implementing stream reconnection
- Working on the multi-chat comparison feature

**Why it's critical:** Transport is the v6 replacement for the old `api`/`body`/`headers` pattern. NaW has 3 separate transport instantiations (use-chat-core.ts, use-multi-chat.ts, project-view.tsx) with different patterns. The memoization requirement is the #1 mistake — creating DefaultChatTransport in a render body causes silent reconnections on every render. Transport options support `Resolvable<T>` (function or value) for dynamic data, `prepareSendMessagesRequest` for custom request shaping, and `trigger` discrimination between submit and regenerate.

**Key sections:**
- Transport types: DefaultChatTransport (SSE), TextStreamChatTransport (plain text), DirectChatTransport (in-process)
- Memoization rules: useMemo (hooks) or module-level (non-hooks) — NEVER in render body
- Dynamic options: `body: () => ({...})`, `headers: () => ({...})` for per-request values
- `prepareSendMessagesRequest`: custom request shaping with `trigger` discrimination
- `sendMessage` options: per-request body, headers, metadata
- Multi-chat pattern: module-level transport array, why 10 fixed hooks
- Stream reconnection: `resume: true` + `resumeStream()`
- Common patterns from the codebase (3 examples with file paths)
- Gotchas: Resolvable<T> is called on every request; body/headers can be async

**Overlap analysis:** The `ai-sdk-v6` skill mentions useChat and transport briefly but doesn't cover configuration details, memoization rules, or customization patterns.

**Priority:** P1 — Wrong transport configuration is a silent but impactful bug.

---

### P2 — Nice to Have

---

#### 10. `anonymous-user-flow`

**Description:** Understand and modify the dual-path system for authenticated and anonymous users, covering guest IDs, restricted models, local chat storage, rate limiting, and feature gating.

**Trigger conditions:**
- Implementing a feature that affects both auth states
- Modifying rate limiting or usage tracking
- Changing the anonymous model allowlist
- Working on local chat persistence
- Adding feature flags that differ by auth state

**Why it's critical:** Anonymous users have a completely different flow: `clientUserId` from localStorage (guest_uuid), rate limiting via `anonymousUsage` Convex table (5/day), `local-` prefixed chat IDs that bypass Convex persistence, and restricted model access. An agent implementing a feature that should work for both user types would likely miss the anonymous path entirely, causing undefined behavior or errors for unauthenticated users.

**Key sections:**
- Auth detection: Clerk `userId` vs. `clientUserId` header
- Guest ID generation and storage (localStorage)
- Model restrictions: `isAnonymousAllowed` flag in model config
- Rate limiting: `anonymousUsage` table, daily reset, 5-message limit
- Local chat storage: `local-` prefix, no Convex persistence, localStorage/IndexedDB
- Feature gating patterns: which features are auth-only
- Step budget differences: 5 steps (anon) vs. 20 steps (auth)
- Testing both paths: how to test anonymous flows locally

**Overlap analysis:** Not covered by any existing skill.

**Priority:** P2 — Affects a subset of features; most development targets authenticated users.

---

#### 11. `byok-key-resolution`

**Description:** Understand and modify the BYOK (Bring Your Own Key) resolution chain for model creation, search tools, and third-party services, including encryption, storage, and fallback logic.

**Trigger conditions:**
- Adding BYOK support for a new provider
- Modifying key resolution logic
- Working on key encryption/decryption
- Adding a new tool service that needs API keys
- Debugging "API key not found" errors

**Why it's critical:** API key resolution follows different paths for different use cases: model creation (`getEffectiveApiKey`), provider search tools (dynamic import with key), and Exa fallback (`getEffectiveToolKey`). The resolution chain is: user BYOK key → env var → error. Keys are AES-256-GCM encrypted in the Convex `userKeys` table. An agent adding a new provider must update the `envKeyMap` in route.ts, the `userKeys` schema, and potentially `lib/tools/third-party.ts` for tool-specific keys.

**Key sections:**
- Resolution chain: `getEffectiveApiKey(providerId, userKeys)` → decryption → fallback to env var
- Key storage: Convex `userKeys` table, AES-256-GCM encryption via `lib/user-keys.ts`
- Provider-to-env mapping: `envKeyMap` in route.ts
- Tool-specific keys: `getEffectiveToolKey` for Exa and other third-party services
- Adding BYOK for a new provider (checklist: envKeyMap, openproviders factory, UI settings)
- Security: key never exposed to client, decrypted server-side only

**Overlap analysis:** The `add-ai-provider` skill likely covers some of this for provider addition, but not the full resolution chain or tool-specific keys.

**Priority:** P2 — Relevant when adding providers or tools with API keys.

---

#### 12. `ai-sdk-telemetry`

**Description:** Implement OpenTelemetry-based observability for LLM calls using the AI SDK's experimental telemetry API, replacing or augmenting the current PostHog-based analytics.

**Trigger conditions:**
- Adding observability to LLM calls
- Setting up tracing infrastructure
- Replacing PostHog analytics with OpenTelemetry
- Debugging LLM call performance
- Adding custom telemetry attributes

**Why it's critical:** NaW currently uses PostHog for analytics via manual instrumentation in route.ts callbacks. The SDK provides built-in OpenTelemetry spans for all LLM operations (`ai.generateText`, `ai.streamText`, `ai.toolCall`) with automatic token tracking, timing metrics, and step tracing. An agent tasked with "adding observability" would likely add more manual PostHog calls instead of enabling the SDK's built-in telemetry.

**Key sections:**
- Enabling telemetry: `experimental_telemetry: { isEnabled: true, functionId, metadata }`
- Span types: `ai.streamText` (parent), `ai.streamText.doGenerate` (per-step), `ai.toolCall`
- Streaming metrics: `msToFirstChunk`, `msToFinish`, `avgCompletionTokensPerSecond`
- Custom attributes via `metadata` parameter
- Privacy controls: `recordInputs: false`, `recordOutputs: false`
- Custom tracer instance for non-global configurations
- Integration with common backends (Jaeger, Datadog, etc.)
- Migration path from PostHog to OpenTelemetry

**Overlap analysis:** Not covered by any existing skill.

**Priority:** P2 — Valuable for production observability but not blocking any current workflow.

---

#### 13. `output-specifications`

**Description:** Use AI SDK v6 Output specifications (Output.object, Output.array, Output.choice, Output.json) with streamText for structured data generation, streaming partial objects, and element-by-element array streaming.

**Trigger conditions:**
- Generating structured data from LLM responses
- Building classification or categorization features
- Streaming structured data (partial objects, array elements)
- Replacing deprecated generateObject/streamObject calls
- Combining structured output with tool calling

**Why it's critical:** v6 deprecated `generateObject` and `streamObject` in favor of `output` specifications on `generateText`/`streamText`. The new pattern supports multiple output types (object, array, choice, json, text) with streaming variants (partialOutputStream, elementStream). An agent trained on v5 would use the deprecated APIs. Key gotcha: output generation counts as one step in the execution model, so it interacts with `stopWhen` and `prepareStep`.

**Key sections:**
- Output types: `Output.object({ schema })`, `Output.array({ schema })`, `Output.choice({ values })`, `Output.json()`, `Output.text()`
- Schema support: Zod, Valibot, JSON Schema
- Streaming patterns: `partialOutputStream` (incomplete objects), `elementStream` (complete array elements)
- Error handling: `AI_NoObjectGeneratedError` with text/response/usage/cause
- Schema hints: `.describe("...")` for better generation quality
- Integration with tool calling: output + tools in same request
- Property descriptions for schema guidance
- Gotcha: output generation counts as a step

**Overlap analysis:** The `ai-sdk-v6` skill mentions `Output.object` briefly but doesn't cover array, choice, json, streaming patterns, or the step interaction.

**Priority:** P2 — Useful when building structured data features.

---

#### 14. `custom-ui-message-stream`

**Description:** Build custom streaming responses using createUIMessageStream and UIMessageStreamWriter for multi-model orchestration, conditional streaming, and non-streamText data injection.

**Trigger conditions:**
- Orchestrating multiple LLM calls in a single stream
- Injecting custom data into the stream (e.g., costs, metadata)
- Building a multi-step pipeline with different models per step
- Creating a custom streaming endpoint that doesn't use streamText directly
- Chaining streamText calls with sendFinish/sendStart control

**Why it's critical:** NaW's route.ts uses `streamText().toUIMessageStreamResponse()` directly, but more complex patterns (like multi-model orchestration or injecting custom data between steps) require `createUIMessageStream` with the `UIMessageStreamWriter`. The writer supports `write(chunk)` for individual parts and `merge(stream)` for combining streams. Key pattern: chaining `streamText` calls with `sendFinish: false` / `sendStart: false` to create seamless multi-step streams.

**Key sections:**
- `createUIMessageStream({ execute: async ({ writer }) => ... })`: low-level stream creation
- `createUIMessageStreamResponse({ stream })`: wrapping stream in HTTP Response
- `UIMessageStreamWriter`: `write(chunk)` and `merge(stream)` methods
- Multi-model orchestration pattern: step1.toUIMessageStream({ sendFinish: false }) → merge → step2.toUIMessageStream({ sendStart: false })
- Custom data injection: `writer.write({ type: 'data-${name}', data })` with transient flag
- Error handling: `writer.onError` and stream error propagation
- `consumeSseStream` for tee-ing streams (logging/debugging)
- Required headers: `x-vercel-ai-ui-message-stream: v1`

**Overlap analysis:** The `multiple-tool-calling-design-pattern` skill shows a conceptual multi-model pattern but doesn't cover the implementation details.

**Priority:** P2 — Advanced pattern for future multi-model orchestration features.

---

## Summary

| # | Skill | Priority | Category |
|---|-------|----------|----------|
| 1 | `history-adaptation-system` | **P0** | Codebase-specific |
| 2 | `streaming-ui-lifecycle` | **P0** | Codebase + SDK |
| 3 | `provider-reasoning-config` | **P0** | Codebase + SDK |
| 4 | `add-tool-layer` | P1 | Codebase-specific |
| 5 | `mcp-integration` | P1 | Codebase-specific |
| 6 | `chat-state-management` | P1 | Codebase-specific |
| 7 | `ai-sdk-middleware` | P1 | SDK feature |
| 8 | `provider-registry-pattern` | P1 | SDK feature |
| 9 | `useChat-transport-patterns` | P1 | SDK + Codebase |
| 10 | `anonymous-user-flow` | P2 | Codebase-specific |
| 11 | `byok-key-resolution` | P2 | Codebase-specific |
| 12 | `ai-sdk-telemetry` | P2 | SDK feature |
| 13 | `output-specifications` | P2 | SDK feature |
| 14 | `custom-ui-message-stream` | P2 | SDK feature |
