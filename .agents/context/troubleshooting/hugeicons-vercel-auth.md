# HugeIcons Pro: Vercel Build Authentication

## Problem

Vercel builds fail with 401 errors when installing HugeIcons Pro packages:

```
error: GET https://npm.hugeicons.com/@hugeicons-pro/core-bulk-rounded/-/core-bulk-rounded-3.1.0.tgz - 401
error: GET https://npm.hugeicons.com/@hugeicons-pro/core-stroke-rounded/-/core-stroke-rounded-3.1.0.tgz - 401
```

## Root Cause

Two issues combine to cause this:

1. **`.npmrc` is gitignored** - The local `.npmrc` file contains the registry scope and auth token configuration, but it's listed in `.gitignore` (line 70), so it's not deployed to Vercel.

2. **Bun doesn't interpolate env vars in `.npmrc`** - Even if `.npmrc` were committed, the `${HUGEICONS_LICENSE_KEY}` syntax wouldn't be expanded by bun during Vercel builds.

The `.npmrc` file needs TWO lines:
```
@hugeicons-pro:registry=https://npm.hugeicons.com
//npm.hugeicons.com/:_authToken=<your-license-key>
```

- Line 1: Tells npm/bun to fetch `@hugeicons-pro/*` packages from HugeIcons' registry
- Line 2: Provides authentication for that registry

## Solution

The fix is in `vercel.json` - use a custom install command that writes the full `.npmrc` before running `bun install`:

```json
{
  "installCommand": "bash -c 'echo -e \"@hugeicons-pro:registry=https://npm.hugeicons.com\\n//npm.hugeicons.com/:_authToken=${HUGEICONS_LICENSE_KEY}\" > .npmrc && cat .npmrc && bun install'",
  "buildCommand": "npx convex deploy --cmd 'next build'"
}
```

### Key Details

- Uses `bash -c` for reliable shell interpretation
- Uses `echo -e` to handle the `\n` newline character
- Uses `>` to create/overwrite the file (not `>>` append)
- Includes `cat .npmrc` for debugging in build logs
- Uses `${VAR}` syntax inside double quotes for variable expansion

## Vercel Environment Setup

1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add:
   - **Name:** `HUGEICONS_LICENSE_KEY`
   - **Value:** Your HugeIcons Universal License Key (format: `XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`)
   - **Environments:** Production, Preview, Development (all three)

## Local Development

For local development, the `.npmrc` file works normally because:
- Shell properly expands `${HUGEICONS_LICENSE_KEY}` from your environment
- The file exists locally (just not in git)

Make sure you have `HUGEICONS_LICENSE_KEY` set in your local environment (`.env.local` or shell profile).

## Debugging

If builds still fail, check the Vercel build logs for the `cat .npmrc` output:

✅ **Working** - Shows both lines with actual token:
```
@hugeicons-pro:registry=https://npm.hugeicons.com
//npm.hugeicons.com/:_authToken=XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
```

❌ **Missing registry** - Only shows auth line:
```
//npm.hugeicons.com/:_authToken=XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
```

❌ **Missing/empty token** - Shows empty or unexpanded variable:
```
@hugeicons-pro:registry=https://npm.hugeicons.com
//npm.hugeicons.com/:_authToken=
```

## Related Files

- `vercel.json` - Contains the install command fix
- `.npmrc` - Local config (gitignored)
- `.gitignore` - Line 70 excludes `.npmrc`
- `.env.example` - Documents `HUGEICONS_LICENSE_KEY`
