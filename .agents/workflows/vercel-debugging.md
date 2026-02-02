# Vercel Deployment Debugging Workflow

A comprehensive guide for systematically debugging and resolving Vercel deployment issues for the vid0 project.

## Table of Contents

- [Quick Reference: Debugging Commands](#quick-reference-debugging-commands)
- [Phase 1: Identify the Problem](#phase-1-identify-the-problem)
- [Phase 2: Reproduce Locally](#phase-2-reproduce-locally)
- [Phase 3: Diagnose & Fix](#phase-3-diagnose--fix)
- [Phase 4: Verify & Deploy](#phase-4-verify--deploy)
- [Common Issues & Solutions](#common-issues--solutions)
- [Using Vercel MCP Tools in Cursor](#using-vercel-mcp-tools-in-cursor)
- [Prevention Checklist](#prevention-checklist)

---

## Quick Reference: Debugging Commands

```bash
# Local verification before deployment
bun run typecheck          # TypeScript errors
bun run lint              # ESLint issues
bun run build             # Full production build

# Vercel CLI debugging
vercel build              # Simulate Vercel build environment locally
vercel env pull           # Sync environment variables from Vercel
vercel logs               # View runtime logs
vercel inspect <url>      # Inspect deployment details

# Force clean build
VERCEL_FORCE_NO_BUILD_CACHE=1 vercel --prod
```

---

## Phase 1: Identify the Problem

### Step 1.1: Classify the Error Type

| Error Type | Symptoms | Where to Look |
|------------|----------|---------------|
| **Build Error** | Deployment fails during build | Build logs in Vercel dashboard |
| **Runtime Error** | 500/502 errors after deployment | Runtime logs, function logs |
| **Configuration Error** | 404s, missing routes | `vercel.json`, project settings |
| **Environment Error** | Features work locally, fail on Vercel | Environment variables |

### Step 1.2: Gather Information

**Using Vercel Dashboard:**
1. Go to your project → **Deployments** tab
2. Click on the failed deployment
3. Review the **Build Logs** section
4. Note the specific error message and line number

**Using Cursor with Vercel MCP:**

Ask Claude to use the Vercel MCP tools:
```
Use the Vercel MCP to get the build logs for my latest deployment
```

Available MCP prompts for debugging:
- `fix_recent_build` - Analyze and fix the most recent deployment
- `debug_deployment_issues` - Comprehensive debugging analysis
- `troubleshoot_common_issues` - Systematic troubleshooting guide
- `get_deployment_build_logs` - Fetch raw build logs

### Step 1.3: Check Deployment Status

```bash
# List recent deployments
vercel list

# Get details about a specific deployment
vercel inspect <deployment-url>
```

---

## Phase 2: Reproduce Locally

### Step 2.1: Sync Environment Variables

```bash
# Pull environment variables from Vercel
vercel env pull .env.local

# Verify all required variables are present
cat .env.local | grep -E "^[A-Z]"
```

**Critical Check:** Ensure `NEXT_PUBLIC_` prefix for client-side variables.

### Step 2.2: Simulate Vercel Build

```bash
# Clean previous build artifacts
rm -rf .next .vercel/output

# Run Vercel's build process locally
vercel build
```

This uses Vercel's actual build configuration and helps identify:
- Missing dependencies
- Environment variable issues
- Build script errors

### Step 2.3: Check Node.js Version Alignment

Verify your local Node.js version matches Vercel's:

```bash
# Check local version
node -v

# Set version in package.json (if needed)
"engines": {
  "node": "20.x"
}
```

### Step 2.4: Test Production Mode

```bash
# Build and start in production mode
bun run build && bun run start
```

Test the same flows that fail on Vercel.

---

## Phase 3: Diagnose & Fix

### Build Errors

#### TypeScript Errors

```bash
# Run TypeScript check
bun run typecheck

# Common fixes:
# 1. Type mismatches → Fix type definitions
# 2. Missing types → Install @types packages
# 3. Implicit any → Add explicit types
```

#### Module Not Found

```bash
# Verify all dependencies are in package.json
bun install

# Check for case sensitivity issues (Linux is case-sensitive)
# ❌ import Component from './component'  (if file is Component.tsx)
# ✅ import Component from './Component'
```

#### Memory/Timeout Issues

Add to `vercel.json`:
```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

### Runtime Errors

#### 502 Bad Gateway

1. Check runtime logs in Vercel dashboard
2. Look for unhandled promise rejections
3. Verify all async operations are awaited
4. Check for missing environment variables

```typescript
// ❌ Bad: Unhandled async
export function GET() {
  fetchData(); // Not awaited!
  return new Response("OK");
}

// ✅ Good: Properly awaited
export async function GET() {
  await fetchData();
  return new Response("OK");
}
```

#### 504 Gateway Timeout

- Function execution exceeds time limit (default: 10s)
- Solutions:
  1. Optimize slow operations
  2. Increase `maxDuration` in `vercel.json`
  3. Use streaming for long operations
  4. Move to background jobs/Edge Functions

#### Missing Logs

Ensure all async operations complete before response:

```typescript
// ❌ Logs may not appear
export function POST(request: Request) {
  process.nextTick(() => {
    console.log("This might not show");
  });
  return new Response("OK");
}

// ✅ Logs will appear
export async function POST(request: Request) {
  console.log("This will show");
  await someOperation();
  return new Response("OK");
}
```

### Environment Variable Issues

#### Checklist

- [ ] Variable exists in Vercel dashboard (Settings → Environment Variables)
- [ ] Variable is set for the correct environment (Production/Preview/Development)
- [ ] No leading/trailing whitespace in values
- [ ] Client-side variables have `NEXT_PUBLIC_` prefix
- [ ] Redeployed after adding/changing variables

#### Debug Environment Variables

```typescript
// Temporarily add to a route for debugging
export function GET() {
  return Response.json({
    hasApiKey: !!process.env.API_KEY,
    nodeEnv: process.env.NODE_ENV,
    // Never log actual secret values!
  });
}
```

### Cache Issues

#### Force Clean Build

```bash
# Option 1: Via environment variable
VERCEL_FORCE_NO_BUILD_CACHE=1 vercel --prod

# Option 2: Via Vercel dashboard
# Settings → Build & Development Settings → Clear Build Cache
```

#### When to Clear Cache

- After updating `package.json` dependencies
- After changing build configuration
- When environment variable changes aren't reflected
- When experiencing "works locally, fails on Vercel" issues

---

## Phase 4: Verify & Deploy

### Pre-Deployment Checklist

```bash
# 1. Clean install
rm -rf node_modules .next
bun install

# 2. Run all checks
bun run typecheck
bun run lint
bun run build

# 3. Test locally in production mode
bun run start
```

### Deploy with Monitoring

```bash
# Deploy and watch logs
vercel --prod

# Monitor runtime logs after deployment
vercel logs --follow
```

### Post-Deployment Verification

1. Test critical user flows
2. Check runtime logs for errors
3. Verify API endpoints respond correctly
4. Test authentication flows
5. Monitor for 5 minutes for any delayed errors

---

## Common Issues & Solutions

### Issue: "Module not found" on Vercel but works locally

**Cause:** Case sensitivity differences (macOS is case-insensitive, Linux is case-sensitive)

**Solution:**
```bash
# Find case mismatches
git config core.ignorecase false
git status  # Shows files with case issues
```

### Issue: API routes return 404

**Causes:**
1. Missing `route.ts` file in the API folder
2. Incorrect export (must export HTTP method functions)
3. Build didn't include the route

**Solution:**
```typescript
// app/api/example/route.ts
export async function GET() {
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ received: body });
}
```

### Issue: Environment variables undefined

**Solution checklist:**
1. Add to Vercel dashboard (not just `.env.local`)
2. Set for correct environment (Production/Preview/Development)
3. Redeploy after changes
4. Use `NEXT_PUBLIC_` prefix for client-side access

### Issue: Build succeeds but app shows old version

**Cause:** Aggressive caching

**Solutions:**
1. Clear Vercel build cache
2. Purge CDN cache: Settings → Edge Network → Purge Cache
3. Add cache-busting headers:

```typescript
// next.config.ts
export default {
  headers: async () => [{
    source: '/:path*',
    headers: [
      { key: 'Cache-Control', value: 'no-store' }
    ]
  }]
};
```

### Issue: Streaming responses fail

**Cause:** Middleware or configuration blocking streaming

**Solution:**
```typescript
// Ensure proper streaming setup
import { StreamingTextResponse } from 'ai';

export async function POST(request: Request) {
  const stream = await generateStream();
  return new StreamingTextResponse(stream);
}
```

### Issue: Function timeout

**Cause:** Operation exceeds default 10s limit

**Solution:**
```json
// vercel.json
{
  "functions": {
    "app/api/long-operation/route.ts": {
      "maxDuration": 60
    }
  }
}
```

---

## Using Vercel MCP Tools in Cursor

This project has Vercel MCP integration. Use these commands in Cursor chat:

### Quick Commands

```
# Check latest deployment status
"Use Vercel MCP to show my latest deployment status"

# Get build logs for failed deployment
"Get the build logs for deployment [deployment-id] using Vercel MCP"

# Debug deployment issues
"Help me debug my Vercel deployment issues"

# Fix recent build
"Analyze and fix my most recent Vercel build failure"
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_deployments` | List all deployments for the project |
| `get_deployment` | Get details about a specific deployment |
| `get_deployment_build_logs` | Fetch build logs for debugging |
| `list_projects` | List all Vercel projects |
| `get_project` | Get project configuration details |
| `search_vercel_documentation` | Search Vercel docs for solutions |

### Available MCP Prompts

| Prompt | Use Case |
|--------|----------|
| `fix_recent_build` | Build failures, stuck deployments |
| `debug_deployment_issues` | Mysterious problems, deep analysis |
| `troubleshoot_common_issues` | Systematic troubleshooting |
| `get_project_status` | Overall project health |
| `project_health_check` | Comprehensive health review |

---

## Prevention Checklist

### Before Every Deployment

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds locally
- [ ] All new environment variables added to Vercel
- [ ] No hardcoded secrets in code
- [ ] API routes tested locally in production mode

### Weekly Maintenance

- [ ] Review and clean unused environment variables
- [ ] Check for outdated dependencies with security issues
- [ ] Review deployment logs for warnings
- [ ] Verify all preview deployments are working

### After Dependency Updates

- [ ] Clear build cache
- [ ] Test full build locally with `vercel build`
- [ ] Deploy to preview first
- [ ] Monitor for 24 hours before promoting to production

---

## Debugging Decision Tree

```
Deployment Failed?
│
├─► Build Error
│   ├─► TypeScript Error → Run `bun run typecheck`, fix types
│   ├─► Module Not Found → Check case sensitivity, verify dependencies
│   ├─► Memory Error → Optimize build, check for large assets
│   └─► Timeout → Split build, optimize slow operations
│
├─► Runtime Error (500/502)
│   ├─► Check runtime logs in dashboard
│   ├─► Verify environment variables
│   ├─► Check for unhandled async operations
│   └─► Review function timeout settings
│
├─► 404 Errors
│   ├─► Verify route file exists and exports correct methods
│   ├─► Check `vercel.json` rewrites/redirects
│   └─► Ensure build included the route
│
└─► Works Locally, Fails on Vercel
    ├─► Sync env vars with `vercel env pull`
    ├─► Check Node.js version alignment
    ├─► Look for OS-specific code (paths, case sensitivity)
    └─► Clear build cache and redeploy
```

---

## Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Troubleshooting Guide](https://vercel.com/docs/deployments/troubleshoot-a-build)
- [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
- [Vercel Community](https://community.vercel.com/)
- [Vercel Status Page](https://www.vercel-status.com/)

---

*Last updated: January 2026*
