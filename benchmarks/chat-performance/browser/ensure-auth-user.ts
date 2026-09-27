/**
 * Ensures the benchmark harness's WorkOS test user exists with a verified
 * email and a known password, using the WORKOS_API_KEY already present in
 * .env.local (bun auto-loads it). CI creates a fresh identity per harness
 * process so previous captures cannot change its sidebar or usage allowance.
 * It records each one in PERF_CAPTURE_USERS_FILE, and the workflow's final
 * always-run step deletes them however the job ends (`--delete-recorded`).
 * Local provisioning reuses the configured account and repairs its password.
 *
 * The user lives in the SAME WorkOS environment as the app's dev client id,
 * so the harness's real /auth/login flow mints a genuine RS256 access token
 * that the Convex dev deployment accepts — the durable path runs for real.
 *
 * PERF_AUTH_EMAIL is the local identity and CI email base. PERF_AUTH_PASSWORD is always
 * required so this real account never receives a source-controlled password.
 */
import { randomUUID } from "node:crypto"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { WorkOS } from "@workos-inc/node"
import { z } from "zod"

const isIsolatedCapture = Boolean(process.env.CI)
const configuredEmail =
  process.env.PERF_AUTH_EMAIL ?? "chat-perf-harness@nawbench.dev"

function createCaptureEmail(baseEmail: string): string {
  const email = z.email().parse(baseEmail)
  const separator = email.lastIndexOf("@")
  // Keep the local part within 64 characters, including the unique suffix.
  return `${email.slice(0, separator).slice(0, 27)}+${randomUUID()}${email.slice(separator)}`
}

export const PERF_AUTH_EMAIL = isIsolatedCapture
  ? createCaptureEmail(configuredEmail)
  : configuredEmail

const captureUsersFile = process.env.PERF_CAPTURE_USERS_FILE

export function getPerfAuthPassword(): string {
  const password = process.env.PERF_AUTH_PASSWORD
  if (!password) {
    throw new Error(
      "PERF_AUTH_PASSWORD missing from the environment — cannot provision " +
        "the harness test user"
    )
  }
  return password
}

export async function ensurePerfAuthUser(): Promise<void> {
  const password = getPerfAuthPassword()
  const apiKey = process.env.WORKOS_API_KEY
  const clientId = process.env.WORKOS_CLIENT_ID
  if (!apiKey || !clientId) {
    throw new Error(
      "WORKOS_API_KEY / WORKOS_CLIENT_ID missing from the environment " +
        "(.env.local) — cannot provision the harness test user"
    )
  }
  const workos = new WorkOS(apiKey)

  if (isIsolatedCapture) {
    // Fail on creation errors; reusing an account would invalidate isolation.
    const user = await workos.userManagement.createUser({
      email: PERF_AUTH_EMAIL,
      password,
      emailVerified: true,
      firstName: "Perf",
      lastName: "Harness",
    })
    if (captureUsersFile) appendFileSync(captureUsersFile, `${user.id}\n`)
    console.log("[ensure-auth-user] created isolated capture user")
    return
  }

  const existing = await workos.userManagement.listUsers({
    email: PERF_AUTH_EMAIL,
  })
  const user = existing.data[0]

  if (!user) {
    await workos.userManagement.createUser({
      email: PERF_AUTH_EMAIL,
      password,
      emailVerified: true,
      firstName: "Perf",
      lastName: "Harness",
    })
    console.log(`[ensure-auth-user] created ${PERF_AUTH_EMAIL}`)
    return
  }

  try {
    await workos.userManagement.authenticateWithPassword({
      clientId,
      email: PERF_AUTH_EMAIL,
      password,
    })
    console.log(`[ensure-auth-user] ${PERF_AUTH_EMAIL} ok (password verified)`)
  } catch {
    await workos.userManagement.updateUser({
      userId: user.id,
      password,
      emailVerified: true,
    })
    console.log(`[ensure-auth-user] reset password for ${PERF_AUTH_EMAIL}`)
  }
}

/**
 * Deletes every capture user this CI job recorded. A failed delete only warns,
 * so cleanup never fails the job.
 */
export async function deleteRecordedCaptureUsers(): Promise<void> {
  if (!captureUsersFile || !existsSync(captureUsersFile)) return
  const ids = new Set(readFileSync(captureUsersFile, "utf8").split("\n"))
  ids.delete("")
  const workos = new WorkOS(process.env.WORKOS_API_KEY)
  for (const id of ids) {
    try {
      await workos.userManagement.deleteUser(id)
      console.log("[ensure-auth-user] deleted capture user")
    } catch (error) {
      console.warn("[ensure-auth-user] could not delete capture user", error)
    }
  }
}

if (import.meta.main) {
  const task = process.argv.includes("--delete-recorded")
    ? deleteRecordedCaptureUsers()
    : ensurePerfAuthUser()
  task.catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
