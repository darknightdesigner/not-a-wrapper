/**
 * PayClaw (Flowglad Pay) configuration.
 *
 * EXPERIMENTAL: This integration is a demo. The API is in active development
 * and breaking changes are expected. Track `main` at:
 * https://github.com/flowglad/provisioning-agent
 *
 * Auth model: Shared API key + hardcoded userEmail (from `PAYCLAW_USER_EMAIL` env var).
 * This will change when per-user API keys are implemented.
 *
 * TEMPORARY: The `PAYCLAW_USER_EMAIL` env var is a hardcoded email for demo purposes.
 * When per-user API keys land, this will be replaced with auth-context-derived
 * user identity. See: .agents/plans/flowglad-pay-integration.md (Open Questions).
 */

export type PayClawConfig = {
  apiKey: string
  appBaseUrl: string
  cardId: string
  userEmail: string
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
  const cardId = process.env.PAYCLAW_CARD_ID
  const userEmail = process.env.PAYCLAW_USER_EMAIL

  if (!apiKey || !appBaseUrl || !cardId || !userEmail) {
    return null
  }

  return {
    apiKey,
    appBaseUrl: appBaseUrl.replace(/\/$/, ''), // strip trailing slash
    cardId,
    userEmail,
  }
}
