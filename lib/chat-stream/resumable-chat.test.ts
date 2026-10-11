import type { ChatStatus, UIMessage, UIMessageChunk } from "ai"
import { afterEach, expect, it, vi } from "vitest"
import { RETAINED_STREAM_STALL_MS } from "./protocol"
import { ResumableChat, RetainedReplay } from "./resumable-chat"

const base: UIMessage = {
  id: "assistant",
  role: "assistant",
  parts: [{ type: "text", text: "Before approval." }],
}
const chunks: UIMessageChunk[] = [
  { type: "start", messageId: "assistant" },
  { type: "text-start", id: "new-text" },
  { type: "text-delta", id: "new-text", delta: "Hello" },
]
const frame = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`)

async function consumeOnce(
  body: ReadableStream<Uint8Array>,
  publish: (message: UIMessage) => void,
  signal: AbortSignal,
  callbacks?: Parameters<RetainedReplay["consume"]>[2]
) {
  const replay = new RetainedReplay(publish, signal)
  try {
    await replay.consume(body, signal, callbacks)
  } finally {
    await replay.close()
  }
}

afterEach(() => vi.unstubAllGlobals())

it.each(["text", "reasoning"] as const)(
  "restores historical %s once without replaying it or changing live chunks",
  async (type) => {
    const history = "x".repeat(99) + "🦇" + "z".repeat(899)
    const live = " live".repeat(100)
    const updates: string[] = []
    let caughtUp = false
    const events = [
      { type: "base", highWater: "3-0" },
      { type: "chunk", id: "1-0", chunk: chunks[0] },
      {
        type: "chunk",
        id: "2-0",
        chunk: { type: `${type}-start`, id: "part" },
      },
      {
        type: "chunk",
        id: "3-0",
        chunk: { type: `${type}-delta`, id: "part", delta: history },
      },
      { type: "caught-up" },
      {
        type: "chunk",
        id: "4-0",
        chunk: { type: `${type}-delta`, id: "part", delta: live },
      },
      { type: "end" },
    ]
    await consumeOnce(
      new ReadableStream({
        start(controller) {
          events.forEach((event) => controller.enqueue(frame(event)))
          controller.close()
        },
      }),
      (message) => {
        const part = message.parts.find((part) => part.type === type)
        if (!part || !("text" in part) || !part.text) return
        expect(/[\uD800-\uDBFF]$/.test(part.text)).toBe(false)
        if (part.text.length <= history.length) {
          expect(caughtUp).toBe(false)
        }
        updates.push(part.text)
      },
      new AbortController().signal,
      {
        onCaughtUp: () => {
          caughtUp = true
        },
      }
    )
    expect(updates).toEqual([history, history + live])
  }
)

it("cancels reconstruction without exposing partial history", async () => {
  const abort = new AbortController()
  const publish = vi.fn()
  let source!: ReadableStreamDefaultController<Uint8Array>
  const consuming = consumeOnce(
    new ReadableStream({
      start(controller) {
        source = controller
        controller.enqueue(frame({ type: "base", highWater: "3-0" }))
        for (const chunk of chunks)
          controller.enqueue(frame({ type: "chunk", id: "1-0", chunk }))
      },
    }),
    publish,
    abort.signal
  )
  await vi.waitFor(() => expect(source.desiredSize).toBe(1))
  expect(publish).not.toHaveBeenCalled()
  abort.abort()
  await consuming
  expect(publish).not.toHaveBeenCalled()
})

it("restores an approval baseline and retained output together before live updates", async () => {
  // The displayed copy still belongs to the paused run: it is this run's
  // base, so its cursor names the other run's log and proves nothing here.
  const displayed: UIMessage = {
    ...base,
    metadata: { generationRunId: "paused-run", streamCursor: "0-9" },
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                frame({ type: "base", message: base, highWater: "0-3" })
              )
              chunks.forEach((chunk, i) =>
                controller.enqueue(
                  frame({ type: "chunk", id: `0-${i + 1}`, chunk })
                )
              )
              controller.enqueue(frame({ type: "caught-up" }))
              controller.enqueue(
                frame({
                  type: "chunk",
                  id: "0-4",
                  chunk: { type: "text-delta", id: "new-text", delta: " world" },
                })
              )
              controller.enqueue(frame({ type: "end" }))
              controller.close()
            },
          })
        )
    )
  )
  const chat = new ResumableChat({ messages: [displayed] })
  const updates: string[] = []
  chat["~registerMessagesCallback"](() =>
    updates.push(
      chat.messages[0].parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("")
    )
  )
  chat.syncRun(
    {
      chatId: "chat",
      runId: "run",
      assistantMessageId: "assistant",
      status: "streaming",
    },
    [displayed]
  )
  await vi.waitFor(() => expect(chat.replayRunId).toBeNull())
  expect(updates).toEqual([
    "Before approval.Hello",
    "Before approval.Hello world",
  ])
})

it("reconnects by GET without erasing visible text or dispatching another generation", async () => {
  const sendMessages = vi.fn()
  const onFinish = vi.fn()
  const fetchMock = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(frame({ type: "base", highWater: "0-3" }))
            chunks.forEach((chunk, i) =>
              controller.enqueue(
                frame({ type: "chunk", id: `0-${i + 1}`, chunk })
              )
            )
            controller.enqueue(frame({ type: "caught-up" }))
            controller.enqueue(
              frame({
                type: "chunk",
                id: "0-4",
                chunk: { type: "text-delta", id: "new-text", delta: " world" },
              })
            )
            controller.enqueue(frame({ type: "end" }))
            controller.close()
          },
        })
      )
  )
  vi.stubGlobal("fetch", fetchMock)
  // A checkpoint of entry 0-4: the replay at caught-up (0-3) is shorter.
  const message: UIMessage = {
    id: "assistant",
    role: "assistant",
    parts: [{ type: "text", text: "Hello world" }],
    metadata: { streamCursor: "0-4" },
  }
  const chat = new ResumableChat({
    messages: [message],
    transport: { sendMessages, reconnectToStream: vi.fn() },
    onFinish,
  })
  const published: string[] = []
  chat["~registerMessagesCallback"](() =>
    published.push(
      chat.messages[0].parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("")
    )
  )
  chat.syncRun(
    {
      chatId: "chat",
      runId: "run",
      assistantMessageId: "assistant",
      status: "streaming",
    },
    [message]
  )
  await vi.waitFor(() => expect(published).toEqual(["Hello world"]))
  expect(published).toEqual(["Hello world"])
  expect(sendMessages).not.toHaveBeenCalled()
  expect(onFinish).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it("replaces a silent retained connection after its cursor and falls back when stalls repeat", async () => {
  vi.useFakeTimers()
  const sources: ReadableStreamDefaultController<Uint8Array>[] = []
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(source) {
            sources.push(source)
          },
        })
      )
  )
  vi.stubGlobal("fetch", fetchMock)
  const sendMessages = vi.fn()
  const onFinish = vi.fn()
  const chat = new ResumableChat({
    transport: { sendMessages, reconnectToStream: vi.fn() },
    onFinish,
  })
  const text = () =>
    chat.messages[0]?.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("")
  const published: string[] = []
  chat["~registerMessagesCallback"](() => published.push(text() ?? ""))
  const delta = (
    source: ReadableStreamDefaultController<Uint8Array>,
    id: string,
    value: string
  ) =>
    source.enqueue(
      frame({
        type: "chunk",
        id,
        chunk: { type: "text-delta", id: "new-text", delta: value },
      })
    )
  chat.syncRun(
    {
      chatId: "chat",
      runId: "run",
      assistantMessageId: "assistant",
      status: "streaming",
    },
    []
  )
  try {
    await vi.waitFor(() => expect(sources).toHaveLength(1))
    sources[0].enqueue(frame({ type: "base", highWater: "3-0" }))
    chunks.forEach((chunk, i) =>
      sources[0].enqueue(frame({ type: "chunk", id: `${i + 1}-0`, chunk }))
    )
    sources[0].enqueue(frame({ type: "caught-up" }))
    delta(sources[0], "4-0", " world")
    await vi.waitFor(() => expect(text()).toBe("Hello world"))
    // A heartbeat keeps an idle connection; silence past the window replaces it.
    await vi.advanceTimersByTimeAsync(RETAINED_STREAM_STALL_MS - 1_000)
    sources[0].enqueue(frame({ type: "heartbeat" }))
    await vi.advanceTimersByTimeAsync(RETAINED_STREAM_STALL_MS - 1_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(sources).toHaveLength(2))
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/chat/chat/stream?heartbeat=1&runId=run&after=4-0"
    )
    published.length = 0
    sources[1].enqueue(frame({ type: "base", highWater: "4-0" }))
    sources[1].enqueue(frame({ type: "caught-up" }))
    delta(sources[1], "5-0", " again")
    await vi.waitFor(() => expect(text()).toBe("Hello world again"))
    expect(published.every((value) => value.startsWith("Hello world"))).toBe(
      true
    )
    expect(chat.status).toBe("streaming")
    // Connections that never deliver count as failures: checkpoints drive
    // the turn instead of a frozen answer polled every 10 s.
    await vi.advanceTimersByTimeAsync(RETAINED_STREAM_STALL_MS)
    expect(chat.status).toBe("ready")
    await vi.advanceTimersByTimeAsync(6 * RETAINED_STREAM_STALL_MS)
    expect(chat.replayRunId).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(text()).toBe("Hello world again")
    expect(sendMessages).not.toHaveBeenCalled()
    expect(onFinish).not.toHaveBeenCalled()
  } finally {
    chat.detachObserver()
    vi.useRealTimers()
  }
})

it("hands a checkpoint without a cursor to checkpoints at once", async () => {
  vi.useFakeTimers()
  const checkpoint: UIMessage = {
    id: "assistant",
    role: "assistant",
    parts: [{ type: "text", text: "Checkpoint copy" }],
  }
  let source!: ReadableStreamDefaultController<Uint8Array>
  const fetchMock = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            source = controller
          },
        })
      )
  )
  vi.stubGlobal("fetch", fetchMock)
  const run = {
    chatId: "chat",
    runId: "run",
    assistantMessageId: "assistant",
    status: "streaming",
  }
  const chat = new ResumableChat({ messages: [checkpoint] })
  chat.syncRun(run, [checkpoint])
  try {
    await vi.waitFor(() => expect(source).toBeDefined())
    source.enqueue(
      frame({
        type: "selection",
        runId: "run",
        assistantMessageId: "assistant",
        messages: [checkpoint],
      })
    )
    source.enqueue(frame({ type: "base", highWater: "0-3" }))
    chunks.forEach((chunk, i) =>
      source.enqueue(frame({ type: "chunk", id: `0-${i + 1}`, chunk }))
    )
    source.enqueue(frame({ type: "caught-up" }))
    // No proof the log covers the displayed copy: no 2 s wait.
    await vi.waitFor(() => expect(chat.replayRunId).toBeNull())
    expect(chat.status).toBe("ready")
    expect(chat.messages).toEqual([checkpoint])
    chat.syncRun(run, [checkpoint])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally {
    chat.detachObserver()
    vi.useRealTimers()
  }
})

it("keeps checkpoints available during a missing replay and releases a detached reader", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 503 }))
  vi.stubGlobal("fetch", fetchMock)
  const chat = new ResumableChat({ messages: [] })
  const run = {
    chatId: "chat",
    runId: "run",
    assistantMessageId: "assistant",
    status: "streaming",
  }
  chat.syncRun(run, [])
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  expect(chat.status).toBe("ready")
  chat.syncRun(run, [])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  chat.detachObserver()
  chat.syncRun(run, [])
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await chat.stop()
  expect(chat.status).toBe("ready")
})

it("recovers a failed original transport from its delivered count but respects explicit Stop", async () => {
  class ControlledChat extends ResumableChat {
    transition(status: ChatStatus) {
      this.setStatus({ status })
    }
  }
  const fetchMock = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(frame({ type: "base", highWater: "0-2" }))
            chunks.slice(0, 2).forEach((chunk, i) =>
              controller.enqueue(
                frame({ type: "chunk", id: `0-${i + 1}`, chunk })
              )
            )
            controller.enqueue(frame({ type: "caught-up" }))
            controller.enqueue(
              frame({ type: "chunk", id: "0-3", chunk: chunks[2] })
            )
            controller.enqueue(
              frame({
                type: "chunk",
                id: "0-4",
                chunk: { type: "text-delta", id: "new-text", delta: " world" },
              })
            )
            controller.enqueue(frame({ type: "end" }))
            controller.close()
          },
        })
      )
  )
  vi.stubGlobal("fetch", fetchMock)
  const run = {
    chatId: "chat",
    runId: "run",
    assistantMessageId: "assistant",
    status: "streaming",
  }
  let direct!: ReadableStreamDefaultController<UIMessageChunk>
  const chat = new ResumableChat({
    transport: {
      sendMessages: async () =>
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            direct = controller
          },
        }),
      reconnectToStream: vi.fn(),
    },
  })
  const text = () =>
    chat.messages
      .at(-1)
      ?.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("") ?? ""
  const published: string[] = []
  chat["~registerMessagesCallback"](() => published.push(text()))
  void chat.sendMessage({ text: "Hi" })
  await vi.waitFor(() => expect(direct).toBeDefined())
  chunks.forEach((chunk) => direct.enqueue(chunk))
  await vi.waitFor(() => expect(text()).toBe("Hello"))
  chat.syncRun(run, [])
  expect(fetchMock).not.toHaveBeenCalled()
  direct.error(new TypeError("network error"))
  await vi.waitFor(() => expect(chat.status).toBe("error"))
  // A continued message can still name the run it resumed: the parts are
  // this request's, so its delivered count still bounds them.
  chat.messages = chat.messages.map((message) =>
    message.role === "assistant"
      ? { ...message, metadata: { generationRunId: "paused-run" } }
      : message
  )
  published.length = 0
  chat.syncRun(run, [])
  await vi.waitFor(() => expect(text()).toBe("Hello world"))
  // Three chunks were delivered directly: replay at entry 0-2 (an empty text
  // part) never replaced them.
  expect(published.every((value) => value.startsWith("Hello"))).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(1)

  const stopped = new ControlledChat({ messages: [] })
  stopped.transition("streaming")
  stopped.syncRun(run, [])
  await stopped.stop()
  stopped.syncRun(run, [])
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it("restores the checkpoint before subscription hydration and silently catches up", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>
  const fetchMock = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            source = controller
          },
        })
      )
  )
  vi.stubGlobal("fetch", fetchMock)
  const chat = new ResumableChat({ messages: [] })
  const conversation = {
    chatId: "chat",
    isAuthenticated: true,
    isLoading: true,
  }
  chat.syncRun(null, [], conversation)
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/chat/chat/stream?heartbeat=1",
    expect.objectContaining({ cache: "no-store" })
  )
  chat.syncRun(null, [], conversation)
  source.enqueue(
    frame({
      type: "selection",
      runId: "run",
      assistantMessageId: "assistant",
      messages: [
        { id: "user", role: "user", parts: [{ type: "text", text: "Prompt" }] },
        {
          id: "assistant",
          role: "assistant",
          parts: [{ type: "text", text: "x".repeat(800) }],
          createdAt: "2026-09-05T12:00:00.000Z",
          content: "x".repeat(800),
          status: "streaming",
          // Eight 100-character deltas after start and text-start.
          metadata: { streamCursor: "0-10" },
        },
      ],
    })
  )
  source.enqueue(frame({ type: "base", highWater: "0-14" }))
  source.enqueue(frame({ type: "chunk", id: "0-1", chunk: chunks[0] }))
  source.enqueue(frame({ type: "chunk", id: "0-2", chunk: chunks[1] }))
  for (let i = 0; i < 12; i++)
    source.enqueue(
      frame({
        type: "chunk",
        id: `0-${i + 3}`,
        chunk: { type: "text-delta", id: "new-text", delta: "x".repeat(100) },
      })
    )
  const text = () =>
    chat.messages
      .at(-1)
      ?.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("") ?? ""
  await vi.waitFor(() => expect(text().length).toBeGreaterThan(0))
  expect(text()).toBe("x".repeat(800))
  expect(chat.messages.at(-1)).toMatchObject({
    createdAt: new Date("2026-09-05T12:00:00.000Z"),
    content: "x".repeat(800),
    status: "streaming",
  })
  chat.syncRun(
    {
      chatId: "chat",
      runId: "run",
      assistantMessageId: "assistant",
      status: "completed",
    },
    [],
    { ...conversation, isLoading: false }
  )
  source.enqueue(frame({ type: "caught-up" }))
  source.enqueue(frame({ type: "end" }))
  source.close()
  await vi.waitFor(() => expect(text()).toBe("x".repeat(1200)))
  await vi.waitFor(() => expect(chat.status).toBe("ready"))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(chat.messages.map((message) => message.id)).toEqual([
    "user",
    "assistant",
  ])
})

it("does not reconnect after Stop while discovery is awaiting its selection", async () => {
  const fetchMock = vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Stopped", "AbortError")),
          { once: true }
        )
      })
  )
  vi.stubGlobal("fetch", fetchMock)
  const chat = new ResumableChat({ messages: [] })
  const conversation = {
    chatId: "chat",
    isAuthenticated: true,
    isLoading: true,
  }
  const run = {
    chatId: "chat",
    runId: "run",
    assistantMessageId: "assistant",
    status: "streaming",
  }
  chat.syncRun(null, [], conversation)
  chat.syncRun(run, [], { ...conversation, isLoading: false })
  await chat.stop()
  chat.syncRun(run, [], { ...conversation, isLoading: false })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(chat.status).toBe("ready")
})

it("keeps a checkpoint painted while discovery was pending", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              source = controller
            },
          })
        )
    )
  )
  const chat = new ResumableChat({ messages: [] })
  chat.syncRun(null, [], {
    chatId: "chat",
    isAuthenticated: true,
    isLoading: true,
  })
  await vi.waitFor(() => expect(source).toBeDefined())
  const checkpoint: UIMessage = {
    id: "assistant",
    role: "assistant",
    parts: [{ type: "text", text: "Hello" }],
    metadata: { streamCursor: "0-3" },
  }
  chat.messages = [checkpoint]
  const published: string[] = []
  chat["~registerMessagesCallback"](() =>
    published.push(
      chat.messages
        .flatMap((message) =>
          message.parts.flatMap((part) =>
            part.type === "text" ? [part.text] : []
          )
        )
        .join("")
    )
  )
  source.enqueue(
    frame({
      type: "selection",
      runId: "run",
      assistantMessageId: "assistant",
      messages: [checkpoint],
    })
  )
  source.enqueue(frame({ type: "base", highWater: "0-3" }))
  chunks.forEach((chunk, i) =>
    source.enqueue(frame({ type: "chunk", id: `0-${i + 1}`, chunk }))
  )
  source.enqueue(frame({ type: "caught-up" }))
  source.enqueue(
    frame({
      type: "chunk",
      id: "0-4",
      chunk: { type: "text-delta", id: "new-text", delta: " world" },
    })
  )
  source.enqueue(frame({ type: "end" }))
  source.close()
  await vi.waitFor(() => expect(published.at(-1)).toBe("Hello world"))
  expect(published.every((text) => text.startsWith("Hello"))).toBe(true)
  expect(chat.replayingMessageId).toBeNull()
})

it.each([true, false])(
  "a generation error retries only if its transport is incomplete (end=%s)",
  async (ended) => {
    const events = [
      { type: "base", highWater: "4-0" },
      ...chunks.map((chunk, index) => ({
        type: "chunk",
        id: `${index + 1}-0`,
        chunk,
      })),
      {
        type: "chunk",
        id: "4-0",
        chunk: { type: "error", errorText: "Model failed" },
      },
      { type: "caught-up" },
      ...(ended ? [{ type: "end" }] : []),
    ]
    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const event of events) controller.enqueue(frame(event))
              controller.close()
            },
          })
        )
    )
    vi.stubGlobal("fetch", fetchMock)
    const chat = new ResumableChat({ messages: [] })
    chat.syncRun(
      {
        chatId: "chat",
        runId: "run",
        assistantMessageId: "assistant",
        status: "streaming",
      },
      []
    )
    if (ended) {
      await vi.waitFor(() => expect(chat.replayRunId).toBeNull())
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } else {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), {
        timeout: 1500,
      })
      chat.detachObserver()
    }
    expect(chat.messages[0].parts).toEqual([
      { type: "text", text: "Hello", state: "streaming" },
    ])
  }
)

it("accepts mutable live data after reaching the checkpoint", async () => {
  const base: UIMessage = {
    id: "assistant",
    role: "assistant",
    parts: [
      { type: "data-progress", id: "progress", data: { phase: "queued" } },
    ],
  }
  // The checkpoint is the log's base.
  const message: UIMessage = { ...base, metadata: { streamCursor: "0-0" } }
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                frame({ type: "base", highWater: "0-0", message: base })
              )
              controller.enqueue(frame({ type: "caught-up" }))
              controller.enqueue(
                frame({
                  type: "chunk",
                  id: "0-1",
                  chunk: {
                    type: "data-progress",
                    id: "progress",
                    data: { phase: "running" },
                  },
                })
              )
              controller.enqueue(frame({ type: "end" }))
              controller.close()
            },
          })
        )
    )
  )
  const chat = new ResumableChat({ messages: [message] })
  chat.syncRun(
    {
      chatId: "chat",
      runId: "run",
      assistantMessageId: "assistant",
      status: "streaming",
    },
    [message]
  )
  await vi.waitFor(() => expect(chat.replayRunId).toBeNull())
  expect(chat.messages[0].parts).toEqual([
    { type: "data-progress", id: "progress", data: { phase: "running" } },
  ])
})

it.each([false, true])(
  "defers retained reads during local submission (selected run=%s)",
  (selected) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const chat = new ResumableChat({ messages: [] })
    const run = selected
      ? {
          chatId: "chat",
          runId: "run",
          assistantMessageId: "assistant",
          status: "streaming",
        }
      : null
    const conversation = {
      chatId: "chat",
      isAuthenticated: true,
      isLoading: true,
      isSubmitting: true,
    }
    chat.syncRun(run, [], conversation)
    expect(fetchMock).not.toHaveBeenCalled()
    chat.syncRun(run, [], { ...conversation, isSubmitting: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    chat.detachObserver()
  }
)

it.each([false, true])(
  "waits for the entry a checkpoint names, whatever its shape, then continues live (multiple steps=%s)",
  async (multipleSteps) => {
    // The checkpoint aggregates reasoning/text and leads the log by one
    // entry; the SDK retains step order. Only the cursor decides adoption.
    const checkpoint: UIMessage = {
      id: "assistant",
      role: "assistant",
      parts: [
        ...(multipleSteps
          ? [{ type: "reasoning" as const, text: "Think again" }]
          : []),
        { type: "text", text: "Hello world!" },
      ],
    }
    const history: UIMessageChunk[] = [
      { type: "start", messageId: "assistant" },
      { type: "start-step" },
      ...(multipleSteps
        ? [
            { type: "reasoning-start" as const, id: "reason-1" },
            {
              type: "reasoning-delta" as const,
              id: "reason-1",
              delta: "Think ",
            },
            { type: "reasoning-end" as const, id: "reason-1" },
          ]
        : []),
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Hello " },
      ...(multipleSteps
        ? [
            { type: "text-end" as const, id: "text-1" },
            { type: "finish-step" as const },
            { type: "start-step" as const },
            { type: "reasoning-start" as const, id: "reason-2" },
            {
              type: "reasoning-delta" as const,
              id: "reason-2",
              delta: "again",
            },
            { type: "reasoning-end" as const, id: "reason-2" },
            { type: "text-start" as const, id: "text-2" },
          ]
        : []),
      {
        type: "text-delta",
        id: multipleSteps ? "text-2" : "text-1",
        delta: "world",
      },
    ]
    let source!: ReadableStreamDefaultController<Uint8Array>
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                source = controller
              },
            })
          )
      )
    )
    checkpoint.metadata = { streamCursor: `0-${history.length + 1}` }
    const chat = new ResumableChat({ messages: [checkpoint] })
    const visibleText = () =>
      chat.messages[0].parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("")
    const updates: string[] = []
    chat["~registerMessagesCallback"](() => updates.push(visibleText()))
    chat.syncRun(
      {
        chatId: "chat",
        runId: "run",
        assistantMessageId: "assistant",
        status: "streaming",
      },
      [checkpoint]
    )
    try {
      await vi.waitFor(() => expect(source).toBeDefined())
      source.enqueue(
        frame({
          type: "selection",
          runId: "run",
          assistantMessageId: "assistant",
          messages: [checkpoint],
        })
      )
      source.enqueue(frame({ type: "base", highWater: `0-${history.length}` }))
      history.forEach((chunk, index) =>
        source.enqueue(frame({ type: "chunk", id: `0-${index + 1}`, chunk }))
      )
      source.enqueue(frame({ type: "caught-up" }))
      await vi.waitFor(() => {
        expect(source.desiredSize).toBe(1)
        expect(chat.replayingMessageId).toBeNull()
      })
      // Nothing publishes at caught-up: the replay is one entry behind.
      expect(chat.messages[0].parts).toEqual(checkpoint.parts)
      source.enqueue(
        frame({
          type: "chunk",
          id: `0-${history.length + 1}`,
          chunk: {
            type: "text-delta",
            id: multipleSteps ? "text-2" : "text-1",
            delta: "! Still streaming.",
          },
        })
      )
      await vi.waitFor(() =>
        expect(visibleText()).toBe("Hello world! Still streaming.")
      )
      expect(chat.status).toBe("streaming")
      expect(
        chat.messages[0].parts.some((part) => part.type === "step-start")
      ).toBe(true)
      expect(updates.every((text) => text.startsWith("Hello world!"))).toBe(
        true
      )
    } finally {
      chat.detachObserver()
    }
  }
)
