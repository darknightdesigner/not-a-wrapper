# Icon System

This project uses a consolidated icon system with **HugeIcons Pro** as the primary library.

## Quick Start

### Default: HugeIcons

```typescript
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, Cancel01Icon, ArrowDown01Icon } from "@hugeicons-pro/core-stroke-rounded"

// Usage
<HugeiconsIcon icon={Tick02Icon} size={16} />
<HugeiconsIcon icon={Cancel01Icon} size={16} className="text-red-500" />
```

### Custom Brand Icons

```typescript
import { ClaudeIcon, OpenAIIcon } from "@/components/icons/claude"
// or default import
import ClaudeIcon from "@/components/icons/claude"
```

All brand icons support the `size` prop:

```tsx
<ClaudeIcon size={24} />
<OpenAIIcon size={32} className="text-primary" />
```

### Re-exported Icons (via lib/icons)

Some commonly used icons are re-exported from `@/lib/icons` for convenience:

```typescript
import { HugeiconsIcon, PinIcon, PinOffIcon, PanelLeftIcon, GripVerticalIcon } from "@/lib/icons"
```

## Creating New Custom Icons

Use the `createIcon` factory for simple path-based icons:

```typescript
import { createIcon } from "@/lib/icons"

export const MyIcon = createIcon(
  <path d="..." fill="currentColor" />,
  { viewBox: "0 0 24 24", displayName: "MyIcon" }
)
```

For complex icons with gradients/defs, use the forwardRef pattern:

```typescript
import { forwardRef, type SVGProps } from "react"

export interface MyIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

export const MyIcon = forwardRef<SVGSVGElement, MyIconProps>(
  ({ size = 24, width, height, ...props }, ref) => (
    <svg
      ref={ref}
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 24 24"
      {...props}
    >
      {/* SVG content */}
    </svg>
  )
)

MyIcon.displayName = "MyIcon"
export default MyIcon
```

## Icon Mapping Reference

See `.agents/archive/icon-mapping-phosphor-hugeicons.md` for the complete Phosphor → HugeIcons mapping.

### Common Icons Quick Reference

| Purpose | HugeIcon |
|---------|----------|
| Checkmark | `Tick02Icon` |
| Close/X | `Cancel01Icon` |
| Arrow down | `ArrowDown01Icon` |
| Arrow up | `ArrowUp01Icon` |
| Arrow left | `ArrowLeft01Icon` |
| Arrow right | `ArrowRight01Icon` |
| Search | `Search01Icon` |
| Loading | `Loading01Icon` |
| Refresh | `RefreshIcon` |
| Warning | `Alert01Icon` |
| Error | `AlertCircleIcon` |
| Info | `InformationCircleIcon` |
| Delete | `Delete01Icon` |
| More (horizontal) | `MoreHorizontalIcon` |
| More (vertical) | `MoreVerticalIcon` |
| Quote | `QuoteUpIcon` |
| Chat | `Chat01Icon` |
| Settings | `Settings01Icon` |
| User | `User02Icon` |
| Copy | `Copy01Icon` |
| Edit | `PencilEdit01Icon` |
| Add | `Add01Icon` |
| Minus | `MinusSignIcon` |

## Available Brand Icons

- `AnthropicIcon`
- `ClaudeIcon`
- `DeepseekIcon`
- `GeminiIcon`
- `GoogleIcon`
- `GrokIcon`
- `MetaIcon`
- `MistralIcon`
- `OllamaIcon`
- `OpenAIIcon`
- `OpenRouterIcon`
- `PerplexityIcon`
- `XaiIcon`
- `XIcon` (X/Twitter logo)
- `ZolaIcon`

## Migration Guide

See `.agents/archive/icon-mapping-phosphor-hugeicons.md` for the Phosphor → HugeIcons migration details.
