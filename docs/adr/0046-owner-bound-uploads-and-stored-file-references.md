# 46. Owner-bound attachment uploads and one stored-file reference rule

- Status: accepted
- Date: 2026-09-27
- Context: TODO "File ownership and safe deletion"
- Related: ADR-0010 (HTTP trust boundary, CSP), ADR-0014 (deletion jobs),
  ADR-0036 (Composer attachment lifecycle), ADR-0044 (account deletion),
  ADR-0045 (domain-tagged HMAC with `CHAT_ADMISSION_SECRET`)

## Context

The browser uploaded attachments to a Convex upload URL and then called the
public `files.saveStagedAttachment({ storageId })`. That mutation checked only
the stored file's size and type, never who uploaded it. Storage URLs are
`/api/storage/<id>`, so every attachment or avatar URL a user can see names a
storage id. A signed-in user could stage another user's attachment or profile
image blob as their own; deleting that row, or its 24 h cleanup, called
`ctx.storage.delete` and destroyed the victim's file.

Deletion had no single rule either. Explicit deletion and staged cleanup
deleted the blob unconditionally. Chat deletion checked other attachment rows
but not profile images; account deletion checked the profile image against
attachments only; profile-image replacement checked nothing.

## Options considered

**Binding ownership at upload**

1. Keep Convex upload URLs and guard `saveStagedAttachment` (reject ids that a
   row already holds, or ids stored before a mint time). Closes the known
   claim, but nothing proves the caller uploaded the blob; an unreferenced id
   stays claimable by whoever learns it. Rejected.
2. Upload through a Next route, like the profile image. Vercel caps a function
   request body at 4.5 MB, below the 10 MB attachment cap. Rejected.
3. POST to a Convex HTTP action with the browser's WorkOS access token
   (`requireIdentity`, as `/profile-image` does behind its proxy). Proves the
   uploader, but threads AuthKit's token hook into the React-free upload
   module and sends the full session token to one more endpoint.
4. **An owner-bound upload ticket.** Chosen. `files.generateUploadUrl`, already
   the authenticated and limit-checked mint, returns the HTTP action's URL and
   a ticket `usersId.expiresAt.signature`, signed like the guest cookie:
   `HMAC(CHAT_ADMISSION_SECRET, ["attachment-upload-v1", usersId, expiresAt])`.
   The action verifies the ticket, stores the request body, and stages that
   blob for the ticket's user through an internal mutation. Same flow shape as
   Convex's upload URL, narrower authority than a session token, no new secret
   or table, and the browser never names a storage id. LibreChat
   (`api/server/routes/files`) and HuggingChat also upload through their own
   server and record the owner there.
5. Two steps: the action returns a storage id recorded in a receipts table,
   and `saveStagedAttachment` accepts only a receipt the caller owns. Needs a
   table and its own cleanup for no stronger guarantee. Rejected.

**Deletion**: one reference-aware helper for every path, instead of each path
keeping its own partial check.

## Decision

### Upload (`convex/http.ts`, `convex/lib/uploadTicket.ts`)

- `files.generateUploadUrl` returns `{ url, ticket }`, or null when the daily
  limit is spent. The ticket lives 15 minutes (a slow 10 MB transfer); reuse
  inside that window is bounded by the limit re-check at staging.
- `POST /attachments` on the deployment's `.convex.site` origin: a missing,
  forged, or expired Bearer ticket is 401 before anything is stored; a type
  outside `ALLOWED_FILE_TYPES` is 415; a body over 10 MB is 413 (Convex HTTP
  actions accept up to 20 MB). The file name travels URI-encoded in
  `X-Attachment-Name`.
- The action stores the body, then runs `internal.files.stageUploadedAttachment`
  with the ticket's user. That mutation refuses a rejected account (ADR-0044)
  and re-checks the daily limit. On any refusal the action deletes the blob it
  just stored: it knows the blob is its own, so the old orphan (a refused
  caller-supplied id nobody could safely delete) is gone. Success is
  `{ attachmentId }`; the client never sees a storage id.
- CORS: `Access-Control-Allow-Origin: *` plus an OPTIONS preflight. The
  ticket is a bearer credential only an authenticated mutation mints, and no
  cookie is involved, so no origin gains anything by sending one.
- CSP `connect-src` adds the `.convex.site` origin, resolved by
  `getConvexSiteUrl` (the one resolution order for Convex HTTP actions).
- The public `saveStagedAttachment` is removed. Its core
  (`saveStagedAttachmentHandler`) keeps its flow and refuses any blob that an
  attachment row or profile image already references; the profile-image commit
  refuses the same. Both only ever receive a blob their action just stored, so
  this is a second line, not the gate.

### One stored-file reference rule (`convex/domain/storage_refs.ts`)

A blob's references are `chatAttachments.storageId` and
`users.profileImageStorageId` (new `users.by_profile_image_storage_id` index).
`deleteStorageIfUnreferenced(ctx, storageId, releasing?)` deletes a blob only
when no reference other than the caller's own remains, and skips a blob that is
already gone. Explicit deletion, staged cleanup, Chat, Project, and account
deletion jobs (attachments and the account's profile image), and profile-image
replacement all use it. Deletion jobs release the blob before deleting its row,
so a storage failure blocks the job with the reference intact and a resumed
batch retries (ADR-0014).

## Consequences

- No public function accepts a storage id for binding, so no user can claim a
  blob they did not upload, and a duplicate reference from before this change
  can no longer take another user's file with it when deleted.
- Browser tabs loaded before the deploy call the removed
  `saveStagedAttachment` and fail the upload until reloaded.
- A ticket is replayable for 15 minutes by whoever holds it; the worst case is
  more staged files for that same user, bounded by the daily limit (premium
  stays unlimited, as with Convex upload URLs before).
- The upload action has no per-request rate limit: `apiRateLimits` buckets key
  on a Convex identity, which a ticketed request does not carry. Follow-up if
  premium upload abuse appears.
- Image normalization (open PR #191) schedules from
  `saveStagedAttachmentHandler`, whose flow is unchanged; its local
  `deleteStorageIfUnreferenced` is replaced by this module's, which has the same
  call shape and also checks profile images.
- The profile image keeps its Next proxy; switching it to a ticketed direct
  upload would remove the Vercel body cap there too.
