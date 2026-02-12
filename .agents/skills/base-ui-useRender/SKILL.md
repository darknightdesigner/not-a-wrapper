---
name: base-ui-useRender
description: Guide to using the useRender hook for enabling a render prop in custom components. Use when building custom components that need a render prop, when migrating from Radix UI's Slot/asChild pattern to Base UI, when merging props or refs in custom components, or when typing render props with TypeScript.
---

# Base UI useRender

Hook for enabling a render prop in custom components.

The `useRender` hook lets you build custom components that provide a `render` prop to override the default rendered element.

> **Official docs**: <https://base-ui.com/react/utils/use-render>
> For additional references or context, see the quick start guide: <https://base-ui.com/react/overview/quick-start>

## Basic Usage

A `render` prop for a custom Text component lets consumers replace the default rendered `<p>` element with a different tag or component.

```tsx
'use client';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './index.module.css';

interface TextProps extends useRender.ComponentProps<'p'> {}

function Text(props: TextProps) {
  const { render, ...otherProps } = props;

  const element = useRender({
    defaultTagName: 'p',
    render,
    props: mergeProps<'p'>({ className: styles.Text }, otherProps),
  });

  return element;
}

export default function ExampleText() {
  return (
    <div>
      <Text>Text component rendered as a paragraph tag</Text>
      <Text render={<strong />}>Text component rendered as a strong tag</Text>
    </div>
  );
}
```

```css
/* Example CSS Module */
.Text {
  font-size: 0.875rem;
  line-height: 1rem;
  color: var(--color-gray-900);

  strong& {
    font-weight: 500;
  }
}
```

## Render Callback with State

The callback version of the `render` prop enables more control over how props are spread, and also passes the internal `state` of a component.

```tsx
'use client';
import * as React from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './index.module.css';

interface CounterState {
  odd: boolean;
}

interface CounterProps extends useRender.ComponentProps<'button', CounterState> {}

function Counter(props: CounterProps) {
  const { render, ...otherProps } = props;

  const [count, setCount] = React.useState(0);
  const odd = count % 2 === 1;
  const state = React.useMemo(() => ({ odd }), [odd]);

  const defaultProps: useRender.ElementProps<'button'> = {
    className: styles.Button,
    type: 'button',
    children: (
      <React.Fragment>
        Counter: <span>{count}</span>
      </React.Fragment>
    ),
    onClick() {
      setCount((prev) => prev + 1);
    },
    'aria-label': `Count is ${count}, click to increase.`,
  };

  const element = useRender({
    defaultTagName: 'button',
    render,
    state,
    props: mergeProps<'button'>(defaultProps, otherProps),
  });

  return element;
}

export default function ExampleCounter() {
  return (
    <Counter
      render={(props, state) => (
        <button {...props}>
          {props.children}
          <span className={styles.suffix}>{state.odd ? '👎' : '👍'}</span>
        </button>
      )}
    />
  );
}
```

## Merging Props

The `mergeProps` function merges two or more sets of React props together. It safely merges three types of props:

1. **Event handlers** — all are invoked
2. **`className` strings** — concatenated
3. **`style` properties** — merged

`mergeProps` merges objects from left to right, so that subsequent objects' properties overwrite previous ones. Useful when creating custom components or inside the callback version of the `render` prop.

```tsx
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './index.module.css';

function Button() {
  return (
    <Component
      render={(props, state) => (
        <button
          {...mergeProps<'button'>(props, {
            className: styles.Button,
          })}
        />
      )}
    />
  );
}
```

## Merging Refs

When building custom components, you often need to control a ref internally while still letting external consumers pass their own. The `ref` option in `useRender` holds an array of refs to be merged together.

### React 19 (This Project)

In React 19, `React.forwardRef()` is not needed. The external ref prop is already inside `props`. Pass your internal ref to `ref`:

```tsx
function Text({ render, ...props }: TextProps) {
  const internalRef = React.useRef<HTMLElement | null>(null);

  const element = useRender({
    defaultTagName: 'p',
    ref: internalRef,
    props,
    render,
  });

  return element;
}
```

### React 18 and 17 (Legacy)

In older versions, use `React.forwardRef()` and pass both refs in an array:

```tsx
const Text = React.forwardRef(function Text(
  { render, ...props }: TextProps,
  forwardedRef: React.ForwardedRef<HTMLElement>,
) {
  const internalRef = React.useRef<HTMLElement | null>(null);

  const element = useRender({
    defaultTagName: 'p',
    ref: [forwardedRef, internalRef],
    props,
    render,
  });

  return element;
});
```

## TypeScript

Two interfaces for typing props:

- **`useRender.ComponentProps<Tag, State?>`** — external (public) props. Types the `render` prop and HTML attributes.
- **`useRender.ElementProps<Tag>`** — internal (private) props. Types HTML attributes alone.

```tsx
interface ButtonProps extends useRender.ComponentProps<'button'> {}

function Button({ render, ...props }: ButtonProps) {
  const defaultProps: useRender.ElementProps<'button'> = {
    className: styles.Button,
    type: 'button',
    children: 'Click me',
  };

  const element = useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>(defaultProps, props),
  });

  return element;
}
```

## Migrating from Radix UI

Radix UI uses an `asChild` prop with a `Slot` component; Base UI uses `useRender` with a `render` prop.

```tsx
// ❌ Radix UI Slot component
import { Slot } from 'radix-ui';

function Button({ asChild, ...props }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp {...props} />;
}

<Button asChild>
  <a href="/contact">Contact</a>
</Button>;
```

```tsx
// ✅ Base UI render prop (equivalent)
import { useRender } from '@base-ui/react/use-render';

function Button({ render, ...props }) {
  return useRender({
    defaultTagName: 'button',
    render,
    props,
  });
}

<Button render={<a href="/contact" />}>Contact</Button>;
```

> See `@.agents/skills/base-ui-composition/SKILL.md` for the full composition guide.
> See `@.agents/skills/base-ui-migration-audit/SKILL.md` for the complete Radix-to-Base-UI migration audit.

## API Reference

### Input Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultTagName` | `keyof React.JSX.IntrinsicElements` | — | Default tag when `render` is not provided |
| `render` | `RenderProp<State>` | — | React element or function to override the default element |
| `props` | `Record<string, unknown>` | — | Props spread on the rendered element (event handlers merged, `className`/`style` joined, others overwrite) |
| `ref` | `React.Ref<T> \| React.Ref<T>[]` | — | Refs to apply to the rendered element |
| `state` | `State` | — | Component state passed to the render callback |
| `stateAttributesMapping` | `StateAttributesMapping<State>` | — | Custom mapping for converting state to `data-*` attributes |

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `element` | `React.ReactElement` | The rendered React element |

```tsx
const element = useRender({
  defaultTagName: 'button',
  render,
  state,
  props: mergeProps<'button'>(defaultProps, otherProps),
});
```

## Quick Reference

| Pattern | Syntax | Use Case |
|---------|--------|----------|
| Element override | `render={<strong />}` | Replace default tag |
| Render callback | `render={(props, state) => <el {...props} />}` | Full control + state access |
| Merge props | `mergeProps<'button'>(defaults, overrides)` | Safely combine event handlers, classes, styles |
| Merge refs | `ref: internalRef` (React 19) | Internal + external ref access |
| Component props | `useRender.ComponentProps<'button'>` | Type external/public props |
| Element props | `useRender.ElementProps<'button'>` | Type internal/private props |
| State typing | `useRender.ComponentProps<'button', MyState>` | Typed state in render callback |

## Key Rules

1. **Always destructure `render`** from props before spreading the rest into `useRender`
2. **Use `mergeProps`** when combining default and external props to preserve event handlers and class names
3. **Pass `ref` option** when you need an internal ref — do not manually merge with `props.ref`
4. **Use `state` + render callback** when consumers need to read component state for conditional rendering
5. **Prefer React 19 patterns** — this project uses React 19, so `forwardRef` is not needed

## Additional References

- **Official useRender docs**: <https://base-ui.com/react/utils/use-render>
- **Official quick start**: <https://base-ui.com/react/overview/quick-start>
- **Composition guide**: See `@.agents/skills/base-ui-composition/SKILL.md`
- **Styling guide**: See `@.agents/skills/base-ui-styling/SKILL.md`
- **Migration audit**: See `@.agents/skills/base-ui-migration-audit/SKILL.md`
