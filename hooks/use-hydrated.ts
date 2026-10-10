import { useSyncExternalStore } from "react"

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

/** False for the server render and the hydration render, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export { useHydrated }
