# Make chat faster, 2026-10-09

Final before/after for the five items taken from Anthropic's "How we made
claude.ai 3x faster" and Theo's commentary. Base is `4be66f67` (HEAD before this
work; captured from a local snapshot commit whose product files are
byte-identical). Candidate is the working tree before the final commit
`c84a0582`, which added only the default-header `data-fixed-header` wiring in
`layout-app.tsx` (used by test pages, not chat routes) and a type import move.
Both are local production builds (`NEXT_PUBLIC_CHAT_PERF_INSTRUMENTATION=true`,
`.next-perf`), measured on one Apple M4 Max with Chromium 151.0.7922.34,
headless, fresh guest contexts, base and candidate interleaved. Raw JSON stayed
in the session scratchpad. This is local evidence, not CI certification.

## Product changes

- Code highlighting: Shiki tokenizes a one-byte copy of each block (one em dash
  in a reply put every grammar regex on V8's two-byte path), finished HTML sits
  in a bounded LRU, and blocks yield between each other (ADR-0016 amendment).
- Typeable before hydration: the server-rendered fallback textarea is visible
  and typeable; ProseMirror adopts its text, caret and IME state on mount. The
  form's `method="dialog"` makes a pre-hydration submit a no-op (ADR-0047).
- Instant sidebar on signed-in reload: an owner-scoped `naw:sidebar-window`
  envelope renders cached rows and projects until live reads land (ADR-0048).
- Composer typing renders: toolbar controls memoized, Send/Stop keyed on a
  `hasDraftText` boolean, a value-free `PromptInput` layout context, stable
  `FileUpload` context (ADR-0049 "First census fix").
- Streaming style invalidation: the scroll root carries its own
  `data-fixed-header` instead of `has-data-[...]` variants, and typography's
  blockquote quote rules are re-keyed to `p:is(blockquote *)` (ADR-0017,
  ADR-0049).

## Measured results

| Measurement | Method, samples | Base | Candidate |
| --- | --- | ---: | ---: |
| Time to typeable, cold `/`, 1280 px | interleaved loads, n=11 per arm | 203.8 ms (202.1 to 212.9) | 43.8 ms (41.6 to 48.1) |
| Same, 4x CPU | n=11 | 769.0 ms (764.9 to 793.1) | 107.7 ms (105.6 to 109.8) |
| Same, 4x CPU + 150 ms, 1.6/0.75 Mbps | n=7 | 7,273 ms (7,264 to 7,294) | 1,858 ms (1,828 to 1,867) |
| Editor editable (old typeable point) | same loads | 203.8 / 769.0 / 7,273 ms | 203.9 / 774.5 / 7,288 ms |
| Typing renders, 26 keys | `bench:counts`, 2 captures x 5 runs x 1x and 4x | 3,618 | 688 |
| Typing hooks / store subscriptions / context reads | same | 65,070 / 4,698 / 6,534 | 5,278 / 106 / 2,273 |
| Typing CDP script time, median | same, n=10 per throttle | 92.6 ms @1x, 197.3 ms @4x | 60.7 ms @1x, 99.0 ms @4x |
| Typing CDP task time, median | same | 135.9 ms @1x, 280.5 ms @4x | 106.8 ms @1x, 158.2 ms @4x |
| Popover open renders / hooks / context reads | same | 242 / 6,400 / 456 | 239 / 6,378 / 441 |
| 400-line block from an em dash reply, Node | `render-stream.bench.tsx`, 3 rounds x 15 iterations | n/a (case not in base) | 39.4 ms two-byte, 16.4 ms shipped path |
| Shared render-stream bench cases (10) | 3 interleaved rounds | | all within -2.1% to +2.1% |
| Style over a streamed long answer | trace of a full guest send, 32 s window, n=5 | 491.5 ms (488.7 to 493.1) | 208.9 ms (206.1 to 211.9) |
| Layout over the same stream | same | 2,385.5 ms (2,380.9 to 2,401.2) | 989.6 ms (979.4 to 1,005.0) |
| Recalculated elements over the stream | same | 37,471 | 11,533 |
| `:has()` invalidations (scroll root) | invalidation tracking, partial windows 12.2 s / 17.1 s, n=2 | 1,151 (1,099) | 30 (0) |
| Positional `P` restyles ("Related style rule") | same | 24,545 | 131 |
| Long answer content frame p50 / p95 | harness `long-markdown-100-fixed`, 10 runs, 1,120 samples | 7.9 / 13.5 ms | 7.8 / 12.5 ms |
| Long answer total blocking time, median | same | 75.5 ms (51 to 144) | 72.5 ms (47 to 142) |
| Typing during long answer p50 / p95 | guest interact, 10 runs, 480 samples | 6.8 / 10.9 ms | 5.3 / 9.9 ms |
| Constrained content frame p50 / p95 | guest interact, 4x CPU, 390 px, constrained network, 10 runs | 15.1 / 34.6 ms | 12.6 / 23.9 ms |
| Constrained late content frame p50 / p95 | same, after 80% of the answer | 25.4 / 48.5 ms | 17.1 / 32.8 ms |
| Constrained late typing p50 / p95 | same, 80 samples | 16.9 / 48.4 ms | 11.2 / 23.8 ms |
| Constrained late menu open, median | same, n=10 | 60.7 ms (43.9 to 85.7) | 51.5 ms (42.2 to 65.0) |
| Constrained rAF gaps over 40 ms per run, median | same | 21 | 7 |
| Wheel to next frame late in a stream, p50 / p95 | scratch probe, 5 streams x 10 wheels | 13.8 / 22.0 ms @1x, 61.4 / 87.0 ms @4x | 12.6 / 17.2 ms @1x, 37.4 / 64.5 ms @4x |
| Payload budgets | `payloadBudgets.seam.test.ts`, 3 runs | | pass, identical bytes, equal to budgets |
| Signed-in reload to sidebar rows (dev server, user's Chrome, n=1) | | not measured; base waits for the live read, which needs auth (done at 1,184 ms in the candidate load) | rows at 474 ms, with the page interactive |

Unthrottled streaming on this machine is near idle, so content-frame and
blocking-time medians barely move there; the constrained profile and the
stream traces show the change. No streaming metric crosses the ADR-0037
relative gate (35% and its floor) when applied to these pooled medians.

Not regressions, but listed: constrained early menu open 64.4 to 68.9 ms median
(ranges 58.7 to 83.0 and 57.5 to 73.3, p95 lower), and unthrottled
interact first-text frame 155.0 to 177.1 ms median (bimodal around 145 and 185
ms in both arms). JavaScript in the stream traces rose 5,395 to 5,529 ms
(+2.5%, n=5, ranges do not overlap); it sits in React's scheduled render
callback, while React renders over the same stream fell (mean of 2 streams:
104,967 to 104,475 components, 890,543 to 877,725 hooks) and style plus layout
fell about 1.7 s. Unattributed.

## Guardrails added

- `bench:counts` gate (ADR-0049): every gated count was identical across all
  20 candidate runs and both throttles, and across all 20 base runs. Run the
  way `run-paired.ts` does, `counts.ts --compare base head` passed for both
  capture pairs with no gated increase; swapping the arms failed with 18
  regressions, so the gate bites. `run-paired.ts` preconditions hold: identical
  measurement files, bootstrap and `bun.lock`, and an equal paired manifest
  (only the `bench:counts` script differs).
- `counts.ts` now refuses to start when its port already serves. Base and head
  captures share one port in CI, so a leftover server would have measured the
  wrong build silently.
- Composer handoff (ADR-0047): all 12 cases (through, quiet-line,
  quiet-wrapped at 375, 768, 1280 and 1920 px) passed twice on the candidate
  build: exact text and draft, 0.00 px field delta, composer CLS 0, Send before
  hydration never navigated.
- Payload budgets: five subscribed reads pinned to exact bytes; reproducible
  across runs.
- Harness unit tests: 11 files, 142 tests pass.

## Measurement notes

The per-network guest cap (ADR-0045) was spent for the day, and signed-in
captures need `PERF_AUTH_PASSWORD`. Streaming rows therefore use scratch-only
overlays applied identically to both builds: guest admission and the guest
usage read skip the cap when the deterministic provider is on, the guest
popover carries `data-chat-composer-menu`, and guest copies of the interact
journeys skip the native-wheel step. On this Mac the deterministic provider's
relative timers drift about 18% over a 100 chunk/s answer (24.2 s scripted,
about 28.6 s delivered) in both arms, so the receipt tolerance was 30%, not
10%.

## Findings measured but not shipped

- Real streamed traces cut layout 58% (2,386 to 990 ms), more than the
  replay A/Bs that ADR-0049 cites when it declines to claim layout.
- The em dash fix shows in the harness: Shiki time per long answer fell 82.2 to
  70.0 ms (1x) and 316 to 295 ms (constrained).

## Open follow-ups

- Signed-in journeys (`interact-long-answer`, `interact-constrained`, cold and
  warm sends) need the CI pair. The signed-in sidebar reload was checked once in
  the user's Chrome on the dev server; a production-build number is still open.
- Guest-only harness runs cannot find a direct scroll-root wheel target in the
  guest layout here (thread content covers the gutter) in either arm.
- The deterministic provider schedules each chunk relative to the last, so
  delivery drifts on macOS. Scheduling against the start time would keep local
  receipts within tolerance.
- The harness README says fresh guests per run are enough; the ADR-0045 cap is
  per network, five sends a day locally.
- Attribute the 2.5% streaming JavaScript increase with a sampled CPU profile.
