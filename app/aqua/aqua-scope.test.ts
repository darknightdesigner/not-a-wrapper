import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Aqua skins are unlayered and imported after globals.css, so they beat every
 * utility. Any selector that matches without the theme class would repaint
 * light and dark, and any layer or @apply would re-enter Tailwind's cascade.
 */

const AQUA_DIR = new URL("./", import.meta.url)
const SCOPED_SELECTOR = /^(?::root)?\.aqua(?![\w-])/
// Rules inside these are checked like top-level rules; every other at-rule
// (@layer, @apply, @theme, @keyframes, @import, ...) is a violation.
const GROUPING_AT_RULES = new Set(["media", "supports", "container"])
const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g

/** Splits `text` on `separator` at depth 0, outside strings, () and []. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ""
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === "\\") i++
      else if (char === quote) quote = ""
    } else if (char === '"' || char === "'") quote = char
    else if (char === "(" || char === "[") depth++
    else if (char === ")" || char === "]") depth--
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  return [...parts, text.slice(start)]
}

/** Walks top-level blocks; nested rules inherit their parent's scope. */
function checkRules(css: string, violations: string[]) {
  let depth = 0
  let quote = ""
  let start = 0
  let prelude = ""
  for (let i = 0; i < css.length; i++) {
    const char = css[i]
    if (quote) {
      if (char === "\\") i++
      else if (char === quote) quote = ""
    } else if (char === '"' || char === "'") quote = char
    else if (char === "{" && depth++ === 0) {
      prelude = css.slice(start, i).trim()
      start = i + 1
    } else if (char === "}" && --depth === 0) {
      const body = css.slice(start, i)
      start = i + 1
      const atRule = /^@([\w-]+)/.exec(prelude)?.[1]
      if (atRule) {
        if (GROUPING_AT_RULES.has(atRule)) checkRules(body, violations)
        continue
      }
      for (const selector of splitTopLevel(prelude, ",")) {
        if (!SCOPED_SELECTOR.test(selector.trim())) {
          violations.push(selector.trim())
        }
      }
    } else if (char === ";" && depth === 0) {
      const statement = css.slice(start, i).trim()
      if (statement && !statement.startsWith("@")) violations.push(statement)
      start = i + 1
    }
  }
}

function scopeViolations(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const violations: string[] = []
  for (const [, name] of source.replace(STRING, '""').matchAll(/@([\w-]+)/g)) {
    if (!GROUPING_AT_RULES.has(name)) violations.push(`@${name}`)
  }
  checkRules(source, violations)
  return violations
}

describe("aqua theme scope", () => {
  it("flags unscoped selectors, @layer and @apply", () => {
    const fixture = `
      :root.aqua { --a: 1 } /* .unscoped {} */
      .aqua [aria-label="a, b"]:is(x, y), :root.aqua body { color: red }
      .aqua-unscoped {}
      @media (hover: hover) { .aqua x, [data-x] {} }
      @layer aqua { .aqua y {} }
      .aqua z { @apply flex; &:hover { color: red } }
    `
    expect(scopeViolations(fixture)).toEqual([
      "@layer",
      "@apply",
      ".aqua-unscoped",
      "[data-x]",
    ])
  })

  it("scopes every rule in app/aqua/*.css to the aqua class", () => {
    const files = readdirSync(AQUA_DIR).filter((name) => name.endsWith(".css"))
    expect(files.length).toBeGreaterThan(0)
    const violations = files.flatMap((name) =>
      scopeViolations(readFileSync(new URL(name, AQUA_DIR), "utf8")).map(
        (violation) => `${name}: ${violation}`
      )
    )
    expect(violations).toEqual([])
  })
})
