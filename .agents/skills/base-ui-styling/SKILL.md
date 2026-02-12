---
name: base-ui-styling
description: Guide to styling Base UI components with Tailwind CSS, CSS Modules, or CSS-in-JS. Use when building or styling Base UI components, when applying conditional styles based on component state, when working with data attributes or CSS variables from Base UI, or when choosing a styling approach for new components.
---

# Base UI Styling

A guide to styling Base UI components with your preferred styling engine.

Base UI components are unstyled, don't bundle CSS, and are compatible with Tailwind, CSS Modules, CSS-in-JS, or any other styling solution. You retain total control of your styling layer.

> **Official docs**: <https://base-ui.com/react/overview/quick-start>
> Each component's docs page has a "View as Markdown" link for LLM-friendly content, plus an `llms.txt` in the Handbook sidebar.

## Style Hooks

### CSS Classes

Components that render an HTML element accept a `className` prop to style the element with CSS classes.

```tsx
<Switch.Thumb className="SwitchThumb" />
```

The prop can also be passed a **function** that receives the component's state:

```tsx
<Switch.Thumb className={(state) => (state.checked ? 'checked' : 'unchecked')} />
```

### Data Attributes

Components provide data attributes for styling their states. For example, `Switch` can be styled using `[data-checked]` and `[data-unchecked]`:

```css
.SwitchThumb[data-checked] {
  background-color: green;
}
```

### CSS Variables

Components expose CSS variables containing dynamic numeric values useful for sizing or transform calculations. For example, `Popover.Popup` exposes `--available-height` and `--anchor-width`:

```css
.Popup {
  max-height: var(--available-height);
}
```

> Check each component's API reference for a complete list of available data attributes and CSS variables.

### Style Prop

Components that render an HTML element accept a `style` prop with a CSS object:

```tsx
<Switch.Thumb style={{ height: '100px' }} />
```

The prop also accepts a **function** that receives the component's state:

```tsx
<Switch.Thumb style={(state) => ({ color: state.checked ? 'red' : 'blue' })} />
```

## Styling Approaches

### Tailwind CSS (Preferred in This Project)

Apply Tailwind CSS classes to each part via the `className` prop. Use Base UI data attributes directly in Tailwind selectors (`data-[checked]:`, `data-[highlighted]:`, etc.).

```tsx
import { Menu } from '@base-ui/react/menu';

export default function ExampleMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger className="flex h-10 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3.5 text-base font-medium text-gray-900 select-none hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-blue-800 active:bg-gray-100 data-[popup-open]:bg-gray-100">
        Song
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="outline-none" sideOffset={8}>
          <Menu.Popup className="origin-[var(--transform-origin)] rounded-md bg-[canvas] py-1 text-gray-900 shadow-lg shadow-gray-200 outline outline-1 outline-gray-200 transition-[transform,scale,opacity] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0 dark:shadow-none dark:-outline-offset-1 dark:outline-gray-300">
            <Menu.Item className="flex cursor-default py-2 pr-8 pl-4 text-sm leading-4 outline-none select-none data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-gray-50 data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-gray-900">
              Add to Library
            </Menu.Item>
            <Menu.Item className="flex cursor-default py-2 pr-8 pl-4 text-sm leading-4 outline-none select-none data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-gray-50 data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-gray-900">
              Add to Playlist
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
```

### CSS Modules

Apply custom CSS classes via the `className` prop, then define styles in a `.module.css` file:

```tsx
import { Menu } from '@base-ui/react/menu';
import styles from './menu.module.css';

export default function ExampleMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger className={styles.Button}>Song</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={styles.Positioner} sideOffset={8}>
          <Menu.Popup className={styles.Popup}>
            <Menu.Item className={styles.Item}>Add to Library</Menu.Item>
            <Menu.Item className={styles.Item}>Add to Playlist</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
```

### CSS-in-JS

Wrap each component part with a styled wrapper, then assemble:

```tsx
import { Menu } from '@base-ui/react/menu';
import styled from '@emotion/styled';

const StyledMenuTrigger = styled(Menu.Trigger)`
  // Button styles
`;

const StyledMenuPositioner = styled(Menu.Positioner)`
  // Positioner styles
`;

const StyledMenuPopup = styled(Menu.Popup)`
  // Popup styles
`;

const StyledMenuItem = styled(Menu.Item)`
  // Menu item styles
`;

const MenuExample = () => (
  <Menu.Root>
    <StyledMenuTrigger>Song</StyledMenuTrigger>
    <Menu.Portal>
      <StyledMenuPositioner>
        <StyledMenuPopup>
          <StyledMenuItem>Add to Library</StyledMenuItem>
          <StyledMenuItem>Add to Playlist</StyledMenuItem>
        </StyledMenuPopup>
      </StyledMenuPositioner>
    </Menu.Portal>
  </Menu.Root>
);

export default MenuExample;
```

## Quick Reference: Style Hook Summary

| Hook | Type | Use Case |
|------|------|----------|
| `className` (string) | Static | Simple, unconditional styling |
| `className` (function) | Dynamic | State-dependent class names |
| `data-*` attributes | CSS selector | Style states via CSS selectors |
| CSS variables (`--*`) | Dynamic value | Sizing, positioning, transforms |
| `style` (object) | Static inline | One-off inline styles |
| `style` (function) | Dynamic inline | State-dependent inline styles |

## Additional References

- **Official quick start**: <https://base-ui.com/react/overview/quick-start>
- **Styling handbook**: <https://base-ui.com/react/handbook/styling>
- **Animation guide**: <https://base-ui.com/react/handbook/animation>
- **LLM-friendly docs**: Each component page has a "View as Markdown" link; see also `llms.txt` in the Handbook sidebar
- **Migration audit**: See `@.agents/skills/base-ui-migration-audit/SKILL.md` for Radix-to-Base-UI migration patterns
