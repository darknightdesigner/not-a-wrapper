"use client"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_COOKIE,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "@/lib/sidebar-width"
import { cn } from "@/lib/utils"
import { RiLayoutLeft2Line, RiSideBarLine } from "@remixicon/react"
import * as React from "react"

/**
 * Sidebar state/shell layer: provider (collapse state, persistence, keyboard
 * shortcut), the desktop frame, and the toggle trigger.
 *
 * This file deliberately owns NO row/menu vocabulary. The canonical sidebar
 * rows are the components in `app/components/layout/sidebar/`
 * (`SidebarMenuItem`, `SidebarRow`, `SidebarLeadingIcon`, …), styled by the
 * `--sidebar-*` token contract in `app/globals.css`. Do not reintroduce a
 * parallel menu system here.
 *
 * Widths are owned by `app/globals.css` (`--sidebar-width`,
 * `--sidebar-rail-width`), so the single frame and its collapsed rail derive
 * from one source. A user-resized width (`lib/sidebar-width.ts`) only
 * overrides `--sidebar-width` on the frame.
 */

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_KEYBOARD_SHORTCUT = "s"
const SIDEBAR_CONTAINER_ID = "stage-slideover-sidebar"
const SIDEBAR_WIDTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const SIDEBAR_RESIZE_KEY_STEP = 16

function getSidebarStateFromCookie(): boolean | undefined {
  if (typeof document === "undefined") return undefined
  const match = document.cookie.match(
    new RegExp(`${SIDEBAR_COOKIE_NAME}=([^;]+)`)
  )
  if (match) return match[1] === "true"
  return undefined
}

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  /** User-resized expanded width in px; null keeps the CSS default. */
  width: number | null
  setWidth: (width: number | null) => void
  /** See useSidebarShortcutScope — consumers don't call this directly. */
  registerShortcutScope: () => () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  defaultWidth = null,
  open: openProp,
  onOpenChange: setOpenProp,
  children,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
  /** Server-read width cookie, so the first paint is already resized. */
  defaultWidth?: number | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)
  const [width, _setWidth] = React.useState(defaultWidth)
  const setWidth = React.useCallback((next: number | null) => {
    const value = next === null ? null : clampSidebarWidth(next)
    _setWidth(value)
    document.cookie =
      value === null
        ? `${SIDEBAR_WIDTH_COOKIE}=; path=/; max-age=0`
        : `${SIDEBAR_WIDTH_COOKIE}=${value}; path=/; max-age=${SIDEBAR_WIDTH_COOKIE_MAX_AGE}`
  }, [])

  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open

  React.useEffect(() => {
    const cookieValue = getSidebarStateFromCookie()
    if (cookieValue !== undefined && cookieValue !== _open) {
      _setOpen(cookieValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time cookie sync on mount; getSidebarStateFromCookie reads document.cookie (unavailable during SSR)
  }, [])
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // ⌘⇧S shortcut scope. The provider is mounted once at the root layout, but
  // the shortcut (and the cookie write toggling triggers) must not fire on
  // routes whose sidebar ignores collapse state (e.g. /design-system, whose
  // sidebar is `collapsible="none"` — toggling there would silently rewrite
  // the persisted state the app sidebar restores). Surfaces that respond to
  // the toggle register a scope via useSidebarShortcutScope; the listener
  // attaches only while at least one scope is mounted.
  const shortcutScopes = React.useRef(0)
  const [shortcutEnabled, setShortcutEnabled] = React.useState(false)
  const registerShortcutScope = React.useCallback(() => {
    shortcutScopes.current += 1
    setShortcutEnabled(true)
    return () => {
      shortcutScopes.current -= 1
      if (shortcutScopes.current === 0) setShortcutEnabled(false)
    }
  }, [])

  React.useEffect(() => {
    if (!shortcutEnabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.shiftKey &&
        event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [shortcutEnabled, toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      width,
      setWidth,
      registerShortcutScope,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      width,
      setWidth,
      registerShortcutScope,
    ]
  )

  // The app layout owns the shell DOM. Keeping the provider transparent lets
  // the source-shaped h-svh root remain the first layout owner.
  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  )
}

/**
 * Enables the ⌘⇧S toggle shortcut while the calling surface is mounted. The
 * app sidebar calls this; a surface whose sidebar ignores collapse state
 * (the design-system registry) doesn't, keeping the shortcut inert there.
 */
function useSidebarShortcutScope() {
  const { registerShortcutScope } = useSidebar()

  React.useEffect(() => registerShortcutScope(), [registerShortcutScope])
}

/**
 * The sidebar frame. `collapsible="icon"` renders the single in-flow desktop
 * shell that animates between `--sidebar-width` and `--sidebar-rail-width`;
 * `collapsible="none"` renders a static full-width column (used by the
 * design-system registry chrome). Mobile presentation is owned by the
 * consumer (the app renders its own Sheet drawer); this frame renders
 * `max-md:hidden` and has no mobile branch.
 */
function Sidebar({
  collapsible = "icon",
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  collapsible?: "icon" | "none"
}) {
  const { open, width } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        style={style}
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      id={SIDEBAR_CONTAINER_ID}
      className={cn(
        "border-sidebar-border bg-sidebar text-sidebar-foreground relative z-21 h-full shrink-0 overflow-hidden border-r max-md:hidden print:hidden",
        "motion-safe:transition-[width] motion-safe:duration-[450ms] motion-safe:ease-[linear(0,0.126,0.3555,0.5713,0.7361,0.8485,0.9191,0.9603,0.9828,0.9941,0.9992,1.0011,1.0015,1.0013,1.001,1.0007,1.0004,1.0002,1.0001)] data-resizing:transition-none",
        "stage-sidebar-pure-surface",
        className
      )}
      data-state={open ? "open" : "closed"}
      data-slot="sidebar"
      style={
        {
          ...style,
          ...(width === null ? {} : { "--sidebar-width": `${width}px` }),
          width: open ? "var(--sidebar-width)" : "var(--sidebar-rail-width)",
        } as React.CSSProperties
      }
      {...props}
    >
      <div
        data-sidebar="sidebar"
        data-slot="sidebar-inner"
        className="relative flex h-full flex-col overflow-hidden"
      >
        {children}
      </div>
      {open ? <SidebarResizeHandle /> : null}
    </div>
  )
}

/**
 * Drag (or arrow-key) handle on the expanded frame's edge. Dragging writes
 * `--sidebar-width` straight onto the frame and commits once on release, so a
 * drag re-renders nothing. Double-click restores the default width.
 */
function SidebarResizeHandle() {
  const { width, setWidth } = useSidebar()
  const drag = React.useRef<{
    frame: HTMLElement
    startX: number
    startWidth: number
    direction: 1 | -1
    width: number
  } | null>(null)
  const current = width ?? SIDEBAR_WIDTH_MIN

  const endDrag = () => {
    const active = drag.current
    if (!active) return
    drag.current = null
    delete active.frame.dataset.resizing
    document.documentElement.style.removeProperty("cursor")
    document.documentElement.style.removeProperty("user-select")
    // A press without movement (e.g. half of a double-click) persists nothing.
    if (active.width !== Math.round(active.startWidth)) setWidth(active.width)
  }

  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-controls={SIDEBAR_CONTAINER_ID}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      aria-valuenow={current}
      tabIndex={0}
      data-slot="sidebar-resize-handle"
      className="absolute inset-y-0 end-0 z-40 w-1.5 cursor-col-resize touch-none outline-none keyboard-focused:bg-border-strong"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const frame = event.currentTarget.parentElement
        if (!frame) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const startWidth = frame.getBoundingClientRect().width
        drag.current = {
          frame,
          startX: event.clientX,
          startWidth,
          direction:
            getComputedStyle(frame).direction === "rtl" ? -1 : 1,
          width: startWidth,
        }
        frame.dataset.resizing = ""
        document.documentElement.style.cursor = "col-resize"
        document.documentElement.style.userSelect = "none"
      }}
      onPointerMove={(event) => {
        const active = drag.current
        if (!active) return
        active.width = clampSidebarWidth(
          active.startWidth +
            (event.clientX - active.startX) * active.direction
        )
        active.frame.style.setProperty("--sidebar-width", `${active.width}px`)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => setWidth(null)}
      onKeyDown={(event) => {
        const step =
          event.key === "ArrowRight"
            ? SIDEBAR_RESIZE_KEY_STEP
            : event.key === "ArrowLeft"
              ? -SIDEBAR_RESIZE_KEY_STEP
              : null
        if (event.key === "Home") setWidth(SIDEBAR_WIDTH_MIN)
        else if (event.key === "End") setWidth(SIDEBAR_WIDTH_MAX)
        else if (step !== null) setWidth(current + step)
        else return
        event.preventDefault()
      }}
    />
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, state, open } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      shape="square"
      aria-expanded={open}
      aria-controls={SIDEBAR_CONTAINER_ID}
      className={cn(
        // Muted at rest; the ghost variant owns hover, press, and focus.
        "text-[var(--text-tertiary)]",
        state === "collapsed"
          ? "cursor-e-resize rtl:cursor-w-resize"
          : "cursor-w-resize rtl:cursor-e-resize",
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <Icon
        icon={open ? RiLayoutLeft2Line : RiSideBarLine}
        slotSize={20}
        glyphInset={0}
      />
      <span className="sr-only">{open ? "Close sidebar" : "Open sidebar"}</span>
    </Button>
  )
}

export {
  Sidebar,
  SIDEBAR_CONTAINER_ID,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  useSidebarShortcutScope,
}
