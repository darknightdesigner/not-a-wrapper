# ChatGPT Sidebar — Expanded HTML

Paste the full HTML of the ChatGPT sidebar in its **expanded** state below.

> **Key state differences (expanded vs collapsed):**
> - Root `style.width`: `var(--sidebar-width)` vs `var(--sidebar-rail-width)`
> - Root `style.background-color`: `var(--bg-elevated-secondary)` vs `var(--bg-primary)`
> - Collapsed rail: `opacity-0 pointer-events-none inert` (expanded) vs `opacity-100` (collapsed)
> - Expanded panel: `opacity-100` (expanded) vs `opacity-0 pointer-events-none inert` (collapsed)
> - Close button `aria-expanded`: `true` (expanded) vs `false` (collapsed)
>
> **Fidelity note:**
> - This is a readability-first reference, not a byte-for-byte runtime dump.
> - Structural/semantic signals are preserved (`class`, `aria-*`, `data-testid`, `data-sidebar-item`, `data-fill`, `data-trailing-button`, `data-state` where meaningful).
> - Normalized noise: runtime `radix-*` IDs, `data-discover`, opaque SVG sprite hashes (replaced with icon comments), and repeated chat instances (condensed).

---

```html
<!-- SIDEBAR ROOT -->
<div
  class="border-token-border-light relative z-21 h-full shrink-0 overflow-hidden border-e max-md:hidden print:hidden"
  id="stage-slideover-sidebar"
  style="width:var(--sidebar-width);background-color:var(--sidebar-bg, var(--bg-elevated-secondary))"
>
  <div class="relative flex h-full flex-col">
    <!-- COLLAPSED RAIL (icon-only bar) -->
    <div
      id="stage-sidebar-tiny-bar"
      class="group/tiny-bar flex h-full w-(--sidebar-rail-width) cursor-e-resize flex-col items-start bg-transparent pb-1.5 motion-safe:transition-colors rtl:cursor-w-resize absolute inset-0 pointer-events-none opacity-0 motion-safe:ease-[steps(1,end)] motion-safe:transition-opacity motion-safe:duration-150"
      inert=""
    >
      <!-- RAIL: Toggle Button -->
      <div class="h-header-height flex items-center justify-center">
        <span class="" data-state="closed">
          <button
            class="text-token-text-primary no-draggable hover:bg-token-surface-hover keyboard-focused:bg-token-surface-hover touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-none disabled:opacity-50 mx-2 cursor-e-resize rtl:cursor-w-resize"
            aria-label="Open sidebar"
            aria-expanded="false"
            aria-controls="stage-slideover-sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon-lg -m-1 group-hover/tiny-bar:hidden group-focus-visible:hidden">
              <!-- icon: sidebar-logo -->
            </svg>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" data-rtl-flip="" class="icon hidden group-hover/tiny-bar:block group-focus-visible:block">
              <!-- icon: sidebar-open-arrow -->
            </svg>
          </button>
        </span>
      </div>

      <!-- RAIL: Quick Actions (new chat, search, images) -->
      <div class="mt-(--sidebar-section-first-margin-top)">
        <div class="" data-state="closed">
          <a tabindex="0" data-fill="" class="group __menu-item hoverable gap-1.5" data-sidebar-item="true" data-testid="create-new-chat-button" href="/">
            <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                <!-- icon: new-chat (pen/compose) -->
              </svg>
            </div>
          </a>
        </div>
        <div class="" data-state="closed">
          <div tabindex="0" data-fill="" class="group __menu-item hoverable gap-1.5" data-sidebar-item="true">
            <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                <!-- icon: search -->
              </svg>
            </div>
          </div>
        </div>
        <div class="" data-state="closed">
          <a tabindex="0" data-fill="" class="group __menu-item hoverable gap-1.5" data-sidebar-item="true" data-testid="sidebar-item-library" href="/images">
            <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                <!-- icon: images/library -->
              </svg>
            </div>
          </a>
        </div>
      </div>

      <div class="pointer-events-none flex-grow"></div>

      <!-- RAIL: Profile Avatar -->
      <div class="mb-1">
        <div class="" data-state="closed">
          <div
            tabindex="0"
            data-fill=""
            data-size="large"
            class="group __menu-item hoverable gap-2 p-2"
            data-sidebar-item="true"
            data-testid="accounts-profile-button"
            aria-label="Open profile menu"
            role="button"
            type="button"
            aria-haspopup="menu"
            aria-expanded="false"
            data-state="closed"
          >
            <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon-lg">
              <div class="flex overflow-hidden rounded-full select-none bg-gray-500/30 h-6 w-6 shrink-0">
                <img src="https://cdn.auth0.com/avatars/an.png" alt="Profile image" class="h-6 w-6 shrink-0 object-cover" referrerpolicy="no-referrer" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- EXPANDED PANEL -->
    <div class="opacity-100 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-linear h-full w-(--sidebar-width) overflow-x-clip overflow-y-auto text-clip whitespace-nowrap bg-(--sidebar-bg,var(--bg-elevated-secondary))">
      <h2 class="select-none" style="position:absolute;border:0;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0, 0, 0, 0);white-space:nowrap;word-wrap:normal">
        Chat history
      </h2>
      <nav class="group/scrollport relative flex h-full w-full flex-1 flex-col overflow-y-auto transition-opacity motion-safe:duration-500" aria-label="Chat history" data-scrolled-from-end="">
        <!-- HEADER: Home + Close Sidebar -->
        <div class="short:group-data-scrolled-from-top/scrollport:shadow-sharp-edge-top sticky top-0 z-30 bg-(--sidebar-mask-bg,var(--bg-elevated-secondary))">
          <div class="touch:px-1.5 px-2">
            <div id="sidebar-header" class="h-header-height flex items-center justify-between">
              <a
                data-sidebar-item="true"
                aria-label="Home"
                class="text-token-text-primary no-draggable hover:bg-token-surface-hover keyboard-focused:bg-token-surface-hover touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-none disabled:opacity-50"
                href="/"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon-lg">
                  <!-- icon: sidebar-logo -->
                </svg>
              </a>
              <div class="flex">
                <button
                  class="text-token-text-tertiary no-draggable hover:bg-token-surface-hover keyboard-focused:bg-token-surface-hover touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-none disabled:opacity-50 no-draggable cursor-w-resize rtl:cursor-e-resize"
                  aria-expanded="true"
                  aria-controls="stage-slideover-sidebar"
                  aria-label="Close sidebar"
                  data-testid="close-sidebar-button"
                  data-state="closed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" data-rtl-flip="" class="icon max-md:hidden">
                    <!-- icon: sidebar-open-arrow -->
                  </svg>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon md:hidden">
                    <!-- icon: close-sidebar (mobile) -->
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- STICKY NAV: New Chat, Search, Images -->
        <aside class="pt-(--sidebar-section-first-margin-top) last:mb-5 tall:sticky tall:top-header-height tall:z-20 not-tall:relative bg-(--sidebar-mask-bg,var(--bg-elevated-secondary)) [--sticky-spacer:6px]">
          <a tabindex="0" data-fill="" class="group __menu-item hoverable" data-sidebar-item="true" data-testid="create-new-chat-button" href="/">
            <div class="flex min-w-0 items-center gap-1.5">
              <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                  <!-- icon: new-chat (pen/compose) -->
                </svg>
              </div>
              <div class="flex min-w-0 grow items-center gap-2.5">
                <div class="truncate">New chat</div>
              </div>
            </div>
            <div class="trailing highlight text-token-text-tertiary">
              <div class="inline-flex whitespace-pre *:inline-flex *:font-sans touch:hidden">
                <kbd aria-label="Shift"><span class="min-w-[1em]">⇧</span></kbd>
                <kbd aria-label="Command"><span class="min-w-[1em]">⌘</span></kbd>
                <kbd><span class="min-w-[1em]">O</span></kbd>
              </div>
            </div>
          </a>
          <div tabindex="0" data-fill="" class="group __menu-item hoverable" data-sidebar-item="true">
            <div class="flex min-w-0 items-center gap-1.5">
              <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                  <!-- icon: search -->
                </svg>
              </div>
              <div class="flex min-w-0 grow items-center gap-2.5">
                <div class="truncate">Search chats</div>
              </div>
            </div>
            <div class="trailing highlight text-token-text-tertiary">
              <div class="inline-flex whitespace-pre *:inline-flex *:font-sans touch:hidden">
                <kbd aria-label="Command"><span class="min-w-[1em]">⌘</span></kbd>
                <kbd><span class="min-w-[1em]">K</span></kbd>
              </div>
            </div>
          </div>
          <a tabindex="0" data-fill="" class="group __menu-item hoverable gap-1.5" data-sidebar-item="true" data-testid="sidebar-item-library" href="/images">
            <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                <!-- icon: images/library -->
              </svg>
            </div>
            <div class="flex min-w-0 grow items-center gap-2.5">
              <div class="truncate">Images</div>
            </div>
          </a>
          <div aria-hidden="true" class="pointer-events-none absolute start-0 end-0 -bottom-(--sticky-spacer) h-(--sticky-spacer) opacity-0 will-change-[opacity] group-data-scrolled-from-top/scrollport:opacity-100 bg-(--sidebar-mask-bg,var(--bg-elevated-secondary))"></div>
        </aside>

        <!-- SECONDARY NAV: Apps, Deep Research, Codex -->
        <div class="pb-[calc(var(--sidebar-section-margin-top)-var(--sidebar-section-first-margin-top))]">
          <a tabindex="0" data-fill="" class="group __menu-item hoverable gap-1.5" data-sidebar-item="true" data-testid="apps-button" href="/apps">
            <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                <!-- icon: apps -->
              </svg>
            </div>
            <div class="flex min-w-0 grow items-center gap-2.5">
              <div class="truncate">Apps</div>
            </div>
          </a>
          <a tabindex="0" data-fill="" class="group __menu-item hoverable gap-1.5" data-sidebar-item="true" data-testid="deep-research-sidebar-item" href="/deep-research">
            <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                <!-- icon: deep-research -->
              </svg>
            </div>
            <div class="flex min-w-0 grow items-center gap-2.5">
              <div class="truncate">Deep research</div>
            </div>
          </a>
          <a tabindex="0" data-fill="" class="group __menu-item hoverable" data-sidebar-item="true" rel="noopener noreferrer" href="/codex" target="_blank">
            <div class="flex min-w-0 items-center gap-1.5">
              <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                  <!-- icon: codex -->
                </svg>
              </div>
              <div class="flex min-w-0 grow items-center gap-2.5">
                <div class="truncate">Codex</div>
              </div>
            </div>
            <div class="trailing highlight text-token-text-tertiary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" data-rtl-flip="" class="icon-sm">
                <!-- icon: external-link -->
              </svg>
            </div>
          </a>
        </div>

        <!-- EXPANDO SECTIONS: GPTs, Projects, Group Chats -->
        <div class="group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]">
          <button aria-expanded="false" class="text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5">
            <h2 class="__menu-label" data-no-spacing="true">GPTs</h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" data-rtl-flip="" class="h-3 w-3 shrink-0 group-hover/sidebar-expando-section:block">
              <!-- icon: chevron -->
            </svg>
          </button>
        </div>
        <div class="group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]">
          <button aria-expanded="false" class="text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5">
            <h2 class="__menu-label" data-no-spacing="true">Projects</h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" data-rtl-flip="" class="h-3 w-3 shrink-0 group-hover/sidebar-expando-section:block">
              <!-- icon: chevron -->
            </svg>
          </button>
        </div>
        <div class="group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]">
          <button aria-expanded="false" class="text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5">
            <h2 class="__menu-label" data-no-spacing="true">Group chats</h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" data-rtl-flip="" class="h-3 w-3 shrink-0 group-hover/sidebar-expando-section:block">
              <!-- icon: chevron -->
            </svg>
          </button>
        </div>

        <!-- CHAT HISTORY (Your Chats - expanded) -->
        <div class="group/sidebar-expando-section mb-[var(--sidebar-expanded-section-margin-bottom)]">
          <button aria-expanded="true" class="text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5">
            <h2 class="__menu-label" data-no-spacing="true">Your chats</h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" class="invisible h-3 w-3 shrink-0 group-hover/sidebar-expando-section:visible">
              <!-- icon: collapse-up -->
            </svg>
          </button>

          <div id="history" class="">
            <!-- CHAT ITEM (active) -->
            <a tabindex="0" data-fill="" class="group __menu-item hoverable" data-sidebar-item="true" draggable="false" href="/c/{chat-id}" data-active="">
              <div class="flex min-w-0 grow items-center gap-2.5">
                <div class="truncate"><span class="" dir="auto">Image Capture Delete Issue</span></div>
              </div>
              <div class="trailing-pair">
                <div class="trailing highlight text-token-text-tertiary">
                  <button tabindex="0" data-trailing-button="" class="__menu-item-trailing-btn" data-testid="undefined-options" aria-label="Open conversation options" type="button" aria-haspopup="menu" aria-expanded="false" data-state="closed">
                    <div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                        <!-- icon: more-options (ellipsis) -->
                      </svg>
                    </div>
                  </button>
                </div>
                <div class="trailing text-token-text-tertiary" tabindex="-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon-xs text-token-icon-tertiary opacity-50">
                    <!-- icon: active-indicator -->
                  </svg>
                </div>
              </div>
            </a>

            <!-- CHAT ITEM -->
            <a tabindex="0" data-fill="" class="group __menu-item hoverable" data-sidebar-item="true" draggable="false" href="/c/{chat-id}">
              <div class="flex min-w-0 grow items-center gap-2.5">
                <div class="truncate"><span class="" dir="auto">Cinematic Violin Trailer Prompt</span></div>
              </div>
              <div class="trailing-pair">
                <div class="trailing highlight text-token-text-tertiary">
                  <button tabindex="0" data-trailing-button="" class="__menu-item-trailing-btn" data-testid="history-item-0-options" aria-label="Open conversation options" type="button" aria-haspopup="menu" aria-expanded="false" data-state="closed">
                    <div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                        <!-- icon: more-options (ellipsis) -->
                      </svg>
                    </div>
                  </button>
                </div>
                <div class="trailing text-token-text-tertiary" tabindex="-1"></div>
              </div>
            </a>

            <!-- CHAT ITEM -->
            <a tabindex="0" data-fill="" class="group __menu-item hoverable" data-sidebar-item="true" draggable="false" href="/c/{chat-id}">
              <div class="flex min-w-0 grow items-center gap-2.5">
                <div class="truncate"><span class="" dir="auto">59th St Bridge Incident</span></div>
              </div>
              <div class="trailing-pair">
                <div class="trailing highlight text-token-text-tertiary">
                  <button tabindex="0" data-trailing-button="" class="__menu-item-trailing-btn" data-testid="history-item-1-options" aria-label="Open conversation options" type="button" aria-haspopup="menu" aria-expanded="false" data-state="closed">
                    <div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
                        <!-- icon: more-options (ellipsis) -->
                      </svg>
                    </div>
                  </button>
                </div>
                <div class="trailing text-token-text-tertiary" tabindex="-1"></div>
              </div>
            </a>

            <!-- ... 53 more chat items with identical structure, only href/title/data-testid differ ... -->
          </div>
        </div>

        <div class="grow"></div>
        <div aria-hidden="true" data-edge="true" class="pointer-events-none h-px w-px"></div>
        <div class="align-end pointer-events-none sticky z-40 flex shrink-0 flex-col justify-end" style="bottom:calc(3.95rem - 1px * 3);margin-top:calc(1px * -4);height:calc(1px * 4);mask-image:linear-gradient(to top, transparent 25%, white 75%)">
          <div class="sticky w-full bg-token-border-sharp" style="bottom:3.95rem;height:1px"></div>
        </div>

        <!-- FOOTER: User Profile -->
        <div class="sticky bottom-0 z-30 py-1.5 empty:hidden bg-token-bg-elevated-secondary">
          <div class="relative">
            <div
              tabindex="0"
              data-fill=""
              data-size="large"
              class="group __menu-item hoverable gap-2"
              data-sidebar-item="true"
              data-testid="accounts-profile-button"
              aria-label="Open profile menu"
              role="button"
              type="button"
              aria-haspopup="menu"
              aria-expanded="false"
              data-state="closed"
            >
              <div class="flex items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon-lg">
                <div class="flex overflow-hidden rounded-full select-none bg-gray-500/30 h-6 w-6 shrink-0">
                  <img src="https://cdn.auth0.com/avatars/an.png" alt="Profile image" class="h-6 w-6 shrink-0 object-cover" referrerpolicy="no-referrer" />
                </div>
              </div>
              <div class="min-w-0">
                <div class="flex min-w-0 grow items-center gap-2.5">
                  <div class="truncate">Andres Gonzalez</div>
                </div>
                <div class="not-group-data-disabled:text-token-text-tertiary leading-dense mb-0.5 text-xs group-data-sheet-item:mt-0.5 group-data-sheet-item:mb-0">
                  <span class="inline-flex items-center gap-1 truncate text-xs font-normal text-token-text-secondary" dir="auto">
                    <span>Plus</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </div>
  </div>
</div>
```
