---
name: base-ui-mergeProps
description: Guide to using Base UI's mergeProps utility to merge multiple sets of React props. Use when combining internal props with user props, when using the function form of the render prop, when you need to chain event handlers, or when merging className/style props from multiple sources.
---

# Base UI mergeProps

A utility to merge multiple sets of React props, handling event handlers, `className`, and `style` props intelligently.

> **Official docs**: <https://base-ui.com/react/overview/quick-start>
> Each component's docs page has a "View as Markdown" link for LLM-friendly content, plus an `llms.txt` in the Handbook sidebar.

## Overview

`mergeProps` helps you combine multiple prop objects (for example, internal props + user props) into a single set of props you can spread onto an element. It behaves like `Object.assign` (rightmost wins) with special handling for `className`, `style`, and event handlers.

**Import**:

```tsx
import { mergeProps } from '@base-ui/react/merge-props';
```

## How Merging Works

### Standard Props (Rightmost Wins)

For most keys (everything except `className`, `style`, and event handlers), the value from the rightmost object wins:

```ts
// returns { id: 'b', dir: 'ltr' }
mergeProps({ id: 'a', dir: 'ltr' }, { id: 'b' });
```

### `ref` (Not Merged)

Only the rightmost `ref` is kept:

```ts
// only refB is used
mergeProps({ ref: refA }, { ref: refB });
```

### `className` (Concatenated Right-to-Left)

`className` values are concatenated with the rightmost first:

```ts
// className is 'b a'
mergeProps({ className: 'a' }, { className: 'b' });
```

### `style` (Merged, Rightmost Overwrites)

`style` objects are merged, with keys from the rightmost style overwriting earlier ones.

### Event Handlers (Merged, Right-to-Left Execution)

Event handlers are merged and executed right-to-left (rightmost first):

```ts
// b runs before a
mergeProps({ onClick: a }, { onClick: b });
```

- For **React synthetic events**, Base UI adds `event.preventBaseUIHandler()`. Calling it prevents Base UI's internal logic from running. This does **not** call `preventDefault()` or `stopPropagation()`.
- For **non-synthetic events** (custom events with primitive/object values), this mechanism isn't available and all handlers always execute.

## Preventing Base UI's Default Behavior

When using the function form of the `render` prop, props are not merged automatically. Use `mergeProps` to combine Base UI's props with your own, and call `preventBaseUIHandler()` to stop Base UI's internal logic from running.

### Example: Lockable Toggle

```tsx
'use client';
import * as React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { Toggle } from '@base-ui/react/toggle';

export default function ExamplePreventBaseUIHandler() {
  const [locked, setLocked] = React.useState(true);
  const [pressed, setPressed] = React.useState(true);

  const getToggleProps = (props: React.ComponentProps<'button'>) =>
    mergeProps<'button'>(props, {
      onClick(event) {
        if (locked) {
          event.preventBaseUIHandler();
        }
      },
    });

  return (
    <div>
      <Toggle
        aria-label="Favorite"
        pressed={pressed}
        onPressedChange={setPressed}
        render={(props, state) => (
          <button type="button" {...getToggleProps(props)}>
            {state.pressed ? 'Filled' : 'Outline'}
          </button>
        )}
      />
      <button type="button" onClick={() => setLocked((l) => !l)}>
        {locked ? 'Unlock' : 'Lock'}
      </button>
    </div>
  );
}
```

## Passing a Function Instead of an Object

Each argument can be a props object **or** a function that receives the merged props up to that point (left to right) and returns a props object.

This is useful when you need to compute the next props from whatever has already been merged.

**Important**: The function's return value completely replaces the accumulated props up to that point. If you want to chain event handlers from the previous props, you must call them manually:

```tsx
const merged = mergeProps(
  {
    onClick(event) {
      // Handler from previous props
    },
  },
  (props) => ({
    onClick(event) {
      // Manually call the previous handler
      props.onClick?.(event);
      // Your logic here
    },
  }),
);
```

## API Reference

### `mergeProps`

Accepts up to **5 arguments**, each being either a props object or a function that returns a props object. If you need to merge more than 5, use `mergePropsN` instead.

**Behavior**:
- Follows `Object.assign` pattern (rightmost wins) for standard props
- Event handlers are merged and called right-to-left (rightmost first)
- For React synthetic events, the rightmost handler can prevent prior handlers via `event.preventBaseUIHandler()`
- `className` is concatenated right-to-left (rightmost class appears first)
- `style` is merged with rightmost styles overwriting prior ones
- Props passed as functions receive the merged props up to that point (left to right)
- Event handlers returned by functions are **not** automatically prevented when `preventBaseUIHandler` is called; they must check `event.baseUIHandlerPrevented` themselves
- **`ref` is not merged** — only the rightmost ref is kept

**Parameters**:

| Parameter | Type                      | Required | Description |
|-----------|---------------------------|----------|-------------|
| `a`       | `InputProps<ElementType>` | Yes      | First props object to merge. |
| `b`       | `InputProps<ElementType>` | Yes      | Second props object. Overwrites conflicting props from `a`. |
| `c`       | `InputProps<ElementType>` | No       | Third props object. Overwrites conflicting props from previous. |
| `d`       | `InputProps<ElementType>` | No       | Fourth props object. Overwrites conflicting props from previous. |
| `e`       | `InputProps<ElementType>` | No       | Fifth props object. Overwrites conflicting props from previous. |

**Returns**: `{}` — The merged props.

### `mergePropsN`

Accepts an **array** of props objects or functions. Slightly less efficient than `mergeProps`, so only use when merging more than 5 sets of props.

**Parameters**:

| Parameter | Type                        | Required | Description |
|-----------|-----------------------------|----------|-------------|
| `props`   | `InputProps<ElementType>[]` | Yes      | Array of props to merge. |

**Returns**: `{}` — The merged props.

## Quick Reference: Merge Behavior Summary

| Prop Type | Merge Strategy | Example |
|-----------|---------------|---------|
| Standard props | Rightmost wins | `{ id: 'a' }` + `{ id: 'b' }` → `{ id: 'b' }` |
| `ref` | Rightmost wins (not merged) | `{ ref: refA }` + `{ ref: refB }` → `{ ref: refB }` |
| `className` | Concatenated (rightmost first) | `'a'` + `'b'` → `'b a'` |
| `style` | Shallow merge (rightmost overwrites) | `{ color: 'red' }` + `{ color: 'blue' }` → `{ color: 'blue' }` |
| Event handlers | All called, right-to-left | `onClick: a` + `onClick: b` → b runs, then a |

## Additional References

- **Official quick start**: <https://base-ui.com/react/overview/quick-start>
- **Composition handbook**: <https://base-ui.com/react/handbook/composition>
- **LLM-friendly docs**: Each component page has a "View as Markdown" link; see also `llms.txt` in the Handbook sidebar
- **Related skills**:
  - `@.agents/skills/base-ui-composition/SKILL.md` — Composition patterns with `render` prop
  - `@.agents/skills/base-ui-migration-audit/SKILL.md` — Radix-to-Base-UI migration patterns
