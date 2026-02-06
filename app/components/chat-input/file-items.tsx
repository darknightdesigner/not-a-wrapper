"use client"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons-pro/core-stroke-rounded"
import Image from "next/image"
import { useEffect, useState } from "react"

type FileItemProps = {
  file: File
  onRemove: (file: File) => void
}

export function FileItem({ file, onRemove }: FileItemProps) {
  const isImage = file.type.includes("image")
  const [isRemoving, setIsRemoving] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) {
      setImageUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setImageUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file, isImage])

  const handleRemove = () => {
    setIsRemoving(true)
    onRemove(file)
  }

  return (
    <div className="relative mr-2 mb-0 flex items-center">
      <HoverCard
        open={isImage ? isOpen : false}
        onOpenChange={setIsOpen}
      >
        <HoverCardTrigger className="w-full">
          <div className="bg-background hover:bg-accent border-input flex w-full items-center gap-3 rounded-2xl border p-2 pr-3 transition-colors">
            <div className="bg-accent-foreground flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md">
              {isImage && imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={file.name}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center text-xs text-gray-400">
                  {file.name.split(".").pop()?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-xs font-medium">{file.name}</span>
              <span className="text-xs text-gray-500">
                {(file.size / 1024).toFixed(2)}kB
              </span>
            </div>
          </div>
        </HoverCardTrigger>
        {isImage && imageUrl ? (
          <HoverCardContent side="top">
            <Image
              src={imageUrl}
              alt={file.name}
              width={200}
              height={200}
              className="h-full w-full object-cover"
            />
          </HoverCardContent>
        ) : null}
      </HoverCard>
      {!isRemoving ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleRemove}
              className="border-background absolute top-1 right-1 z-10 inline-flex size-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] bg-black text-white shadow-none transition-colors"
              aria-label="Remove file"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" hideArrow>Remove file</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
