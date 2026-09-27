# ADR 0024: Browser interaction lifecycles live in shared modules

## Status

Accepted.

## Context

Four browser behaviors crossed existing product seams: View
Transition lifecycle state, native sharing, interaction-intent prefetching, and
Composer input-to-paint measurement. Keeping their browser branching in each
product caller would duplicate cleanup rules, create different mobile/desktop
share outcomes, and attach performance listeners outside the stable editor DOM
that actually owns input.

The visual recipes, Chat turn contract, and plain-string Composer draft are not
changing. This decision is about where browser lifecycle knowledge lives.

## Decision

1. `components/ui/view-transition.ts` is the one **View transition** Module.
   Product callers provide an atomic update plus optional scoped class and
   transition types. The Module owns hidden-tab/reduced-motion bypass, feature detection,
   document lifecycle state, rejection handling, and cleanup. First-send Composer
   motion uses its existing local module to animate live DOM after the update
   instead of capturing document snapshots (ADR-0037).
2. `app/components/layout/public-chat-share.ts` is the **Public chat share**
   Module. It publishes before presenting a share target, delegates browser
   capability handling to `lib/browser/share-target.ts`, treats an aborted
   system sheet as user dismissal, and opens the custom fallback only when the
   native path is unavailable or fails. Dialog and Drawer share one body.
3. `components/ui/intent-prefetch.ts` is the **Intent prefetch** Module. A
   callback ref owns descendant focus, pointer, touch, coarse-pointer visibility, and
   cleanup. A retryable loader deduplicates imports. Product actions may invoke
   that same loader on activation as the final no-waterfall guarantee.
4. `lib/observability/composer-paint.ts` is the **Composer paint probe**. The
   ProseMirror callback-ref lifecycle creates and disposes it; editor updates
   and committed Composer updates are its only two signals. It stays behind
   the existing off-by-default, content-free Chat-performance allow-list.
5. `components/ui/focus-mode.tsx` owns input modality for the shared focus
   variants. Its callback-ref lifecycle tracks keyboard/pointer events and focus
   transfer, publishing state on the focused element. The selector still requires
   native `:focus-visible`; moving the state off `html` avoids invalidating every
   descendant when the user switches input methods.
6. `lib/browser/connection-wake.ts` is the **Connection wake** Module. It
   reports moments after which an open connection may be silently dead: the
   document becomes visible, the network returns, or the back/forward cache
   restores the page. Its listeners exist only while something subscribes. The
   stream receiver (`lib/chat-stream/resumable-chat.ts`) subscribes while it
   holds a live connection and releases it when the connection ends. A wake
   only replaces a connection that has already gone quiet (ADR-0039).
No Module introduces a React `useEffect`; browser ownership is event-driven or
callback-ref-owned.

## Consequences

- Browser behavior is testable through the same small interfaces product
  callers use.
- Desktop and mobile share surfaces cannot drift in link construction, copy
  state, or fallback decisions.
- Lazy overlays warm from keyboard, mouse, and touch without eager-loading the
  entire application shell.
- Composer responsiveness can be profiled without recording prompt content or
  adding per-keystroke React state.
- Future View Transition or lazy-overlay callers extend the shared Modules
  instead of recreating browser feature detection and cleanup.
