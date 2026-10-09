---
name: make-chat-faster
description: Route chat-app performance work to source references on measurement, agent workflows, regression prevention, and human judgment. Use for startup, typing, conversation navigation, streaming, and main-thread responsiveness.
---

# Make Chat Faster

Use this skill as a routing index. The full article and timestamped transcript are stored locally. Read the references relevant to the task, distinguishing Anthropic's reported results from Theo's observations, opinions, and hypotheses.

For Theo's topic entries, open the linked transcript and search for the exact paragraph marker shown. The video links seek within those paragraphs.

## Sources

| Reference | Use for |
| --- | --- |
| [Anthropic article](references/anthropic-article.md) | Measurement design, optimization loops, benchmarks, CI ratchets, rollout safeguards, and human steering. |
| [Theo video transcript](references/theo-transcript.md) | Practical observations, testing friction, cache freshness, metric limitations, and product judgment. |
| [T3 Code regression checks](references/t3-code.md) | Read the existing local checkout first; GitHub links are fallbacks. Payload budgets, bounded history, live state, and active-transport benchmarks. |
| [Chrome performance reference](references/supporting/chrome-performance-reference.md) | Main-thread traces, interaction timing, layout shifts, rendering, and frame analysis. |
| [Chrome DevTools for agents](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) | Agent-driven trace recording and performance insight analysis. |
| [web-vitals documentation](https://github.com/GoogleChrome/web-vitals#readme) | Real-user INP, CLS, LCP, attribution, and measurement limitations. |
| [Find slow interactions in the field](references/supporting/find-slow-interactions-in-the-field.md) | Connect slow user interactions to input delay, event processing, rendering, and responsible scripts. |
| [Valgrind Cachegrind manual](https://valgrind.org/docs/manual/cg-manual.html) | Instruction counts, comparing profiles, reproducibility, and profiler limitations. |
| [Linked technical sources](references/linked-sources.md) | Supporting browser specifications and documentation referenced by the article. |

## Find a topic

| Topic | Anthropic article | Theo commentary |
| --- | --- | --- |
| User journeys and measurement boundaries | [The brief](references/anthropic-article.md#the-brief) | [Transcript](references/theo-transcript.md): `[15:33]`; [video 15:40](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=940) |
| Useful benchmarks and misleading metrics | [Anything can be hill climbed](references/anthropic-article.md#anything-can-be-hill-climbed) | [Transcript](references/theo-transcript.md): `[25:27]`; [video 25:33](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=1533) |
| Agent optimization loops and parallel investigations | [The loop](references/anthropic-article.md#the-loop-thread-by-thread), [Scaling horizontally](references/anthropic-article.md#scaling-horizontally) | [Transcript](references/theo-transcript.md): `[33:44]`, `[41:02]`; [video 34:08](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=2048), [41:11](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=2471) |
| Regression prevention and manual verification | [Guardrails](references/anthropic-article.md#guardrails) | [Transcript](references/theo-transcript.md): `[29:04]`, `[34:48]`; [video 29:04](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=1744), [34:48](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=2088) |
| Human judgment, product taste, and complexity | [Steering](references/anthropic-article.md#steering) | [Transcript](references/theo-transcript.md): `[58:08]`; [video 58:24](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=3504) |
| Streaming, main-thread work, and frame budgets | [An 8-millisecond budget](references/anthropic-article.md#an-8-millisecond-budget) | [Transcript](references/theo-transcript.md): `[62:44]`; [video 1:03:11](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=3791) |
| Remaining performance gaps | [What's next](references/anthropic-article.md#whats-next) | [Transcript](references/theo-transcript.md): `[67:51]`; [video 1:08:10](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=4090) |
