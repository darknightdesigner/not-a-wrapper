import { MCP_CIRCUIT_BREAKER_THRESHOLD } from "@/lib/config"

/**
 * In-memory circuit breaker for MCP server connections.
 *
 * Tracks consecutive failures per server. When failures reach the threshold,
 * the circuit "opens" and the server is skipped until a successful connection
 * resets the counter.
 *
 * State is per-process — in serverless, this means per warm container.
 * Cold starts get a fresh circuit breaker (which is safe — worst case is
 * one extra attempt at a failing server).
 *
 * @see MCP_CIRCUIT_BREAKER_THRESHOLD in lib/config.ts (default: 3)
 */

type CircuitState = {
  consecutiveFailures: number
  lastFailureAt: number
}

/** Module-level state — survives across requests in warm containers */
const circuits = new Map<string, CircuitState>()

/**
 * Check if the circuit is open (server should be skipped).
 *
 * @param serverId - The server identifier
 * @param threshold - Failure threshold (defaults to MCP_CIRCUIT_BREAKER_THRESHOLD)
 * @returns true if the server should be skipped
 */
export function isCircuitOpen(
  serverId: string,
  threshold: number = MCP_CIRCUIT_BREAKER_THRESHOLD
): boolean {
  const state = circuits.get(serverId)
  if (!state) return false
  return state.consecutiveFailures >= threshold
}

/**
 * Record a connection failure for a server.
 * Increments the consecutive failure counter.
 *
 * @param serverId - The server identifier
 */
export function recordFailure(serverId: string): void {
  const state = circuits.get(serverId) ?? {
    consecutiveFailures: 0,
    lastFailureAt: 0,
  }
  state.consecutiveFailures++
  state.lastFailureAt = Date.now()
  circuits.set(serverId, state)
}

/**
 * Record a successful connection for a server.
 * Resets the consecutive failure counter (closes the circuit).
 *
 * @param serverId - The server identifier
 */
export function recordSuccess(serverId: string): void {
  circuits.delete(serverId)
}

/**
 * Get the current failure count for a server.
 * Useful for logging and monitoring.
 *
 * @param serverId - The server identifier
 * @returns The number of consecutive failures (0 if healthy)
 */
export function getFailureCount(serverId: string): number {
  return circuits.get(serverId)?.consecutiveFailures ?? 0
}

/**
 * Reset all circuit breaker state.
 * Primarily for testing; in production, state naturally resets with cold starts.
 */
export function resetAllCircuits(): void {
  circuits.clear()
}
