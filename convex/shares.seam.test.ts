/** @vitest-environment edge-runtime */
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { api } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import schema from "./schema"
import { modules } from "./test.setup"

// Share links (ADR-0043) through the registrations the share page and the
// share controls call.

const OWNER = "workos_owner"
const STRANGER = "workos_stranger"
const CHAT = "3f0c9a52-2b8e-4d1a-9f3e-7c6b5a4d3e2f"

const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>

type SeedMessage = Pick<Doc<"messages">, "role" | "content" | "parts"> &
  Partial<Doc<"messages">>

async function seedChat(t: T, messages: SeedMessage[]) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workosUserId: OWNER,
      email: "owner@example.com",
    })
    await ctx.db.insert("users", { workosUserId: STRANGER })
    const chatId = await ctx.db.insert("chats", {
      publicId: CHAT,
      userId,
      title: "Calendar",
      systemPrompt: "SECRET system prompt",
      public: false,
      pinned: false,
      updatedAt: 1,
    })
    for (const [index, message] of messages.entries()) {
      await ctx.db.insert("messages", {
        chatId,
        orderId: index + 1,
        status: "completed",
        createdAt: 1,
        updatedAt: 1,
        ...message,
      })
    }
    return { chatId }
  })
}

const turn = (text: string): SeedMessage[] => [
  { role: "user", content: text, parts: [{ type: "text", text }] },
  {
    role: "assistant",
    content: `Re: ${text}`,
    parts: [{ type: "text", text: `Re: ${text}` }],
  },
]

async function addMessages(t: T, chatId: Id<"chats">, texts: string[]) {
  await t.run(async (ctx) => {
    const orderId = (await ctx.db.query("messages").collect()).length
    for (const [index, text] of texts.entries()) {
      await ctx.db.insert("messages", {
        chatId,
        orderId: orderId + index + 1,
        role: "user",
        content: text,
        parts: [{ type: "text", text }],
        status: "completed",
        createdAt: 1,
        updatedAt: 1,
      })
    }
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe("share links", () => {
  it("serve only the allowlisted view", async () => {
    const t = makeT()
    await seedChat(t, [
      {
        role: "user",
        content: "What is on my calendar?",
        parts: [
          { type: "text", text: "What is on my calendar?" },
          {
            type: "file",
            url: "https://storage.example/SECRET-file",
            mediaType: "image/png",
          },
        ],
      },
      {
        role: "assistant",
        content: "One meeting.",
        requestId: "SECRET-request",
        model: "gpt-5-mini",
        provider: "openai",
        parts: [
          { type: "reasoning", text: "SECRET reasoning" },
          // A private MCP tool: neither its input nor its output crosses.
          {
            type: "dynamic-tool",
            toolName: "calendar_list",
            toolCallId: "call_mcp",
            state: "output-available",
            input: { q: "SECRET tool input" },
            output: {
              results: [{ url: "https://private.example/SECRET", title: "x" }],
            },
          },
          {
            type: "tool-web_search",
            toolCallId: "call_web",
            state: "output-available",
            input: { query: "SECRET query" },
            output: {
              results: [
                {
                  url: "https://news.example/story",
                  title: "Story",
                  content: "SECRET snippet",
                },
              ],
            },
          },
          {
            type: "source-url",
            sourceId: "s1",
            url: "https://cite.example/a",
            title: "Cite",
            providerMetadata: { openai: { id: "SECRET" } },
          },
          { type: "text", text: "One meeting." },
        ],
      },
    ])

    const { shareId } = await t
      .withIdentity({ subject: OWNER })
      .mutation(api.shares.publish, { chatId: CHAT })
    const view = await t.query(api.shares.getPublic, { shareId })

    expect(view).toEqual({
      title: "Calendar",
      createdAt: expect.any(Number),
      messages: [
        { role: "user", text: "What is on my calendar?", sources: [] },
        {
          role: "assistant",
          text: "One meeting.",
          sources: [
            { url: "https://news.example/story", title: "Story" },
            { url: "https://cite.example/a", title: "Cite" },
          ],
        },
      ],
    })
    expect(JSON.stringify(view)).not.toMatch(/SECRET|owner@|workos_|gpt-5/)
  })

  it("snapshot the path and title at share time, 404 on revoke, and a new id on re-share", async () => {
    vi.useFakeTimers()
    const t = makeT()
    const { chatId } = await seedChat(t, turn("first"))
    const owner = t.withIdentity({ subject: OWNER })
    const texts = async (shareId: string) =>
      (await t.query(api.shares.getPublic, { shareId }))?.messages.map(
        (message) => message.text
      ) ?? null

    const title = async (shareId: string) =>
      (await t.query(api.shares.getPublic, { shareId }))?.title

    const { shareId } = await owner.mutation(api.shares.publish, {
      chatId: CHAT,
    })
    await addMessages(t, chatId, ["later private turn"])
    await owner.mutation(api.chats.updateTitle, {
      chatId: CHAT,
      title: "Later private title",
    })
    expect(await texts(shareId)).toEqual(["first", "Re: first"])
    expect(await title(shareId)).toBe("Calendar")

    // Sharing again moves the snapshot forward and keeps the link.
    await expect(
      owner.mutation(api.shares.publish, { chatId: CHAT })
    ).resolves.toEqual({ shareId })
    expect(await texts(shareId)).toEqual([
      "first",
      "Re: first",
      "later private turn",
    ])
    expect(await title(shareId)).toBe("Later private title")

    await owner.mutation(api.shares.revoke, { chatId: CHAT })
    expect(await texts(shareId)).toBeNull()

    const { shareId: nextShareId } = await owner.mutation(api.shares.publish, {
      chatId: CHAT,
    })
    expect(nextShareId).not.toBe(shareId)
    expect(await texts(shareId)).toBeNull()

    // Chat deletion removes the link in the tombstone commit.
    await owner.mutation(api.chats.remove, { chatId: CHAT })
    expect(await texts(nextShareId)).toBeNull()
    await expect(
      t.run((ctx) => ctx.db.query("chatShares").collect())
    ).resolves.toEqual([])
  })

  it("never open the chat's private id to anyone but the owner", async () => {
    const t = makeT()
    await seedChat(t, turn("private"))
    const owner = t.withIdentity({ subject: OWNER })
    await owner.mutation(api.shares.publish, { chatId: CHAT })

    for (const viewer of [t.withIdentity({ subject: STRANGER }), t]) {
      await expect(
        viewer.query(api.chats.getById, { chatId: CHAT })
      ).resolves.toBeNull()
      await expect(
        viewer.query(api.messages.getSelectedPath, { chatId: CHAT })
      ).resolves.toMatchObject({ selectedMessages: [] })
    }
    await expect(
      owner.query(api.chats.getById, { chatId: CHAT })
    ).resolves.toMatchObject({ publicId: CHAT, public: true })
  })
})
