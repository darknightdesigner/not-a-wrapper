/**
 * Bounded LRU of finished Shiki HTML (ADR-0016 "Lazy Shiki"). Shiki-free so
 * `components/ui/code-block.tsx` can read it synchronously during render;
 * only `lib/markdown/shiki-client.ts` writes it.
 *
 * Keyed by the code string so lookups reuse V8's cached string hash instead
 * of hashing a fresh composite key per render; theme + fenced language select
 * the variant. Least recently used codes are evicted first, then the current
 * code's least recently used variants, so variant count and total characters
 * stay bounded even when one code is stored under many fence labels.
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

const withinLimits = () =>
  entryCount <= CACHE_MAX_ENTRIES && charCount <= CACHE_MAX_CHARS

/** Moves a key to the most recently used end of a Map. */
function touch<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key)
  map.set(key, value)
}

/** Exact-tuple read; never runs Shiki. Refreshes the entry's LRU position. */
export function readCachedHighlight(tuple: HighlightTuple): string | null {
  const record = records.get(tuple.code)
  const variant = variantKey(tuple)
  const html = record?.variants.get(variant)
  if (record === undefined || html === undefined) return null
  touch(records, record.code, record)
  touch(record.variants, variant, html)
  return html
}

/**
 * `tuple.code` becomes the stored key, so callers pass a flat copy rather
 * than a slice that would retain the whole message it was cut from.
 */
export function storeHighlight(tuple: HighlightTuple, html: string): void {
  if (tuple.code.length + html.length > CACHE_MAX_CHARS) return
  let record = records.get(tuple.code)
  if (!record) {
    record = { code: tuple.code, variants: new Map() }
    charCount += record.code.length
  }
  const variant = variantKey(tuple)
  const previous = record.variants.get(variant)
  if (previous !== undefined) {
    entryCount -= 1
    charCount -= previous.length
  }
  touch(records, record.code, record)
  touch(record.variants, variant, html)
  entryCount += 1
  charCount += html.length

  for (const oldest of records.values()) {
    if (withinLimits()) return
    if (oldest === record) break
    records.delete(oldest.code)
    entryCount -= oldest.variants.size
    charCount -= oldest.code.length
    for (const oldHtml of oldest.variants.values()) charCount -= oldHtml.length
  }
  // Only this code is left. The new variant alone fits (checked above), so
  // dropping older variants always restores both bounds.
  for (const [key, oldHtml] of record.variants) {
    if (withinLimits() || key === variant) return
    record.variants.delete(key)
    entryCount -= 1
    charCount -= oldHtml.length
  }
}

/** Test-only. */
export function clearHighlightCacheForTests(): void {
  records.clear()
  entryCount = 0
  charCount = 0
}
