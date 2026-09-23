# 42. Aqua: an opt-in third theme skinned by unlayered CSS on stable hooks

- Status: accepted
- Date: 2026-09-20
- Related: ADR-0018 (sidebar geometry tokens stay pinned by `sidebar-geometry.test.ts`; Aqua sets only `--sidebar-row-radius`), ADR-0032 (the only shell cookie; the theme stays in next-themes localStorage)

## Context

We want an opt-in "Aqua" theme styled after Mac OS X 10.0-10.2: pinstripes, blue and clear gel buttons, white pinstriped menus with a blue stripe highlight, Lucida Grande, gel scrollbars, and yellow help tags. Panther (10.3) elements such as segmented tabs and brushed metal are out of scope. Light and dark must stay pixel-identical, and the skin must stay centralized: no per-call-site className edits.

Three facts shape the design:

- Paint lives in Tailwind utilities inside `@layer utilities`, and many surfaces also use unlayered author rules in `app/globals.css` (`.markdown`, `.composer-prosemirror`, `.sidebar-row`, vaul). A skin has to beat both.
- Primitives expose Base UI state attributes and `data-slot`, but Button had no variant or size hook, so a skin could not tell a primary button from a secondary one.
- next-themes removes only theme classes it was told about, writes inline `color-scheme` only for `light` and `dark`, and our `dark:` variant is `&:is(.dark *)`.

## Decision

- **Third next-themes theme.** `lib/theme.ts` owns `APP_THEMES = ["light", "dark", "aqua"]`, `AppTheme`, `THEME_COLOR_SCHEME` (Aqua maps to light), and `resolveColorScheme`. The root `ThemeProvider` receives `themes={[...APP_THEMES]}`, so switching away removes the `aqua` class. `system` still resolves only to light or dark, so Aqua is strictly opt-in. Consumers that hand a theme to a light/dark-only library (Sonner) go through `resolveColorScheme`; existing `resolvedTheme === "dark"` checks already behave.
- **Unlayered and imported last.** Aqua CSS lives only in `app/aqua/*.css` (tokens, controls, overlays, shell, thread, composer), imported by `app/layout.tsx` right after `./globals.css`, so Next emits them as a separate stylesheet linked after the globals stylesheet. They are not `@import`-ed from the end of `globals.css`: an `@import` after other rules is invalid CSS, and Turbopack's CSS parser silently drops it, even though Tailwind alone would inline it. The files are plain CSS: no `@layer`, `@apply`, `@theme`, or Tailwind functions. Unlayered and last means an `.aqua` rule beats every utility regardless of specificity and wins ties against existing unlayered rules by order. It loses only to `!important` utilities and inline styles. `!important` is used only to beat an existing one, with an inline note.
- **Everything is gated.** Every selector starts with `:root.aqua` (tokens) or `.aqua` (skins). `--background` stays a solid color because it feeds `color-mix()`, fades, and masks; pinstripes are background images on menus, dialogs, sheets, and the sidebar only. The sidebar's opaque sticky layers each paint the same 4px tile, phased to one grid, so seams never show while it scrolls. Media-variant tokens (`--header-height`, `--floating-menu-item-height`) and sidebar geometry tokens are never redefined. Aqua builds on the light branch: `dark:` utilities are inert and `not-dark:` utilities stay active. The default tooltip is a forced `.dark` island, so its tokens are re-declared on the tooltip itself.
- **Hook contract.** Skins key on stable attributes, never on utility classes. Button renders `data-button`, `data-variant` and `data-size`, placed before `{...props}` so callers can override. Button skins key on `data-button` because a Base UI trigger rendering a Button replaces its `data-slot` (`tooltip-trigger`, `dropdown-menu-trigger`). AlertDialog's Action and Cancel render Base UI Close directly, so they emit the same Button attributes themselves. Toggle renders `data-variant`, like ToggleGroup items. A few elements gain a `data-slot` or `data-*`: tooltip arrow, progress track, radio dot, code block parts, toast, activity panel header, composer menu row (`data-composer-menu-row`), message action button (`data-message-action`), the settings dialog (`data-settings-dialog`), and `data-intent="send" | "stop"` on the composer submit. Open state is `aria-expanded="true"`, never `data-popup-open`: a tooltip trigger sets `data-popup-open` on its button while the tooltip shows. The app sidebar's opaque layers carry `data-sidebar-layer` (`expanded`, `header`, `actions`, `actions-mask`, `signed-out-menu`, `footer`) so the stripe phase can be set per layer. The `has-data-[size]` utilities on ItemGroup and AvatarGroupCount are narrowed to their own slot so the new Button `data-size` cannot match them; they render identically. All other TSX changes are attribute-only.
- **Paint only.** Skin rules set background layers, border color and style, radius, box-shadow, color, fill, stroke, opacity, outline, font family, font weight (400 or 700, the only Lucida Grande weights), text shadow, and custom properties. They never change size, spacing, display, position, transform, font size, transition, or animation. Listed exceptions: the thread scroller's always-on 15px scrollbar (`overflow-y: scroll`, its arrow buttons, and the thumb's transparent border inset), the hidden tooltip arrow and help-tag type size, and an instant menu open where the open motion is CSS-driven. Aqua adds no animation and no `backdrop-filter`.
- **Focus.** Keyboard rings and control halos are an opaque 2px `#3570d2`, which clears 3:1 on every Aqua gray and white, and turn white on the blue selection. Text fields keep the translucent Aqua glow, since their blue rim and caret also mark focus. The user bubble's collapse toggle keeps its own bubble-colored ring.
- **Color scheme.** `:root.aqua` declares `color-scheme: light`, since next-themes clears it for custom themes.
- **System fonts by name only.** Lucida Grande, Geneva, and Monaco are named in the font tokens, overridden on `:root.aqua body` where next/font declares its variables. No Apple fonts, bitmaps, or other Apple assets are embedded or downloaded; every material is a CSS gradient, and the scroll arrow triangles are self-authored inline SVG.
- **Scope guard.** One vitest reads every `app/aqua/*.css`, strips comments, and fails if any selector (including inside `@media`, `@supports`, and `@container`) is not scoped to `:root.aqua` or `.aqua`, or if any other at-rule appears (`@layer`, `@apply`, `@theme`, `@keyframes`, `@import`, ...).

## Alternatives

- **An `@layer aqua` cascade layer after utilities.** Rejected. Layered rules compete with utilities on layer order, lose to every unlayered rule in `globals.css`, and would need `!important` to win reliably. Layered `!important` inverts layer priority, so the escalation spreads and gets harder to reason about.
- **A Tailwind `aqua:` custom variant at call sites.** Rejected. Every surface would carry its own `aqua:` classes, which drift per call site and break the shared-primitive rule.
- **Tokens only (CSS custom properties or CSS-in-TS).** Rejected as the whole solution. Tokens carry colors, but gel, shine, and pinstripe materials are multi-layer backgrounds with inset rims that differ per state. Tokens still do most of the recoloring.

## Consequences

- An Aqua skin overrides all utility paint for the properties it sets, including state utilities (`hover:`, `active:`, `disabled:`, `data-[...]`, `aria-*`). Every skin restates its own hover, pressed, disabled, checked, open, invalid, and focus states.
- Call-site className overrides of paint (a one-off `bg-*` or `rounded-*` on a Button) lose under Aqua. A deliberate exception needs a hook, not a class.
- A new primitive, or a new variant on an existing one, needs an Aqua skin or it renders with remapped light tokens only. The scope guard catches leaks, not gaps.
- Under Aqua on fine pointers, the main thread scroller always shows a 15px gel scrollbar: split arrow buttons, a cupped track, and a capsule thumb that casts a shadow on the track. Short content shows the track and arrows with no thumb, like an Aqua window. The gutter was already reserved (`stable both-edges`), so nothing shifts and the thread stays centered. Print and the expanded composer keep their own overflow. It clips horizontal overflow, so only the vertical bar is skinned. Other scrollable surfaces keep thin scrollbars because a width change would re-wrap their content.
- Lucida Grande is wider than Geist, so truncation and composer measurement follow the real font. Off macOS the stack falls back to Lucida Sans Unicode, Geneva, or Verdana.
- Code highlighting stays Shiki github-light because `resolvedTheme` "aqua" is not "dark".
- The theme choice stays per device, like light and dark.

## References

- [willmeyers/aqua-ui](https://github.com/willmeyers/aqua-ui) (MIT): sampled color stops for gels, scrollbars, and list headers. Code only; its bundled Apple bitmaps and Lucida Grande woff2 are Apple assets and were not used.
- [michi-onl/aqua](https://github.com/michi-onl/aqua) (MIT): Base UI fork and the closest architecture match (data-attribute state, gel and stripe layers).
- [igorfelipeduca/aqua](https://github.com/igorfelipeduca/aqua) (MIT): the Radix upstream of michi-onl/aqua, same gel and stripe approach.
- [ryOS](https://github.com/ryokun6/ryos) (AGPL-3.0): technique reference only; no code copied.
