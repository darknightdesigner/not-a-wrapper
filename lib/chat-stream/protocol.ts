import { DURABLE_MESSAGE_STATUSES } from "@/lib/chat-messages/durable-contract"
import { validateTypes } from "@ai-sdk/provider-utils"
import { uiMessageChunkSchema, validateUIMessages } from "ai"
import { z } from "zod"

const presentationFields = z.object({
  content: z.string().optional(),
  createdAt: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .optional(),
  status: z.enum(DURABLE_MESSAGE_STATUSES).optional(),
})

export const retainedChatStreamCursorSchema = z
  .string()
  .max(64)
  .regex(/^\d+-\d+$/)

/** Idle readers send a heartbeat once this long passes without a frame. */
export const RETAINED_STREAM_HEARTBEAT_MS = 2_500
/** Silence this long, several missed heartbeats, means a dead connection. */
export const RETAINED_STREAM_STALL_MS = 10_000

/** Orders Redis Stream entry ids (`<ms>-<sequence>`). */
export function compareRetainedCursors(left: string, right: string) {
  const [leftTime, leftSequence] = left.split("-").map(BigInt)
  const [rightTime, rightSequence] = right.split("-").map(BigInt)
  return leftTime === rightTime
    ? leftSequence < rightSequence
      ? -1
      : leftSequence > rightSequence
        ? 1
        : 0
    : leftTime < rightTime
      ? -1
      : 1
}

// SDK schemas are asynchronous. Consume frames with parseAsync, in wire order.
export const retainedChatStreamFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("selection"),
    runId: z.string(),
    assistantMessageId: z.string(),
    messages: z.array(z.unknown()).transform(async (values) => {
      const messages = await validateUIMessages({ messages: values })
      return messages.map((message, index) => ({
        ...presentationFields.parse(values[index]),
        ...message,
      }))
    }),
  }),
  z.object({
    type: z.literal("base"),
    message: z
      .unknown()
      .optional()
      .transform(async (value) => {
        if (value === undefined) return undefined
        const [message] = await validateUIMessages({ messages: [value] })
        return message
      }),
    highWater: retainedChatStreamCursorSchema,
  }),
  z.object({
    type: z.literal("chunk"),
    id: retainedChatStreamCursorSchema,
    chunk: z
      .unknown()
      .transform((value) =>
        validateTypes({ value, schema: uiMessageChunkSchema })
      ),
  }),
  z.object({ type: z.literal("caught-up") }),
  z.object({ type: z.literal("heartbeat") }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("unavailable") }),
])

export type RetainedChatStreamFrame = z.infer<
  typeof retainedChatStreamFrameSchema
>
