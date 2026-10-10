# ADR-0047: Typeable composer before hydration

**Status:** Accepted
**Date:** 2026-10-09

## Context

ADR-0032 made the server-rendered composer look final (saved model and
effort labels on first paint), but it could not take input. The editor is a
ProseMirror view created in a callback ref after hydration, and the only
server-rendered field was a `display: none` fallback textarea. On a cold load
users saw a composer they could not type into until the client bundle had
downloaded, parsed and hydrated; keys pressed before that were lost.

Anthropic's claude.ai performance sprint shipped the same idea as a "static
composer": an HTML copy users can type into during React initialization,
with the text kept when the real composer takes over (input at 0.36 s
instead of 2.93 s on throttled 4G). Their guardrails: the static markup
matches the React render within 1 px across viewports, a keystroke test types
straight through the handoff and fails on any lost or reordered key, and
field reports flag any handoff shift.

Options:

1. **Keep the hidden fallback (status quo).** Zero risk, no win.
2. **Make the existing fallback textarea the pre-hydration field and hand
   off to the editor at mount.** The textarea is already in the server HTML,
   in the editor's slot, and already shares the editor's metrics
   (`app/globals.css`, "Unified composer editor metrics").
3. **A separately generated static composer** (Anthropic renders the real
   component in jsdom and inlines the markup before the app). Needs its own
   build step, a drift test, and an inline script to own the field; our
   composer is already server-rendered by Next, so the markup exists.

## Decision

Option 2, in `components/ui/prompt-input.tsx`.

- **Server field.** The fallback textarea renders visible, enabled, with the
  editor's placeholder and the editor's class list (`EDITOR_CLASS_NAME`), so
  both lay out from the same rules. It carries `autofocus` only in the server
  HTML (`autoFocus` is gated on the server/hydration render), matching the
  editor's existing mount focus; client-only mounts (edit-message composers,
  client navigations) never focus it.
- **Hiding.** The editor's mount callback sets the `hidden` attribute on the
  textarea in the commit, before paint. React never manages that attribute,
  so there is no server/client attribute mismatch, and client-only mounts
  never show the field.
- **Adoption at mount.** The textarea mirrors the editor after mount, so at
  mount it differs from the rendered value only by pre-hydration input. The
  editor document is built from the textarea's value; if the textarea had
  focus, the editor takes focus first (which commits an in-progress IME
  composition into the textarea), then re-reads the value and maps the
  textarea's `selectionStart`/`selectionEnd` onto the document. The adopted
  text goes through the normal `setValue` path; the same commit's external
  sync skips overwriting it, since the controlled value catches up on the
  next commit. A Strict Mode remount reads the mirrored text and reapplies
  the saved caret.
- **Layout hold.** The fallback cannot run the JS expansion measurement, so
  wrapped or multi-line pre-hydration text is painted in the compact layout.
  Adopted text keeps that layout until the value changes: the editor skips
  the expansion latch for exactly the adopted value, so the handoff moves
  nothing and the first edit after it expands the composer with input, as
  normal typing does.
- **No native submit.** The composer form uses `method="dialog"`. Outside a
  `<dialog>` that makes native submission a no-op, so clicking Send (an
  `aria-disabled`, not natively disabled, submit button) before hydration
  neither navigates nor serializes the typed prompt into the URL. After
  hydration the `submit` event still fires first and React's handler owns it.

### Precedence

- Text typed before hydration wins over a stored draft and becomes the
  draft: `setValue` marks a local override (`useComposerDraftDisplay`), so
  the draft store's post-hydration snapshot is not adopted, and the debounced
  draft write persists the typed text.
- With nothing typed, nothing is adopted and the stored draft loads as
  before (after hydration, as before).
- Enter before hydration inserts a newline (a textarea has no implicit
  submit) and the newline is kept as a second paragraph. Send before
  hydration does nothing (see "No native submit"). Paste before hydration
  is a plain-text paste; the large-paste-to-attachment handling starts after
  hydration.
- The server render's value must stay empty: React's textarea hydration
  writes a non-empty server default back over typed text. Drafts are client
  state, so the server value is always `""` today.

### Guardrails

- `benchmarks/chat-performance/browser/composer-handoff.ts` (guest, no
  password) holds every `/_next/*.js` request so the page cannot hydrate,
  then runs three cases at 375, 768, 1280 and 1920 px:
  - _through_: types at a fixed cadence, releases hydration mid-sequence and
    keeps typing past the handoff; fails on any lost or reordered key, a
    draft that does not hold the typed text, or an editor box more than 1 px
    from the fallback box at the handoff.
  - _quiet-line_ and _quiet-wrapped_: types one line, or until the fallback
    wraps, clicks Send (fails on navigation), stops, then releases; fails
    when the editor or the composer surface moves more than 1 px at the
    handoff or once settled, or on any composer layout shift from release to
    settle. No input happens in that window, so `hadRecentInput` cannot hide
    a shift.
- The same script reports time to typeable against editor-editable (the
  pre-ADR typeable point). With the layout hold or `method="dialog"`
  removed, the quiet cases fail (229 px field move at 1280 px; navigation
  to `/?prompt-textarea=...`).
- `components/ui/prompt-input.test.tsx` hydrates real server HTML with text
  typed into the fallback and asserts adoption, hiding, focus, the form's
  `method="dialog"` and the layout hold until the next edit.

## Consequences

- Dev server, 1280 px, guest: time to typeable about 100 ms median vs
  about 455 ms for editor-editable. All three handoff cases pass at all four
  widths: 0 px field and surface movement and zero composer layout shift,
  including wrapped pre-hydration text. Production numbers are measured
  separately.
- Pre-hydration typing cannot expand the composer (expansion is
  JS-measured), so wrapped text stays compact through the handoff and
  expands on the first edit after it. Until that edit the Expand control is
  not offered for adopted text.
- Writing the guardrail exposed a measurement mismatch: the expansion
  measurement treated the editor as sharing a row with its actions whenever
  the viewport was at least 640 px, while the grid also stacks in a `/main`
  container under 520 px. It now mirrors both breakpoints, so a mid-width
  window no longer expands a single-line draft.
- On iOS the keyboard may close at the handoff if programmatic focus cannot
  move it; not verified on a device.
- Not adopted: Anthropic's separate jsdom-rendered markup and its 14-viewport
  pixel suite. Our field is the server render of the same component, so
  drift is limited to the textarea/editor metric pair, which the box check
  covers.
