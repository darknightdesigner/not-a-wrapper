import { describe, it, expect, vi } from "vitest"
import {
  wrapMcpTools,
  ToolTraceCollector,
  ToolTimeoutError,
  isToolResultEnvelope,
} from "../mcp-wrapper"
import type { ToolSet } from "ai"
import type { ToolResultEnvelope } from "../types"

// ── Helpers ──────────────────────────────────────────────

/** Create a minimal tool with the given execute function */
function makeTool(
  executeFn: (params: unknown, options: { toolCallId: string }) => Promise<unknown>
) {
  return {
    description: "test tool",
    parameters: { type: "object", properties: {} },
    execute: executeFn,
  }
}

/** Create a standard WrapMcpToolsConfig for tests */
function makeConfig(overrides?: {
  timeoutMs?: number
  maxResultBytes?: number
}) {
  const traceCollector = new ToolTraceCollector()
  return {
    toolServerMap: new Map([
      [
        "test_tool",
        {
          displayName: "Test Tool",
          serverName: "test-server",
          serverId: "server123",
        },
      ],
    ]),
    traceCollector,
    ...overrides,
  }
}

// ── wrapMcpTools ─────────────────────────────────────────

describe("wrapMcpTools", () => {
  it("wraps a tool that resolves before timeout", async () => {
    const config = makeConfig({ timeoutMs: 5000 })
    const tools = {
      test_tool: makeTool(async () => ({ answer: 42 })),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)
    const result = await (wrapped.test_tool as { execute: Function }).execute(
      {},
      { toolCallId: "call_1" }
    ) as ToolResultEnvelope

    // Envelope structure
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ answer: 42 })
    expect(result.error).toBeNull()
    expect(result.meta.tool).toBe("Test Tool")
    expect(result.meta.source).toBe("mcp")
    expect(result.meta.serverName).toBe("test-server")
    expect(typeof result.meta.durationMs).toBe("number")
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0)

    // Trace recorded
    const trace = config.traceCollector.get("call_1")
    expect(trace).toBeDefined()
    expect(trace!.success).toBe(true)
    expect(trace!.toolName).toBe("test_tool")
    expect(trace!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("throws ToolTimeoutError when tool exceeds timeout", async () => {
    const config = makeConfig({ timeoutMs: 50 }) // 50ms timeout
    const tools = {
      test_tool: makeTool(
        () => new Promise((resolve) => setTimeout(resolve, 5000)) // hangs for 5s
      ),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)

    await expect(
      (wrapped.test_tool as { execute: Function }).execute(
        {},
        { toolCallId: "call_timeout" }
      )
    ).rejects.toThrow(ToolTimeoutError)

    // Trace records the failure
    const trace = config.traceCollector.get("call_timeout")
    expect(trace).toBeDefined()
    expect(trace!.success).toBe(false)
    expect(trace!.error).toContain("timed out")
    expect(trace!.durationMs).toBeLessThan(500) // Should fail fast
  })

  it("throws and traces when tool execute() rejects", async () => {
    const config = makeConfig({ timeoutMs: 5000 })
    const tools = {
      test_tool: makeTool(async () => {
        throw new Error("API rate limited")
      }),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)

    await expect(
      (wrapped.test_tool as { execute: Function }).execute(
        {},
        { toolCallId: "call_error" }
      )
    ).rejects.toThrow("API rate limited")

    const trace = config.traceCollector.get("call_error")
    expect(trace).toBeDefined()
    expect(trace!.success).toBe(false)
    expect(trace!.error).toBe("API rate limited")
  })

  it("passes through tools without execute unchanged", () => {
    const config = makeConfig()
    const providerTool = { description: "provider tool", parameters: {} }
    const tools = {
      provider_tool: providerTool,
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)
    expect(wrapped.provider_tool).toBe(providerTool)
  })

  it("truncates large results", async () => {
    const config = makeConfig({ timeoutMs: 5000, maxResultBytes: 100 })
    const largeResult = "x".repeat(1000)
    const tools = {
      test_tool: makeTool(async () => largeResult),
    } as unknown as ToolSet

    const wrapped = wrapMcpTools(tools, config)
    const result = await (wrapped.test_tool as { execute: Function }).execute(
      {},
      { toolCallId: "call_large" }
    ) as ToolResultEnvelope

    expect(result.ok).toBe(true)
    // The data should be truncated (contains truncation marker)
    const dataStr = typeof result.data === "string" ? result.data : JSON.stringify(result.data)
    expect(dataStr.length).toBeLessThan(1000)

    // Trace should record original size
    const trace = config.traceCollector.get("call_large")
    expect(trace).toBeDefined()
    expect(trace!.resultSizeBytes).toBeGreaterThan(100)
  })
})

// ── ToolTraceCollector ───────────────────────────────────

describe("ToolTraceCollector", () => {
  it("records and retrieves traces by toolCallId", () => {
    const collector = new ToolTraceCollector()
    collector.record({
      toolName: "search",
      toolCallId: "call_1",
      durationMs: 150,
      success: true,
      resultSizeBytes: 2048,
    })
    collector.record({
      toolName: "fetch",
      toolCallId: "call_2",
      durationMs: 300,
      success: false,
      error: "Connection refused",
    })

    expect(collector.get("call_1")?.durationMs).toBe(150)
    expect(collector.get("call_1")?.success).toBe(true)

    expect(collector.get("call_2")?.success).toBe(false)
    expect(collector.get("call_2")?.error).toBe("Connection refused")

    expect(collector.get("nonexistent")).toBeUndefined()
  })

  it("returns all traces via getAll()", () => {
    const collector = new ToolTraceCollector()
    collector.record({
      toolName: "a",
      toolCallId: "call_a",
      durationMs: 10,
      success: true,
    })
    collector.record({
      toolName: "b",
      toolCallId: "call_b",
      durationMs: 20,
      success: true,
    })

    const all = collector.getAll()
    expect(all).toHaveLength(2)
    expect(all.map((t) => t.toolName)).toEqual(
      expect.arrayContaining(["a", "b"])
    )
  })
})

// ── isToolResultEnvelope ─────────────────────────────────

describe("isToolResultEnvelope", () => {
  it("returns true for valid envelopes", () => {
    const envelope: ToolResultEnvelope = {
      ok: true,
      data: { result: "hello" },
      error: null,
      meta: { tool: "test", source: "mcp", durationMs: 100 },
    }
    expect(isToolResultEnvelope(envelope)).toBe(true)
  })

  it("returns false for non-envelope objects", () => {
    expect(isToolResultEnvelope({ result: "hello" })).toBe(false)
    expect(isToolResultEnvelope({ ok: true })).toBe(false)
    expect(isToolResultEnvelope({ ok: true, data: null })).toBe(false)
    expect(isToolResultEnvelope(null)).toBe(false)
    expect(isToolResultEnvelope(undefined)).toBe(false)
    expect(isToolResultEnvelope("string")).toBe(false)
    expect(isToolResultEnvelope(42)).toBe(false)
  })
})

// ── ToolTimeoutError ─────────────────────────────────────

describe("ToolTimeoutError", () => {
  it("has correct name, toolName, and timeoutMs", () => {
    const err = new ToolTimeoutError("my_tool", 30000)
    expect(err.name).toBe("ToolTimeoutError")
    expect(err.toolName).toBe("my_tool")
    expect(err.timeoutMs).toBe(30000)
    expect(err.message).toContain("my_tool")
    expect(err.message).toContain("30000ms")
    expect(err instanceof Error).toBe(true)
  })
})
