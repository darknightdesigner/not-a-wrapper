/**
 * PayClaw (Flowglad Pay) configuration.
 *
 * EXPERIMENTAL: This integration is a demo. The API is in active development
 * and breaking changes are expected. Track `main` at:
 * https://github.com/flowglad/provisioning-agent
 */

export type PayClawConfig = {
  apiKey: string
  appBaseUrl: string
}

/**
 * Load and validate PayClaw configuration from environment variables.
 *
 * Returns null if any required variable is missing — allows graceful
 * degradation (tool simply isn't registered) rather than crashing the app.
 */
export function getPayClawConfig(): PayClawConfig | null {
  const apiKey = process.env.PAYCLAW_API_KEY
  const appBaseUrl = process.env.PAYCLAW_APP_URL

  if (!apiKey || !appBaseUrl) {
    return null
  }

  return {
    apiKey,
    appBaseUrl: appBaseUrl.replace(/\/$/, ''), // strip trailing slash
  }
}
