export type CappedBodyRead =
  { kind: "ok"; blob: Blob } | { kind: "too_large" } | { kind: "invalid" }

/**
 * Read an upload body incrementally so an oversized (or length-less chunked)
 * upload is aborted at the cap instead of being buffered whole:
 * `request.blob()` would hold the entire payload in memory before any size
 * check could run. An empty or unreadable body is `invalid`.
 */
export async function readBodyCapped(
  request: Request,
  maxBytes: number,
  contentType: string
): Promise<CappedBodyRead> {
  const stream = request.body
  if (!stream) return { kind: "invalid" }

  const chunks: Uint8Array<ArrayBuffer>[] = []
  let totalBytes = 0
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {})
        return { kind: "too_large" }
      }
      chunks.push(value)
    }
  } catch {
    return { kind: "invalid" }
  }
  if (totalBytes === 0) return { kind: "invalid" }

  return { kind: "ok", blob: new Blob(chunks, { type: contentType }) }
}
