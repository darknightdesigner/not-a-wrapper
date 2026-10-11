import { subscribeToConnectionWake } from "@/lib/browser/connection-wake"
import {
  getStreamCursor,
  isRecord,
  mergeStreamMetadata,
} from "@/lib/chat-messages/metadata"
import { Chat } from "@ai-sdk/react"
import {
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

// A replay still behind the displayed checkpoint after this long means the
// log is lagging (slow Redis appends): Convex checkpoints drive the turn.
const CHECKPOINT_HANDOFF_MS = 2_000
// A wake replaces only a connection that has missed two heartbeats.
const WAKE_REPLACE_QUIET_MS = 2 * RETAINED_STREAM_HEARTBEAT_MS
// Reducer-only metadata: `through` is a lower bound of the entries a yield
// has applied; `id` tells the reducer which probe it has reached.
const REPLAY_PROBE = "replayProbe"

function readProbe(metadata: unknown) {
  const probe = isRecord(metadata) ? metadata[REPLAY_PROBE] : undefined
  return isRecord(probe) &&
    typeof probe.id === "number" &&
    typeof probe.through === "string"
    ? { id: probe.id, through: probe.through }
    : undefined
}

/** A replay reducer's input and its completion (never rejects). */
type Reduction = {
  input: WritableStreamDefaultWriter<UIMessageChunk>
  done: Promise<void>
}

/** What this tab's last direct request displayed when it ended. */
type DirectHandoff = {
  runId: string | null
  parts: UIMessage["parts"] | undefined
  delivered: number
}

/**
 * The retained entry the displayed copy is contained in (ADR-0039 cursor), or
 * null when its position is unknown. Replay may replace it only once it has
 * applied at least this far in the same run's log.
 */
function displayedCursor(
  previous: UIMessage | undefined,
  runId: string | undefined,
  direct: DirectHandoff | null
): string | null {
  if (!previous || previous.parts.every((part) => part.type === "step-start"))
    return "0-0"
  const generationRunId = isRecord(previous.metadata)
    ? previous.metadata.generationRunId
    : undefined
  // An approval continuation reuses the message: the earlier run's content
  // is this run's retained base.
  if (typeof generationRunId === "string" && generationRunId !== runId)
    return "0-0"
  const cursor = getStreamCursor(previous.metadata)
  if (cursor !== undefined) return cursor
  // This tab's own direct request: its n-th chunk is entry 0-n.
  if (direct && direct.runId === runId && direct.parts === previous.parts)
    return `0-${direct.delivered}`
  return null
}

/**
 * One observer's ordered SDK reducer. Each connection rebuilds silently until
 * its caught-up fence, then publishes live chunks. A reconnect resumes after
 * `cursor`, so the log is never applied twice and the reducer never restarts.
 */
export class RetainedReplay {
  cursor: string | null = null
  private reduction: Reduction | undefined
  private restored: UIMessage | undefined
  private live = false
  private probed: string | null = null
  private probes = 0
  private readonly probeWaiters = new Map<number, () => void>()

  constructor(
    /**
     * Receives each live yield with the entry it is contained in
     * (`metadata.streamCursor`, an upper bound) and `replayedThrough`, a lower
     * bound of what it has applied.
     */
    private readonly publish: (
      message: UIMessage,
      replayedThrough: string
    ) => void,
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
      probing,
    }: {
      onActivity?: () => void
      onSelection?: (selection: Selection) => void
      onCaughtUp?: () => void
      /** While true, each network read probes how far the reducer has applied. */
      probing?: () => boolean
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
            if (!this.reduction) throw new Error("Missing stream base")
            if (
              resumedAfter !== null &&
              compareRetainedCursors(frame.id, resumedAfter) <= 0
            )
              continue
            // Convex owns generation errors; only transport/reducer failures retry.
            if (frame.chunk.type !== "error")
              await this.reduction.input.write(frame.chunk)
            this.cursor = frame.id
          } else if (frame.type === "caught-up") {
            if (!this.reduction) throw new Error("Missing stream base")
            // `restored` can lag the writes; a probe makes it exact before the
            // reconstruction it ends is published.
            if (this.cursor !== null) await this.probe(this.reduction).reached
            if (this.restored && !this.signal.aborted) this.emit(this.restored)
            this.live = true
            onCaughtUp?.()
          } else if (frame.type === "end") {
            ended = true
          } else if (frame.type === "unavailable") {
            throw new Error("Stream replay unavailable")
          }
          // Heartbeats only prove liveness, through onActivity above.
        }
        if (
          this.reduction &&
          this.live &&
          probing?.() &&
          this.cursor !== this.probed
        )
          await this.probe(this.reduction).written
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
    await this.reduction?.input.close().catch(() => {})
    await this.reduction?.done
  }

  private start(message: UIMessage | undefined) {
    // Every connection resends the immutable base; the first one seeds it.
    if (this.reduction) return
    this.restored = message
    const pipe = new TransformStream<UIMessageChunk, UIMessageChunk>()
    const reducer = (async () => {
      for await (const next of readUIMessageStream({
        message,
        stream: pipe.readable,
        terminateOnError: true,
      })) {
        if (this.signal.aborted) break
        this.restored = next
        if (this.live) this.emit(next)
        const reached = readProbe(next.metadata)?.id ?? 0
        for (const [id, resolve] of this.probeWaiters) {
          if (id > reached) continue
          this.probeWaiters.delete(id)
          resolve()
        }
      }
    })()
    // Attach rejection immediately, including while the reader is waiting.
    this.reduction = {
      input: pipe.writable.getWriter(),
      done: reducer.catch(() => {}),
    }
  }

  /**
   * The SDK merges metadata and yields after every non-null
   * `message-metadata` chunk, so each later yield carries a lower bound of
   * the entries it has applied.
   */
  private probe({ input, done }: Reduction) {
    const id = ++this.probes
    this.probed = this.cursor
    // An ended reducer reaches no probe; `done` releases the wait.
    const reached = Promise.race([
      new Promise<void>((resolve) => this.probeWaiters.set(id, resolve)),
      done,
    ])
    const written = input.write({
      type: "message-metadata",
      messageMetadata: { [REPLAY_PROBE]: { id, through: this.cursor ?? "0-0" } },
    })
    return { written, reached: written.then(() => reached) }
  }

  private emit(next: UIMessage) {
    const { [REPLAY_PROBE]: _probe, ...metadata } = isRecord(next.metadata)
      ? next.metadata
      : {}
    this.publish(
      { ...next, metadata: { ...metadata, streamCursor: this.cursor ?? "0-0" } },
      readProbe(next.metadata)?.through ?? "0-0"
    )
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
  private lastDirect: DirectHandoff | null = null
  // The latest direct request: chunk arrival is its only liveness signal, and
  // `end` closes its stream as if the response ended there. Its n-th chunk is
  // retained entry 0-n, so `delivered` bounds what it displayed.
  private readonly direct: {
    lastChunkAt: number
    delivered: number
    active: boolean
    end: () => void
  }

  constructor({ transport, ...options }: ChatInit<UIMessage>) {
    const direct = { lastChunkAt: 0, delivered: 0, active: false, end: () => {} }
    super({
      ...options,
      transport: transport && {
        async sendMessages(request) {
          const stream = await transport.sendMessages(request)
          direct.lastChunkAt = Date.now()
          direct.delivered = 0
          direct.active = true
          return stream.pipeThrough(
            new TransformStream<UIMessageChunk, UIMessageChunk>({
              start(controller) {
                direct.end = () => controller.terminate()
              },
              transform(chunk, controller) {
                direct.lastChunkAt = Date.now()
                direct.delivered += 1
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
    // The direct request ended: keep what it displayed for the replay gate.
    // The SDK applies every delivered chunk before it settles the status.
    if (
      this.direct.active &&
      (update.status === "ready" || update.status === "error")
    ) {
      this.direct.active = false
      this.lastDirect = {
        runId: this.nativeRunId,
        parts: this.lastMessage?.parts,
        delivered: this.direct.delivered,
      }
    }
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
    // Per connection: replay replaces the displayed copy only once it has
    // applied the entry that copy is contained in.
    let gateOpen = false
    let handoff: ReturnType<typeof setTimeout> | undefined
    this.nativeRunId = null
    const replay = new RetainedReplay((message, replayedThrough) => {
      if (signal.aborted || message.id !== run.assistantMessageId) return
      const index = this.messages.findIndex((item) => item.id === message.id)
      const previous = this.messages[index]
      if (!gateOpen) {
        const proof = displayedCursor(previous, run.runId, this.lastDirect)
        // No proof the log covers the displayed copy: checkpoints drive.
        if (proof === null) {
          if (this.observer === controller) this.disconnectObserver()
          return
        }
        if (compareRetainedCursors(replayedThrough, proof) < 0) {
          // Streaming status pauses checkpoint projection, so a log that
          // stays behind the checkpoint hands the turn back to checkpoints.
          handoff ??= setTimeout(() => {
            if (this.observer === controller) this.disconnectObserver()
          }, CHECKPOINT_HANDOFF_MS)
          return
        }
        // Its ordered SDK updates now own mutable tool/data parts until the
        // next reconnect.
        gateOpen = true
        clearTimeout(handoff)
        handoff = undefined
      }
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
          // Projection may install a newer checkpoint between connections.
          gateOpen = false
          await replay.consume(response.body, connection.signal, {
            onActivity: watchdog.touch,
            probing: () => !gateOpen,
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
