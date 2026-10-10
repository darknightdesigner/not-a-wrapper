/**
 * Lazy, demand-loaded Shiki highlighter service (ADR-0016 "Lazy Shiki").
 *
 * The ONLY module allowed to load Shiki on the client, and it loads nothing
 * until the first code block asks for a highlight:
 *
 * - `shiki/core` + the JavaScript regex engine (no WASM) and the two themes
 *   are dynamically imported on first use and cached as one highlighter.
 * - Language grammars load on demand from the explicit typed allowlist
 *   below — one fine-grained `@shikijs/langs/<id>` chunk per language, never
 *   the full bundle.
 * - Concurrent initialization and same-language loads are deduplicated;
 *   failed loads clear their cache entry so a later attempt can retry.
 * - Unknown or unsupported languages resolve to Shiki's built-in `text`
 *   (grammar-less) language — never a throw. Callers render React-escaped
 *   plain code until the returned promise resolves, and must discard stale
 *   completions (`components/ui/code-block.tsx`).
 * - Code is tokenized as a one-byte string when it fits Latin-1, finished
 *   HTML is kept in a bounded LRU (`./highlight-cache.ts`), and tokenization
 *   runs through a queue that yields to the main thread between blocks.
 *
 * Consumers must not import `shiki` directly: `components/ui/code-block.tsx`
 * carries no runtime Shiki import (type-only imports here are erased at
 * build time), so no-code conversations ship zero Shiki bytes.
 */
import { markChatPerf } from "@/lib/observability/chat-performance"
import type { HighlighterCore } from "shiki/core"
import {
  clearHighlightCacheForTests,
  readCachedHighlight,
  storeHighlight,
  type HighlightTuple,
} from "./highlight-cache"

export type ShikiClientTheme = "github-dark" | "github-light"

/**
 * Canonical grammar id → fine-grained module loader. Every entry is an
 * explicit static `import()` so the bundler emits one real split chunk per
 * grammar; a template-string import would defeat both the allowlist and
 * chunking. Keep ids in sync with `LANGUAGE_ALIASES` and the label map in
 * `components/ui/markdown.tsx`.
 */
const LANGUAGE_LOADERS = {
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  // Embedded grammars previously loaded transitively remain first-class so
  // their fences do not silently fall back to plain text.
  "cpp-macro": () => import("@shikijs/langs/cpp-macro"),
  glsl: () => import("@shikijs/langs/glsl"),
  haml: () => import("@shikijs/langs/haml"),
  regexp: () => import("@shikijs/langs/regexp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  html: () => import("@shikijs/langs/html"),
  ini: () => import("@shikijs/langs/ini"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  lua: () => import("@shikijs/langs/lua"),
  makefile: () => import("@shikijs/langs/makefile"),
  markdown: () => import("@shikijs/langs/markdown"),
  perl: () => import("@shikijs/langs/perl"),
  php: () => import("@shikijs/langs/php"),
  powershell: () => import("@shikijs/langs/powershell"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  scala: () => import("@shikijs/langs/scala"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
} satisfies Record<string, () => Promise<unknown>>

export type ShikiSupportedLanguage = keyof typeof LANGUAGE_LOADERS

/** Alias → canonical grammar id (lowercased before lookup). */
const LANGUAGE_ALIASES: Record<string, ShikiSupportedLanguage> = {
  bash: "shellscript",
  sh: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  "c++": "cpp",
  cs: "csharp",
  "c#": "csharp",
  cjs: "javascript",
  mjs: "javascript",
  cts: "typescript",
  mts: "typescript",
  regex: "regexp",
  docker: "dockerfile",
  golang: "go",
  gql: "graphql",
  properties: "ini",
  js: "javascript",
  kt: "kotlin",
  kts: "kotlin",
  make: "makefile",
  md: "markdown",
  ps: "powershell",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  ts: "typescript",
  yml: "yaml",
}

/** Ids Shiki treats as the grammar-less plain language. */
const PLAIN_LANGUAGE_IDS = new Set(["", "plain", "plaintext", "text", "txt"])

/**
 * Resolve a fenced-code language id to a canonical loadable grammar, or
 * `"text"` for plain/unknown ids. Pure and synchronous — the allowlist IS
 * the support surface, independent of what has loaded so far.
 */
export function resolveShikiLanguage(
  language: string | undefined
): ShikiSupportedLanguage | "text" {
  const candidate = (language ?? "").trim().toLowerCase()
  if (PLAIN_LANGUAGE_IDS.has(candidate)) return "text"
  if (Object.hasOwn(LANGUAGE_LOADERS, candidate)) {
    return candidate as ShikiSupportedLanguage
  }
  return LANGUAGE_ALIASES[candidate] ?? "text"
}

let corePromise: Promise<HighlighterCore> | null = null
const loadedLanguages = new Set<string>()
const languageLoadPromises = new Map<string, Promise<void>>()

function loadHighlighterCore(): Promise<HighlighterCore> {
  if (!corePromise) {
    corePromise = (async () => {
      // Engine, core, and both themes load together on first demand: one
      // async boundary, no WASM (JS regex engine), themes fixed to the two
      // the app renders.
      const [core, engine, darkTheme, lightTheme] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("@shikijs/themes/github-dark"),
        import("@shikijs/themes/github-light"),
      ])
      return core.createHighlighterCore({
        themes: [darkTheme.default, lightTheme.default],
        langs: [],
        // Forgiving: a grammar pattern the JS engine cannot compile degrades
        // to unhighlighted tokens instead of throwing the whole block back
        // to plain text.
        engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
      })
    })()
    corePromise.catch(() => {
      // Allow a later highlight attempt to retry a failed initialization.
      corePromise = null
    })
  }
  return corePromise
}

function loadLanguage(
  highlighter: HighlighterCore,
  language: ShikiSupportedLanguage
): Promise<void> {
  if (loadedLanguages.has(language)) return Promise.resolve()
  let pending = languageLoadPromises.get(language)
  if (!pending) {
    pending = (async () => {
      const grammar = await LANGUAGE_LOADERS[language]()
      await highlighter.loadLanguage(grammar.default)
      loadedLanguages.add(language)
    })()
    pending.catch(() => {
      languageLoadPromises.delete(language)
    })
    languageLoadPromises.set(language, pending)
  }
  return pending
}

/**
 * V8 stores a string as two-byte UTF-16 when ANY character is outside
 * Latin-1, and slices inherit their parent's width: one em dash or curly
 * quote in a reply's prose makes the extracted fence value two-byte, which
 * puts every grammar regex on V8's slower two-byte path (16 KB TS block:
 * 30 ms one-byte vs 68 ms two-byte). A JSON round trip returns a flat copy
 * that V8 allocates as one-byte whenever every code unit fits, while code
 * that itself contains non-Latin-1 characters correctly stays two-byte. It
 * was the fastest correct copy measured (vs split/join, chunked
 * `String.fromCharCode`, concat loop): ~45 us per 20 KB.
 */
export function toOneByteString(code: string): string {
  const copy: unknown = JSON.parse(JSON.stringify(code))
  return typeof copy === "string" ? copy : code
}

function postMessageTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

/**
 * Two plain macrotask hops, deliberately not `scheduler.yield()`: Chrome runs
 * yield continuations ahead of ordinary tasks, so React's Scheduler (also a
 * MessageChannel task) and timers starved until the whole queue drained and
 * every block committed at once. The previous block's `setState` posts
 * React's render task during the same microtask checkpoint as the first hop,
 * so the second hop queues behind it and each block commits before the next
 * one tokenizes.
 */
async function yieldToMain(): Promise<void> {
  await postMessageTask()
  await postMessageTask()
}

let highlightQueue: Promise<unknown> = Promise.resolve()

/**
 * Tokenization is synchronous, so blocks that become stable together
 * (opening a long thread, a message settling) used to chain into one long
 * task. Serialize them and yield before each, so every block is its own task
 * and input, paint, and React commits run in between. Aborted entries skip
 * both the yield and tokenization, so they never delay live blocks.
 */
function enqueueHighlight<T>(
  signal: AbortSignal | undefined,
  run: () => T
): Promise<T> {
  const task = highlightQueue.then(async () => {
    signal?.throwIfAborted()
    await yieldToMain()
    signal?.throwIfAborted()
    return run()
  })
  highlightQueue = task.catch(() => undefined)
  return task
}

/**
 * Highlight `code` with the resolved grammar and theme, loading whatever is
 * missing on demand. Unknown languages take the `text` path. Rejects on
 * cancellation or loading/highlighting failure. Callers can abort obsolete
 * work while shared resources load or wait in the queue. The loads stay
 * reusable; cancellation skips tokenization rather than cancelling shared work.
 * Cached tuples resolve without running Shiki.
 */
export async function highlightCode(
  args: HighlightTuple & { signal?: AbortSignal }
): Promise<string> {
  args.signal?.throwIfAborted()
  const cached = readCachedHighlight(args)
  if (cached !== null) return cached

  const startedAt = performance.now()
  const resolved = resolveShikiLanguage(args.language)
  const highlighter = await loadHighlighterCore()
  args.signal?.throwIfAborted()
  if (resolved !== "text") {
    try {
      await loadLanguage(highlighter, resolved)
    } catch {
      // Grammar failed to load: degrade to plain text rather than throw.
    }
  }
  args.signal?.throwIfAborted()
  const loadMs = performance.now() - startedAt

  return enqueueHighlight(args.signal, () => {
    // An identical block queued earlier may have filled the cache.
    const queuedHit = readCachedHighlight(args)
    if (queuedHit !== null) return queuedHit
    const lang =
      resolved !== "text" && loadedLanguages.has(resolved) ? resolved : "text"
    const tokenizeStartedAt = performance.now()
    const code = toOneByteString(args.code)
    const html = highlighter.codeToHtml(code, { lang, theme: args.theme })
    // Real Shiki runs only: lazy loads + tokenization, queue wait excluded.
    markChatPerf("shiki_highlight", {
      durationMs: loadMs + performance.now() - tokenizeStartedAt,
    })
    // A degraded `text` render after a failed grammar load is not cached, so
    // a later mount retries the grammar. The flat copy is the stored key.
    if (lang === resolved) {
      storeHighlight({ code, language: args.language, theme: args.theme }, html)
    }
    return html
  })
}

/** Test-only: drop every cached instance, load promise, and cached HTML. */
export function resetShikiClientForTests(): void {
  corePromise = null
  loadedLanguages.clear()
  languageLoadPromises.clear()
  clearHighlightCacheForTests()
  highlightQueue = Promise.resolve()
}
