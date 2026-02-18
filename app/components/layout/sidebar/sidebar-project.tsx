"use client"

import { api } from "@/convex/_generated/api"
import { HugeiconsIcon } from "@hugeicons/react"
import { FolderAddIcon } from "@hugeicons-pro/core-stroke-rounded"
import { useQuery } from "convex/react"
import { useState } from "react"
import { DialogCreateProject } from "./dialog-create-project"
import { SidebarProjectItem } from "./sidebar-project-item"

export function SidebarProject() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const projects = useQuery(api.projects.getForCurrentUser)
  const isLoading = projects === undefined

  return (
    <div className="mb-5">
      <button
        className="hover:bg-accent/80 hover:text-foreground text-primary group/new-chat relative inline-flex h-9 w-[calc(100%-var(--spacing)*3)] items-center rounded-md bg-transparent px-2.5 py-1.5 text-sm mx-1.5"
        type="button"
        onClick={() => setIsDialogOpen(true)}
      >
        <div className="flex items-center gap-(--sidebar-item-gap) whitespace-nowrap">
          <HugeiconsIcon icon={FolderAddIcon} size={20} />
          <span>New project</span>
        </div>
      </button>

      {isLoading ? null : (
        <div className="space-y-1">
          {projects?.map((project) => (
            <SidebarProjectItem key={project._id} project={project} />
          ))}
        </div>
      )}

      <DialogCreateProject isOpen={isDialogOpen} setIsOpen={setIsDialogOpen} />
    </div>
  )
}
