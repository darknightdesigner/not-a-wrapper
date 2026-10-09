# Linked technical sources

## Downloaded supporting references

These additions were selected from the measurement and workflow questions raised by the article and video. They are supporting references, rather than additional evidence for Anthropic's reported results. Copies were retrieved on October 9, 2026.

| Reference | Local copy | Connection to the original sources |
| --- | --- | --- |
| [T3 Code performance regression checks](https://github.com/pingdotgg/t3code/blob/0e7abea7c98060db537fe81f31ce5ba7c6d376d0/docs/internals/performance-regressions.md) | [Full document](supporting/t3-code/docs/internals/performance-regressions.md), [transport tests](supporting/t3-code/apps/server/src/orchestration-v2/ThreadTransportPerformance.test.ts.txt), [command tests](supporting/t3-code/packages/client-runtime/src/operations/commands.performance.test.ts.txt), [CI workflow](supporting/t3-code/.github/workflows/ci.yml), [package commands](supporting/t3-code/package.json) | Theo's [29:04](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=1744) discussion of payload baselines and CI. These files show the current implementation; they do not establish which revision he used in the video. |
| [Chrome performance features reference](https://developer.chrome.com/docs/devtools/performance/reference) | [Full document](supporting/chrome-performance-reference.md), [original HTML](supporting/chrome-performance-reference.html.gz) | Profiling user journeys, main-thread work, interactions, layout shifts, and frame budgets in the article's [measurement](anthropic-article.md#anything-can-be-hill-climbed) and [streaming](anthropic-article.md#an-8-millisecond-budget) sections. |
| [Chrome DevTools for agents](https://github.com/ChromeDevTools/chrome-devtools-mcp/tree/f08dbe152502d66e75fa07fb2588dc0feb42bc20) | [Full README](supporting/chrome-devtools-mcp/README.md), [tool reference](supporting/chrome-devtools-mcp/docs/tool-reference.md), [design principles](supporting/chrome-devtools-mcp/docs/design-principles.md) | A public tooling reference for the article's [agent investigation loop](anthropic-article.md#the-loop-thread-by-thread). It is not a claim that Anthropic used this particular MCP server. |
| [web-vitals](https://github.com/GoogleChrome/web-vitals/tree/400d01968abffcd91a6f0307c9aaac97c5f7a76a) | [Full README](supporting/web-vitals/README.md) | Real-user measurements and attribution supplement deterministic lab counts and the article's custom layout-shift telemetry. |
| [Find slow interactions in the field](https://web.dev/articles/find-slow-interactions-in-the-field) | [Full article](supporting/find-slow-interactions-in-the-field.md), [original HTML](supporting/find-slow-interactions-in-the-field.html.gz) | Investigate the cause of slow interactions and validate whether a lab improvement addresses what users experience. Relevant to Theo's [25:33](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=1533) concern about optimizing misleading proxies. |
| [Valgrind Cachegrind manual](https://valgrind.org/docs/manual/cg-manual.html) | [Full chapter](supporting/valgrind/cachegrind-manual.md), [original HTML](supporting/valgrind/cachegrind-manual.html.gz) | Technical background for the article's [Valgrind instruction-count benchmarks](anthropic-article.md#anything-can-be-hill-climbed). This is tool documentation, not Anthropic's unpublished benchmark harness or a guarantee that arbitrary Node programs produce deterministic counts. |

The GitHub files contain complete, unmodified copies of the selected files, rather than entire repositories. TypeScript source snapshots use a `.ts.txt` extension so application lint, typecheck, and test discovery treat them as reference text. Their relative links refer to their original repository directories unless the target is also present locally. Original HTML is stored as gzip archives to preserve the downloaded bytes; read these with `gzip -dc <path>`. Revisions, retrieval dates, sizes, and stored-file and uncompressed-HTML SHA-256 hashes are recorded in [sources.json](supporting/sources.json).

Licenses and attribution are retained with the copies: T3 Code's [MIT license](supporting/t3-code/LICENSE); Chrome DevTools MCP's [Apache 2.0 license](supporting/chrome-devtools-mcp/LICENSE); web-vitals' [Apache 2.0 license](supporting/web-vitals/LICENSE); Google article text under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) with code samples under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0); and Valgrind's [GFDL](supporting/valgrind/license-gfdl.md), [documentation notice](supporting/valgrind/documentation-title-page.md), and [authors](supporting/valgrind/authors.md).

## Sources linked by the article

These are original sources linked by the Anthropic article. Full copies of the following pages are not stored here.

| Source | Article context |
| --- | --- |
| [Claude Tag](https://claude.com/product/tag) | Agent harness used in the reported sprint. |
| [Standing instructions](https://claude.com/docs/claude-tag/users/getting-started#give-claude-standing-instructions) | Channel instructions referenced in the brief. |
| [Agent loops](https://claude.com/blog/getting-started-with-loops) | Loop mechanism linked from the optimization workflow. |
| [Automated code review](https://claude.com/blog/code-review) | Review mechanism linked from the guardrails section. |
| [Test impact analysis at Anthropic](https://claude.com/blog/agentic-coding-is-straining-ci-heres-how-we-scaled-test-impact-analysis-at-anthropic) | CI context cited alongside preserving performance gains. |
| [Cumulative Layout Shift](https://web.dev/articles/cls) | Standard layout-shift metric discussed in the sidebar example. |
| [Layout Instability API](https://wicg.github.io/layout-instability/) | Underlying layout-shift entries used in the sidebar investigation. |
| [Speculative loading](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Speculative_loading) | Browser prerendering behavior in the static-composer example. |
