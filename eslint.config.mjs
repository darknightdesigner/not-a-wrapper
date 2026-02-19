import nextConfig from "eslint-config-next"

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "convex/_generated/**",
      "lib/payclaw.ts", // Auto-synced from provisioning-agent — upstream code style
    ],
  },
  {
    // Icon system enforcement: Use HugeIcons (@hugeicons/react + @hugeicons-pro/core-stroke-rounded)
    // See .agents/archive/icon-mapping-phosphor-hugeicons.md for migration details
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/icons/extras.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message:
                "Use @hugeicons/react with @hugeicons-pro/core-stroke-rounded instead. See .agents/archive/icon-mapping-phosphor-hugeicons.md",
            },
            {
              name: "@phosphor-icons/react",
              message:
                "Use @hugeicons/react with @hugeicons-pro/core-stroke-rounded instead. See .agents/archive/icon-mapping-phosphor-hugeicons.md",
            },
          ],
          patterns: [
            {
              group: ["lucide-react/*"],
              message:
                "Use @hugeicons/react with @hugeicons-pro/core-stroke-rounded instead. See .agents/archive/icon-mapping-phosphor-hugeicons.md",
            },
            {
              group: ["@phosphor-icons/react/*"],
              message:
                "Use @hugeicons/react with @hugeicons-pro/core-stroke-rounded instead. See .agents/archive/icon-mapping-phosphor-hugeicons.md",
            },
          ],
        },
      ],
    },
  },
  {
    // Prefer `type` over `interface` for type definitions (R09).
    // Reasons: consistency across the codebase, better union/intersection composability,
    // and alignment with React 19 patterns (e.g. props as type aliases).
    // Existing violations should be fixed opportunistically during other work.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },
]

export default eslintConfig
