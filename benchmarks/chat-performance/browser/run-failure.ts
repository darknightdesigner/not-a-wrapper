/**
 * Why a benchmark run failed, in a form the harness can print and compare
 * (ADR-0051). A failed warmup stops its scenario; a second scenario failing
 * its warmup with the same signature stops the suite.
 */

/** Convex client and server errors are tagged `[CONVEX Q(module:fn)]` (or M/A). */
export const CONVEX_ERROR = /\[CONVEX [QMA]\(/

/** One line, bounded: errors land in log lines and result JSON. */
export function compactError(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 400)
}

/**
 * The root cause: the first Convex function error when one was reported,
 * otherwise the error's own message without its trailing evidence.
 */
export function failureCause(message: string, convexErrors: readonly string[]): string {
  return compactError(convexErrors[0] ?? message.split("; ")[0])
}

/**
 * The cause without what differs between attempts of one failure: request
 * ids, URLs, ids and durations. Other numbers (HTTP statuses, counts) stay.
 */
export function failureSignature(cause: string): string {
  return cause
    .replace(/\[Request ID: [^\]]*\]/g, "")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, "<id>")
    // Convex document ids and similar opaque tokens.
    .replace(/\b(?=[a-z0-9]*\d)[a-z0-9]{16,}\b/gi, "<id>")
    .replace(/\d+(?:\.\d+)?\s*ms\b/g, "<ms>")
    .replace(/\s+/g, " ")
    .trim()
}

/** Carries the root cause out of a crashed run so the suite can compare it. */
export class RunFailure extends Error {
  constructor(message: string, readonly rootCause: string, options?: ErrorOptions) {
    super(message, options)
  }
}
