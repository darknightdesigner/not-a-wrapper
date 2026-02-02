/**
 * @component CodeBlock
 * @source prompt-kit
 * @upstream https://prompt-kit.com/docs/code-block
 * @customized true
 * @customizations
 *   - Uses `useTheme()` hook for automatic dark/light mode switching
 *   - Upstream requires manual `theme` prop; Not A Wrapper auto-detects from app theme
 *   - Adds `[&>pre]:!bg-background` for consistent backgrounds across themes
 *   - SSR fallback renders plain code block before hydration
 * @upgradeNotes
 *   - Check if upstream still uses static theme prop vs auto-detection
 *   - Preserve useTheme() integration and SSR fallback pattern
 *   - Verify background styling classes are maintained
 */
"use client"

import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import React, { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
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
} & React.HTMLProps<HTMLDivElement>

function CodeBlockCode({
  code,
  language = "tsx",
  className,
  ...props
}: CodeBlockCodeProps) {
  const { resolvedTheme: appTheme } = useTheme()
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    async function highlight() {
      // Guard against undefined/null code
      if (!code) {
        setHighlightedHtml(null)
        return
      }
      const html = await codeToHtml(code, {
        lang: language,
        theme: appTheme === "dark" ? "github-dark" : "github-light",
      })
      setHighlightedHtml(html)
    }
    highlight()
  }, [code, language, appTheme])

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4 [&>pre]:!bg-background",
    className
  )

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
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
