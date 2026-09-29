import { getWorkosSession } from "@/lib/auth/workos"
import { resolveGuestIdentity } from "@/lib/guest-identity"
import { getToolDimensionForError } from "@/lib/observability/chat-error-taxonomy"
import * as Sentry from "@sentry/nextjs"
import { after } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  admitServerSideUsage,
  createGuestTurnAdmission,
  validateAndResolveChatCredential,
} from "./api"
import { createChatTurnRuntime } from "./chat-turn-runtime"
import { preflightDurableGenerationInput } from "./durable-generation-input"
import { PublicChatHttpError } from "./public-http-error"
import { maxDuration, POST } from "./route"

vi.mock("@sentry/nextjs", () => ({
  setTag: vi.fn(),
  setContext: vi.fn(),
  setConversationId: undefined,
  captureException: vi.fn(),
  startSpan: vi.fn((_opts: unknown, cb: () => unknown) => cb()),
}))

vi.mock("@/lib/models/model-id-migration", () => ({
  resolveModelId: vi.fn((model: string) => model),
}))

vi.mock("@/lib/auth/workos", () => ({
  getWorkosSession: vi.fn(),
}))

vi.mock("@/lib/observability/chat-error-taxonomy", async (importActual) => {
  const actual =
    await importActual<
      typeof import("@/lib/observability/chat-error-taxonomy")
    >()
  return {
    ...actual,
    classifyChatError: vi.fn(() => "unknown"),
  }
})

vi.mock("@/lib/guest-identity", () => ({
  resolveGuestIdentity: vi.fn(),
}))

vi.mock("next/server", () => ({
  after: vi.fn(),
}))

vi.mock("./api", () => ({
  admitServerSideUsage: vi.fn(),
  createGuestTurnAdmission: vi.fn(),
  validateAndResolveChatCredential: vi.fn(),
}))

// Key-settings prefetch and stranded-reservation release use convex/nextjs;
// unit tests must never hit the network.
vi.mock("convex/nextjs", () => ({
  fetchQuery: vi.fn(async () => []),
  fetchMutation: vi.fn(async () => undefined),
}))

vi.mock("./chat-turn-runtime", () => ({
  createChatTurnRuntime: vi.fn(),
}))

vi.mock("./durable-generation-input", () => ({
  preflightDurableGenerationInput: vi.fn(),
}))

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

function makeRequest(): Request {
  return new Request("http://test.local/api/chat", {
    method: "POST",
    headers: { "x-vercel-ip-timezone": "America/Chicago" },
    body: JSON.stringify({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
      ],
      chatId: "3f2c6c1e-8b0d-4a3f-9a6e-1c2b3d4e5f60",
      model: "test-model",
    }),
  })
}

function makeGuestRequest(clientGuestId: string): Request {
  return new Request("http://test.local/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
      ],
      chatId: "3f2c6c1e-8b0d-4a3f-9a6e-1c2b3d4e5f60",
      model: "test-model",
      userId: clientGuestId,
    }),
  })
}

const canonicalMessages = [
  {
    id: "canonical-u1",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "canonical hello" }],
  },
]

function makeGenerationInput() {
  return {
    inputHash: "a".repeat(64),
    messages: canonicalMessages,
    textFileStats: {
      convertedCount: 0,
      failedCount: 0,
      truncatedCount: 0,
      skippedCount: 0,
    },
  }
}

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkosSession).mockResolvedValue({
      user: { id: "user-1" },
      accessToken: "convex-token",
    } as Awaited<ReturnType<typeof getWorkosSession>>)
    vi.mocked(validateAndResolveChatCredential).mockResolvedValue({
      route: {
        modelId: "test-model",
        routeId: "test-model",
        providerId: "openai",
        upstreamModelId: "test-model",
        credentialSource: "byok",
        routeReason: "priority_byok",
      },
      credential: {
        provider: "openai",
        apiKey: "test-key",
        source: "byok",
      },
    })
    vi.mocked(preflightDurableGenerationInput).mockResolvedValue(
      makeGenerationInput()
    )
  })

  afterEach(() => {
    consoleErrorSpy.mockClear()
    consoleWarnSpy.mockClear()
  })

  it("keeps the literal maxDuration in agreement with the execution budget", async () => {
    // Next.js statically analyzes segment config, so route.ts cannot import
    // the budget module's value — this pin is the agreement.
    const { CHAT_ROUTE_MAX_DURATION_SECONDS } =
      await import("@/lib/chat-turn/execution-budget")
    expect(maxDuration).toBe(CHAT_ROUTE_MAX_DURATION_SECONDS)
  })

  it("admits before credential resolution and passes one credential snapshot to the runtime", async () => {
    const order: string[] = []
    const generationInput = makeGenerationInput()
    const admission = {
      route: {
        modelId: "test-model",
        routeId: "test-model",
        providerId: "openai",
        upstreamModelId: "test-model",
        credentialSource: "byok",
        routeReason: "priority_byok",
      },
      credential: {
        provider: "openai",
        apiKey: "credential-snapshot",
        source: "byok",
      },
    } as const
    vi.mocked(admitServerSideUsage).mockImplementation(async () => {
      order.push("admit")
    })
    vi.mocked(preflightDurableGenerationInput).mockImplementation(async () => {
      order.push("preflight")
      return generationInput
    })
    vi.mocked(validateAndResolveChatCredential).mockImplementation(async () => {
      order.push("resolve")
      return admission
    })
    const prepare = vi.fn(async () => {
      order.push("prepare")
    })
    const toResponse = vi.fn(async () => {
      order.push("response")
      return new Response("ok")
    })
    vi.mocked(createChatTurnRuntime).mockImplementation((args) => {
      order.push("runtime")
      expect(args.input.credential).toBe(admission.credential)
      expect(args.input.route).toBe(admission.route)
      expect(args.input.generationInput).toBe(generationInput)
      expect(args.input.requestTimeZone).toBe("America/Chicago")
      return { prepare, toResponse, fail: vi.fn() }
    })

    const response = await POST(makeRequest())

    expect(await response.text()).toBe("ok")
    expect(order).toEqual([
      "admit",
      "preflight",
      "resolve",
      "runtime",
      "prepare",
      "response",
    ])
    expect(validateAndResolveChatCredential).toHaveBeenCalledWith({
      model: "test-model",
      isAuthenticated: true,
      workosUserId: "user-1",
      token: "convex-token",
      messages: canonicalMessages,
      requestId: expect.any(String),
      chatId: "3f2c6c1e-8b0d-4a3f-9a6e-1c2b3d4e5f60",
      systemPrompt: undefined,
      enableSearch: false,
      keySettingsPromise: expect.any(Promise),
      perf: expect.anything(),
    })
  })

  it("returns the original fallback response when turn.fail throws", async () => {
    const originalError = new PublicChatHttpError({
      message: "Public request failure",
      code: "INVALID_REQUEST",
      statusCode: 502,
    })
    const failError = new Error("cleanup failed")
    const fail = vi.fn(async () => {
      throw failError
    })
    vi.mocked(createChatTurnRuntime).mockReturnValue({
      prepare: vi.fn(async () => {
        throw originalError
      }),
      toResponse: vi.fn(),
      fail,
    })

    const response = await POST(makeRequest())

    await expect(response.json()).resolves.toEqual({
      error: "Public request failure",
      code: "INVALID_REQUEST",
    })
    expect(response.status).toBe(502)
    expect(fail).toHaveBeenCalledWith(originalError)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"_tag":"chat_turn_fail_failed"')
    )
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"errorMessage":"cleanup failed"')
    )
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Error", message: "cleanup failed" }),
      {
        tags: {
          route: "api/chat",
          chat_model: "test-model",
          chat_is_authenticated: "true",
          chat_error_type: "unknown",
          chat_error_has_tool_signal: getToolDimensionForError("unknown"),
          chat_failure_stage: "turn_fail",
        },
        extra: {
          requestId: expect.any(String),
          model: "test-model",
          errorType: "unknown",
          isAuthenticated: true,
          messageCount: 1,
          originalErrorName: "PublicChatHttpError",
        },
      }
    )
  })

  it("redacts an unbranded statusCode error at the route boundary", async () => {
    const unsafe = Object.assign(new Error("ENCRYPTED_CONTENT_HTTP_SENTINEL"), {
      statusCode: 400,
      code: "PROVIDER_ERROR",
    })
    vi.mocked(createChatTurnRuntime).mockReturnValue({
      prepare: vi.fn(async () => {
        throw unsafe
      }),
      toResponse: vi.fn(),
      fail: vi.fn(),
    })

    const response = await POST(makeRequest())
    expect(response.status).toBe(500)
    const body = await response.text()
    expect(body).not.toContain("ENCRYPTED_CONTENT_HTTP_SENTINEL")
    expect(body).toContain("INTERNAL_ERROR")
  })

  it("returns the preflight malformed-chat contract before credential resolution", async () => {
    vi.mocked(preflightDurableGenerationInput).mockRejectedValueOnce(
      new PublicChatHttpError({
        message: "Request does not reference a valid durable chat",
        statusCode: 400,
        code: "INVALID_REQUEST",
      })
    )

    const response = await POST(makeRequest())

    await expect(response.json()).resolves.toEqual({
      error: "Request does not reference a valid durable chat",
      code: "INVALID_REQUEST",
    })
    expect(response.status).toBe(400)
    expect(validateAndResolveChatCredential).not.toHaveBeenCalled()
    expect(admitServerSideUsage).toHaveBeenCalledOnce()
    expect(createChatTurnRuntime).not.toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it("returns malformed message envelopes as a quiet 400 before admission", async () => {
    const response = await POST(
      new Request("http://test.local/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ id: "u1", role: "user" }],
          chatId: "3f2c6c1e-8b0d-4a3f-9a6e-1c2b3d4e5f60",
          model: "test-model",
        }),
      })
    )

    await expect(response.json()).resolves.toEqual({
      error: "Messages are invalid",
      code: "INVALID_REQUEST",
    })
    expect(response.status).toBe(400)
    expect(admitServerSideUsage).not.toHaveBeenCalled()
    expect(validateAndResolveChatCredential).not.toHaveBeenCalled()
    expect(createChatTurnRuntime).not.toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it("returns expected admission refusals without capturing them", async () => {
    vi.mocked(validateAndResolveChatCredential).mockRejectedValueOnce(
      new PublicChatHttpError({
        message: "This model requires authentication.",
        statusCode: 401,
        code: "AUTH_REQUIRED",
      })
    )

    const response = await POST(makeRequest())

    await expect(response.json()).resolves.toEqual({
      error: "This model requires authentication.",
      code: "AUTH_REQUIRED",
    })
    expect(response.status).toBe(401)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  describe("guest turns (ADR-0045)", () => {
    const cookieGuest = { guestId: "guest_cookie", networkKey: "network-key" }

    beforeEach(() => {
      vi.mocked(getWorkosSession).mockResolvedValue({
        user: null,
      } as Awaited<ReturnType<typeof getWorkosSession>>)
      vi.mocked(resolveGuestIdentity).mockResolvedValue(cookieGuest)
    })

    it("keys guest admission on the signed cookie, never the body's anonymous id", async () => {
      const admit = vi.fn(async () => {})
      const release = vi.fn(async () => {})
      vi.mocked(createGuestTurnAdmission).mockReturnValue({ admit, release })
      vi.mocked(createChatTurnRuntime).mockReturnValue({
        prepare: vi.fn(async () => {}),
        toResponse: vi.fn(async () => new Response("ok")),
        fail: vi.fn(),
      })

      await POST(makeGuestRequest("guest_client_a"))
      await POST(makeGuestRequest("guest_client_rotated"))

      for (const call of vi.mocked(createGuestTurnAdmission).mock.calls) {
        expect(call[0]).toEqual({
          guest: cookieGuest,
          requestId: expect.any(String),
        })
      }
      expect(admit).toHaveBeenCalledTimes(2)
      expect(admitServerSideUsage).not.toHaveBeenCalled()
      for (const [args] of vi.mocked(createChatTurnRuntime).mock.calls) {
        expect(args.input).toMatchObject({
          userId: "guest_cookie",
          anonymousId: "guest_cookie",
        })
      }
      // The response-end hook frees the concurrency slot.
      const onResponseEnd = vi.mocked(after).mock.calls[0]?.[0]
      expect(typeof onResponseEnd).toBe("function")
      if (typeof onResponseEnd === "function") await onResponseEnd()
      expect(release).toHaveBeenCalledOnce()
    })

    it("fails closed when the guest limiter store is unavailable", async () => {
      vi.mocked(createGuestTurnAdmission).mockReturnValue({
        admit: vi.fn(async () => {
          throw new Error("fetch failed")
        }),
        release: vi.fn(async () => {}),
      })

      const response = await POST(makeGuestRequest("guest_client_a"))

      expect(response.status).toBe(500)
      expect(validateAndResolveChatCredential).not.toHaveBeenCalled()
      expect(createChatTurnRuntime).not.toHaveBeenCalled()
    })
  })

  it("returns 400 for malformed JSON without capturing to Sentry", async () => {
    const response = await POST(
      new Request("http://test.local/api/chat", {
        method: "POST",
        body: "{",
      })
    )

    await expect(response.json()).resolves.toEqual({
      error: "Request body is not valid JSON",
      code: "INVALID_REQUEST",
    })
    expect(response.status).toBe(400)
    expect(createChatTurnRuntime).not.toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
