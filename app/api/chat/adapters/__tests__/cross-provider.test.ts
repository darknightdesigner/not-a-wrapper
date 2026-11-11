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
  userMessage,
} from "./fixtures"

function hasPartType(messages: UIMessage[], type: string): boolean {
  return messages.some((message) =>
    message.parts.some((part) => part.type === type)
  )
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

      expect(
        message.parts
          .slice(0, index)
          .some((candidate) => candidate.type === "reasoning")
      ).toBe(true)
    }
  }
}

function assertAlternatingRoles(messages: UIMessage[]): void {
  for (let index = 1; index < messages.length; index += 1) {
    expect(messages[index]?.role).not.toBe(messages[index - 1]?.role)
  }
}

describe("cross-provider replay matrix", () => {
  describe("OpenAI -> Anthropic", () => {
    const provider = "anthropic"
    const context = { targetModelId: "claude-4-opus", hasTools: true }

    it("keeps reasoning + tool chains", async () => {
      const result = await adaptHistoryForProvider(
        [multiStepToolChain],
        provider,
        context
      )
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
      expect(hasPartType(result.messages, "tool-web_search")).toBe(false)
      expect(hasPartType(result.messages, "tool-exa_search")).toBe(true)
    })

    it("keeps provider-executed and SDK-executed tools", async () => {
      const result = await adaptHistoryForProvider(
        [mixedProviderAndSdkTools],
        provider,
        context
      )
      const parts = result.messages[0]?.parts ?? []
      expect(
        parts.some(
          (part) =>
            (part as { providerExecuted?: boolean }).providerExecuted === false
        )
      ).toBe(true)
      expect(parts.some((part) => part.type === "text")).toBe(true)
    })
  })

  describe("Anthropic -> OpenAI", () => {
    const provider = "openai"
    const context = { targetModelId: "gpt-5.2", hasTools: true }

    it("enforces atomic triples for tool calls", async () => {
      const result = await adaptHistoryForProvider(
        [singleSdkToolComplete],
        provider,
        context
      )
      expect(hasPartType(result.messages, "tool-exa_search")).toBe(true)
      assertOpenAIAtomicToolStructure(result.messages)
    })

    it("enforces atomic triples for reasoning + tool chains", async () => {
      const result = await adaptHistoryForProvider(
        [multiStepToolChain],
        provider,
        context
      )
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
      expect(hasPartType(result.messages, "tool-web_search")).toBe(true)
      assertOpenAIAtomicToolStructure(result.messages)
    })

    it("strips callProviderMetadata from replayed tool parts", async () => {
      const result = await adaptHistoryForProvider(
        [crossProviderMetadata],
        provider,
        context
      )
      assertNoCallProviderMetadata(result.messages)
      expect(result.stats.providerIdsStripped).toBeGreaterThan(0)
    })

    it("handles provider-executed and SDK-executed tools without breaking triples", async () => {
      const result = await adaptHistoryForProvider(
        [mixedProviderAndSdkTools],
        provider,
        context
      )
      assertOpenAIAtomicToolStructure(result.messages)
      assertNoCallProviderMetadata(result.messages)
    })
  })

  describe("OpenAI -> OpenAI", () => {
    const provider = "openai"
    const context = { targetModelId: "gpt-5.2", hasTools: true }

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

    it("preserves reasoning + tool chains and validates role alternation", async () => {
      const roleBreakHistory = [
        userMessage("u-google-1", "first user"),
        userMessage("u-google-2", "second user"),
        multiStepToolChain,
      ]
      const result = await adaptHistoryForProvider(
        roleBreakHistory,
        provider,
        context
      )
      expect(hasPartType(result.messages, "reasoning")).toBe(true)
      assertAlternatingRoles(result.messages)
      expect(
        result.warnings.some(
          (warning) => warning.code === "role_alternation_repaired"
        )
      ).toBe(true)
    })
  })

  describe("Perplexity target", () => {
    it("produces text-only output", async () => {
      const result = await adaptHistoryForProvider(
        [singleProviderExecutedTool, singleSdkToolComplete, reasoningPlusText],
        "perplexity",
        { targetModelId: "sonar-pro", hasTools: true }
      )

      for (const message of result.messages) {
        expect(message.parts.every((part) => part.type === "text")).toBe(true)
      }
      expect(hasPartType(result.messages, "reasoning")).toBe(false)
      expect(hasPartType(result.messages, "tool-web_search")).toBe(false)
      expect(hasPartType(result.messages, "tool-exa_search")).toBe(false)
    })
  })
})
