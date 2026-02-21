# ChatGPT Header Design & Behavior Analysis

**Date**: 2026-02-20
**Purpose**: Document ChatGPT's header component design patterns for alignment with our header implementation

## Key Findings

### 1. Responsive Background Behavior

ChatGPT's header uses **container queries** with data attributes to conditionally apply transparent backgrounds at wider viewports:

```html
<header
  class="... data-[fixed-header=less-than-xxl]:@w-2xl/main:bg-transparent data-[fixed-header=less-than-xl]:@w-xl/main:bg-transparent ..."
  data-fixed-header="less-than-xl"
>
```

**Behavior**:
- **Narrow viewport (≤1440px)**: Solid background `rgb(33, 33, 33)`
- **Wide viewport (≥1920px)**: Transparent background `rgba(0, 0, 0, 0)`
- Uses Tailwind's container query syntax: `@w-{breakpoint}/main`

**Data attribute values** (set via JavaScript based on viewport):
- `"less-than-xl"` → narrow viewport
- `"less-than-xxl"` → medium-wide viewport
- Likely `null` or different value → ultra-wide viewport

### 2. Layout & Structure

```tsx
<header class="sticky top-0 z-20 h-header-height bg-token-main-surface-primary ...">
  <div class="pointer-events-none absolute start-0 flex flex-col items-center gap-2 lg:start-1/2 ...">
    <!-- Centered floating notification area -->
  </div>

  <div class="flex flex-1 items-center *:pointer-events-auto">
    <button>Model Selector</button>
  </div>

  <div class="flex items-center gap-2">
    <button>Share</button>
    <button>Menu</button>
  </div>
</header>
```

**Key patterns**:
- `pointer-events-none` on header with `*:pointer-events-auto` on children
- Height: `52px` (`h-header-height`)
- Z-index: `20`
- `sticky top-0` positioning

### 3. Border & Shadow System

ChatGPT uses a **CSS variable-based shadow** system:

```css
box-shadow: var(--sharp-edge-top-shadow);
```

**States**:
- At top of page: `rgba(0, 0, 0, 0) 0px 1px 0px 0px` (transparent)
- When scrolled: Shadow variable changes (needs scroll testing to confirm exact value)
- Wide viewport: `shadow-none!` via `data-[fixed-header=...]:@w-2xl/main:shadow-none!`

**Border**:
- Default: `0px solid rgba(255, 255, 255, 0.05)` (no visible border)
- Conditional appearance likely controlled by scroll state

### 4. Responsive Breakpoints

Container query breakpoints used:
- `@w-xl/main` → likely ~1280px
- `@w-2xl/main` → likely ~1536px

Data attribute driven styling provides:
- **Type safety**: State managed in one place (JavaScript)
- **Predictability**: No media query conflicts
- **Simplicity**: Single source of truth for responsive state

### 5. Design Tokens

```css
background-color: var(--token-main-surface-primary)
  → resolves to rgb(33, 33, 33) in dark mode

box-shadow: var(--sharp-edge-top-shadow)
  → dynamic shadow based on scroll state

height: var(--header-height)
  → 52px
```

## Comparison with Our Header

### Our Current Implementation (`app/components/layout/header.tsx`)

```tsx
<header className="bg-background pointer-events-none sticky top-0 z-20 h-app-header shrink-0">
  <div className="relative mx-auto flex h-full max-w-full items-center justify-between px-2">
    {/* LEFT SECTION */}
    <div className="flex items-center gap-2">
      {(!hasSidebar || isMobile) && (
        <Link href="/" className="pointer-events-auto ...">
          <NawIcon className="mr-1 size-4" />
          {APP_NAME}
        </Link>
      )}
      {hasSidebar && isMobile && <HeaderSidebarTrigger />}
    </div>

    {/* CENTER SECTION */}
    <div className="pointer-events-auto flex flex-1 items-center">
      {isLoggedIn && <ModelSelectorHeader />}
    </div>

    {/* RIGHT SECTION */}
    <div className="pointer-events-auto flex items-center justify-end gap-2">
      {/* Auth buttons or user menu */}
    </div>
  </div>
</header>
```

### Key Differences

| Aspect | ChatGPT | Ours | Gap |
|--------|---------|------|-----|
| **Background** | Transparent at wide viewports via container queries | Always `bg-background` | ❌ No responsive transparency |
| **Scroll behavior** | Dynamic shadow/border on scroll | Static | ❌ No scroll-based styling |
| **Breakpoint method** | Data attributes + container queries | Media queries via `useBreakpoint` | ⚠️ Different approach |
| **Border/Shadow** | CSS variable system with conditional display | None | ❌ No visual separation |
| **Height** | `52px` | `h-app-header` (need to verify value) | ✓ Likely similar |
| **Z-index** | `20` | `20` | ✓ Same |
| **Pointer events** | Same pattern | Same pattern | ✓ Same |

## Recommended Alignment Changes

### 1. Add Responsive Background Transparency

**Approach**: Use Tailwind container queries (requires `@tailwind/container-queries` plugin)

```tsx
<header
  className="bg-background sticky top-0 z-20 h-app-header
    @container/main
    @2xl/main:bg-transparent
    transition-colors duration-200"
>
```

**Alternative**: Use data attribute pattern like ChatGPT:
```tsx
const [headerState, setHeaderState] = useState<'narrow' | 'wide'>('narrow')

useEffect(() => {
  const updateHeaderState = () => {
    setHeaderState(window.innerWidth >= 1536 ? 'wide' : 'narrow')
  }
  // ... resize listener
}, [])

<header
  data-header-state={headerState}
  className="... data-[header-state=wide]:bg-transparent"
>
```

### 2. Add Scroll-Based Border/Shadow

**Implementation**:
```tsx
const [isScrolled, setIsScrolled] = useState(false)

useEffect(() => {
  const handleScroll = () => {
    setIsScrolled(window.scrollY > 0)
  }
  window.addEventListener('scroll', handleScroll, { passive: true })
  return () => window.removeEventListener('scroll', handleScroll)
}, [])

<header
  className={cn(
    "sticky top-0 z-20 h-app-header transition-shadow duration-200",
    isScrolled && "border-b border-border shadow-sm"
  )}
>
```

### 3. Use CSS Variables for Dynamic Theming

**Define in global CSS**:
```css
:root {
  --header-shadow-scrolled: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --header-border-scrolled: 1px solid var(--border);
}

[data-theme="dark"] {
  --header-shadow-scrolled: 0 1px 0 0 rgba(255, 255, 255, 0.05);
}
```

**Apply**:
```tsx
<header
  className="sticky top-0 z-20 h-app-header"
  style={{
    boxShadow: isScrolled ? 'var(--header-shadow-scrolled)' : 'none'
  }}
>
```

## Implementation Priority

1. **High**: Add scroll-based border/shadow (simple, high visual impact)
2. **Medium**: Add responsive background transparency (requires container query setup)
3. **Low**: Refactor to data attribute pattern (architectural, no visual change)

## Technical Considerations

### Container Queries Support

Requires `@tailwind/container-queries` plugin:

```bash
bun add -D @tailwindcss/container-queries
```

```js
// tailwind.config.ts
plugins: [require('@tailwindcss/container-queries')]
```

Then mark the container:
```tsx
<div className="@container/main">
  <header className="@2xl/main:bg-transparent">
```

### Performance

- **Scroll listeners**: Use `passive: true` and `requestAnimationFrame` for smooth performance
- **Resize listeners**: Debounce to avoid excessive re-renders
- **Container queries**: Native CSS, zero JS performance impact

## Next Steps

1. Create implementation plan for scroll-based styling
2. Research container query integration in our existing layout
3. Test performance impact of scroll listeners
4. Design CSS variable system for header theming
