---
name: base-ui-direction-provider
description: Guide to using the Base UI DirectionProvider for RTL support. Use when enabling right-to-left text direction for Base UI components, when wrapping an app or component subtree with RTL behavior, when reading the current text direction with useDirection, or when building components that need to adapt to RTL layouts.
---

# Base UI Direction Provider

A direction provider component that enables RTL behavior for Base UI components.

`<DirectionProvider>` enables child Base UI components to adjust behavior based on RTL text direction, but **does not affect HTML and CSS**. The `dir="rtl"` HTML attribute or `direction: rtl` CSS style must be set additionally by your own application code.

> **Official docs**: <https://base-ui.com/react/utils/direction-provider>
> **Quick start**: <https://base-ui.com/react/overview/quick-start>
> Each component's docs page has a "View as Markdown" link for LLM-friendly content, plus an `llms.txt` in the Handbook sidebar.

## Anatomy

Import the component and wrap it around your app or a group of components:

```tsx
import { DirectionProvider } from '@base-ui/react/direction-provider';

<DirectionProvider direction="rtl">
  {/* Your app or a group of components */}
</DirectionProvider>
```

**Key detail**: You must also set the HTML `dir` attribute (or CSS `direction` property) on a parent element yourself. `<DirectionProvider>` only tells Base UI components which direction to use internally — it does not inject any HTML attributes or CSS.

## Usage

### Tailwind CSS

```tsx
import { Slider } from '@base-ui/react/slider';
import { DirectionProvider } from '@base-ui/react/direction-provider';

export default function ExampleDirectionProvider() {
  return (
    <div dir="rtl">
      <DirectionProvider direction="rtl">
        <Slider.Root defaultValue={25}>
          <Slider.Control className="flex w-56 items-center py-3">
            <Slider.Track className="relative h-1 w-full rounded bg-gray-200 shadow-[inset_0_0_0_1px] shadow-gray-200">
              <Slider.Indicator className="rounded bg-gray-700" />
              <Slider.Thumb className="size-4 rounded-full bg-white outline outline-1 outline-gray-300 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-800" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      </DirectionProvider>
    </div>
  );
}
```

### CSS Modules

```css
/* index.module.css */
.Control {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 14rem;
  padding-block: 0.75rem;
}

.Track {
  width: 100%;
  background-color: var(--color-gray-200);
  box-shadow: inset 0 0 0 1px var(--color-gray-200);
  height: 0.25rem;
  border-radius: 0.25rem;
  position: relative;
}

.Indicator {
  border-radius: 0.25rem;
  background-color: var(--color-gray-700);
}

.Thumb {
  width: 1rem;
  height: 1rem;
  border-radius: 100%;
  background-color: white;
  outline: 1px solid var(--color-gray-300);

  &:has(:focus-visible) {
    outline: 2px solid var(--color-blue);
  }
}
```

```tsx
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Slider } from '@base-ui/react/slider';
import styles from './index.module.css';

export default function ExampleDirectionProvider() {
  return (
    <div dir="rtl">
      <DirectionProvider direction="rtl">
        <Slider.Root defaultValue={25}>
          <Slider.Control className={styles.Control}>
            <Slider.Track className={styles.Track}>
              <Slider.Indicator className={styles.Indicator} />
              <Slider.Thumb className={styles.Thumb} />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      </DirectionProvider>
    </div>
  );
}
```

## API Reference

### DirectionProvider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `direction` | `TextDirection` | `'ltr'` | The reading direction of the text |
| `children` | `ReactNode` | — | Child components that will receive the direction context |

### useDirection Hook

Use this hook to read the current text direction. This is useful for wrapping portaled components that may be rendered outside your application root and are unaffected by the `dir` attribute set within.

**Return value**:

| Property | Type | Description |
|----------|------|-------------|
| `direction` | `TextDirection` | The current text direction |

```tsx
import { useDirection } from '@base-ui/react/direction-provider';

function PortaledComponent() {
  const { direction } = useDirection();
  // Use direction to conditionally style or position elements
}
```

## Common Patterns

### App-Level RTL Support

Wrap your entire app to enable RTL for all Base UI components:

```tsx
// ✅ Correct: Both HTML dir attribute AND DirectionProvider
<html dir="rtl">
  <body>
    <DirectionProvider direction="rtl">
      <App />
    </DirectionProvider>
  </body>
</html>

// ❌ Incomplete: DirectionProvider alone — HTML/CSS still renders LTR
<DirectionProvider direction="rtl">
  <App />
</DirectionProvider>
```

### Portaled Components

Use `useDirection` for components rendered in portals (outside the app root), where the `dir` attribute on the root element doesn't apply:

```tsx
import { useDirection } from '@base-ui/react/direction-provider';

function PortaledTooltip({ children }) {
  const { direction } = useDirection();
  return (
    <div dir={direction}>
      {children}
    </div>
  );
}
```

## Quick Reference

| Task | Approach |
|------|----------|
| Enable RTL for all Base UI components | Wrap app with `<DirectionProvider direction="rtl">` |
| Set HTML/CSS direction | Add `dir="rtl"` attribute to a parent element |
| Read direction in a child component | Use `useDirection()` hook |
| Handle portaled components | Use `useDirection()` to get direction, apply `dir` attribute manually |

## Additional References

- **DirectionProvider docs**: <https://base-ui.com/react/utils/direction-provider>
- **Quick start**: <https://base-ui.com/react/overview/quick-start>
- **Styling guide**: See `@.agents/skills/base-ui-styling/SKILL.md`
- **Animation guide**: See `@.agents/skills/base-ui-animation/SKILL.md`
- **Migration audit**: See `@.agents/skills/base-ui-migration-audit/SKILL.md`
