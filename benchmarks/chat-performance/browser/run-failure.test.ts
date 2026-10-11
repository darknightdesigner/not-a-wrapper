import { expect, it } from "vitest"
import { failureCause, failureSignature } from "./run-failure"

it("gives one failure the same signature across scenarios and attempts", () => {
  // PR #213's head arm: different scenarios, timeouts and chats, one cause.
  const coldTimeout = failureCause(
    "Error: timed out waiting for any of [first_visible_text, durable_settlement_receipt] (60600ms) at http://localhost:3111/c/c2c1fe53-0859-499a-9b18-c0113c655462; evidence={}",
    []
  )
  const reasoningTimeout = failureCause(
    "Error: timed out waiting for any of [first_visible_text, durable_settlement_receipt] (74651ms) at http://localhost:3111/c/19b2ce51-9c8c-4704-ba84-6bf6417517bd",
    []
  )
  expect(failureSignature(coldTimeout)).toBe(failureSignature(reasoningTimeout))
  expect(failureSignature("chat POST failed (HTTP 404)")).not.toBe(failureSignature("chat POST failed (HTTP 500)"))

  // A reported Convex error is the root cause, whatever the harness timed out on.
  const missing = (requestId: string) =>
    `[CONVEX Q(messages:getLiveMessage)] [Request ID: ${requestId}] Server Error Could not find public function for 'messages:getLiveMessage'.`
  const followupCause = failureCause("Error: timed out waiting for mark stream_terminal (60000ms)", [missing("4f1a9c")])
  expect(followupCause).toContain("messages:getLiveMessage")
  expect(failureSignature(followupCause)).toBe(failureSignature(failureCause(coldTimeout, [missing("77be02")])))
  expect(failureSignature(followupCause)).not.toBe(failureSignature(coldTimeout))
})
