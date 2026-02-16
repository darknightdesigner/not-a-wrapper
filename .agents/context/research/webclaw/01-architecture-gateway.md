# WebClaw Architecture, Gateway Protocol & Code Quality

> **Agent**: Agent 1 — Architecture & Code Quality + OpenClaw Protocol
> **Phase**: 1 (parallel)
> **Status**: Complete
> **Date**: February 15, 2026

---

## Summary

WebClaw is an intentionally minimal web client for the OpenClaw AI gateway, built with TanStack Start (Nitro/Vite), TanStack Router, React 19, and Tailwind CSS 4. Its architecture is defined by a single design principle: **the gateway is the source of truth**. The entire server layer is one file (`server/gateway.ts`, ~350 lines) that implements a WebSocket client to the OpenClaw Gateway protocol — connection pooling, RPC, and Server-Sent Event streaming. There is no database, no ORM, no auth service. The client is stateless; all persistence, session management, and AI orchestration live in the self-hosted OpenClaw Gateway process. This makes the codebase exceptionally small (~80 commits) and focused, but also entirely dependent on the OpenClaw ecosystem. The screen-based module pattern (`screens/chat/`) bundles components, hooks, types, queries, and utilities into self-contained feature modules — a pattern worth studying for NaW's growing complexity.

---

## 1. TanStack Start/Router Setup

### How Routing Is Configured

WebClaw uses **TanStack Start** (`@tanstack/react-start ^1.132.0`) with **TanStack Router** (`@tanstack/react-router ^1.132.0`) and **Vite 7** as the bundler. The build pipeline:

```
Vite 7 → @tanstack/react-start/plugin/vite (tanstackStart()) → Nitro server runtime
```

**Source**: `apps/webclaw/vite.config.ts`

```typescript
const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
```

Key observations:
- **No explicit Nitro config** — the `tanstackStart()` plugin handles the server runtime. A comment in the source says "nitro plugin removed (tanstackStart handles server runtime)."
- **Path aliasing via two mechanisms**: `vite-tsconfig-paths` plugin + `tsconfig.json` paths (`@/*` → `./src/*`). This is redundant but ensures consistency between Vite's dev server and TypeScript's module resolution.
- **Tailwind CSS 4** is loaded as a Vite plugin (`@tailwindcss/vite`), not PostCSS.

### File-Based Routing

TanStack Router uses file-based routing via `@tanstack/router-plugin`. Route files in `src/routes/` are auto-scanned and produce `routeTree.gen.ts` — an auto-generated file that maps file paths to route objects with full type safety.

**Route tree** (from `routeTree.gen.ts`):

| Route | File | Purpose |
|-------|------|---------|
| `/` | `routes/index.tsx` | Redirect → `/chat/main` |
| `/connect` | `routes/connect.tsx` | Gateway connection setup page |
| `/new` | `routes/new.tsx` | Redirect → `/chat/new` |
| `/chat/$sessionKey` | `routes/chat/$sessionKey.tsx` | Main chat view (dynamic param) |
| `/api/stream` | `routes/api/stream.ts` | SSE event stream endpoint |
| `/api/sessions` | `routes/api/sessions.ts` | Session CRUD (GET/POST/PATCH/DELETE) |
| `/api/send` | `routes/api/send.ts` | Send message to gateway |
| `/api/ping` | `routes/api/ping.ts` | Gateway health check |
| `/api/history` | `routes/api/history.ts` | Chat history fetch |
| `/api/paths` | `routes/api/paths.ts` | Filesystem paths (debug) |

**Key pattern**: The `__root.tsx` file uses `createRootRoute()` to define the shell document, global layout, and 404 handler. It also creates the `QueryClient` singleton:

```typescript
export const Route = createRootRoute({
  head: () => ({ meta: [...], links: [...] }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: RootNotFound,
})

const queryClient = new QueryClient()

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}
```

The `shellComponent` is a TanStack Start concept — it renders the full HTML document shell (html, head, body) for SSR, separate from the `component` which renders the app layout.

### Route Loaders vs Server Handlers

TanStack Start introduces a **server handler pattern** distinct from Next.js API routes. Instead of separate route handlers, server logic is co-located with the route definition:

```typescript
export const Route = createFileRoute('/api/ping')({
  server: {
    handlers: {
      GET: async () => {
        await gatewayConnectCheck()
        return json({ ok: true })
      },
    },
  },
})
```

The `server.handlers` object maps HTTP methods directly. There's no middleware chain — each handler is self-contained. This is simpler than Next.js API routes but also less composable.

**WebClaw does NOT use route loaders** (`loader` / `beforeLoad` data fetching). The only `beforeLoad` usage is for **redirects**:

```typescript
// routes/index.tsx
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'main' },
      replace: true,
    })
  },
})
```

All data fetching happens client-side via TanStack Query, not server-side via route loaders. This is a deliberate choice — the gateway WebSocket connection is the data transport, not HTTP fetches during SSR.

---

## 2. The Server/Client Boundary

### Architecture: One Server File

The entire server layer is `apps/webclaw/src/server/gateway.ts` (~350 lines). There are no other server-side files. The API route files (`routes/api/*.ts`) contain `server.handlers` blocks, but these are thin HTTP wrappers that delegate entirely to `gateway.ts` functions.

**Server-side functions exported by `gateway.ts`**:

| Export | Purpose | Pattern |
|--------|---------|---------|
| `gatewayRpc<T>()` | One-shot RPC: open WS → connect → send → receive → close | Fire-and-forget |
| `gatewayRpcShared<T>()` | RPC via shared client (reuse existing connection if available) | Connection pooling |
| `acquireGatewayClient()` | Acquire a long-lived client with event subscription | Ref-counted pooling |
| `gatewayEventStream()` | Open a dedicated WS for event streaming (returns close fn) | Event subscription |
| `gatewayConnectCheck()` | One-shot connect → close (health check) | Probe |

### Connection Pooling: The Shared Client Map

The core pattern is a **reference-counted connection pool** using a module-level `Map`:

```typescript
const sharedGatewayClients = new Map<string, GatewayClientEntry>()

type GatewayClientEntry = {
  key: string
  refs: number        // reference count
  client: GatewayClient
}
```

When `acquireGatewayClient(key)` is called:
1. If a client for `key` exists and isn't closed, increment `refs` and return it
2. Otherwise, create a new `GatewayClient`, connect, store it in the Map
3. The returned handle includes a `release()` function that decrements `refs`
4. When `refs` reaches 0, the client is closed and removed from the Map

**Implication**: The connection pool is **per-process, in-memory**. In a serverless environment (like Vercel), this would break because each invocation is a new process. TanStack Start with Nitro runs as a **long-lived server process**, so the pool persists across requests. This is a fundamental architectural difference from NaW's serverless API routes.

### The RPC Pattern

Every gateway interaction follows the same pattern:

1. Open WebSocket to `CLAWDBOT_GATEWAY_URL` (default `ws://127.0.0.1:18789`)
2. Send `connect` request with auth (token or password)
3. Wait for `res` with `ok: true`
4. Send the actual RPC request
5. Wait for matching `res` (matched by `id` field)
6. Close (or keep alive if using shared client)

The `createGatewayWaiter()` utility manages response matching:

```typescript
function createGatewayWaiter(): GatewayWaiter {
  const waiters = new Map<string, { resolve, reject }>()
  
  function waitForRes(id: string) {
    return new Promise((resolve, reject) => {
      waiters.set(id, { resolve, reject })
    })
  }
  
  function handleMessage(evt: MessageEvent) {
    const parsed = JSON.parse(evt.data)
    if (parsed.type !== 'res') return
    const w = waiters.get(parsed.id)
    if (!w) return
    waiters.delete(parsed.id)
    if (parsed.ok) w.resolve(parsed.payload)
    else w.reject(new Error(parsed.error?.message ?? 'gateway error'))
  }
  
  return { waitForRes, handleMessage }
}
```

This is essentially a **correlation ID pattern** — each request gets a UUID, and the waiter matches responses by that UUID.

### Event Streaming: SSE Bridge

The `/api/stream` endpoint bridges WebSocket events to **Server-Sent Events (SSE)**:

```
Client (browser) ←SSE← TanStack Start server ←WebSocket← OpenClaw Gateway
```

The stream route:
1. Creates a `ReadableStream` with SSE encoding
2. Acquires a shared gateway client with `onEvent` handler
3. Each gateway event is forwarded as an SSE `data:` frame
4. A 15-second heartbeat keeps the connection alive
5. On abort, releases the client and closes the stream

This SSE bridge pattern is notable — it translates the gateway's push-based WebSocket protocol into a browser-compatible event stream without requiring the browser to maintain its own WebSocket. The server maintains the persistent WebSocket; the browser only needs `EventSource`.

### Auth Handshake

Gateway auth is minimal: a shared token or password set via environment variables.

```typescript
function getGatewayConfig() {
  const url = process.env.CLAWDBOT_GATEWAY_URL?.trim() || 'ws://127.0.0.1:18789'
  const token = process.env.CLAWDBOT_GATEWAY_TOKEN?.trim() || ''
  const password = process.env.CLAWDBOT_GATEWAY_PASSWORD?.trim() || ''
  
  if (!token && !password) {
    throw new Error('Missing gateway auth...')
  }
  return { url, token, password }
}
```

The connect params identify WebClaw as an `operator` role client with `operator.admin` scope:

```typescript
function buildConnectParams(token, password): ConnectParams {
  return {
    minProtocol: 3, maxProtocol: 3,
    client: {
      id: 'gateway-client',
      displayName: 'webclaw',
      version: 'dev',
      platform: process.platform,
      mode: 'ui',
      instanceId: randomUUID(),
    },
    auth: { token: token || undefined, password: password || undefined },
    role: 'operator',
    scopes: ['operator.admin'],
  }
}
```

**Notable**: WebClaw does NOT implement device identity signing (the `device` field with keypair fingerprint). The protocol spec says the Control UI can omit device identity when `gateway.controlUi.allowInsecureAuth` is enabled. This is a simplification for the local-first use case.

---

## 3. The OpenClaw Gateway WebSocket Protocol

### Protocol Overview

The OpenClaw Gateway protocol is a **typed JSON-over-WebSocket RPC + event system**. All clients (CLI, web UI, macOS app, iOS/Android nodes) connect over WebSocket and declare their role at handshake time.

**Transport**: WebSocket, text frames with JSON payloads. First frame **must** be a `connect` request.

### Frame Types

| Frame Type | Direction | Structure | Purpose |
|-----------|-----------|-----------|---------|
| `req` | Client → Gateway | `{type:"req", id, method, params}` | RPC request |
| `res` | Gateway → Client | `{type:"res", id, ok, payload\|error}` | RPC response |
| `event` | Gateway → Client | `{type:"event", event, payload, seq?, stateVersion?}` | Push notification |

### Handshake Flow

```
1. Gateway → Client: event:connect.challenge (nonce + timestamp)
2. Client → Gateway: req:connect (protocol version, client info, auth, role, scopes)
3. Gateway → Client: res:connect (hello-ok, policy, optional device token)
```

**Note**: WebClaw's `gateway.ts` does NOT handle the `connect.challenge` event. It sends the `connect` request immediately after WebSocket open. This works because local connections can bypass the challenge-response flow (only non-local connections must sign the nonce).

### Protocol Version Negotiation

Clients send `minProtocol` and `maxProtocol` (both currently `3`). The server rejects mismatches. Protocol schemas are defined in TypeBox and generated via codegen (`pnpm protocol:gen`, `pnpm protocol:gen:swift`).

### Roles and Scopes

| Role | Purpose | Examples |
|------|---------|----------|
| `operator` | Control plane client | CLI, web UI, macOS app |
| `node` | Capability host | iOS/Android devices, camera, screen capture |

Operator scopes: `operator.read`, `operator.write`, `operator.admin`, `operator.approvals`, `operator.pairing`.

Nodes declare capabilities, commands, and permissions at connect time (e.g., `camera.capture`, `screen.record`).

### Key RPC Methods Used by WebClaw

From the API routes and gateway.ts, WebClaw uses these gateway methods:

| Method | Used In | Purpose |
|--------|---------|---------|
| `connect` | All connections | Handshake |
| `sessions.list` | `/api/sessions` GET | List all sessions |
| `sessions.patch` | `/api/sessions` POST/PATCH | Create/update session |
| `sessions.resolve` | Multiple routes | Resolve friendlyId → sessionKey |
| `sessions.delete` | `/api/sessions` DELETE | Delete session |
| `chat.history` | `/api/history` GET | Fetch message history |
| `chat.send` | `/api/send` POST | Send message + trigger agent |
| `chat.subscribe` | `gatewayEventStream()` | Subscribe to session events |

### Session Management

Sessions are identified by two IDs:
- **`sessionKey`**: The canonical internal key (e.g., `agent:main:default:dm:main`)
- **`friendlyId`**: A human-readable UUID assigned by WebClaw for URL routing

The `sessions.resolve` method maps `friendlyId` → `sessionKey`. This dual-ID pattern exists because gateway session keys are opaque internal identifiers not suitable for URLs.

### Event Streaming Protocol

After connecting and subscribing to a session (`chat.subscribe`), the gateway pushes `event` frames. Chat events include:

| Field | Values | Meaning |
|-------|--------|---------|
| `state` | `delta` | Streaming token |
| `state` | `final` | Generation complete |
| `state` | `error` | Generation failed |
| `state` | `aborted` | Generation cancelled |
| `runId` | UUID | Identifies a specific agent run |

WebClaw tracks active `runId`s to know when generation is complete (timeout: 120 seconds).

### What the Gateway Abstraction Buys

Compared to NaW's direct-provider streaming via Vercel AI SDK:

**Advantages**:
1. **Multi-channel bridging**: Same agent accessible from WhatsApp, Telegram, Discord, web, macOS, iOS — not just a web UI
2. **Unified session management**: Gateway owns sessions, history, compaction, pruning
3. **Agent orchestration**: Tool use, sub-agents, sandboxing, approval flows all server-side
4. **No provider credentials on client**: Client only needs gateway token
5. **Model failover**: Gateway handles provider routing and failover

**Costs**:
1. **Single point of failure**: Gateway must be running for anything to work
2. **Latency**: Extra hop (browser → TanStack server → gateway → provider → back)
3. **Complexity**: Must self-host and maintain the gateway process
4. **Limited client customization**: Client can't switch providers/models per-message independently
5. **No multi-model comparison**: One agent, one model at a time (vs NaW's multi-model comparison)

---

## 4. Screen-Based Module Pattern

### Structure

WebClaw organizes features into **screen modules** — self-contained directories that bundle everything a feature needs:

```
screens/chat/
├── chat-screen.tsx          # Main orchestrating component
├── chat-screen-utils.ts     # Screen-specific utilities
├── chat-queries.ts          # TanStack Query keys, fetchers, cache helpers
├── chat-ui.ts               # UI state (via TanStack Query cache)
├── pending-send.ts          # Optimistic send state (module-level singleton)
├── session-tombstones.ts    # Deleted session tracking (module-level singleton)
├── types.ts                 # All TypeScript types for the feature
├── utils.ts                 # Pure utility functions
├── components/              # UI components (chat-sidebar, chat-header, etc.)
│   ├── chat-sidebar.tsx
│   ├── chat-header.tsx
│   ├── chat-message-list.tsx
│   ├── chat-composer.tsx
│   ├── gateway-status-message.tsx
│   └── ...
└── hooks/                   # Custom hooks (13+ focused hooks)
    ├── use-chat-stream.ts
    ├── use-chat-history.ts
    ├── use-chat-sessions.ts
    ├── use-chat-error-state.ts
    ├── use-chat-generation-guard.ts
    ├── use-chat-measurements.ts
    ├── use-chat-mobile.ts
    ├── use-chat-pending-send.ts
    ├── use-chat-redirect.ts
    ├── use-chat-settings.ts (global)
    ├── use-delete-session.ts
    ├── use-rename-session.ts
    └── use-session-shortcuts.ts
```

### Assessment

**Strengths**:
- **Locality**: Everything related to "chat" is in one directory. No hunting across `components/`, `hooks/`, `lib/`, `types/` directories.
- **Clear boundaries**: The `ChatScreen` component is the only export consumed by routes. Internal components and hooks are not used elsewhere.
- **Co-located types**: `types.ts` defines all domain types in one place, not scattered across files.
- **Co-located queries**: `chat-queries.ts` puts all TanStack Query keys, fetchers, and cache manipulation in one file. This is the equivalent of a "data access layer" for the feature.
- **State modules as singletons**: `pending-send.ts` and `session-tombstones.ts` use module-level state (not React state or Zustand stores) for ephemeral coordination state. This avoids unnecessary re-renders for state that doesn't need to trigger UI updates.

**Weaknesses**:
- **Single screen app**: WebClaw only has one screen (chat), so the pattern hasn't been tested with multiple competing screens sharing common state.
- **Monolithic orchestrator**: `chat-screen.tsx` is ~400 lines and imports 13+ hooks. While each hook is small, the orchestration logic in the screen component is complex.
- **Some global hooks**: `use-chat-settings` and `use-export` live outside `screens/chat/` in a global `hooks/` directory. This creates a fuzzy boundary about what's "screen-local" vs "app-global."

**NaW comparison**: NaW scatters chat-related code across `app/components/chat/`, `lib/chat-store/`, `app/api/chat/`, with types defined inline or in various files. The screen module pattern would consolidate this. However, NaW's multi-page architecture (chat, projects, share, settings) means we'd need clear rules about shared state across screens.

---

## 5. Route Structure Details

### Page Routes

**`/` (index)**: Pure redirect to `/chat/main`. The `IndexRoute` component renders "Loading…" as a fallback that should never be seen.

**`/connect`**: Static page with setup instructions. No data fetching. Renders code blocks explaining how to set environment variables for gateway auth. This page is shown when the gateway is unreachable.

**`/new`**: Pure redirect to `/chat/new`. Separate route exists so `/new` is a clean URL for "new chat."

**`/chat/$sessionKey`**: The main application view. Uses a dynamic parameter `$sessionKey` (TanStack Router's param syntax, equivalent to Next.js `[sessionKey]`). The route component:
1. Reads the `sessionKey` param
2. Handles "new" as a special case (new chat)
3. Manages session resolution (friendlyId → sessionKey)
4. Renders `<ChatScreen>` with resolved session props

**Key pattern**: Session resolution happens in the route component, not the screen component. When a new session is created, the route calls `moveHistoryMessages()` to transfer optimistic messages from the "new" cache key to the resolved session's cache key, then navigates to the resolved URL.

### API Routes

All API routes follow the same pattern: thin HTTP handlers that delegate to `gateway.ts`:

```
Browser → fetch('/api/X') → TanStack Start server handler → gateway.ts → OpenClaw Gateway WS
```

| Route | Methods | Gateway Methods |
|-------|---------|----------------|
| `/api/ping` | GET | `connect` (then close) |
| `/api/sessions` | GET, POST, PATCH, DELETE | `sessions.list`, `sessions.patch`, `sessions.resolve`, `sessions.delete` |
| `/api/history` | GET | `sessions.resolve`, `chat.history` |
| `/api/send` | POST | `sessions.resolve`, `chat.send` |
| `/api/stream` | GET (SSE) | `acquireGatewayClient`, `chat.subscribe` |
| `/api/paths` | GET | None (reads env vars / filesystem) |

**Notable patterns**:
- **`/api/sessions` POST**: Creates sessions by generating a `friendlyId` (UUID), calling `sessions.patch` to register it, then `sessions.resolve` to ensure it's queryable. This is a two-step create pattern.
- **`/api/send` POST**: Includes `idempotencyKey` in the gateway request for safe retries. Also forwards `thinking` level from settings.
- **`/api/stream` GET**: The SSE bridge uses `acquireGatewayClient` for shared connections, so multiple SSE consumers for the same session share one gateway WebSocket.
- **`/api/paths` GET**: Exposes local filesystem paths for the agent's sessions directory. This is a debug/admin endpoint tied to the self-hosted nature.

---

## 6. Code Conventions

### From AGENTS.md

WebClaw's `AGENTS.md` mandates these conventions:

#### Functions
> Always use the `function` keyword. Avoid `const` for function definitions.

Evidence in code: Every function in `gateway.ts`, `chat-queries.ts`, `utils.ts`, `pending-send.ts` uses `function` declarations. Named function expressions are used for callbacks where TanStack Query expects a function name for devtools:

```typescript
queryClient.setQueryData(queryKey, function update(data: unknown) { ... })
```

This convention produces better stack traces and React DevTools labels.

#### Types
> Always use `type T = { ... }`. Do not use `interface`.

Evidence: Every type definition across all examined files uses `type`, never `interface`. Example from `types.ts`:

```typescript
export type GatewayMessage = {
  role?: string
  content?: Array<MessageContent>
  ...
}
```

#### File Naming
> Use `kebab-case` for all files (e.g., `chat-screen.tsx`, `use-session.ts`).

Evidence: All files follow kebab-case: `chat-screen.tsx`, `chat-queries.ts`, `use-chat-stream.ts`, `gateway-status-message.tsx`, `session-tombstones.ts`.

#### No useEffect for Render Logic
> NEVER use useEffect for anything that can be expressed as render logic.

Evidence: The `chat-screen.tsx` uses `useEffect` only for cleanup (unmount). Derived state is computed inline:

```typescript
const shouldRedirectToNew =
  !isNewChat &&
  !forcedSessionKey &&
  !isRecentSession(activeFriendlyId) &&
  sessionsQuery.isSuccess &&
  !sessions.some((s) => s.friendlyId === activeFriendlyId) &&
  (missingSessionError || (!historyQuery.isFetching && !historyQuery.isSuccess))
```

#### CSS Utility
> MUST use `cn` utility (clsx + tailwind-merge) for class logic.

The `cn` function is the standard `clsx + twMerge` pattern (identical to Shadcn's implementation):

```typescript
export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}
```

#### UI Conventions
- **Typography**: Never bolder than `font-medium`. Use `text-balance` for headings, `text-pretty` for body.
- **Colors**: Custom Tailwind palette only. No `bg-white`, `bg-black`, etc.
- **Icons**: `size={20}`, `strokeWidth={1.5}` consistently (using Hugeicons).
- **Sizing**: Use `size-*` for squares instead of `w-* + h-*`.
- **Z-index**: Fixed scale, no arbitrary `z-*`.
- **React 19 refs**: Direct ref passing, no `forwardRef`.

### Conventions Assessment for NaW Adoption

| Convention | NaW Current | Recommendation | Rationale |
|-----------|------------|----------------|-----------|
| `function` keyword always | Mixed (arrow + function) | **ADAPT** | Better stack traces, consistent style. But NaW has existing arrow function patterns. |
| `type` never `interface` | Mixed | **ADOPT** | `type` is more flexible (unions, intersections). NaW already trends this way. |
| kebab-case files | Already using | **ALREADY ADOPTED** | NaW already uses kebab-case. |
| No useEffect for render logic | Inconsistent | **ADOPT** | Directly aligns with React 19 / React Compiler best practices. |
| `cn` utility | Already using | **ALREADY ADOPTED** | Same pattern. |
| font-medium max weight | Not enforced | **SKIP** | Aesthetic preference, not a code quality issue. |
| `text-balance`/`text-pretty` | Partially used | **ADAPT** | Good typography practice, adopt where applicable. |
| `size-*` for squares | Not enforced | **ADOPT** | Cleaner Tailwind, reduces class count. |

---

## 7. Testing Strategy

### What's Configured

- **Vitest** (`vitest ^3.0.5`) with `jsdom` environment
- **Testing Library**: `@testing-library/dom ^10.4.0`, `@testing-library/react ^16.2.0`
- **Scripts**: `pnpm -C apps/webclaw test` runs `vitest run`
- **Web Vitals**: `web-vitals ^5.1.0` is in devDependencies (likely for performance monitoring, not testing)

### What's Tested

**Unknown**. No test files were found at the standard locations checked (`*.test.ts`, `*.test.tsx`, `*.spec.ts`). The Vitest config exists and the test command is defined, but the test suite appears minimal or empty based on the ~80-commit repository age.

### What's NOT Tested

Based on the codebase structure, the following are clearly untested:
- Gateway WebSocket client logic (connection pooling, RPC, event streaming)
- TanStack Query cache manipulation (optimistic updates, cache moves)
- Session resolution logic (friendlyId → sessionKey mapping)
- Component rendering
- Hook behavior

### Assessment

WebClaw's testing strategy is **aspirational** — the infrastructure is in place but the test suite appears minimal. This is consistent with the CONTRIBUTING.md philosophy: "keep changes small and focused" and "avoid adding heavy dependencies or complexity." For a ~80-commit, single-developer project, this is understandable but would not scale.

**NaW comparison**: NaW also has a gap between testing infrastructure (Vitest) and actual test coverage. Both projects would benefit from testing critical paths (optimistic updates, streaming state machines, error handling).

---

## 8. Monorepo Structure

### Workspace Layout

```
webclaw-monorepo/
├── package.json          # Root workspace config (pnpm 9.15.4, lefthook)
├── pnpm-workspace.yaml   # Workspace definition
├── apps/
│   ├── webclaw/          # Main web application
│   └── landing/          # Landing page site
└── packages/
    └── webclaw/          # CLI installer package (published to npm)
```

### Root Package

```json
{
  "name": "webclaw-monorepo",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "pnpm -C apps/webclaw dev",
    "build": "pnpm -C apps/webclaw build",
    "landing:dev": "pnpm -C apps/landing dev",
    "release:webclaw": "pnpm -C packages/webclaw exec npm publish --access public",
    "postinstall": "lefthook install"
  },
  "devDependencies": {
    "lefthook": "^1.11.1"
  }
}
```

### CLI Package (`packages/webclaw`)

The CLI is a minimal installer published to npm as `webclaw@0.1.1`:

```json
{
  "name": "webclaw",
  "version": "0.1.1",
  "bin": { "webclaw": "bin/webclaw.js" },
  "files": ["bin", "README.md"],
  "engines": { "node": ">=20.0.0" }
}
```

Zero dependencies — the CLI script is self-contained. Published via `pnpm -C packages/webclaw exec npm publish --access public`.

### Monorepo Tooling

- **pnpm workspaces** for package management
- **Lefthook** for git hooks (installed via `postinstall`)
- **No Turborepo** — scripts use `pnpm -C` for direct package targeting
- **No shared packages** between apps and packages

**Assessment**: This is the simplest possible monorepo. No shared component library, no shared types, no build orchestration. Each package is fully independent. This works because:
1. The web app is self-contained (no shared code with CLI)
2. The CLI is just an installer script
3. The landing page is separate marketing content

---

## 9. Signs of Tech Debt or Architectural Strain

### 1. Session Key Resolution Complexity

The dual-ID system (`sessionKey` vs `friendlyId`) creates resolution logic scattered across multiple files:
- `routes/api/sessions.ts`: resolves in POST, PATCH, DELETE handlers
- `routes/api/send.ts`: resolves before sending
- `routes/api/history.ts`: resolves before fetching
- `screens/chat/utils.ts`: `deriveFriendlyIdFromKey()` as fallback
- `routes/chat/$sessionKey.tsx`: manages resolution and URL updates

Each API route independently implements the "resolve friendlyId then use sessionKey" pattern. This suggests the gateway's session key format was not designed for web URL routing, and WebClaw bolted on a friendlyId layer that requires consistent resolution everywhere.

### 2. Pending Send as Module-Level State

`pending-send.ts` uses module-level variables (`let pendingSend`, `let pendingGeneration`, `let recentSession`). This works in a single-page app but:
- Cannot be serialized for SSR
- Cannot be shared across tabs
- Cannot be inspected in React DevTools
- Would break if the module is hot-reloaded during development

This is a pragmatic choice to avoid React state re-renders, but it's a pattern that doesn't scale.

### 3. Tombstone Expiry by Polling

`session-tombstones.ts` uses a TTL-based tombstone system (8-second TTL) where expired tombstones are only cleaned up when `filterSessionsWithTombstones()` is called. There's no background cleanup timer. If sessions are deleted but the filter isn't called for a while, tombstones accumulate.

### 4. chat-screen.tsx Complexity

The main screen component is ~400 lines with 13+ hooks, ~10 state variables, and complex derived state logic. While each hook is small, the orchestrating component has become the "god component" that wires everything together. The `sendMessage` function alone is ~60 lines of inline logic.

### 5. No Error Boundaries

No evidence of React Error Boundaries. If the gateway connection fails mid-stream, the entire chat UI could crash without graceful degradation.

### 6. Hardcoded Protocol Version

`minProtocol: 3, maxProtocol: 3` is hardcoded in `buildConnectParams()`. No config for protocol version negotiation, which would break if the gateway updates its protocol.

### 7. No Reconnection Strategy

`gateway.ts` does not implement WebSocket reconnection. If the connection drops:
- `createGatewayClient`: the `handleClose` callback rejects all pending waiters, but doesn't attempt reconnect
- `gatewayEventStream`: the close handler sets `closed = true` but doesn't retry
- SSE consumers would stop receiving events with no automatic recovery

The browser-side would need to detect the broken SSE connection and re-establish it. This is a significant gap for production use.

---

## Evidence Table

| claim_id | claim | evidence_type | source_refs | confidence | impact_area | transferability | notes |
|----------|-------|---------------|-------------|------------|-------------|-----------------|-------|
| WC-A1-C01 | Gateway.ts is the only server file; entire server layer is ~350 lines | Code | `apps/webclaw/src/server/gateway.ts` | High | Architecture | Non-transferable | NaW has multiple API routes + Convex; single-file server is gateway-specific |
| WC-A1-C02 | Connection pooling uses ref-counted Map with acquire/release pattern | Code | `gateway.ts` lines: `sharedGatewayClients`, `acquireGatewayClient`, `releaseGatewayClient` | High | Architecture | Adaptable | Pattern is useful for any shared resource (DB connections, etc.), but NaW uses serverless |
| WC-A1-C03 | WebSocket events are bridged to SSE for browser consumption | Code | `routes/api/stream.ts` | High | Streaming | Adaptable | NaW uses Vercel AI SDK streaming; SSE bridge is a different pattern |
| WC-A1-C04 | OpenClaw protocol uses req/res/event JSON framing with UUID correlation | Docs + Code | `docs.openclaw.ai/gateway/protocol`, `gateway.ts` | High | Architecture | Non-transferable | Protocol-specific to OpenClaw |
| WC-A1-C05 | Screen-based module pattern bundles components, hooks, types, queries in one directory | Code / Convention | `screens/chat/` directory structure | High | Architecture / DX | Directly Transferable | Same React + TanStack Query stack; pattern lifts directly |
| WC-A1-C06 | WebClaw uses `type` never `interface`, `function` keyword always, kebab-case files | Convention | `AGENTS.md`, verified across all source files | High | DX | Directly Transferable | Convention, no tech dependency |
| WC-A1-C07 | No route loaders used; all data fetching is client-side via TanStack Query | Code | `routes/index.tsx`, `routes/chat/$sessionKey.tsx` — no `loader` exports | High | Architecture | Adaptable | NaW uses server components; client-only fetch is a different trade-off |
| WC-A1-C08 | Testing infrastructure exists (Vitest + Testing Library) but test coverage appears minimal | Code / Convention | `package.json` devDependencies, no test files found | Medium | DX | Directly Transferable | Both projects could improve testing |
| WC-A1-C09 | Dual session ID system (sessionKey vs friendlyId) creates resolution complexity in every API route | Code | `routes/api/sessions.ts`, `routes/api/send.ts`, `routes/api/history.ts` | High | Architecture | Non-transferable | Gateway-specific complexity |
| WC-A1-C10 | Module-level state for ephemeral coordination (pending-send, tombstones) avoids React re-render overhead | Code / Pattern | `pending-send.ts`, `session-tombstones.ts` | High | Performance | Adaptable | Pattern useful for state that doesn't need to trigger UI updates |
| WC-A1-C11 | No WebSocket reconnection strategy in gateway client | Code | `gateway.ts` — `handleClose` rejects waiters but doesn't reconnect | High | Architecture | Non-transferable | WebSocket-specific concern |
| WC-A1-C12 | TanStack Start server handlers co-locate HTTP endpoint logic with route definition | Code | `routes/api/stream.ts`, `routes/api/sessions.ts` | High | Architecture | Adaptable | Similar to Next.js route handlers but co-located with the route file |
| WC-A1-C13 | Chat screen is ~400 lines orchestrating 13+ hooks — growing complexity | Code | `screens/chat/chat-screen.tsx` | High | Architecture | Directly Transferable | Same pattern of hook composition; cautionary example |
| WC-A1-C14 | Monorepo is minimal: pnpm workspaces, no Turborepo, no shared packages | Code | Root `package.json`, `packages/webclaw/package.json` | High | DX | Non-transferable | NaW is single-package |

---

## Uncertainty & Falsification

### Top 3 Unresolved Questions

1. **What does the test suite actually contain?** No test files were found at standard locations, but the test infrastructure exists. There may be tests in non-standard locations or the test command may run against a separate test directory. **Evidence needed**: Full directory listing of `apps/webclaw/src/` or running `pnpm test`.

2. **How does the gateway handle reconnection in practice?** The client code has no reconnection logic, but the browser-side SSE consumer (EventSource) may auto-reconnect, and the server-side stream route may create new gateway connections on reconnect. **Evidence needed**: Browser-side event stream consumption code (likely in `use-chat-stream.ts`).

3. **Is there an `app.config.ts` for TanStack Start?** The file was not found at the expected location. TanStack Start may use a different config mechanism or rely entirely on the Vite plugin. **Evidence needed**: Check if `tanstackStart()` accepts inline config in `vite.config.ts`.

### Falsification Criteria

- If WebClaw has significant test coverage in non-standard locations, claim WC-A1-C08 would change from "minimal" to "moderate"
- If the gateway client implements reconnection via the SSE layer (browser reconnects → new server WS), claim WC-A1-C11's severity decreases
- If TanStack Start route loaders are used in uncommitted/branch code, claim WC-A1-C07 about client-only fetching may be a temporary state

### Inference-Based Claims

- WC-A1-C08 (test coverage): Based on not finding test files via raw GitHub URLs. Could be wrong if tests are in a directory not checked.
- WC-A1-C11 (no reconnection): Based on absence of reconnection code. The OpenClaw Gateway may handle this at a different layer.

---

## Recommendations Preview

### 1. ADOPT — Screen-Based Module Pattern
**Transferability**: Directly Transferable | **Evidence**: WC-A1-C05

Consolidate `app/components/chat/`, relevant parts of `lib/chat-store/`, and chat-specific types into a `screens/chat/` (or `features/chat/`) module. This would:
- Improve locality and discoverability
- Clarify the boundary between chat-specific and app-global code
- Make it easier to understand the full chat feature at a glance

**Risk if wrong**: Minor directory reorganization; easily reversible.

### 2. ADOPT — `type` Over `interface` Convention
**Transferability**: Directly Transferable | **Evidence**: WC-A1-C06

Standardize on `type` for all TypeScript type definitions. NaW already trends this way but isn't consistent. `type` is more flexible (supports unions, intersections, mapped types) and aligns with the broader React ecosystem preference.

**Risk if wrong**: None — purely aesthetic/consistency change.

### 3. ADAPT — Module-Level Ephemeral State for Non-Rendering Coordination
**Transferability**: Adaptable | **Evidence**: WC-A1-C10

For state that coordinates behavior but shouldn't trigger re-renders (e.g., pending generation tracking, tombstones), consider module-level variables or a Zustand store with `subscribeWithSelector` instead of React state. NaW's optimistic update system could benefit from this pattern for transient coordination state.

**Risk if wrong**: Harder to debug (not visible in React DevTools). Could cause subtle bugs if state gets out of sync.

### 4. SKIP — TanStack Start / Nitro Server Runtime
**Transferability**: Non-transferable | **Evidence**: WC-A1-C01, WC-A1-C12

TanStack Start's server handler pattern is interesting but NaW is committed to Next.js App Router. The patterns are conceptually different (co-located handlers vs. separate route files). Not worth architectural disruption.

### 5. ADAPT — Named Function Expressions for Query Functions
**Transferability**: Directly Transferable | **Evidence**: WC-A1-C06

WebClaw uses named function expressions for TanStack Query callbacks:

```typescript
queryClient.setQueryData(key, function update(data) { ... })
```

This produces better stack traces and React Query Devtools labels. Worth adopting for NaW's TanStack Query usage without mandating `function` keyword everywhere.

**Risk if wrong**: Slight verbosity. No real downside.

---

*Research completed February 15, 2026. Based on WebClaw repository at `main` branch (~80 commits), OpenClaw docs at docs.openclaw.ai, and Not A Wrapper codebase on branch `am-i-in-over-my-head`.*
