# Icon System Migration Plan: Phosphor Consolidation

> **Status**: Ready for Implementation  
> **Approach**: Consolidate to Phosphor Icons + Custom SVGs  
> **Author**: AI Agent  
> **Date**: 2026-01-21  
> **Estimated Files**: ~38 Lucide → Phosphor migrations + 16 custom icon standardizations

---

## Executive Summary

Migrate from dual icon libraries (Phosphor + Lucide) to **Phosphor-only** with a lightweight helper for custom SVG icons. This reduces bundle size, simplifies the mental model, and maintains flexibility for future needs.

### Goals

1. **Single icon library** — Phosphor as the default
2. **Reduced bundle size** — Remove Lucide dependency (~30-50KB gzipped)
3. **Consistent API** — All icons support `size` prop and weight variants
4. **Custom icon flexibility** — Simple pattern for brand/custom SVGs
5. **Documented exceptions** — Clear guidance for edge cases

### Non-Goals

- Building a full abstraction layer
- Changing icon visual design
- Migrating custom brand icons to Phosphor

---

## Architecture

```
@phosphor-icons/react        # Primary icon source (already installed)
├── Client imports           # import { Icon } from "@phosphor-icons/react"
└── Server imports           # import { Icon } from "@phosphor-icons/react/dist/ssr"

components/icons/            # Custom brand icons (16 files, unchanged location)
├── claude.tsx              
├── openai.tsx              
└── ...                     

lib/icons/                   # NEW: Lightweight helpers
├── create-icon.tsx          # Factory for consistent custom icons (~25 lines)
├── extras.ts                # Re-exports for icons without Phosphor equivalents (~10 lines)
└── index.ts                 # Barrel export for custom utilities
```

---

## Icon Mapping: Lucide → Phosphor

### Direct Equivalents

| Lucide | Phosphor | Notes |
|--------|----------|-------|
| `Check` | `Check` | Identical |
| `CheckIcon` | `Check` | Same icon |
| `X` | `X` | Identical |
| `XIcon` | `X` | Same icon |
| `ChevronDown` | `CaretDown` | Different name |
| `ChevronDownIcon` | `CaretDown` | Different name |
| `ChevronUp` | `CaretUp` | Different name |
| `ChevronUpIcon` | `CaretUp` | Different name |
| `ChevronRight` | `CaretRight` | Different name |
| `ChevronRightIcon` | `CaretRight` | Different name |
| `ChevronLeft` | `CaretLeft` | Different name |
| `ArrowLeft` | `ArrowLeft` | Identical |
| `ArrowRight` | `ArrowRight` | Identical |
| `SearchIcon` | `MagnifyingGlass` | Different name |
| `Loader2` | `SpinnerGap` | Animated spinner |
| `RefreshCw` | `ArrowClockwise` | Different name |
| `AlertCircle` | `WarningCircle` | Different name |
| `AlertTriangle` | `Warning` | Different name |
| `Info` | `Info` | Identical |
| `User` | `User` | Identical |
| `Trash2` | `Trash` | Different name |
| `MoreHorizontal` | `DotsThreeOutline` | Different name |
| `ThumbsUp` | `ThumbsUp` | Identical |
| `ThumbsDown` | `ThumbsDown` | Identical |
| `Quote` | `Quotes` | Different name |
| `Folder` | `Folder` | Identical |
| `MessageCircle` | `ChatCircle` | Different name |
| `WalletCards` | `Wallet` | Close match |
| `Circle` | `Circle` | Identical |
| `CircleIcon` | `Circle` | Same icon |
| `Minus` | `Minus` | Identical |
| `MinusIcon` | `Minus` | Same icon |

### Icons Requiring `lib/icons/extras.ts`

These Lucide icons don't have direct Phosphor equivalents:

| Lucide | Recommended Solution |
|--------|---------------------|
| `Pin` | Keep in `extras.ts` (Phosphor's `PushPin` has different semantics) |
| `PinOff` | Keep in `extras.ts` |
| `PanelLeft` | Use Phosphor's `SidebarSimple` or keep in `extras.ts` |
| `PanelLeftIcon` | Use Phosphor's `SidebarSimple` or keep in `extras.ts` |
| `GripVertical` | Use Phosphor's `DotsSixVertical` or keep in `extras.ts` |
| `GripVerticalIcon` | Use Phosphor's `DotsSixVertical` or keep in `extras.ts` |

---

## Implementation Phases

### Phase 0: Setup Infrastructure (Non-Breaking)

**Objective**: Create helper utilities before any migrations.

#### Task 0.1: Create `lib/icons/create-icon.tsx`

```typescript
// lib/icons/create-icon.tsx
import { forwardRef, type ReactNode, type SVGProps } from "react"

export interface CustomIconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in pixels. Sets both width and height. @default 24 */
  size?: number | string
}

interface CreateIconOptions {
  /** SVG viewBox attribute @default "0 0 24 24" */
  viewBox?: string
  /** Display name for React DevTools */
  displayName: string
}

/**
 * Factory function to create consistent custom SVG icons.
 * Matches Phosphor's API (size prop, ref forwarding).
 */
export function createIcon(path: ReactNode, options: CreateIconOptions) {
  const { viewBox = "0 0 24 24", displayName } = options

  const Icon = forwardRef<SVGSVGElement, CustomIconProps>(
    ({ size = 24, width, height, ...props }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        width={width ?? size}
        height={height ?? size}
        fill="none"
        {...props}
      >
        {path}
      </svg>
    )
  )

  Icon.displayName = displayName
  return Icon
}
```

#### Task 0.2: Create `lib/icons/extras.ts`

```typescript
// lib/icons/extras.ts
/**
 * Icons from other libraries that don't have Phosphor equivalents.
 * Document why each icon is here.
 */

// Pin icons - Phosphor's PushPin has different visual style
export { Pin, PinOff } from "lucide-react"

// Panel icons - Used by Shadcn sidebar, Phosphor's SidebarSimple differs
export { PanelLeft } from "lucide-react"

// Grip icons - Used by react-resizable-panels
export { GripVertical } from "lucide-react"
```

#### Task 0.3: Create `lib/icons/index.ts`

```typescript
// lib/icons/index.ts
export { createIcon, type CustomIconProps } from "./create-icon"
export * from "./extras"
```

#### Verification Checklist

```bash
# Run after Phase 0
bun run typecheck  # Should pass
bun run lint       # Should pass
```

- [ ] `lib/icons/create-icon.tsx` compiles without errors
- [ ] `lib/icons/extras.ts` compiles without errors
- [ ] `lib/icons/index.ts` exports all utilities
- [ ] No runtime errors when importing from `@/lib/icons`

---

### Phase 1: Standardize Custom Brand Icons

**Objective**: Update 16 custom icons to use consistent patterns.

#### Files to Update

| File | Current Export | Target Export |
|------|----------------|---------------|
| `components/icons/claude.tsx` | `export default Icon` | `export const ClaudeIcon` + `export default` |
| `components/icons/openai.tsx` | `export default Icon` | `export const OpenAIIcon` + `export default` |
| `components/icons/google.tsx` | `export default Icon` | `export const GoogleIcon` + `export default` |
| `components/icons/mistral.tsx` | `export default Icon` | `export const MistralIcon` + `export default` |
| `components/icons/perplexity.tsx` | `export default Icon` | `export const PerplexityIcon` + `export default` |
| `components/icons/openrouter.tsx` | `export default Icon` | `export const OpenRouterIcon` + `export default` |
| `components/icons/xai.tsx` | `export default Icon` | `export const XaiIcon` + `export default` |
| `components/icons/x.tsx` | `export default Icon` | `export const XIcon` + `export default` |
| `components/icons/anthropic.tsx` | `export default Icon` | `export const AnthropicIcon` + `export default` |
| `components/icons/deepseek.tsx` | `export default Icon` | `export const DeepseekIcon` + `export default` |
| `components/icons/gemini.tsx` | `export default Icon` | `export const GeminiIcon` + `export default` |
| `components/icons/grok.tsx` | `export default Icon` | `export const GrokIcon` + `export default` |
| `components/icons/meta.tsx` | `export default Icon` | `export const MetaIcon` + `export default` |
| `components/icons/ollama.tsx` | `export default Icon` | `export const OllamaIcon` + `export default` |
| `components/icons/zola.tsx` | `export default Icon` | `export const ZolaIcon` + `export default` |
| `components/icons/vid0.tsx` | `export function Vid0Icon` | Already correct, add size prop |

#### Migration Pattern

```typescript
// BEFORE: components/icons/claude.tsx
import * as React from "react"
import type { SVGProps } from "react"

const Icon = (props: SVGProps<SVGSVGElement>) => (
  <svg width={64} height={64} viewBox="0 0 64 64" fill="none" {...props}>
    <path fill="#D97757" d="..." />
  </svg>
)
export default Icon

// AFTER: components/icons/claude.tsx
import { createIcon } from "@/lib/icons/create-icon"

export const ClaudeIcon = createIcon(
  <path fill="#D97757" d="..." />,
  { viewBox: "0 0 64 64", displayName: "ClaudeIcon" }
)

// Backward compatibility
export default ClaudeIcon
```

#### Verification Checklist

```bash
# Run after Phase 1
bun run typecheck
bun run lint
bun run dev  # Visual check that icons render correctly
```

- [ ] All 16 icons updated to use `createIcon`
- [ ] All icons have named exports
- [ ] All icons maintain default exports for backward compatibility
- [ ] Icons render at correct default size (24px)
- [ ] Icons accept and respect `size` prop

---

### Phase 2: Migrate Shadcn UI Components

**Objective**: Update `components/ui/` files from Lucide to Phosphor.

#### Files to Migrate (22 files)

| File | Lucide Icons | Phosphor Replacements |
|------|--------------|----------------------|
| `components/ui/accordion.tsx` | `ChevronDownIcon` | `CaretDown` |
| `components/ui/breadcrumb.tsx` | `ChevronRight`, `MoreHorizontal` | `CaretRight`, `DotsThreeOutline` |
| `components/ui/calendar.tsx` | (check actual usage) | (map accordingly) |
| `components/ui/carousel.tsx` | `ArrowLeft`, `ArrowRight` | `ArrowLeft`, `ArrowRight` |
| `components/ui/chain-of-thought.tsx` | `ChevronDown`, `Circle` | `CaretDown`, `Circle` |
| `components/ui/checkbox.tsx` | `CheckIcon` | `Check` |
| `components/ui/command.tsx` | `SearchIcon` | `MagnifyingGlass` |
| `components/ui/context-menu.tsx` | `CheckIcon`, `ChevronRightIcon`, `CircleIcon` | `Check`, `CaretRight`, `Circle` |
| `components/ui/dialog.tsx` | `XIcon` | `X` |
| `components/ui/dropdown-menu.tsx` | `CheckIcon`, `ChevronRightIcon`, `CircleIcon` | `Check`, `CaretRight`, `Circle` |
| `components/ui/feedback-bar.tsx` | `ThumbsDown`, `ThumbsUp`, `X` | `ThumbsDown`, `ThumbsUp`, `X` |
| `components/ui/input-otp.tsx` | `MinusIcon` | `Minus` |
| `components/ui/menubar.tsx` | `CheckIcon`, `ChevronRightIcon`, `CircleIcon` | `Check`, `CaretRight`, `Circle` |
| `components/ui/morphing-dialog.tsx` | `XIcon` | `X` |
| `components/ui/navigation-menu.tsx` | `ChevronDownIcon` | `CaretDown` |
| `components/ui/pagination.tsx` | (check actual usage) | (map accordingly) |
| `components/ui/radio-group.tsx` | `CircleIcon` | `Circle` |
| `components/ui/reasoning.tsx` | `ChevronDownIcon` | `CaretDown` |
| `components/ui/resizable.tsx` | `GripVerticalIcon` | `@/lib/icons` (extras) |
| `components/ui/scroll-button.tsx` | `ChevronDown` | `CaretDown` |
| `components/ui/select.tsx` | `CheckIcon`, `ChevronDownIcon`, `ChevronUpIcon` | `Check`, `CaretDown`, `CaretUp` |
| `components/ui/sheet.tsx` | `XIcon` | `X` |
| `components/ui/sidebar.tsx` | `PanelLeftIcon` | `@/lib/icons` (extras) or `SidebarSimple` |
| `components/ui/sonner.tsx` | (check actual usage) | (map accordingly) |
| `components/ui/steps.tsx` | `ChevronDown` | `CaretDown` |
| `components/ui/system-message.tsx` | `AlertCircle`, `AlertTriangle`, `Info` | `WarningCircle`, `Warning`, `Info` |
| `components/ui/thinking-bar.tsx` | `ChevronRight` | `CaretRight` |
| `components/ui/tool.tsx` | (check actual usage) | (map accordingly) |

#### Migration Pattern

```typescript
// BEFORE
import { ChevronDownIcon } from "lucide-react"

// AFTER
import { CaretDown } from "@phosphor-icons/react"

// Usage stays the same
<CaretDown className="h-4 w-4" />
// Or with Phosphor's size prop
<CaretDown size={16} />
```

#### Verification Checklist

```bash
# Run after each file migration
bun run typecheck
bun run lint

# Run after all Phase 2 migrations
bun run build  # Full production build
```

- [ ] All `components/ui/` files migrated
- [ ] No remaining `lucide-react` imports in `components/ui/`
- [ ] Visual regression check on Shadcn components
- [ ] Dropdown menus, dialogs, accordions function correctly

---

### Phase 3: Migrate App Components

**Objective**: Update `app/components/` files from Lucide to Phosphor.

#### Files to Migrate (12 files)

| File | Lucide Icons | Phosphor Replacements |
|------|--------------|----------------------|
| `app/components/chat/quote-button.tsx` | `Quote` | `Quotes` |
| `app/components/history/chat-preview-panel.tsx` | `AlertCircle`, `Loader2`, `RefreshCw` | `WarningCircle`, `SpinnerGap`, `ArrowClockwise` |
| `app/components/history/command-history.tsx` | `Pin`, `PinOff` | `@/lib/icons` (extras) |
| `app/components/history/drawer-history.tsx` | `Pin`, `PinOff` | `@/lib/icons` (extras) |
| `app/components/layout/sidebar/app-sidebar.tsx` | `Pin` | `@/lib/icons` (extras) |
| `app/components/layout/sidebar/sidebar-item-menu.tsx` | `Pin`, `PinOff` | `@/lib/icons` (extras) |
| `app/components/layout/settings/apikeys/byok-section.tsx` | `Loader2`, `Trash2` | `SpinnerGap`, `Trash` |

#### Migration Pattern

```typescript
// BEFORE
import { Pin, PinOff } from "lucide-react"

// AFTER (for icons in extras.ts)
import { Pin, PinOff } from "@/lib/icons"

// BEFORE
import { Loader2 } from "lucide-react"

// AFTER (direct Phosphor)
import { SpinnerGap } from "@phosphor-icons/react"
```

#### Verification Checklist

- [ ] All `app/components/` files migrated
- [ ] Pin/unpin functionality works correctly
- [ ] Loading spinners animate properly
- [ ] No remaining direct `lucide-react` imports in `app/`

---

### Phase 4: Migrate Motion Primitives

**Objective**: Update `components/motion-primitives/` files.

#### Files to Migrate (2 files)

| File | Lucide Icons | Phosphor Replacements |
|------|--------------|----------------------|
| `components/motion-primitives/toolbar-dynamic.tsx` | `ArrowLeft`, `Search`, `User` | `ArrowLeft`, `MagnifyingGlass`, `User` |
| `components/motion-primitives/toolbar-expandable.tsx` | `Folder`, `MessageCircle`, `User`, `WalletCards` | `Folder`, `ChatCircle`, `User`, `Wallet` |

#### Verification Checklist

- [ ] Both files migrated
- [ ] Toolbar animations still work
- [ ] No visual regressions

---

### Phase 5: Cleanup & Enforcement

**Objective**: Remove Lucide dependency and prevent reintroduction.

#### Task 5.1: Audit Remaining Lucide Imports

```bash
# Find any remaining Lucide imports
rg "from ['\"]lucide-react['\"]" --type ts --type tsx

# Expected: Only lib/icons/extras.ts should have Lucide imports
```

#### Task 5.2: Update ESLint Configuration

```javascript
// eslint.config.mjs - Add restricted imports rule
{
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        {
          name: "lucide-react",
          message: "Use @phosphor-icons/react or @/lib/icons instead. See .agents/archive/icon-system-migration-plan-2026-01.md"
        }
      ],
      patterns: [
        {
          group: ["lucide-react/*"],
          message: "Use @phosphor-icons/react or @/lib/icons instead."
        }
      ]
    }]
  }
}
```

#### Task 5.3: Evaluate Lucide Removal

After all migrations, check if Lucide can be removed:

```bash
# Check extras.ts usage
rg "from ['\"]@/lib/icons['\"]" --type ts --type tsx

# If Pin, PinOff, PanelLeft, GripVertical are the only Lucide icons:
# Option A: Keep lucide-react for just those 4 icons
# Option B: Find Phosphor alternatives or create custom SVGs
```

If keeping Lucide for a few icons, update `package.json` comment:

```json
{
  "dependencies": {
    "lucide-react": "^0.562.0"  // Only for: Pin, PinOff, PanelLeft, GripVertical
  }
}
```

#### Task 5.4: Documentation

Create `components/icons/README.md`:

```markdown
# Icon System

## Default: Phosphor Icons

```typescript
import { Check, X, CaretDown } from "@phosphor-icons/react"

// Server Components
import { Check } from "@phosphor-icons/react/dist/ssr"
```

## Custom Brand Icons

```typescript
import { ClaudeIcon, OpenAIIcon } from "@/components/icons/claude"
// or
import ClaudeIcon from "@/components/icons/claude"
```

## Creating New Custom Icons

```typescript
import { createIcon } from "@/lib/icons"

export const MyIcon = createIcon(
  <path d="..." fill="currentColor" />,
  { viewBox: "0 0 24 24", displayName: "MyIcon" }
)
```

## Exception Icons (Non-Phosphor)

These icons are imported from Lucide because Phosphor lacks equivalents:

```typescript
import { Pin, PinOff, PanelLeft, GripVertical } from "@/lib/icons"
```

Do not import directly from `lucide-react` — ESLint will error.
```

#### Verification Checklist

```bash
# Final verification
bun run lint       # Should pass with new restricted imports
bun run typecheck  # Should pass
bun run build      # Production build succeeds
```

- [ ] ESLint rule added and working
- [ ] No direct `lucide-react` imports outside `lib/icons/extras.ts`
- [ ] Documentation created
- [ ] Bundle size decreased (check with `bun run build`)

---

## File Change Summary

| Phase | Files Changed | Type |
|-------|---------------|------|
| Phase 0 | 3 | New files |
| Phase 1 | 16 | Custom icons |
| Phase 2 | ~22 | UI components |
| Phase 3 | ~7 | App components |
| Phase 4 | 2 | Motion primitives |
| Phase 5 | 3 | Config + docs |
| **Total** | **~53** | |

---

## Rollback Plan

If issues arise during migration:

1. **Per-file rollback**: Git revert individual file changes
2. **Phase rollback**: Each phase is independent; revert entire phase if needed
3. **Full rollback**: `git revert` to pre-migration commit

Keep Lucide in `package.json` until Phase 5 is complete and verified.

---

## Success Criteria

- [ ] Zero direct `lucide-react` imports (except `lib/icons/extras.ts`)
- [ ] All icons render correctly at default and custom sizes
- [ ] Bundle size reduced by 20KB+ (gzipped)
- [ ] `bun run build` succeeds
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] ESLint prevents future Lucide imports

---

## AI Agent Instructions

### Before Starting

1. Read this entire document
2. Verify current state matches assumptions:
   ```bash
   rg "from ['\"]lucide-react['\"]" --type ts --type tsx | wc -l
   # Expected: ~38 files
   ```

### During Migration

1. Complete one phase before starting the next
2. Run verification checklist after each phase
3. Commit after each phase with message: `chore(icons): phase N - [description]`

### If Errors Occur

1. Check the Icon Mapping table for correct Phosphor equivalent
2. Some Phosphor icons may need `weight="bold"` to match Lucide's stroke weight
3. For SSR components, use `@phosphor-icons/react/dist/ssr`

### Commit Messages

```
chore(icons): phase 0 - add icon infrastructure
chore(icons): phase 1 - standardize custom brand icons
chore(icons): phase 2 - migrate shadcn components to phosphor
chore(icons): phase 3 - migrate app components to phosphor
chore(icons): phase 4 - migrate motion primitives to phosphor
chore(icons): phase 5 - add eslint enforcement and docs
```

---

*End of migration plan. Ready for implementation.*
