# ChatGPT Conversation Page — HTML Structure Reference

Extracted from a live authenticated ChatGPT conversation page.
URL pattern: `chatgpt.com/c/{conversation-id}`

> **Extracted:** 2026-02-21 via Chrome DevTools HTML copies
> **Page title in captures:** "Video Editing System Premiere Pro"
> **Model label in header:** `ChatGPT 5.2` / `ChatGPT 5.2 Thinking` (varies by capture)
> **Viewports covered:** desktop `1609px` and mobile `390px`
> **Modes covered:** light + dark

---

## Page Skeleton (body-level)

```
<body class="">
├── <span.hidden [testid="blocking-initial-modals-done"]>
├── <div.fixed.inset-x-0.top-0.z-50.mt-4...>         # skip link wrapper
│   └── <a [data-skip-to-content] [href="#main"]>
│
├── <div.flex.h-svh.w-screen.flex-col>               # app root
│   ├── <div.relative.z-0.flex.min-h-0.w-full.flex-1>
│   │   └── <div.relative.flex.min-h-0.w-full.flex-1>
│   │       ├── #stage-slideover-sidebar              # desktop only
│   │       └── <div.@container/main...>             # main column
│   └── <div>                                        # empty sibling (portal mount)
│
├── <div#live-region-assertive.sr-only [aria-live="assertive"]>
├── <div#live-region-polite.sr-only [aria-live="polite"]>
├── <div#aria-notify-live-region-assertive.sr-only [aria-live="assertive"]>
├── <div#aria-notify-live-region-polite.sr-only [aria-live="polite"]>
└── <audio.fixed.start-0.bottom-0.hidden.h-0.w-0>
```

---

## Sidebar

### Desktop sidebar (`#stage-slideover-sidebar`)

```
class="border-token-border-light relative z-21 h-full shrink-0 overflow-hidden border-e max-md:hidden print:hidden"
```

```
#stage-slideover-sidebar
├── #stage-sidebar-tiny-bar                          # collapsed rail
│   ├── <button [aria-label="Open sidebar"] [aria-controls="stage-slideover-sidebar"] [aria-expanded="false"]>
│   ├── <a [testid="create-new-chat-button"] [data-sidebar-item="true"]>
│   ├── <a [testid="sidebar-item-library"] [data-sidebar-item="true"]>
│   └── <div [testid="accounts-profile-button"] [role="button"] [aria-label="Open profile menu"] [aria-haspopup="menu"]>
│
└── <nav [aria-label="Chat history"] class="group/scrollport ...">
    ├── #sidebar-header
    │   ├── <a [aria-label="Home"] [data-sidebar-item="true"]>
    │   └── <button [testid="close-sidebar-button"] [aria-label="Close sidebar"] [aria-controls="stage-slideover-sidebar"] [aria-expanded="true"]>
    ├── <aside>                                      # quick actions
    │   ├── <a [testid="create-new-chat-button"]>
    │   ├── <div [data-sidebar-item="true"]>         # Search chats row
    │   └── <a [testid="sidebar-item-library"]>
    ├── <a [testid="apps-button"]>
    ├── <a [testid="deep-research-sidebar-item"]>
    ├── <div.group/sidebar-expando-section>          # GPTs / Projects / Group chats / Your chats
    ├── <div#history>                                # history list (many anchors)
    │   └── <button [testid="history-item-*-options"] [aria-label="Open conversation options"]>
    └── <div [testid="accounts-profile-button"] [role="button"] [aria-label="Open profile menu"]>
```

### Mobile sidebar variant (390px captures)

```
#page-header
└── <button [testid="open-sidebar-button"]
            [aria-controls="stage-popover-sidebar"]
            [aria-expanded="false"]>
```

- In both mobile captures, no element with `id="stage-popover-sidebar"` exists in the static HTML snapshot.
- The trigger indicates a popover/sidebar that mounts dynamically when opened.

---

## Main Content Area

```
<div class="@container/main relative flex min-w-0 flex-1 flex-col -translate-y-[calc(env(safe-area-inset-bottom,0px)/2)] pt-[calc(env(safe-area-inset-bottom,0px)/2)]">
└── <div [data-scroll-root] class="@w-sm/main:[scrollbar-gutter:stable_both-edges] touch:[scrollbar-width:none] relative flex min-h-0 min-w-0 flex-1 flex-col [scrollbar-gutter:stable] not-print:overflow-x-clip not-print:overflow-y-auto scroll-pt-(--header-height) [--sticky-padding-top:var(--header-height)] ...">
    ├── #page-header
    └── <main#main class="min-h-0 flex-1">
        └── #thread
```

---

## Header (`#page-header`)

```
class="draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-token-main-surface-primary pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto transition-none motion-safe:transition-none data-[fixed-header=less-than-xxl]:@w-2xl/main:bg-transparent data-[fixed-header=less-than-xxl]:@w-2xl/main:shadow-none! data-[fixed-header=less-than-xl]:@w-xl/main:bg-transparent data-[fixed-header=less-than-xl]:@w-xl/main:shadow-none! [box-shadow:var(--sharp-edge-top-shadow)]"
```

Dark mobile capture variant:

```
[box-shadow:var(--sharp-edge-top-shadow-placeholder)]
```

```
#page-header [data-fixed-header="less-than-xl"]
├── <div.pointer-events-none.absolute...>           # left absolute anchor
├── <div.pointer-events-none!.flex.flex-1...>       # model area
│   ├── mobile: <button [testid="open-sidebar-button"] [aria-controls="stage-popover-sidebar"]>
│   └── <button [testid="model-switcher-dropdown-button"] [aria-label="Model selector, current model is ..."] [aria-haspopup="menu"] [aria-expanded="false"] [data-state="closed"]>
└── <div#conversation-header-actions>
    ├── mobile: <a [aria-label="New chat"]>         # appears in mobile captures
    ├── <button [testid="share-chat-button"]>
    │   ├── desktop: wide button (`btn btn-ghost ...`) label "Share"
    │   └── mobile: icon button (`text-token-text-primary ...`)
    └── <button [testid="conversation-options-button"] [aria-label="Open conversation options"]>
```

---

## Thread (`#thread`)

```
class="group/thread flex flex-col min-h-full"
```

```
#thread
└── <div [role="presentation"] class="composer-parent flex flex-1 flex-col focus-visible:outline-0">
    ├── <div class="relative basis-auto flex-col -mb-(--composer-overlap-px) [--composer-overlap-px:28px] grow flex">
    │   ├── <div [data-edge="true"] [aria-hidden="true"]>
    │   └── <div class="flex flex-col text-sm pb-25">
    │       ├── <article [testid="conversation-turn-1"] [data-turn="user"] [data-turn-id] [data-scroll-anchor="false"]>
    │       └── <article [testid="conversation-turn-2"] [data-turn="assistant"] [data-turn-id] [data-scroll-anchor="true"]>
    ├── #thread-bottom-container
    └── disclaimer block
```

---

## Conversation Turn — User

Article class (shared pattern for turns):

```
class="text-token-text-primary w-full focus:outline-none [--shadow-height:45px] has-data-writing-block:pointer-events-none has-data-writing-block:-mt-(--shadow-height) has-data-writing-block:pt-(--shadow-height) [&:has([data-writing-block])>*]:pointer-events-auto scroll-mt-(--header-height)"
```

```
<article [testid="conversation-turn-1"] [data-turn="user"]>
├── <h5.sr-only>                                  # "You said:"
├── <div class="text-base my-auto mx-auto pt-3 ...">
│   └── <div class="[--thread-content-max-width:40rem] ... group/turn-messages ...">
│       ├── <div [data-message-author-role="user"] [data-message-id] class="min-h-8 text-message relative flex w-full flex-col items-end gap-2 text-start break-words whitespace-normal [.text-message+&]:mt-1">
│       │   └── <div class="flex w-full flex-col gap-1 empty:hidden items-end rtl:items-start">
│       │       └── <div [data-multiline] class="user-message-bubble-color corner-superellipse/1.1 relative rounded-[18px] px-4 py-1.5 data-[multiline]:py-3 max-w-[var(--user-chat-width,70%)]">
│       │           └── <div.whitespace-pre-wrap> [message text]
│       └── action row
│           ├── <button [testid="copy-turn-action-button"] [aria-label="Copy"] [aria-pressed="false"]>
│           └── <button [aria-label="Edit message"] [aria-pressed="false"]>
└── <span.sr-only><br></span>
```

---

## Conversation Turn — Assistant

Second-turn article differs by `scroll-mt` class:

```
scroll-mt-[calc(var(--header-height)+min(200px,max(70px,20svh)))]
```

```
<article [testid="conversation-turn-2"] [data-turn="assistant"]>
├── <h6.sr-only>                                  # "ChatGPT said:"
├── <div class="text-base my-auto mx-auto pb-10 ...">
│   └── <div class="[--thread-content-max-width:40rem] ... agent-turn">
│       ├── reasoning summary block               # "Thought for ..." row
│       ├── <div [data-message-author-role="assistant"] [data-message-id] [data-message-model-slug="gpt-5-2-thinking"] ...>
│       │   └── <div.markdown ...>
│       │       └── <div class="markdown prose dark:prose-invert w-full wrap-break-word light|dark markdown-new-styling">
│       │           ├── <p>, <h2>, <h3>, <ul>, <li>, <pre>, ...
│       │           └── inline citation pills (see below)
│       └── assistant action row
│           ├── <button [testid="copy-turn-action-button"] [aria-label="Copy"]>
│           ├── <button [testid="good-response-turn-action-button"] [aria-label="Good response"]>
│           ├── <button [testid="bad-response-turn-action-button"] [aria-label="Bad response"]>
│           ├── <button [aria-label="Share"]>
│           ├── <button [aria-label="Switch model"] [aria-haspopup="menu"] [aria-expanded="false"] [data-state="closed"]>
│           ├── <button [aria-label="More actions"] [aria-haspopup="menu"] [aria-expanded="false"] [data-state="closed"]>
│           └── <button [aria-label="Sources"] class="group/footnote bg-token-bg-primary ... rounded-3xl">
└── <span.sr-only><br></span>
```

Action button class pattern:

```
class="text-token-text-secondary hover:bg-token-bg-secondary rounded-lg"
```

---

## Search Results Carousel

`data-testid="nav-list-widget"` does **not** appear in these four captures.

- This capture set contains long-form markdown + citation pills, not the earlier news-card widget.
- Keep widget documentation in a separate variant doc if needed.

---

## Inline Citation Badge

Observed inline source pills inside markdown body:

```
<span [data-state="closed"]>
└── <span [testid="webpage-citation-pill"] class="ms-1 inline-flex max-w-full items-center select-none relative top-[-0.094rem] animate-[show_150ms_ease-in]">
    └── <a class="flex h-4.5 overflow-hidden rounded-xl px-2 text-[9px] font-medium transition-colors duration-150 ease-in-out text-token-text-secondary! bg-[#F4F4F4]! dark:bg-[#303030]!">
```

---

## Composer (`#thread-bottom-container`)

Container class:

```
class="sticky bottom-0 group/thread-bottom-container relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 has-data-has-thread-error:[box-shadow:var(--sharp-edge-bottom-shadow)] md:border-transparent md:pt-0 dark:border-white/20 md:dark:border-transparent print:hidden content-fade single-line flex flex-col"
```

```
#thread-bottom-container
├── <div.relative.h-0>                           # top floating button wrapper
├── #thread-bottom
│   └── <form class="group/composer w-full" [data-type="unified-composer"] [data-expanded?]>
│       ├── hidden file input (internal)
│       └── <div [data-composer-surface="true"] class="bg-token-bg-primary corner-superellipse/1.1 cursor-text overflow-clip bg-clip-padding p-2.5 contain-inline-size motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-in-out dark:bg-[#303030] grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'leading_primary_trailing'_'._footer_.'] group-data-expanded/composer:[grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] shadow-short">
│           ├── [grid-area:primary]
│           │   ├── <textarea name="prompt-textarea" placeholder="Ask anything" style="display:none">
│           │   └── <div#prompt-textarea.ProseMirror [contenteditable="true"] [data-virtualkeyboard="true"]>
│           ├── [grid-area:leading]
│           │   └── <button#composer-plus-btn.composer-btn [testid="composer-plus-btn"] [aria-label="Add files and more"] [aria-haspopup="menu"] [aria-expanded="false"] [data-state="closed"]>
│           ├── [grid-area:footer] (optional in some captures)
│           │   └── <div [testid="composer-footer-actions"] ...>
│           └── [grid-area:trailing]
│               ├── <button.composer-btn [aria-label="Dictate button"]>
│               └── <button#composer-submit-button.composer-submit-btn [testid="send-button"] [aria-label="Send prompt"]>
├── <input#upload-photos [type="file"] [accept="image/*"] [multiple]>
├── <input#upload-camera [type="file"] [accept="image/*"] [capture="environment"] [multiple]>
└── disclaimer text wrapper
```

---

## Key Data Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-testid` | Automation hooks across shell/header/thread/composer | `"blocking-initial-modals-done"`, `"model-switcher-dropdown-button"`, `"conversation-turn-1"`, `"send-button"` |
| `data-skip-to-content` | Skip-link marker | present on top skip anchor |
| `data-scroll-root` | Main scroll host marker | present on main scrolling container |
| `data-fixed-header` | Header mode marker | `"less-than-xl"` |
| `data-edge` | Edge sentinels for sticky/scroll effects | `"true"` |
| `data-turn` | Turn role | `"user"`, `"assistant"` |
| `data-turn-id` | Turn UUID | `"...uuid..."` |
| `data-scroll-anchor` | Scroll anchor hint | `"true"` / `"false"` |
| `data-message-author-role` | Message role | `"user"`, `"assistant"` |
| `data-message-id` | Message UUID | `"...uuid..."` |
| `data-message-model-slug` | Assistant model marker | `"gpt-5-2-thinking"` |
| `data-multiline` | User bubble multiline state | presence-based |
| `data-composer-surface` | Composer surface marker | `"true"` |
| `data-type` | Composer type | `"unified-composer"` |
| `data-state` | Menu/tooltip/popover state | `"closed"` |
| `data-sidebar-item` | Sidebar item marker | `"true"` |
| `data-fill` / `data-size` | Sidebar item variant attrs | `""`, `"large"` |

Common `data-testid` values observed:

`open-sidebar-button`, `close-sidebar-button`, `create-new-chat-button`, `sidebar-item-library`, `apps-button`, `deep-research-sidebar-item`, `accounts-profile-button`, `model-switcher-dropdown-button`, `share-chat-button`, `conversation-options-button`, `conversation-turn-1`, `conversation-turn-2`, `copy-turn-action-button`, `good-response-turn-action-button`, `bad-response-turn-action-button`, `webpage-citation-pill`, `composer-plus-btn`, `composer-footer-actions`, `send-button`, plus repeated `history-item-*-options` pattern.

---

## Key CSS Token Classes

| Class | Purpose |
|-------|---------|
| `text-token-text-primary` | Primary foreground text |
| `text-token-text-secondary` | Secondary/muted text |
| `text-token-text-tertiary` | Tertiary label/icon text |
| `bg-token-main-surface-primary` | Header and floating-surface background |
| `bg-token-bg-primary` | Base panel / card background |
| `bg-token-bg-elevated-secondary` | Sidebar elevated background |
| `border-token-border-light` | Light border tone |
| `border-token-border-default` | Default border tone |
| `user-message-bubble-color` | User bubble fill token |
| `corner-superellipse/1.1` | Rounded superellipse utility |
| `shadow-short` | Composer surface shadow |
| `composer-btn` | Composer action button base |
| `composer-submit-btn` | Composer submit button styling |
| `markdown-new-styling` | New markdown renderer mode |
| `prose` / `dark:prose-invert` | Rich text typography container |

---

## Key IDs

| ID | Element | Purpose |
|----|---------|---------|
| `#page-header` | `<header>` | Sticky conversation header |
| `#conversation-header-actions` | `<div>` | Header right-side actions |
| `#main` | `<main>` | Main landmark target for skip link |
| `#thread` | `<div>` | Conversation thread root |
| `#thread-bottom-container` | `<div>` | Sticky composer/disclaimer wrapper |
| `#thread-bottom` | `<div>` | Composer inner width container |
| `#prompt-textarea` | `<div>` | ProseMirror editable input |
| `#composer-plus-btn` | `<button>` | Add files/more trigger |
| `#composer-submit-button` | `<button>` | Send button |
| `#upload-photos` | `<input type="file">` | Hidden photo upload |
| `#upload-camera` | `<input type="file">` | Hidden camera capture upload |
| `#stage-slideover-sidebar` | `<div>` | Desktop sidebar shell |
| `#stage-sidebar-tiny-bar` | `<div>` | Desktop collapsed rail |
| `#sidebar-header` | `<div>` | Desktop sidebar top bar |
| `#history` | `<div>` | Chat history list container |
| `#live-region-assertive` | `<div>` | A11y live region |
| `#live-region-polite` | `<div>` | A11y live region |
| `#aria-notify-live-region-assertive` | `<div>` | A11y notify region |
| `#aria-notify-live-region-polite` | `<div>` | A11y notify region |

---

## Desktop vs Mobile / Light vs Dark Notes

- Desktop-only DOM: `#stage-slideover-sidebar` exists with full nav/history structure.
- Mobile captures: no sidebar DOM node mounted; header exposes `open-sidebar-button` controlling `stage-popover-sidebar`.
- Header share control changes shape: desktop wide text button vs mobile compact icon button.
- Markdown mode class differs by theme: `... light markdown-new-styling` in light captures, `... dark markdown-new-styling` in dark captures.
- Header shadow token differs in one dark mobile capture (`--sharp-edge-top-shadow-placeholder`).
- Core thread/message/composer nesting is otherwise consistent across all four captures.
