/**
 * Theme names registered with next-themes. next-themes only removes
 * registered names from `<html>`, so every theme class must be listed here.
 */
export const APP_THEMES = ["light", "dark", "aqua"] as const

export type AppTheme = (typeof APP_THEMES)[number]

/** What a user can pick. "system" (enableSystem) resolves only to light or dark, so aqua stays opt-in. */
export type ThemePreference = AppTheme | "system"

export type ColorScheme = "light" | "dark"

/** The light/dark base each theme paints on, for libraries that only know light and dark. */
export const THEME_COLOR_SCHEME = {
  light: "light",
  dark: "dark",
  aqua: "light",
} as const satisfies Record<AppTheme, ColorScheme>

/** Maps a next-themes `theme`/`resolvedTheme` to light or dark; unknown values fall back to light. */
export function resolveColorScheme(theme: string | undefined): ColorScheme {
  const appTheme = APP_THEMES.find((name) => name === theme)
  return appTheme ? THEME_COLOR_SCHEME[appTheme] : "light"
}
