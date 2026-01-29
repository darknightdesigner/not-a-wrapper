# Testing Guidelines

> **Last Updated:** January 2026  
> **Status:** Testing infrastructure planned, not yet implemented

## Testing Strategy

For AI/chat applications with non-deterministic outputs, we focus testing on **critical paths only**. This prevents brittle tests while ensuring core functionality works reliably.

### Testing Priority Matrix

| Testing Type | Priority | What to Test |
|--------------|----------|--------------|
| **Type Checking (`tsc`)** | 🔴 Critical | All code |
| **Linting (`eslint`)** | 🔴 Critical | All code |
| **Unit Tests (Vitest)** | 🟠 High | Auth, data transforms, rate limiting |
| **E2E Tests (Playwright)** | 🟠 High | Core user flows (before launch) |
| **Integration Tests** | 🟡 Medium | External APIs (after stable) |

### What to Skip

- ❌ Snapshot testing for AI responses (too brittle)
- ❌ Visual regression testing (premature optimization)
- ❌ Testing AI response quality (monitor in production instead)
- ❌ Extensive mocking of AI providers (test integration, not mocks)

## Test Structure

### File Organization

```
app/
├── components/
│   └── chat/
│       ├── chat.tsx
│       └── chat.test.tsx          # Colocated tests
├── api/
│   └── chat/
│       ├── route.ts
│       └── route.test.ts          # API route tests

lib/
├── utils.ts
└── utils.test.ts                  # Utility tests

tests/                             # E2E and integration tests
├── e2e/
│   ├── auth.spec.ts
│   └── chat.spec.ts
└── integration/
    └── youtube-api.test.ts
```

### Test File Naming

| Source File | Test File |
|-------------|-----------|
| `component.tsx` | `component.test.tsx` |
| `use-hook.ts` | `use-hook.test.ts` |
| `route.ts` | `route.test.ts` |
| E2E tests | `*.spec.ts` |

## Unit Testing

### Framework: Vitest

```typescript
// example.test.ts
import { describe, it, expect, vi } from "vitest"

describe("validateAndTrackUsage", () => {
  describe("when user is authenticated", () => {
    it("should validate usage when under limit", async () => {
      // Arrange
      const mockUser = { id: "user-123", daily_message_count: 5 }
      
      // Act
      const result = await validateAndTrackUsage({
        userId: mockUser.id,
        model: "gpt-4.1-nano",
        isAuthenticated: true,
      })
      
      // Assert
      expect(result).toBeDefined()
    })
    
    it("should throw when daily limit exceeded", async () => {
      // Arrange
      const mockUser = { id: "user-123", daily_message_count: 1000 }
      
      // Act & Assert
      await expect(
        validateAndTrackUsage({
          userId: mockUser.id,
          model: "gpt-4.1-nano",
          isAuthenticated: true,
        })
      ).rejects.toThrow("Daily message limit exceeded")
    })
  })
})
```

### Critical Paths to Test

#### 1. Authentication Flows

```typescript
describe("Auth", () => {
  it("should create guest session for unauthenticated users")
  it("should validate OAuth callback tokens")
  it("should refresh expired sessions")
  it("should handle logout cleanup")
})
```

#### 2. Rate Limiting

```typescript
describe("Rate Limiting", () => {
  it("should enforce daily message limits for guests")
  it("should enforce higher limits for authenticated users")
  it("should reset limits at midnight Pacific")
  it("should track pro model usage separately")
})
```

#### 3. Data Transformations

```typescript
describe("Message Handling", () => {
  it("should sanitize user input")
  it("should format messages for AI SDK")
  it("should handle attachment metadata")
  it("should truncate oversized content")
})
```

#### 4. Error Handling

```typescript
describe("Error Handling", () => {
  it("should return structured error responses")
  it("should not expose internal errors to client")
  it("should log errors with context")
})
```

## E2E Testing

### Framework: Playwright

<!-- TODO: Implement after core features stable -->

```typescript
// tests/e2e/chat.spec.ts
import { test, expect } from "@playwright/test"

test.describe("Chat Flow", () => {
  test("should send and receive messages", async ({ page }) => {
    // Navigate to app
    await page.goto("/")
    
    // Send a message
    await page.fill('[data-testid="chat-input"]', "Hello")
    await page.click('[data-testid="send-button"]')
    
    // Verify response appears
    await expect(page.locator('[data-testid="assistant-message"]'))
      .toBeVisible({ timeout: 30000 })
  })
  
  test("should persist chat history", async ({ page }) => {
    // Create chat
    await page.goto("/")
    await page.fill('[data-testid="chat-input"]', "Test message")
    await page.click('[data-testid="send-button"]')
    
    // Navigate away and back
    await page.goto("/")
    
    // Verify chat appears in history
    await expect(page.locator('[data-testid="chat-history-item"]'))
      .toHaveCount(1)
  })
})
```

### Critical User Flows

| Flow | Priority | When to Test |
|------|----------|--------------|
| Sign up / Login | 🔴 Critical | Before launch |
| Send chat message | 🔴 Critical | Before launch |
| View chat history | 🟠 High | Before launch |
| Change AI model | 🟡 Medium | Post-launch |
| File upload | 🟡 Medium | Post-launch |

## Integration Testing

### External APIs

<!-- TODO: Implement after YouTube API integration -->

```typescript
// tests/integration/youtube-api.test.ts
describe("YouTube Data API", () => {
  it("should fetch video metadata by ID", async () => {
    const result = await fetchVideoMetadata("dQw4w9WgXcQ")
    
    expect(result).toMatchObject({
      title: expect.any(String),
      description: expect.any(String),
      viewCount: expect.any(Number),
    })
  })
  
  it("should handle quota exceeded errors gracefully")
  it("should retry on transient failures")
})
```

## Mocking Guidelines

### When to Mock

- ✅ External services in unit tests (Convex, AI providers)
- ✅ Time-dependent functions (`Date.now()`, timers)
- ✅ Environment-specific code (browser APIs)

### When NOT to Mock

- ❌ Simple utility functions
- ❌ Internal module boundaries
- ❌ AI responses (test at integration level instead)

### Mock Patterns

```typescript
// Mock Convex client
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
  useConvex: vi.fn(),
}))

// Mock time
vi.useFakeTimers()
vi.setSystemTime(new Date("2026-01-14"))

// Mock environment
vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud")
```

## Running Tests

### Commands

```bash
# Type checking (always run first)
bun run type-check

# Linting
bun run lint

# Unit tests (when implemented)
bun test                          # Run all tests
bun test src/lib/utils.test.ts   # Run specific test
bun test --watch                 # Watch mode

# E2E tests (when implemented)
bun run test:e2e                 # Run all E2E tests
bun run test:e2e --headed        # Run with browser visible
```

### CI Integration

```yaml
# .github/workflows/ci-cd.yml
jobs:
  validate:
    steps:
      - run: npm run lint
      - run: npm run type-check
      # TODO: Uncomment when tests are added
      # - run: npm test
```

## Coverage Requirements

### Minimum Coverage Goals

| Category | Target | Rationale |
|----------|--------|-----------|
| **Auth flows** | 90% | Security-critical |
| **Rate limiting** | 90% | Business-critical |
| **Data transforms** | 80% | Correctness matters |
| **UI components** | 50% | Visual, harder to test |
| **AI integration** | 0% | Non-deterministic |

### Coverage Commands

```bash
# Generate coverage report (when implemented)
bun test --coverage

# View coverage in browser
open coverage/index.html
```

## Test Data

### Fixtures

```typescript
// tests/fixtures/users.ts
export const mockAuthenticatedUser = {
  id: "user-123",
  email: "test@example.com",
  daily_message_count: 5,
  premium: false,
}

export const mockPremiumUser = {
  ...mockAuthenticatedUser,
  premium: true,
}

// tests/fixtures/messages.ts
export const mockUserMessage = {
  role: "user" as const,
  content: "Hello!",
  chat_id: "chat-123",
}
```

### Test Data Rules

1. Never use real user data in tests
2. Use deterministic IDs (not UUIDs) for easier debugging
3. Keep fixtures minimal and focused
4. Document fixture purpose in comments

---

*See `@docs/agents-research.md` for testing strategy rationale and `@AGENTS.md` for gold standard examples.*
