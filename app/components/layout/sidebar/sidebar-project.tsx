"use client"

import { DialogCreateProject } from "@/app/components/projects/dialog-create-project"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import type { Id } from "@/convex/_generated/dataModel"
import { RiFolderAddLine } from "@remixicon/react"
import { useState } from "react"
import { SidebarCollection, SidebarCollectionItem } from "./sidebar-collection"
import type { SidebarProjectModel } from "./sidebar-composition"
import { SidebarChatGroupActions } from "./sidebar-list"
import { SidebarMenuItem } from "./sidebar-menu-item"
import { SidebarProjectItem } from "./sidebar-project-item"

type SidebarProjectProps = {
  isAuthenticated: boolean
  projects: SidebarProjectModel[]
  isPinPending: (projectId: Id<"projects">) => boolean
  onTogglePinned: (project: SidebarProjectModel) => void
}

export function SidebarProject({
  isAuthenticated,
  projects,
  isPinPending,
  onTogglePinned,
}: SidebarProjectProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  if (!isAuthenticated) return null

  return (
    <>
      <CollapsibleSection
        title="Projects"
        storageKey="sidebar-section-projects"
        variant="sidebar"
        headerActions={
          <SidebarChatGroupActions onNewProject={() => setIsDialogOpen(true)} />
        }
      >
        <SidebarCollection>
          {projects.length === 0 ? (
            <SidebarCollectionItem>
              <SidebarMenuItem
                icon={RiFolderAddLine}
                label="New project"
                testId="sidebar-new-project"
                onClick={() => setIsDialogOpen(true)}
              />
            </SidebarCollectionItem>
          ) : (
            projects.map((project) => (
              <SidebarCollectionItem key={project._id}>
                <SidebarProjectItem
                  project={project}
                  isPinPending={isPinPending(project._id)}
                  onTogglePinned={() => onTogglePinned(project)}
                />
              </SidebarCollectionItem>
            ))
          )}
        </SidebarCollection>
      </CollapsibleSection>

      <DialogCreateProject isOpen={isDialogOpen} setIsOpen={setIsDialogOpen} />
    </>
  )
}
