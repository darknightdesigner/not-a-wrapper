# Open-source reference gaps

Audit of `ac026463` on 2026-09-26. Each entry is a problem in our code that a
mature open-source chat app already handles better, with the evidence on both
sides and a proposed fix. Items already in `TODO.md` that day, decisions
recorded in `docs/adr/`, and settled product choices are left out. Every entry
was checked against the code by a second reader before it was written up.
Line numbers refer to the commits below and will drift.

The core held up well. The durable run lifecycle (leases, heartbeats, reaping,
first-terminal-wins settlement, signed admission), the authenticated handler
builders, the DNS-pinned MCP fetch, owner-bound BYOK encryption, and Markdown
rendering without raw HTML are as strict as or stricter than the references.
The gaps are at the edges: provider requests, attachments, MCP, deploys,
session handling, and tooling.

References (sibling checkouts):

| Repository | Commit |
| --- | --- |
| LibreChat | `7b2362d7a` |
| LobeHub | `b4518f3cce` |
| Open WebUI (`../OpenWebUI`) | `8bd8b4fac` |
| Vercel Chatbot (`../VercelChatbot`) | `c2f8235` |
| HuggingChat (`../HuggingChat`) | `1c9c9bcb` |
| trigger.dev | `c2b7a7218` |
| T3Code (`../T3Code`) | `95030dc674` |
| ChatGPT web capture (`../../reference-ui/ChatGPT`) | bundle of 2026-08-26 |

## Index

| Problem | Severity | Area |
| --- | --- | --- |
| [Text-like uploads break the chat](#text-like-uploads-break-the-chat) | High | Attachments and model input |
| [Old images break text-only models](#old-images-break-text-only-models) | Medium | Attachments and model input |
| [Images are never resized](#images-are-never-resized) | Medium | Attachments and model input |
| [Text-file budget drops the newest file](#text-file-budget-drops-the-newest-file) | Medium | Attachments and model input |
| [Tool-step cap can end a turn with no answer](#tool-step-cap-can-end-a-turn-with-no-answer) | Medium | Turn runtime and provider requests |
| [Anthropic prompt caching is never turned on](#anthropic-prompt-caching-is-never-turned-on) | Medium | Turn runtime and provider requests |
| [OpenAI keeps response storage on and gets no user id](#openai-keeps-response-storage-on-and-gets-no-user-id) | Medium | Turn runtime and provider requests |
| [Cached input tokens are billed at full price](#cached-input-tokens-are-billed-at-full-price) | Medium | Turn runtime and provider requests |
| [Every send uploads the whole conversation](#every-send-uploads-the-whole-conversation) | Medium | Turn runtime and provider requests |
| [MCP tool names break provider name rules](#mcp-tool-names-break-provider-name-rules) | Medium | Tools and MCP |
| [Large MCP results are dropped instead of trimmed](#large-mcp-results-are-dropped-instead-of-trimmed) | Medium | Tools and MCP |
| [Approval card hides tool arguments](#approval-card-hides-tool-arguments) | Medium | Tools and MCP |
| [Editing an MCP URL keeps the saved token](#editing-an-mcp-url-keeps-the-saved-token) | Medium | Tools and MCP |
| [MCP servers reconnect on every turn](#mcp-servers-reconnect-on-every-turn) | Medium | Tools and MCP |
| [Replay log writes to Redis about every 20 ms](#replay-log-writes-to-redis-about-every-20-ms) | Medium | Streaming and resume |
| [Auth actions have no rate limit](#auth-actions-have-no-rate-limit) | Medium | Accounts, sessions and privacy |
| [Analytics record emails and reset tokens](#analytics-record-emails-and-reset-tokens) | Medium | Accounts, sessions and privacy |
| [Guest chats are lost at sign-in](#guest-chats-are-lost-at-sign-in) | Medium | Accounts, sessions and privacy |
| [A signed-out tab keeps acting signed in](#a-signed-out-tab-keeps-acting-signed-in) | Medium | Accounts, sessions and privacy |
| [Shared chat pages can be indexed](#shared-chat-pages-can-be-indexed) | Medium | Accounts, sessions and privacy |
| [No per-user cap on running answers](#no-per-user-cap-on-running-answers) | Medium | Admission limits |
| [Two systems deploy production Convex](#two-systems-deploy-production-convex) | Medium | Deploys and version skew |
| [Open tabs never learn about a new version](#open-tabs-never-learn-about-a-new-version) | Medium | Deploys and version skew |
| [Backend failures never reach an alert](#backend-failures-never-reach-an-alert) | Medium | Observability and background work |
| [LaTeX with backslash delimiters renders broken](#latex-with-backslash-delimiters-renders-broken) | Medium | Rendering and composer |
| [Footnotes and reference links lose their targets](#footnotes-and-reference-links-lose-their-targets) | Medium | Rendering and composer |
| [Return always sends on phones](#return-always-sends-on-phones) | Medium | Rendering and composer |
| [Chats cannot move between projects](#chats-cannot-move-between-projects) | Medium | Product basics |
| [Large profile photos fail on Vercel](#large-profile-photos-fail-on-vercel) | Medium | Web security and platform limits |
| [Dependency alerts cannot see the lockfile](#dependency-alerts-cannot-see-the-lockfile) | Medium | Dependencies and tooling |
| [Local test and lint runs scan agent worktrees](#local-test-and-lint-runs-scan-agent-worktrees) | Medium | Dependencies and tooling |
| [PDF cost is estimated at about 20 tokens](#pdf-cost-is-estimated-at-about-20-tokens) | Low | Attachments and model input |
| [The model is never told the date](#the-model-is-never-told-the-date) | Low | Turn runtime and provider requests |
| [Follow-up user messages are saved as the browser sends them](#follow-up-user-messages-are-saved-as-the-browser-sends-them) | Low | Turn runtime and provider requests |
| [Title model costs more than the answer model](#title-model-costs-more-than-the-answer-model) | Low | Turn runtime and provider requests |
| [Signed-in chats keep New chat when the title fails](#signed-in-chats-keep-new-chat-when-the-title-fails) | Low | Turn runtime and provider requests |
| [MCP trust allowlist matches user-chosen names](#mcp-trust-allowlist-matches-user-chosen-names) | Low | Tools and MCP |
| [Refresh replay reprocesses every token](#refresh-replay-reprocesses-every-token) | Low | Streaming and resume |
| [The sending tab can replay its own answer](#the-sending-tab-can-replay-its-own-answer) | Low | Streaming and resume |
| [Stream probe reads the whole chat](#stream-probe-reads-the-whole-chat) | Low | Streaming and resume |
| [Drafts survive sign-out](#drafts-survive-sign-out) | Low | Accounts, sessions and privacy |
| [User bootstrap trusts browser-sent sync fields](#user-bootstrap-trusts-browser-sent-sync-fields) | Low | Accounts, sessions and privacy |
| [One user can exhaust the shared free-model quota](#one-user-can-exhaust-the-shared-free-model-quota) | Low | Admission limits |
| [Platform throttle shows the wrong error](#platform-throttle-shows-the-wrong-error) | Low | Admission limits |
| [Tool-limit rows are never deleted](#tool-limit-rows-are-never-deleted) | Low | Admission limits |
| [Feedback has no length or rate limit](#feedback-has-no-length-or-rate-limit) | Low | Admission limits |
| [A missing lazy chunk crashes the app](#a-missing-lazy-chunk-crashes-the-app) | Low | Deploys and version skew |
| [Chat API cannot recognize an outdated tab](#chat-api-cannot-recognize-an-outdated-tab) | Low | Deploys and version skew |
| [No backward-compatibility rule for Convex functions](#no-backward-compatibility-rule-for-convex-functions) | Low | Deploys and version skew |
| [Config is not validated at deploy](#config-is-not-validated-at-deploy) | Low | Observability and background work |
| [Sentry browser events have no release](#sentry-browser-events-have-no-release) | Low | Observability and background work |
| [Sentry prompt scrubber never matches](#sentry-prompt-scrubber-never-matches) | Low | Observability and background work |
| [CI actions are not pinned to commits](#ci-actions-are-not-pinned-to-commits) | Low | Observability and background work |
| [Crons poll every 15 seconds](#crons-poll-every-15-seconds) | Low | Observability and background work |
| [Approval sweep rescans every paused run](#approval-sweep-rescans-every-paused-run) | Low | Observability and background work |
| [Perplexity citation markers are not linked](#perplexity-citation-markers-are-not-linked) | Low | Rendering and composer |
| [Dead search-image grid](#dead-search-image-grid) | Low | Rendering and composer |
| [Dead analytics script blocked by our CSP](#dead-analytics-script-blocked-by-our-csp) | Low | Rendering and composer |
| [Chats cannot be exported](#chats-cannot-be-exported) | Low | Product basics |
| [Two text fields zoom the page on iPhone](#two-text-fields-zoom-the-page-on-iphone) | Low | Mobile and accessibility |
| [Phone history drawer buttons have no names](#phone-history-drawer-buttons-have-no-names) | Low | Mobile and accessibility |
| [Image optimizer accepts any Convex host](#image-optimizer-accepts-any-convex-host) | Low | Web security and platform limits |
| [Cross-Origin-Opener-Policy header is missing](#cross-origin-opener-policy-header-is-missing) | Low | Web security and platform limits |
| [CSP allows inline scripts and never reports](#csp-allows-inline-scripts-and-never-reports) | Low | Web security and platform limits |
| [Lint lost the TypeScript rules](#lint-lost-the-typescript-rules) | Low | Dependencies and tooling |
| [Node versions differ across environments](#node-versions-differ-across-environments) | Low | Dependencies and tooling |
| [Formatting is never checked](#formatting-is-never-checked) | Low | Dependencies and tooling |

## Attachments and model input

### Text-like uploads break the chat

Severity: High.

**What is wrong.** The file picker offers Markdown, CSV, JSON and Excel files,
and the upload checks accept all of them except old `.xls` files. On the
server only `text/plain` files are turned into text for the model. Every other
type is sent as a raw file part, and the AI SDK providers for Claude, GPT and
Mistral refuse the text-like ones before the request reaches the provider, so
the user sees "An error occurred. Please try again." The file is saved with
the message and edits keep it, so Retry and every later turn in that chat fail
the same way, including on the platform-paid GPT-5 Mini.

**Our code.**
- `lib/file/policy.ts:3-15`: allows `text/markdown`, `application/json`,
  `text/csv` and both Excel types. `lib/file/validation.ts:11-16,69-80` lets
  the text types in through its text fallback, and XLSX passes on its
  detected type (lines 62-67).
- `app/api/chat/text-file-parts.ts:60-66`: `isPlainTextFilePart` matches only
  `text/plain`. `convex/files.ts:136` and
  `lib/chat-turn/prompt-size-policy.ts:51,69` have the same `text/plain`-only
  check.
- `app/api/chat/adapters/openai.ts:31-37`, `adapters/anthropic.ts:212` and
  `adapters/openai-compatible.ts:45-52`: drop only replay artifacts such as
  step markers and sources, so the file part reaches the SDK, which throws
  (`node_modules/@ai-sdk/anthropic/dist/index.js:2662-2665`,
  `node_modules/@ai-sdk/openai/dist/index.js:4830-4834`,
  `node_modules/@ai-sdk/mistral/dist/index.js:116-126`).
- `lib/chat-turn/turn-plans.ts:147-154`: an edit copies the original file
  parts onto the edited message, so editing does not remove the file.
- `app/api/chat/public-error.ts:183-197`: turns the failure into a generic,
  retryable error.

**How references handle it.**
- HuggingChat, `src/lib/constants/mime.ts:4-9` and
  `src/lib/server/textGeneration/utils/prepareFiles.ts:592-625`: every
  text-like type (`text/*`, JSON, XML, CSV) is inlined into the prompt as a
  `<document>` text block and never sent as a binary part.
- LibreChat, `packages/data-provider/src/resolve-llm-delivery-path.ts:81-89`
  and `133-140`: only images, video, audio and PDF go to the provider as
  files. Everything else defaults to text, and `isNativelyReadableText` names
  the types that can be read directly. Lines 191-227 downgrade a type to text
  (or keep it off the model path) when the endpoint cannot take it.
- VercelChatbot, `app/(chat)/api/files/upload/route.ts:13-15`: accepts only
  JPEG and PNG, so a text-like file never reaches a model as a raw file.

**Fix.**
1. Add one `isTextLikeMediaType` helper in `lib/file/policy.ts` (`text/*`,
   `application/json`, CSV), modeled on LibreChat's `isNativelyReadableText`.
2. Use it in `isPlainTextFilePart` (`app/api/chat/text-file-parts.ts`), the
   trusted-attachment filter (`convex/files.ts:136`) and
   `lib/chat-turn/prompt-size-policy.ts:51,69`. Markdown, CSV and JSON then
   take the text-inlining path we already have. Changing only the first one
   makes them fail as "attachment is not available for model input".
3. Remove XLS and XLSX from `ALLOWED_FILE_TYPES` (`lib/file/policy.ts`) and
   `MIME_TO_EXTENSIONS` (`lib/file/validation.ts`) until there is a
   spreadsheet extractor.
4. As a safety net, add a step in `app/api/chat/chat-turn-runtime.ts` next to
   `lowerForeignHostedToolParts` that swaps any file part the target route
   cannot take for a short text note, so chats that are already broken
   recover instead of failing every turn.

**Notes.** The GPT and Claude SDKs pass only image and PDF links through as
links (`node_modules/@ai-sdk/openai/dist/index.js:6424-6427`), so a CSV link
is downloaded first and then hits the same error. OpenRouter does not throw. It
forwards the file as a generic file part, and what the upstream model then
does is unverified. The step in item 4 is the same capability step the next
entry needs, so build it once.

### Old images break text-only models

Severity: Medium.

**What is wrong.** We only check that the model can see images when the
newest message has an image. Images from earlier turns are still replayed on
every turn. If a user shares a screenshot and then switches the chat to a
text-only model (DeepSeek, GLM, Qwen, Kimi, gpt-oss, Codestral, or the
platform-funded free Nemotron), the provider rejects the whole request. Every
later message fails with "An error occurred. Please try again." until the user
switches back to a model that can see images.

**Our code.**
- `app/api/chat/api.ts:154-164`: `turnRequiresVision` reads only
  `messages.at(-1)`. Line 303 is the only vision requirement passed to the
  resolver (`lib/model-route-resolver.ts:233`).
- `app/api/chat/api.test.ts:449`: locks in that earlier images do not force a
  vision route. The test uses Sonar, whose text-only adapter drops files, so
  it never covers a target that keeps them.
- `app/api/chat/adapters/types.ts:3-11`: `AdaptationContext` carries no
  capability info, and adapters are picked by vendor only
  (`app/api/chat/adapters/index.ts:76-91`).
- `app/api/chat/adapters/openai-compatible.ts:45-52` and
  `adapters/default.ts:20-25`: keep `file` parts (the OpenAI, Anthropic and
  Google adapters do too). Only `adapters/text-only.ts:17-25`, used for
  Perplexity, drops them.
- `app/components/chat-input/composer.tsx:243-244`: hides the attach button
  on non-vision models, but nothing checks the chat's existing images on a
  model switch.

**How references handle it.**
- LobeHub, `packages/context-engine/src/processors/MessageContent.ts:203-259`:
  checks `isCanUseVision` for every user message, including history already
  stored as mixed text-and-image parts, and swaps each image for
  `VISION_DOWNGRADE_PLACEHOLDER` (lines 24-32, whose comment notes that
  DeepSeek rejects a raw image part with a 400 error). Images are added back
  only when vision is allowed (287-298). The capability is wired in at
  `src/services/chat/mecha/contextEngineering.ts:320`, and
  `packages/context-engine/src/processors/__tests__/MessageContent.test.ts:159-190`
  covers the switch-to-DeepSeek case.
- HuggingChat, `src/lib/server/textGeneration/utils/prepareFiles.ts:453-471`
  and `604-614`: each replayed user message gets image parts only when the
  model can read images (`isMultimodal`). Otherwise it is sent as text only.

**Fix.**
1. Add `vision` (from `route.config.vision`) to `AdaptationContext` in
   `app/api/chat/adapters/types.ts`, set where the context is built in
   `app/api/chat/chat-turn-runtime.ts:915-920`.
2. In `chat-turn-runtime.ts`, add one step before `adaptHistoryForProvider`,
   next to `lowerForeignHostedToolParts` (937-956). When `vision` is not true,
   replace each history file part of type `image/*` or `application/pdf` with
   a short note such as "[image omitted: this model cannot view images]". Log
   the count the way `hosted_tool_history_lowered` does.
3. Keep `turnRequiresVision` as the hard gate for images in the current turn.
4. Update the "do not silently flatten" comment at
   `chat-turn-runtime.ts:1007-1011` to say this downgrade is deliberate and
   logged.
5. Add one row to `app/api/chat/provider-request-replay-matrix.test.ts`: image
   in history, non-vision OpenRouter target, no file part in the request.

**Notes.** About 38 models are exposed (42 of 119 logical models lack vision,
and the 4 Sonar models are already safe), including direct Codestral
(`lib/models/data/mistral.ts:126`) and the free Nemotron
(`lib/models/data/openrouter.generated.ts:66`). The catalog has no PDF flag
(`lib/models/types.ts:213` has only `vision`) and the composer gates every
upload on `vision`, so the step keys on `vision` and covers PDFs too. PDF
failures on these routes are not yet verified. Optional follow-up: a soft
resolver preference for a vision route when history has images, like the
effort preference.

### Images are never resized

Severity: Medium.

**What is wrong.** We store and replay every image exactly as uploaded, at
full size. Claude rejects any image over 8000 px on a side, and a full-page
website screenshot is often that large. Because history replays every image
on every turn, one oversized image makes every later Claude reply in that chat
fail with a generic error. A chat with more than 20 images hits a second
Claude rule: every image must then be 2000 px or smaller.

**Our code.**
- `lib/file/policy.ts:1`: a 10 MB byte cap is the only size rule.
- `lib/file-handling.ts:24-111`: uploads the raw `File` bytes to Convex
  storage unchanged. `convex/files.ts:56-66,240-247` check only byte size and
  MIME type.
- `convex/profileImageValidation.ts:1-12`: `sharp` (`package.json:103`)
  already runs in a Convex `"use node"` action, but only to validate profile
  images.
- `convex/chats.ts:452-460`: saves each attachment as a `file` part with its
  storage URL, and history replays that part on every turn.

**How references handle it.**
- LibreChat, `api/server/services/Files/images/resize.js:19-22` and `52-79`:
  "high" mode caps the short side at 768 px and the long side at 1568 px for
  Anthropic (2000 px otherwise). It runs when an image is uploaded
  (`api/server/services/Files/Local/images.js:31-39`), so the stored copy is
  always safe to send.
- HuggingChat, `src/lib/server/endpoints/images.ts:41-89`: resizes and
  re-encodes each image for the target endpoint when it exceeds `maxWidth`,
  `maxHeight` or `maxSizeInMB`. The OpenAI endpoint defaults to 1024 px and
  1 MB (`src/lib/server/endpoints/openai/endpointOai.ts:44-47`, applied at
  line 118).

**Fix.** Shrink images once, when they are staged, so the stored file is safe
for every model. Add a Convex `"use node"` action next to
`convex/profileImageValidation.ts` that runs `sharp` on the staged file, caps
the long side at about 2000 px (LibreChat uses 1568 px for Claude), re-encodes
large files as JPEG or WebP, and writes the resized copy back to storage. A
canvas pass in `lib/file-handling.ts` before `uploadStagedFile` is simpler,
but a client that uploads directly can skip it. As a cheap backstop, teach
`app/api/chat/public-error.ts` to name the oversized attachment for the "image
dimensions exceed" and "many-image" provider errors.

**Notes.** The 8000 px and 2000 px limits come from Anthropic's vision docs.
Claude is called through `@ai-sdk/anthropic`, which sends image links, not
the image bytes (`node_modules/@ai-sdk/anthropic/dist/index.js:7185-7188`),
so pixel size is the problem, not file size. The 20-image case is rare
because non-premium users get 5 uploads a day (`convex/files.ts:23`), but the
tall-screenshot case needs only one upload. The token saving is small (about
4.8K to 3.9K tokens per high-res image), so this is a reliability fix. Claude
runs only on user keys today, so the broken chats hit users who bring their
own Claude key.

### Text-file budget drops the newest file

Severity: Medium.

**What is wrong.** On every turn the server re-reads the text files from the
whole chat, up to 4 files and 256 KB, and it spends that budget oldest first.
So once a chat already holds 4 text files (fewer if they are large), the file
the user just attached is replaced with a "could not be read for model input"
note, and the model answers without it. For signed-in users every paste of
10,000+ characters becomes a "Pasted text N.txt" file, so the 5th big paste in
a chat is silently lost. The UI shows nothing, and the failure only reaches a
server log.

**Our code.**
- `app/api/chat/text-file-parts.ts:3-7`: 128 KB per file, 4 files and 256 KB
  per request, 5 s per fetch and 8 s overall.
- `app/api/chat/text-file-parts.ts:319-439`: one oldest-to-newest loop. The
  file-count (344-355), byte (357-368) and deadline (370-382) checks all run
  out on the newest files.
- `app/api/chat/durable-generation-input.ts:110-116` and
  `app/api/chat/chat-turn-runtime.ts:895-897`: both callers convert the whole
  history (`convertOnlyLatestUserMessage` stays off).
- `app/components/chat-input/large-paste-policy.ts:37-39`,
  `pending-attachment.ts:76-84` and `composer.tsx:296`: a long paste becomes
  an uploaded `text/plain` file for signed-in users.
- `app/api/chat/chat-turn-runtime.ts:900-913`: failures only reach a log line.

**How references handle it.**
- HuggingChat, `src/lib/server/textGeneration/utils/prepareFiles.ts:453-471`
  and `592-625`: each replayed user message inlines all of its text files with
  no file-count cap, so the current turn's file is never dropped.
- LibreChat, `packages/api/src/files/context.ts:67-89`: reads text already
  stored on the file record (`file.text`) and caps each file by tokens, with
  no file-count cap.

**Fix.** In `prepareTextFilePartsForModelInput`
(`app/api/chat/text-file-parts.ts:290-453`), spend the file, byte and time
budgets newest first: convert the latest user message's files, then walk back
through older messages. An older file that does not fit gets the existing
`skippedTextFilePartToPromptText` note (lines 268-270, "was provided earlier
in the conversation and was not re-read"), not the "could not be read" error.
Keep the output in the original message order. Optionally, pass a short
notice to the run when the current turn's own file cannot be read, so the UI
can show it.

**Notes.** Converting the whole history is deliberate: commit `0b0af37a`
dropped `convertOnlyLatestUserMessage: true` so older files stay readable.
Keep that and change only the order. Storing extracted text on the
`chatAttachments` row, as LibreChat does, is optional and not needed for this
fix.

### PDF cost is estimated at about 20 tokens

Severity: Low.

**What is wrong.** Before a platform-paid turn runs, we estimate its cost and
reserve that amount from the user's free allowance. A PDF is counted as the
length of its storage URL, about 20 tokens, but the model receives the whole
PDF on every turn, which can cost tens of thousands of tokens. The real cost
is still recorded after the turn, so nothing is lost, but the up-front check
cannot stop a turn that pushes a nearly empty allowance below zero.

**Our code.**
- `lib/usage/platform-usage-estimate.ts:64-73`: any non-image file counts as
  the length of its `url` string. The comment at 69-70 says these files are
  inlined as text, which is true only for `text/plain`
  (`app/api/chat/text-file-parts.ts:60-66`).
- `lib/usage/platform-usage-estimate.ts:37`: every image is a flat 1,100
  tokens.
- `lib/model-route-resolver.ts:450-456`: this estimate sizes the platform
  reservation.
- `convex/schema.ts:472`: `fileSize` lives on the `chatAttachments` row, not
  on the message part, so the estimate cannot see it today.

**How references handle it.**
- LibreChat, `packages/api/src/agents/client.ts:55-58` and `221-266`:
  estimates a PDF by pages (75 KB of base64 per page, 2,000 tokens per page
  for Claude and 1,500 for OpenAI), and uses a flat 2,000 tokens for
  URL-sourced documents like ours.
- LibreChat, `packages/api/src/agents/client.ts:192-201`: sizes inline images
  from their real dimensions with each provider's formula.

**Fix.** Extend the preflight in `app/api/chat/durable-generation-input.ts` to
look up `fileSize` and media type for PDF parts. Its attachment query
(`getTrustedTextAttachmentsForChat`, `convex/files.ts:410-450`) already
returns `size`, but only for `text/plain` rows, so widen it or add a sibling
query. In `estimateMessageTokens`
(`lib/usage/platform-usage-estimate.ts:58-89`), estimate a PDF as
`ceil(fileSize / ~55 KB)` pages times about 1,500 tokens, capped at the
route's context window, and use a flat 2,000 tokens when the size is unknown.
Fix the comment at lines 69-70. Keep images at the flat allowance until images
are resized at upload (see "Images are never resized").

**Notes.** Only cheap models are platform-funded (`lib/config.ts:7-13`: GPT-5
Mini, Mistral Large, Pixtral and two free OpenRouter models), so the worst gap
is roughly $0.10 to $0.26 per turn against a $1 monthly free grant
(`convex/domain/usage_plan_policy.ts:26-29`), and a negative balance blocks
the next reservation (`convex/usageAllowance.ts:325-337`). ADR-0021
(`docs/adr/0021-platform-usage-allowance.md:338-352`) already accepts input
overruns, but it assumes an "attachments allowance" that does not exist for
PDFs.

## Turn runtime and provider requests

### Tool-step cap can end a turn with no answer

Severity: Medium.

**What is wrong.** Each turn has a cap on model rounds: 20 for signed-in users
with tools, 5 for guests with tools, and 10 when there are no tools. Tools stay
callable on the last allowed round, so if the model calls a tool there, the
tool runs (and costs money), then the loop stops before the model can read the
result. The run is saved as completed with finish reason `tool-calls` and no
answer, or with a dangling "Let me check..." sentence. The user sees tool
activity and no warning, and when there is no text there is also no "Try again"
button, because that button only shows when there is text.

**Our code.**
- `app/api/chat/chat-turn-runtime.ts:772-776`: picks `maxSteps`
  (`MCP_MAX_STEP_COUNT`, `ANONYMOUS_MAX_STEP_COUNT`, `DEFAULT_MAX_STEP_COUNT`).
- `app/api/chat/chat-turn-runtime.ts:1500-1502`: stops the loop with
  `isStepCount(maxSteps)`; nothing changes on the final step.
- `app/api/chat/chat-turn-runtime.ts:1537-1552` and
  `lib/tools/runtime.ts:1016-1023`: `prepareStep` only filters `activeTools`
  and caps output tokens, so tools stay on for the last step.
- `app/api/chat/durable-turn-runtime.ts:2137-2144`: saves the run as completed
  with that `tool-calls` finish reason.
- `app/components/chat/message-assistant.tsx:248-264` and `:176-180`: only
  `finishReason === "length"` gets a notice, and the footer actions (including
  Try again) require copyable text.

**How references handle it.**
- LobeHub, `packages/agent-runtime/src/core/runtime.ts:92-101`: sets
  `forceFinish` once `maxSteps` is passed. Then
  `packages/context-engine/src/engine/tools/buildStepToolDelta.ts:64-67` strips
  all tools and
  `packages/context-engine/src/providers/ForceFinishSummaryInjector.ts:37-55`
  adds a system message saying the step limit is reached, so the last call
  writes a final text answer.
- HuggingChat, `src/lib/server/textGeneration/mcp/runMcpFlow.ts:1380-1391`:
  when the tool-round budget runs out, ends with the last assistant text or a
  fixed "stopped after too many tool steps" message, and returns an `exhausted`
  outcome.

**Fix.**
1. In the composed `prepareStep` in `app/api/chat/chat-turn-runtime.ts`
   (1537-1552), when `options.stepNumber === maxSteps - 1`, return
   `toolChoice: "none"` plus `instructions` set to `enrichedSystemPrompt` and
   one line: "You have reached the tool step limit. Answer now using what you
   already have." Use `toolChoice: "none"` instead of removing tools, because
   Anthropic rejects tool blocks in history without tool definitions. This
   adds no model call; AI SDK 7 `prepareStep` supports both fields.
2. In `app/components/chat/message-assistant.tsx`, treat a settled turn with
   finish reason `tool-calls` (status not `awaiting_approval`) like the
   `length` case: a short warning with a Try again button, even with no text.
3. Leave the output-allowance stop alone (ADR-0028).

**Notes.** Guest web search on gpt-5-mini is OpenAI's hosted tool and does not
use up steps, so the realistic triggers are signed-in MCP loops that hit 20
steps, or a guest doing 5 page reads in a row. VercelChatbot also uses a bare
`isStepCount(5)` (`app/(chat)/api/chat/route.ts:305`), so this is a proven
better pattern, not a universal one. The TODO.md "Time-limit cutoff" item
covers the 265 s deadline, which is a different stop.

### Anthropic prompt caching is never turned on

Severity: Medium.

**What is wrong.** Claude only discounts the repeated start of a prompt when
the app asks for caching, and we never ask, even though the installed SDKs
support it. Every new message in a Claude chat resends the whole history at
full input price, and every MCP or Exa tool step inside a turn resends it
again. Long Claude chats and multi-step MCP turns cost more, and the first
words take longer to appear.

**Our code.**
- `lib/openproviders/request-shaping.ts:113-142`: the Anthropic branch sends
  only `thinking` and `effort`, no `cacheControl`.
- `lib/openproviders/request-shaping.ts:171-175`: OpenRouter routes (including
  `anthropic/*`) get no per-request options; we set their options only at
  model construction.
- `lib/openproviders/provider-strategy.ts:48-57`: `toOpenRouterChatSettings`
  maps only reasoning, not caching.
- `app/api/chat/chat-turn-runtime.ts:1057-1064` and `:1611`: `shapeRequest` is
  the only source of `providerOptions`; no middleware adds caching.
- `app/api/chat/chat-turn-runtime.ts:772-776`: up to 20 steps per turn, each
  resending the full prompt.

**How references handle it.**
- LobeHub,
  `packages/model-runtime/src/core/anthropicCompatibleFactory/index.ts:164`
  and `:185-193`: caching defaults to on and the system prompt gets
  `cache_control: ephemeral`.
  `packages/model-runtime/src/core/contextBuilders/anthropic.ts:433-475` also
  marks the last message and the last tool.
- LibreChat, `packages/data-provider/src/schemas.ts:642-644`: Anthropic
  `promptCache` defaults to true,
  `packages/api/src/endpoints/anthropic/llm.ts:281-291` applies it, and
  `packages/api/src/endpoints/openai/config.ts:20` turns it on for OpenRouter
  too.

**Fix.**
1. In `lib/openproviders/request-shaping.ts`, add
   `cacheControl: { type: "ephemeral" }` to both Anthropic returns (adaptive
   at 127-132, fixed budget at 141). `@ai-sdk/anthropic` 4.0.40 sends it as
   Anthropic's request-level automatic cache point. Every Claude route has
   `reasoningText: true`, so the early `{}` return at line 109 does not block
   this.
2. For OpenRouter `anthropic/*` routes, extend `toOpenRouterChatSettings` in
   `lib/openproviders/provider-strategy.ts` to set the provider's
   construction-time `cache_control` setting (supported in
   `@openrouter/ai-sdk-provider` 3.0.0), only for `anthropic/*` ids, the same
   way reasoning is mapped.
3. Verify with a two-step MCP turn on Claude: the second step's
   `usage.inputTokenDetails.cacheReadTokens` should be above 0, and
   `cachedInputTokens` should show in generation stats.

**Notes.** Claude runs only on user keys today (`FREE_MODELS_IDS` at
`lib/config.ts:7-13` has no Claude route), so the cost lands on BYOK users, not
the platform. Short chats gain nothing: the default system prompt is one
sentence, far below Anthropic's minimum cacheable size. Claude web search runs
server-side inside one call, so the savings come from long chats and MCP or Exa
tool loops. OpenAI already caches automatically; a per-user `promptCacheKey` is
an optional, low-value extra. If Claude ever becomes platform-funded, the
ledger must first price cache writes (1.25x the input price) and cache reads
(see "Cached input tokens are billed at full price").

### OpenAI keeps response storage on and gets no user id

Severity: Medium.

**What is wrong.** Guests and free signed-in users on gpt-5-mini chat through
our one platform OpenAI key, and we never tell OpenAI (or Anthropic) which
person sent a request. If one guest breaks the usage policy, OpenAI can only
act on our whole org, which could restrict the default model for everyone.
Separately, we never set `store: false`, so the Responses API keeps a stored,
retrievable copy of every response in our OpenAI dashboard. We get nothing
from that copy, and it is the reason history replay needs an id-stripping
workaround.

**Our code.**
- `lib/openproviders/request-shaping.ts:109`: non-reasoning models get no
  provider options at all.
- `lib/openproviders/request-shaping.ts:154-160`: OpenAI gets only
  `reasoningEffort` and `reasoningSummary`; no `store`, no `safetyIdentifier`.
- `lib/openproviders/provider-strategy.ts:159-165`: `provider(id)` builds a
  Responses API model, and OpenAI stores responses by default when `store` is
  left out.
- `app/api/chat/adapters/openai.ts:157-218`: strips item ids from history,
  because the store-on default turns them into server lookups that can 400.
- `lib/chat-title.ts:175-183`: the title call also sends no user id.

**How references handle it.**
- LobeHub,
  `packages/model-runtime/src/core/openaiCompatibleFactory/index.ts:1616-1638`:
  every Responses call sends `store: false`, a `prompt_cache_key`, and
  `safety_identifier` set to the user id (passed from
  `src/app/(backend)/webapi/chat/[provider]/route.ts:40`).
- LobeHub,
  `packages/model-runtime/src/core/anthropicCompatibleFactory/index.ts:594-597`:
  sends `metadata.user_id` to Anthropic.
- LibreChat, `packages/api/src/endpoints/openai/initialize.ts:190-194`: sends
  the user id as `user` on OpenAI requests.

**Fix.**
1. Add a hashed actor id (an HMAC of the WorkOS subject or guest id, never the
   email) to `RequestShapingContext`, passed in from
   `app/api/chat/chat-turn-runtime.ts`.
2. In `lib/openproviders/request-shaping.ts`, add an OpenAI block outside the
   reasoning-only gate so every OpenAI request sends
   `openai: { safetyIdentifier, store: false }`. Also send
   `anthropic.metadata.userId`, set OpenRouter's `user` at construction in
   `lib/openproviders/provider-strategy.ts`, and pass the same id on the title
   call in `lib/chat-title.ts`.
3. Do not add `include` by hand; the SDK adds `reasoning.encrypted_content`
   itself when `store` is false.
4. Before shipping `store: false`, check live on a reasoning model: a hosted
   web search followed by a function or MCP tool in one turn, an approval
   continuation, and ADR-0041 reasoning timing. Keep the web_search lowering
   to text; the SDK still will not replay hosted search results with store
   off.
5. Record the retention and identifier choice in ADR-0021.

**Notes.** Severity rests on the safety-id half; the storage half alone would
be low. `store: false` only removes the stored response object: OpenAI still
keeps abuse-monitoring logs for up to 30 days, and we already hold every
conversation in Convex. BYOK responses land in the user's own OpenAI org. xAI
is BYOK-only and `@ai-sdk/xai` 4.0.42 has no `safetyIdentifier` field, so only
`store: false` applies there. Pairs with the TODO.md "Guest abuse and spending
limits" item, which covers our own admission limits, not provider-side
attribution.

### Cached input tokens are billed at full price

Severity: Medium.

**What is wrong.** OpenAI caches gpt-5-mini prompts automatically and charges
about 10% of the normal input price for tokens read from that cache. Our usage
meter charges every input token at the full input rate, cached or not. On
longer gpt-5-mini chats the allowance can record a turn at 2 to 4 times its
real cost, so users run out of their included allowance early. ADR-0021
defines 1 credit as 1 micro-USD of real cost, so the ledger breaks its own
contract.

**Our code.**
- `lib/usage/billable-pricing.ts:36-53`: compiles only an input and an output
  rate per route.
- `convex/domain/usage_accounting.ts:62-72`: `computeUsageCredits` prices all
  input tokens at one rate; `:251-259` uses it for actual settlement.
- `convex/lib/usageValidators.ts:9-16` and `:86-98`: the pricing snapshot and
  the usage evidence have no cache fields.
- `app/api/chat/chat-turn-runtime.ts:1839-1850` and
  `app/api/chat/durable-turn-runtime.ts:1890-1902`: forward only
  `inputTokens` and `outputTokens`. In AI SDK 7, `inputTokens` already
  includes cache reads.
- `app/api/chat/generation-timing.ts:127-128`: the cache split is read, but
  only for the stats display.

**How references handle it.**
- LibreChat, `packages/api/src/agents/usage.ts:124-145`: splits usage into
  plain input, cache read, and cache write; `:215-247` bills each at its own
  rate. `packages/data-schemas/src/methods/tx.ts:358` holds the cache rates,
  with gpt-5-mini reads at 0.025 (`:409`).
- LobeHub, `packages/model-bank/src/aiModels/openai.ts:934-940`: lists
  gpt-5-mini `textInput_cacheRead` at 0.025;
  `packages/model-runtime/src/core/usageConverters/utils/computeChatCost.ts:144-155`
  and `:186-209` bill cache misses and cache reads separately.

**Fix.**
1. Add an optional `cachedInputCost` (USD per 1M tokens) to `ModelConfig` in
   `lib/models/types.ts`, and set it for gpt-5-mini (0.025) and Mistral if it
   applies.
2. In `buildRoutePricingRate` (`lib/usage/billable-pricing.ts`), compile an
   optional `cacheReadCreditsPerMTok` into `vRoutePricingRate` and the signed
   snapshot.
3. Carry `usage.inputTokenDetails.cacheReadTokens` through `captureFinish`,
   the per-step `recordToolInvocations` usage, and
   `vPrimaryTerminalUsageEvidence`.
4. In `computeUsageCredits`, charge `inputTokens - cacheRead` at the input
   rate plus `cacheRead` at the read rate. Fall back to today's math when the
   rate or the count is missing. Keep reservations at the full rate.
5. Bump `PLATFORM_PRICING_REVISION` and add a one-line note to ADR-0021.

**Notes.** The error favors the business: users are overcharged, and we never
lose money. Only signed-in gpt-5-mini turns (and possibly Mistral) are
affected today; anonymous turns are subsidized, not metered, and the metered
OpenRouter routes are free. Cache-write rates and OpenRouter cache prices can
wait until a metered route needs them. Fix this before the TODO.md
"Monetization" work bills real money from this ledger. The TODO.md "Hosted
search fees" item is a separate undercharge in the same ledger.

### Every send uploads the whole conversation

Severity: Medium.

**What is wrong.** Every send posts the whole visible conversation (the
selected branch) to `/api/chat`: every past answer, tool output, search
result, and file part. For signed-in chats the server throws almost all of it
away and rebuilds history from Convex; it only needs the newest user message
or the trailing approval. On long, search-heavy chats this can upload
megabytes per send, which can add seconds before the reply starts on a phone.
A very long chat can pass Vercel's 4.5 MB body limit, and then every send
fails with an unclear 413.

**Our code.**
- `app/components/chat/use-detachable-chat-stream.ts:184-237`:
  `AcceptanceAwareChatTransport` has no `prepareSendMessagesRequest`, so the
  SDK's default body includes all `options.messages`.
- `app/api/chat/route.ts:101` and
  `lib/chat-messages/chat-turn-contract.ts:128-199`: parse the full body and
  only check that `messages` is an array.
- `app/api/chat/chat-turn-runtime.ts:825`: durable turns use
  `generationInput?.messages`, the Convex history.
- `app/api/chat/durable-turn-runtime.ts:515-535` and
  `app/api/chat/approval-continuation.ts:76-90`: the only wire reads are the
  last user message and the trailing assistant's approvals.
- `app/api/chat/chat-turn-runtime.ts:349-361`: `normalizeChatVersion` falls
  back to the wire `messages.length` when `chatVersion` is missing (used for
  analytics at `:634`).

**How references handle it.**
- VercelChatbot, `hooks/use-active-chat.tsx:150-172`:
  `prepareSendMessagesRequest` sends only the last message, and full
  `messages` only for a tool-approval continuation.
  `app/(chat)/api/chat/schema.ts:17-35` validates that small shape strictly,
  and `app/(chat)/api/chat/route.ts:124-171` loads history from the database.
- HuggingChat, `src/lib/utils/messageUpdates.ts:57-79`: posts only the new
  input text, the message id, a few flags, and files.

**Fix.**
1. Add `prepareSendMessagesRequest` to `AcceptanceAwareChatTransport` in
   `app/components/chat/use-detachable-chat-stream.ts`. For signed-in
   (durable) chats, send only the trailing message: the new user message, or
   the trailing assistant for an approval continuation. Key on the trailing
   assistant like `readApprovalContinuation`, not on any message in history
   as VercelChatbot does. Send no history for edit and regeneration, which
   carry their own payloads. Keep full history for guest chats.
2. Always send `chatVersion`, or drop the wire-length fallback in
   `normalizeChatVersion`.
3. In `ChatTurnWireRequest` and `parseChatTurnRequest`
   (`lib/chat-messages/chat-turn-contract.ts`), accept 0 to 1 messages for
   durable requests and reject more with a 400.
4. For guests, check the body size on the client before sending, and map a
   413 to a clear message. A server-side cap cannot help, because Vercel
   rejects an over-limit body before our code runs.

**Notes.** The hard 413 failure is a tail case; the steady cost is upload time
on long chats. Anthropic web search results carry `encryptedContent`, which we
keep in history (`app/api/chat/adapters/anthropic.ts:55-58`) and which inflates
the body. The client context gate (`lib/chat-turn/prompt-size-policy.ts`)
counts text parts only, so it does not catch this. After the change, confirm
`getFirstUserText(messages)` (`app/api/chat/chat-turn-runtime.ts:1141`) and
`parseDeterministicPerfDirective` (`:730`) still work with a trailing-only
body.

### The model is never told the date

Severity: Low.

**What is wrong.** The model never gets today's date. Its instructions are the
user's custom prompt or a one-line default, plus one OpenAI-only sentence
about tool updates. Models assume the world stopped at their training cutoff,
so questions like "latest iPhone", "this week", or "days until Christmas" can
search for the wrong year or get date math wrong. Web search is on by default,
which makes this more visible.

**Our code.**
- `lib/config.ts:25`: `SYSTEM_PROMPT_DEFAULT` is one sentence with no date.
- `app/api/chat/chat-turn-runtime.ts:616`: picks the custom or the default
  prompt.
- `app/api/chat/chat-turn-runtime.ts:1071-1076`: `enrichedSystemPrompt` adds
  only the OpenAI tool-progress sentence; it is sent as `instructions` at
  `:1497`.
- `lib/tools/third-party.ts:137`: the Exa `web_search` description tells the
  model not to append the current year. That is a workaround, and it does not
  reach native OpenAI, Anthropic, or Google search, or plain answers.

**How references handle it.**
- HuggingChat, `src/lib/server/textGeneration/utils/toolPrompt.ts:32-82`: when
  tools are offered, adds a "Current date and time ... (YYYY-MM-DD)" line in
  the user's timezone, with a fallback when the zone is invalid, and a search
  rule to use today's year for recent topics.
- LibreChat, `packages/api/src/tools/toolkits/web.ts:4-29`: adds a web-search
  runtime context with the conversation date and time, and tells the model to
  use it when recency matters.

**Fix.** In `app/api/chat/chat-turn-runtime.ts`, where `enrichedSystemPrompt`
is built (1071-1076), always append one line after the custom or default
prompt: `Current date: <weekday, Month D, YYYY> (<IANA zone>)`. Keep it to the
day, not the minute, so the prompt prefix stays cacheable. Read the zone from
Vercel's `x-vercel-ip-timezone` request header, validate it with a try/catch
around `Intl` like HuggingChat, and fall back to UTC. Then change the Exa rule
in `lib/tools/third-party.ts` to "use today's year for recent topics".

**Notes.** VercelChatbot adds only location hints and OpenWebUI has an opt-in
`{{CURRENT_DATE}}` template variable, so this is common but not universal.
ADR-0040 keeps custom prompts authoritative only for progress-update style; a
factual date line does not conflict with it.

### Follow-up user messages are saved as the browser sends them

Severity: Low.

**What is wrong.** For the first message, the server builds the saved user
message itself from validated attachment bindings. For every later message and
for edits, it saves `parts` and `content` exactly as the browser sent them,
through `v.any()` validators. Only someone tampering with their own requests
can use this, and only on their own chat, so it is an integrity gap, not a
cross-user hole. The visible effects: `content` and `parts` can disagree (the
public share page shows `content`, the model got `parts`), and image or PDF
parts with any URL or media type skip the upload checks and are re-sent on
every later turn.

**Our code.**
- `lib/chat-messages/chat-turn-contract.ts:128-199`: only checks that
  `messages` is an array.
- `app/api/chat/durable-turn-runtime.ts:1559-1599`: forwards the latest user
  message's `parts` and separate `content` unchanged to `prepareGeneration`.
- `convex/chatRuntime.ts:273-291`: `vStoredMessage` and the edit
  `replacementMessage` accept `parts: v.any()`.
- `convex/chatRuntime.ts:1115-1141` and `:1253-1279`: persist those parts and
  that content as-is, for new messages and for edits.
- `convex/chats.ts:449-470`: the first turn, by contrast, builds parts on the
  server from bindings, as `docs/adr/0012-atomic-first-turn-creation.md:44-46`
  promises.

**How references handle it.**
- HuggingChat, `src/routes/conversation/[id]/+server.ts:184-224` and
  `:270-289`: accepts only an `inputs` string plus files it uploads itself or
  finds by hash, then builds the stored message on the server.
- VercelChatbot, `app/(chat)/api/chat/schema.ts:3-22`: limits user parts to
  text (at most 2000 characters) and jpeg or png file parts.
- LibreChat, `api/app/clients/BaseClient.js:109-130`: resolves message file
  ids on the server with an owner filter.

**Fix.** Add one server-side user-message builder in Convex and use it in
`createChatWithFirstTurnForUser`,
`selectOrInsertLatestUserMessageForGeneration`,
`applyEditIntentForGeneration`, and `planGenerationInputForChat` (so the input
hash still matches). The builder keeps text parts, resolves file parts only by
`attachmentId` against `chatAttachments` rows bound to this chat (rebuilding
url, media type, and file name from the row), drops every other part type,
and derives `content` from the final text. Then replace `parts: v.any()` in
`vStoredMessage` and `vEditIntent` with a validator that allows only text
parts and file parts with an `attachmentId`. The wire format does not change:
the client already binds staged attachments before a follow-up send
(`lib/chat-turn/chat-turn-controller.ts:436-449`).

**Notes.** Guest turns pass wire messages straight to the model without saving
them (`app/api/chat/durable-turn-runtime.ts:986-997`), so this fix is about
saved data, not model input. The share page renders only `content` and source
parts, never file parts, so there is no cross-user rendering risk today.

### Title model costs more than the answer model

Severity: Low.

**What is wrong.** The title picker is meant to choose a small, cheap model on
the same provider, but it ranks "does not reason" above price. Every cheap
OpenAI model in the catalog can reason, so every OpenAI route, including the
platform default gpt-5-mini ($0.25/$2 per 1M tokens), titles on gpt-5.1
($1.25/$10). On xAI, titles run on grok-4.3 with its default "low" reasoning
under a 48-token output cap, and the call sends no option to turn reasoning
off. The money per chat is small, but default gpt-5-mini chats, guests
included, pay about 5 times more per token for the title than for the answer.

**Our code.**
- `lib/chat-title.ts:76-103`: `selectChatTitleModelConfig` sorts by
  `reasoningText` first, then speed, the "cheap" tag, then price.
- `lib/models/data/openai.ts:299-331`: gpt-5.1, the only visible OpenAI route
  without `reasoningText`, so it always wins.
- `lib/models/data/openai.ts:192` (gpt-5.4-nano, $0.20/$1.25) and `:82`
  (gpt-5.6-luna, $0.20/$1.20): cheaper, and both offer effort "none", but are
  skipped.
- `lib/chat-title.ts:175-183` and `lib/chat-title-prompt.ts:12`: the title
  call has a 48-token cap and no reasoning option.
- `lib/usage/billable-pricing.ts:61-76`: charges the title at the selected
  title route's rates.

**How references handle it.**
- LibreChat, `packages/api/src/agents/client.ts:23-33` and
  `api/server/controllers/agents/client.js:6061-6084`: strip thinking options
  and output caps from every title call, and
  `api/server/controllers/agents/client.js:6023-6029` uses a configured
  `titleModel`.
- LobeHub, `packages/const/src/settings/systemAgent.ts:19-22` and `:71`: names
  an explicit mini model for topic titles (gpt-5.6-luna,
  `packages/business/const/src/llm.ts:5-6`).
- HuggingChat, `src/lib/server/textGeneration/title.ts:71-80`: accepts that
  reasoning can use up the title budget and falls back to the first five
  words.

**Fix.** Keep the same-provider rule, which ADR-0021 metering depends on. In
`selectChatTitleModelConfig` (`lib/chat-title.ts`), treat a route as eligible
if it does not reason or its `effortLevels` include "none" (or "minimal" as a
fallback), rank eligible routes by price first, and return the chosen effort
with the config. In `generateChatTitle`, send that effort through AI SDK 7's
top-level `reasoning` call option (or through `shapeRequest`), so the title
follows the same provider rules as the answer. `buildPricingSnapshot` already
calls the same selector, so pricing stays consistent. Update the selector test
in `lib/chat-title.test.ts`. OpenAI then titles on gpt-5.4-nano or
gpt-5.6-luna with no reasoning, and Grok on grok-4.3 with reasoning "none".

**Notes.** A typical short first prompt costs about $0.0003-0.0004 to title on
gpt-5.1 versus about $0.00006 on nano, roughly 5-15% of a first gpt-5-mini
turn. The Grok empty-title case is not verified live, and
`sanitizeGeneratedChatTitle` already falls back to the first words. An
explicit per-provider title route (LibreChat, LobeHub) is a valid alternative,
but it is one more hand-maintained value that can go stale, which is how this
drifted.

### Signed-in chats keep New chat when the title fails

Severity: Low.

**What is wrong.** If the title call fails (for example a 429 or 5xx) or the
user presses Stop before it finishes, a signed-in chat stays "New chat" in the
sidebar. It only gets a title if the user sends another message in that chat.
Guests in the same case already get a readable fallback from the first words
of their message, so signed-in users get the worse result. Separately, a chat
whose first message is only an attachment never gets a title, for guests or
signed-in users.

**Our code.**
- `app/api/chat/chat-turn-runtime.ts:2073-2089`: any title error or abort
  resolves to `null`.
- `app/api/chat/chat-turn-runtime.ts:2108-2138`: the durable `after()`
  backstop writes a title only when one was generated.
- `app/api/chat/chat-turn-runtime.ts:2312-2316`: `fallbackChatTitle` is used
  only when `durableTurn.mode === "guest"`.
- `convex/chats.ts:511-529`: `applyGeneratedTitleForOwnedChat` always sets
  `titleSource: "generated"`, so a fallback written through it would block
  the later retry.
- `app/api/chat/chat-turn-runtime.ts:363-367`: `getFirstUserText` reads only
  the first user message, so an attachment-only first message gives "", and
  `fallbackChatTitle("")` returns "New chat" (`lib/chat-title.ts:58-64`).

**How references handle it.**
- HuggingChat, `src/lib/server/textGeneration/title.ts:71-85`: falls back to
  the first five words of the user's message both when the model returns
  nothing and when the call throws.

**Fix.**
1. In the durable `after()` backstop in `app/api/chat/chat-turn-runtime.ts`
   (2108-2138), when `titleTask` resolves `null`, write
   `fallbackChatTitle(titleRequest.userText)`.
2. Make that write keep `titleSource: "provisional"`, through a small flag on
   `applyGeneratedTitle` or a sibling mutation in `convex/chats.ts`, still
   guarded by `titleGeneration`. The next turn can then replace it with a
   model title (`convex/chatRuntime.ts:2070-2072` already re-requests while
   provisional).
3. Optionally send the same fallback as the `data-chatTitle` stream part when
   the stream is still open.
4. For attachment-only first messages, change `getFirstUserText` to use the
   first user message with non-empty text, or the attachment file name.

**Notes.** Our model-returns-nothing case is already covered:
`sanitizeGeneratedChatTitle` falls back to the first words
(`lib/chat-title.ts:66-72`). VercelChatbot
(`app/(chat)/api/chat/route.ts:338-345`) and LibreChat keep the default title
on failure, so our guest path is already ahead of them; this closes the gap
for signed-in users.

## Tools and MCP

### MCP tool names break provider name rules

Severity: Medium.

**What is wrong.** Each MCP tool reaches the model as
`<serverSlug>_<toolName>`, and only the server part is capped. Our name check
allows up to 128 characters and dots, but OpenAI accepts only letters, digits,
`_` and `-` up to 64 characters, Anthropic also rejects dots, and the AI SDK
does not rename function tools on the way out. So one long or dotted tool name
from a connected server makes the provider reject the whole request. Every
chat on an OpenAI or Claude model then fails for that user with a vague error
until they guess which server or tool to turn off.

**Our code.**
- `lib/mcp/load-tools.ts:116-124`: `slugify` caps the server slug at 30
  characters.
- `lib/mcp/load-tools.ts:321`: builds `${serverSlug}_${toolName}` with no cap
  or cleanup on the tool part.
- `lib/tools/naming.ts:3-4`, `40-53`: `TOOL_NAME_MAX_LENGTH = 128` and a
  pattern that allows `.`. The test at `lib/tools/__tests__/naming.test.ts:19`
  expects `extract-content.v2` to pass.
- `lib/tools/runtime.ts:687-700`: names that fail even this loose check are
  dropped with a warning, never cleaned.
- `lib/tools/types.ts:114-138`, `lib/tools/runtime.ts:495`: MCP tools are on
  by default and go out on every signed-in turn for tool-capable models,
  including the default `gpt-5-mini` (`lib/config.ts:16`).

**How references handle it.**
- HuggingChat, `src/lib/server/mcp/tools.ts:63-69`: `sanitizeName` turns
  anything outside `[a-zA-Z0-9_-]` (dots included) into `_` and trims to 64,
  with a comment citing the provider rule. Lines `318-335` add collision
  suffixes that stay within 64.
- LobeHub, `packages/context-engine/src/engine/tools/ToolNameResolver.ts:13-17`,
  `70-122`: hashes any name part with invalid characters, and compresses a
  name with a short MD5 hash once it reaches 64, while `resolve()` maps back
  to the original.
- LibreChat, `packages/api/src/mcp/tools.spec.ts:498-501`: strips a redundant
  server-name prefix because it can push names past the 64 limit.

**Fix.** Build the model-facing name in one place, where `namespacedName` is
created in `lib/mcp/load-tools.ts`:
1. Replace every character outside `[A-Za-z0-9_-]` with `_`.
2. If the result is over 64 characters, cut it and append a short stable hash
   of `serverId` plus the raw tool name, so it stays unique and deterministic.
3. Keep `toolServerMap` (it already stores `displayName` and `serverId`) as
   the map back to the raw tool, and keep the existing collision handling.
   Execution uses the tool object's own raw name, and approval keys use the
   raw `${serverId}_${toolName}`, so neither changes.

Then set `TOOL_NAME_MAX_LENGTH` to 64 and drop `.` from `TOOL_NAME_PATTERN` in
`lib/tools/naming.ts`, and update the one test that expects a dotted name to
pass.

**Notes.** Renaming changes tool names already stored in chat history (see the
comment at `lib/mcp/load-tools.ts:112-115`); pre-launch this needs no
compatibility work. The vague error the user sees overlaps the TODO.md item
"Provider error classification".

### Large MCP results are dropped instead of trimmed

Severity: Medium.

**What is wrong.** When an MCP tool returns more than 100 KB, our trimmer
throws the whole answer away instead of shortening it. An MCP result keeps
everything under one `content` key, and the trimmer keeps or deletes whole
top-level keys, so the model gets only a note that says "Request specific
fields" (which MCP tools usually cannot do). A large file read, a fetched
page, or a screenshot over about 75 KB (base64 makes it bigger) comes back as
nothing, and any caption next to the image is lost with it, so the model
guesses or calls the tool again.

**Our code.**
- `lib/tools/mcp-wrapper.ts:106-110`: `transformResult` runs the generic
  `truncateToolResult` on the raw MCP result
  `{ content: [...], structuredContent? }`.
- `lib/tools/utils.ts:581-645`: `truncateOversizedObject` adds each top-level
  key whole and deletes it if it does not fit, without looking inside. The
  limit is 100 KB (`lib/config.ts:31`).
- `node_modules/@ai-sdk/mcp/dist/index.js:2453-2459`: with no `content` array
  left, `mcpToModelOutput` sends the empty envelope to the model as JSON. Our
  wrapper keeps the SDK's `toModelOutput` through the spread at
  `lib/tools/execution-policy.ts:67-68`.
- `lib/tools/__tests__/mcp-wrapper.test.ts:434-454`: the only truncation test
  sends a plain string, not the real MCP shape, which is how this slipped
  through.

**How references handle it.**
- LibreChat, `packages/api/src/mcp/parsers.ts:226-357`: `formatToolContent`
  joins all text items into one string and moves images into separate
  artifacts, so an image never uses up the text budget. LibreChat later caps
  that string by character count (`maxToolResultChars`), which cuts the text
  and keeps its start instead of dropping it.
- LibreChat, `packages/api/src/mcp/parsers.ts:6-55`: images get their own size
  cap (10 MB by default, `assertImageDataWithinLimit`).

**Fix.** Add an MCP-aware step before the generic trimmer in `transformResult`
(`lib/tools/mcp-wrapper.ts`). When the result has a `content` array:
1. Drop `structuredContent` first, since the MCP spec says servers should
   mirror it as text.
2. Share the byte budget across text items and cut each to a prefix plus a
   `[truncated, showing X of Y chars]` marker, reusing (and exporting)
   `truncateLongString` in `lib/tools/utils.ts`.
3. Replace any image over its own cap with a small text item such as
   `[image omitted: N KB over limit]`.

Keep the `{ content: [...] }` shape so `mcpToModelOutput` still builds normal
output, and keep the generic trimmer for non-MCP tools. Replace the string test
with one real-shape case: a single large text item keeps its trimmed start.

**Notes.** Do not simply raise the inline image budget. The trimmed result is
saved in message parts and replayed on later turns, so it must fit Convex's
1 MiB document limit. Moving large images to file storage belongs with the
TODO.md item "Convex document and read limits". The TODO.md note about
capping MCP response size covers bytes read from the network, not this
trimmer.

### Approval card hides tool arguments

Severity: Medium.

**What is wrong.** When a tool's input has a `command`, `code`, `script` or
`query` field, the Approve card shows only that one field and hides every
other argument. So a database tool called with `{ project_id, query }` shows
the SQL but not which project it will change. The step title above the card,
which also shows in the thread's live status line, is copied from
model-written fields such as `description` when the input has one. Every
untrusted MCP call must pass this card, so it is our main MCP safety control,
and a prompt-injected model can label a risky call with a calm sentence.

**Our code.**
- `lib/chat-messages/assistant-activity.ts:151-161`: `toolCode` returns the
  first non-empty `command`/`code`/`script`/`query`, and full JSON only when
  none exists. It runs for every tool, MCP included.
- `lib/chat-messages/assistant-activity.ts:171-192`: `inputAction` and
  `toolActionTitle` use model-written `description`/`action`/`task`/`operation`
  as the title, falling back to `Review {label}` only when none is set. Lines
  `443-451` build the approval entry from both.
- `lib/chat-messages/assistant-activity.ts:504-513`: `resolveLiveStatus` uses
  that same title as the live status while waiting for approval.
- `app/components/chat/activity/activity-panel.tsx:103-140`: the card renders
  the tool name, that single code block, and Approve/Deny, with the step title
  above it (`309-316`). No other surface shows tool input.
- `lib/tools/runtime-approval.ts:85-91`, `117-118`: unknown or untrusted MCP
  tools always need approval (applied at `lib/tools/runtime.ts:866-884`).

**How references handle it.**
- LibreChat, `client/src/components/Chat/approval/preview.ts:109-157`:
  `buildApprovalPreview` shows the full JSON arguments for generic tools such
  as MCP. A single-field view is used only for LibreChat's own tools, matched
  by source and exact name, and even `bash_tool` falls back to full JSON when
  an extra field is set (`119-126`).
- LibreChat, same file `19-48` and `137-147`: shows hidden control and bidi
  (text-direction) characters as visible codes, and caps the length of the
  tool name and description.
- VercelChatbot, `components/chat/message.tsx:242-251` with
  `components/ai-elements/tool.tsx:120-128`: the approval state renders
  `JSON.stringify(input, null, 2)`, which is every argument (its only
  approval-gated tool is `getWeather`).

**Fix.** Present approval rows differently from settled rows in
`lib/chat-messages/assistant-activity.ts`:
1. For status `"approval"`, set `tool.code` to the full input JSON, capped in
   size, with control and bidi characters made visible (port LibreChat
   `preview.ts:19-48`).
2. Keep the single-field view only for settled rows, or for our own
   first-party tools matched by exact name. Never for MCP.
3. Always use the existing `Review {label}` title for approval rows, in both
   the panel and `resolveLiveStatus`. If model text stays, show it as short,
   clearly secondary text.

Optionally show the MCP server name next to the tool name.

**Notes.** The card header already shows the namespaced name (for example
"Supabase Execute Sql"), so the server is partly visible today. No ADR decides
approval display; ADR-0040 only keeps approval detail in the activity panel.

### Editing an MCP URL keeps the saved token

Severity: Medium.

**What is wrong.** When a user edits a saved MCP server, changes its URL and
leaves the token blank (the form says "Leave blank to keep the existing
value."), we keep the old encrypted token and send it to the new host on the
next chat. Changing only the transport, auth type or header name keeps it too.
Test Connection already refuses stored credentials against a different URL,
but Save does not, so our two paths disagree. A user who repoints a server by
mistake, or anyone who briefly controls their session, can hand a GitHub or
Notion token to a host that should never see it.

**Our code.**
- `convex/mcpServers.ts:185-243`: the public `update` mutation (callable
  straight from the browser) patches `url`, `transport`, `authType` and
  `headerName` while keeping `encryptedAuthValue`/`authIv`. They are cleared
  only when `authType` becomes `"none"` (`235-239`).
- `app/api/mcp-servers/route.ts:109-150`: the PATCH route passes the new URL
  through, re-encrypts only when a new `authValue` is sent, and turns every
  mutation error into a 500.
- `app/components/layout/settings/connections/mcp-server-form.tsx:255`,
  `385-389`: shows the "Leave blank" hint whenever a token exists, even after a
  URL edit. Save does not require a passing test.
- `lib/encryption.ts:53-63`, `lib/mcp/auth-headers.ts:35-46`: the token's AAD
  (extra data that must match for decryption to work) is only
  `["mcpAuth", ownerId]`, so it decrypts for whatever URL the row holds.
  `lib/mcp/load-tools.ts:247-253` then connects with it before any tool
  approval.
- `app/api/mcp-servers/test/route.ts:75-98`: the intended rule ("Stored
  credentials can only be tested against the saved server URL") exists only
  here.

**How references handle it.**
- LibreChat, `packages/api/src/mcp/registry/binding.ts:35-80`:
  `getChangedApiKeyBindingFields` and `requireApiKeyReentryForRebinding` refuse
  an update that keeps a stored key while the URL, transport, proxy, auth type
  or custom header changes. It runs on every update
  (`packages/api/src/mcp/registry/db/ServerConfigsDB.ts:349-353`) and throws a
  400 `MCPApiKeyReentryRequiredError`
  (`packages/api/src/mcp/errors.ts:331-346`).
- LibreChat, `packages/api/src/mcp/oauth/handler.ts:508-536`: the same idea for
  OAuth tokens. `assertStoredClientBinding` forces re-authentication when the
  stored server URL no longer matches.

**Fix.**
1. In `convex/mcpServers.ts` `update`, throw a "re-enter your token" error when
   the stored credential is kept (no new `encryptedAuthValue`) and the
   normalized URL origin, `transport`, `authType` or `headerName` changes.
   Mirror LibreChat's `getChangedApiKeyBindingFields`.
2. Map that error to a 400 in `app/api/mcp-servers/route.ts`.
3. In `mcp-server-form.tsx`, drop the "leave blank" state and require the token
   as soon as any of those fields is edited.
4. Root-cause layer: add the URL origin, `authType` and lowercased
   `headerName` to the `mcpAuth` AAD in `lib/encryption.ts`. Pass them on
   encrypt (POST and PATCH in the route) and on decrypt
   (`lib/mcp/auth-headers.ts`), bump `VERSION`, and amend ADR-0010. This also
   blocks copying ciphertext into a new row through the public `create`
   mutation (`convex/mcpServers.ts:128-183`).

**Notes.** Each row has one owner, so the realistic risks are a user mistake
when switching vendors, or an attacker who already holds the session (for
example through XSS, since the CSP allows `unsafe-inline`). The harm is
lasting theft of a third-party token that outlives the session. The public
`list`/`get` queries also return the ciphertext
(`convex/mcpServers.ts:103-126`); hiding it needs an internal query for the
loader and test route, and is optional once the AAD binds the destination.
Old rows become clean decrypt misses after the version bump, which is fine
pre-launch.

### MCP servers reconnect on every turn

Severity: Medium.

**What is wrong.** For every signed-in user with an enabled MCP server, each
message reconnects to every server from scratch before the model is called: a
DNS lookup, then about four HTTP requests in a row (a newer-protocol probe,
the two-step handshake, and a tool-list request). That likely adds a few
hundred milliseconds per message, and up to the 5 s deadline for a slow
server. Each Approve click is a new request and pays the same cost, and
nothing caches tool lists or connections, so even a short "thanks" waits on
the slowest tool server.

**Our code.**
- `app/api/chat/chat-turn-runtime.ts:672-689`: awaits `tool_preparation`
  before `durable_prepare` (`789`) and `streamText` (`1495`). Approval
  continuations need `tool.tools` too (`756-760`).
- `lib/tools/runtime.ts:495-503`: calls `loadUserMcpTools` on every signed-in
  turn. The MCP capability defaults to on (`lib/tools/types.ts:114-138`).
- `lib/mcp/load-tools.ts:209-220`: three Convex queries run before we learn
  whether any server is enabled.
- `lib/mcp/load-tools.ts:247-256`, `lib/mcp/load-mcp-from-url.ts:47-96`: a
  fresh client per enabled server per turn. `@ai-sdk/mcp` 2.0.34 adds a
  `server/discover` probe by default before `initialize`
  (`node_modules/@ai-sdk/mcp/dist/index.js:2577-2609`).
- `lib/mcp/load-tools.ts:291-295`: one Convex write of `lastConnectedAt` per
  server on every message.

**How references handle it.**
- HuggingChat, `src/lib/server/mcp/tools.ts:259-280`: caches each server's
  tool list for 60 s (`DEFAULT_TTL_MS`, line `59`), keyed by URL plus sorted
  headers (`142-147`), and fetches only cold servers.
- HuggingChat, `src/lib/server/mcp/clientPool.ts:23-30`, `71-94`: reuses pooled
  clients, pings only after 30 s idle, and closes them after 10 min idle.
- LibreChat, `packages/api/src/mcp/tools.ts:120-141`: a dedicated MCP
  tool-definition cache service (`createMCPToolCacheService`). Its note at
  `packages/api/src/mcp/UserConnectionManager.ts:81-82` says per-user
  connections will become short-lived, which favors caching definitions over
  pooling connections.

**Fix.**
1. Confirm the cost first with the existing PostHog `mcp_tool_load` event
   (`loadTimeMs`, `lib/tools/runtime.ts:505-517`) against one real remote
   server.
2. Cache each server's tool definitions and annotations for about 60 s, keyed
   by server id, URL and a hash of the credential. Keep reading the server
   list and approvals from Convex every turn, so turning a server or tool off
   still works at once.
3. Build tools from the cached definitions and connect lazily on the first
   tool call, one memoized connection per turn, keeping DNS pinning. The SDK
   already supports this (`toolsFromDefinitions`, `initialInitializeResult`,
   `initialSessionId`). Do not skip `initialize` for servers that issue
   session IDs.
4. Stop writing `lastConnectedAt` on every turn.
5. For users with no servers, start MCP preparation in parallel with usage
   admission, or read "has servers" from a query the turn already makes.
6. Record the change as an ADR-0035 amendment.

**Notes.** The baseline `tool_preparation` of 0.12 ms
(`docs/performance/2026-08-27-system-performance-baseline.md:85`) was measured
on the guest path, where MCP never runs, so it says nothing about this cost.
On Vercel an in-memory cache only helps warm instances; for hits across
instances, store the definitions on the `mcpServers` row, which is already
read every turn. ADR-0035 never considers caching, but it says only fully
prepared connections enter the tool runtime, so lazy connection is a real
change to it.

### MCP trust allowlist matches user-chosen names

Severity: Low.

**What is wrong.** `MCP_TRUSTED_RETRY_SERVER_ALLOWLIST` is meant to mark
specific MCP servers as safe to retry, but it matches the server's name, which
each user types freely, and it also turns off the approval prompt for trusted
tools that claim to be read-only. So if the operator trusts `github`, any
server a user names "GitHub", hosted anywhere, skips approval for those tools.
Nothing in the repo sets the variable and it has no docs, so nothing is
affected yet.

**Our code.**
- `lib/mcp/load-tools.ts:138-150`: `isRetrySafetyTrustedServer` matches the
  allowlist against server id, raw name, `slugify(name)` and URL host (the
  scheme is ignored).
- `lib/mcp/load-tools.ts:289`, `358-359`: one flag feeds both
  `retrySafetyTrusted` and `policyHintsTrusted`.
- `lib/tools/runtime-approval.ts:85-91`, `109-115`: with trusted hints, the
  `mcp_unknown` gate is skipped and a tool declaring `readOnly: true` runs
  without approval (wired through `lib/tools/runtime.ts:559-572` and
  `866-882`).
- `lib/config.ts:37-43`: the comment mentions only "retry hints" and invites
  names and slugs.
- `lib/mcp/__tests__/load-tools.test.ts:276-296`: locks in the name match.
  Allowlist `github` trusts a server named "GitHub" at any URL.

**How references handle it.**
- LibreChat, `packages/api/src/mcp/utils.ts:679-681`, `612-627`:
  `isUserSourced` and `canUseAppConnection` base privileges on where a
  server's config came from (operator config or a user's database row), never
  on its label. User-added servers always take the stricter path. This governs
  connection sharing, not approvals, but the principle carries over.

**Fix.**
1. In `isRetrySafetyTrustedServer` (`lib/mcp/load-tools.ts`), drop the name
   and slug candidates and compare only the full origin
   (`new URL(url).origin`, scheme included).
2. Split the setting in two, one for retry trust and one for approval trust
   (for example `MCP_TRUSTED_POLICY_ORIGINS`), so retry trust no longer turns
   off approvals.
3. Update the comment in `lib/config.ts`, add both variables to `.env.example`
   with a one-line warning, and change the test at
   `lib/mcp/__tests__/load-tools.test.ts:276-296` to match by origin.

**Notes.** The gap is narrower than it looks:
`lib/tools/runtime-approval.ts:68-83` still forces approval for tool names with
write, delete, send, auth, account or payment words. Every server belongs to
the user who added it, so the person at risk is that user.

## Streaming and resume

### Replay log writes to Redis about every 20 ms

Severity: Medium.

**What is wrong.** Every signed-in answer is copied into a Redis log so a
refreshed tab or a second tab can pick up mid-answer, whether or not anyone
ever reads it (`app/api/chat/chat-turn-runtime.ts:2360-2381`). The writer
flushes after only 20 ms and starts that timer before the first chunk arrives,
so chunks that come 20 ms or more apart (common for streamed tokens) each cost
their own Redis script call (`EVAL`): up to about 44 a second, or about 1,300
for a 30-second answer. Production runs on the Upstash free plan with paid
upgrades disabled (`docs/adr/0039-resumable-generation-stream.md:70-72`), which
allows 500K commands a month, so a few hundred long answers can use up the
month. After that, refresh-resume quietly stops for everyone and nothing
alerts us.

**Our code.**
- `lib/chat-stream/server.ts:20-21`: `BATCH_INTERVAL_MS = 20` and a 16 KB
  batch cap.
- `lib/chat-stream/server.ts:200-242`: the batching loop creates the deadline
  timer (206-208) before it waits for the first chunk (213-216), so a chunk
  that arrives more than 20 ms after the last flush is usually written alone.
- `lib/chat-stream/server.ts:90-104`: each `APPEND` call runs 3 `HGET`, one
  `XADD` per chunk, an `HSET` and 2 `EXPIRE`.
- `lib/chat-stream/server.ts:346-360`: every reader wake runs `hGetAll` and
  then `XREAD`, and it wakes once per writer append, so each watching tab adds
  about 2 commands per append.
- `lib/chat-stream/server.ts:147-149`, `:185-188` and `:196-198`: Redis errors
  are swallowed. With the quota gone, the writer never starts, the stream route
  returns 503 for live runs (`app/api/chat/[chatId]/stream/route.ts:40-46`),
  and the client gives up after 5 tries
  (`lib/chat-stream/resumable-chat.ts:377-382`), falling back to the slower
  Convex checkpoints with no signal.

**How references handle it.**
- HuggingChat, `src/lib/server/generation/writer.ts:27-41` and `:280-294`:
  merges consecutive same-kind tokens into one event and flushes on a 200 ms
  timer that starts when the first event of a batch arrives (`:199-205`). Its
  comment names per-event write amplification as the reason to pace writes by
  the clock.
- HuggingChat, `src/routes/conversation/[id]/stream/+server.ts:30` and
  `:169-184`: the reader checks liveness and drains the log on a fixed 250 ms
  tick, not once per write.
- Upstash pricing docs: the free plan allows 500K commands a month and may
  rate limit after that.

**Fix.**
1. In `lib/chat-stream/server.ts`, start the batch timer when the first chunk
   of a batch arrives, and raise `BATCH_INTERVAL_MS` to 100-200 ms. Only
   refresh and second-tab viewers see this; the sending tab reads its own HTTP
   stream. The reader slows to the same pace.
2. Before writing, merge consecutive `text-delta` and `reasoning-delta` chunks
   that share an `id` and have no `providerMetadata`, like HuggingChat's
   `mergedStreamToken`.
3. In the reader, call `hGetAll` only when `XREAD` returns nothing, since the
   log's status matters only then.
4. Log one sampled warning (Sentry or server logs) when `INITIALIZE` or
   `APPEND` fails, and write a rough per-answer command budget into ADR-0039.

**Notes.** The interval is the main lever. Merging (step 2) mostly shrinks
entries, Redis memory and reader work; it may not cut billed commands if
Upstash bills one `EVAL` as one command, which its docs do not state. Guests
are not affected, because their turns have no stream run id
(`app/api/chat/durable-turn-runtime.ts:1001-1003`). Fold step 4 into the
"Retained-stream admission" TODO item, which already says to measure Redis
usage.

### Refresh replay reprocesses every token

Severity: Low.

**What is wrong.** The Redis log stores one entry per AI SDK chunk, often a
single token. On refresh the server sends each entry as its own line (about 145
bytes for about 4 characters of text), and the browser feeds each one into the
SDK's `readUIMessageStream`. That function deep-copies the whole message except
its text (`structuredClone`) on every chunk, so every tool result already in the
message is copied once per token. Plain answers cost tens of milliseconds, but a
turn with large structured tool output can take about a second to rebuild on
desktop and longer on a phone.

**Our code.**
- `lib/chat-stream/server.ts:223-233` and `:99`: each chunk becomes its own
  Redis stream entry; the 20 ms batch only groups the `XADD` calls into one
  script call.
- `lib/chat-stream/server.ts:355-368`: the reader turns each entry into its
  own `chunk` frame.
- `lib/chat-stream/resumable-chat.ts:135-162`: the client parses every frame
  and writes every chunk into `readUIMessageStream` (143-155).
- `node_modules/ai/dist/index.js:10745-10798` (ai 7.0.73): every write calls
  `createUIMessageSnapshot`, which runs `structuredClone`, and each
  `text-delta` triggers a write (7005-7018). Native `useChat` copies parts
  only shallowly (`node_modules/@ai-sdk/react/dist/index.js:204-217`), so a
  refreshed tab does more work per token than the sending tab.

**How references handle it.**
- LibreChat, `api/server/routes/agents/index.js:326-336`: answers a resume
  with one `sync` event that carries the content so far, then sends only live
  events. `packages/api/src/stream/GenerationJobManager.ts:4891-4893` notes
  that this sync already includes the buffered events.
- HuggingChat, `src/lib/server/generation/writer.ts:27-39` and `:280-294`:
  merges consecutive same-kind tokens before storing them so replay stays
  cheap, and `src/lib/utils/consumeReattachStream.ts:61-70` applies the whole
  backlog in one write.

**Fix.** In `readRetainedChatStream` (`lib/chat-stream/server.ts:355-372`),
while the reader is still behind `highWater`, merge consecutive `text-delta` or
`reasoning-delta` chunks with the same `id` into one chunk before queuing
frames. Merge within each `XREAD` page, keep the last entry id as the cursor,
and skip merging when `providerMetadata` is present. Leave live chunks after
`caught-up` alone. Merged deltas are still valid SDK chunks, so ADR-0039's
silent rebuild and single publish still hold. A LibreChat-style single catch-up
message is the bigger option, worth it only if tool-heavy refreshes prove slow
on phones.

**Notes.** Merging at write time does not help at today's 20 ms batch, which
holds only 1 or 2 tokens. If the write-time merge and longer interval from the
entry above land, they cover much of this too. Cost depends on tool output
shape more than size. With 3,000 deltas (Node, installed SDK), 90 KB of
mostly-string tool output took about 34 ms, the same 90 KB as many small
objects took about 357 ms, and 300 KB of small objects took about 1.1 s. Our
tools mostly return strings (Exa text is capped at 2,000 or 10,000 characters,
`lib/tools/third-party.ts:192-197` and `:398-401`), and ADR-0039's desktop
checks restored about 6K and 14K-character answers in under 1 s
(`docs/adr/0039-resumable-generation-stream.md:102-104`), so plain answers are
not the bottleneck. The 145 bytes per token is the same framing the sending tab
already receives; replay pays it a second time.

### The sending tab can replay its own answer

Severity: Low.

**What is wrong.** When an answer finishes, the sending tab gets two signals in
no fixed order: its HTTP stream closes, and Convex reports the run as
completed. If the HTTP close lands first, `syncRun` sees the local SDK as
`ready` while Convex still says the run is live, and nothing records that this
tab already has the full answer. It then opens a replay reader and downloads
the finished answer again: Stop reappears and copy and retry actions hide until
the replay drains (usually under a second), with no change to the text.

**Our code.**
- `lib/chat-stream/resumable-chat.ts:251-298`: with status `ready` and a live
  run, the only guard left is `seenRunId === run.runId` (line 278). The
  `isSubmitting` check (line 266) does not help, because it clears once the
  request is accepted (`lib/chat-turn/chat-turn-controller.ts:579-580`).
- `lib/chat-stream/resumable-chat.ts:205-210`: `seenRunId` takes
  `nativeRunId` only inside `stop()`; a successful native finish never records
  it. `syncRun` runs on every commit
  (`app/components/chat/use-detachable-chat-stream.ts:770-776`).
- `app/api/chat/chat-turn-runtime.ts:2209-2246`: `onEnd` writes the terminal
  Convex status (`settle`) and then disposes resources, and the SDK closes the
  HTTP body only after `onEnd` returns
  (`node_modules/ai/dist/index.js:7563-7565`), so the two signals race.
- `app/api/chat/[chatId]/stream/route.ts:31-35`: serves a completed run
  whenever a `runId` is passed.
- `lib/chat-runs/run-presentation.ts:168-188`: keeps a replay of a completed
  run as `local-streaming`, which is why Stop shows and actions hide.

**How references handle it.**
- HuggingChat, `src/routes/conversation/[id]/+page.svelte:470-484`:
  reattaches only to a turn this tab did not start. It skips while its own send
  is in flight (`writeMessageInFlight`, declared at line 80, set at 188,
  cleared at 426) and only runs from a freshly loaded snapshot.
- HuggingChat, same file `:476-479` and `:494`: it resumes from the message's
  saved cursor (`materializedSeq`), so even a mistaken reattach replays
  nothing.

**Fix.**
1. In `ResumableChat` (`lib/chat-stream/resumable-chat.ts`), remember the run
   the native request delivered in full. From the binding's `onFinish`
   (`app/components/chat/use-detachable-chat-stream.ts:406-409`), when the
   finish is not an abort, error or disconnect and a finish chunk arrived, set
   `seenRunId` to that run.
2. Do not take that id from `nativeRunId`. It is set only if Convex showed the
   run live while the native stream ran
   (`lib/chat-stream/resumable-chat.ts:274-276`), so a short answer can leave
   it null or stale. Instead, send the run id in the stream's start metadata
   (the `start` branch of `messageMetadata`,
   `app/api/chat/chat-turn-runtime.ts:2169-2185`, where
   `durableTurn.getStreamRunId()` is available) and read it there.
3. Keep replay for transport errors, reloads and other tabs. Add one case next
   to "recovers a failed original transport but respects explicit Stop" in
   `lib/chat-stream/resumable-chat.test.ts`.

**Notes.** The race is lost only sometimes. `disposeTurnResources` (closing
tool connections plus PostHog and Braintrust flushes,
`app/api/chat/chat-turn-runtime.ts:567-573`) usually gives the Convex update a
head start in production; it shows up more in local dev without analytics, on
slow connections, or in long chats. `seenRunId` blocks repeats, so it happens at
most once per run. To verify, check that no `GET /api/chat/<id>/stream?runId=`
fires right after a normal answer. A saved resume cursor like HuggingChat's
would also make any mistaken replay cheap; the route accepts none today, and
"Stalled connection recovery" in TODO.md already plans an `after` cursor for
reconnects.

### Stream probe reads the whole chat

Severity: Low.

**What is wrong.** When a signed-in user opens or refreshes a chat before its
Convex history has loaded, the browser asks the stream route whether an answer
is still being written. That probe is deliberate
(`docs/adr/0039-resumable-generation-stream.md:14`). The waste is on the
server: the route loads the whole conversation, hidden branches included,
before deciding whether anything is running, and almost always nothing is. It
also re-sends the full selected path every time it serves a stream, including
reconnects where the client usually ignores it.

**Our code.**
- `lib/chat-stream/resumable-chat.ts:266-297`: sends a discovery GET with no
  `runId` whenever a signed-in chat's history is loading, which is every
  refresh and every uncached in-app open
  (`lib/chat-store/messages/provider.tsx:113`,
  `lib/convex/use-per-user-query.ts:73-75`).
- `app/api/chat/[chatId]/stream/route.ts:18-21`: always runs
  `getSelectedRunState` and `getSelectedPath` together, and returns 204 for an
  idle chat only afterward (31-35).
- `convex/messages.ts:82-90` and `:168-169`: the path query collects every
  message in the chat through `by_chat_order`, hidden branches included.
- `app/api/chat/[chatId]/stream/route.ts:48-57`: serializes the full path into
  every selection frame; on reconnects the client uses it only when the
  assistant row is empty (`lib/chat-stream/resumable-chat.ts:359-367`).

**How references handle it.**
- HuggingChat, `src/routes/conversation/[id]/stream/+server.ts:47-51` and
  `:94-98`: first a `findOne` that returns only `_id`, then
  `latestTurnGeneration`, and it ends with "gone" before reading any events.
- HuggingChat, `src/routes/conversation/[id]/+page.svelte:480-484`: reattaches
  only when the loaded snapshot says the turn is still running
  (`isTurnSubscribable`). The page loader already fetched that snapshot, so no
  separate discovery probe is needed.

**Fix.** Replace the two parallel `fetchQuery` calls in
`app/api/chat/[chatId]/stream/route.ts:18-21` with one Convex query in
`convex/messages.ts` (for example `getReconnectState`). It reads the chat's
`statusRunId` and the run doc first, and returns null (the route then sends 204
or 404) when the run is missing, does not match the requested `runId`, or, with
no `runId`, is not queued, running or streaming. Only then does it collect the
path and check that the assistant message is on it. One round trip keeps
ADR-0039's refresh latency, and idle chats never read their messages.
Optionally leave `selection.messages` out when a `runId` is given. Record the
change as a short note in ADR-0039.

**Notes.** Do not split this into two calls (run state, then path): that adds
the extra round trip ADR-0039 removed, and live runs still need the path for
the on-path check and the first paint. Idle answers (204 or 404) return at once
(`lib/chat-stream/resumable-chat.ts:314`); retries happen only on 5xx or
network errors (`:377-382`). Convex's server query cache may already serve the
page's later `getSelectedPath` subscription from the probe's result, so measure
before assuming the cost doubles. Related TODO item: "Convex document and read
limits".

## Accounts, sessions and privacy

### Auth actions have no rate limit

Severity: Medium.

**What is wrong.** Our sign-in, sign-up, "email me a code" and password-reset
forms are public server actions that call WorkOS directly with our API key.
Nothing counts attempts per visitor first. WorkOS only limits each email address
(3 codes or resets per minute) plus 6,000 requests per minute for the whole API
key, so a script that rotates addresses can send thousands of emails to
strangers, create junk accounts, and use up the budget real users need to sign
in.

**Our code.**
- `app/auth/actions.ts:69-173`: sign-in, sign-up and both email-code actions go
  straight to WorkOS with no attempt check. `requestPasswordReset` at
  `app/auth/actions.ts:237-254` does the same.
- `app/auth/actions.ts:35-58`: `getRequestContext` already resolves the client
  IP and `userAgent`, but they never reach the WorkOS calls that create users
  or send codes and resets.
- `app/auth/_lib/workos-password-auth.ts:50-57`: our local
  `WorkosUserManagement` type drops the `ipAddress`, `userAgent` and `signalsId`
  fields that WorkOS SDK 10.7.0 accepts on `createUser` and `createMagicAuth`.
  So `signUpWithPasswordSession` (`:294-299`) and `startMagicAuthSession`
  (`:313-335`) send no client details, and WorkOS Radar (its bot and brute-force
  detection) sees only our server.
- `app/auth/_lib/workos-password-auth.ts:190-192`: `isRateLimitedStatus`, our
  only rate-limit handling. It just spots WorkOS's own 429 so callers can show a
  message.

**How references handle it.**
- LibreChat, `api/server/routes/auth.js:43-89`: puts `loginLimiter`,
  `registerLimiter`, `resetPasswordLimiter` and
  `resetPasswordSubmissionLimiter` in front of each auth route.
  `api/server/middleware/limiters/loginLimiter.js:7-39` allows 7 tries per 5
  minutes keyed by client IP, the reset limiter allows 2 per 2 minutes, and
  `api/server/routes/user.js:36-37` covers email verify and resend.
- LobeHub, `src/libs/better-auth/define-config.ts:311-316`: throttles
  `/request-password-reset` and `/send-verification-email` to 3 per 60 seconds
  per IP. This is the closer match, because the auth comes from a library
  (better-auth) rather than being hand-built.

**Fix.**
1. Widen `WorkosUserManagement` in `app/auth/_lib/workos-password-auth.ts` and
   pass `ipAddress` and `userAgent` from `getRequestContext` into `createUser`
   and `createMagicAuth` (`requestMagicAuthCode` and `resendMagicAuthCode` must
   start calling `getRequestContext`). Then confirm WorkOS Radar is on for the
   environment.
2. Add an IP-keyed throttle in front of the five actions in
   `app/auth/actions.ts`: about 3 per minute for email sends (as LobeHub) and 7
   per 5 minutes for sign-in (as LibreChat). Return the existing
   `RATE_LIMIT_MESSAGE` and fail closed. Reuse `evaluateFixedWindow` in
   `convex/rateLimits.ts` with a new server-only, IP-keyed entry point (the
   current `consume` is keyed to `ctx.user`), or use the existing Redis client
   in `lib/chat-stream/server.ts`.
3. Optionally widen the existing "Evaluate Vercel's BotID" TODO item to cover
   the sign-up and send-code forms instead of starting a separate effort.

**Notes.** Vercel dashboard firewall rules are not visible from the repo, so rule
them out before building step 2. Vercel Chatbot, on our stack, has no auth
throttle either, but it sends no emails, so the email-flood case does not apply
to it. Medium, not high: pre-launch, and WorkOS still caps each address.

### Analytics record emails and reset tokens

Severity: Medium.

**What is wrong.** Email-code sign-in (the live production path) redirects to
`/email-verification?email=...`, and PostHog saves the full page address, query
string included, on every pageview and every autocaptured click. So real emails
land in analytics that are otherwise anonymous (we never call
`posthog.identify`, so the URL is the only link to a person). The reset page
receives the WorkOS reset `token` in its URL, which leaks the same way.

**Our code.**
- `app/providers/posthog-pageview.tsx:12-22`: builds `$current_url` from origin,
  path and the full query string. It is mounted for every route through
  `app/providers/posthog-provider.tsx:11`.
- `instrumentation-client.ts:36-45`: `posthog.init` keeps the defaults
  (autocapture on, `mask_personal_data_properties` off) and sets no URL
  sanitizer, so every event also carries the full `location.href`.
- `app/auth/actions.ts:139-149`: `requestMagicAuthCode` redirects to
  `/email-verification?email=...`, or to `/auth/login?email=...` when codes are
  off.
- `app/auth/reset-password/page.tsx:20-26`: reads the reset `token` from
  `?token=`.
- `lib/observability/sentry-scrubbing.ts:100-101`: Sentry scrubbing redacts by
  key name, and `url`, `to` and `from` are not on the list. Its value patterns
  do not match an email or a reset token either, so error events and
  navigation breadcrumbs keep these query strings too.

**How references handle it.**
- No reference covers this directly; it is a plain defect. LobeHub also captures
  full URLs (`src/components/Analytics/LobeAnalyticsProviderWrapper.tsx:36`) and
  LibreChat ships no analytics. The standard pattern is PostHog's own
  `before_send` and `get_current_url` hooks, or `mask_personal_data_properties`
  with `custom_personal_data_properties`.

**Fix.**
1. In `instrumentation-client.ts`, give `posthog.init` one sanitizer that covers
   every event: a `get_current_url` plus `before_send` hook that drops the query
   string on `/auth/*` and `/email-verification`. This alone closes the live
   leak.
2. Delete `app/providers/posthog-pageview.tsx` (and its mount in
   `posthog-provider.tsx`) and set `capture_pageview: "history_change"`, so
   pageviews pass through the same sanitizer.
3. In `lib/observability/sentry-scrubbing.ts`, strip query strings from
   `request.url` and from navigation breadcrumb `from` and `to` on auth routes.
4. Stop passing `?email=` to `/auth/verify-email` (`app/auth/actions.ts:91` and
   `:119`). That page already prefers the sealed cookie's email
   (`app/auth/verify-email/page.tsx:21-23`).

**Notes.** `/email-verification` has no cookie and reads the email only from the
URL (`app/email-verification/page.tsx:19-21`), so moving it into a sealed cookie
like `app/auth/_lib/auth-flow-cookie.ts` is new work, and optional once step 1
lands. The reset-token leak is latent: production sign-in is email code, phone
code and Apple, so reset links are probably not sent today. The TODO "Root
layout bundle weight" item only asks about session replay masking, which is a
different issue.

### Guest chats are lost at sign-in

Severity: Medium.

**What is wrong.** Guest chats live only in the browser (IndexedDB). When a
guest hits the daily limit we ask them to sign in, but after sign-in they land
on `/` with an empty sidebar, and the old chat link shows "not found". If they
later sign out on that browser, those guest chats are erased for good, and any
settings they changed as a guest reset to defaults.

**Our code.**
- `app/components/chat/use-chat-operations.ts:133-135`: opens the sign-in
  dialog when a guest has 0 messages left.
- `lib/chat-store/chats/provider.tsx:274-275`: guest chats show only while
  signed out. `lib/chat-store/messages/provider.tsx:94-99` never reads IndexedDB
  for a signed-in user, so `app/components/chat/chat.tsx:363-372` renders not
  found for `/c/<guestId>`.
- `app/auth/actions.ts:65-67`: `authenticated()` sends every sign-in to `/`,
  and `app/auth/_components/use-auth-form-action.ts:23-26` follows it. Nothing
  in `app/auth` passes a return path.
- `app/components/layout/sign-out.ts:34`: sign-out wipes IndexedDB, which since
  ADR-0033 holds only guest chats. Nothing ever uploads them.
- `lib/user-preference-store/provider.tsx:185-194`: guest localStorage
  preferences are ignored once signed in.

**How references handle it.**
- HuggingChat, `src/routes/login/callback/updateUser.ts:184-214`: at login it
  moves the guest session's conversations to the account and unsets
  `sessionId`; a new account also takes over the guest's settings. Its guest
  data already lives server-side, so for HuggingChat this is a re-key; for us
  it is an upload.
- HuggingChat, `src/lib/utils/auth.ts:9-16`: `requireAuthUser` sends the user
  to login with `next=<current path>`.
  `src/routes/login/callback/+server.ts:135-141` redirects back after
  `sanitizeReturnPath` (`src/lib/server/auth.ts:70-81`) allows only
  same-origin paths.
- LibreChat, `client/src/utils/redirect.ts:8-35`: `isSafeRedirect` and
  `getPostLoginRedirect` do the same return-to-page step.

**Fix.**
1. On the first signed-in load, if IndexedDB still holds guest chats, import
   them with one new bounded mutation in `convex/chats.ts`. Reuse each chat's
   UUID as its `publicId` so links keep working, import user and assistant text
   parts only (no tool, reasoning or file parts), cap chat count and total size,
   and make it idempotent on `publicId`. Then clear the guest IndexedDB rows.
2. If the account has no `userPreferences` row yet, seed it from the guest's
   localStorage preferences.
3. Carry a same-origin return path through `AuthModal`, `requestMagicAuthCode`,
   the `/email-verification` page and `authenticated(redirectTo)`. Reject values
   that do not start with `/`, start with `//`, or contain a backslash (as
   LibreChat's `isSafeRedirect` does).
4. Keep the sign-out wipe; it runs after the import. Record this as an ADR-0033
   amendment.

**Notes.** The text-only rule and size caps are required: durable chats treat
stored history as trusted, so imported assistant rows become model input. A
return path alone does nothing until the import exists, since `/c/<guestId>`
still 404s for a signed-in user. Vercel Chatbot, on our stack, also drops guest
chats; HuggingChat is the reference with our exact funnel. Medium, not high:
sign-in hides rather than deletes, guests are capped at 5 messages a day, and
the sign-out wipe has a real privacy reason on shared devices.

### A signed-out tab keeps acting signed in

Severity: Medium.

**What is wrong.** If you sign out in one tab, a second open tab still looks
signed in. For a few minutes (until its cached Convex token expires), messages
sent from it run as guest turns under the real account id: they are saved
nowhere and vanish on reload. After that, or whenever a session simply ends, the
send button stops working with no explanation until a reload.

**Our code.**
- `app/api/chat/route.ts:85-93`: identity comes only from the WorkOS cookie.
  With no cookie, `app/api/chat/route.ts:193-195` uses the body's `userId` as
  the guest `anonymousId`.
- `lib/chat-messages/chat-turn-contract.ts:168-175`: only checks that some
  `userId` exists. `isGuestUserId` (`lib/chat-store/identity.ts:86-90`) has no
  caller anywhere.
- `app/api/chat/durable-turn-runtime.ts:986-1032`: the guest runtime writes
  nothing, and the signed-in client keeps no local copy of durable turns
  (`app/components/chat/use-chat-core.ts:600-606`), so the turn is lost.
- `app/providers/convex-client-provider.tsx:27-47`: when the token refresh
  fails or comes back empty, `fetchAccessToken` returns null with no reload and
  no sign-out. `convex-client-provider.test.tsx:129-144` locks that in.
- `lib/user-store/provider.tsx:232-238`: `isChatAdmissionReady` goes false once
  Convex auth drops, which disables sending with no message. AuthKit 4.3.1's
  focus check only reloads on a "Failed to fetch" error
  (`node_modules/@workos-inc/authkit-nextjs/dist/esm/components/authkit-provider.js:115-132`),
  so `useAuth` keeps the old user.

**How references handle it.**
- Vercel Chatbot, `app/(chat)/api/chat/route.ts:93-95`: returns unauthorized
  when there is no session. Guests get their own server-issued session, so the
  body never carries identity, and `:120-123` refuses a chat owned by someone
  else.
- LibreChat, `packages/data-provider/src/request.ts:388-414`: a 401 triggers
  one token refresh, and if it fails or comes back empty, `redirectToLoginOnce`
  sends the user to login.
- LibreChat, `client/src/hooks/AuthContext.tsx:108-114`: runs end-of-session
  cleanup every time the session is lost, including a silent refresh that comes
  back empty.

**Fix.**
1. Server: in `app/api/chat/route.ts`, just after `parseChatTurnRequest`, return
   401 with a new `SESSION_EXPIRED` code when there is no session but the body
   looks signed-in: `userId` fails `isGuestUserId`, or the body carries
   `chatVersion`, `expectedVisibleMessageCount`, `edit` or `regeneration`. The
   field check keeps working if guest identity later moves to a server-signed
   cookie (TODO "Guest abuse").
2. Client: add one session-ended handler, called from
   `AcceptanceAwareChatTransport`
   (`app/components/chat/use-detachable-chat-stream.ts`) on 401
   `SESSION_EXPIRED`, and from `fetchAccessToken` when it returns null while
   `useAuth` still reports a user. It runs the cleanup from
   `signOutAndClearLocalState` without the WorkOS redirect, then does a full
   page load (reload, or sign-in with the current path as return path).
3. Update the one provider test to expect the handler to fire.

**Notes.** The silent guest turn needs a cross-tab sign-out and then a send
within about 5 minutes (Convex refetches its token 10 seconds before expiry),
so it is uncommon. The blocked composer after any session end is the likelier
symptom. Neither the TODO "Account deletion" nor "Guest abuse" item covers
this, and a server-signed guest cookie alone would not fix it.

### Shared chat pages can be indexed

Severity: Medium.

**What is wrong.** The public share page tells search engines they may list it.
If a share link is posted anywhere public, the conversation can show up in
search results under its title, and the public view still exposes the system
prompt, raw tool output and reasoning (TODO "Sharing: revoke and a safe public
view"). The share dialog does warn that the chat may appear in search results,
but only after it is already public, and there is no un-share yet.

**Our code.**
- `app/share/[chatId]/page.tsx:21-60`: `generateMetadata` returns title,
  description, Open Graph `article` and Twitter tags, with no `robots` field.
- `next.config.ts:77-95`: the security headers applied to every path
  (`:105-107`) include no `X-Robots-Tag`. There is no `app/robots.ts` or
  `public/robots.txt`.
- `app/components/layout/dialog-publish.tsx:96-99`: the post-publish copy says
  the chat "may appear in community feeds, featured pages, or search results in
  the future". It was inherited from the upstream fork, and none of those
  features exist. The same copy is at `:116-119` and in
  `app/components/layout/share-publish-drawer.tsx:28-30`.
- `app/design-system/layout.tsx:5-11`: the right pattern already exists here
  (`robots: { index: false, follow: false }`).

**How references handle it.**
- LibreChat, `api/server/middleware/noIndex.js:1-9`: sends
  `X-Robots-Tag: noindex` by default for the whole app (wired at
  `api/server/index.js:334`).
- OpenWebUI, `src/routes/s/[id]/+page.svelte:176`: every shared chat page has a
  `noindex,nofollow` robots meta tag.
- LobeHub, `src/app/spa-share/[locale]/[[...path]]/route.ts:51`: share pages
  emit `noindex, nofollow`, and `src/app/robots.tsx:30` also disallows
  `/share/*`.

**Fix.**
1. Add `robots: { index: false, follow: false }` to the object returned by
   `generateMetadata` in `app/share/[chatId]/page.tsx`, or add an
   `app/share/layout.tsx` that copies the design-system layout.
2. Optionally also send `X-Robots-Tag: noindex` for `/share/:path*` in
   `next.config.ts` `headers()`. That also covers 404s and non-HTML crawlers.
3. Do not rely on a `robots.txt` block alone: a blocked crawler never sees the
   `noindex`, so the bare URL can still be listed.
4. Change the copy in `dialog-publish.tsx` and `share-publish-drawer.tsx` to
   "Anyone with the link can view this conversation."
5. Keep the Open Graph and Twitter tags; `noindex` does not affect link previews
   in Slack, X or iMessage.

**Notes.** HuggingChat allows its `/r/` share pages on purpose
(`static/robots.txt:3`), so noindex is the majority default, not a universal
one. If public discovery is ever wanted, make it an explicit per-share opt-in
and fold it into the TODO "Sharing: revoke and a safe public view" item.

### Drafts survive sign-out

Severity: Low.

**What is wrong.** Unsent composer text is saved in localStorage so it survives
a reload. The home composer uses one shared key, `chat-draft-new`, for guests
and every account, and sign-out never clears draft keys. On a shared computer,
text one person typed but did not send shows up again for whoever uses the site
next.

**Our code.**
- `app/hooks/use-chat-draft.ts:8-9`: keys drafts as `chat-draft-<chatId>`, or
  the shared `chat-draft-new` when there is no chat.
- `app/components/chat-input/composer.tsx:131-153`: the home composer has no
  chat or scope id, so `useChatDraft` (`:331-333`) reads and restores
  `chat-draft-new`. Project composers use `chat-draft-project-<id>`
  (`app/components/chat/chat.tsx:408`).
- `app/components/layout/sign-out.ts:34`: cleanup resets messages, chats and
  IndexedDB, but no localStorage key. The only draft removals are inside
  `app/hooks/use-chat-draft.ts:24-39`.

**How references handle it.**
- LibreChat, `client/src/utils/localStorage.ts:27-42`:
  `clearComposerDraftStorage` removes every draft key, and its comment names the
  shared-browser and account-switch risk. `clearLocalStorage` (`:44-47`) runs it
  first.
- LibreChat, `client/src/hooks/AuthContext.tsx:56-60`: `endSessionClientState`
  clears drafts and runs on every way a session ends (`:108-114`, plus the
  logout handlers).
- LibreChat, `client/src/utils/localStorage.ts:73-88`:
  `clearConversationStorage` removes a conversation's keys when it is deleted.

**Fix.** Add a small helper that removes every localStorage key starting with
`chat-draft-`, and add it to the `cleanupTasks` list in
`signOutAndClearLocalState` (`app/components/layout/sign-out.ts`). Do not clear
drafts on sign-in, so a guest's draft still carries into the new account.
Optionally remove `chat-draft-<id>` when a chat is deleted. Scoping keys by user
id is heavier and not needed once sign-out clears them.

**Notes.** Put the helper next to the safe-storage helper planned in the TODO
"Chat client hardening" item (3). Stale drafts for deleted chats are clutter
only: chat ids are random UUIDs that are never reused (ADR-0033).

### User bootstrap trusts browser-sent sync fields

Severity: Low.

**What is wrong.** When a signed-in user has no row yet, the browser calls the
public `users.createOrUpdate` mutation, which writes whatever email, names,
avatar URL and WorkOS "last updated" date the caller sends. Any signed-in user
can also call it directly. Our WorkOS webhook sync skips any event older than
the stored date, so planting a far-future date makes every later
`user.updated` and `user.deleted` event do nothing, and that user's deletion
flag (and the planned deletion cascade) never lands.

**Our code.**
- `convex/users.ts:88-114`: `createOrUpdate` is an `identityMutation`. Its only
  check is `identity.subject === args.workosUserId`, and it forwards `email`,
  names, `profileImage` and `workosUpdatedAt` from the caller.
- `lib/user-store/provider.tsx:99-108`: fills those fields from the browser's
  WorkOS user object.
- `convex/userSync.ts:69-80`: the upsert skips older incoming updates and
  stores the caller's timestamp. The insert path (`:110-122`) stores it too.
- `convex/userSync.ts:155-159`: `softDeleteAppUserFromWorkOS` applies the same
  older-update skip, so a planted date blocks deletion.

**How references handle it.**
- WorkOS AuthKit component (already installed),
  `node_modules/@convex-dev/workos-authkit/dist/component/lib.js:72-83`: only
  verified webhooks write its user mirror, and `user.deleted` deletes with no
  timestamp check.
- LibreChat, `api/strategies/openidStrategy.js:561-573`: takes email and profile
  only from verified token claims or the provider's userinfo, never from the
  request body.

**Fix.** Add this to the TODO "Account deletion must revoke application access"
item instead of tracking it separately.
1. Remove `workosUpdatedAt` from the public `createOrUpdate` args
   (`convex/users.ts:89-97`) and from the call in
   `lib/user-store/provider.tsx`. Only the verified webhook handlers in
   `convex/workosAuth.ts` should set it.
2. Make the public bootstrap insert-only: when a row exists, return it without
   patching email, profile or lifecycle flags.
3. In `softDeleteAppUserFromWorkOS`, drop the older-update skip so deletion
   always applies, as the component does.

**Notes.** Impact is narrow today: `email` and `profileImage` are only shown back
to their owner and never used for access, and WorkOS stops issuing tokens once
it deletes a user. The TODO's current plan (stop the bootstrap from clearing the
deletion flags) does not close this on its own, because the date can be planted
at insert. Do not switch the bootstrap to `authKit.getAuthUser`: that mirror is
filled by webhooks, and the bootstrap exists for when the webhook has not
arrived yet. Related: the component's `user.deleted` returns early when its
mirror row is missing (`lib.js:78-81`), before our `onEventHandle` runs, so our
soft delete never runs for users the mirror missed.

## Admission limits

### No per-user cap on running answers

Severity: Medium.

**What is wrong.** A signed-in user can have any number of answers generating
at the same time, as long as each one is in a different chat. The only gate on
every signed-in turn is a 1000-per-day counter. The one per-minute brake (30 per
minute) lives inside the platform allowance reservation, so turns on the
user's own key (BYOK, "bring your own key") never meet it. Each run can hold a
server function for up to 5 minutes (`app/api/chat/route.ts:33`) and, with
tools on, make up to 20 model calls (`app/api/chat/chat-turn-runtime.ts:770-776`),
so a script with a cheap key of its own can start hundreds of runs at once and
load shared Convex, Vercel and Redis capacity for everyone.

**Our code.**
- `convex/usage.ts:18-19` and `convex/usage.ts:196-228`: the signed-in gate is
  a UTC-day counter only (5 for guests, 1000 signed in).
- `app/api/chat/route.ts:197-288`: admission is that counter plus credential
  resolution. Nothing counts the user's live runs.
- `convex/chatRuntime.ts:933-973` (called at `convex/chatRuntime.ts:2030`):
  supersession only scans and closes older runs in the same chat, so N chats
  can run N turns in parallel.
- `convex/schema.ts:317-324`: `generationRuns` has `by_user` and `by_status`
  but no user plus status index, and no code reads a user's live runs.
- `convex/usageAllowance.ts:191` and `convex/usageAllowance.ts:312-322`: the
  30 per minute throttle runs only inside the platform reservation, so BYOK
  turns skip it. The reusable limiter in `convex/rateLimits.ts:20-23` has only
  the `mcp_test` and `profile_image_upload` buckets; the chat route never uses
  it.

**How references handle it.**
- LibreChat, `packages/api/src/middleware/concurrency.ts:103-145`: an atomic
  Redis check-and-increment caps pending answers per user
  (`CONCURRENT_MESSAGE_MAX`, default 2, at `concurrency.ts:8-9`).
  `api/server/controllers/agents/request.js:1454-1471` returns 429 over the
  cap, and `request.js:343-351` frees the slot when the answer finishes.
- LibreChat, `api/server/middleware/limiters/messageLimiters.js:7-21` and
  `50-76`: 40 sends per minute by IP and by user, wired on the chat router at
  `api/server/routes/agents/index.js:1154-1184`. Its `.env.example:864-873`
  turns on the 2-answer cap and the per-IP limit; the per-user limit ships off.
- trigger.dev, `docs/concurrency.mdx:141-160`: passing the user id as a
  `concurrencyKey` gives each user their own capped pool of running jobs.

**Fix.**
1. In `prepareGenerationForChat` (`convex/chatRuntime.ts:1996`), right after
   `closeSupersededGenerationsForChat` so a regenerate or edit frees its own
   slot, count the user's live runs with a new `by_user_status` index
   (`["userId", "status"]`) in `convex/schema.ts`. Count `queued`, `running`
   and `streaming` (not `awaiting_approval`), use `take(CAP + 1)` with a cap
   around 3, and throw a typed `ConvexError` such as
   `too_many_active_generations`. Map it to a 429 with a short "wait for an
   answer to finish" message next to the other prepare codes in
   `app/api/chat/durable-turn-runtime.ts:1612-1652`.
2. Add a per-minute bucket (around 20 per minute) for every signed-in send in
   `admitUsageHandler` (`convex/usage.ts:120-229`), reusing
   `evaluateFixedWindow` and the `apiRateLimits` table from
   `convex/rateLimits.ts`. Surface it from `admitServerSideUsage`
   (`app/api/chat/api.ts:92-114`) as 429 with `Retry-After`. BYOK and $0 turns
   then get the same brake as platform turns. `PublicChatHttpError`
   (`app/api/chat/public-http-error.ts`) has no retry field and
   `createErrorResponse` (`app/api/chat/utils.ts:57-67`) sets no headers, so
   add an optional `retryAfterSeconds` there once.
3. Leave the per-IP bucket to the guest-abuse TODO.

**Notes.** Using the run row as the counter keeps the check in the same
transaction that inserts the run, so slots cannot leak: a crashed worker frees
its slot through the 45 s lease (`convex/domain/generation_run_liveness.ts:28-35`)
and the reaper cron (`convex/crons.ts:18-23`), and a platform reservation made
before the cap refuses is released by the route's existing catch
(`app/api/chat/route.ts:331-346`). LibreChat's Redis counter fails open when
Redis errors (`concurrency.ts:140-143`); do not copy that. Platform turns are
already partly bounded, because each live run holds its credit estimate
against the $1 monthly free grant. The real gaps are BYOK turns, $0 routes, and
having no cap at all on runs at once. Normal use will not hit this; scripts and
abuse will.

### One user can exhaust the shared free-model quota

Severity: Low.

**What is wrong.** Two OpenRouter `:free` models (Gemma 4 26B and Nemotron 3
Ultra) are platform-funded for signed-in users. OpenRouter limits `:free`
models per account: 20 requests a minute and 50 a day (1000 a day once the
account has bought $10 of credits), shared by every user of our app. We price
them at $0, so the allowance barely notices them, while each user may send 30 a
minute and 1000 a day. One busy user can use up both models for everyone until
the UTC day ends, and everyone else then gets provider rate-limit errors while
the picker still lists them.

**Our code.**
- `lib/config.ts:7-13`: both `:free` ids are in `FREE_MODELS_IDS`, which
  `lib/models/platform-entitlement.ts:41-47` makes platform-funded for
  signed-in users.
- `lib/models/data/openrouter.generated.ts:26-30` and `63-67`: both have
  `inputCost: 0`, `outputCost: 0` and `tools: true`.
- `lib/usage/billable-pricing.ts:13-15`: a $0 route is a valid zero-rate
  snapshot, so the reservation in `lib/model-route-resolver.ts:429-471` holds
  only a small title estimate and the allowance check at
  `convex/usageAllowance.ts:325` does not limit how often these models run.
- `convex/usageAllowance.ts:191` and `convex/usage.ts:19`: the only request
  bounds are per user. Nothing counts requests per route or across all users.

**How references handle it.**
- trigger.dev, `docs/concurrency.mdx:204-223`: one `total` limit shared by
  every tenant caps traffic to a single external API. It is a concurrency cap,
  not a daily budget, but it is the same "one shared bucket for a shared
  upstream" idea.
- No reference app budgets a shared upstream quota. HuggingChat,
  `src/routes/conversation/[id]/+server.ts:131-148`, only has a per-user and
  per-IP messages-per-minute limit, similar to ours. The defect is proven by
  OpenRouter's limits page (`openrouter.ai/docs/api-reference/limits`), which
  says the limit is per account and extra keys or accounts do not raise it.

**Fix.** Give $0 platform routes a request budget, built on the existing
`apiRateLimits` table and `evaluateFixedWindow` pattern inside
`reserveUsageForUser` (`convex/usageAllowance.ts:256`).
1. Add a per-user bucket for zero-rate routes: a small daily cap plus a
   per-minute cap, well below the account quota.
2. Add one shared app-wide bucket for OpenRouter `:free` traffic, about 15 a
   minute (under the 20 a minute cap).
3. When either refuses, return a typed result so
   `lib/model-route-resolver.ts` can say "This free model is busy. Try again
   later or pick another model." instead of passing on the provider's 429.
4. Record the rule as an ADR-0021 amendment in the platform-paid operation
   inventory (`docs/adr/0021-platform-usage-allowance.md:354-362`).

**Notes.** No money is at risk: `:free` requests bill $0, and the default model
(`gpt-5-mini`) is unaffected. ADR-0021 only decides that $0 routes cost zero
credits (`docs/adr/0021-platform-usage-allowance.md:40-41`); it never
considered the shared upstream quota, so this is a gap, not a reversal. Check
the production OpenRouter account first: below $10 of lifetime purchases, the
whole app gets only 50 free requests a day.

### Platform throttle shows the wrong error

Severity: Low.

**What is wrong.** When a user trips the 30 per minute platform throttle, the
route resolver treats it like any skipped candidate and moves on. With no saved
key of their own, the walk ends as `no_eligible_route`, and the user sees "This
model requires an API key for OpenAI or OpenRouter", even on `gpt-5-mini`, the
free default. The wait time the throttle computed is thrown away. A user who
has run out of allowance and keeps retrying also flips from the honest
"allowance exhausted" error to this wrong one after about 8-15 tries in a
minute, because each try spends one throttle slot per platform route it checks.

**Our code.**
- `convex/usageAllowance.ts:312-322`: the throttle runs before the allowance
  check (`convex/usageAllowance.ts:324-338`) and returns
  `{ kind: "rate_limited", retryAfterMs }`.
- `lib/model-route-resolver.ts:476-485`: `rate_limited` is skipped exactly like
  `conflict`, falling through to the next candidate, including fallback BYOK
  (`lib/model-route-resolver.ts:402-406`).
- `lib/model-route-resolver.ts:516-520`: the final failure only tracks
  insufficient allowance, so a throttled walk becomes `no_eligible_route` and
  `retryAfterMs` is never read.
- `app/api/chat/api.ts:248-255`: `toAdmissionError` turns that into 401
  `MISSING_API_KEY`.

**How references handle it.**
- LibreChat, `api/server/middleware/limiters/messageLimiters.js:31-44`: the
  chat send limiter replies with a typed `MESSAGE_LIMIT` error that carries
  the window and reset time. Its agent-event limiter (`messageLimiters.js:84-107`)
  returns 429 with `Retry-After` and a typed error (`type: 'rate_limit_error'`).
- HuggingChat, `src/routes/conversation/[id]/+server.ts:147-148`: returns 429
  with "You are sending too many messages. Try again later."
  (`src/lib/stores/errors.ts:6`).

**Fix.**
1. In `lib/model-route-resolver.ts`, note when a platform candidate returns
   `rate_limited` and keep the smallest `retryAfterMs`. If the walk ends with
   no route, return a new failure reason `rate_limited` with that value, not
   `no_eligible_route`.
2. In `toAdmissionError` (`app/api/chat/api.ts:200-256`), map it to 429
   `RATE_LIMITED` with `Retry-After` in seconds, the same way our own
   `app/api/_lib/authenticated-route.ts:107-121` already does. This needs the
   same optional `retryAfterSeconds` on `PublicChatHttpError` and header in
   `createErrorResponse` (`app/api/chat/utils.ts:57-67`) as the per-user cap
   entry above.
3. Optional: spend the throttle once per `requestId` instead of once per
   platform candidate in `convex/usageAllowance.ts`, so a user with no
   allowance keeps getting `ALLOWANCE_EXHAUSTED`.

Leave the fall-through to a saved fallback key as is (the user chose to have
it used when the platform cannot serve), and leave the daily-limit 403 alone
(it already says "try again tomorrow").

**Notes.** Rare in practice: 30 platform turns a minute is one every 2
seconds, so this mostly hits scripts, fast Stop-and-resend, or retries after
the allowance runs out. No ADR or test makes the fall-through deliberate;
ADR-0021 only describes falling through on insufficient allowance
(`docs/adr/0021-platform-usage-allowance.md:310-316`).

### Tool-limit rows are never deleted

Severity: Low.

**What is wrong.** Each time a tool such as web search or page reading runs,
`checkAndConsume` adds to a counter row in `toolLimitBuckets` (one row per
scope for each minute of use), and page reading keeps a separate row per
website. Nothing ever deletes these rows: there is no cleanup job, no sweep on
write, and account deletion does not touch the table. The table only grows,
and it keeps a per-minute record of which sites each signed-in user read,
keyed by their WorkOS id, even after the account is deleted.

**Our code.**
- `convex/toolLimits.ts:162-194`: inserts or patches one row per scope per
  bucket; no code removes old rows.
- `convex/schema.ts:608-625`: the table's only index starts with the actor key
  (actor, limit type, tool, scope, key mode, bucket start), so a time-based
  cleanup has nothing to range over.
- `lib/tools/policy.ts:403-420`: `extract_content` sends each domain as its
  own scope key, so every site read becomes its own row.
- `convex/crons.ts:18-71`: six jobs, none for `toolLimitBuckets`.
- Compare `convex/rateLimits.ts:16-17` and `convex/rateLimits.ts:115-121`: our
  other limiter sweeps stale buckets on every write.

**How references handle it.**
- HuggingChat, `src/routes/conversation/[id]/+server.ts:122-128`: each
  rate-limit event is written with `expiresAt` one minute out, and
  `src/lib/server/database.ts:491-493` adds a TTL index (the database deletes
  expired rows by itself).
- LibreChat, `api/server/middleware/limiters/toolCallLimiter.js:21-29`: the
  tool-call limiter has a server-fixed window and max, is keyed by the
  signed-in user, and keeps its counts in the Redis limiter store
  (`packages/api/src/cache/cacheFactory.ts:187`), where keys expire with the
  window.

**Fix.**
1. Add an index on `updatedAt` to `toolLimitBuckets` in `convex/schema.ts`.
2. Add a small bounded cron in `convex/crons.ts` (for example every 10
   minutes, a few hundred rows per run) that deletes rows older than the
   longest tool window (15 minutes, `lib/config.ts:74` and `lib/config.ts:81`).
   A sweep on write like `convex/rateLimits.ts` is not enough alone, because a
   domain that is never read again is never swept.
3. Add `toolLimitBuckets` to the account-deletion cascade already listed in
   TODO.md.
4. Optional: resolve `windowMs`, `maxCount` and `bucketSizeMs` on the server by
   tool name, like `API_RATE_LIMIT_POLICIES` in `convex/rateLimits.ts:20-23`,
   so callers send only the tool name and scopes.

**Notes.** The caller-chosen policy on this public mutation
(`convex/toolLimits.ts:28-44`) does not let anyone raise the enforced limit:
the server always sends its own policy (`lib/tools/policy.ts:288-317`), and
signed-in actor keys come from the login token (`convex/toolLimits.ts:72-81`).
Making the mutation internal and fixing the fakeable guest id are already in
the TODO.md item "Guest abuse and spending limits". Growth costs storage only,
since reads are index range scans bounded to the 15-minute window.

### Feedback has no length or rate limit

Severity: Low.

**What is wrong.** The Feedback box in the user menu saves whatever text it
receives. There is no length limit on the server or in the text box, and no
limit on how often it can be sent. Every send adds a new row, so a signed-in
person or a script can keep sending messages close to Convex's 1 MiB limit per
row and fill the database. The rows are free text tied to a user id, and the
planned account-deletion cleanup does not list them.

**Our code.**
- `convex/feedback.ts:8-18`: `submit` is a public signed-in mutation that
  inserts `message: v.string()` as is, with no length check and no rate limit.
- `components/common/feedback-form.tsx:122-127`: the textarea has no
  `maxLength`. The only check is `feedback.trim()`
  (`components/common/feedback-form.tsx:50`), and the untrimmed text is sent
  (`components/common/feedback-form.tsx:53`).
- `components/common/model-selector/pro-dialog.tsx:40-45`: a second caller
  sends a short `I want access to ${currentModel}` note through the same
  mutation.
- `convex/schema.ts:458-461`: the `feedback` table has no size or retention
  rule.

**How references handle it.**
- LibreChat, `packages/data-provider/src/feedback.ts:110-114`: feedback is a
  fixed rating, a fixed tag, and optional text capped with
  `z.string().max(1024)`. `api/server/routes/messages.js:703-707` rejects
  anything that fails the check with a 400.
- LibreChat, `client/src/components/Chat/Messages/Feedback.tsx:324-331`: the
  text box sets `maxLength={500}`, so the limit shows in the UI too. Feedback is
  saved onto the message it rates (`api/server/routes/messages.js:709-716`), so
  sending again replaces it instead of adding a row.

**Fix.**
1. Add a small policy module beside `lib/projects/policy.ts` (for example
   `lib/feedback/policy.ts`) with `MAX_FEEDBACK_LENGTH` of about 2,000 and a
   `normalizeFeedbackMessage` that trims, rejects empty text and rejects text
   over the limit. This copies the shape of `normalizeProjectName`
   (`lib/projects/policy.ts:1-21`), which `convex/projects.ts:67-88` already
   calls on the server.
2. Call it in `submit` (`convex/feedback.ts`), and set `maxLength` from the
   same constant on the textarea in `components/common/feedback-form.tsx`.
3. Optional: add a `feedback` entry to `API_RATE_LIMIT_POLICIES`
   (`convex/rateLimits.ts:20-23`). The counting code lives inside the public
   `consume` handler (`convex/rateLimits.ts:100-150`), so first move it into a
   helper that takes `ctx` and the user id, then call that helper from
   `submit`. The window math in `evaluateFixedWindow` can stay as is.
4. Add "feedback" to the table list in the TODO.md item "Account deletion must
   revoke application access".

**Notes.** The internal `list` query (`convex/feedback.ts:24-28`) loads the
whole table in one read, but nothing calls it. Feedback is read in the Convex
dashboard, which pages through rows, so delete `list` or leave it; it does not
need paging. The Pro dialog note is far under a 2,000 character cap. This is
the same kind of gap as the TODO.md item "One record per tool call, and lock
down `toolCallLog.log`". Chat titles (`convex/chats.ts:499-509`) and the
profile system prompt (`convex/users.ts:136-156`) are also uncapped, but each
overwrites one row instead of adding a new one.

## Deploys and version skew

### Two systems deploy production Convex

Severity: Medium.

**What is wrong.** Each merge to main pushes production Convex from two places:
the Vercel production build, and a GitHub Actions job that runs a few minutes
later once CI passes. When two PRs merge close together, the slower CI job can
push older functions over newer ones. On 2026-09-04 Vercel pushed f1e00836 at
19:34:28Z, CI pushed the older 6d31b716 at 19:35:27Z, and for about 6 minutes
the live site ran the new frontend against Convex code that lacked f1e00836's
changes to `convex/chatRuntime.ts` and `convex/lib/auth.ts`. Also, main has no
branch protection, so Vercel ships Convex even when CI fails.

**Our code.**
- `vercel.json:1-5`: the build command is `bun run convex:deploy` for every
  Vercel build, including Production.
- `scripts/convex-deploy.mjs:97-112`: runs the schema preflight, then
  `convex deploy --cmd "next build"` (args at lines 8-15). The Convex CLI runs
  the build and then pushes functions
  (`node_modules/convex/dist/esm/cli/lib/deploy2.js:300-320`).
- `.github/workflows/ci-cd.yml:103-158`: a second production deploy job that
  runs the same command after `validate` and `build`. It gates only itself, so
  it cannot stop Vercel's earlier push.
- `.github/workflows/ci-cd.yml:14-17`: the comment says main deploys are
  "never cancelled", but GitHub keeps only one pending run per concurrency
  group, so the middle of three quick merges is dropped (tests included).
- `docs/environment.md:289-298`: an extra GitHub variable and secrets that
  exist only to feed the second deployer.

**How references handle it.**
- Convex docs (docs.convex.dev/production/hosting/vercel): the documented setup
  sets the Vercel build command to `npx convex deploy --cmd 'npm run build'`,
  so one build ships frontend and backend from the same commit. It describes no
  separate CI deploy. Our `vercel.json` already does this; the CI job is the
  extra piece.
- HuggingChat, `.github/workflows/deploy-prod.yml:8-84`: one pipeline builds
  one image tagged with the commit (`sha-<short>`, line 31) and deploys that
  exact tag (lines 65-84). This is only an analogy: it is a single Docker image
  deployed by hand.

**Fix.**
1. Delete the `deploy` job in `.github/workflows/ci-cd.yml` (lines 103-158) and
   keep the Vercel build as the only production Convex deployer.
2. Turn on branch protection (or a ruleset) for main that requires the CI
   `validate` and `build` checks, so failing code cannot merge and trigger
   Vercel.
3. In `scripts/convex-deploy.mjs`, when `VERCEL_ENV=production`, compare
   `VERCEL_GIT_COMMIT_SHA` with the tip of `origin/main` (`git ls-remote`) and
   skip the push if the build is stale, because overlapping Vercel builds can
   still race each other.
4. Remove the GitHub-only notes in `docs/environment.md:289-298` and fix the
   concurrency comment at `.github/workflows/ci-cd.yml:14`.

**Notes.** Medium, not High: there are no users yet, each Convex push is
atomic, and the bad window heals itself within minutes. It recurs whenever two
merges land within about 10 minutes, and it can break chat calls whenever one
PR changes function arguments. Each merge also builds Next three times today
(CI build, CI deploy, Vercel).

### Open tabs never learn about a new version

Severity: Medium.

**What is wrong.** A deploy updates Convex right away, but an open tab keeps
running the old client code, and nothing tells it that a new version exists.
If the deploy makes an incompatible change to a live query the old client still
calls, the next time that query runs (after a write, a reconnect, or opening a
chat) its error is thrown during render and falls through to
`app/global-error.tsx`: a bare "Application error" page with no button. A retry
would send the same outdated call. Only loading the new code fixes it, and
today the user has to know to refresh by hand.

**Our code.**
- `lib/convex/use-per-user-query.ts:60-77`: every non-paginated live read goes
  through the convex-helpers cached `useQuery`, which throws server errors into
  render (`node_modules/convex-helpers/react/cache/hooks.js:121-122`).
- Callers in providers mounted on every chat page:
  `lib/user-store/provider.tsx:69`,
  `lib/user-preference-store/provider.tsx:142`,
  `lib/chat-store/messages/provider.tsx:104-111`,
  `lib/chat-store/chats/provider.tsx:240-243`.
- `app/global-error.tsx:7-22`: renders `NextError statusCode={0}`, with no
  Reload button. No `app/**/error.tsx` exists.
- `lib/observability/build-identity.ts:24-34`: the only build id is
  server-side. The client has no build id, version check, or reload logic.
- `node_modules/next/dist/esm/client/components/router-reducer/fetch-server-response.js:134-137`:
  Next's own "build changed, do a full reload" check runs only on router
  navigations. A user who stays in one chat, or starts a chat through the
  `history.pushState` commit (the address-bar update when a new chat gets its
  URL, `lib/chat-store/session/provider.tsx:130-153`), never triggers it.

**How references handle it.**
- OpenWebUI, `svelte.config.js:20-42`: bakes the git commit into the client as
  its version and polls the server for a new one every 60 s. Once a new
  version is seen, the next in-app navigation becomes a full page load
  (`src/routes/+layout.svelte:99-105`).
- OpenWebUI, `src/routes/+layout.svelte:201-215`: on every socket connect or
  reconnect it compares the server's `version` and `deployment_id` with its own
  and reloads when they differ.
- LobeHub, `src/utils/chunkError.ts:44-57`: reloads once behind a
  `sessionStorage` flag, then shows a "new version, refresh" toast (used for
  chunk errors, but the same recovery shape).

**Fix.** Add one small app-version module:
1. Bake the build id (`resolveBuildId` in `lib/observability/build-identity.ts`)
   into the client as `NEXT_PUBLIC_BUILD_ID` in `next.config.ts`.
2. Serve the live id from a no-store `GET /api/version` route on the Vercel
   deployment. Do not rely on a Convex query as the signal: Convex is pushed
   before Vercel makes the new frontend live, so a Convex-based signal can
   reload the tab into the old build and loop.
3. Check when the tab becomes visible, when the network comes back, and every
   few minutes. On a mismatch, mark the tab stale, make the next in-app
   navigation (including the `pushState` commit in
   `lib/chat-store/session/provider.tsx`) a full page load, and show one
   "Update available, Reload" toast while no turn is streaming.
4. In the `error.tsx` planned under the TODO "Error boundaries" item, treat
   Convex "Could not find public function" and `ArgumentValidationError` as
   version skew and reload once behind a `sessionStorage` guard, instead of
   offering Retry.

**Notes.** Low urgency before launch: there are no users, the crash needs an
incompatible change to a query the old UI uses, and a manual refresh recovers.
Convex docs (docs.convex.dev/production) warn that users can still run the old
website after the backend changes; the argument rule belongs in "No
backward-compatibility rule for Convex functions" below. Vercel Skew Protection
does not cover the Convex websocket. The TODO "Error boundaries" item adds a
retry screen but not version detection, and retry cannot fix skew.

### A missing lazy chunk crashes the app

Severity: Low.

**What is wrong.** A few UI pieces are loaded lazily with `next/dynamic`, as
separate chunk files (pieces of the app's JavaScript fetched on first use). If
a deploy lands while a tab is open and Vercel Skew Protection is off or
expired, the old tab can ask for a chunk file that no longer exists. The failed
load is cached, so no retry can recover it; only a page reload does. No code
recognizes this error or reloads, and it ends on `app/global-error.tsx`, which
shows "Application error" with no button (worse than Next's built-in default,
which has Reload and Back).

**Our code.**
- `app/components/layout/share-publish-content-loader.tsx:6-12`: the Share
  dialog, loaded on first hover or open. This is the clearest remaining path.
- `components/ui/lazy-markdown.ts:9-13`: the markdown renderer. It is warmed
  early in most flows (existing messages, touch devices via
  `components/ui/intent-prefetch.ts:54-61`, composer hover or focus at
  `app/components/chat-input/composer.tsx:467`), so only a desktop tab left on
  an empty chat, never hovered, is exposed.
- `node_modules/next/dist/esm/shared/lib/lazy-dynamic/loadable.js:30`:
  `React.lazy` is created once per module, so a rejected load stays rejected.
  The Turbopack runtime retries a failed chunk once, then caches the failure
  too.
- `app/components/chat-input/composer.tsx:474` and
  `components/ui/intent-prefetch.ts:41-43`: preload failures are swallowed, and
  there is no `window` `unhandledrejection` listener anywhere.
- `app/global-error.tsx:16-22`: `NextError statusCode={0}` renders the
  no-button page (`node_modules/next/dist/esm/pages/_error.js:118-120`). Next's
  built-in default has Reload and Back
  (`node_modules/next/dist/esm/client/components/builtin/global-error.js:39-61`).

**How references handle it.**
- LobeHub, `src/utils/chunkError.ts:3-57`: matches chunk errors by name and
  message (`ChunkLoadError`, `Loading chunk`, failed dynamic imports), reloads
  once behind a `sessionStorage` flag, then shows a "new version, refresh"
  toast. `src/initialize.ts:19-38` wires it to global `unhandledrejection` and
  preload errors, and `src/utils/router.tsx:145-152` calls it from the route
  error boundary. LobeHub keeps this even though it also runs Skew Protection
  (`plugins/vite/vercelSkewProtection.ts:1-23`).
- LibreChat, `client/index.html:134-175`: allows at most one stale-asset reload
  per 60 s, guarded by `sessionStorage`. `client/index.html:187-222` listens
  for failed script loads and failed dynamic imports.

**Fix.**
1. In `app/global-error.tsx`, replace `NextError statusCode={0}` with a minimal
   screen that has a Reload button, or use Next's built-in default.
2. Add one small client helper, `isChunkLoadError` (name `ChunkLoadError`, or a
   message containing "Failed to load chunk" or "Loading chunk"), plus a
   reload-once guard in `sessionStorage` (at most once per 60 s, reads and
   writes in try/catch; after that, a "New version available, Reload" toast).
3. Call it from `global-error.tsx` and from the planned `error.tsx` and
   per-row boundaries before they render a fallback. Optionally also call it
   from a `window` `unhandledrejection` listener in the root client layout. Do
   not call it from the hover and send preload catch blocks: those are
   warm-ups, and a reload there could interrupt someone who only hovered Share.
4. Check in the Vercel dashboard whether Skew Protection is on and what its
   max age is, since it prevents most of these cases.

**Notes.** Narrower than it looks. The sign-in dialog
(`app/components/chat/chat.tsx:48-51`) is always mounted at `chat.tsx:445`, so
its chunk loads at page load, not at the sign-in wall. Route navigation is
already safe (Next reloads on a build mismatch). Fold this into the TODO
"Error boundaries" item: its planned retry cannot recover a cached failed
chunk. Share the reload-once guard with "Open tabs never learn about a new
version".

### Chat API cannot recognize an outdated tab

Severity: Low.

**What is wrong.** The `/api/chat` contract comment promises that a renamed
field is "a compile error on the other, not a production bug". That holds only
when client and server ship together, and an open tab runs old client code
against the new server. The route forwards `edit` and `regeneration` unchecked
to strict Convex validators, and any mismatch comes back as a 400 "Request
does not reference a valid durable chat". The user sees what looks like a
broken chat, when a reload would fix it.

**Our code.**
- `lib/chat-messages/chat-turn-contract.ts:7-14`: the "compile error, not a
  production bug" promise.
- `lib/chat-messages/chat-turn-contract.ts:128-200`: checks only top-level
  fields; nested `edit` and `regeneration` pass through the cast at line 199.
  `app/api/chat/durable-generation-input.ts:65-89` sends them to Convex as
  received.
- `convex/chatRuntime.ts:280-298`: `vEditIntent` and `vRegenerationIntent` are
  strict `v.object`s that reject unknown fields, so even removing an optional
  field breaks old tabs. Message `parts` are `v.any()` and are not affected.
- `app/api/chat/durable-turn-runtime.ts:1653-1668` and
  `app/api/chat/utils.ts:21-32`: any `ArgumentValidationError` becomes a
  generic 400 `INVALID_REQUEST`. The `durable_prepare_argument_rejected` log
  includes the Convex error (which names the field) but not the cause.
- `app/components/chat/public-chat-error.ts:32-57` and
  `app/components/chat/use-chat-core.ts:251-267`: the client shows that text as
  a plain toast with no Reload action. No build id travels with any request.

**How references handle it.**
- OpenWebUI, `src/routes/+layout.svelte:201-215`: fetches the server's
  `version` and `deployment_id` and reloads when they differ from the client's
  own.
- LobeHub, `src/services/_auth.ts:114-118`: sets an `x-lobe-client-version`
  header on its API requests (`packages/const/src/fetch.ts:13`), read on the
  server at `packages/utils/src/server/clientMetadata.ts:60`. It only records
  the version; nothing rejects outdated clients. LibreChat, VercelChatbot and
  HuggingChat have nothing like this.

**Fix.** Keep it small:
1. Send the client build id (the same `NEXT_PUBLIC_BUILD_ID` as in "Open tabs
   never learn about a new version") as a header through the existing transport
   `headers` option at `app/components/chat/use-detachable-chat-stream.ts:196`.
   The AI SDK uses those headers for both `POST /api/chat` and the resume
   stream.
2. In `app/api/chat/utils.ts`, when a request fails validation (a contract 400
   or a Convex `ArgumentValidationError`) and the header differs from the
   server's build id, return code `CLIENT_OUTDATED` with "The app was updated.
   Reload to continue." Add both build ids to the
   `durable_prepare_argument_rejected` log.
3. In `presentChatStreamError` (`app/components/chat/public-chat-error.ts`),
   show `CLIENT_OUTDATED` as a toast with a Reload action.
4. Reword the comment in `lib/chat-messages/chat-turn-contract.ts:7-14` to say
   open tabs can still send the old shape.

**Notes.** This has already happened: PR #136 (dfa4ddf9) added a compat
`title` field to `vEditIntent` because dropping it "would 400 every
first-message edit from a stale tab", and PR #157 (f90547db) removed it. Prefer
this one general signal over per-field shims. Vercel Skew Protection cannot
help, because even a pinned old function calls the single, already-updated
Convex deployment. Only tabs that stay on one chat are affected (navigation
already reloads). Fits under the TODO "Chat client hardening" item.

### No backward-compatibility rule for Convex functions

Severity: Low.

**What is wrong.** Our deploy builds Next, pushes Convex, and only then does
Vercel promote (make live) the new site. So new Convex functions serve the old
website, every open tab, and every `/api/chat` turn still running on the old
Vercel function. If a PR renames or removes a function argument, or makes one
required, those old callers are rejected: a streaming answer's saves can fail
so it ends as failed, and old tabs get errors. The repo has one hand-written
compatibility case today (`titleUsage`), but no written rule or deploy check
makes it happen every time.

**Our code.**
- `node_modules/convex/dist/esm/cli/lib/deploy2.js:300-320`: the build runs
  (line 300) before the push (line 320); Vercel promotes only after that.
  `app/api/chat/route.ts:33` lets an in-flight turn keep running old code for
  up to 300 s.
- `convex/chatRuntime.ts:142-271`: the worker write args
  (`generationRunWriteArgs`) are declared once. The comment at
  `app/api/chat/durable-turn-runtime.ts:104-109` says drift is "a compile
  error", which is only true inside one build.
- `convex/chatRuntime.ts:211-224`: the only hand-written window compat, a
  `titleUsage` union that keeps accepting the old shape "during the
  Convex-first deployment window" (also
  `docs/adr/0021-platform-usage-allowance.md:279-282`).
- `convex/http.ts:241-270`: any dispatch failure, including argument
  validation, returns the same generic 400 "Invalid worker call".
  `app/api/chat/durable-turn-runtime.ts:1179-1230` retries a terminal write
  twice, then returns "failed" and leaves the run to the lease reaper (the
  background job that closes abandoned runs).
- `scripts/convex-schema-contract-preflight.mjs`: checks the schema against
  stored data only, never function arguments. `docs/convex-migrations.md` also
  covers only schema and stored documents.

**How references handle it.**
- Convex docs (docs.convex.dev/production): old clients keep calling the
  backend after a deploy. The safe changes are: add a new function, add an
  optional argument, make an argument optional, or widen it to a union.
  Removing a field is not on the list, because validators reject unknown
  fields.
- trigger.dev,
  `internal-packages/run-engine/src/engine/systems/dequeueSystem.ts:567-580`:
  locks each run to the worker version it started on (`lockedToVersionId`,
  `internal-packages/database/prisma/schema.prisma:1114-1115`). A weak fit:
  Vercel already keeps an in-flight request on its old code, and our gap is
  the shared Convex contract.

**Fix.**
1. Add a short rule to `docs/convex-migrations.md` and to the Database section
   of `AGENTS.md`, next to the schema policy that returns at launch: for one
   deploy after a change, public functions and worker ops keep accepting the
   previous shape, using only Convex's safe changes. Never remove a field or
   make it required in the same PR; remove it in a later PR.
2. State that rolling back means redeploying the old commit through the normal
   pipeline. Vercel Instant Rollback moves only the website and leaves Convex
   on the newer functions.
3. Optional, at launch: add a check next to the schema preflight that compares
   production's `convex function-spec` with the build and fails when a public
   function or worker op disappears or gains a required or narrower argument,
   unless an override flag is set.
4. Keep the worker 400 retryable (it is a catch-all, and the retries cost about
   1.25 s). At most, return a distinct error code for argument-validation
   failures in `convex/http.ts` so logs show a mismatch.

**Notes.** Low today because there are no users; it becomes Medium at launch.
For new turns the window is short (upload and promote, usually under a
minute); in-flight turns are exposed for up to 300 s and open tabs until they
reload. Drift happens in practice: 30 commits touched `convex/chatRuntime.ts`
since mid-July, including an optional-to-required change on
`prepareGeneration` in #155.

## Observability and background work

### Backend failures never reach an alert

Severity: Medium.

**What is wrong.** Our background jobs (stuck-run reapers, platform money
reconcilers) and the WorkOS login webhook report problems only as lines in the
Convex log. Convex keeps those logs for about 90 minutes, and nothing under
`convex/` talks to Sentry, so nobody gets an alert. On the Next side, the
settings routes (API keys, MCP servers, profile image) catch every error, log
it, and return a bare 500 that Sentry never sees. This has already happened:
production never processed a single WorkOS webhook, and on 2026-09-09 we found
out only because the tables were empty.

**Our code.**
- `convex/crons.ts:18-71`: six background jobs, including two platform-usage
  reconcilers. All are internal mutations, and console lines are their only
  way to report a problem.
- `convex/usageAllowance.ts:77-83`: `warnUsage` and `logUsage` only write to
  the console. So the tags for money rules that must never break,
  `usage_bucket_invariant_violation` (175), `usage_balance_negative` (660) and
  `usage_settle_conflict_rejected` (1235), go nowhere else.
- `convex/chatRuntime.ts:3648-3658`: the lease reaper reports
  `run_stale_reaped` with `console.log` (same tag at 3228 and 3826).
  `convex/http.ts:263-269` logs `chat_turn_worker_dispatch_failed` the same
  way. The WorkOS webhook route (`convex/http.ts:23`, the AuthKit component)
  reports failures only to Convex logs.
- `app/api/_lib/convex.ts:30-32`: `internalServerError()` returns a 500 and
  captures nothing. Its callers only `console.error`, for example
  `app/api/user-keys/route.ts:51-53` and `69-70`,
  `app/api/mcp-servers/route.ts:61-62` and `148-149`, and
  `app/api/profile-image/route.ts:93-94`.
- `sentry.server.config.ts:16-29`: there is no console-capture integration,
  so `console.error` only becomes a breadcrumb (a note attached to later
  errors, never an issue of its own). `instrumentation.ts:13`
  (`onRequestError`) sees only thrown errors, and these handlers catch every
  error themselves.

**How references handle it.**
- trigger.dev, `apps/webapp/app/services/logger.server.ts:15-32`: one
  `Logger.onError` hook sends every logged error to Sentry (`captureException`
  or `captureMessage`), with the same redaction as the stdout line. No call
  site has to remember to report.
- trigger.dev,
  `apps/webapp/app/v3/services/alerts/performTaskRunAlerts.server.ts:34-85`:
  failed runs are pushed to configured alert channels, so nobody has to read
  logs to find them. This is a feature for trigger.dev's customers, so the
  comparison is weaker, but the idea is the same.

**Fix.**
1. Next: change `internalServerError()` in `app/api/_lib/convex.ts` to take the
   caught error and a route tag, and call
   `Sentry.captureException(sanitizeExceptionForTelemetry(error))`. Pass the
   error from each catch block. This one change covers user-keys, mcp-servers,
   profile-image, rate-limits and the file preview route.
2. Convex: add one small report helper next to `warnUsage`/`logUsage`, used
   only for events that should never happen: the three money tags above,
   `chat_turn_worker_dispatch_failed`, and reaper or reconciler passes above a
   threshold.
3. If the Convex plan allows it, turn on a log stream (a live copy of the logs
   sent to another service) and exception reporting to the existing Sentry
   project, and alert on those tags. Webhook rejections happen inside the
   AuthKit component, outside our code, so only a log stream can see them. If
   the plan does not allow it, have the helper write a row to a small
   anomalies table, and have a cron action POST a summary to Sentry directly.
   No Next route is needed.

**Notes.** Convex exception reporting alone is not enough. Most of these
signals are tagged console lines that return normally, not thrown errors.
First, check the Convex dashboard and Vercel for an existing log stream or log
drain. The repo cannot prove there is none, although the webhook incident
strongly suggests it. The chat route already reports to Sentry
(`app/api/chat/chat-turn-runtime.ts:2259`), and ADR-0009 and ADR-0011 treat
Sentry as the loud channel, so this extends an existing pattern.

### Config is not validated at deploy

Severity: Low.

**What is wrong.** The app needs several secrets in Vercel, and
`CHAT_ADMISSION_SECRET` must have the same value in Vercel and Convex. Nothing
checks them when we deploy: `env:check` only reads a local `.env.local`. If
`CHAT_ADMISSION_SECRET` differs between the two, every signed-in message fails
with `admission_proof_invalid`. This already happened once in dev. If
`CHAT_STREAM_REDIS_URL` is missing in production, the feature that recovers an
answer after a page refresh turns off silently.

**Our code.**
- `scripts/validate-env.mjs:16-26` and `219-231`: the required-variable list
  and the file validator. They only read a local file, and the only caller is
  `env:check` (`package.json:22`), which points at `.env.local`.
- `scripts/convex-deploy.mjs:97-112`: `runDeploy` runs the schema preflight
  and then `convex deploy`, with no env check. Both the Vercel build command
  and the CI deploy job go through it.
- `lib/chat-stream/server.ts:34-40`: returns no Redis URL in production when
  `CHAT_STREAM_REDIS_URL` is unset. `connection()` (61-63) and the writer
  (128-129) then return null without logging, even though
  `docs/environment.md:74-75` says preview and production require the
  variable.
- `convex/lib/chatAdmissionProof.ts:90-124`: Vercel signs and Convex verifies,
  each with its own copy of `CHAT_ADMISSION_SECRET`. A mismatch throws at
  `convex/chatRuntime.ts:2339-2344`, and `convex/convex.config.ts:6-13` only
  checks that the variable exists.
- `lib/csrf.ts:7-11`: a missing `CSRF_SECRET` throws only when a request
  arrives.

**How references handle it.**
- LibreChat, `packages/api/src/app/checks.ts:173-257`:
  `checkCredentialDatabase` compares hashes of the active secrets with a
  marker stored in the database. That catches an instance running with a
  different key without storing any secret. It runs at boot through
  `performStartupChecks` (`checks.ts:349-351`, called from
  `api/server/index.js:268`). It only warns and does not block startup.
- LobeHub, `packages/env/src/app.ts:36-156`: server env is a typed zod schema
  (`createEnv`) evaluated at module load. Most fields are optional, so this is
  weaker evidence than it looks.

**Fix.**
1. In `runDeploy` (`scripts/convex-deploy.mjs`), before `convex deploy`, fail
   the build when `VERCEL_ENV` is `production` or `preview` and any of these
   is missing: `CSRF_SECRET`, `CHAT_ADMISSION_SECRET` (at least 32 bytes),
   `ENCRYPTION_KEY`, `CHAT_STREAM_REDIS_URL`. Reuse the `validateEnvContent`
   rules in `scripts/validate-env.mjs` instead of adding a schema library.
2. After the deploy, run an internal Convex query that returns
   `HMAC(CHAT_ADMISSION_SECRET, "fingerprint-v1")` (a keyed hash that does not
   reveal the secret). Compare it with the same value computed on the Vercel
   side, and print only "match" or "mismatch", never the secret.
3. Add a one-time `console.warn` in `lib/chat-stream/server.ts` when
   production has no Redis URL.

**Notes.** Severity is low because the app is pre-launch, and an admission
mismatch fails loudly on the first message instead of corrupting data.
Previews get the secret from a Convex default that someone sets by hand with
`pbpaste`, and existing previews must be updated one by one
(`docs/environment.md:205-219`), so drift is likely to happen again there. Do
not throw from `register()` in `instrumentation.ts`. On Vercel serverless that
crashes every cold start instead of failing the deploy. `ENCRYPTION_KEY`
rotation is already covered by the TODO.md item "BYOK lookup failure falls
through to platform funds".

### Sentry browser events have no release

Severity: Low.

**What is wrong.** The Sentry SDK fills in sensible Vercel defaults, and our
settings overwrite them with values that are empty or wrong. So browser errors
carry no release (the deploy version), and every event from a preview
deployment is tagged `production` in all three runtimes (browser, server,
edge). Sentry cannot tell which deploy introduced a UI bug. Browser release
health (crash-free stats per release) is also off, because the SDK drops
session reports that have no release. The runbook's plan to compare `chat.ui.*`
metrics by release (`docs/performance/measurement-runbook.md:135-138`) cannot
work until this is fixed.

**Our code.**
- `instrumentation-client.ts:13-16`: sets `environment` to
  `SENTRY_ENVIRONMENT ?? NODE_ENV` and `release` to `SENTRY_RELEASE`. Neither
  is a `NEXT_PUBLIC_` variable, so in the browser `release` is undefined and
  `environment` is `production` on every Vercel deploy, previews included.
- `sentry.server.config.ts:16-19` and `sentry.edge.config.ts:12-15`: the same
  two lines. Server and edge still get a release, because the SDK falls back
  to `VERCEL_GIT_COMMIT_SHA` at runtime. But `SENTRY_ENVIRONMENT` is not set
  in any Vercel environment, so previews fall back to `NODE_ENV`, which is
  `production`.
- `node_modules/@sentry/nextjs/build/cjs/client/index.js:54-59`: the SDK
  builds its defaults from `NEXT_PUBLIC_VERCEL_ENV` and the build-injected
  `_sentryRelease`, then spreads our options over them. A key that holds
  `undefined` still overwrites the default.
- `scripts/sentry-check.sh:107-112`: the triage query is `is:unresolved` with
  no environment filter, so it mixes dev, preview and production issues.

**How references handle it.**
- trigger.dev, `apps/webapp/sentry.server.ts:26-42`: `release` comes from
  `BUILD_GIT_SHA` (line 28). `environment` comes from `APP_ENV` (line 42), a
  variable that names the deploy environment, not `NODE_ENV`. This file is
  server only.

**Fix.** Delete the `release` line in `instrumentation-client.ts`,
`sentry.server.config.ts` and `sentry.edge.config.ts`, so the SDK keeps the
build-injected commit SHA. For `environment`, pick one option. Either delete
the line too, so the SDK uses `vercel-preview` or `vercel-production`. Or set
it to `process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV` on the
client and `process.env.VERCEL_ENV ?? process.env.NODE_ENV` on server and
edge. Then add an environment filter to the query in
`scripts/sentry-check.sh:108`, so triage reads production only.

**Notes.** If you delete the `environment` line, production events are renamed
from `production` to `vercel-production`, so update any Sentry alert filters.
Stack traces still resolve today through debug IDs (build IDs that map bundled
code back to source), which is why this is only low severity.

### Sentry prompt scrubber never matches

Severity: Low.

**What is wrong.** Our Sentry scrubber is meant to remove prompts, AI replies
and tool payloads from spans (timing records for each step of a request)
before they leave the server. It matches field paths starting from the top of
the object. Sentry keeps span attributes one level down, as flat dotted keys
under `data`, so the path starts with `data.` and never matches. Running
`sentryBeforeSendSpan` on a span with the real shape returns the prompt and
the system prompt unchanged. Nothing leaks today, but only because Sentry's
own privacy default keeps AI inputs and outputs off. If anyone turns on prompt
recording to debug something, nothing stops user prompts from reaching Sentry.

**Our code.**
- `lib/observability/sentry-scrubbing.ts:85-98`: the list of field names to
  remove. It lacks the names Sentry 10.63 uses for AI SDK 7:
  `gen_ai.input.messages`, `gen_ai.output.messages`,
  `gen_ai.system_instructions`, `gen_ai.tool.description` and
  `gen_ai.embeddings.input`. The `ai.*` entries are dead, because AI SDK 7 no
  longer emits them.
- `lib/observability/sentry-scrubbing.ts:109-125`: joins the full path from
  the top of the object and compares it with the list. A key under `data`
  never matches, even one that is already on the list.
- `lib/observability/__tests__/sentry-scrubbing.test.ts:90-109`: the test
  builds an invented nested shape, labels it as the shape
  `sentryBeforeSendSpan` sees, and then calls `sentryBeforeSend` instead.
- `sentry.server.config.ts:20-28`: `sendDefaultPii: false` is the only real
  guard. `vercelAIIntegration({ force: true })` does not state a recording
  choice, and the chat call's telemetry block
  (`app/api/chat/chat-turn-runtime.ts:1513-1516`) leaves `recordInputs` unset.

**How references handle it.**
- No reference covers this directly; it is a plain defect. The Sentry SDK
  source shows the real shape and the right switch.
  `convertTransactionEventToSpanJson`
  (`node_modules/@sentry/core/build/cjs/utils/transactionEvent.js:5-23`) puts
  attributes under `data`. The Vercel AI subscriber
  (`node_modules/@sentry/server-utils/build/cjs/vercel-ai/vercel-ai-dc-subscriber.js:305-321`)
  lets the integration's own `recordInputs`/`recordOutputs` options override
  every other setting.

**Fix.**
1. In `lib/observability/sentry-scrubbing.ts`, also check each key by itself
   (lowercased) against the list, whatever its parent path is. That way
   `data["gen_ai.input.messages"]` and `contexts.trace.data[...]` both match.
   Add the five missing names above. The dead `ai.*` entries can go.
2. Change the existing test to call `sentryBeforeSendSpan` on a span with the
   real shape (`{ span_id, trace_id, data: { "gen_ai.input.messages": "..." } }`).
   Do not add new tests.
3. Record the privacy choice in the existing integration calls:
   `vercelAIIntegration({ force: true, recordInputs: false, recordOutputs: false })`
   in `sentry.server.config.ts:28`, and the same two options in
   `sentry.edge.config.ts:22`.

**Notes.** Do not express this choice with a partial `dataCollection` object.
In Sentry 10.63, setting any `dataCollection` value switches everything else
to "collect"
(`node_modules/@sentry/core/build/cjs/utils/data-collection/resolveDataCollectionOptions.js:5-16`).
That would start sending cookies, headers, request bodies and user info.
`SENTRY_INCLUDE_LOCAL_VARIABLES` is a separate path: it attaches local
variables to error events, not span data, and this fix does not cover it.

### CI actions are not pinned to commits

Severity: Low.

**What is wrong.** Our GitHub workflows load actions (shared CI steps) by
movable tags such as `@v2`. Whoever controls a tag can point it at different
code without us noticing. The job that deploys production Convex runs
`oven-sh/setup-bun@v2`, and so does the perf job that writes our whole server
env file to disk. That action installs the binary every later step runs. A
hijacked tag, like the tj-actions attack in 2025, could steal the production
deploy key or our provider API keys.

**Our code.**
- `.github/workflows/ci-cd.yml:116-124`: the deploy job loads
  `actions/checkout@v7` and `oven-sh/setup-bun@v2` by tag. The validate and
  build jobs do the same at lines 36/41 and 85/90.
- `.github/workflows/ci-cd.yml:150-158`: the same job then passes
  `CONVEX_DEPLOY_KEY` and `CONVEX_SCHEMA_PREFLIGHT_DEPLOY_KEY` to its steps.
- `.github/workflows/perf-benchmark.yml:161-169`: writes the whole
  `PERF_ENV_FILE` secret to `.env.local`. This runs after checkout (130) and
  setup-bun (145), both loaded by tag, and four `actions/upload-artifact@v4`
  steps follow (226-257).
- `.github/dependabot.yml:11-16`: a monthly `github-actions` updater already
  exists, so only the pinning is missing.

**How references handle it.**
- trigger.dev, `.github/workflows/publish-webapp.yml:51-146`: every outside
  action is pinned to a full commit SHA (an exact, unchangeable commit ID),
  with a version comment (lines 51, 54, 114, 122, 146).
- trigger.dev, `.github/workflows/workflow-checks.yml:39-58`: a zizmor job (a
  workflow security linter) scans the workflows, so a new tag-based `uses:`
  cannot slip back in.
- HuggingChat, `.github/workflows/deploy-prod.yml:15-40`: the production
  deploy workflow pins every action to a SHA the same way.

**Fix.** In `ci-cd.yml` and `perf-benchmark.yml`, replace each
`uses: owner/action@vN` with `uses: owner/action@<40-char SHA> # vX.Y.Z`.
Start with `oven-sh/setup-bun`, then `actions/checkout` and
`actions/upload-artifact`. The existing Dependabot entry will keep the SHAs
and version comments current. Optionally, turn on the GitHub setting that
requires SHA-pinned actions, or add a zizmor or pinact check like trigger.dev.

**Notes.** This is extra hardening, not a pattern every project follows:
LibreChat, LobeHub, VercelChatbot and OpenWebUI all use floating tags. Our
current guards (`contents: read`, `persist-credentials: false`, secrets scoped
to single steps, perf skipped on fork PRs) do not stop a tampered action. The
runner process holds every secret the job references.

### Crons poll every 15 seconds

Severity: Low.

**What is wrong.** Six Convex crons check for stuck runs, unfinished Stop
settlements, expired approvals and other leftovers on fixed timers, even when
nobody is using the app. Two run every 15 seconds and two every minute. That
is about 14,700 billed function calls a day (about 440,000 a month) per
deployment, and almost all of them find nothing. Every deadline the fast crons
look for is already known when it is written, so one timer per deadline could
do the same job without polling.

**Our code.**
- `convex/crons.ts:18-71`: the lease reaper (18-23) and the settlement
  reconciler (55-60) run every 15 s, two approval passes (25-42) run every
  minute, and two safety nets (44-48, 66-71) run every 10 minutes.
- `convex/domain/generation_run_liveness.ts:28-38`: heartbeat every 10 s,
  lease of 45 s, reaper every 15 s, and a 24-hour approval expiry that a
  one-minute cron enforces.
- `convex/chatRuntime.ts:2104-2107`: the lease deadline is written at prepare,
  and each heartbeat moves it (2683-2690). The settlement deadline is written
  at Stop (`convex/usageAllowance.ts:838-851`), and the approval expiry is
  written when the approval is created (`convex/chatRuntime.ts:2935-2936`).
- `convex/chatRuntime.ts:3255-3264`: the approval decision already enforces
  expiry inside its own transaction, so correctness does not depend on the
  approval-expiry cron.
- `convex/chats.ts:654-657` with `convex/deletionCleanup.ts:17-59`: our own
  better pattern. Deletion schedules its work right away with `ctx.scheduler`,
  and a 10-minute cron is only a safety net (ADR-0014).

**How references handle it.**
- trigger.dev,
  `internal-packages/run-engine/src/engine/systems/executionSnapshotSystem.ts:530-540`:
  when a run starts executing, it queues one job with the stable id
  `heartbeatSnapshot.<runId>`, due one heartbeat interval later. Each
  heartbeat pushes that same job later (607-613). When the job fires, it exits
  if the run has moved on (`engine/index.ts:2774-2800`). Nothing polls when
  nothing runs.
- trigger.dev,
  `internal-packages/run-engine/src/engine/systems/ttlSystem.ts:183-194`: TTL
  expiry (a run's maximum wait) is one `expireRun:<runId>` job at the
  deadline. Waits for a human answer work the same way with
  `finishWaitpoint.<id>` (`waitpointSystem.ts:313-324`).
- HuggingChat, `src/lib/server/generation/reaper.ts:9-28`: the chat apps that
  do poll check less often. HuggingChat sweeps every 60 s with a 90 s stale
  threshold for the same 10 s heartbeat, and LibreChat cleans up every 60 s
  (`packages/api/src/stream/GenerationJobManager.ts:879-881`). Both run in a
  long-lived server, where a sweep costs nothing.

**Fix.**
1. At prepare, schedule one check at `leaseExpiresAt` with
   `ctx.scheduler.runAt`. When it fires: exit if the run already ended,
   reschedule if a heartbeat moved the lease, otherwise apply the existing
   lease-expired verdict. Optionally store the scheduled id and cancel it in
   the terminal write.
2. In `deferUsageSettlementForTerminalRun` (`convex/usageAllowance.ts`),
   schedule one check at `settlementDeadlineAt` that settles that reservation.
   Then remove the extra 15 s of slack from `TERMINAL_EVIDENCE_WINDOW_MS`
   (74-75).
3. When an approval is created, schedule one check at its `expiresAt`.
4. Merge the existing bounded passes in `convex/crons.ts` into one 10-minute
   safety-net cron, as deletion does, to catch rows from older deploys.
5. Record the change as an ADR-0021 amendment (ADR-0021 chose a
   "second-level cadence") and update the ADR-0011 follow-up note.

**Notes.** The dollar cost is small. Convex Pro includes 25M calls a month,
and Starter overage is about $2.20 per million, so this is a few dollars at
most. It matters mostly before launch and on each preview deployment. Previews
very likely run crons, but Convex docs do not confirm it. Real traffic will
soon outweigh this cost. Do not just slow the lease cron to 60 s as a
shortcut. A crashed run stays in the "possibly-stale" state, with message
actions hidden, until the reaper ends it
(`lib/chat-runs/run-presentation.ts:316-328`), so that window would grow from
about 60 s to about 105 s. Moving approval expiry to hourly is a safe one-line
first step. The per-deadline check has its own small cost: during a long run,
heartbeats keep moving the deadline, so the check reschedules itself about
every 45 s.

### Approval sweep rescans every paused run

Severity: Low.

**What is wrong.** When the AI needs permission to use a tool, the run pauses.
A cron looks every minute for pauses where the user already answered but the
chat never continued, for example because the tab crashed. To find those few,
it re-reads up to 200 paused runs every minute. That includes runs where
nobody has answered yet, which can wait up to 24 hours. It also rewrites a
cursor row (a saved scan position) on every tick, even when there is nothing
to scan. Our other two reapers avoid this by reading only rows whose deadline
has passed.

**Our code.**
- `convex/chatRuntime.ts:3761-3768`: every minute (`convex/crons.ts:37-42`),
  pages through `awaiting_approval` runs by the plain `by_status` index, up to
  `RESOLVED_PAUSE_SCAN_LIMIT` (200, line 3748).
- `convex/chatRuntime.ts:3777-3787`: for each candidate, re-reads the run, the
  chat and its project (through `isChatActive`), and every approval row. Only
  then can it tell whether the pause needs cleanup.
- `convex/chatRuntime.ts:3837-3859`: logic that holds the cursor in place,
  plus a checkpoint patch on every tick, even for an empty page. The
  `reaperCheckpoints` table (`convex/schema.ts:326-333`) exists only for this
  pass.
- `convex/chatRuntime.ts:3266-3271`: `resolveToolCallDecision` writes
  `resolvedAt`, so this is where the due time becomes known: the last
  `resolvedAt` plus the 5-minute `RESOLVED_APPROVAL_CONTINUATION_GRACE_MS`
  (`convex/domain/generation_run_liveness.ts:49`). It is the only path that
  can leave a pause stuck this way. Deny-pending, Stop and expiry all end the
  run directly.
- `convex/chatRuntime.ts:3612-3619` and `3681-3685`: the lease and
  approval-expiry reapers use an index to read only rows that are already
  due. This pass's own comment (3737-3747) admits it is the exception.

**How references handle it.**
- trigger.dev,
  `internal-packages/run-engine/src/engine/systems/waitpointSystem.ts:313-324`:
  when a wait for a human answer is created, it schedules one timeout job at
  its deadline. A wait nobody answers costs nothing while it waits.
- trigger.dev, `internal-packages/run-engine/src/run-queue/index.ts:1063-1066`:
  its periodic TTL consumer only pops items that are already due from a
  time-sorted set (`ZRANGEBYSCORE -inf..now`). The rule is "never re-examine
  items that are not due yet", not "never poll".

**Fix.** When a decision in `resolveToolCallDecision` leaves no pending
approvals on the run, write a due time on the run: `resolvedAt` plus the grace
window. Add an index on `generationRuns` over status and that due time. Then
the existing minute cron can read only due `awaiting_approval` rows, like the
lease and expiry reapers do. Keep the existing eligibility re-check inside the
transaction for the rows it returns. Then delete `RESOLVED_PAUSE_SCAN_LIMIT`
and its comment (3737-3749), the cursor-hold logic (3837-3870) and the
`reaperCheckpoints` table, and update the cursor tests in
`convex/chatRuntime.test.ts`. A one-shot `ctx.scheduler.runAt` at the due time
works equally well, and it matches the per-deadline fix in "Crons poll every
15 seconds".

**Notes.** The cost is tiny at our scale. The real payoff is removing a subtle
cursor mechanism and a table. Pre-launch data is disposable, so old stuck
pauses need no backfill. Production may already hold a checkpoint row, so run
the existing schema preflight before dropping the table. The smallest interim
step is to skip the checkpoint patch when the cursor did not change.

## Rendering and composer

### LaTeX with backslash delimiters renders broken

Severity: Medium.

**What is wrong.** Our Markdown pipeline only turns `$$...$$` into math.
Models often write math as `\( ... \)` (inline) or `\[ ... \]` (display).
Markdown reads a backslash before a bracket as "print this bracket as plain
text", so the backslashes vanish and KaTeX (the math renderer) never runs. The
user sees `( \pi r^2 )` instead of a formula.

**Our code.**
- `lib/markdown/incremental-block-projection.ts:66-84`: `REMARK_MATH_OPTIONS`
  runs plain `remark-math` with `singleDollarTextMath: false`, and the block
  splitter parses with it (:81-84). `MARKDOWN_PARSER_VERSION` is at :79.
- `components/ui/markdown.tsx:338-349`: the renderer uses the same options plus
  `rehypeKatex`. Nothing rewrites the text before parsing.
- `lib/markdown/growing-block-tail.ts:386-395`: the streaming tail mend mirrors
  the same math grammar (`inlineKatex: false`), so it must change with any fix.
- `components/ui/markdown.test.tsx:18-89`: the delimiter tests cover `$$` and
  currency, but not backslash delimiters.

**How references handle it.**
- LibreChat,
  `client/src/components/Chat/Messages/Content/markdownConfig.ts:34-47`: `$$`,
  `\(...\)` and `\[...\]` always parse. It aliases `micromark-extension-math`
  to `micromark-extension-llm-math` in `client/vite.config.ts:434-438` and
  `client/jest.config.cjs:30-31`, on the same `remark-math` 6 we use
  (`client/package.json:93`, `:124`). Single-dollar math is a separate
  construct with Pandoc's currency-safe rules (`client/src/utils/latex.ts:18-36`),
  behind a user setting.
- HuggingChat, `src/lib/utils/marked.ts:144-236`: tokenizer extensions read
  `\[...\]` as display math and `\(...\)` as inline math. `:134-137` skips
  KaTeX for input over 10,000 characters, a cheap guard worth copying.
- Open WebUI, `src/lib/utils/marked/katex-extension.ts:1-9`: the delimiter list
  includes both `\(` and `\[`.

**Fix.** Teach the parser both delimiters. Do not rewrite the text with a
regex, because that breaks code spans and code blocks.
1. Alias `micromark-extension-math` to `micromark-extension-llm-math`, like
   LibreChat: `turbopack.resolveAlias` in `next.config.ts` plus the same alias
   in `vitest.config.ts`. A small custom micromark construct is the fallback.
2. The change must reach the splitter and the renderer together. Both load
   `remark-math`, so the alias covers both; a custom construct must be added
   next to `REMARK_MATH_OPTIONS` in both. Bump `MARKDOWN_PARSER_VERSION`.
3. Make sure the tail mend in `growing-block-tail.ts` handles an unclosed `\[`
   while streaming.
4. Add one or two backslash cases to the delimiter tests in
   `components/ui/markdown.test.tsx`.

**Notes.** Keep single-dollar `$x$` off. It is a deliberate choice so prices
like `$300` stay text (the currency tests in `components/ui/markdown.test.tsx`
and the comment at `lib/markdown/growing-block-tail.ts:392-393`), and it is
unrelated to this bug. That our default model `gpt-5-mini`
(`lib/config.ts:15-16`) often writes backslash delimiters is inferred from how
three references handle it, not measured in our own captures.

### Footnotes and reference links lose their targets

Severity: Medium.

**What is wrong.** We render each top-level block of an answer as its own
Markdown tree. Footnotes and reference-style links have two parts: a marker in
the text and a definition elsewhere. Once the blocks are split, the marker
cannot find its definition, so the user sees literal `[^1]` or `[docs][ref]`
and the footnote text and link URLs vanish from the page. This happens every
time, on chat, the share page and the Activity panel, including after a
reload.

**Our code.**
- `lib/markdown/incremental-block-projection.ts:186-220`: `splitWithProcessor`
  emits one block per top-level node, so each definition becomes its own
  block. The comment at :43-46 says blocks render "in isolation".
- `components/ui/markdown.tsx:498-546`: `blocks.map` gives every block its own
  `MemoizedMarkdownBlock`, which is a separate `ReactMarkdown` (:323-367).
- `lib/markdown/remark-parsed-block.ts:9-24`: `hasDocumentContext` already
  detects definitions and footnotes, but only uses that to turn off parse
  reuse.
- `components/ui/markdown.equivalence.test.tsx`: compares `<Markdown>` against
  `<Markdown>`, so the split output is its own oracle and cannot catch this,
  even with the footnote fixtures in
  `lib/markdown/markdown-equivalence-corpus.ts:237-242` and `:281-289`.

**How references handle it.**
- LibreChat,
  `client/src/components/Chat/Messages/Content/splitMarkdown.ts:129-152`:
  `splitBlocks` returns the whole message as one tree when any `definition` or
  `footnoteDefinition` exists, even nested in a list or quote
  (`containsDefinition` at :53-58).
- HuggingChat, `src/lib/utils/parseBlocks.ts:98-103`: returns the whole
  document as one block when footnotes are present (adapted from Vercel's
  streamdown).

**Fix.**
1. In `MarkdownComponent` (`components/ui/markdown.tsx`), render the whole
   message as one `MemoizedMarkdownBlock` when the projection finds any
   `definition` or `footnoteDefinition`, including nested ones. The walk in
   `hasDocumentContext` (`lib/markdown/remark-parsed-block.ts:9-19`) is a
   starting point, but it also matches raw HTML and bare references, so narrow
   it to the two definition types, or have the projection expose a flag.
2. Give each message its own footnote id prefix (`remarkRehypeOptions` with
   `clobberPrefix`), so two answers on one page that both use `[^1]` do not
   share DOM ids.
3. In `components/ui/markdown.equivalence.test.tsx`, compare one footnote
   fixture against a single whole-document `ReactMarkdown` render.

**Notes.** Only models that write footnotes or reference-style links trigger
this. The stored text is intact, so no data is lost. The fallback gives up
per-block memoization only for those messages. ADR-0038 mentions reference
scope only as a reason to reject block grouping for speed; it is not a decision
to accept lost footnotes.

### Return always sends on phones

Severity: Medium.

**What is wrong.** On phones, the Return key in the composer always sends the
message. Phone keyboards have no Shift+Enter, so users cannot type a new line
or continue a list (pasting one is the only way). A user typing a
two-paragraph prompt or a list sends it half-finished, which wastes a turn and
can cost money. The editor also grabs focus on load on every device.

**Our code.**
- `components/ui/prompt-input.tsx:538-542`: `submitOnEnter` and `autoFocus`
  both default to `true`, with no device check.
- `components/ui/prompt-input.tsx:880-904`: `handleKeyDown` submits on any
  Enter without Shift; the only typing case it skips is IME composition. On
  iOS and Android, ProseMirror (our editor library) fires a synthetic Enter
  with no `shiftKey`, so it always submits. `:943` focuses the editor on
  mount.
- `app/components/chat-input/composer.tsx:666-673`: the main composer
  overrides neither prop. Only inline message edit turns Enter-to-send off
  (`app/components/chat/message-user.tsx:417`).
- `components/ui/prompt-input-editor.ts:140-141`: the keymap already maps
  `Enter` to `insertParagraph`, which continues lists. Phones never reach it.

**How references handle it.**
- ChatGPT (captured web bundle),
  `reference-ui/ChatGPT/bundles/2026-08-26-thread-scroll/conv.beauty.js:129482-129517`:
  plain Enter inserts a newline when the pointer is coarse (touch) and the OS
  is not Windows. Sending is button-only unless an opt-in setting allows Enter.
  `target.beauty.js:34699` also turns off autofocus on mobile OSes and Safari.
- HuggingChat, `src/lib/components/chat/ChatInput.svelte:293-303`: submits on
  Enter only when `!isVirtualKeyboard()`, and `:150-153` skips autofocus on
  virtual keyboards (`src/lib/utils/isVirtualKeyboard.ts`).
- Open WebUI, `src/lib/components/chat/MessageInput.svelte:2138-2166`: skips
  Enter-to-send when the screen is narrow and the device has touch, so Return
  makes a new line on phones.

**Fix.**
1. In the `PromptInputTextarea` primitive (`components/ui/prompt-input.tsx`),
   treat `submitOnEnter` as `false` on touch-first devices. Use ChatGPT's rule:
   `(pointer: coarse)` and not Windows, which matches the `touch` variant in
   `app/globals.css:17`. Check it at keypress time inside `handleKeyDown`, not
   at render, so server rendering is unaffected.
2. Skip the mount-time `autoFocus` on the same devices.
3. The existing `Enter: insertParagraph` keymap then gives newlines and list
   continuation with no new code, on every composer surface.
4. Amend ADR-0023 (lines 119-120, "Enter retains the existing send behavior")
   to say that on touch devices Enter inserts a paragraph and sending is
   button-only.

**Notes.** Do not add `enterkeyhint="send"`. Once Return makes a newline, the
default Return key label is correct, and ChatGPT leaves it unset. iOS Safari
usually ignores a focus call that did not come from a tap, so the autofocus
part matters less than the Enter part.

### Perplexity citation markers are not linked

Severity: Low.

**What is wrong.** Perplexity Sonar models write numbered markers like `[1]`
and `[3]` that point to the sites they used. We store that source list, but the
Markdown renderer never links the numbers to it. The markers show as dead
bracket text, and the links appear only in the separate Sources badge and
panel, so the reader cannot check a claim where it is made.

**Our code.**
- `node_modules/@ai-sdk/perplexity/dist/index.js:426-438` and `:533-540`: the
  provider adapter (v4.0.30) keeps the text unchanged, markers included, and
  sends the citations as ordered `source` parts.
- `app/api/chat/chat-turn-runtime.ts:2146` and
  `app/api/chat/durable-turn-runtime.ts:756`: `sendSources: true`, so those
  parts reach the client. `lib/models/data/perplexity.ts:5-10` and `:38-43`
  make `sonar` and `sonar-reasoning-pro` visible in the catalog.
- `components/ui/markdown.tsx:276-289` and `:338-347`: the `a` handler only
  renders real links, and no remark plugin maps `[n]` to a source.
- `app/components/chat/message-assistant.tsx:404-411`: in the message, sources
  surface only through `SourcesBadge`.

**How references handle it.**
- HuggingChat, `src/lib/utils/marked.ts:238-256`: `addInlineCitations` turns
  `[n]` into a superscript link to source n. It runs as a postprocess hook at
  :368.
- LobeHub, `src/features/Conversation/Messages/Assistant/useMarkdown.tsx:13`
  and `src/features/Conversation/Messages/useChatMarkdown.tsx:27-74`: passes
  structured `citations` into its Markdown renderer. The marker-to-link step
  itself lives in the external `@lobehub/ui` package.

**Fix.**
1. Pass the turn's provider source URLs into `Markdown`
   (`components/ui/markdown.tsx`) as a new prop.
2. Add a small remark plugin next to `lib/markdown/remark-link-presentation.ts`.
   In text nodes only (so code is skipped), replace `[n]` with a link to source
   n using the existing pill presentation. Do it only when the turn has
   provider sources and n is in range; otherwise leave the text alone.
3. Build the list from `source-url` parts in their original order, not from
   `view.sources`. That list comes from `getSources`
   (`lib/chat-messages/sources.ts:142-144`), which mixes in tool sources and
   merges duplicate URLs through `dedupeSources` (:94-118), so the numbers
   would shift.
4. Keep the stored text unchanged, so copy, share and provider history are not
   affected.

**Notes.** Only the two visible Perplexity routes are affected. OpenAI and the
other search paths already write real Markdown links. HuggingChat rewrites the
finished HTML with a regex, which also touches code; working on text nodes
avoids that.

### Dead search-image grid

Severity: Low.

**What is wrong.** `SearchImages` renders image results in the message body
with `next/image` but gives no size and no `unoptimized` flag. In development,
Next throws "missing required width", and with no error boundary that takes
down the whole page. In production the image optimizer refuses every host
outside `remotePatterns`, so every tile fails and hides itself. No built-in
tool produces this data today, so the whole image-results path, including the
Activity panel's copy, is dead code with a latent dev crash.

**Our code.**
- `app/components/chat/search-images.tsx:29-35`: `next/image` with a remote
  `src` and no `width`, `height`, `fill` or `unoptimized`.
- `next.config.ts:114-136`: `remotePatterns` only allows `*.convex.cloud`,
  GitHub avatars and Google favicons.
- `lib/chat-messages/turn-evidence.ts:386-396`: the only reader expects
  `content[0].type === "images"`, which is not an MCP content type. Nothing in
  `lib/`, `convex/` or `app/` emits it; it came from the Zola upstream
  (commit `f04188f4`).
- `app/components/chat/activity/activity-panel.tsx:386-424`: a second copy of
  the grid with `width`, `height` and `unoptimized`. It never renders either.

**How references handle it.**
- No reference covers this directly; it is a plain defect.

**Fix.** Delete the dead pipeline end to end:
1. `app/components/chat/search-images.tsx` and its use in
   `app/components/chat/message-assistant.tsx` (lines 37, 78, 122, 226-228).
2. The Images section in
   `app/components/chat/activity/activity-panel.tsx:386-424`, `imageResults`
   in `lib/chat-messages/assistant-activity.ts` (:7, :124, :492), and the
   `imageResults: []` lines in tests and in `app/test/thinking-states/`.
3. `searchImageResults` in `lib/chat-messages/assistant-turn.ts` (:45-47,
   :154, :269, :289, :303), plus `collectSearchImageResults`, its call at :485
   and the `SearchImageResult` type in `lib/chat-messages/turn-evidence.ts`.

**Notes.** If image results come back, do not copy the Activity panel's
pattern (an unoptimized image loaded straight from any https host in tool
output). That is the auto-load leak the TODO.md item "Block remote markdown
images" wants to close. Build one shared grid under that allowlist instead
(see TODO.md "Assistant Response UI Widgets").

### Dead analytics script blocked by our CSP

Severity: Low.

**What is wrong.** The root layout loads an analytics script from
`assets.onedollarstats.com` when `NAW_OFFICIAL=true`. Our Content Security
Policy (CSP, the browser's list of allowed script and network hosts) does not
allow that host. If the flag is on, the browser blocks the script and nothing
is recorded. If it is off, the code does nothing and confuses readers.

**Our code.**
- `app/layout.tsx:54-55`: reads `NAW_OFFICIAL`, plus `isDev`, which only the
  script uses.
- `app/layout.tsx:65-71`: renders the `next/script` tag (import at :22).
- `next.config.ts:51-59` and `:66`: `script-src` allows only self, inline
  scripts, WASM and PostHog (plus eval in dev); `connect-src` allows only
  self, Convex and PostHog.
- `next.config.ts:105-107`: the policy applies to every route.

**How references handle it.**
- No reference covers this directly; it is a plain defect.

**Fix.** Delete the script block in `app/layout.tsx` (lines 54-55 and 65-71),
the unused `next/script` import at :22, and the `# NAW_OFFICIAL=true` line at
`.env.example:110`. If onedollarstats analytics is still wanted instead, add
its script host to `script-src` and its collector host to `connect-src` in
`next.config.ts`, explain the variable in `.env.example`, and check the
browser console for CSP errors.

**Notes.** The script came from the Zola fork (commit `f04188f4`, 2025-08-05).
The CSP arrived in July 2026 with ADR-0010, which lists only Convex and
PostHog, so this is an oversight, not a choice. The CSP is doing its job here.

## Product basics

### Chats cannot move between projects

Severity: Medium.

**What is wrong.** A chat's project is set once, when the chat is created, and
nothing can change it afterwards. The chat menu has no "Move to project" or
"Remove from project", and there is no drag and drop. So a chat started
outside a project can never be filed into one, a project chat can never leave,
and deleting a project deletes every chat in it with no way to rescue the ones
worth keeping.

**Our code.**
- `convex/chats.ts:336-360`: `insertChatForUser` is the only code that writes
  `projectId`, and `convex/domain/chat_project_link.ts:9-10` calls it the
  "only write site". No mutation changes it later.
- `convex/domain/project_activity.ts:11-16,49-50`: `ChatActivityPatch` leaves
  out `projectId` on purpose, so the normal chat patch helper cannot move a
  chat. Its comment says a move must update both the old and new project.
- `app/components/layout/chat-actions-menu.tsx:116-150`: the shared chat menu
  offers only Share, Rename, Pin and Delete. `RowActionItem`
  (`app/components/layout/row-actions-menu.tsx:20-33`) has no submenu option.
- `app/components/projects/dialog-delete-project.tsx:61-65`: deleting a
  project "will also delete all conversations in this project".

**How references handle it.**
- LibreChat, `client/src/components/Conversations/ConvoOptions/ConvoOptions.tsx:342-362`:
  the sidebar chat menu has "Change project" (opens a project picker) and,
  only when the chat is in a project, "Remove from project". The project
  page's chat list has the same two items
  (`client/src/components/Projects/ProjectChatOptions.tsx:39-81`), and
  `client/src/components/Conversations/dnd.ts:102-149` also files a chat when
  it is dragged onto a project.
- LibreChat, `packages/data-schemas/src/methods/chatProject.ts:464-519`: one
  server method checks that the user owns both the chat and the target
  project, sets or clears the link, then recounts the stats of both the old
  and the new project.
- Open WebUI, `src/lib/components/layout/Sidebar/ChatMenu.svelte:424-451`: a
  "Move" submenu in the chat menu lists every folder. Picking one calls
  `moveChatHandler` (`ChatItem.svelte:298-310`), which saves the new folder.

**Fix.**
1. Add `chats.moveToProject({ chatId, projectId: Id<"projects"> | null })` to
   `convex/chats.ts`, built on `ownedChatMutation`. That builder already
   rejects a chat whose project is being deleted (`convex/lib/auth.ts:197`),
   so a chat cannot be pulled out of a project mid-deletion.
2. If a target is given, check it with `requireOwnedProject`
   (`convex/lib/auth.ts:286-303`), which checks the owner and that the project
   is not being deleted. If it is the chat's current project, do nothing.
3. Load the old project with `requireLinkedProject`, as `removeChatForOwner`
   does, so the owner check on the link still runs. Patch `projectId`
   directly, then bump `updatedAt` on the new and the old project with
   `recordKnownProjectActivity`, as the comment in
   `convex/domain/project_activity.ts` asks. Update the "only write site"
   comment in `convex/domain/chat_project_link.ts` to name both write paths.
4. Add a submenu item type to `RowActionItem` in
   `app/components/layout/row-actions-menu.tsx`, using the `DropdownMenuSub`
   parts that `components/ui/dropdown-menu.tsx:140-188` already has (the user
   menu uses them at `app/components/layout/user-menu.tsx:79-125`). Add a
   `moveToProject` action next to `togglePinned` in
   `lib/chat-store/chats/provider.tsx`.
5. In `chat-actions-menu.tsx`, add "Move to project" (projects from
   `api.projects.getForCurrentUser`) and, when the chat has a project,
   "Remove from project". The sidebar, the chat header and the project chat
   list all use this menu, so all three get it at once.

**Notes.** Drag and drop can come later, with LibreChat's `dnd.ts` as the
model. The TODO item "Project-scoped agent context" should also decide whether
a moved chat uses its new project's context on later turns.

### Chats cannot be exported

Severity: Low.

**What is wrong.** There is no way to download a conversation. The chat menu
has no Export item, and the only way to get an answer out of the app is the
Copy button on each message, one message at a time. Share does not fill the
gap: it publishes a live public link, not a file the user keeps.

**Our code.**
- `app/components/layout/chat-actions-menu.tsx:116-150`: the chat menu builds
  only Share, Rename, Pin and Delete.
- `app/components/chat/message.tsx:73-95`: the per-message Copy button is the
  only way to take an answer out.
- `app/components/chat-input/file-items.tsx:300`: the only
  `createObjectURL` call in the app is this attachment preview, and nothing
  uses `saveAs`. Nothing builds or saves a chat file.
- `convex/messages.ts:274-278`: `getSelectedPath` already returns the branch
  the user sees (ADR-0001), and `lib/chat-messages/parts.ts:8` re-exports
  `extractTextFromMessageParts`, so the pieces for an export already exist.

**How references handle it.**
- LibreChat, `client/src/hooks/Conversations/useExportConversation.ts:137-190`:
  builds a Markdown file in the browser from the messages already loaded
  (lines 45-51), current branch only (`branches: false`), and downloads it.
  `client/src/components/Nav/ExportConversation/ExportModal.tsx:16-24` offers
  Markdown by default, plus text, JSON, CSV and PNG.
- Open WebUI, `src/lib/components/layout/Sidebar/ChatMenu.svelte:324-365`:
  every chat menu has a Download submenu with JSON, plain text and PDF. Lines
  66-89 fetch the chat on click, build the text from the branch on screen and
  save it as a file.
- LobeHub, `src/features/ShareModal/ShareText/index.tsx:98-107`: the share
  dialog has a Download button that saves the chat as `.md`.
  `src/features/ShareModal/ShareJSON/index.tsx:113-122` does the same for
  `.json`.

**Fix.** Add an "Export" item to `ChatActionsMenu`
(`app/components/layout/chat-actions-menu.tsx`). On click, it loads the chat's
selected path once with the Convex client (`api.messages.getSelectedPath`), so
it also works from the sidebar, where the chat is not open. A small builder in
`lib/chat-messages/` (next to `parts.ts`) turns that path into Markdown: the
title, then each message under a role heading, with attachments as links. The
browser then downloads the file. JSON (the same messages as they are) can be a
second item. An account-wide export can come later.

**Notes.** Export only the selected path, which matches what the user sees
(ADR-0001). Other branches stay out, as in LibreChat's Markdown export.

## Mobile and accessibility

### Two text fields zoom the page on iPhone

Severity: Low.

**What is wrong.** On iPhone, Safari zooms the whole page when a text field
with text smaller than 16px gets focus, and the page stays zoomed after typing.
Two fields that phone users reach are 14px: the Rename field in the sidebar's
chat and project menus, and the Projects search box. After renaming a chat or
searching projects, the user has to pinch out to get the layout back. Every
other text field shown on phones already uses 16px or more.

**Our code.**
- `components/ui/inline-rename-input.tsx:31-34`: the shared rename field
  inherits the host's font with `[font:inherit]`. Sidebar rows are `text-sm`
  (14px) (`app/components/layout/sidebar/sidebar-row.tsx:123`), and the row
  renders the field at `:148-152`.
- `app/globals.css:1574-1589`: on touch screens the row actions button is
  always visible, so phone users can open Rename from the chat and project
  menus in the sidebar (`app/components/layout/sidebar/sidebar-item.tsx:95-99`,
  `app/components/layout/sidebar/sidebar-project-item.tsx:57-64`).
- `app/projects/project-search.tsx:43-46`: the search field uses `text-sm/5`
  (14px). The comment at `:13-18` says it skips the `Input` primitive on
  purpose to match ChatGPT's captured size. It shows on phones
  (`app/projects/projects-view.tsx:335-340`).
- `app/layout.tsx:36-40`: the root viewport sets no `maximumScale`, so
  nothing global stops the zoom. `components/ui/input.tsx:11`,
  `components/ui/textarea.tsx:11` and `components/ui/command.tsx:73-77` all
  hold a 16px floor (`text-base`), so these two fields are the only misses on
  phones.

**How references handle it.**
- ChatGPT (captured web bundle),
  `reference-ui/ChatGPT/bundles/2026-08-26-thread-scroll/target.beauty.js:88053`:
  adds `maximum-scale=1` to the viewport tag only on iOS (the `isIos` flag at
  `:88004-88011`). iOS Safari 10 and later still allow pinch zoom with that
  setting but skip the zoom on focus. Android is left alone. We copied
  ChatGPT's 14px sizes without this rule.
- Open WebUI, `src/app.html:31-34`, HuggingChat, `src/app.html:5-8` (which
  also sets `user-scalable=no`), and Vercel Chatbot, `app/layout.tsx:15-17`:
  set `maximum-scale=1` on every platform. Do not copy that. It blocks pinch
  zoom on Android and fails the WCAG rule for resizing text
  (https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

**Fix.**
1. `components/ui/inline-rename-input.tsx:32`: add
   `pointer-coarse:text-[length:max(1rem,1em)]` to the base classes. `1em`
   here is the inherited size, so desktop keeps the row's 14px, the phone
   sidebar gets 16px, and the mobile project title rename keeps its 17px
   (`app/components/chat/project-detail-surface.tsx:117-123`). A flat
   `text-base` would shrink that title. The `pointer-coarse` variant already
   exists at `app/globals.css:18`.
2. `app/projects/project-search.tsx:44`: add `pointer-coarse:text-base` next
   to `text-sm/5`. Update the comment at `:13-18` to say touch devices get
   16px so iOS does not zoom on focus.
3. Optional: add a one-line comment on `text-base` in the `Input` and
   `Textarea` primitives saying the 16px floor prevents iOS focus zoom, so
   future call sites do not override it.

**Notes.** A global alternative keeps ChatGPT's 14px look on every field: add
`maximum-scale=1` to the viewport only on iOS, as ChatGPT does. The catch is
that some in-app iOS browsers (apps that embed Safari's engine, WKWebView) can
obey it and block pinch zoom. The per-field fix has no accessibility risk, so
it is the simpler choice. This is separate from "Return always sends on
phones", which covers Enter and autofocus in the composer.

### Phone history drawer buttons have no names

Severity: Low.

**What is wrong.** Below 768px, chat search opens a drawer instead of the
desktop modal. In that drawer, the row's Rename and Delete icon buttons, the
rename Save and Cancel buttons, and the delete confirm and cancel buttons have
no spoken name, so VoiceOver (the iPhone screen reader) reads each one as just
"button". That includes the destructive confirm, drawn as a checkmark, so a
screen reader user cannot tell Delete from Cancel. Delete mode also moves focus
to an invisible, unlabeled text box, which is announced as an empty text field.

**Our code.**
- `app/components/history/drawer-history.tsx:235-258`: the row's Edit and
  Delete buttons have no `aria-label`. Only Pin, at `:231`, has one.
- `app/components/history/drawer-history.tsx:118-147`: the rename input has no
  label, and its Save and Cancel buttons are icon-only (`RiCheckLine`,
  `RiCloseLine`) with no name.
- `app/components/history/drawer-history.tsx:162-194`: delete mode autofocuses
  an `sr-only` text input just to catch Enter and Escape, and the confirm and
  cancel buttons are icon-only with no name.
- `app/components/history/history-search-provider.tsx:35` and `:99-107`: phone
  widths get this drawer for chat search.

**How references handle it.**
- LibreChat, `client/src/components/Conversations/RenameForm.tsx:50-83`: the
  inline rename input and its Cancel and Save icon buttons each get an
  `aria-label`, and the icons are marked `aria-hidden`.
- LibreChat,
  `client/src/components/Conversations/ConvoOptions/DeleteButton.tsx:88-113`:
  delete confirms in a titled dialog with text buttons "Cancel" and "Delete",
  so no hidden field is needed.
- WAI-ARIA Authoring Practices: every icon-only control needs an accessible
  name (https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/).

**Fix.** In `app/components/history/drawer-history.tsx`:
1. Add `aria-label`s: row Edit "Rename", row Delete "Delete"; rename Save
   "Save title" and Cancel "Cancel"; delete confirm "Delete chat" and cancel
   "Keep chat"; the rename `Input` "Chat title".
2. Remove the `sr-only` input (`:162-175`). Put `autoFocus` on the "Keep chat"
   button and handle Escape in an `onKeyDown` on the delete form. The confirm
   button still submits the form, and Enter on the focused "Keep chat" button
   cancels, which is the safer default.
3. Leave the icons alone. The `Icon` primitive already hides them from screen
   readers (`components/ui/icon.tsx:60-61`, `:84` and `:94`).

**Notes.** Phone screen reader users do have a labeled path for rename and
delete. The mobile sidebar sheet
(`app/components/layout/sidebar/app-sidebar.tsx:282-304`) renders the same
rows as desktop, and each row's labeled `ChatActionsMenu` offers Rename and
Delete (`app/components/layout/sidebar/sidebar-item.tsx:95-99`). That is why
severity is low. The 32px buttons already pass the WCAG 2.2 minimum target
size (24px). The hidden autofocus field may also pop up the iPhone keyboard
when the trash icon is tapped, but that has not been tested on a device.
Optional follow-up: route delete through `DialogDeleteChat`
(`app/components/layout/sidebar/dialog-delete-chat.tsx`, used at
`app/components/layout/chat-actions-menu.tsx:163-170`) so phone and sidebar
share one confirm.

## Web security and platform limits

### Image optimizer accepts any Convex host

Severity: Low.

**What is wrong.** The image resizer behind `next/image` (it makes attachment
thumbnails) accepts any image on `*.convex.cloud` with any query string. That
covers every Convex customer's storage, not just ours, so anyone can make our
Vercel project resize thousands of images that are not ours. On the Hobby plan
that uses up the 5,000 monthly resizes, and then new attachment thumbnails
show alt text instead of the picture. On Pro it just costs money, with no
ceiling unless we set a spend limit.

**Our code.**
- `next.config.ts:114-135`: allows three hosts. `*.convex.cloud` takes any
  path and any query string. Nothing uses `avatars.githubusercontent.com`.
  `www.google.com/s2/favicons/**` is fetched on the server by
  `app/api/favicon/route.ts:15`, not through `next/image`.
- `app/components/chat/message-user.tsx:112-118`: a user's image attachment
  is the only live remote image that goes through the resizer. Composer
  previews and the Activity panel set `unoptimized`
  (`app/components/chat-input/file-items.tsx:127,433`,
  `app/components/chat/activity/activity-panel.tsx:398`), and the search-image
  grid is dead code (see "Dead search-image grid").
- `next.config.ts:12-26`: `convexConnectSources()` already reads our exact
  Convex host from `NEXT_PUBLIC_CONVEX_URL`, which
  `scripts/convex-deploy.mjs:8-15` passes to `next build`.

**How references handle it.**
- Next.js docs (nextjs.org/docs/app/api-reference/components/image,
  `remotePatterns`): make each pattern as specific as possible. Leaving out
  `pathname` or `search` lets others optimize URLs you did not intend, and
  `search: ""` blocks all query strings.
- Vercel docs (vercel.com/docs/image-optimization/limits-and-pricing): every
  cache miss is a billed transformation. Hobby includes 5,000 a month, and
  past that new images return a 402 error.
- VercelChatbot, `next.config.ts:33-43`: lists only the two image hosts it
  actually uses. It still allows the shared `*.public.blob.vercel-storage.com`
  wildcard, so it supports removing unused hosts, not narrowing the storage
  host.

**Fix.** In `next.config.ts`, build `images.remotePatterns` from the
`NEXT_PUBLIC_CONVEX_URL` host, reusing the parsing and wildcard fallback in
`convexConnectSources()`. Use one pattern with `protocol: "https"`, our exact
host, `pathname: "/api/storage/**"` and `search: ""`. The empty `search`
matters: without it, junk query strings (`?a=1`, `?a=2`) on one of our own
storage URLs, such as an image in a shared chat, still count as new images.
Delete the GitHub avatars and Google favicon entries.

**Notes.** First open one real attachment URL and confirm it looks like
`https://<deployment>.convex.cloud/api/storage/<id>` with no query string. If
it does, the "sibling subdomains" comment at `next.config.ts:20` is wrong and
should be fixed too. Separately, `bun.lock:1660` pins `next@16.3.1`, which is
inside the range of advisory GHSA-2xp9-vwfh-vxw4 (a bug in the AVIF decoder
that `sharp` uses, reached through allowed remote images, fixed in 16.3.3). On
Vercel the resizer is Vercel's own service, so this mostly matters when
self-hosting, but the bump is one line.

### Cross-Origin-Opener-Policy header is missing

Severity: Low.

**What is wrong.** Our security headers leave out
`Cross-Origin-Opener-Policy` (COOP, a header that cuts the link between our
tab and a window from another site). Without it, a site that opens our app
with `window.open` keeps a handle to that window. It can use the handle for
small leak tricks against a signed-in chat tab, such as counting its frames or
noticing when it navigates. Next.js also adds `X-Powered-By: Next.js` to every
HTML page, which does no harm but serves no purpose.

**Our code.**
- `next.config.ts:77-95`: `securityHeaders` sets CSP, nosniff,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS, but no
  COOP. `vercel.json` and `proxy.ts` add no headers either.
- `next.config.ts:97-137`: `nextConfig` does not set `poweredByHeader: false`.
- `app/components/layout/share-publish-content.tsx:27,32` and
  `components/ui/prompt-input-formatting.ts:566`: our own popups already pass
  `noopener`, and sign-in uses our own forms, not a popup. A strict COOP
  breaks nothing today.

**How references handle it.**
- LibreChat, `packages/api/src/security/headers.ts:135-146`: defaults COOP to
  `same-origin`, and `Cross-Origin-Resource-Policy` to `same-origin` too. An
  env variable can change each one.
- VercelChatbot, `next.config.ts:50`: sets `poweredByHeader: false`.

**Fix.** In `next.config.ts`, add
`{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }` to
`securityHeaders`, and add `poweredByHeader: false` to `nextConfig`. Name both
in the header paragraph of
`docs/adr/0010-http-trust-boundary-hardening.md:84-89` so the ADR stays in
sync. Switch to `same-origin-allow-popups` only if a future popup sign-in,
such as MCP OAuth, needs `window.opener`.

**Notes.** The value is real but small. Framing is already blocked
(`frame-ancestors 'none'` and `X-Frame-Options: DENY`), and our outbound links
already use `noopener` (`lib/url-safety.ts:38,57`,
`components/ui/markdown-link.tsx:142`), so COOP mainly helps when another site
opens us. `X-Powered-By` carries no version, and the `/_next/` paths already
reveal the framework, so removing it is tidiness, not protection. Reference
support is mixed: LobeHub and HuggingChat set neither, and Open WebUI sets
COOP only when an env variable asks for it.

### CSP allows inline scripts and never reports

Severity: Low.

**What is wrong.** Our Content Security Policy (CSP, the browser's list of
allowed scripts and hosts) lets any inline script run, and it never reports
what it blocks. Our renderers are careful today, so no hole is known. But if a
future bug let attacker text from a search result, MCP tool or shared chat
slip into the page as a script, nothing would stop it and nobody would find
out. A nonce (a random code minted for each page load that marks our own
scripts as allowed) would block it, and reports would tell us.

**Our code.**
- `next.config.ts:51-59`: `script-src` includes `'unsafe-inline'`. The
  comment at lines 28-35 says nonce injection is "tracked as a follow-up", but
  no TODO.md item exists.
- `docs/adr/0010-http-trust-boundary-hardening.md:128-130`: names nonce-based
  `script-src` as "the next step".
- `app/layout.tsx:58-61`: the root layout reads the session on every request
  (`withAuth()` at `lib/user/api.ts:56`), so every page is already rendered
  per request. That is the main cost of nonces, and it is already paid.
- `proxy.ts:1-3`: exports `authkitProxy()` with no header logic. No
  `report-uri`, `report-to` or `Reporting-Endpoints` exists anywhere in the
  code.

**How references handle it.**
- LibreChat, `packages/api/src/security/csp.ts:68-79`: `script-src` is
  `'nonce-<n>' 'strict-dynamic' 'self'`, plus `'wasm-unsafe-eval'` when
  needed. Lines 266-274 mint a fresh 16-byte nonce for every response.
- LibreChat, `packages/api/src/security/csp.ts:59-61`: ships as
  `Content-Security-Policy-Report-Only` by default, so a rollout cannot break
  the app. Lines 179-181 add an optional `report-uri`.
- Next.js CSP guide (nextjs.org/docs/app/guides/content-security-policy): the
  proxy mints a nonce per request with `'strict-dynamic'`, and pages must be
  rendered per request.

**Fix.**
1. In `proxy.ts`, replace `export default authkitProxy()` with a small
   function that calls `authkit(request)` and builds the response with
   `handleAuthkitProxy` (both exported by `@workos-inc/authkit-nextjs`;
   `handleAuthkitHeaders` is its old name). A wrapper around `authkitProxy()`
   cannot add the request header Next reads the nonce from.
2. In that function, mint a 16-byte base64 nonce. Set a
   `Content-Security-Policy-Report-Only` header on the request before calling
   `handleAuthkitProxy`, and on the response it returns. Copy today's
   directives, but in `script-src` swap `'unsafe-inline'` for
   `'nonce-<n>' 'strict-dynamic'`. Keep `'wasm-unsafe-eval'` and the dev-only
   `'unsafe-eval'`, and leave `style-src` alone.
3. Add `report-uri`, plus `report-to` with a matching `Reporting-Endpoints`
   header, pointing at Sentry's security endpoint for our DSN. Add
   `report-uri` to the enforced policy in `next.config.ts` right away, since
   it is cheap.
4. In `app/layout.tsx`, read the nonce with `headers()` and pass it to
   `<ThemeProvider nonce>` and to any `next/script`.
5. Once Sentry shows clean reports on previews and production, enforce the
   nonce policy, drop `'unsafe-inline'` from `next.config.ts`, and record it
   as an ADR-0010 amendment.

**Notes.** Low, not higher, because no path for model text to become a script
is known today. Markdown renders without raw HTML, links pass
`defaultUrlTransform` (`components/ui/markdown.tsx:148`), Shiki escapes code
before `components/ui/code-block.tsx:140` injects it, and KaTeX keeps its
default `trust: false` (`components/ui/markdown.tsx:349` passes no options).
Next reads the nonce from a Report-Only header too
(`node_modules/next/dist/server/app-render/app-render.js:209`), so the
report-first rollout still stamps Next's own scripts, and next-themes 0.4.6
already accepts a `nonce` prop. Add a TODO.md item until this lands. Reports
would also catch a missing script host, like the one in "Dead analytics script
blocked by our CSP", the day it ships.

### Large profile photos fail on Vercel

Severity: Medium.

**What is wrong.** Our profile-photo limit is 10 MB, but the browser sends the
photo through our Next.js server on Vercel, and Vercel refuses request bodies
over about 4 MB on that path before our code runs. So a 6 MB phone photo or
PNG screenshot passes our check, fails on the hosted site, and the user is
told "Choose an image under 10MB." even though it already is. It works
locally because `next dev` has no such cap, so local testing never shows the
bug.

**Our code.**
- `lib/file/policy.ts:1`: `MAX_FILE_SIZE` is 10 MB, and every profile-photo
  check uses it.
- `app/components/layout/settings/general/user-profile.tsx:60-68`: runs the
  shared `validateFile()` (`lib/file/validation.ts:54-60`), then uploads.
  Chat attachments use the same check
  (`app/components/chat/use-file-upload.ts:239`), so its cap must not drop.
- `lib/user/profile-image.ts:12-23`: POSTs the raw file to
  `/api/profile-image` and turns any 413 into the 10 MB message.
- `app/api/profile-image/route.ts:59-67` and `convex/http.ts:128,162`: the
  route and the Convex endpoint both check against the same 10 MB.
- `proxy.ts:6`: the proxy's matcher also covers `/api/profile-image`.

**How references handle it.**
- Vercel docs (vercel.com/docs/functions/limitations#request-body-size): a
  function request body is capped at 4.5 MB, and larger ones get
  `413 FUNCTION_PAYLOAD_TOO_LARGE`. Requests that pass through the proxy
  (vercel.com/docs/routing-middleware, "Limits on requests") are capped at
  4 MB. Vercel's advice for bigger files is to upload them straight to
  storage, not to raise a setting.
- LobeHub, `src/components/AvatarUpload/index.tsx:91-107`: shrinks the avatar
  in the browser to a 256 px WebP square before upload
  (`packages/utils/src/imageToBase64.ts:8-44`), so size limits almost never
  come up.
- VercelChatbot, `app/(chat)/api/files/upload/route.ts:7-16`: accepts files
  up to 5 MB through a function, so files between 4.5 and 5 MB hit the same
  wall. Do not copy it.

**Fix.**
1. Add `MAX_PROFILE_IMAGE_SIZE` to `lib/file/policy.ts`, safely under 4 MB
   (for example `3.5 * 1024 * 1024`), with a one-line comment naming Vercel's
   body caps.
2. Use it in a profile-only size check next to `validateFile` in
   `user-profile.tsx`, in `app/api/profile-image/route.ts:60,64`, in
   `convex/http.ts:128,162`, and in the 413 message at
   `lib/user/profile-image.ts:13`.
3. Optional: before upload, shrink non-GIF images in the browser to about
   512 px WebP with a canvas, like LobeHub. Normal phone photos then stay well
   under the cap.

**Notes.** Try one upload just under the new cap on a preview deploy to
confirm it passes. `convex/users.ts:22` also checks stored metadata against
`MAX_FILE_SIZE`. It can stay at 10 MB, since it does not cause the bug.
Uploading straight to Convex storage, as chat attachments already do
(`lib/file-handling.ts:75-92`), would remove the Vercel hop entirely. That is a
bigger change, because the route exists so the server can attach the WorkOS
access token (`app/api/profile-image/route.ts:73-80`). "Images are never
resized" covers chat attachments, not this path, and "Every send uploads the
whole conversation" hits the same Vercel body cap on `/api/chat`.

## Dependencies and tooling

### Dependency alerts cannot see the lockfile

Severity: Medium.

**What is wrong.** GitHub's security alerts read the version ranges in
`package.json`, not the exact versions in `bun.lock`, so they miss indirect
packages and any range that still allows a fixed version. GitHub shows 0 open
alerts while `bun audit` finds 65, including 2 critical Next.js advisories
fixed in 16.3.3 (we run 16.3.1). Dependabot runs in npm mode, so its PRs edit
`package.json` but never `bun.lock`, and CI rejects every one of them. Vercel
skips that lockfile check and still builds a preview from the versions CI
refused, and nobody would hear about the next advisory that does apply to us.

**Our code.**
- `bun.lock:1660`, `1912` and `2074`: `next@16.3.1`, `sharp@0.35.3` and
  `undici@7.28.0`, each below its patched version (16.3.3, 0.35.4 and 7.29.0).
- `.github/dependabot.yml:3-4`: `package-ecosystem: "npm"`, with a comment
  saying Bun uses the npm ecosystem. All 8 npm Dependabot PRs since #45
  changed only `package.json` and failed at `bun install --frozen-lockfile`
  (`.github/workflows/ci-cd.yml:45-46`). None was merged, and #134 and #135
  are still open. No workflow runs `bun audit`.
- `vercel.json:3`: `installCommand` is plain `bun install`. Bun does not freeze
  the lockfile in CI by itself, so when `package.json` asks for a version
  `bun.lock` does not have, Vercel installs a fresh one instead of failing.
- `bunfig.toml:1-2`: holds only `peer = false`, so a version published minutes
  ago can land on the next `bun add` or `bun update`.

**How references handle it.**
- GitHub docs
  (docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories):
  the `bun` ecosystem gets version updates but not security updates. Switching
  Dependabot to Bun fixes its PRs but does not bring alerts back, so a
  scheduled `bun audit` has to fill that gap.
- trigger.dev, `pnpm-workspace.yaml:11-19`: `minimumReleaseAge: 4320` (3
  days) holds back brand-new package versions, with an exclude list that
  includes `next` so security releases are not delayed. Its
  `.github/workflows/trivy-image.yml:9-10` leaves library CVEs to GitHub's
  alerts, which works there because GitHub fully reads pnpm lockfiles.
- LibreChat, `package.json:200-263`: an `overrides` block pins patched
  versions of deep dependencies such as `brace-expansion`, `fast-uri`,
  `js-yaml` and `browserslist`, the same packages our audit flags.

**Fix.**
1. Bump `next` to at least 16.3.3 and `sharp` to at least 0.35.4, and run
   `bun update` for compatible deep fixes such as `undici` 7.29. Pin any that
   stay stuck in the existing `overrides` block (`package.json:9-11`), the way
   LibreChat does.
2. In `.github/dependabot.yml`, change the first entry to
   `package-ecosystem: "bun"` and delete the stale comment on line 3, so its
   PRs update `bun.lock` and can pass CI. Optionally add a 3-day Dependabot
   `cooldown`.
3. In `vercel.json:3`, change `installCommand` to
   `bun install --frozen-lockfile` (or `bun ci`), so a lockfile mismatch fails
   the build instead of installing versions CI never tested.
4. In `bunfig.toml`, under `[install]`, add `minimumReleaseAge = 259200` (3
   days, in seconds) and `minimumReleaseAgeExcludes = ["next"]` for packages
   that must be patched the same day.
5. Add a small scheduled workflow (weekly `schedule:` plus
   `workflow_dispatch`) that runs `bun install --frozen-lockfile` and
   `bun audit --audit-level=high`, with `--ignore=<CVE>` for accepted dev-only
   advisories. A failed scheduled run emails the owner.

**Notes.** Real exposure today is low. The Windows-only Next advisory does not
apply on Vercel's Linux, Vercel runs image optimization on its own
infrastructure, and the profile-image sniff (`convex/http.ts:165-173`) lets
only GIF, JPEG, PNG and WebP files reach `sharp`. The gap is the missing
alarm. Do not make `bun audit` a blocking PR step yet: it fails on any finding
at the chosen level, and 13 packages already fail at `high`, many of them
build and dev tools. The release-age delay only applies when versions are
re-resolved (`bun add`, `bun update`), not on frozen installs. Fold step 1
into the TODO.md item "Routine compatible dependency refresh".

### Lint lost the TypeScript rules

Severity: Low.

**What is wrong.** Our ESLint config loads only the base Next.js preset, which
sets up the TypeScript parser but none of the TypeScript rules or the stricter
Core Web Vitals set. So nothing flags `any`, `@ts-ignore`, unused imports or
leftover variables, even though our coding rules ban them. Commit `419a004e`
(January 2026), which was meant to make lint stricter, replaced the old
`next/core-web-vitals` and `next/typescript` presets with the bare one by
accident. The code already mostly follows these rules, so turning them back on
is cheap.

**Our code.**
- `eslint.config.mjs:1-4`: spreads only `eslint-config-next`, which registers
  the TypeScript parser and plugin with no typescript-eslint rules. Those live
  in `node_modules/eslint-config-next/dist/typescript.js:33-39`, which we never
  load.
- `package.json:24`: `"lint": "eslint ."` has no `--max-warnings`, so warnings
  never fail the run. Next's TypeScript preset sets `no-unused-vars` to a
  warning (`typescript.js:36`), so without this flag that rule never blocks.
- `app/api/chat/route.ts:62-65,167`: `telemetryChatId` is written but never
  read, although the comment says the catch reads it. It is one of about 11
  real leftovers outside tests, with the unused imports at
  `convex/messages.ts:4`, `lib/model-store/use-session-model.ts:6` and
  `app/components/chat/assistant-inline-work.tsx:32`.
- `lib/utils.ts:21,27` and `lib/chat-store/persist.ts:13`: the 5 `any` outside
  tests. The presets also report 5 `prefer-const` hits, and many `any` and
  `Function` types in tests.

**How references handle it.**
- Next.js docs (nextjs.org/docs/app/api-reference/config/eslint, "With
  TypeScript"): the recommended setup spreads both
  `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`,
  and `create-next-app` ships it by default.
- LibreChat, `eslint.config.mjs:228-236` and `262-269`: applies
  typescript-eslint's recommended rules to all TypeScript files and sets
  `no-unused-vars` with `^_` ignore patterns.
  `.github/workflows/static-checks.yml:141` runs ESLint on changed files with
  `--max-warnings=0`. It turns off `no-explicit-any` for its client code
  (`eslint.config.mjs:270-271`), so the ban on `any` comes from our own rules,
  not from LibreChat.

**Fix.** In `eslint.config.mjs`, import `eslint-config-next/core-web-vitals`
and `eslint-config-next/typescript` in place of the bare `eslint-config-next`,
and keep our override blocks after them. Set
`@typescript-eslint/no-unused-vars` to error, with the args, vars,
caught-errors and destructured-array ignore patterns all set to `^_`, plus
`ignoreRestSiblings: true`. Turn off `no-explicit-any` and
`no-unsafe-function-type` for `**/*.test.{ts,tsx}` and `**/__tests__/**`.
Then remove the leftovers, type the 5 production `any` (for `debounce`,
`(...args: never[]) => unknown`, and a real type for the store map in
`persist.ts`), fix the `prefer-const` hits, and change the lint script in
`package.json:24` to `eslint . --max-warnings=0`.

**Notes.** `--max-warnings=0` fails locally while a Claude Code worktree sits
under `.claude/`, until `.claude/**` is ignored. That ignore belongs to the
next entry, "Local test and lint runs scan agent worktrees". This differs from
the TODO.md item "Remove dead client state and unused indexes", which removes
specific dead code by hand. This adds the check that catches it automatically.

### Local test and lint runs scan agent worktrees

Severity: Medium.

**What is wrong.** Claude Code keeps spare copies of the repo, called
worktrees, inside `.claude/worktrees/`. Vitest and ESLint do not skip that
folder, so `bun run test` and `bun run lint` in the main checkout also run
every copy: right now 300 extra test files from another commit (`4defcd3c`,
while this checkout is at `ac026463`), mixed with main-tree code. Runs take
about twice as long and can fail on another branch's unfinished work. If a
worktree holds a build or a Playwright capture, lint can also run out of
memory.

**Our code.**
- `vitest.config.ts:5-13`: sets no `exclude`. Vitest 4's default skips only
  `node_modules` and `.git`
  (`node_modules/vitest/dist/chunks/defaults.9aQKnqFk.js:6`) and matches
  hidden folders (`dot: true` at
  `node_modules/vitest/dist/chunks/cli-api.24X8XwN1.js:10831`), so it finds
  601 test files: 301 of ours and 300 in the worktree.
- `vitest.config.ts:16`: the `@` alias points at the main checkout, so a
  worktree test loads main-tree code through `@/` imports and worktree code
  through relative imports.
- `eslint.config.mjs:6-7`: the global ignores (`convex/_generated/**`,
  `.next-perf/**`, `output/**`, plus Next's own `.next/**`) match only at the
  repo root. Flat config does not read `.git/info/exclude`, which is the only
  thing hiding `.claude/worktrees/` (its lines 11 and 18). ESLint's
  `isPathIgnored` returns false for a worktree's `.next/`, `output/` and
  `convex/_generated/` files, including the `output/` bundles that the line 6
  comment says make ESLint run out of memory.
- `benchmarks/chat-performance/browser/results/shared-stream-audit/code-cadence.test.tsx:34`:
  a gitignored test that Vitest still collects, and it writes a JSON file on
  every `bun run test`.

**How references handle it.**
- T3Code, `vite.config.ts:64-70`: lists `**/.repos/**`, its folder of
  vendored reference checkouts, in the Vitest `exclude`. Lines 85 and 113-114
  keep the same folder out of its formatter and linter.
- Vitest docs (vitest.dev/config/#exclude): the default exclude covers only
  `node_modules` and `.git`, so any other nested copy must be listed.

**Fix.** In `vitest.config.ts`, import `configDefaults` from `vitest/config`
and add
`exclude: [...configDefaults.exclude, ".claude/**", "benchmarks/**/results/**"]`
under `test`. In `eslint.config.mjs:7`, add `.claude/**` to the global
`ignores` next to `output/**`, and update the comment on line 6 to mention
worktrees. `tsc` needs no change.

**Notes.** CI is not affected, because a fresh checkout has no worktrees, and
`tsc` already includes 0 files under `.claude/`. The extra files can add false
failures, but they cannot hide a failure in our own tests. The worktree also
has its own `node_modules`, so one run may load two copies of Vitest or React.
That part is not confirmed.

### Node versions differ across environments

Severity: Low.

**What is wrong.** Nothing picks the Node version on purpose: `package.json`
only sets a minimum, so Vercel production runs its newest major (24 today,
and a future 26 with no code change), CI runs whatever the GitHub runner ships
(22 today), and laptops run anything (25 on this machine). Our only Convex
code that runs on Node, the profile-image check, uses Convex's default Node
20, which stopped getting security fixes on 2026-04-30. A green CI run never
tests the version production uses.

**Our code.**
- `package.json:6-8`: `engines.node` is `>=22.13.0`. Vercel maps any `>=`
  range to its latest major, and `engines` overrides the dashboard setting
  (vercel.com/docs/functions/runtimes/node-js/node-js-versions). Line 118 pins
  `@types/node` to `^22`, so type checks also target 22.
- `convex.json:25-27`: the `node` block sets only `externalPackages`, no
  `nodeVersion`. The installed schema gives the default as `"20"`
  (`node_modules/convex/schemas/convex.schema.json:124-128`), and so do the
  Convex docs (docs.convex.dev/functions/runtimes).
  `convex/profileImageValidation.ts:1-4` is our only `"use node"` file.
- `.github/workflows/ci-cd.yml:40-43` and `89-92`: CI sets up Bun but never
  Node. `next`, `vitest` and `eslint` start through `#!/usr/bin/env node`, so
  they run on the runner image's default. `perf-benchmark.yml:144-147` does
  the same.
- `README.md:27` and `INSTALL.md:8`: say "22.13.0 or later". There is no
  `.nvmrc`, `.node-version` or `.tool-versions` file.

**How references handle it.**
- LibreChat, `.nvmrc:1`: pins `24.16.0`, and
  `.github/workflows/backend-review.yml:57` installs that same version in CI.
- trigger.dev, `.nvmrc:1`: pins `v24.18.0`, and
  `.github/workflows/code-quality.yml:25-28` sets up Node 24.18.0 in CI.
- T3Code, `package.json:60-62`: `engines.node` is `^24.13.1`, and
  `.github/workflows/ci.yml:38-42` installs Node from that field
  (`node-version-file: package.json`).

**Fix.**
1. Main fix: add `"nodeVersion": "24"` under `node` in `convex.json`, next to
   `externalPackages`. Upload one profile image on a dev deployment to confirm
   validation still passes.
2. In `package.json`, change `engines.node` (line 7) to `24.x` and
   `@types/node` (line 118) to `^24`, so Vercel cannot move to a new major on
   its own.
3. In `.github/workflows/ci-cd.yml`, add `actions/setup-node` with
   `node-version-file: package.json` before each "Setup Bun" step (lines 40,
   89 and 121), and the same in `perf-benchmark.yml`. Pin it to a commit SHA,
   as "CI actions are not pinned to commits" describes.
4. Update `README.md:27` and `INSTALL.md:8`. Optionally add a `.nvmrc` with
   `24` for local tools, and say in one line that these places move together.

**Notes.** Making Vercel install exactly the lockfile CI tested is covered in
"Dependency alerts cannot see the lockfile". The Node 20 risk is general, not
about images: `sharp` decodes with its own bundled libvips, not Node core. Not
every peer pins Node: VercelChatbot has no `engines` field, and HuggingChat's
CI still uses Node 20.

### Formatting is never checked

Severity: Low.

**What is wrong.** Prettier (the tool that formats code the same way
everywhere) is installed and configured, but no script, hook or CI step runs
it. 208 of our 1,009 tracked code and CSS files no longer match its style,
including the most-edited chat runtime files. When an editor or a tool
formats a file it touched, a one-line fix arrives with hundreds of unrelated
changes, which makes review diffs noisy and draws extra review-bot comments.
So today the working rule is to never run Prettier over whole files.

**Our code.**
- `.prettierrc.json:1-11`: the config, with the import-sort and Tailwind
  plugins that `package.json:114,126-127` installs.
- `package.json:12-37`: no `format` or `format:check` script. There is also
  no `.prettierignore`, pre-commit hook or `.git-blame-ignore-revs`.
- `.github/workflows/ci-cd.yml:48-76`: the validate job runs ESLint,
  typecheck, the catalog check, schema checks and tests, but no format check.
- `app/api/chat/chat-turn-runtime.ts`, `app/api/chat/durable-turn-runtime.ts`
  and `convex/chatRuntime.ts`: among the 208 drifted files (84 in `app/`, 48
  in `lib/`, 27 in `benchmarks/`, 25 in `convex/`, 17 in `components/`), and
  recent commits keep editing them without formatting.

**How references handle it.**
- HuggingChat, `package.json:13-14`: `lint` is
  `prettier --check . && eslint .` and `format` is `prettier --write .`. CI
  runs `npm run lint` (`.github/workflows/lint-and-test.yml:26-27`), so
  formatting drift fails the build.
- LibreChat, `.github/workflows/static-checks.yml:144-175`: runs
  `prettier --check` on the files a PR changes, and the job fails at the end
  if that step failed (lines 675 and 712).
- T3Code, `vite.config.ts:79-82`: formats staged files on every commit, with
  its own formatter (`vp fmt`) instead of Prettier.

**Fix.**
1. Add a `.prettierignore` with `*.md` (so `TODO.md` and other Markdown are
   never reformatted), `convex/_generated`, `.claude/`, `output/`, build
   output, and `lib/models/data/openrouter.snapshot.json` (the catalog
   snapshot, which the refresh script writes in its own layout).
2. Add `"format": "prettier --write ."` and
   `"format:check": "prettier --check ."` to the scripts in `package.json`.
3. Make one commit that only runs `bun run format`, at a time when no
   long-lived branch is open, and add its SHA to a new
   `.git-blame-ignore-revs` so `git blame` skips it.
4. In `.github/workflows/ci-cd.yml`, add a `bun run format:check` step next to
   "Run ESLint" (line 48).

**Notes.** Do not start with LibreChat's changed-files-only check while 208
files are out of format. Prettier checks whole files, so the first PR that
touches a drifted file would have to reformat all of it: a one-line fix in
`benchmarks/chat-performance/browser/native-scroll.test.ts` brings 588
formatting lines with it. Prettier reads `.gitignore` but not
`.git/info/exclude`, so without `.claude/` in `.prettierignore`,
`bun run format` would also rewrite the worktree copies.
