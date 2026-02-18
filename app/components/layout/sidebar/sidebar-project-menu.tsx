"use client"

import { DialogDeleteProject } from "@/app/components/layout/sidebar/dialog-delete-project"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Id } from "@/convex/_generated/dataModel"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Delete01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { useState } from "react"

type Project = {
  _id: Id<"projects">
  name: string
}

type SidebarProjectMenuProps = {
  project: Project
  onStartEditing: () => void
  onMenuOpenChange?: (open: boolean) => void
}

export function SidebarProjectMenu({
  project,
  onStartEditing,
  onMenuOpenChange,
}: SidebarProjectMenuProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const isMobile = useBreakpoint(768)

  return (
    <>
      <DropdownMenu
        // shadcn/ui pointer-events-none issue on mobile
        modal={isMobile ? true : false}
        onOpenChange={onMenuOpenChange}
      >
        <DropdownMenuTrigger
          render={
            <button
              className="hover:bg-secondary flex size-7 items-center justify-center rounded-md p-1"
              onClick={(e) => e.stopPropagation()}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={20} className="text-primary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              onStartEditing()
            }}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={16} className="mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation()
              setIsDeleteDialogOpen(true)
            }}
          >
            <HugeiconsIcon icon={Delete01Icon} size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogDeleteProject
        isOpen={isDeleteDialogOpen}
        setIsOpen={setIsDeleteDialogOpen}
        project={project}
      />
    </>
  )
}
