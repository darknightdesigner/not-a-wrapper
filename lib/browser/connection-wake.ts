const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of [...subscribers]) subscriber()
}

function notifyWhenVisible() {
  if (document.visibilityState === "visible") notify()
}

function notifyOnRestore(event: PageTransitionEvent) {
  if (event.persisted) notify()
}

/**
 * Moments after which an open connection may be silently dead: the tab
 * becomes visible, the network returns, or the back/forward cache restores
 * the page. Browser listeners exist only while something subscribes.
 */
export function subscribeToConnectionWake(onWake: () => void): () => void {
  if (typeof window === "undefined") return () => undefined
  if (subscribers.size === 0) {
    document.addEventListener("visibilitychange", notifyWhenVisible)
    window.addEventListener("online", notify)
    window.addEventListener("pageshow", notifyOnRestore)
  }
  subscribers.add(onWake)
  return () => {
    if (!subscribers.delete(onWake) || subscribers.size > 0) return
    document.removeEventListener("visibilitychange", notifyWhenVisible)
    window.removeEventListener("online", notify)
    window.removeEventListener("pageshow", notifyOnRestore)
  }
}
