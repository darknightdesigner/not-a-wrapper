# ADR-0052: New-chat prompt autocomplete

**Status:** Accepted
**Date:** 2026-11-13
**Related:** ADR-0010 (authenticated routes), ADR-0021 (platform usage
allowance)

## Context

The new-chat page replicates Grok's layout, including its autocomplete: as
the user types, up to three full prompts appear under the composer. Grok
posts the partial prompt and recent conversation titles to
`/rest/suggestions/stream` after a 200 ms pause, streams the results (first
row about 460 ms after the last keystroke), caches them for 5 minutes, and
keeps narrowing cached continuations locally on each keystroke. Good
continuations need a language model; title matching or a phrase list produced
ungrammatical results.

## Options

1. **Client-only matching** against chat titles and a phrase list. Free, but
   poor completions.
2. **Meter each call against the platform allowance (ADR-0021).** Correct
   accounting, but a reservation and settlement per typing pause for a call
   that costs a fraction of a cent.
3. **One small authenticated, streaming route on the platform key, bounded by
   a per-user rate limit.** Chosen.

Streamed time to the first complete line, measured 2026-11-13 with the final
prompt: Llama 3.3 70B through OpenRouter with `provider.sort: "latency"`
~0.15-0.3 s (0.4-0.6 s with default routing); Gemini 2.5 Flash-Lite through
OpenRouter ~0.35-0.45 s; Claude Haiku 4.5 ~0.4-0.6 s (best phrasing); Claude
Haiku 5.5 0.65-3.7 s; GPT-5.4 nano 1.1-2.5 s (unstreamed). Gemini direct
platform credits were depleted.

## Decision

- `POST /api/prompt-autocomplete` (`authenticatedRoute`, CSRF) streams
  `text/plain`, one completion per line, from Llama 3.3 70B on OpenRouter's
  lowest-latency host, with the request policy options and hashed actor id.
  `streamCompletions` yields each line as soon as it ends; the client reads
  it with React Query's `streamedQuery`, so rows appear one by one.
- Bucket `prompt_autocomplete` allows 60 calls a minute and 2,000 a UTC
  day per user (amended 2026-11-13); a call must pass both. The route runs the
  Convex rate-limit round trip concurrently with the model call (it cost
  0.1-0.35 s serially) and aborts the model if the call is refused.
- Calls are not metered against the chat allowance (ADR-0021 lists this
  route as subsidized). The daily window bounds spend per user: at most
  2,000 answered calls a day, each capped at 120 output tokens. Because the
  rate-limit check overlaps the model call, a
  refused call can still open an OpenRouter request; it is aborted when the
  check returns (0.1-0.35 s), so it costs at most its input tokens.
- Guests get starters but no autocomplete.
- The client sends up to 12 recent chat titles; the server reads nothing.
  More titles made models dwell on them.
- Pure rules (eligibility, line parsing, stable row order) live in
  `lib/prompt-autocomplete.ts`; the UI is `ComposerSuggestions`, rendered by
  the Composer only on the home new-chat surface.

## Consequences

- The partial prompt (up to 50 characters per typing pause) and recent chat
  titles reach OpenRouter and its host, as chat content already does for
  OpenRouter models. Nothing is sent before a 200 ms pause or for `/` and
  `@` commands.
- Llama sometimes over-uses recent topics; Haiku 4.5 is the drop-in upgrade
  if phrasing matters more than ~0.2 s. The model id is one constant.
- If usage grows, revisit option 2.
