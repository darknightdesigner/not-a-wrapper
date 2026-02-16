# Components Directory — Claude Context

This directory contains reusable UI components, primarily Shadcn/Base UI primitives.

> See `@app/components/CLAUDE.md` for app-specific components.
> These are generic, reusable building blocks.

## Primitive Library

**Base UI** (`@base-ui/react`) — migrated from Radix UI in February 2026.

- All `components/ui/` files import from `@base-ui/react/*` (not `@radix-ui/*`)
- The `components.json` style is `"base-vega"` — future `npx shadcn@latest add` pulls Base UI variants
- Composition uses Base UI's native `render` prop pattern
- Legacy `asChild` compatibility utilities have been removed

### Third-Party Dependencies

| Package | Used In | Notes |
|---------|---------|-------|
| `cmdk` | `components/ui/command.tsx` | Command palette search/filter engine. Radix is a transitive dep inside cmdk but our code wraps cmdk in our own Base UI Dialog — cmdk's Radix Dialog is never used. |
| `vaul-base` | `components/ui/drawer.tsx` | Base UI port of vaul (drawer with touch gestures). Replaced `vaul` (Radix-based, unmaintained) in February 2026. |

> **No direct `@radix-ui/*` imports exist in source code.** The only Radix presence is as a transitive dependency of `cmdk`.

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
<Dialog>
  <DialogTrigger render={<Button />}>Open</DialogTrigger>
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
  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
    <MoreVertical />
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Render Prop Pattern

Use `render` for composition in trigger and slot-style components:

```typescript
<DialogTrigger render={<Button />}>
  Open
</DialogTrigger>

<Button render={<a href="/docs" />}>Docs</Button>
```

## Notes

<!-- TODO: Document custom theme tokens -->
<!-- TODO: Add storybook for component documentation (future) -->
