import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolSet } from "ai"
import { getPlatformTools } from "../platform"
import { wrapToolsWithTracing } from "../utils"
import { ToolTraceCollector } from "../types"

const mockGetPayClawConfig = vi.fn()
const mockCreateJob = vi.fn()
const mockGetJob = vi.fn()
const mockGetJobEvents = vi.fn()

vi.mock("@/lib/payclaw/config", () => ({
  getPayClawConfig: () => mockGetPayClawConfig(),
}))

vi.mock("@/lib/payclaw/client", () => ({
  PayClawApiError: class PayClawApiError extends Error {
    statusCode = 500
    code = "UNKNOWN_ERROR"
  },
  createJob: (...args: unknown[]) => mockCreateJob(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobEvents: (...args: unknown[]) => mockGetJobEvents(...args),
}))

describe("platform tool cancellation propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPayClawConfig.mockReturnValue({
      apiKey: "pc_test",
      appBaseUrl: "https://payclaw.test",
      defaultCardId: "card_default",
    })
  })

  it("propagates abort signal through pay_purchase to PayClaw client", async () => {
    mockCreateJob.mockImplementation(
      (_input: unknown, _config: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("downstream aborted")),
            { once: true }
          )
        })
    )

    const { tools, metadata } = await getPlatformTools()
    const traceCollector = new ToolTraceCollector()
    const wrapped = wrapToolsWithTracing(
      tools as ToolSet,
      traceCollector,
      "req_platform_abort",
      undefined,
      metadata
    )

    const controller = new AbortController()
    const pending = (wrapped.pay_purchase as { execute: Function }).execute(
      { url: "https://vendor.example.com", maxSpend: 2500 },
      { toolCallId: "call_purchase_abort", abortSignal: controller.signal }
    )
    controller.abort("request_cancelled")

    await expect(pending).rejects.toThrow(/cancelled|aborted/i)
    expect(mockCreateJob).toHaveBeenCalledTimes(1)
    const createJobOptions = mockCreateJob.mock.calls[0]?.[2] as
      | { signal?: AbortSignal }
      | undefined
    expect(createJobOptions?.signal).toBeDefined()
    expect(traceCollector.get("call_purchase_abort")?.errorCode).toBe("aborted")
  })

  it("propagates abort signal through pay_status calls", async () => {
    mockGetJob.mockImplementation(
      (_jobId: string, _config: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("job aborted")),
            { once: true }
          )
        })
    )
    mockGetJobEvents.mockImplementation(
      (_jobId: string, _config: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("events aborted")),
            { once: true }
          )
        })
    )

    const { tools, metadata } = await getPlatformTools()
    const traceCollector = new ToolTraceCollector()
    const wrapped = wrapToolsWithTracing(
      tools as ToolSet,
      traceCollector,
      "req_status_abort",
      undefined,
      metadata
    )

    const controller = new AbortController()
    const pending = (wrapped.pay_status as { execute: Function }).execute(
      { jobId: "job_abc123" },
      { toolCallId: "call_status_abort", abortSignal: controller.signal }
    )
    controller.abort("request_cancelled")

    await expect(pending).rejects.toThrow(/cancelled|aborted/i)
    expect(mockGetJob).toHaveBeenCalledTimes(1)
    expect(mockGetJobEvents).toHaveBeenCalledTimes(1)
    expect((mockGetJob.mock.calls[0]?.[2] as { signal?: AbortSignal })?.signal).toBeDefined()
    expect((mockGetJobEvents.mock.calls[0]?.[2] as { signal?: AbortSignal })?.signal).toBeDefined()
    expect(traceCollector.get("call_status_abort")?.errorCode).toBe("aborted")
  })

  it("surfaces timeout taxonomy for stalled pay_purchase execution", async () => {
    mockCreateJob.mockRejectedValueOnce(new Error("request timed out"))

    const { tools, metadata } = await getPlatformTools()
    const traceCollector = new ToolTraceCollector()
    const wrapped = wrapToolsWithTracing(
      tools as ToolSet,
      traceCollector,
      "req_platform_timeout",
      undefined,
      metadata
    )

    await expect(
      (wrapped.pay_purchase as { execute: Function }).execute(
        { url: "https://vendor.example.com", maxSpend: 2500 },
        { toolCallId: "call_purchase_timeout" }
      )
    ).rejects.toThrow(/timed out/i)
    expect(traceCollector.get("call_purchase_timeout")?.errorCode).toBe("timeout")
  })
})
