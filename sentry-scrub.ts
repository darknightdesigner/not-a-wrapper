const SENSITIVE_KEY_PATTERN =
  /(token|password|secret|authorization|cookie|api[-_]?key|session|bearer)/i
const REDACTED_VALUE = "[REDACTED]"

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, seen))
  }

  if (typeof value !== "object") {
    return value
  }

  if (seen.has(value)) {
    return value
  }

  seen.add(value)
  const record = value as Record<string, unknown>

  for (const [key, nested] of Object.entries(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      record[key] = REDACTED_VALUE
      continue
    }

    record[key] = scrubValue(nested, seen)
  }

  return record
}

export function sentryBeforeSend<T>(event: T): T {
  const seen = new WeakSet<object>()
  return scrubValue(event, seen) as T
}
