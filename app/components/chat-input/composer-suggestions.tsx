"use client"

import { useBrowserLayoutEffect } from "@/app/hooks/use-browser-layout-effect"
import { Icon } from "@/components/ui/icon"
import type { PromptInputCombobox } from "@/components/ui/prompt-input"
import { useBreakpoint } from "@/hooks/use-breakpoint"
import { acceptCompletion } from "@/lib/prompt-autocomplete"
import { cn } from "@/lib/utils"
import {
  RiCodeSSlashLine,
  RiMailLine,
  RiPlaneLine,
  RiPlayFill,
  type RemixiconComponentType,
} from "@remixicon/react"
import { useId, useRef, useState, type ReactNode, type RefObject } from "react"
import { usePromptAutocomplete } from "./use-prompt-autocomplete"

/** Tailwind's `sm`: the list is hidden below it (`max-sm:hidden`). */
const SM_BREAKPOINT = 640

/** Starters fill an open-ended prefix; the autocomplete then finishes it. */
const STARTERS: ReadonlyArray<{
  label: string
  prefix: string
  icon: RemixiconComponentType
}> = [
  {
    label: "Make a website",
    prefix: "Make a website for ",
    icon: RiCodeSSlashLine,
  },
  { label: "Draft an email", prefix: "Draft an email to ", icon: RiMailLine },
  { label: "Plan a trip", prefix: "Plan a trip to ", icon: RiPlaneLine },
]

/** Row height; the glide indicator steps by it. */
const ROW_HEIGHT = 48

type Active = { index: number; via: "keyboard" | "pointer"; glide: boolean }
const NONE: Active = { index: -1, via: "keyboard", glide: false }

export type ComposerSuggestionKeyHandler = (event: KeyboardEvent) => void

type ComposerSuggestionsProps = {
  /** The composer's live text. */
  text: string
  /** Server completions need a signed-in caller; starters show for everyone. */
  autocomplete: boolean
  /** The composer routes editor keydowns here before its own handling. */
  keyHandlerRef: RefObject<ComposerSuggestionKeyHandler | null>
  onComboboxChange: (combobox: PromptInputCombobox | null) => void
  /** Replace the composer text and keep typing. */
  onFill: (text: string) => void
  /** Replace the composer text and send it. */
  onSend: (text: string) => void
}

/**
 * Grok-style suggestions under the new-chat composer: three starters while
 * the composer is empty, then up to three completions of what is typed. The
 * editor keeps focus throughout (combobox with aria-activedescendant).
 * Keys: ↓/↑ move (↓ past the end returns to the text), Enter picks, Tab
 * fills the active or first completion, Escape clears then dismisses.
 */
export function ComposerSuggestions({
  text,
  autocomplete,
  keyHandlerRef,
  onComboboxChange,
  onFill,
  onSend,
}: ComposerSuggestionsProps) {
  const baseId = useId()
  const startersId = `${baseId}-starters`
  const completionsId = `${baseId}-completions`
  const rootRef = useRef<HTMLDivElement>(null)
  // Hidden lists must not fetch, claim keys, or wire the combobox.
  const isNarrow = useBreakpoint(SM_BREAKPOINT)
  const { typed, completions } = usePromptAutocomplete({
    text,
    enabled: autocomplete && !isNarrow,
  })

  const isEmpty = text.trim() === ""
  // Escape hides completions until the text changes.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  if (dismissedAt !== null && dismissedAt !== text) setDismissedAt(null)

  const mode = isEmpty
    ? "starters"
    : completions.length > 0 && dismissedAt === null
      ? "completions"
      : "none"
  const count =
    mode === "starters"
      ? STARTERS.length
      : mode === "completions"
        ? completions.length
        : 0

  const [active, setActive] = useState<Active>(NONE)
  // A new list starts unselected; a refreshed list keeps the slot in range.
  const [activeMode, setActiveMode] = useState(mode)
  if (activeMode !== mode) {
    setActiveMode(mode)
    setActive(NONE)
  } else if (active.index >= count) {
    setActive(NONE)
  }
  const activeIndex = active.index < count ? active.index : -1
  // Hover highlights a row like Grok but never selects it: arrows continue
  // from the highlight, while Enter, Tab, and aria-activedescendant follow
  // the keyboard only.
  const selectedIndex = active.via === "keyboard" ? activeIndex : -1

  const listId = mode === "starters" ? startersId : completionsId
  // Both lists stay mounted, so ids name their own list.
  const optionId = (ownerId: string, index: number) =>
    `${ownerId}-option-${index}`

  const pick = (index: number) => {
    if (mode === "starters") {
      const starter = STARTERS[index]
      if (starter) onFill(starter.prefix)
    } else if (mode === "completions") {
      const completion = completions[index]
      if (completion) onSend(acceptCompletion(text, typed, completion))
    }
  }

  const handleKeyDown: ComposerSuggestionKeyHandler = (event) => {
    if (count === 0 || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.shiftKey) return
    // Not rendered (narrow viewport or keyboard-open): leave keys alone.
    if (!rootRef.current?.getClientRects().length) return
    const move = (index: number) => {
      event.preventDefault()
      setActive({
        index,
        via: "keyboard",
        glide: activeIndex >= 0 && index >= 0,
      })
    }
    switch (event.key) {
      case "ArrowDown":
        move(activeIndex + 1 < count ? activeIndex + 1 : -1)
        return
      case "ArrowUp":
        if (activeIndex >= 0) move(activeIndex - 1)
        return
      case "Enter":
        if (selectedIndex < 0) return
        event.preventDefault()
        pick(selectedIndex)
        return
      case "Tab": {
        if (mode !== "completions") return
        const completion = completions[Math.max(selectedIndex, 0)]
        if (!completion) return
        event.preventDefault()
        onFill(acceptCompletion(text, typed, completion))
        return
      }
      case "Escape":
        if (selectedIndex >= 0) setActive(NONE)
        else if (mode === "completions") setDismissedAt(text)
        else return
        event.preventDefault()
        return
    }
  }

  useBrowserLayoutEffect(() => {
    keyHandlerRef.current = handleKeyDown
  })
  useBrowserLayoutEffect(
    () => () => {
      keyHandlerRef.current = null
    },
    [keyHandlerRef]
  )

  const activeDescendant =
    selectedIndex >= 0 ? optionId(listId, selectedIndex) : undefined
  useBrowserLayoutEffect(() => {
    onComboboxChange(
      count > 0 && !isNarrow ? { controls: listId, activeDescendant } : null
    )
  }, [activeDescendant, count, isNarrow, listId, onComboboxChange])
  useBrowserLayoutEffect(() => () => onComboboxChange(null), [onComboboxChange])

  const rowProps = (ownerId: string, index: number) => ({
    id: optionId(ownerId, index),
    active: index === activeIndex,
    selected: index === selectedIndex,
    onPick: () => pick(index),
    onHover: () => setActive({ index, via: "pointer", glide: false }),
  })
  const clearPointer = () => {
    if (active.via === "pointer") setActive(NONE)
  }

  return (
    <div
      ref={rootRef}
      data-slot="composer-suggestions-root"
      // Out of flow so the footer keeps the composer's height as its flex
      // basis (the Grok split); keyboard-pinned composers drop the list.
      className="keyboard-open:hidden absolute inset-x-0 top-full grid max-sm:hidden"
    >
      <SuggestionList
        id={startersId}
        label="Suggested"
        visible={mode === "starters"}
        activeIndex={mode === "starters" ? activeIndex : -1}
        glide={active.glide}
        onPointerLeave={clearPointer}
        className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-[6px] motion-safe:fill-mode-both motion-safe:delay-100 motion-safe:duration-120 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
      >
        {STARTERS.map((starter, index) => (
          <SuggestionRow
            key={starter.label}
            glyph={<Icon icon={starter.icon} size={18} glyphSize={18} />}
            {...rowProps(startersId, index)}
          >
            {starter.label}
          </SuggestionRow>
        ))}
      </SuggestionList>

      <SuggestionList
        id={completionsId}
        label="Prompt suggestions"
        visible={mode === "completions"}
        activeIndex={mode === "completions" ? activeIndex : -1}
        glide={active.glide}
        onPointerLeave={clearPointer}
      >
        {completions.map((completion, index) => (
          <SuggestionRow key={completion} {...rowProps(completionsId, index)}>
            {/* The typed part reads quieter than the continuation. */}
            <span className="text-placeholder">
              {completion.slice(0, typed.length)}
            </span>
            {completion.slice(typed.length)}
          </SuggestionRow>
        ))}
      </SuggestionList>
    </div>
  )
}

function SuggestionList({
  id,
  label,
  visible,
  activeIndex,
  glide,
  onPointerLeave,
  className,
  children,
}: {
  id: string
  label: string
  visible: boolean
  activeIndex: number
  glide: boolean
  onPointerLeave: () => void
  className?: string
  children: ReactNode
}) {
  return (
    // Both lists share one grid cell and cross-fade, so swapping between
    // starters and completions never shifts layout.
    <div
      inert={!visible}
      className={cn(
        "col-start-1 row-start-1 transition-opacity motion-reduce:transition-none",
        visible
          ? "opacity-100 duration-120 ease-[cubic-bezier(0,0,0,1)]"
          : "opacity-0 duration-90 ease-[cubic-bezier(0.2,0,0,1)]"
      )}
    >
      <div
        id={id}
        role="listbox"
        aria-label={label}
        onPointerLeave={onPointerLeave}
        className={cn("relative isolate flex flex-col pt-3", className)}
      >
        {/* One highlight that glides between rows on arrow keys and jumps
            instantly under the pointer. */}
        <span
          aria-hidden="true"
          data-glide={glide ? "" : undefined}
          className={cn(
            "bg-interactive-hover pointer-events-none absolute inset-x-0 top-3 -z-10 h-12 rounded-[10px]",
            "data-glide:transition-transform data-glide:duration-120 data-glide:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
            activeIndex < 0 && "opacity-0"
          )}
          style={{
            transform: `translateY(${Math.max(activeIndex, 0) * ROW_HEIGHT}px)`,
          }}
        />
        {children}
      </div>
    </div>
  )
}

function SuggestionRow({
  id,
  active,
  selected,
  glyph,
  onPick,
  onHover,
  children,
}: {
  id: string
  active: boolean
  selected: boolean
  glyph?: ReactNode
  onPick: () => void
  onHover: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-active={active ? "" : undefined}
      // Keep focus (and the caret) in the composer.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      onPointerMove={active ? undefined : onHover}
      className="text-muted-foreground data-active:text-foreground flex h-12 w-full min-w-0 items-center gap-[9px] rounded-[10px] ps-[13px] pe-3 text-start text-[15px] leading-6 outline-none"
    >
      {/* 32px glyph slot centers on the composer's + button, so labels
          align with the composer's text. */}
      <span
        aria-hidden="true"
        className="flex w-8 shrink-0 items-center justify-center"
      >
        {active ? (
          <Icon
            icon={RiPlayFill}
            size={16}
            glyphSize={16}
            className="text-link"
          />
        ) : (
          glyph
        )}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
}
