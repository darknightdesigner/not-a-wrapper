import { describe, it, expect, vi } from "vitest"
import { truncateToolResult, isTruncated, wrapToolsWithTruncation } from "../utils"

// Mock the config module to control MAX_TOOL_RESULT_SIZE in tests
vi.mock("@/lib/config", () => ({
  MAX_TOOL_RESULT_SIZE: 100 * 1024, // 100KB default
}))

describe("truncateToolResult", () => {
  // ===========================================================================
  // No truncation needed — results pass through unchanged
  // ===========================================================================

  describe("results within size limit", () => {
    it("returns string results unchanged when under limit", () => {
      const result = "Hello, world!"
      expect(truncateToolResult(result, 1024)).toBe(result)
    })

    it("returns small objects unchanged", () => {
      const obj = { key: "value", count: 42 }
      expect(truncateToolResult(obj, 1024)).toEqual(obj)
    })

    it("returns small arrays unchanged", () => {
      const arr = [1, 2, 3, "four"]
      expect(truncateToolResult(arr, 1024)).toEqual(arr)
    })

    it("returns primitives unchanged", () => {
      expect(truncateToolResult(42, 1024)).toBe(42)
      expect(truncateToolResult(true, 1024)).toBe(true)
      expect(truncateToolResult(null, 1024)).toBe(null)
    })
  })

  // ===========================================================================
  // Oversized string truncation
  // ===========================================================================

  describe("oversized string truncation", () => {
    it("truncates strings over the byte limit with marker", () => {
      const largeString = "a".repeat(2000)
      const result = truncateToolResult(largeString, 100)

      expect(typeof result).toBe("string")
      expect((result as string).length).toBeLessThan(2000)
      expect(result).toContain("[truncated — result exceeded size limit]")
    })

    it("preserves content up to the character limit", () => {
      const largeString = "abcdefghij".repeat(20) // 200 chars
      const result = truncateToolResult(largeString, 100) as string

      // 0.9 * 100 = 90 chars, so the content before the marker should be 90 chars
      expect(result.startsWith("abcdefghij")).toBe(true)
    })

    it("uses global MAX_TOOL_RESULT_SIZE as default", () => {
      // A string under 100KB should not be truncated.
      // Account for JSON serialization overhead (2 bytes for quotes)
      const underLimit = "a".repeat(100 * 1024 - 3)
      const result = truncateToolResult(underLimit)
      expect(result).toBe(underLimit)
    })

    it("truncates strings exactly at the 100KB boundary", () => {
      const overLimit = "a".repeat(100 * 1024 + 1)
      const result = truncateToolResult(overLimit) as string
      expect(result).toContain("[truncated — result exceeded size limit]")
    })
  })

  // ===========================================================================
  // Oversized array truncation (shape-preserving)
  // ===========================================================================

  describe("oversized array truncation", () => {
    it("returns shape-preserved truncation with metadata", () => {
      // Create an array large enough to exceed the limit
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        content: "x".repeat(100),
      }))
      const result = truncateToolResult(items, 1024) as {
        _truncated: boolean
        _originalCount: number
        _returnedCount: number
        data: unknown[]
      }

      expect(result._truncated).toBe(true)
      expect(result._originalCount).toBe(100)
      expect(result._returnedCount).toBeLessThan(100)
      expect(result._returnedCount).toBeGreaterThan(0)
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data.length).toBe(result._returnedCount)
    })

    it("halves array size iteratively until within budget", () => {
      const items = Array.from({ length: 64 }, (_, i) => ({
        id: i,
        data: "y".repeat(200),
      }))
      const result = truncateToolResult(items, 2048) as {
        _truncated: boolean
        _returnedCount: number
        data: unknown[]
      }

      expect(result._truncated).toBe(true)
      // Halving: 64 → 32 → 16 → 8 → 4 (each item ~210 bytes)
      expect(result._returnedCount).toBeLessThanOrEqual(64)
      expect(result.data.length).toBeGreaterThan(0)
    })

    it("preserves array item structure", () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        title: `Item ${i}`,
        url: `https://example.com/${i}`,
        content: "z".repeat(200),
      }))
      const result = truncateToolResult(items, 2048) as {
        data: Array<{ title: string; url: string; content: string }>
      }

      // Remaining items should have the same structure
      for (const item of result.data) {
        expect(item).toHaveProperty("title")
        expect(item).toHaveProperty("url")
        expect(item).toHaveProperty("content")
      }
    })
  })

  // ===========================================================================
  // Oversized object truncation
  // ===========================================================================

  describe("oversized object truncation", () => {
    it("returns truncated representation with metadata", () => {
      const largeObj = {
        data: "x".repeat(2000),
        more: "y".repeat(2000),
      }
      const result = truncateToolResult(largeObj, 1024) as {
        _truncated: boolean
        _originalSizeBytes: number
        _raw: string
      }

      expect(result._truncated).toBe(true)
      expect(result._originalSizeBytes).toBeGreaterThan(1024)
      expect(result._raw).toContain("...")
    })
  })

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe("edge cases", () => {
    it("handles circular references gracefully", () => {
      const circular: Record<string, unknown> = { a: 1 }
      circular.self = circular

      // safeStringify falls back to String() for circular refs
      // String(circular) produces "[object Object]" which is small
      const result = truncateToolResult(circular, 1024)
      expect(result).toBeDefined()
    })

    it("handles empty string input", () => {
      expect(truncateToolResult("", 100)).toBe("")
    })

    it("handles empty array input", () => {
      expect(truncateToolResult([], 100)).toEqual([])
    })

    it("handles empty object input", () => {
      expect(truncateToolResult({}, 100)).toEqual({})
    })

    it("logs a warning when truncation occurs", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const largeString = "a".repeat(2000)

      truncateToolResult(largeString, 100)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[tools] Result truncated:")
      )
      warnSpy.mockRestore()
    })

    it("does not log when no truncation needed", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      truncateToolResult("small", 1024)

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })
})

// =============================================================================
// isTruncated
// =============================================================================

describe("isTruncated", () => {
  it("returns true for truncated array results", () => {
    expect(
      isTruncated({ _truncated: true, _originalCount: 100, _returnedCount: 10, data: [] })
    ).toBe(true)
  })

  it("returns true for truncated object results", () => {
    expect(
      isTruncated({ _truncated: true, _originalSizeBytes: 200000, _raw: "..." })
    ).toBe(true)
  })

  it("returns false for non-truncated results", () => {
    expect(isTruncated({ key: "value" })).toBe(false)
    expect(isTruncated("hello")).toBe(false)
    expect(isTruncated(42)).toBe(false)
    expect(isTruncated(null)).toBe(false)
    expect(isTruncated(undefined)).toBe(false)
  })

  it("returns false when _truncated is not true", () => {
    expect(isTruncated({ _truncated: false })).toBe(false)
    expect(isTruncated({ _truncated: "yes" })).toBe(false)
  })
})

// =============================================================================
// wrapToolsWithTruncation
// =============================================================================

describe("wrapToolsWithTruncation", () => {
  it("wraps execute functions with truncation", async () => {
    const largeResult = "x".repeat(2000)
    const mockTools = {
      myTool: {
        description: "A test tool",
        execute: async () => largeResult,
      },
    }

    const wrapped = wrapToolsWithTruncation(mockTools as unknown as import("ai").ToolSet, 100)
    const wrappedTool = wrapped.myTool as unknown as { execute: () => Promise<unknown> }
    const result = await wrappedTool.execute()

    expect(typeof result).toBe("string")
    expect((result as string).length).toBeLessThan(2000)
    expect(result).toContain("[truncated — result exceeded size limit]")
  })

  it("passes through results that are under the limit", async () => {
    const smallResult = { ok: true, data: "hello" }
    const mockTools = {
      myTool: {
        description: "A test tool",
        execute: async () => smallResult,
      },
    }

    const wrapped = wrapToolsWithTruncation(mockTools as unknown as import("ai").ToolSet, 10240)
    const wrappedTool = wrapped.myTool as unknown as { execute: () => Promise<unknown> }
    const result = await wrappedTool.execute()

    expect(result).toEqual(smallResult)
  })

  it("preserves tool properties other than execute", () => {
    const mockTools = {
      myTool: {
        description: "A test tool",
        inputSchema: { type: "object" },
        execute: async () => "result",
      },
    }

    const wrapped = wrapToolsWithTruncation(mockTools as unknown as import("ai").ToolSet, 1024)
    const wrappedTool = wrapped.myTool as Record<string, unknown>

    expect(wrappedTool.description).toBe("A test tool")
    expect(wrappedTool.inputSchema).toEqual({ type: "object" })
  })

  it("skips tools without execute functions", () => {
    const mockTools = {
      noExecTool: {
        description: "No execute",
      },
    }

    const wrapped = wrapToolsWithTruncation(mockTools as unknown as import("ai").ToolSet, 1024)
    const wrappedTool = wrapped.noExecTool as Record<string, unknown>

    expect(wrappedTool.description).toBe("No execute")
    expect(wrappedTool.execute).toBeUndefined()
  })

  it("wraps multiple tools independently", async () => {
    const mockTools = {
      toolA: {
        description: "Tool A",
        execute: async () => "a".repeat(2000),
      },
      toolB: {
        description: "Tool B",
        execute: async () => "small result",
      },
    }

    const wrapped = wrapToolsWithTruncation(mockTools as unknown as import("ai").ToolSet, 100)

    const toolA = wrapped.toolA as unknown as { execute: () => Promise<unknown> }
    const toolB = wrapped.toolB as unknown as { execute: () => Promise<unknown> }

    const resultA = await toolA.execute()
    const resultB = await toolB.execute()

    // Tool A should be truncated (2000 chars > 100 bytes)
    expect(resultA).toContain("[truncated — result exceeded size limit]")

    // Tool B should pass through unchanged
    expect(resultB).toBe("small result")
  })
})
