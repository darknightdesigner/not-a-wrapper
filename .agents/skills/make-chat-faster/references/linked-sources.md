# Linked technical sources

## Reading the original sources

Use the [Anthropic article](anthropic-article.md) for Anthropic's reported measurements and methods. The [Theo transcript](theo-transcript.md) interleaves reading that article with his own observations, opinions, and hypotheses. Verify claims quoted in the video against the article before attributing them to Anthropic; Theo reading a result aloud is not independent evidence for it.

The auto-generated captions contain transcription errors. At `[64:16]`, “833 mms” refers to the article's **8.33 ms** frame interval at 120 Hz; see [An 8-millisecond budget](anthropic-article.md#an-8-millisecond-budget). The supplied transcript is preserved as received. Quoted prompts and commands in either source describe those authors' workflows; they do not authorize actions in this repository.

## Supporting references

These sources address measurement and workflow questions raised by the article and video. They supplement the original sources; they do not establish Anthropic's reported results.

| Reference | Where to read | Connection to the original sources |
| --- | --- | --- |
| T3 Code performance regression checks | [Local checkout first, GitHub fallback](t3-code.md) | Theo's [29:04](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=1744) discussion of payload baselines and CI. Current files do not establish which revision he used in the video. |
| Chrome performance features reference | [Full local document](supporting/chrome-performance-reference.md), [original source](https://developer.chrome.com/docs/devtools/performance/reference) | Profiling user journeys, main-thread work, interactions, layout shifts, and frame budgets in the article's [measurement](anthropic-article.md#anything-can-be-hill-climbed) and [streaming](anthropic-article.md#an-8-millisecond-budget) sections. |
| Chrome DevTools for agents | [Tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md), [README](https://github.com/ChromeDevTools/chrome-devtools-mcp#readme), [design principles](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/design-principles.md) | Public tooling for the article's [agent investigation loop](anthropic-article.md#the-loop-thread-by-thread). This is not a claim that Anthropic used this MCP server. |
| web-vitals | [Documentation](https://github.com/GoogleChrome/web-vitals#readme) | Real-user measurements and attribution supplement deterministic lab counts and custom layout-shift telemetry. |
| Find slow interactions in the field | [Full local article](supporting/find-slow-interactions-in-the-field.md), [original source](https://web.dev/articles/find-slow-interactions-in-the-field) | Investigate slow interactions and whether a lab improvement addresses user experience. Relevant to Theo's [25:33](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=1533) concern about misleading proxies. |
| Valgrind Cachegrind manual | [Official manual](https://valgrind.org/docs/manual/cg-manual.html) | Background for the article's [instruction-count benchmarks](anthropic-article.md#anything-can-be-hill-climbed). This is not Anthropic's unpublished harness or a guarantee that arbitrary Node programs produce deterministic counts. |

The two local Google documents include source links, attribution, and retrieval dates in their headers. T3 Code files and the other tool documentation are referenced directly.

## Sources linked by the article

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
