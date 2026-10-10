/**
 * Bounded LRU of finished Shiki HTML (ADR-0016 "Lazy Shiki"). Shiki-free so
 * `components/ui/code-block.tsx` can read it synchronously during render;
 * only `lib/markdown/shiki-client.ts` writes it.
 *
 * Keyed by the code string so lookups reuse V8's cached string hash instead
 * of hashing a fresh composite key per render; theme + fenced language select
 * the variant. Least recently used codes are evicted first, bounded by
 * variant count and total characters.
 */
import type { ShikiClientTheme } from "./shiki-client"

const CACHE_MAX_ENTRIES = 200
const CACHE_MAX_CHARS = 2_000_000

export type HighlightTuple = {
  code: string
  language: string | undefined
  theme: ShikiClientTheme
}

type CacheRecord = { code: string; variants: Map<string, string> }

const records = new Map<string, CacheRecord>()
let entryCount = 0
let charCount = 0

const variantKey = ({ theme, language }: HighlightTuple) =>
  `${theme}:${language ?? ""}`

/** Exact-tuple read; never runs Shiki. Refreshes the entry's LRU position. */
export function readCachedHighlight(tuple: HighlightTuple): string | null {
  const record = records.get(tuple.code)
  const html = record?.variants.get(variantKey(tuple))
  if (record === undefined || html === undefined) return null
  records.delete(record.code)
  records.set(record.code, record)
  return html
}

/**
 * `tuple.code` becomes the stored key, so callers pass a flat copy rather
 * than a slice that would retain the whole message it was cut from.
 */
export function storeHighlight(tuple: HighlightTuple, html: string): void {
  if (tuple.code.length + html.length > CACHE_MAX_CHARS) return
  let record = records.get(tuple.code)
  if (record) {
    records.delete(record.code)
  } else {
    record = { code: tuple.code, variants: new Map() }
    charCount += record.code.length
  }
  const variant = variantKey(tuple)
  const previous = record.variants.get(variant)
  if (previous !== undefined) {
    entryCount -= 1
    charCount -= previous.length
  }
  record.variants.set(variant, html)
  entryCount += 1
  charCount += html.length
  records.set(record.code, record)

  for (const oldest of records.values()) {
    if (entryCount <= CACHE_MAX_ENTRIES && charCount <= CACHE_MAX_CHARS) break
    if (oldest === record) break
    records.delete(oldest.code)
    entryCount -= oldest.variants.size
    charCount -= oldest.code.length
    for (const oldHtml of oldest.variants.values()) charCount -= oldHtml.length
  }
}

/** Test-only. */
export function clearHighlightCacheForTests(): void {
  records.clear()
  entryCount = 0
  charCount = 0
}
