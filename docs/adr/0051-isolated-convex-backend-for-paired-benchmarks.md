# ADR-0051: Paired benchmarks run against their own Convex preview deployment

**Status:** Accepted
**Date:** 2026-10-10
**Related:** ADR-0037 (paired gate policy), ADR-0027 (additive `splitLiveTail`),
ADR-0044 (capture-user deletion), ADR-0049 (payload budgets)

## Context

The perf workflow ran both arms of a pair against the one Convex deployment in
`PERF_ENV_FILE` and never deployed it. PR #213 added public functions
(`messages.getLiveMessage`, `messages.getResumeSelection`) that the head client
subscribes to. Run 38096954469 passed all seven base journeys, then failed every
head journey with "timed out waiting for first_visible_text": 42 attempts, each
to its full timeout, 1 h 13 min in total. A warning told the owner to push the
branch's `convex/` to the shared deployment by hand, and then to push main back
if the PR did not merge. Meanwhile the global `authenticated` concurrency group
(`cancel-in-progress: false`) let a stale run hold the lane for 70+ minutes and
cancelled newer pending runs instead.

## Options

1. **Shared deployment plus a preflight.** Keep the dev deployment and fail when
   it lacks a function the build references. Fails fast, but still needs the
   manual push, still mixes runs with dev traffic, and reading the deployment's
   function list needs admin credentials CI does not have.
2. **One preview deployment per run, head backend for both arms.** Chosen.
   Deploy the checked-out `convex/` to a fresh Convex preview deployment with a
   preview deploy key (the same mechanism Vercel previews use) and point both
   builds at it.
3. **Two preview deployments, one per arm.** Each client gets its own backend,
   so backend cost changes would show up in the pair. Rejected: two fresh
   deployments differ in placement and warm-up, which adds variance that is not
   product code, and it doubles deploy time and deployment count. Backend
   payload growth is already gated by ADR-0049's byte budgets.

## Decision

`isolated-backend.ts` runs before any build. With `CONVEX_DEPLOY_KEY` set to
the `PERF_CONVEX_PREVIEW_DEPLOY_KEY` secret it runs
`convex deploy --preview-create perf-<pr-N|run-ID>-<suite>`. Inside the deploy
`--cmd`, after the deployment is claimed and before the push, it sets the four
variables `convex/convex.config.ts` requires, so the push and `auth.config.ts`
see them:

- `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`: copied from `PERF_ENV_FILE`, so the
  preview accepts the RS256 tokens the harness's real `/auth/login` mints.
- `CHAT_ADMISSION_SECRET`: random per run, written to both the preview and
  `.env.local`. The run is its own signer trust domain, and a build that still
  targets another deployment fails admission loudly.
- `WORKOS_WEBHOOK_SECRET`: random. No webhook endpoint targets a preview.

`--skip-workos-check` skips Convex's AuthKit provisioning, whose preview
redirect URIs come from Vercel-only build variables; password login needs no
redirect. `.env.local` then drops `CONVEX_DEPLOYMENT` and points
`NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` and `CONVEX_SITE_URL`
at the preview. `run-paired.ts` refuses to run unless `.env.local` targets the
deployment this step created, and records it in the manifest.

**Compatibility preflight.** The step reads the preview's function spec and
parses each arm's client sources (outside `convex/`, scripts, benchmarks and
tests) for `api.<module>.<function>` references, so comments and strings never
count. Any reference the preview does
not serve fails the job in about a minute, naming each function and the file
that uses it. The base arm runs the merge-base client against the head backend,
so public functions must still change additively (ADR-0027). Names are
checked; argument shapes are not.

**Fail fast.** A failed warmup stops its scenario: warmups exist to prove the
journey runs, so the remaining attempts would only repeat the timeout. When a
second scenario's warmup fails with the same signature, the suite stops and
the remaining scenarios are recorded as failed. The signature is the first
Convex function error the browser or server reported, else the error message.
Request ids, URLs, opaque ids and durations are ignored when comparing; other
numbers such as HTTP statuses still tell causes apart. Failure messages carry browser console errors,
page errors and Convex errors from the server log.

**Concurrency.** Pull request runs share a per-PR group that cancels superseded
runs. Scheduled and manual runs get a group per run. Nothing else needs
serializing: each run has its own deployment, admission secret and WorkOS
capture users (`ci-isolated-v1`), and each pair stays sequential on one runner.
The guest/authenticated lane split and the single-suite matrix limit existed
only for the shared deployment and are removed.

## Consequences

- No manual `convex/` pushes. A PR that changes functions is measured against
  its own functions, and the shared dev deployment no longer accumulates
  benchmark chats.
- The workflow needs a fourth secret, a Convex preview deploy key. Without it
  the job fails on its first step with that instruction.
- Each preview counts toward the team's deployment limit until Convex deletes
  it (5 days, 14 on paid plans). Names are reused per PR with
  `--preview-create`, so this stays at one per active PR plus one per scheduled
  or manual suite run. Function usage is about a hundred sends per pair.
- The preflight reads source syntax, not the bundle. A reference made without
  the `api.` property path (`makeFunctionReference`, a destructured `api`)
  escapes it; the warmup stop still bounds that failure to a few minutes.
- The pair cannot see backend execution time changes, as before: both arms use
  one backend. Byte budgets and seam tests remain the backend gates.
- A warmup correctness failure now fails the capture. It was previously logged
  and ignored, though its failure meant the environment could not run the
  journey.
