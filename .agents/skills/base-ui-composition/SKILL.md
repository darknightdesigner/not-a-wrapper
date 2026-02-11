---
name: base-ui-composition
description: Guide to composing Base UI components with custom React components using the render prop. Use when composing Base UI parts with custom components, when nesting multiple Base UI components together, when changing the default rendered element, or when using render functions for performance-sensitive applications.
---

# Base UI Composition

A guide to composing Base UI components with your own React components.

> **Official docs**: <https://base-ui.com/react/overview/quick-start>
> Each component's docs page has a "View as Markdown" link for LLM-friendly content, plus an `llms.txt` in the Handbook sidebar.

## Composing Custom React Components

Use the `render` prop to compose a Base UI part with your own React components.

For example, most triggers render a `<button>` by default. The code snippet below shows how to use a custom button instead:

```tsx
<Menu.Trigger render={<MyButton size="md" />}>
  Open menu
</Menu.Trigger>
```

The custom component **must** forward the `ref` and spread all received props on its underlying DOM node.

## Composing Multiple Components

In situations where you need to compose multiple Base UI components with custom React components, `render` props can be nested as deeply as necessary. Working with Tooltip is a common example:

```tsx
<Dialog.Root>
  <Tooltip.Root>
    <Tooltip.Trigger
      render={
        <Dialog.Trigger
          render={
            <Menu.Trigger render={<MyButton size="md" />}>
              Open menu
            </Menu.Trigger>
          }
        />
      }
    />
    <Tooltip.Portal>...</Tooltip.Portal>
  </Tooltip.Root>
  <Dialog.Portal>...</Dialog.Portal>
</Dialog.Root>
```

## Changing the Default Rendered Element

You can also use the `render` prop to override the rendered element of a component.

For example, `<Menu.Item>` renders a `<div>` by default. The code snippet below shows how to render it as an `<a>` element so that it works like a link:

```tsx
import { Menu } from '@base-ui/react/menu';

export default () => (
  <Menu.Root>
    <Menu.Trigger>Song</Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner>
        <Menu.Popup>
          <Menu.Item render={<a href="base-ui.com" />}>
            Add to Library
          </Menu.Item>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);
```

Each Base UI component renders the most appropriate element by default, and in most cases, rendering a different element is recommended only on a case-by-case basis.

## Render Function

If you are working in an extremely performance-sensitive application, you might want to pass a function to the `render` prop instead of a React element:

```tsx
<Switch.Thumb
  render={(props, state) => (
    <span {...props}>
      {state.checked ? <CheckedIcon /> : <UncheckedIcon />}
    </span>
  )}
/>
```

Using a function gives you complete control over spreading props and also allows you to render different content based on the component's state.

## Quick Reference

| Pattern | Syntax | Use Case |
|---------|--------|----------|
| Custom component | `render={<MyComponent />}` | Compose with your own components |
| Element override | `render={<a href="..." />}` | Change the default rendered element |
| Nested composition | `render={<Outer render={<Inner />} />}` | Compose multiple Base UI parts together |
| Render function | `render={(props, state) => <el {...props} />}` | Performance-sensitive or state-dependent rendering |

## Key Rules

1. **Forward ref**: Custom components used in `render` must forward `ref` via `React.forwardRef` (or React 19's ref-as-prop)
2. **Spread props**: Always spread all received props on the underlying DOM node
3. **Nesting order**: When composing multiple components, the outermost `render` receives the final merged props
4. **Render function**: Use for performance or when you need access to component state

## Additional References

- **Official quick start**: <https://base-ui.com/react/overview/quick-start>
- **Composition handbook**: <https://base-ui.com/react/handbook/composition>
- **Styling guide**: See `@.agents/skills/base-ui-styling/SKILL.md` for styling patterns
- **Migration audit**: See `@.agents/skills/base-ui-migration-audit/SKILL.md` for Radix-to-Base-UI migration patterns
