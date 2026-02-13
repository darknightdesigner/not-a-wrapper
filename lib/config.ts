import {
  Brain01Icon,
  Note01Icon,
  PaintBrush01Icon,
  ChartUpIcon,
  Search01Icon,
} from "@hugeicons-pro/core-stroke-rounded"

// IconSvgObject type definition for SUGGESTIONS array
type IconSvgObject = ([string, {
  [key: string]: string | number;
}])[] | readonly (readonly [string, {
  readonly [key: string]: string | number;
}])[]

// ============================================================================
// Rate Limits & Usage
// ============================================================================

export const NON_AUTH_DAILY_MESSAGE_LIMIT = 5
export const AUTH_DAILY_MESSAGE_LIMIT = 1000
export const REMAINING_QUERY_ALERT_THRESHOLD = 2
export const DAILY_FILE_UPLOAD_LIMIT = 5
export const DAILY_LIMIT_PRO_MODELS = 500

export const NON_AUTH_ALLOWED_MODELS = ["gpt-5-mini", "gpt-5.2"]

export const FREE_MODELS_IDS = [
  "openrouter:deepseek/deepseek-r1:free",
  "openrouter:meta-llama/llama-3.3-8b-instruct:free",
  "pixtral-large-latest",
  "mistral-large-latest",
  "gpt-5-mini",
]

export const MODEL_DEFAULT = "gpt-5.2"

export const APP_NAME = "Not A Wrapper"
export const APP_DOMAIN = "https://not-a-wrapper.com"

export const SUGGESTIONS: Array<{
  label: string
  highlight: string
  prompt: string
  items: string[]
  icon: IconSvgObject
}> = [
  {
    label: "Code",
    highlight: "Help me",
    prompt: `Help me code`,
    items: [
      "Help me debug this React component that's not rendering",
      "Help me write a Python script to process CSV files",
      "Help me optimize this database query for better performance",
      "Help me implement authentication in my Next.js app",
    ],
    icon: Brain01Icon,
  },
  {
    label: "Writing",
    highlight: "Write",
    prompt: `Write`,
    items: [
      "Write a professional email to follow up on a job application",
      "Write documentation for my open-source project",
      "Write a blog post explaining machine learning basics",
      "Write a compelling product description for my startup",
    ],
    icon: Note01Icon,
  },
  {
    label: "Research",
    highlight: "Research",
    prompt: `Research`,
    items: [
      "Research the pros and cons of different state management libraries",
      "Research best practices for API design in 2025",
      "Research how to implement real-time features with WebSockets",
      "Research the latest trends in AI and machine learning",
    ],
    icon: Search01Icon,
  },
  {
    label: "Analysis",
    highlight: "Analyze",
    prompt: `Analyze`,
    items: [
      "Analyze this code for potential security vulnerabilities",
      "Analyze the performance bottlenecks in my application",
      "Analyze this dataset and summarize key insights",
      "Analyze the architecture of this system and suggest improvements",
    ],
    icon: ChartUpIcon,
  },
  {
    label: "Creative",
    highlight: "Create",
    prompt: `Create`,
    items: [
      "Create a color palette for a modern SaaS dashboard",
      "Create user stories for a new feature I'm building",
      "Create a README template for my GitHub project",
      "Create a presentation outline for my tech talk",
    ],
    icon: PaintBrush01Icon,
  },
  {
    label: "Learning",
    highlight: "Explain",
    prompt: `Explain`,
    items: [
      "Explain how React Server Components work",
      "Explain the difference between SQL and NoSQL databases",
      "Explain WebAssembly and when to use it",
      "Explain OAuth 2.0 flow in simple terms",
    ],
    icon: Brain01Icon,
  },
]

export const SYSTEM_PROMPT_DEFAULT = `You are a helpful AI assistant powered by Not A Wrapper, an open-source multi-model chat application. You provide thoughtful, accurate, and helpful responses across a wide range of topics.

You excel at:
- Programming and software development across all languages
- Writing, editing, and content creation
- Research, analysis, and summarization
- Problem-solving and brainstorming
- Explaining complex topics in accessible ways
- Data analysis and interpretation

Your communication style is clear, direct, and tailored to the user's needs. You provide specific, actionable guidance rather than generic advice. When working on code, you explain your reasoning and consider edge cases. When writing, you adapt to the requested tone and format.

You're honest about limitations and uncertainties. When you don't know something, you say so. When a question is ambiguous, you ask for clarification rather than making assumptions.

You respect the user's time by being concise when appropriate and thorough when the situation calls for it.`

export const MESSAGE_MAX_LENGTH = 10000

// ============================================================================
// Context Management (Anthropic Best Practices)
// ============================================================================

/**
 * Token threshold before triggering context compaction.
 * Based on Claude Sonnet's 200K context window with safety margin.
 */
export const CONTEXT_COMPACTION_THRESHOLD = 100_000

/**
 * Number of recent messages to preserve during compaction.
 * These messages are kept in full; older messages are summarized.
 */
export const CONTEXT_PRESERVE_RECENT_MESSAGES = 10

/**
 * Maximum concurrent sub-agent tasks for parallel processing.
 */
export const MAX_CONCURRENT_SUB_AGENTS = 3

/**
 * Path to structured notes file for agentic memory.
 */
export const STRUCTURED_NOTES_FILE = "./NOTES.md"

/**
 * Anthropic API beta headers for extended features.
 * @see https://www.anthropic.com/news/context-management
 */
export const ANTHROPIC_BETA_HEADERS = {
  /** Enable context management tools (memory, editing) */
  contextManagement: "context-management-2025-06-27",
  /** Token-efficient tool use */
  tokenEfficient: "token-efficient-tools-2025-02-19",
  /** 1M token context window (requires tier 4) */
  extendedContext: "context-1m-2025-08-07",
} as const

// ============================================================================
// Sub-Agent Model Configuration
// ============================================================================

/**
 * Model assignments for sub-agent architecture.
 * Optimized for cost/performance balance.
 *
 * @see lib/ai/sub-agents/types.ts
 * @see .agents/context/research/tech-stack-evaluation.md
 */
// ============================================================================
// MCP Integration
// ============================================================================

export const MAX_MCP_SERVERS_PER_USER = 10
export const MAX_TOOL_RESULT_SIZE = 100 * 1024 // 100KB
export const MCP_CONNECTION_TIMEOUT_MS = 5000
export const MCP_CIRCUIT_BREAKER_THRESHOLD = 3
export const MCP_MAX_STEP_COUNT = 20
export const MCP_MAX_TOOLS_PER_REQUEST = 50

/** Timeout for MCP tool executions (in milliseconds).
 * MCP tools connect to arbitrary user-configured servers that can hang.
 * Enforced via Promise.race in wrapMcpTools(). On timeout, the AI SDK
 * receives a thrown ToolTimeoutError and gracefully returns a tool-error
 * to the model, which can acknowledge the failure and continue.
 * 30s is conservative — aligns with MCP RFC #1492 direction (60s proposed).
 */
export const MCP_TOOL_EXECUTION_TIMEOUT_MS = 30_000

// ============================================================================
// Tool Infrastructure
// ============================================================================

/** Max steps when no tools are available (currently hardcoded as 10 in route.ts:213) */
export const DEFAULT_MAX_STEP_COUNT = 10

/**
 * Max steps for anonymous (unauthenticated) users with tools.
 * Capped lower than authenticated users (MCP_MAX_STEP_COUNT = 20) to limit
 * tool call cost exposure. With 5 daily messages × 5 steps, worst case is
 * 25 tool calls/day/user — manageable at $0.005/Exa search.
 */
export const ANONYMOUS_MAX_STEP_COUNT = 5

/**
 * Step number after which prepareStep restricts tools to read-only.
 * The model has full tool access for the first N steps; after this
 * threshold, only tools explicitly marked as readOnly: true remain.
 * MCP tools are conservatively included (can't classify read/write yet).
 */
export const PREPARE_STEP_THRESHOLD = 3

/**
 * Timeout for individual third-party tool executions (in milliseconds).
 * Provider tools (Layer 1) are server-side and have their own timeouts.
 * Third-party tools (Layer 2) make outbound HTTP requests that could hang.
 * This timeout is enforced via AbortSignal in custom tool() wrappers.
 *
 * Not yet enforced — reserved for Phase 7 when custom tool() wrappers
 * with AbortSignal support are added for third-party tools.
 */
export const TOOL_EXECUTION_TIMEOUT_MS = 15_000

// ============================================================================
// Sub-Agent Model Configuration
// ============================================================================

export const SUB_AGENT_MODELS = {
  /** Main orchestrator - complex reasoning */
  orchestrator: "claude-opus-4-5-20250929",
  /** Code assistance - fast, cost-effective */
  codeAssistant: "claude-haiku-4-5-20250929",
  /** Writing and editing - balanced */
  writingEditor: "claude-sonnet-4-5-20250929",
  /** Research and analysis - needs reasoning */
  researchAnalyst: "claude-sonnet-4-5-20250929",
  /** Data interpretation - data analysis */
  dataAnalyst: "claude-sonnet-4-5-20250929",
} as const
