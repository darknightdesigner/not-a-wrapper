---
name: web-inspector-mcp
description: Use the mcp-web-inspector MCP server to inspect web pages — extract HTML structure, computed CSS styles, design tokens, layout measurements, console logs, and network requests. Use when navigating to a URL to analyze its design, debug layout issues, extract color/typography tokens, or audit page structure.
---

# Web Inspector MCP

Use this skill when you need to programmatically inspect a web page: navigate to a URL, read DOM structure, extract computed CSS, measure layout, capture console logs, or monitor network requests.

## Prerequisites

- [ ] `mcp-web-inspector` MCP server is installed (`claude mcp add web-inspector --scope user -- npx -y mcp-web-inspector`)
- [ ] Tools are prefixed with `mcp__web-inspector__` in the tool list

## Quick Reference

| Category | Tools | Purpose |
|----------|-------|---------|
| Navigation | `navigate`, `go_history`, `scroll_by`, `scroll_to_element` | Load pages, scroll, navigate history |
| Inspection | `inspect_dom`, `get_computed_styles`, `measure_element`, `inspect_ancestors`, `compare_element_alignment`, `check_visibility`, `query_selector`, `find_by_text`, `element_exists`, `get_test_ids` | Analyze structure, styles, layout |
| Content | `get_html`, `get_text`, `visual_screenshot_for_humans` | Extract markup, text, screenshots |
| Interaction | `click`, `fill`, `select`, `hover`, `press_key`, `drag`, `upload_file` | Interact with page elements |
| Console | `get_console_logs`, `clear_console_logs` | Read/clear browser console |
| Network | `list_network_requests`, `get_request_details` | Monitor HTTP traffic |
| Waiting | `wait_for_element`, `wait_for_network_idle` | Wait for dynamic content |
| Utility | `evaluate`, `set_color_scheme`, `close`, `confirm_output` | JS execution, dark mode, cleanup |

## Selector Shortcuts

All tools that accept a `selector` parameter support these shorthands:

| Shorthand | Expands To | Example |
|-----------|-----------|---------|
| `testid:name` | `[data-testid="name"]` | `testid:submit-btn` |
| `data-test:name` | `[data-test="name"]` | `data-test:login` |
| `data-cy:name` | `[data-cy="name"]` | `data-cy:header` |
| `text=Label` | Playwright text selector | `text=Sign In` |

Standard CSS selectors also work: `#id`, `.class`, `button.primary`, `nav > ul > li:first-child`.

## Core Workflows

### Workflow 1: Page Structure Exploration (Start Here)

Always begin with this pattern when inspecting a new page:

```
1. navigate({ url: "https://example.com" })
2. inspect_dom({})                              # Page overview — semantic elements only
3. inspect_dom({ selector: "main" })            # Drill into main content
4. get_test_ids({})                             # Discover testid selectors
```

`inspect_dom` is the **primary inspection tool**. It skips wrapper divs and shows only semantic elements with:
- Absolute position `@ (x,y) WxH`
- Distance from parent edges (equal left/right = horizontally centered)
- Sibling spacing gaps
- Scrollable container detection (`scrollable ↕️ 397px`)
- Visibility and interactivity status

### Workflow 2: Design Token Extraction

Extract typography, colors, and spacing into structured data:

```
1. navigate({ url, device: "desktop-1080p" })
2. inspect_dom({})                              # Find semantic elements

# Typography tokens
3. get_computed_styles({
     selector: "h1",
     properties: "font-family,font-size,font-weight,line-height,letter-spacing,color"
   })
4. Repeat for h2, h3, p, a, button, label, small, etc.

# Color tokens
5. get_computed_styles({
     selector: "body",
     properties: "background-color,color"
   })
6. get_computed_styles({
     selector: "button.primary",
     properties: "background-color,color,border-color,box-shadow"
   })

# CSS custom properties (design tokens defined as variables)
7. evaluate({
     script: `(() => {
       const styles = getComputedStyle(document.documentElement);
       const props = {};
       for (const sheet of document.styleSheets) {
         try {
           for (const rule of sheet.cssRules) {
             if (rule.selectorText === ':root' || rule.selectorText === ':host') {
               for (const prop of rule.style) {
                 if (prop.startsWith('--')) {
                   props[prop] = styles.getPropertyValue(prop).trim();
                 }
               }
             }
           }
         } catch(e) {}
       }
       return props;
     })()`
   })

# Spacing tokens
8. measure_element({ selector: "testid:card" })   # Box model: padding, margin, border

# Dark mode
9.  set_color_scheme({ scheme: "dark" })
10. Re-extract all color values (steps 5-7)
```

### Workflow 3: Layout Debugging

When something looks wrong — unexpected spacing, misalignment, clipping:

```
1. inspect_dom({ selector: "#problem-element" })      # See position, edges, visibility
2. measure_element({ selector: "#problem-element" })   # Box model (padding/margin/border)
3. inspect_ancestors({ selector: "#problem-element" }) # Walk up DOM for constraints
4. compare_element_alignment({                          # Compare two elements
     selector1: "#header-left",
     selector2: "#header-right"
   })
```

`inspect_ancestors` shows for each ancestor: width constraints, margins, padding, display type, flex/grid context, overflow clipping points, and auto-margin centering.

### Workflow 4: Responsive Testing

```
1. navigate({ url, device: "desktop-1080p" })
2. inspect_dom({})                                     # Desktop layout
3. navigate({ url, device: "iphone-14" })              # Forces browser restart
4. inspect_dom({})                                     # Mobile layout
5. element_exists({ selector: "testid:hamburger-menu" })
```

Available device presets: `iphone-se`, `iphone-14`, `iphone-14-pro`, `pixel-5`, `ipad`, `samsung-s21`, `desktop-1080p` (1920x1080), `desktop-2k` (2560x1440), `laptop-hd` (1366x768).

### Workflow 5: Network & Console Debugging

```
1. navigate({ url })
2. click({ selector: "testid:submit-btn" })
3. wait_for_network_idle({})
4. list_network_requests({ type: "fetch" })             # See API calls
5. get_request_details({ index: 0 })                    # Headers, body, response
6. get_console_logs({ type: "error", since: "last-navigation" })
```

## Tool Details

### inspect_dom

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `selector` | string | `body` | Element to inspect (omit for page overview) |
| `includeHidden` | boolean | `false` | Include hidden elements |
| `maxChildren` | number | `20` | Max children shown |
| `maxDepth` | number | `5` | Depth to drill through wrappers |

Output symbols: `✓`=visible, `✗`=hidden, `⚡`=interactive, `↕️`=vertical scroll, `↔️`=horizontal scroll.

### get_computed_styles

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `selector` | string | required | Element selector |
| `properties` | string | common layout | Comma-separated CSS properties |

Default properties: `display,position,width,height,opacity,visibility,z-index,overflow,margin,padding,font-size,font-weight,color,background-color`.

### measure_element

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `selector` | string | required | Element selector |

Returns visual box model: content → padding → border → margin with directional arrows.

### evaluate

| Parameter | Type | Description |
|-----------|------|-------------|
| `script` | string | JavaScript to execute in page context |

Returns JSON-serializable results. Large outputs (>2000 chars) return a preview + one-time `confirm_output` token (expires in 120s).

### get_console_logs

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `"all"` | `all`, `error`, `warning`, `log`, `info`, `debug`, `exception` |
| `since` | string | `"last-interaction"` | `last-call`, `last-navigation`, `last-interaction` |
| `search` | string | — | Text filter |
| `limit` | number | `20` | Max entries |
| `format` | string | `"grouped"` | `grouped` (deduped) or `raw` (chronological) |

### navigate

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | Target URL |
| `browserType` | string | `"chromium"` | `chromium`, `firefox`, `webkit` |
| `device` | string | — | Device preset (overrides width/height) |
| `width` / `height` | number | screen size | Viewport dimensions |
| `timeout` | number | `30000` | Navigation timeout in ms |
| `waitUntil` | string | `"load"` | `load`, `domcontentloaded`, `networkidle`, `commit` |
| `headless` | boolean | CLI flag | Run headless |

### visual_screenshot_for_humans

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | required | Filename (no extension) |
| `selector` | string | viewport | Element to capture |
| `fullPage` | boolean | `false` | Capture full scrollable page |
| `downloadsDir` | string | `./.mcp-web-inspector/screenshots` | Save directory |

**Cost warning**: ~1,500 tokens per screenshot vs <100 tokens for structural tools. Prefer `inspect_dom` / `get_computed_styles` over screenshots.

## Session & Configuration

### Session Persistence

Browser sessions (cookies, localStorage) persist in `./.mcp-web-inspector/user-data/`. Add `.mcp-web-inspector/` to `.gitignore`.

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--headless` | `false` | No visible browser window |
| `--no-save-session` | `false` | Fresh state each launch |
| `--user-data-dir <path>` | `./.mcp-web-inspector` | Storage location |
| `--expose-sensitive-network-data` | `false` | Show auth/cookie values |

## Decision Guide: Which Tool to Use

| I want to... | Use this tool | NOT this |
|--------------|---------------|----------|
| See page structure | `inspect_dom` | `get_html` (too verbose) |
| Check element visibility | `check_visibility` | `visual_screenshot_for_humans` |
| Get CSS values | `get_computed_styles` | `evaluate` (unless custom props) |
| Measure spacing | `measure_element` | `evaluate` with getBoundingClientRect |
| Compare alignment | `compare_element_alignment` | Manual evaluate calculations |
| Find element by text | `find_by_text` | `get_text` (unstructured) |
| Extract CSS variables | `evaluate` (custom JS) | `get_computed_styles` (doesn't read vars) |
| Debug layout constraint | `inspect_ancestors` | screenshot |
| Quick existence check | `element_exists` | `query_selector` (heavier) |

## Limitations

- **Single page at a time** — no multi-tab inspection
- **No iframe inspection** — cross-origin iframes are inaccessible
- **No request interception** — cannot mock API responses
- **No cookie/localStorage read tool** — use `evaluate` as workaround
- **Device change restarts browser** — switching presets is slow
- **Large output guard** — `get_html`, `get_text`, `evaluate`, `get_request_details` truncate at ~2000 chars; call `confirm_output` with the returned token to get full content
- **Console default scope** — `get_console_logs` defaults to `since: "last-interaction"`; use `since: "last-navigation"` for broader scope
- **First-run downloads ~1GB** — Playwright browsers install on first use

## Output Format: Design Token Markdown

When extracting tokens, save results in this format:

```markdown
# Design Tokens — [Site Name]
Extracted: [date] | URL: [url] | Viewport: [device/dimensions]

## Colors
| Token | Light | Dark |
|-------|-------|------|
| Background | #ffffff | #1a1a1a |
| Text Primary | #111827 | #f9fafb |
| Accent | #3b82f6 | #60a5fa |

## Typography
| Element | Font | Size | Weight | Line Height | Letter Spacing |
|---------|------|------|--------|-------------|----------------|
| h1 | Inter | 48px | 700 | 1.2 | -0.02em |
| body | Inter | 16px | 400 | 1.5 | normal |

## Spacing
| Element | Padding | Margin | Border Radius |
|---------|---------|--------|---------------|
| Card | 24px | 0 0 16px 0 | 12px |
| Button | 12px 24px | 0 | 8px |

## CSS Custom Properties
| Variable | Value |
|----------|-------|
| --color-primary | #3b82f6 |
| --font-sans | Inter, system-ui, sans-serif |
| --spacing-4 | 1rem |
```
