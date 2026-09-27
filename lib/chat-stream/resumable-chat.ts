import { subscribeToConnectionWake } from "@/lib/browser/connection-wake"
import { mergeStreamMetadata } from "@/lib/chat-messages/metadata"
import { readTextPhase } from "@/lib/chat-messages/turn-evidence"
import { Chat } from "@ai-sdk/react"
import {
  isToolUIPart,
  readUIMessageStream,
  type ChatInit,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import {
  compareRetainedCursors,
  RETAINED_STREAM_HEARTBEAT_MS,
  RETAINED_STREAM_STALL_MS,
  retainedChatStreamFrameSchema,
  type RetainedChatStreamFrame,
} from "./protocol"

type Selection = Extract<RetainedChatStreamFrame, { type: "selection" }>

// A replay the displayed checkpoint keeps rejecting gets this long to catch
// up. After that, Convex checkpoints drive the turn instead of a frozen answer.
const CHECKPOINT_HANDOFF_MS = 2_000
// A wake replaces only a connection that has missed two heartbeats.
const WAKE_REPLACE_QUIET_MS = 2 * RETAINED_STREAM_HEARTBEAT_MS

function containsValue(
  next: unknown,
  previous: unknown,
  partialInput = false
): boolean {
  if (previous === undefined || Object.is(next, previous)) return true
  if (partialInput && typeof previous === "string" && typeof next === "string")
    return next.startsWith(previous)
  if (
    !previous ||
    !next ||
    typeof previous !== "object" ||
    typeof next !== "object"
  )
    return false
  if (Array.isArray(previous) !== Array.isArray(next)) return false
  return Object.entries(previous).every(([key, value]) =>
    containsValue((next as Record<string, unknown>)[key], value, partialInput)
  )
}

const toolProgress = {
  "input-streaming": 0,
  "input-available": 1,
  "approval-requested": 2,
  "approval-responded": 3,
  "output-available": 4,
  "output-error": 4,
  "output-denied": 4,
} as const

function hasVisiblePrefix(next: UIMessage, previous: UIMessage | undefined) {
  if (!previous) return true
  const previousParts = previous.parts.filter(
    (part) => part.type !== "step-start"
  )
  const nextParts = next.parts.filter((part) => part.type !== "step-start")
  // Legacy checkpoints have only aggregated strings. SDK checkpoints retain
  // state/metadata and require ordered boundaries, including text phase.
  if (
    previousParts.length <= 2 &&
    previousParts.every(
      (part) => (part.type === "text" || part.type === "reasoning") &&
        part.state === undefined && part.providerMetadata === undefined
    ) &&
    new Set(previousParts.map((part) => part.type)).size === previousParts.length
  ) {
    return (["text", "reasoning"] as const).every((type) => {
      const before = previousParts
        .flatMap((part) => (part.type === type ? [part.text] : []))
        .join("")
      const after = nextParts
        .flatMap((part) => (part.type === type ? [part.text] : []))
        .join("")
      return after.startsWith(before)
    })
  }
  return previousParts.every((part, index) => {
    const candidate = nextParts[index]
    if (!candidate || candidate.type !== part.type) return false
    if (part.type === "text" || part.type === "reasoning") {
      if (!("text" in candidate) || !candidate.text.startsWith(part.text))
        return false
      // Phase changes move text between work and answer. Opaque metadata,
      // such as encrypted reasoning, can legitimately be replaced at the end.
      const phase = part.type === "text" ? readTextPhase(part) : undefined
      return phase === undefined || readTextPhase(candidate) === phase
    }
    if (isToolUIPart(part) && isToolUIPart(candidate)) {
      if (part.toolCallId !== candidate.toolCallId) return false
      const progress = toolProgress[candidate.state] - toolProgress[part.state]
      if (progress < 0 || (progress === 0 && candidate.state !== part.state))
        return false
      // Partial tool inputs may change shape as their JSON becomes complete.
      if (part.state === "input-streaming" && progress > 0) return true
      if (part.state === "output-available" && part.preliminary) {
        const { output: _output, preliminary: _preliminary, ...stable } = part
        return containsValue(candidate, stable)
      }
      const { state: _state, ...visible } = part
      return containsValue(candidate, visible, part.state === "input-streaming")
    }
    return containsValue(candidate, part)
  })
}

/**
 * One observer's ordered SDK reducer. Each connection rebuilds silently until
 * its caught-up fence, then publishes live chunks. A reconnect resumes after
 * `cursor`, so the log is never applied twice and the reducer never restarts.
 */
export class RetainedReplay {
  cursor: string | null = null
  private input: WritableStreamDefaultWriter<UIMessageChunk> | undefined
  private reducer: Promise<void> | undefined
  private restored: UIMessage | undefined
  private live = false

  constructor(
    private readonly publish: (message: UIMessage) => void,
    private readonly signal: AbortSignal
  ) {}

  /** Reads one connection. Throws unless it ends or the observer aborts. */
  async consume(
    body: ReadableStream<Uint8Array>,
    connection: AbortSignal,
    {
      onActivity,
      onSelection,
      onCaughtUp,
    }: {
      onActivity?: () => void
      onSelection?: (selection: Selection) => void
      onCaughtUp?: () => void
    } = {}
  ) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    const cancel = () => {
      void reader.cancel().catch(() => {})
    }
    connection.addEventListener("abort", cancel, { once: true })
    // Entries at or before the resume cursor are already reduced.
    const resumedAfter = this.cursor
    this.live = false
    let ended = false
    let pending = ""
    try {
      while (!connection.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        onActivity?.()
        pending += decoder.decode(value, { stream: true })
        let newline: number
        while ((newline = pending.indexOf("\n")) >= 0) {
          if (connection.aborted) break
          const line = pending.slice(0, newline)
          pending = pending.slice(newline + 1)
          if (!line.trim()) continue
          const frame = await retainedChatStreamFrameSchema.parseAsync(
            JSON.parse(line)
          )
          if (frame.type === "selection") {
            onSelection?.(frame)
          } else if (frame.type === "base") {
            this.start(frame.message)
          } else if (frame.type === "chunk") {
            if (!this.input) throw new Error("Missing stream base")
            if (
              resumedAfter !== null &&
              compareRetainedCursors(frame.id, resumedAfter) <= 0
            )
              continue
            // Convex owns generation errors; only transport/reducer failures retry.
            if (frame.chunk.type !== "error")
              await this.input.write(frame.chunk)
            this.cursor = frame.id
          } else if (frame.type === "caught-up") {
            if (!this.input) throw new Error("Missing stream base")
            if (this.restored && !this.signal.aborted)
              this.publish(this.restored)
            this.live = true
            onCaughtUp?.()
          } else if (frame.type === "end") {
            ended = true
          } else if (frame.type === "unavailable") {
            throw new Error("Stream replay unavailable")
          }
          // Heartbeats only prove liveness, through onActivity above.
        }
      }
      if (!ended && !this.signal.aborted)
        throw new Error("Stream connection interrupted")
    } finally {
      connection.removeEventListener("abort", cancel)
      await reader.cancel().catch(() => {})
    }
  }

  /** Lets queued chunks reach the reducer, then ends it. */
  async close() {
    await this.input?.close().catch(() => {})
    await this.reducer?.catch(() => {})
  }

  private start(message: UIMessage | undefined) {
    // Every connection resends the immutable base; the first one seeds it.
    if (this.input) return
    this.restored = message
    const pipe = new TransformStream<UIMessageChunk, UIMessageChunk>()
    this.input = pipe.writable.getWriter()
    this.reducer = (async () => {
      for await (const next of readUIMessageStream({
        message,
        stream: pipe.readable,
        terminateOnError: true,
      })) {
        if (this.signal.aborted) break
        this.restored = next
        if (this.live) this.publish(next)
      }
    })()
    // Attach rejection immediately, including while the reader is waiting.
    void this.reducer.catch(() => {})
  }
}

/** Aborts a connection that delivers nothing, heartbeats included, for too long. */
function watchConnection(connection: AbortController) {
  let lastActivity = Date.now()
  const check = () => {
    const quiet = Date.now() - lastActivity
    if (quiet >= RETAINED_STREAM_STALL_MS) connection.abort()
    else timer = setTimeout(check, RETAINED_STREAM_STALL_MS - quiet)
  }
  let timer = setTimeout(check, RETAINED_STREAM_STALL_MS)
  return {
    touch: () => {
      lastActivity = Date.now()
    },
    quietFor: () => Date.now() - lastActivity,
    stop: () => clearTimeout(timer),
  }
}

/** Receiving an existing run never invokes send, tool callbacks, or auto-approval. */
export class ResumableChat extends Chat<UIMessage> {
  private observer: AbortController | null = null
  private reconnectObserver: (() => void) | null = null
  private seenRunId: string | null = null
  private nativeRunId: string | null = null
  private discoveredChatId: string | null = null
  private historicalAssistantId: string | null = null
  private stopWakeListener: (() => void) | null = null
  // The latest direct request: chunk arrival is its only liveness signal, and
  // `end` closes its stream as if the response ended there.
  private readonly direct: { lastChunkAt: number; end: () => void }

  constructor({ transport, ...options }: ChatInit<UIMessage>) {
    const direct = { lastChunkAt: 0, end: () => {} }
    super({
      ...options,
      transport: transport && {
        async sendMessages(request) {
          const stream = await transport.sendMessages(request)
          direct.lastChunkAt = Date.now()
          return stream.pipeThrough(
            new TransformStream<UIMessageChunk, UIMessageChunk>({
              start(controller) {
                direct.end = () => controller.terminate()
              },
              transform(chunk, controller) {
                direct.lastChunkAt = Date.now()
                controller.enqueue(chunk)
              },
            })
          )
        },
        reconnectToStream: (request) => transport.reconnectToStream(request),
      },
    })
    this.direct = direct
    const sendMessage = this.sendMessage
    this.sendMessage = (...args) => {
      this.detachObserver()
      return sendMessage(...args)
    }
    const regenerate = this.regenerate
    this.regenerate = (...args) => {
      this.detachObserver()
      return regenerate(...args)
    }
    const stopRequest = this.stop
    this.stop = async () => {
      this.seenRunId = this.nativeRunId ?? this.seenRunId
      this.disconnectObserver()
      await stopRequest()
    }
  }

  protected override setStatus(update: { status: ChatStatus; error?: Error }) {
    super.setStatus(update)
    this.syncWakeListener()
  }

  get replayRunId() {
    return this.observer ? this.seenRunId : null
  }

  get replayingMessageId() {
    return this.observer ? this.historicalAssistantId : null
  }

  private disconnectObserver() {
    if (!this.observer) return
    this.observer.abort()
    this.observer = null
    this.reconnectObserver = null
    this.historicalAssistantId = null
    this.setStatus({ status: "ready" })
    this.syncWakeListener()
  }

  detachObserver() {
    if (!this.observer) return
    this.disconnectObserver()
    this.seenRunId = null
    this.discoveredChatId = null
  }

  // Wake listeners exist only while this chat holds a live connection.
  private syncWakeListener() {
    const live = this.observer !== null || this.status === "streaming"
    if (live && !this.stopWakeListener) {
      this.stopWakeListener = subscribeToConnectionWake(() => this.wake())
    } else if (!live && this.stopWakeListener) {
      this.stopWakeListener()
      this.stopWakeListener = null
    }
  }

  /** A woken page replaces a connection that may have died while it slept. */
  private wake() {
    if (this.observer) {
      this.reconnectObserver?.()
      return
    }
    // A durable run outlives its initiating request, so after a silent gap
    // that request ends and the next sync resumes the retained stream. It
    // ends as a transport handoff, not an abort: abort cleanup would remove
    // the in-flight assistant. It has no heartbeats, so a shorter gap may be
    // the model thinking.
    if (
      this.status === "streaming" &&
      this.nativeRunId !== null &&
      Date.now() - this.direct.lastChunkAt >= RETAINED_STREAM_STALL_MS
    )
      this.direct.end()
  }

  syncRun(
    run: {
      chatId: string
      runId: string
      assistantMessageId: string
      status: string
    } | null,
    initialMessages: UIMessage[],
    conversation?: {
      chatId: string | null
      isAuthenticated: boolean
      isLoading: boolean
      isSubmitting?: boolean
    }
  ) {
    const live = run && ["queued", "running", "streaming"].includes(run.status)
    if (this.observer) {
      // Let successful completion drain its bounded replay. Stop, branch
      // changes and authoritative removal still disconnect immediately.
      if (
        run &&
        (this.seenRunId === null || run.runId === this.seenRunId) &&
        (live || run.status === "completed")
      ) {
        this.seenRunId = run.runId
        return
      }
      if (!run && conversation?.isLoading) return
      this.detachObserver()
    }
    if (conversation?.isSubmitting) return
    const discover =
      !run &&
      conversation?.isAuthenticated &&
      conversation.isLoading &&
      conversation.chatId &&
      this.discoveredChatId !== conversation.chatId
    if (!live && !discover) return
    if (this.status === "submitted" || this.status === "streaming") {
      this.nativeRunId = run?.runId ?? this.nativeRunId
      return
    }
    if (run && this.seenRunId === run.runId) return
    this.seenRunId = run?.runId ?? null
    const chatId = run?.chatId ?? conversation?.chatId
    if (!chatId) return
    this.discoveredChatId = chatId
    const controller = new AbortController()
    this.observer = controller
    this.syncWakeListener()
    if (
      run &&
      !this.messages.some((message) => message.id === run.assistantMessageId)
    )
      this.messages = initialMessages
    void this.receive(
      {
        chatId,
        runId: run?.runId,
        assistantMessageId: run?.assistantMessageId,
      },
      controller
    )
  }

  private async receive(
    run: { chatId: string; runId?: string; assistantMessageId?: string },
    controller: AbortController
  ) {
    const { signal } = controller
    const onWake = (reconnect: () => void) => {
      if (this.observer === controller) this.reconnectObserver = reconnect
    }
    let failures = 0
    // Per connection: the first update must extend what is displayed.
    let adopted = false
    let handoff: ReturnType<typeof setTimeout> | undefined
    this.nativeRunId = null
    const replay = new RetainedReplay((message) => {
      if (signal.aborted || message.id !== run.assistantMessageId) return
      const index = this.messages.findIndex((item) => item.id === message.id)
      const previous = this.messages[index]
      if (!adopted && !hasVisiblePrefix(message, previous)) {
        // Streaming status pauses checkpoint projection. A replay that cannot
        // extend the displayed checkpoint hands the turn back to checkpoints.
        handoff ??= setTimeout(() => {
          if (this.observer === controller) this.disconnectObserver()
        }, CHECKPOINT_HANDOFF_MS)
        return
      }
      // Once this reader reaches the checkpoint, its ordered SDK
      // updates own mutable tool/data parts until the next reconnect.
      adopted = true
      clearTimeout(handoff)
      handoff = undefined
      failures = 0
      this.setStatus({ status: "streaming" })
      const messages = [...this.messages]
      const merged = {
        ...previous,
        ...message,
        metadata: mergeStreamMetadata(previous?.metadata, message.metadata),
      }
      if (index < 0) messages.push(merged)
      else messages[index] = merged
      this.messages = messages
    }, signal)
    try {
      while (!signal.aborted) {
        const connection = new AbortController()
        const release = () => connection.abort()
        signal.addEventListener("abort", release, { once: true })
        const watchdog = watchConnection(connection)
        let woken = false
        onWake(() => {
          if (watchdog.quietFor() < WAKE_REPLACE_QUIET_MS) return
          woken = true
          connection.abort()
        })
        try {
          const query = new URLSearchParams({ heartbeat: "1" })
          if (run.runId) query.set("runId", run.runId)
          if (replay.cursor) query.set("after", replay.cursor)
          const response = await fetch(
            `/api/chat/${encodeURIComponent(run.chatId)}/stream?${query}`,
            { signal: connection.signal, cache: "no-store" }
          )
          watchdog.touch()
          if ([204, 400, 401, 403, 404].includes(response.status)) return
          if (!response.ok || !response.body)
            throw new Error("Stream temporarily unavailable")
          adopted = false
          await replay.consume(response.body, connection.signal, {
            onActivity: watchdog.touch,
            onSelection: (selection) => {
              if (signal.aborted) return
              if (
                (run.runId && run.runId !== selection.runId) ||
                (this.seenRunId && this.seenRunId !== selection.runId)
              )
                throw new Error("Stream selection changed")
              run.runId = selection.runId
              run.assistantMessageId = selection.assistantMessageId
              this.seenRunId = selection.runId
              this.historicalAssistantId = selection.assistantMessageId
              const visible = this.messages.find(
                (message) => message.id === selection.assistantMessageId
              )
              // Subscription hydration can win the discovery request. Never
              // erase a checkpoint the new document has already displayed.
              this.setStatus({ status: "streaming" })
              if (!visible?.parts.length) {
                this.messages = selection.messages
              }
            },
            onCaughtUp: () => {
              if (signal.aborted || this.historicalAssistantId === null) return
              this.historicalAssistantId = null
              // Publish the phase transition even if no live delta follows.
              this.messages = [...this.messages]
            },
          })
          return
        } catch {
          if (signal.aborted) return
          // Checkpoints stay visible while the replay service is unavailable.
          this.setStatus({ status: "ready" })
          // A woken page replaces its possibly dead connection at once. The
          // attempt still counts, so repeated wakes cannot defeat the fallback.
          if (woken) {
            if (++failures >= 5) return
            continue
          }
          // A missing log or a route that never delivers, stalls included,
          // falls back instead of polling all turn.
          if (++failures >= 5) return
        } finally {
          watchdog.stop()
          signal.removeEventListener("abort", release)
        }
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer)
            signal.removeEventListener("abort", finish)
            resolve()
          }
          const timer = setTimeout(
            finish,
            Math.min(750 * 2 ** (failures - 1), 5000)
          )
          signal.addEventListener("abort", finish, { once: true })
          // A wake retries now instead of waiting out the backoff.
          onWake(finish)
        })
      }
    } finally {
      clearTimeout(handoff)
      await replay.close()
      if (this.observer === controller) {
        this.observer = null
        this.reconnectObserver = null
        this.historicalAssistantId = null
        this.setStatus({ status: "ready" })
        this.syncWakeListener()
      }
    }
  }
}
