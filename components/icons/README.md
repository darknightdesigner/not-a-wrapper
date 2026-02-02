# Icon System

This project uses a consolidated icon system with **Phosphor Icons** as the primary library.

## Quick Start

### Default: Phosphor Icons

```typescript
import { Check, X, CaretDown } from "@phosphor-icons/react"

// For Server Components, use SSR import
import { Check } from "@phosphor-icons/react/dist/ssr"
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

### Exception Icons (Non-Phosphor)

Some icons don't have Phosphor equivalents and are imported from Lucide via `@/lib/icons`:

```typescript
import { Pin, PinOff, PanelLeft, GripVertical } from "@/lib/icons"
```

**Do NOT import directly from `lucide-react`** — ESLint will error.

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

## Icon Mapping (Lucide → Phosphor)

| Lucide | Phosphor |
|--------|----------|
| `Check` | `Check` |
| `X` | `X` |
| `ChevronDown` | `CaretDown` |
| `ChevronUp` | `CaretUp` |
| `ChevronRight` | `CaretRight` |
| `ChevronLeft` | `CaretLeft` |
| `ArrowLeft` | `ArrowLeft` |
| `ArrowRight` | `ArrowRight` |
| `Search` | `MagnifyingGlass` |
| `Loader2` | `SpinnerGap` |
| `RefreshCw` | `ArrowClockwise` |
| `AlertCircle` | `WarningCircle` |
| `AlertTriangle` | `Warning` |
| `Trash2` | `Trash` |
| `MoreHorizontal` | `DotsThreeOutline` |
| `Quote` | `Quotes` |
| `MessageCircle` | `ChatCircle` |
| `Settings` | `Gear` |

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
- `Vid0Icon`
- `XaiIcon`
- `XIcon` (X/Twitter logo)
- `ZolaIcon`

## Migration Guide

See `.agents/archive/icon-system-migration-plan-2026-01.md` for the complete migration plan and rationale.
