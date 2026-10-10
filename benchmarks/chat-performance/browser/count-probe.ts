/**
 * Deterministic interaction counts (ADR-0049): the in-page probe and the
 * paired comparison contract. Counts measure work done, not how long it took,
 * so a regression shows up as the same number on every run instead of a noisy
 * millisecond distribution.
 */

/** One measured interaction window. Chrome metrics come from CDP deltas. */
export type CountSample = {
  /** `onCommitFiberRoot` calls (React commits). */
  reactCommits: number
  /** Function/class component fibers that performed work. */
  componentRenders: number
  /** Hooks on those renders (memoizedState chain length): the hook census. */
  hookRenders: number
  /** `useSyncExternalStore` hooks among those renders: store subscriptions. */
  storeSubscriptionRenders: number
  /** Context dependencies among those renders. */
  contextReadRenders: number
  domMutations: number
  recalcStyleCount: number
  layoutCount: number
  nodesDelta: number
  jsEventListenersDelta: number
  /** Wall-clock CDP durations: report-only context, never gated. */
  scriptDurationMs: number
  recalcStyleDurationMs: number
  layoutDurationMs: number
  taskDurationMs: number
}

export type ComponentCensus = {
  label: string
  renders: number
  /** Hooks summed over those renders. */
  hookRenders: number
}

export type CountMetric = Exclude<
  keyof CountSample,
  "scriptDurationMs" | "recalcStyleDurationMs" | "layoutDurationMs" | "taskDurationMs"
>

export type InteractionId = "composer-typing" | "composer-menu-open"

export type InteractionCounts = {
  id: InteractionId
  cpuThrottle: number
  samples: CountSample[]
  /** Top component types by hook renders in the first sample (minified names carry a DOM hint). */
  topComponents: ComponentCensus[]
}

export type CountsResultFile = {
  schema: "interaction-counts-v1"
  commit: string
  buildId: string
  browser: string
  typedCharacters: number
  interactions: InteractionCounts[]
}

/**
 * Gated counts, chosen by the stability proof in ADR-0049: identical across
 * five runs at 1x and 4x CPU. Everything else is report-only.
 */
export const GATED_COUNTS: Record<InteractionId, readonly CountMetric[]> = {
  "composer-typing": [
    "reactCommits",
    "componentRenders",
    "hookRenders",
    "storeSubscriptionRenders",
    "contextReadRenders",
    "domMutations",
    "layoutCount",
  ],
  "composer-menu-open": [
    "reactCommits",
    "componentRenders",
    "hookRenders",
    "storeSubscriptionRenders",
    "contextReadRenders",
    "domMutations",
    "recalcStyleCount",
    "layoutCount",
  ],
}

export const COUNT_THROTTLES = [1, 4] as const

const REPORTED_COUNTS: readonly CountMetric[] = [
  "reactCommits",
  "componentRenders",
  "hookRenders",
  "storeSubscriptionRenders",
  "contextReadRenders",
  "domMutations",
  "recalcStyleCount",
  "layoutCount",
  "nodesDelta",
  "jsEventListenersDelta",
]

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Compare a base and candidate capture from the same runner. A gated count
 * fails when it varies between runs (invalid evidence) or when the candidate
 * exceeds the base, so the ceiling ratchets down with main automatically.
 */
export function compareCounts(
  base: CountsResultFile,
  head: CountsResultFile,
  minimumSamples = 5
): { ok: boolean; lines: string[] } {
  const lines: string[] = []
  let ok = true
  const failure = (line: string) => {
    ok = false
    lines.push(`FAIL ${line}`)
  }
  if (base.schema !== "interaction-counts-v1" || head.schema !== base.schema)
    return { ok: false, lines: ["FAIL incompatible count schemas"] }
  if (base.typedCharacters !== head.typedCharacters)
    return { ok: false, lines: ["FAIL captures typed different inputs"] }
  for (const id of Object.keys(GATED_COUNTS) as InteractionId[]) {
    for (const cpuThrottle of COUNT_THROTTLES) {
      const key = `${id} @${cpuThrottle}x`
      const find = (file: CountsResultFile) =>
        file.interactions.find((entry) => entry.id === id && entry.cpuThrottle === cpuThrottle)
      const baseEntry = find(base)
      const headEntry = find(head)
      if (!baseEntry || !headEntry) {
        failure(`${key}: NOT EVALUATED (missing capture)`)
        continue
      }
      if (baseEntry.samples.length < minimumSamples || headEntry.samples.length < minimumSamples) {
        failure(`${key}: NOT EVALUATED (fewer than ${minimumSamples} samples)`)
        continue
      }
      for (const metric of REPORTED_COUNTS) {
        const baseValues = baseEntry.samples.map((sample) => sample[metric])
        const headValues = headEntry.samples.map((sample) => sample[metric])
        const gated = GATED_COUNTS[id].includes(metric)
        const label = `${key} ${metric}: base ${median(baseValues)} -> head ${median(headValues)}`
        if (!gated) {
          lines.push(`info ${label} (report-only)`)
          continue
        }
        const unstable = [baseValues, headValues].some((values) => new Set(values).size > 1)
        if (unstable) failure(`${label}: unstable capture [${baseValues}] / [${headValues}]`)
        else if (headValues[0] > baseValues[0]) failure(`${label}: regression`)
        else lines.push(`ok   ${label}`)
      }
    }
  }
  return { ok, lines }
}

/**
 * Installed with `addInitScript` before any page script. Production React
 * registers with a DevTools hook that exists and `supportsFiber`, then calls
 * `onCommitFiberRoot` after every commit. Self-contained: it is serialized.
 */
export function installCountProbe(): void {
  type Hook = { next: Hook | null; queue: unknown }
  type Fiber = {
    tag: number
    type: unknown
    flags: number
    child: Fiber | null
    sibling: Fiber | null
    alternate: Fiber | null
    memoizedState: unknown
    dependencies: { firstContext: { next: unknown } | null } | null
    stateNode: unknown
  }
  type Totals = {
    reactCommits: number
    componentRenders: number
    hookRenders: number
    storeSubscriptionRenders: number
    contextReadRenders: number
    domMutations: number
    lastActivityAt: number
  }
  const FUNCTION = 0
  const CLASS = 1
  const FORWARD_REF = 11
  const SIMPLE_MEMO = 15
  const HOST = 5
  const PERFORMED_WORK = 1
  const totals: Totals = {
    reactCommits: 0,
    componentRenders: 0,
    hookRenders: 0,
    storeSubscriptionRenders: 0,
    contextReadRenders: 0,
    domMutations: 0,
    lastActivityAt: 0,
  }
  const byType = new Map<unknown, { fiber: Fiber; renders: number; hookRenders: number }>()
  const typeName = (fiber: Fiber) => {
    const type = fiber.type as { displayName?: string; name?: string; render?: { name?: string } } | null
    return type?.displayName || type?.name || type?.render?.name || "anonymous"
  }
  const hostHint = (fiber: Fiber) => {
    let node: Fiber | null = fiber
    while (node && node.tag !== HOST) node = node.child
    const element = node?.stateNode
    if (!(element instanceof Element)) return ""
    const attribute = ["data-testid", "data-slot", "aria-label", "role"]
      .map((name) => element.getAttribute(name) && `${name}=${element.getAttribute(name)}`)
      .find(Boolean)
    return `<${element.tagName.toLowerCase()}${attribute ? ` ${attribute}` : ""}>`
  }
  const record = (fiber: Fiber) => {
    if (![FUNCTION, CLASS, FORWARD_REF, SIMPLE_MEMO].includes(fiber.tag)) return
    if ((fiber.flags & PERFORMED_WORK) === 0) return
    let hooks = 0
    let stores = 0
    if (fiber.tag !== CLASS) {
      for (let hook = fiber.memoizedState as Hook | null; hook; hook = hook.next) {
        hooks++
        const queue = hook.queue as { getSnapshot?: unknown } | null
        if (queue && typeof queue.getSnapshot === "function") stores++
      }
    }
    let contexts = 0
    for (let item = fiber.dependencies?.firstContext as { next: unknown } | null; item; item = item.next as { next: unknown } | null) contexts++
    totals.componentRenders++
    totals.hookRenders += hooks
    totals.storeSubscriptionRenders += stores
    totals.contextReadRenders += contexts
    const entry = byType.get(fiber.type) ?? { fiber, renders: 0, hookRenders: 0 }
    entry.renders++
    entry.hookRenders += hooks
    byType.set(fiber.type, entry)
  }
  // Untouched subtrees keep the previous child list, so their stale flags are skipped.
  const walk = (root: Fiber) => {
    const stack: Fiber[] = [root]
    while (stack.length > 0) {
      const fiber = stack.pop()!
      record(fiber)
      if (fiber.sibling) stack.push(fiber.sibling)
      if (fiber.child && fiber.child !== fiber.alternate?.child) stack.push(fiber.child)
    }
  }
  const renderers = new Map<number, unknown>()
  const hook = {
    supportsFiber: true,
    isDisabled: false,
    renderers,
    inject(internals: unknown) {
      const id = renderers.size + 1
      renderers.set(id, internals)
      return id
    },
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      totals.reactCommits++
      totals.lastActivityAt = performance.now()
      const current = root.current
      // The root's child list is new whenever anything below it rendered.
      if (current.child && current.child !== current.alternate?.child) walk(current.child)
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  }
  Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", { value: hook, configurable: true })
  const observer = new MutationObserver((records) => {
    totals.domMutations += records.length
    totals.lastActivityAt = performance.now()
  })
  const observe = () =>
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
  if (document.documentElement) observe()
  else document.addEventListener("readystatechange", observe, { once: true })
  Object.defineProperty(window, "__countProbe", {
    configurable: true,
    value: {
      snapshot: () => ({ ...totals }),
      resetCensus: () => byType.clear(),
      census: (limit: number) =>
        [...byType.values()]
          .sort((a, b) => b.hookRenders - a.hookRenders || b.renders - a.renders)
          .slice(0, limit)
          .map((entry) => ({
            label: `${typeName(entry.fiber)} ${hostHint(entry.fiber)}`.trim(),
            renders: entry.renders,
            hookRenders: entry.hookRenders,
          })),
    },
  })
}
