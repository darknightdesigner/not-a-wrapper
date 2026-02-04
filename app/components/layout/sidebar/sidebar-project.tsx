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
        className="hover:bg-accent/80 hover:text-foreground text-primary group/new-chat relative inline-flex w-full items-center rounded-md bg-transparent px-2 py-2 text-sm"
        type="button"
        onClick={() => setIsDialogOpen(true)}
      >
        <div className="flex items-center gap-2 whitespace-nowrap">
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
