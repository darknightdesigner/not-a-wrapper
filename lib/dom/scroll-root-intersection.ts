/**
 * One IntersectionObserver per `[data-scroll-root]` ancestor, shared by every
 * target observed under it, with one callback per target. Used by the thread's
 * turn observation and the code-block highlight gate.
 */

type IntersectionChange = (intersecting: boolean) => void
/** A fresh object per observe() call: the token its cleanup must still own. */
type Registration = { onChange: IntersectionChange }

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
  withoutScrollRoot,
}: {
  rootMargin: string
  threshold: number
  /** No `[data-scroll-root]` ancestor: "intersecting" reports true once;
   * "viewport" observes against the viewport. */
  withoutScrollRoot: "intersecting" | "viewport"
}): ScrollRootIntersectionObserver {
  // A null key is the viewport.
  const roots = new Map<
    HTMLElement | null,
    {
      registrations: Map<Element, Registration>
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
        const registrations = new Map<Element, Registration>()
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              registrations
                .get(entry.target)
                ?.onChange(
                  entry.isIntersecting && entry.intersectionRatio >= threshold
                )
            }
          },
          { root, rootMargin, threshold }
        )
        observation = { registrations, observer }
        roots.set(root, observation)
      }

      const registration: Registration = { onChange }
      observation.registrations.set(target, registration)
      observation.observer.observe(target)
      return () => {
        // A newer observe() of the same target owns it now, even with the
        // same callback.
        const current = roots.get(root)
        if (current?.registrations.get(target) !== registration) return
        current.registrations.delete(target)
        current.observer.unobserve(target)
        if (current.registrations.size === 0) {
          current.observer.disconnect()
          roots.delete(root)
        }
      }
    },
    disconnect() {
      for (const { registrations, observer } of roots.values()) {
        registrations.clear()
        observer.disconnect()
      }
      roots.clear()
    },
  }
}
