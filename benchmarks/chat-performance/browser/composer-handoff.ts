/**
 * Pre-hydration composer handoff guardrails (ADR-0047), guest path only.
 *
 * 1. Time to typeable: RUNS cold loads of `/` record, per animation frame, the
 *    first moment the composer accepts input (the server-rendered fallback
 *    textarea visible and enabled, or the editor editable) and the moment the
 *    ProseMirror editor became editable (the pre-ADR-0047 typeable point).
 * 2. Handoff cases, once per WIDTHS viewport, with every `/_next/` script held
 *    so the page cannot hydrate until released:
 *    - through: type at a fixed cadence, release mid-sequence and keep typing
 *      through the handoff. Requires the exact typed text in the editor and
 *      the draft (no lost or reordered key) and the editor box within 1 px of
 *      the fallback box at the handoff.
 *    - quiet-line / quiet-wrapped: type one line, or until the fallback wraps,
 *      click Send (must not navigate), stop typing, then release. Requires the
 *      editor and composer surface boxes within 1 px of the pre-handoff boxes,
 *      both at the handoff and once settled, and zero composer layout shift
 *      from release to settle. No input happens in that window, so every
 *      shift counts. Typing then resumes and the text must still match.
 *
 *   BASE_URL=http://localhost:3000 bun run benchmarks/chat-performance/browser/composer-handoff.ts
 *   NEXT_DIST_DIR=.next-perf bun run build:next && bun run benchmarks/chat-performance/browser/composer-handoff.ts
 *
 * Env: BASE_URL (reuse a running server), NEXT_DIST_DIR / PERF_PORT (spawned
 * `next start`, see composer-shell.ts), RUNS (default 5), WIDTHS (default
 * 375,768,1280,1920), KEY_DELAY_MS (default 35), PW_CHANNEL, OUT (json path).
 * Exits 1 when a handoff case fails a guardrail.
 */
import { writeFileSync } from "node:fs"
import { chromium, type Browser, type Page } from "playwright"
import {
  assertPortFree,
  spawnServer,
  stopServer,
  waitForServer,
} from "./composer-shell"

const PERF_PORT = Number(process.env.PERF_PORT ?? 3112)
const RUNS = Number(process.env.RUNS ?? 5)
const WIDTHS = (process.env.WIDTHS ?? "375,768,1280,1920")
  .split(",")
  .map(Number)
const KEY_DELAY_MS = Number(process.env.KEY_DELAY_MS ?? 35)
/** Keys typed after the handoff, so the sequence straddles it. */
const KEYS_AFTER_HANDOFF = 20
/** Keys typed before release in the through and quiet-line cases. */
const KEYS_BEFORE_RELEASE = { through: 30, "quiet-line": 12 } as const
const MAX_KEYS = 4000
/** Settle time after the handoff before the boxes are compared again. */
const SETTLE_MS = 800
/** Letters, digits and spaces only: no markdown or action-query triggers. */
const KEY_SOURCE = "the quick brown fox jumps over the lazy dog 0123456789 "

const FALLBACK = "textarea.composer-fallback-textarea"
const EDITOR = '#prompt-textarea[contenteditable="true"]'
const SURFACE = '[data-slot="prompt-input-surface"]'
const SEND = "#composer-submit-button"

const CASES = ["through", "quiet-line", "quiet-wrapped"] as const
type HandoffCase = (typeof CASES)[number]

function log(message: string) {
  console.log(`[composer-handoff] ${message}`)
}

type Rect = { x: number; y: number; width: number; height: number }
type Boxes = { editor: Rect | null; surface: Rect | null }
type HandoffState = {
  typeableAt: number | null
  editorEditableAt: number | null
  hiddenAt: number | null
  autofocused: boolean
  /** Fallback and surface boxes from the last frame before the handoff. */
  beforeHandoff: { field: Rect | null; surface: Rect | null }
  atHandoff: Boxes | null
  settled: Boxes | null
  shifts: {
    startTime: number
    value: number
    hadRecentInput: boolean
    rects: Rect[]
  }[]
}

// Installed before any page script, so it runs while app JS is still held.
const OBSERVER_INIT = `
(() => {
  const state = {
    typeableAt: null, editorEditableAt: null, hiddenAt: null,
    autofocused: false, beforeHandoff: { field: null, surface: null },
    atHandoff: null, settled: null, shifts: [],
  };
  window.__composerHandoff = state;
  const toRect = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  const box = (selector) => {
    const node = document.querySelector(selector);
    return node ? toRect(node.getBoundingClientRect()) : null;
  };
  const fallback = () => document.querySelector(${JSON.stringify(FALLBACK)});
  const editor = () => document.querySelector(${JSON.stringify(EDITOR)});
  const boxes = () => ({
    editor: box(${JSON.stringify(EDITOR)}),
    surface: box(${JSON.stringify(SURFACE)}),
  });
  const sample = () => {
    const field = fallback();
    const fieldReady = field && !field.hidden && !field.disabled &&
      field.getBoundingClientRect().height > 0;
    if (fieldReady) {
      state.beforeHandoff = {
        field: toRect(field.getBoundingClientRect()),
        surface: box(${JSON.stringify(SURFACE)}),
      };
      if (document.activeElement === field) state.autofocused = true;
    }
    const editable = Boolean(editor());
    if (state.typeableAt === null && (fieldReady || editable)) {
      state.typeableAt = performance.now();
    }
    if (state.editorEditableAt === null && editable) {
      state.editorEditableAt = performance.now();
    }
    if (state.editorEditableAt === null || state.typeableAt === null) {
      requestAnimationFrame(sample);
    }
  };
  requestAnimationFrame(sample);
  // Boxes are read in the task that hides the fallback (after the mount
  // commit's layout effects) and again once settled.
  new MutationObserver(() => {
    const field = fallback();
    if (state.hiddenAt !== null || !field || !field.hidden) return;
    state.hiddenAt = performance.now();
    state.atHandoff = boxes();
    setTimeout(() => { state.settled = boxes(); }, ${SETTLE_MS});
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      state.shifts.push({
        startTime: entry.startTime,
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        rects: (entry.sources || []).flatMap((s) => [
          toRect(s.previousRect),
          toRect(s.currentRect),
        ]),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
})();
`

function readState(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __composerHandoff: HandoffState })
        .__composerHandoff
  )
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/** Largest edge or size difference between two boxes; NaN when one is missing. */
function boxDelta(a: Rect | null, b: Rect | null): number {
  if (!a || !b) return Number.NaN
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height)
  )
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function viewportFor(width: number) {
  return { width, height: width < 640 ? 812 : 900 }
}

async function timeToTypeable(browser: Browser, baseUrl: string) {
  const context = await browser.newContext({ viewport: viewportFor(1280) })
  const page = await context.newPage()
  try {
    await page.addInitScript(OBSERVER_INIT)
    await page.goto(`${baseUrl}/`, { waitUntil: "load" })
    await page.locator(EDITOR).waitFor({ state: "attached", timeout: 60000 })
    await page.waitForFunction(
      () =>
        (window as unknown as { __composerHandoff: HandoffState })
          .__composerHandoff.editorEditableAt !== null
    )
    const state = await readState(page)
    return {
      typeableMs: state.typeableAt ?? Number.NaN,
      editorEditableMs: state.editorEditableAt ?? Number.NaN,
      autofocused: state.autofocused,
    }
  } finally {
    await context.close()
  }
}

type HandoffResult = {
  width: number
  handoffCase: HandoffCase
  ok: boolean
  failures: string[]
  typed: number
  keysBeforeRelease: number
  autofocused: boolean
  fieldHandoffDeltaPx: number
  /** Quiet cases only; NaN for the through case. */
  surfaceSettledDeltaPx: number
  composerCls: number
  state: HandoffState
}

async function typeKey(page: Page, typed: string): Promise<string> {
  const key = KEY_SOURCE[typed.length % KEY_SOURCE.length]!
  await page.keyboard.type(key)
  await page.waitForTimeout(KEY_DELAY_MS)
  return typed + key
}

async function runHandoffCase(
  browser: Browser,
  baseUrl: string,
  width: number,
  handoffCase: HandoffCase
): Promise<HandoffResult> {
  const context = await browser.newContext({ viewport: viewportFor(width) })
  const page = await context.newPage()
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    await page.addInitScript(OBSERVER_INIT)
    // Holding app scripts keeps React from hydrating; the HTML still streams.
    await page.route(
      (url) =>
        url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js"),
      async (route) => {
        await released
        await route.fallback()
      }
    )
    await page.goto(`${baseUrl}/`, { waitUntil: "commit" })
    const fallback = page.locator(FALLBACK)
    await fallback.waitFor({ state: "visible", timeout: 30000 })
    const autofocused = await fallback.evaluate(
      (node) => document.activeElement === node
    )
    if (!autofocused) await fallback.click()

    const failures: string[] = []
    let typed = ""
    let keysBeforeRelease = 0
    let releaseAt = Number.NaN

    if (handoffCase === "through") {
      let keysAfterHandoff = -1
      while (typed.length < MAX_KEYS && keysAfterHandoff < KEYS_AFTER_HANDOFF) {
        typed = await typeKey(page, typed)
        if (typed.length === KEYS_BEFORE_RELEASE.through) {
          keysBeforeRelease = typed.length
          release()
        }
        if (keysAfterHandoff >= 0) {
          keysAfterHandoff += 1
        } else if (typed.length > keysBeforeRelease && typed.length % 5 === 0) {
          const state = await readState(page)
          if (state.hiddenAt !== null) keysAfterHandoff = 0
        }
      }
      if (keysAfterHandoff < 0) {
        throw new Error(`no handoff within ${MAX_KEYS} keys at ${width}px`)
      }
    } else {
      const fieldHeight = () =>
        fallback.evaluate((node) => node.getBoundingClientRect().height)
      const lineHeight = await fieldHeight()
      if (handoffCase === "quiet-line") {
        while (typed.length < KEYS_BEFORE_RELEASE["quiet-line"]) {
          typed = await typeKey(page, typed)
        }
      } else {
        // A few keys past the first wrap, so the text is clearly two lines.
        let keysAfterWrap = -1
        while (typed.length < MAX_KEYS && keysAfterWrap < 5) {
          typed = await typeKey(page, typed)
          if (keysAfterWrap >= 0) keysAfterWrap += 1
          else if ((await fieldHeight()) > lineHeight + 4) keysAfterWrap = 0
        }
        if (keysAfterWrap < 0) {
          throw new Error(`fallback never wrapped at ${width}px`)
        }
      }
      keysBeforeRelease = typed.length

      // Send before hydration must neither navigate nor drop the text.
      const urlBefore = page.url()
      const send = page.locator(SEND)
      if (await send.isVisible()) {
        // aria-disabled is not native disabled, so a real click still fires.
        await send.click({ force: true })
        await page.waitForTimeout(300)
        if (page.url() !== urlBefore) {
          failures.push(`send before hydration navigated to ${page.url()}`)
        }
      } else {
        failures.push("send button not visible before hydration")
      }
      if ((await fallback.inputValue()) !== typed) {
        failures.push("send before hydration changed the typed text")
      }
      await fallback.evaluate((node: HTMLTextAreaElement) => {
        node.focus()
        node.setSelectionRange(node.value.length, node.value.length)
      })

      // Past the 500 ms hadRecentInput window, then release with no input.
      await page.waitForTimeout(600)
      releaseAt = await page.evaluate(() => performance.now())
      release()
      await page.waitForFunction(
        () =>
          (window as unknown as { __composerHandoff: HandoffState })
            .__composerHandoff.settled !== null,
        undefined,
        { timeout: 60000 }
      )
      for (let index = 0; index < KEYS_AFTER_HANDOFF; index += 1) {
        typed = await typeKey(page, typed)
      }
    }

    // Let the draft debounce (500 ms) land before reading it back.
    await page.waitForTimeout(1200)
    const read = await page.evaluate((editorSelector) => {
      const editor = document.querySelector(editorSelector)
      return {
        text: editor
          ? Array.from(editor.querySelectorAll("p"), (p) => p.textContent)
              .join("\n")
              .replace(/ /g, " ")
          : null,
        draft: localStorage.getItem("chat-draft-new"),
      }
    }, EDITOR)
    const state = await readState(page)

    if (read.text !== typed) {
      failures.push(
        `editor text differs: typed ${typed.length} chars, editor has ${read.text?.length ?? 0}`
      )
    }
    if (read.draft !== typed)
      failures.push("draft does not hold the typed text")

    const fieldHandoffDeltaPx = boxDelta(
      state.beforeHandoff.field,
      state.atHandoff?.editor ?? null
    )
    if (!(fieldHandoffDeltaPx <= 1)) {
      failures.push(
        `handoff moved the field ${fieldHandoffDeltaPx.toFixed(2)} px (${JSON.stringify(state.beforeHandoff.field)} -> ${JSON.stringify(state.atHandoff?.editor)})`
      )
    }

    let surfaceSettledDeltaPx = Number.NaN
    let composerCls = Number.NaN
    if (handoffCase !== "through") {
      const surfaceBefore = state.beforeHandoff.surface
      const checks = [
        ["surface at handoff", surfaceBefore, state.atHandoff?.surface],
        [
          "field once settled",
          state.beforeHandoff.field,
          state.settled?.editor,
        ],
        ["surface once settled", surfaceBefore, state.settled?.surface],
      ] as const
      for (const [label, before, after] of checks) {
        const delta = boxDelta(before, after ?? null)
        if (label === "surface once settled") surfaceSettledDeltaPx = delta
        if (!(delta <= 1)) {
          failures.push(
            `${label} moved ${delta.toFixed(2)} px (${JSON.stringify(before)} -> ${JSON.stringify(after)})`
          )
        }
      }
      // Every composer shift between release and settle counts: no input
      // happened in that window, so hadRecentInput cannot hide one.
      const settleEnd = (state.hiddenAt ?? Number.POSITIVE_INFINITY) + SETTLE_MS
      const composerBoxes = [surfaceBefore, state.settled?.surface].filter(
        (rect): rect is Rect => rect !== null && rect !== undefined
      )
      composerCls = state.shifts
        .filter(
          (shift) =>
            shift.startTime >= releaseAt && shift.startTime <= settleEnd
        )
        .filter((shift) =>
          shift.rects.some((rect) =>
            composerBoxes.some((composer) => intersects(rect, composer))
          )
        )
        .reduce((sum, shift) => sum + shift.value, 0)
      if (composerCls !== 0) {
        failures.push(
          `composer CLS ${composerCls.toFixed(4)} across the handoff`
        )
      }
    }

    return {
      width,
      handoffCase,
      ok: failures.length === 0,
      failures,
      typed: typed.length,
      keysBeforeRelease,
      autofocused,
      fieldHandoffDeltaPx,
      surfaceSettledDeltaPx,
      composerCls,
      state,
    }
  } finally {
    release()
    await context.close()
  }
}

async function main() {
  const externalBaseUrl = process.env.BASE_URL
  const baseUrl = externalBaseUrl ?? `http://localhost:${PERF_PORT}`
  if (!externalBaseUrl) {
    await assertPortFree(baseUrl)
    spawnServer()
    await waitForServer(baseUrl, 60000)
  }
  const browser = await chromium.launch({
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  })
  try {
    const timings = []
    for (let index = 0; index < RUNS; index += 1) {
      const run = await timeToTypeable(browser, baseUrl)
      timings.push(run)
      log(
        `load ${index + 1}/${RUNS}: typeable ${run.typeableMs.toFixed(0)} ms, editor editable ${run.editorEditableMs.toFixed(0)} ms, autofocused ${run.autofocused}`
      )
    }
    const handoffs: HandoffResult[] = []
    for (const width of WIDTHS) {
      for (const handoffCase of CASES) {
        const run = await runHandoffCase(browser, baseUrl, width, handoffCase)
        handoffs.push(run)
        // Quiet-case metrics are NaN for the through case by design.
        const fixed = (value: number, digits: number) =>
          Number.isNaN(value) ? "n/a" : value.toFixed(digits)
        log(
          `${width}px ${handoffCase}: ${run.ok ? "pass" : `FAIL (${run.failures.join("; ")})`}, ${run.typed} keys (release after ${run.keysBeforeRelease}), field delta ${fixed(run.fieldHandoffDeltaPx, 2)} px, settled surface delta ${fixed(run.surfaceSettledDeltaPx, 2)} px, composer CLS ${fixed(run.composerCls, 4)}, autofocused ${run.autofocused}`
        )
      }
    }
    const summary = {
      baseUrl,
      runs: RUNS,
      typeableMedianMs: median(timings.map((run) => run.typeableMs)),
      editorEditableMedianMs: median(
        timings.map((run) => run.editorEditableMs)
      ),
      handoffPass: handoffs.every((run) => run.ok),
    }
    console.log("")
    console.log("| Metric | Value |")
    console.log("| --- | --- |")
    console.log(`| Server | ${summary.baseUrl} |`)
    console.log(
      `| Time to typeable, median of ${RUNS} | ${summary.typeableMedianMs.toFixed(0)} ms |`
    )
    console.log(
      `| Editor editable (pre-ADR-0047 typeable), median | ${summary.editorEditableMedianMs.toFixed(0)} ms |`
    )
    console.log(
      `| Handoff cases (${CASES.join(", ")} at ${WIDTHS.join(", ")} px) | ${summary.handoffPass ? "pass" : "FAIL"} |`
    )
    if (process.env.OUT) {
      writeFileSync(
        process.env.OUT,
        JSON.stringify({ summary, timings, handoffs }, null, 2)
      )
      log(`wrote ${process.env.OUT}`)
    }
    if (!summary.handoffPass) process.exitCode = 1
  } finally {
    await browser.close()
    stopServer()
  }
}

main().catch((error) => {
  stopServer()
  console.error(error)
  process.exit(1)
})
