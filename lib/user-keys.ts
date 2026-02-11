import { fetchQuery } from "convex/nextjs"
import { api } from "@/convex/_generated/api"
import { decryptKey } from "./encryption"
import { env } from "./openproviders/env"
import { Provider } from "./openproviders/types"

export type { Provider } from "./openproviders/types"

/**
 * Check if user has an API key for a provider via Convex
 * Returns true if a key exists, false otherwise
 */
export async function hasUserKey(
  provider: Provider,
  token?: string
): Promise<boolean> {
  if (!token) return false

  try {
    const userKey = await fetchQuery(
      api.userKeys.getByProvider,
      { provider },
      { token }
    )
    return userKey !== null
  } catch (error) {
    console.error("Error checking user key:", error)
    return false
  }
}

/**
 * Get user's decrypted API key for a provider via Convex
 * Returns the decrypted key if found, null otherwise
 */
export async function getUserKeyFromConvex(
  provider: Provider,
  token?: string
): Promise<string | null> {
  if (!token) return null

  try {
    const userKey = await fetchQuery(
      api.userKeys.getByProvider,
      { provider },
      { token }
    )

    if (!userKey?.encryptedKey || !userKey?.iv) {
      return null
    }

    return decryptKey(userKey.encryptedKey, userKey.iv)
  } catch (error) {
    console.error("Error fetching user key from Convex:", error)
    return null
  }
}

/**
 * Get the effective API key for a provider
 * Checks user's key first (via Convex), then falls back to environment variable
 *
 * @param provider - The AI provider to get key for
 * @param token - Optional Convex auth token for fetching user keys
 */
export async function getEffectiveApiKey(
  provider: Provider,
  token?: string
): Promise<string | null> {
  // Try user key first if token is provided
  if (token) {
    const userKey = await getUserKeyFromConvex(provider, token)
    if (userKey) {
      return userKey
    }
  }

  // Fall back to environment keys
  const envKeyMap: Record<Provider, string | undefined> = {
    openai: env.OPENAI_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    perplexity: env.PERPLEXITY_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    xai: env.XAI_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
  }

  return envKeyMap[provider] || null
}

/**
 * @deprecated Use hasUserKey or getUserKeyFromConvex instead
 */
export async function getUserKey(
  _userId: string,
  _provider: Provider
): Promise<string | null> {
  console.warn(
    "getUserKey is deprecated, use hasUserKey or getUserKeyFromConvex instead"
  )
  return null
}
