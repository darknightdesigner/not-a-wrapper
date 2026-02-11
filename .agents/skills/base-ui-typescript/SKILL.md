---
name: base-ui-typescript
description: Guide to using TypeScript with Base UI. Use when typing wrapper components, handling Base UI Props/State namespaces, typing custom event handlers (onValueChange, onOpenChange), typing render props, or resolving type errors involving Base UI generics.
---

# Base UI TypeScript

A guide to using TypeScript with Base UI (`@base-ui/react`).

> For additional references, examples, and API details, see the official docs:
> [Base UI Quick Start](https://base-ui.com/react/overview/quick-start)

## Namespaces

Base UI uses namespaces to organize types. Every component has two core interfaces:

- `Props` (e.g. `Tooltip.Root.Props`)
- `State` (e.g. `Tooltip.Root.State`)

### Props

When creating wrapping components, use the `Props` type to accept all of the underlying Base UI props for the component.

```tsx
import { Tooltip } from '@base-ui/react/tooltip';

function MyTooltip(props: Tooltip.Root.Props) {
  return <Tooltip.Root {...props} />;
}
```

### State

The `State` type represents the internal state of the component.
For example, `Positioner` components (such as `<Popover.Positioner>`) have state that describes the position of the element relative to their anchor.

```tsx
function renderPositioner(
  props: Popover.Positioner.Props,
  state: Popover.Positioner.State,
) {
  return (
    <div {...props}>
      <ul>
        <li>The popover is {state.open ? 'open' : 'closed'}</li>
        <li>I am on the {state.side} side of the anchor</li>
        <li>I am aligned at the {state.align} of the side</li>
        <li>The anchor is {state.anchorHidden ? 'hidden' : 'visible'}</li>
      </ul>
      {props.children}
    </div>
  );
}

<Popover.Positioner render={renderPositioner} />;
```

### Events

Types relating to custom Base UI events are also exported on component parts' namespaces.

- `ChangeEventDetails` (e.g. `Combobox.Root.ChangeEventDetails`) -- the object passed to change handlers like `onValueChange` and `onOpenChange`.
- `ChangeEventReason` (e.g. `Combobox.Root.ChangeEventReason`) -- the union of possible reason strings for a change event.

```tsx
function onValueChange(
  value: string,
  eventDetails: Combobox.Root.ChangeEventDetails,
) {
  console.log(value, eventDetails);
}

function onOpenChange(
  open: boolean,
  eventDetails: Combobox.Root.ChangeEventDetails,
) {
  console.log(open, eventDetails);
}
```

### Other Accessible Types

Depending on the component API, other types are also exported on component parts or utility functions. The following list is non-exhaustive; each is documented where relevant in the official docs.

| Type | Purpose |
|------|---------|
| `Menu.Root.Actions` | Shape of the `actionsRef` object prop on `<Menu.Root>` for imperative methods |
| `Toast.Root.ToastObject` | Complex toast object interface on `<Toast.Root>` |
| `useRender.ComponentProps` | Extended `React.ComponentProps` enhanced with the `render` prop |

## Quick Reference

| Need | Type to use |
|------|-------------|
| Accept all props for a wrapper | `Component.Part.Props` (e.g. `Dialog.Root.Props`) |
| Access internal component state | `Component.Part.State` (e.g. `Popover.Positioner.State`) |
| Type a change handler | `Component.Part.ChangeEventDetails` |
| Type change reasons | `Component.Part.ChangeEventReason` |
| Type imperative actions ref | `Component.Root.Actions` |
| Type render prop signature | `(props: Component.Part.Props, state: Component.Part.State) => ReactElement` |

## Common Patterns in This Project

### Wrapper Components (`components/ui/`)

When extending a Base UI component, spread the namespaced props:

```tsx
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

interface DialogContentProps extends DialogPrimitive.Popup.Props {
  // Add custom props here
  showCloseButton?: boolean;
}

function DialogContent({ showCloseButton = true, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Popup {...props}>
      {props.children}
      {showCloseButton && <DialogPrimitive.Close />}
    </DialogPrimitive.Popup>
  );
}
```

### Typed Render Props

When using the `render` prop for custom rendering, type both arguments:

```tsx
<Popover.Positioner
  render={(props: Popover.Positioner.Props, state: Popover.Positioner.State) => (
    <div {...props} data-side={state.side}>
      {props.children}
    </div>
  )}
/>
```

### Typed Event Handlers

Always type change handlers using the namespaced event types:

```tsx
const handleOpenChange = (
  open: boolean,
  details: Dialog.Root.ChangeEventDetails,
) => {
  if (details.reason === 'escape-key') {
    // Handle escape specifically
  }
  setOpen(open);
};

<Dialog.Root open={open} onOpenChange={handleOpenChange} />;
```

## Official Documentation

- [Base UI Quick Start](https://base-ui.com/react/overview/quick-start)
- [Base UI TypeScript Guide](https://base-ui.com/react/overview/typescript)
