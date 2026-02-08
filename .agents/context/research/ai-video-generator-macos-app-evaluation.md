# AI Video Generator Native macOS App: Feasibility Evaluation

> **Purpose:** Deep research on the difficulty of building a native macOS app that uses AI video generation APIs and exposes familiar NLE (non-linear editor) controls akin to Premiere Pro, Final Cut Pro, and DaVinci Resolve.
>
> **Created:** February 7, 2026
>
> **Status:** ✅ Research Complete

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Vision](#the-vision)
3. [AI Video Generation API Landscape](#ai-video-generation-api-landscape)
   - Provider Comparison
   - API Aggregators
   - Creative Control Parameters
   - Pricing Analysis
4. [What "Familiar NLE Controls" Actually Means](#what-familiar-nle-controls-actually-means)
5. [macOS Native App Architecture](#macos-native-app-architecture)
   - Framework Decision: Swift vs Electron vs Tauri
   - Core Frameworks (AVFoundation, Metal, Core Video)
   - GPU Rendering Pipeline
6. [Difficulty Breakdown by Component](#difficulty-breakdown-by-component)
   - Component 1: AI Video Generation Integration
   - Component 2: Timeline Editor (NLE Core)
   - Component 3: Real-Time Preview & Playback
   - Component 4: Effects, Transitions & Compositing
   - Component 5: Export Pipeline
   - Component 6: Project Management & Asset Library
7. [Current Limitations of AI Video Generation](#current-limitations-of-ai-video-generation)
8. [Competitive Landscape](#competitive-landscape)
9. [Effort Estimation](#effort-estimation)
10. [Risk Assessment](#risk-assessment)
11. [Recommended Architecture](#recommended-architecture)
12. [Phased Build Strategy](#phased-build-strategy)
13. [Verdict](#verdict)

---

## Executive Summary

Building a native macOS AI video generator with professional NLE controls is a **high-difficulty, high-reward** project. The difficulty is not symmetrical — the AI generation integration via APIs is relatively straightforward (weeks), but the professional editing UI is where the real engineering mountain lives (months to years).

### Key Findings

| Dimension | Difficulty | Timeframe |
|-----------|-----------|-----------|
| AI API integration (single provider) | Low | 1–2 weeks |
| AI API integration (multi-provider + aggregator) | Medium | 3–5 weeks |
| Basic timeline UI (cuts, trims, ordering) | High | 2–4 months |
| Professional timeline (multi-track, keyframes) | Very High | 6–12 months |
| Real-time preview with Metal | High | 2–3 months |
| Effects & compositing pipeline | Very High | 4–8 months |
| Export pipeline (ProRes, H.264/5) | Medium | 2–4 weeks |
| Full professional NLE feature parity | Extreme | 2–5+ years, large team |

**Bottom line:** A solo developer or small team (2–4 engineers) can ship an MVP with AI generation + basic timeline controls in **4–6 months**. Reaching feature parity with Premiere/FCP/Resolve is a multi-year, multi-million-dollar effort — but the opportunity lies in the intersection: AI-native workflows that professionals can't get in legacy tools.

---

## The Vision

The product concept: a native macOS application where users can:

1. **Generate** video clips using AI (text-to-video, image-to-video, style transfer)
2. **Edit** those clips using professional NLE controls (timeline, multi-track, keyframes, transitions)
3. **Refine** with AI-assisted tools (extend clips, fix artifacts, restyle, add motion)
4. **Export** to industry-standard formats (ProRes, H.264, H.265, various resolutions up to 4K)

The value proposition is collapsing the gap between "AI generates a clip" and "that clip is production-ready" — all within one application instead of bouncing between a generation tool and an editor.

---

## AI Video Generation API Landscape

### Provider Comparison (February 2026)

| Provider | Model | Max Duration | Max Resolution | API Access | Cost (10s clip) | Strengths |
|----------|-------|-------------|----------------|------------|-----------------|-----------|
| **Runway** | Gen-4 Turbo | 10s | 1080p | ✅ Full API | ~$0.50 | Physical accuracy, prompt adherence, reference images |
| **Runway** | Gen-4.5 | 10s | 4K | ⏳ Coming soon | TBD | Best overall quality (ranked #1) |
| **Google** | Veo 3.1 | 60s+ | 4K | ✅ Vertex AI + AI Studio | ~$0.30–0.60 | Native audio, long-form, style consistency |
| **Luma** | Ray 2 | 20s | 4K | ✅ Full API | ~$0.20–0.50 | Cinematic aesthetics, camera control, speed |
| **Kling** | O1 | 120s | 1080p | ✅ Full API | ~$0.07–0.14/s | Longest clips, unified multimodal, 18+ video tasks |
| **OpenAI** | Sora 2 | 20s | 1080p | ✅ Full API | ~$2–5 | Cinematic realism, temporal coherence |
| **Minimax** | Hailuo 02 | 10s | 1080p | ✅ Via aggregators | ~$0.10–0.30 | Character consistency, emotional expression |
| **Tencent** | HunyuanVideo | varies | 720p–1080p | ✅ Via Replicate | ~$1.26/run | Open-source, self-hostable |

### API Aggregators (Unified Access)

Rather than integrating each provider individually, aggregators offer a single API layer:

| Aggregator | Models Available | Pricing Model | Key Benefit |
|------------|-----------------|---------------|-------------|
| **fal.ai** | 600+ (Veo 3, Kling 3.0, Luma, MiniMax, WAN, Hunyuan) | Pay-per-use | Largest catalog, 50M+ daily requests |
| **Replicate** | 100+ video models (WAN 2.5, HunyuanVideo) | Pay-per-second of compute | Open-source models, self-host option |
| **AI/ML API** | Multiple (Kling, Hailuo, others) | Per-request | Simple unified interface |

**Recommendation:** Start with **fal.ai** as the primary aggregator for breadth, supplement with direct **Runway** and **Luma** APIs for their superior creative controls. This gives maximum model coverage with manageable integration effort.

### Creative Control Parameters Available via APIs

This is critical — what can you actually control programmatically?

| Control | Runway | Luma | Kling | Sora | Veo 3.1 |
|---------|--------|------|-------|------|---------|
| Text prompt | ✅ | ✅ | ✅ | ✅ | ✅ |
| Image-to-video (reference frame) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Video-to-video (remix/restyle) | ✅ | ✅ | ❌ | ✅ | ❌ |
| Camera motion control | Limited | ✅ Strong | ✅ | ✅ | ✅ |
| Keyframe specification | ❌ | ✅ (frame0/frameN) | ❌ | ❌ | ❌ |
| Aspect ratio | ✅ | ✅ | ✅ | ✅ | ✅ |
| Duration control | ✅ | ✅ | ✅ (5/10s) | ✅ | ✅ |
| Style/aesthetic presets | Via prompt | Via prompt | Via prompt | Via prompt | Via prompt |
| Seed (reproducibility) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Extend/continue clip | ✅ | ✅ | ✅ | ❌ | ✅ |
| Audio generation | ❌ | ❌ | ✅ | ❌ | ✅ (Veo 3.1) |

**Key insight:** No current API gives you frame-level precision. You get clip-level generation with prompt-based artistic direction. This fundamentally shapes the product — it's "generate and arrange" not "edit frame by frame with AI." The NLE controls are for compositing AI-generated clips with traditional editing tools, not for controlling AI at the frame level.

### Pricing Analysis (Per-Minute of Final Output)

Assuming a 1-minute video assembled from 10-second clips:

| Provider | Cost per Minute | Notes |
|----------|----------------|-------|
| Kling O1 | $0.70–1.40 | Best value for volume |
| Luma Ray 2 | $1.20–3.00 | Good balance |
| Google Veo 3.1 | $1.80–3.60 | Premium quality |
| Runway Gen-4 Turbo | $3.00 | Professional standard |
| OpenAI Sora 2 | $12–30 | Premium, limited use |

Add 2–5x cost for re-rolls (typical to get desired output), making realistic costs **$5–50/minute of final video** depending on provider and iteration count.

---

## What "Familiar NLE Controls" Actually Means

Professional editors expect specific UI patterns. Here's what each reference tool provides and the implementation difficulty:

### Tier 1: Essential (Must-Have for Credibility)

| Control | Description | Premiere | FCP | Resolve | Difficulty |
|---------|-------------|----------|-----|---------|------------|
| **Timeline** | Horizontal multi-track arrangement | ✅ | ✅ | ✅ | Very High |
| **Playhead/Scrubbing** | Frame-accurate seek with preview | ✅ | ✅ | ✅ | High |
| **Cut/Split** | Razor tool to divide clips | ✅ | ✅ | ✅ | Medium |
| **Trim (ripple/roll)** | Adjust in/out points with neighbor awareness | ✅ | ✅ | ✅ | High |
| **Drag & drop reorder** | Move clips on timeline | ✅ | ✅ | ✅ | Medium |
| **Preview monitor** | Real-time playback of composition | ✅ | ✅ | ✅ | High |
| **Zoom (timeline)** | Scale timeline view | ✅ | ✅ | ✅ | Medium |
| **Undo/Redo** | Full edit history | ✅ | ✅ | ✅ | Medium |

### Tier 2: Expected (Users Will Ask Quickly)

| Control | Description | Difficulty |
|---------|-------------|------------|
| **Multi-track audio/video** | Stacked layers with visibility/mute | Very High |
| **Transitions** | Crossfade, dissolve, wipe between clips | High |
| **Keyframe animation** | Animate properties over time (opacity, position, scale) | Very High |
| **Text/Title overlay** | Titles, lower thirds, captions | Medium |
| **Audio waveform display** | Visual audio on timeline | Medium |
| **Speed ramping** | Variable playback speed per clip | High |
| **Snapping** | Magnetic alignment to playhead, markers, clip edges | Medium |

### Tier 3: Professional (Differentiation)

| Control | Description | Difficulty |
|---------|-------------|------------|
| **Color grading** | Wheels, curves, LUT support | Extreme |
| **Motion tracking** | Object tracking for effects | Extreme |
| **Multi-cam editing** | Sync and switch between angles | Very High |
| **Nested sequences** | Compositions within compositions | High |
| **Masking/rotoscoping** | Shape and bezier masks | Very High |
| **Audio mixing** | Multi-bus, EQ, dynamics | Very High |
| **Proxy workflow** | Low-res editing, full-res export | High |

---

## macOS Native App Architecture

### Framework Decision

| Approach | Performance | Video Handling | Dev Speed | Cross-Platform | Verdict |
|----------|-------------|---------------|-----------|----------------|---------|
| **Swift + AppKit/SwiftUI** | Excellent (native) | Full AVFoundation/Metal access | Slower (niche skills) | macOS only | Best for quality |
| **Tauri + Rust** | Very Good | Needs FFI bridges to AVFoundation | Medium | ✅ | Best for reach |
| **Electron** | Poor (Chromium overhead) | Limited, needs native modules | Fast | ✅ | Not suitable for video |
| **Swift + AppKit core, SwiftUI views** | Excellent | Full native access | Medium | macOS only | Recommended |

**Recommendation:** Swift with AppKit for the core editing engine (timeline, playback, rendering) and SwiftUI for supplementary UI (panels, inspectors, settings). Video editing demands the low-level control that only native Swift provides on macOS.

### Core Apple Frameworks

| Framework | Role | Why Essential |
|-----------|------|---------------|
| **AVFoundation** | Video playback, composition, export | The backbone — AVMutableComposition for non-destructive editing |
| **Metal** | GPU-accelerated rendering | Real-time effects, transitions, color processing |
| **Core Video** | Frame-level access | Bridge between decoded frames and Metal rendering |
| **VideoToolbox** | Hardware codec access | ProRes decode/encode, H.264/H.265 hardware acceleration |
| **Core Image** | Built-in filters & effects | Color correction, blur, compositing operations |
| **Core Animation** | UI animation | Timeline scrubbing, transport controls |

### GPU Rendering Pipeline

The recommended architecture for real-time preview:

```
AVAsset (source clips)
  → VideoToolbox (hardware decode)
    → Core Video (CVPixelBuffer frames)
      → Metal (GPU composition + effects)
        → MTKView (preview display)
          → AVAssetWriter (export)
```

This pipeline is what Final Cut Pro uses internally. The complexity is in managing:
- Frame timing and synchronization across multiple tracks
- Effect graph evaluation per frame
- Maintaining 24/30/60 fps preview performance
- Memory management for 4K+ frame buffers

---

## Difficulty Breakdown by Component

### Component 1: AI Video Generation Integration

**Difficulty: Low to Medium**

| Task | Effort | Notes |
|------|--------|-------|
| REST API client for one provider | 2–3 days | Standard HTTP + JSON, async polling for results |
| Multi-provider abstraction layer | 1–2 weeks | Unified interface over Runway, Luma, Kling, Veo |
| fal.ai aggregator integration | 3–5 days | Single SDK, multiple models |
| Generation queue management | 1 week | Track pending jobs, handle failures, show progress |
| Result caching & asset management | 3–5 days | Download, store, thumbnail generated clips |
| Prompt builder UI | 1–2 weeks | Camera, style, motion controls mapped to API params |
| BYOK (Bring Your Own Key) support | 3–5 days | Per-provider API key storage and encryption |

**Total: 4–8 weeks** for a polished multi-provider integration.

The APIs follow standard patterns: POST to create a generation task, poll for completion, download the result. The async nature (generation takes 30s–5min) actually simplifies things — you show a progress indicator and let the user keep editing while new clips render.

### Component 2: Timeline Editor (NLE Core)

**Difficulty: Very High — This Is the Hard Part**

The timeline is the central nervous system of any NLE. AVFoundation's `AVMutableComposition` provides the data model but zero UI. You must build:

| Sub-component | Effort | Why It's Hard |
|---------------|--------|---------------|
| Timeline rendering (tracks, clips, waveforms) | 6–8 weeks | Custom drawing with Core Graphics/Metal, must stay performant with hundreds of clips |
| Playhead with frame-accurate scrubbing | 2–3 weeks | Must synchronize visual playhead position with AVPlayer seek — sub-frame accuracy needed |
| Clip drag & drop | 3–4 weeks | Hit testing, snapping, collision detection, ripple vs overwrite behavior |
| Cut/split tool | 1–2 weeks | Must update AVMutableComposition and UI model simultaneously |
| Ripple/roll trim | 3–4 weeks | Adjacent clip awareness, magnetic trim points, real-time preview during trim |
| Multi-track management | 4–6 weeks | Track creation, routing, visibility, lock, solo — state management nightmare |
| Undo/redo system | 3–4 weeks | Must capture full composition state — AVMutableComposition has no built-in undo |
| Zoom & scroll | 2–3 weeks | Smooth zoom across wide timelines, minimap navigation |
| Keyboard shortcuts | 1–2 weeks | Industry-standard mappings (JKL for shuttle, I/O for in/out) |

**Total: 6–12 months** for a timeline that professionals would consider usable.

**Why this is the real challenge:** AVMutableComposition is not a reactive data model. When you remove a track or adjust timing, nothing auto-adjusts — you manually recalculate every subsequent clip's time range. Every edit requires generating a new AVPlayerItem to reflect changes. The gap between "I can compose two clips" and "I have a responsive multi-track timeline" is enormous.

### Component 3: Real-Time Preview & Playback

**Difficulty: High**

| Task | Effort | Notes |
|------|--------|-------|
| AVPlayer integration with composition | 1–2 weeks | Basic playback |
| Custom Metal rendering pipeline | 4–6 weeks | Required for effects preview |
| Frame-accurate seeking | 2–3 weeks | CMTime precision, keyframe decoding |
| Multi-track audio mixing preview | 2–3 weeks | AVAudioMix with real-time levels |
| Performance optimization (4K) | 3–4 weeks | Frame dropping strategy, proxy switching |

**Total: 2–4 months**

### Component 4: Effects, Transitions & Compositing

**Difficulty: Very High to Extreme**

| Task | Effort | Notes |
|------|--------|-------|
| Crossfade/dissolve transitions | 2–3 weeks | AVVideoComposition with custom compositor |
| Opacity, position, scale animation | 3–4 weeks | Keyframe interpolation engine |
| Color correction (basic) | 3–4 weeks | CIFilter-based, real-time with Metal |
| Text overlay rendering | 2–3 weeks | Core Text → Metal texture |
| LUT support | 1–2 weeks | 3D LUT loading and application |
| Full color grading (wheels/curves) | 2–4 months | Custom Metal shaders, UI for controls |
| Custom Metal effect shaders | Ongoing | Per-effect development |

**Total: 4–8 months** for a respectable effects suite.

### Component 5: Export Pipeline

**Difficulty: Medium**

| Task | Effort | Notes |
|------|--------|-------|
| AVAssetExportSession integration | 1 week | Basic export with presets |
| Custom AVAssetWriter pipeline | 2–3 weeks | Full control over codec, bitrate, resolution |
| ProRes export | 1 week | Hardware accelerated on Apple Silicon |
| H.264/H.265 export | 1 week | VideoToolbox hardware encoding |
| Progress reporting | 2–3 days | Composition duration vs current time |
| Batch export (multiple formats) | 1 week | Queue management |

**Total: 4–8 weeks**

### Component 6: Project Management & Asset Library

**Difficulty: Medium**

| Task | Effort | Notes |
|------|--------|-------|
| Project save/load | 2–3 weeks | Custom format or adapt CMProjBundle |
| Media browser / asset library | 2–3 weeks | Thumbnails, metadata, search |
| AI generation history | 1–2 weeks | Prompt, parameters, results linked to project |
| Auto-save & crash recovery | 1–2 weeks | Periodic serialization |
| File management (referenced media) | 1–2 weeks | Relative paths, missing media handling |

**Total: 2–3 months**

---

## Current Limitations of AI Video Generation

These are deal-breakers to be aware of and design around:

### Critical Limitations

| Limitation | Severity | Impact on Product |
|------------|----------|-------------------|
| **Temporal flickering** | High | Generated clips may have frame-to-frame inconsistency; users need to re-roll or post-process |
| **Character identity drift** | High | Same character looks different across separately generated clips; scene continuity is broken |
| **No frame-level control** | High | Can't tell the AI "change frame 47 specifically" — generation is clip-level |
| **Long-form degradation** | High | Quality drops in clips longer than 10–15 seconds; must compose from shorter segments |
| **Motion artifacts** | Medium | Fast or complex motion produces jitter and physically impossible movement |
| **Generation latency** | Medium | 30s–5min per clip; iteration is slow compared to traditional editing |
| **No deterministic output** | Medium | Same prompt produces different results; no seed control across providers |
| **Cost at scale** | Medium | Heavy iteration (re-rolling for quality) multiplies costs 3–5x |

### What This Means for the Product

The app must be designed as a **"generate, curate, compose" workflow** rather than a "control every pixel with AI" tool. The NLE controls are essential precisely because AI output needs human curation — selecting the best takes, trimming unwanted frames, compositing good segments, and applying traditional post-processing to fix inconsistencies.

This is actually the product insight: **AI generates the raw material, the NLE makes it production-ready.**

---

## Competitive Landscape

### Direct Competitors (AI + Editing)

| Product | Approach | Strength | Weakness |
|---------|----------|----------|----------|
| **Runway (web app)** | Generation + basic editing in browser | Best AI models, reference framework | Web-only, limited NLE controls |
| **Pika** | Generation-focused web tool | Fast iteration, good quality | No real editing timeline |
| **Descript** | AI-assisted editing (transcription-based) | Text-based editing, filler removal | Not focused on AI generation |
| **CapCut** | Mobile-first AI editing | Free, fast AI features | Not professional-grade |
| **Detail** | iPad all-in-one | Apple ecosystem integration | iPad-only, not desktop NLE |

### Indirect Competitors (Traditional NLEs Adding AI)

| Product | AI Features | Threat Level |
|---------|-------------|-------------|
| **Adobe Premiere Pro** | Generative Extend, AI audio cleanup, scene detection | High — massive install base |
| **DaVinci Resolve** | AI-based magic mask, face refinement, audio classification | High — free tier, professional grade |
| **Final Cut Pro** | Smart Conform, scene removal, auto captions | Medium — slower AI adoption |

### The Gap (Product Opportunity)

No current product offers: **Native macOS performance** + **Multi-provider AI generation** + **Professional NLE controls** in one app. The browser-based tools (Runway, Pika) lack editing depth. The professional NLEs (Premiere, Resolve) are bolting on AI features to legacy architectures. A purpose-built AI-native NLE has whitespace.

---

## Effort Estimation

### Solo Developer

| Milestone | Timeframe | What's Included |
|-----------|-----------|-----------------|
| **Prototype** | 2–3 months | Single AI provider, basic timeline (cut/trim/reorder), preview, simple export |
| **Alpha** | 5–7 months | Multi-provider AI, functional timeline, transitions, text overlay, project save |
| **Beta** | 10–14 months | Multi-track, keyframes, effects, polished UI, export presets, BYOK |
| **v1.0** | 16–20 months | Stable, performant, documented, distribution-ready |

### Small Team (2–4 Engineers)

| Milestone | Timeframe | What's Included |
|-----------|-----------|-----------------|
| **Prototype** | 4–6 weeks | Same as above but parallelized |
| **Alpha** | 3–4 months | Broader feature set |
| **Beta** | 6–8 months | Professional-grade timeline + effects |
| **v1.0** | 9–12 months | Production-ready |

### Skill Requirements

| Role | Skills Needed | Scarcity |
|------|--------------|----------|
| Video Engine Developer | AVFoundation, Metal, VideoToolbox, Core Video | Very scarce |
| macOS UI Developer | AppKit, SwiftUI, custom drawing, Core Animation | Scarce |
| AI Integration Developer | REST APIs, async patterns, prompt engineering | Common |
| UX Designer (NLE experience) | Timeline interaction design, professional video workflows | Scarce |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| AI API pricing becomes prohibitive | Medium | High | Multi-provider support, BYOK, local model option |
| AI API access revoked/rate limited | Low | Critical | Aggregator fallback (fal.ai), multi-provider |
| Timeline complexity exceeds estimates | High | High | Use open-source timeline components as starting point; scope Tier 1 features only for MVP |
| Performance issues at 4K | Medium | Medium | Proxy workflow, progressive rendering |
| Apple deprecates AVFoundation APIs | Very Low | Critical | Unlikely — FCP depends on them |
| Competitor NLE adds same AI features | High | Medium | Ship fast, focus on AI-native workflow advantage |
| AI quality plateaus | Low | Medium | NLE value persists regardless of AI quality |

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────┐
│                    macOS App (Swift)                  │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  AI Engine   │  │  Edit Engine  │  │  Export      │ │
│  │             │  │              │  │  Engine      │ │
│  │  - Provider  │  │  - Timeline   │  │             │ │
│  │    Manager   │  │  - Compositor │  │  - Writer    │ │
│  │  - Prompt    │  │  - Effects    │  │  - Codec     │ │
│  │    Builder   │  │  - Keyframes  │  │  - Queue     │ │
│  │  - Queue     │  │  - Undo Mgr   │  │             │ │
│  │  - Cache     │  │              │  │             │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                │                  │         │
│  ┌──────┴────────────────┴──────────────────┴───────┐ │
│  │              Media Core (AVFoundation)             │ │
│  │  AVMutableComposition │ AVPlayer │ AVAssetWriter   │ │
│  └───────────────────────┬───────────────────────────┘ │
│                          │                              │
│  ┌───────────────────────┴───────────────────────────┐ │
│  │              GPU Pipeline (Metal)                  │ │
│  │  Decode → Composite → Effects → Render → Display   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  UI Layer    │  │  Project Mgr  │  │  Settings    │   │
│  │  (AppKit +   │  │  (Save/Load)  │  │  (BYOK,     │   │
│  │   SwiftUI)   │  │              │  │   prefs)     │   │
│  └─────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
  ┌───────────────┐   ┌───────────────┐
  │  AI APIs       │   │  Local Storage │
  │  (fal.ai,      │   │  (Projects,    │
  │   Runway,      │   │   Cache,       │
  │   Luma, etc.)  │   │   Settings)    │
  └───────────────┘   └───────────────┘
```

### Key Design Decisions

1. **Composition-first data model**: All edits are non-destructive, stored as an instruction graph on top of source media. AVMutableComposition is the source of truth.

2. **Separate AI engine**: AI generation is decoupled from the edit engine. Generated clips become regular media assets once downloaded — the timeline doesn't care if a clip was AI-generated or imported from disk.

3. **Metal rendering pipeline**: All preview rendering goes through Metal for consistent performance. Core Image filters are evaluated on the GPU via Metal interop.

4. **Provider abstraction**: A `VideoGenerationProvider` protocol allows swapping AI providers without touching the rest of the app. Aggregators (fal.ai) and direct APIs (Runway) implement the same interface.

---

## Phased Build Strategy

### Phase 1: Foundation (Months 1–3)

**Goal: AI generation + basic composition in a native shell**

- [ ] macOS app scaffold (Swift, AppKit + SwiftUI hybrid)
- [ ] AI provider abstraction layer + fal.ai integration
- [ ] Single-provider generation (Runway or Luma)
- [ ] Generated clip gallery / asset browser
- [ ] Simple sequential timeline (single video track)
- [ ] Basic playback with AVPlayer
- [ ] Cut and trim tools
- [ ] Simple export (H.264, 1080p)

**Deliverable:** An app where you can generate clips via AI and arrange them on a basic timeline.

### Phase 2: Real Editor (Months 3–6)

**Goal: Timeline that feels like a real NLE**

- [ ] Multi-track video timeline
- [ ] Audio track with waveform display
- [ ] Playhead scrubbing with frame accuracy
- [ ] Ripple and roll trim
- [ ] Snap-to behavior
- [ ] Crossfade transitions
- [ ] Drag & drop reorder
- [ ] Undo/redo system
- [ ] Keyboard shortcut system (JKL, I/O, etc.)
- [ ] Project save/load

**Deliverable:** An editor professionals would recognize as a timeline-based tool.

### Phase 3: Polish & Power (Months 6–10)

**Goal: Differentiated AI-native features + professional output**

- [ ] Multi-provider AI (Runway + Luma + Kling + Veo)
- [ ] Metal-based preview pipeline
- [ ] Keyframe animation (opacity, position, scale)
- [ ] Text/title overlay
- [ ] Basic color correction (exposure, contrast, saturation)
- [ ] LUT import & application
- [ ] ProRes export
- [ ] Speed ramping
- [ ] AI clip extension (extend a clip with AI continuation)
- [ ] BYOK support

**Deliverable:** A capable, differentiated product ready for early adopters.

### Phase 4: Professional Features (Months 10–16+)

**Goal: Compete on editing depth**

- [ ] Full color grading (wheels, curves, scopes)
- [ ] Audio mixing (multi-bus, EQ)
- [ ] Nested sequences
- [ ] Masking and shape layers
- [ ] Motion tracking
- [ ] Proxy workflow
- [ ] Plugin/extension system
- [ ] Local model support (HunyuanVideo, WAN via MLX or local inference)

---

## Verdict

### Difficulty Rating: 7.5/10

The AI integration is the easy part (3/10). The native macOS NLE is the hard part (9/10). The difficulty lives almost entirely in the editing engine, not the AI plumbing.

### Is It Worth Building?

**Yes, conditionally.** The opportunity is real — no one has built an AI-native NLE with professional controls as a native macOS app. But the key strategic question is: **how deep do you go on the NLE before shipping?**

| Strategy | Risk | Reward |
|----------|------|--------|
| **AI-first, basic timeline** (Phase 1–2) | Lower — ships faster | Tests market demand, differentiates on AI workflow |
| **Full NLE, AI-enhanced** (Phase 1–4) | Higher — long build | Competes directly with incumbents, higher switching cost |
| **Plugin for existing NLE** (FCP/Resolve plugin) | Lowest — leverages existing editor | Limited control, platform dependency |

### Recommended Approach

**Ship Phase 1 as fast as possible** (8–12 weeks) to validate that people want to generate + compose AI video in one place. If traction appears, invest in Phase 2–3 over the following 6 months. Phase 4 is only justified with revenue or funding.

The magic is in the AI-native workflow — not in rebuilding Final Cut Pro. Build just enough NLE to make AI-generated video usable, and let that workflow be the product.

---

*Research conducted February 7, 2026. API capabilities, pricing, and model rankings change rapidly — verify current state before implementation decisions.*
