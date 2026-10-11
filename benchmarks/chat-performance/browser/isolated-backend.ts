/**
 * The benchmark run's own Convex backend (ADR-0051). CI only: deploys this
 * checkout's convex/ to a fresh preview deployment, points .env.local at it,
 * and fails within a minute when a client build the run measures references a
 * public function the preview does not serve.
 *
 * Env: CONVEX_DEPLOY_KEY (a preview deploy key), PERF_PREVIEW_NAME, and
 * PERF_PAIRED=true to also check the PERF_COMPARE_REF client. WORKOS_CLIENT_ID
 * and WORKOS_API_KEY come from .env.local (bun auto-loads it).
 */
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
export const ENV_FILE = ".env.local"

/** The client build: app sources outside convex/, scripts, benchmarks and tests. */
const CLIENT_PATHSPEC = ["*.ts", "*.tsx", ":!convex", ":!scripts", ":!benchmarks", ":!*.test.ts", ":!*.test.tsx"]

/** FunctionReference type fields: `typeof api.files.x._args` still names `files:x`. */
const REFERENCE_TYPE_FIELDS = new Set(["_type", "_visibility", "_args", "_returnType", "_componentPath"])

/** The property path of an `api.a.b` expression or `typeof api.a.b` type name. */
function apiPath(node: ts.Node): string[] | undefined {
  const segments: string[] = []
  let current = node
  while (ts.isPropertyAccessExpression(current) || ts.isQualifiedName(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      segments.unshift(current.name.text)
      current = current.expression
    } else {
      segments.unshift(current.right.text)
      current = current.left
    }
  }
  return segments.length > 0 && ts.isIdentifier(current) && current.text === "api" ? segments : undefined
}

/**
 * Public function names (`dir/module:function`) a source file references
 * through `api`, read from its syntax so comments and strings never count.
 * A destructured `api` or `makeFunctionReference` call escapes this scan.
 */
export function functionReferences(source: string, fileName = "client.ts"): string[] {
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    const segments = apiPath(node)
    if (!segments) {
      ts.forEachChild(node, visit)
      return
    }
    const end = segments.findIndex((segment) => REFERENCE_TYPE_FIELDS.has(segment))
    const reference = end === -1 ? segments : segments.slice(0, end)
    if (reference.length >= 2)
      names.add(`${reference.slice(0, -1).join("/")}:${reference.at(-1)}`)
  }
  visit(ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest))
  return [...names]
}

/** Public function names a deployment serves, from `convex function-spec` output. */
export function servedFunctions(spec: unknown): Set<string> {
  const entries = Array.isArray(spec) ? spec : (spec as { functions?: unknown } | null)?.functions
  if (!Array.isArray(entries)) throw new Error("The Convex function spec has no function list")
  return new Set((entries as Array<{ identifier?: unknown; visibility?: { kind?: unknown } }>)
    .flatMap(({ identifier, visibility }) =>
      visibility?.kind === "public" && typeof identifier === "string"
        ? [identifier.replace(/\.js:/, ":")]
        : []))
}

/** References the deployment does not serve, each with the files that make it. */
export function missingFunctions(
  references: ReadonlyMap<string, readonly string[]>,
  served: ReadonlySet<string>
): Array<[name: string, files: readonly string[]]> {
  return [...references].filter(([name]) => !served.has(name)).sort(([a], [b]) => a.localeCompare(b))
}

const assignment = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/

/** Points an env file at another backend: drops `CONVEX_DEPLOYMENT` and every overridden key, then appends the overrides. */
export function retargetEnvFile(source: string, overrides: Readonly<Record<string, string>>): string {
  const replaced = new Set(["CONVEX_DEPLOYMENT", ...Object.keys(overrides)])
  const kept = source.split("\n").filter((line) => !replaced.has(assignment.exec(line)?.[1] ?? ""))
  const added = Object.entries(overrides).map(([key, value]) => `${key}=${value}`)
  return `${[kept.join("\n").trimEnd(), ...added].join("\n")}\n`
}

/** One variable's value in an env file; the last assignment wins, as in dotenv. */
export function envFileValue(source: string, key: string): string | undefined {
  let value: string | undefined
  for (const line of source.split("\n")) {
    const match = assignment.exec(line)
    if (match?.[1] === key) value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2")
  }
  return value
}

function exec(program: string, args: string[], env: NodeJS.ProcessEnv = process.env, okStatuses = [0]) {
  const result = spawnSync(program, args, { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  if (!okStatuses.includes(result.status ?? -1)) {
    process.stderr.write(result.stderr ?? "")
    throw new Error(`${program} ${args.slice(0, 2).join(" ")} failed (${result.status})`)
  }
  return result.stdout
}

/** Every public function a revision's client build references, with the files that reference it. */
export function clientReferences(revision: string): Map<string, string[]> {
  const references = new Map<string, string[]>()
  // git grep exits 1 when no file matches.
  const files = exec("git", ["grep", "-l", "-F", "_generated/api", revision, "--", ...CLIENT_PATHSPEC], process.env, [0, 1])
  for (const entry of files.split("\n").filter(Boolean)) {
    const file = entry.slice(revision.length + 1)
    for (const name of functionReferences(exec("git", ["show", `${revision}:${file}`]), file))
      references.set(name, [...(references.get(name) ?? []), file])
  }
  return references
}

function main() {
  const temporary = process.env.RUNNER_TEMP
  if (process.env.CI !== "true" || !temporary)
    throw new Error("The isolated backend rewrites .env.local; it runs only on the CI runner")
  if (!/^preview:[^:|]+:[^:|]+\|/.test(process.env.CONVEX_DEPLOY_KEY ?? ""))
    throw new Error("Set the GitHub Actions secret PERF_CONVEX_PREVIEW_DEPLOY_KEY to a Convex preview deploy key " +
      "(dashboard: Project Settings, Preview Deploy Keys). Benchmarks never run against a shared deployment.")
  const name = process.env.PERF_PREVIEW_NAME ?? ""
  if (!/^perf-[a-z0-9-]{1,56}$/.test(name))
    throw new Error(`PERF_PREVIEW_NAME must be perf-<lowercase id>, received "${name}"`)
  const { WORKOS_CLIENT_ID: clientId, WORKOS_API_KEY: apiKey } = process.env
  if (!clientId || !apiKey)
    throw new Error("WORKOS_CLIENT_ID / WORKOS_API_KEY missing from .env.local (PERF_ENV_FILE)")
  const head = exec("git", ["rev-parse", "HEAD"]).trim()

  // The run is its own signer trust domain; no webhook endpoint targets a preview.
  const admissionSecret = randomBytes(32).toString("hex")
  const webhookSecret = randomBytes(32).toString("hex")
  for (const secret of [admissionSecret, webhookSecret]) console.log(`::add-mask::${secret}`)
  const convexEnv = path.join(temporary, "perf-preview-convex.env")
  const urls = path.join(temporary, "perf-preview-urls.txt")
  writeFileSync(convexEnv, [
    `WORKOS_CLIENT_ID=${clientId}`,
    `WORKOS_API_KEY=${apiKey}`,
    `WORKOS_WEBHOOK_SECRET=${webhookSecret}`,
    `CHAT_ADMISSION_SECRET=${admissionSecret}`,
    "",
  ].join("\n"), { mode: 0o600 })
  // The preview deploy key outranks CONVEX_DEPLOYMENT; dropping it removes any doubt.
  const cliEnv = { ...process.env }
  delete cliEnv.CONVEX_DEPLOYMENT
  try {
    // Convex claims the deployment, runs --cmd, then pushes, so the variables
    // convex.config.ts requires and auth.config.ts reads exist before the push.
    // --skip-workos-check: AuthKit provisioning wants Vercel-only redirect URLs.
    const configure = `bunx convex env set --preview-name ${name} --from-file '${convexEnv}' --force && ` +
      `printf '%s' "$NEXT_PUBLIC_CONVEX_URL" > '${urls}'`
    const deploy = spawnSync("bunx", [
      "convex", "deploy", "--preview-create", name,
      "--codegen", "disable", "--typecheck", "disable", "--skip-workos-check",
      "--cmd-url-env-var-name", "NEXT_PUBLIC_CONVEX_URL", "--cmd", configure,
      "--message", `perf benchmark ${head}`,
    ], { cwd: root, env: cliEnv, stdio: "inherit" })
    if (deploy.error) throw deploy.error
    if (deploy.status !== 0) throw new Error(`convex deploy to preview ${name} failed (${deploy.status})`)
  } finally {
    rmSync(convexEnv, { force: true })
  }
  const convexUrl = readFileSync(urls, "utf8").trim()
  if (!/^https:\/\/[a-z0-9.-]+\.convex\.cloud$/.test(convexUrl))
    throw new Error(`Preview ${name} reported an unexpected URL (${convexUrl})`)
  // HTTP actions live on the .convex.site twin, as in app/api/_lib/convex-site-url.ts.
  const siteUrl = convexUrl.replace(/\.convex\.cloud$/, ".convex.site")
  const envFile = path.join(root, ENV_FILE)
  writeFileSync(envFile, retargetEnvFile(readFileSync(envFile, "utf8"), {
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
    NEXT_PUBLIC_CONVEX_SITE_URL: siteUrl,
    CONVEX_SITE_URL: siteUrl,
    CHAT_ADMISSION_SECRET: admissionSecret,
  }))

  const specOutput = exec("bunx", ["convex", "function-spec", "--preview-name", name], cliEnv)
  let spec: unknown
  try {
    spec = JSON.parse(specOutput)
  } catch {
    throw new Error(`convex function-spec printed no JSON for preview ${name}`)
  }
  const served = servedFunctions(spec)
  const clients: Array<[side: string, revision: string]> = [["head", head]]
  if (process.env.PERF_PAIRED === "true") {
    const base = exec("git", ["rev-parse", "--verify", "--end-of-options", `${process.env.PERF_COMPARE_REF}^{commit}`]).trim()
    clients.push(["base", base])
  }
  const missing = clients.flatMap(([side, revision]) =>
    missingFunctions(clientReferences(revision), served)
      .map(([fn, files]) => `${side} ${revision.slice(0, 12)} calls ${fn} (${files.join(", ")})`))
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Isolated Convex backend\n\nPreview \`${name}\` serves ` +
      `${served.size} public functions from \`${head}\`. Clients checked: ${clients.map(([side]) => side).join(", ")}. ` +
      `Missing: ${missing.length === 0 ? "none" : missing.join("; ")}.\n\n`)
  if (missing.length > 0)
    throw new Error(`Preview ${name} (convex/ at ${head.slice(0, 12)}) does not serve ${missing.length} public ` +
      `function(s) a measured client references: ${missing.join("; ")}. The base client runs against the head ` +
      "backend, so add public functions alongside the old ones and remove those only after main stops calling them (ADR-0027).")
  if (process.env.GITHUB_ENV)
    appendFileSync(process.env.GITHUB_ENV, `PERF_CONVEX_URL=${convexUrl}\nPERF_CONVEX_COMMIT=${head}\n`)
  console.log(`[isolated-backend] ${name}: ${served.size} public functions; ${clients.length} client(s) fully served`)
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`::error title=Isolated Convex backend::${message.replaceAll("%", "%25")}`)
    process.exitCode = 1
  }
}
