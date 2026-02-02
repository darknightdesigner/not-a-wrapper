"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Alert01Icon,
  AlertCircleIcon,
  Loading01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} />,
        info: <HugeiconsIcon icon={InformationCircleIcon} size={16} />,
        warning: <HugeiconsIcon icon={Alert01Icon} size={16} />,
        error: <HugeiconsIcon icon={AlertCircleIcon} size={16} />,
        loading: <HugeiconsIcon icon={Loading01Icon} size={16} className="animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
