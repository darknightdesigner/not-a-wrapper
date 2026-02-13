import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"
import { adaptHistoryForProvider } from "../index"
import {
  crossProviderMetadata,
  mixedProviderAndSdkTools,
  multiStepToolChain,
  reasoningPlusText,
  singleProviderExecutedTool,
  singleSdkToolComplete,
  textOnlyConversation,
  textOnlyAssistant,
  userMessage,
} from "./fixtures"

function hasPartType(messages: UIMessage[], type: string): boolean {
  return messages.some((message) => message.parts.some((part) => part.type === type))
}

function getAssistantMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => message.role === "assistant")
}

function assertNoCallProviderMetadata(messages: UIMessage[]): void {
  for (const message of messages) {
    for (const part of message.parts as Array<Record<string, unknown>>) {
      expect("callProviderMetadata" in part).toBe(false)
    }
  }
}

function assertOpenAIAtomicToolStructure(messages: UIMessage[]): void {
  for (const message of getAssistantMessages(messages)) {
    for (let index = 0; index < message.parts.length; index += 1) {
      const part = message.parts[index]
      if (!part) continue

      if (!(part.type.startsWith("tool-") || part.type === "dynamic-tool")) {
        continue
      }

      expect(message.parts.slice(0, index).some((candidate) => candidate.type === "reasoning")).toBe(true)
    }
  }
}

function assertAlternatingRoles(messages: UIMessage[]): void {
  for (let index = 1; index < messages.length; index += 1) {
    expect(messages[index]?.role).not.toBe(messages[index - 1]?.role)
  }
}

function repeatConversation(seed: UIMessage[], times: number): UIMessage[] {
  const repeated: UIMessage[] = []
  for (let batch = 0; batch < times; batch += 1) {
    for (const message of seed) {
      repeated.push({
        ...message,
        id: `${message.id}-batch-${batch}`,
      } as UIMessage)
    }
  }
  return repeated
}

describe("cross-provider replay matrix", () => {
  describe("OpenAI -> Anthropic", () => {
    const provider = "anthropic"
    const context = { targetModelId: "claude-4-opus", hasTools: true }

    it("keeps text-only history unchanged", async () => {
      const result = await adaptHistoryForProvider(textOnlyConversation, provider, context)
      expect(getAssistantMessages(result.messages).every((message) => hasPartType([message], "text"))).toBe(true)
    })

    it("preserves reasoning parts", async () => {
      const result = await adaptHistoryForProvider([reasoningPlusText], provider, context)
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
    })

    it("keeps tool calls and strips cross-provider metadata", async () => {
      const result = await adaptHistoryForProvider([singleProviderExecutedTool], provider, context)
      expect(hasPartType(result.messages, "tool-web_search")).toBe(true)
      assertNoCallProviderMetadata(result.messages)
      expect(result.stats.providerIdsStripped).toBeGreaterThan(0)
    })

    it("keeps reasoning + tool chains", async () => {
      const result = await adaptHistoryForProvider([multiStepToolChain], provider, context)
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
      expect(hasPartType(result.messages, "tool-web_search")).toBe(true)
      expect(hasPartType(result.messages, "tool-exa_search")).toBe(true)
    })

    it("keeps provider-executed and SDK-executed tools", async () => {
      const result = await adaptHistoryForProvider([mixedProviderAndSdkTools], provider, context)
      const parts = result.messages[0]?.parts ?? []
      expect(parts.some((part) => (part as { providerExecuted?: boolean }).providerExecuted === true)).toBe(true)
      expect(parts.some((part) => (part as { providerExecuted?: boolean }).providerExecuted === false)).toBe(
        true,
      )
    })
  })

  describe("Anthropic -> OpenAI", () => {
    const provider = "openai"
    const context = { targetModelId: "gpt-5.2", hasTools: true }

    it("keeps text-only history valid", async () => {
      const result = await adaptHistoryForProvider(textOnlyConversation, provider, context)
      expect(getAssistantMessages(result.messages).every((message) => hasPartType([message], "text"))).toBe(true)
    })

    it("keeps reasoning when paired with text", async () => {
      const result = await adaptHistoryForProvider([reasoningPlusText], provider, context)
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
    })

    it("enforces atomic triples for tool calls", async () => {
      const result = await adaptHistoryForProvider([singleSdkToolComplete], provider, context)
      expect(hasPartType(result.messages, "tool-exa_search")).toBe(true)
      assertOpenAIAtomicToolStructure(result.messages)
    })

    it("enforces atomic triples for reasoning + tool chains", async () => {
      const result = await adaptHistoryForProvider([multiStepToolChain], provider, context)
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
      expect(hasPartType(result.messages, "tool-web_search")).toBe(true)
      assertOpenAIAtomicToolStructure(result.messages)
    })

    it("strips callProviderMetadata from replayed tool parts", async () => {
      const result = await adaptHistoryForProvider([crossProviderMetadata], provider, context)
      assertNoCallProviderMetadata(result.messages)
      expect(result.stats.providerIdsStripped).toBeGreaterThan(0)
    })

    it("handles provider-executed and SDK-executed tools without breaking triples", async () => {
      const result = await adaptHistoryForProvider([mixedProviderAndSdkTools], provider, context)
      assertOpenAIAtomicToolStructure(result.messages)
      assertNoCallProviderMetadata(result.messages)
    })
  })

  describe("OpenAI -> OpenAI", () => {
    const provider = "openai"
    const context = { targetModelId: "gpt-5.2", hasTools: true }

    it("supports same-provider text continuation", async () => {
      const result = await adaptHistoryForProvider(textOnlyConversation, provider, context)
      expect(result.messages.length).toBe(textOnlyConversation.length)
    })

    it("preserves reasoning + tool content while enforcing OpenAI replay shape", async () => {
      const history = [singleProviderExecutedTool, singleSdkToolComplete]
      const result = await adaptHistoryForProvider(history, provider, context)
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
      assertOpenAIAtomicToolStructure(result.messages)
      assertNoCallProviderMetadata(result.messages)
    })
  })

  describe("Anthropic -> Google", () => {
    const provider = "google"
    const context = { targetModelId: "gemini-3-pro", hasTools: true }

    it("preserves reasoning as native-thought candidate content", async () => {
      const result = await adaptHistoryForProvider([reasoningPlusText], provider, context)
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
    })

    it("preserves reasoning + tool chains and validates role alternation", async () => {
      const roleBreakHistory = [
        userMessage("u-google-1", "first user"),
        userMessage("u-google-2", "second user"),
        multiStepToolChain,
      ]
      const result = await adaptHistoryForProvider(roleBreakHistory, provider, context)
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
      assertAlternatingRoles(result.messages)
      expect(
        result.warnings.some((warning) => warning.code === "role_alternation_repaired"),
      ).toBe(true)
    })

    it("injects Gemini 3 thought signatures for tool invocations", async () => {
      const result = await adaptHistoryForProvider([singleSdkToolComplete], provider, context)
      const toolParts = getAssistantMessages(result.messages)
        .flatMap((message) => message.parts)
        .filter((part) => part.type.startsWith("tool-") && part.type !== "tool-result")
      expect(toolParts.length).toBeGreaterThan(0)

      for (const part of toolParts as Array<{ providerMetadata?: { google?: { thoughtSignature?: string } } }>) {
        expect(part.providerMetadata?.google?.thoughtSignature).toBe("skip_thought_signature_validator")
      }
    })
  })

  describe("Perplexity target", () => {
    it("produces text-only output", async () => {
      const result = await adaptHistoryForProvider(
        [singleProviderExecutedTool, singleSdkToolComplete, reasoningPlusText],
        "perplexity",
        { targetModelId: "sonar-pro", hasTools: true },
      )

      for (const message of result.messages) {
        expect(message.parts.every((part) => part.type === "text")).toBe(true)
      }
      expect(hasPartType(result.messages, "reasoning")).toBe(false)
      expect(hasPartType(result.messages, "tool-web_search")).toBe(false)
      expect(hasPartType(result.messages, "tool-exa_search")).toBe(false)
    })
  })

  describe("long history matrix coverage", () => {
    it("handles 50+ message history for high-traffic switches", async () => {
      const longHistory = repeatConversation(textOnlyConversation, 13)
      expect(longHistory.length).toBeGreaterThan(50)

      const openaiToAnthropic = await adaptHistoryForProvider(longHistory, "anthropic", {
        targetModelId: "claude-4-opus",
        hasTools: false,
      })
      const anthropicToOpenai = await adaptHistoryForProvider(longHistory, "openai", {
        targetModelId: "gpt-5.2",
        hasTools: false,
      })

      expect(openaiToAnthropic.messages.length).toBe(longHistory.length)
      expect(anthropicToOpenai.messages.length).toBe(longHistory.length)
    })
  })

  describe("OpenRouter routing", () => {
    it("routes anthropic/* models to AnthropicAdapter behavior", async () => {
      const messages = [reasoningPlusText]
      const direct = await adaptHistoryForProvider(messages, "anthropic", {
        targetModelId: "claude-4-opus",
        hasTools: true,
      })
      const throughOpenRouter = await adaptHistoryForProvider(messages, "openrouter", {
        targetModelId: "anthropic/claude-4-opus",
        hasTools: true,
      })

      expect(throughOpenRouter.messages).toEqual(direct.messages)
      expect(hasPartType(throughOpenRouter.messages, "reasoning")).toBe(true)
    })

    it("routes unknown org models to DefaultAdapter behavior", async () => {
      const messages = [reasoningPlusText, textOnlyAssistant]
      const direct = await adaptHistoryForProvider(messages, "unknown-provider", {
        targetModelId: "meta-llama/llama-4-maverick",
        hasTools: true,
      })
      const throughOpenRouter = await adaptHistoryForProvider(messages, "openrouter", {
        targetModelId: "meta-llama/llama-4-maverick",
        hasTools: true,
      })

      expect(throughOpenRouter.messages).toEqual(direct.messages)
      expect(hasPartType(throughOpenRouter.messages, "reasoning")).toBe(false)
      expect(getAssistantMessages(throughOpenRouter.messages).every((message) => hasPartType([message], "text"))).toBe(
        true,
      )
    })
  })
})
