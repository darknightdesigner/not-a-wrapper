const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
}

const UTC_DATE = new Intl.DateTimeFormat("en-US", {
  ...DATE_OPTIONS,
  timeZone: "UTC",
})

/**
 * The date line appended to every turn's instructions, so answers and search
 * queries use today instead of the model's training cutoff. Day precision
 * keeps the instruction prefix cacheable for the whole day. The zone comes
 * from an untrusted request header (`x-vercel-ip-timezone`): only a zone Intl
 * recognizes is used, printed in its canonical form, otherwise UTC.
 */
export function formatCurrentDateLine(
  now: Date,
  requestTimeZone: string | undefined
): string {
  const formatter = zonedDate(requestTimeZone) ?? UTC_DATE
  return `Current date: ${formatter.format(now)} (${formatter.resolvedOptions().timeZone})`
}

function zonedDate(
  timeZone: string | undefined
): Intl.DateTimeFormat | undefined {
  if (!timeZone) return undefined
  try {
    return new Intl.DateTimeFormat("en-US", { ...DATE_OPTIONS, timeZone })
  } catch {
    return undefined
  }
}
