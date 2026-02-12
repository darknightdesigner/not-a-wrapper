---
name: base-ui-migration-audit
description: Audit and fix Base UI migration issues from the Radix UI to Base UI transition. Use when debugging console errors mentioning "Base UI", "nativeButton", or "render prop", when dialogs/drawers flash and disappear, when dropdown menu items don't prevent closing, when onInteractOutside/onCloseAutoFocus/forceMount handlers seem ignored, or when the user mentions Base UI migration problems.
---

# Base UI Migration Audit

Scan and fix issues left over from the Radix UI → Base UI (`@base-ui/react`) migration.

## Background

This project migrated from Radix UI to Base UI in February 2026. The `components/ui/` wrappers use a compatibility shim (`lib/as-child-adapter.ts`) that translates Radix's `asChild` prop to Base UI's `render` prop. Several Radix-era patterns silently break under Base UI because the wrappers accept deprecated props without error but discard them.

## Audit Checklist

Run through each category. For each issue found, apply the fix pattern shown.

### 1. Discarded Radix Props (Silent Failures)

**What to look for**: App code passing Radix-only props to wrapper components. These props are accepted by the TypeScript types (for backward compat) but silently ignored at runtime.

**Scan command**:
```
Search app/ for: onInteractOutside, onCloseAutoFocus, onPointerDownOutside, onEscapeKeyDown, forceMount
```

**Known discarded props in wrappers**:

| Wrapper | Discarded Props | Location |
|---------|----------------|----------|
| `DropdownMenuContent` | `forceMount`, `onCloseAutoFocus`, `onInteractOutside` | `components/ui/dropdown-menu.tsx` |

**Fix pattern**: Remove the prop usage from app code. Replace with Base UI equivalents:

| Radix Prop | Base UI Equivalent |
|------------|-------------------|
| `onInteractOutside` | Control `open`/`onOpenChange` on the Root component |
| `onCloseAutoFocus` | No equivalent; manage focus manually if needed |
| `forceMount` | No equivalent; use controlled `open` state |
| `onEscapeKeyDown` | Handle via `onOpenChange` |

### 2. Dead `onSelect` on Menu Items

**What to look for**: `<DropdownMenuItem onSelect={...}>` — Base UI's `Menu.Item` does not have `onSelect`. This was a Radix pattern for intercepting item selection (commonly `e.preventDefault()` to prevent menu close).

When `onSelect` is spread via `{...props}` to the DOM element, it becomes the native HTML `select` event (text selection in inputs/textareas) — completely irrelevant. The `e.preventDefault()` call does nothing to prevent menu closure.

**Scan command**:
```
Search app/ and components/ for: onSelect=
```

**Fix pattern**: Replace with the appropriate Base UI equivalent:

```tsx
// ❌ Radix pattern (silently ignored in Base UI — menu closes on every click)
<DropdownMenuItem onSelect={(e) => {
  e.preventDefault()
  doSomething()
}}>

// ✅ Base UI: use onClick for the action (menu closes after click — default behavior)
<DropdownMenuItem onClick={() => doSomething()}>

// ✅ Base UI: use closeOnClick={false} to KEEP the menu open after click
//    Use this for multi-select menus (checkboxes, toggles, multi-model selectors)
<DropdownMenuItem closeOnClick={false} onClick={() => toggleItem(id)}>

// ✅ If the goal was to open a dialog, restructure:
//    Move the dialog/drawer OUTSIDE the DropdownMenu tree (see issue #3)
```

**Key detail**: `closeOnClick` is a first-class Base UI prop on `Menu.Item` (defaults to `true`). It passes through the `DropdownMenuItem` wrapper via `{...props}` since it's part of `MenuPrimitive.Item.Props`. No wrapper changes needed.

### 3. Dialog/Modal Animation (Base UI + Tailwind v4)

**What to look for**: A `Dialog` that flashes on dismiss, has jittery scale animations, or uses a JS animation library (Motion) where pure CSS transitions would suffice.

**Root cause history**: Three approaches were tried before landing on the correct one:
1. `tailwindcss-animate` keyframes — flash on dismiss because `getAnimations()` didn't reliably detect them, so Base UI unmounted early.
2. CSS transitions with Tailwind's `scale-95` — jittery because Tailwind v4 emits `scale` as an individual CSS property (not inside `transform`), so `transition-[opacity,transform]` didn't cover it.
3. Motion `render` prop — worked but added a JS animation dependency and required stripping conflicting event handlers for TypeScript compatibility.

**Fix pattern**: Use **CSS transitions** with Base UI's `data-[starting-style]` / `data-[ending-style]` attributes. The key is using the legacy `transform: scale()` function (via Tailwind arbitrary property `[transform:scale(0.95)]`) so that `transition: transform` covers it, while `translate` (used for centering) stays on the individual `translate` property and isn't transitioned.

```tsx
// ❌ CSS animations (flash — getAnimations() may not detect tw-animate)
className="data-[open]:animate-in data-[closed]:animate-out ..."

// ❌ Tailwind scale-95 + transition-[opacity,transform] (jittery — scale is individual property)
className="transition-[opacity,transform] data-[starting-style]:scale-95 ..."

// ❌ Motion render prop (works but unnecessary JS dependency)
<DialogPrimitive.Popup render={(props, state) => <motion.div ... />} />

// ✅ CSS transitions with transform: scale() (smooth, cancelable mid-animation)
<DialogPrimitive.Popup
  className={cn(
    "... translate-x-[-50%] translate-y-[-50%] ...",
    "data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.95)]",
    "data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.95)]",
  )}
  style={{ transition: "opacity 200ms ease-out, transform 200ms ease-out" }}
/>
```

**Why inline `style` for transition**: Tailwind's `transition-[opacity,transform]` arbitrary utility may not reliably compose with `duration-*` and `ease-*` for custom property lists. An inline `style` is explicit and avoids ambiguity.

**Reference**: `components/ui/dialog.tsx` (Feb 2026). See also: [Base UI Animation Handbook](https://base-ui.com/react/handbook/animation#css-transitions), [mui/base-ui#1608](https://github.com/mui/base-ui/issues/1608).

### 4. Dialogs/Drawers Inside Dropdown Menus (Flash & Disappear)

**What to look for**: A `Dialog`, `Drawer`, or `Popover` whose root is rendered inside `DropdownMenuContent`. When the menu item is clicked, Base UI closes the menu, unmounting the content tree — including the dialog that just opened.

**Symptoms**: Dialog/drawer briefly appears then immediately disappears.

**Scan command**:
```
Search app/ for components that:
1. Are rendered inside DropdownMenuContent (directly or via shared menuContent)
2. Contain <Dialog>, <Drawer>, or <Popover> roots
3. Use <DialogTrigger asChild> / <DrawerTrigger asChild> wrapping a DropdownMenuItem
```

**Fix pattern**: Separate the menu item from the dialog. Render the dialog outside the dropdown tree.

```tsx
// ❌ BROKEN: Dialog is inside DropdownMenuContent — unmounts when menu closes
<DropdownMenu>
  <DropdownMenuContent>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>...</DialogContent>
    </Dialog>
  </DropdownMenuContent>
</DropdownMenu>

// ✅ FIXED: Dialog is a sibling of DropdownMenu — survives menu close
<>
  <DropdownMenu>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => setOpen(true)}>
        Settings
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent>...</DialogContent>
  </Dialog>
</>
```

**Key principle**: The `Dialog`/`Drawer` root manages open state. If it unmounts, the dialog closes — even though `DialogContent` uses a portal. Always render dialog roots at a level that won't unmount unexpectedly.

### 5. `nativeButton` Mismatch Errors

**What to look for**: Console error: "Base UI: A component that acts as a button was not rendered as a native `<button>`..."

This fires when a Base UI trigger (Dialog, Menu, Popover, Collapsible) renders a non-`<button>` element via the `render` prop, but Base UI assumes it's a native button.

**Scan command**:
```
Search app/ for: Trigger asChild> or render={
Then check: Is the child a native <button> or a component that renders <button>?
```

**Fix pattern**: Pass `nativeButton={false}` when the rendered element is NOT a native button:

```tsx
// Child is a <div>-based component (e.g. DropdownMenuItem) — needs nativeButton={false}
<DialogTrigger asChild nativeButton={false}>
  <DropdownMenuItem>Open</DropdownMenuItem>
</DialogTrigger>

// Child IS a <button> (e.g. Button, SidebarMenuButton) — no prop needed
<DropdownMenuTrigger asChild>
  <SidebarMenuButton>Menu</SidebarMenuButton>
</DropdownMenuTrigger>
```

**Note**: Prefer fixing issue #4 (dialogs inside dropdowns) first — if you lift the dialog out of the dropdown, you won't need `asChild` on DialogTrigger with a DropdownMenuItem at all.

### 6. `asChild` on Non-Trigger Components

**What to look for**: `asChild` used on components that don't support it in Base UI (e.g., content wrappers, non-interactive elements).

**Scan command**:
```
Search app/ for: asChild
Cross-reference with components/ui/ to verify the wrapper supports asChild
```

**Supported wrappers** (have `adaptAsChild` in their implementation):
- `DialogTrigger`, `DrawerTrigger`, `DrawerClose`
- `DropdownMenuTrigger`
- `PopoverTrigger`
- `TooltipTrigger`
- `CollapsibleTrigger`
- `HoverCardTrigger`
- `Button` (via `adaptSlotAsChild`)

## Audit Workflow

1. **Scan** — Run the search patterns above across `app/` for each issue category
2. **Triage** — Categorize findings by severity:
   - **P0 (broken)**: Dialogs that flash/disappear, click handlers that do nothing
   - **P1 (console noise)**: `nativeButton` warnings, deprecated prop warnings
   - **P2 (tech debt)**: `asChild` usages that should migrate to `render` prop
3. **Fix** — Apply fix patterns, prioritizing P0 issues
4. **Verify** — Run `bun run lint` and `bun run typecheck`, then test in browser

## Reference: Radix → Base UI Prop Mapping

| Radix Pattern | Base UI Equivalent |
|--------------|-------------------|
| `asChild` | `render={<Element />}` (via shim for now) |
| `onSelect` (MenuItem) | `onClick` (action) + `closeOnClick={false}` (keep open) |
| `onSelect` + `e.preventDefault()` | `closeOnClick={false}` on `Menu.Item` |
| `onInteractOutside` | Controlled `open` + `onOpenChange` |
| `onCloseAutoFocus` | Manual focus management |
| `onEscapeKeyDown` | Handled by `onOpenChange(false)` |
| `forceMount` | Controlled `open` state |
| `onOpenAutoFocus` | No equivalent; use `autoFocus` or `useEffect` |
| `modal` (Dialog) | `modal` (same API) |
| `Slot` | `useRender` / `render` prop |

## Gold Standard: Fixed Patterns

**Dialog-outside-dropdown** — See `app/components/layout/user-menu.tsx`:
- `SettingsMenuItem` / `SettingsDialog` split in `settings/settings-trigger.tsx`
- `FeedbackMenuItem` / `FeedbackDialog` split in `feedback/feedback-trigger.tsx`
- Dialogs rendered as siblings of `DropdownMenu`, not inside `DropdownMenuContent`

**Multi-select dropdown (closeOnClick)** — See `components/common/multi-model-selector/base.tsx`:
- Uses `closeOnClick={false}` + `onClick` on each `DropdownMenuItem`
- Menu stays open while toggling model checkboxes
- Replaces the dead Radix `onSelect` + `e.preventDefault()` pattern
