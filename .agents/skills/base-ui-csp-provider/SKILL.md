---
name: base-ui-csp-provider
description: Configure CSP-related behavior for inline tags rendered by Base UI components. Use when implementing Content Security Policy with Base UI, when inline <style> or <script> tags are blocked by CSP, when applying a nonce to Base UI components, or when disabling inline style elements for strict CSP environments.
---

# CSP Provider

A CSP provider component that applies a nonce to inline `<style>` and `<script>` tags rendered by Base UI components, and can disable inline `<style>` elements.

> **Reference**: [Base UI Quick Start](https://base-ui.com/react/overview/quick-start) for additional context on Base UI setup and configuration.

## Anatomy

Import the component and wrap it around your app:

```tsx
import { CSPProvider } from '@base-ui/react/csp-provider';

<CSPProvider nonce="...">
  {/* Your app or a group of components */}
</CSPProvider>
```

Some Base UI components render inline `<style>` or `<script>` tags for functionality such as removing scrollbars or pre-hydration behavior. Under a strict Content Security Policy (CSP), these tags may be blocked unless they include a matching [nonce](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/nonce) attribute.

`CSPProvider` allows configuring this behavior globally for all Base UI components within its tree.

## Supplying a Nonce

If you enforce a CSP that blocks inline tags by default, configure your server to:

1. Generate a random nonce per request
2. Include it in your CSP header (via `style-src-elem` / `script-src`)
3. Pass the same nonce into `CSPProvider` during rendering

```ts
const nonce = crypto.randomUUID();

// Example CSP header
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}'`,
  `style-src-elem 'self' 'nonce-${nonce}'`,
].join('; ');
```

Then provide the nonce to Base UI:

```tsx
import { CSPProvider } from '@base-ui/react/csp-provider';

function App({ nonce }: { nonce: string }) {
  return <CSPProvider nonce={nonce}>{/* ... */}</CSPProvider>;
}
```

This ensures that all inline `<style>` and `<script>` tags rendered by Base UI components include the correct nonce attribute, allowing them to function under your CSP.

## Disabling Inline Style Elements

You can avoid supplying a `nonce` if you disable inline `<style>` elements entirely and rely on external stylesheets only. The relevant components are `<ScrollArea.Viewport>` and `<Select.Popup>` or `<Select.List>` when `alignItemWithTrigger` is enabled, which inject a style tag to disable native scrollbars.

The injected styles look like this:

```html
<style>
  .base-ui-disable-scrollbar {
    scrollbar-width: none;
  }
  .base-ui-disable-scrollbar::-webkit-scrollbar {
    display: none;
  }
</style>
```

Specify `disableStyleElements` to remove these tags:

```tsx
<CSPProvider disableStyleElements>{/* ... */}</CSPProvider>
```

**Note**: `<script>` tags across all components are opt-in, so they are not affected by this prop and don't have their own disable flag. A `nonce` is required if any component uses inline scripts.

## Inline Style Attributes

`CSPProvider` covers inline `<style>` and `<script>` tags rendered as elements, but it does **not** cover inline style attributes (e.g. `<div style="...">`). The `style-src-attr` directive in CSP governs inline style attributes encountered when parsing HTML from server pre-rendered components (it does not affect client-side JavaScript that sets styles).

In CSP, `style-src` applies to both `<style>` elements and `style=""` attributes. If you only want to control `<style>` elements, use `style-src-elem` instead.

### Options When CSP Blocks Inline Style Attributes

If your CSP blocks inline style _attributes_ in addition to _elements_, you have a few options:

1. **Relax your CSP** — Add `'unsafe-inline'` to the `style-src-attr` directive (or use only `style-src-elem` instead of `style-src`). Style attributes specifically pose a less severe security risk than style elements, but this approach may not be acceptable in high-security environments.
2. **Client-only rendering** — Render the affected components only on the client, so that no inline styles are present in the initial HTML.
3. **Manual style overrides** — Unset inline styles and specify them in your CSS instead. Any component can have its inline styles unset, such as `<ScrollArea.Viewport style={{ overflow: undefined }}>`. Note that you'll need to vet upgrades for any new inline styles added by Base UI components.

## API Reference

`CSPProvider` provides a default Content Security Policy configuration for Base UI components that require inline `<style>` or `<script>` tags.

| Prop | Type | Default | Description |
|:-----|:-----|:--------|:------------|
| `disableStyleElements` | `boolean` | `false` | Whether inline `<style>` elements created by Base UI components should not be rendered. Instead, components must specify the CSS styles via custom class names or other methods. |
| `nonce` | `string` | — | The nonce value to apply to inline `<style>` and `<script>` tags. |
| `children` | `ReactNode` | — | The component tree to apply CSP configuration to. |

## Integration Example (Next.js)

In a Next.js App Router project, generate the nonce in your root layout and pass it down:

```tsx
// app/layout.tsx
import { headers } from 'next/headers';
import { CSPProvider } from '@base-ui/react/csp-provider';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html lang="en">
      <body>
        <CSPProvider nonce={nonce}>
          {children}
        </CSPProvider>
      </body>
    </html>
  );
}
```

Configure your middleware to generate and attach the nonce:

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const response = NextResponse.next();

  response.headers.set('x-nonce', nonce);
  response.headers.set(
    'Content-Security-Policy',
    [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src-elem 'self' 'nonce-${nonce}'`,
    ].join('; ')
  );

  return response;
}
```
