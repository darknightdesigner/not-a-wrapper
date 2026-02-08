import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: [
      "@hugeicons/react",
      "@hugeicons-pro/core-stroke-rounded",
    ],
    // Disables Turbopack's persistent SST cache to prevent recurring ENOENT crashes
    // from corrupted cache files. Trade-off: slightly slower cold starts (~5-15s).
    // TODO: Re-enable once upstream fix lands — https://github.com/vercel/next.js/issues
    // See: .agents/context/troubleshooting/turbopack-sst-write-failure.md
    turbopackFileSystemCacheForDev: false,
  },
  serverExternalPackages: ["shiki", "vscode-oniguruma"],
  images: {
    remotePatterns: [
      // Convex file storage
      {
        protocol: "https",
        hostname: "*.convex.cloud",
        port: "",
        pathname: "/**",
      },
      // GitHub avatars for user profiles
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "/**",
      },
      // Clerk profile images
      {
        protocol: "https",
        hostname: "img.clerk.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
}

export default nextConfig
