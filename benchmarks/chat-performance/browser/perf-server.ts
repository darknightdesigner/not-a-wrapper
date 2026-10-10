/**
 * The owned production server behind the browser benchmarks. `bunx next start`
 * runs in its own process group so stop() reaches `next start`, not just bunx:
 * a survivor keeps serving the port and a later capture on it would silently
 * measure a stale build.
 */
import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

export type PerfServer = {
  /** The group leader (bunx); its pipes and exit event belong to the caller. */
  readonly child: ChildProcess
  /** SIGTERM then SIGKILL the group; resolves once it is gone and the port refuses. */
  stop: () => Promise<void>
}

type GroupOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Default: stdout ignored, stderr inherited. */
  stdio?: StdioOptions
  /** Runs right after spawn, before the readiness wait, to attach to the pipes. */
  onSpawn?: (child: ChildProcess) => void
  readyTimeoutMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Probes are bounded; a listener that never answers still occupies the port. */
const isServing = (baseUrl: string) =>
  fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(2_000) }).then(
    () => true,
    (error: unknown) => error instanceof Error && error.name === "TimeoutError"
  )

/** Signals every process in the group; false once none is left. Signal 0 only probes. */
function signalGroup(pgid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pgid, signal)
    return true
  } catch {
    return false
  }
}

/**
 * Zombies keep their group id and still accept signal 0, so where nothing reaps
 * orphans (a container without an init) a dead `next start` would look alive.
 * Live means a member that is not a zombie; without `ps`, the port probe decides.
 */
function groupHasLiveMember(pgid: number) {
  if (!signalGroup(pgid, 0)) return false
  try {
    return execFileSync("ps", ["-A", "-o", "pgid=,stat="], { encoding: "utf8" })
      .split("\n")
      .some((line) => {
        const [group, stat] = line.trim().split(/\s+/)
        return Number(group) === pgid && !stat?.startsWith("Z")
      })
  } catch {
    return false
  }
}

const liveGroups = new Set<number>()
let exitHookInstalled = false

// The detached group sees neither the terminal's Ctrl+C nor its hangup: it must not outlive us.
function installExitHook() {
  if (exitHookInstalled) return
  exitHookInstalled = true
  process.once("exit", () => {
    for (const pgid of liveGroups) signalGroup(pgid, "SIGKILL")
  })
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => process.exit(1))
  }
}

/** Resolves once `baseUrl` answers below 500; fails early if `child` exits first. */
export async function waitForServer(
  baseUrl: string,
  timeoutMs: number,
  child?: ChildProcess,
  spawnError?: () => Error | undefined
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const failure = spawnError?.()
    if (failure) throw new Error(`server failed to start: ${failure.message}`)
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw new Error(`server exited (${child.exitCode ?? child.signalCode}) before ${baseUrl} became ready`)
    try {
      const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()))
      if ((await fetch(baseUrl, { redirect: "manual", signal })).status < 500) return
    } catch {
      // Not up yet.
    }
    await sleep(300)
  }
  throw new Error(`server at ${baseUrl} did not become ready in ${timeoutMs}ms`)
}

async function stopGroup(pgid: number, baseUrl: string) {
  if (!liveGroups.has(pgid)) return
  for (const [signal, waitMs] of [["SIGTERM", 10_000], ["SIGKILL", 5_000]] as const) {
    signalGroup(pgid, signal)
    const deadline = Date.now() + waitMs
    while (Date.now() < deadline) {
      if (!groupHasLiveMember(pgid) && !(await isServing(baseUrl))) {
        liveGroups.delete(pgid)
        return
      }
      await sleep(200)
    }
  }
  throw new Error(`server group ${pgid} or ${baseUrl} still alive after SIGKILL`)
}

/** Spawns `command` as a process group serving `baseUrl` and waits until it is ready. */
export async function startServerGroup(
  command: readonly [string, ...string[]],
  baseUrl: string,
  options: GroupOptions = {}
): Promise<PerfServer> {
  // Base and head captures reuse one port: a leftover server would silently
  // serve the other build.
  if (await isServing(baseUrl)) throw new Error(`${baseUrl} is already serving; stop it first`)
  installExitHook()
  const [file, ...args] = command
  const child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio ?? ["ignore", "ignore", "inherit"],
    detached: true,
  })
  // Spawn failures (missing binary, EACCES) arrive as an 'error' event; unhandled, it crashes the caller.
  let spawnError: Error | undefined
  child.once("error", (error) => {
    spawnError = error
  })
  if (child.pid === undefined) {
    await new Promise((resolve) => setImmediate(resolve))
    throw new Error(`could not spawn ${file}: ${spawnError?.message ?? "no pid"}`)
  }
  const pgid = child.pid
  liveGroups.add(pgid)
  const server: PerfServer = { child, stop: () => stopGroup(pgid, baseUrl) }
  options.onSpawn?.(child)
  try {
    await waitForServer(baseUrl, options.readyTimeoutMs ?? 60_000, child, () => spawnError)
  } catch (error) {
    await server.stop()
    throw error
  }
  return server
}

/** `next start` for the production build in `distDir` on `localhost:port`. */
export async function startPerfServer({
  port,
  distDir,
  env,
  ...options
}: Omit<GroupOptions, "cwd" | "env"> & { port: number; distDir: string; env?: Record<string, string> }) {
  // :3000 belongs to the developer's own server; never bind or probe it from a benchmark.
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || port === 3000)
    throw new Error(`PERF_PORT must be an integer in 1-65535 other than 3000 (got ${port})`)
  if (!existsSync(path.join(REPO_ROOT, distDir, "BUILD_ID")))
    throw new Error(
      `no production build at ${distDir}; build one with ` +
        `NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION=true NEXT_DIST_DIR=${distDir} bun run build:next`
    )
  return startServerGroup(["bunx", "next", "start", "-p", String(port)], `http://localhost:${port}`, {
    ...options,
    cwd: REPO_ROOT,
    env: { ...process.env, NEXT_DIST_DIR: distDir, ...env },
  })
}
