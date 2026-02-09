# Components Directory — Claude Context

This directory contains reusable UI components, primarily Shadcn/Base UI primitives.

> See `@app/components/CLAUDE.md` for app-specific components.
> These are generic, reusable building blocks.

## Primitive Library

**Base UI** (`@base-ui/react`) — migrated from Radix UI in February 2026.

- All `components/ui/` files import from `@base-ui/react/*` (not `@radix-ui/*`)
- The `components.json` style is `"base-vega"` — future `npx shadcn@latest add` pulls Base UI variants
- The `asChild` prop is supported via a compatibility shim (`lib/as-child-adapter.ts`) that translates to Base UI's `render` prop internally
- **Deprecation plan**: The `asChild` shim will eventually be removed; app-level code should migrate to the `render` prop pattern

## Structure Overview

```
components/
├── ui/               # Shadcn UI primitives (Base UI, auto-generated + customized)
│   ├── button.tsx
│   ├── dialog.tsx
│   ├── toast.tsx
│   └── ...
├── common/           # Shared app components
│   ├── button-copy.tsx
│   ├── feedback-form.tsx
│   └── model-selector/
├── icons/            # Provider/brand icons
│   ├── anthropic.tsx
│   ├── openai.tsx
│   └── ...
├── motion-primitives/  # Animation components
│   ├── animated-group.tsx
│   ├── text-shimmer.tsx
│   └── ...
└── prompt-kit/       # Chat UI building blocks
    ├── markdown.tsx
    ├── code-block.tsx
    └── message.tsx
```

## Key Patterns

### Shadcn UI Usage

```typescript
// Import from @/components/ui
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"

// Variants follow CVA patterns
<Button variant="default" size="sm">Click me</Button>
<Button variant="ghost" size="icon"><Icon /></Button>
```

### Toast Pattern

```typescript
import { toast } from "@/components/ui/toast"

// Success
toast({ title: "Saved!", status: "success" })

// Error
toast({ title: "Something went wrong", status: "error" })

// Info
toast({ title: "Feature coming soon", status: "info" })
```

### Icon Components

```typescript
// Provider icons for model selector
import { AnthropicIcon } from "@/components/icons/anthropic"
import { OpenAIIcon } from "@/components/icons/openai"

// All icons accept className for sizing
<AnthropicIcon className="h-4 w-4" />
```

## UI Component Categories

### Core Primitives (`ui/`)

| Component | Use Case |
|-----------|----------|
| `button.tsx` | All buttons |
| `dialog.tsx` | Modals, confirmations |
| `dropdown-menu.tsx` | Context menus, actions |
| `input.tsx` | Text inputs |
| `textarea.tsx` | Multi-line inputs |
| `toast.tsx` | Notifications |
| `tooltip.tsx` | Hover hints |

### Chat-Specific (`ui/` + `prompt-kit/`)

| Component | Use Case |
|-----------|----------|
| `markdown.tsx` | Render markdown content |
| `code-block.tsx` | Syntax-highlighted code |
| `message.tsx` | Chat message bubble |
| `reasoning.tsx` | AI reasoning display |
| `loader.tsx` | Streaming indicator |

### Animation (`motion-primitives/`)

| Component | Use Case |
|-----------|----------|
| `text-shimmer.tsx` | Loading text effect |
| `animated-group.tsx` | Staggered animations |
| `in-view.tsx` | Scroll-triggered animations |

## Conventions

1. **Styling**: Use Tailwind classes, follow existing patterns
2. **Variants**: Use `cva` for variant definitions
3. **Composition**: Build complex components from primitives
4. **Accessibility**: All interactive components must be keyboard accessible

## Adding New Shadcn Components

```bash
# Use the Shadcn CLI (ASK FIRST before running)
npx shadcn@latest add [component-name]
```

## Customization Rules

- **DO**: Add custom variants to existing components
- **DO**: Create wrappers with app-specific logic
- **DON'T**: Modify core Shadcn logic unless necessary
- **DON'T**: Override accessibility features

## Common Patterns

### Dialog with Form

```typescript
// asChild is supported via shim (translates to Base UI render prop internally)
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    {/* Form content */}
    <DialogFooter>
      <Button type="submit">Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Dropdown Menu

```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <MoreVertical />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### asChild Compatibility Shim

The `asChild` prop is preserved for backward compatibility. Internally, `lib/as-child-adapter.ts` translates it to Base UI's `render` prop:

```typescript
// Current (works via shim — will be deprecated)
<DialogTrigger asChild>
  <Button>Open</Button>
</DialogTrigger>

// Future (native Base UI pattern — preferred for new code)
<DialogTrigger render={<Button />}>
  Open
</DialogTrigger>
```

When writing **new** code, prefer the `render` prop pattern. Existing `asChild` usages will continue to work until the shim is removed.

## Notes

<!-- TODO: Document custom theme tokens -->
<!-- TODO: Add storybook for component documentation (future) -->
