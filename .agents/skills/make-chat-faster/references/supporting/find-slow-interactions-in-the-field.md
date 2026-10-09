# Find slow interactions in the field

- Original: [Find slow interactions in the field](https://web.dev/articles/find-slow-interactions-in-the-field)
- Attribution: Jeremy Wagner
- Retrieved: 2026-10-09
- Copy: Full article or chapter body converted to Markdown. Site navigation excluded; links made absolute; inline browser icons represented by their text labels.
- License: CC-BY-4.0; code samples Apache-2.0

Text: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Code samples: [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).

---

## Local reading notes

The original examples below are preserved. When adapting them, use `PerformanceScriptTiming.sourceURL` rather than the example's `sourceLocation`, per the [Long Animation Frames specification](https://www.w3.org/TR/long-animation-frames/#performancescripttiming). Also guard the result of `longAnimationFrameEntries.at(-1)` before destructuring it; an empty array returns `undefined`.

Learn how to find slow interactions in your website's field data so you can find opportunities to improve its Interaction to Next Paint.

![Jeremy Wagner](https://web.dev/images/authors/jlwagner-v7.jpg)

Jeremy Wagner

[GitHub](https://github.com/malchata)
[LinkedIn](https://www.linkedin.com/in/malchata)
[Homepage](https://jlwagner.net/)

**Try it:** The [measuring INP codelab](https://codelabs.developers.google.com/measuring-inp) covers many of the concepts outlined in this guide. Give it a try!

[Field data](https://web.dev/articles/lab-and-field-data-differences#field_data) is data that tells you how actual users are experiencing your website. It teases out issues you can't find in [lab data](https://web.dev/articles/lab-and-field-data-differences#lab_data) alone. Where [Interaction to Next Paint (INP)](https://web.dev/articles/inp) is concerned, field data is essential in identifying slow interactions, and provides vital clues to help you fix them.

In this guide, you'll learn how to quickly assess your website's INP using field data from the [Chrome User Experience Report (CrUX)](https://developer.chrome.com/docs/crux) to see if your website has issues with INP. Subsequently, you'll learn how to use the attribution build of [the web-vitals JavaScript library](https://github.com/GoogleChrome/web-vitals)—and the new insights it provides from the [Long Animation Frames API (LoAF)](https://developer.chrome.com/docs/web-platform/long-animation-frames)—to gather and interpret field data for slow interactions on your website.

## Start with CrUX to evaluate your website's INP

If you're not collecting field data from your website's users, CrUX may be a good starting point. CrUX collects field data from real Chrome users who have opted into sending telemetry data.

CrUX data is surfaced in a number of different areas, and it depends on the scope of the information you're looking for. CrUX can provide data on INP and other Core Web Vitals for:

- Individual pages and entire origins using [PageSpeed Insights](https://pagespeed.web.dev).
- Types of pages. For example, many ecommerce websites have Product Detail Page and Product Listing Page types. You can get CrUX data for unique page types in [Search Console](https://search.google.com/search-console/about).

As a starting point, you can enter your website's URL in PageSpeed Insights. Once you enter the URL, field data for it—if available—will be displayed for multiple metrics, including INP. You can also use the toggles to check your INP values for mobile and desktop dimensions.

![Field data as shown by CrUX in PageSpeed Insights, showing LCP, INP, CLS at the three Core Web Vitals, and TTFB, FCP as diagnostic metrics, and FID as a deprecated Core Web Vital metric.](https://web.dev/static/articles/find-slow-interactions-in-the-field/image/fig-1.png)


A readout of CrUX data as seen in PageSpeed insights. In this example, the given web page's INP needs improvement.

This data is useful because it tells you if you have a problem. What CrUX can't do, however, is tell you *what* is causing problems. There are many Real User Monitoring (RUM) solutions available that will help you gather your own field data from your website's users to help you answer that, and one option is to gather that field data yourself using the web-vitals JavaScript library.

## Collect field data with the `web-vitals` JavaScript library

The [`web-vitals` JavaScript library](https://github.com/GoogleChrome/web-vitals) is a script you can load on your website to gather field data from your website's users. You can use it to record a number of metrics, including INP in browsers that support it.

Browser Support

- Chrome: 96.
  96
- Edge: 96.
  96
- Firefox: 144.
  144
- Safari: 26.2.
  26.2

[Source](https://developer.mozilla.org/docs/Web/API/PerformanceEventTiming/interactionId)

The standard build of the web-vitals library can be used to get basic INP data from users in the field:

```
import {onINP} from 'web-vitals';

onINP(({name, value, rating}) => {
  console.log(name);    // 'INP'
  console.log(value);   // 512
  console.log(rating);  // 'poor'
});
```

In order to analyze your field data from your users, you'll want to send this data somewhere:

```
import {onINP} from 'web-vitals';

onINP(({name, value, rating}) => {
  // Prepare JSON to be sent for collection. Note that
  // you can add anything else you'd want to collect here:
  const body = JSON.stringify({name, value, rating});

  // Use `sendBeacon` to send data to an analytics endpoint.
  // For Google Analytics, see https://github.com/GoogleChrome/web-vitals#send-the-results-to-google-analytics.
  navigator.sendBeacon('/analytics', body);
});
```

However, this data by itself doesn't tell you much more than CrUX would. That's where the attribution build of the web-vitals library comes in.

### Go further with the web-vitals library's attribution build

[The attribution build](https://github.com/GoogleChrome/web-vitals?tab=readme-ov-file#attribution-build) of the web-vitals library surfaces additional data you can get from users in the field to help you better troubleshoot problematic interactions that are affecting your website's INP. This data is accessible through the `attribution` object surfaced in the library's `onINP()` method:

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, rating, attribution}) => {
  console.log(name);         // 'INP'
  console.log(value);        // 56
  console.log(rating);       // 'good'
  console.log(attribution);  // Attribution data object
});
```


![How console logs from the web-vitals library appears. The console in this example shows the name of the metric (INP), the INP value (56), where that value resides within the INP thresholds (good), and the various bits of information shown in the attribution object, including entries from The Long Animation Frames API.](https://web.dev/static/articles/find-slow-interactions-in-the-field/image/fig-2.png)


How data from the web-vitals library appears in the console.

In addition to the page's INP itself, the attribution build provides a lot of data you can use to help understand the reasons for slow interactions, including which part of the interaction you should focus on. It can help you answer important questions such as:

- "Did the user interact with the page while it was loading?"
- "Did the interaction's event handlers run for a long time?"
- "Was the interaction event handler code delayed from starting? If so, what else was happening on the main thread at that time?"
- "Did the interaction cause a lot of rendering work that delayed the next frame from being painted?"

The following table shows some of the basic attribution data you can get from the library that can help you figure out some high-level causes of slow interactions on your website:

| `attribution` object key | Data |
| --- | --- |
| `interactionTarget` | A CSS selector pointing to the element that produced the page's INP value—for example, `button#save`. |
| `interactionType` | The interaction's type, either from clicks, taps, or keyboard inputs. |
| `inputDelay`\* | The interaction's [input delay](https://web.dev/articles/optimize-input-delay#what_is_input_delay). |
| `processingDuration`\* | The time from when the first event listener started running in response to the user interaction until when all event listener processing has finished. |
| `presentationDelay`\* | The interaction's [presentation delay](https://web.dev/articles/optimize-inp#minimize_presentation_delay), which takes place starting from when event handlers finish to the time the next frame is painted. |
| `longAnimationFrameEntries`\* | Entries from the LoAF associated with the interaction. See the next for additional info. |
\*New in version 4

Beginning with version 4 of the web-vitals library, you can get even deeper insight into problematic interactions through the data it provides with INP phase breakdowns (input delay, processing duration and presentation delay) and the [Long Animation Frames API (LoAF)](https://developer.chrome.com/docs/web-platform/long-animation-frames).

### The Long Animation Frames API (LoAF)

Browser Support

- Chrome: 123.
  123
- Edge: 123.
  123
- Firefox: not supported.
  x
- Safari: not supported.
  x

[Source](https://developer.mozilla.org/docs/Web/API/PerformanceLongAnimationFrameTiming)

Debugging interactions using field data is a challenging task. With data from LoAF, however, it's now possible to get better insights into the causes behind slow interactions, as LoAF exposes a number of detailed timings and other data you can use to pinpoint precise causes—and more importantly, where the source of the problem is in your website's code.

The attribution build of the web-vitals library exposes an array of LoAF entries under the `longAnimationFrameEntries` key of the `attribution` object. The following table lists a few key bits of data you can find in each LoAF entry:

| LoAF entry object key | Data |
| --- | --- |
| `duration` | The duration of the long animation frame, up to when layout has finished, but excluding painting and compositing. |
| `blockingDuration` | The total amount of time in the frame that the browser was unable to respond quickly due to long tasks. This blocking time can include long tasks running JavaScript, as well as any subsequent long rendering task in the frame. |
| `firstUIEventTimestamp` | The timestamp of when the event was queued during the frame. Useful for figuring out the start of an interaction's [input delay](https://web.dev/optimize-input-delay#what_is_input_delay). |
| `startTime` | The starting timestamp of the frame. |
| `renderStart` | When the rendering work for the frame began. This includes any [`requestAnimationFrame`](https://developer.mozilla.org/docs/Web/API/window/requestAnimationFrame) callbacks (and [`ResizeObserver`](https://developer.mozilla.org/docs/Web/API/ResizeObserver) callbacks if applicable), but potentially before any style/layout work begins. |
| `styleAndLayoutStart` | When style/layout work in the frame occurs. Can be useful in figuring out the length of style/layout work when figuring in other available timestamps. |
| `scripts` | An array of items containing script attribution information contributing to the page's INP. |

![A visualization of a long animation frame according to the LoAF model.](https://web.dev/static/articles/find-slow-interactions-in-the-field/image/fig-3.png)


A diagram of the timings of a long animation frame according to the LoAF API (minus `blockingDuration`).

All of this information can tell you a lot about what makes an interaction slow—but the `scripts` array that LoAF entries surface should be of particular interest:

| Script attribution object key | Data |
| --- | --- |
| `invoker` | The invoker. This can vary based on the invoker type described in the next row. Examples of invokers can be values like `'IMG#id.onload'`, `'Window.requestAnimationFrame'`, or `'Response.json.then'`. |
| `invokerType` | The type of the invoker. Can be `'user-callback'`, `'event-listener'`, `'resolve-promise'`, `'reject-promise'`, `'classic-script'`, or `'module-script'`. |
| `sourceURL` | The URL to the script where the long animation frame originated from. |
| `sourceCharPosition` | The character position in the script identified by `sourceURL`. |
| `sourceFunctionName` | The name of the function in the identified script. |

Each entry in this array contains the data shown in this table, which gives you information about the script that was responsible for the slow interaction—and how it was responsible.

## Measure and identify common causes behind slow interactions

To give you an idea of how you might use this information, this guide will now walk through how you can use LoAF data surfaced in the `web-vitals` library to determine some causes behind slow interactions.

### Long processing durations

The processing duration of an interaction is the time it takes for the interaction's registered event handler callbacks to run to completion and anything else that might happen in between them. High processing durations are surfaced by the web-vitals library:

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, attribution}) => {
  const {processingDuration} = attribution; // 512.5
});
```

It's natural to think that the primary cause behind a slow interaction is that your event handler code took too long to run, but that isn't always the case! Once you've confirmed that this is the problem, you can dig deeper with LoAF data:

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, attribution}) => {
  const {processingDuration} = attribution; // 512.5

  // Get the longest script from LoAF covering `processingDuration`:
  const loaf = attribution.longAnimationFrameEntries.at(-1);
  const script = loaf?.scripts.toSorted((a, b) => b.duration - a.duration)[0];

  if (script) {
    // Get attribution for the long-running event handler:
    const {invokerType} = script;        // 'event-listener'
    const {invoker} = script;            // 'BUTTON#update.onclick'
    const {sourceURL} = script;          // 'https://example.com/app.js'
    const {sourceCharPosition} = script; // 83
    const {sourceFunctionName} = script; // 'update'
  }
});
```


**Note:** There can be multiple entries in the `longAnimationFrameEntries` and `script` arrays. This example gets the last animation frame (which should generally overlap with event processing), as well as the script data associated with it that took the longest to run.

As you can see in the preceding code snippet, you can work with LoAF data to track down the precise cause behind an interaction with high processing duration values, including:

- The element and its registered event listener.
- The script file—and the character position within it—containing the long-running event handler code.
- The name of the function.

This type of data is invaluable. You no longer need to do the legwork of finding out exactly which interaction—or which of its event handlers—were responsible for high processing duration values. Also, because third-party scripts can often register their own event handlers, you can determine whether or not it was your code that was responsible! For the code you have control over, you'll want to look into [optimizing long tasks](https://web.dev/articles/optimize-long-tasks).

### Long input delays

While long-running event handlers are common, there are other parts of the interaction to consider. One part occurs before the processing duration, which is known as the [input delay](https://web.dev/articles/optimize-input-delay#what_is_input_delay). This is the time from when the user initiates the interaction, to the moment its event handler callbacks begin to run and happens when the main thread is already processing another task. The web-vitals library's attribution build can tell you the length of the input delay for an interaction:

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, attribution}) => {
  const {inputDelay} = attribution; // 125.59439536
});
```

If you notice that some interactions have high input delays, then you'll need to figure out what was happening on the page at the time of the interaction that caused the long input delay—and that often boils down to whether the interaction occurred as the page was loading, or afterward.

#### Was it during page load?

The main thread is often busiest as a page is loading. During this time, all sorts of tasks are being queued and processed, and if the user tries to interact with the page while all of this work is happening, it can delay the interaction. Pages that load a lot of JavaScript can kick off work to compile and evaluate scripts, as well as executing functions that get a page ready for user interactions. This work can get in the way if the user happens to interact as this activity occurs, and you can find out if that's the case for your website's users:

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, attribution}) => {
  const {inputDelay} = attribution; // 125.59439536

  // Get the longest script from the first LoAF entry:
  const loaf = attribution.longAnimationFrameEntries[0];
  const script = loaf?.scripts.toSorted((a, b) => b.duration - a.duration)[0];

  if (script) {
    // Invoker types can describe if script eval blocked the main thread:
    const {invokerType} = script;    // 'classic-script' | 'module-script'
    const {sourceLocation} = script; // 'https://example.com/app.js'
  }
});
```

If you record this data in the field and you see high input delays and invoker types of `'classic-script'` or `'module-script'`, then it's fair to say that scripts on your site [are taking a long time to evaluate](https://web.dev/articles/script-evaluation-and-long-tasks), and are blocking the main thread long enough to delay interactions. You can reduce this blocking time by breaking up your scripts into smaller bundles, defer initially unused code to be loaded at a later point in time, and audit your site for unused code you can remove altogether.

#### Was it after page load?

While input delays often occur while a page is loading, it's just as possible that they can occur *after* a page has loaded, due to an entirely different cause. Common causes of input delays after page load can be code that runs periodically due to an earlier `setInterval` call, or even event callbacks that were queued to run earlier, and are still processing.

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, attribution}) => {
  const {inputDelay} = attribution; // 125.59439536

  // Get the longest script from the first LoAF entry:
  const loaf = attribution.longAnimationFrameEntries[0];
  const script = loaf?.scripts.toSorted((a, b) => b.duration - a.duration)[0];

  if (script) {
    const {invokerType} = script;        // 'user-callback'
    const {sourceURL} = script;          // 'https://example.com/app.js'
    const {sourceCharPosition} = script; // 83
    const {sourceFunctionName} = script; // 'update'
  }
});
```

As is the case with troubleshooting high processing duration values, high input delays due to the causes mentioned earlier will give you detailed script attribution data. What is different, however, is that the invoker type will change based on the nature of the work that delayed the interaction:

- `'user-callback'` indicates the blocking task was from `setInterval`, `setTimeout`, or even `requestAnimationFrame`.
- `'event-listener'` indicates that the blocking task was from an earlier input that was queued and still processing.
- `'resolve-promise'` and `'reject-promise'` means that the blocking task was from some asynchronous work that was kicked off earlier, and resolved or rejected at a time when the user attempted to interact with the page, delaying the interaction.

In any case, the script attribution data will give you a sense of where to start looking, and whether the input delay was due to your own code, or that of a third-party script.

### Long presentation delays

Presentation delays are the last mile of an interaction, and begin when the interaction's event handlers finish, up to the point at which the next frame was painted. They occur when the work in an event handler due to an interaction changes the visual state of the user interface. As with processing durations and input delays, the web-vitals library can tell you how long the presentation delay was for an interaction:

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, attribution}) => {
  const {presentationDelay} = attribution; // 113.32307691
});
```

If you record this data and see high presentation delays for interactions contributing to your website's INP, the culprits can vary, but here are a couple causes to be on the lookout for.

#### Expensive style and layout work

Long presentation delays may be expensive [style recalculation](https://web.dev/articles/reduce-the-scope-and-complexity-of-style-calculations) and [layout](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) work that arises from a number of causes, including complex CSS selectors and [large DOM sizes](https://web.dev/articles/dom-size-and-interactivity). You can measure the duration this work with the LoAF timings surfaced in the web-vitals library:

```
import {onINP} from 'web-vitals/attribution';

onINP(({name, value, attribution}) => {
  const {presentationDelay} = attribution; // 113.32307691

  // Get the longest script from the last LoAF entry:
  const loaf = attribution.longAnimationFrameEntries.at(-1);
  const script = loaf?.scripts.toSorted((a, b) => b.duration - a.duration)[0];

  // Get necessary timings:
  const {startTime} = loaf; // 2120.5
  const {duration} = loaf;  // 1002

  // Figure out the ending timestamp of the frame (approximate):
  const endTime = startTime + duration; // 3122.5

  // Get the start timestamp of the frame's style/layout work:
  const {styleAndLayoutStart} = loaf; // 3011.17692309

  // Calculate the total style/layout duration:
  const styleLayoutDuration = endTime - styleAndLayoutStart; // 111.32307691

  if (script) {
    // Get attribution for the event handler that triggered
    // the long-running style and layout operation:
    const {invokerType} = script;        // 'event-listener'
    const {invoker} = script;            // 'BUTTON#update.onclick'
    const {sourceURL} = script;          // 'https://example.com/app.js'
    const {sourceCharPosition} = script; // 83
    const {sourceFunctionName} = script; // 'update'
  }
});
```

LoAF won't tell you the duration of the style and layout work is for a frame, but it will tell you when it started. With this starting timestamp, you can use other data from LoAF to calculate an accurate duration of that work by determining the end time of the frame, and subtracting the start timestamp of the style and layout work from that.

**Note:** There's a type of layout known as forced layout, where style recalculation and layout operations are forced to occur in an event handler's callback, before the presentation delay phase. This kind of layout affects interaction latency, and can be accessed in a Long Animation Frame entry's `forcedStyleAndLayoutDuration` property.

#### Long-running `requestAnimationFrame` callbacks

One potential cause of long presentation delays is excessive work done in a [`requestAnimationFrame`](https://developer.mozilla.org/docs/Web/API/window/requestAnimationFrame) callback. The contents of this callback are executed after event handlers have finished running, but just prior to style recalculation and layout work.

These callbacks can take considerable time to complete if the work done within them is complex. If you suspect high presentation delay values are due to work you're doing with `requestAnimationFrame`, you can use LoAF data surfaced by the web-vitals library to identify these scenarios:

```
onINP(({name, value, attribution}) => {
  const {presentationDelay} = attribution; // 543.1999999880791

  // Get the longest script from the last LoAF entry:
  const loaf = attribution.longAnimationFrameEntries.at(-1);
  const script = loaf?.scripts.toSorted((a, b) => b.duration - a.duration)[0];

  // Get the render start time and when style and layout began:
  const {renderStart} = loaf;         // 2489
  const {styleAndLayoutStart} = loaf; // 2989.5999999940395

  // Calculate the `requestAnimationFrame` callback's duration:
  const rafDuration = styleAndLayoutStart - renderStart; // 500.59999999403954

  if (script) {
    // Get attribution for the event handler that triggered
    // the long-running requestAnimationFrame callback:
    const {invokerType} = script;        // 'user-callback'
    const {invoker} = script;            // 'FrameRequestCallback'
    const {sourceURL} = script;          // 'https://example.com/app.js'
    const {sourceCharPosition} = script; // 83
    const {sourceFunctionName} = script; // 'update'
  }
});
```

If you see that a significant portion of the presentation delay time is spent in a `requestAnimationFrame` callback, ensure the work you're doing in these callbacks is limited to performing work that results in an actual update to the user interface. Any other work that doesn't touch the DOM or update styles will unnecessarily delay the next frame from being painted, so be careful!

## Conclusion

Field data is the best source of information you can draw on when it comes to understanding which interactions are problematic for actual users in the field. By relying on field data collection tools such as the web-vitals JavaScript library (or a RUM provider), you can be more confident about which interactions are most problematic, and then move on to [reproducing problematic interactions in the lab](https://web.dev/articles/manually-diagnose-slow-interactions-in-the-lab) and then go about fixing them.

*Hero image from [Unsplash](https://unsplash.com/), by [Federico Respini](https://unsplash.com/@federicorespini).*
