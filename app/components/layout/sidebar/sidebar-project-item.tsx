"use client"

import { ProjectActionsMenu } from "@/app/components/projects/project-actions-menu"
import { useRenameProject } from "@/app/components/projects/use-rename-project"
import type { Id } from "@/convex/_generated/dataModel"
import { RiFolderLine, RiFolderOpenFill } from "@remixicon/react"
import { usePathname } from "next/navigation"
import { SidebarRow } from "./sidebar-row"
import {
  SidebarPinnedIndicator,
  SidebarRowEndSlot,
} from "./sidebar-row-actions"

type Project = {
  _id: Id<"projects">
  name: string
  pinned: boolean
}

type SidebarProjectItemProps = {
  project: Project
  isPinPending?: boolean
  onTogglePinned: () => void
}

// Link-only project adapter over the Sidebar row module. Its narrow props keep
// project navigation independent from chat previews or disclosure state.
export function SidebarProjectItem({
  project,
  isPinPending,
  onTogglePinned,
}: SidebarProjectItemProps) {
  const pathname = usePathname()
  const renameProject = useRenameProject()

  const isActive = pathname.startsWith(`/p/${project._id}`)
  const displayName = project.name || "Untitled Project"

  return (
    <SidebarRow
      interaction={{ kind: "link", href: `/p/${project._id}` }}
      isActive={isActive}
      ariaLabel={`${displayName}, ${project.pinned ? "pinned project" : "project"}`}
      title={displayName}
      renameValue={project.name || ""}
      renameLabel="Project title"
      onRename={(next) => renameProject(project._id, next)}
      leadingIcon={RiFolderLine}
      activeLeadingIcon={RiFolderOpenFill}
      trailing={({ startRename }) => (
        <SidebarRowEndSlot
          key={project._id}
          status={project.pinned ? <SidebarPinnedIndicator /> : undefined}
        >
          <ProjectActionsMenu
            project={project}
            onStartEditing={startRename}
            onTogglePinned={onTogglePinned}
            isPinned={project.pinned}
            isPinPending={isPinPending}
            triggerAriaLabel={`Open project options for ${displayName}`}
          />
        </SidebarRowEndSlot>
      )}
    />
  )
}
