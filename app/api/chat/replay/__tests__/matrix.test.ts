import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"
import { adaptHistoryForProvider } from "../../adapters"

function findAssistant(messages: UIMessage[]): UIMessage | undefined {
  return messages.find((message) => message.role === "assistant")
}

describe("replay compiler matrix", () => {
  it("OpenAI -> Anthropic compiles action/sources web_search payloads without fallback", async () => {
    const history: UIMessage[] = [
      {
        id: "msg-matrix-o2a-user",
        role: "user",
        parts: [{ type: "text", text: "Find Batman links." }],
      } as UIMessage,
      {
        id: "msg-matrix-o2a-assistant",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "reasoning", reasoning: "Searching for links.", state: "done" },
          {
            type: "tool-web_search",
            state: "output-available",
            toolCallId: "tc_matrix_o2a_1",
            toolName: "web_search",
            providerExecuted: true,
            input: { query: "Batman Amazon links" },
            output: {
              action: "search",
              sources: [
                {
                  url: "https://www.amazon.com/s?k=batman",
                  title: "Amazon Batman",
                  snippet: "Batman product search results",
                },
              ],
            },
            callProviderMetadata: {
              openai: { responseId: "msg_matrix_openai", reasoningId: "rs_matrix_openai" },
            },
          },
          { type: "text", text: "I found Amazon links." },
        ],
      } as UIMessage,
    ]

    const result = await adaptHistoryForProvider(
      history,
      "anthropic",
      { targetModelId: "claude-opus-4-6", hasTools: true },
      { useReplayCompiler: true },
    )
    const assistant = findAssistant(result.messages)
    const toolPart = assistant?.parts.find((part) => part.type === "tool-web_search") as
      | { output?: unknown }
      | undefined

    expect(result.warnings.some((warning) => warning.code === "replay_compile_fallback")).toBe(false)
    expect(assistant).toBeDefined()
    expect(assistant?.parts.some((part) => part.type === "text")).toBe(true)
    expect(toolPart).toBeDefined()
    expect(Array.isArray(toolPart?.output)).toBe(true)
  })

  it("Anthropic -> OpenAI preserves reasoning-before-tool replay invariants", async () => {
    const history: UIMessage[] = [
      {
        id: "msg-matrix-a2o-user",
        role: "user",
        parts: [{ type: "text", text: "Can you verify with web search?" }],
      } as UIMessage,
      {
        id: "msg-matrix-a2o-assistant",
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            state: "output-available",
            toolCallId: "tc_matrix_a2o_1",
            toolName: "web_search",
            providerExecuted: true,
            input: { query: "Batman availability" },
            output: [
              {
                url: "https://example.com/batman-availability",
                title: "Availability",
                snippet: "In stock",
              },
            ],
            callProviderMetadata: {
              anthropic: { requestId: "req_matrix_anthropic" },
            },
          },
          { type: "text", text: "Availability checked." },
        ],
      } as UIMessage,
    ]

    const result = await adaptHistoryForProvider(
      history,
      "openai",
      { targetModelId: "gpt-5.2", hasTools: true },
      { useReplayCompiler: true },
    )
    const assistant = findAssistant(result.messages)
    const toolIndex =
      assistant?.parts.findIndex((part) => part.type.startsWith("tool-") || part.type === "dynamic-tool") ?? -1

    expect(result.warnings.some((warning) => warning.code === "replay_compile_fallback")).toBe(false)
    expect(toolIndex).toBeGreaterThan(0)
    expect(
      (assistant?.parts.slice(0, toolIndex) ?? []).some((part) => part.type === "reasoning"),
    ).toBe(true)
  })

  it("OpenAI -> Google falls back to legacy adapter when no replay compiler is registered", async () => {
    const history: UIMessage[] = [
      {
        id: "msg-matrix-o2g-user",
        role: "user",
        parts: [{ type: "text", text: "Find Batman products." }],
      } as UIMessage,
      {
        id: "msg-matrix-o2g-assistant",
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            state: "output-available",
            toolCallId: "tc_matrix_o2g_1",
            toolName: "web_search",
            providerExecuted: true,
            input: { query: "Batman products Amazon" },
            output: {
              action: "search",
              sources: [{ url: "https://www.amazon.com/s?k=batman" }],
            },
            callProviderMetadata: {
              openai: { responseId: "msg_matrix_o2g" },
            },
          },
          { type: "text", text: "I found options." },
        ],
      } as UIMessage,
    ]

    const result = await adaptHistoryForProvider(
      history,
      "google",
      { targetModelId: "gemini-3-pro", hasTools: true },
      { useReplayCompiler: true },
    )

    expect(result.warnings.some((warning) => warning.code === "replay_compile_fallback")).toBe(true)
    expect(result.messages.length).toBeGreaterThan(0)
  })
})
