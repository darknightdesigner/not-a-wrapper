# Systematic Component State Extraction from Live Web Pages

## Research Document for Browser Automation via Chrome MCP

---

## 1. CSS Pseudo-State Inventory

### Complete List of Visual-Affecting Pseudo-Classes

#### User Action (Interaction) Pseudo-Classes
| Pseudo-Class | Description | Programmatic Trigger | CDP Force |
|---|---|---|---|
| `:hover` | Pointer hovering over element | Mouse move / CSS.forcePseudoState | Yes |
| `:active` | Element being activated (mousedown) | mousedown event / CSS.forcePseudoState | Yes |
| `:focus` | Element has focus | `element.focus()` / CSS.forcePseudoState | Yes |
| `:focus-visible` | Element focused via keyboard (visible ring) | `element.focus()` + keyboard heuristic / CSS.forcePseudoState | Yes |
| `:focus-within` | Element or any descendant has focus | Focus a child element / CSS.forcePseudoState | Yes |
| `:visited` | Link previously visited | Cannot trigger programmatically (privacy) / CSS.forcePseudoState | Yes (limited) |
| `:target` | Element matching URL fragment (#id) | Change `window.location.hash` | No |

#### Input / Form State Pseudo-Classes
| Pseudo-Class | Description | Programmatic Trigger | CDP Force |
|---|---|---|---|
| `:enabled` | Form element is enabled | Remove `disabled` attribute | No |
| `:disabled` | Form element is disabled | Set `disabled` attribute | No |
| `:checked` | Checkbox/radio is checked | Set `.checked = true` + change event | No |
| `:indeterminate` | Checkbox in indeterminate state | Set `.indeterminate = true` | No |
| `:placeholder-shown` | Input showing placeholder | Clear input value / set to empty | No |
| `:valid` | Form element with valid value | Set valid value via `.value` | No |
| `:invalid` | Form element with invalid value | Set invalid value or clear required field | No |
| `:required` | Form element with required attribute | Set `required` attribute | No |
| `:optional` | Form element without required | Remove `required` attribute | No |
| `:read-only` | Element not editable | Set `readonly` attribute | No |
| `:read-write` | Element is editable | Remove `readonly` attribute | No |
| `:in-range` | Input within min/max range | Set value within range | No |
| `:out-of-range` | Input outside min/max range | Set value outside range | No |
| `:default` | Default button/option in a group | Cannot change at runtime | No |
| `:autofill` | Input autofilled by browser | Cannot trigger programmatically | No |
| `:user-valid` | Valid after user interaction | Requires actual user interaction | No |
| `:user-invalid` | Invalid after user interaction | Requires actual user interaction | No |

#### Display State Pseudo-Classes
| Pseudo-Class | Description | Programmatic Trigger | CDP Force |
|---|---|---|---|
| `:open` | Details/dialog in open state | Set `open` attribute / `.showModal()` | No |
| `:modal` | Dialog in modal state | `.showModal()` | No |
| `:fullscreen` | Element in fullscreen | `element.requestFullscreen()` | No |
| `:popover-open` | Popover currently showing | `.showPopover()` | No |
| `:picture-in-picture` | Video in PiP mode | `.requestPictureInPicture()` | No |

#### Structural Pseudo-Classes (generally not state-dependent)
| Pseudo-Class | Description | Visual Impact |
|---|---|---|
| `:empty` | Element with no children | Commonly used to hide empty containers |
| `:first-child`, `:last-child` | Position-based | Borders, margins, border-radius |
| `:nth-child()` | Pattern-based | Zebra striping, grid layouts |
| `:only-child` | Sole child | Layout adjustments |
| `:root` | Document root | CSS custom property definitions |

#### Link Pseudo-Classes
| Pseudo-Class | Description | Programmatic Trigger |
|---|---|---|
| `:link` | Unvisited link | Cannot control (privacy) |
| `:visited` | Visited link | Cannot control (privacy) |
| `:any-link` | Any link element | Structural, always applies |

### Chrome DevTools Protocol: CSS.forcePseudoState

The CDP method `CSS.forcePseudoState` forces pseudo-classes on a node whenever its style is computed. Based on documentation and source code analysis:

**Confirmed supported pseudo-classes:**
- `active`
- `focus`
- `focus-visible`
- `focus-within`
- `hover`
- `visited`
- `target` (some implementations)

**Method signature:**
```
CSS.forcePseudoState({
  nodeId: <DOM.NodeId>,
  forcedPseudoClasses: ["hover", "focus"]  // array of strings
})
```

**Important caveats:**
- Requires `CSS.enable` and `DOM.enable` to be called first
- `nodeId` must be obtained via `DOM.getDocument` + `DOM.querySelector`
- `:visited` forcing has privacy restrictions -- only color-related properties respond
- There is a known Chromium bug (chromium issue 343757697) where forced pseudo-state does not always return correct computed styles
- This API is NOT directly available in MCP's JavaScript execution context; it requires CDP protocol access

### Triggering Classification Summary

**Can be forced via CDP (CSS.forcePseudoState):**
`:hover`, `:active`, `:focus`, `:focus-visible`, `:focus-within`, `:visited`

**Can be triggered via DOM/JS manipulation:**
`:disabled`, `:enabled`, `:checked`, `:indeterminate`, `:placeholder-shown`, `:valid`, `:invalid`, `:required`, `:optional`, `:read-only`, `:read-write`, `:in-range`, `:out-of-range`, `:empty`, `:open`, `:modal`, `:fullscreen`, `:popover-open`

**Cannot be triggered programmatically:**
`:autofill`, `:user-valid`, `:user-invalid` (require genuine user interaction), `:default` (set at parse time), `:link`/`:visited` (privacy-controlled)

---

## 2. Programmatic State Triggering Methods

### Hover State

**Method 1: CSS.forcePseudoState via CDP (BEST for CSS :hover)**
```javascript
// Via CDP session (Puppeteer/Playwright)
await cdp.send('CSS.enable');
await cdp.send('DOM.enable');
const doc = await cdp.send('DOM.getDocument');
const nodeId = await cdp.send('DOM.querySelector', {
  nodeId: doc.root.nodeId,
  selector: '.my-button'
});
await cdp.send('CSS.forcePseudoState', {
  nodeId: nodeId.nodeId,
  forcedPseudoClasses: ['hover']
});
```
- Activates CSS `:hover` rules exactly as the browser would
- Persistent -- stays active until explicitly removed
- Does NOT trigger JavaScript event handlers (mouseenter, mouseover)

**Method 2: Mouse movement via MCP computer tool (BEST for JS-driven hover)**
```
// Using MCP computer tool
action: "hover", coordinate: [x, y]
```
- Triggers both CSS `:hover` AND JavaScript event handlers
- Transient -- reverts when mouse moves away
- Must capture screenshot immediately while hovering

**Method 3: Event dispatch (JS event handlers ONLY)**
```javascript
element.dispatchEvent(new MouseEvent('mouseenter', {
  bubbles: true, cancelable: true, view: window
}));
element.dispatchEvent(new MouseEvent('mouseover', {
  bubbles: true, cancelable: true, view: window
}));
```
- Triggers JavaScript event listeners (mouseenter, mouseover)
- Does NOT trigger CSS `:hover` pseudo-class
- Useful for components that add classes or change state via JS on hover

**Method 4: Class-based override (Storybook approach)**
```javascript
// Rewrite stylesheets to create .pseudo-hover class
// Then add class to element
element.classList.add('pseudo-hover');
```
- The approach used by storybook-addon-pseudo-states
- Rewrites all stylesheets to add class selectors parallel to pseudo-class selectors
- Does not capture user-agent default hover styles
- Requires preprocessing all stylesheets on the page

**Recommendation for MCP context:** Use Method 2 (MCP hover) for most cases. It produces the most accurate result because it triggers both CSS pseudo-states and JavaScript event handlers. Capture screenshot immediately after hover. For persistent capture, combine with a rapid screenshot.

### Focus State

**Method 1: element.focus() (BEST)**
```javascript
element.focus();
```
- Triggers CSS `:focus` pseudo-class
- Triggers CSS `:focus-within` on ancestors
- May or may not trigger `:focus-visible` (depends on browser heuristics)
- Fires `focus` and `focusin` JavaScript events

**Method 2: element.focus() with keyboard simulation for :focus-visible**
```javascript
// Simulate Tab key press first to set keyboard modality
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
element.focus();
```
- Increases likelihood that `:focus-visible` will apply
- Browser uses "was the last input a keyboard action?" heuristic

**Method 3: CSS.forcePseudoState for persistent focus**
```javascript
await cdp.send('CSS.forcePseudoState', {
  nodeId: nodeId,
  forcedPseudoClasses: ['focus', 'focus-visible']
});
```
- Forces both `:focus` and `:focus-visible` regardless of input modality
- Does NOT fire JavaScript focus events

**Recommendation:** Use `element.focus()` executed via MCP JavaScript tool. For `:focus-visible` specifically, simulate a Tab keypress first.

### Active State

**Method 1: mousedown without mouseup (transient)**
```javascript
element.dispatchEvent(new MouseEvent('mousedown', {
  bubbles: true, cancelable: true, view: window
}));
// Capture screenshot here -- :active is applied
// Then release:
element.dispatchEvent(new MouseEvent('mouseup', {
  bubbles: true, cancelable: true, view: window
}));
```
- dispatchEvent with mousedown alone does NOT reliably trigger CSS `:active`
- The browser tracks real pointer state, not synthetic events

**Method 2: CSS.forcePseudoState (BEST)**
```javascript
await cdp.send('CSS.forcePseudoState', {
  nodeId: nodeId,
  forcedPseudoClasses: ['active']
});
```
- Reliably activates CSS `:active` styles
- Persistent until cleared

**Method 3: MCP computer tool mousedown**
```
action: "left_click", coordinate: [x, y]
// Note: click = mousedown + mouseup, :active only during mousedown
```
- :active state is extremely brief during a click
- Nearly impossible to capture with screenshot

**Recommendation:** CSS.forcePseudoState is the only reliable method for `:active`. In MCP context without CDP, use the class-based approach.

### Disabled State

```javascript
// For form elements
element.disabled = true;
// or
element.setAttribute('disabled', '');

// For ARIA-based components
element.setAttribute('aria-disabled', 'true');
```
- Immediately applies CSS `:disabled` pseudo-class
- Also triggers `[disabled]` attribute selectors
- Modern component libraries may use `data-disabled` instead

### Checked / Indeterminate State

```javascript
// Checkbox: checked
element.checked = true;
element.dispatchEvent(new Event('change', { bubbles: true }));

// Checkbox: indeterminate
element.indeterminate = true;
// Note: does NOT fire change event, must set manually

// Radio button
radioElement.checked = true;
radioElement.dispatchEvent(new Event('change', { bubbles: true }));

// Toggle switch (often custom, check for data attributes)
// Radix UI:
toggleElement.click(); // triggers internal state management
```
- Setting `.checked` programmatically applies `:checked` CSS
- The `change` event dispatch is needed for React/framework state sync
- For React components, `.click()` is more reliable than setting `.checked`

### Form Validation States

```javascript
// :valid / :invalid
inputElement.value = 'valid-email@test.com'; // triggers :valid on email input
inputElement.value = 'not-an-email';          // triggers :invalid on email input
inputElement.dispatchEvent(new Event('input', { bubbles: true }));

// :required / :optional
inputElement.required = true;  // applies :required
inputElement.required = false; // applies :optional

// :in-range / :out-of-range (for number/range inputs)
rangeInput.value = '150'; // if max="100", triggers :out-of-range

// :placeholder-shown
inputElement.value = '';   // shows placeholder, applies :placeholder-shown
inputElement.value = 'x';  // hides placeholder, removes :placeholder-shown
```

### Accuracy Ranking (what matches real user experience)

1. **MCP hover/click (computer tool)** -- Most accurate for transient states, triggers all layers
2. **CSS.forcePseudoState** -- Most accurate for CSS-only states, persistent
3. **DOM property manipulation** (`.focus()`, `.checked`, `.value`) -- Accurate for form states
4. **Event dispatch** -- Accurate for JS-driven behavior, does NOT trigger CSS pseudo-classes
5. **Class-based override** -- Approximation only, misses UA styles

---

## 3. Computed Style Delta Extraction

### Core Approach: Snapshot-Diff-Snapshot

```javascript
function captureStyleSnapshot(element, properties) {
  const computed = getComputedStyle(element);
  const snapshot = {};
  for (const prop of properties) {
    snapshot[prop] = computed.getPropertyValue(prop);
  }
  return snapshot;
}

function diffSnapshots(before, after) {
  const delta = {};
  for (const prop in before) {
    if (before[prop] !== after[prop]) {
      delta[prop] = { from: before[prop], to: after[prop] };
    }
  }
  return delta;
}

// Usage:
const WATCH_PROPS = [
  'background-color', 'color', 'border-color', 'border-top-color',
  'border-right-color', 'border-bottom-color', 'border-left-color',
  'box-shadow', 'outline', 'outline-color', 'outline-width', 'outline-offset',
  'opacity', 'transform', 'text-decoration', 'text-decoration-color',
  'cursor', 'background-image', 'border-width', 'border-radius',
  'padding', 'font-weight', 'font-size', 'letter-spacing',
  'scale', 'translate', 'filter', 'backdrop-filter',
  'ring-color', 'ring-width', 'ring-offset-width'
];

const before = captureStyleSnapshot(element, WATCH_PROPS);
element.focus(); // trigger state change
const after = captureStyleSnapshot(element, WATCH_PROPS);
const changes = diffSnapshots(before, after);
```

### Properties Most Commonly Modified in State Transitions

**Tier 1 -- Almost always changed (check these first):**
- `background-color` -- hover, active, disabled, selected states
- `color` -- hover, disabled, active states
- `border-color` (and longhand variants) -- focus, hover, invalid states
- `box-shadow` -- focus rings, hover elevation, active depression
- `outline` / `outline-color` / `outline-width` / `outline-offset` -- focus-visible
- `opacity` -- disabled, loading states
- `cursor` -- hover (pointer), disabled (not-allowed)

**Tier 2 -- Frequently changed:**
- `transform` / `scale` / `translate` -- hover scale effects, active press
- `text-decoration` / `text-decoration-color` -- link hover underlines
- `background-image` -- gradient transitions on hover
- `filter` -- brightness/contrast on hover, grayscale on disabled
- `border-width` -- focus states sometimes increase border

**Tier 3 -- Sometimes changed:**
- `font-weight` -- selected/active tab or nav item
- `padding` -- compensating for border-width changes
- `border-radius` -- shape changes on state
- `letter-spacing` -- subtle hover effects
- `backdrop-filter` -- modal/overlay states
- `visibility` -- showing/hiding sub-elements
- `pointer-events` -- disabled states
- `z-index` -- focus/active elevation

### Handling CSS Custom Properties

```javascript
function captureCustomProperties(element, varNames) {
  const computed = getComputedStyle(element);
  const vars = {};
  for (const name of varNames) {
    vars[name] = computed.getPropertyValue(name).trim();
  }
  return vars;
}

// Tailwind v3 internal variables
const TAILWIND_VARS = [
  '--tw-bg-opacity', '--tw-text-opacity', '--tw-border-opacity',
  '--tw-ring-color', '--tw-ring-offset-color', '--tw-ring-offset-width',
  '--tw-ring-opacity', '--tw-shadow', '--tw-shadow-color',
  '--tw-translate-x', '--tw-translate-y', '--tw-rotate', '--tw-scale-x', '--tw-scale-y'
];

// Tailwind v4 uses --color-* theme variables
```

**Important:** `getComputedStyle` resolves CSS custom properties. For example, `var(--tw-bg-opacity)` will be resolved to its final computed value (e.g., `1` or `0.5`). You can still read the raw custom property value via `getPropertyValue('--tw-bg-opacity')`.

### Handling CSS Transitions

```javascript
async function waitForTransitions(element, timeout = 1000) {
  return new Promise((resolve) => {
    const pending = new Set();
    let timer;

    const onStart = (e) => {
      if (e.target === element) {
        pending.add(e.propertyName);
        clearTimeout(timer);
      }
    };

    const onEnd = (e) => {
      if (e.target === element) {
        pending.delete(e.propertyName);
        if (pending.size === 0) {
          clearTimeout(timer);
          cleanup();
          resolve('completed');
        }
      }
    };

    const cleanup = () => {
      element.removeEventListener('transitionstart', onStart);
      element.removeEventListener('transitionend', onEnd);
      element.removeEventListener('transitioncancel', onEnd);
    };

    element.addEventListener('transitionstart', onStart);
    element.addEventListener('transitionend', onEnd);
    element.addEventListener('transitioncancel', onEnd);

    // Fallback timeout
    timer = setTimeout(() => {
      cleanup();
      resolve('timeout');
    }, timeout);

    // If no transition starts within a frame, resolve immediately
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pending.size === 0) {
          cleanup();
          resolve('no-transition');
        }
      });
    });
  });
}

// Usage:
const before = captureStyleSnapshot(element, WATCH_PROPS);
element.classList.add('hover-state');
await waitForTransitions(element);
const after = captureStyleSnapshot(element, WATCH_PROPS);
```

**Key gotchas with transitions:**
- `transitionend` fires ONCE PER PROPERTY -- a single hover might fire 3 events (background-color, color, box-shadow)
- Transitions removed before completion (e.g., display: none) do NOT fire transitionend
- For screenshot capture, always wait for transitions OR disable them:

```javascript
// Nuclear option: disable all transitions before capturing
document.documentElement.style.setProperty('--transition-override', '0s');
const style = document.createElement('style');
style.textContent = '*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }';
document.head.appendChild(style);
```

---

## 4. Data Attribute State Patterns

### Radix UI

Radix Primitives expose component state through `data-*` attributes for CSS styling:

| Attribute | Values | Components |
|---|---|---|
| `data-state` | `open`, `closed` | Dialog, Popover, DropdownMenu, Accordion, Collapsible, Tooltip, HoverCard, NavigationMenu, Select |
| `data-state` | `checked`, `unchecked` | Checkbox, RadioGroup, Toggle, Switch |
| `data-state` | `active`, `inactive` | Tabs, ToggleGroup |
| `data-state` | `on`, `off` | Toggle |
| `data-state` | `complete`, `loading` | Progress |
| `data-highlighted` | present/absent | DropdownMenu.Item, Select.Item, ContextMenu.Item |
| `data-disabled` | present/absent | All interactive components when disabled |
| `data-orientation` | `horizontal`, `vertical` | Separator, Slider, Tabs, ScrollArea, ToggleGroup |
| `data-side` | `top`, `right`, `bottom`, `left` | Tooltip, Popover, DropdownMenu (positioned content) |
| `data-align` | `start`, `center`, `end` | Positioned content |
| `data-placeholder` | present/absent | Select.Value when no value selected |
| `data-motion` | `from-start`, `from-end`, `to-start`, `to-end` | NavigationMenu content transitions |

### Headless UI (Tailwind Labs)

Headless UI v2+ exposes state via data attributes, designed for use with Tailwind data attribute modifiers:

| Attribute | Description | Components |
|---|---|---|
| `data-open` | Present when component is open | Disclosure, Dialog, Popover, Menu, Combobox, Listbox |
| `data-closed` | Present when component is closing (for transitions) | Same as above |
| `data-active` | Like `:active` but smarter (removed on drag-off) | Button, all interactive |
| `data-hover` | Like `:hover` but ignored on touch devices | All interactive |
| `data-focus` | Element has focus | Input, Select, Textarea, all interactive |
| `data-checked` | Checkbox/radio/switch is checked | Checkbox, Radio, Switch |
| `data-disabled` | Element is disabled | All interactive |
| `data-selected` | Option/item is selected | Listbox.Option, Combobox.Option |
| `data-autofocus` | Element should receive initial focus | Input and similar |

### Base UI (MUI)

Base UI uses a `stateAttributesMapping` to map internal state to data attributes:

| Attribute | Description |
|---|---|
| `data-popup-open` | Popup/menu/tooltip is open |
| `data-pressed` | Button/toggle in pressed state |
| `data-selected` | Item is selected |
| `data-highlighted` | Item is highlighted (keyboard/mouse) |
| `data-disabled` | Element is disabled |
| `data-active` | Element in active state |
| `data-expanded` | Accordion/tree item expanded |
| `data-starting-style` | Applied during enter transitions |
| `data-ending-style` | Applied during exit transitions |

### Tailwind CSS Data Attribute Variants

Tailwind CSS supports styling based on data attributes:
```css
/* In className */
data-[state=open]:bg-blue-500
data-[disabled]:opacity-50
data-[highlighted]:bg-gray-100
data-[side=top]:mb-2

/* Group/peer variants */
group-data-[state=open]:block
peer-data-[checked]:bg-green-500
```

### Enumerating Data-Attribute-Driven States on a Page

```javascript
function enumerateDataStates() {
  const stateMap = new Map();
  const stateAttrs = [
    'data-state', 'data-open', 'data-closed', 'data-active',
    'data-hover', 'data-focus', 'data-checked', 'data-disabled',
    'data-selected', 'data-highlighted', 'data-pressed',
    'data-expanded', 'data-popup-open', 'data-orientation',
    'data-side', 'data-align', 'data-motion', 'data-placeholder',
    'data-headless-state'
  ];

  for (const attr of stateAttrs) {
    const elements = document.querySelectorAll(`[${attr}]`);
    if (elements.length > 0) {
      const values = new Set();
      elements.forEach(el => {
        const val = el.getAttribute(attr);
        values.add(val === '' ? '(present)' : val);
      });
      stateMap.set(attr, {
        count: elements.length,
        values: [...values],
        selectors: [...elements].slice(0, 3).map(el =>
          el.tagName.toLowerCase() +
          (el.id ? '#' + el.id : '') +
          (el.className ? '.' + el.className.split(' ')[0] : '')
        )
      });
    }
  }

  return Object.fromEntries(stateMap);
}
```

---

## 5. State Groups by Component Type

### Buttons
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Default | No action needed | baseline |
| Hover | MCP hover / CSS force hover | background-color, color, box-shadow, transform, cursor |
| Focus-visible | Tab to element / CSS force focus-visible | outline, box-shadow, outline-offset |
| Active | CSS force active / mousedown | background-color, transform (scale), box-shadow |
| Disabled | `el.disabled = true` | opacity, cursor, background-color, color, pointer-events |
| Loading | Set `aria-busy="true"`, check for spinner | opacity, cursor, content changes |

### Text Inputs
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Empty + placeholder | `el.value = ''` | color (placeholder), opacity |
| Focused | `el.focus()` | border-color, box-shadow, outline, ring |
| Filled | `el.value = 'text'` + input event | color, background-color |
| Invalid | Set invalid value on required/pattern field | border-color, color, box-shadow (red variants) |
| Valid | Set valid value | border-color (green variants) |
| Disabled | `el.disabled = true` | opacity, background-color, cursor |
| Readonly | `el.readOnly = true` | background-color, cursor |

### Checkboxes / Toggles
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Unchecked | `el.checked = false` + change event | background-color, border-color, transform |
| Checked | `el.checked = true` + change event | background-color, border-color, SVG content |
| Indeterminate | `el.indeterminate = true` | background-color, content (dash icon) |
| Disabled | `el.disabled = true` | opacity, cursor |
| Hover | MCP hover | background-color (subtle), border-color |
| Focus | `el.focus()` | box-shadow, outline |

### Links
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Default (:link) | Baseline | color, text-decoration |
| Hover | MCP hover | color, text-decoration, text-decoration-color |
| Focus | `el.focus()` | outline, box-shadow |
| Visited | CSS.forcePseudoState (limited) | color only (privacy restriction) |
| Active | CSS force active | color |

### Menu Items (Dropdown/Context Menu)
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Default | Baseline | background-color, color |
| Highlighted | Hover or arrow keys | background-color, color |
| Selected | Click or Enter | background-color, color, font-weight, checkmark |
| Disabled | data-disabled / aria-disabled | opacity, color, cursor |

### Tabs
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Default | Baseline | background-color, color, border-bottom |
| Selected/Active | Click tab / data-state="active" | background-color, color, border-bottom-color, font-weight |
| Hover | MCP hover | background-color, color |
| Focus | Tab key | outline, box-shadow |

### Tooltips / Popovers
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Closed | Default | Element does not exist or display:none / opacity:0 |
| Opening | Hover trigger / focus trigger | opacity (0->1), transform (scale/translate), visibility |
| Open | Wait for transition | opacity:1, transform:none |
| Closing | Move away from trigger | opacity (1->0), reverse transform |

**Strategy:** Hover the trigger element, wait for tooltip to appear, capture screenshot.

### Dropdowns / Selects
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Closed | Default | data-state="closed" or no popup |
| Open | Click trigger / data-state="open" | New DOM element appears (portal) |
| Option highlighted | Arrow keys or hover | background-color on option, data-highlighted |
| Option selected | Click or Enter | checkmark, font-weight, data-selected |

### Accordions / Disclosure
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Collapsed | Default / data-state="closed" | Content height:0, overflow:hidden |
| Expanding | Click header | height transition, rotation of chevron icon |
| Expanded | data-state="open" | Content visible, chevron rotated |

### Dialogs / Modals
| State | Trigger Method | Properties to Watch |
|---|---|---|
| Closed | Default | Element not in DOM or display:none |
| Opening | Trigger open action | opacity, transform (scale), backdrop |
| Open | `:modal` pseudo-class | Full visibility |
| Backdrop | `::backdrop` pseudo-element | background-color, backdrop-filter |

### Loading States
| State | Detection Method | Visual Indicators |
|---|---|---|
| Skeleton | Check for skeleton class/animation | background (shimmer gradient), border-radius |
| Spinner | Check for rotating SVG/element | animation, transform |
| Shimmer | Check for gradient animation | background-image, animation |
| Progress bar | Check `<progress>` or role="progressbar" | width, background-color |

---

## 6. Screenshot Strategies

### Consistent Screenshot Capture

**Viewport normalization:**
```javascript
// Via MCP resize_window tool
action: "resize_window", width: 1280, height: 720
// Or for component-level: use element.getBoundingClientRect() to crop
```

**Pre-capture checklist:**
1. Disable animations and transitions (for static comparison)
2. Wait for any pending network requests (fonts, images)
3. Wait for any ongoing CSS transitions/animations
4. Ensure target element is scrolled into view
5. Ensure consistent cursor position (move away from target for default state)

### Disabling Animations Before Capture

```javascript
// Inject into page via MCP JavaScript tool
const style = document.createElement('style');
style.id = 'state-capture-no-anim';
style.textContent = `
  *, *::before, *::after {
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
  }
`;
document.head.appendChild(style);
```

### Waiting for Transition Completion

```javascript
// If you WANT to capture the transitioned state (not disable transitions)
async function waitForAllTransitions(element, timeout = 2000) {
  return new Promise(resolve => {
    let lastEvent = Date.now();
    const handler = () => { lastEvent = Date.now(); };
    element.addEventListener('transitionend', handler);
    element.addEventListener('transitioncancel', handler);

    const check = () => {
      if (Date.now() - lastEvent > 100) {
        element.removeEventListener('transitionend', handler);
        element.removeEventListener('transitioncancel', handler);
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };

    setTimeout(check, 50);
    setTimeout(() => {
      element.removeEventListener('transitionend', handler);
      element.removeEventListener('transitioncancel', handler);
      resolve();
    }, timeout);
  });
}
```

### Handling Elements Only Visible in Certain States

**Tooltips:**
1. Hover on trigger element using MCP computer tool
2. Wait 300-500ms (typical tooltip delay)
3. Take screenshot while still hovering (cursor remains in position)
4. Tooltip will be visible in screenshot

**Dropdowns:**
1. Click trigger element to open dropdown
2. Wait for open animation (200-300ms typical)
3. The dropdown content may be in a portal (appended to body)
4. Take full-page screenshot or use zoom on specific region

**Modals:**
1. Trigger modal open (click button, etc.)
2. Wait for backdrop and content transitions
3. Screenshot captures both modal and backdrop

### MCP GIF Recording for State Transitions

```
// Start recording before interaction
gif_creator: action: "start_recording"
computer: action: "screenshot"  // capture initial frame

// Perform the interaction
computer: action: "hover", coordinate: [x, y]
computer: action: "wait", duration: 0.5
computer: action: "screenshot"  // capture hover state

computer: action: "left_click", coordinate: [x, y]
computer: action: "wait", duration: 0.3
computer: action: "screenshot"  // capture active/open state

// Stop and export
computer: action: "screenshot"  // capture final frame
gif_creator: action: "stop_recording"
gif_creator: action: "export", download: true
```

---

## 7. MCP Output Optimization

### JavaScript Tool Output Constraints

The Claude in Chrome MCP JavaScript execution tool truncates output at approximately 1500 characters. This severely limits how much style data can be returned per call.

### Compact Output Format

```javascript
// Instead of returning full property values, use abbreviations
function compactDelta(element, props) {
  const cs = getComputedStyle(element);
  // Return only property names and shortened values
  return props.reduce((acc, p) => {
    const v = cs.getPropertyValue(p);
    // Shorten color values: rgb(255, 0, 0) -> #ff0000
    acc[p.replace(/^(background-|border-|outline-)/, '')] = shortenValue(v);
    return acc;
  }, {});
}

function shortenValue(v) {
  // Convert rgb() to hex
  const rgbMatch = v.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }
  // Trim whitespace
  return v.trim().substring(0, 40);
}
```

### Batching Strategy

Given ~1500 char limit, each call can reliably return ~15-20 property diffs. Strategy:

**Batch 1: Core visual properties (most likely to change)**
```javascript
['background-color','color','border-color','box-shadow','outline',
 'outline-color','opacity','cursor','transform']
```

**Batch 2: Secondary visual properties**
```javascript
['text-decoration','font-weight','border-width','border-radius',
 'padding','filter','backdrop-filter','scale','translate']
```

**Batch 3: Custom properties / Tailwind**
```javascript
['--tw-ring-color','--tw-ring-opacity','--tw-shadow',
 '--tw-bg-opacity','--tw-text-opacity','--tw-border-opacity']
```

### Minimizing Round Trips

**Single-call combined capture:**
```javascript
// Capture default + hover delta in one JS execution
(() => {
  const el = document.querySelector('.target');
  const p = ['background-color','color','border-color','box-shadow',
    'outline','opacity','cursor','transform','text-decoration'];
  const cs = getComputedStyle(el);
  const b = {};
  p.forEach(k => b[k] = cs.getPropertyValue(k));
  // Note: cannot trigger :hover from JS, so this captures default only
  // Return compact format
  return JSON.stringify(b);
})()
```

**For state changes that CAN be triggered from JS (focus, checked, etc.):**
```javascript
(() => {
  const el = document.querySelector('input.email');
  const p = ['border-color','box-shadow','outline','outline-color','color'];
  const cs = () => {
    const s = getComputedStyle(el);
    return p.reduce((a,k) => (a[k]=s.getPropertyValue(k),a), {});
  };
  const before = cs();
  el.focus();
  const after = cs();
  const delta = {};
  p.forEach(k => { if(before[k]!==after[k]) delta[k]={f:before[k],t:after[k]}; });
  el.blur();
  return JSON.stringify(delta);
})()
```

### Two-Phase Approach for Hover/Active (requires MCP coordination)

1. **Phase 1 (JS call):** Capture baseline styles for target element
2. **Phase 2 (MCP hover):** Move mouse to element
3. **Phase 3 (JS call):** Capture current styles, compute delta against stored baseline

Store baseline in a global variable to avoid re-transmitting:
```javascript
// Call 1: Store baseline
window.__stateCapture = window.__stateCapture || {};
const el = document.querySelector('.btn');
const props = ['background-color','color','box-shadow','outline','transform','cursor','opacity'];
const cs = getComputedStyle(el);
window.__stateCapture.baseline = {};
props.forEach(p => window.__stateCapture.baseline[p] = cs.getPropertyValue(p));
'baseline stored'

// [MCP hover action here]

// Call 2: Capture delta
const el = document.querySelector('.btn');
const props = Object.keys(window.__stateCapture.baseline);
const cs = getComputedStyle(el);
const delta = {};
props.forEach(p => {
  const now = cs.getPropertyValue(p);
  if (now !== window.__stateCapture.baseline[p])
    delta[p] = { from: window.__stateCapture.baseline[p], to: now };
});
JSON.stringify(delta)
```

---

## 8. ChatGPT-Specific Research

### Known Interactive Components

Based on common knowledge of ChatGPT's web interface (chatgpt.com):

#### Send Button
- **Default (empty input):** Disabled appearance, reduced opacity or grayed out
- **Enabled (has input):** Full opacity, brand color background
- **Hover:** Slight brightness/background-color change
- **Active:** Pressed appearance (scale or background-color change)
- **Element:** Typically a `<button>` with `data-testid="send-button"` or similar

#### Message Action Buttons (Copy, Thumbs Up/Down, Regenerate)
- **Default:** Hidden or very low opacity (appear on message hover)
- **Message hover:** Buttons become visible (opacity transition)
- **Button hover:** Background-color change, subtle highlight
- **Active/Clicked (thumbs up/down):** Color change indicating selection, may become filled icon
- **Copied state:** Temporary "Copied!" text or checkmark icon
- **Elements:** Usually within a message action bar, appear as icon buttons

#### Sidebar Items (Conversation List)
- **Default:** Standard text, no background
- **Hover:** Background-color highlight
- **Selected/Active:** Stronger background-color, may have font-weight change
- **Edit mode:** Title becomes editable input, save/cancel buttons appear
- **Rename hover:** Edit/delete icons appear on hover

#### Model Selector Dropdown
- **Closed:** Shows current model name, dropdown chevron
- **Hover:** Subtle background change on trigger
- **Open:** Dropdown appears with model options
- **Option hover:** Background highlight
- **Option selected:** Checkmark or filled state

#### User Avatar / Profile Menu
- **Default:** Avatar circle
- **Hover:** Ring or subtle highlight
- **Open:** Dropdown menu with account options

#### Attachment / Plus Button
- **Default:** Icon button
- **Hover:** Background-color highlight
- **Active (uploading):** Loading indicator, progress bar
- **Has attachment:** Badge or preview shown

#### Input Textarea
- **Empty + placeholder:** Shows placeholder text ("Message ChatGPT")
- **Focused:** May show subtle border/shadow change
- **Filled:** Placeholder hidden, text visible
- **Growing:** Textarea expands as content grows

#### Search
- **Default (sidebar):** Search icon or text
- **Active/Open:** Expands to full search input, results appear below
- **Has results:** List of matching conversations
- **No results:** Empty state message

### DOM Exploration Strategy for ChatGPT

```javascript
// Find all interactive elements with data-testid attributes
document.querySelectorAll('[data-testid]').forEach(el => {
  console.log(el.dataset.testid, el.tagName, el.className.slice(0, 50));
});

// Find all buttons and their states
document.querySelectorAll('button').forEach(btn => {
  console.log({
    text: btn.textContent.slice(0, 30),
    disabled: btn.disabled,
    ariaLabel: btn.getAttribute('aria-label'),
    dataState: btn.dataset.state
  });
});
```

---

## 9. Edge Cases and Pitfalls

### Scroll-Dependent State Changes

**Sticky headers with scroll shadows:**
- State changes when `position: sticky` activates
- Modern CSS: `scroll-state()` container queries (Chrome 133+)
- Legacy: IntersectionObserver with sentinel elements
- **Automation approach:** Scroll page to specific positions, capture at each

```javascript
// Detect sticky state
function isStuck(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const top = parseFloat(style.top);
  return Math.abs(rect.top - top) < 1;
}
```

**Scroll-driven animations:**
- `animation-timeline: scroll()` is a pure CSS feature
- State depends on scroll position, not DOM/JS
- Must scroll to specific positions to capture states

### JavaScript State vs. CSS Pseudo-Classes

**React/framework state toggling:**
```javascript
// React components often use className toggling instead of CSS pseudo-classes
// e.g., className={`btn ${isActive ? 'btn-active' : ''}`}
// These are detectable via classList observation
```

**Detection approach:**
```javascript
// Use MutationObserver to detect class changes
const observer = new MutationObserver((mutations) => {
  mutations.forEach(m => {
    if (m.attributeName === 'class') {
      console.log('Class changed:', m.target.className);
    }
  });
});
observer.observe(element, { attributes: true, attributeFilter: ['class'] });
```

**ARIA state changes:**
- `aria-expanded="true|false"` -- accordions, dropdowns
- `aria-selected="true|false"` -- tabs, options
- `aria-pressed="true|false"` -- toggle buttons
- `aria-checked="true|false"` -- custom checkboxes
- These are detectable via `getAttribute()` but may not have CSS rules attached

### Hover on Touch Devices

- `:hover` pseudo-class on touch: activates on first tap, persists until tap elsewhere
- "Sticky hover" problem -- hover state remains after touch release
- Headless UI solved this with `data-hover` that is specifically ignored on touch devices
- **Automation implication:** Touch simulation produces different hover behavior than mouse

### Compound States

Some visual states only appear in combinations:
- **Hover + Focus:** Button that is both hovered and focused (keyboard navigation while mouse is over element)
- **Disabled + Hover:** Some components change cursor to `not-allowed` on hover when disabled
- **Checked + Disabled:** Different visual treatment than either alone
- **Focus-within + Invalid:** Form container with focused invalid child

**Capture strategy:**
```javascript
// Apply multiple states simultaneously
element.disabled = true;
// Then hover with MCP computer tool
// This captures the disabled+hover compound state
```

### Context-Dependent States

**Loading states:**
- Only appear during active API calls
- Mock strategy: intercept fetch/XHR and delay responses
- Alternative: add loading classes manually
```javascript
// Simulate loading state if component uses standard patterns
element.setAttribute('aria-busy', 'true');
element.classList.add('loading');
```

**Error states:**
- Only appear after failed operations
- Must trigger actual failures or simulate error UI

**Empty states:**
- Only appear when data is absent
- May require clearing data from component state

### Race Conditions

**State reverts before capture:**
- `:active` is extremely brief during a click (~100ms)
- Tooltips may have enter/exit delays
- Dropdown menus may close when focus moves

**Mitigation strategies:**
1. Use `CSS.forcePseudoState` for persistent pseudo-class capture
2. Use `pointer-events: none` on overlays to prevent accidental dismissal
3. Set longer delays: `element.style.transitionDelay = '10s'` to freeze mid-transition
4. Inject CSS to make hover/active states persistent:
```css
.capture-mode .target:hover { transition-delay: 999s; }
```

### Other Pitfalls

**Shadow DOM:**
- Components using Shadow DOM encapsulate their styles
- `getComputedStyle` works on shadow host, but internal elements need `element.shadowRoot.querySelector()`
- Some frameworks (e.g., Lit, Shoelace) use shadow DOM extensively

**CSS-in-JS / Runtime styles:**
- Styled-components, Emotion, etc. inject `<style>` tags at runtime
- Class names are hashed and unstable (e.g., `.sc-bdVTJa`)
- Computed styles still work, but class-based targeting is unreliable
- Use `data-testid`, `aria-*`, or structural selectors instead

**Iframes:**
- Some components render in iframes (e.g., embedded widgets)
- Cannot access cross-origin iframe content
- Same-origin iframes require `contentDocument` access

**High DPI / Retina:**
- Screenshots may be 2x resolution on retina displays
- Ensure consistent device pixel ratio for comparisons

---

## 10. Existing Art and Tools

### Storybook Ecosystem

**storybook-addon-pseudo-states (Chromatic)**
- GitHub: github.com/chromaui/storybook-addon-pseudo-states
- Rewrites ALL document stylesheets to add class selectors parallel to pseudo-class rules
- Supports `:hover`, `:focus`, `:active`, and others
- Limitation: Does NOT render user-agent default styles for pseudo-states
- This is the most mature approach for CSS pseudo-state simulation

**Storybook Interaction Testing**
- Uses `play` functions to simulate user interactions within stories
- Can trigger hover, click, focus states programmatically
- Snapshots are captured at specific interaction points
- Integrates with Chromatic for visual regression

### Visual Regression Testing Platforms

**Chromatic (chromatic.com)**
- Cloud-based visual regression for Storybook stories
- Captures snapshots at multiple breakpoints
- Supports hover/focus via the pseudo-states addon
- Uses DOM snapshot approach (not screenshots)
- Free tier available

**Percy (percy.io / BrowserStack)**
- Captures DOM snapshots, renders in cloud browsers
- Supports multiple browsers and screen widths
- Freezes animations, handles dynamic data
- Integration with Puppeteer, Playwright, Cypress
- Approach: snapshot DOM + stylesheets, render remotely

**Applitools Eyes**
- AI-powered visual comparison ("Visual AI")
- Understands UI structure, ignores rendering noise
- Layout and content matching modes
- SDK for Puppeteer, Playwright, Cypress, Selenium
- Approach: screenshot comparison with AI diffing

**BackstopJS (open source)**
- Visual regression testing with Puppeteer
- Configurable scenarios with interaction scripts
- Supports hover, click, focus via Puppeteer commands
- Approach: reference screenshot vs. test screenshot comparison

### Browser Automation Frameworks

**Playwright**
- `page.hover(selector)` -- moves mouse to element center
- `page.focus(selector)` -- focuses element
- `page.click(selector)` -- clicks element
- `locator.screenshot()` -- captures element-level screenshot
- Can access CDP via `page.context().newCDPSession(page)` for forcePseudoState
- Built-in visual comparison: `expect(page).toHaveScreenshot()`

**Puppeteer**
- `page.hover(selector)` -- mouse hover
- CDP access via `page.createCDPSession()` for CSS.forcePseudoState
- Known issue: hover state may not show in non-headless screenshots

**Cypress**
- `cy.get(selector).trigger('mouseenter')` -- simulates hover (JS events only)
- `cy.get(selector).focus()` -- focuses element
- No direct CDP access; relies on event dispatch
- Plugin: `cypress-real-events` for native browser events

### CSS-in-JS Analysis Tools

**Stitches / Vanilla Extract / Panda CSS:**
- These tools define variants at compile time
- Variants are enumerable from configuration
- Could extract all defined state variants from source code

**Tailwind CSS class analysis:**
- Can parse HTML for Tailwind state variants: `hover:`, `focus:`, `active:`, `disabled:`
- All state styles are declared in the className, making them enumerable:
```javascript
// Find all Tailwind state variants in use
document.querySelectorAll('*').forEach(el => {
  const classes = [...el.classList];
  const stateClasses = classes.filter(c =>
    /^(hover|focus|active|disabled|checked|group-hover|peer-focus):/.test(c)
  );
  if (stateClasses.length) console.log(el.tagName, stateClasses);
});
```

### No Direct "State Extraction" Tool Exists

After thorough research, no existing open-source tool or commercial product provides a generic "extract all visual states from a live web page" capability. The closest approaches are:

1. **Storybook + Chromatic** -- requires components to be in Storybook
2. **Playwright/Puppeteer + CDP** -- can force states, but requires custom scripting
3. **The approach documented here** -- combines MCP browser tools with JS execution for a novel workflow

This represents a genuine gap in tooling that the skill being designed would fill.

---

## Summary: Recommended Approach for MCP-Based State Extraction

### Phase 1: Discovery
1. Use `read_page` to identify interactive elements
2. Use JS execution to enumerate `data-*` state attributes
3. Use JS execution to enumerate ARIA state attributes
4. Classify elements by component type

### Phase 2: Baseline Capture
1. Disable transitions/animations via injected CSS
2. Scroll element into view
3. Move cursor to neutral position
4. Capture baseline screenshot
5. Store baseline computed styles in `window.__stateCapture`

### Phase 3: State Iteration
For each relevant state per component type:
1. Trigger state change (hover via computer tool, focus via JS, etc.)
2. Wait appropriate time (frame or transition completion)
3. Capture screenshot
4. Capture computed style delta via JS
5. Revert state for next iteration

### Phase 4: Data Compilation
1. Collect all screenshots with state labels
2. Collect all style deltas
3. Identify data-attribute state values
4. Return structured output with component-state-property mappings

---

## Sources

- [Chrome DevTools Protocol - CSS domain](https://chromedevtools.github.io/devtools-protocol/tot/CSS/)
- [Triggering of pseudo classes - Chrome for Developers](https://developer.chrome.com/blog/triggering-of-pseudo-classes)
- [CSS Pseudo-classes - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/Pseudo-classes)
- [Hover and focus states - Chromatic docs](https://www.chromatic.com/docs/hoverfocus/)
- [storybook-addon-pseudo-states - GitHub](https://github.com/chromaui/storybook-addon-pseudo-states)
- [Styling - Radix Primitives](https://www.radix-ui.com/primitives/docs/guides/styling)
- [Headless UI v2.0 - Tailwind CSS](https://tailwindcss.com/blog/headless-ui-v2)
- [Base UI data attributes - GitHub](https://github.com/mui/base-ui/issues/3476)
- [Window: getComputedStyle() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)
- [Element: transitionend event - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/transitionend_event)
- [CSS scroll-state() - Chrome for Developers](https://developer.chrome.com/blog/css-scroll-state-queries)
- [Puppeteer forcePseudoState - GitHub Issue #4057](https://github.com/puppeteer/puppeteer/issues/4057)
- [Playwright forcePseudoState - GitHub Issue #3347](https://github.com/microsoft/playwright/issues/3347)
- [CDP CSS.forcePseudoState bug - Chromium Issue 343757697](https://issues.chromium.org/issues/343757697)
- [Percy Visual Testing](https://percy.io/)
- [Hover, focus, and other states - Tailwind CSS](https://tailwindcss.com/docs/hover-focus-and-other-states)
- [Use data attributes - MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/Use_data_attributes)
- [Sticky header scroll shadow](https://ryanmulligan.dev/blog/sticky-header-scroll-shadow/)
- [Chrome DevTools MCP - Chrome for Developers](https://developer.chrome.com/blog/chrome-devtools-mcp)
