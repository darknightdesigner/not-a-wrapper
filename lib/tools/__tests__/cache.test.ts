import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LruTtlCache } from "../cache"

describe("LruTtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("evicts the least recently used entry when capacity is exceeded", () => {
    const cache = new LruTtlCache<string, string>({
      ttlMs: 60_000,
      maxEntries: 2,
    })

    cache.set("a", "value-a")
    cache.set("b", "value-b")

    // Refresh "a" so "b" becomes least recently used.
    expect(cache.get("a")).toBe("value-a")

    cache.set("c", "value-c")

    expect(cache.get("a")).toBe("value-a")
    expect(cache.get("b")).toBeNull()
    expect(cache.get("c")).toBe("value-c")
  })

  it("expires entries by TTL without extending freshness on reads", () => {
    const cache = new LruTtlCache<string, string>({
      ttlMs: 1_000,
      maxEntries: 5,
    })

    cache.set("key", "value")

    vi.advanceTimersByTime(700)
    expect(cache.get("key")).toBe("value")

    // Reading refreshed recency, but freshness still uses original fetch time.
    vi.advanceTimersByTime(400)
    expect(cache.get("key")).toBeNull()
  })

  it("prunes stale entries even when they are more recent than fresh ones", () => {
    const cache = new LruTtlCache<string, string>({
      ttlMs: 1_000,
      maxEntries: 2,
    })

    cache.set("stale", "value-stale")
    vi.advanceTimersByTime(900)
    cache.set("fresh", "value-fresh")

    // Refresh recency only. "stale" stays old by fetchedAt and expires soon.
    expect(cache.get("stale")).toBe("value-stale")
    vi.advanceTimersByTime(200)

    // Inserting should prune expired "stale" before evicting healthy entries.
    cache.set("new", "value-new")

    expect(cache.get("fresh")).toBe("value-fresh")
    expect(cache.get("stale")).toBeNull()
    expect(cache.get("new")).toBe("value-new")
  })
})
