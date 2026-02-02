"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Alert01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { toast as sonnerToast } from "sonner"
import { Button } from "./button"

type ToastProps = {
  id: string | number
  title: string
  description?: string
  button?: {
    label: string
    onClick: () => void
  }
  status?: "error" | "info" | "success" | "warning"
}

function Toast({ title, description, button, id, status }: ToastProps) {
  return (
    <div className="border-input bg-popover flex items-center overflow-hidden rounded-xl border p-4 shadow-xs backdrop-blur-xl">
      <div className="flex flex-1 items-center">
        {status === "error" ? (
          <HugeiconsIcon icon={Alert01Icon} size={16} className="text-primary mr-3" />
        ) : null}
        {status === "info" ? (
          <HugeiconsIcon icon={InformationCircleIcon} size={16} className="text-primary mr-3" />
        ) : null}
        {status === "success" ? (
          <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} className="text-primary mr-3" />
        ) : null}
        <div className="w-full">
          <p className="text-foreground text-sm font-medium">{title}</p>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>
      </div>
      {button ? (
        <div className="shrink-0">
          <Button
            size="sm"
            onClick={() => {
              button?.onClick()
              sonnerToast.dismiss(id)
            }}
            type="button"
            variant="secondary"
          >
            {button?.label}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function toast(toast: Omit<ToastProps, "id">) {
  return sonnerToast.custom(
    (id) => (
      <Toast
        id={id}
        title={toast.title}
        description={toast?.description}
        button={toast?.button}
        status={toast?.status}
      />
    ),
    {
      position: "top-center",
    }
  )
}

export { toast }
