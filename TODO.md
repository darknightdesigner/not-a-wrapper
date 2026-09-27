# To Do

- **File ownership and safe deletion:** Bind storage ownership during authenticated
upload; prevent `saveStagedAttachment` from claiming another attachment's or
profile image's blob through a caller-supplied storage ID. Share reference-aware
deletion rules across explicit deletion and staged-attachment cleanup so duplicate
references cannot delete a blob still in use.
- **Account deletion webhook gap:** `@convex-dev/workos-authkit` 0.2.9 (the
latest release) returns early on `user.deleted` for a user missing from its
mirror, so our account deletion never runs for that user. Keep the mirror
complete with `workosAuth:backfillUsers` after any reset, run
`users:deleteAccount` for a missed user (ADR-0044, docs/environment.md), and
upstream a fix that still calls the app handler.
- **Reapers can starve behind a blocked Project deletion job:**
`reapExpiredGenerationRunsPass` and `reapExpiredToolApprovalsPass`
(`convex/chatRuntime.ts`) read a fixed 25-row window with no cursor and skip
inactive chats, so the live runs and approvals of a Project whose deletion job
blocked stay at the head of the range forever. Page them with a
`reaperCheckpoints` cursor like `reapResolvedApprovalPausesPass`, or close live
work at the start of Project jobs as ADR-0044 does for account jobs.
- **Guest limit follow-ups (ADR-0045):** Drop the vestigial guest `userId` from
the chat wire contract and client builder, remove `anonymousUsage` from
`convex/schema.ts` once production is drained, and add a trusted client-IP
header setting for non-Vercel hosts (off Vercel every guest shares one network
bucket).
- **Favicon proxy sees model-chosen hostnames without a click:** Markdown link
pills and source chips render `Favicon`, which requests
`/api/favicon?domain=<host>` on its own, and `app/api/favicon/route.ts` asks
Google's favicon service about that host. A prompt-injected link to
`https://<encoded-chat>.evil.example` can leak data through DNS with no click.
Show favicons only for tool-sourced citations, or a static globe for
model-written links.
- **Shared chats omit attachments:** The share view (ADR-0043) leaves files
out. If shared attachments become a product need, serve them through a
share-scoped route that checks the file belongs to a message on the shared path
(LibreChat `/api/share/:shareId/files/:fileId`).
- **Convex read ceiling for very large chats:** `prepareGeneration` now reads a
chat once per turn and each message is capped at 896 KiB (CONTEXT.md "Message
payload cap"), so sends work up to about 16 MiB of messages (verified to 12 MiB
on dev). `getSelectedPath` still reads every message, branches included, on
every content beat per subscriber (ADR-0027 Experiment 2b), a send that
supersedes a zombie run reads the chat twice (about 8 MiB ceiling), the project
directory reads each chat's latest 12 messages and can pass 16 MiB with a few
tool-heavy chats, and user messages over 1 MiB fail at prepare. When real chats
approach this, move tool payloads to their own rows (LobeHub `message_plugins`,
Convex agent component per-step rows). `bun scripts/convex-read-limits-smoke.ts
--target-mib N` measures the ceiling against dev.
- **Refresh mid-stream can freeze the answer:** `lib/chat-stream/resumable-chat.ts`
drops replay updates that fail `hasVisiblePrefix` while status is already
streaming, so Convex checkpoints are not shown either and the UI freezes until
the run ends (recorded in ADR-0039 on 09-06 and 09-08). If no update is accepted
about 2 seconds after caught-up, drop the observer and let checkpoints take
over. Consider one ordered log with a sequence cursor like HuggingChat, so there
is no second copy to compare.
- **Stalled connection recovery:** The only client stall guard is 330 s
(`use-generation-presentation-controller.ts`), with no reaction to
`visibilitychange`, `online`, or `pageshow` and no heartbeat frames, so a phone
sleep or Wi-Fi switch can freeze text for up to 5.5 minutes. Add heartbeats and
reconnect after about 10 s of silence and on tab or network return (HuggingChat
`reattachStream.ts`); dropping the client fetch is free for durable runs. Pass
the `after` cursor from `app/api/chat/[chatId]/stream/route.ts` so a reconnect
does not replay the whole log. Consider AI SDK 7 `timeout: { firstChunkMs,
chunkMs }` for provider-side stalls.
- **Retained stream can stay "active" after completion:** Stream end depends on
one unretried Redis write whose errors are swallowed
(`lib/chat-stream/server.ts`), and the reader loop never checks the run's
status. If that write is lost, an observing tab keeps a finished run as
local-streaming: Stop shows, message actions hide, and it reconnects every 300 s
until reload. Have the reader check the authoritative run status on each tail
tick and end the stream (HuggingChat `stream/+server.ts`).
- **Time-limit cutoff reads as "Stopped":** The 265 s provider deadline
(`lib/chat-turn/execution-budget.ts`) aborts with a fixed "stream aborted"
reason, the lifecycle stamps `request_aborted`, and `run-presentation.ts`
renders that as stopped, so it looks like the user pressed Stop and Retry
restarts from zero. Record a distinct deadline-exceeded reason (trigger.dev has
`MAX_DURATION_EXCEEDED`), label it honestly, and offer Continue from the
existing tool history (HuggingChat `resumeAfterFailure.ts`).
- **Provider error classification:** `app/api/chat/public-error.ts` checks
message text before the HTTP status, so any message containing "billing" or
"credits" is treated as payment-required ahead of the 429 check: OpenRouter's
free-tier "add credits" 429 shows as non-retryable "insufficient credits".
Context-too-long, model-not-accessible, and bad-key errors all fall into the
generic retryable message. Check status first and add context-window,
model-not-found, permission, and bad-key classes (LobeHub
`model-runtime/src/errors/patterns.ts`, `taxonomy.ts`). Verify against live
provider wording first, and check whether always sending `reasoningSummary:
"auto"` (`request-shaping.ts`) is rejected for unverified-org OpenAI BYOK keys.
- **BYOK lookup failure falls through to platform funds:** `getUserKeyFromConvex`
(`lib/user-keys.ts`) returns null on any error, and the resolver
(`lib/model-route-resolver.ts`) then skips that candidate, so a Convex hiccup or
missing `ENCRYPTION_KEY` bills the turn to the platform allowance or says "add a
key" for a key the user already saved. Keep stale ciphertext as a clean miss but
fail loudly on infrastructure errors (LibreChat throws `NO_USER_KEY`). The
rotation comment in `lib/encryption.ts` promises lazy re-encryption that no code
performs; implement it or fix the comment before dropping an old key. Also
validate keys on save with a free `GET /models` (Open WebUI).
- **One record per tool call, and lock down `toolCallLog.log`:** Each call is
stored in `messages.parts`, in `toolInvocations` (full input and output, only
status is read back), and in `toolCallLog` (never read). `toolCallLog.log` is a
public signed-in mutation with no rate limit, retention, or ownership check
beyond `by_chat`, so any signed-in browser can forge or flood audit rows. Delete
the unused copies or make them server-written, bounded, and indexed for a real
reader.
- **Upload admission and orphan cleanup:** `generateUploadUrl`
(`convex/files.ts`) counts only saved rows, and the cleanup job promised by the
comment there does not exist in `convex/crons.ts`, so failed or abandoned
uploads live forever and the daily cap never trips. Rate-limit it with the
existing `apiRateLimits`, verify whether the upload URL caps size, check content
type server-side instead of trusting the declared one, and add a cron that
deletes unreferenced storage. Complements the file-ownership item above.
- **Hosted search fees in the platform allowance:** Settlement counts tokens
only (`convex/domain/usage_accounting.ts`, `lib/usage/billable-pricing.ts`);
per-call search fees exist as display metadata in `provider-strategy.ts` and the
ADR-0021 platform-paid operation inventory omits provider-hosted search. A
gpt-5-mini turn with two searches can cost several times what the $1 meter
records (bounded only by the 25 per 15 minutes tool cap). Meter the fees or
document the accepted exposure in ADR-0021.
- **MCP circuit breaker never resets:** After three failures a server is skipped
for the life of the process (`lib/mcp/circuit-breaker.ts`, `load-tools.ts`), a
5 s timeout counts as a failure, and the skip writes no `lastError`, so one slow
cold start silently removes a server's tools from every later chat on that
instance. Add a time-based cooldown (about 60 s, LibreChat `connection.ts`) and
write `lastError`. Same pass: widen the private-IP list (198.18/15, 192.0.0.0/24,
224+, NAT64/6to4/Teredo; LibreChat `auth/ip.ts`), cap MCP response size before
truncation, and redact raw MCP `lastError` and console error text.
- **Chat client hardening:** (1) A failed send toasts twice: the SDK `onError`
shows the server message (`use-chat-core.ts`) and the `runSendTurn` catch adds
"Failed to send message" (`chat-turn-controller.ts`); suppress the generic one
when `onError` already presented, and add a test. (2) Inline edit Save or Cancel
unmounts the editor and drops focus to `<body>` (`message-user.tsx`); return
focus to the Edit button or the composer. (3) `localStorage` is unguarded in
`app/hooks/use-chat-draft.ts`, `lib/user-preference-store/provider.tsx`,
`lib/api.ts`, `collapsible-section.tsx`, and `sidebar/chat-organization.ts`;
extract one safe-storage helper (the model-store provider already guards it).
- **Model presentation: Improve how models display across the UI**
  - Make model logos appear during thinking states to make assistant output ownership clear
- **Per-turn effort, platform-funded UX (ADR-0026 v1 follow-up):** two accepted
  nuances to review and tackle: (1) platform-funded turns silently run at the
  provider default even when the resolved route supports the requested level —
  requested and the concrete provider default are both recorded so the badge and
  reopened composer stay honest, but the composer gives no hint before sending.
  Decide between surfacing an affordance ("effort applies on your own key / paid
  usage") and implementing effort-scaled reservations. (2) An effort
  selection can steer resolution off a platform-entitled route onto the user's
  own BYOK key when only that route serves the level — capability-correct, but
  it silently shifts cost onto the user's key; decide whether that needs
  disclosure in the composer or a funding-tier preference in the resolver.
- **Web Search modes and quantity controls:** Think through how the Composer
should expose an **Always** option that lets users force `web_search`, alongside
the existing Off and Auto behavior where the model decides whether to search.
Research and implement the multiple search-quantity controls exposed by
t3.chat, including their interaction model and request-level mapping.
- **Progressive Activity UX:** Inline thinking/status exists. Add progressive
reasoning and intermediate text in the thread; retain full Activity-panel history.
- **Chat composer text editing:** Add chat composer text / markdown editing (link, bold, italic, headings, etc...)
- **Dictation:** Add chat-composer dictation
- **Image generation:** Nano banna and state of the art image gen tools (Using Vercel's SDK Framework)
- **Video generation:** Using Vercel's SDK framework
- **Admin Portal:** A way to manage users, controls, features, etc...
- **Automatic conversation context management:** replace the current
context-limit hard stop with model-aware input budgeting that reserves space
for instructions, tool schemas, attachments, and output. Before the selected
path exceeds its budget, derive a versioned summary checkpoint for older
completed turns while retaining recent turns verbatim and preserving the full
canonical transcript, branch/edit/regeneration semantics, tool outcomes, and
source provenance. Make compaction idempotent, observable, and visible to the
user; fall back to an explicit hard stop when safe compaction cannot fit. Cover
authenticated and guest chats, model switches, attachments, and multi-step
tool turns with cross-provider tests and token/compaction telemetry. Today the
gate is browser-only (`lib/chat-turn/prompt-size-policy.ts`): a 4 characters per
token estimate over text parts only (tool, reasoning, and image parts are
ignored), and the server never trims (`maxHistoryTokens` is unused), so past 90%
of the window every send says "Shorten the message". Reuse the fuller estimator
in `lib/usage/platform-usage-estimate.ts`. References: LibreChat `BaseClient.js`
fits the newest messages to the budget, LobeHub `HistoryTruncate`.
- **Durable long-running generations:** Move provider execution beyond the
initiating HTTP request's lifetime. Preserve Convex ownership, live snapshots,
Stop, supersession, recovery, and usage settlement. Document the execution and
cancellation model in an ADR.
- **Project-scoped agent context:** let each project define shared instructions,
knowledge and files, tool or connector permissions, and optional durable
memory that are automatically available to every chat in that project, similar
to project-scoped contexts in modern AI chat products. Make context precedence,
token budgeting, provenance, access control, versioning, and user-visible
reset or opt-out behavior explicit so project chats remain reproducible and
do not leak context across project boundaries.
- **Voice Mode:** Using Eleven Labs
- **Assistant Response UI Widgets:** Image Carousels, Image Previews, Weather, Stock UI, Charts (maybe), editable markdown (maybe)
- **Monetization:** Setup Usage-based monthly pricing using Stripe or better option
- **Agent-first file library:** Create a computer-like environment where agents can easily discover files?
- **Evaluate inference on Fluid:** From [Theo's post](https://x.com/theo/status/1997784385337372877)
- **Retained-stream admission:** Bound concurrent replay readers per user across
instances using existing admission patterns. Measure Redis usage and preserve
refresh and multi-tab recovery.
- **Evaluate Vercel's BotID:** Assess bot attestation for platform-funded
turn admission; guests would gate in front of `usage.admitGuestTurn`
(ADR-0045). It is the mitigation for anyone with many networks spending the
shared guest ceiling.
- **Connectors:** Integrations with Google, YouTube, Figma, and personal tools
- **MCP OAuth (product gap):** `lib/mcp/auth-headers.ts` only sends a static
Bearer or custom header, with no OAuth or refresh, so users paste long-lived
personal tokens into most hosted MCP servers. `@ai-sdk/mcp` already exposes
`authProvider`; LibreChat runs OAuth with SSRF-hardened discovery and token
fetches (`packages/api/src/mcp/oauth/`). Route every OAuth URL through the
existing pinned fetch and encrypt stored tokens like BYOK keys.
- **Agentic design system (future):** Define an agent-readable, customizable
visual system after the product's core interaction patterns stabilize.
- **Thread code splitting:** Measure and defer remaining charts and Composer
extras; audit client Zod imports. Verify reduced cold-load JavaScript without
regressing typing, first-send latency, or first-text rendering in the browser.
- **Warm chat navigation:** Improve revisited-thread paint latency using the
existing cache and warming paths (ADR-0031). Measure visited/unvisited p50/p95
and verify bounded subscriptions and memory after 50 switches.
- **Investigate visibility-gated chat hydration (replicate T3 Chat):** observed
on 2026-09-02 while benchmarking against t3.chat: their chat client does not
finish hydrating while `document.visibilityState` is `hidden`. The composer
stays a disabled server-rendered shell (send button disabled, model picker
reads "Loading…", no React props on the textarea) until the tab is actually
shown, then boots normally; our app hydrates and streams fully in a hidden
tab. Plan: confirm what they gate (hydration itself, the model catalog and
sync-engine boot, or both), then prototype a `visibilitychange`-deferred boot
for the chat surface behind an env escape hatch so the harness and hidden-tab
automation keep working. Verifiable test: open the app in five background
tabs before and after and record, until the first time each tab is shown,
renderer CPU time and memory (Chrome task manager or
`performance.measureUserAgentSpecificMemory`), bytes transferred, and open
Convex subscriptions; then show a tab and measure time from visible to a
working composer. Expected: near-zero subscriptions and chat JS execution
while hidden, and a composer that accepts input within 500 ms of becoming
visible.
- **Evaluate effort-level naming: API accuracy vs provider-interface parity:**
the composer's effort menu labels are the wire values spelled out
(`lib/reasoning-effort.ts`: `none` → "Off", `xhigh` → "Extra High", `max` →
"Max"), which ADR-0026 chose as "the honest provider-level names, not invented
tiers". The providers' own products do not use those words: T3 Chat and
ChatGPT show "Instant" for OpenAI's `none`, Anthropic's console groups
`output_config.effort`, and xAI/Google expose their own scales. Decide, per
level and per provider, whether the label should track the API value (stable,
greppable, matches docs and the request-shaping code, but "Off" next to a
model that still reasons a little is misleading and "Extra High/Max" read as
invented) or the provider's consumer-facing name (recognizable to users coming
from ChatGPT/T3, but a single label table then lies for other providers that
share the wire value, e.g. Grok 4.3's `none`, and names drift with each
provider's marketing). Options to weigh: keep API names; per-provider label
overrides in the catalog (ADR-0020 discipline: a route fact, not a UI
constant); or API name as the primary label with the provider's word as
secondary text or tooltip. Verifiable test: a five-person label-comprehension
check with the three benchmark models (which option makes users pick the
level they intended for "fastest reply" and "deepest reasoning"), plus a
catalog test asserting every declared `effortLevels` value has a label per
provider so no route can render a wrong or missing word. Expected outcome: a
short ADR-0026 amendment recording the rule and the label source of truth.



## Reference audit gaps

Details, evidence, and how the references handle each one:
[`docs/audits/2026-09-26-open-source-reference-gaps.md`](docs/audits/2026-09-26-open-source-reference-gaps.md).

- **Text-like uploads break chats:** Markdown, CSV, JSON and Excel pass upload,
but only `text/plain` is inlined, so Claude and GPT reject that turn and every
later one in the chat.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#text-like-uploads-break-the-chat))
- **Stored images break later turns:** Old images are replayed to text-only
models, and images are never resized, so a model switch or one oversized
screenshot fails every later send.
([text-only models](docs/audits/2026-09-26-open-source-reference-gaps.md#old-images-break-text-only-models),
[resizing](docs/audits/2026-09-26-open-source-reference-gaps.md#images-are-never-resized))
- **Attachment budgets:** Spend the text-file budget newest-first, and estimate
PDF cost from file size instead of URL length.
([newest file](docs/audits/2026-09-26-open-source-reference-gaps.md#text-file-budget-drops-the-newest-file),
[PDF](docs/audits/2026-09-26-open-source-reference-gaps.md#pdf-cost-is-estimated-at-about-20-tokens))
- **Final answer at the tool-step cap:** A tool call on the last allowed step
ends the turn with no reply. Make the last step tools-off.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#tool-step-cap-can-end-a-turn-with-no-answer))
- **Confirm Claude prompt caching live:** #196 sends Anthropic `cacheControl`
on every Claude request (direct and through OpenRouter `anthropic/*`), covered
by request-shaping tests but not yet seen on a real BYOK Claude turn. Send two
turns in a long chat with a Claude key and check generation stats show cached
input tokens.
- **Durable cache-read evidence:** Failure, lease-expiry and deadline
settlements still charge cached input at the full rate, because run step usage
and reservations do not store the cache-read count. Add optional
`cacheReadTokens` to `generationRuns.usageSteps`, the run totals and
`usageReservations`, and feed it to the fallback settlement evidence
(ADR-0021).
- **OpenAI storage with hosted search:** OpenAI turns that pair hosted web
search with Exa, content or MCP tools still keep response storage, because
`@ai-sdk/openai` drops hosted search calls from later steps when `store` is
false. Switch them to `store: false` once the SDK replays hosted calls inline
(ADR-0021, "Storage exception").
- **Encrypted reasoning size:** With `store: false`, OpenAI and xAI reasoning
parts persist the encrypted reasoning once per summary part. Measure message
size on long tool turns; if it matters, keep one copy per reasoning item.
- **Send only the new message:** The client uploads the whole conversation on
every send, although signed-in turns read history from Convex.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#every-send-uploads-the-whole-conversation))
- **Server-built user messages:** Follow-up user messages are saved from
browser-sent parts. Build them on the server, like the first turn.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#follow-up-user-messages-are-saved-as-the-browser-sends-them))
- **Title generation:** Pick the cheapest same-provider model with thinking off
(OpenAI routes title on GPT-5.1 today), and save the fallback title for
signed-in chats when the call fails.
([model](docs/audits/2026-09-26-open-source-reference-gaps.md#title-model-costs-more-than-the-answer-model),
[fallback](docs/audits/2026-09-26-open-source-reference-gaps.md#signed-in-chats-keep-new-chat-when-the-title-fails))
- **Provider-safe MCP tool names:** We allow 128 characters and dots. Sanitize
to `[A-Za-z0-9_-]` and cap at 64 with a hash suffix.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#mcp-tool-names-break-provider-name-rules))
- **Trim MCP results instead of dropping them:** Results over 100 KB reach the
model as an empty note, and screenshots take their text down with them.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#large-mcp-results-are-dropped-instead-of-trimmed))
- **MCP approval integrity:** Show every argument on the approval card under a
fixed title, and match the trust allowlist on URL origin, not the server name
the user typed.
([card](docs/audits/2026-09-26-open-source-reference-gaps.md#approval-card-hides-tool-arguments),
[allowlist](docs/audits/2026-09-26-open-source-reference-gaps.md#mcp-trust-allowlist-matches-user-chosen-names))
- **Bind MCP credentials to their URL:** Changing a server's URL, auth type, or
header keeps the saved token. Require re-entry.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#editing-an-mcp-url-keeps-the-saved-token))
- **Cache MCP tool lists:** Every signed-in turn reconnects to each enabled
server before the model starts.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#mcp-servers-reconnect-on-every-turn))
- **Replay pipeline cost:** Merge tokens and batch Redis writes at 100 to 200
ms, send one merged catch-up on refresh, never replay a run the tab already
received, and check the run before the stream probe reads the chat.
([Redis](docs/audits/2026-09-26-open-source-reference-gaps.md#replay-log-writes-to-redis-about-every-20-ms),
[refresh](docs/audits/2026-09-26-open-source-reference-gaps.md#refresh-replay-reprocesses-every-token),
[self-replay](docs/audits/2026-09-26-open-source-reference-gaps.md#the-sending-tab-can-replay-its-own-answer),
[probe](docs/audits/2026-09-26-open-source-reference-gaps.md#stream-probe-reads-the-whole-chat))
- **Rate-limit auth actions:** Sign-in, sign-up, email code, and password reset
go straight to WorkOS with no throttle. Add an IP limit and pass the IP to
WorkOS.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#auth-actions-have-no-rate-limit))
- **Strip personal data from analytics:** PostHog records full auth URLs,
including emails and reset tokens.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#analytics-record-emails-and-reset-tokens))
- **Carry guest chats into the account:** Guest chats disappear at sign-in and
are deleted at sign-out.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#guest-chats-are-lost-at-sign-in))
- **Session end handling:** A tab that lost its session runs unsaved guest
turns, then Send silently stops working. Drafts also survive sign-out.
([stale tab](docs/audits/2026-09-26-open-source-reference-gaps.md#a-signed-out-tab-keeps-acting-signed-in),
[drafts](docs/audits/2026-09-26-open-source-reference-gaps.md#drafts-survive-sign-out))
- **Signed-in admission limits:** Cap running answers per user, add a
per-minute limit for BYOK turns, give $0 platform routes a request budget, and
say "slow down" instead of "add a key" when throttled.
([concurrency](docs/audits/2026-09-26-open-source-reference-gaps.md#no-per-user-cap-on-running-answers),
[free quota](docs/audits/2026-09-26-open-source-reference-gaps.md#one-user-can-exhaust-the-shared-free-model-quota),
[error](docs/audits/2026-09-26-open-source-reference-gaps.md#platform-throttle-shows-the-wrong-error))
- **One production deployer:** Vercel and GitHub Actions both push production
Convex and can race (about 6 minutes of skew on 2026-09-04). Keep Vercel,
protect `main`, and write down a backward-compatibility rule for function
changes.
([deployers](docs/audits/2026-09-26-open-source-reference-gaps.md#two-systems-deploy-production-convex),
[compatibility](docs/audits/2026-09-26-open-source-reference-gaps.md#no-backward-compatibility-rule-for-convex-functions))
- **New versions in open tabs:** Detect a new build and reload at a safe
moment, reload once on chunk errors, restore a Reload button in
`app/global-error.tsx`, and send the build id to `/api/chat`.
([version check](docs/audits/2026-09-26-open-source-reference-gaps.md#open-tabs-never-learn-about-a-new-version),
[chunks](docs/audits/2026-09-26-open-source-reference-gaps.md#a-missing-lazy-chunk-crashes-the-app),
[chat API](docs/audits/2026-09-26-open-source-reference-gaps.md#chat-api-cannot-recognize-an-outdated-tab))
- **Alert on backend failures:** Convex crons, reapers, usage reconcilers, the
WorkOS webhook, and handled 500s only write logs.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#backend-failures-never-reach-an-alert))
- **Sentry, CI, and config hygiene:** Fix browser release and environment tags,
make the prompt scrubber match real span keys, pin CI actions to commit SHAs,
and validate config at deploy.
([release](docs/audits/2026-09-26-open-source-reference-gaps.md#sentry-browser-events-have-no-release),
[scrubber](docs/audits/2026-09-26-open-source-reference-gaps.md#sentry-prompt-scrubber-never-matches),
[actions](docs/audits/2026-09-26-open-source-reference-gaps.md#ci-actions-are-not-pinned-to-commits),
[config](docs/audits/2026-09-26-open-source-reference-gaps.md#config-is-not-validated-at-deploy))
- **Deadline timers instead of polling:** Schedule lease and approval deadlines
when they are written, instead of 15-second and 1-minute scans.
([crons](docs/audits/2026-09-26-open-source-reference-gaps.md#crons-poll-every-15-seconds),
[approval sweep](docs/audits/2026-09-26-open-source-reference-gaps.md#approval-sweep-rescans-every-paused-run))
- **Markdown correctness:** Parse `\( \)` and `\[ \]` math, render the whole
message when it has footnotes or reference links, and link Perplexity `[n]`
citations.
([LaTeX](docs/audits/2026-09-26-open-source-reference-gaps.md#latex-with-backslash-delimiters-renders-broken),
[footnotes](docs/audits/2026-09-26-open-source-reference-gaps.md#footnotes-and-reference-links-lose-their-targets),
[citations](docs/audits/2026-09-26-open-source-reference-gaps.md#perplexity-citation-markers-are-not-linked))
- **Return inserts a newline on touch keyboards:** Phones have no Shift+Enter,
so Return always sends today.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#return-always-sends-on-phones))
- **Dependency safety net:** GitHub alerts and Dependabot cannot read
`bun.lock`, so `bun audit`'s 65 findings (2 critical, fixed in Next 16.3.3)
go unreported and every Dependabot PR fails CI. Bump Next and sharp, switch
Dependabot to Bun, run `bun audit` weekly, and install with
`--frozen-lockfile` on Vercel.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#dependency-alerts-cannot-see-the-lockfile))
- **Pin Node 24 everywhere:** Production runs Node 24, CI runs 22, and the
Convex profile-image action runs on end-of-life Node 20.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#node-versions-differ-across-environments))
- **Lint and test hygiene:** Restore Next's TypeScript lint rules so the
AGENTS.md bans on `any`, `@ts-ignore`, and unused code are enforced, and make
test and lint skip `.claude/**` worktrees.
([lint rules](docs/audits/2026-09-26-open-source-reference-gaps.md#lint-lost-the-typescript-rules),
[worktrees](docs/audits/2026-09-26-open-source-reference-gaps.md#local-test-and-lint-runs-scan-agent-worktrees))
- **Formatting check:** Prettier never runs and 208 files have drifted. Format
once in a blame-ignored commit, then check in CI, excluding Markdown.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#formatting-is-never-checked))
- **Move chats between projects:** A chat stays where it was created, and
deleting a project deletes all of its chats.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#chats-cannot-move-between-projects))
- **Chat export:** Add a Markdown export of the selected path to the chat menu.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#chats-cannot-be-exported))
- **Mobile field and drawer accessibility:** Two fields under 16px zoom the
page on iPhone, and the phone history drawer's icon buttons have no names.
([zoom](docs/audits/2026-09-26-open-source-reference-gaps.md#two-text-fields-zoom-the-page-on-iphone),
[drawer](docs/audits/2026-09-26-open-source-reference-gaps.md#phone-history-drawer-buttons-have-no-names))
- **Web security headers:** Add `Cross-Origin-Opener-Policy`, and move the CSP
to a per-request nonce with violation reports, starting in report-only mode.
([COOP](docs/audits/2026-09-26-open-source-reference-gaps.md#cross-origin-opener-policy-header-is-missing),
[CSP](docs/audits/2026-09-26-open-source-reference-gaps.md#csp-allows-inline-scripts-and-never-reports))
- **Lock the image optimizer to our storage:** `images.remotePatterns` accepts
any Convex customer's images with any query string, so strangers can spend our
image quota.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#image-optimizer-accepts-any-convex-host))
- **Profile photo size cap:** Photos over about 4 MB pass our 10 MB check but
Vercel rejects them, and the error says "under 10MB".
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#large-profile-photos-fail-on-vercel))
- **Feedback limits:** Cap feedback length and send rate on the server.
([details](docs/audits/2026-09-26-open-source-reference-gaps.md#feedback-has-no-length-or-rate-limit))



## Dependency watch

- **AI SDK stable approval-persistence hook:** Evaluate a stable replacement for
`experimental_transform`. Require approval persistence before forwarding,
backpressure, abort propagation, multi-step support, and settlement ordering;
preserve ADR-0009 ownership.
- **Research and implement Anthropic** `pause_turn` **continuation:** check the
  latest AI SDK and Anthropic provider behavior against Anthropic's replay
  contract, and measure production incidence by model and search configuration.
  If no released SDK fix exists, build a provider-boundary continuation adapter
  that replays paused assistant content with the same tools, bounded
  continuation, abort propagation, deduplicated parts, and exact aggregate
  usage. Until those guarantees are tested, retain the catalog-scoped
  fixed-thinking search workaround only for Claude 4.6 models that still accept
  `budget_tokens`; never apply it to adaptive-only models. Remove
  `searchThinkingDowngrade` after the continuation path is proven.
- **Signed tool approvals:** Assess whether SDK signatures close a concrete gap
in Convex-authoritative approvals. Validate end-to-end signature preservation,
pending unsigned approvals, and shared-secret rotation before adoption.



## Correctness and maintenance

- **Document nuanced motion-performance exceptions:** update the front-end
guidance to distinguish the default prohibition on continuously repainting
animations from narrowly approved, behavior-critical exceptions. Require a
bounded live-state lifecycle, reduced-motion fallback, and measured profiling
before assigning severity or changing established behavior; prefer a
compositor-friendly equivalent when it preserves the same interaction and
visual result.
- **Routine compatible dependency refresh:** Update compatible direct and
transitive dependencies and the declared Bun version. Audit the lockfile and
run the normal project checks.
- **Staged major dependency upgrades:** Evaluate TypeScript, ESLint, jsdom,
Motion, and Recharts separately. Verify runtime and tooling compatibility;
validate each upgrade with focused checks.
- **Assistant responsiveness:** Rendering optimizations shipped; end-to-end
responsiveness remains open. Measure TTFT with chat-performance spans, quantify
the platform-funded title-usage wait before settlement, and verify streaming
smoothness in the browser. `conversation.tsx` re-derives historical assistant
views and serializes their evidence before the Message memo boundary on every
streaming render. Measure this cost in long conversations and reuse derived
views only for confirmed-settled, unchanged messages, following the existing
terminal-convergence distinction in `lib/chat-store/turns/selected-path.ts`.
Preserve the shared derivation and fresh live-turn processing: the SDK mutates
parts in place, and an older message may still receive background generation,
approval continuation, or a final server snapshot. Invalidate cached views when
parts, metadata, or relevant status changes; release unused entries. Reference:
LibreChat places message processing inside its memoized row boundary. Verify
browser performance and live, resumed, approval, and final-snapshot correctness;
the synthetic derivation benchmark alone does not establish user-visible gains.
- **Revisit the word-chunking allowlist:** only direct Haiku 4.5 and Gemini 3.5
Flash get server-side smoothing (`MEASURED_WORD_CHUNKING_TARGETS`); every other
route forwards raw provider slabs. The 2026-09-09 review measured Sonnet 5 at
~130 chars per ~540 ms (direct and OpenRouter) and Opus 4.8 steady token-level
in only half of runs, and the transform adds a bounded tail of ≤400 ms plus up
to 80 ms before the first partial word. Decide, with our speed-first
philosophy stated explicitly, whether that latency cost is ever worth paying on
other routes, whether the allowlist should instead be a per-user preference,
or whether the exception itself should be removed for consistency. Record the
decision in ADR-0016.
- **Simplify message branch bookkeeping:** Every sibling carries `selected` and
`branchIndex`, legacy parent inference is order-dependent
(`convex/domain/message_branches.ts`), each write plans, patches, and repairs
over one in-memory copy of the whole chat, read once per mutation
(`message_branch_writes.ts`), and idempotency scans an
unindexed `clientMessageId` in JS. ADR-0027 rejects an indexed path because of
legacy chats, which no longer applies pre-launch. Decide on one
`activeBranchIndex` pointer on the parent (LobeHub `models/message.ts`) plus a
unique client-id index, so the selected path is a parent walk, hidden branches
are never read, and the stale-flag bug class goes away. Amend ADR-0027.
- **Remove dead client state and unused indexes:** The staged-edit machinery is
unreachable because edits are durable-only (`chat-turn-controller.ts`,
`turn-store.ts`, `use-chat-core.ts`: every `pendingEdit` consumer acts only when
`!routePersists`). `hasDialogAuth` is duplicated and the `use-chat-core.ts` copy
is dead. `@tanstack/react-query` backs four call sites (a CSRF ping in
`layout-client.tsx` and three settings calls) with no invalidation; decide
whether to keep it. Five `chats` indexes are never queried (`by_user`,
`by_user_pinned`, `by_user_updated`, `by_user_pinned_project_updated`,
`by_project_updated`), and ADR-0005 cites
`getSidebarProjectPreviewsForCurrentUser`, which does not exist. The
search-image grid and the CSP-blocked `NAW_OFFICIAL` analytics script are dead
too ([grid](docs/audits/2026-09-26-open-source-reference-gaps.md#dead-search-image-grid),
[script](docs/audits/2026-09-26-open-source-reference-gaps.md#dead-analytics-script-blocked-by-our-csp)).
- **Bound the project directory read:** `convex/chats.ts` reads every project
chat times 12 full message docs just for a 320-character preview, so a 150-chat
project can exceed the 16 MiB read limit and any message write in the project
re-runs it. Paginate it and store the preview on the chat.
- **Move send counters off the users row:** They live on `users`
(`convex/usage.ts`), so every query reading that row re-runs on each send.
Guest counters already live in `apiRateLimits` fixed windows (ADR-0045); give
signed-in counters the same treatment.
- **Root layout bundle weight:** `route-bundle-stats.json` (Sep 23 build) shows
`/_not-found` at about 500 KB gzipped and login at about 580 KB, because the
root layout mounts every provider and Sentry replay and PostHog init eagerly.
Scope providers to the routes that need them and defer analytics init; verify
with the same stats file. Overlaps Thread code splitting above. Also check
whether PostHog session replay is on and whether it needs masking.
- **Model catalog staleness guard:** The resolver ignores route lifecycle even
for retired routes (`lib/model-route-resolver.ts`), CI checks only the generator
offline, the live smoke test is not wired into CI, the OpenRouter snapshot is
dated 2026-08-27, and the default free set includes two `:free` OpenRouter ids
(`lib/config.ts`). A delisted free model already failed once in July with a
generic error. Add a scheduled check against the provider's live `/models`
(Open WebUI `routers/openai.py`) and make the resolver skip retired routes.
