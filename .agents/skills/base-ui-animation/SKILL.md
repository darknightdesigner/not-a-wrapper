---
name: base-ui-animation
description: Guide to animating Base UI components with CSS transitions, CSS animations, or JavaScript animation libraries (Motion). Use when adding open/close animations to popups, dialogs, tooltips, menus, or selects, when choosing between CSS transitions and Motion for Base UI components, when fixing animation issues like abrupt unmounting, or when implementing AnimatePresence with Base UI portals.
---

# Base UI Animation

A guide to animating Base UI components with CSS transitions, CSS animations, or JavaScript animation libraries.

Base UI components can be animated using CSS transitions, CSS animations, or JavaScript animation libraries. Each component provides data attributes to target its states, as well as attributes specifically designed for animation.

> **Official docs**: <https://base-ui.com/react/handbook/animation>
> **Quick start**: <https://base-ui.com/react/overview/quick-start>
> Each component's docs page has a "View as Markdown" link for LLM-friendly content, plus an `llms.txt` in the Handbook sidebar.

## CSS Transitions (Recommended)

Use the following Base UI attributes for creating transitions when a component becomes visible or hidden:

| Attribute | Purpose |
|-----------|---------|
| `[data-starting-style]` | Initial style to transition **from** (entering) |
| `[data-ending-style]` | Final style to transition **to** (exiting) |

Transitions are recommended over CSS animations because a transition can be **smoothly cancelled midway**. For example, if the user closes a popup before it finishes opening, CSS transitions will smoothly animate to the closed state without abrupt changes.

### Example: Popover with CSS Transitions

```css
.Popup {
  box-sizing: border-box;
  padding: 1rem 1.5rem;
  background-color: canvas;
  transform-origin: var(--transform-origin);
  transition:
    transform 150ms,
    opacity 150ms;

  &[data-starting-style],
  &[data-ending-style] {
    opacity: 0;
    transform: scale(0.9);
  }
}
```

### Tailwind CSS Equivalent

> **Important**: Tailwind v4 emits `scale` as an individual CSS property (not inside `transform`), so `transition: transform` won't cover `scale-95`. Use `[transform:scale(0.95)]` to keep scaling on the `transform` property, and an inline `style` for the transition to avoid ambiguity.

```tsx
<Menu.Popup
  className="origin-[var(--transform-origin)] data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)] data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]"
  style={{ transition: "opacity 150ms ease-out, transform 150ms ease-out" }}
>
  {/* content */}
</Menu.Popup>
```

## CSS Animations

Use the following Base UI attributes for CSS `@keyframes` animations:

| Attribute | Purpose |
|-----------|---------|
| `[data-open]` | Style applied when component becomes **visible** |
| `[data-closed]` | Style applied before component becomes **hidden** |

### Example: Popover with CSS Animations

```css
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes scaleOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}

.Popup[data-open] {
  animation: scaleIn 250ms ease-out;
}

.Popup[data-closed] {
  animation: scaleOut 250ms ease-in;
}
```

## JavaScript Animations (Motion)

JavaScript animation libraries such as [Motion](https://motion.dev) require control of the mounting and unmounting lifecycle for exit animations to play.

Base UI relies on [`element.getAnimations()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations) to detect if animations have finished on an element. When using Motion, `opacity` animations are reflected in `element.getAnimations()`, so Base UI automatically waits for the animation to finish before unmounting.

> **Important**: If `opacity` isn't part of your animation (e.g., a translating drawer), animate it using a value close to `1` (such as `opacity: 0.9999`) so Base UI can detect the animation.

### Pattern 1: Unmounted Components (Default Behavior)

Most popup components (Popover, Dialog, Tooltip, Menu) are unmounted from the DOM when closed. To animate them with Motion:

1. Make the component **controlled** with the `open` prop so `<AnimatePresence>` can see the state
2. Specify `keepMounted` on the `<Portal>` part
3. Use the `render` prop to compose the `<Popup>` with `motion.div`

```tsx
function AnimatedPopover() {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>Trigger</Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal keepMounted>
            <Popover.Positioner>
              <Popover.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  />
                }
              >
                Popup
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
```

### Pattern 2: Keep-Mounted Components

Components that specify `keepMounted` remain rendered in the DOM when closed. Use the `render` **function** prop (receives `props` and `state`) instead of `<AnimatePresence>`:

```tsx
function AnimatedPopoverKeptMounted() {
  return (
    <Popover.Root>
      <Popover.Trigger>Trigger</Popover.Trigger>
      <Popover.Portal keepMounted>
        <Popover.Positioner>
          <Popover.Popup
            render={(props, state) => (
              <motion.div
                {...(props as HTMLMotionProps<'div'>)}
                initial={false}
                animate={{
                  opacity: state.open ? 1 : 0,
                  scale: state.open ? 1 : 0.8,
                }}
              />
            )}
          >
            Popup
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

**Key differences from Pattern 1**:
- No controlled `open` state needed — `state.open` comes from the render function
- `initial={false}` prevents animation on first mount
- No `<AnimatePresence>` wrapper
- Props must be spread with type assertion: `{...(props as HTMLMotionProps<'div'>)}`

### Pattern 3: Select Component (Hybrid)

The Select component is initially unmounted but remains mounted after first interaction. A hybrid approach is needed:

```tsx
function AnimatedSelect() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const positionerRef = React.useCallback(() => {
    setMounted(true);
  }, []);

  const portalMounted = open || mounted;

  // Once triggered, the popup stays in the DOM — switch animation strategy
  const motionElement = mounted ? (
    // Keep-mounted strategy (Pattern 2 style)
    <motion.div
      initial={false}
      animate={{
        opacity: open ? 1 : 0,
        scale: open ? 1 : 0.8,
      }}
    />
  ) : (
    // Unmounted strategy (Pattern 1 style)
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    />
  );

  return (
    <Select.Root open={open} onOpenChange={setOpen}>
      <Select.Trigger>
        <Select.Value />
      </Select.Trigger>
      <AnimatePresence>
        {portalMounted && (
          <Select.Portal>
            <Select.Positioner ref={positionerRef}>
              <Select.Popup render={motionElement}>
                <Select.List>{/* items */}</Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        )}
      </AnimatePresence>
    </Select.Root>
  );
}
```

### Pattern 4: Manual Unmounting with `actionsRef`

For full control, manually unmount the component once animations finish using an `actionsRef` passed to the `<Root>`:

```tsx
function ManualUnmountPopover() {
  const [open, setOpen] = React.useState(false);
  const actionsRef = React.useRef(null);

  return (
    <Popover.Root open={open} onOpenChange={setOpen} actionsRef={actionsRef}>
      <Popover.Trigger>Trigger</Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal keepMounted>
            <Popover.Positioner>
              <Popover.Popup
                render={
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    onAnimationComplete={() => {
                      if (!open) {
                        actionsRef.current.unmount();
                      }
                    }}
                  />
                }
              >
                Popup
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
```

## Quick Reference: Which Pattern to Use

| Scenario | Pattern | Key Prop |
|----------|---------|----------|
| Default popup (unmounts when closed) | Pattern 1: `AnimatePresence` + controlled `open` | `keepMounted` on Portal |
| Always-mounted popup | Pattern 2: `render` function with `state.open` | `initial={false}` |
| Select (hybrid mount lifecycle) | Pattern 3: Track mount state, switch strategy | `positionerRef` callback |
| Need manual unmount control | Pattern 4: `actionsRef` + `onAnimationComplete` | `actionsRef` on Root |
| Simple enter/exit (no JS lib) | CSS Transitions | `data-starting-style` / `data-ending-style` |
| Keyframe animations (no JS lib) | CSS Animations | `data-open` / `data-closed` |

## Common Pitfalls

### Flash on Dismiss (Tailwind v4 + Base UI)

Tailwind v4's preflight applies `display: none !important` to `[hidden]`. Base UI sets `hidden` when `mounted` becomes false. CSS keyframe animations from `tailwindcss-animate` or `tw-animate-css` may not be reliably detected by `element.getAnimations()`, causing abrupt unmounting before the exit animation completes.

**Primary fix**: Use **CSS transitions** with `data-[starting-style]` / `data-[ending-style]`. CSS transitions ARE detected by `getAnimations()`, so Base UI correctly waits for them to complete before unmounting. Use `[transform:scale(0.95)]` (not Tailwind's `scale-95`) to keep scaling on the `transform` property — see Tailwind CSS Equivalent section above.

**Alternative**: Use Motion with the `render` prop. This works but adds a JS animation dependency that isn't needed for most cases.

```tsx
// ❌ CSS keyframe animations (flash — getAnimations() may not detect tw-animate)
className="data-[open]:animate-in data-[closed]:animate-out ..."

// ❌ Tailwind scale-95 + transition-[opacity,transform] (jittery — scale is individual property in v4)
className="transition-[opacity,transform] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ..."

// ✅ CSS transitions with [transform:scale()] (smooth, cancelable, no JS dependency)
<Popup
  className="data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)] data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]"
  style={{ transition: "opacity 150ms ease-out, transform 150ms ease-out" }}
/>

// ✅ Motion render prop (alternative — smooth but adds JS dependency)
render={(props, state) => (
  <motion.div
    {...props}
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: state.open ? 1 : 0, scale: state.open ? 1 : 0.95 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
  >
    {props.children}
  </motion.div>
)}
```

### Missing Opacity in Non-Opacity Animations

If your animation doesn't include `opacity` (e.g., a sliding drawer), Base UI won't detect it via `getAnimations()`. Always include an opacity value close to `1`:

```tsx
// ❌ No opacity — Base UI can't detect animation
animate={{ x: state.open ? 0 : -300 }}

// ✅ Include near-1 opacity so Base UI detects the animation
animate={{ x: state.open ? 0 : -300, opacity: state.open ? 1 : 0.9999 }}
```

## Additional References

- **Animation handbook**: <https://base-ui.com/react/handbook/animation>
- **Styling guide**: See `@.agents/skills/base-ui-styling/SKILL.md`
- **Migration audit**: See `@.agents/skills/base-ui-migration-audit/SKILL.md` for Radix-to-Base-UI migration patterns and the Dialog flash fix
- **Motion library**: <https://motion.dev>
- **Dialog implementation**: `components/ui/dialog.tsx` uses CSS transitions with `data-[starting-style]`/`data-[ending-style]` + inline `style={{ transition }}` — the gold standard for all popup animations in this project
