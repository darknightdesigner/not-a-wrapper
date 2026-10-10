import { internalServerError, jsonError } from "@/app/api/_lib/convex"
import { getWorkosSession } from "@/lib/auth/workos"
import { resolveGuestIdentity } from "@/lib/guest-identity"
import { getGuestUsage } from "./api"

export async function GET(req: Request) {
  try {
    // Guests only, read by the signed guest cookie (ADR-0045); a signed-in
    // visitor never gets one.
    if ((await getWorkosSession()).user) {
      return jsonError("Usage is checked when you send.", 400)
    }
    return Response.json(await getGuestUsage(await resolveGuestIdentity(req)))
  } catch (err: unknown) {
    // A hint only: the client sends anyway and `/api/chat` admission judges.
    console.error("Error in /api/rate-limits:", err)
    return internalServerError()
  }
}
