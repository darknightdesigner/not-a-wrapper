#!/usr/bin/env bun
/**
 * Live check of Convex's two limits on a durable chat, against the DEV
 * deployment only: 16 MiB of reads per function and 1 MiB per document.
 *
 *   1. Document limit: a fresh chat gets one turn whose completion carries a
 *      20-step tool turn of 100 KB results (~2 MiB), sent through the real
 *      worker wire (/chat-turn/worker). Before the message size cap, Convex
 *      rejected that write whole and the answer stayed an empty placeholder.
 *   2. Read limit: a second chat grows by ~840 KB tool turns until its
 *      messages reach --target-mib (default 3), then takes one more send.
 *      Before the read-once prepare, prepareGeneration read the chat ~8 times
 *      and failed once the chat passed ~2 MiB.
 *
 * Every write goes through the app's own entry points (planGenerationInput,
 * prepareGeneration, the worker wire) as the benchmark harness user
 * (PERF_AUTH_EMAIL, a WorkOS test account). The script creates two chats
 * titled "convex-read-limits smoke" and removes both at the end (--keep skips
 * that). It never creates users or reservations: no route receipt means no
 * platform allowance is touched.
 *
 * Run:  bun scripts/convex-read-limits-smoke.ts [--target-mib 3] [--keep]
 * Env:  .env.local — NEXT_PUBLIC_CONVEX_URL, CONVEX_DEPLOYMENT (must be dev:),
 *       CHAT_ADMISSION_SECRET (must match the dev deployment's value),
 *       WORKOS_API_KEY, WORKOS_CLIENT_ID, PERF_AUTH_PASSWORD, PERF_AUTH_EMAIL.
 *       The harness user must have signed in once (bun run agent:login) so its
 *       users row exists.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { parseArgs } from "node:util"
import { getConvexSiteUrl } from "@/app/api/_lib/convex-site-url"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  CANCELLATION_SETTLEMENT_PROTOCOL_VERSION,
  signChatAdmissionProof,
} from "@/convex/lib/chatAdmissionProof"
import { createChatPublicId } from "@/lib/chat-store/identity"
import { WorkOS } from "@workos-inc/node"
import { ConvexHttpClient } from "convex/browser"
import { getConvexSize } from "convex/values"
import { DEFAULT_AGENT_EMAIL } from "./lib/agent-auth"

const MiB = 1024 * 1024
const CHAT_TITLE = "convex-read-limits smoke"
const MODEL = "gpt-5-mini"
const PROVIDER = "openai"
/** ~0.8 MiB per growth turn; bounds the loop at ~50 MiB of messages. */
const MAX_GROWTH_TURNS = 64

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (.env.local)`)
  return value
}

/** Refuses anything but the dev deployment named in CONVEX_DEPLOYMENT. */
function requireDevConvexUrl(): string {
  const deployment = requireEnv("CONVEX_DEPLOYMENT")
  const url = requireEnv("NEXT_PUBLIC_CONVEX_URL")
  const name = deployment.startsWith("dev:") ? deployment.slice(4) : null
  if (!name || new URL(url).hostname !== `${name}.convex.cloud`) {
    throw new Error(
      `Refusing to run: ${url} is not the dev deployment (${deployment})`
    )
  }
  return url
}

function toolTurn(steps: number, outputBytes: number, answer: string) {
  return [
    ...Array.from({ length: steps }, (_, step) => ({
      type: "dynamic-tool",
      toolName: "fetch_page",
      toolCallId: `call_${randomUUID()}`,
      state: "output-available",
      input: { url: `https://example.com/${step}` },
      output: {
        content: [{ type: "text", text: `${step} `.padEnd(outputBytes, "x") }],
      },
    })),
    { type: "text", text: answer },
  ]
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return (
    text.split("\n").find((line) => /limit|too large|Error:/i.test(line)) ??
    text.slice(0, 200)
  ).trim()
}

const mib = (bytes: number) => `${(bytes / MiB).toFixed(2)} MiB`

async function main() {
  const { values } = parseArgs({
    options: {
      "target-mib": { type: "string", default: "3" },
      keep: { type: "boolean", default: false },
    },
  })
  const targetBytes = Number(values["target-mib"]) * MiB
  const convexUrl = requireDevConvexUrl()
  const siteUrl = getConvexSiteUrl()
  const admissionSecret = requireEnv("CHAT_ADMISSION_SECRET")

  const { accessToken } = await new WorkOS(
    requireEnv("WORKOS_API_KEY")
  ).userManagement.authenticateWithPassword({
    clientId: requireEnv("WORKOS_CLIENT_ID"),
    email: process.env.PERF_AUTH_EMAIL ?? DEFAULT_AGENT_EMAIL,
    password: requireEnv("PERF_AUTH_PASSWORD"),
  })
  const client = new ConvexHttpClient(convexUrl)
  client.setAuth(accessToken)
  if (!(await client.query(api.users.getCurrent, {}))) {
    throw new Error("Harness user has no users row; run bun run agent:login")
  }

  const createdChats: string[] = []

  async function createChat() {
    // A bare UUID like the app mints (ADR-0033); CHAT_TITLE marks the rows.
    const firstMessage = { clientMessageId: randomUUID(), text: "seed" }
    const created = await client.mutation(api.chats.createWithFirstTurn, {
      publicId: createChatPublicId(),
      title: CHAT_TITLE,
      message: firstMessage,
      attachmentIds: [],
    })
    createdChats.push(created.chatId)
    // The first user message is persisted; the first prepare claims it.
    return {
      publicId: created.chatId,
      pendingUser: {
        id: firstMessage.clientMessageId,
        text: firstMessage.text,
      },
    }
  }

  async function selectedPath(chatId: string) {
    const path = await client.query(api.messages.getSelectedPath, { chatId })
    const bytes = path.selectedMessages.reduce(
      (sum, message) =>
        sum + getConvexSize(message.content) + getConvexSize(message.parts),
      0
    )
    return { messages: path.selectedMessages, bytes }
  }

  /**
   * One durable turn the way the route runs it: plan, signed prepare, then
   * the worker's completion write of `toolSteps` tool results and an answer.
   */
  async function runTurn(
    chatId: string,
    user: { id: string; text: string },
    answer: { text: string; toolSteps: number; toolOutputBytes: number }
  ) {
    const parts = toolTurn(
      answer.toolSteps,
      answer.toolOutputBytes,
      answer.text
    )
    const before = await selectedPath(chatId)
    const turnArgs = {
      chatId,
      expectedVisibleMessageCount: before.messages.length,
      tailMessageId: before.messages.at(-1)?._id,
      latestUserMessage: {
        id: user.id,
        role: "user" as const,
        content: user.text,
        parts: [{ type: "text", text: user.text }],
      },
    }
    const result = {
      chatBytesBefore: before.bytes,
      prepare: "ok",
      completion: "skipped",
      storedBytes: 0,
      omittedToolOutputs: 0,
      answerIntact: false,
    }

    let prepared: {
      runId: Id<"generationRuns">
      assistantMessageId: Id<"messages">
    }
    const grantSecret = randomBytes(32).toString("hex")
    try {
      const plan = await client.query(
        api.chatRuntime.planGenerationInput,
        turnArgs
      )
      const proof = {
        chatId,
        requestId: `read-limits-${randomUUID()}`,
        model: MODEL,
        provider: PROVIDER,
        grantDigest: createHash("sha256").update(grantSecret).digest("hex"),
        generationInputHash: plan.inputHash,
        cancellationSettlementVersion: CANCELLATION_SETTLEMENT_PROTOCOL_VERSION,
      }
      const issuedAt = Date.now()
      prepared = await client.mutation(api.chatRuntime.prepareGeneration, {
        ...turnArgs,
        ...proof,
        admissionIssuedAt: issuedAt,
        admissionProof: signChatAdmissionProof(
          { ...proof, issuedAt },
          admissionSecret
        ),
      })
    } catch (error) {
      result.prepare = `FAILED: ${firstLine(error)}`
      return result
    }

    const response = await fetch(`${siteUrl}/chat-turn/worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grantSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        op: "markGenerationRunCompleted",
        args: {
          runId: prepared.runId,
          messageId: prepared.assistantMessageId,
          content: answer.text,
          parts,
          titleUsage: "not-run",
        },
      }),
    })
    result.completion = `${response.status}`

    const after = await selectedPath(chatId)
    const stored = after.messages.find(
      (message) => message._id === prepared.assistantMessageId
    )
    const storedParts: unknown[] = Array.isArray(stored?.parts)
      ? stored.parts
      : []
    result.storedBytes = stored
      ? getConvexSize(stored.content) + getConvexSize(stored.parts)
      : 0
    result.omittedToolOutputs = storedParts.filter((part) =>
      JSON.stringify(part).includes('"_truncated":true')
    ).length
    // Field order is not preserved in storage, so compare the answer text.
    const answerPart = storedParts.at(-1)
    result.answerIntact =
      typeof answerPart === "object" &&
      answerPart !== null &&
      "text" in answerPart &&
      answerPart.text === answer.text
    return result
  }

  try {
    console.log("1. Document limit: one 20-step turn of 100 KB tool results")
    const small = await createChat()
    console.table([
      await runTurn(small.publicId, small.pendingUser, {
        text: "document-limit answer",
        toolSteps: 20,
        toolOutputBytes: 100_000,
      }),
    ])

    console.log(`2. Read limit: grow a chat to ${mib(targetBytes)}, then send`)
    const long = await createChat()
    const rows = []
    let user = long.pendingUser
    // ~840 KB answers: under the cap and under 1 MiB on either build.
    for (let turn = 1; turn <= MAX_GROWTH_TURNS; turn++) {
      const row = await runTurn(long.publicId, user, {
        text: `heavy answer ${turn}`,
        toolSteps: 8,
        toolOutputBytes: 105_000,
      })
      rows.push({ turn, ...row, chatBytesBefore: mib(row.chatBytesBefore) })
      user = { id: randomUUID(), text: `question ${turn + 1}` }
      if (row.prepare !== "ok" || row.completion !== "200") break
      if ((await selectedPath(long.publicId)).bytes >= targetBytes) {
        const last = await runTurn(long.publicId, user, {
          text: "light answer",
          toolSteps: 0,
          toolOutputBytes: 0,
        })
        rows.push({
          turn: turn + 1,
          ...last,
          chatBytesBefore: mib(last.chatBytesBefore),
        })
        break
      }
    }
    console.table(rows)
  } finally {
    if (values.keep) {
      console.log(`Kept chats: ${createdChats.join(", ")}`)
    } else {
      for (const chatId of createdChats) {
        await client.mutation(api.chats.remove, { chatId })
      }
      console.log(
        `Removed ${createdChats.length} chats (physical drain is async)`
      )
    }
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
