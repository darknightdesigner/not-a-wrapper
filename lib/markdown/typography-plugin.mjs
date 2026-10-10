/**
 * `@tailwindcss/typography` with its blockquote quote-mark rules re-keyed.
 *
 * Upstream ships `blockquote p:first-of-type::before` and
 * `blockquote p:last-of-type::after`. Chromium matches the subject compound
 * `p:last-of-type` on every `<p>` under `.prose` before checking the blockquote
 * ancestor, which flags each parent for positional invalidation: every
 * streamed block append then restyled all sibling paragraphs. The re-keyed
 * selectors match the same elements, but `:is(blockquote *)` fails first
 * outside blockquotes, so only blockquote paragraphs carry the flag.
 */
import typography from "@tailwindcss/typography"
import plugin from "tailwindcss/plugin"

const REKEYED_QUOTE_RULES = {
  "blockquote p:first-of-type::before": "p:is(blockquote *):first-of-type::before",
  "blockquote p:last-of-type::after": "p:is(blockquote *):last-of-type::after",
}

const upstream = typography()
const themes = structuredClone(upstream.config.theme.typography)

let rekeyed = 0
themes.DEFAULT.css = themes.DEFAULT.css.map((css) =>
  // Rebuild in place so the rules keep their cascade position.
  Object.fromEntries(
    Object.entries(css).map(([selector, style]) => {
      const next = REKEYED_QUOTE_RULES[selector]
      if (!next) return [selector, style]
      rekeyed++
      return [next, style]
    })
  )
)
// Fail the build instead of silently shipping the positional rules again.
if (rekeyed !== Object.keys(REKEYED_QUOTE_RULES).length) {
  throw new Error(
    "@tailwindcss/typography changed its blockquote quote rules; update lib/markdown/typography-plugin.mjs"
  )
}

export default plugin(upstream.handler, { theme: { typography: themes } })
