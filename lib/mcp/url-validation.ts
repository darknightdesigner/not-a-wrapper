/**
 * Validate a URL against SSRF rules.
 * Pure function — no side effects, no DNS resolution.
 *
 * Mirrors the validation in convex/mcpServers.ts (Convex runtime can't import
 * from lib/). Both must stay in sync — changes to one should be reflected in
 * the other.
 *
 * Rejects: private IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x),
 * localhost, 0.0.0.0, [::1], .local hostnames.
 *
 * @returns Error message string if invalid, null if valid
 */
export function validateServerUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "Invalid URL format"
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block localhost and special hostnames
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  ) {
    return "Localhost and local network URLs are not allowed"
  }

  // Block private IP ranges
  const ipParts = hostname.split(".").map(Number)
  if (
    ipParts.length === 4 &&
    ipParts.every((n) => !isNaN(n) && n >= 0 && n <= 255)
  ) {
    const [a, b] = ipParts
    if (
      a === 10 || // 10.0.0.0/8
      a === 127 || // 127.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) || // 169.254.0.0/16
      a === 0 // 0.0.0.0/8
    ) {
      return "Private IP addresses are not allowed"
    }
  }

  // Must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only HTTP and HTTPS URLs are supported"
  }

  return null // valid
}
