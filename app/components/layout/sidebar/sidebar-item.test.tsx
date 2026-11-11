/** @vitest-environment jsdom */
import type { Chat } from "@/lib/chat-store/types"
import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { SidebarItem } from "./sidebar-item"
import type { SidebarRow } from "./sidebar-row"

const mocks = vi.hoisted(() => ({
  rowRender: vi.fn(),
  updateTitle: vi.fn(),
}))
vi.mock("@/lib/chat-store/chats/provider", () => ({
  useChatActions: () => mocks,
}))
vi.mock("@/lib/chat-store/messages/warm", () => ({
  useWarmSelectedConversation: () => vi.fn(),
}))
vi.mock("@/lib/chat-store/status/sidebar-chat-status", () => ({
  useSidebarChatStatus: (chat: Chat) => chat.live_run_status ?? "idle",
}))
vi.mock("@/app/components/layout/chat-actions-menu", () => ({
  ChatActionsMenu: () => null,
}))
vi.mock("./sidebar-item-status", () => ({
  SIDEBAR_CHAT_STATUS_LABEL: { streaming: "Generating response" },
  SidebarChatStatusIndicator: ({ status }: { status: string }) => (
    <span data-status={status} />
  ),
}))
vi.mock("./sidebar-row-actions", () => ({
  SidebarRowEndSlot: ({
    status,
    children,
  }: {
    status?: React.ReactNode
    children: React.ReactNode
  }) => (
    <>
      {status}
      {children}
    </>
  ),
  SidebarPinnedIndicator: () => <span data-pinned-mark />,
}))
vi.mock("./sidebar-row", () => ({
  SidebarRow: ({
    title,
    ariaLabel,
    isActive,
    onRename,
    trailing,
  }: ComponentProps<typeof SidebarRow>) => {
    mocks.rowRender()
    return (
      <div
        data-row
        data-title={title}
        aria-label={ariaLabel}
        data-active={isActive}
      >
        <button data-rename onClick={() => void onRename("Saved title")}>
          Rename
        </button>
        {trailing?.({ startRename: () => {} })}
      </div>
    )
  },
}))

it("skips equal inactive rows while preserving selection, chat fields, and the resting pin mark", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  const root = createRoot(container)
  let chat: Chat = {
    id: "row-chat",
    user_id: "owner",
    title: "Original",
    model: null,
    project_id: null,
    public: false,
    pinned: false,
    pinned_at: null,
    created_at: null,
    updated_at: null,
  }
  const render = (currentChatId: string) =>
    act(() =>
      root.render(
        <SidebarItem chat={{ ...chat }} currentChatId={currentChatId} />
      )
    )
  const pinMark = () => container.querySelector("[data-pinned-mark]")
  try {
    render("other-chat")
    render("another-chat")
    expect(mocks.rowRender).toHaveBeenCalledTimes(1)
    render("row-chat")
    expect(mocks.rowRender).toHaveBeenCalledTimes(2)
    expect(
      container.querySelector("[data-row]")?.getAttribute("data-active")
    ).toBe("true")
    chat = {
      ...chat,
      title: "Renamed",
      pinned: true,
      live_run_status: "streaming",
    }
    render("row-chat")
    expect(mocks.rowRender).toHaveBeenCalledTimes(3)
    expect(
      container.querySelector("[data-row]")?.getAttribute("data-title")
    ).toBe("Renamed")
    // An aria-label replaces the row's text, so it restates live status.
    expect(
      container.querySelector("[data-row]")?.getAttribute("aria-label")
    ).toBe("Renamed, pinned, Generating response")
    // Live status outranks the pin mark at rest.
    expect(
      container.querySelector("[data-status]")?.getAttribute("data-status")
    ).toBe("streaming")
    expect(pinMark()).toBeNull()
    chat = { ...chat, live_run_status: undefined, last_read_at: 123 }
    render("row-chat")
    expect(mocks.rowRender).toHaveBeenCalledTimes(4)
    expect(pinMark()).not.toBeNull()
    act(() =>
      container.querySelector<HTMLButtonElement>("[data-rename]")!.click()
    )
    expect(mocks.updateTitle).toHaveBeenLastCalledWith(
      "row-chat",
      "Saved title"
    )
  } finally {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  }
})
