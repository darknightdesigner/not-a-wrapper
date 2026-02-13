import {
  resolveToolCapabilities,
  type ToolCapabilities,
} from "@/lib/tools/types"

export function shouldInjectSearchTools(
  enableSearch: boolean,
  modelTools: boolean | ToolCapabilities | undefined
): boolean {
  const capabilities = resolveToolCapabilities(modelTools)
  return enableSearch && capabilities.search
}
