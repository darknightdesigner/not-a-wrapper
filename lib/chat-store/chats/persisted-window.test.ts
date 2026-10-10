/** @vitest-environment jsdom */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Chats } from "../types"

type PersistedWindowModule = typeof import("./persisted-window")

// Lets a test hold the adoption transition to inspect the commits before it.
const transitions = vi.hoisted(() => ({
  hold: false,
  held: [] as Array<() => void>,
}))
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>()
  return {
    ...react,
    startTransition: (callback: () => void) => {
      if (transitions.hold) transitions.held.push(callback)
      else react.startTransition(callback)
    },
  }
})

const values = new Map<string, string>()
const setItem = vi.fn((key: string, value: string) => values.set(key, value))

function chat(id: string): Chats {
  return {
    id,
    user_id: "user-row",
    title: id,
    model: "openai/gpt-5-mini",
    project_id: null,
    public: false,
    pinned: false,
    pinned_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    live_run_status: "streaming",
  }
}

describe("persisted sidebar window", () => {
  let store: PersistedWindowModule

  beforeAll(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem,
      },
    })
  })

  beforeEach(async () => {
    vi.useFakeTimers()
    transitions.hold = false
    transitions.held.length = 0
    values.clear()
    setItem.mockClear()
    // Fresh module state: clearing stops writes for the document.
    vi.resetModules()
    store = await import("./persisted-window")
  })

  it("rejects malformed, foreign-owner, and stale-version envelopes", () => {
    const valid = store.serializePersistedWindow("user-1", [chat("a")], [])
    expect(store.parsePersistedWindow(valid, "user-1")?.chats[0]?.id).toBe("a")
    expect(store.parsePersistedWindow(valid, "user-2")).toBeNull()
    expect(store.parsePersistedWindow("{", "user-1")).toBeNull()
    expect(
      store.parsePersistedWindow(valid.replace('"v":1', '"v":0'), "user-1")
    ).toBeNull()
    expect(
      store.parsePersistedWindow(
        valid.replace('"pinned":false', '"pinned":"no"'),
        "user-1"
      )
    ).toBeNull()
    expect(
      store.parsePersistedWindow(
        valid.replace('"projects":[]', '"projects":[{"_id":1}]'),
        "user-1"
      )
    ).toBeNull()
  })

  it("does not persist run status or rewrite an identical snapshot", () => {
    const serialized = store.serializePersistedWindow("user-1", [chat("a")], [])
    expect(serialized).not.toContain("streaming")

    store.schedulePersistedWindowWrite(serialized)
    vi.runAllTimers()
    store.schedulePersistedWindowWrite(
      store.serializePersistedWindow(
        "user-1",
        [{ ...chat("a"), live_run_status: null }],
        []
      )
    )
    vi.runAllTimers()

    expect(setItem).toHaveBeenCalledOnce()
  })

  it("clears the window on sign-out and restores it if sign-out fails", () => {
    const serialized = store.serializePersistedWindow("user-1", [chat("a")], [])
    store.schedulePersistedWindowWrite(serialized)
    vi.runAllTimers()

    const current = store.serializePersistedWindow("user-1", [chat("b")], [])
    store.schedulePersistedWindowWrite(current)
    store.clearPersistedWindow()
    vi.runAllTimers()
    expect(values.has(store.PERSISTED_WINDOW_STORAGE_KEY)).toBe(false)

    store.resumePersistedWindowWrites()
    vi.runAllTimers()
    expect(values.get(store.PERSISTED_WINDOW_STORAGE_KEY)).toBe(current)

    // A withdrawn request (owner gate closed, provider unmounted) stays gone.
    store.schedulePersistedWindowWrite(current)()
    store.clearPersistedWindow()
    store.resumePersistedWindowWrites()
    vi.runAllTimers()
    expect(values.has(store.PERSISTED_WINDOW_STORAGE_KEY)).toBe(false)
  })

  it("stops writes when another tab removes the window", async () => {
    // Same module registry as the fresh store, so hooks share one React.
    const { act, createElement } = await import("react")
    const { createRoot } = await import("react-dom/client")
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    function Reader() {
      store.usePersistedWindow("user-1", false)
      return null
    }
    const root = createRoot(document.createElement("div"))
    act(() => root.render(createElement(Reader)))

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: store.PERSISTED_WINDOW_STORAGE_KEY,
        newValue: null,
      })
    )
    // A failed sign-out here does not undo the other tab's stop.
    store.clearPersistedWindow()
    store.resumePersistedWindowWrites()
    store.schedulePersistedWindowWrite(
      store.serializePersistedWindow("user-1", [chat("a")], [])
    )
    vi.runAllTimers()
    act(() => root.unmount())

    expect(setItem).not.toHaveBeenCalled()
  })

  it("adopts the window in a transition after hydration, never in a sync render", async () => {
    const { act, createElement, startTransition } = await import("react")
    const { hydrateRoot } = await import("react-dom/client")
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    values.set(
      store.PERSISTED_WINDOW_STORAGE_KEY,
      store.serializePersistedWindow("user-1", [chat("a")], [])
    )
    function Rows() {
      const persisted = store.usePersistedWindow("user-1", true)
      const ids = persisted?.chats.map((row) => row.id).join()
      return createElement("p", null, ids ?? "none")
    }
    const container = document.createElement("div")
    container.innerHTML = "<p>none</p>"

    // CI: a sync post-hydration adoption delayed composer readiness (ADR-0048).
    transitions.hold = true
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, createElement(Rows))
    })
    expect(container.textContent).toBe("none")

    transitions.hold = false
    act(() => transitions.held.splice(0).forEach(startTransition))
    expect(container.textContent).toBe("a")
    act(() => root?.unmount())
  })
})
