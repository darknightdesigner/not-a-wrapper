# ChatGPT Conversation Page — HTML Structure Reference

Extracted from a live ChatGPT conversation page (authenticated, dark mode).
URL pattern: `chatgpt.com/c/{conversation-id}`

> **Extracted:** 2026-02-20 via Chrome DevTools (Claude in Chrome)
> **Page title:** "Latest News Inquiry"
> **Model:** ChatGPT 5.2

---

## Page Skeleton

```
<body>
├── <script> ×6                              # bootstrap + hydration
├── <span.hidden [data-testid="blocking-initial-modals-done"]>
├── <div.fixed.inset-x-0.top-0.z-50>        # skip-to-content link (sr-only)
│   └── <a> "Skip to main content"
│
├── <div.flex.h-svh.w-screen.flex-col>       # ★ APP ROOT
│   ├── <div.relative.z-0.flex.min-h-0.w-full.flex-1>
│   │   └── <div.relative.flex.min-h-0.w-full.flex-1>
│   │       ├── #stage-slideover-sidebar     # SIDEBAR
│   │       └── <div.@container/main>        # MAIN CONTENT AREA
│   └── <div>                                # empty (portal mount?)
│
├── <div#live-region-assertive.sr-only>       # a11y live regions
├── <div#live-region-polite.sr-only>
├── <div#aria-notify-live-region-assertive.sr-only>
├── <div#aria-notify-live-region-polite.sr-only>
├── <audio.fixed.hidden>                      # audio element (voice?)
├── <iframe>                                  # analytics/tracking
└── <script#pioneer-script-*>                 # telemetry
```

---

## Sidebar (`#stage-slideover-sidebar`)

```
class="border-token-border-light relative z-21 h-full shrink-0
       overflow-hidden border-e max-md:hidden print:hidden"
```

```
#stage-slideover-sidebar
└── <div>
    ├── #stage-sidebar-tiny-bar               # collapsed sidebar rail
    │   ├── <div>
    │   │   └── <span>
    │   │       └── <button [aria="Open sidebar"]>
    │   ├── <div>                              # new chat button area
    │   │   └── <div>
    │   │       └── <a [testid="create-new-chat-button"] [href="/"]>
    │   ├── <div>                              # search
    │   ├── <div>                              # spacer
    │   ├── <a [testid="sidebar-item-library"] [href="/images"]>
    │   └── <div>
    │       └── <div [testid="accounts-profile-button"] [role="button"]
    │             [aria="Open profile menu"]>
    │
    └── <nav [aria-label="Chat history"]>      # expanded sidebar
        ├── <div>
        │   └── <div>
        │       └── #sidebar-header
        │           ├── <a [aria="Home"] [href]>   # logo
        │           └── <div>                       # header actions
        │
        ├── <div> (spacer)
        ├── <div> (spacer)
        │
        ├── <aside>                             # new chat + search + images
        │   ├── <a [testid="create-new-chat-button"] [href="/"]>
        │   │   ├── <div> (icon)
        │   │   └── <div> (text + shortcut)
        │   ├── <div> (search chats)
        │   └── <a [testid="sidebar-item-library"]>
        │       └── <div> "Images"
        │
        ├── <div>                               # apps section
        │   ├── <a [testid="apps-button"]> "Apps"
        │   ├── <a [testid="deep-research-sidebar-item"]> "Deep research"
        │   └── <a> "Codex"
        │
        ├── <div>                               # GPTs section
        │   └── <button>
        │       └── <h2> "GPTs"
        │
        ├── <div>                               # Projects section
        │   ├── <button>
        │   │   └── <h2> "Projects"
        │   ├── <div> "New project"
        │   └── <a> ×5 (project links: Easyprompt, Macro, etc.)
        │
        ├── <div>                               # Group chats
        │   └── <button>
        │       └── <h2> "Group chats"
        │
        ├── <div>                               # ★ Your chats (history)
        │   ├── <button>
        │   │   └── <h2> "Your chats"
        │   └── <div#history>
        │       └── <a> ×28 (chat history items)
        │           ├── <div> (icon)
        │           └── <div> (title text)
        │
        └── <div>                               # profile button (bottom)
            └── <div [testid="accounts-profile-button"]
                  [role="button"] [aria="Open profile menu"]>
```

---

## Main Content Area (`@container/main`)

```
class="@w-sm/main:[scrollbar-gutter:stable_both-edges]
       touch:[scrollbar-width:none] relative flex min-h-0 min-w-0
       flex-1 flex-col [scrollbar-gutter:stable]
       not-print:overflow-x-clip not-print:overflow-y-auto"
```

```
<div.@container/main>
└── <div>                                      # scroll wrapper
    ├── <header#page-header>                   # sticky header
    ├── <main#main>
    │   └── <div#thread>                       # ★ conversation thread
    └── (overflow hidden)
```

---

## Header (`#page-header`)

```
class="draggable no-draggable-children sticky top-0 p-2 touch:p-2.5
       flex items-center justify-between z-20 h-header-height
       bg-token-main-surface-primary pointer-events-none select-none
       [view-transition-name:...]"
```

```
#page-header
├── <div>                                      # left section (empty/hamburger)
├── <div>                                      # center — model switcher
│   ├── <button [testid="model-switcher-dropdown-button"]
│   │    [aria="Model selector, current model"]>
│   │   └── <div>
│   │       └── <span> "5.2"
│   └── <div>                                  # dropdown portal
└── <div>                                      # right section — actions
    ├── <div> (spacer)
    └── <div#conversation-header-actions>
        ├── <button [testid="share-chat-button"] [aria="Share"]>
        └── <div>
            └── <div [type="button"]>          # overflow menu (•••)
```

---

## Thread (`#thread`)

```
class="group/thread flex flex-col min-h-full"
```

```
#thread
└── <div [role="presentation"]>                # scroll container
    │   class="composer-parent flex flex-1 flex-col focus-visible:outline-0"
    │
    ├── <div>                                  # top padding
    ├── <div>                                  # messages container
    │   │   class="flex flex-col text-sm pb-25"
    │   │
    │   ├── <article [testid="conversation-turn-1"]>  # USER TURN
    │   └── <article [testid="conversation-turn-2"]>  # ASSISTANT TURN
    │
    └── <div>                                  # bottom padding

    #thread-bottom-container                   # ★ COMPOSER (sticky)
    ├── <div>                                  # gradient mask
    ├── #thread-bottom
    │   └── <div>
    │       └── (composer form)
    └── <div>                                  # disclaimer area
```

---

## Conversation Turn — User (`conversation-turn-1`)

```
class="text-token-text-primary w-full focus:outline-none
       [--shadow-height:45px]
       has-data-writing-block:pointer-events-none
       has-data-writing-block:-mt-(--shadow-height)
       has-data-writing-block:pt-(--shadow-height)
       [&:has([data-writing-block])>*]:pointer-events-auto
       scroll-mt-[calc(var(--header-height)+min(20...))]"
```

```
<article [data-testid="conversation-turn-1"]>
├── <h5> "You said:"                           # screen-reader heading
│
├── <div>                                      # message row
│   ├── <div>                                  # message content column
│   │   class="flex w-full flex-col gap-1 empty:hidden items-end rtl:items-start"
│   │
│   │   └── <div [data-message-id="0a7ac544..."] [data-message-author-role="user"]>
│   │       class="min-h-8 text-message relative flex w-full flex-col
│   │              items-end gap-2 text-start break-words whitespace-normal
│   │              [.text-message+&]:mt-1"
│   │       │
│   │       └── <div>
│   │           class="flex w-full flex-col gap-1 empty:hidden items-end rtl:items-start"
│   │           │
│   │           └── <div>                      # ★ USER BUBBLE
│   │               class="user-message-bubble-color corner-superellipse/1.1
│   │                      relative rounded-[18px] px-4 py-1.5
│   │                      data-[multiline]:py-3
│   │                      max-w-[var(--user-chat-width,70%)]"
│   │               │
│   │               └── <div.whitespace-pre-wrap>
│   │                   "What's the latest news today?"
│   │
│   └── <div>                                  # action buttons
│       └── <div>
│           ├── <button [testid="copy-turn-action-button"] [aria="Copy"]>
│           └── <button [aria="Edit message"]>
│
└── <span><br></span>                          # turn separator
```

---

## Conversation Turn — Assistant (`conversation-turn-2`)

```
(same class pattern as user turn)
```

```
<article [data-testid="conversation-turn-2"]>
├── <h6> "ChatGPT said:"                       # screen-reader heading
│
├── <div>                                      # message row
│   ├── <div>                                  # message content column
│   │   └── <div [data-message-id="affbb79a..."] [data-message-author-role="assistant"]>
│   │       class="min-h-8 text-message relative flex w-full flex-col
│   │              items-end gap-2 text-start break-words whitespace-normal
│   │              [.text-message+&]:mt-1"
│   │       │
│   │       └── <div>
│   │           class="flex w-full flex-col gap-1 empty:hidden first:pt-[1px]"
│   │           │
│   │           └── <div.markdown>             # ★ MARKDOWN BODY
│   │               class="markdown prose dark:prose-invert w-full
│   │                      wrap-break-word dark markdown-new-styling"
│   │               │
│   │               ├── <p>                    # intro text
│   │               │   └── <strong> "top news highlights..."
│   │               │
│   │               ├── <div [testid="nav-list-widget"]>  # ★ SEARCH RESULTS CAROUSEL
│   │               │   (see below)
│   │               │
│   │               ├── <p><strong> "World & Politics"</strong></p>
│   │               ├── <ul>                   # bulleted content
│   │               │   └── <li> ×3
│   │               │       └── <p>
│   │               │           ├── (text + <em>)
│   │               │           └── <span [data-state="closed"]>  # ★ INLINE CITATION
│   │               │               └── <span> "Reuters"
│   │               │
│   │               ├── <p><strong> "Human & Global Interest"</strong></p>
│   │               ├── <ul> (more items...)
│   │               │
│   │               ├── <p><strong> "National & Business..."</strong></p>
│   │               ├── <ul> (more items...)
│   │               │
│   │               └── <p><em> "If there's a specific topic..."</em></p>
│   │
│   └── <div>                                  # ★ ACTION BUTTONS BAR
│       class="text-base my-auto mx-auto pb-10
│              [--thread-content-margin:--spacing(4)]
│              @w-sm/main:[--thread-content-margin:--spacing(6)]
│              @w-lg/main:[--thread-content-margin:--spacing(8)]"
│       │
│       └── <div>
│           ├── <button [testid="copy-turn-action-button"] [aria="Copy"]>
│           ├── <button [testid="good-response-turn-action-button"] [aria="Good response"]>
│           ├── <button [testid="bad-response-turn-action-button"] [aria="Bad response"]>
│           ├── <button [aria="Share"]>
│           ├── <span>                         # separator
│           ├── <button [aria="Switch model"]>
│           ├── <button [aria="More actions"]>
│           └── <button [aria="Sources"]>
│
│   Button class pattern:
│   "text-token-text-secondary hover:bg-token-bg-secondary rounded-lg"
│
└── <span><br></span>                          # turn separator
```

---

## Search Results Carousel (`nav-list-widget`)

```
<div [data-testid="nav-list-widget"]>
├── <div> "Latest News Headlines Today"        # section title
│
├── <div>                                      # carousel track
│   └── <div>                                  # scroll container
│       └── <div> ×4+                          # ★ RESULT CARDS
│           class="shrink-0 snap-start basis-[calc((100%-2rem)/3)]"
│           │
│           └── <div>
│               class="h-full w-full bg-token-bg-primary cursor-pointer
│                      transition-all duration-200
│                      border-token-border-default"
│               │
│               └── <a>
│                   class="flex flex-col items-center gap-4
│                          overflow-hidden pb-6"
│                   │
│                   ├── <div>                  # thumbnail image
│                   │   class="relative h-36 w-full overflow-hidden"
│                   │   └── <picture> → <img>
│                   │
│                   └── <div>                  # card text content
│                       class="flex flex-col gap-2 overflow-hidden"
│                       │
│                       ├── <div>              # source favicon + name
│                       │   class="text-token-text-primary flex items-center gap-1.5"
│                       │   └── <div> (favicon) + text
│                       │
│                       ├── <div>              # headline
│                       │   class="text-token-text-primary
│                       │          decoration-token-link
│                       │          line-clamp-5 text-sm"
│                       │
│                       └── <div>              # date
│                           class="text-token-text-secondary text-xs"
│                           "Today"
│
└── <div>                                      # carousel nav buttons
    ├── <div>
    │   └── <button> (left arrow)
    └── <div>
        └── <button> (right arrow)
```

---

## Inline Citation Badge

Inline citations appear as hoverable spans within markdown `<p>` or `<li>` elements:

```
<span [data-state="closed"]>                   # tooltip trigger (Radix)
└── <span> "Reuters"                           # visible badge text

# When multiple sources:
<span [data-state="closed"]>
└── <span> "Fox News+1"                        # badge with count
```

---

## Composer (`#thread-bottom-container`)

```
class="sticky bottom-0 group/thread-bottom-container relative isolate
       z-10 w-full basis-auto
       has-data-has-thread-error:pt-2
       has-data-has-thread-error:[box-shadow:var(--sharp-edge-bottom-shadow)]
       md:border-transparent"
```

```
#thread-bottom-container
├── <div>                                      # gradient fade mask
│
├── #thread-bottom
│   └── <div>
│       └── <div>
│           ├── <div>                          # focus trap / wrapper
│           │
│           ├── <div>
│           │   └── <form.group/composer.w-full>
│           │       │
│           │       ├── <div>                  # hidden file input
│           │       │   └── <input [type="file"]>
│           │       │
│           │       └── <div>
│           │           └── <div [data-composer-surface="true"]>  # ★ COMPOSER SURFACE
│           │               class="bg-token-bg-primary corner-superellipse/1.1
│           │                      cursor-text overflow-clip bg-clip-padding
│           │                      p-2.5 contain-inline-size
│           │                      motion-safe:transition-colors
│           │                      motion-safe:duration-200
│           │                      motion-safe:ease-in-out
│           │                      dark:bg-[#303030]
│           │                      grid grid-cols-[auto_1fr_auto]
│           │                      [grid-template-areas:
│           │                        'header_header_header'
│           │                        'leading_primary_trailing'
│           │                        '._footer_.']
│           │                      group-data-expanded/composer:
│           │                        [grid-template-areas:
│           │                          'header_header_header'
│           │                          'primary_primary_primary'
│           │                          'leading_footer_trailing']
│           │                      shadow-short"
│           │               │
│           │               ├── <div> [grid-area: primary]  # TEXT INPUT AREA
│           │               │   ├── <textarea [placeholder="Ask anything"]>
│           │               │   │   (hidden, for form submission)
│           │               │   └── <div#prompt-textarea [contenteditable="true"]>
│           │               │       class="ProseMirror"
│           │               │       └── <p>
│           │               │           └── <br>  (empty state)
│           │               │
│           │               ├── <div> [grid-area: leading]  # PLUS BUTTON
│           │               │   └── <span>
│           │               │       └── <button#composer-plus-btn
│           │               │             [testid="composer-plus-btn"]
│           │               │             [aria="Add files and more"]>
│           │               │
│           │               └── <div> [grid-area: trailing] # RIGHT ACTIONS
│           │                   └── <div>
│           │                       ├── <span>
│           │                       │   └── <button [aria="Dictate button"]>
│           │                       │       class="composer-btn"
│           │                       └── <div>  # Send button area
│           │                           └── <span>
│           │                               └── <div>  # send/stop button
│           │
│           ├── <input#upload-photos [type="file"]>   # hidden file inputs
│           └── <input#upload-camera [type="file"]>
│
└── <div>                                      # disclaimer
    └── <div>
        └── <div>
            class="-mt-4 text-token-text-secondary relative w-full
                   overflow-hidden text-center text-xs
                   [view-transition-name:var(--vt-disclaimer)]
                   md:px-[60px]"
            "ChatGPT is AI and can make mistakes. Check important info."
```

---

## Key Data Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-testid` | Test automation selectors | `"conversation-turn-1"`, `"send-button"` |
| `data-message-id` | Unique message UUID | `"0a7ac544-..."` |
| `data-message-author-role` | Message author | `"user"` or `"assistant"` |
| `data-composer-surface` | Composer surface marker | `"true"` |
| `data-state` | Radix UI state (tooltips, popovers) | `"closed"`, `"open"` |
| `data-writing-block` | Active writing/streaming indicator | (presence-based) |

## Key CSS Token Classes

| Class | Purpose |
|-------|---------|
| `text-token-text-primary` | Primary text color |
| `text-token-text-secondary` | Secondary/muted text |
| `bg-token-bg-primary` | Primary background |
| `bg-token-main-surface-primary` | Main surface background |
| `border-token-border-light` | Light border color |
| `border-token-border-default` | Default border color |
| `decoration-token-link` | Link decoration color |
| `user-message-bubble-color` | User message bubble background |
| `corner-superellipse/1.1` | CSS superellipse rounding |
| `shadow-short` | Composer surface shadow |
| `composer-btn` | Composer action button base |
| `markdown-new-styling` | New markdown rendering mode |

## Key IDs

| ID | Element | Purpose |
|----|---------|---------|
| `#thread` | `<div>` | Conversation thread container |
| `#thread-bottom-container` | `<div>` | Sticky composer wrapper |
| `#thread-bottom` | `<div>` | Composer inner container |
| `#prompt-textarea` | `<div>` | Editable input (ProseMirror, contenteditable) |
| `#page-header` | `<header>` | Sticky top header |
| `#main` | `<main>` | Main content landmark |
| `#stage-slideover-sidebar` | `<div>` | Sidebar container |
| `#stage-sidebar-tiny-bar` | `<div>` | Collapsed sidebar rail |
| `#sidebar-header` | `<div>` | Sidebar top header |
| `#history` | `<div>` | Chat history list |
| `#composer-plus-btn` | `<button>` | Add files/attachments |
| `#upload-photos` | `<input>` | Hidden photo file input |
| `#upload-camera` | `<input>` | Hidden camera file input |
| `#conversation-header-actions` | `<div>` | Header share/menu buttons |
