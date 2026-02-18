# ChatGPT Prompt Input (Mobile) — HTML

Paste the full HTML of the ChatGPT prompt input/composer area below (mobile snapshot).

> **Key semantic regions:**
> - Root composer container: `#thread-bottom-container`
> - Main composer form: `form[data-type="unified-composer"]`
> - Editable prompt surface: `#prompt-textarea.ProseMirror[contenteditable="true"]`
> - Primary actions: plus/attachments (`#composer-plus-btn`), dictate button, submit/send (`#composer-submit-button`)
> - Disclaimer region: "ChatGPT is AI and can make mistakes..."
>
> **State cues captured in this snapshot:**
> - Composer mode appears idle/empty (placeholder visible in ProseMirror)
> - Plus menu trigger is closed: `aria-expanded="false"`, `data-state="closed"`
> - Send button is present but disabled: `button#composer-submit-button[disabled]`
> - Dictation control is visible
>
> **Fidelity note:**
> - This is a readability-first reference, not a byte-for-byte runtime dump.
> - Structural and behavioral signals are preserved (`id`, `class`, `aria-*`, `data-*`, form/input relationships).
> - Normalized noise: opaque SVG sprite hashes replaced with icon comments; runtime telemetry script preserved but minimized; formatting expanded for scanability.

---

```html
<!-- PROMPT INPUT ROOT (MOBILE SNAPSHOT) -->
<div
  id="thread-bottom-container"
  class="sticky bottom-0 group/thread-bottom-container relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 has-data-has-thread-error:[box-shadow:var(--sharp-edge-bottom-shadow)] md:border-transparent md:pt-0 dark:border-white/20 md:dark:border-transparent print:hidden content-fade single-line flex flex-col"
>
  <!-- Scroll-to-bottom / jump control -->
  <div class="relative h-0">
    <div style="opacity: 1;">
      <button
        class="cursor-pointer absolute z-30 rounded-full bg-clip-padding border text-token-text-secondary border-token-border-default end-1/2 translate-x-1/2 bg-token-main-surface-primary w-8 h-8 flex items-center justify-center print:hidden bottom-[calc(100%+6*var(--spacing))]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon text-token-text-primary">
          <!-- icon: scroll-to-latest / down-arrow -->
        </svg>
      </button>
    </div>
  </div>

  <div id="thread-bottom">
    <div class="text-base mx-auto [--thread-content-margin:--spacing(4)] @w-sm/main:[--thread-content-margin:--spacing(6)] @w-lg/main:[--thread-content-margin:--spacing(16)] px-(--thread-content-margin)">
      <div class="[--thread-content-max-width:40rem] @w-lg/main:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 mb-4">
        <div class="flex justify-center empty:hidden"></div>

        <!-- COMPOSER WRAPPER -->
        <div class="pointer-events-auto relative z-1 flex h-(--composer-container-height,100%) max-w-full flex-(--composer-container-flex,1) flex-col">
          <div class="absolute start-0 end-0 bottom-full z-20"></div>

          <!-- COMPOSER FORM -->
          <form class="group/composer w-full" style="view-transition-name:var(--vt-composer)" data-type="unified-composer">
            <!-- Hidden generic file picker -->
            <div class="hidden">
              <input
                multiple=""
                type="file"
                tabindex="-1"
                style="border:0;clip:rect(0, 0, 0, 0);clip-path:inset(50%);height:1px;margin:0 -1px -1px 0;overflow:hidden;padding:0;position:absolute;width:1px;white-space:nowrap"
              />
            </div>

            <!-- Composer surface -->
            <div class="">
              <div
                class="bg-token-bg-primary corner-superellipse/1.1 cursor-text overflow-clip bg-clip-padding p-2.5 contain-inline-size motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-in-out dark:bg-[#303030] grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'leading_primary_trailing'_'._footer_.'] group-data-expanded/composer:[grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] shadow-short"
                data-composer-surface="true"
                style="border-radius: 28px;"
              >
                <!-- Primary input area -->
                <div class="-my-2.5 flex min-h-14 items-center overflow-x-hidden px-1.5 [grid-area:primary] group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5">
                  <div class="wcDTda_prosemirror-parent text-token-text-primary max-h-[max(30svh,5rem)] max-h-52 min-h-[var(--deep-research-composer-extra-height,unset)] flex-1 overflow-auto [scrollbar-width:thin] default-browser vertical-scroll-fade-mask">
                    <textarea
                      class="wcDTda_fallbackTextarea"
                      name="prompt-textarea"
                      autofocus=""
                      placeholder="Ask anything"
                      data-virtualkeyboard="true"
                      style="display: none;"
                    ></textarea>

                    <script nonce="">
                      window.__oai_logHTML
                        ? window.__oai_logHTML()
                        : (window.__oai_SSR_HTML = window.__oai_SSR_HTML || Date.now());
                      requestAnimationFrame(function () {
                        window.__oai_logTTI
                          ? window.__oai_logTTI()
                          : (window.__oai_SSR_TTI = window.__oai_SSR_TTI || Date.now());
                      });
                    </script>

                    <div contenteditable="true" translate="no" class="ProseMirror" id="prompt-textarea" data-virtualkeyboard="true">
                      <p data-placeholder="Ask anything" class="placeholder">
                        <br class="ProseMirror-trailingBreak" />
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Leading action: add files/menu -->
                <div class="[grid-area:leading]">
                  <span class="flex" data-state="closed">
                    <button
                      type="button"
                      class="composer-btn"
                      data-testid="composer-plus-btn"
                      aria-label="Add files and more"
                      id="composer-plus-btn"
                      aria-haspopup="menu"
                      aria-expanded="false"
                      data-state="closed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                        <!-- icon: plus -->
                      </svg>
                    </button>
                  </span>
                </div>

                <!-- Trailing actions: dictate + send -->
                <div class="flex items-center gap-2 [grid-area:trailing]">
                  <div class="ms-auto flex items-center gap-1.5">
                    <span data-state="closed">
                      <button aria-label="Dictate button" type="button" class="composer-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="icon" aria-label="">
                          <!-- icon: microphone -->
                        </svg>
                      </button>
                    </span>

                    <span data-state="closed">
                      <button
                        disabled=""
                        id="composer-submit-button"
                        aria-label="Send prompt"
                        data-testid="send-button"
                        class="composer-submit-btn composer-submit-button-color h-9 w-9"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                          <!-- icon: send -->
                        </svg>
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        <!-- Additional hidden upload inputs -->
        <input class="sr-only select-none" type="file" tabindex="-1" aria-hidden="true" id="upload-photos" accept="image/*" multiple="" />
        <input class="sr-only select-none" type="file" tabindex="-1" aria-hidden="true" id="upload-camera" accept="image/*" capture="environment" multiple="" />
      </div>
    </div>
  </div>

  <!-- Footer disclaimer -->
  <div
    class="-mt-4 text-token-text-secondary relative w-full overflow-hidden text-center text-xs [view-transition-name:var(--vt-disclaimer)] md:px-[60px]"
    style="height: auto; opacity: 1; transform: none;"
  >
    <div class="select-none active:select-auto data-has-range-start:select-auto flex min-h-8 w-full items-center justify-center p-2">
      <div class="pointer-events-auto">
        <div>ChatGPT is AI and can make mistakes. Check important info.</div>
      </div>
    </div>
  </div>
</div>
```