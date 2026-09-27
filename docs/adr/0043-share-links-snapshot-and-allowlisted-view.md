# 43. Share links: a random id, a snapshot, and an allowlisted view

- Status: accepted
- Date: 2026-09-27
- Supersedes: the public-chat read exception of `readableChatQuery`
  (ADR-0003) and the pure-public reads `chats.getPublicById` and
  `messages.getPublicForChat` (ADR-0003, ADR-0033)
- Related: ADR-0010 (HTTP trust boundary), ADR-0014 (deletion jobs),
  ADR-0033 (client-minted chat identity), ADR-0044 (account deletion)

## Context

Sharing set `chats.public = true` and nothing could clear it except deleting
the chat. The link was `/share/<publicId>`, the chat's private id, and every
chat read accepted any caller for a public chat, so a stranger with the link
could also open `/c/<publicId>` and subscribe to the live conversation. The
public reads returned raw rows: `getPublicById` returned the chat doc with its
system prompt and owner id, and `getPublicForChat` returned every message's
`parts`, which carry tool inputs and outputs (including private MCP results),
reasoning text, file URLs, and provider metadata. The view was live, so turns
sent after sharing were public too. The share page let search engines index
it, and its copy promised community feeds and search results that do not
exist.

References: LibreChat's `SharedLink` (`packages/data-schemas/src/methods/share.ts`)
mints a random `nanoid` share id, stores the message set at share time,
builds the public messages from a field allowlist, serves files only through
`/api/share/:shareId/files/:fileId`, revokes by deleting the link, and sends
`X-Robots-Tag: noindex`. Open WebUI serves shared chats at `/s/[id]` from a
copy made at share time, with a `noindex,nofollow` meta tag. LobeHub's share
route also sends `noindex, nofollow`.

## Decision

**A separate share identity.** A `chatShares` row holds a `shareId` of 128
random bits in hex, minted server-side with the Convex runtime's `crypto`. It
never equals or derives from the chat's publicId, and its shape (32 hex
characters, no dashes) can never match a publicId. A chat has at most one
row. The page is `/share/[shareId]`; the public read is `shares.getPublic`.

**A snapshot, not a live view.** The row stores `throughMessageId`, the last
visible selected message when the owner shared, and `title`, the chat title at
that moment. The view is that message and its ancestors through the branch
context's effective parents, under the stored title, so later turns, edits,
regenerations, branch switches, and renames never change what the link or its
Open Graph preview shows. The title is copied because it is live chat state:
editing the first message regenerates it from text that was never shared
(LibreChat also stores the title on the link). The messages are referenced,
not copied: a tail that was still streaming finishes, as LibreChat's message
references do. Sharing again while a link exists moves the tail and the title
to the current chat and keeps the id; that is an explicit owner action, and a
new id would break links already sent.

**Revoke deletes the link.** `shares.revoke` deletes the row, so the URL is
not found from that commit on. The next `shares.publish` mints a new id, so a
revoked URL never comes back. The owner's share surfaces (the header dialog
and the chat actions drawer) are keyed by chat: the header outlives chat
routes (ADR-0013), so a route change resets them and Stop sharing only revokes
the chat whose link it shows.

**The private id is owner-only.** `resolveChatForRead` no longer honors
`chat.public`: `readableChatQuery` hands a chat only to its owner and null to
everyone else, so `chats.getById`, `messages.getSelectedPath`, and
`messages.getSelectedRunState` never serve a stranger. The non-owner strip
paths are gone; the selected path also fails closed for a non-owner viewer.

**An allowlisted view.** `convex/domain/share_view.ts` builds the only shape
a stranger receives: the snapshot title, the chat's creation time, and per
message the role (user or assistant), the text (`content`, which holds only
text parts), and web citations as `{ url, title }`. Citations come only from provider
`source-url` parts and the static web-search tools (`tool-web_search`,
`tool-google_search`), and only with http or https URLs. A `dynamic-tool`
part is an MCP call and never contributes, nor does any other tool output. No
ids, system prompt, owner fields, tool inputs or outputs, reasoning, files,
provider metadata, model, usage, errors, or run state cross. Messages awaiting
approval, hidden placeholders, and messages with no text or citations are
left out.

**Files are omitted.** The share page never rendered attachments, and serving
them needs a share-scoped path that checks the file belongs to a message on
the shared path (LibreChat's model). That is the route to add if shared
attachments become a product need; until then no file reference crosses.

**Unlisted pages.** The page metadata sets `robots: { index: false, follow:
false }`, and `next.config.ts` sends `X-Robots-Tag: noindex, nofollow` on
`/share/:path*`, which also covers the not-found response of a revoked link.
Open Graph and Twitter tags stay, so link previews still work. The share copy
is "Anyone with the link can view this conversation."

**Lifecycle.** `shares.getPublic` reads the chat through `isChatActive`, so a
tombstoned chat, project, or owner account hides the link at once. The row is
deleted in the chat's tombstone commit (`chats.remove`) and in the drain-start
commit of Project and account jobs (`beginChatDrain`). The owned builders
reject an inactive chat, so no row can be created after a tombstone.

**`chats.public` stays as a mirror.** It is true while a row exists, written
in the same mutations, and only drives the owner's Stop sharing control
without a per-row query. Public reads never read it. Existing rows keep
validating: a chat that was public before this change has no row, so its old
`/share/<publicId>` URL is not found (the id shape fails first), and its flag
clears on the owner's next share or revoke. Pre-launch, no backfill.

Contract: `chats.makePublic`, `chats.getPublicById`, and
`messages.getPublicForChat` are removed; `shares.publish`, `shares.revoke`,
and `shares.getPublic` replace them.

## Alternatives considered

- **Keep `/share/<publicId>` and add an allowlist and a revoke flag.** The
  private id stays public, and re-sharing after a revoke brings the same URL
  back. Rejected.
- **A live view.** Every turn sent after sharing becomes public without the
  owner acting. Rejected.
- **Copy the shared messages into share rows** (Open WebUI). Full isolation
  from later edits, but it duplicates content into unbounded rows that need
  their own deletion phase. Message references with an allowlisted read give
  the same privacy at share time.
- **Store the shared message ids** (LibreChat). Convex arrays cap at 8192
  elements, and one tail id freezes the same path.
- **A new id on every share.** Breaks links the owner already sent.
- **Serve files now through a share-scoped route.** A public read would have
  to return a storage URL or stream the blob through a new HTTP action; the
  page never showed files, so this waits for a product need.

## Consequences

- A stranger opening `/c/<publicId>` of a shared chat sees not found.
- The share read costs the same full message read as the old public read.
- Links shared before this change are not found.
- Tests: `convex/shares.seam.test.ts` pins the allowlist, the snapshot (path
  and title), revoke and re-share, deletion, and the owner-only private id;
  `accountLifecycle.seam.test.ts` pins the account drain of share rows;
  `chat-actions-menu.test.tsx` pins that a chat switch closes the share
  drawer.
