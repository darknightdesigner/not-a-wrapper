import nextConfig from "eslint-config-next"

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["convex/_generated/**"],
  },
  {
    // Icon system enforcement: Use Phosphor or @/lib/icons instead of lucide-react
    // See .agents/archive/icon-system-migration-plan-2026-01.md for details
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
                "Use @phosphor-icons/react or @/lib/icons instead. See .agents/archive/icon-system-migration-plan-2026-01.md",
            },
          ],
          patterns: [
            {
              group: ["lucide-react/*"],
              message:
                "Use @phosphor-icons/react or @/lib/icons instead. See .agents/archive/icon-system-migration-plan-2026-01.md",
            },
          ],
        },
      ],
    },
  },
]

export default eslintConfig
