/**
 * Based on prompt-kit: https://prompt-kit.com/docs/code-block
 * Local contracts: theme-driven highlighting, app-surface backgrounds, and a
 * plain SSR fallback before the highlighter is ready.
 */
"use client"

import { readCachedHighlight } from "@/lib/markdown/highlight-cache"
import {
  highlightCode,
  type ShikiClientTheme,
} from "@/lib/markdown/shiki-client"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import React, { useEffect, useState, useSyncExternalStore } from "react"

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  // Source-fidelity box: 24px radius and asymmetric flow margins. The derived
  // 3xl token is 22px, so the literal radius is intentional.
  return (
    <div
      className={cn(
        "not-prose relative mt-4 mb-1 flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-[24px]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  className?: string
  /**
   * True only for the terminal code block of a live message, as classified in
   * `components/ui/markdown.tsx`. Growing blocks render changed code as
   * escaped plain text immediately. Highlight only when the block becomes
   * non-terminal or the message settles.
   */
  growing?: boolean
} & React.HTMLProps<HTMLDivElement>

type HighlightedCode = {
  code: string
  language: string
  theme: ShikiClientTheme
  html: string
}

// Snapshots for a store that never changes: React uses the server snapshot
// while hydrating and the client snapshot for every other render.
const subscribeToNothing = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

function CodeBlockCode({
  code,
  language = "tsx",
  className,
  growing = false,
  ...props
}: CodeBlockCodeProps) {
  const { resolvedTheme: appTheme } = useTheme()
  const theme: ShikiClientTheme =
    appTheme === "dark" ? "github-dark" : "github-light"
  const [highlighted, setHighlighted] = useState<HighlightedCode | null>(null)
  // The server never has cached HTML, so hydration renders the plain path
  // and only client renders read the cache.
  const canReadCache = useSyncExternalStore(
    subscribeToNothing,
    getClientSnapshot,
    getServerSnapshot
  )

  useEffect(() => {
    // Provider pauses do not make an unfinished block stable.
    if (!code || growing) return
    // Every input change and unmount aborts obsolete work waiting on shared
    // module loads or in the highlight queue; an aborted completion never
    // publishes, and render shows HTML only for the exact current tuple. A
    // cache hit resolves without running Shiki and pins the HTML in state so
    // LRU eviction cannot revert a mounted block.
    const controller = new AbortController()
    // Lazy service (ADR-0016 "Lazy Shiki"): Shiki core, themes, and the
    // grammar load on first demand; unknown/plain ids resolve to `text`. The
    // service emits the `shiki_highlight` mark for real Shiki runs only.
    highlightCode({ code, language, theme, signal: controller.signal }).then(
      (html) => {
        if (controller.signal.aborted) return
        setHighlighted({ code, language, theme, html })
      },
      () => {
        // Module or grammar loading failed: keep the React-escaped plain
        // fallback for this tuple; a later input change retries.
      }
    )
    return () => controller.abort()
  }, [code, language, theme, growing])

  // Captured code text metrics: 14px / 24px (0.875em at 1.71429), 20px inline
  // padding, 12px block padding; the container's card surface shows through.
  const classNames = cn(
    "w-full overflow-x-auto text-sm leading-6 [&>pre]:px-5 [&>pre]:py-3 [&>pre]:!bg-transparent",
    className
  )

  // Render highlighted HTML only for the exact current tuple: pinned state,
  // else a synchronous cache hit (no plain flash on remount). A code,
  // language, or theme change therefore never shows older HTML: the new
  // tuple renders cached HTML or the escaped plain fallback immediately while
  // older async work becomes obsolete.
  const html =
    growing || !code
      ? null
      : highlighted?.code === code &&
          highlighted.language === language &&
          highlighted.theme === theme
        ? highlighted.html
        : canReadCache
          ? readCachedHighlight({ code, language, theme })
          : null

  // Plain path doubles as the SSR/pre-highlight fallback: React-escaped text
  // in the same wrapper, so `<script>`-like content renders as text.
  return html !== null ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: html }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code ?? ""}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }
