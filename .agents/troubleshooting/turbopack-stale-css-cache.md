# Turbopack: CSS Parsing Failure from Tailwind v4 Content Detection

## Problem

The dev server returns 500 errors on every page load with a CSS parsing error:

```
Parsing CSS source code failed
Unexpected token Function("calc")
```

The compiled `globals.css` output contains a rule like:

```
width: calc(var(--sidebar-width-icon) + var(calc(var(--spacing) * 4)));
```

This is invalid CSS because `var()` only accepts a custom property name, not a `calc()` expression.

## Root Cause

**Tailwind v4 automatic content detection** scans ALL non-gitignored text files in the project for class candidates — including `.md`, `.mdx`, and other documentation files.

If any file (documentation, plans, troubleshooting guides, etc.) contains a raw Tailwind class string with the invalid `--spacing(N)` pattern wrapped in `var()`, Tailwind will:

1. Extract it as a class candidate
2. Resolve `--spacing(N)` as a theme function → `calc(var(--spacing) * N)`
3. Produce `var(calc(var(--spacing) * N))` — invalid CSS
4. Turbopack's CSS parser fails on the invalid output

**This is self-perpetuating**: documenting the bad class in a markdown file causes Tailwind to regenerate the invalid CSS on every dev server start, even if all source components use the correct pattern.

### Why clearing `.next/` only works temporarily

Deleting `.next/` clears Turbopack's persistent cache, but Tailwind immediately re-scans all project files on restart. If any file still contains the invalid class string, the error returns instantly.

## How to Identify This Issue

1. Check the error output for class selectors containing `--spacing(N)` wrapped in `var()`
2. Search ALL files (not just source code) for the pattern:

```bash
rg 'spacing\(\d+\)' --type-add 'docs:*.md' --type docs
```

3. If matches are found in documentation/markdown files, that's the source

## Prevention: The @source not Directive

The permanent fix is in `app/globals.css`:

```css
@source not "../.agents";
```

This tells Tailwind v4 to exclude the `.agents/` directory from automatic content detection. Documentation files can safely contain any class strings without affecting CSS generation.

## Correct Tailwind v4 Spacing Patterns

The `--spacing(N)` syntax is a Tailwind v4 theme function resolved at build time. It must NOT be wrapped in CSS `var()`.

**Invalid** — theme function inside `var()` produces broken CSS:
- Pattern: `var(--spacing(N))` inside a `calc()`
- Result: `var(calc(var(--spacing) * N))` — `var()` cannot wrap `calc()`

**Valid alternatives:**
- `calc(var(--spacing) * N)` — multiplication must be inside `calc()`; e.g. `w-[calc(var(--spacing)*4)]`
- `--spacing(N)` bare — only in Tailwind theme contexts like `@theme` or `[--custom:--spacing(N)]`
- Hardcoded value — `spacing(4)` = `1rem` in Tailwind v4 default config

See `components/ui/sidebar.tsx` lines 245, 258 for correct usage.

## Solution Checklist

1. **Fix source code** — Replace any `var(--spacing(N))` with `calc(var(--spacing)*N)` in component files
2. **Add `@source not`** — Ensure `app/globals.css` has `@source not "../.agents"` (already done)
3. **Clear cache** — Stop dev server, `rm -rf .next`, restart
4. **Verify** — `GET /` returns 200, not 500

### If `rm -rf .next` does NOT fix the 500 error

Check whether this is actually the SST write failure issue instead. Quick test:
```bash
find .next -type f | wc -l  # 0 = SST issue, not CSS
```
If `.next` is empty after restarting the server, see `turbopack-sst-write-failure.md` — that issue requires `rm -rf node_modules && bun install`.

## IMPORTANT: For AI Agents Writing Documentation

When documenting Tailwind class issues in `.agents/` or any non-gitignored directory:

- **NEVER** include raw invalid Tailwind class strings, even in code blocks
- Tailwind's content extractor scans ALL text in the file, including fenced code blocks
- Instead, describe the pattern in prose or show only the CSS output (not the Tailwind class)
- The `@source not "../.agents"` directive provides protection, but defense-in-depth matters

## Related Files

- `app/globals.css` — `@source not` directive and Tailwind v4 entry point
- `components/ui/sidebar.tsx` — Lines 245, 258: correct `calc(var(--spacing)*N)` pattern
- `postcss.config.mjs` — PostCSS config using `@tailwindcss/postcss` plugin
- `.next/dev/cache/turbopack/` — Turbopack's persistent cache (SST files)
- `.agents/context/troubleshooting/turbopack-sst-write-failure.md` — Related issue where `.next` stays empty (different root cause, similar symptoms)
