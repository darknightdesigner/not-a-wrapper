# AGENTS.md Research Document

> **Purpose:** Strategic research to inform the creation of a comprehensive AGENTS.md file
> 
> **Created:** January 13, 2026
> 
> **Status:** ✅ **Research Complete - All Decisions Made**
> 
> **Next:** Draft AGENTS.md with finalized tech stack

---

## Table of Contents

1. [Project Vision & Context](#project-vision--context)
2. [Current State Assessment](#current-state-assessment)
3. [Research Areas](#research-areas)
4. [Tech Stack Evaluation](#tech-stack-evaluation)
5. [External Services Research](#external-services-research)
6. [Architecture Patterns Research](#architecture-patterns-research)
7. [Security & Boundaries Research](#security--boundaries-research)
8. [Quality Gates Research](#quality-gates-research)
9. [AI Workflow Research](#ai-workflow-research)
10. [Gold Standard Examples](#gold-standard-examples)
11. [Open Questions](#open-questions)
12. [Research Findings](#research-findings)
13. [AGENTS.md Outline](#agentsmd-outline)

---

## Project Vision & Context

### Core Purpose

**vid0** (placeholder name) is a chat-based platform that helps content creators make better YouTube videos through data-driven AI recommendations.

### Problem Statement

Current YouTube advice solutions suffer from:
- ❌ Uninformed recommendations (not based on real data)
- ❌ Outdated strategies (YouTube algorithm changes constantly)
- ❌ Opinion-based guidance (no analytics backing)
- ❌ Generic advice (not personalized to creator's niche/audience)

### Our Solution

A platform that:
- ✅ Connects to creators' YouTube Analytics
- ✅ Provides data-driven recommendations for scripts, titles, thumbnails
- ✅ Learns from aggregate user data (more users = smarter AI)
- ✅ Chat-based interface for natural interaction
- ✅ Analyzes competitor videos through transcript extraction

### Target Users

| User Type | Description | Needs |
|-----------|-------------|-------|
| **Primary** | YouTube content creators | Script optimization, title/thumbnail recommendations, competitor analysis |
| **Secondary** | YouTube channel managers | Analytics insights, content strategy |
| **Tertiary** | Marketing teams | Video content optimization |

### Founder Context

- **Channel:** "Andres The Designer" (80K subscribers)
- **Experience:** First-hand understanding of creator pain points
- **Vision:** Build the tool he wishes existed

---

## Current State Assessment

### Tech Stack (Current)

| Category | Technology | Version | Status |
|----------|------------|---------|--------|
| **Framework** | Next.js (App Router) | 16.0.9 | ✅ Latest |
| **UI Library** | React | 19.2.2 | ✅ Latest |
| **Language** | TypeScript | 5.x | ✅ Current |
| **Database** | Supabase | 2.90.1 | ⚠️ Under evaluation |
| **State Management** | Zustand | 5.0.9 | ✅ Current |
| **Server State** | TanStack Query | 5.80.6 | ✅ Current |
| **UI Components** | Shadcn/Radix | Latest | ✅ Current |
| **Styling** | Tailwind CSS | 4.1.5 | ✅ Latest |
| **Animation** | Motion | 12.25.0 | ✅ Current |
| **AI SDK** | Vercel AI SDK | 4.3.13 | ✅ Current |

### AI Provider Integrations (Current)

| Provider | Package | Use Case |
|----------|---------|----------|
| Anthropic | @ai-sdk/anthropic | Primary (Claude Opus 4.5) |
| OpenAI | @ai-sdk/openai | Secondary, Whisper |
| Google | @ai-sdk/google | Alternative |
| Mistral | @ai-sdk/mistral | Alternative |
| Perplexity | @ai-sdk/perplexity | Research/search |
| xAI | @ai-sdk/xai | Alternative |
| OpenRouter | @openrouter/ai-sdk-provider | Model aggregation |

### Existing Research & Documentation

| Document | Status | Notes |
|----------|--------|-------|
| `youtube-transcript-evaluation.md` | ✅ Complete | Comprehensive transcript extraction research |
| `installation-implementation-plan.md` | ✅ Complete | Phased implementation roadmap |
| `AI_CONTEXT_SETUP_GUIDE.md` | ✅ Complete | AI orchestration best practices |

### Current Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Core Chat | ✅ 100% | Multi-provider support |
| Authentication | ✅ 100% | Supabase Auth |
| UI Components | 🟡 70% | 58 components remaining |
| YouTube Integration | 🔴 0% | Research complete, evaluation needed |
| Rate Limiting | 🔴 0% | Upstash planned |
| LLM Observability | 🔴 0% | Langfuse/Helicone evaluation needed |
| Testing | 🔴 0% | Vitest + Playwright planned |

---

## Research Areas

### Priority Matrix (Updated)

| Area | Priority | Impact | Effort | Status |
|------|----------|--------|--------|--------|
| Tech Stack Evaluation | 🔴 High | High | Medium | ✅ **Complete** |
| External Services (YouTube API) | 🔴 High | High | High | ✅ **Complete** |
| Security Boundaries | 🔴 High | Critical | Low | ✅ **Complete** |
| Architecture Patterns | 🟠 Medium | High | Medium | ✅ **Complete** |
| Quality Gates/Testing | 🟠 Medium | Medium | Medium | ✅ **Complete** |
| AI Workflow Patterns | 🟠 Medium | High | Low | ✅ **Complete** |
| Gold Standard Examples | 🟢 Low | Medium | Ongoing | ✅ **Complete** |
| Sub-Agent Architecture | 🟠 Medium | High | Medium | ✅ **Complete** |
| Chat Architecture Patterns | 🟠 Medium | High | Low | ✅ **Complete** |
| Data Flow Patterns | 🟠 Medium | High | Low | ✅ **Complete** |

### Research Progress

```
[█████████████████████████] 100% Complete - All Research Done!

✅ Convex vs Supabase - DECIDED → Convex
✅ YouTube API Analysis - DECIDED → Data API first
✅ Auth Provider - DECIDED → Clerk (Flowglad compatible)
✅ Payments Provider - DECIDED → Flowglad
✅ Security Boundaries - DONE (Ready for AGENTS.md)
✅ Testing Strategy - DECIDED → Critical paths only
✅ Sub-Agent Architecture - DONE (Ready for AGENTS.md)
✅ AI Workflow Patterns - DONE (Ready for AGENTS.md)
✅ Gold Standard Examples - DONE (Identified)
✅ Chat Architecture Patterns - DONE (Ready for AGENTS.md)
✅ Data Flow Patterns - DONE (Ready for AGENTS.md)
```

---

## Tech Stack Evaluation

### ✅ RESEARCH COMPLETE: Convex vs Supabase

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete - Decision Needed

---

#### Executive Summary

| Factor | Supabase | Convex | Winner |
|--------|----------|--------|--------|
| Current integration | ✅ Done | ❌ Migration needed | **Supabase** |
| Real-time performance | Manual subscriptions | ✅ Native reactive queries | **Convex** |
| TypeScript DX | Good (needs type gen) | ✅ Excellent (TypeScript-first) | **Convex** |
| Schema management | SQL migrations | ✅ Schema as code | **Convex** |
| AI/RAG capabilities | ❌ External only | ✅ Built-in RAG, vector search | **Convex** |
| Local development | ✅ Docker support | ❌ No local testing | **Supabase** |
| Vendor lock-in | ✅ Open-source, self-host | ⚠️ Proprietary | **Supabase** |
| Authentication | ✅ Built-in | Bring Your Own (Clerk/Auth0) | **Supabase** |
| File storage | ✅ Robust | ✅ Good (1GB free) | **Tie** |

#### 🔴 RECOMMENDATION: Migrate to Convex

Given that we're building an **AI-first chat application** and are still early in development, Convex offers significant advantages that outweigh migration costs:

1. **Built-in AI/RAG capabilities** - Critical for our use case
2. **TypeScript-first DX** - Faster development, fewer bugs
3. **Native real-time** - Better chat experience without manual subscriptions
4. **Automatic migrations** - No SQL migration headaches

---

#### Detailed Comparison

##### Architecture & Data Model

| Aspect | Supabase | Convex |
|--------|----------|--------|
| **Database Type** | PostgreSQL (relational) | Reactive document-relational |
| **Query Language** | SQL | TypeScript functions |
| **Schema Definition** | SQL migrations | TypeScript schema |
| **Real-time** | Logical replication (manual) | Native WebSocket sync |

##### Real-Time Capabilities (Critical for Chat)

**Supabase:**
- Supports real-time via PostgreSQL logical replication
- Requires manual subscription setup
- Manual frontend state management
- **Connection limits:** 200 (free) → 10,000 (enterprise)
- **Message limits:** 100/sec (free) → 2,500/sec (enterprise)
- ⚠️ Can experience latency under heavy load

**Convex:**
- Native real-time synchronization with minimal setup
- Reactive queries automatically update UI on data changes
- Built for low-latency even with high concurrent connections
- No manual subscription management required
- ✅ Designed for real-time collaborative applications

##### AI & RAG Capabilities (Critical for Our Use Case)

**Supabase:**
- ❌ No native AI/RAG support
- Must integrate external services via edge functions
- Vector search possible but requires extensions

**Convex:**
- ✅ **Built-in RAG components** with vector search
- ✅ Configurable embedding models
- ✅ Namespace support (user-specific data isolation)
- ✅ Custom filtering on vector searches
- ✅ Chunk context for better relevance
- ✅ Importance weighting (0-1 scores)
- ✅ Built-in AI Agent memory (threads, messages, stream deltas)
- ✅ Graceful migrations for content/namespaces

**This is the biggest differentiator for our YouTube AI assistant use case.**

##### TypeScript Integration

**Supabase:**
- Requires running `supabase gen types` after schema changes
- Types generated from database schema
- Good, but extra step in workflow

**Convex:**
- ✅ TypeScript-first from the ground up
- Schema defined in TypeScript
- Full type safety and IDE support
- Automatic type generation
- Seamless frontend/backend integration

##### Vercel AI SDK Integration

**Convex:**
- ✅ Works with Vercel AI SDK via HTTP actions
- Can build streaming chat with `useChat` hook
- HTTP action endpoint handles chat messages
- Supports streaming responses back to client

**Integration approach:**
```typescript
// Convex HTTP action handles AI requests
// Frontend uses useChat from @ai-sdk/react
// Convex stores conversation state
```

##### File Storage (For Thumbnails, Media)

**Convex:**
- Upload via generated URLs (arbitrarily large files)
- HTTP action uploads limited to 20MB
- 2-minute timeout for uploads
- **Free tier:** 1 GiB storage, 1 GiB bandwidth
- **Pro tier:** 100 GiB storage, 50 GiB bandwidth

**Supabase:**
- Robust storage solution
- Good for large files
- S3-compatible

Both adequate for our needs (thumbnail storage, etc.)

##### Authentication

**Supabase:**
- ✅ Built-in auth (currently using)
- User management included
- OAuth providers supported

**Convex:**
- "Bring Your Own Auth" approach
- Recommended: **Clerk** or **Auth0** for SSO/MFA
- Native Convex Auth available for basic needs
- More setup required but more flexible

**Migration consideration:** Would need to migrate auth or integrate Clerk/Auth0.

##### Pricing Comparison

| Plan | Supabase | Convex |
|------|----------|--------|
| **Free** | 500MB DB, 1GB storage, 2 projects | 0.5GB DB, 1GB storage, 20 projects, 1M function calls/mo |
| **Starter/Pro** | $25/mo (8GB DB, 100GB storage) | Pay-as-you-go ($2.20/1M calls) or $25/member/mo (Pro) |
| **Scale** | Custom | Pro: 25M calls, 50GB DB, 100GB storage |

**At scale (estimated 10K users):**
- Supabase: ~$100-300/mo depending on DB size
- Convex: ~$100-500/mo depending on function calls

Pricing is roughly comparable; Convex charges per function call while Supabase charges by resource.

##### Migration Complexity

**Challenges:**
1. **Data migration:** Export from PostgreSQL, transform to Convex documents
2. **Schema refactoring:** SQL → TypeScript schema definitions
3. **Backend logic:** Rewrite queries as TypeScript functions
4. **Authentication:** Migrate to Clerk/Auth0 or Convex Auth
5. **Real-time subscriptions:** Simpler in Convex (automatic)

**Estimated effort:** 1-2 weeks for full migration (depending on data complexity)

**Risk:** Convex is proprietary - harder to migrate away later. However, for a startup optimizing for speed and AI capabilities, this tradeoff may be acceptable.

##### Local Development

**Supabase:**
- ✅ Full local development with Docker
- Can run entire stack locally

**Convex:**
- ❌ No local testing capabilities
- Must use hosted development environment
- May impact certain workflows

---

#### Decision Matrix for Our Use Case

| Our Requirement | Better Choice | Weight |
|-----------------|---------------|--------|
| AI-powered chat | **Convex** (built-in RAG) | 🔴 High |
| Real-time messaging | **Convex** (native) | 🔴 High |
| TypeScript DX | **Convex** | 🟠 Medium |
| Quick iteration | **Convex** (no migrations) | 🟠 Medium |
| Existing integration | **Supabase** | 🟡 Low (early stage) |
| Vendor independence | **Supabase** | 🟡 Low (startup phase) |
| Local development | **Supabase** | 🟡 Low |

**Weighted recommendation: Convex** for AI-first chat application at early stage.

---

#### Action Items for Migration

```
[x] Research Convex AI/RAG capabilities ✅
[x] Evaluate real-time performance comparison ✅
[x] Compare pricing models ✅
[x] Assess TypeScript integration ✅
[x] Review Vercel AI SDK integration ✅
[x] Evaluate file storage capabilities ✅
[x] DECISION: Approve Convex migration ✅ APPROVED
[x] DECISION: Use Clerk for auth ✅ APPROVED
[x] Verify Clerk + Flowglad compatibility ✅ COMPATIBLE
[ ] 🔲 Create Convex migration plan
[ ] 🔲 Set up Convex project
[ ] 🔲 Set up Clerk project
[ ] 🔲 Plan data migration from Supabase
```

---

### ✅ RESEARCH COMPLETE: Flowglad + Clerk Compatibility

> **Research Date:** January 13, 2026
> **Status:** 🟢 Fully Compatible

#### Flowglad Overview

Flowglad is an **open-source payments and billing platform** designed for developers.

**Key Features:**
| Feature | Description |
|---------|-------------|
| **Pricing Models** | Flexible pricing with customer segmentation |
| **Subscription Management** | Trial periods, billing cycles, multiple items |
| **Usage-Based Billing** | Meters for variable costs (bandwidth, API calls) |
| **Full-Stack SDKs** | React hooks + backend helpers |
| **Open Source** | Self-hostable, transparent |

**Pricing:**
| Type | Cost |
|------|------|
| Transaction fee | 2.9% + $0.30 per card payment |
| Billing fee | Free up to $1K/mo, then 0.65% |
| One-time payments | 0.7% billing fee |

#### Clerk + Flowglad Integration

**✅ FULLY COMPATIBLE - Native Integration**

Flowglad's Core Platform **uses Clerk as its primary authentication provider**:

```typescript
// Flowglad uses @clerk/nextjs for auth
// Environment variables: NEXT_PUBLIC_CLERK_*
// Clerk middleware protects routes automatically
```

**How it works:**
1. Clerk manages all user authentication
2. Clerk middleware protects application routes
3. Flowglad leverages Clerk's session management
4. User IDs flow seamlessly between auth and payments
5. Database session variables maintain context (`app.user_id`, `app.organization_id`)

**Supported Auth Providers in Flowglad:**
- ✅ **Clerk** (recommended, native)
- ✅ Supabase
- ✅ Unkey

#### Why This Stack Works Well

```
┌─────────────────────────────────────────┐
│                  vid0                    │
├─────────────────────────────────────────┤
│                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  Convex  │←→│  Clerk   │←→│Flowglad│ │
│  │ Database │  │   Auth   │  │Payments│ │
│  │ + AI/RAG │  │          │  │        │ │
│  └──────────┘  └──────────┘  └────────┘ │
│       ↑              ↑             ↑     │
│       └──────────────┴─────────────┘     │
│              TypeScript-first            │
│              Seamless integration        │
│                                          │
└─────────────────────────────────────────┘
```

**Benefits of Convex + Clerk + Flowglad:**
- All three are TypeScript-first
- Clerk is the recommended auth for both Convex and Flowglad
- No auth state syncing needed between services
- Modern, developer-friendly APIs
- All support React/Next.js natively

---

### Other Tool Evaluations

#### State Management

**Current:** Zustand
**Verdict:** ✅ Keep - Works well with streaming responses and is lightweight

#### Animation Library

**Current:** Motion (Framer Motion successor)
**Verdict:** ✅ Keep - Excellent for chat UI animations

#### Form Handling

**Current:** React Hook Form + Zod
**Verdict:** ✅ Keep - Industry standard, no change needed

---

## External Services Research

### ✅ RESEARCH COMPLETE: YouTube API Integration

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete - Implementation Ready

---

#### Executive Summary

We need **TWO** YouTube APIs for full functionality:

| API | Purpose | Auth Required | Our Use Cases |
|-----|---------|---------------|---------------|
| **YouTube Data API v3** | Video metadata, public data | API Key only | Competitor analysis, video info |
| **YouTube Analytics API** | Creator's channel metrics | OAuth 2.0 | Personal analytics, recommendations |

---

#### YouTube Analytics API vs Data API

##### YouTube Data API v3

**What it provides:**
- Video metadata (title, description, tags, thumbnails)
- Public statistics (view count, like count, comment count)
- Channel information (subscriber count, video count)
- Playlist management
- Comment retrieval

**What it CANNOT provide:**
- Detailed watch time metrics
- Audience retention curves
- CTR (Click-Through Rate)
- Revenue/monetization data
- Demographic breakdowns

**Authentication:** API Key (for public data) or OAuth 2.0 (for private data)

##### YouTube Analytics API

**What it provides:**
- ✅ Views, likes, dislikes, comments, shares
- ✅ **Watch time and average view duration**
- ✅ **Audience retention curves** (100 data points per video)
- ✅ **CTR (Click-Through Rate)** - critical for title/thumbnail optimization
- ✅ Subscribers gained/lost
- ✅ Revenue and ad performance (for monetized channels)
- ✅ Traffic sources
- ✅ Device and platform breakdown
- ✅ Geographic distribution
- ✅ Demographics (age, gender)

**Authentication:** OAuth 2.0 REQUIRED (access to creator's private data)

**This is what powers YouTube Studio Analytics.**

---

#### API Quota System

##### Default Quotas (FREE)

| Resource | Daily Limit | Notes |
|----------|-------------|-------|
| YouTube Data API v3 | **10,000 units/day** | Per project, resets at midnight Pacific |
| YouTube Analytics API | **200 requests/day** | Can request increase |

##### Quota Costs (Data API v3)

| Operation | Cost | Example |
|-----------|------|---------|
| `videos.list` | 1 unit | Get video details |
| `channels.list` | 1 unit | Get channel info |
| `search.list` | 100 units | ⚠️ Expensive! |
| `videos.insert` | 1,600 units | Upload video |
| `videos.update` | 50 units | Update metadata |

**Key insight:** Search is expensive (100 units). For competitor analysis, better to use video IDs directly.

##### Quota Math for Our Use Case

```
Scenario: 100 active users/day, each analyzes 5 videos

Data API usage:
- 100 users × 5 videos × 1 unit = 500 units/day ✅ (well under 10K)

Analytics API usage:
- 100 users × 10 queries × 1 request = 1,000 requests/day ❌ (exceeds 200)
- Need to request quota increase for Analytics API
```

**Quota increase:** Available via application to Google. Requires compliance audit.

---

#### OAuth 2.0 Implementation

##### Required Setup

1. **Google Cloud Console:**
   - Create project
   - Enable YouTube Data API v3
   - Enable YouTube Analytics API
   - Configure OAuth consent screen

2. **OAuth Scopes Needed:**

| Scope | Access |
|-------|--------|
| `youtube.readonly` | Read channel data |
| `yt-analytics.readonly` | Read analytics data |
| `yt-analytics-monetary.readonly` | Revenue data (optional) |

3. **OAuth Flow:**
   - User clicks "Connect YouTube"
   - Redirect to Google OAuth
   - User grants permissions
   - Receive authorization code
   - Exchange for access + refresh tokens
   - Store tokens securely (encrypted)

##### Token Management

- **Access tokens:** Expire in 1 hour
- **Refresh tokens:** Long-lived, use to get new access tokens
- **Storage:** Encrypt and store in database
- **Refresh:** Automatically refresh before expiration

---

#### Metrics Available for Our Use Cases

##### For Script Optimization

| Metric | API | Use |
|--------|-----|-----|
| Audience retention curve | Analytics | Identify where viewers drop off |
| Average view duration | Analytics | Measure engagement |
| Top performing videos | Analytics | Learn what works |

##### For Title Optimization

| Metric | API | Use |
|--------|-----|-----|
| **CTR (Click-Through Rate)** | Analytics | Direct measure of title/thumbnail effectiveness |
| Impressions | Analytics | Reach measurement |
| Views from search | Analytics | SEO effectiveness |

**CTR Benchmarks:**
- New channels (0-1K subs): 10-20%
- Small channels (1K-100K): 4-8%
- Established (100K+): 2-5%

##### For Thumbnail Analysis

| Metric | API | Use |
|--------|-----|-----|
| CTR per video | Analytics | A/B test thumbnails |
| Impressions | Analytics | Exposure measurement |
| Traffic sources | Analytics | Where clicks come from |

##### For Competitor Analysis (Public Data Only)

| Metric | API | Use |
|--------|-----|-----|
| View count | Data | Popularity |
| Like/comment ratio | Data | Engagement signal |
| Upload frequency | Data | Content strategy |
| Title patterns | Data | SEO analysis |
| Thumbnail URLs | Data | Visual analysis |
| Transcripts | youtube-transcript | Content analysis |

---

#### Third-Party API Alternatives

##### VidIQ / TubeBuddy

**Status:** ❌ No public APIs available

Both VidIQ and TubeBuddy are YouTube partners but do not expose APIs for third-party developers. They use YouTube's API internally.

**Implication:** We must build our own analytics integration using YouTube's official APIs.

##### Alternative Data Sources

| Source | Data Available | Effort |
|--------|----------------|--------|
| YouTube Official APIs | Most comprehensive | Medium |
| Social Blade API | Historical stats, rankings | Low (paid) |
| youtube-transcript | Video transcripts | Low (free) |
| Our own AI analysis | Title/thumbnail scoring | Medium |

---

#### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                          vid0                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  Competitor     │    │  Creator's Own  │                │
│  │  Analysis       │    │  Channel        │                │
│  │  (Public Data)  │    │  (Private Data) │                │
│  └────────┬────────┘    └────────┬────────┘                │
│           │                      │                          │
│           ▼                      ▼                          │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ YouTube Data    │    │ YouTube         │                │
│  │ API v3          │    │ Analytics API   │                │
│  │ (API Key)       │    │ (OAuth 2.0)     │                │
│  └─────────────────┘    └─────────────────┘                │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      ▼                                      │
│           ┌─────────────────┐                              │
│           │ Unified Data    │                              │
│           │ Layer           │                              │
│           └────────┬────────┘                              │
│                    ▼                                        │
│           ┌─────────────────┐                              │
│           │ AI Context      │                              │
│           │ (Chat)          │                              │
│           └─────────────────┘                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

#### MVP vs Full Implementation

##### Phase 1: MVP (Competitor Analysis Only)

- YouTube Data API v3 with API key
- `youtube-transcript` for transcripts
- Public video metadata
- NO OAuth required
- **Quota:** 10,000 units/day (sufficient)

##### Phase 2: Creator Analytics Integration

- YouTube Analytics API with OAuth 2.0
- Full CTR, retention, watch time data
- Personalized recommendations
- **Requires:** OAuth implementation, quota increase request

---

#### Action Items

```
[x] Research YouTube Data API v3 ✅
[x] Research YouTube Analytics API ✅
[x] Understand quota system ✅
[x] Map metrics to use cases ✅
[x] Evaluate third-party alternatives ✅
[ ] 🔲 DECISION: MVP with Data API only, or full OAuth from start?
[ ] 🔲 Set up Google Cloud project
[ ] 🔲 Implement OAuth flow (if decided)
[ ] 🔲 Create YouTube service layer
[ ] 🔲 Apply for Analytics API quota increase
```

---

### AI Services for Video Analysis

#### Thumbnail Analysis

**Recommended Approach:** Use existing AI vision models

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Claude Vision** | Already integrated, excellent reasoning | Cost per analysis | ✅ Primary |
| **GPT-4V** | Good vision, familiar | Cost, another provider | Fallback |
| **Custom ML** | Lower cost at scale | Development time | Future |

**Analysis prompt strategy:**
```
Analyze this YouTube thumbnail for:
1. Visual clarity and contrast
2. Emotional appeal (faces, expressions)
3. Text readability (if any)
4. Curiosity/click-worthiness
5. Consistency with title
Compare to high-CTR thumbnails in similar niches.
```

#### Title/Description Optimization

**Recommended Approach:** AI-powered analysis with data backing

1. **Analyze top performers** in niche via YouTube Data API
2. **Extract patterns** using AI (Claude)
3. **Generate alternatives** with reasoning
4. **Score against CTR benchmarks** from Analytics API

---

### Transcript & Content Services

**Status:** ✅ Research Complete (see `youtube-transcript-evaluation.md`)

**Recommendation:**
- Primary: `youtube-transcript` npm package (FREE)
- Fallback: OpenAI Whisper API ($0.006/min)

**Additional capabilities to build:**
- [ ] Long transcript summarization (use Claude)
- [ ] Key moments extraction
- [ ] Script structure analysis
- [ ] Content gap identification

---

## Architecture Patterns Research

### ✅ RESEARCH COMPLETE: Chat Architecture Patterns

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete - Ready for AGENTS.md

---

#### Current Architecture Analysis

**Hook Composition Pattern:**
Our chat system uses a well-structured hook composition pattern:

```
Chat.tsx (Orchestrator)
├── useChatCore          → Core chat state & AI SDK integration
├── useChatOperations    → Rate limiting, chat creation, deletion
├── useFileUpload        → File handling & attachments
├── useModel             → Model selection & persistence
└── useChatDraft         → Draft message persistence
```

**Strengths Identified:**
- ✅ Clean separation of concerns
- ✅ Each hook has a single responsibility
- ✅ Proper memoization with `useMemo` and `useCallback`
- ✅ Optimistic updates for responsive UX
- ✅ Props consolidation for child components

**Multi-Chat Pattern (for model comparison):**
- Uses fixed array of `MAX_MODELS = 10` hooks
- Pattern works but has ESLint warnings about hook rules
- Consider: Dynamic hook creation via factory pattern (future)

#### Recommended Chat Patterns for AGENTS.md

| Pattern | Location | Use Case |
|---------|----------|----------|
| **Hook Composition** | `use-chat-core.ts` | Complex state with multiple concerns |
| **Optimistic Updates** | `chats/provider.tsx` | Immediate UI feedback |
| **Props Memoization** | `chat.tsx` | Prevent unnecessary re-renders |
| **Dynamic Imports** | `chat.tsx` | Code splitting for dialogs |

---

### ✅ RESEARCH COMPLETE: Data Flow Patterns

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete - Ready for AGENTS.md

---

#### Server vs Client Component Boundaries

| Component Type | Location | Use When |
|----------------|----------|----------|
| **Server Components** | `page.tsx` files | Initial data fetch, SEO, static content |
| **Client Components** | `"use client"` files | Interactivity, hooks, browser APIs |
| **Hybrid** | Dynamic imports | Lazy-load client features |

**Our Current Pattern:**
```
page.tsx (Server) → layout-app.tsx (Client) → chat.tsx (Client)
```

This is correct - pages are server components, interactive UI is client.

#### API Route vs Server Action Decision Matrix

| Use Case | Recommendation | Reason |
|----------|----------------|--------|
| **Streaming responses** | API Route | Server Actions don't support streaming |
| **File uploads** | API Route | Better control over multipart handling |
| **Form submissions** | Server Action | Progressive enhancement, simpler |
| **Auth operations** | Server Action | `redirect()` works, simpler security |
| **CRUD operations** | Either | Server Actions preferred for forms |
| **Third-party webhooks** | API Route | Need specific HTTP method handling |

**Current Implementation:**
- ✅ Chat streaming: API Route (`/api/chat/route.ts`)
- ✅ Auth: Server Action (`/app/auth/login/actions.ts`)
- ✅ Chat management: API Routes (CRUD operations)

#### Optimistic Updates Pattern

**Implemented in `chats/provider.tsx`:**
```typescript
// Pattern: Update UI immediately, rollback on error
const updateTitle = async (id: string, title: string) => {
  let previousState: Chats[] | null = null
  setChats((prev) => {
    previousState = prev  // Store for rollback
    return prev.map((c) => c.id === id ? { ...c, title } : c)
  })
  try {
    await updateChatTitle(id, title)
  } catch {
    if (previousState) setChats(previousState)  // Rollback
    toast({ title: "Failed to update title", status: "error" })
  }
}
```

**Key Elements:**
1. Store previous state before mutation
2. Update UI immediately (optimistic)
3. Call API
4. Rollback to previous state on error
5. Show user feedback

---

### ✅ RESEARCH COMPLETE: AI Context Management

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete - Ready for AGENTS.md

---

#### Context Management Strategy

Based on `AI_CONTEXT_SETUP_GUIDE.md` and Anthropic best practices:

**1. Context Compaction (For Long Conversations)**

When approaching token limits, summarize older messages:
```typescript
// Recommended implementation (after Convex migration)
const compactContext = async (messages: Message[]) => {
  if (estimateTokens(messages) > CONTEXT_THRESHOLD) {
    const older = messages.slice(0, -10)  // Keep last 10 recent
    const summary = await summarize(older)
    return [{ role: 'system', content: summary }, ...messages.slice(-10)]
  }
  return messages
}
```

**2. Structured Note-Taking (NOTES.md Pattern)**

For persistent memory across sessions, Convex's RAG will handle this:
- Store important facts in vector database
- Retrieve relevant context per conversation
- Namespace by user for isolation

**3. Sub-Agent Architecture (See Below)**

---

### ✅ RESEARCH COMPLETE: Sub-Agent Architecture

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete - Ready for Implementation

---

#### Why Sub-Agents?

From Anthropic's context engineering research:
- **Prevents context pollution** - Each agent has isolated context
- **Specialized expertise** - Agents tuned for specific tasks
- **Better results** - Focused prompts outperform generic ones
- **Token efficiency** - Only relevant context per agent

#### Proposed Sub-Agent Architecture for vid0

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN ORCHESTRATOR                         │
│            (Primary Chat Agent - Claude Opus 4.5)           │
│                                                              │
│  Responsibilities:                                           │
│  - User conversation management                              │
│  - Task routing to sub-agents                                │
│  - Response synthesis                                        │
│  - Context compaction                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  TRANSCRIPT   │ │   TITLE/SEO   │ │  THUMBNAIL    │ │  ANALYTICS    │
│   ANALYZER    │ │   OPTIMIZER   │ │   ADVISOR     │ │  INTERPRETER  │
│               │ │               │ │               │ │               │
│ Model: Haiku  │ │ Model: Sonnet │ │ Model: Vision │ │ Model: Sonnet │
│               │ │               │ │               │ │               │
│ Tasks:        │ │ Tasks:        │ │ Tasks:        │ │ Tasks:        │
│ - Summarize   │ │ - Generate    │ │ - Analyze     │ │ - Interpret   │
│ - Extract     │ │   titles      │ │   images      │ │   metrics     │
│   key points  │ │ - SEO tags    │ │ - Suggest     │ │ - Identify    │
│ - Identify    │ │ - A/B tests   │ │   improvements│ │   trends      │
│   hooks       │ │ - Keywords    │ │ - Color/text  │ │ - Benchmarks  │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
```

#### Sub-Agent Specifications

| Agent | Model | System Prompt Focus | Input | Output |
|-------|-------|---------------------|-------|--------|
| **Transcript Analyzer** | Claude Haiku 4.5 | YouTube content analysis, hooks, retention | Video transcript | Summary, key points, hook recommendations |
| **Title/SEO Optimizer** | Claude Sonnet 4.5 | YouTube SEO, click psychology, A/B testing | Topic, keywords, niche | Title variants, tags, descriptions |
| **Thumbnail Advisor** | Claude Sonnet 4.5 + Vision | Visual design, CTR optimization, YouTube trends | Thumbnail image | Analysis, improvement suggestions |
| **Analytics Interpreter** | Claude Sonnet 4.5 | YouTube metrics, benchmarks, growth strategy | Analytics data | Insights, actionable recommendations |

#### Implementation Approach

**Phase 1 (MVP):** Single agent with specialized prompts
- Switch system prompt based on task type
- Simpler to implement, test, iterate

**Phase 2 (Post-MVP):** True sub-agent architecture
- Separate API calls per agent
- Parallel processing where possible
- Convex Actions for orchestration

#### Sub-Agent Communication Pattern

```typescript
// Orchestrator pattern (future implementation)
async function handleUserRequest(request: UserRequest) {
  // 1. Classify request type
  const taskType = await classifyTask(request)
  
  // 2. Route to appropriate sub-agent
  switch (taskType) {
    case 'transcript_analysis':
      return await transcriptAgent.analyze(request.transcript)
    case 'title_generation':
      return await titleAgent.generate(request.topic)
    case 'thumbnail_review':
      return await thumbnailAgent.analyze(request.imageUrl)
    case 'analytics_insight':
      return await analyticsAgent.interpret(request.metrics)
    default:
      return await mainAgent.converse(request)
  }
}
```

---

### ✅ RESEARCH COMPLETE: AI Workflow Patterns

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete - Ready for AGENTS.md

---

#### Four-Phase Coding Cycle (Anthropic Recommended)

Based on `AI_CONTEXT_SETUP_GUIDE.md`:

```
┌─────────────────────────────────────────────────────────────┐
│                    AI DEVELOPMENT WORKFLOW                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: RESEARCH          Phase 2: PLAN                   │
│  ────────────────           ─────────────                   │
│  • Read relevant files      • Create implementation plan    │
│  • Understand context       • Identify edge cases           │
│  • DO NOT write code yet    • Get user approval             │
│  • Use sub-agents to        • Use extended thinking         │
│    investigate                ("ultrathink")               │
│                                                              │
│          ↓                           ↓                       │
│                                                              │
│  Phase 3: CODE & VERIFY     Phase 4: COMMIT                 │
│  ──────────────────────     ───────────────                 │
│  • Implement step by step   • Clear commit messages         │
│  • Run tests after each     • Create PR for review          │
│    change                   • Update documentation          │
│  • Iterate until checks     • Archive learnings             │
│    pass                                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Cursor + Claude Code Workflow

| Tool | When to Use | Best For |
|------|-------------|----------|
| **Cursor (Opus 4.5)** | Active development | Code editing, quick iterations, inline changes |
| **Claude Code** | Complex tasks | Multi-file refactors, agentic workflows, CI fixes |

**Recommended Workflow:**
1. **Cursor** for day-to-day coding, quick edits
2. **Claude Code** for:
   - Large refactoring tasks
   - Complex debugging sessions
   - Tasks requiring many file changes
   - Running tests and fixing failures

#### AI Tool Permissions (For AGENTS.md)

```yaml
# Cursor/Claude Code can do freely:
- Read any file in the project
- Run: tsc --noEmit, eslint, prettier
- Run: npm run dev, npm run build
- Run: vitest (tests)
- Search codebase
- Create files in app/, lib/, components/

# Must ask before:
- npm install (any package)
- Modify package.json
- Git operations (commit, push)
- Modify auth/*, middleware.*
- Modify .env* files
- Delete files/directories
- Modify CI/CD configuration

# Forbidden:
- Reading/writing .env* files
- Force push to any branch
- Modifying production configs
- Storing secrets in code
```

---

## Security & Boundaries Research

### ✅ DEFINED: Security-Sensitive Areas

> **Status:** 🟢 Defined - Ready for AGENTS.md

---

#### Security Classification

| Area | Risk Level | Protection Required |
|------|------------|---------------------|
| YouTube OAuth tokens | 🔴 Critical | Encrypted storage, never log |
| User API keys (BYOK) | 🔴 Critical | Encrypted at rest, never expose |
| Environment variables | 🔴 Critical | Never commit, never log |
| User analytics data | 🟠 High | Access controls, audit logging |
| Database credentials | 🔴 Critical | Environment only, rotate regularly |
| Session tokens | 🟠 High | HttpOnly cookies, secure flag |
| Payment data (future) | 🔴 Critical | PCI compliance, use Stripe |

---

#### Files/Directories AI Should NEVER Modify

```
🚫 FORBIDDEN (AI must NEVER touch without explicit permission):

Environment & Secrets:
├── .env
├── .env.*
├── .env.local
└── any file containing API keys or secrets

Authentication:
├── lib/auth/           # Core auth logic
├── app/auth/           # Auth routes and callbacks
├── middleware.ts       # Auth middleware
└── utils/supabase/middleware.ts

Database Schema:
├── supabase/migrations/  # Database migrations
└── Any SQL schema files

CI/CD & Deployment:
├── .github/workflows/
├── vercel.json
├── Dockerfile
└── docker-compose*.yml

Configuration:
├── next.config.*
├── package.json        # Only with permission
└── tsconfig.json       # Only with permission
```

---

#### AI Permission Boundaries (For AGENTS.md)

##### ✅ AI CAN do freely:

| Action | Scope | Notes |
|--------|-------|-------|
| Read files | All source code | Understanding context |
| Run `tsc --noEmit` | Any file | Type checking |
| Run `eslint` | Any file | Linting |
| Run `npm run dev` | Project | Development server |
| Run tests | Test files | Vitest, Playwright |
| Format code | Source files | Prettier |
| Search codebase | All files | Grep, semantic search |
| Create new files | `app/`, `lib/`, `components/` | New features |
| Edit existing features | Non-auth, non-config | Bug fixes, features |

##### ⚠️ AI MUST ASK before:

| Action | Why | Risk |
|--------|-----|------|
| `npm install` | Adds dependencies | Supply chain, bloat |
| Modify `package.json` | Core config | Breaking changes |
| Any git operations | Version control | History pollution |
| Modify auth logic | Security | Vulnerabilities |
| Modify middleware | Request handling | Security, performance |
| Change database schema | Data integrity | Migration issues |
| Delete files/directories | Irreversible | Data loss |
| Modify CI/CD | Deployment | Breaking builds |
| Add environment variables | Secrets | Exposure risk |

##### 🚫 AI is FORBIDDEN from:

| Action | Why |
|--------|-----|
| Reading/writing `.env*` files | Contains secrets |
| Committing without review | Quality control |
| Force pushing | History destruction |
| Modifying production configs | Service disruption |
| Accessing user data directly | Privacy |
| Storing secrets in code | Security violation |

---

#### Security Best Practices for AI Development

##### Prompt Injection Prevention

```typescript
// NEVER interpolate user input directly into prompts
// BAD:
const prompt = `Analyze this video: ${userInput}`;

// GOOD:
const prompt = `Analyze the video with ID: ${sanitizedVideoId}`;
```

##### Token Storage

```typescript
// YouTube OAuth tokens must be encrypted
// Use database encryption for tokens at rest
// Implement token refresh before expiration
// Never log tokens, even in errors
```

##### API Key Handling (BYOK)

```typescript
// User-provided API keys:
// 1. Encrypt before storage
// 2. Decrypt only when needed
// 3. Never include in logs or error messages
// 4. Validate format before use
// 5. Allow users to delete at any time
```

---

#### Action Items

```
[x] Define security-sensitive areas ✅
[x] Define AI permission boundaries ✅
[x] Create forbidden files list ✅
[ ] 🔲 Implement token encryption for YouTube OAuth
[ ] 🔲 Audit BYOK key handling
[ ] 🔲 Set up audit logging for sensitive operations
[ ] 🔲 Add security headers (CSP, etc.)
```

---

## Quality Gates Research

### ✅ RESEARCH COMPLETE: Testing Strategy for AI Applications

> **Research Date:** January 13, 2026
> **Status:** 🟢 Research Complete
> **Decision:** Test critical paths only (per user preference)

---

#### Testing Strategy for AI/LLM Chat Applications

##### Key Challenges in Testing AI Apps

1. **Non-deterministic outputs** - Same input can produce different outputs
2. **Streaming responses** - Harder to test than request/response
3. **Context sensitivity** - Behavior depends on conversation history
4. **External API dependencies** - LLM providers, YouTube API, etc.

##### Recommended Approach: Critical Paths Only

Based on research and user preference for "test critical paths only":

| Testing Type | When | Priority | What to Test |
|--------------|------|----------|--------------|
| **Type checking (tsc)** | ✅ Now | 🔴 Critical | All code |
| **Linting (ESLint)** | ✅ Now | 🔴 Critical | All code |
| **Unit tests (Vitest)** | Now (critical only) | 🟠 High | Auth, data transforms, utils |
| **Integration tests** | After API stable | 🟡 Medium | YouTube API, database |
| **E2E tests (Playwright)** | Before launch | 🟠 High | Core user flows |

---

##### Best Practices for AI/LLM Testing

**1. Mock LLM Interactions in Unit Tests**
```typescript
// Don't call real LLMs in unit tests
// Mock the response to test your handling logic
const mockLLMResponse = { content: "mocked response" };
```

**2. Test Prompt Templates Separately**
- Validate prompts produce expected structure
- Test variable interpolation
- Mock responses to test downstream handling

**3. Integration Tests with Real API Calls**
- Use sparingly (cost + time)
- Test the full pipeline works
- Run in CI with budget controls

**4. Monitor These Metrics in Production**
- P95 latency (target: < 3 seconds for first token)
- Error rates
- Token usage
- User satisfaction signals

---

##### What to Test (Critical Paths)

**🔴 Must Test:**
| Path | Test Type | Why Critical |
|------|-----------|--------------|
| Authentication flow | E2E | Security, user access |
| OAuth token handling | Unit | YouTube API access |
| Message persistence | Integration | Data integrity |
| Rate limiting | Unit | Abuse prevention |
| Transcript extraction | Unit | Core feature |
| Error handling | Unit | User experience |

**🟡 Can Skip Initially:**
- Individual UI component rendering
- Animation timing
- Non-critical utility functions
- AI response quality (monitor in production)

---

##### Testing Tools Recommendation

| Tool | Purpose | Status |
|------|---------|--------|
| **Vitest** | Unit tests | 📝 To implement |
| **Playwright** | E2E tests | 📝 To implement |
| **TypeScript (tsc)** | Type checking | ✅ In place |
| **ESLint** | Linting | ✅ In place |

**Skip for now:**
- Snapshot testing for AI responses (too brittle)
- Visual regression testing (premature)

---

##### Proposed Test Structure

```
tests/
├── unit/
│   ├── lib/
│   │   ├── youtube/
│   │   │   └── transcript-service.test.ts  # Critical
│   │   └── rate-limit.test.ts              # Critical
│   └── utils/
│       └── url-detector.test.ts            # Critical
├── integration/
│   └── youtube-api.test.ts                 # After MVP
└── e2e/
    ├── auth.spec.ts                        # Critical
    └── chat-flow.spec.ts                   # Before launch
```

---

### CI/CD Pipeline

**Current:** GitHub Actions (basic)
**Status:** Adequate for now

##### Minimum CI Checks (Implement Now)

```yaml
# .github/workflows/ci.yml
- Type check: `tsc --noEmit`
- Lint: `eslint .`
- Build: `next build`
```

##### Add Later (Before Launch)

```yaml
- Unit tests: `vitest run`
- E2E tests: `playwright test`
- Preview deployments (Vercel automatic)
```

---

#### Action Items

```
[x] Research AI/LLM testing strategies ✅
[x] Define "critical paths only" approach ✅
[ ] 🔲 Set up Vitest configuration
[ ] 🔲 Write unit tests for transcript service
[ ] 🔲 Write unit tests for rate limiting
[ ] 🔲 Set up Playwright (before launch)
```

---

## AI Workflow Research

### Current AI Tools in Use

| Tool | Use Case | Notes |
|------|----------|-------|
| Cursor | Primary IDE | Opus 4.5 |
| Claude Code | Agentic coding | Learning |
| Cubic (planned) | Code review | To evaluate |
| Task Rabbit (planned) | Task management | To evaluate |

### 🔵 RESEARCH NEEDED: AI Development Workflow

Based on `AI_CONTEXT_SETUP_GUIDE.md`, the recommended workflow is:

```
Phase 1: Research → Phase 2: Plan → Phase 3: Code → Phase 4: Commit
```

#### Questions

```
[ ] How to structure tasks for optimal AI assistance?
[ ] What information should be in each context file?
[ ] How to leverage Claude Code alongside Cursor?
[ ] What's the optimal prompt structure for this project?
```

### 🔵 RESEARCH NEEDED: AI Code Review Tools

#### Cubic
```
[ ] Evaluate Cubic for automated code review
[ ] Compare with GitHub Copilot code review
[ ] Assess integration with our workflow
```

#### Task Rabbit (AI Task Management)
```
[ ] Research Task Rabbit capabilities
[ ] Evaluate integration with project management
[ ] Compare with alternative AI task tools
```

---

## Gold Standard Examples

### Purpose
Identify and document exemplary implementations in the codebase that serve as patterns for AI and developers to follow.

### Current Status: ✅ Complete

> **Research Date:** January 13, 2026
> **Status:** 🟢 Identified - Ready for AGENTS.md

---

### Identified Gold Standard Examples

| Pattern | Example File | Why It's Exemplary |
|---------|--------------|-------------------|
| **API Route** | `app/api/chat/route.ts` | ✅ Streaming, validation, error handling, auth |
| **React Component** | `app/components/chat/chat.tsx` | ✅ Hook composition, memoization, clean structure |
| **Server Action** | `app/auth/login/actions.ts` | ✅ "use server", guard clauses, redirects |
| **Custom Hook** | `app/components/chat/use-chat-core.ts` | ✅ TypeScript, useCallback, error handling |
| **Context Provider** | `lib/chat-store/chats/provider.tsx` | ✅ Optimistic updates, rollback, clean API |
| **Error Handling** | `app/api/chat/utils.ts` | ✅ Structured errors, user-friendly messages |
| **Multi-Provider** | `lib/openproviders/index.ts` | ✅ TypeScript generics, factory pattern |
| **Configuration** | `lib/config.ts` | ✅ Centralized constants, type-safe |

---

### Pattern Details for AGENTS.md

#### 1. API Route Pattern (`app/api/chat/route.ts`)

**Key Elements:**
```typescript
// ✅ Type-safe request parsing
type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  // ... typed fields
}

// ✅ Request validation
if (!messages || !chatId || !userId) {
  return new Response(JSON.stringify({ error: "..." }), { status: 400 })
}

// ✅ Streaming with proper error handling
const result = streamText({
  model: modelConfig.apiSdk(apiKey, { enableSearch }),
  system: effectiveSystemPrompt,
  messages,
  onFinish: async ({ response }) => { /* persist */ },
})

return result.toDataStreamResponse({
  sendReasoning: true,
  getErrorMessage: (error) => extractErrorMessage(error),
})
```

#### 2. Custom Hook Pattern (`use-chat-core.ts`)

**Key Elements:**
```typescript
// ✅ Clear type definitions for props
type UseChatCoreProps = {
  initialMessages: Message[]
  // ... all props typed
}

// ✅ Memoized callbacks
const submit = useCallback(async () => {
  // Implementation
}, [/* explicit dependencies */])

// ✅ Clean return object
return {
  // Chat state
  messages, input, status,
  // Actions
  submit, handleReload, handleInputChange,
}
```

#### 3. Context Provider Pattern (`chats/provider.tsx`)

**Key Elements:**
```typescript
// ✅ Typed context
interface ChatsContextType {
  chats: Chats[]
  createNewChat: (...) => Promise<Chats | undefined>
  // ... full API surface
}

// ✅ Optimistic update with rollback
const updateTitle = async (id: string, title: string) => {
  let previousState: Chats[] | null = null
  setChats((prev) => {
    previousState = prev  // Store for rollback
    return /* updated state */
  })
  try {
    await updateChatTitle(id, title)
  } catch {
    if (previousState) setChats(previousState)  // Rollback
    toast({ title: "Failed", status: "error" })
  }
}
```

#### 4. Error Handling Pattern (`utils.ts`)

**Key Elements:**
```typescript
// ✅ Structured error type
export type ApiError = Error & {
  statusCode: number
  code: string
}

// ✅ User-friendly message extraction
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Pattern matching for specific errors
    if (error.message.includes("invalid x-api-key")) {
      return "Invalid API key..."
    }
    return error.message
  }
  return "An error occurred. Please try again."
}

// ✅ Proper HTTP response creation
export function createErrorResponse(error: {...}): Response {
  return new Response(
    JSON.stringify({ error: error.message, code: error.code }),
    { status: error.statusCode || 500 }
  )
}
```

#### 5. Component Pattern (`chat.tsx`)

**Key Elements:**
```typescript
// ✅ Dynamic imports for code splitting
const DialogAuth = dynamic(
  () => import("./dialog-auth").then((mod) => mod.DialogAuth),
  { ssr: false }
)

// ✅ Props memoization to prevent re-renders
const conversationProps = useMemo(() => ({
  messages, status, onDelete: handleDelete, // ...
}), [messages, status, handleDelete])

// ✅ Guard clause for redirects
if (chatId && !isChatsLoading && !currentChat) {
  return redirect("/")
}
```

---

### Template Guidelines for AI

When creating new files, follow these templates:

**New API Route:**
```
1. Export POST/GET with proper typing
2. Validate request body
3. Handle authentication/authorization
4. Return proper status codes
5. Use createErrorResponse for errors
```

**New Custom Hook:**
```
1. Define clear Props type
2. Use useCallback for functions returned
3. Use useMemo for computed values
4. Explicit dependency arrays
5. Return typed object with state + actions
```

**New Context Provider:**
```
1. Define Context type interface
2. Use useState for local state
3. Implement optimistic updates with rollback
4. Expose clean API via context value
5. Throw error if used outside provider
```

---

## Open Questions

### Product Questions

| Question | Priority | Status |
|----------|----------|--------|
| What's the MVP feature set? | 🔴 High | ❓ Open |
| How will monetization work? | 🟠 Medium | ✅ Flowglad |
| What's the launch timeline? | 🟠 Medium | ❓ Open |
| Multi-language support priority? | 🟢 Low | ❓ Open |

### Technical Questions (Updated)

| Question | Priority | Status | Notes |
|----------|----------|--------|-------|
| Convex vs Supabase? | 🔴 High | ✅ **DECIDED** | **Convex approved** |
| YouTube API approach? | 🔴 High | ✅ **DECIDED** | **Data API first** |
| Auth provider? | 🔴 High | ✅ **DECIDED** | **Clerk** (Flowglad compatible) |
| Payments provider? | 🟠 Medium | ✅ **DECIDED** | **Flowglad** |
| Testing strategy? | 🟠 Medium | ✅ **DECIDED** | **Critical paths only** |
| Specialized AI sub-agents? | 🟠 Medium | ✅ **RESEARCHED** | Architecture defined (see Sub-Agent section) |
| Context management approach? | 🟠 Medium | ✅ **RESEARCHED** | Compaction + Convex RAG (see Context Management) |
| Chat architecture patterns? | 🟠 Medium | ✅ **RESEARCHED** | Hook composition pattern documented |
| Data flow patterns? | 🟠 Medium | ✅ **RESEARCHED** | Server/Client boundaries documented |
| Gold standard examples? | 🟢 Low | ✅ **IDENTIFIED** | 8 patterns documented |

### Workflow Questions

| Question | Priority | Status | Notes |
|----------|----------|--------|-------|
| Cursor vs Claude Code workflow? | 🟠 Medium | ✅ **DOCUMENTED** | Cursor for daily, Claude Code for complex |
| Code review automation? | 🟢 Low | 📝 Deferred | Cubic evaluation after MVP |
| Documentation maintenance? | 🟢 Low | ✅ **DEFINED** | AGENTS.md + CLAUDE.md pattern |

### ✅ All Research Complete - Ready to Create AGENTS.md!

The core tech stack is now finalized:

```
✅ Backend: Convex (approved)
✅ Auth: Clerk (approved, Flowglad compatible)
✅ Payments: Flowglad (approved)
✅ YouTube: Data API first (approved)
✅ Testing: Critical paths only (approved)
```

---

## Research Findings

> **Last Updated:** January 13, 2026

### Completed Research

| Topic | Date | Summary | Decision Needed | Link |
|-------|------|---------|-----------------|------|
| YouTube Transcripts | Jan 2026 | Use youtube-transcript + Whisper fallback | ✅ Decided | [Link](./youtube-transcript-evaluation.md) |
| Implementation Plan | Jan 2026 | Phased approach over 2 weeks | ✅ Approved | [Link](./installation-implementation-plan.md) |
| AI Context Setup | Jan 2026 | AGENTS.md + CLAUDE.md standards | ✅ Following | [Link](../AI_CONTEXT_SETUP_GUIDE.md) |
| **Convex vs Supabase** | Jan 13, 2026 | Convex recommended for AI-first chat | ✅ **DECIDED** | This doc |
| **YouTube Data API** | Jan 13, 2026 | Two APIs needed (Data + Analytics) | ✅ **DECIDED** | This doc |
| **Security Boundaries** | Jan 13, 2026 | AI permissions defined | ✅ Ready for AGENTS.md | This doc |
| **Testing Strategy** | Jan 13, 2026 | Critical paths only | ✅ Decided | This doc |
| **Sub-Agent Architecture** | Jan 13, 2026 | 4-agent architecture defined | ✅ Ready for AGENTS.md | This doc |
| **AI Workflow Patterns** | Jan 13, 2026 | Four-phase cycle, tool permissions | ✅ Ready for AGENTS.md | This doc |
| **Chat Architecture** | Jan 13, 2026 | Hook composition pattern | ✅ Ready for AGENTS.md | This doc |
| **Data Flow Patterns** | Jan 13, 2026 | Server/Client boundaries | ✅ Ready for AGENTS.md | This doc |
| **Gold Standard Examples** | Jan 13, 2026 | 8 exemplary patterns identified | ✅ Ready for AGENTS.md | This doc |

### Key Decisions Made ✅

| Decision | Options | Final Decision | Status |
|----------|---------|----------------|--------|
| **Convex Migration** | Stay Supabase vs Migrate to Convex | **✅ Migrate to Convex** | ✅ **APPROVED** |
| **YouTube MVP Scope** | Data API only vs Full OAuth | **✅ Data API first** | ✅ **APPROVED** |
| **Auth Provider** | Clerk vs Auth0 vs Convex Auth | **✅ Clerk** (Flowglad compatible) | ✅ **APPROVED** |
| **Payments Provider** | Stripe vs Flowglad | **✅ Flowglad** (open-source, Clerk native) | ✅ **APPROVED** |

### Remaining Items (Deferred to Post-MVP)

| Topic | Priority | Status | Notes |
|-------|----------|--------|-------|
| AI Code Review Tools | 🟢 Low | 📝 Deferred | Cubic, Copilot review after MVP |
| Fine-tuning Options | 🟢 Low | 📝 Deferred | YouTube-specific models after scale |
| Multi-language Support | 🟢 Low | 📝 Deferred | Internationalization post-launch |

---

## AGENTS.md Outline

Based on research, the AGENTS.md file should include:

### Proposed Structure

```markdown
# vid0

## Project Overview
- Purpose and vision
- Target users
- Core value proposition

## Tech Stack
- Framework and libraries
- AI providers
- Database and state management

## Project Architecture
- Directory structure
- Key modules and their purposes
- Data flow patterns

## Code Conventions
- File naming
- Component patterns
- TypeScript patterns
- Import organization

## Commands
- Development
- Testing
- Building
- Deployment

## Agent Permissions
- What AI can do freely
- What requires permission
- What is forbidden

## Key File Locations
- Entry points
- Configuration
- Core components
- Utilities

## Common Patterns
- Links to gold standard examples
- Pattern explanations

## Constraints
- Performance requirements
- Security requirements
- Accessibility requirements

## Getting Started
- Environment setup
- Required API keys
- First steps
```

---

## Next Steps

### ✅ All Major Decisions Made!

**Finalized Tech Stack:**
- **Backend:** Convex
- **Auth:** Clerk
- **Payments:** Flowglad
- **YouTube:** Data API first
- **Testing:** Critical paths only

---

### Immediate Next Steps

1. **📝 Draft AGENTS.md** with finalized tech stack
2. **📝 Create CLAUDE.md** with Claude-specific context
3. **🔧 Set up Convex project** and begin migration planning
4. **🔧 Set up Clerk project** and configure auth

### Migration Planning

1. [ ] Create detailed Convex migration plan
2. [ ] Inventory Supabase tables and data
3. [ ] Map Supabase schema to Convex documents
4. [ ] Plan auth migration (Supabase Auth → Clerk)
5. [ ] Set up development environment

### Short-term (This Week)

1. [ ] Finalize AGENTS.md
2. [ ] Create CLAUDE.md
3. [ ] Set up .cursor/rules/ directory
4. [ ] Set up Convex + Clerk + Flowglad accounts
5. [ ] Begin migration implementation

### Medium-term (Next 2 Weeks)

1. [ ] Complete Supabase → Convex migration
2. [ ] Implement YouTube Data API integration
3. [ ] Implement chat with YouTube context
4. [ ] Add transcript analysis features
5. [ ] Set up Flowglad for subscriptions

---

## Changelog

| Date | Changes |
|------|---------|
| 2026-01-13 | Initial research document created |
| 2026-01-13 | ✅ Completed Convex vs Supabase deep dive |
| 2026-01-13 | ✅ Completed YouTube Data API analysis |
| 2026-01-13 | ✅ Defined security boundaries and AI permissions |
| 2026-01-13 | ✅ Finalized testing strategy (critical paths only) |
| 2026-01-13 | ✅ **DECISION: Convex migration approved** |
| 2026-01-13 | ✅ **DECISION: YouTube Data API first approved** |
| 2026-01-13 | ✅ **DECISION: Clerk for auth approved** |
| 2026-01-13 | ✅ Researched Flowglad + Clerk compatibility (fully compatible) |
| 2026-01-13 | ✅ **DECISION: Flowglad for payments approved** |
| 2026-01-13 | ✅ Completed Sub-Agent Architecture research (4-agent design) |
| 2026-01-13 | ✅ Completed AI Workflow Patterns research (four-phase cycle) |
| 2026-01-13 | ✅ Completed Chat Architecture Patterns research (hook composition) |
| 2026-01-13 | ✅ Completed Data Flow Patterns research (Server/Client boundaries) |
| 2026-01-13 | ✅ Identified 8 Gold Standard Examples from codebase |
| 2026-01-13 | 🎉 **ALL RESEARCH COMPLETE - Ready to create AGENTS.md**

---

## Summary of Research Session

### Final Tech Stack Decisions ✅

| Layer | Technology | Status |
|-------|------------|--------|
| **Framework** | Next.js 16 (App Router) | ✅ Keep |
| **Backend/Database** | **Convex** | ✅ **Migrate from Supabase** |
| **Authentication** | **Clerk** | ✅ **Migrate from Supabase Auth** |
| **Payments** | **Flowglad** | ✅ **New** |
| **State Management** | Zustand + TanStack Query | ✅ Keep |
| **AI SDK** | Vercel AI SDK | ✅ Keep |
| **YouTube** | Data API v3 (MVP) | ✅ Approved |
| **Transcripts** | youtube-transcript + Whisper | ✅ Approved |

### Why This Stack Works

```
┌────────────────────────────────────────────────────┐
│                  vid0 STACK                          │
├────────────────────────────────────────────────────┤
│                                                     │
│  Next.js 16 + React 19 + TypeScript                │
│         ↓                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │                  CONVEX                      │   │
│  │  • Reactive database                         │   │
│  │  • Built-in AI/RAG & vector search          │   │
│  │  • Real-time sync                           │   │
│  │  • TypeScript-first                         │   │
│  └─────────────────────────────────────────────┘   │
│         ↓              ↓              ↓             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐     │
│  │  CLERK   │  │   FLOWGLAD   │  │ YOUTUBE  │     │
│  │   Auth   │←→│   Payments   │  │   API    │     │
│  │          │  │ (Clerk-native)│  │          │     │
│  └──────────┘  └──────────────┘  └──────────┘     │
│                                                     │
│  All TypeScript-first, seamless integration        │
│                                                     │
└────────────────────────────────────────────────────┘
```

### Key Benefits of Decisions

1. **Convex** - Built-in AI/RAG capabilities critical for YouTube video analysis
2. **Clerk** - Works natively with both Convex and Flowglad
3. **Flowglad** - Open-source, developer-friendly, uses Clerk by default
4. **YouTube Data API first** - Faster MVP, add Analytics later

### All Research Complete ✅

| Research Area | Status | Key Findings |
|---------------|--------|--------------|
| **Tech Stack** | ✅ Complete | Convex + Clerk + Flowglad approved |
| **YouTube APIs** | ✅ Complete | Data API first, Analytics later |
| **Security Boundaries** | ✅ Complete | AI permissions defined |
| **Testing Strategy** | ✅ Complete | Critical paths only |
| **Sub-Agent Architecture** | ✅ Complete | 4-agent design (Transcript, Title, Thumbnail, Analytics) |
| **AI Workflow Patterns** | ✅ Complete | Four-phase cycle documented |
| **Chat Architecture** | ✅ Complete | Hook composition pattern |
| **Data Flow Patterns** | ✅ Complete | Server/Client boundaries |
| **Gold Standard Examples** | ✅ Complete | 8 exemplary patterns identified |

### Ready for AGENTS.md

All research is now complete. The AGENTS.md file should include:

**From This Research:**
1. ✅ Project Overview & Vision
2. ✅ Tech Stack (Convex + Clerk + Flowglad)
3. ✅ Code Conventions & Patterns (Gold Standard Examples)
4. ✅ AI Agent Permissions (Security Boundaries)
5. ✅ Architecture Patterns (Chat, Data Flow, Sub-Agents)
6. ✅ Testing Strategy (Critical paths only)
7. ✅ Commands & Development Workflow

**Next Steps:**
1. 🔲 Create `AGENTS.md` from this research
2. 🔲 Create `CLAUDE.md` with Claude-specific context
3. 🔲 Set up `.cursor/rules/` directory
4. 🔲 Begin Convex migration

---

*🎉 Research phase 100% complete. All decisions made. Ready to create AGENTS.md!*
