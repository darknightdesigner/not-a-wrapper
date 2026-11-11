import type { Doc } from "@/convex/_generated/dataModel"
import {
  partitionSidebarChats,
  sortByRecency,
} from "@/lib/chat-store/chats/sidebar-window"
import type { Chat } from "@/lib/chat-store/types"

export type SidebarProjectModel = Doc<"projects">

/** Each list carries its own pinned items first; there is no Pinned group. */
export type SidebarComposition = {
  projects: SidebarProjectModel[]
  chats: Chat[]
}

export function deriveSidebarComposition({
  chats,
  projects,
}: {
  chats: Chat[]
  projects: SidebarProjectModel[]
}): SidebarComposition {
  // Project chats live on their project's page, not in the global Chats list.
  const globalChats = chats.filter((chat) => !chat.project_id)
  // Newest pin first, so a just-pinned chat lands at the very top.
  const { pinned, nonPinned } = partitionSidebarChats(globalChats)
  // Projects have no pin time; both groups keep newest-created first.
  const sortedProjects = [...projects].sort(
    (a, b) => b._creationTime - a._creationTime
  )

  return {
    projects: [
      ...sortedProjects.filter((project) => project.pinned),
      ...sortedProjects.filter((project) => !project.pinned),
    ],
    chats: [...pinned, ...sortByRecency(nonPinned)],
  }
}
