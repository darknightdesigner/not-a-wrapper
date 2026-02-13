import { describe, expect, it } from "vitest"
import { anthropicReplayCompiler } from "../compilers/anthropic"
import type { ReplayMessage } from "../types"

const context = {
  targetModelId: "claude-4.5-sonnet",
  hasTools: true,
}

describe("anthropicReplayCompiler", () => {
  it("compiles normalized replayable web_search tool-exchange to Anthropic tool part", async () => {
    const messages: ReplayMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Let me check." },
          {
            type: "tool-exchange",
            tool: {
              toolName: "web_search",
              toolCallId: "tc-1",
              state: "output-available",
              replayable: true,
              webSearch: {
                query: "Batman figures",
                rawShape: "object-action-sources",
                providerOrigin: "openai",
                results: [
                  {
                    url: "https://example.com/figure",
                    title: "Figure Listing",
                    snippet: "Popular Batman item",
                  },
                ],
              },
            },
          },
        ],
      },
    ]

    const result = await anthropicReplayCompiler.compileReplay(messages, context)

    expect(result.warnings).toHaveLength(0)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe("assistant")
    expect(result.messages[0].parts).toEqual([
      { type: "text", text: "Let me check." },
      {
        type: "tool-web_search",
        state: "output-available",
        toolName: "web_search",
        toolCallId: "tc-1",
        providerExecuted: true,
        input: { query: "Batman figures" },
        output: [
          {
            url: "https://example.com/figure",
            title: "Figure Listing",
            snippet: "Popular Batman item",
          },
        ],
      },
    ])
    expect(result.stats.toolExchangesSeen).toBe(1)
    expect(result.stats.toolExchangesCompiled).toBe(1)
    expect(result.stats.toolExchangesDropped).toBe(0)
  })

  it("drops unknown-shape/non-replayable tool safely and adds fallback text warning", async () => {
    const messages: ReplayMessage[] = [
      {
        id: "msg-2",
        role: "assistant",
        parts: [
          {
            type: "tool-exchange",
            tool: {
              toolName: "web_search",
              toolCallId: "tc-2",
              state: "output-available",
              replayable: false,
              nonReplayableReason: "Unsupported web_search output shape.",
              webSearch: {
                query: "Batman masks",
                rawShape: "unknown",
                providerOrigin: "openai",
                results: [],
              },
            },
          },
        ],
      },
    ]

    const result = await anthropicReplayCompiler.compileReplay(messages, context)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].parts).toEqual([
      {
        type: "text",
        text: 'Replay note: web_search for "Batman masks" was omitted for Anthropic-safe replay.',
      },
    ])
    expect(result.warnings.some((warning) => warning.code === "tool_non_replayable")).toBe(true)
    expect(result.stats.toolExchangesSeen).toBe(1)
    expect(result.stats.toolExchangesCompiled).toBe(0)
    expect(result.stats.toolExchangesDropped).toBe(1)
  })
})
