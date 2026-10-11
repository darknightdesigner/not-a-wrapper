/** @vitest-environment jsdom */

import { getFunctionName, type FunctionReference } from "convex/server"
import React, { act } from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { resetCachedMessagesSnapshot } from "./api"
import { MessagesProvider, useMessages, useResetMessages } from "./provider"

const persistMocks = vi.hoisted(() => {
  const tables = {
    chats: new Map<string, unknown>(),
    messages: new Map<string, unknown>(),
    sync: new Map<string, unknown>(),
  }

  return {
    tables,
    readFromIndexedDB: vi.fn(
      async (table: keyof typeof tables, key?: string): Promise<unknown> => {
        if (key) return tables[table].get(key) ?? null
        return Array.from(tables[table].values())
      }
    ),
    writeToIndexedDB: vi.fn(
      async (
        table: keyof typeof tables,
        data: { id: string | number } | Array<{ id: string | number }>
      ) => {
        const rows = Array.isArray(data) ? data : [data]
        for (const row of rows) {
          tables[table].set(String(row.id), row)
        }
      }
    ),
  }
})

// Persistence follows Convex auth (ADR-0033): settled signed out is a guest
// reading IndexedDB; signed in, or still syncing a token, is durable.
const convexMocks = vi.hoisted(() => ({
  isAuthenticated: false,
  isAuthLoading: false,
  queryValue: undefined as unknown,
  // Per-query values by function name; falls back to `queryValue`.
  queryValues: {} as Record<string, unknown>,
  mutationFn: vi.fn(),
  useQuery: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  chatId: "local-thread" as string | null,
}))

vi.mock("../persist", () => ({
  readFromIndexedDB: persistMocks.readFromIndexedDB,
  writeToIndexedDB: persistMocks.writeToIndexedDB,
}))

vi.mock("convex/react", () => ({
  // usePerUserQuery (the Per-user subscription seam) reads useConvexAuth to gate
  // the subscription before exposing query loading/data to provider call sites.
  useConvexAuth: () => ({
    isAuthenticated: convexMocks.isAuthenticated,
    isLoading: convexMocks.isAuthLoading,
  }),
  useMutation: () => convexMocks.mutationFn,
}))
// The seam's useQuery is the convex-helpers cached variant (ADR-0031).
vi.mock("convex-helpers/react/cache", () => ({
  useQuery: (query: FunctionReference<"query">, ...args: unknown[]) => {
    convexMocks.useQuery(query, ...args)
    const name = getFunctionName(query)
    return name in convexMocks.queryValues
      ? convexMocks.queryValues[name]
      : convexMocks.queryValue
  },
}))

vi.mock("../session/provider", () => ({
  useChatSession: () => ({ chatId: sessionMocks.chatId }),
}))

vi.mock("@/components/ui/toast", () => ({
  toast: vi.fn(),
}))

function flushPromises() {
  return act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function MessagesSnapshot({
  captureRef,
}: {
  captureRef: { current: ReturnType<typeof useMessages> | null }
}) {
  const context = useMessages()
  React.useEffect(() => {
    captureRef.current = context
  }, [captureRef, context])

  return (
    <div
      data-loading={String(context.isLoading)}
      data-messages={context.messages.map((message) => message.id).join(",")}
    />
  )
}

describe("MessagesProvider local chat hydration", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeAll(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    for (const table of Object.values(persistMocks.tables)) {
      table.clear()
    }
    persistMocks.readFromIndexedDB.mockClear()
    persistMocks.writeToIndexedDB.mockClear()
    convexMocks.isAuthenticated = false
    convexMocks.isAuthLoading = false
    convexMocks.queryValue = undefined
    convexMocks.queryValues = {}
    convexMocks.mutationFn.mockReset()
    convexMocks.useQuery.mockClear()
    sessionMocks.chatId = "local-thread"
    resetCachedMessagesSnapshot()
  })

  afterEach(() => {
    const mountedRoot = root
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
  })

  function renderProvider(captureRef: {
    current: ReturnType<typeof useMessages> | null
  }) {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <MessagesProvider>
          <MessagesSnapshot captureRef={captureRef} />
        </MessagesProvider>
      )
    })
  }

  it("hydrates local messages by active local chat id without querying Convex", async () => {
    persistMocks.tables.messages.set("local-thread", {
      id: "local-thread",
      messages: [
        {
          id: "user-1",
          role: "user",
          createdAt: new Date("2026-01-01T00:00:01.000Z"),
          parts: [{ type: "text", text: "reply exactly ok" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "ok" }],
        },
      ],
    })
    const capture: { current: ReturnType<typeof useMessages> | null } = {
      current: null,
    }

    renderProvider(capture)
    expect(capture.current?.isLoading).toBe(true)
    await flushPromises()

    expect(capture.current?.isLoading).toBe(false)
    expect(capture.current?.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ])
    expect(capture.current?.messages[1]?.createdAt).toBeInstanceOf(Date)
    expect(convexMocks.useQuery).toHaveBeenCalledWith(expect.anything(), "skip")
  })

  it.each([false, true])("waits for a switched guest cache read, including empty history (%s)", async (hasHistory) => {
    const capture: { current: ReturnType<typeof useMessages> | null } = {
      current: null,
    }
    renderProvider(capture)
    await flushPromises()
    expect(capture.current?.isLoading).toBe(false)

    let resolveRead!: (value: unknown) => void
    persistMocks.readFromIndexedDB.mockImplementationOnce(
      () => new Promise((resolve) => { resolveRead = resolve })
    )
    sessionMocks.chatId = "second-chat"
    act(() => root?.render(
      <MessagesProvider><MessagesSnapshot captureRef={capture} /></MessagesProvider>
    ))
    expect(capture.current?.isLoading).toBe(true)
    expect(capture.current?.messages).toEqual([])
    await flushPromises()
    expect(capture.current?.isLoading).toBe(true)

    await act(async () => resolveRead({
      id: "second-chat",
      messages: hasHistory ? [{ id: "stored-message", role: "assistant", parts: [] }] : [],
    }))
    expect(capture.current?.isLoading).toBe(false)
    expect(capture.current?.messages.map((message) => message.id)).toEqual(
      hasHistory ? ["stored-message"] : []
    )
  })

  it("does not wait for IndexedDB on the new-chat route", () => {
    sessionMocks.chatId = null
    const capture: { current: ReturnType<typeof useMessages> | null } = {
      current: null,
    }
    renderProvider(capture)
    expect(capture.current?.isLoading).toBe(false)
    expect(persistMocks.readFromIndexedDB).not.toHaveBeenCalled()
  })

  it.each([null, "durable-chat"])("hydrates %s while a signed-in token syncs, without an unrelated local-cache commit", async (chatId) => {
    sessionMocks.chatId = chatId
    convexMocks.isAuthLoading = true
    const capture: { current: ReturnType<typeof useMessages> | null } = { current: null }
    const onRender = vi.fn()
    const tree = (
      <React.Profiler id="messages" onRender={onRender}>
        <MessagesProvider><MessagesSnapshot captureRef={capture} /></MessagesProvider>
      </React.Profiler>
    )
    container = document.createElement("div")
    container.innerHTML = renderToString(tree)
    document.body.appendChild(container)
    await act(async () => { root = hydrateRoot(container!, tree) })
    expect(onRender).toHaveBeenCalledOnce()
    expect(capture.current?.isLoading).toBe(chatId !== null)
    expect(capture.current?.messages).toEqual([])
    expect(persistMocks.readFromIndexedDB).not.toHaveBeenCalled()
  })

  it("appends the live message only after the history that stopped before it", () => {
    sessionMocks.chatId = "durable-chat"
    convexMocks.isAuthenticated = true
    const message = (id: string) => ({
      _id: id,
      role: "assistant",
      parts: [{ type: "text", text: id }],
      status: "streaming",
      createdAt: 1,
    })
    const deliver = (liveMessageId: string | null) => {
      convexMocks.queryValues = {
        "messages:getSelectedPath": {
          selectedMessages: [message("history")],
          liveMessageId,
        },
        "messages:getSelectedRunState": null,
        "messages:getLiveMessage": message("live"),
      }
    }
    const capture: { current: ReturnType<typeof useMessages> | null } = {
      current: null,
    }
    const rerender = () =>
      act(() =>
        root?.render(
          <MessagesProvider>
            <MessagesSnapshot captureRef={capture} />
          </MessagesProvider>
        )
      )
    deliver("live")
    renderProvider(capture)
    expect(capture.current?.messages.map((m) => [m.id, m.content])).toEqual([
      ["history", "history"],
      ["live", "live"],
    ])
    // History that stopped before the live message is not a whole render.
    convexMocks.queryValues["messages:getLiveMessage"] = undefined
    rerender()
    expect(capture.current?.isLoading).toBe(true)
    // A full-path read (no tail handshake) already holds every message.
    deliver(null)
    rerender()
    expect(capture.current?.messages.map((m) => m.id)).toEqual(["history"])
  })

  it("does not keep a chat loading once Convex auth settles signed out", async () => {
    sessionMocks.chatId = "server-thread"
    const capture: { current: ReturnType<typeof useMessages> | null } = {
      current: null,
    }

    renderProvider(capture)
    await flushPromises()

    expect(capture.current?.isLoading).toBe(false)
    expect(capture.current?.messages).toEqual([])
    expect(convexMocks.useQuery).toHaveBeenCalledWith(expect.anything(), "skip")
  })

  it("isolates reset consumers from message updates and resets only the current chat", async () => {
    const capture: { current: ReturnType<typeof useMessages> | null } = {
      current: null,
    }
    const commandRender = vi.fn()
    function ResetControl() {
      const reset = useResetMessages()
      commandRender()
      return <button onClick={() => void reset()}>Reset</button>
    }
    const children = (
      <>
        <MessagesSnapshot captureRef={capture} />
        <ResetControl />
      </>
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const render = () =>
      act(() => root?.render(<MessagesProvider>{children}</MessagesProvider>))
    render()
    await flushPromises()
    const initialRenders = commandRender.mock.calls.length
    act(() =>
      capture.current?.setMessages([
        { id: "first-chat-draft", role: "user", parts: [] },
      ])
    )
    expect(
      container.querySelector("[data-messages]")?.getAttribute("data-messages")
    ).toBe("first-chat-draft")
    expect(commandRender).toHaveBeenCalledTimes(initialRenders)

    sessionMocks.chatId = "second-chat"
    render()
    await flushPromises()
    const switchedRenders = commandRender.mock.calls.length
    act(() =>
      capture.current?.setMessages([
        { id: "second-chat-draft", role: "user", parts: [] },
      ])
    )
    expect(commandRender).toHaveBeenCalledTimes(switchedRenders)
    await act(async () => container?.querySelector("button")?.click())
    expect(capture.current?.messages).toEqual([])
    expect(commandRender).toHaveBeenCalledTimes(switchedRenders)

    sessionMocks.chatId = "local-thread"
    render()
    await flushPromises()
    expect(capture.current?.messages.map((message) => message.id)).toEqual([
      "first-chat-draft",
    ])
  })
})
