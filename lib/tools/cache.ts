type CacheEntry<V> = {
  value: V
  fetchedAt: number
}

export type LruTtlCacheOptions = {
  ttlMs: number
  maxEntries: number
}

/**
 * Minimal in-memory LRU cache with TTL expiration.
 * - `get()` refreshes recency (true LRU behavior)
 * - TTL is based on original fetch time (reads do not extend freshness)
 */
export class LruTtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()
  private readonly now: () => number

  constructor(
    private readonly options: LruTtlCacheOptions,
    now: () => number = Date.now
  ) {
    this.now = now
  }

  get(key: K): V | null {
    const entry = this.entries.get(key)
    if (!entry) return null

    if (this.isExpired(entry)) {
      this.entries.delete(key)
      return null
    }

    // Refresh recency without modifying freshness timestamp.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    if (this.entries.has(key)) {
      this.entries.delete(key)
    } else {
      this.pruneExpiredFromLeastRecent()
      if (this.entries.size >= this.options.maxEntries) {
        const leastRecentKey = this.entries.keys().next().value
        if (leastRecentKey !== undefined) {
          this.entries.delete(leastRecentKey)
        }
      }
    }

    this.entries.set(key, { value, fetchedAt: this.now() })
  }

  clear(): void {
    this.entries.clear()
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    return this.now() - entry.fetchedAt > this.options.ttlMs
  }

  private pruneExpiredFromLeastRecent(): void {
    for (const [key, entry] of this.entries) {
      if (this.isExpired(entry)) {
        this.entries.delete(key)
      }
    }
  }
}
