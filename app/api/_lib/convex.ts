import "server-only"
import { isAccountRejectedError } from "@/convex/lib/auth"
import { ConvexHttpClient } from "convex/browser"
import { NextResponse } from "next/server"

export { getConvexSiteUrl } from "./convex-site-url"

export function createConvexHttpClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set")
  }

  return new ConvexHttpClient(url)
}

export function createAuthenticatedConvexClient(accessToken: string) {
  const convex = createConvexHttpClient()
  convex.setAuth(accessToken)
  return convex
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export function unauthorizedError() {
  return jsonError("Unauthorized", 401)
}

export function internalServerError() {
  return jsonError("Internal server error", 500)
}

/** A deleted or disabled account whose session is still valid (ADR-0044). */
export function accountRejectedError() {
  return NextResponse.json(
    { error: "This account is no longer active.", code: "ACCOUNT_REJECTED" },
    { status: 403 }
  )
}

/** A route's failed Convex work: the typed 403 for a rejected account, else 500. */
export function routeFailureResponse(error: unknown) {
  return isAccountRejectedError(error)
    ? accountRejectedError()
    : internalServerError()
}
