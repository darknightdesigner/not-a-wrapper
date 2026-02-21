# Composer Border & Shadow — ChatGPT Alignment Analysis

Extracted: 2026-02-20 | Source: Live ChatGPT (chatgpt.com) via Chrome DevTools
Compared against: Not A Wrapper `prompt-input.tsx` + `chat-input.tsx`

---

## Phase 1: Live Extraction

### Extraction Method

CSS values extracted via `window.getComputedStyle()` on `[data-composer-surface="true"]` at `chatgpt.com/c/{id}`. Both light and dark modes tested by toggling `<html class="dark|light">`. Focus state tested by programmatically focusing `#prompt-textarea` and re-reading computed styles. Viewport tested at 500px, 768px (effective), and 1440px+ widths.

### ChatGPT `shadow-short` Utility Definition

ChatGPT defines a custom Tailwind utility `shadow-short` with mode-aware values:

```css
/* Light mode */
.shadow-short {
  --tw-shadow:
    0px 4px 4px 0px var(--tw-shadow-color, var(--shadow-color-1, #0000000a)),
    0px 0px 1px 0px var(--tw-shadow-color, var(--shadow-color-2, #0000009e));
}

/* Dark mode */
.shadow-short:where(.dark, .dark *) {
  --tw-shadow:
    0px 4px 12px 0px var(--tw-shadow-color, var(--shadow-color-1, #0000001a)),
    inset 0px 0px 1px 0px var(--tw-shadow-color, var(--shadow-color-2, #fff3));
}
```

### Comparison Table

| Property | Dark Mode Value | Light Mode Value | Notes |
|----------|----------------|------------------|-------|
| `box-shadow` (layer 1 — drop) | `rgba(0,0,0,0.1) 0px 4px 12px 0px` | `rgba(0,0,0,0.04) 0px 4px 4px 0px` | Dark has 3x blur radius (12px vs 4px) and 2.5x opacity (10% vs 4%) |
| `box-shadow` (layer 2 — edge) | `rgba(255,255,255,0.2) 0px 0px 1px 0px inset` | `rgba(0,0,0,0.62) 0px 0px 1px 0px` | **Critical difference**: dark uses `inset` white glow; light uses `outer` dark edge |
| `border` | `0px solid rgba(255,255,255,0.05)` | `0px solid rgba(13,13,13,0.05)` | **No visible border** — width is 0px. Color is set by Tailwind but unused. |
| `border-width` | `0px` | `0px` | Confirmed: perceived "border" is purely shadow-based |
| `background-color` | `rgb(48, 48, 48)` — `#303030` | `rgb(255, 255, 255)` — `#ffffff` | Dark: `--bg-secondary`. Light: `--bg-primary` |
| `border-radius` | `28px` | `28px` | Plus `corner-superellipse/1.1` for squircle shape |
| `outline` (normal) | `rgb(255,255,255) none 0px` | `rgb(13,13,13) none 0px` | No outline |
| `outline` (focused) | `rgb(255,255,255) none 0px` | `rgb(13,13,13) none 0px` | **No change on focus** |
| `box-shadow` (focused) | Same as unfocused | Same as unfocused | **No change on focus** |
| `border` (focused) | Same as unfocused | Same as unfocused | **No change on focus** |
| `::before` | `content: none` | `content: none` | No pseudo-elements |
| `::after` | `content: none` | `content: none` | No pseudo-elements |
| `transition` | `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, gradients` | Same | `0.2s cubic-bezier(0.4, 0, 0.2, 1)` — **does NOT include box-shadow** |
| `backdrop-filter` | `none` | `none` | ChatGPT does NOT use backdrop blur |
| Responsive (mobile) | Identical shadow values | Identical shadow values | No viewport-dependent changes |
| Container queries | None affecting shadow | None affecting shadow | Shadow is static across all widths |

### Key Design Insight

ChatGPT uses an **inverted edge strategy** between modes:

- **Light mode**: The composer sits on a white page (`#fff`), so the edge is created by an **outer dark shadow** (`rgba(0,0,0,0.62) 0 0 1px`) — a tight, high-opacity black 1px blur that acts as a visible border.
- **Dark mode**: The composer sits on a dark page (`#212121`), so the edge is created by an **inset white glow** (`rgba(255,255,255,0.2) 0 0 1px inset`) — a subtle inner highlight that separates the `#303030` surface from the `#212121` page.

This is more sophisticated than a simple CSS border: it creates a natural, physical feel — like a card with real depth in dark mode and a crisp paper edge in light mode.

---

## Phase 2: Gap Analysis

### Property-by-Property Comparison

| Property | ChatGPT | Not A Wrapper (Current) | Delta | Visual Impact |
|----------|---------|------------------------|-------|---------------|
| **Drop shadow (dark)** | `rgba(0,0,0,0.1) 0 4px 12px` | `shadow-xs` = `0 1px 2px rgba(0,0,0,0.05)` | Much larger blur (12px vs 2px), more opacity (10% vs 5%), more offset (4px vs 1px) | **HIGH** — ChatGPT's composer floats; ours looks flat |
| **Drop shadow (light)** | `rgba(0,0,0,0.04) 0 4px 4px` | `shadow-xs` = `0 1px 2px rgba(0,0,0,0.05)` | Wider blur but lower opacity | **MEDIUM** — both subtle, but ChatGPT has more depth |
| **Edge shadow (dark)** | `inset rgba(255,255,255,0.2) 0 0 1px` | None (uses CSS border instead) | Completely different technique | **HIGH** — ChatGPT has a luminous inner edge; we have a solid border |
| **Edge shadow (light)** | `rgba(0,0,0,0.62) 0 0 1px` (outer) | `1px solid border-input` | Similar visual, different technique | **LOW** — both create a visible edge, though shadow is smoother |
| **Border** | `0px` (none — shadow-only edge) | `1px solid border-input` (oklch-based) | We use actual CSS border; they don't | **MEDIUM** — our border is crisper/harder; their shadow-edge is softer |
| **Background (dark)** | `#303030` (opaque) | `bg-popover` = `oklch(26.45% 0 0)` ≈ `#3f3f3f` | Ours is ~10% lighter | **LOW-MEDIUM** — subtle difference, but affects shadow contrast |
| **Background (light)** | `#ffffff` (opaque) | `bg-popover` = `oklch(1 0 0)` = `#ffffff` | Same | None |
| **Backdrop filter** | `none` | `backdrop-blur-xl` (24px blur) | We add frosted glass; they don't | **MEDIUM** — stylistic choice, but makes our bg semi-transparent |
| **Border radius** | `28px` + `corner-superellipse/1.1` | `rounded-3xl` = `24px` | 4px difference + squircle vs standard | **LOW** — barely noticeable |
| **Focus state** | No visual change | No visual change (inherits from PromptInput) | Same | None |
| **Transition** | `transition-colors 0.2s ease-in-out` (motion-safe) | None on ChatInput wrapper | Missing transition | **LOW** — only matters during theme switching |

### `backdrop-blur-xl` Assessment

Our `backdrop-blur-xl` is a **deliberate stylistic differentiation**, not an oversight. It creates a frosted glass effect by making the background semi-transparent and blurring content behind it. ChatGPT does NOT use this technique — their composer is fully opaque.

**Trade-offs of keeping it:**
- Pro: Distinctive visual identity, modern glass morphism aesthetic
- Con: Requires semi-transparent background (breaks exact color matching), performance cost on low-end devices, doesn't match ChatGPT's design language

**Recommendation:** Whether to keep or remove depends on whether NaW wants to match ChatGPT exactly or maintain visual differentiation. Each solution below offers both options.

### Impact Summary

| Gap | Severity | Effort to Fix |
|-----|----------|---------------|
| Drop shadow too subtle | High | Low (shadow value change) |
| Missing inset edge glow (dark) | High | Low (add inset shadow) |
| Using CSS border instead of shadow edge | Medium | Low (remove border, add shadow) |
| Background color mismatch (dark) | Low-Medium | Low (adjust token) |
| Backdrop blur mismatch | Medium | Design decision |
| Border radius mismatch | Low | Trivial |

---

## Phase 3: Three Long-Term Solutions

### Solution A: "Shadow Token Parity" — Replicate ChatGPT's `shadow-short` as a Custom Tailwind Utility

**Philosophy:** Create an exact replica of ChatGPT's mode-aware shadow system as custom Tailwind theme tokens, achieving near-pixel-perfect parity.

**Implementation:**

`app/globals.css` — Add custom shadow tokens:

```css
@theme {
  /* Composer shadow: ChatGPT "shadow-short" equivalent */
  --shadow-composer:
    0px 4px 4px 0px rgba(0, 0, 0, 0.04),
    0px 0px 1px 0px rgba(0, 0, 0, 0.62);
  --shadow-composer-dark:
    0px 4px 12px 0px rgba(0, 0, 0, 0.1),
    inset 0px 0px 1px 0px rgba(255, 255, 255, 0.2);
}
```

`components/ui/prompt-input.tsx` — Replace shadow and remove border:

```diff
- "border-input bg-background cursor-text rounded-3xl border p-2 shadow-xs",
+ "bg-background cursor-text rounded-[28px] p-2 shadow-composer dark:shadow-composer-dark",
```

`app/components/chat-input/chat-input.tsx` — Update wrapper:

```diff
- className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
+ className="bg-background dark:bg-[#303030] relative z-10 p-0 pt-1"
```

(Shadow is inherited from PromptInput; backdrop-blur removed; bg set to opaque values.)

**Light/dark handling:** Two separate `@theme` tokens, applied via `shadow-composer dark:shadow-composer-dark`. Straightforward Tailwind 4 pattern.

**Focus state:** None needed — matches ChatGPT's no-change-on-focus behavior.

**Backdrop blur:** Removed to match ChatGPT.

**Pros:**
1. Near-pixel-perfect match to ChatGPT's current design
2. Simple implementation — just token definitions and class swaps
3. Clear, readable class names (`shadow-composer`)
4. Easy to audit/update if ChatGPT changes their shadow values
5. No new dependencies or CSS techniques

**Cons:**
1. Hardcoded rgba values don't adapt to custom themes automatically
2. Two separate tokens (light/dark) means maintaining two shadow definitions
3. Removing backdrop-blur loses NaW's frosted glass identity
4. `inset` shadows in Tailwind 4 `@theme` require the full `box-shadow` value (can't use Tailwind's ring/shadow layer system cleanly)
5. Doesn't use CSS custom property indirection for the shadow colors — harder to re-theme

**Browser Compatibility:**
- `box-shadow` with `inset`: Universal support (IE9+)
- `corner-superellipse`: Chrome 135+ only (not implemented here — would need separate solution)
- No concerns for the shadow portion

---

### Solution B: "Semantic Shadow Variables" — CSS Custom Properties with Mode-Aware Color Tokens

**Philosophy:** Build a token-based shadow system using CSS custom properties for the color components, so shadows automatically adapt when the theme changes. The shadow *shape* is defined once; only the *colors* change per mode.

**Implementation:**

`app/globals.css` — Add shadow color tokens to `:root` and `.dark`:

```css
:root {
  /* ...existing tokens... */

  /* Composer shadow color tokens */
  --composer-shadow-drop: rgba(0, 0, 0, 0.04);
  --composer-shadow-edge: rgba(0, 0, 0, 0.62);
  --composer-shadow-drop-offset: 0px 4px 4px 0px;
  --composer-shadow-edge-offset: 0px 0px 1px 0px;
  --composer-bg: var(--background);
}

.dark {
  /* ...existing tokens... */

  /* Composer shadow color tokens (dark overrides) */
  --composer-shadow-drop: rgba(0, 0, 0, 0.1);
  --composer-shadow-edge: rgba(255, 255, 255, 0.2);
  --composer-shadow-drop-offset: 0px 4px 12px 0px;
  --composer-shadow-edge-offset: inset 0px 0px 1px 0px;
  --composer-bg: #303030;
}
```

`app/globals.css` — Add a utility class:

```css
@layer utilities {
  .shadow-composer {
    box-shadow:
      var(--composer-shadow-drop-offset) var(--composer-shadow-drop),
      var(--composer-shadow-edge-offset) var(--composer-shadow-edge);
  }
}
```

`components/ui/prompt-input.tsx`:

```diff
- "border-input bg-background cursor-text rounded-3xl border p-2 shadow-xs",
+ "bg-[var(--composer-bg)] cursor-text rounded-[28px] p-2 shadow-composer",
```

`app/components/chat-input/chat-input.tsx`:

```diff
- className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
+ className="relative z-10 p-0 pt-1"
```

(Shadow and bg are fully handled by PromptInput via CSS variables.)

**Light/dark handling:** Single utility class (`shadow-composer`) that automatically adapts via CSS custom properties scoped to `:root` / `.dark`. No `dark:` prefix needed.

**Focus state:** None needed — matches ChatGPT.

**Backdrop blur:** Removed. To optionally keep it, add `backdrop-blur-xl` back to ChatInput and change `--composer-bg` to use alpha transparency (e.g., `oklch(26.45% 0 0 / 85%)`).

**Pros:**
1. Single shadow class works in both modes — cleaner markup
2. Fully theme-able: future custom themes just override `--composer-shadow-*` vars
3. The shadow *geometry* (offset, blur, spread) can also be tokenized and overridden
4. Natural integration with the existing `:root` / `.dark` token system
5. Easy to extend: add `--composer-shadow-focus-*` tokens later if focus states are desired

**Cons:**
1. More CSS custom properties to maintain (6 new vars)
2. `var()` inside `box-shadow` is harder to read/debug in DevTools than static values
3. `inset` keyword being part of `--composer-shadow-edge-offset` is unusual (the `inset` changes between modes)
4. Can't use Tailwind's built-in shadow color modifier syntax (`shadow-composer/50`)
5. Requires `@layer utilities` block — slightly outside standard `@theme` conventions

**Browser Compatibility:**
- CSS custom properties in `box-shadow`: All modern browsers (no IE11)
- `var()` with `inset` keyword: Works in all modern browsers
- No exotic features used

---

### Solution C: "Hybrid Glass" — ChatGPT Shadow System + Preserved Frosted Glass Identity

**Philosophy:** Adopt ChatGPT's shadow depth and edge treatment while preserving NaW's distinctive frosted glass aesthetic. The shadow creates the depth; the backdrop blur creates the identity.

**Implementation:**

`app/globals.css` — Add shadow tokens (same as Solution B) plus glass-specific bg:

```css
:root {
  /* Composer surface */
  --composer-shadow-drop: rgba(0, 0, 0, 0.04);
  --composer-shadow-edge: rgba(0, 0, 0, 0.5);
  --composer-shadow-drop-offset: 0px 4px 4px 0px;
  --composer-shadow-edge-offset: 0px 0px 1px 0px;
  --composer-bg: oklch(1 0 0 / 80%);
}

.dark {
  --composer-shadow-drop: rgba(0, 0, 0, 0.1);
  --composer-shadow-edge: rgba(255, 255, 255, 0.15);
  --composer-shadow-drop-offset: 0px 4px 12px 0px;
  --composer-shadow-edge-offset: inset 0px 0px 1px 0px;
  --composer-bg: oklch(26.45% 0 0 / 80%);
}
```

Note: Light mode edge opacity reduced from 0.62 to 0.5 because the glass bg already provides some contrast. Dark mode edge reduced from 0.2 to 0.15 for the same reason.

`app/globals.css` — Utility:

```css
@layer utilities {
  .shadow-composer {
    box-shadow:
      var(--composer-shadow-drop-offset) var(--composer-shadow-drop),
      var(--composer-shadow-edge-offset) var(--composer-shadow-edge);
  }
}
```

`components/ui/prompt-input.tsx`:

```diff
- "border-input bg-background cursor-text rounded-3xl border p-2 shadow-xs",
+ "bg-[var(--composer-bg)] cursor-text rounded-[28px] p-2 shadow-composer backdrop-blur-xl",
```

`app/components/chat-input/chat-input.tsx`:

```diff
- className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
+ className="relative z-10 p-0 pt-1"
```

(Backdrop blur moves to PromptInput primitive so it's always paired with the glass bg.)

**Light/dark handling:** CSS custom properties, same as Solution B. The alpha-channel bg values work with `backdrop-blur-xl`.

**Focus state:** None needed.

**Backdrop blur:** Preserved and moved to the primitive level. Shadow edge opacity slightly reduced to compensate for the translucent background.

**Pros:**
1. Maintains NaW's distinctive frosted glass aesthetic
2. Gets ChatGPT's depth and edge treatment (major visual improvement)
3. Fully theme-able via CSS custom properties
4. Backdrop blur at primitive level = consistent across all uses of PromptInput
5. Unique visual identity while borrowing the best of ChatGPT's shadow work

**Cons:**
1. Not pixel-perfect match to ChatGPT (intentionally divergent)
2. Shadow edge opacity needs manual tuning to look good with translucent bg
3. `backdrop-filter` has performance cost on low-end devices and older Safari
4. Semi-transparent bg can look muddy if content behind composer is visually busy
5. More subjective — requires design eye to get edge opacity right with glass

**Browser Compatibility:**
- `backdrop-filter`: Safari 9+, Chrome 76+, Firefox 103+. Good modern support, but older Firefox (<103) falls back to opaque bg.
- Can add `@supports` fallback: `@supports not (backdrop-filter: blur(1px)) { .shadow-composer { --composer-bg: oklch(26.45% 0 0); } }`

---

## Solution Comparison

| Criterion | A: Shadow Token Parity | B: Semantic Shadow Variables | C: Hybrid Glass |
|-----------|:-----:|:-----:|:-----:|
| **Visual Fidelity to ChatGPT** | 5 | 5 | 3 |
| **Maintainability** | 4 | 4 | 3 |
| **Theme Flexibility** | 2 | 5 | 5 |
| **Browser Support** | 5 | 5 | 4 |
| **Code Simplicity** | 5 | 3 | 3 |
| **Visual Identity** | 2 | 2 | 5 |
| **Total** | **23** | **24** | **23** |

---

## Recommendation

**Solution B: "Semantic Shadow Variables"** is recommended.

**Rationale:**

1. **Theme flexibility is critical.** NaW already supports light/dark and may add custom themes. Solution B's CSS variable approach means shadow colors adapt automatically — no `dark:` prefixes, no maintaining parallel token sets.

2. **Visual fidelity matches Solution A** (both score 5/5) because the final computed shadow values are identical. The difference is only in how they're authored.

3. **The backdrop blur question is separable.** Solution B removes it by default (matching ChatGPT), but adding it back is a one-line change (`backdrop-blur-xl` on PromptInput + alpha bg). This can be decided independently.

4. **The `inset` keyword switching between modes** is the trickiest part. Solution B handles this cleanly by putting `inset` inside the offset variable (`--composer-shadow-edge-offset`). This is unusual but works correctly in all modern browsers and is the most flexible approach.

5. **Future-proof.** If ChatGPT changes their shadow (or if NaW wants to diverge), only the CSS custom properties need updating — no class name changes in components.

If NaW wants to preserve the frosted glass identity, **Solution C** is the natural extension — start with Solution B's token system, then layer on backdrop-blur with tuned opacities.
