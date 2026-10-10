/**
 * Deterministic interaction counts (ADR-0049). Drives guest interactions on an
 * owned production server and records work counts instead of milliseconds:
 * React commits, component renders and their hooks (the hook census), DOM
 * mutations, and Chrome style/layout counters. Each keystroke is drained to
 * quiescence before the next and motion is reduced, so counts do not depend
 * on CPU speed.
 *
 * Usage:
 *   NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION=true NEXT_DIST_DIR=.next-perf bun run build:next
 *   bun run bench:counts                              # capture -> results/counts/
 *   bun run bench:counts --compare base.json head.json # paired gate (run-paired.ts)
 * Env: RUNS (default 5), WARMUPS (default 1), PERF_PORT (default 3122),
 *      COUNTS_OUT (capture path), PW_CHANNEL.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, type Browser, type CDPSession, type Page } from "playwright"
import {
  compareCounts,
  COUNT_THROTTLES,
  installCountProbe,
  type ComponentCensus,
  type CountSample,
  type CountsResultFile,
  type InteractionCounts,
  type InteractionId,
} from "./count-probe"
import { startPerfServer, type PerfServer } from "./perf-server"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const DIST_DIR = process.env.NEXT_DIST_DIR ?? ".next-perf"
const PERF_PORT = Number(process.env.PERF_PORT ?? 3122)
const RUNS = Number(process.env.RUNS ?? 5)
const WARMUPS = Number(process.env.WARMUPS ?? 1)
const TYPED_TEXT = "Plan a short trip to Kyoto"
const QUIET_MS = 1000

type ProbeTotals = {
  reactCommits: number
  componentRenders: number
  hookRenders: number
  storeSubscriptionRenders: number
  contextReadRenders: number
  domMutations: number
  lastActivityAt: number
}
type ProbeWindow = Window & {
  __countProbe: {
    snapshot: () => ProbeTotals
    resetCensus: () => void
    census: (limit: number) => ComponentCensus[]
  }
}

function log(message: string) {
  console.log(`[bench:counts] ${message}`)
}

/** Resolves once no commit or DOM mutation has happened for `quietMs`. */
function waitForQuiet(page: Page, quietMs: number, capMs: number) {
  return page.evaluate(
    ([quiet, cap]) =>
      new Promise<void>((resolve, reject) => {
        const start = performance.now()
        const tick = () => {
          const now = performance.now()
          const last = Math.max(start, (window as unknown as ProbeWindow).__countProbe.snapshot().lastActivityAt)
          if (now - last >= quiet) resolve()
          else if (now - start > cap) reject(new Error(`page never went quiet for ${quiet}ms`))
          else setTimeout(tick, 50)
        }
        tick()
      }),
    [quietMs, capMs] as const
  )
}

/** Drains frames until a full two-frame cycle adds no commit or mutation. */
function drainFrames(page: Page) {
  return page.evaluate(async () => {
    const probe = (window as unknown as ProbeWindow).__countProbe
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    let previous = -1
    for (let cycle = 0; cycle < 20; cycle++) {
      const totals = probe.snapshot()
      const activity = totals.reactCommits + totals.domMutations
      if (activity === previous) return
      previous = activity
      await frame()
      await frame()
    }
    throw new Error("interaction did not settle within 20 frame cycles")
  })
}

const CHROME_METRICS = {
  RecalcStyleCount: "recalcStyleCount",
  LayoutCount: "layoutCount",
  Nodes: "nodesDelta",
  JSEventListeners: "jsEventListenersDelta",
  ScriptDuration: "scriptDurationMs",
  RecalcStyleDuration: "recalcStyleDurationMs",
  LayoutDuration: "layoutDurationMs",
  TaskDuration: "taskDurationMs",
} as const

async function chromeMetrics(cdp: CDPSession) {
  const { metrics } = await cdp.send("Performance.getMetrics")
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]))
}

/** Counts one interaction: probe and CDP deltas around `act`, ending quiet. */
async function measure(page: Page, cdp: CDPSession, act: () => Promise<void>): Promise<CountSample> {
  await waitForQuiet(page, QUIET_MS, 30_000)
  const probe = () => page.evaluate(() => (window as unknown as ProbeWindow).__countProbe.snapshot())
  const beforeProbe = await probe()
  const beforeChrome = await chromeMetrics(cdp)
  await page.evaluate(() => (window as unknown as ProbeWindow).__countProbe.resetCensus())
  await act()
  await waitForQuiet(page, QUIET_MS, 30_000)
  const afterChrome = await chromeMetrics(cdp)
  const afterProbe = await probe()
  const chrome = Object.fromEntries(
    Object.entries(CHROME_METRICS).map(([name, key]) => {
      const delta = (afterChrome[name] ?? 0) - (beforeChrome[name] ?? 0)
      return [key, key.endsWith("Ms") ? Math.round(delta * 100_000) / 100 : delta]
    })
  ) as Pick<CountSample, (typeof CHROME_METRICS)[keyof typeof CHROME_METRICS]>
  return {
    reactCommits: afterProbe.reactCommits - beforeProbe.reactCommits,
    componentRenders: afterProbe.componentRenders - beforeProbe.componentRenders,
    hookRenders: afterProbe.hookRenders - beforeProbe.hookRenders,
    storeSubscriptionRenders: afterProbe.storeSubscriptionRenders - beforeProbe.storeSubscriptionRenders,
    contextReadRenders: afterProbe.contextReadRenders - beforeProbe.contextReadRenders,
    domMutations: afterProbe.domMutations - beforeProbe.domMutations,
    ...chrome,
  }
}

const census = (page: Page) =>
  page.evaluate(() => (window as unknown as ProbeWindow).__countProbe.census(15))

/** One fresh guest document: typing into the idle home composer, then the plus popover. */
async function runOnce(browser: Browser, baseUrl: string, cpuThrottle: number) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    await context.addInitScript(installCountProbe)
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send("Performance.enable")
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle })
    // Reduced motion removes frame-timed transition commits (menu open varied
    // 17-23 commits with motion, 14 every run without); animation cost stays
    // with the wall-clock suite.
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => performance.getEntriesByName("chat-perf:replay_disabled_v1").length > 0)
    // Fails by timeout if production React never registers with the probe hook.
    await page.waitForFunction(() => (window as unknown as ProbeWindow).__countProbe.snapshot().reactCommits > 0)
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.waitFor({ state: "visible" })
    await editor.click()

    const typing = await measure(page, cdp, async () => {
      for (const character of TYPED_TEXT) {
        await page.keyboard.type(character)
        await drainFrames(page)
      }
    })
    const typingCensus = await census(page)
    if ((await editor.innerText()).trim() !== TYPED_TEXT)
      throw new Error("composer text does not match the typed input")

    // Settle the trigger's hover tooltip first so its delay cannot race the window.
    await page.getByTestId("composer-plus-btn").hover()
    const menu = await measure(page, cdp, async () => {
      // Guests get the sign-in popover; members get the composer menu.
      await page.getByTestId("composer-plus-btn").click()
      await page.locator('[data-testid="composer-plus-btn"][aria-expanded="true"]').waitFor()
    })
    const menuCensus = await census(page)
    return {
      "composer-typing": { sample: typing, census: typingCensus },
      "composer-menu-open": { sample: menu, census: menuCensus },
    } satisfies Record<InteractionId, { sample: CountSample; census: ComponentCensus[] }>
  } finally {
    await context.close()
  }
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim()
  } catch {
    return "unversioned"
  }
}

async function capture(output: string) {
  if (!Number.isInteger(RUNS) || RUNS < 1 || !Number.isInteger(WARMUPS) || WARMUPS < 0)
    throw new Error("RUNS must be positive and WARMUPS nonnegative integers")
  if (!Number.isInteger(PERF_PORT) || PERF_PORT < 1 || PERF_PORT > 65_535 || PERF_PORT === 3000)
    throw new Error("PERF_PORT must be an integer port in 1-65535 other than the developer server's 3000")
  if (process.env.BASE_URL) throw new Error("BASE_URL is unsupported: counts need an owned production server")
  const baseUrl = `http://localhost:${PERF_PORT}`
  let browser: Browser | undefined
  let server: PerfServer | undefined
  try {
    server = await startPerfServer({ port: PERF_PORT, distDir: DIST_DIR, env: { CHAT_PERF_DETERMINISTIC_PROVIDER: "1" } })
    browser = await chromium.launch({ channel: process.env.PW_CHANNEL })
    const interactions: InteractionCounts[] = []
    for (const cpuThrottle of COUNT_THROTTLES) {
      const entries = new Map<InteractionId, InteractionCounts>()
      for (let index = 0; index < WARMUPS + RUNS; index++) {
        const run = await runOnce(browser, baseUrl, cpuThrottle)
        if (index < WARMUPS) continue
        for (const [id, { sample, census }] of Object.entries(run) as Array<[InteractionId, (typeof run)[InteractionId]]>) {
          const entry = entries.get(id) ?? { id, cpuThrottle, samples: [], topComponents: census }
          entry.samples.push(sample)
          entries.set(id, entry)
        }
        log(`${cpuThrottle}x run ${index - WARMUPS + 1}/${RUNS}: typing ${run["composer-typing"].sample.reactCommits} commits, ` +
          `${run["composer-typing"].sample.componentRenders} renders, ${run["composer-typing"].sample.hookRenders} hooks`)
      }
      interactions.push(...entries.values())
    }
    const result: CountsResultFile = {
      schema: "interaction-counts-v1",
      commit: gitCommit(),
      buildId: readFileSync(path.join(REPO_ROOT, DIST_DIR, "BUILD_ID"), "utf8").trim(),
      browser: browser.version(),
      typedCharacters: TYPED_TEXT.length,
      interactions,
    }
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(result, null, 2))
    for (const entry of interactions) {
      log(`${entry.id} @${entry.cpuThrottle}x`)
      for (const metric of Object.keys(entry.samples[0]) as Array<keyof CountSample>) {
        const values = entry.samples.map((sample) => sample[metric])
        log(`  ${metric}: [${values.join(", ")}]${new Set(values).size === 1 ? " stable" : ""}`)
      }
    }
    log(`wrote ${output}`)
  } finally {
    try {
      await browser?.close()
    } finally {
      await server?.stop()
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--compare") {
    const [basePath, headPath] = args.slice(1)
    if (!basePath || !headPath) throw new Error("usage: --compare <base.json> <head.json>")
    // compareCounts validates the contract; the parsed JSON stays untrusted until then.
    const read = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"))
    const { ok, lines } = compareCounts(read(basePath), read(headPath))
    for (const line of lines) console.log(line)
    if (!ok) process.exitCode = 1
    return
  }
  await capture(
    process.env.COUNTS_OUT ??
      path.join(REPO_ROOT, "benchmarks/chat-performance/browser/results/counts", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
