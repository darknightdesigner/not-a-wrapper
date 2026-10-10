import path from "path"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Skip agent worktrees (.claude/, full repo copies with their own
    // node_modules) and gitignored benchmark captures.
    exclude: [
      ...configDefaults.exclude,
      ".claude/**",
      "benchmarks/**/results/**",
    ],
    // `vitest bench` mode (bun run bench / bench:chat). Benchmarks live in
    // benchmarks/ and never run as part of `bun run test`.
    benchmark: {
      include: ["benchmarks/**/*.bench.?(c|m)[jt]s?(x)"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
