export type ChatErrorType =
  | "auth"
  | "rate_limit"
  | "provider_api"
  | "tool_timeout"
  | "tool_execution"
  | "validation"
  | "internal"
  | "unknown"

type ErrorLike = {
  code?: string
  statusCode?: number
  message?: string
  name?: string
  cause?: unknown
}

function toLowerString(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : ""
}

function matchesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

function getErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") {
    return error as ErrorLike
  }
  return {}
}

export function classifyChatError(error: unknown): ChatErrorType {
  const err = getErrorLike(error)
  const code = toLowerString(err.code)
  const name = toLowerString(err.name)
  const message = toLowerString(err.message)
  const status = err.statusCode

  if (
    status === 400 ||
    matchesAny(code, ["invalid_request", "bad_request", "validation"]) ||
    matchesAny(message, [
      "missing required",
      "invalid request",
      "validation",
      "guest id required",
    ])
  ) {
    return "validation"
  }

  if (
    status === 401 ||
    status === 403 ||
    matchesAny(code, ["not_authenticated", "unauthorized", "forbidden", "missing_api_key"]) ||
    matchesAny(message, [
      "not authenticated",
      "requires authentication",
      "api key",
      "unauthorized",
      "forbidden",
    ])
  ) {
    return "auth"
  }

  if (
    status === 429 ||
    matchesAny(code, ["rate_limit", "too_many_requests", "quota_exceeded"]) ||
    matchesAny(message, ["rate limit", "too many requests", "quota exceeded"])
  ) {
    return "rate_limit"
  }

  const toolSignals = matchesAny(code, ["tool"]) || matchesAny(message, [
    "tool",
    "mcp",
    "function call",
    "tool_call",
  ])
  if (
    toolSignals &&
    (name.includes("timeout") ||
      code.includes("timeout") ||
      matchesAny(message, ["timeout", "timed out", "deadline exceeded", "aborterror"]))
  ) {
    return "tool_timeout"
  }
  if (toolSignals) {
    return "tool_execution"
  }

  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    matchesAny(code, ["provider", "upstream"]) ||
    matchesAny(message, [
      "openai",
      "anthropic",
      "google",
      "xai",
      "mistral",
      "perplexity",
      "openrouter",
      "upstream",
      "provider",
      "model not found",
    ])
  ) {
    return "provider_api"
  }

  if (status && status >= 500) {
    return "internal"
  }

  return "unknown"
}
