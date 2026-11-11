/**
 * User-resized sidebar width. The default stays CSS-owned (`--sidebar-width`
 * in `app/globals.css`) and is also the minimum, so the frame only grows; a
 * stored width overrides the token on the frame. The cookie lets the server
 * render the chosen width with no post-hydration jump.
 */
export const SIDEBAR_WIDTH_COOKIE = "sidebar_width"
export const SIDEBAR_WIDTH_MIN = 240
export const SIDEBAR_WIDTH_MAX = 400

export function clampSidebarWidth(width: number) {
  return Math.round(
    Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width))
  )
}

export function parseSidebarWidth(value: string | undefined): number | null {
  const width = Number(value)
  return value && Number.isFinite(width) ? clampSidebarWidth(width) : null
}
