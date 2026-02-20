---
name: chrome-devtools-mcp
description: Use the chrome-devtools-mcp MCP server (by Google) for full browser DevTools access — JavaScript execution, console messages, network inspection, performance tracing, page automation, and emulation. Use when debugging web apps, profiling performance, inspecting network traffic, or running custom JS to extract data from pages.
---

# Chrome DevTools MCP

Use this skill when you need full Chrome DevTools capabilities: execute JavaScript in page context, read console messages, inspect network requests, run performance traces, automate page interactions, or emulate devices/network conditions.

## Prerequisites

- [ ] `chrome-devtools-mcp` MCP server is installed (`claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest`)
- [ ] Tools are prefixed with `mcp__chrome-devtools__` in the tool list
- [ ] Chrome or Chromium installed (Node.js v20.19+)

## Quick Reference

| Category | Tools | Purpose |
|----------|-------|---------|
| Navigation | `navigate_page`, `list_pages`, `select_page`, `new_page`, `close_page`, `wait_for` | Multi-page management |
| Debugging | `evaluate_script`, `take_screenshot`, `take_snapshot`, `get_console_message`, `list_console_messages` | JS execution, DOM snapshots, console |
| Input | `click`, `drag`, `fill`, `fill_form`, `handle_dialog`, `hover`, `press_key`, `upload_file` | Page interaction |
| Network | `list_network_requests`, `get_network_request` | HTTP traffic inspection |
| Performance | `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight` | Core Web Vitals, traces |
| Emulation | `emulate`, `resize_page` | Device, network, geolocation, color scheme |

## Key Advantage Over Web Inspector

Chrome DevTools MCP provides capabilities that web-inspector does not:

- **Multi-page support** — open, switch between, and close multiple tabs
- **Performance tracing** — record and analyze Core Web Vitals, LCP, CLS, INP
- **Network throttling** — simulate Slow 3G, Fast 4G, Offline
- **CPU throttling** — simulate slow devices
- **Geolocation emulation** — test location-based features
- **Dialog handling** — accept/dismiss browser alerts, confirms, prompts
- **`evaluate_script` with element arguments** — pass DOM element references from snapshots directly into JS functions
- **Source-mapped console messages** — console errors include original source locations

## Core Workflows

### Workflow 1: Navigate and Inspect Page

```
1. navigate_page({ type: "url", url: "https://example.com" })
2. take_snapshot({})                                    # A11y-tree text snapshot of page
3. take_screenshot({})                                  # Visual capture
```

`take_snapshot` returns a structured accessibility tree with unique `uid` identifiers for every element. These `uid` values are used by all interaction and inspection tools.

### Workflow 2: Execute Custom JavaScript

`evaluate_script` is the most powerful tool — it runs arbitrary JS in the page context.

```
# Extract all CSS custom properties
evaluate_script({
  function: `() => {
    const styles = getComputedStyle(document.documentElement);
    const tokens = {};
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === ':root') {
            for (const prop of rule.style) {
              if (prop.startsWith('--')) {
                tokens[prop] = styles.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch(e) {}
    }
    return tokens;
  }`
})

# Extract computed styles for an element (pass uid from snapshot)
evaluate_script({
  function: `(el) => {
    const s = getComputedStyle(el);
    return {
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      color: s.color,
      backgroundColor: s.backgroundColor,
      padding: s.padding,
      margin: s.margin,
      borderRadius: s.borderRadius
    };
  }`,
  args: [{ uid: "e45" }]
})

# Get all colors used on the page
evaluate_script({
  function: `() => {
    const colors = new Set();
    document.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      colors.add(s.color);
      colors.add(s.backgroundColor);
      if (s.borderColor !== s.color) colors.add(s.borderColor);
    });
    return [...colors].filter(c => c !== 'rgba(0, 0, 0, 0)').sort();
  }`
})
```

**Key details about `evaluate_script`:**
- The `function` parameter must be a **function declaration** (not a statement): `() => { ... }` or `(el) => { ... }`
- The `args` parameter passes element references by `uid` (from `take_snapshot`)
- Return values must be **JSON-serializable** (no DOM nodes, functions, or circular refs)
- Runs in page context — has access to `document`, `window`, `fetch`, etc.
- Can be `async`: `async () => { return await fetch(...) }`

### Workflow 3: Console Debugging

```
1. navigate_page({ type: "url", url: "https://example.com" })
2. list_console_messages({})                            # All messages since navigation
3. list_console_messages({ types: ["error", "warn"] })  # Errors and warnings only
4. get_console_message({ msgid: 5 })                    # Full detail for specific message
```

Console message filtering:

| Parameter | Type | Description |
|-----------|------|-------------|
| `types` | string[] | Filter: `log`, `debug`, `info`, `error`, `warn`, `dir`, `table`, `trace`, `assert`, `verbose`, `issue` |
| `pageSize` | number | Max messages per page |
| `pageIdx` | number | Page number (0-based) |
| `includePreservedMessages` | boolean | Include messages from last 3 navigations |

### Workflow 4: Network Inspection

```
1. navigate_page({ type: "url", url: "https://example.com" })
2. click({ uid: "e23" })                                # Trigger API call
3. wait_for({ text: "Results" })                         # Wait for response
4. list_network_requests({})                             # All requests
5. list_network_requests({ resourceTypes: ["fetch", "xhr"] })  # API calls only
6. get_network_request({ reqid: 12 })                    # Full headers + body
7. get_network_request({ reqid: 12, responseFilePath: "./response.json" })  # Save to file
```

Network request filtering:

| `resourceTypes` value | Matches |
|----------------------|---------|
| `fetch`, `xhr` | API calls |
| `document` | HTML pages |
| `script` | JavaScript files |
| `stylesheet` | CSS files |
| `image`, `font`, `media` | Assets |
| `websocket` | WebSocket connections |

### Workflow 5: Performance Profiling

```
# Auto-record: reload page, trace until load complete, analyze
1. navigate_page({ type: "url", url: "https://example.com" })
2. performance_start_trace({ reload: true, autoStop: true })
   # Returns: CWV scores (LCP, CLS, INP) + available insight sets

3. performance_analyze_insight({
     insightSetId: "navigation-1",
     insightName: "LCPBreakdown"
   })

# Manual recording for user interactions
1. performance_start_trace({ reload: false, autoStop: false })
2. click({ uid: "e45" })                                # User interaction
3. wait_for({ text: "Done" })
4. performance_stop_trace({ filePath: "./trace.json.gz" })
```

Available insight names: `DocumentLatency`, `LCPBreakdown`, `CLSContributors`, `RenderBlocking`, `ThirdParties`, `SlowCSS`, `LongTasks`, and more.

### Workflow 6: Device & Network Emulation

```
# Emulate mobile device
emulate({
  viewport: {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)..."
})

# Simulate slow network
emulate({ networkConditions: "Slow 3G" })

# Simulate slow CPU
emulate({ cpuThrottlingRate: 4 })          # 4x slower

# Dark mode
emulate({ colorScheme: "dark" })

# Geolocation
emulate({ geolocation: { latitude: 40.7128, longitude: -74.006 } })

# Reset all
emulate({
  viewport: null,
  userAgent: null,
  networkConditions: "No emulation",
  cpuThrottlingRate: 1,
  colorScheme: "auto",
  geolocation: null
})
```

Network condition presets: `No emulation`, `Offline`, `Slow 3G`, `Fast 3G`, `Slow 4G`, `Fast 4G`.

### Workflow 7: Multi-Page Management

```
1. navigate_page({ type: "url", url: "https://example.com" })
2. new_page({ url: "https://example.com/settings", background: true })
3. list_pages({})                                       # See all open pages with IDs
4. select_page({ pageId: 1, bringToFront: true })       # Switch to page
5. take_snapshot({})                                     # Inspect selected page
6. close_page({ pageId: 1 })                            # Close when done
```

### Workflow 8: Form Automation

```
# Fill multiple fields at once
fill_form({
  elements: [
    { uid: "e10", value: "john@example.com" },
    { uid: "e11", value: "secretpassword" },
    { uid: "e12", value: "John Doe" }
  ]
})

# Handle browser dialogs (alert, confirm, prompt)
click({ uid: "e20" })                                   # Triggers dialog
handle_dialog({ action: "accept", promptText: "yes" })
```

## Tool Details

### evaluate_script

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `function` | string | Yes | JS function declaration: `() => { ... }` or `(el) => { ... }` |
| `args` | array | No | Element references: `[{ uid: "e45" }]` |

### navigate_page

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | string | No | — | `"url"`, `"back"`, `"forward"`, `"reload"` |
| `url` | string | No | — | Target URL (only for `type: "url"`) |
| `timeout` | number | No | — | Max wait time in ms |
| `ignoreCache` | boolean | No | — | Ignore cache on reload |
| `initScript` | string | No | — | JS to execute before page scripts on next navigation |

### take_snapshot

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `verbose` | boolean | No | `false` | Include full a11y tree info |
| `filePath` | string | No | — | Save snapshot to file |

Returns a text representation of the page's accessibility tree. Each element has a `uid` used by interaction tools.

### emulate

| Parameter | Type | Description |
|-----------|------|-------------|
| `viewport` | object/null | `{ width, height, deviceScaleFactor, isMobile, hasTouch, isLandscape }`. `null` to reset. |
| `colorScheme` | string | `"dark"`, `"light"`, `"auto"` |
| `networkConditions` | string | `"No emulation"`, `"Offline"`, `"Slow 3G"`, `"Fast 3G"`, `"Slow 4G"`, `"Fast 4G"` |
| `cpuThrottlingRate` | number | 1 (normal) to 20 (20x slower) |
| `geolocation` | object/null | `{ latitude, longitude }`. `null` to clear. |
| `userAgent` | string/null | Custom user agent. `null` to clear. |

### list_network_requests

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `resourceTypes` | string[] | all | Filter: `document`, `stylesheet`, `image`, `media`, `font`, `script`, `xhr`, `fetch`, `websocket`, `preflight`, etc. |
| `pageSize` | number | all | Max requests per page |
| `pageIdx` | number | `0` | Pagination |
| `includePreservedRequests` | boolean | `false` | Include requests from last 3 navigations |

### get_network_request

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reqid` | number | No | Request ID. Omit for currently selected request in DevTools. |
| `requestFilePath` | string | No | Save request body to file |
| `responseFilePath` | string | No | Save response body to file |

### performance_start_trace

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `reload` | boolean | Yes | — | Reload page after starting trace |
| `autoStop` | boolean | Yes | — | Auto-stop after page load |
| `filePath` | string | No | — | Save raw trace (`.json.gz` or `.json`) |

### performance_analyze_insight

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `insightSetId` | string | Yes | From trace results (e.g., `"navigation-1"`) |
| `insightName` | string | Yes | Insight type (e.g., `"LCPBreakdown"`, `"CLSContributors"`) |

## Configuration

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--headless` | off | Run without visible browser window |
| `--no-performance-crux` | off | Don't send trace URLs to Google CrUX API |
| `--no-usage-statistics` | off | Disable anonymous usage statistics |

### MCP Configuration

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--headless", "--no-usage-statistics"]
    }
  }
}
```

## Decision Guide: When to Use Chrome DevTools vs Web Inspector

| I want to... | Use Chrome DevTools | Use Web Inspector |
|--------------|--------------------|--------------------|
| Run custom JS in page context | `evaluate_script` (pass element refs via uid) | `evaluate` (simpler, no element args) |
| Extract computed CSS by category | Use `evaluate_script` with `getComputedStyle` | `get_computed_styles` (built-in, categorized) |
| Measure box model | Use `evaluate_script` | `measure_element` (visual output) |
| Profile performance / CWV | `performance_start_trace` | Not available |
| Throttle network/CPU | `emulate` | Not available |
| Emulate geolocation | `emulate` | Not available |
| Work with multiple tabs | `new_page` / `select_page` | Not available (single page) |
| Handle browser dialogs | `handle_dialog` | Not available |
| Debug console with source maps | `list_console_messages` | `get_console_logs` (simpler) |
| Inspect layout hierarchy | `evaluate_script` (manual) | `inspect_dom` / `inspect_ancestors` (built-in) |
| Compare element alignment | `evaluate_script` (manual) | `compare_element_alignment` (built-in) |
| Save network response to file | `get_network_request({ responseFilePath })` | `get_request_details` + `confirm_output` |

### Recommended Pairing

Use **both servers together** for maximum coverage:

1. **Chrome DevTools** for: `evaluate_script` (custom JS + element refs), `performance_*` (profiling), `emulate` (network/CPU/geo), multi-tab workflows, dialog handling
2. **Web Inspector** for: `inspect_dom` (structured layout), `get_computed_styles` (categorized CSS), `measure_element` (box model), `inspect_ancestors` (constraint debugging), `compare_element_alignment`

### Design Token Extraction Pipeline (Both Servers)

```
# 1. Navigate with Chrome DevTools (supports initScript)
chrome-devtools: navigate_page({ type: "url", url: "https://target.com" })

# 2. Survey structure with Web Inspector (better DOM tools)
web-inspector: inspect_dom({})

# 3. Extract typography with Web Inspector (categorized output)
web-inspector: get_computed_styles({ selector: "h1", properties: "font-family,font-size,font-weight,line-height,color" })

# 4. Extract CSS variables with Chrome DevTools (powerful JS execution)
chrome-devtools: evaluate_script({ function: "() => { /* extract --vars */ }" })

# 5. Test dark mode
chrome-devtools: emulate({ colorScheme: "dark" })
web-inspector: get_computed_styles({ selector: "body", properties: "background-color,color" })

# 6. Profile performance
chrome-devtools: performance_start_trace({ reload: true, autoStop: true })
chrome-devtools: performance_analyze_insight({ insightSetId: "navigation-1", insightName: "LCPBreakdown" })

# 7. Save results to markdown
Write extracted data to .agents/context/research/design-tokens-[site].md
```

## Limitations

- **Chrome only** — no Firefox/WebKit support (unlike web-inspector which supports all three)
- **No built-in CSS inspection tools** — must use `evaluate_script` with `getComputedStyle()` for CSS values
- **No built-in layout debugging** — no equivalent to `inspect_dom`, `measure_element`, `inspect_ancestors`
- **CrUX API calls by default** — performance traces send URLs to Google unless `--no-performance-crux` is set
- **Usage statistics enabled by default** — opt out with `--no-usage-statistics`
- **Snapshot-based element references** — `uid` values from `take_snapshot` may become stale after DOM mutations; re-snapshot after interactions
- **No session persistence config** — unlike web-inspector, no built-in persistent login sessions
