import { describe, expect, it, vi } from "vitest"
import {
  computePaymentPolicyOverrides,
  filterMetadataMapByPolicy,
  filterToolSetByPolicy,
  getActiveToolsForStep,
  resolveCapabilityPolicy,
} from "../capability-policy"
import {
  buildFinishToolInvocationStreamMetadata,
  buildStartToolInvocationStreamMetadata,
  resolveToolInvocationMetadata,
} from "../ui-metadata"
import type { PaymentIntentResult } from "@/app/api/chat/intent/payment-intent"

// Enable payment guardrails for the policy override tests.
// These config values are only consumed by computePaymentPolicyOverrides,
// so existing resolveCapabilityPolicy tests are unaffected.
vi.mock("@/lib/config", () => ({
  PAYMENT_STATUS_GUARDRAILS_V1: true,
  PAYMENT_GUARDRAIL_MODE: "enforce" as const,
}))

describe("route/policy integration helpers", () => {
  it("uses centralized policy output for early filtering and late-step gating", () => {
    const policy = resolveCapabilityPolicy({
      modelTools: true,
      isAuthenticated: true,
      keyMode: "platform",
      tools: [
        {
          toolName: "web_search",
          source: "third-party",
          capability: "search",
          readOnly: true,
        },
        {
          toolName: "pay_purchase",
          source: "platform",
          capability: "platform",
          readOnly: false,
        },
        {
          toolName: "github_unknown",
          source: "mcp",
          capability: "mcp",
        },
      ],
    })

    const tools = {
      web_search: { description: "search" },
      pay_purchase: { description: "purchase" },
      github_unknown: { description: "unknown" },
    } as unknown as import("ai").ToolSet
    const filteredTools = filterToolSetByPolicy(tools, policy)
    expect(Object.keys(filteredTools)).toEqual([
      "web_search",
      "pay_purchase",
      "github_unknown",
    ])

    const byNameMetadata = new Map([
      ["web_search", { displayName: "Web Search" }],
      ["pay_purchase", { displayName: "Purchase" }],
      ["github_unknown", { displayName: "Unknown" }],
    ])
    const filteredMetadata = filterMetadataMapByPolicy(byNameMetadata, policy)
    expect(Array.from(filteredMetadata.keys())).toEqual([
      "web_search",
      "pay_purchase",
      "github_unknown",
    ])

    // Unknown-risk MCP tool is advisory-allowed in early steps, fail-closed in late steps.
    expect(policy.earlyToolNames).toContain("github_unknown")
    expect(policy.lateToolNames).not.toContain("github_unknown")
    expect(
      policy.toolDecisions.find((d) => d.toolName === "github_unknown")
        ?.earlyReasonCode
    ).toBe("risk_unknown_early_step_advisory_allow")

    // prepareStep behavior remains policy-driven in both early and late steps.
    expect(getActiveToolsForStep(policy, 2, 3)).toEqual([
      "web_search",
      "pay_purchase",
      "github_unknown",
    ])
    expect(getActiveToolsForStep(policy, 4, 3)).toEqual(["web_search"])
  })

  it("treats untrusted MCP hints as unknown risk while preserving trusted late-step allow", () => {
    const policy = resolveCapabilityPolicy({
      modelTools: true,
      isAuthenticated: true,
      keyMode: "platform",
      tools: [
        {
          toolName: "mcp_untrusted_read",
          source: "mcp",
          capability: "mcp",
          readOnly: true,
          riskHintsTrusted: false,
        },
        {
          toolName: "mcp_trusted_read",
          source: "mcp",
          capability: "mcp",
          readOnly: true,
          riskHintsTrusted: true,
        },
      ],
    })

    expect(policy.earlyToolNames).toContain("mcp_untrusted_read")
    expect(policy.earlyToolNames).toContain("mcp_trusted_read")
    expect(policy.lateToolNames).toEqual(["mcp_trusted_read"])
  })

  it("keeps tool metadata plumbing correct with start/finish split payloads", () => {
    const byName = {
      web_search: {
        displayName: "Web Search",
        source: "third-party" as const,
        serviceName: "Exa",
      },
    }
    const startMetadata = buildStartToolInvocationStreamMetadata(byName)
    expect(startMetadata).toEqual({ toolMetadataByName: byName })

    const byCallId = {
      call_1: {
        displayName: "Web Search",
        source: "third-party" as const,
        serviceName: "Exa",
      },
    }
    const finishMetadata = buildFinishToolInvocationStreamMetadata({
      toolMetadataByCallId: byCallId,
      reasoningDurationMs: 420,
    })
    expect(finishMetadata).toEqual({
      toolMetadataByCallId: byCallId,
      reasoningDurationMs: 420,
    })
    expect(finishMetadata).not.toHaveProperty("toolMetadataByName")

    const resolved = resolveToolInvocationMetadata({
      toolName: "web_search",
      toolCallId: "call_1",
      streamMetadata: {
        ...startMetadata,
        ...finishMetadata,
      },
    })
    expect(resolved?.displayName).toBe("Web Search")
  })
})

// ── Payment policy override regression tests ────────────────────────────────
// Guards against the payment status replay incident class: a status-check
// message must never trigger pay_purchase.

describe("computePaymentPolicyOverrides", () => {
  it("status_check intent denies pay_purchase", () => {
    const intent: PaymentIntentResult = {
      intent: "status_check",
      confidence: "high",
      reason: "test",
    }
    const result = computePaymentPolicyOverrides(
      intent,
      { hasActiveJob: true, hasAnyJob: true },
      "enforce"
    )
    expect(result?.denyTools).toContain("pay_purchase")
    expect(result?.reason).toBe("status_intent_blocks_pay_purchase")
  })

  it("returns null when state is null", () => {
    const intent: PaymentIntentResult = {
      intent: "status_check",
      confidence: "high",
      reason: "test",
    }
    const result = computePaymentPolicyOverrides(intent, null, "enforce")
    expect(result).toBeNull()
  })

  it("unknown intent with active job in enforce mode denies pay_purchase", () => {
    const intent: PaymentIntentResult = {
      intent: "unknown",
      confidence: "low",
      reason: "test",
    }
    const result = computePaymentPolicyOverrides(
      intent,
      { hasActiveJob: true, hasAnyJob: true },
      "enforce"
    )
    expect(result?.denyTools).toContain("pay_purchase")
  })

  it("unknown intent with active job in observe mode returns null", () => {
    const intent: PaymentIntentResult = {
      intent: "unknown",
      confidence: "low",
      reason: "test",
    }
    const result = computePaymentPolicyOverrides(
      intent,
      { hasActiveJob: true, hasAnyJob: true },
      "observe"
    )
    expect(result).toBeNull()
  })

  it("new_purchase with active job is safety-reclassified to deny pay_purchase", () => {
    const intent: PaymentIntentResult = {
      intent: "new_purchase",
      confidence: "high",
      reason: "test",
    }
    const result = computePaymentPolicyOverrides(
      intent,
      { hasActiveJob: true, hasAnyJob: true },
      "enforce"
    )
    expect(result?.denyTools).toContain("pay_purchase")
    expect(result?.allowTools).toContain("pay_status")
    expect(result?.reason).toBe("status_intent_blocks_pay_purchase")
  })

  it("new_purchase without active job returns null (no override needed)", () => {
    const intent: PaymentIntentResult = {
      intent: "new_purchase",
      confidence: "high",
      reason: "test",
    }
    const result = computePaymentPolicyOverrides(
      intent,
      { hasActiveJob: false, hasAnyJob: false },
      "enforce"
    )
    expect(result).toBeNull()
  })
})
