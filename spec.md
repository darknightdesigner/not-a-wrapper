# Project Specification

Not A Wrapper — Open-source multi-AI chat application with unified model interface.

---

## Product Vision

Provide a powerful AI chat interface that lets users interact with any AI model through a unified experience, with support for multi-model comparison and BYOK.

---

## Requirements

### Functional Requirements

#### Phase 1: Core Chat (Current)
- [x] User authentication (Clerk)
- [x] Multi-model AI chat (Vercel AI SDK)
- [x] Chat history persistence
- [x] Streaming responses
- [x] Convex database integration
- [x] Multi-model comparison (side-by-side)
- [x] BYOK (Bring Your Own Key) support
#### Phase 2: Enhanced Features
- [ ] Model performance analytics
- [ ] Response quality comparison tools
- [ ] Smart model routing (cost/speed optimization)
- [ ] Model chains and workflows

#### Phase 3: Advanced Capabilities
- [ ] Custom system prompts per model
- [ ] Conversation branching
- [ ] Export/import conversations
- [ ] API access for developers

#### Phase 4: Monetization
- [ ] Flowglad payment integration
- [ ] Subscription tiers (Free/Pro/Enterprise)
- [ ] Usage-based billing for API calls

### Non-Functional Requirements

| Requirement | Target | Priority |
|-------------|--------|----------|
| Response time (streaming start) | < 500ms | High |
| Uptime | 99.9% | High |
| Context window efficiency | < 80% usage | Medium |
| Mobile responsiveness | Full support | Medium |

---

## Architecture Decisions

### Database: Convex

**Decision**: Use Convex for real-time data

**Rationale**:
- Built-in RAG and vector search for AI memory
- Real-time reactive queries (essential for chat)
- TypeScript-first (matches our stack)
- Native Clerk integration

**Trade-offs**:
- ❌ No local development (cloud-only)
- ❌ Vendor lock-in (proprietary)
- ✅ Faster development for AI features
- ✅ Better developer experience

### Auth: Clerk

**Decision**: Use Clerk for authentication

**Rationale**:
- Pre-built UI components
- Native integrations: Convex, Flowglad
- Handles OAuth complexity
- Good free tier for MVP

### AI: Multi-Provider via Vercel AI SDK

**Decision**: Abstract AI providers through Vercel AI SDK

**Rationale**:
- Switch models without code changes
- Consistent streaming API
- Future-proof for new models

**Model Selection**:
| Use Case | Model | Reason |
|----------|-------|--------|
| Primary chat | Claude Opus 4.5 | Best reasoning, 1M context |
| Fast tasks | Claude Haiku 4.5 | Speed, cost efficiency |
| Vision tasks | Claude Sonnet 4.5 | Good balance, vision support |

### Payments: Flowglad

**Decision**: Use Flowglad over Stripe

**Rationale**:
- Open-source
- Native Clerk integration
- Better DX for subscription management
- Designed for AI usage-based billing

---

## Data Models

### Core Entities

```typescript
// convex/schema.ts

// User - Managed by Clerk, synced to Convex
interface User {
  clerkId: string
  email: string
  name?: string
  subscriptionTier: "free" | "pro" | "enterprise"
  createdAt: number
}

// Chat
interface Chat {
  _id: Id<"chats">
  userId: string
  title: string
  model?: string
  createdAt: number
  updatedAt: number
}

// Message
interface Message {
  _id: Id<"messages">
  chatId: Id<"chats">
  role: "user" | "assistant" | "system"
  content: string
  model?: string
  tokens?: number
  createdAt: number
}

// UserKeys (BYOK)
interface UserKey {
  _id: Id<"userKeys">
  userId: string
  provider: string
  encryptedKey: string
  createdAt: number
}
```

### Relationships

```
User (1) ──→ (n) Chat
Chat (1) ──→ (n) Message
User (1) ──→ (n) UserKey
```

---

## API Contracts

### Chat API

#### POST /api/chat
Stream a chat completion.

**Request**:
```typescript
{
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
  model?: string  // Default: gpt-4.1-nano
  chatId?: string // For persistence
}
```

**Response**: Server-Sent Events (streaming)

#### GET /api/chat/history
Get user's chat history.

**Response**:
```typescript
{
  chats: Array<{
    id: string
    title: string
    lastMessage: string
    updatedAt: string
  }>
}
```

---

## Testing Strategy

### What to Test

| Category | Priority | Approach |
|----------|----------|----------|
| Auth flows | 🔴 Critical | Integration tests |
| Data transforms | 🔴 Critical | Unit tests |
| Rate limiting | 🔴 Critical | Unit tests |
| API routes | 🟠 High | Integration tests |
| Chat persistence | 🟠 High | Integration tests |
| UI interactions | 🟡 Medium | E2E (Playwright) |

### What NOT to Test

- AI response quality (non-deterministic)
- UI rendering/snapshots (too brittle)
- Animation timing
- Third-party API responses (mock them)

---

## Success Criteria

### MVP (Phase 1)
- [x] Users can sign up and chat with AI
- [x] Chat history persists across sessions
- [x] Multiple AI models available
- [x] Response time < 500ms to first token

### Growth (Phase 2-3)
- [ ] 1,000 active users
- [ ] Multi-model comparison feature adoption
- [ ] < 5% monthly churn
- [ ] NPS > 40

---

## Open Questions

1. **Model routing**: How to automatically select best model for task?
2. **Caching strategy**: Cache responses for identical prompts?
3. **Privacy**: How long to retain user chat data?
4. **International**: Multi-language UI support timeline?

---

*See `plan.md` for implementation roadmap.*
