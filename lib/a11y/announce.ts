/**
 * Announce a message to screen readers via the global aria-live regions.
 *
 * @param message - Text to announce
 * @param priority - "polite" waits for current speech to finish; "assertive" interrupts
 */
export function announce(
  message: string,
  priority: "polite" | "assertive" = "polite"
): void {
  const regionId =
    priority === "assertive" ? "live-region-assertive" : "live-region-polite"
  const region = document.getElementById(regionId)
  if (!region) return

  // Clear then set after a frame — some screen readers ignore changes
  // to already-populated live regions unless the content actually differs.
  region.textContent = ""
  requestAnimationFrame(() => {
    region.textContent = message
  })
}
