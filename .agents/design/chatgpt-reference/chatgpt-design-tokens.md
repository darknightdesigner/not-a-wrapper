# Design Tokens — ChatGPT (chatgpt.com)

Extracted: 2026-02-20 | URL: https://chatgpt.com | Viewport: Desktop (default)

---

## Font Faces

| Family | Weights | Style | Display | Usage |
|--------|---------|-------|---------|-------|
| Circle | 400, 600 | normal | swap | Branding, headings |
| OpenAI Sans | 400, 500, 600, 700 | normal, italic | swap | Response body text, markdown |
| Atkinson Hyperlegible Mono | 200–800 | normal | swap | Code blocks |
| KaTeX_* | various | various | — | Math rendering |

### System Font Stack (UI elements)

```
ui-sans-serif, -apple-system, "system-ui", "Segoe UI", Helvetica, "Apple Color Emoji", Arial, "sans-serif", "Segoe UI Emoji", "Segoe UI Symbol"
```

---

## Typography Scale

| Element | Size | Weight | Line Height | Letter Spacing | Tailwind Class |
|---------|------|--------|-------------|----------------|----------------|
| Page heading (h1) | 28px | 400 | 34px | 0.38px | `text-page-header` / `text-2xl` |
| Section heading (h2) | 24px | 600 | 32px | normal | — |
| Model selector | 18px | 400 | — | normal | `text-lg` |
| Body / UI default | 16px | 400 | 24px | normal | `text-base` |
| Sidebar links | 14px | 400 | 20px | normal | `text-sm` |
| Button labels | 14px | 500 | 20px | normal | `text-sm font-medium` |
| Sidebar headings | 14px | 600 | 20px | normal | `text-sm font-semibold` |
| Toolbar actions | 13px | 500–600 | — | normal | `text-[13px]` |
| Small text | 12px | — | — | normal | `text-xs` |

---

## Color Scales

### Gray

| Level | Value | Usage |
|-------|-------|-------|
| 25 | `#fcfcfc` | — |
| 50 | `#f9f9f9` | Elevated bg (light) |
| 75 | `#f2f2f2` | — |
| 100 | `#ececec` | — |
| 200 | `#e3e3e3` | — |
| 300 | `#cdcdcd` | Dark tertiary icons |
| 400 | `#b4b4b4` | — |
| 500 | `#9b9b9b` | — |
| 600 | `#676767` | — |
| 700 | `#424242` | — |
| 800 | `#212121` | **Dark mode primary bg** |
| 900 | `#171717` | — |
| 950 | `#0d0d0d` | **Light mode primary text**, borders |

### Blue

| Level | Value |
|-------|-------|
| 25 | `#f5faff` |
| 50 | `#e5f3ff` |
| 75 | `#cce6ff` |
| 100 | `#99ceff` |
| 200 | `#66b5ff` |
| 300 | `#339cff` |
| 400 | `#0285ff` |
| 500 | `#0169cc` |
| 600 | `#004f99` |
| 700 | `#003f7a` |
| 800 | `#013566` |
| 900 | `#00284d` |
| 950 | `#000e1a` |

### Red

| Level | Value |
|-------|-------|
| 25 | `#fff0f0` |
| 50 | `#ffe1e0` |
| 100 | `#ffa4a2` |
| 400 | `#fa423e` |
| 500 | `#e02e2a` |
| 900 | `#4d100e` |

### Orange

| Level | Value |
|-------|-------|
| 25 | `#fff5f0` |
| 50 | `#ffe7d9` |
| 100 | `#ffb790` |
| 400 | `#fb6a22` |
| 500 | `#e25507` |
| 900 | `#4a2206` |

### Green

| Level | Value |
|-------|-------|
| 25 | `#edfaf2` |
| 50 | `#d9f4e4` |
| 100 | `#8cdfad` |
| 400 | `#04b84c` |
| 500 | `#00a240` |
| 900 | `#003716` |

### Yellow

| Level | Value |
|-------|-------|
| 25 | `#fffbed` |
| 50 | `#fff6d9` |
| 100 | `#ffe48c` |
| 400 | `#ffc300` |
| 500 | `#e0ac00` |

### Purple

| Level | Value |
|-------|-------|
| 25 | `#f9f5fe` |
| 50 | `#efe5fe` |
| 400 | `#924ff7` |
| 500 | `#8046d9` |

### Pink

| Level | Value |
|-------|-------|
| 25 | `#fff4f9` |
| 50 | `#ffe8f3` |
| 400 | `#ff66ad` |
| 500 | `#e04c91` |

---

## Semantic Color Tokens

### Light Mode (`html, .light, .dark .light`)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#fff` | Page background |
| `--bg-primary-inverted` | `#000` | — |
| `--bg-secondary` | `#e8e8e8` | Secondary surfaces |
| `--bg-tertiary` | `#f3f3f3` | Tertiary surfaces |
| `--bg-elevated-primary` | `#fff` | Cards, elevated panels |
| `--bg-elevated-secondary` | `#f9f9f9` | Sidebar bg |
| `--bg-scrim` | `#0d0d0d80` | Overlay/scrim |
| `--text-primary` | `#0d0d0d` | Primary text |
| `--text-secondary` | `#5d5d5d` | Secondary text |
| `--text-tertiary` | `#8f8f8f` | Tertiary/placeholder text |
| `--text-inverted` | `#fff` | Text on dark bg |
| `--icon-primary` | `#0d0d0d` | Primary icons |
| `--icon-secondary` | `#5d5d5d` | Secondary icons |
| `--icon-tertiary` | `#8f8f8f` | Tertiary icons |
| `--border-default` | `#0d0d0d1a` | Default borders (10% alpha) |
| `--border-heavy` | `#0d0d0d26` | Heavy borders (15% alpha) |
| `--border-light` | `#0d0d0d0d` | Light borders (5% alpha) |

#### Light Interactive States

| Token | Default | Hover | Press |
|-------|---------|-------|-------|
| `--interactive-bg-primary` | `#0d0d0d` | `#0d0d0dcc` | `#0d0d0de5` |
| `--interactive-bg-secondary` | `transparent` | `#0d0d0d05` | `#0d0d0d0d` |
| `--interactive-bg-tertiary` | `#fff` | `#f9f9f9` | `#f3f3f3` |
| `--interactive-bg-accent` | `var(--blue-50)` | `var(--blue-75)` | `var(--blue-100)` |
| `--interactive-label-primary` | `#fff` | `#fff` | `#fff` |
| `--interactive-label-secondary` | `#0d0d0d` | `#0d0d0de5` | `#0d0d0dcc` |
| `--interactive-label-tertiary` | `#5d5d5d` | `#5d5d5d` | `#5d5d5d` |
| `--interactive-border-focus` | `#0d0d0d` | — | — |

### Dark Mode (`.dark`)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#212121` | Page background |
| `--bg-primary-inverted` | `#fff` | — |
| `--bg-secondary` | `#303030` | Secondary surfaces, composer bg |
| `--bg-tertiary` | `#414141` | Tertiary surfaces |
| `--bg-elevated-primary` | `#303030` | Cards, elevated panels |
| `--bg-elevated-secondary` | `#181818` | Sidebar bg |
| `--bg-scrim` | `#0d0d0d80` | Overlay/scrim |
| `--text-primary` | `#fff` | Primary text |
| `--text-secondary` | `#f3f3f3` | Secondary text |
| `--text-tertiary` | `#afafaf` | Tertiary/placeholder text |
| `--text-inverted` | `#0d0d0d` | Text on light bg |
| `--icon-primary` | `#e8e8e8` | Primary icons |
| `--icon-secondary` | `#cdcdcd` | Secondary icons |
| `--icon-tertiary` | `#afafaf` | Tertiary icons |
| `--border-default` | `#ffffff26` | Default borders (15% alpha) |
| `--border-heavy` | `#fff3` | Heavy borders (20% alpha) |
| `--border-light` | `#ffffff0d` | Light borders (5% alpha) |

#### Dark Interactive States

| Token | Default | Hover | Press |
|-------|---------|-------|-------|
| `--interactive-bg-primary` | `#fff` | `#fffc` | `#ffffffe5` |
| `--interactive-bg-secondary` | `transparent` | `#ffffff1a` | `#ffffff0d` |
| `--interactive-bg-tertiary` | `#212121` | `#181818` | `#0d0d0d` |
| `--interactive-bg-accent` | `var(--blue-800)` | `var(--blue-700)` | `var(--blue-600)` |
| `--interactive-label-primary` | `#0d0d0d` | `#0d0d0d` | `#0d0d0d` |
| `--interactive-label-secondary` | `#f3f3f3` | `#ffffffe5` | `#fffc` |
| `--interactive-label-tertiary` | `#cdcdcd` | `#cdcdcd` | `#cdcdcd` |
| `--interactive-border-focus` | `#fff` | — | — |

---

## Layout & Spacing

### Page Structure

| Region | Width | Height | Padding |
|--------|-------|--------|---------|
| Sidebar | 260px | 100vh | 0px |
| Header | content width | 52px | 8px |
| Main content | content width | 100vh - header | 0px |
| Composer max-width | 768px (CSS var `--composer-bar_current-width`) | — | — |
| Thread content max-width | `var(--thread-content-max-width)` | — | `var(--thread-content-margin)` |

### Sidebar Links

| Property | Value |
|----------|-------|
| Padding | 6px 10px |
| Border radius | 10px |
| Height | 36px |
| Font size | 14px |
| Font weight | 400 |

### Common Spacing (Tailwind classes used)

| Class | Value |
|-------|-------|
| `gap-1` | 4px |
| `gap-1.5` | 6px |
| `gap-2` | 8px |
| `gap-2.5` | 10px |
| `gap-3` | 12px |
| `p-1` | 4px |
| `p-2` | 8px |
| `p-2.5` | 10px |
| `p-5` | 20px |
| `px-1` | 4px |
| `px-1.5` | 6px |
| `px-2` | 8px |
| `px-2.5` | 10px |
| `px-4` | 16px |
| `mx-2` | 8px |

---

## Border Radius

| Value | Count | Usage |
|-------|-------|-------|
| `10px` | 9 | Sidebar links, navigation items |
| `9999px` (full/pill) | 9 | Pill buttons (Login, Sign up), attach button |
| `8px` | 4 | Icon buttons, model selector |
| `28px` | 1 | **Chat composer container** (superellipse) |
| `16px` | 1 | Cards |

### Tailwind Border Radius Classes

| Class | Value |
|-------|-------|
| `rounded-lg` | 8px |
| `rounded-2xl` | 16px |
| `rounded-full` | 9999px |

---

## Shadows

### Composer Shadow (Dark Mode)

```css
rgba(0, 0, 0, 0.1) 0px 4px 12px 0px,
rgba(255, 255, 255, 0.2) 0px 0px 1px 0px inset
```

### Header Shadow

```css
var(--sharp-edge-top-shadow): 0 1px 0 var(--border-sharp)
```

---

## Component Specifications

### Chat Composer (Input Area)

| Property | Value |
|----------|-------|
| Container border radius | 28px (superellipse via `corner-superellipse/1.1`) |
| Container padding | 10px (`p-2.5`) |
| Container background (dark) | `#303030` (`--bg-secondary`) |
| Container background (light) | `#fff` (`--bg-primary`) |
| Container shadow | `rgba(0,0,0,0.1) 0 4px 12px, rgba(255,255,255,0.2) 0 0 1px inset` |
| Input element | ProseMirror (contenteditable div) |
| Input padding | 0px 0px 16px (bottom only) |
| Input font size | 16px |
| Input line height | 24px |
| Input color (dark) | `#fff` |
| Placeholder text | "Ask anything" |
| Caret color (dark) | `#fff` |

### Toolbar Actions (Below Composer)

| Button | Font Size | Font Weight | Height | Padding | Border |
|--------|-----------|-------------|--------|---------|--------|
| Attach | 13px | 600 | 36px | 8px | 1px solid rgba(255,255,255,0.15) |
| Search | 13px | 500 | 34px | 8px | none |
| Study | 13px | 500 | 34px | 8px | none |
| Create image | 13px | 500 | 34px | 8px | none |
| Voice | — | — | — | — | — |

### Primary Buttons

| Variant | Height | Padding | Border Radius | Background | Color | Font | Border |
|---------|--------|---------|---------------|------------|-------|------|--------|
| CTA (Login sidebar) | 44px | 0 16px | pill (full) | `#212121` | `#fff` | 14px/500 | 1px solid rgba(255,255,255,0.15) |
| Primary (Login header) | 36px | 0 12px | pill (full) | `#f9f9f9` | `#0d0d0d` | 14px/500 | 1px solid transparent |
| Secondary (Sign up) | 36px | 0 12px | pill (full) | `#212121` | `#fff` | 14px/500 | 1px solid rgba(255,255,255,0.15) |
| Icon button | 36px | 0px | 8px | transparent | `#fff` | — | none |
| Model selector | 36px | 0 10px | 8px | transparent | `#fff` | 18px/400 | none |

### Sidebar

| Property | Value |
|----------|-------|
| Width | 260px |
| Background | `var(--sidebar-bg, var(--bg-elevated-secondary))` |
| Link padding | 6px 10px |
| Link border radius | 10px |
| Link height | 36px |
| Link font | 14px / 400 |

---

## Animation System

ChatGPT uses spring-based animations with CSS `linear()` easing functions:

### Spring Presets

| Preset | Duration | Character |
|--------|----------|-----------|
| `--spring-fast` | 0.667s | Quick, no bounce |
| `--spring-common` / `--spring-standard` | 0.667s | Standard motion |
| `--spring-bounce` | 0.833s | Moderate bounce |
| `--spring-fast-bounce` | 1.0s | Fast with bounce |
| `--spring-slow-bounce` | 1.167s | Slow with bounce |
| `--easing-spring-elegant` | 0.582s | Precise elegant spring |

### Transition Patterns

| Pattern | Duration | Easing |
|---------|----------|--------|
| Opacity fade | 0.15s | `steps(1)` or `linear` |
| Color/bg transition | 0.2s | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Content fade | 0.5s | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Shimmer (CoT) | 2.0s | — |

### Common Easing

```css
--easing-common: linear(0, 0, .0001, .0002, ... /* 250+ keyframes for precise spring motion */)
```

---

## Theme System

ChatGPT supports multiple accent color themes (visible in "mini" mode):

| Theme | Label Accent | Accent BG Default |
|-------|-------------|-------------------|
| Default / Blue | `var(--blue-400)` | `var(--blue-50)` |
| Green | `var(--green-400)` | `var(--green-50)` |
| Yellow | `var(--yellow-400)` | `var(--yellow-50)` |
| Purple | `var(--purple-400)` | `var(--purple-50)` |
| Pink | `var(--pink-400)` | `var(--pink-50)` |
| Orange | `var(--orange-400)` | `var(--orange-50)` |
| Black | `#8f8f8f` | `#f9f9f9` |

---

## Status Colors

| Status | Light BG | Light Border | Light Text | Dark BG | Dark Border | Dark Text |
|--------|----------|-------------|------------|---------|-------------|-----------|
| Warning | `var(--orange-25)` | `var(--orange-50)` | `var(--orange-500)` | `var(--orange-900)` | `var(--orange-900)` | `var(--orange-200)` |
| Error | `var(--red-25)` | `var(--red-50)` | `var(--red-500)` | `var(--red-900)` | `var(--red-900)` | `var(--red-200)` |

---

## Key Design Patterns

1. **Superellipse corners** — Composer uses `corner-superellipse/1.1` for iOS-style rounded corners (not standard `border-radius`)
2. **Spring animations** — All meaningful motion uses spring physics via `linear()` easing
3. **Alpha-based borders** — Borders use semi-transparent black/white rather than fixed colors for theme adaptability
4. **Token aliasing** — Semantic tokens reference base scale tokens (e.g., `--text-accent: var(--blue-200)`)
5. **Theme-aware accent** — Accent colors swap between light (50–100 range) and dark (600–800 range) via selector-scoped tokens
6. **Pill buttons** — CTAs use extreme border-radius (`1.67772e+07px` / effectively `9999px`) for pill shape
7. **Inset shadow + outer shadow** — Composer combines outer depth shadow with subtle inset glow for a raised, tactile feel
8. **Tailwind 4** — Uses Tailwind CSS v4 with CSS-based configuration and `var()` references in utility classes
