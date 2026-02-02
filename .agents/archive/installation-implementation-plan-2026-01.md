# vid0 - Installation & Implementation Plan

> **Purpose:** Prioritized roadmap to complete all remaining installation and implementation tasks
>
> **Created:** January 11, 2026
>
> **Status:** 🟡 In Progress

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Open Questions & Decisions](#open-questions--decisions)
3. [Phase 1: Immediate Actions](#phase-1-immediate-actions-day-1) - Git cleanup, critical fixes
4. [Phase 2: Core Features](#phase-2-core-features-days-2-3) - YouTube, rate limiting, LLM observability
5. [Phase 3: UI Enhancements](#phase-3-ui-enhancements-day-4) - Components, virtualization
6. [Phase 4: Testing & Polish](#phase-4-testing--polish-days-5-7) - Vitest, Playwright, error monitoring, analytics
7. [Phase 5: Advanced Features](#phase-5-advanced-features-week-2) - MCP, Tiptap, dnd-kit
8. [Quick Reference Commands](#quick-reference-commands)
9. [Master Checklist](#master-checklist)
10. [Resources](#resources)

---

## Executive Summary

### Current Status

| Category | Complete | Remaining |
|----------|----------|-----------|
| Core Chat Functionality | ✅ 100% | - |
| Authentication & Auth | ✅ 100% | - |
| UI Components | 70% | 58 components |
| YouTube Integration | 0% | Full implementation |
| LLM Observability | 0% | Langfuse or Helicone |
| Rate Limiting | 0% | Upstash setup |
| Error Monitoring | 0% | Sentry or Highlight |
| Analytics | 0% | OpenPanel or PostHog |
| Chat Virtualization | 0% | TanStack Virtual |
| Testing | 0% | Vitest + Playwright |
| Code TODOs | - | 10 items |
| MCP Support | 50% | Completion needed |

### Estimated Timeline

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | Day 1 | Git cleanup, critical fixes |
| Phase 2 | Days 2-3 | YouTube transcripts, rate limiting, LLM observability |
| Phase 3 | Day 4 | UI components, chat virtualization |
| Phase 4 | Days 5-7 | Testing, error monitoring, analytics |
| Phase 5 | Week 2+ | MCP, rich text editor, advanced features |

---

## Open Questions & Decisions

> ⚠️ **Action Required:** These questions need answers before or during implementation.

### 🎬 YouTube Transcript Integration

| Question | Options | Recommendation | Decision |
|----------|---------|----------------|----------|
| **How should users provide YouTube URLs?** | A) Paste in chat (auto-detect) <br> B) Dedicated input field <br> C) As a tool the AI can use | **Option A** - Auto-detect YouTube URLs in chat messages for seamless UX | ⬜ Pending |
| **Should transcripts be cached globally or per-user?** | A) Global (YouTube is public) <br> B) Per-user | **Option A** - Global cache reduces API calls, videos are public anyway | ⬜ Pending |
| **Cache expiration policy?** | A) Never expire <br> B) 7 days <br> C) 30 days | **Option C** - 30 days, captions rarely change | ⬜ Pending |
| **How to handle videos without captions?** | A) Error message only <br> B) Offer Whisper transcription <br> C) Skip silently | **Option B** - Offer Whisper as paid/premium feature | ⬜ Pending |
| **Should we fetch video metadata (title, channel)?** | A) Yes <br> B) No | **Option A** - Useful context for the AI | ⬜ Pending |

### 🔧 Technical Decisions

| Question | Options | Recommendation | Decision |
|----------|---------|----------------|----------|
| **Rate limiting for YouTube transcript API?** | A) No limit <br> B) 10/min per user <br> C) 100/day per user | **Option B** - Prevent abuse while allowing normal use | ⬜ Pending |
| **Where to store transcripts?** | A) Supabase only <br> B) IndexedDB + Supabase <br> C) Supabase + Redis | **Option B** - Local cache for speed, Supabase for persistence | ⬜ Pending |
| **Multi-language support priority?** | A) English only first <br> B) All languages from start | **Option A** - MVP with English, expand later | ⬜ Pending |

### 🎨 UX Decisions

| Question | Options | Recommendation | Decision |
|----------|---------|----------------|----------|
| **Show transcript in UI before sending to AI?** | A) Yes, preview panel <br> B) No, just process it | **Option A** - Users should see/edit what AI receives | ⬜ Pending |
| **Max transcript length for context?** | A) Full transcript <br> B) First 10K chars <br> C) Smart chunking | **Option C** - Chunk by topic/timestamp for relevance | ⬜ Pending |

### 🔧 Third-Party Tool Decisions

| Question | Options | Recommendation | Decision |
|----------|---------|----------------|----------|
| **LLM Observability tool?** | A) Langfuse (comprehensive tracing) <br> B) Helicone (proxy-based, caching) | **Helicone** for quick wins + cost savings; **Langfuse** for deep debugging | ⬜ Pending |
| **Rate limiting approach?** | A) Upstash Redis <br> B) Custom implementation <br> C) Vercel built-in | **Option A** - Upstash is serverless, works at edge, multiple algorithms | ⬜ Pending |
| **Error monitoring platform?** | A) Sentry (industry standard) <br> B) Highlight.io (open-source) | **Sentry** for extensive integrations; **Highlight** for open-source preference | ⬜ Pending |
| **Analytics platform?** | A) OpenPanel (lightweight, privacy) <br> B) PostHog (all-in-one) <br> C) None for now | **Option A** for pure analytics; **Option B** if feature flags needed | ⬜ Pending |
| **Chat virtualization needed?** | A) Yes - TanStack Virtual <br> B) No - not enough messages | **Option A** - Future-proof for power users with long histories | ⬜ Pending |
| **Rich text editor for chat input?** | A) Tiptap (modular) <br> B) Keep current textarea <br> C) Slate | **Option B** for MVP, **Option A** for v2 with mentions/formatting | ⬜ Pending |
| **Drag and drop for files/chats?** | A) dnd-kit <br> B) Not needed | **Option B** for MVP, **Option A** if reordering features planned | ⬜ Pending |

### 📝 Clarifications Needed

1. **Multi-chat hook "TODOs"** - After reviewing the code, these are **intentional workarounds** for React hooks rules (hooks can't be called conditionally). The current implementation with `MAX_MODELS = 10` fixed hooks is a valid pattern. Should we:
   - [ ] Keep as-is with eslint-disable comments
   - [ ] Refactor to a different pattern (more complex)
   - [ ] Document the pattern choice

2. **Messages provider null chatId** - The current behavior returns early when `chatId` is null. This means new chats can't save messages until they have an ID. Should we:
   - [ ] Create chat ID eagerly on first message
   - [ ] Queue messages and save when ID is available
   - [ ] Keep current behavior (seems to work)

---

## Phase 1: Immediate Actions (Day 1)

### 1.1 Git Cleanup ⏱️ 15 minutes

**Priority:** 🔴 Critical

```bash
# Check current status
git status

# Stage the evaluation document
git add docs/youtube-transcript-evaluation.md

# Review changes to layout
git diff app/layout.tsx

# Commit all pending changes
git add -A
git commit -m "docs: add YouTube transcript evaluation, update layout"
```

### 1.2 Review Multi-Chat Hook Pattern ⏱️ 30 minutes

**Priority:** 🟡 Medium (Not a bug - needs decision)

**File:** `app/components/multi-chat/use-multi-chat.ts`

**Current State:** The three `// todo: fix this` comments are about React hooks rules violations. The code uses a valid workaround pattern:

```typescript
// Creates MAX_MODELS (10) hooks upfront to avoid conditional hook calls
const chatHooks = Array.from({ length: MAX_MODELS }, (_, index) =>
  useChat({ ... }) // eslint-disable-next-line react-hooks/rules-of-hooks
)
```

**Options:**
1. ✅ **Keep as-is** - Pattern works, just needs documentation
2. 🔄 **Refactor** - Use a different state management approach (more complex)
3. 📝 **Document** - Add explanatory comments for future developers

**Recommended Action:** Add a comment block explaining the pattern choice, remove misleading "todo: fix this" comments:

```typescript
/**
 * Multi-chat hook pattern explanation:
 * React hooks cannot be called conditionally, but we need a dynamic number of chats.
 * Solution: Pre-create MAX_MODELS (10) useChat hooks and only use the ones we need.
 * The eslint-disable is intentional - this is a known workaround pattern.
 */
```

### 1.3 Review Chat Store Null Case ⏱️ 30 minutes

**Priority:** 🟡 Medium (May already work correctly)

**File:** `lib/chat-store/messages/provider.tsx:96`

**Current State:** The TODO is about handling new chats before a `chatId` exists.

**Analysis:** Looking at the code, this is partially handled:
- Lines 41-46: When `chatId` is null, messages are reset and loading stops
- Line 97: `saveAllMessages` returns early if no chatId

**Question:** Is this the desired behavior? When a user starts a new chat:
1. Does the chat get created with an ID before the first message?
2. Or do we need to queue messages until the chat is created?

**Action:** Test the new chat flow to verify current behavior:
```bash
# Manual test: Start a new chat, send a message, check if it saves correctly
```

If working correctly, update the TODO to a documentation comment explaining the flow.

### 1.4 Reorganize User API File ⏱️ 15 minutes

**Priority:** 🟡 Medium

**Current:** `lib/user-store/api.ts`
**Target:** `lib/user/api.ts`

```bash
# Move file to correct location
mv lib/user-store/api.ts lib/user/api.ts

# Update imports throughout codebase
```

---

## Phase 2: Core Features (Days 2-3)

### 2.1 YouTube Transcript Service ⏱️ 2-3 hours

**Priority:** 🔴 Critical (Core feature for vid0)

#### Step 1: Install dependency

```bash
npm install youtube-transcript
```

#### Step 2: Create transcript service

**File:** `lib/youtube/transcript-service.ts`

```typescript
import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptResult {
  success: boolean;
  videoId: string;
  transcript?: TranscriptSegment[];
  fullText?: string;
  wordCount?: number;
  duration?: number;
  source: 'youtube' | 'whisper' | 'error';
  error?: string;
}

export async function getYouTubeTranscript(
  videoUrl: string
): Promise<TranscriptResult> {
  const videoId = extractVideoId(videoUrl);
  
  if (!videoId) {
    return {
      success: false,
      videoId: '',
      source: 'error',
      error: 'Invalid YouTube URL',
    };
  }

  try {
    const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId);
    
    const transcript: TranscriptSegment[] = rawTranscript.map(item => ({
      text: item.text,
      start: item.offset / 1000,
      duration: item.duration / 1000,
    }));

    const fullText = transcript.map(t => t.text).join(' ');
    const lastSegment = transcript[transcript.length - 1];
    
    return {
      success: true,
      videoId,
      transcript,
      fullText,
      wordCount: fullText.split(/\s+/).length,
      duration: lastSegment ? lastSegment.start + lastSegment.duration : 0,
      source: 'youtube',
    };
  } catch (error) {
    return {
      success: false,
      videoId,
      source: 'error',
      error: 'No transcript available. Video may not have captions.',
    };
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
```

#### Step 3: Create API route

**File:** `app/api/youtube/transcript/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getYouTubeTranscript } from '@/lib/youtube/transcript-service';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json(
        { error: 'YouTube URL is required' },
        { status: 400 }
      );
    }

    const result = await getYouTubeTranscript(url);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, videoId: result.videoId },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Transcript API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript' },
      { status: 500 }
    );
  }
}
```

#### Step 4: Create React hook

**File:** `hooks/use-youtube-transcript.ts`

```typescript
import { useState } from 'react';
import { TranscriptResult } from '@/lib/youtube/transcript-service';

export function useYouTubeTranscript() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);

  const fetchTranscript = async (url: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setTranscript(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setTranscript(null);
    setError(null);
  };

  return { fetchTranscript, transcript, loading, error, reset };
}
```

### 2.2 Database: Transcript Cache Table ⏱️ 30 minutes

**Priority:** 🟠 High

Run in Supabase SQL editor:

```sql
-- Video transcripts cache table
CREATE TABLE video_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT UNIQUE NOT NULL,
  video_url TEXT,
  title TEXT,
  transcript JSONB NOT NULL,
  full_text TEXT,
  word_count INTEGER,
  duration_seconds FLOAT,
  language TEXT DEFAULT 'en',
  source TEXT CHECK (source IN ('youtube', 'whisper', 'manual')) DEFAULT 'youtube',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_video_transcripts_video_id ON video_transcripts(video_id);

-- RLS policies
ALTER TABLE video_transcripts ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (transcripts are public data)
CREATE POLICY "Anyone can read transcripts" 
  ON video_transcripts FOR SELECT 
  USING (true);

-- Only authenticated users can insert
CREATE POLICY "Authenticated users can insert transcripts" 
  ON video_transcripts FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_video_transcripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_video_transcripts_timestamp
BEFORE UPDATE ON video_transcripts
FOR EACH ROW
EXECUTE PROCEDURE update_video_transcripts_updated_at();
```

### 2.3 Update Types for Transcript ⏱️ 15 minutes

**Priority:** 🟠 High

**File:** `app/types/database.types.ts`

Add the transcript table types to match your Supabase schema.

### 2.4 YouTube URL Detection in Chat ⏱️ 1-2 hours

**Priority:** 🟠 High

Create a utility to detect and process YouTube URLs in chat messages.

**File:** `lib/youtube/url-detector.ts`

```typescript
const YOUTUBE_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/g,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
];

export function extractYouTubeUrls(text: string): string[] {
  const urls: string[] = [];
  for (const pattern of YOUTUBE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      urls.push(`https://youtube.com/watch?v=${match[1]}`);
    }
  }
  return [...new Set(urls)]; // Remove duplicates
}

export function hasYouTubeUrl(text: string): boolean {
  return extractYouTubeUrls(text).length > 0;
}
```

### 2.5 Integrate Transcripts with Chat Flow ⏱️ 2-3 hours

**Priority:** 🟠 High

Decide how transcripts integrate with the chat experience:

**Option A: Pre-process URLs before sending to AI**
```typescript
// In chat-input or use-chat-core
const processMessage = async (content: string) => {
  const youtubeUrls = extractYouTubeUrls(content);
  
  if (youtubeUrls.length > 0) {
    const transcripts = await Promise.all(
      youtubeUrls.map(url => fetchTranscript(url))
    );
    
    // Append transcript context to the message
    const context = transcripts
      .filter(t => t.success)
      .map(t => `[YouTube Transcript: ${t.videoId}]\n${t.fullText}`)
      .join('\n\n');
    
    return `${content}\n\n---\nContext:\n${context}`;
  }
  
  return content;
};
```

**Option B: Use as an AI tool (function calling)**
```typescript
// Add to your tools configuration
const youtubeTranscriptTool = {
  name: 'get_youtube_transcript',
  description: 'Fetch the transcript/captions from a YouTube video',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'YouTube video URL' }
    },
    required: ['url']
  }
};
```

### 2.6 Rate Limiting with Upstash ⏱️ 1-2 hours

**Priority:** 🔴 Critical (Protects API costs and prevents abuse)

#### Step 1: Install Upstash packages

```bash
npm install @upstash/ratelimit @upstash/redis
```

#### Step 2: Create Upstash Redis database

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database (choose region closest to Vercel deployment)
3. Copy the REST URL and token

#### Step 3: Add environment variables

**File:** `.env.local`

```bash
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

#### Step 4: Create rate limiter utility

**File:** `lib/rate-limit.ts`

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Rate limiter for AI chat endpoints (more restrictive)
export const aiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 requests per minute
  analytics: true,
  prefix: 'ratelimit:ai',
});

// Rate limiter for YouTube transcript API
export const youtubeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
  analytics: true,
  prefix: 'ratelimit:youtube',
});

// Rate limiter for general API (less restrictive)
export const generalRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true,
  prefix: 'ratelimit:general',
});

// Helper to get client identifier
export function getClientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'anonymous';
  return ip;
}
```

#### Step 5: Apply to API routes

**Example:** `app/api/chat/route.ts`

```typescript
import { aiRateLimit, getClientId } from '@/lib/rate-limit';

export async function POST(req: Request) {
  // Rate limiting
  const clientId = getClientId(req);
  const { success, limit, remaining, reset } = await aiRateLimit.limit(clientId);
  
  if (!success) {
    return new Response(
      JSON.stringify({ 
        error: 'Rate limit exceeded. Please wait before sending more messages.',
        retryAfter: Math.ceil((reset - Date.now()) / 1000)
      }),
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        }
      }
    );
  }

  // Continue with normal request handling...
}
```

#### Step 6: Apply to YouTube transcript route

Update `app/api/youtube/transcript/route.ts` to use `youtubeRateLimit`.

### 2.7 LLM Observability Setup ⏱️ 1-2 hours

**Priority:** 🔴 Critical (Monitor costs, debug issues, improve prompts)

Choose **ONE** option based on your preference:

#### Option A: Helicone (Proxy-based, simpler setup)

**Pros:** One-line integration, built-in caching (20-30% cost reduction), minimal latency

```bash
npm install @helicone/helicone
```

**Update AI provider configuration:**

```typescript
// lib/openproviders/index.ts or wherever you configure AI
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://oai.helicone.ai/v1',
  defaultHeaders: {
    'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
    'Helicone-Cache-Enabled': 'true', // Enable semantic caching
  },
});
```

**Environment variables:**
```bash
HELICONE_API_KEY=your_helicone_api_key
```

#### Option B: Langfuse (SDK-based, more comprehensive)

**Pros:** Detailed tracing, prompt management, evaluation tools

```bash
npm install langfuse
```

**Create Langfuse utility:**

**File:** `lib/langfuse.ts`

```typescript
import { Langfuse } from 'langfuse';

export const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_HOST, // Optional: for self-hosted
});

// Helper to trace a chat completion
export async function traceChat(
  userId: string,
  modelId: string,
  messages: any[],
  response: string,
  metadata?: Record<string, any>
) {
  const trace = langfuse.trace({
    name: 'chat-completion',
    userId,
    metadata: { modelId, ...metadata },
  });

  trace.generation({
    name: 'llm-call',
    model: modelId,
    input: messages,
    output: response,
  });

  await langfuse.flushAsync();
}
```

**Environment variables:**
```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com  # or your self-hosted URL
```

### 2.8 Phase 2 Verification Checklist

Before moving to Phase 3, verify:

**YouTube Transcripts:**
- [ ] `npm install youtube-transcript` completed successfully
- [ ] `/api/youtube/transcript` returns correct data for a test video
- [ ] Hook correctly manages loading/error states
- [ ] Database table created in Supabase
- [ ] RLS policies working (test with authenticated user)
- [ ] Types updated and no TypeScript errors
- [ ] URL detection works for all YouTube URL formats

**Rate Limiting:**
- [ ] Upstash Redis database created
- [ ] `@upstash/ratelimit` and `@upstash/redis` installed
- [ ] Environment variables configured
- [ ] Rate limiting applied to `/api/chat` route
- [ ] Rate limiting applied to `/api/youtube/transcript` route
- [ ] 429 responses working correctly when limit exceeded

**LLM Observability:**
- [ ] Helicone OR Langfuse account created
- [ ] API keys added to environment variables
- [ ] Integration tested - requests appear in dashboard
- [ ] (If Helicone) Caching enabled and working
- [ ] (If Langfuse) Traces appearing in Langfuse dashboard

**Test Commands:**
```bash
# Quick API test for YouTube
curl -X POST http://localhost:3000/api/youtube/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Rate limit test (run multiple times quickly)
for i in {1..25}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/youtube/transcript \
    -H "Content-Type: application/json" \
    -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
done
```

---

## Phase 3: UI Enhancements (Day 4)

### 3.1 Install High-Priority Prompt-Kit Components ⏱️ 30 minutes

**Priority:** 🟠 High

These are essential for AI chat applications:

```bash
# AI reasoning and thinking display
npx shadcn@latest add "https://prompt-kit.com/c/reasoning.json"
npx shadcn@latest add "https://prompt-kit.com/c/chain-of-thought.json"
npx shadcn@latest add "https://prompt-kit.com/c/thinking-bar.json"

# Tool and source display
npx shadcn@latest add "https://prompt-kit.com/c/tool.json"
npx shadcn@latest add "https://prompt-kit.com/c/source.json"

# User feedback
npx shadcn@latest add "https://prompt-kit.com/c/feedback-bar.json"
```

### 3.2 Install Essential shadcn/ui Components ⏱️ 20 minutes

**Priority:** 🟡 Medium

```bash
# Forms and data display
npx shadcn@latest add form table alert collapsible toggle

# Navigation
npx shadcn@latest add breadcrumb pagination
```

### 3.3 Install Motion-Primitives for UX ⏱️ 20 minutes

**Priority:** 🟢 Low

```bash
# Loading and animation effects
npx motion-primitives@latest add text-shimmer animated-number in-view

# Interactive elements
npx motion-primitives@latest add glow-effect spotlight
```

### 3.4 Chat Virtualization with TanStack Virtual ⏱️ 2-3 hours

**Priority:** 🟡 Medium (Important for power users with long chat histories)

#### Step 1: Install TanStack Virtual

```bash
npm install @tanstack/react-virtual
```

#### Step 2: Create virtualized message list component

**File:** `app/components/chat/virtualized-message-list.tsx`

```typescript
'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message } from '@/lib/chat-store/types';

interface VirtualizedMessageListProps {
  messages: Message[];
  renderMessage: (message: Message, index: number) => React.ReactNode;
  estimatedMessageHeight?: number;
}

export function VirtualizedMessageList({
  messages,
  renderMessage,
  estimatedMessageHeight = 150,
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedMessageHeight,
    overscan: 5, // Render 5 extra items above/below viewport
    getItemKey: (index) => messages[index].id,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderMessage(messages[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### Step 3: Integration strategy

The virtualized list should be used when message count exceeds a threshold:

```typescript
// In your chat component
const VIRTUALIZATION_THRESHOLD = 50; // Virtualize after 50 messages

{messages.length > VIRTUALIZATION_THRESHOLD ? (
  <VirtualizedMessageList
    messages={messages}
    renderMessage={(msg, idx) => <MessageBubble message={msg} />}
  />
) : (
  <div className="flex flex-col gap-4">
    {messages.map((msg, idx) => (
      <MessageBubble key={msg.id} message={msg} />
    ))}
  </div>
)}
```

#### Why TanStack Virtual?

- **Dynamic heights**: Chat messages vary in length; TanStack handles this with `measureElement`
- **Smooth scrolling**: Maintains 60FPS even with thousands of messages
- **Small bundle**: ~10-15KB vs alternatives
- **Ecosystem fit**: Works with React Query you're already using

### 3.5 Fix UI TODOs ⏱️ 1 hour

**Priority:** 🟡 Medium

| File | Line | Issue |
|------|------|-------|
| `app/auth/error/page.tsx` | 65 | Add help link |
| `app/auth/login-page.tsx` | 86 | Complete UI section |
| `components/motion-primitives/toolbar-dynamic.tsx` | 51 | Fix width issue |
| `app/components/history/command-footer.tsx` | 9 | Implement morph effect |

---

## Phase 4: Testing & Polish (Days 5-7)

### 4.1 Set Up Testing Infrastructure ⏱️ 2-3 hours

**Priority:** 🟡 Medium

#### Install testing dependencies

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D @vitejs/plugin-react
```

#### Create Vitest config

**File:** `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

#### Create test setup

**File:** `tests/setup.ts`

```typescript
import '@testing-library/jest-dom';
```

#### Update package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

#### Enable CI tests

**File:** `.github/workflows/ci-cd.yml`

Uncomment the test step (line 36).

### 4.2 Write Initial Tests ⏱️ 2-4 hours

**Priority:** 🟡 Medium

Create tests for critical paths:

```
tests/
├── setup.ts
├── lib/
│   └── youtube/
│       └── transcript-service.test.ts
├── hooks/
│   └── use-youtube-transcript.test.ts
└── components/
    └── chat/
        └── chat.test.tsx
```

### 4.3 Lint and Type Check ⏱️ 30 minutes

**Priority:** 🟠 High

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

### 4.4 Error Monitoring Setup ⏱️ 1-2 hours

**Priority:** 🟡 Medium (Critical for production debugging)

Choose **ONE** option based on your preference:

#### Option A: Sentry (Industry Standard)

**Pros:** Extensive integrations, distributed tracing, session replay, large community

```bash
npx @sentry/wizard@latest -i nextjs
```

This wizard will:
- Install `@sentry/nextjs`
- Create `sentry.client.config.ts` and `sentry.server.config.ts`
- Update `next.config.ts` with Sentry webpack plugin
- Create `.env.sentry-build-plugin`

**Manual configuration (if wizard fails):**

```bash
npm install @sentry/nextjs
```

**File:** `sentry.client.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
  ],
});
```

**Environment variables:**
```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=your_auth_token  # For source maps
```

#### Option B: Highlight.io (Open-Source)

**Pros:** Fully open-source, video session replays, combined frontend+backend, transparent pricing

```bash
npm install @highlight-run/next
```

**File:** `app/layout.tsx` (add to root layout)

```typescript
import { HighlightInit } from '@highlight-run/next/client';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HighlightInit
        projectId={process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID!}
        serviceName="vid0"
        tracingOrigins
        networkRecording={{
          enabled: true,
          recordHeadersAndBody: true,
        }}
      />
      <html>
        <body>{children}</body>
      </html>
    </>
  );
}
```

**Environment variables:**
```bash
NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID=your_project_id
```

### 4.5 Playwright E2E Testing ⏱️ 2-3 hours

**Priority:** 🟡 Medium (Ensures critical paths work end-to-end)

#### Step 1: Install Playwright

```bash
npm init playwright@latest

# Choose options:
# - TypeScript
# - tests folder: e2e/
# - GitHub Actions workflow: Yes
# - Install browsers: Yes
```

#### Step 2: Configure for Next.js

**File:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

#### Step 3: Create initial E2E tests

**File:** `e2e/chat.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Chat functionality', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/vid0/);
  });

  test('should show login page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    // Adjust based on your auth flow
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should send a message in chat', async ({ page }) => {
    // This test requires authentication setup
    // Use page.context().addCookies() or login flow
    await page.goto('/');
    
    const input = page.getByPlaceholder(/message/i);
    await input.fill('Hello, AI!');
    await input.press('Enter');
    
    // Wait for response
    await expect(page.getByText('Hello, AI!')).toBeVisible();
  });
});
```

**File:** `e2e/youtube-transcript.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('YouTube Transcript', () => {
  test('should fetch transcript for valid YouTube URL', async ({ page }) => {
    await page.goto('/');
    
    const input = page.getByPlaceholder(/message/i);
    await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await input.press('Enter');
    
    // Wait for transcript processing
    await expect(page.getByText(/transcript/i)).toBeVisible({ timeout: 10000 });
  });
});
```

#### Step 4: Update package.json

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

### 4.6 Analytics Setup (Optional) ⏱️ 1 hour

**Priority:** 🟢 Low (Nice to have for understanding user behavior)

Choose **ONE** option based on your needs:

#### Option A: OpenPanel (Lightweight, Privacy-Focused)

**Pros:** Ultra-lightweight (~2.3KB), cookie-free, GDPR-friendly, simple self-hosting

```bash
npm install @openpanel/nextjs
```

**File:** `app/layout.tsx`

```typescript
import { OpenPanelComponent } from '@openpanel/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <OpenPanelComponent
          clientId={process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID!}
          trackScreenViews={true}
          trackOutgoingLinks={true}
        />
        {children}
      </body>
    </html>
  );
}
```

**Track custom events:**

```typescript
import { op } from '@openpanel/nextjs';

// Track chat message sent
op.track('chat_message_sent', {
  model: 'gpt-4',
  hasYouTubeUrl: true,
});

// Track transcript fetched
op.track('youtube_transcript_fetched', {
  videoId: 'abc123',
  wordCount: 5000,
});
```

#### Option B: PostHog (All-in-One with Feature Flags)

**Pros:** Analytics + feature flags + session replay + A/B testing, great for AI model rollouts

```bash
npm install posthog-js
```

**File:** `lib/posthog.ts`

```typescript
import posthog from 'posthog-js';

export function initPostHog() {
  if (typeof window !== 'undefined') {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
      capture_pageview: false, // We'll capture manually for SPA
      persistence: 'localStorage',
    });
  }
}

export { posthog };
```

**Feature flags for AI model rollout:**

```typescript
import { posthog } from '@/lib/posthog';

// Check if user should see new AI model
const useNewModel = posthog.isFeatureEnabled('new-ai-model-v2');

// A/B test different prompt strategies
const promptVariant = posthog.getFeatureFlag('prompt-strategy');
```

### 4.7 Phase 4 Verification Checklist

Before moving to Phase 5, verify:

**Unit Testing (Vitest):**
- [ ] Vitest installed and configured
- [ ] Test setup file created
- [ ] At least 5 unit tests passing
- [ ] CI workflow updated to run tests

**E2E Testing (Playwright):**
- [ ] Playwright installed with browsers
- [ ] Config file created
- [ ] Homepage test passing
- [ ] Chat flow test passing
- [ ] YouTube transcript test passing

**Error Monitoring:**
- [ ] Sentry OR Highlight.io configured
- [ ] Test error captured and visible in dashboard
- [ ] Session replay working (if enabled)
- [ ] Source maps uploading correctly

**Analytics (if chosen):**
- [ ] OpenPanel OR PostHog configured
- [ ] Page views being tracked
- [ ] Custom events firing correctly
- [ ] (If PostHog) Feature flags working

**Code Quality:**
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] No console errors in browser

---

## Phase 5: Advanced Features (Week 2+)

### 5.1 Complete MCP Support ⏱️ 4-6 hours

**Priority:** 🟢 Low (marked as "work in progress")

**Files to review:**
- `lib/mcp/load-mcp-from-local.ts`
- `lib/mcp/load-mcp-from-url.ts`

### 5.2 OpenAI Whisper Fallback (Optional) ⏱️ 4-6 hours

**Priority:** 🟢 Low

For videos without captions:

```typescript
// lib/youtube/whisper-fallback.ts
import OpenAI from 'openai';

export async function transcribeWithWhisper(audioUrl: string) {
  const openai = new OpenAI();
  
  // Download audio and send to Whisper API
  const transcription = await openai.audio.transcriptions.create({
    file: /* audio file */,
    model: 'whisper-1',
  });
  
  return transcription.text;
}
```

### 5.3 Install Remaining Components (Optional) ⏱️ 1-2 hours

**Priority:** 🟢 Low

See `install-remaining-components.md` for full list of 58 missing components.

### 5.4 Rich Text Editor with Tiptap (Optional) ⏱️ 3-4 hours

**Priority:** 🟢 Low (Consider for v2 with mentions, formatting, slash commands)

#### When to implement:
- Users need to format messages (bold, italic, code blocks)
- You want @mentions for referencing previous messages or users
- You want slash commands (like `/summarize`, `/translate`)
- You want AI-powered autocomplete suggestions

#### Step 1: Install Tiptap

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
npm install @tiptap/extension-mention @tiptap/extension-link
```

#### Step 2: Create Tiptap-based prompt input

**File:** `components/chat/rich-prompt-input.tsx`

```typescript
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';

interface RichPromptInputProps {
  onSubmit: (content: string) => void;
  placeholder?: string;
}

export function RichPromptInput({ onSubmit, placeholder = 'Type a message...' }: RichPromptInputProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features you don't need
        heading: false,
        bulletList: false,
        orderedList: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          // Configure mention suggestions here
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none min-h-[80px] max-h-[300px] overflow-y-auto p-3',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const content = editor?.getText() || '';
          if (content.trim()) {
            onSubmit(content);
            editor?.commands.clearContent();
          }
          return true;
        }
        return false;
      },
    },
  });

  return (
    <div className="border rounded-lg bg-background">
      <EditorContent editor={editor} />
    </div>
  );
}
```

#### Why Tiptap?

- **Modular**: Only include extensions you need
- **Headless**: Full control over styling
- **Collaborative**: Built-in Yjs support for real-time collaboration
- **Active development**: Regular updates and large community

### 5.5 Drag and Drop with dnd-kit (Optional) ⏱️ 2-3 hours

**Priority:** 🟢 Low (Consider for reordering chats, file management)

#### When to implement:
- Users need to reorder chats in sidebar
- You want drag-to-upload for files
- You want to reorganize conversation history

#### Step 1: Install dnd-kit

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

#### Step 2: Create sortable chat list

**File:** `components/sidebar/sortable-chat-list.tsx`

```typescript
'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Chat {
  id: string;
  title: string;
}

interface SortableChatItemProps {
  chat: Chat;
}

function SortableChatItem({ chat }: SortableChatItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: chat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-2 bg-card rounded-lg cursor-grab active:cursor-grabbing"
    >
      {chat.title}
    </div>
  );
}

interface SortableChatListProps {
  chats: Chat[];
  onReorder: (chats: Chat[]) => void;
}

export function SortableChatList({ chats, onReorder }: SortableChatListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = chats.findIndex((chat) => chat.id === active.id);
      const newIndex = chats.findIndex((chat) => chat.id === over.id);
      onReorder(arrayMove(chats, oldIndex, newIndex));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={chats} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {chats.map((chat) => (
            <SortableChatItem key={chat.id} chat={chat} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

#### Why dnd-kit?

- **Accessible**: Full keyboard support out of the box
- **Performant**: No DOM mutations during drag
- **Modern**: Built for React 18+, works with React 19
- **Lightweight**: Tree-shakeable, only include what you use

### 5.6 Phase 5 Verification Checklist

Before considering Phase 5 complete:

**MCP Support:**
- [ ] Local MCP loading working
- [ ] URL-based MCP loading working
- [ ] Error handling for invalid MCP configs

**Whisper Fallback (if implemented):**
- [ ] Audio extraction from YouTube working
- [ ] Whisper API integration working
- [ ] Graceful fallback when no captions available

**Rich Text Editor (if implemented):**
- [ ] Tiptap editor rendering correctly
- [ ] Submit on Enter working
- [ ] Shift+Enter for new line working
- [ ] (Optional) Mentions working
- [ ] (Optional) Slash commands working

**Drag and Drop (if implemented):**
- [ ] Chat reordering working
- [ ] Keyboard accessibility working
- [ ] Smooth animations during drag

---

## Quick Reference Commands

### Development

```bash
# Start development server
npm run dev

# Type check
npm run type-check

# Lint
npm run lint

# Build for production
npm run build
```

### Testing

```bash
# Unit tests (Vitest)
npm run test
npm run test:ui        # Interactive UI
npm run test:coverage  # Coverage report

# E2E tests (Playwright)
npm run test:e2e
npm run test:e2e:ui    # Interactive UI
npm run test:e2e:debug # Debug mode
```

### Component Installation

```bash
# Backup existing components first
cp -r components/ui components/ui.backup
cp -r components/prompt-kit components/prompt-kit.backup

# Install all high-priority components
npx shadcn@latest add "https://prompt-kit.com/c/reasoning.json"
npx shadcn@latest add "https://prompt-kit.com/c/chain-of-thought.json"
npx shadcn@latest add "https://prompt-kit.com/c/thinking-bar.json"
npx shadcn@latest add "https://prompt-kit.com/c/tool.json"
npx shadcn@latest add "https://prompt-kit.com/c/source.json"
npx shadcn@latest add form table alert collapsible toggle
```

### Third-Party Tools Installation

```bash
# Rate Limiting (Phase 2)
npm install @upstash/ratelimit @upstash/redis

# LLM Observability - choose ONE (Phase 2)
npm install @helicone/helicone    # Helicone
npm install langfuse              # OR Langfuse

# Chat Virtualization (Phase 3)
npm install @tanstack/react-virtual

# Error Monitoring - choose ONE (Phase 4)
npx @sentry/wizard@latest -i nextjs  # Sentry (wizard)
npm install @highlight-run/next      # OR Highlight.io

# Analytics - choose ONE (Phase 4)
npm install @openpanel/nextjs  # OpenPanel
npm install posthog-js         # OR PostHog

# Rich Text Editor (Phase 5, optional)
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder

# Drag and Drop (Phase 5, optional)
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Database

```bash
# Generate types from Supabase (if using CLI)
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > app/types/database.types.ts
```

### Docker

```bash
# Development with Ollama
docker-compose -f docker-compose.ollama.yml up

# Production build
docker build -t vid0 .
docker run -p 3000:3000 vid0
```

---

## Master Checklist

### Pre-Flight Checks
- [ ] Verify `.env.local` has all required variables
- [ ] Confirm Supabase connection works
- [ ] Confirm all database tables exist
- [ ] `npm run dev` starts without errors
- [ ] `npm run type-check` passes

### Decisions Required (See Open Questions section)
- [ ] Decide: YouTube URL handling approach (auto-detect vs dedicated input)
- [ ] Decide: Transcript caching strategy (global vs per-user)
- [ ] Decide: Cache expiration policy
- [ ] Decide: Multi-chat hook pattern (keep vs refactor)
- [ ] Decide: New chat message saving flow
- [ ] Decide: LLM observability tool (Langfuse vs Helicone)
- [ ] Decide: Error monitoring platform (Sentry vs Highlight.io)
- [ ] Decide: Analytics platform (OpenPanel vs PostHog vs none)
- [ ] Decide: Chat virtualization needed? (TanStack Virtual)
- [ ] Decide: Rich text editor needed? (Tiptap)
- [ ] Decide: Drag and drop needed? (dnd-kit)

### Phase 1: Immediate (Day 1)
- [ ] Commit pending git changes
- [ ] Review `use-multi-chat.ts` pattern - add documentation comments
- [ ] Test `messages/provider.tsx` new chat flow - verify behavior
- [ ] Move `user-store/api.ts` to `user/api.ts` (if decided)
- [ ] ✅ Verification: All tests pass, no regressions

### Phase 2: Core Features (Days 2-3)

**YouTube Transcripts:**
- [ ] Install `youtube-transcript` package
- [ ] Create `lib/youtube/transcript-service.ts`
- [ ] Create `lib/youtube/url-detector.ts`
- [ ] Create `/api/youtube/transcript` route
- [ ] Create `use-youtube-transcript` hook
- [ ] Run database migration for `video_transcripts` table
- [ ] Update database types
- [ ] Integrate with chat flow (Option A or B based on decision)

**Rate Limiting (Upstash):**
- [ ] Create Upstash Redis database
- [ ] Install `@upstash/ratelimit` and `@upstash/redis`
- [ ] Add environment variables
- [ ] Create `lib/rate-limit.ts`
- [ ] Apply rate limiting to `/api/chat` route
- [ ] Apply rate limiting to `/api/youtube/transcript` route
- [ ] Test 429 responses when limit exceeded

**LLM Observability:**
- [ ] Choose tool: Langfuse OR Helicone
- [ ] Create account and get API keys
- [ ] Add environment variables
- [ ] Integrate with AI provider configuration
- [ ] Verify requests appear in dashboard
- [ ] (If Helicone) Enable semantic caching

- [ ] ✅ Verification: API returns data, rate limiting works, LLM calls tracked

### Phase 3: UI Enhancements (Day 4)

**Prompt-Kit Components:**
- [ ] Install reasoning, chain-of-thought, thinking-bar
- [ ] Install tool, source, feedback-bar

**shadcn/ui Components:**
- [ ] Install form, table, alert, collapsible, toggle

**Motion-Primitives:**
- [ ] Install text-shimmer, animated-number, in-view
- [ ] Install glow-effect, spotlight (optional)

**Chat Virtualization (if decided):**
- [ ] Install `@tanstack/react-virtual`
- [ ] Create `VirtualizedMessageList` component
- [ ] Integrate with threshold-based rendering

**UI Fixes:**
- [ ] Fix auth page TODOs
- [ ] Fix toolbar-dynamic width issue
- [ ] Fix command-footer morph effect

- [ ] ✅ Verification: Components render correctly, no console errors

### Phase 4: Testing & Polish (Days 5-7)

**Unit Testing (Vitest):**
- [ ] Install Vitest and testing libraries
- [ ] Create vitest.config.ts
- [ ] Create test setup file
- [ ] Write transcript service tests
- [ ] Write hook tests
- [ ] Write URL detection tests
- [ ] Enable CI tests in workflow

**E2E Testing (Playwright):**
- [ ] Install Playwright with browsers
- [ ] Create playwright.config.ts
- [ ] Write homepage test
- [ ] Write chat flow test
- [ ] Write YouTube transcript test
- [ ] Add E2E scripts to package.json

**Error Monitoring:**
- [ ] Choose tool: Sentry OR Highlight.io
- [ ] Install and configure
- [ ] Add environment variables
- [ ] Verify errors appear in dashboard
- [ ] Test session replay (if enabled)

**Analytics (if decided):**
- [ ] Choose tool: OpenPanel OR PostHog
- [ ] Install and configure
- [ ] Add environment variables
- [ ] Verify page views tracked
- [ ] Set up custom event tracking

**Code Quality:**
- [ ] Run full type-check
- [ ] Run full lint
- [ ] Fix all warnings/errors

- [ ] ✅ Verification: All tests pass, CI pipeline green, monitoring active

### Phase 5: Advanced (Week 2+)

**MCP Support:**
- [ ] Complete MCP integration
- [ ] Test local MCP loading
- [ ] Test URL-based MCP loading

**Whisper Fallback (if decided):**
- [ ] Create audio extraction service
- [ ] Integrate Whisper API
- [ ] Add fallback logic

**Rich Text Editor (if decided):**
- [ ] Install Tiptap and extensions
- [ ] Create RichPromptInput component
- [ ] Integrate with chat flow
- [ ] Add mentions/slash commands (optional)

**Drag and Drop (if decided):**
- [ ] Install dnd-kit packages
- [ ] Create SortableChatList component
- [ ] Integrate with sidebar

**Remaining Tasks:**
- [ ] Install remaining UI components (optional)
- [ ] Performance optimization
- [ ] Documentation updates

- [ ] ✅ Verification: Full app review, documentation complete

---

## Notes

- **Always backup** customized components before installing updates
- **Test locally** before deploying to production
- **Review RLS policies** when adding new database tables
- **Keep API keys secure** - never commit to git

---

## Environment Verification

Before starting any phase, verify your environment is correctly set up:

### Required Environment Variables

```bash
# Check .env.local exists and has required values
cat .env.local | grep -E "^[A-Z]" | cut -d'=' -f1

# Expected output should include:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE
# OPENAI_API_KEY (or other AI provider keys)
# CSRF_SECRET
# ENCRYPTION_KEY (for BYOK)

# New tools (add as you implement):
# UPSTASH_REDIS_REST_URL (rate limiting)
# UPSTASH_REDIS_REST_TOKEN (rate limiting)
# HELICONE_API_KEY (if using Helicone)
# LANGFUSE_PUBLIC_KEY (if using Langfuse)
# LANGFUSE_SECRET_KEY (if using Langfuse)
# NEXT_PUBLIC_SENTRY_DSN (if using Sentry)
# NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID (if using Highlight)
# NEXT_PUBLIC_OPENPANEL_CLIENT_ID (if using OpenPanel)
# NEXT_PUBLIC_POSTHOG_KEY (if using PostHog)
```

### Verify Services

```bash
# Check Supabase connection
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" | head -c 100

# Check Ollama (if using local models)
curl -s http://localhost:11434/api/tags | jq '.models[].name'

# Verify app starts without errors
npm run dev
```

### Database Tables Verification

Ensure all required tables exist in Supabase:

```sql
-- Run in Supabase SQL editor to check tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected tables:
-- chat_attachments, chats, feedback, messages, 
-- projects, user_keys, user_preferences, users
```

---

## Rollback Procedures

### If Component Installation Breaks Something

```bash
# Restore from backup
rm -rf components/ui
mv components/ui.backup components/ui

# Or restore specific component
git checkout HEAD -- components/ui/button.tsx
```

### If Database Migration Fails

```sql
-- Drop the table if needed
DROP TABLE IF EXISTS video_transcripts CASCADE;

-- Drop trigger and function
DROP TRIGGER IF EXISTS update_video_transcripts_timestamp ON video_transcripts;
DROP FUNCTION IF EXISTS update_video_transcripts_updated_at();
```

### If YouTube Transcript Feature Causes Issues

```bash
# Disable by removing the API route
rm -rf app/api/youtube

# Or add feature flag
# In .env.local:
# ENABLE_YOUTUBE_TRANSCRIPTS=false
```

---

## Resources

### Project Documentation
- [INSTALL.md](../INSTALL.md) - Full installation guide
- [YouTube Transcript Evaluation](./youtube-transcript-evaluation.md) - Detailed transcript implementation options
- [Component Installation Guide](../install-remaining-components.md) - All missing UI components

### UI Component Libraries
- [shadcn/ui Docs](https://ui.shadcn.com/docs)
- [Prompt-Kit Docs](https://prompt-kit.com/docs)
- [Motion-Primitives Docs](https://motion-primitives.com/docs)

### Rate Limiting & Caching
- [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted) - Serverless Redis
- [Upstash Rate Limit](https://upstash.com/docs/oss/sdks/ts/ratelimit/overview) - Rate limiting SDK

### LLM Observability
- [Langfuse Docs](https://langfuse.com/docs) - Comprehensive LLM tracing
- [Helicone Docs](https://docs.helicone.ai/) - Proxy-based observability with caching

### Error Monitoring
- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) - Industry standard
- [Highlight.io Docs](https://www.highlight.io/docs/getting-started/overview) - Open-source alternative

### Analytics
- [OpenPanel Docs](https://openpanel.dev/docs) - Lightweight, privacy-focused
- [PostHog Docs](https://posthog.com/docs) - All-in-one with feature flags

### Performance
- [TanStack Virtual Docs](https://tanstack.com/virtual/latest) - Virtualization for long lists

### Testing
- [Vitest Docs](https://vitest.dev/guide/) - Unit testing
- [Playwright Docs](https://playwright.dev/docs/intro) - E2E testing
- [Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/) - React testing utilities

### Rich Text & DnD (Advanced)
- [Tiptap Docs](https://tiptap.dev/docs/editor/introduction) - Headless rich text editor
- [dnd-kit Docs](https://docs.dndkit.com/) - Modern drag and drop

---

*Last updated: January 12, 2026*
*Added: Rate limiting (Upstash), LLM observability (Langfuse/Helicone), error monitoring (Sentry/Highlight), analytics (OpenPanel/PostHog), virtualization (TanStack Virtual), E2E testing (Playwright), rich text editing (Tiptap), drag-and-drop (dnd-kit)*
