import nextConfig from "eslint-config-next"

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["convex/_generated/**"],
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
    // Prefer `type` over `interface` for type definitions.
    // Reasons: consistency across the codebase, better union/intersection composability,
    // and alignment with React 19 patterns (e.g. props as type aliases).
    // Examples already following this: components/ui/message.tsx, app/components/chat/use-chat-core.ts
    // Set to "warn" so existing violations don't block builds — fix opportunistically.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
    },
  },
]

export default eslintConfig
