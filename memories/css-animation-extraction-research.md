# CSS Animation & Motion Extraction Research

Comprehensive reference for systematically extracting CSS animations, transitions, keyframes, and motion design tokens from live web pages using browser automation (JavaScript execution in page context).

---

## 1. CSS Animation Property Inventory

### Animation Properties (Shorthand & Longhand)

| Property | Description | JS Access |
|---|---|---|
| `animation-name` | Name of `@keyframes` rule | `getComputedStyle(el).animationName` |
| `animation-duration` | Length of one cycle | `getComputedStyle(el).animationDuration` |
| `animation-timing-function` | Easing curve | `getComputedStyle(el).animationTimingFunction` |
| `animation-delay` | Wait before start | `getComputedStyle(el).animationDelay` |
| `animation-iteration-count` | Repetitions | `getComputedStyle(el).animationIterationCount` |
| `animation-direction` | Forward/reverse/alternate | `getComputedStyle(el).animationDirection` |
| `animation-fill-mode` | Styles before/after | `getComputedStyle(el).animationFillMode` |
| `animation-play-state` | Running/paused | `getComputedStyle(el).animationPlayState` |
| `animation-timeline` | Scroll/view timeline | `getComputedStyle(el).animationTimeline` |
| `animation-range` | When scroll animation is active | `getComputedStyle(el).animationRange` |

### Transition Properties

| Property | Description | JS Access |
|---|---|---|
| `transition-property` | Which properties transition | `getComputedStyle(el).transitionProperty` |
| `transition-duration` | How long | `getComputedStyle(el).transitionDuration` |
| `transition-timing-function` | Easing | `getComputedStyle(el).transitionTimingFunction` |
| `transition-delay` | Wait before start | `getComputedStyle(el).transitionDelay` |

### Three Access Strategies

**Strategy A: `getComputedStyle()`**
- Returns current resolved values
- Always available, no CORS issues
- Returns the active/computed state, not all declared states
- Good for: reading what is currently applied to an element

**Strategy B: CSSOM (`document.styleSheets[].cssRules[]`)**
- Returns the raw authored CSS rules
- Blocked by CORS for cross-origin stylesheets
- Good for: extracting `@keyframes` definitions, finding all transition/animation declarations

**Strategy C: Web Animations API (`element.getAnimations()`)**
- Returns live Animation objects for running animations
- Includes keyframes, timing, playState, currentTime
- Good for: inspecting running animations, extracting JS-driven animations

---

## 2. Keyframe Extraction via CSSOM

### Core Extraction Pattern

```javascript
function extractAllKeyframes() {
  const keyframesMap = {};
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules || sheet.rules;
    } catch (e) {
      // Cross-origin stylesheet -- blocked by CORS
      console.warn('CORS blocked:', sheet.href);
      continue;
    }
    if (!rules) continue;
    for (const rule of rules) {
      if (rule instanceof CSSKeyframesRule) {
        const frames = [];
        for (let i = 0; i < rule.cssRules.length; i++) {
          const kf = rule.cssRules[i]; // CSSKeyframeRule
          const props = {};
          for (let j = 0; j < kf.style.length; j++) {
            const prop = kf.style[j];
            props[prop] = kf.style.getPropertyValue(prop);
          }
          frames.push({ offset: kf.keyText, properties: props });
        }
        keyframesMap[rule.name] = frames;
      }
    }
  }
  return keyframesMap;
}
```

### CSSKeyframesRule API

The `CSSKeyframesRule` interface (inherits from `CSSRule`) represents a complete `@keyframes` block:

- **`name`** (string): The animation name (e.g., `"shimmer"`, `"fadeIn"`)
- **`cssRules`** (CSSRuleList): List of `CSSKeyframeRule` objects
- **`length`** (number): Count of keyframe stops
- **`findRule(keyText)`**: Find specific stop, e.g., `findRule("50%")`
- **`appendRule(rule)`**: Add a keyframe stop
- **`deleteRule(keyText)`**: Remove a keyframe stop

Each `CSSKeyframeRule` has:
- **`keyText`** (string): The stop position (`"0%"`, `"50%"`, `"100%"`, etc.; `from` maps to `"0%"`, `to` maps to `"100%"`)
- **`style`** (CSSStyleDeclaration): All CSS properties at that stop, readable via `style.getPropertyValue(prop)` or `style[prop]`

### Handling Cross-Origin Stylesheets (CORS)

Cross-origin stylesheets (e.g., CDN-hosted CSS) block `cssRules` access:

```javascript
try {
  const rules = sheet.cssRules;
} catch (e) {
  // DOMException: CSSStyleSheet.cssRules getter:
  // Not allowed to access cross-origin stylesheet
}
```

**Workarounds:**
1. **CORS headers on server**: Add `Access-Control-Allow-Origin` header and `crossorigin` attribute on `<link>`
2. **Fetch and re-inject**: Fetch the CSS text via `fetch()` (if CORS allows), create a `<style>` tag, inject it, then read rules from the injected sheet
3. **Chrome extension content scripts**: Extensions can bypass CORS for stylesheet access in some browsers (Firefox has restrictions; see bug 1393022)
4. **Chrome DevTools Protocol**: The CDP can access all stylesheet content regardless of origin via `CSS.getStyleSheetText`

### Handling CSS-in-JS (styled-components, Emotion)

CSS-in-JS libraries inject styles in different ways:

1. **`<style>` tags**: styled-components and Emotion typically inject `<style>` elements into `<head>`. These are same-origin and fully accessible via `document.styleSheets`.

2. **Constructable Stylesheets / `adoptedStyleSheets`**: Used by some web component frameworks. Access via:
   ```javascript
   // For document-level adopted stylesheets
   for (const sheet of document.adoptedStyleSheets) {
     for (const rule of sheet.cssRules) { /* ... */ }
   }
   // For shadow DOM
   const shadowRoot = element.shadowRoot;
   if (shadowRoot) {
     for (const sheet of shadowRoot.adoptedStyleSheets) { /* ... */ }
   }
   ```

3. **Dynamic injection**: CSS-in-JS may add/remove rules dynamically. Use `MutationObserver` on `<head>` to detect new `<style>` tags:
   ```javascript
   const observer = new MutationObserver((mutations) => {
     for (const mutation of mutations) {
       for (const node of mutation.addedNodes) {
         if (node.tagName === 'STYLE') {
           // New stylesheet injected -- extract rules
         }
       }
     }
   });
   observer.observe(document.head, { childList: true });
   ```

### `<style>` Tags vs External `.css` Files

Both appear in `document.styleSheets`. The difference:
- **`<style>` tags**: `sheet.href` is `null`, `sheet.ownerNode` is the `<style>` element
- **External `.css`**: `sheet.href` contains the URL, may be CORS-blocked

```javascript
for (const sheet of document.styleSheets) {
  const source = sheet.href ? `External: ${sheet.href}` :
                 `Inline: <style> in ${sheet.ownerNode?.parentElement?.tagName}`;
  // ... extract rules
}
```

---

## 3. Transition Extraction Methods

### Reading Current Transitions from Computed Style

```javascript
function getElementTransitions(el) {
  const cs = getComputedStyle(el);
  return {
    property: cs.transitionProperty,     // e.g., "opacity, transform"
    duration: cs.transitionDuration,      // e.g., "0.3s, 0.5s"
    timingFunction: cs.transitionTimingFunction, // e.g., "ease, cubic-bezier(0.4, 0, 0.2, 1)"
    delay: cs.transitionDelay,            // e.g., "0s, 0.1s"
  };
}
```

**Limitation**: `getComputedStyle()` returns the *currently applied* transition definition. It does not reveal what states (hover, focus, active) have different transitions.

### Extracting Transitions from Stylesheet Rules

To find all transition declarations across all rules:

```javascript
function extractAllTransitionRules() {
  const transitions = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const style = rule.style;
        if (style.transition || style.transitionProperty) {
          transitions.push({
            selector: rule.selectorText,
            transition: style.transition,
            property: style.transitionProperty,
            duration: style.transitionDuration,
            timingFunction: style.transitionTimingFunction,
            delay: style.transitionDelay,
          });
        }
      }
    }
  }
  return transitions;
}
```

### Mapping Transitions to State Changes

Pseudo-class transitions (`:hover`, `:focus`, `:active`) require walking CSS rules:

```javascript
function findStateTransitions() {
  const stateTransitions = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const sel = rule.selectorText;
        const pseudoMatch = sel.match(/:(\w[\w-]*)/);
        if (pseudoMatch && rule.style.transition) {
          stateTransitions.push({
            selector: sel,
            pseudoClass: pseudoMatch[1],
            transition: rule.style.transition,
          });
        }
      }
    }
  }
  return stateTransitions;
}
```

### Detecting Active Transitions via WAAPI

```javascript
// Catch transitions as they happen
document.getAnimations().filter(a => a instanceof CSSTransition).map(t => ({
  property: t.transitionProperty,
  element: t.effect.target,
  timing: t.effect.getComputedTiming(),
  keyframes: t.effect.getKeyframes(),
}));
```

---

## 4. Timing Function Analysis

### Named Curves and Their Cubic-Bezier Equivalents

| Name | cubic-bezier() | Description |
|---|---|---|
| `linear` | `cubic-bezier(0, 0, 1, 1)` | Constant speed |
| `ease` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Default, slow start/end |
| `ease-in` | `cubic-bezier(0.42, 0, 1, 1)` | Slow start |
| `ease-out` | `cubic-bezier(0, 0, 0.58, 1)` | Slow end |
| `ease-in-out` | `cubic-bezier(0.42, 0, 0.58, 1)` | Slow start and end |

### Extracting cubic-bezier Values

`getComputedStyle()` normalizes named curves to their `cubic-bezier()` form in most browsers:

```javascript
const easing = getComputedStyle(el).animationTimingFunction;
// "cubic-bezier(0.42, 0, 0.58, 1)" or "ease-in-out"

// Parse cubic-bezier values
const match = easing.match(/cubic-bezier\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
if (match) {
  const [_, x1, y1, x2, y2] = match.map(Number);
}
```

### Steps Function

```javascript
const easing = getComputedStyle(el).animationTimingFunction;
// "steps(4, jump-start)" or "steps(6, end)"
const stepsMatch = easing.match(/steps\((\d+)(?:,\s*(\w[\w-]*))?\)/);
if (stepsMatch) {
  const count = parseInt(stepsMatch[1]);
  const position = stepsMatch[2] || 'end'; // start, end, jump-start, jump-end, jump-both, jump-none
}
```

### CSS `linear()` Function (Modern)

The `linear()` function enables complex easing curves by specifying discrete points with linear interpolation between them:

```css
animation-timing-function: linear(0, 0.25, 1);
/* Three stops at 0%, 50%, 100% - equidistant by default */

animation-timing-function: linear(0, 0.25 75%, 1);
/* Three stops: 0% -> 0, 75% -> 0.25, 100% -> 1 */
```

Parsing `linear()` from computed style:
```javascript
const easing = getComputedStyle(el).animationTimingFunction;
const linearMatch = easing.match(/^linear\((.+)\)$/);
if (linearMatch) {
  const stops = linearMatch[1].split(',').map(s => {
    const parts = s.trim().split(/\s+/);
    return {
      value: parseFloat(parts[0]),
      position: parts[1] || null, // percentage, if specified
    };
  });
}
```

Browser support: Chrome 113+, Firefox 112+, Safari 17.2+.

### Spring Animations

CSS has no native `spring()` function. Springs are implemented through:

**1. CSS `linear()` Approximation (Modern Approach)**

Spring physics (stiffness, damping, mass) are simulated in JavaScript, sampled at many points, and output as a `linear()` easing function with 40+ stops:

```css
:root {
  --spring-smooth: linear(
    0, 0.002, 0.01, 0.025, 0.046, 0.074, 0.109, 0.151,
    0.199, 0.254, 0.314, 0.379, 0.449, 0.522, 0.597,
    0.674, 0.751, 0.827, 0.9, 0.968, 1.03, 1.085,
    1.131, 1.168, 1.196, 1.214, 1.223, 1.224, 1.218,
    1.206, 1.189, 1.169, 1.147, 1.124, 1.1, 1.078,
    1.057, 1.038, 1.022, 1.008, 0.997, 0.989, 0.984,
    0.981, 0.98, 0.981, 0.984, 0.988, 0.993, 0.998, 1
  );
  --spring-smooth-time: 1000ms;
}
```

The pattern uses a CSS custom property for the easing + a companion duration property. Values can exceed 1.0 (overshoot) to simulate bounce.

**Tools:**
- [Linear Easing Generator](https://linear-easing-generator.netlify.app/) by Jake Archibald and Adam Argyle
- [CSS Spring Easing Generator](https://www.kvin.me/css-springs)
- [tailwindcss-spring plugin](https://github.com/KevinGrajeda/tailwindcss-spring)

**2. JavaScript Spring Libraries**

Libraries like react-spring and Framer Motion simulate spring physics frame-by-frame:

- **react-spring**: Uses `requestAnimationFrame` to update inline styles or WAAPI. Spring config: `{ tension, friction, mass }`.
- **Framer Motion**: Can use CSS transforms or WAAPI. Spring config: `{ stiffness, damping, mass }`. Automatically decides CSS vs JS.
- **GSAP**: Uses its own rendering engine with `requestAnimationFrame`. Supports custom easing.

**3. Detecting Spring Custom Properties**

```javascript
function findSpringTokens() {
  const rootStyles = getComputedStyle(document.documentElement);
  const springVars = [];
  // Check common spring variable names
  const names = ['--spring-fast', '--spring-bounce', '--spring-smooth',
                 '--spring-snappy', '--spring-slow', '--spring-default'];
  for (const name of names) {
    const val = rootStyles.getPropertyValue(name).trim();
    if (val) springVars.push({ name, value: val });
  }
  return springVars;
}
```

### Reverse-Engineering Easing from a Running Animation

Sample an animation with `requestAnimationFrame` to reconstruct the easing curve:

```javascript
function sampleAnimation(element, cssProperty, durationMs) {
  return new Promise(resolve => {
    const samples = [];
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      const value = getComputedStyle(element)[cssProperty];
      samples.push({ t, value, elapsed });
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve(samples);
      }
    }
    requestAnimationFrame(frame);
  });
}
// Usage: trigger animation, then call sampleAnimation(el, 'opacity', 300)
// Analyze samples to reconstruct easing curve
```

To fit a `cubic-bezier` to the samples, use least-squares curve fitting against the Bezier parameterization. The [bezier-easing](https://github.com/gre/bezier-easing) library provides reference implementations for evaluation.

---

## 5. JavaScript Animation Detection

### Web Animations API: `element.getAnimations()`

Returns an array of `Animation` objects (CSS Animations, CSS Transitions, and WAAPI animations):

```javascript
function inspectElementAnimations(el) {
  return el.getAnimations().map(anim => {
    const effect = anim.effect;
    const timing = effect.getComputedTiming();
    const keyframes = effect.getKeyframes();
    return {
      // Identify type
      type: anim instanceof CSSAnimation ? 'css-animation' :
            anim instanceof CSSTransition ? 'css-transition' : 'web-animation',
      // CSS-specific
      animationName: anim.animationName || null,   // CSSAnimation
      transitionProperty: anim.transitionProperty || null, // CSSTransition
      // Timing
      duration: timing.duration,
      delay: timing.delay,
      endDelay: timing.endDelay,
      iterations: timing.iterations,
      direction: timing.direction,
      fill: timing.fill,
      easing: timing.easing,
      // State
      playState: anim.playState,     // 'running', 'paused', 'finished', 'idle'
      currentTime: anim.currentTime,
      startTime: anim.startTime,
      playbackRate: anim.playbackRate,
      // Keyframes
      keyframes: keyframes.map(kf => ({
        offset: kf.offset,
        easing: kf.easing,
        composite: kf.composite,
        ...Object.fromEntries(
          Object.entries(kf).filter(([k]) =>
            !['offset', 'easing', 'composite', 'computedOffset'].includes(k)
          )
        ),
      })),
    };
  });
}
```

### `document.getAnimations()` for Page-Wide Scan

```javascript
function getAllPageAnimations() {
  const all = document.getAnimations();
  return {
    total: all.length,
    cssAnimations: all.filter(a => a instanceof CSSAnimation).length,
    cssTransitions: all.filter(a => a instanceof CSSTransition).length,
    webAnimations: all.filter(a =>
      !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)
    ).length,
    running: all.filter(a => a.playState === 'running').length,
    paused: all.filter(a => a.playState === 'paused').length,
  };
}
```

### Distinguishing CSSAnimation vs CSSTransition vs WAAPI

```javascript
const animations = document.getAnimations();
animations.forEach(anim => {
  if (anim.animationName) {
    // CSSAnimation -- has animationName property
    console.log('CSS Animation:', anim.animationName);
  } else if (anim.transitionProperty) {
    // CSSTransition -- has transitionProperty property
    console.log('CSS Transition on:', anim.transitionProperty);
  } else {
    // Web Animations API (Element.animate() or new Animation())
    console.log('WAAPI Animation');
  }
});
```

### Detecting requestAnimationFrame-Based Animations

rAF animations cannot be directly detected because they are just function calls modifying styles. Indirect detection strategies:

1. **MutationObserver on `style` attribute**: Detect rapid inline style changes
   ```javascript
   const observer = new MutationObserver(mutations => {
     for (const m of mutations) {
       if (m.attributeName === 'style') {
         // Element's inline style is being rapidly updated -- likely rAF animation
       }
     }
   });
   observer.observe(element, { attributes: true, attributeFilter: ['style'] });
   ```

2. **Monkey-patch `requestAnimationFrame`**: Intercept to count active animation loops
   ```javascript
   const origRAF = window.requestAnimationFrame;
   let rafCount = 0;
   window.requestAnimationFrame = function(cb) {
     rafCount++;
     return origRAF.call(window, function(ts) {
       cb(ts);
     });
   };
   ```

### How JS Animation Libraries Inject Animations

| Library | Primary Mechanism | Detection |
|---|---|---|
| **GSAP** | Inline styles via rAF | MutationObserver on `style`, `gsap.globalTimeline.getChildren()` if GSAP is on `window` |
| **Framer Motion** | WAAPI for simple, rAF for complex | `getAnimations()` for WAAPI, check `window.__FRAMER_MOTION__` |
| **react-spring** | rAF + inline styles or WAAPI | MutationObserver, or `SpringRef` if accessible |
| **Anime.js** | rAF + inline styles | `anime.running` array if available on `window` |
| **Motion (motion.dev)** | WAAPI primarily | `getAnimations()` returns Motion-created animations |
| **CSS Animations** | Browser engine (compositor) | `getAnimations()` returns `CSSAnimation` instances |
| **CSS Transitions** | Browser engine (compositor) | `getAnimations()` returns `CSSTransition` instances |

---

## 6. Transform & Motion Path Extraction

### Parsing Transform Values

```javascript
function extractTransform(el) {
  const cs = getComputedStyle(el);
  return {
    transform: cs.transform,           // "matrix(1, 0, 0, 1, 100, 0)" or "none"
    transformOrigin: cs.transformOrigin, // "50% 50% 0px"
    perspective: cs.perspective,         // "none" or "500px"
    perspectiveOrigin: cs.perspectiveOrigin,
    willChange: cs.willChange,          // "transform, opacity" or "auto"
    backfaceVisibility: cs.backfaceVisibility,
    transformStyle: cs.transformStyle,   // "flat" or "preserve-3d"
  };
}
```

**Note**: `getComputedStyle` resolves all transforms to a `matrix()` or `matrix3d()`. The original `translate()`, `rotate()`, `scale()` functions are lost. To get the authored values, walk CSSOM rules or use individual transform properties (Chrome 104+):

```javascript
// Individual transform properties (modern browsers)
const cs = getComputedStyle(el);
cs.translate;  // "100px 0px"
cs.rotate;     // "45deg"
cs.scale;      // "1.5"
```

### Matrix Decomposition

To extract translate/rotate/scale from a computed `matrix()`:

```javascript
function decomposeMatrix(matrixStr) {
  const match = matrixStr.match(/matrix\(([^)]+)\)/);
  if (!match) return null;
  const [a, b, c, d, tx, ty] = match[1].split(',').map(Number);
  return {
    translateX: tx,
    translateY: ty,
    scaleX: Math.sqrt(a * a + b * b),
    scaleY: Math.sqrt(c * c + d * d),
    rotation: Math.atan2(b, a) * (180 / Math.PI),
    skewX: Math.atan2(a * c + b * d, a * d - b * c) * (180 / Math.PI),
  };
}
```

### Motion Path Properties

```javascript
function extractMotionPath(el) {
  const cs = getComputedStyle(el);
  return {
    offsetPath: cs.offsetPath,         // "path('M 0 0 L 100 100')" or "none"
    offsetDistance: cs.offsetDistance,   // "50%"
    offsetRotate: cs.offsetRotate,     // "auto" or "45deg"
    offsetAnchor: cs.offsetAnchor,     // "auto" or "50% 50%"
    offsetPosition: cs.offsetPosition, // "auto" or coordinates
  };
}
```

### `will-change` as Animation Hint

`will-change` is a signal that a property will be animated:

```javascript
function findAnimationHints() {
  const hints = [];
  document.querySelectorAll('*').forEach(el => {
    const wc = getComputedStyle(el).willChange;
    if (wc && wc !== 'auto') {
      hints.push({
        element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
        willChange: wc,
      });
    }
  });
  return hints;
}
```

---

## 7. Animation Trigger Mapping

### Page Load Animations

Detected via `@keyframes` with `animation` on non-pseudoclass selectors:

```javascript
function findPageLoadAnimations() {
  return document.getAnimations()
    .filter(a => a instanceof CSSAnimation && a.playState === 'running')
    .map(a => ({
      name: a.animationName,
      target: a.effect.target?.tagName,
      timing: a.effect.getComputedTiming(),
    }));
}
```

### Scroll-Driven Animations

CSS scroll-driven animations use `animation-timeline: scroll()` or `animation-timeline: view()`:

```javascript
function findScrollAnimations() {
  const results = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.style && rule.style.animationTimeline) {
          const timeline = rule.style.animationTimeline;
          if (timeline.includes('scroll') || timeline.includes('view')) {
            results.push({
              selector: rule.selectorText,
              timeline: timeline,
              animationName: rule.style.animationName,
              animationRange: rule.style.animationRange || null,
            });
          }
        }
      }
    } catch (e) { continue; }
  }
  return results;
}
```

The Chrome DevTools Protocol also exposes `viewOrScrollTimeline` on animation objects, containing `sourceNodeId`, `axis`, `startOffset`, and `endOffset`.

### Hover/Focus State Transitions

Found by searching CSS rules for pseudo-class selectors with transition/animation:

```javascript
function findPseudoStateAnimations() {
  const pseudoAnimations = [];
  const pseudoPattern = /:(hover|focus|focus-within|focus-visible|active|checked|disabled)/;
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText && pseudoPattern.test(rule.selectorText)) {
          if (rule.style.transition || rule.style.animation) {
            pseudoAnimations.push({
              selector: rule.selectorText,
              pseudoClass: rule.selectorText.match(pseudoPattern)[1],
              transition: rule.style.transition || null,
              animation: rule.style.animation || null,
            });
          }
        }
      }
    } catch (e) { continue; }
  }
  return pseudoAnimations;
}
```

### Class-Toggling Animations

Many frameworks toggle classes to trigger CSS animations (e.g., `.fade-in`, `.slide-up`, `[data-state="open"]`):

```javascript
// Detect class-based animation triggers via MutationObserver
function watchClassAnimations() {
  const triggered = [];
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const el = m.target;
        const anims = el.getAnimations();
        if (anims.length > 0) {
          triggered.push({
            element: el.tagName,
            classList: [...el.classList],
            animations: anims.map(a => a.animationName || a.transitionProperty),
          });
        }
      }
    }
  });
  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  return { observer, triggered };
}
```

### `data-state` Transitions (Radix UI Pattern)

Radix UI uses `[data-state="open"]` / `[data-state="closed"]` attributes:

```javascript
function findDataStateAnimations() {
  const results = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText && /\[data-state/.test(rule.selectorText)) {
          if (rule.style.animation || rule.style.transition || rule.style.transform !== 'none') {
            results.push({
              selector: rule.selectorText,
              animation: rule.style.animation || null,
              transition: rule.style.transition || null,
            });
          }
        }
      }
    } catch (e) { continue; }
  }
  return results;
}
```

### Prefers-Reduced-Motion Alternatives

```javascript
function findReducedMotionRules() {
  const results = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSMediaRule &&
            rule.conditionText?.includes('prefers-reduced-motion')) {
          const innerRules = [];
          for (const inner of rule.cssRules) {
            innerRules.push({
              selector: inner.selectorText,
              cssText: inner.cssText,
            });
          }
          results.push({
            condition: rule.conditionText,
            rules: innerRules,
          });
        }
      }
    } catch (e) { continue; }
  }
  return results;
}

// Check user preference
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

---

## 8. Motion Design Token Organization

### Duration Scale (Common Patterns)

**Material Design 3 Tokens:**
| Token | Value | Usage |
|---|---|---|
| `--md-sys-motion-duration-short1` | 50ms | Micro-interactions |
| `--md-sys-motion-duration-short2` | 100ms | Quick feedback |
| `--md-sys-motion-duration-short3` | 150ms | Small transitions |
| `--md-sys-motion-duration-short4` | 200ms | Standard transitions |
| `--md-sys-motion-duration-medium1` | 250ms | Medium transitions |
| `--md-sys-motion-duration-medium2` | 300ms | Panel slides |
| `--md-sys-motion-duration-medium3` | 350ms | Larger movements |
| `--md-sys-motion-duration-medium4` | 400ms | Complex transitions |
| `--md-sys-motion-duration-long1` | 450ms | Full-screen transitions |
| `--md-sys-motion-duration-long2` | 500ms | Large area changes |
| `--md-sys-motion-duration-long3` | 550ms | Complex choreography |
| `--md-sys-motion-duration-long4` | 600ms | Elaborate sequences |
| `--md-sys-motion-duration-extra-long1` | 700ms | Very large transitions |
| `--md-sys-motion-duration-extra-long2` | 800ms | Page transitions |
| `--md-sys-motion-duration-extra-long3` | 900ms | Extended animations |
| `--md-sys-motion-duration-extra-long4` | 1000ms | Slowest standard |

**Material Design 3 Easing Tokens:**
| Token | Value | Usage |
|---|---|---|
| `--md-sys-motion-easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default movement |
| `--md-sys-motion-easing-standard-decelerate` | `cubic-bezier(0, 0, 0, 1)` | Entering elements |
| `--md-sys-motion-easing-standard-accelerate` | `cubic-bezier(0.3, 0, 1, 1)` | Exiting elements |
| `--md-sys-motion-easing-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | Important movements |
| `--md-sys-motion-easing-emphasized-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Enter emphasis |
| `--md-sys-motion-easing-emphasized-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Exit emphasis |
| `--md-sys-motion-easing-linear` | `cubic-bezier(0, 0, 1, 1)` | Constant rate |

**Simplified Token Scale:**
```css
:root {
  /* Durations */
  --duration-instant: 0ms;
  --duration-xs: 100ms;
  --duration-sm: 150ms;
  --duration-md: 200ms;
  --duration-lg: 300ms;
  --duration-xl: 500ms;
  --duration-2xl: 700ms;

  /* Easings */
  --ease-default: cubic-bezier(0.2, 0, 0, 1);
  --ease-in: cubic-bezier(0.42, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.58, 1);
  --ease-in-out: cubic-bezier(0.42, 0, 0.58, 1);
  --ease-spring: linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%,
    0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%,
    1.015 55%, 1.017 63.9%, 1.001 85.9%, 1);
}
```

### Tailwind CSS Animation Tokens

Tailwind organizes animations as utility classes:
```javascript
// Default Tailwind animation configuration
{
  animation: {
    none: 'none',
    spin: 'spin 1s linear infinite',
    ping: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
    pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    bounce: 'bounce 1s infinite',
  },
  keyframes: {
    spin: { to: { transform: 'rotate(360deg)' } },
    ping: { '75%, 100%': { transform: 'scale(2)', opacity: '0' } },
    pulse: { '50%': { opacity: '.5' } },
    bounce: {
      '0%, 100%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0.8,0,1,1)' },
      '50%': { transform: 'none', animationTimingFunction: 'cubic-bezier(0,0,0.2,1)' },
    },
  },
}
```

### Extracting CSS Custom Property Tokens from a Page

```javascript
function extractMotionTokens() {
  const root = getComputedStyle(document.documentElement);
  const tokens = { durations: {}, easings: {}, springs: {}, animations: {} };

  // Get all custom properties from stylesheets
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === ':root' || rule.selectorText === ':host') {
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (prop.startsWith('--')) {
              const val = rule.style.getPropertyValue(prop).trim();
              if (/^\d+m?s$/.test(val)) {
                tokens.durations[prop] = val;
              } else if (/cubic-bezier|linear\(|ease|steps/.test(val)) {
                tokens.easings[prop] = val;
              } else if (/spring/.test(prop)) {
                tokens.springs[prop] = val;
              }
            }
          }
        }
      }
    } catch (e) { continue; }
  }
  return tokens;
}
```

---

## 9. Shimmer & Loading Animation Extraction

### CSS Gradient-Based Shimmer Pattern

The standard shimmer effect uses a moving linear-gradient:

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.shimmer {
  background: linear-gradient(
    100deg,
    #ececec 30%,
    #f5f5f5 50%,
    #ececec 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-out infinite;
}
```

### Skeleton Screen Pulse Pattern

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.skeleton {
  background-color: #e0e0e0;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

### Detecting Shimmer/Skeleton on a Page

```javascript
function findShimmerAnimations() {
  const keyframesMap = {};
  // First, collect all keyframes
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSKeyframesRule) {
          const frames = [];
          for (let i = 0; i < rule.cssRules.length; i++) {
            const kf = rule.cssRules[i];
            const props = {};
            for (let j = 0; j < kf.style.length; j++) {
              props[kf.style[j]] = kf.style.getPropertyValue(kf.style[j]);
            }
            frames.push({ offset: kf.keyText, props });
          }
          keyframesMap[rule.name] = frames;
        }
      }
    } catch (e) { continue; }
  }

  // Identify shimmer patterns
  const shimmerKeyframes = {};
  for (const [name, frames] of Object.entries(keyframesMap)) {
    const allProps = frames.flatMap(f => Object.keys(f.props));
    const isShimmer = allProps.some(p =>
      p.includes('background-position') || p.includes('background-size')
    );
    const isPulse = allProps.some(p => p === 'opacity') &&
                    frames.length <= 3;
    if (isShimmer || isPulse) {
      shimmerKeyframes[name] = { type: isShimmer ? 'shimmer' : 'pulse', frames };
    }
  }
  return shimmerKeyframes;
}
```

### Typing Indicator Patterns

Typing indicators typically use staggered bounce animations:

```css
@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.15s; }
.dot:nth-child(3) { animation-delay: 0.3s; }
```

### Streaming Text Cursor Animation

```css
@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.cursor {
  animation: blink-cursor 1s step-end infinite;
}
```

---

## 10. MCP Output Optimization

### The Truncation Problem

The Claude in Chrome MCP `javascript_tool` truncates output at approximately 1500 characters. Animation data can be verbose. Strategies:

### Strategy 1: Compact JSON Output

```javascript
// BAD: verbose output
JSON.stringify(keyframes, null, 2); // Will truncate

// GOOD: compact output
JSON.stringify(keyframes); // No pretty-print
```

### Strategy 2: Batched Extraction

Split extraction into multiple focused calls:

**Call 1: Keyframe names and stop counts**
```javascript
(() => {
  const r = {};
  for (const s of document.styleSheets) {
    try {
      for (const ru of s.cssRules) {
        if (ru instanceof CSSKeyframesRule)
          r[ru.name] = ru.cssRules.length;
      }
    } catch(e) {}
  }
  return JSON.stringify(r);
})()
```

**Call 2: Specific keyframe details**
```javascript
(() => {
  for (const s of document.styleSheets) {
    try {
      for (const r of s.cssRules) {
        if (r instanceof CSSKeyframesRule && r.name === 'TARGET_NAME') {
          const f = [];
          for (let i = 0; i < r.cssRules.length; i++) {
            const k = r.cssRules[i];
            const p = {};
            for (let j = 0; j < k.style.length; j++)
              p[k.style[j]] = k.style.getPropertyValue(k.style[j]);
            f.push({ o: k.keyText, p });
          }
          return JSON.stringify(f);
        }
      }
    } catch(e) {}
  }
})()
```

**Call 3: Active animations summary**
```javascript
(() => {
  return JSON.stringify(document.getAnimations().map(a => ({
    t: a instanceof CSSAnimation ? 'A' : a instanceof CSSTransition ? 'T' : 'W',
    n: a.animationName || a.transitionProperty || '',
    s: a.playState[0], // 'r', 'p', 'f', 'i'
    d: a.effect?.getComputedTiming()?.duration,
  })));
})()
```

### Strategy 3: Targeted Element Inspection

```javascript
((sel) => {
  const el = document.querySelector(sel);
  if (!el) return 'not found';
  const cs = getComputedStyle(el);
  return JSON.stringify({
    anim: cs.animation,
    trans: cs.transition,
    tf: cs.transform,
    wc: cs.willChange,
  });
})('.target-selector')
```

### Approximate Capacity per Call

- ~15-20 keyframe names with stop counts
- ~3-5 full keyframe definitions (depending on property count)
- ~20-30 animation summary objects (compact format)
- ~10 full element animation inspections

---

## 11. ChatGPT-Specific Animation Research

Based on common patterns observed in ChatGPT's web interface:

### Likely Animation Inventory

| Animation | Type | Implementation |
|---|---|---|
| Message streaming shimmer | CSS `@keyframes` | Gradient `background-position` animation on streaming content |
| Sidebar open/close | CSS transition or spring | `transform: translateX()` with duration ~300ms |
| Model selector dropdown | CSS transition | `opacity` + `transform: scale/translateY` with ~200ms |
| Tooltip fade-in/out | CSS transition | `opacity` transition ~150ms ease |
| Button hover states | CSS transition | `background-color`, `opacity` ~100-150ms |
| Message bubble appear | CSS animation or WAAPI | `opacity` + `translateY` fade-up ~200-300ms |
| Scroll-to-bottom button | CSS transition | `opacity` + `pointer-events` toggle ~200ms |
| Copy confirmation | CSS animation | Brief opacity flash or checkmark morph ~300ms |
| Canvas/artifact panel | CSS transition or spring | `transform: translateX()` slide from right ~300-400ms |
| Thinking dots/shimmer | CSS `@keyframes` | Gradient shimmer or dot bounce animation |
| Code block expand | CSS transition | `max-height` or `height` transition ~200ms |

### Spring Custom Properties (Likely Pattern)

ChatGPT appears to use CSS custom property tokens for spring-like easing:

```css
:root {
  --spring-fast: linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%,
    0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24%, 1.111 25.2%,
    1.098 27.2%, 1.061 30%, 0.997 36.2%, 0.978 39.5%,
    0.975 43.3%, 0.997 55.5%, 1.003 62.3%, 1);
  --spring-bounce: linear(0, 0.004, 0.016, 0.035, 0.063, 0.098,
    0.141, 0.191, 0.25, 0.316, 0.391 18.2%, 0.563, 0.766,
    1.006, 1.094 30.3%, 1.133, 1.139 35.5%, 1.109, 1.062,
    1.015 44.4%, 0.997, 0.991, 0.997 55.5%, 1.003 62.3%, 1);
}
```

These would be `linear()` easing functions approximating spring physics, used as:
```css
.sidebar {
  transition: transform 400ms var(--spring-fast);
}
```

### Extraction Strategy for ChatGPT

1. **First call**: Extract all CSS custom properties from `:root`
2. **Second call**: Extract all `@keyframes` names and stop counts
3. **Third call**: Get `document.getAnimations()` summary
4. **Fourth call**: Inspect specific elements (sidebar, message area, model selector)
5. **Fifth call**: Extract specific keyframe definitions for identified animations

---

## 12. Browser APIs for Runtime Animation Inspection

### `document.getAnimations()`

Returns ALL active animations on the page:
```javascript
const allAnims = document.getAnimations();
// Returns: Animation[] (includes CSSAnimation, CSSTransition, WAAPI Animation)
```

### `element.getAnimations({ subtree: true })`

Returns animations on an element and all its descendants:
```javascript
const anims = document.querySelector('.chat-container')
  .getAnimations({ subtree: true });
```

### `Animation.effect.getKeyframes()`

Extract keyframe data from any running animation:
```javascript
anim.effect.getKeyframes();
// Returns: [
//   { offset: 0, easing: 'ease', opacity: '0', transform: 'translateY(10px)' },
//   { offset: 1, easing: 'ease', opacity: '1', transform: 'translateY(0)' },
// ]
```

### `Animation.effect.getComputedTiming()`

Full timing details:
```javascript
anim.effect.getComputedTiming();
// Returns: {
//   delay: 0,
//   endDelay: 0,
//   fill: 'none',
//   iterationStart: 0,
//   iterations: 1,
//   duration: 300,
//   direction: 'normal',
//   easing: 'linear',
//   endTime: 300,
//   activeDuration: 300,
//   localTime: 150,
//   progress: 0.5,
//   currentIteration: 0,
// }
```

### Pausing/Slowing All Animations

```javascript
// Pause all
document.getAnimations().forEach(a => a.pause());

// Slow to 10% speed
document.getAnimations().forEach(a => a.playbackRate = 0.1);

// Resume
document.getAnimations().forEach(a => a.play());

// Slow entire document timeline (affects all CSS animations)
document.timeline.playbackRate = 0.1; // Not yet widely supported
```

### Performance Observer for Animation Timing

```javascript
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.entryType === 'animation') {
      console.log('Animation:', entry.name, entry.duration);
    }
  }
});
// Note: 'animation' entry type has limited support
```

### Chrome DevTools Protocol Animation Domain

For programmatic access via CDP (Puppeteer, Playwright, or browser extension with debugger API):

| Method | Purpose |
|---|---|
| `Animation.enable()` | Start receiving animation events |
| `Animation.getCurrentTime(id)` | Get current time of an animation |
| `Animation.getPlaybackRate()` | Get document timeline rate |
| `Animation.seekAnimations(ids, time)` | Jump to specific time |
| `Animation.setPaused(ids, paused)` | Pause/resume animations |
| `Animation.setPlaybackRate(rate)` | Change timeline speed |
| `Animation.setTiming(id, duration, delay)` | Modify timing |
| `Animation.resolveAnimation(id)` | Get Runtime.RemoteObject |

Events: `animationCreated`, `animationStarted`, `animationCanceled`, `animationUpdated`

Animation type includes: `type` field with values `CSSTransition`, `CSSAnimation`, or `WebAnimation`, plus full `AnimationEffect` data including `keyframesRule` with `name` and array of `KeyframeStyle` objects.

---

## 13. Edge Cases & Pitfalls

### Cross-Origin Stylesheets

CDN-hosted CSS blocks `cssRules` access. Detection:
```javascript
for (const sheet of document.styleSheets) {
  try {
    sheet.cssRules;
  } catch (e) {
    console.warn(`CORS blocked: ${sheet.href}`);
    // Fallback: use getComputedStyle on elements instead
  }
}
```

### Constructable Stylesheets

Some frameworks use `new CSSStyleSheet()` and `document.adoptedStyleSheets`:
```javascript
// Check for adopted stylesheets
const adopted = document.adoptedStyleSheets;
for (const sheet of adopted) {
  for (const rule of sheet.cssRules) {
    // These are accessible, no CORS issue
  }
}
// Also check shadow roots
document.querySelectorAll('*').forEach(el => {
  if (el.shadowRoot?.adoptedStyleSheets?.length) {
    // Extract from shadow DOM adopted stylesheets
  }
});
```

### One-Time Animations (Re-Triggering)

Animations with `animation-fill-mode: forwards` and `animation-iteration-count: 1` play once:
```javascript
// Re-trigger by removing and re-adding the animation
function retriggerAnimation(el) {
  const anim = getComputedStyle(el).animation;
  el.style.animation = 'none';
  el.offsetHeight; // Force reflow
  el.style.animation = anim;
}
```

### GPU-Accelerated vs Layout-Triggering

**Compositor-only (fast, GPU)**: `transform`, `opacity`, `filter`, `backdrop-filter`
**Layout-triggering (slow)**: `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size`

Detection:
```javascript
function classifyAnimatedProperties(el) {
  const compositorOnly = ['transform', 'opacity', 'filter', 'backdrop-filter'];
  const anims = el.getAnimations();
  return anims.map(a => {
    const kfs = a.effect.getKeyframes();
    const props = [...new Set(kfs.flatMap(kf =>
      Object.keys(kf).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k))
    ))];
    return {
      animation: a.animationName || a.transitionProperty || 'waapi',
      properties: props,
      gpuAccelerated: props.every(p => compositorOnly.includes(p)),
    };
  });
}
```

### Composite Animations (Multiple on Same Element)

An element can have multiple simultaneous animations:
```javascript
const el = document.querySelector('.target');
const anims = el.getAnimations();
// anims.length may be > 1
// Each has independent timing, keyframes, playState
```

### Animation Events

```javascript
element.addEventListener('animationstart', e => {
  console.log('Started:', e.animationName, 'elapsed:', e.elapsedTime);
});
element.addEventListener('animationend', e => {
  console.log('Ended:', e.animationName);
});
element.addEventListener('animationiteration', e => {
  console.log('Iteration:', e.animationName);
});
element.addEventListener('transitionend', e => {
  console.log('Transition ended:', e.propertyName, 'elapsed:', e.elapsedTime);
});
element.addEventListener('transitionstart', e => {
  console.log('Transition started:', e.propertyName);
});
element.addEventListener('transitioncancel', e => {
  console.log('Transition canceled:', e.propertyName);
});
```

### `prefers-reduced-motion`

Detect and check for alternative styling:
```javascript
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Monitor for changes
window.matchMedia('(prefers-reduced-motion: reduce)')
  .addEventListener('change', e => {
    console.log('Reduced motion preference changed:', e.matches);
  });
```

---

## 14. Existing Tools & Approaches

### Chrome DevTools Animations Panel

- **Location**: DevTools > More tools > Animations
- **Capabilities**: Shows all CSS animations and transitions in a timeline
- **Features**: Slow down/replay animations, inspect timing curves, modify easing in real-time
- **Limitation**: Manual UI only, no export feature, requires manual interaction

### Firefox Animation Inspector

- **Similar to Chrome**: Timeline view of all running animations
- **Additional**: Can inspect individual keyframes inline
- **Cubic-bezier editor**: Visual easing curve editor

### Motion DevTools (Chrome Extension)

- **By**: Motion.dev team
- **Features**: Inspect, edit, and export animations made with CSS and Motion One
- **Export**: Can export animation data
- **URL**: Available on Chrome Web Store

### MiroMiro (Chrome Extension)

- **Features**: Extract CSS, colors, fonts, SVGs, Lottie animations from any website
- **Export**: Ready-to-paste Tailwind config generation
- **Design tokens**: Extracts colors, fonts, spacing, radii

### Motion Performance Audit (motion.dev)

- **Feature**: AI-powered animation performance audit
- **Scans for**: CSS, Motion, GSAP, and Anime.js APIs
- **Premium**: Available to Motion+ members

### Theatre.js

- **Type**: Animation toolbox/editor
- **Features**: Visual animation editor, keyframe manipulation
- **Use case**: Creating and editing animations with a timeline UI

### Programmatic Tools

| Tool | Approach | Best For |
|---|---|---|
| Puppeteer/Playwright | CDP `Animation` domain | Full programmatic control |
| Chrome Extension (content script) | Direct DOM/CSSOM access | Real-time inspection |
| MCP JavaScript tool | `eval` in page context | Quick extraction |
| Performance API | `PerformanceObserver` | Timing measurement |

---

## Appendix A: Complete Extraction Script (Compact, MCP-Optimized)

### Call 1: Keyframes Inventory

```javascript
(() => {
  const r = {};
  for (const s of document.styleSheets) {
    try {
      for (const ru of s.cssRules) {
        if (ru instanceof CSSKeyframesRule) {
          const f = [];
          for (let i = 0; i < ru.cssRules.length; i++) {
            const k = ru.cssRules[i], p = {};
            for (let j = 0; j < k.style.length; j++)
              p[k.style[j]] = k.style.getPropertyValue(k.style[j]);
            f.push({ o: k.keyText, p });
          }
          r[ru.name] = f;
        }
      }
    } catch(e) {}
  }
  return JSON.stringify(r);
})()
```

### Call 2: Active Animations

```javascript
(() => {
  return JSON.stringify(document.getAnimations().map(a => {
    const t = a.effect?.getComputedTiming();
    return {
      type: a.animationName ? 'css-anim' : a.transitionProperty ? 'css-trans' : 'waapi',
      name: a.animationName || a.transitionProperty || '',
      state: a.playState,
      dur: t?.duration,
      ease: t?.easing,
      iter: t?.iterations,
      el: a.effect?.target?.tagName + '.' + (a.effect?.target?.className?.split?.(' ')?.[0] || ''),
    };
  }));
})()
```

### Call 3: CSS Custom Properties (Motion Tokens)

```javascript
(() => {
  const tokens = {};
  for (const s of document.styleSheets) {
    try {
      for (const r of s.cssRules) {
        if (r.selectorText === ':root' || r.selectorText === ':host' || r.selectorText === 'html') {
          for (let i = 0; i < r.style.length; i++) {
            const p = r.style[i];
            if (p.startsWith('--')) {
              const v = r.style.getPropertyValue(p).trim();
              if (/duration|delay|ease|spring|motion|anim|timing|transition/i.test(p) ||
                  /^\d+m?s$/.test(v) || /cubic-bezier|linear\(|ease|steps/.test(v)) {
                tokens[p] = v;
              }
            }
          }
        }
      }
    } catch(e) {}
  }
  return JSON.stringify(tokens);
})()
```

### Call 4: Transition Rules

```javascript
(() => {
  const t = [];
  for (const s of document.styleSheets) {
    try {
      for (const r of s.cssRules) {
        if (r instanceof CSSStyleRule && (r.style.transition || r.style.transitionProperty)) {
          t.push({
            sel: r.selectorText,
            tr: r.style.transition || '',
            prop: r.style.transitionProperty || '',
            dur: r.style.transitionDuration || '',
            ease: r.style.transitionTimingFunction || '',
          });
        }
      }
    } catch(e) {}
  }
  return JSON.stringify(t);
})()
```

### Call 5: Element-Specific Deep Inspection

```javascript
((sel) => {
  const el = document.querySelector(sel);
  if (!el) return JSON.stringify({ error: 'not found' });
  const cs = getComputedStyle(el);
  const anims = el.getAnimations();
  return JSON.stringify({
    computed: {
      animation: cs.animation,
      transition: cs.transition,
      transform: cs.transform,
      opacity: cs.opacity,
      willChange: cs.willChange,
    },
    animations: anims.map(a => ({
      type: a.animationName ? 'A' : a.transitionProperty ? 'T' : 'W',
      name: a.animationName || a.transitionProperty || '',
      keyframes: a.effect?.getKeyframes(),
      timing: a.effect?.getComputedTiming(),
    })),
  });
})('YOUR_SELECTOR_HERE')
```

---

## Appendix B: Quick Reference - API Interfaces

```
document.styleSheets
  └─ CSSStyleSheet[]
       ├─ href: string | null
       ├─ ownerNode: Element
       ├─ cssRules: CSSRuleList
       │    ├─ CSSStyleRule (selector + declarations)
       │    │    ├─ selectorText: string
       │    │    └─ style: CSSStyleDeclaration
       │    ├─ CSSKeyframesRule (@keyframes block)
       │    │    ├─ name: string
       │    │    ├─ cssRules: CSSRuleList of CSSKeyframeRule
       │    │    │    ├─ keyText: string ("0%", "50%", "100%")
       │    │    │    └─ style: CSSStyleDeclaration
       │    │    └─ findRule(keyText): CSSKeyframeRule
       │    ├─ CSSMediaRule (@media block)
       │    │    ├─ conditionText: string
       │    │    └─ cssRules: CSSRuleList (nested rules)
       │    └─ CSSSupportsRule (@supports block)
       └─ adoptedStyleSheets: CSSStyleSheet[] (constructable)

document.getAnimations() / element.getAnimations()
  └─ Animation[]
       ├─ CSSAnimation extends Animation
       │    └─ animationName: string
       ├─ CSSTransition extends Animation
       │    └─ transitionProperty: string
       └─ Animation (WAAPI)
            ├─ playState: 'idle' | 'running' | 'paused' | 'finished'
            ├─ currentTime: number
            ├─ startTime: number
            ├─ playbackRate: number
            ├─ effect: KeyframeEffect
            │    ├─ target: Element
            │    ├─ getKeyframes(): object[]
            │    ├─ getComputedTiming(): object
            │    └─ getTiming(): object
            ├─ pause()
            ├─ play()
            └─ finished: Promise<Animation>
```

---

## Sources

- [CSSKeyframesRule - MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSSKeyframesRule)
- [CSSKeyframeRule - MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSSKeyframeRule)
- [Document.getAnimations() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations)
- [Element.getAnimations() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations)
- [KeyframeEffect - MDN](https://developer.mozilla.org/en-US/docs/Web/API/KeyframeEffect)
- [Web Animations API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [CSS + the Web Animations API - Daniel Wilson](https://danielcwilson.com/blog/2020/04/css-in-the-waapi/)
- [Controlling CSS Animations and Transitions with JavaScript - CSS-Tricks](https://css-tricks.com/controlling-css-animations-transitions-javascript/)
- [Chrome DevTools Protocol - Animation domain](https://chromedevtools.github.io/devtools-protocol/tot/Animation/)
- [Chrome DevTools Animation Inspector](https://developer.chrome.com/docs/devtools/css/animations)
- [CSS linear() easing function - Chrome Developers](https://developer.chrome.com/docs/css-ui/css-linear-easing-function)
- [Springs and Bounces in Native CSS - Josh W. Comeau](https://www.joshwcomeau.com/animation/linear-timing-function/)
- [CSS Spring Animation with linear() - PQINA](https://pqina.nl/blog/css-spring-animation-with-linear-easing-function)
- [tailwindcss-spring plugin](https://github.com/KevinGrajeda/tailwindcss-spring)
- [CSS Spring Easing Generator](https://www.kvin.me/css-springs)
- [Material Design 3 - Easing and Duration](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)
- [Material Design 3 - Motion Overview](https://m3.material.io/styles/motion/overview/specs)
- [Motion Design Tokens - Medium](https://medium.com/@ogonzal87/animation-motion-design-tokens-8cf67ffa36e9)
- [Motion DevTools - Chrome Web Store](https://chromewebstore.google.com/detail/motion-devtools/mnbliiaiiflhmnndmoidhddombbmgcdk)
- [CSS Scroll-Driven Animations - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations)
- [animation-timeline - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline)
- [prefers-reduced-motion - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
- [bezier-easing library](https://github.com/gre/bezier-easing)
- [Shimmer Effect using CSS - GeeksforGeeks](https://www.geeksforgeeks.org/css/shimmer-effect-using-css/)
- [Skeleton Loaders - Frontend Hero](https://frontend-hero.com/how-to-create-skeleton-loader)
