import { describe, test, expect } from "vitest"
import {
  classifyPaymentIntent,
  type PaymentIntentContext,
} from "../payment-intent"

describe("classifyPaymentIntent", () => {
  const baseContext: PaymentIntentContext = {
    userMessage: "",
    hasActiveJob: false,
    hasAnyJob: false,
  }

  test("status keywords with active job -> status_check", () => {
    const result = classifyPaymentIntent({
      ...baseContext,
      userMessage: "What's the status of my order?",
      hasActiveJob: true,
      hasAnyJob: true,
    })
    expect(result.intent).toBe("status_check")
    expect(result.confidence).toBe("high")
  })

  test("purchase keywords without active job -> new_purchase", () => {
    const result = classifyPaymentIntent({
      ...baseContext,
      userMessage: "I want to buy the ergonomic mouse",
      hasActiveJob: false,
      hasAnyJob: false,
    })
    expect(result.intent).toBe("new_purchase")
    expect(result.confidence).toBe("high")
  })

  test("purchase keywords WITH active job -> status_check (safety-first)", () => {
    const result = classifyPaymentIntent({
      ...baseContext,
      userMessage: "Buy me another one",
      hasActiveJob: true,
      hasAnyJob: true,
    })
    // Safety-first: reclassified to status_check when active job exists
    expect(result.intent).toBe("status_check")
  })

  test("ambiguous message with active job -> unknown", () => {
    const result = classifyPaymentIntent({
      ...baseContext,
      userMessage: "Hello, can you help me?",
      hasActiveJob: true,
      hasAnyJob: true,
    })
    expect(result.intent).toBe("unknown")
  })

  test("status keywords without any job -> unknown", () => {
    // Use a message with only status keywords (no purchase keywords like "order")
    const result = classifyPaymentIntent({
      ...baseContext,
      userMessage: "Where is my delivery?",
      hasActiveJob: false,
      hasAnyJob: false,
    })
    expect(result.intent).toBe("unknown")
    expect(result.confidence).toBe("low")
  })

  test("both status and purchase keywords with active job -> status_check", () => {
    const result = classifyPaymentIntent({
      ...baseContext,
      userMessage:
        "Buy me a new one and check the status of the previous order",
      hasActiveJob: true,
      hasAnyJob: true,
    })
    expect(result.intent).toBe("status_check")
  })

  test("no matching keywords -> unknown with low confidence", () => {
    const result = classifyPaymentIntent({
      ...baseContext,
      userMessage: "Tell me about the weather today",
    })
    expect(result.intent).toBe("unknown")
    expect(result.confidence).toBe("low")
  })
})
