# Turbopack: SST Write Failure & Empty .next Directory

## Problem

The dev server starts but returns HTTP 500 on all page requests. The terminal shows cascading errors:

1. `Persisting failed: Unable to write SST file 00000NNN.sst - No such file or directory (os error 2)`
2. `Cannot find module '.next/dev/server/middleware-manifest.json'`
3. `ENOENT: no such file or directory, open '.next/dev/server/pages/_app/build-manifest.json'`
4. `ENOENT: no such file or directory, open '.next/dev/static/development/_buildManifest.js.tmp.*'`
5. Turbopack panics: `Failed to restore task data (corrupted database or bug)`
6. `Another write batch or compaction is already active`

The `.next` directory exists but is completely empty (no subdirectories, no files).

## Root Cause

**Corrupted `node_modules` installation** causes Turbopack's native binary (`@next/swc-darwin-arm64`) or its persistent cache backend to malfunction. The SST (Sorted String Table) storage system that Turbopack uses for its filesystem cache fails to create its directory structure, which cascades into:

- No cache files written
- No build manifests generated
- No middleware manifests created
- Complete inability to serve any pages

### Why restarting or deleting .next alone does NOT fix it

The corruption is in `node_modules`, not in `.next`. Deleting `.next` only removes the (already empty/corrupted) cache. On restart, Turbopack reads from the same corrupted native binary and fails identically.

### Contributing Factors

- **High disk utilization** (97%+ on macOS) may contribute to initial corruption during write operations
- **Force-killing the dev server** (Ctrl+C during active writes) can corrupt the SST database
- **Multiple dev server instances** competing for the same `.next` directory
- **Stale node_modules** from interrupted `bun install` or version switches

## How to Identify This Issue

Start with the fastest diagnostic first:

1. **Check if `.next` is empty** (this is the single most reliable signal):
   ```bash
   find .next -type f | wc -l  # Should show many files; 0 = broken
   ```

2. **Look for SST write errors** in terminal output:
   ```
   Persisting failed: Unable to write SST file 00000NNN.sst
   ```

3. **Check for negative compile times** in request logs — a telltale sign:
   ```
   GET / 500 in 1728ms (compile: -1331108µs, ...)
   ```
   Normal compile times are positive (e.g., `compile: 3.2s`). Negative values indicate Turbopack's internal state is broken.

4. **Check for missing manifest errors** immediately on first page request

5. **Verify the error persists** across server restarts even after `rm -rf .next`

### Common Misdiagnosis Traps

- **Do NOT assume this is Turbopack-specific.** When `node_modules` is corrupted, the `--webpack` flag produces the same ENOENT errors for manifests. Switching bundlers wastes time.
- **Do NOT assume `turbopackFileSystemCacheForDev: false` will fix an active corruption.** During an active incident where `node_modules` is corrupted, this flag only suppresses the SST persist warnings — it does NOT fix the underlying inability to write build outputs. The manifests will still be missing. You must still reinstall `node_modules`. However, the flag *does* help prevent future SST cache corruption by avoiding persistent cache writes entirely (see "If the issue recurs frequently" below).
- **Do NOT spend time debugging CSS or config issues.** If `.next` has zero files, the problem is at the filesystem/binary level, not in your source code.
- **Watch for zombie processes.** After force-killing, old `next dev` processes often linger. Always verify ports are free:
  ```bash
  lsof -ti :3000 | xargs kill -9 2>/dev/null
  ```

## Solution

### Quick Fix (works 100% of the time)

```bash
# 1. Kill all dev server processes and free ports
pkill -f "next dev"
lsof -ti :3000 | xargs kill -9 2>/dev/null

# 2. Nuclear clean (keep bun.lock — only remove .next and node_modules)
rm -rf .next node_modules

# 3. Reinstall dependencies
bun install

# 4. Restart dev server
bun run dev
```

IMPORTANT: Do NOT delete `bun.lock` / `bun.lockb` — that would change resolved versions and potentially introduce new issues. Only `node_modules` and `.next` need to be removed.

### If the issue recurs frequently

Add the filesystem cache disable flag to `next.config.ts` as a preventive measure:

```typescript
experimental: {
  turbopackFileSystemCacheForDev: false,
}
```

This disables Turbopack's persistent SST cache (enabled by default since Next.js 16.1.0). The server will work but won't persist compilation results between restarts, resulting in slightly slower cold starts (~5-15s).

**Important distinction:** This flag does NOT fix an active corruption — you still need to reinstall `node_modules` first (see Quick Fix above). What it does is prevent *future* SST cache corruption by eliminating persistent cache writes, reducing the surface area for the bug.

> **Current project status:** This flag is currently enabled in `next.config.ts`. Re-evaluate removal when Next.js patches the underlying SST write issue upstream.

## Prevention

1. **Always stop the dev server cleanly** before switching branches or running `bun install`
2. **Monitor disk space** - keep at least 10% free on your volume
3. **Don't run multiple `next dev` instances** pointing to the same project directory
4. **After `bun install` failures**, always re-run `bun install` to completion before starting the dev server
5. **If Turbopack panics**, immediately stop the server and `rm -rf .next` before restarting

## Key Technical Details

- **SST files**: Sorted String Table files used by Turbopack's log-structured merge tree storage (similar to LevelDB/RocksDB)
- **Filesystem cache**: Enabled by default in Next.js 16.1.0+ via `turbopackFileSystemCacheForDev`
- **Native binary**: `node_modules/@next/swc-darwin-arm64/next-swc.darwin-arm64.node` (macOS ARM)
- **Cache location**: `.next/dev/cache/turbopack/`

## Differentiating from the CSS Cache Issue

This issue can look similar to the Tailwind CSS parsing failure documented in `turbopack-stale-css-cache.md`, since both produce HTTP 500 errors. Key differences:

| Signal | SST Write Failure (this doc) | CSS Parsing Failure |
|--------|------------------------------|---------------------|
| `.next` file count | 0 (completely empty) | Has files, but CSS is broken |
| Terminal error | `Unable to write SST file` | `Parsing CSS source code failed` |
| Compile times | Negative (e.g., `-1331108µs`) | Normal positive values |
| `rm -rf .next` fixes it? | No | Temporarily (returns on restart) |
| `rm -rf node_modules` needed? | Yes | No |

If you see BOTH issues simultaneously, fix the SST issue first (reinstall node_modules), then address CSS if it persists.

## Related Files

- `next.config.ts` — `turbopackFileSystemCacheForDev` option
- `.next/dev/cache/turbopack/` — SST cache files (when working correctly)
- `node_modules/@next/swc-darwin-arm64/` — Turbopack native binary
- `.agents/troubleshooting/turbopack-stale-css-cache.md` — Related Turbopack CSS issue
