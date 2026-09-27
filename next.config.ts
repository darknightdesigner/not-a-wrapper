import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"
import { getConvexSiteUrl } from "./app/api/_lib/convex-site-url"

const isProduction = process.env.NODE_ENV === "production"

function convexHost(): string | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * The deployment's HTTP-action origin, where the browser uploads attachments
 * (ADR-0046). Wildcard when it cannot be resolved at build time.
 */
function convexSiteSource(): string {
  try {
    return new URL(getConvexSiteUrl()).origin
  } catch {
    return "https://*.convex.site"
  }
}

/**
 * Derive the Convex deployment origins (https + wss) the browser talks to from
 * `NEXT_PUBLIC_CONVEX_URL`. The Convex client opens a WebSocket to the
 * deployment host, reads files over https on `*.convex.cloud`, and uploads
 * attachments to the deployment's `.convex.site` HTTP actions.
 * Falls back to the wildcard if the env var is absent at build time.
 */
function convexConnectSources(): string[] {
  const host = convexHost()
  if (!host) {
    return [
      "https://*.convex.cloud",
      "wss://*.convex.cloud",
      convexSiteSource(),
    ]
  }
  return [
    `https://${host}`,
    `wss://${host}`,
    // File storage is served from sibling *.convex.cloud subdomains.
    "https://*.convex.cloud",
    convexSiteSource(),
  ]
}

/** Storage URLs from `ctx.storage.getUrl` live on the deployment host. */
function convexImageSource(): string {
  const host = convexHost()
  return host ? `https://${host}` : "https://*.convex.cloud"
}

/**
 * Content-Security-Policy. This is a baseline policy: the non-script directives
 * (`frame-ancestors`, `object-src`, `base-uri`, `form-action`, scoped
 * `connect-src`/`img-src`) are strict and carry real weight; `script-src` still
 * allows `'unsafe-inline'` because the App Router emits inline bootstrap scripts
 * and we have not adopted nonce injection yet (tracked as a follow-up). Sentry is
 * tunneled through the same-origin `/monitoring` route, so it needs no host here.
 */
function contentSecurityPolicy(): string {
  const convex = convexConnectSources()
  // PostHog loads its recorder/array scripts and ingests events from its own
  // subdomains; the exact region host is env-configured.
  const posthog = ["https://*.posthog.com"]

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "frame-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      // WASM (shiki / vscode-oniguruma highlighting) needs wasm compilation.
      "'wasm-unsafe-eval'",
      // React Fast Refresh / eval-based dev tooling only in development.
      ...(isProduction ? [] : ["'unsafe-eval'"]),
      ...posthog,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Images are not inert: an image load is a request with no click, so a
    // prompt-injected reply could load `https://host/?d=<chat>` and leak the
    // chat. Markdown renders images as links; this backstops it with only the
    // hosts the app itself loads: same-origin assets (`/_next/image`, the
    // `/api/favicon` proxy), local previews (data:/blob:), and Convex storage
    // (attachments, uploaded avatars). Password and email-code sign-in carry
    // no identity-provider avatar; add that host here if OAuth sign-in ships.
    "img-src": ["'self'", "data:", "blob:", convexImageSource()],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...convex, ...posthog],
  }

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ")

  // Force TLS for any accidental http subresource in production.
  return isProduction ? `${policy}; upgrade-insecure-requests` : policy
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // HSTS only in production — never pin localhost to https.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
]

const nextConfig: NextConfig = {
  // Don't let `next dev`/`next build` append its agent-rules block to our
  // curated AGENTS.md; that file is hand-maintained and source-of-truth.
  agentRules: false,
  // Default unchanged (.next). The chat-performance browser harness builds
  // into an isolated dir (NEXT_DIST_DIR=.next-perf) so a perf production
  // build/serve never touches the dev server's .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  experimental: {
    // Avoid recurring ENOENT crashes from corrupted persistent SST cache files.
    // Trade-off: slightly slower cold starts.
    turbopackFileSystemCacheForDev: false,
  },
  serverExternalPackages: ["shiki", "vscode-oniguruma"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.convex.cloud",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "/**",
      },
      // Google favicon service (used by web search source citations)
      {
        protocol: "https",
        hostname: "www.google.com",
        port: "",
        pathname: "/s2/favicons/**",
      },
    ],
  },
}

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
  ...(process.env.SENTRY_PROJECT
    ? { project: process.env.SENTRY_PROJECT }
    : {}),
})
