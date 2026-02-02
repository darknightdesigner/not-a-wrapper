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
]

export default eslintConfig
