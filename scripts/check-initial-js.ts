#!/usr/bin/env bun
/**
 * Initial-JS ratchet (ADR-0049, ADR-0050). Run after `bun run build:next`.
 *
 * The build manifest's root main files load on every page before hydration.
 * Their gzip total must stay within the budget, and none may contain a
 * session recorder or the posthog-js core, which load after the composer
 * handoff. Lower the budget when a change shrinks the set.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"

const BUDGET_KIB = 225
/** Signatures of code that must stay out of the initial set. */
const LATE_ONLY = {
  "a session recorder (rrweb)": "rrweb",
  "the posthog-js core": "persistence_name",
}

const distDir = process.env.NEXT_DIST_DIR ?? ".next"
const { rootMainFiles } = JSON.parse(
  readFileSync(path.join(distDir, "build-manifest.json"), "utf8")
) as { rootMainFiles?: string[] }
if (!rootMainFiles?.length) {
  throw new Error(`${distDir}/build-manifest.json lists no rootMainFiles`)
}

const failures: string[] = []
let gzipBytes = 0
for (const file of rootMainFiles) {
  const source = readFileSync(path.join(distDir, file))
  gzipBytes += gzipSync(source, { level: 9 }).length
  const text = source.toString("utf8")
  for (const [name, signature] of Object.entries(LATE_ONLY)) {
    if (text.includes(signature)) failures.push(`${file} contains ${name}`)
  }
}

const kib = (gzipBytes / 1024).toFixed(1)
console.log(
  `Initial JS: ${rootMainFiles.length} files, ${kib} KiB gzip (budget ${BUDGET_KIB} KiB)`
)
if (gzipBytes > BUDGET_KIB * 1024) {
  failures.push(`initial JS is ${kib} KiB gzip, over the ${BUDGET_KIB} KiB budget`)
}
for (const failure of failures) {
  console.error(`::error title=Initial JS ratchet::${failure}`)
}
if (failures.length > 0) process.exit(1)
