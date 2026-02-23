import { describe, expect, it } from "vitest"
import type { ToolSet } from "ai"
import { wrapMcpTools, ToolTraceCollector } from "../mcp-wrapper"
import { wrapToolsWithTracing } from "../utils"
import {
  createToolPolicyGuard,
  getToolBudgetPolicy,
  InMemoryToolLimitStore,
  ToolPolicyError,
} from "../policy"

describe("tool policy guardrails", () => {
  it("persists extract_content domain limits across separate requests", async () => {
    let now = 1_000_000
    const store = new InMemoryToolLimitStore(() => now)

    const requestOneGuard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "guest:guest_alpha",
    })
    await requestOneGuard.enforceExtractDomainLimit(
      new Map([["example.com", 6]])
    )

    const requestTwoGuard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "guest:guest_alpha",
    })

    await expect(
      requestTwoGuard.enforceExtractDomainLimit(new Map([["example.com", 1]]))
    ).rejects.toThrow("EXTRACT_CONTENT_DOMAIN_LIMIT_EXCEEDED")

    // Move beyond the window and verify quota resets.
    now += 16 * 60_000
    await expect(
      requestTwoGuard.enforceExtractDomainLimit(new Map([["example.com", 1]]))
    ).resolves.toBeUndefined()
  })

  it("isolates domain limits by authenticated actor", async () => {
    const store = new InMemoryToolLimitStore(() => 2_000_000)
    const userAGuard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "user:user_a",
    })
    const userBGuard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "user:user_b",
    })

    await userAGuard.enforceExtractDomainLimit(new Map([["docs.example.com", 6]]))
    await expect(
      userAGuard.enforceExtractDomainLimit(new Map([["docs.example.com", 1]]))
    ).rejects.toThrow("EXTRACT_CONTENT_DOMAIN_LIMIT_EXCEEDED")

    // User B remains unaffected by user A's quota consumption.
    await expect(
      userBGuard.enforceExtractDomainLimit(new Map([["docs.example.com", 1]]))
    ).resolves.toBeUndefined()
  })

  it("isolates anonymous guest IDs correctly", async () => {
    const store = new InMemoryToolLimitStore(() => 3_000_000)
    const guestOneGuard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "guest:guest_one",
    })
    const guestTwoGuard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "guest:guest_two",
    })

    await guestOneGuard.enforceExtractDomainLimit(new Map([["news.site", 6]]))
    await expect(
      guestOneGuard.enforceExtractDomainLimit(new Map([["news.site", 1]]))
    ).rejects.toThrow("EXTRACT_CONTENT_DOMAIN_LIMIT_EXCEEDED")

    await expect(
      guestTwoGuard.enforceExtractDomainLimit(new Map([["news.site", 1]]))
    ).resolves.toBeUndefined()
  })

  it("enforces tool budgets in Layer 2 tracing wrapper", async () => {
    const traces = new ToolTraceCollector()
    const tools = {
      web_search: {
        description: "search",
        inputSchema: { type: "object" },
        execute: async () => ({ ok: true }),
      },
    } as unknown as ToolSet

    const wrapped = wrapToolsWithTracing(
      tools,
      traces,
      "req_layer2",
      async () => {
        throw new ToolPolicyError(
          "TOOL_BUDGET_EXCEEDED: Tool budget exceeded. Retry after approximately 30 seconds.",
          {
            code: "TOOL_BUDGET_EXCEEDED",
            retryAfterSeconds: 30,
            keyMode: "platform",
            budgetDenied: true,
          }
        )
      }
    )

    await expect(
      (wrapped.web_search as { execute: Function }).execute({}, { toolCallId: "call_layer2" })
    ).rejects.toThrow("TOOL_BUDGET_EXCEEDED")

    const trace = traces.get("call_layer2")
    expect(trace?.errorCode).toBe("policy_limit")
    expect(trace?.retryAfterSeconds).toBe(30)
    expect(trace?.budgetDenied).toBe(true)
    expect(trace?.budgetKeyMode).toBe("platform")
  })

  it("enforces tool budgets in Layer 3 MCP wrapper", async () => {
    const traces = new ToolTraceCollector()
    const tools = {
      mcp_read_docs: {
        description: "mcp read docs",
        parameters: { type: "object", properties: {} },
        execute: async () => ({ ok: true }),
      },
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, {
      toolServerMap: new Map([
        [
          "mcp_read_docs",
          {
            displayName: "Read Docs",
            serverName: "docs",
            serverId: "server_docs",
          },
        ],
      ]),
      traceCollector: traces,
      requestId: "req_layer3",
      enforceToolBudget: async () => {
        throw new ToolPolicyError(
          "TOOL_BUDGET_EXCEEDED: Tool budget exceeded. Retry after approximately 45 seconds.",
          {
            code: "TOOL_BUDGET_EXCEEDED",
            retryAfterSeconds: 45,
            keyMode: "platform",
            budgetDenied: true,
          }
        )
      },
    })

    await expect(
      (wrapped.mcp_read_docs as { execute: Function }).execute({}, { toolCallId: "call_layer3" })
    ).rejects.toThrow("TOOL_BUDGET_EXCEEDED")

    const trace = traces.get("call_layer3")
    expect(trace?.errorCode).toBe("policy_limit")
    expect(trace?.budgetDenied).toBe(true)
    expect(trace?.budgetKeyMode).toBe("platform")
  })

  it("uses stricter platform budgets than BYOK budgets", () => {
    const platform = getToolBudgetPolicy("extract_content", "platform")
    const byok = getToolBudgetPolicy("extract_content", "byok")
    expect(byok.maxCount).toBeGreaterThan(platform.maxCount)
  })

  it("returns stable error code with actionable retry hint", async () => {
    const store = new InMemoryToolLimitStore(() => 4_000_000)
    const guard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "guest:guest_error_shape",
    })

    await guard.enforceExtractDomainLimit(new Map([["shape.example", 6]]))

    await expect(
      guard.enforceExtractDomainLimit(new Map([["shape.example", 1]]))
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof ToolPolicyError)) return false
      return (
        error.code === "EXTRACT_CONTENT_DOMAIN_LIMIT_EXCEEDED" &&
        error.message.includes("Retry after approximately")
      )
    })
  })

  it("returns stable budget error code with actionable retry hint", async () => {
    const store = new InMemoryToolLimitStore(() => 5_000_000)
    const guard = createToolPolicyGuard({
      store,
      keyMode: "platform",
      actorKey: "user:user_budget_shape",
    })

    const budget = getToolBudgetPolicy("web_search", "platform")
    for (let i = 0; i < budget.maxCount; i++) {
      await guard.enforceToolBudget("web_search")
    }

    await expect(guard.enforceToolBudget("web_search")).rejects.toSatisfy(
      (error: unknown) => {
        if (!(error instanceof ToolPolicyError)) return false
        return (
          error.code === "TOOL_BUDGET_EXCEEDED" &&
          error.message.includes("Retry after approximately")
        )
      }
    )
  })
})
