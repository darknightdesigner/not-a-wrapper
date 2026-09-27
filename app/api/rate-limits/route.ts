import { internalServerError } from "@/app/api/_lib/convex"
import { getWorkosSession } from "@/lib/auth/workos"
import { resolveGuestIdentity } from "@/lib/guest-identity"
import { getMessageUsage } from "./api"

export async function GET(req: Request) {
  try {
    const authSession = await getWorkosSession()

    // Guests are read by the signed guest cookie (ADR-0045); the client's
    // `userId` query parameter is ignored.
    const usage = await getMessageUsage(
      authSession.user
        ? { kind: "user", token: authSession.accessToken }
        : { kind: "guest", guest: await resolveGuestIdentity(req) }
    )

    return new Response(JSON.stringify(usage), { status: 200 })
  } catch (err: unknown) {
    console.error("Error in /api/rate-limits:", err)
    return internalServerError()
  }
}
