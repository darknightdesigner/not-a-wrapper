# YouTube Transcript Extraction - Technical Evaluation

> **Document Purpose:** Evaluate all available options for converting YouTube video links into transcripts for AI training and chat integration in vid0.
>
> **Last Updated:** January 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Requirements Analysis](#requirements-analysis)
3. [Option Categories](#option-categories)
4. [Paid API Services](#paid-api-services)
5. [Free Open-Source Libraries](#free-open-source-libraries)
6. [Self-Hosted AI Solutions](#self-hosted-ai-solutions)
7. [Comparison Matrix](#comparison-matrix)
8. [Cost Analysis](#cost-analysis)
9. [Technical Implementation](#technical-implementation)
10. [Recommendations](#recommendations)

---

## Executive Summary

### Key Findings

| Approach | Best For | Cost | Complexity |
|----------|----------|------|------------|
| **Free npm library** | Most use cases | $0 | Low |
| **Paid API (Supadata)** | No-code, quick start | $17-297/mo | Very Low |
| **Self-hosted Whisper** | Videos without captions | $0 (compute costs) | Medium |
| **Hybrid approach** | Production systems | Minimal | Medium |

### Recommendation

**Use free open-source libraries** (`youtube-transcript` npm package) as the primary solution. Paid services like Supadata are essentially wrappers around these same libraries with added infrastructure.

---

## Requirements Analysis

### vid0 Use Cases

| Use Case | Transcript Need | Priority |
|----------|-----------------|----------|
| Analyze competitor videos | Full transcript with timestamps | High |
| Generate video scripts from examples | Full text extraction | High |
| SEO keyword extraction | Searchable text | Medium |
| Content summarization | Full transcript for AI processing | High |
| Video-to-blog conversion | Timestamped segments | Medium |
| Training data for fine-tuning | Bulk transcript extraction | Low |

### Technical Requirements

- [ ] Extract transcripts from public YouTube videos
- [ ] Support multiple languages
- [ ] Handle videos without native captions (AI fallback)
- [ ] Timestamped segments for precise references
- [ ] Scalable for batch processing
- [ ] Compatible with Next.js/TypeScript stack
- [ ] Minimal latency for chat integration

---

## Option Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPT EXTRACTION OPTIONS                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PAID APIs   │  │  FREE LIBS   │  │ SELF-HOSTED  │          │
│  │              │  │              │  │              │          │
│  │ • Supadata   │  │ • youtube-   │  │ • Whisper    │          │
│  │ • SocialKit  │  │   transcript │  │ • Faster-    │          │
│  │ • Scrapingdog│  │ • yt-dlp     │  │   Whisper    │          │
│  │ • RapidAPI   │  │ • ytdl-core  │  │ • Whisper.cpp│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               HYBRID APPROACH (RECOMMENDED)               │   │
│  │  Free library for existing captions + Whisper fallback   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Paid API Services

### 1. Supadata

**Website:** [supadata.ai](https://supadata.ai)

| Aspect | Details |
|--------|---------|
| **Platforms** | YouTube, TikTok, Instagram, X, Facebook |
| **AI Transcripts** | ✅ Yes (Whisper-based) |
| **SDKs** | Python, JavaScript/TypeScript |
| **No-Code** | Zapier, Make, n8n |

**Pricing:**

| Plan | Credits/Month | Price | Per 1K Requests |
|------|---------------|-------|-----------------|
| Free | 100 | $0 | - |
| Basic | 300 | $5 | $16.67 |
| Pro | 3,000 | $17 | $5.67 |
| Mega | 30,000 | $47 | $1.57 |
| Giga | 300,000 | $297 | $0.99 |

**Credit Costs:**
- Existing transcript: 1 credit
- AI-generated: 2 credits/minute
- Translation: 30 credits/minute

**Under the Hood:** Wraps `youtube-transcript-api` (Python) for existing transcripts and OpenAI Whisper for AI generation.

**Verdict:** 💰 **Overpriced for what it offers** - you're paying for infrastructure, not unique technology.

---

### 2. SocialKit

**Website:** [socialkit.dev](https://socialkit.dev)

| Aspect | Details |
|--------|---------|
| **Platforms** | YouTube, TikTok, Instagram |
| **AI Summaries** | ✅ Yes |
| **Timestamps** | ✅ Full segment data |
| **Unique Feature** | AI-powered video summaries |

**Pricing:**

| Plan | Requests/Month | Price | Per 1K |
|------|----------------|-------|--------|
| Free | 20 | $0 | - |
| Starter | ~8,000 | $13 | $1.59 |

**Verdict:** 🤔 **Interesting for AI summaries** but limited free tier.

---

### 3. Scrapingdog

**Website:** [scrapingdog.com](https://scrapingdog.com)

| Aspect | Details |
|--------|---------|
| **Platforms** | YouTube only |
| **Proxy Management** | ✅ Automatic |
| **Scale** | Designed for high-volume |
| **AI Transcripts** | ❌ No |

**Verdict:** 📈 **Good for scale** but YouTube-only and no AI fallback.

---

### 4. YouTube-Transcript.io

| Aspect | Details |
|--------|---------|
| **Platforms** | YouTube only |
| **Model** | Monthly subscription |
| **Price** | ~$9.99/month |

**Verdict:** ❌ **Too expensive** for limited features.

---

### 5. RapidAPI Options

Various APIs available including:
- Fast YouTube Transcriptor
- YouTube Transcriptor Pro

**Verdict:** 🎲 **Inconsistent quality** - varies by provider.

---

## Free Open-Source Libraries

### 1. youtube-transcript (JavaScript/TypeScript) ⭐ RECOMMENDED

**Repository:** [npm package](https://www.npmjs.com/package/youtube-transcript)

| Aspect | Details |
|--------|---------|
| **Language** | JavaScript/TypeScript |
| **Downloads** | ~58,000/week |
| **API Key Required** | ❌ No |
| **Headless Browser** | ❌ No |

**Installation:**

```bash
npm install youtube-transcript
```

**Usage:**

```typescript
import { YoutubeTranscript } from 'youtube-transcript';

// Fetch transcript
const transcript = await YoutubeTranscript.fetchTranscript('VIDEO_ID');

// Returns:
// [
//   { text: 'Hello world', offset: 0, duration: 2500 },
//   { text: 'This is a test', offset: 2500, duration: 3000 },
//   ...
// ]
```

**Pros:**
- ✅ Free and open-source
- ✅ No API key needed
- ✅ TypeScript support
- ✅ Lightweight (~10KB)
- ✅ Active maintenance

**Cons:**
- ❌ Only works for videos WITH existing captions
- ❌ No AI fallback for captionless videos
- ❌ May break if YouTube changes internal API

---

### 2. youtube-transcript-api (Python)

**Repository:** [github.com/jdepoix/youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api)

| Aspect | Details |
|--------|---------|
| **Language** | Python |
| **GitHub Stars** | 3,000+ |
| **API Key Required** | ❌ No |
| **Translation** | ✅ Built-in |

**Installation:**

```bash
pip install youtube-transcript-api
```

**Usage:**

```python
from youtube_transcript_api import YouTubeTranscriptApi

# Get transcript
transcript = YouTubeTranscriptApi.get_transcript('VIDEO_ID')

# Get transcript in specific language
transcript = YouTubeTranscriptApi.get_transcript('VIDEO_ID', languages=['es', 'en'])

# List available transcripts
transcript_list = YouTubeTranscriptApi.list_transcripts('VIDEO_ID')
```

**Pros:**
- ✅ Most mature library
- ✅ Built-in translation
- ✅ Language selection
- ✅ CLI tool included
- ✅ Proxy support

**Cons:**
- ❌ Python only (need separate API for Next.js)
- ❌ No AI fallback

---

### 3. youtube-captions-scraper (JavaScript)

**Repository:** [npm package](https://www.npmjs.com/package/youtube-captions-scraper)

```bash
npm install youtube-captions-scraper
```

```javascript
import { getSubtitles } from 'youtube-captions-scraper';

const subtitles = await getSubtitles({
  videoID: 'VIDEO_ID',
  lang: 'en'
});
```

**Verdict:** Alternative to youtube-transcript but less popular.

---

### 4. yt-dlp (Video/Audio Download)

**Repository:** [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp)

| Aspect | Details |
|--------|---------|
| **GitHub Stars** | 90,000+ |
| **Use Case** | Download video/audio for Whisper processing |
| **Subtitle Download** | ✅ Yes |

**Installation:**

```bash
pip install yt-dlp
# or
brew install yt-dlp
```

**Usage for subtitles:**

```bash
# Download subtitles only
yt-dlp --write-sub --sub-lang en --skip-download VIDEO_URL

# Download audio for Whisper processing
yt-dlp -x --audio-format mp3 VIDEO_URL
```

**Programmatic (Python):**

```python
import yt_dlp

def download_audio(video_url: str) -> str:
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': '/tmp/%(id)s.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
        }],
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(video_url, download=True)
        return f"/tmp/{info['id']}.mp3"
```

---

## Self-Hosted AI Solutions

### For Videos WITHOUT Native Captions

### 1. OpenAI Whisper ⭐ RECOMMENDED

**Repository:** [github.com/openai/whisper](https://github.com/openai/whisper)

| Aspect | Details |
|--------|---------|
| **GitHub Stars** | 75,000+ |
| **Languages** | 99+ |
| **License** | MIT (Free) |
| **Models** | tiny, base, small, medium, large |

**Model Comparison:**

| Model | Parameters | VRAM | Relative Speed | Accuracy |
|-------|------------|------|----------------|----------|
| tiny | 39M | ~1GB | ~32x | Good |
| base | 74M | ~1GB | ~16x | Better |
| small | 244M | ~2GB | ~6x | Great |
| medium | 769M | ~5GB | ~2x | Excellent |
| large | 1550M | ~10GB | 1x | Best |

**Installation:**

```bash
pip install openai-whisper
```

**Usage:**

```python
import whisper

model = whisper.load_model("base")  # Choose model size
result = model.transcribe("audio.mp3")

print(result["text"])  # Full transcript
print(result["segments"])  # Timestamped segments
```

---

### 2. Faster-Whisper (4x Faster)

**Repository:** [github.com/SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper)

| Aspect | Details |
|--------|---------|
| **Speed** | 4x faster than original Whisper |
| **Memory** | Lower VRAM requirements |
| **Accuracy** | Same as original |

**Installation:**

```bash
pip install faster-whisper
```

**Usage:**

```python
from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")
segments, info = model.transcribe("audio.mp3")

for segment in segments:
    print(f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
```

---

### 3. Whisper.cpp (CPU Optimized)

**Repository:** [github.com/ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp)

Best for running Whisper on machines without GPU.

---

### 4. OpenAI Whisper API (Cloud)

**Pricing:** $0.006 per minute of audio

```typescript
import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI();

const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream('audio.mp3'),
  model: 'whisper-1',
});

console.log(transcription.text);
```

**When to use:** When you don't want to self-host but need AI transcription.

---

## Comparison Matrix

### Feature Comparison

| Feature | youtube-transcript | Supadata | Whisper (self) | OpenAI API |
|---------|-------------------|----------|----------------|------------|
| **Cost** | Free | $17-297/mo | Free | $0.006/min |
| **Existing captions** | ✅ | ✅ | ❌ | ❌ |
| **AI generation** | ❌ | ✅ | ✅ | ✅ |
| **Timestamps** | ✅ | ✅ | ✅ | ✅ |
| **Multi-language** | ✅ | ✅ | ✅ | ✅ |
| **Translation** | ❌ | ✅ | ✅ | ❌ |
| **Next.js compatible** | ✅ | ✅ | Via API | ✅ |
| **No API key** | ✅ | ❌ | ✅ | ❌ |
| **Rate limits** | None* | Per plan | None | 50 req/min |
| **Setup time** | 5 min | 10 min | 30 min | 10 min |

*YouTube may rate limit excessive requests

### Reliability & Maintenance

| Solution | Stability | Risk | Maintenance |
|----------|-----------|------|-------------|
| youtube-transcript | Medium | YouTube API changes | Community |
| Supadata | High | Service discontinuation | Managed |
| Self-hosted Whisper | High | None | Self |
| OpenAI API | Very High | Cost, API changes | Managed |

---

## Cost Analysis

### Scenario: 1,000 Video Transcripts/Month

**Assumptions:**
- 70% have existing captions
- 30% need AI generation
- Average video length: 10 minutes

| Solution | Monthly Cost | Annual Cost |
|----------|--------------|-------------|
| **Free library + Self-hosted Whisper** | $0 (+ compute) | $0 |
| **Supadata Pro** | $17 | $204 |
| **Supadata Mega** | $47 | $564 |
| **OpenAI Whisper API only** | $18 | $216 |
| **Hybrid (free + OpenAI fallback)** | $5.40 | $65 |

### Cost Breakdown (Hybrid Approach)

```
1,000 videos/month
├── 700 with captions → youtube-transcript → $0
└── 300 without captions → 300 × 10 min = 3,000 min
    └── OpenAI Whisper API: 3,000 × $0.006 = $18
    └── OR Self-hosted Whisper: $0 (just compute time)
```

---

## Technical Implementation

### Recommended Architecture for vid0

```
┌─────────────────────────────────────────────────────────────┐
│                         vid0                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │   User      │───▶│  API Route  │───▶│  Transcript │    │
│  │   Input     │    │  /api/yt    │    │   Service   │    │
│  └─────────────┘    └─────────────┘    └──────┬──────┘    │
│                                                │            │
│                          ┌─────────────────────┼───────┐   │
│                          │                     │       │   │
│                          ▼                     ▼       ▼   │
│                   ┌──────────┐          ┌──────────┐      │
│                   │ youtube- │          │ Whisper  │      │
│                   │transcript│          │ Fallback │      │
│                   │  (FREE)  │          │ (AI Gen) │      │
│                   └──────────┘          └──────────┘      │
│                          │                     │           │
│                          └──────────┬──────────┘           │
│                                     ▼                      │
│                            ┌──────────────┐                │
│                            │  Formatted   │                │
│                            │  Transcript  │                │
│                            └──────────────┘                │
│                                     │                      │
│                                     ▼                      │
│                            ┌──────────────┐                │
│                            │   AI Chat    │                │
│                            │   Context    │                │
│                            └──────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Code

#### 1. Transcript Service (TypeScript)

```typescript
// lib/youtube/transcript-service.ts
import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptSegment {
  text: string;
  start: number;  // seconds
  duration: number;  // seconds
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
    // Try fetching existing transcript (FREE)
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
    // No transcript available - would need Whisper fallback
    return {
      success: false,
      videoId,
      source: 'error',
      error: 'No transcript available. AI generation required.',
    };
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,  // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
```

#### 2. API Route (Next.js)

```typescript
// app/api/youtube/transcript/route.ts
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

#### 3. React Hook

```typescript
// hooks/use-youtube-transcript.ts
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

  return { fetchTranscript, transcript, loading, error };
}
```

---

## Recommendations

### For vid0

#### Primary Recommendation: Hybrid Free Approach

1. **Use `youtube-transcript`** npm package as primary method (FREE)
2. **Optional:** Add OpenAI Whisper API as fallback for videos without captions
3. **Future:** Self-host Whisper for zero ongoing costs

#### Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1️⃣ | Implement youtube-transcript | Low | High |
| 2️⃣ | Add OpenAI Whisper fallback | Medium | Medium |
| 3️⃣ | Cache transcripts in database | Low | High |
| 4️⃣ | Self-host Whisper (optional) | High | Medium |

### Decision Matrix

| If you need... | Use this |
|----------------|----------|
| Quick MVP, existing captions only | `youtube-transcript` |
| Full coverage including captionless videos | Hybrid (free + Whisper API) |
| Maximum cost savings at scale | Self-hosted Whisper |
| Zero maintenance, budget available | Supadata |
| AI-powered summaries | SocialKit |

---

## Appendix

### A. YouTube URL Formats Supported

```
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/embed/VIDEO_ID
https://www.youtube.com/v/VIDEO_ID
VIDEO_ID (direct 11-character ID)
```

### B. Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `TranscriptsDisabled` | Video has no captions | Use Whisper fallback |
| `VideoUnavailable` | Private/deleted video | Inform user |
| `TooManyRequests` | Rate limited | Implement retry with backoff |
| `NoTranscriptFound` | Language not available | Try different language |

### C. Resources

- [youtube-transcript npm](https://www.npmjs.com/package/youtube-transcript)
- [youtube-transcript-api Python](https://github.com/jdepoix/youtube-transcript-api)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [Faster Whisper](https://github.com/SYSTRAN/faster-whisper)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-11 | 1.0.0 | Initial evaluation document |
