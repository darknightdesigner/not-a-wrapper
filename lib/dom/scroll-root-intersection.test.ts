/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createScrollRootIntersectionObserver } from "./scroll-root-intersection"

class IntersectionObserverStub implements IntersectionObserver {
  static instances: IntersectionObserverStub[] = []

  readonly root: Element | Document | null
  readonly rootMargin: string
  readonly thresholds: readonly number[]
  readonly callback: IntersectionObserverCallback

  disconnect = vi.fn()
  observe = vi.fn()
  takeRecords = vi.fn(() => [])
  unobserve = vi.fn()

  constructor(
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {}
  ) {
    this.callback = callback
    this.root = options.root ?? null
    this.rootMargin = options.rootMargin ?? "0px"
    this.thresholds = [options.threshold ?? 0].flat()
    IntersectionObserverStub.instances.push(this)
  }

  trigger(target: Element, isIntersecting: boolean, intersectionRatio: number) {
    const rect = {} as DOMRectReadOnly
    this.callback(
      [
        {
          boundingClientRect: rect,
          intersectionRatio,
          intersectionRect: rect,
          isIntersecting,
          rootBounds: null,
          target,
          time: 0,
        },
      ],
      this
    )
  }
}

describe("createScrollRootIntersectionObserver", () => {
  let scrollRoot: HTMLDivElement

  beforeEach(() => {
    IntersectionObserverStub.instances = []
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub)
    scrollRoot = document.createElement("div")
    scrollRoot.setAttribute("data-scroll-root", "")
    document.body.appendChild(scrollRoot)
  })

  afterEach(() => {
    scrollRoot.remove()
    vi.unstubAllGlobals()
  })

  it("gates the shared observer by threshold and tears down per scroll root", () => {
    const target = document.createElement("div")
    scrollRoot.appendChild(target)
    const onChange = vi.fn()
    const observer = createScrollRootIntersectionObserver({
      rootMargin: "10px",
      threshold: 0.5,
    })

    const cleanup = observer.observe(target, onChange)
    const instance = IntersectionObserverStub.instances[0]
    expect(instance?.root).toBe(scrollRoot)
    expect(instance?.rootMargin).toBe("10px")
    expect(instance?.thresholds).toEqual([0.5])

    instance?.trigger(target, true, 0.499)
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(false)
    instance?.trigger(target, true, 0.5)
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(true)

    cleanup()
    expect(instance?.unobserve).toHaveBeenCalledWith(target)
    expect(instance?.disconnect).toHaveBeenCalledOnce()
  })

  it("reports intersecting or observes the viewport when there is no scroll root", () => {
    const target = document.createElement("div")
    document.body.appendChild(target)

    const turnChange = vi.fn()
    createScrollRootIntersectionObserver({
      rootMargin: "0px",
      threshold: 0,
    }).observe(target, turnChange)
    expect(turnChange).toHaveBeenCalledExactlyOnceWith(true)
    expect(IntersectionObserverStub.instances).toHaveLength(0)

    const viewportChange = vi.fn()
    createScrollRootIntersectionObserver({
      rootMargin: "200% 0px",
      threshold: 0,
      withoutScrollRoot: "viewport",
    }).observe(target, viewportChange)
    const instance = IntersectionObserverStub.instances[0]
    expect(instance?.root).toBeNull()
    expect(instance?.observe).toHaveBeenCalledWith(target)
    expect(viewportChange).not.toHaveBeenCalled()
    instance?.trigger(target, true, 0.1)
    expect(viewportChange).toHaveBeenCalledExactlyOnceWith(true)
    target.remove()
  })
})
