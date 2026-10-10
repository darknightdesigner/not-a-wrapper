// Public chat errors reach useChat's onError as the raw JSON body written by
// createErrorResponse ({ error, code }) — the transport throws the response
// text verbatim as Error.message. Classification keys on the `code` contract;
// substring matching survives only as a fallback for transports that prefix
// or wrap the body. Toasts show the human `error` message, never raw JSON.

export type ChatStreamErrorPresentation =
  | { kind: "swallow"; reason: "approval-continuation-lost-race" }
  | { kind: "sign-in" }
  | { kind: "toast"; title: string }

const GENERIC_MESSAGES = new Set([
  "an error occurred",
  "fetch failed",
  "failed to fetch",
])
const GENERIC_FALLBACK = "Something went wrong. Please try again."
// Guest refusals that ask the guest to sign in: their own daily limit, or the
// all-guest daily ceiling. The guest usage read reports both as zero left.
const GUEST_SIGN_IN_CODES = new Set([
  "DAILY_LIMIT_REACHED",
  "GUEST_CAPACITY_REACHED",
])

function parsePublicBody(message: string): { error?: string; code?: string } {
  try {
    const parsed: unknown = JSON.parse(message)
    if (parsed === null || typeof parsed !== "object") return {}
    const record = parsed as { error?: unknown; code?: unknown }
    return {
      ...(typeof record.error === "string" ? { error: record.error } : {}),
      ...(typeof record.code === "string" ? { code: record.code } : {}),
    }
  } catch {
    return {}
  }
}

/** True for a refusal carrying the public `code` contract, which the stream's
 * error handler presents. */
export function hasPublicChatErrorCode(error: unknown): boolean {
  return (
    error instanceof Error && parsePublicBody(error.message).code !== undefined
  )
}

export function presentChatStreamError(
  error: Error,
  { isAuthenticated }: { isAuthenticated: boolean }
): ChatStreamErrorPresentation {
  const body = parsePublicBody(error.message)

  // A losing approval-continuation POST (another tab's auto-send won) repaints
  // through the winner's projection,
  // so surfacing it would be a false failure. APPROVAL_UNRESOLVED is
  // deliberately NOT in this set: no winning decision exists to observe, so
  // it falls through to the toast path with its actionable server message.
  if (
    body.code === "APPROVAL_CONTINUATION_CONFLICT" ||
    error.message.includes("APPROVAL_CONTINUATION_CONFLICT") ||
    error.message.includes("Approval continuation already dispatched")
  ) {
    return { kind: "swallow", reason: "approval-continuation-lost-race" }
  }

  // A guest refusal the usage hint missed: sign-in, not a toast (ADR-0045).
  if (!isAuthenticated && body.code && GUEST_SIGN_IN_CODES.has(body.code)) {
    return { kind: "sign-in" }
  }

  const title = body.error ?? error.message
  return {
    kind: "toast",
    title:
      title.length === 0 || GENERIC_MESSAGES.has(title.toLowerCase())
        ? GENERIC_FALLBACK
        : title,
  }
}
