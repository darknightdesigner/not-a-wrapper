/**
 * One IntersectionObserver per `[data-scroll-root]` ancestor, shared by every
 * target observed under it, with one callback per target. Used by the thread's
 * turn observation and the code-block highlight gate.
 */

type IntersectionChange = (intersecting: boolean) => void

export type ScrollRootIntersectionObserver = {
  observe: (target: Element, onChange: IntersectionChange) => () => void
  disconnect: () => void
}

export function closestScrollRoot(el: Element | null): HTMLElement | null {
  return el?.closest<HTMLElement>("[data-scroll-root]") ?? null
}

export function createScrollRootIntersectionObserver({
  rootMargin,
  threshold,
  withoutScrollRoot = "intersecting",
}: {
  rootMargin: string
  threshold: number
  /** No `[data-scroll-root]` ancestor: "intersecting" reports true once;
   * "viewport" observes against the viewport. */
  withoutScrollRoot?: "intersecting" | "viewport"
}): ScrollRootIntersectionObserver {
  // A null key is the viewport.
  const roots = new Map<
    HTMLElement | null,
    {
      callbacks: Map<Element, IntersectionChange>
      observer: IntersectionObserver
    }
  >()

  return {
    observe(target, onChange) {
      const root = closestScrollRoot(target)
      // jsdom and old browsers have no IntersectionObserver: treat as visible.
      if (
        typeof IntersectionObserver === "undefined" ||
        (!root && withoutScrollRoot === "intersecting")
      ) {
        onChange(true)
        return () => undefined
      }

      let observation = roots.get(root)
      if (!observation) {
        const callbacks = new Map<Element, IntersectionChange>()
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              callbacks.get(entry.target)?.(
                entry.isIntersecting && entry.intersectionRatio >= threshold
              )
            }
          },
          { root, rootMargin, threshold }
        )
        observation = { callbacks, observer }
        roots.set(root, observation)
      }

      observation.callbacks.set(target, onChange)
      observation.observer.observe(target)
      return () => {
        // A newer observe() of the same target owns it now.
        const current = roots.get(root)
        if (!current || current.callbacks.get(target) !== onChange) return
        current.callbacks.delete(target)
        current.observer.unobserve(target)
        if (current.callbacks.size === 0) {
          current.observer.disconnect()
          roots.delete(root)
        }
      }
    },
    disconnect() {
      for (const { callbacks, observer } of roots.values()) {
        callbacks.clear()
        observer.disconnect()
      }
      roots.clear()
    },
  }
}
