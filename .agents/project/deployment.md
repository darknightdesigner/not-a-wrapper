# Deployment & Infrastructure

> **Last Updated:** February 2026  
> **Primary Platform:** Vercel

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      PRODUCTION                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                     VERCEL                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │   Edge      │  │  Serverless │  │   Static    │   │   │
│  │  │  Network    │  │  Functions  │  │   Assets    │   │   │
│  │  │  (CDN)      │  │  (API)      │  │  (Next.js)  │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│  ┌─────────────────────────┼─────────────────────────────┐  │
│  │                  EXTERNAL SERVICES                     │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐               │  │
│  │  │  Convex  │  │  Clerk   │  │  AI Providers│               │  │
│  │  │   (DB)   │  │  (Auth)  │  │  (Anthropic, │               │  │
│  │  │          │  │          │  │   OpenAI...) │               │  │
│  │  └──────────┘  └──────────┘  └──────────────┘               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Vercel Configuration

### vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "bun install",
  "buildCommand": "bun run build"
}
```

### Build Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run build` | Production build |
| `bun run dev` | Local development |
| `bun run lint` | ESLint check |
| `bun run typecheck` | TypeScript check |

### Environment Variables

#### Required (Production)

```bash
# Database (Convex)
CONVEX_DEPLOYMENT=dev:your-deployment-id
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_JWT_ISSUER_DOMAIN=https://your-instance.clerk.accounts.dev

# AI Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Security
CSRF_SECRET=random-32-char-string

# Encryption (for user API keys)
ENCRYPTION_KEY=random-32-char-hex
```

#### Optional

```bash
# Additional AI Providers
MISTRAL_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
XAI_API_KEY=...
PERPLEXITY_API_KEY=...
OPENROUTER_API_KEY=...

# Clerk Webhook (for user sync)
CLERK_WEBHOOK_SECRET=whsec_...
```

#### Setting in Vercel

1. Go to Project Settings → Environment Variables
2. Add each variable
3. Select environments (Production, Preview, Development)
4. Redeploy to apply changes

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml

name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run ESLint
        run: bun run lint

      - name: Run TypeScript checks
        run: bun run typecheck

      # TODO: Uncomment when tests are added
      # - name: Run Tests
      #   run: bun test

  build:
    name: Build
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build application
        run: bun run build:next
        env:
          NEXT_PUBLIC_CONVEX_URL: ${{ vars.NEXT_PUBLIC_CONVEX_URL || 'https://placeholder.convex.cloud' }}

  # Deploy to Convex on main branch merges
  deploy:
    name: Deploy to Convex
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    concurrency:
      group: convex-deploy
      cancel-in-progress: false
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Deploy to Convex
        run: bun run build
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
```

### Pipeline Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   Push   │────>│  Lint &  │────>│  Build   │────>│  Deploy  │
│  to Git  │     │ TypeCheck│     │          │     │ (Vercel) │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                                  │
                      │ Fail                             │ Preview
                      ▼                                  ▼
                 ┌──────────┐                     ┌──────────┐
                 │  Block   │                     │ PR Preview│
                 │  Merge   │                     │   URL     │
                 └──────────┘                     └──────────┘
```

### Branch Strategy

| Branch | Environment | Auto-Deploy |
|--------|-------------|-------------|
| `main` | Production | ✅ Yes |
| `develop` | Staging | ✅ Yes |
| `feature/*` | Preview | ✅ Yes (PR) |

## Monitoring & Observability

### Current Setup

- **Vercel Analytics**: Built-in web vitals and performance
- **Error Tracking**: Console errors in Vercel logs
- **Uptime**: Vercel status page

### Planned Additions

<!-- TODO: Implement after MVP -->

| Service | Purpose | Status |
|---------|---------|--------|
| **Langfuse** | LLM observability | Planned |
| **Sentry** | Error tracking | Planned |
| **Upstash** | Rate limiting | Planned |
| **One Dollar Stats** | Analytics | Integrated |

### Health Check Endpoint

```typescript
// app/api/health/route.ts
export async function GET() {
  return Response.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
  })
}
```

## Security Headers

### Middleware Configuration

```typescript
// middleware.ts
const isDev = process.env.NODE_ENV === "development"

response.headers.set(
  "Content-Security-Policy",
  isDev
    ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ...`
    : `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ...`
)
```

### Security Headers Applied

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | Custom per env | XSS protection |
| `X-Frame-Options` | SAMEORIGIN | Clickjacking prevention |
| `X-Content-Type-Options` | nosniff | MIME sniffing prevention |

## Performance Optimization

### Next.js Configuration

```typescript
// next.config.ts
const config = {
  // Enable React strict mode
  reactStrictMode: true,
  
  // Optimize images
  images: {
    domains: ["avatars.githubusercontent.com", "img.clerk.com"],
  },
  
}
```

### Caching Strategy

| Resource | Cache Strategy | TTL |
|----------|---------------|-----|
| Static assets | CDN cache | Long (1 year) |
| API responses | No cache | — |
| User data | TanStack Query | 5 min stale |
| AI models list | Static import | Build time |

## Rollback Procedure

### Vercel Instant Rollback

1. Go to Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"
4. Confirm rollback

### Manual Rollback (Git)

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit (force)
git reset --hard <commit-sha>
git push --force origin main  # ⚠️ Requires confirmation
```

## Scaling Considerations

### Current Limits (Vercel Pro)

| Resource | Limit |
|----------|-------|
| Serverless functions | 12 concurrent |
| Function duration | 60 seconds |
| Bandwidth | 1TB/month |
| Build time | 45 minutes |

### Scaling Strategy

1. **Horizontal**: Vercel auto-scales functions
2. **Database**: Convex handles real-time sync and automatic scaling
3. **AI**: Rate limiting per user prevents overload
4. **CDN**: Static assets globally distributed

## Disaster Recovery

### Backup Strategy

| Data | Backup Method | Frequency |
|------|---------------|-----------|
| Database | Convex automatic backups | Continuous |
| Code | GitHub | Every push |
| Env vars | Secure documentation | On change |
| User uploads | Convex Storage | Continuous |

### Recovery Steps

1. **Code issues**: Vercel instant rollback
2. **Database corruption**: Convex snapshot restore
3. **API key compromise**: Rotate keys, redeploy
4. **Service outage**: Monitor status pages, failover if configured

---

*See `@.github/workflows/ci-cd.yml` for CI/CD configuration and `@vercel.json` for Vercel settings.*
