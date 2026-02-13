import type { UIMessage } from "ai"
import type { ReplayMessage } from "../types"
import { anthropicReplayCompiler } from "./anthropic"
import { openaiReplayCompiler } from "./openai"

export interface ReplayCompileContext {
  targetModelId: string
  hasTools: boolean
  sourceProviderHint?: string
  maxHistoryTokens?: number
}

export type ReplayCompileWarningCode =
  | "tool_non_replayable"
  | "tool_dropped_invalid_role"
  | "invariant_block_dropped"
  | "invariant_reasoning_injected"
  | "message_empty_fallback"
  | "empty_message_fallback"
  | "source_url_dropped"

export interface ReplayCompileWarning {
  code: ReplayCompileWarningCode
  messageIndex: number
  partIndex?: number
  detail: string
}

export interface ReplayCompileStats {
  originalMessageCount: number
  compiledMessageCount: number
  droppedMessages: number
  totalPartsOriginal: number
  totalPartsCompiled: number
  toolExchangesSeen: number
  toolExchangesCompiled: number
  toolExchangesDropped: number
  invariantsRepaired: number
}

export interface ReplayCompileResult {
  messages: UIMessage[]
  warnings: ReplayCompileWarning[]
  stats: ReplayCompileStats
}

export interface ReplayCompiler {
  providerId: string
  compileReplay(
    messages: readonly ReplayMessage[],
    context: ReplayCompileContext,
  ): ReplayCompileResult | Promise<ReplayCompileResult>
}

const compilerRegistry = new Map<string, ReplayCompiler>()
compilerRegistry.set("openai", openaiReplayCompiler)
compilerRegistry.set("anthropic", anthropicReplayCompiler)

export function registerReplayCompiler(compiler: ReplayCompiler): void {
  compilerRegistry.set(compiler.providerId, compiler)
}

export function getReplayCompiler(providerId: string): ReplayCompiler | undefined {
  return compilerRegistry.get(providerId)
}

export async function compileReplay(
  messages: readonly ReplayMessage[],
  providerId: string,
  context: ReplayCompileContext,
): Promise<ReplayCompileResult> {
  const compiler = compilerRegistry.get(providerId)
  if (!compiler) {
    throw new Error(`No replay compiler registered for provider "${providerId}".`)
  }

  return compiler.compileReplay(messages, context)
}
