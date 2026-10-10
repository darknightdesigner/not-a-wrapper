/** @vitest-environment jsdom */

import type { Doc } from "@/convex/_generated/dataModel"
import type { Chats } from "@/lib/chat-store/types"
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { AppSidebar } from "./app-sidebar"
import type { ChatOrganization } from "./chat-organization"

const state = vi.hoisted(() => ({
  organization: "one-list" as ChatOrganization,
  chats: [] as Chats[],
  persistedProjects: null as Doc<"projects">[] | null,
  liveProjects: undefined as Doc<"projects">[] | undefined,
}))

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SIDEBAR_CONTAINER_ID: "sidebar",
  useSidebar: () => ({ isMobile: false, state: "expanded" }),
  useSidebarShortcutScope: () => undefined,
}))
vi.mock("@/lib/chat-store/chats/provider", () => ({
  useChats: () => ({
    chats: state.chats,
    // The provider is not loading while it shows the persisted window.
    isLoading: false,
    isLoadingMore: false,
    loadMore: () => undefined,
    canLoadMore: false,
    persistedProjects: state.persistedProjects,
  }),
}))
vi.mock("@/lib/convex/use-per-user-query", () => ({
  usePerUserQuery: () => ({ data: state.liveProjects }),
}))
vi.mock("@/lib/chat-store/session/provider", () => ({
  useChatSession: () => ({ chatId: null, isNewChatSurface: true }),
}))
vi.mock("@/lib/user-store/provider", () => ({
  useUser: () => ({ user: { id: "user-1" } }),
}))
vi.mock("@/app/components/projects/use-project-pinning", () => ({
  useProjectPinning: () => ({
    isPinned: (project: { pinned: boolean }) => project.pinned,
    isPinPending: () => false,
    togglePinned: vi.fn(),
  }),
}))
vi.mock("./chat-organization", () => ({
  useChatOrganization: () => [state.organization, vi.fn(), true],
}))
vi.mock("../../history/history-search-provider", () => ({
  useHistorySearch: () => ({ isHistoryOpen: false, openHistory: vi.fn() }),
}))
vi.mock("../../history/history-trigger", () => ({ HistoryTrigger: () => null }))
vi.mock("../../history/use-history-view", () => ({
  useInfiniteScroll: () => undefined,
}))
vi.mock("../user-menu", () => ({ UserMenu: () => null }))
vi.mock("@/app/auth/_components/auth-modal", () => ({
  AuthModalTrigger: () => null,
}))
vi.mock("../../chat-input/popover-content-auth", () => ({
  PopoverContentAuth: () => null,
}))
vi.mock("./sidebar-list", () => ({
  // Rows render "title|project label" so the one-list project labels are
  // observable too.
  SidebarList: ({
    title,
    items,
    presentation,
  }: {
    title: string
    items: Chats[]
    presentation?: { projectNames?: ReadonlyMap<string, string> }
  }) => (
    <section aria-label={title}>
      {items.map((chat) => (
        <div key={chat.id} data-testid="chat-row">
          {`${chat.title}|${presentation?.projectNames?.get(chat.project_id ?? "") ?? ""}`}
        </div>
      ))}
    </section>
  ),
}))
vi.mock("./sidebar-project", () => ({
  SidebarProject: ({ projects }: { projects: Doc<"projects">[] }) => (
    <section aria-label="Projects">
      {projects.map((project) => (
        <div key={project._id} data-testid="project-row">
          {project.name}
        </div>
      ))}
    </section>
  ),
}))
vi.mock("./sidebar-item", () => ({ SidebarItem: () => null }))
vi.mock("./sidebar-project-item", () => ({ SidebarProjectItem: () => null }))
vi.mock("./sidebar-pagination-skeleton", () => ({
  SidebarPaginationState: () => null,
}))

function chat(id: string, projectId: string | null): Chats {
  return {
    id,
    title: id,
    project_id: projectId,
    pinned: false,
    pinned_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    user_id: "",
    model: null,
    public: false,
  }
}

function project(id: string): Doc<"projects"> {
  return {
    _id: id,
    _creationTime: 1,
    userId: "user-1",
    name: id,
    pinned: false,
    updatedAt: 1,
  } as Doc<"projects">
}

describe("AppSidebar persisted window (ADR-0048)", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeAll(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    container = null
    root = null
  })

  function render() {
    if (!container) {
      container = document.createElement("div")
      document.body.appendChild(container)
      root = createRoot(container)
    }
    act(() => root?.render(<AppSidebar />))
    const text = (testId: string) =>
      Array.from(
        container?.querySelectorAll(`[data-testid="${testId}"]`) ?? [],
        (node) => node.textContent
      )
    return { chats: text("chat-row"), projects: text("project-row") }
  }

  it.each([
    [
      "one-list",
      {
        chats: ["cached-loose|", "cached-in-project|cached-project"],
        projects: [],
      },
      { chats: ["cached-loose|", "cached-in-project|"], projects: [] },
    ],
    [
      "by-project",
      { chats: ["cached-loose|"], projects: ["cached-project"] },
      { chats: ["cached-loose|"], projects: ["live-project"] },
    ],
  ] as const)(
    "%s: paints cached rows while the live project read is pending, then swaps to live",
    (organization, pending, live) => {
      state.organization = organization
      state.chats = [
        chat("cached-loose", null),
        chat("cached-in-project", "cached-project"),
      ]
      state.persistedProjects = [project("cached-project")]
      state.liveProjects = undefined

      expect(render()).toEqual(pending)

      // Live data replaces the persisted projects wholesale.
      state.persistedProjects = null
      state.liveProjects = [project("live-project")]
      expect(render()).toEqual(live)
    }
  )

  it("holds the loading state without a persisted window", () => {
    state.organization = "by-project"
    state.chats = []
    state.persistedProjects = null
    state.liveProjects = undefined

    expect(render()).toEqual({ chats: [], projects: [] })
    expect(container?.querySelector('[aria-label="Chats"]')).toBeNull()
  })
})
