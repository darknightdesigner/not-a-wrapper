---
name: base-ui-customization
description: Guide to customizing the behavior of Base UI components. Use when handling Base UI change events (onOpenChange, onValueChange, onPressedChange), when canceling or allowing propagation of events, when preventing Base UI from handling a React event, or when controlling components with external state.
---

# Base UI Customization

A guide to customizing the behavior of Base UI components.

> **Official docs**: <https://base-ui.com/react/overview/quick-start>
> Each component's docs page has a "View as Markdown" link for LLM-friendly content, plus an `llms.txt` in the Handbook sidebar.

## Base UI Events

Change events such as `onOpenChange`, `onValueChange`, and `onPressedChange` are custom to Base UI. They can be emitted by various different DOM events, effects, or even during rendering.

```tsx
// Base UI event signatures
onOpenChange: (open, eventDetails) => void
onValueChange: (value, eventDetails) => void
onPressedChange: (pressed, eventDetails) => void
```

The `eventDetails` property is passed as a second argument to Base UI event handlers. This enables the event to be customized, and also allows you to conditionally run side effects based on the reason or DOM event that caused the change.

### The `eventDetails` Object

```tsx
interface BaseUIChangeEventDetails {
  reason: string;
  event: Event;
  cancel: () => void;
  allowPropagation: () => void;
  isCanceled: boolean;
  isPropagationAllowed: boolean;
}
```

| Property | Purpose |
|----------|---------|
| `reason` | Why the change event occurred — useful for conditionally running side effects. Most IDEs show possible string values after typing `reason === '`. |
| `event` | The native DOM event that caused the change. |
| `cancel()` | Stops the component from changing its internal state. |
| `allowPropagation()` | Allows the DOM event to propagate in cases where Base UI stops the propagation. |
| `isCanceled` | Whether the change event has been canceled. |
| `isPropagationAllowed` | Whether the DOM event is allowed to propagate. |

### Canceling a Base UI Event

An event can be canceled with the `cancel()` method on `eventDetails`:

```tsx
<Tooltip.Root
  onOpenChange={(open, eventDetails) => {
    if (eventDetails.reason === 'trigger-press') {
      // Stop the open change (false) from happening.
      eventDetails.cancel();
    }
  }}
>
  ...
</Tooltip.Root>
```

This lets you leave the component **uncontrolled** as its internal state is prevented from updating. This is an alternative to controlling the component with external state and guarding the state updates conditionally.

### Allowing Propagation of the DOM Event

In most components, pressing the Escape key stops the propagation of the event so parent popups don't close simultaneously. This can be customized with the `allowPropagation()` method:

```tsx
<Tooltip.Root
  onOpenChange={(open, eventDetails) => {
    if (eventDetails.reason === 'escape-key') {
      // Allow the DOM event to propagate.
      eventDetails.allowPropagation();
    }
  }}
>
  ...
</Tooltip.Root>
```

## Preventing Base UI from Handling a React Event

To prevent Base UI from handling a React event like `onClick`, use the `preventBaseUIHandler()` method on the event object:

```tsx
<NumberField.Input
  onPaste={(event) => {
    event.preventBaseUIHandler();
  }}
/>
```

This should be used as an **escape hatch** in cases where there isn't a prop yet to customize the behavior. In various cases, native events are used instead of React events, so this method has no effect.

## Controlling Components with State

Change event handlers enable a component to be **controlled** with your own external state.

Components are **uncontrolled by default**, meaning that they manage their own state internally.

```tsx
// Uncontrolled dialog
<Dialog.Root>
  <Dialog.Trigger /> {/* Opens the dialog when clicked. */}
</Dialog.Root>
```

A component can be made controlled by passing external state to a prop, such as `open` or `value`, and the state's setter to its corresponding change handler, such as `onOpenChange` or `onValueChange`.

For instance, you can open a Dialog after a timeout, without a trigger:

```tsx
// Controlled dialog
const [open, setOpen] = React.useState(false);

React.useEffect(() => {
  const timeout = setTimeout(() => {
    setOpen(true);
  }, 1000);
  return () => clearTimeout(timeout);
}, []);

return (
  <Dialog.Root open={open} onOpenChange={setOpen}>
    No trigger is needed in this case.
  </Dialog.Root>
);
```

This also allows you to read the state of the component outside of the root component.

## Quick Reference

| Pattern | Method | Use Case |
|---------|--------|----------|
| Cancel state change | `eventDetails.cancel()` | Keep component uncontrolled but prevent specific state updates |
| Allow event propagation | `eventDetails.allowPropagation()` | Let Escape key propagate to parent popups |
| Prevent Base UI handling | `event.preventBaseUIHandler()` | Stop Base UI from processing a React event |
| Controlled component | `open` + `onOpenChange` | Manage component state externally |
| Uncontrolled (default) | No `open` / `value` prop | Let the component manage its own state |
| Conditional side effects | `eventDetails.reason` | Run logic only for specific change reasons |

## Additional References

- **Official customization guide**: <https://base-ui.com/react/handbook/customization>
- **Official quick start**: <https://base-ui.com/react/overview/quick-start>
- **Composition guide**: See `@.agents/skills/base-ui-composition/SKILL.md` for render prop patterns
- **Styling guide**: See `@.agents/skills/base-ui-styling/SKILL.md` for styling patterns
- **Animation guide**: See `@.agents/skills/base-ui-animation/SKILL.md` for animation patterns
- **Migration audit**: See `@.agents/skills/base-ui-migration-audit/SKILL.md` for Radix-to-Base-UI migration patterns
