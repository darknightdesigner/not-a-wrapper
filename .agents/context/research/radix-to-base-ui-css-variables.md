# Radix → Base UI CSS Custom Property Mapping

> **Status**: Research Complete
> **Date**: February 9, 2026
> **Source**: Official Base UI v1.1.0 documentation (base-ui.com)
> **Purpose**: Document the exact `--radix-*` → Base UI CSS variable mapping for the migration plan

---

## Key Finding

**Base UI does NOT use namespaced CSS variables.** Where Radix uses component-specific prefixes like `--radix-tooltip-content-transform-origin`, Base UI uses short, unnamespaced names like `--transform-origin`. All positioned components (Tooltip, Popover, Menu, Select, PreviewCard, NavigationMenu) share the same set of CSS variables on their Positioner and Popup elements.

---

## Base UI CSS Variables Reference (from official docs)

### Positioner CSS Variables (shared across all positioned components)

| Variable | Type | Description |
|---|---|---|
| `--anchor-height` | number | The anchor's (trigger's) height |
| `--anchor-width` | number | The anchor's (trigger's) width |
| `--available-height` | number | Available height between trigger and viewport edge |
| `--available-width` | number | Available width between trigger and viewport edge |
| `--positioner-height` | number | Fixed height of the positioner element |
| `--positioner-width` | number | Fixed width of the positioner element |
| `--transform-origin` | string | Coordinates the element is anchored to (for animations) |

### Popup CSS Variables (shared across all positioned components)

| Variable | Type | Description |
|---|---|---|
| `--popup-height` | number | Fixed height of the popup element |
| `--popup-width` | number | Fixed width of the popup element |

### AlertDialog.Popup CSS Variables

| Variable | Type | Description |
|---|---|---|
| `--nested-dialogs` | number | How many dialogs are nested within |

> **Source**: NavigationMenu.Positioner API reference documents all 7 Positioner variables. These are inherited by child elements (Popup, etc.) via CSS cascade, confirmed by official CSS Module examples where `.Popup` references `--transform-origin`, `--anchor-width`, and `--available-height`.

---

## Codebase Audit: All `--radix-*` Variables in `components/ui/`

**14 unique variables** found across **8 files**:

### Tooltip Group (1 variable, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 1 | `--radix-tooltip-content-transform-origin` | `--transform-origin` | `tooltip.tsx` |

### Dropdown Menu Group (2 unique variables, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 2 | `--radix-dropdown-menu-content-transform-origin` | `--transform-origin` | `dropdown-menu.tsx` |
| 3 | `--radix-dropdown-menu-content-available-height` | `--available-height` | `dropdown-menu.tsx` |

### Context Menu Group (2 unique variables, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 4 | `--radix-context-menu-content-transform-origin` | `--transform-origin` | `context-menu.tsx` |
| 5 | `--radix-context-menu-content-available-height` | `--available-height` | `context-menu.tsx` |

### Menubar Group (1 unique variable, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 6 | `--radix-menubar-content-transform-origin` | `--transform-origin` | `menubar.tsx` |

### Popover Group (1 variable, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 7 | `--radix-popover-content-transform-origin` | `--transform-origin` | `popover.tsx` |

### Hover Card Group (1 variable, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 8 | `--radix-hover-card-content-transform-origin` | `--transform-origin` | `hover-card.tsx` |

### Select Group (4 unique variables, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 9 | `--radix-select-content-transform-origin` | `--transform-origin` | `select.tsx` |
| 10 | `--radix-select-content-available-height` | `--available-height` | `select.tsx` |
| 11 | `--radix-select-trigger-width` | `--anchor-width` | `select.tsx` |
| 12 | `--radix-select-trigger-height` | `--anchor-height` | `select.tsx` |

### Navigation Menu Group (2 unique variables, 1 file)

| # | Radix Variable | Base UI Equivalent | File |
|---|---|---|---|
| 13 | `--radix-navigation-menu-viewport-height` | `--popup-height` (on Popup) | `navigation-menu.tsx` |
| 14 | `--radix-navigation-menu-viewport-width` | `--popup-width` (on Popup) | `navigation-menu.tsx` |

---

## Detailed Migration Notes

### 1. Transform Origin (8 usages across 7 files) — Direct 1:1 Replacement

**Radix pattern** (component-specific names):
```
--radix-tooltip-content-transform-origin
--radix-dropdown-menu-content-transform-origin
--radix-context-menu-content-transform-origin
--radix-menubar-content-transform-origin
--radix-popover-content-transform-origin
--radix-hover-card-content-transform-origin
--radix-select-content-transform-origin
```

**Base UI equivalent** (single unified name):
```
--transform-origin
```

**Tailwind migration**:
```
# Before (Radix)
origin-(--radix-tooltip-content-transform-origin)
origin-(--radix-dropdown-menu-content-transform-origin)
# etc.

# After (Base UI)
origin-(--transform-origin)
```

**Verification**: Confirmed in official CSS Module examples for Tooltip, Popover, Menu, and Select. Also confirmed in the Menu Tailwind example: `origin-[var(--transform-origin)]`.

### 2. Available Height (3 usages across 3 files) — Direct 1:1 Replacement

**Radix pattern**:
```
--radix-dropdown-menu-content-available-height
--radix-context-menu-content-available-height
--radix-select-content-available-height
```

**Base UI equivalent**:
```
--available-height
```

**Tailwind migration**:
```
# Before (Radix)
max-h-(--radix-dropdown-menu-content-available-height)

# After (Base UI)
max-h-(--available-height)
```

**Verification**: Confirmed in NavigationMenu Positioner CSS Variables table, styling handbook text ("Popover exposes CSS variables on its Popup component like `--available-height`"), Select CSS Modules example (`.List { max-height: var(--available-height) }`), and NavigationMenu large menus example (`.Popup { max-height: var(--available-height) }`).

### 3. Select Trigger Dimensions (2 usages in 1 file) — Direct 1:1 Replacement

**Radix pattern**:
```
--radix-select-trigger-width
--radix-select-trigger-height
```

**Base UI equivalent**:
```
--anchor-width
--anchor-height
```

**Tailwind migration**:
```
# Before (Radix)
h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)

# After (Base UI)
h-(--anchor-height) w-full min-w-(--anchor-width)
```

**Verification**: Confirmed in NavigationMenu Positioner CSS Variables table (`--anchor-width: The anchor's width`, `--anchor-height: The anchor's height`), styling handbook ("Popover exposes CSS variables on its Popup component like `--available-height` and `--anchor-width`"), and Select CSS Modules example (`.Popup { min-width: var(--anchor-width) }`).

### 4. Navigation Menu Viewport Dimensions (2 usages in 1 file) — Architectural Difference

**Radix pattern**:
```
--radix-navigation-menu-viewport-height
--radix-navigation-menu-viewport-width
```

**Base UI equivalent**: No direct CSS variable equivalent on the Viewport element.

**Explanation**: In Radix, `NavigationMenu.Viewport` exposes CSS variables for its content dimensions, which consumers use to set `height` and `width` on the viewport element for animation purposes. In Base UI, `NavigationMenu.Viewport` does NOT expose CSS custom properties (confirmed by the API reference showing only `className`, `style`, and `render` props — no CSS Variables table). 

**Recommended replacement approach**:

The Popup element exposes `--popup-height` and `--popup-width`. The architecture in Base UI moves the sizing responsibility from the Viewport to the Popup:

```
# Before (Radix — on the Viewport element)
h-(--radix-navigation-menu-viewport-height) md:w-(--radix-navigation-menu-viewport-width)

# After (Base UI — on the Popup element, using Popup CSS variables)
h-(--popup-height) md:w-(--popup-width)
```

Alternatively, the Positioner exposes `--positioner-height` and `--positioner-width` which can also be used. The official NavigationMenu CSS Module examples use CSS transitions on the Popup's width/height properties directly.

**Note**: This requires restructuring how the navigation-menu.tsx component applies dimension classes — moving them from the Viewport element to the Popup element. This is a structural change, not just a find-and-replace.

### 5. Alert Dialog — No CSS Variable Migration Needed

Base UI's `AlertDialog` does not use a Positioner (it's a centered modal, not anchored). The only CSS variable it exposes is `--nested-dialogs` on the Popup, which has no Radix equivalent. No `--radix-*` variables were found for alert-dialog in the codebase.

---

## Verification Cross-Check

| Metric | Count |
|---|---|
| Unique `--radix-*` variables found in step 1 | **14** |
| Variables with direct 1:1 Base UI equivalent | **12** |
| Variables requiring architectural change | **2** (navigation-menu viewport) |
| Variables with no equivalent | **0** |
| Total entries in mapping table | **14** ✓ |

---

## Summary

Base UI provides functional equivalents for all 14 `--radix-*` CSS custom properties found in this project. **12 of 14 are direct 1:1 renames** — the only difference is dropping the component-specific prefix (e.g., `--radix-dropdown-menu-content-transform-origin` becomes `--transform-origin`). **2 of 14 require a minor architectural adjustment** — the navigation menu viewport dimension variables (`--radix-navigation-menu-viewport-height/width`) move from the Viewport element to the Popup element (`--popup-height/width`).

The Positioner component in Base UI **does** absorb the positioning logic that Radix exposed via CSS variables, but uses a simplified, unified naming convention. All positioned components share the same 7 Positioner variables + 2 Popup variables, rather than each component having its own namespaced set. This means the migration is a straightforward find-and-replace for the vast majority of cases.

**The migration plan needs an additional pass** to handle these CSS custom property renames. This is a focused, mechanical task: search for the Tailwind `origin-(--radix-*`, `max-h-(--radix-*`, `h-(--radix-*`, `w-(--radix-*`, and `min-w-(--radix-*` patterns and replace with the Base UI equivalents documented above. The navigation-menu.tsx file requires slightly more care due to the viewport-to-popup restructuring.

---

## Quick Reference: Find-and-Replace Patterns

```
# Transform origin (all components)
origin-(--radix-*-transform-origin)  →  origin-(--transform-origin)

# Available height (menus, select)
max-h-(--radix-*-available-height)   →  max-h-(--available-height)

# Select trigger dimensions
h-(--radix-select-trigger-height)    →  h-(--anchor-height)
min-w-(--radix-select-trigger-width) →  min-w-(--anchor-width)

# Navigation menu viewport (requires element restructuring)
h-(--radix-navigation-menu-viewport-height) → h-(--popup-height) [move to Popup]
w-(--radix-navigation-menu-viewport-width)  → w-(--popup-width) [move to Popup]
```
