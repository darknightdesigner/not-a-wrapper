import type { Doc } from "@/convex/_generated/dataModel"
import type { Chat } from "@/lib/chat-store/types"
import { describe, expect, it } from "vitest"
import {
  deriveSidebarComposition,
  type SidebarProjectModel,
} from "./sidebar-composition"

function chat(
  id: string,
  options: Partial<Chat> & Pick<Chat, "updated_at"> = { updated_at: null }
): Chat {
  return {
    id,
    user_id: "user",
    title: id,
    model: null,
    project_id: null,
    public: false,
    pinned: false,
    pinned_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...options,
  }
}

function project(
  id: string,
  options: { pinned?: boolean; created?: number } = {}
): SidebarProjectModel {
  return {
    _id: id,
    _creationTime: options.created ?? 1,
    userId: "user",
    name: id,
    updatedAt: options.created ?? 1,
    pinned: options.pinned ?? false,
  } as unknown as Doc<"projects">
}

describe("sidebar grouping composition", () => {
  it("puts pinned items first in their own list, newest pin first", () => {
    const result = deriveSidebarComposition({
      chats: [
        chat("recent", { updated_at: "2026-01-09T00:00:00.000Z" }),
        chat("older", { updated_at: "2026-01-03T00:00:00.000Z" }),
        chat("pinned-early", {
          pinned: true,
          pinned_at: "2026-01-05T00:00:00.000Z",
          updated_at: "2026-01-08T00:00:00.000Z",
        }),
        chat("pinned-late", {
          pinned: true,
          pinned_at: "2026-01-06T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        }),
        // Project chats belong to their project page, pinned or not.
        chat("in-project", {
          project_id: "alpha",
          pinned: true,
          pinned_at: "2026-01-07T00:00:00.000Z",
          updated_at: "2026-01-10T00:00:00.000Z",
        }),
        chat("in-project-recent", {
          project_id: "alpha",
          updated_at: "2026-01-11T00:00:00.000Z",
        }),
      ],
      projects: [
        project("alpha", { created: 1 }),
        project("pinned-project", { pinned: true, created: 2 }),
        project("newest", { created: 3 }),
      ],
    })

    expect(result.chats.map(({ id }) => id)).toEqual([
      "pinned-late",
      "pinned-early",
      "recent",
      "older",
    ])
    expect(result.projects.map(({ _id }) => _id)).toEqual([
      "pinned-project",
      "newest",
      "alpha",
    ])
  })
})
