/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import {
  compareCounts,
  COUNT_THROTTLES,
  GATED_COUNTS,
  installCountProbe,
  type CountSample,
  type CountsResultFile,
  type InteractionId,
} from "./count-probe"

type TestFiber = Record<string, unknown> & { child: TestFiber | null }

const fiber = (overrides: Partial<TestFiber>): TestFiber => ({
  tag: 0,
  type: () => null,
  flags: 0,
  child: null,
  sibling: null,
  alternate: null,
  memoizedState: null,
  dependencies: null,
  stateNode: null,
  ...overrides,
})

describe("installCountProbe", () => {
  it("counts rendered components and their hooks, skipping untouched subtrees", () => {
    installCountProbe()
    const hook = (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: { inject: (internals: unknown) => number; onCommitFiberRoot: (id: number, root: unknown) => void } }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    const probe = (window as unknown as { __countProbe: { snapshot: () => Record<string, number> } }).__countProbe
    const id = hook.inject({})

    // A bailed-out subtree keeps its old child list and stale PerformedWork flags.
    const staleChild = fiber({ flags: 1, memoizedState: { next: null, queue: null } })
    const untouched = fiber({ child: staleChild })
    untouched.alternate = fiber({ child: staleChild })
    const store = { next: null, queue: { getSnapshot: () => 1 } }
    const rendered = fiber({
      flags: 1,
      sibling: untouched,
      memoizedState: { next: store, queue: null },
      dependencies: { firstContext: { next: null } },
    })
    const current = fiber({ child: rendered })
    current.alternate = fiber({ child: null })
    hook.onCommitFiberRoot(id, { current })

    expect(probe.snapshot()).toMatchObject({
      reactCommits: 1,
      componentRenders: 1,
      hookRenders: 2,
      storeSubscriptionRenders: 1,
      contextReadRenders: 1,
    })
  })
})

const sample = (overrides: Partial<CountSample> = {}): CountSample => ({
  reactCommits: 27,
  componentRenders: 3618,
  hookRenders: 65070,
  storeSubscriptionRenders: 4698,
  contextReadRenders: 6534,
  domMutations: 305,
  recalcStyleCount: 17,
  layoutCount: 79,
  nodesDelta: 147,
  jsEventListenersDelta: 482,
  scriptDurationMs: 80,
  recalcStyleDurationMs: 9,
  layoutDurationMs: 5,
  taskDurationMs: 130,
  ...overrides,
})

const capture = (typing: Partial<CountSample>[] = Array(5).fill({})): CountsResultFile => ({
  schema: "interaction-counts-v1",
  commit: "c",
  buildId: "b",
  browser: "chromium",
  typedCharacters: 26,
  interactions: COUNT_THROTTLES.flatMap((cpuThrottle) =>
    (Object.keys(GATED_COUNTS) as InteractionId[]).map((id) => ({
      id,
      cpuThrottle,
      samples: id === "composer-typing" ? typing.map(sample) : Array.from({ length: 5 }, () => sample()),
      topComponents: [],
    }))
  ),
})

describe("compareCounts", () => {
  it("passes equal or lower counts and ignores report-only noise", () => {
    const head = capture(Array.from({ length: 5 }, (_, run) => ({ componentRenders: 3000, scriptDurationMs: run })))
    expect(compareCounts(capture(), head).ok).toBe(true)
  })

  it("fails a gated increase, an unstable gated count, and a missing capture", () => {
    expect(compareCounts(capture(), capture(Array(5).fill({ hookRenders: 65071 }))).ok).toBe(false)
    const unstable = capture([{}, {}, {}, {}, { reactCommits: 28 }])
    expect(compareCounts(capture(), unstable).lines).toContainEqual(expect.stringContaining("unstable capture"))
    const missing = { ...capture(), interactions: capture().interactions.slice(1) }
    expect(compareCounts(missing, capture()).lines).toContainEqual(expect.stringContaining("NOT EVALUATED"))
  })
})
