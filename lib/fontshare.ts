/**
 * Fontshare hosts for the Sentient headline font (see the font-heading
 * utility). Its license allows the Fontshare API but not committing the font
 * files to this public repo. The root layout loads from these origins and the
 * CSP allows exactly them, so both read this one source.
 */
export const FONTSHARE_ORIGINS = {
  /** Serves the stylesheet. */
  api: "https://api.fontshare.com",
  /** Serves the font files the stylesheet references. */
  cdn: "https://cdn.fontshare.com",
} as const

/** `@1` is the upright variable font (wght 200-700). */
export const SENTIENT_STYLESHEET = `${FONTSHARE_ORIGINS.api}/v2/css?f[]=sentient@1&display=swap`
