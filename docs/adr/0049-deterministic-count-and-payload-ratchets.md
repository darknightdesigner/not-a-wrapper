# 49. Deterministic interaction counts and payload budgets as CI ratchets

- Status: accepted
- Date: 2026-10-09
- Context: Anthropic, "How we made claude.ai 3x faster in two weeks" ("Anything
  can be hill climbed", "Scaling horizontally"); Theo's commentary on T3 Code's
  payload-baseline check (transcript 28:02 to 30:38)
- Related: ADR-0034 (convex-test seam tests), ADR-0037 (responsiveness
  measurement and paired gate policy)

## Context

Every chat-performance gate measured milliseconds. ADR-0037 makes them usable
by pairing merge base and candidate on one runner over five or more runs, but
small regressions still hide in the noise, and a timing alone does not say
what got more expensive. The composer typing path showed the cost of that
blind spot: each keystroke re-rendered about 139 components carrying 2,500
hooks, and nothing measured it. The reactive reads had no size check either,
so a field added to a message or chat document reached every chat open and
sidebar render unnoticed.

## Options considered

1. **Wall clock only (status quo).** What users feel, but too noisy to catch
   small regressions and silent about cause.
2. **Instruction counts** (Valgrind `Ir` with `node --predictable`). Exact and
   single-run, but Node-only. Our hot paths are React rendering and style work
   in the browser, which this cannot reach.
3. **Deterministic browser counts plus payload budgets.** Chosen. Count work
   the browser does per interaction, and bytes the backend returns per read.

## Decision

**Interaction counts** (`benchmarks/chat-performance/browser/counts.ts`,
`count-probe.ts`). A stub `__REACT_DEVTOOLS_GLOBAL_HOOK__` installed before page
scripts receives `onCommitFiberRoot` from production React (React registers
with any hook that `supportsFiber`). Per commit it walks only subtrees whose
child list changed and counts components with the `PerformedWork` flag, their
hooks (`memoizedState` chain), `useSyncExternalStore` hooks, and context
dependencies. A MutationObserver counts DOM mutation records; CDP
`Performance.getMetrics` deltas give style recalcs, layouts, nodes, and
listeners. A fresh guest types 26 characters into the idle home composer, one
key at a time, draining frames until a two-frame cycle adds no commit or
mutation, then opens the plus popover after its hover tooltip settles. Reduced
motion is emulated: with motion, popover open varied from 17 to 23 commits
with frame timing; without it, 14 every run. Animation cost stays with the
wall-clock suite.

**Stability proof.** Production build, five runs each at 1x and 4x CPU, three
captures:

| Count | Typing (26 keys) | Popover open | Gated |
| --- | --- | --- | --- |
| React commits | 27 | 14 | yes |
| Component renders | 3,618 | 242 | yes |
| Hooks on renders | 65,070 | 6,400 | yes |
| Store subscription hooks | 4,698 | 593 | yes |
| Context reads | 6,534 | 456 | yes |
| DOM mutations | 305 | 86 | yes |
| Layouts | 79 | 4 | yes |
| Style recalcs | 127 to 131 | 17 | popover only |
| Nodes / listeners delta | 147 / 482 | varies at 1x | no |

Only counts identical across every run and both throttles gate. CDP durations
are recorded as wall-clock context and never gate.

**Correlation proof.** Memoizing the four composer toolbar controls in a scratch
build cut typing renders 47%, hooks 58%, store subscription hooks 49%, and
context reads 44%. Interleaved captures (control, memo, control, memo; ten
typing runs per build and throttle) moved CDP time the same way:

| Typing, median | Control | Memo |
| --- | --- | --- |
| Script, 1x | 91 ms (85 to 96) | 73 ms (63 to 78) |
| Task, 1x | 134 ms | 120 ms |
| Script, 4x | 199 ms | 138 ms |
| Task, 4x | 290 ms | 216 ms |

The same control build's 4x script median drifted from 208 to 192 ms between
sessions, so a single-digit-percent change needs pairing to see in time; the
counts see it in one run. Commits, DOM mutations, layouts, and popover style
recalcs did not move in this experiment: they gate on structural grounds (each
is browser work per interaction) until a change proves their correlation.

**Gate.** The responsiveness pair in `run-paired.ts` captures counts on the base
and head builds and runs `counts.ts --compare`. A gated count fails when it
varies within either capture (invalid evidence) or when head exceeds base.
Comparing against the merge base ratchets automatically: once a lower count
merges, it is the new ceiling. A missing capture is NOT EVALUATED and fails,
as in ADR-0037. The paired manifest keeps only the scripts the protocol
executes (`build:next`, its pre/post hooks, and the install lifecycle hooks),
so a lifecycle change still fails closed while a tooling-only script needs no
overlay.

**Payload budgets** (`convex/payloadBudgets.seam.test.ts`). Following T3 Code's
transport budgets, one convex-test fixture seeds a 120-turn chat (reasoning on
every answer, a tool call every fourth, an attachment every tenth question,
one regenerated branch) and a sidebar of 60 recent and 6 pinned chats. A fixed
clock and convex-test's counter ids make the JSON bytes exact. Each subscribed
read must not exceed its checked-in budget by a single byte, and fails more
than 1% below it with a message to lower the budget. It runs in `bun run test`, under a second.
This widens ADR-0034's seam-test scope on purpose: only the real registration
returns the bytes a client receives, so a core-level fake cannot hold a budget.

| Read | Bytes |
| --- | --- |
| `messages.getSelectedPath` (240 messages) | 645,851 |
| `messages.getSelectedRunState` live / settled | 175 / 173 |
| `chats.getRecentWindowForCurrentUser` first page (25) | 9,667 |
| `chats.getPinnedForCurrentUser` (6) | 2,334 |

## Consequences

- A PR that adds re-renders, hooks, or DOM churn to the typing or popover path
  fails with the exact count delta, before any wall-clock run can see it.
- A gated count that proves unstable on the hosted runner is demoted to
  report-only in `GATED_COUNTS` with a note here; it is never retried until it
  passes.
- Counts do not prove speed. A PR that lowers a count should still show the
  paired wall-clock result moving the same way, or the count is thrown out.
- First census fix: typing re-rendered the whole composer toolbar per
  keystroke. Memoized toolbar controls, a value-free `PromptInput` layout
  context, and stable `FileUpload`/`PromptInput` context values cut 26
  keystrokes from 3,618 to 688 renders, 65,070 to 5,278 hooks, and 4,698 to 106
  store subscriptions; typing script time fell 194 to 96 ms at 4x CPU (87 to 57
  ms at 1x, interleaved A/B, n=7). Popover counts did not rise.
- The selected path has no windowing: a 120-turn chat ships 646 KB on open.
  The budget makes growth visible; bounding the read is separate work.
- The ratchet only holds across PRs that trigger the workflow. Its path filter
  covers the typing and popover render path (chat input, `components/ui/**`,
  the model selector, hooks, and the model, user, and preference stores); a
  regression that lands through an unwatched module raises the next base
  silently. The weekly schedule does not run counts.
- Streaming style invalidation (2026-10-10): the scroll root's
  `has-data-[fixed-header=...]` variants re-matched it on every streamed
  insertion, and typography's `blockquote p:last-of-type` flagged every
  paragraph parent for backward-positional invalidation, so each appended block
  restyled all sibling paragraphs. `ChatChromeProvider` now publishes the mode
  as the scroll root's own `data-fixed-header` (ADR-0017), and
  `lib/markdown/typography-plugin.mjs` re-keys the two quote rules to
  `p:is(blockquote *):first-of-type` / `:last-of-type`, which match the same
  elements but fail outside blockquotes before the positional check, so
  rendering is unchanged. Replaying the long-markdown fixture into the real
  scroll root (production builds, 1,934 frames at 1440px, quote rules removed)
  cut `:has()` invalidations 3,755 to 0, paragraph restyles 127,873 to 264,
  recalculated elements 135,696 to 11,297, and style 1,486 to 390 ms (medians,
  interleaved, n=5). Isolated replays moved layout in both directions by up to
  ~100 ms, but real streamed long answers on production builds cut style
  491.5 to 208.9 ms and layout 2,385.5 to 989.6 ms (medians, n=5, interleaved;
  `docs/performance/2026-10-09-make-chat-faster.md`). Forced style for 485 appends over the dev
  CSS: original rules ~566 ms, re-keyed ~147 ms, removed ~141 ms (n=5). With
  the typography fix alone, the scroll-root change still cut style 714 to
  394 ms. Full-send traces were blocked by the per-network guest cap
  (ADR-0045) and remain to be re-run.
- Not yet counted: a streamed answer. Commit counts during streaming depend on
  frame pacing; a per-publication normalization needs its own stability proof.
