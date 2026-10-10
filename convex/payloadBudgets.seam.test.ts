/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SIDEBAR_WINDOW_PAGE_SIZE } from "../lib/chat-store/chats/sidebar-window"
import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"
import { modules } from "./test.setup"

// Payload budgets (ADR-0049): serialized result bytes of the reads every chat
// open and sidebar render subscribes to, over one deterministic realistic
// fixture. Exact bytes are reproducible (fixed clock, counter ids), so a
// change is a real payload change. Fails on any growth (regression) and when
// more than 1% under budget (ratchet: lower it so a win cannot decay).
// Regenerate: run `bunx vitest run convex/payloadBudgets.seam.test.ts` and
// paste the `PAYLOAD_BUDGETS` object printed in the failure.
const PAYLOAD_BUDGETS = {
  selectedPath: 645_851,
  selectedRunStateLive: 175,
  selectedRunStateSettled: 173,
  recentWindowFirstPage: 9_667,
  pinned: 2_334,
}
const RATCHET_TOLERANCE = 0.01

const OWNER = "workos_payload_owner"
const CHAT = "chat-payload-long"
const TURNS = 120
const RECENT_CHATS = 60
const PINNED_CHATS = 6

type PayloadName = keyof typeof PAYLOAD_BUDGETS

const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length

const paragraph = (seed: number, length: number) =>
  `Turn ${seed}: the answer walks through the trade-offs, cites the relevant module, and shows a short example. `
    .repeat(Math.ceil(length / 100))
    .slice(0, length)

function userParts(turn: number) {
  const text = `Question ${turn}: ${paragraph(turn, 220)}`
  return turn % 10 === 0
    ? [
        { type: "text", text },
        {
          type: "file",
          mediaType: "image/png",
          filename: `screenshot-${turn}.png`,
          url: `/api/storage/kg2${String(turn).padStart(29, "0")}`,
        },
      ]
    : [{ type: "text", text }]
}

function assistantParts(turn: number) {
  const tool =
    turn % 4 === 0
      ? [
          {
            type: "dynamic-tool",
            toolName: "web_search",
            toolCallId: `call_${turn}`,
            state: "output-available",
            input: { query: `search ${turn}` },
            output: {
              results: Array.from({ length: 5 }, (_, index) => ({
                title: `Result ${index} for turn ${turn}`,
                url: `https://example.com/${turn}/${index}`,
                snippet: paragraph(turn + index, 280),
              })),
            },
          },
          { type: "step-start" },
        ]
      : []
  return [
    { type: "step-start" },
    { type: "reasoning", text: paragraph(turn, 600), state: "done" },
    ...tool,
    { type: "text", text: paragraph(turn, 1400), state: "done" },
  ]
}

function assistantMetadata(turn: number) {
  return {
    reasoningDurationMs: 1200 + turn,
    workDurationMs: 4200 + turn,
    reasoningEffort: "medium" as const,
    generationStats: {
      timeToFirstTokenMs: 640 + turn,
      outputStreamMs: 3800 + turn,
      outputTokens: 520,
      reasoningTokens: 180,
      inputTokens: 2400 + turn * 12,
      stepCount: turn % 4 === 0 ? 2 : 1,
    },
    ...(turn % 4 === 0
      ? {
          toolMetadataByName: {
            web_search: {
              displayName: "Web search",
              source: "builtin" as const,
              serviceName: "Exa",
              icon: "search" as const,
              readOnly: true,
            },
          },
        }
      : {}),
  }
}

/**
 * 120 turns with reasoning on every answer, a tool call every fourth, an
 * attachment every tenth question, and one regenerated answer (so branch
 * metadata is present). Returns the run that owns the last answer.
 */
async function seedLongChat(t: T, userId: Id<"users">) {
  return t.run(async (ctx) => {
    const chatId = await ctx.db.insert("chats", {
      publicId: CHAT,
      userId,
      title: "A long realistic conversation",
      model: "claude-sonnet-5",
      public: false,
      pinned: false,
      updatedAt: TURNS,
    })
    let parentMessageId: Id<"messages"> | undefined
    let orderId = 0
    for (let turn = 0; turn < TURNS; turn++) {
      const base = { chatId, status: "completed" as const, createdAt: turn }
      const userMessageId: Id<"messages"> = await ctx.db.insert("messages", {
        ...base,
        updatedAt: turn,
        orderId: ++orderId,
        clientMessageId: `user-${turn}`,
        userId,
        role: "user",
        content: `Question ${turn}`,
        parts: userParts(turn),
        parentMessageId,
        branchIndex: 0,
        selected: true,
      })
      const answer = {
        ...base,
        updatedAt: turn,
        role: "assistant" as const,
        content: paragraph(turn, 1400),
        parts: assistantParts(turn),
        model: "claude-sonnet-5",
        provider: "anthropic",
        finishReason: "stop",
        usage: { inputTokens: 2400, outputTokens: 520, totalTokens: 2920 },
        metadata: assistantMetadata(turn),
        parentMessageId: userMessageId,
      }
      if (turn === TURNS / 2) {
        await ctx.db.insert("messages", {
          ...answer,
          orderId: ++orderId,
          branchIndex: 0,
          selected: false,
        })
      }
      parentMessageId = await ctx.db.insert("messages", {
        ...answer,
        orderId: ++orderId,
        branchIndex: turn === TURNS / 2 ? 1 : 0,
        selected: true,
      })
    }
    const assistantMessageId = parentMessageId!
    const runId = await ctx.db.insert("generationRuns", {
      chatId,
      userId,
      requestId: "request_payload",
      model: "claude-sonnet-5",
      provider: "anthropic",
      status: "streaming",
      assistantMessageId,
      activeStreamId: assistantMessageId,
      leaseExpiresAt: 1_800_000_060_000,
      heartbeatAt: 1_800_000_000_000,
      updatedAt: TURNS,
    })
    await ctx.db.patch(chatId, { statusRunId: runId, liveRunStatus: "streaming" })
    return { chatId, runId, assistantMessageId }
  })
}

/** A populated sidebar: a project, pinned chats, and a deep recency window. */
async function seedSidebar(t: T, userId: Id<"users">) {
  await t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      userId,
      name: "Research",
      updatedAt: 1,
      pinned: false,
    })
    for (let index = 0; index < RECENT_CHATS + PINNED_CHATS; index++) {
      const pinned = index < PINNED_CHATS
      await ctx.db.insert("chats", {
        publicId: `chat-sidebar-${index}`,
        userId,
        title: `Sidebar conversation ${index} about a realistic topic`,
        titleSource: "generated",
        model: "gpt-5-mini",
        projectId: index % 7 === 0 ? projectId : undefined,
        public: false,
        pinned,
        pinnedAt: pinned ? index : undefined,
        updatedAt: 1_000 + index,
        lastRunEndedAt: 1_000 + index,
        lastRunStatus: "completed",
        lastReadAt: 1_000 + index,
      })
    }
  })
}

describe("payload budgets (realistic long chat + populated sidebar)", () => {
  beforeEach(() => {
    // Fixed clock: `_creationTime` digits are part of the serialized bytes.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2027-01-15T12:00:00.000Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("keeps every subscribed read within its checked-in budget", async () => {
    const t = makeT()
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        workosUserId: OWNER,
        email: `${OWNER}@example.com`,
        displayName: "Payload Owner",
      })
    )
    const { runId, assistantMessageId } = await seedLongChat(t, userId)
    await seedSidebar(t, userId)
    const owner = t.withIdentity({ subject: OWNER })

    const path = await owner.query(api.messages.getSelectedPath, {
      chatId: CHAT,
    })
    const live = await owner.query(api.messages.getSelectedRunState, {
      chatId: CHAT,
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(runId, {
        status: "completed",
        terminalReason: "completed",
        activeStreamId: undefined,
        leaseExpiresAt: undefined,
        completedAt: TURNS + 1,
      })
      await ctx.db.patch(assistantMessageId, { generationRunId: runId })
    })
    const settled = await owner.query(api.messages.getSelectedRunState, {
      chatId: CHAT,
    })
    const recent = await owner.query(api.chats.getRecentWindowForCurrentUser, {
      paginationOpts: { numItems: SIDEBAR_WINDOW_PAGE_SIZE, cursor: null },
    })
    const pinned = await owner.query(api.chats.getPinnedForCurrentUser, {})

    // Shape guards: a budget only means something over the intended fixture.
    expect(path.selectedMessages).toHaveLength(TURNS * 2)
    expect(live?.status).toBe("streaming")
    expect(settled?.status).toBe("completed")
    expect(recent.page).toHaveLength(SIDEBAR_WINDOW_PAGE_SIZE)
    expect(pinned).toHaveLength(PINNED_CHATS)

    const measured: Record<PayloadName, number> = {
      selectedPath: bytes(path),
      selectedRunStateLive: bytes(live),
      selectedRunStateSettled: bytes(settled),
      recentWindowFirstPage: bytes(recent),
      pinned: bytes(pinned),
    }
    const violations = (Object.keys(PAYLOAD_BUDGETS) as PayloadName[]).flatMap(
      (name) => {
        const budget = PAYLOAD_BUDGETS[name]
        const actual = measured[name]
        if (actual > budget)
          return [`${name}: ${actual} bytes exceeds budget ${budget} (+${actual - budget})`]
        if (actual < budget * (1 - RATCHET_TOLERANCE))
          return [`${name}: ${actual} bytes is well below budget ${budget}; lower the budget to lock in the win`]
        return []
      }
    )
    expect(
      violations,
      `${violations.join("\n")}\nIf intended, set PAYLOAD_BUDGETS = ${JSON.stringify(measured, null, 2)}`
    ).toEqual([])
  })
})
