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
  defaultCardId?: string
}

/**
 * Load and validate PayClaw configuration from environment variables.
 *
 * Returns null if any required variable is missing — allows graceful
 * degradation (tool simply isn't registered) rather than crashing the app.
 *
 * TODO(flowglad-pay): Replace PAYCLAW_CARD_ID env fallback with a user-provided
 * default card setting (per-user), so payment defaults are not shared globally.
 */
export function getPayClawConfig(): PayClawConfig | null {
  const apiKey = process.env.PAYCLAW_API_KEY
  const appBaseUrl = process.env.PAYCLAW_APP_URL
  const defaultCardId = process.env.PAYCLAW_CARD_ID

  if (!apiKey || !appBaseUrl) {
    return null
  }

  return {
    apiKey,
    appBaseUrl: appBaseUrl.replace(/\/$/, ''), // strip trailing slash
    ...(defaultCardId ? { defaultCardId } : {}),
  }
}
