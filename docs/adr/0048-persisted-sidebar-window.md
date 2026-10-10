# ADR-0048: Persisted sidebar window for signed-in reloads

**Status:** Accepted
**Date:** 2026-10-09

## Context

Every signed-in reload painted an empty sidebar first. `ChatsProvider` reads
the bounded recency window plus the pinned read (ADR-0005) through the
per-user seam, which waits for the Convex JWT (ADR-0004), so
`deriveSidebarLoading` held the sidebar in its loading state until auth, the
first page, and the pinned read had all arrived. ADR-0031 made chat switches
warm but left reload cold and named persisting the thread list as the
remaining item.

claude.ai, ChatGPT, and t3.chat all paint the recent thread list from device
storage on reload. claude.ai's version never invalidated, so threads deleted
elsewhere stayed in the sidebar and errored on click (Theo, 08:18 to 09:50).
Theo also warns against trading correctness for fewer requests: the live
reads stay (25:57). Anthropic's write-up adds two constraints: rows should
fill in where they will stay, and identical snapshots must not be rewritten
on the main thread ("Scaling horizontally").

Options:

1. **localStorage, read synchronously** through `useSyncExternalStore` with a
   null server snapshot, the same hydration-safe shape as the chat
   organization preference and ADR-0032. Rows paint on the first
   post-hydration render.
2. **IndexedDB through the guest store** (`lib/chat-store/persist.ts`). Reads
   are async, so rows still arrive after a loading frame, and the store is the
   guest identity's data (ADR-0033): mixing signed-in rows into it blurs the
   one rule that keeps guest and durable chats apart.
3. **A persistent query cache** (convex-helpers or a generic Convex
   persister). Persists every per-user query, not just the sidebar, needs its
   own owner scoping and invalidation story, and the paginated seam is not on
   the cached hook (ADR-0031).
4. **Status quo.** Reload keeps showing the loading state.

## Decision

Option 1, in `lib/chat-store/chats/persisted-window.ts`.

- **What is stored.** One key, `naw:sidebar-window`, holding
  `{ v, owner, rows, projects }`. `owner` is the `userId` prop (the WorkOS
  subject from the server session). `rows` is the live first window page plus
  pinned rows (capped at 50), with only the fields rows and partitioning read:
  id, title, project id, pinned, pinned time, created and updated times. Run
  status (spinners, unread) is never stored. `projects` is the live project
  list (newest 100) with the fields project rows and grouping read: id,
  creation time, owner id, name, pinned, updated time. The sidebar needs both
  to place project chats, so they are stored and written as one pair.
- **When it is shown.** Each part only while its live read is pending (auth
  resolving, or the read in flight). Rows stand in for the first page and
  pinned read: `isLoading` is false and the sidebar paints them. Projects
  stand in for `projects.getForCurrentUser`: `ChatsProvider` subscribes to
  that read too (the same Convex subscription the sidebar opens) and exposes
  `persistedProjects` while it is pending. Once nothing is pending the hook
  returns a stable null and ignores other tabs' writes.
- **Live data always wins.** Once the live first page and pinned read have
  arrived, the sidebar renders live data only. Persisted rows are never merged
  into live rows, so a chat deleted or renamed elsewhere is corrected on the
  first live result.
- **Display only.** `getChatById` serves live rows only, so chat surfaces
  (`useChat`, the not-found decision) keep using their own authoritative read
  until the live window arrives.
- **Row actions on persisted rows.** The optimistic overlay is id-keyed and
  applies to whichever list is displayed, so a rename, pin, or delete shows at
  once and carries over to the live rows. The durable commands wait for the
  same Convex auth readiness gate as first-turn creation before calling the
  mutation; a timeout rolls back and shows the existing failure toast.
- **Bound to the live identity.** The window is read and written only while
  the live AuthKit user is the owner, so a tab whose session moved to another
  user neither shows the old owner's rows nor writes the new user's rows
  under the old owner. AuthKit is seeded from the server session, so a
  reload still paints on the first render.
- **Write-through on change.** Only delivered live reads (window, pinned, and
  projects) are serialized.
  The write runs in `requestIdleCallback` (2 s timeout; `setTimeout` where
  unsupported) and is skipped when the string equals what is stored. Status
  changes during a stream produce the same string and write nothing. A
  tab's own write updates the snapshot cache without notifying React.
- **Untrusted input.** A wrong version, another owner, malformed JSON, a bad
  row, or more rows than the bound rejects the whole envelope. On subscribe,
  an envelope this caller cannot use is deleted, including any envelope seen
  while signed out.
- **Cleared on sign-out.** `signOutAndClearLocalState` deletes the key and
  stops further writes for the document, so a late live update cannot write
  the departing user's rows back. Every other open tab sees the removal as a
  storage event and stops its writes too. A sign-out that fails without
  navigating resumes this document's writes and re-persists the provider's
  current window, unless another tab's removal already stopped them. There is no client account-deletion path
  that clears local data; deletion ends the session and the next signed-out
  load deletes the key.

## Consequences

- A signed-in reload paints the cached sidebar window (up to 25 recent chats,
  50 pinned chats, and 100 projects) in both grouping modes without waiting
  for Convex: `app-sidebar.tsx` uses `persistedProjects` while its live
  project read is undefined, so its
  `isLoggedIn && projectDocs === undefined` gate only holds the loading
  state when there is no persisted window (first load on a device, or after
  sign-out).
- Project row actions (pin, rename, delete) on persisted projects call their
  mutations without the chat rows' auth readiness gate. They rely on the
  Convex client pausing its socket while it fetches the first token, which
  starts on the first effect because AuthKit is seeded with the server
  session. If that token fetch fails, the action shows its existing failure
  toast.
- Cached and live lists can differ, so a reload after activity on another
  device may shift a row or two when live data lands. That is the accepted
  cost (Theo, 38:25); a stale row never outlives the first live result.
- Privacy: chat titles and project names live on the device in plain text,
  scoped to one owner, deleted on sign-out (all tabs stop writing), and
  deleted on the next load by any other identity. Another signed-in user on
  the same browser never sees them. A session that expires without a
  sign-out leaves them until the next load.
- Each live change costs one small serialization and a string compare;
  storage is written only when the persisted data actually changed, and the
  write does not re-render the tree.
