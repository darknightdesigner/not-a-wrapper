/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  createToolApprovalRequestForChat,
  markGenerationRunCompletedForChat,
  prepareGenerationForChat,
  resolveToolCallDecision,
  stopGenerationRunForChat,
  updateAssistantSnapshotForChat,
} from "./chatRuntime"
import {
  createBranchContext,
  getSiblingMessagesFromContext,
  resolveLiveTail,
} from "./domain/message_branches"
import {
  requireOwnedChat,
  requireOwnedToolApproval,
  resolveReadableChatByPublicId,
} from "./lib/auth"
import {
  getLiveMessageForViewer,
  getSelectedPathForViewer,
  listMessagesByChatOrder,
  selectBranchForChat,
} from "./messages"
import schema from "./schema"
import { modules } from "./test.setup"

// Live tail (ADR-0027): while a run streams, history stops before the live
// message and `getLiveMessage` carries it alone. Two properties: the client's
// merge always equals the whole path, and no checkpoint write lands in
// history's read set (Convex invalidates by index range), so checkpoints never
// re-run history. convex-test has no subscriptions, so the read set is
// recorded directly.

const OWNER = "workos_split_owner"
const CHAT = "chat-split"
const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>
type Ctx = Parameters<Parameters<T["run"]>[0]>[0]
type Op = [op: string, field: string, value: unknown]
type ReadSet = { ids: string[]; ranges: { table: string; ops: Op[] }[] }
type Row = { table: string; doc: Record<string, unknown> }
type Run = { runId: Id<"generationRuns">; assistantMessageId: Id<"messages"> }

/** Wraps `db` to record every `get` id and every `withIndex` range. */
function recordReads(db: Ctx["db"], reads: ReadSet): Ctx["db"] {
  const call = (fn: unknown, self: unknown, args: unknown[]) =>
    (fn as (...a: unknown[]) => unknown).apply(self, args)
  const withIndex =
    (table: string, query: object, member: unknown) =>
    (index: string, range?: (builder: unknown) => unknown) => {
      const ops: Op[] = []
      const builder: object = new Proxy(
        {},
        {
          get: (_, op) => (field: string, value: unknown) => (ops.push([String(op), field, value]), builder),
        }
      )
      range?.(builder)
      reads.ranges.push({ table, ops })
      return call(member, query, [index, range])
    }
  return new Proxy(db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop)
      if (prop === "get")
        return (...args: unknown[]) => (reads.ids.push(String(args.at(-1))), call(value, target, args))
      if (prop !== "query") return value
      return (table: string) => {
        const query = call(value, target, [table]) as object
        return new Proxy(query, {
          get: (q, p) => (p === "withIndex" ? withIndex(table, q, Reflect.get(q, p)) : Reflect.get(q, p)),
        })
      }
    },
  })
}

const compare = (op: string, x: unknown, y: unknown) =>
  op === "eq" ? x === y
  : op === "lt" ? Number(x) < Number(y)
  : op === "lte" ? Number(x) <= Number(y)
  : op === "gt" ? Number(x) > Number(y)
  : Number(x) >= Number(y)

const touches = (reads: ReadSet, { table, doc }: Row) =>
  reads.ids.includes(String(doc._id)) ||
  reads.ranges.some(
    (range) => range.table === table && range.ops.every(([op, field, value]) => compare(op, doc[field], value))
  )

/** Every document in every table, by id. */
async function snapshot(t: T) {
  const rows = await t.run(async (ctx) => {
    const out: [string, Row][] = []
    for (const table of Object.keys(schema.tables) as (keyof typeof schema.tables)[])
      for (const doc of await ctx.db.query(table).collect()) out.push([doc._id, { table, doc }])
    return out
  })
  return new Map(rows)
}

/** History, the live message, and the resume route's whole path they must merge into. */
async function views(t: T, reads?: ReadSet) {
  const owner = t.withIdentity({ subject: OWNER })
  const view = await owner.run(async (ctx) => {
    const recorded = reads ? ({ ...ctx, db: recordReads(ctx.db, reads) } as Ctx) : ctx
    const subscribed = await resolveReadableChatByPublicId(recorded, CHAT)
    const history = await getSelectedPathForViewer(recorded, {
      chat: subscribed.chat,
      viewer: subscribed.user,
      splitLiveTail: true,
    })
    const { chat, user } = await resolveReadableChatByPublicId(ctx, CHAT)
    const live = await getLiveMessageForViewer(ctx, { chat, viewer: user })
    // The client's merge (MessagesProvider).
    const appendsLive = live !== null && live._id === history.liveMessageId
    const merged = appendsLive ? [...history.selectedMessages, live] : history.selectedMessages
    return { history, live, merged, liveTail: chat?.liveTail }
  })
  const resume = await owner.query(api.messages.getResumeSelection, { chatId: CHAT })
  // A client from before the split omits the flag and keeps the whole path.
  expect(await owner.query(api.messages.getSelectedPath, { chatId: CHAT })).toEqual({
    selectedMessages: resume.selectedMessages,
    liveMessageId: null,
  })
  return { ...view, full: resume.selectedMessages }
}

async function seed(t: T) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { workosUserId: OWNER, email: `${OWNER}@example.com` })
    const chatId = await ctx.db.insert("chats", {
      publicId: CHAT, userId, public: false, pinned: false, updatedAt: 1,
    })
    return { userId, chatId }
  })
}

const text = (value: string) => [{ type: "text", text: value }]

describe("live-tail split", () => {
  it("merges to the whole path and keeps checkpoints out of history through every prepare branch", async () => {
    const t = makeT()
    const { chatId } = await seed(t)
    const owner = t.withIdentity({ subject: OWNER })
    let request = 0
    const sequences = new Map<string, number>()
    const runOwner = async (ctx: Ctx, runId: Id<"generationRuns">) => {
      const run = (await ctx.db.get(runId))!
      return { run, chat: (await ctx.db.get(run.chatId))!, user: (await ctx.db.get(run.userId!))! }
    }
    const merged = async (label: string, liveTail?: Id<"messages">) => {
      const v = await views(t)
      expect(v.merged, label).toEqual(v.full)
      expect(v.liveTail?.messageId, `${label}: tail`).toBe(liveTail)
      return v.full
    }
    type PrepareArgs = Omit<
      Parameters<typeof prepareGenerationForChat>[2],
      "requestId" | "model" | "provider"
    >
    const prepare = async (label: string, args: PrepareArgs): Promise<Run> => {
      const run = await owner.run(async (ctx) =>
        prepareGenerationForChat(ctx, await requireOwnedChat(ctx, chatId), {
          requestId: `request_${++request}`, model: "gpt-5-mini", provider: "openai", ...args,
        })
      )
      await merged(`${label}: prepared`, run.assistantMessageId)
      return run
    }
    const send = async (id: string) => {
      const { full } = await views(t)
      return {
        expectedVisibleMessageCount: full.length,
        tailMessageId: full.at(-1)?._id,
        latestUserMessage: { id, role: "user" as const, content: id, parts: text(id) },
      }
    }
    /** A real checkpoint: its whole write set must miss history's read set. */
    const checkpoint = async (label: string, run: Run, parts: unknown[]) => {
      const reads: ReadSet = { ids: [], ranges: [] }
      expect((await views(t, reads)).history.liveMessageId, `${label}: bounded`).toBe(run.assistantMessageId)
      const before = await snapshot(t)
      const sequence = (sequences.get(run.runId) ?? 0) + 1
      sequences.set(run.runId, sequence)
      const result = await t.run(async (ctx) =>
        updateAssistantSnapshotForChat(ctx, await runOwner(ctx, run.runId), {
          messageId: run.assistantMessageId, sequence, partsSnapshot: parts,
          textSnapshot: parts.map((p) => (p as { text?: string }).text ?? "").join(""),
        })
      )
      expect(result.kind, label).toBe("applied")
      const written = [...(await snapshot(t))].filter(
        ([id, row]) => JSON.stringify(before.get(id)) !== JSON.stringify(row)
      )
      expect(written.map(([id]) => id).sort(), `${label}: write set`).toEqual(
        [run.assistantMessageId, run.runId].sort()
      )
      for (const [id, row] of written) {
        expect(touches(reads, row), `${label}: ${row.table} written in history's read set`).toBe(false)
        expect(touches(reads, before.get(id)!), `${label}: old ${row.table} in history's read set`).toBe(false)
      }
      await merged(`${label}: checkpoint`, run.assistantMessageId)
    }
    const complete = (run: Run, answer: string) =>
      t.run(async (ctx) =>
        markGenerationRunCompletedForChat(ctx, await runOwner(ctx, run.runId), {
          messageId: run.assistantMessageId, content: answer, parts: text(answer),
        })
      )

    // Two plain sends.
    for (const id of ["u1", "u2"]) {
      const run = await prepare(`send ${id}`, await send(id))
      await checkpoint(`send ${id}`, run, text(`${id} answer`))
      await checkpoint(`send ${id} again`, run, text(`${id} answer, longer`))
      await complete(run, `${id} answer, done`)
      await merged(`send ${id}: completed`)
    }

    // Regenerate the last answer: the live message gains a sibling descriptor.
    let path = await merged("before regenerate")
    const regen = await prepare("regenerate", {
      regeneration: {
        targetAssistantMessageId: path.at(-1)!._id,
        targetAssistantCreatedAt: path.at(-1)!.createdAt,
        expectedChatVersion: path.length,
        precedingUserMessageId: "u2",
      },
    })
    await checkpoint("regenerate", regen, text("regenerated"))
    expect((await views(t)).live?.metadata?.branch?.total).toBe(2)
    // A branch switch mid-stream clears the tail; history reads it all again.
    for (const messageId of [path.at(-1)!._id, regen.assistantMessageId]) {
      await owner.run((ctx) => selectBranchForChat(ctx, { chatId, messageId }))
      await merged("branch switch")
    }
    await complete(regen, "regenerated, done")
    await merged("regenerate: completed")

    // Edit the first question: a mid-path fork.
    path = await merged("before edit")
    const edit = await prepare("edit", {
      edit: {
        editedMessageId: "u1",
        editCutoffTimestamp: path[0]!.createdAt,
        expectedChatVersion: path.length,
        replacementMessage: { id: "u1e", role: "user", content: "u1e", parts: text("u1e") },
      },
    })
    await checkpoint("edit", edit, text("edited answer"))
    await complete(edit, "edited answer, done")
    await merged("edit: completed")

    // Approval pause keeps the tail; the continuation re-stamps the same message.
    const paused = await prepare("approval", await send("u3"))
    const call = { toolCallId: "call_1", toolName: "read_file" }
    const tool = { ...call, type: "dynamic-tool", input: {}, approval: { id: "approval_1" } }
    await checkpoint("approval", paused, [...text("Checking. "), { ...tool, state: "approval-requested" }])
    await t.run(async (ctx) =>
      createToolApprovalRequestForChat(ctx, await runOwner(ctx, paused.runId), {
        ...call, assistantMessageId: paused.assistantMessageId,
        source: "mcp", riskClass: "destructive", approvalId: "approval_1",
      })
    )
    await merged("approval pause", paused.assistantMessageId)
    await owner.run(async (ctx) =>
      resolveToolCallDecision(ctx, await requireOwnedToolApproval(ctx, "approval_1"), {}, "approved")
    )
    const continued = await prepare("continuation", {
      approvalResponses: [
        { ...call, messageId: paused.assistantMessageId, approvalId: "approval_1", approved: true },
      ],
    })
    expect(continued.assistantMessageId).toBe(paused.assistantMessageId)
    const output = { ...tool, state: "output-available", output: "ok" }
    await checkpoint("continuation", continued, [...text("Checking. "), output, ...text("Done.")])
    await complete(continued, "Checking. Done.")
    await merged("continuation: completed")

    // Supersede: the old run's late terminal and checkpoint cannot touch the
    // new run's tail.
    const first = await prepare("superseded", await send("u4"))
    await checkpoint("superseded", first, text("partial"))
    const second = await prepare("superseding", await send("u5"))
    await complete(first, "late")
    const late = await t.run(async (ctx) =>
      updateAssistantSnapshotForChat(ctx, await runOwner(ctx, first.runId), {
        messageId: first.assistantMessageId, sequence: 99, textSnapshot: "late", partsSnapshot: text("late"),
      })
    )
    expect(late.kind).toBe("lost")
    await merged("old run's late writes", second.assistantMessageId)
    await checkpoint("superseding", second, text("new answer"))
    await t.run(async (ctx) => stopGenerationRunForChat(ctx, await runOwner(ctx, second.runId)))
    await merged("stopped")
  })

  it("never drops or misplaces the live message on random branch trees", async () => {
    // Seeded sends, regenerations, edits and branch selections, with legacy
    // rows (no branch fields, so an inferred parent) and stale `selected`
    // flags. The tail is resolved as prepare does; then a flag may change
    // after the stamp, which the history self-check must absorb.
    let state = 7
    const random = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const pick = <V,>(values: readonly V[]) => values[Math.floor(random() * values.length)]!
    const stats = { refused: 0, bounded: 0, unbounded: 0 }

    for (let round = 0; round < 120; round++) {
      const t = makeT()
      const { userId, chatId } = await seed(t)
      const result = await t.run(async (ctx) => {
        let order = 0
        const all = () => listMessagesByChatOrder(ctx, chatId)
        const insert = async (role: "user" | "assistant", parentMessageId?: Id<"messages">, legacy = false) => {
          // Deselects the effective sibling group, legacy rows included.
          const context = createBranchContext(await all())
          const siblings = getSiblingMessagesFromContext(context, parentMessageId, role)
          for (const s of siblings) await ctx.db.patch(s._id, { selected: false })
          return ctx.db.insert("messages", {
            chatId, userId, orderId: ++order, role, content: "", parts: text(`${role} ${order}`),
            status: "completed", createdAt: order, updatedAt: order,
            ...(legacy ? {} : { parentMessageId, branchIndex: siblings.length, selected: true }),
          })
        }
        const corrupt = async () =>
          ctx.db.patch(pick(await all())._id, { selected: pick([undefined, true, false] as const) })
        let liveId: Id<"messages"> | undefined
        for (let step = 0, steps = 2 + Math.floor(random() * 6); step < steps; step++) {
          const [chat, viewer] = [await ctx.db.get(chatId), await ctx.db.get(userId)]
          const path = (await getSelectedPathForViewer(ctx, { chat, viewer })).selectedMessages
          // A path message's parent is the message before it.
          const parentOf = (role: "user" | "assistant") => {
            const index = path.indexOf(pick(path.filter((m) => m.role === role)))
            return path[index - 1]
          }
          const kinds = ["send", "send", "regenerate", "edit", "select", "corrupt"] as const
          const kind = path.length === 0 ? "send" : pick(kinds)
          if (kind === "send") {
            liveId = await insert("assistant", await insert("user", path.at(-1)?._id), random() < 0.2)
          } else if (kind === "regenerate") {
            const parent = parentOf("assistant")
            if (parent?.role === "user") liveId = await insert("assistant", parent._id)
          } else if (kind === "edit") {
            liveId = await insert("assistant", await insert("user", parentOf("user")?._id))
          } else if (kind === "select") {
            const target = pick(await all())
            for (const m of await all())
              if (m.parentMessageId === target.parentMessageId && m.role === target.role)
                await ctx.db.patch(m._id, { selected: m._id === target._id })
          } else await corrupt()
        }
        if (!liveId) return null
        const liveTail = resolveLiveTail(await all(), liveId)
        if (liveTail) await ctx.db.patch(chatId, { liveTail })
        const changedAfterStamp = random() < 0.4
        if (changedAfterStamp) await corrupt()
        return { stamped: liveTail !== undefined, changedAfterStamp }
      })
      if (!result) continue
      const v = await views(t)
      expect(v.merged, `round ${round}`).toEqual(v.full)
      if (!result.stamped) stats.refused++
      else if (v.history.liveMessageId) stats.bounded++
      else stats.unbounded++
      if (result.stamped && !result.changedAfterStamp) {
        expect(v.history.liveMessageId, `round ${round}: bounded`).not.toBeNull()
      }
    }
    // Coverage guard: refused stamps, bounded reads and self-check fallbacks.
    expect(stats.refused).toBeGreaterThan(5)
    expect(stats.bounded).toBeGreaterThan(20)
    expect(stats.unbounded).toBeGreaterThan(3)
  })
})
