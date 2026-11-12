import "server-only"
import { cookies } from "next/headers"
import { parseSidebarWidth, SIDEBAR_WIDTH_COOKIE } from "./sidebar-width"

/** Read the user's sidebar width off the request (no network). */
export async function readSidebarWidth(): Promise<number | null> {
  const cookieStore = await cookies()
  return parseSidebarWidth(cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value)
}
