# Markdown Rendering Audit

> **Date**: February 20, 2026
> **Scope**: Full audit of Not A Wrapper's markdown rendering pipeline — current capabilities, competitive gaps, plugin ecosystem, `marked.lexer()` fragility, and prioritized recommendations.
> **Related**: [markdown-typography-comparison.md](./markdown-typography-comparison.md) (typography-only deep dive)

---

## Table of Contents

1. [Current Rendering Stack](#1-current-rendering-stack)
2. [Capability Assessment](#2-capability-assessment)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Plugin & Library Evaluation](#4-plugin--library-evaluation)
5. [`marked.lexer()` Fragility Analysis](#5-markedlexer-fragility-analysis)
6. [Prioritized Recommendations](#6-prioritized-recommendations)

---

## 1. Current Rendering Stack

### Architecture

```
Input (streaming text)
  │
  ▼
parseMarkdownIntoBlocks()          ← marked.lexer() with math protection
  │
  ▼
MemoizedMarkdownBlock[]            ← React.memo per block (string equality)
  │
  ▼
ReactMarkdown                      ← remark-gfm, remark-breaks, remark-math
  │                                   rehype-katex
  ▼
Custom components                  ← code (Shiki), links (LinkMarkdown), pre (passthrough)
```

### Key Files

| File | Role |
|------|------|
| `components/ui/markdown.tsx` | Core renderer — `parseMarkdownIntoBlocks`, `MemoizedMarkdownBlock`, `Markdown` |
| `components/ui/code-block.tsx` | Shiki syntax highlighting, theme-aware, SSR fallback |
| `app/components/chat/link-markdown.tsx` | Favicon pill links for external URLs |
| `app/components/chat/message-assistant.tsx` | Message wrapper — prose styling, streaming caret |
| `app/globals.css` | Typography token bridge (`--tw-prose-*` → design tokens) |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react-markdown` | 10.1.0 | Markdown → React component rendering |
| `remark-gfm` | 4.0.1 | GFM: tables, task lists, strikethrough, autolinks, footnotes |
| `remark-breaks` | 4.0.0 | Soft line breaks → `<br>` |
| `remark-math` | 6.0.0 | Math syntax parsing (`$...$`, `$$...$$`) |
| `rehype-katex` | 7.0.1 | KaTeX math rendering |
| `marked` | 15.0.12 | Block-level lexing only (not rendering) |
| `shiki` | 3.22.0 | Syntax highlighting for code blocks |
| `@tailwindcss/typography` | 0.5.16 | Prose styling via `--tw-prose-*` variables |

---

## 2. Capability Assessment

### What Works Well

| Feature | Quality | Notes |
|---------|---------|-------|
| **Headings** (h1–h6) | Excellent | Styled via prose modifiers, `text-wrap: balance` |
| **Paragraphs** | Excellent | `text-wrap: pretty`, proper spacing |
| **Bold / Italic / Strikethrough** | Excellent | GFM strikethrough included |
| **Ordered & unordered lists** | Good | Proper indentation, spacing. Nested lists work. |
| **Links** | Excellent | Custom `LinkMarkdown` with favicon pill, domain display, external handling |
| **Code blocks** | Good | Shiki highlighting, copy button, language label, theme-aware |
| **Inline code** | Good | Styled with `bg-primary-foreground`, monospace font |
| **Tables** | Good | GFM tables render, horizontal overflow handled (`prose-table:block prose-table:overflow-y-auto`) |
| **Blockquotes** | Good | Styled via prose defaults with design token bridge |
| **Math (inline)** | Good | `$...$` rendered via KaTeX |
| **Math (block)** | Good | `$$...$$` rendered via KaTeX, protected from `marked.lexer()` |
| **Task lists** | Partial | Checkboxes render (from GFM) but are not interactive — read-only. This is acceptable for AI output. |
| **Horizontal rules** | Good | Styled via `--tw-prose-hr` token |
| **Soft line breaks** | Good | `remark-breaks` converts `\n` to `<br>` — matches AI output patterns |
| **Streaming performance** | Good | Per-block memoization prevents re-rendering unchanged blocks |
| **Typography integration** | Good | Design token bridge maps all `--tw-prose-*` to our oklch tokens (see `globals.css`) |

### What Fails or Degrades

| Feature | Severity | Problem |
|---------|----------|---------|
| **Mermaid diagrams** | High | No rendering. ` ```mermaid ` code blocks display as raw code text. Models frequently output Mermaid for flowcharts, sequence diagrams, ER diagrams. |
| **HTML in markdown** | Medium | `<details>`, `<summary>`, `<kbd>`, `<mark>`, `<sup>`, `<sub>` are stripped. No `rehype-raw` plugin. Models occasionally output these (especially `<details>` for collapsible sections). |
| **Footnotes styling** | Medium | `remark-gfm` parses `[^1]` footnote syntax, but the default rendering is unstyled and often looks broken — tiny superscript numbers with no visual affordance, footnote definitions at the bottom lack separation. Models like Perplexity and Claude use footnotes heavily for citations. |
| **Code language coverage** | Medium | Only 16 languages pre-loaded in Shiki (`DEFAULT_LANGS`). AI models output code in 50+ languages. Missing: `ruby`, `php`, `swift`, `kotlin`, `scala`, `r`, `lua`, `perl`, `c`, `cpp`, `csharp`, `dockerfile`, `toml`, `ini`, `makefile`, `graphql`, `proto`, `diff`, `powershell`, etc. Unlisted languages fall back to plaintext. |
| **Image rendering** | Low–Medium | `![alt](url)` works via default react-markdown, but images are unsized and may cause layout shift. No lightbox or zoom. No lazy loading. |
| **Heading anchors** | Low | No `rehype-slug` — headings are not linkable. Minor for chat context but useful for long structured responses. |
| **Line numbers in code** | Low | Not supported. Some competitors show optional line numbers. |
| **Syntax highlighting during streaming** | Low | Shiki runs in an async `useEffect` — code blocks show unstyled plaintext until highlighting completes. Brief flash on initial render. |

---

## 3. Competitive Landscape

### Product-by-Product Analysis

#### ChatGPT (OpenAI)

- **Renderer**: Custom implementation (not open-source), optimized for streaming
- **Code**: Syntax highlighting with broad language support; copy button; no line numbers
- **Math**: KaTeX rendering for both inline and block
- **Mermaid**: Not natively rendered — Mermaid code blocks show as code (as of Feb 2026)
- **Tables**: Full GFM table rendering with clean styling
- **Footnotes**: Limited — used for citations in browsing mode
- **HTML**: Minimal — no raw HTML pass-through
- **Unique features**: Canvas for editable code/writing artifacts, collapsible "Thought" sections, image generation inline

#### Claude.ai (Anthropic)

- **Renderer**: Custom implementation
- **Code**: Syntax highlighting, copy button, broad language support
- **Math**: KaTeX rendering
- **Mermaid**: Rendered via Artifacts (sandboxed iframe), not inline in chat
- **Tables**: Well-styled GFM tables
- **Footnotes**: Supported, commonly used for citations
- **HTML**: Via Artifacts (sandboxed); not inline in chat text
- **Unique features**: Artifacts system for interactive content (HTML, SVG, React components), collapsible thinking sections

#### Gemini (Google)

- **Renderer**: Custom implementation, tightly integrated with Google ecosystem
- **Code**: Syntax highlighting, copy button
- **Math**: LaTeX rendering
- **Mermaid**: Not confirmed as inline
- **Tables**: GFM tables
- **Footnotes**: Limited
- **Unique features**: Grounding with Google Search citations, massive context windows

#### Perplexity

- **Renderer**: Custom implementation optimized for search/citation workflow
- **Code**: Standard syntax highlighting
- **Math**: KaTeX
- **Footnotes**: Core feature — inline citation numbers `[1]`, `[2]` linking to sources
- **Unique features**: Citation-first design, source cards with favicons, "Ask follow-up" flow

#### Open WebUI (Svelte)

- **Renderer**: `marked.lexer()` → custom Svelte components (token-level rendering)
- **Code**: Highlight.js or Shiki, copy button, line numbers optional
- **Math**: KaTeX
- **Mermaid**: Yes — client-side rendering via mermaid library
- **Tables**: Full GFM with styled components
- **Footnotes**: Supported
- **HTML**: Supported (direct HTML rendering via token-level approach)
- **Unique features**: Most feature-complete open-source; supports image generation preview, artifacts, TTS

#### Streamdown (Vercel)

- **Renderer**: Custom streaming-optimized, built on unified/remark ecosystem
- **Code**: Shiki via `@streamdown/code` plugin, copy/download buttons
- **Math**: KaTeX via `@streamdown/math` plugin
- **Mermaid**: Yes via `@streamdown/mermaid` plugin — fullscreen, pan/zoom
- **Tables**: Full GFM
- **Footnotes**: GFM footnotes via remark-gfm
- **HTML**: Supported
- **Streaming**: First-class — `remend` preprocessor handles incomplete markdown gracefully
- **Unique features**: Tree-shakeable plugin architecture, built-in block memoization, CJK support, URL safety modals

### Feature Matrix

| Feature | NaW | ChatGPT | Claude | Gemini | Perplexity | Open WebUI | Streamdown |
|---------|-----|---------|--------|--------|------------|------------|------------|
| Code highlighting | ✅ (16 langs) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Math (KaTeX) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| GFM tables | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Task lists | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Strikethrough | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Footnotes | ⚠️ styled poorly | ⚠️ | ✅ | ⚠️ | ✅✅ | ✅ | ✅ |
| Mermaid diagrams | ❌ | ❌ | ⚠️ artifacts | — | — | ✅ | ✅ |
| HTML pass-through | ❌ | ❌ | ⚠️ artifacts | — | — | ✅ | ✅ |
| Streaming-safe rendering | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅✅ |
| Block memoization | ✅ | — | — | — | — | — | ✅ |
| Copy code button | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Image rendering | ⚠️ basic | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Link previews | ✅ favicon | ✅ cards | ⚠️ | ⚠️ | ✅✅ cards | ⚠️ | ⚠️ |

**Legend**: ✅ = supported, ⚠️ = partial/limited, ❌ = not supported, — = unknown/N/A

### Key Takeaway

Not A Wrapper has strong fundamentals (code blocks, math, tables, typography integration, streaming memoization) but falls behind on two features that are increasingly becoming table-stakes in the open-source AI chat space: **Mermaid diagram rendering** and **robust streaming-safe rendering** of partial markdown. The biggest single product gap vs. Open WebUI and Streamdown is Mermaid.

---

## 4. Plugin & Library Evaluation

### 4.1 Mermaid Rendering

**The problem**: AI models frequently output ` ```mermaid ` code blocks for flowcharts, sequence diagrams, class diagrams, state diagrams, Gantt charts, and ER diagrams. Currently these render as raw text.

**Candidate solutions**:

| Solution | Approach | Bundle Size | SSR | Streaming | Maintenance |
|----------|----------|-------------|-----|-----------|-------------|
| **Custom code handler + `mermaid` library** | Detect `language-mermaid` in code component, render client-side | ~800KB (mermaid core, gzip ~200KB) | No (client-only) | OK — renders after block complete | mermaid is actively maintained (14.x, 93K stars) |
| `@streamdown/mermaid` | Streamdown plugin | Bundled with streamdown | No | Native streaming support | Vercel-maintained |
| `rehype-mermaidjs` | Rehype plugin, uses Playwright | Heavy (Node.js only) | Yes (SSR) | N/A | Active, by Remco Haszing |
| `remark-mermaidjs` | Remark plugin, SVG inline | Heavy (Node.js only) | Yes (SSR) | N/A | Active, recommends rehype variant |

**Recommendation**: Custom code handler approach. Intercept `language-mermaid` in the existing `INITIAL_COMPONENTS.code` handler, lazy-load the mermaid library, render client-side into SVG. This avoids heavy Node.js dependencies (Playwright) and integrates naturally with our existing architecture. The mermaid library is large (~800KB) but can be lazy-loaded with `dynamic()` or `React.lazy()` — it only loads when a mermaid block appears.

If we migrate to Streamdown (see §4.6), `@streamdown/mermaid` provides this for free.

### 4.2 HTML Pass-Through (`rehype-raw`)

**The problem**: `<details>`/`<summary>`, `<kbd>`, `<mark>`, `<sup>`, `<sub>`, and other HTML elements embedded in markdown are silently stripped.

**Candidate solutions**:

| Solution | Approach | Risk | Bundle |
|----------|----------|------|--------|
| `rehype-raw` + `rehype-sanitize` | Parse raw HTML, then sanitize | XSS if sanitization misconfigured | ~15KB combined |
| `rehype-raw` alone | Parse raw HTML, no sanitization | XSS risk — AI output is semi-trusted but not fully trusted | ~8KB |
| Custom component overrides | Map specific HTML elements | Safe, but limited to anticipated elements | 0KB |

**Recommendation**: `rehype-raw` + `rehype-sanitize` with a strict allowlist. Since AI model output is not user-generated content, the XSS risk is low but nonzero (prompt injection attacks could produce malicious HTML). A strict allowlist (`details`, `summary`, `kbd`, `mark`, `sup`, `sub`, `abbr`, `dl`, `dt`, `dd`) provides safety without blocking useful elements.

**Important caveat**: `rehype-raw` requires `remark-rehype` to be configured with `allowDangerousHtml: true`. In react-markdown, this is handled by passing `rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}` — the `allowDangerousHtml` option is set internally by react-markdown when `rehype-raw` is in the pipeline.

### 4.3 Footnote Styling

**The problem**: `remark-gfm` parses footnotes (`[^1]` references and `[^1]: definition` blocks), but the rendered HTML uses default browser styles — tiny superscripts, no visual separation, footnote definitions dumped at the bottom of the block without formatting.

**Candidate solutions**:

| Solution | Approach | Effort |
|----------|----------|--------|
| CSS styling via `globals.css` | Target `.footnotes`, `.footnote-ref`, `[data-footnote-ref]` | Low (~20 lines CSS) |
| Custom components via react-markdown | Override `sup`, `section[data-footnotes]` in component map | Medium |
| `rehype-citation` | Full academic citation engine | Overkill for AI chat |

**Recommendation**: CSS-only approach. The footnote HTML generated by remark-gfm uses predictable class names and `data-*` attributes. Adding ~20 lines of targeted CSS to `globals.css` will produce properly styled footnotes (visible superscript badges, separator line, styled definition list).

### 4.4 Code Language Coverage

**The problem**: Shiki is configured with only 16 languages in `DEFAULT_LANGS`. AI models output code in 50+ languages. Unlisted languages silently fall back to `lang: "text"` (plaintext).

**Candidate solutions**:

| Solution | Approach | Bundle Impact | Effort |
|----------|----------|---------------|--------|
| Expand `DEFAULT_LANGS` to ~40 | Add common languages to the static list | ~200KB more WASM grammars loaded upfront | Very low |
| Lazy-load languages on demand | Use `shiki.loadLanguage()` when unknown language detected | No upfront cost; ~5–15KB per language on demand | Medium |
| Switch to `shiki/bundle/web` | Broader default set (~40 languages, web-focused) | ~4.2MB full, ~748KB gzip | Low |

**Recommendation**: Expand `DEFAULT_LANGS` to ~30–35 common languages (add `c`, `cpp`, `csharp`, `ruby`, `php`, `swift`, `kotlin`, `scala`, `r`, `lua`, `perl`, `dockerfile`, `toml`, `graphql`, `diff`, `powershell`, `xml`). The incremental WASM cost is modest and avoids the complexity of on-demand loading. Shiki already has a singleton pattern in our code, so the grammars are only loaded once.

For a more robust long-term solution, implement on-demand loading as a follow-up: try the pre-loaded language first, fall back to `shiki.loadLanguage()` if unknown, with a graceful plaintext fallback if the language doesn't exist in Shiki.

### 4.5 Heading Anchors (`rehype-slug`)

**The problem**: Headings in AI responses are not linkable. For long structured responses, users can't share or reference specific sections.

**Solution**: `rehype-slug` (~2KB, well-maintained, part of the unified ecosystem). Adds `id` attributes to headings based on their text content. Minimal effort, no risk.

**Priority**: Low — nice-to-have for long responses but not a common user pain point.

### 4.6 Streamdown Migration (Strategic Option)

**The strategic question**: Should we migrate from `react-markdown` + `marked.lexer()` to Streamdown?

| Dimension | react-markdown (current) | Streamdown |
|-----------|-------------------------|------------|
| **Streaming** | Per-block memoization via custom `parseMarkdownIntoBlocks` | Native streaming with `remend` preprocessor |
| **Block splitting** | `marked.lexer()` with math protection workaround | Built-in, streaming-aware |
| **Mermaid** | Not supported | `@streamdown/mermaid` plugin |
| **Math** | `remark-math` + `rehype-katex` | `@streamdown/math` plugin |
| **Code** | Custom Shiki integration | `@streamdown/code` plugin (Shiki) |
| **Incomplete markdown** | Not handled — can flicker during streaming | `remend` preprocessor handles gracefully |
| **Customization** | Full control via component overrides | Full control via component overrides + plugins |
| **Ecosystem** | remark/rehype plugins compatible | remark/rehype plugins compatible |
| **Maintainer** | Community (unified/remarkjs) | Vercel (aligns with AI SDK) |
| **Maturity** | 10+ years, battle-tested | Released Aug 2025, 4.4K stars, v2.2.0 |
| **Bundle** | Minimal core (~20KB) + plugins | Minimal core + tree-shakeable plugins |

**Assessment**: Streamdown is compelling because it was built for exactly our use case (AI chat with streaming) and is maintained by Vercel (whose AI SDK we already use). It would eliminate our custom `parseMarkdownIntoBlocks` function, the `marked.lexer()` dependency, the math protection workaround, and give us Mermaid for free.

**Risk**: Streamdown is 6 months old (v2.2.0). While backed by Vercel and growing fast (4.4K stars), it hasn't been battle-tested as long as react-markdown (10+ years, 15.5K stars). Our existing per-block memoization and component customizations would need to be re-validated.

**Verdict**: Recommend evaluating Streamdown as a medium-term migration target. Don't migrate immediately — instead, implement the quick wins (Mermaid, languages, footnote CSS) on the current stack, then evaluate Streamdown in a dedicated spike. If Streamdown's component customization model accommodates our `LinkMarkdown`, `CodeBlock`, and `ButtonCopy` components cleanly, migration would simplify the codebase significantly.

---

## 5. `marked.lexer()` Fragility Analysis

### How It Works Today

`parseMarkdownIntoBlocks` (in `components/ui/markdown.tsx`) uses `marked.lexer()` to split a markdown string into block-level tokens, each rendered as an independent memoized `ReactMarkdown` instance:

```
input markdown → protect fenced code → protect $$ math → marked.lexer() → restore math → block strings[]
```

### Known Fragility: Math Blocks

Already mitigated. `$$` blocks are replaced with `%%MATH_N%%` placeholders before lexing, then restored after. This works because `marked.lexer()` doesn't understand LaTeX math delimiters and would fragment `$$` content into multiple tokens (treating lines inside as paragraphs, headings, etc.).

### Additional Fragility Risks

#### 1. Inline math with block-like content

If inline math `$...$` contains content that looks like markdown block syntax (e.g., `$x > 0$ and $y < 0$` where `>` could start a blockquote), `marked.lexer()` won't be confused because inline content is wrapped in paragraph tokens. However, edge cases exist where `$` signs on their own lines could interact with marked's tokenizer. **Risk: Low but nonzero.**

#### 2. Single-line `$$` blocks

The protection regex `\$\$[\s\S]*?\$\$` uses non-greedy matching, which works for well-formed `$$...\n...\n$$` blocks. However, `$$x^2$$` on a single line is treated as a block by `remark-math` but could be treated differently by `marked.lexer()` after protection (the placeholder becomes a single paragraph token, which is correct). **Risk: Low.**

#### 3. Footnote definitions across block boundaries

`marked.lexer()` doesn't understand GFM footnote syntax. A footnote definition like:

```markdown
[^1]: This is a long footnote
    that spans multiple lines.
```

May be split into multiple tokens by marked (the continuation line could become a separate code block due to the 4-space indent). When each token is rendered independently by `ReactMarkdown` with `remark-gfm`, the footnote reference `[^1]` in one block won't find its definition in another block. **Risk: Medium — footnotes that span blocks will break.**

#### 4. Reference-style links

```markdown
See [this article][1] for details.

[1]: https://example.com
```

If the reference and definition end up in different blocks (which they will — marked treats them as separate tokens), the link won't resolve. **Risk: Medium — but AI models rarely use reference-style links.**

#### 5. Parser mismatch

The fundamental design tension: `marked.lexer()` and `remark` (used by `react-markdown`) are different parsers with different opinions about block boundaries. While they agree on the common cases (paragraphs, headings, code fences, lists), they can disagree on edge cases:

- Setext headings (underline-style `===` / `---`) — marked and remark may disagree on when these form headings vs. horizontal rules
- Lazy continuation lines in blockquotes — slightly different rules
- List item continuation — indentation thresholds differ
- HTML blocks — different recognition heuristics

**Risk: Low for typical AI output, which tends to use ATX headings, fenced code blocks, and simple list structures. Would become medium-high if we need to support user-authored markdown or complex edge cases.**

#### 6. Frontmatter / YAML blocks

If an AI model outputs `---` at the start of a response (uncommon but possible), marked would tokenize it as a horizontal rule while remark might treat it as frontmatter depending on configuration. **Risk: Very low — AI models rarely output frontmatter.**

### Recommendation

The `marked.lexer()` approach is adequate for current needs. The math protection workaround is the only significant fragility, and it's already handled. The footnote cross-block issue (risk #3) is real but low-impact since most AI footnote definitions appear directly after the reference.

If we migrate to Streamdown, this entire concern disappears — Streamdown uses a unified pipeline where block splitting and rendering share the same parser.

If we stay on the current stack long-term, the most robust improvement would be to replace `marked.lexer()` with remark's own parser for block splitting:

```typescript
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkStringify from 'remark-stringify'

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(markdown)

  return tree.children.map(node => {
    const start = node.position?.start.offset ?? 0
    const end = node.position?.end.offset ?? markdown.length
    return markdown.slice(start, end)
  })
}
```

This eliminates the parser mismatch entirely — the same remark parser splits blocks and renders them. The math protection workaround becomes unnecessary since `remarkMath` handles `$$` blocks natively. **Estimated effort: 2–4 hours.**

---

## 6. Prioritized Recommendations

### Tier 1: Quick Wins (1–3 days total)

#### 1.1 Expand Shiki Language List

| Dimension | Detail |
|-----------|--------|
| **Problem** | Code in unlisted languages (C, C++, Ruby, PHP, etc.) renders as plaintext |
| **Solution** | Add ~15–20 more languages to `DEFAULT_LANGS` in `code-block.tsx` |
| **Effort** | 30 minutes |
| **Risk** | None — additive change, slightly more WASM loaded at startup |
| **User impact** | Better syntax highlighting across all AI models |

#### 1.2 Style Footnotes via CSS

| Dimension | Detail |
|-----------|--------|
| **Problem** | Footnote references are unstyled tiny superscripts; definitions lack visual separation |
| **Solution** | Add ~20 lines of CSS to `globals.css` targeting `.footnotes`, `[data-footnote-ref]`, `[data-footnote-backref]` |
| **Effort** | 1 hour |
| **Risk** | None — CSS only, no logic changes |
| **User impact** | Better readability for citation-heavy responses (Perplexity models, Claude with sources) |

#### 1.3 Replace `marked.lexer()` with Remark Parser

| Dimension | Detail |
|-----------|--------|
| **Problem** | Parser mismatch between block-splitter (marked) and renderer (remark), requiring math protection workaround |
| **Solution** | Use `unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse()` for block splitting |
| **Effort** | 2–4 hours |
| **Risk** | Low — need to verify block boundaries match current behavior for common patterns |
| **User impact** | Eliminates potential edge cases, removes `marked` dependency, removes math protection hack |

### Tier 2: Medium Effort, High Impact (1–2 weeks total)

#### 2.1 Mermaid Diagram Rendering

| Dimension | Detail |
|-----------|--------|
| **Problem** | ` ```mermaid ` blocks render as raw text |
| **Solution** | Custom component: detect `language-mermaid` in code handler → lazy-load `mermaid` library → render SVG client-side. Include theme support (light/dark), error boundary, and a "View full-screen" option. |
| **Effort** | 3–5 days |
| **Risk** | Medium — mermaid library is large (~800KB), must be lazy-loaded. SVG rendering can fail on malformed diagrams — needs error boundary with fallback to raw code display. |
| **User impact** | High — flowcharts, sequence diagrams, and architecture diagrams render visually instead of as code dumps |

#### 2.2 Add `rehype-raw` + `rehype-sanitize`

| Dimension | Detail |
|-----------|--------|
| **Problem** | HTML elements in markdown (`<details>`, `<kbd>`, `<mark>`, etc.) are silently stripped |
| **Solution** | Add `rehype-raw` and `rehype-sanitize` to the rehype plugin chain with a strict element allowlist |
| **Effort** | 1–2 days (including testing security implications) |
| **Risk** | Low–Medium — must get the sanitize schema right to prevent XSS while allowing useful elements. Test with adversarial inputs. |
| **User impact** | Medium — collapsible sections, keyboard shortcuts (`<kbd>`), highlighted text (`<mark>`) render correctly |

#### 2.3 Shiki On-Demand Language Loading

| Dimension | Detail |
|-----------|--------|
| **Problem** | Even with an expanded language list, niche languages will still fall back to plaintext |
| **Solution** | Catch the Shiki error when a language isn't loaded, call `highlighter.loadLanguage()`, retry. Cache loaded languages in the singleton. |
| **Effort** | 1–2 days |
| **Risk** | Low — graceful fallback already exists (plaintext) |
| **User impact** | Every language Shiki supports (~170) gets proper highlighting, without loading them all upfront |

### Tier 3: Strategic (Spike + Potential Migration)

#### 3.1 Evaluate Streamdown Migration

| Dimension | Detail |
|-----------|--------|
| **Problem** | Current stack requires a custom block-splitting layer, manual streaming workarounds, and doesn't handle incomplete markdown |
| **Solution** | Conduct a 2–3 day spike: port the `Markdown` component to use Streamdown, verify custom component compatibility (`LinkMarkdown`, `CodeBlock`, `ButtonCopy`), benchmark streaming performance, assess migration effort |
| **Effort** | 2–3 day spike, then 1–2 weeks for full migration if approved |
| **Risk** | Medium — Streamdown is young (6 months), API could change. Need to verify our customizations work. |
| **User impact** | Smoother streaming (no incomplete-markdown flicker), Mermaid built-in, better streaming caret handling, simplified codebase |
| **Decision point** | If the spike shows clean component compatibility and no regressions, Streamdown migration would subsume recommendations 1.3, 2.1, and 2.3 |

#### 3.2 Add Heading Anchors

| Dimension | Detail |
|-----------|--------|
| **Problem** | Headings in long responses aren't linkable |
| **Solution** | Add `rehype-slug` plugin |
| **Effort** | 1 hour |
| **Risk** | None |
| **User impact** | Low — nice for long structured responses, not critical |

### Implementation Priority Map

```
                       High Impact
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                  │
         │   2.1 Mermaid   │                  │
         │                 │                  │
         │        1.3 Remark parser           │
         │                 │                  │
    High ├────1.1 Languages┼──2.2 rehype-raw──┤ Low
   Effort│                 │                  │Effort
         │                 │                  │
         │  3.1 Streamdown │   1.2 Footnotes  │
         │     spike       │                  │
         │                 │   3.2 Anchors    │
         │                 │                  │
         └─────────────────┼─────────────────┘
                           │
                       Low Impact
```

### Recommended Execution Order

1. **1.1** Expand Shiki languages (30 min, no risk)
2. **1.2** Style footnotes (1 hour, CSS only)
3. **1.3** Replace `marked.lexer()` with remark parser (2–4 hours, removes tech debt)
4. **2.1** Mermaid diagram rendering (3–5 days, biggest user-facing gap)
5. **2.2** Add `rehype-raw` + `rehype-sanitize` (1–2 days)
6. **3.1** Streamdown spike (2–3 days, informs long-term direction)
7. **2.3** Shiki on-demand loading (1–2 days, or skip if Streamdown migration proceeds)
8. **3.2** Heading anchors (1 hour, whenever convenient)

---

## Evidence Quality

| Claim | Source | Confidence |
|-------|--------|------------|
| Mermaid not rendered in NaW | Code audit — no mermaid handling in `INITIAL_COMPONENTS` | High |
| Shiki limited to 16 languages | Direct read of `DEFAULT_LANGS` in `code-block.tsx` | High |
| ChatGPT lacks native Mermaid | OpenAI community forum (Jan 2025), verified Feb 2026 | High |
| Streamdown is drop-in react-markdown replacement | Vercel docs, npm package, GitHub README | High |
| `marked.lexer()` fragments footnote definitions | Known behavior — marked has no GFM footnote tokenizer; 4-space indent triggers code block token | High |
| `rehype-raw` security risk | rehype security policy, unified docs | High |
| Open WebUI supports Mermaid | Code audit via research docs, GitHub source | High |
| Streamdown maturity | Released Aug 2025, v2.2.0, 4.4K stars | Medium — healthy trajectory but young |

---

*Research completed February 20, 2026. Sources: Codebase audit, npm package documentation, GitHub repositories, Vercel changelog, OpenAI community forums, unified ecosystem docs, competitive product analysis.*
