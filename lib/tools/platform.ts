import { tool } from "ai"
import type { ToolSet } from "ai"
import { z } from "zod"
import type { ToolMetadata } from "./types"
import { getPayClawConfig } from "@/lib/payclaw/config"
import { payClawToolInputSchema, type ShippingAddress } from "@/lib/payclaw/schemas"
import { PayClawApiError, createJob, getJob, getJobEvents } from "@/lib/payclaw/client"

export async function getPlatformTools(options?: {
  userName?: string
  defaultShippingAddress?: ShippingAddress
  defaultCardId?: string
}): Promise<{
  tools: ToolSet
  metadata: Map<string, ToolMetadata>
}> {
  const tools: Record<string, unknown> = {}
  const metadata = new Map<string, ToolMetadata>()

  const config = getPayClawConfig()
  if (!config) {
    return { tools: tools as ToolSet, metadata }
  }

  tools.flowglad_pay_buy = tool({
    description:
      "Buy a product or provision a service account using Flowglad Pay. " +
      "Provide the vendor URL and maximum spend in cents. " +
      "The agent will navigate the vendor site, handle checkout, " +
      "and return credentials or order confirmation." +
      "\n\nBudget rules:\n" +
      "- maxSpend is in cents (e.g. 1500 = $15.00) with ZERO tolerance for overages.\n" +
      "- The virtual card is hard-capped at maxSpend — if tax + shipping pushes the total over, the card is DECLINED.\n" +
      "- For physical products, ALWAYS pad maxSpend by 20–30% above the listed price to cover tax and shipping.\n" +
      "  Example: product listed at $14.99 → set maxSpend to at least 2200 (i.e. $22.00).\n" +
      "\n\nShipping address rules:\n" +
      "- Required for physical products. If missing, the job fails partway through checkout (not upfront).\n" +
      "- Use the user's stored shipping address when available; otherwise extract it from the user message.\n" +
      "- ALWAYS extract phone number and email when the user provides them — many checkouts fail without both.\n" +
      "\n\nWhen to call this tool:\n" +
      "- The user asks to buy, purchase, order, or subscribe to something.\n" +
      "- Do NOT call this tool to check on an existing job — use flowglad_pay_status instead.\n" +
      "- Do NOT re-create a job for the same URL if a previous flowglad_pay_buy result already exists in this conversation, unless the user explicitly asks for a new purchase.",
    inputSchema: payClawToolInputSchema,
    execute: async (input) => {
      const startMs = Date.now()
      try {
        const resolvedInput = { ...input }

        if (!resolvedInput.shippingAddress && options?.defaultShippingAddress) {
          resolvedInput.shippingAddress = {
            ...options.defaultShippingAddress,
            name: options.defaultShippingAddress.name || options?.userName || "Recipient",
          }
        }

        if (resolvedInput.shippingAddress && !resolvedInput.shippingAddress.name) {
          resolvedInput.shippingAddress = {
            ...resolvedInput.shippingAddress,
            name: options?.userName || "Recipient",
          }
        }

        if (!resolvedInput.paymentMethod && options?.defaultCardId) {
          resolvedInput.paymentMethod = { type: 'brex', cardId: options.defaultCardId }
        }

        const hasPaymentMethod = resolvedInput.paymentMethod || config.defaultCardId
        if (!hasPaymentMethod) {
          return {
            ok: false,
            data: null,
            error: "No payment method available. Add a default card in settings or configure PAYCLAW_CARD_ID.",
            meta: { tool: "Flowglad Pay", source: "platform", durationMs: Date.now() - startMs },
          }
        }

        const isLikelyPhysical = resolvedInput.shippingAddress !== undefined
        if (isLikelyPhysical) {
          const addr = resolvedInput.shippingAddress!
          if (!addr.phone) {
            return {
              ok: false,
              data: null,
              error:
                "Shipping address is missing a phone number, which most vendor checkouts require. " +
                "Ask the user for their phone number and include it in the shippingAddress.",
              meta: { tool: "Flowglad Pay", source: "platform", durationMs: Date.now() - startMs },
            }
          }
          if (!addr.email) {
            console.warn("[tools/platform] Shipping address missing email — some checkouts may require it")
          }
        }

        const result = await createJob(resolvedInput, config)
        return {
          ok: true,
          data: {
            jobId: result.jobId,
            status: result.status,
            message:
              `Provisioning job created for ${input.url}. ` +
              `Job ID: ${result.jobId}. The purchase agent is now working on this ` +
              "and it typically takes 2–8 minutes to complete. " +
              "Report this job ID and status to the user. " +
              "Do NOT poll flowglad_pay_status repeatedly — ask the user to " +
              "send a follow-up message when they want a status update.",
          },
          error: null,
          meta: {
            tool: "Flowglad Pay",
            source: "platform",
            durationMs: Date.now() - startMs,
          },
        }
      } catch (err) {
        console.error(
          `[tools/platform] Flowglad Pay failed after ${Date.now() - startMs}ms:`,
          err instanceof Error ? err.message : String(err)
        )
        throw err
      }
    },
  })

  tools.flowglad_pay_status = tool({
    description:
      "Check the status of a Flowglad Pay purchase job. Returns current status, " +
      "latest progress message, and result if completed. Use this instead of creating " +
      "a new job when the user asks to check status." +
      "\n\nIMPORTANT polling rules:\n" +
      "- Call this tool AT MOST ONCE per user message.\n" +
      "- If the job is still active (isTerminal: false), do NOT call again. " +
      "Tell the user the job is in progress and suggest they ask again in 1–2 minutes.\n" +
      "- Only poll again when the user sends a new message asking for a status update.",
    inputSchema: z.object({
      jobId: z
        .string()
        .describe(
          "The job ID returned by flowglad_pay_buy. Use this to check status of an existing purchase job."
        ),
    }),
    execute: async (input) => {
      const startMs = Date.now()
      try {
        const eventsPromise = getJobEvents(input.jobId, config)
          .then((events) => ({ events, degraded: false as const }))
          .catch((err) => {
            if (err instanceof PayClawApiError) {
              throw err
            }

            console.warn("[tools/platform] Flowglad Pay events could not be parsed; falling back to job status", {
              jobId: input.jobId,
              errorName: err instanceof Error ? err.name : "UnknownError",
            })

            return { events: [] as Awaited<ReturnType<typeof getJobEvents>>, degraded: true as const }
          })

        const [job, eventsResult] = await Promise.all([
          getJob(input.jobId, config),
          eventsPromise,
        ])
        const events = eventsResult.events
        const latestMessage =
          events.length > 0
            ? events[events.length - 1]?.message ?? "Waiting for updates..."
            : eventsResult.degraded
              ? "Status is available, but event details are temporarily unavailable."
              : "Waiting for updates..."
        const isTerminal =
          job.status === "completed" ||
          job.status === "failed" ||
          job.status === "cancelled"

        return {
          ok: true,
          data: {
            jobId: input.jobId,
            status: job.status,
            latestMessage,
            isTerminal,
            eventCount: events.length,
            result: job.result,
          },
          error: null,
          meta: {
            tool: "Flowglad Pay",
            source: "platform",
            durationMs: Date.now() - startMs,
          },
          ...(!isTerminal && {
            hint:
              "Job is still running. Do NOT call flowglad_pay_status again this turn. " +
              "Tell the user the current status and ask them to check back in 1–2 minutes.",
          }),
        }
      } catch (err) {
        console.error(
          `[tools/platform] Flowglad Pay failed after ${Date.now() - startMs}ms:`,
          err instanceof Error ? err.message : String(err)
        )
        throw err
      }
    },
  })

  metadata.set("flowglad_pay_buy", {
    displayName: "Flowglad Pay",
    source: "third-party",
    serviceName: "Flowglad Pay",
    icon: "wrench",
    readOnly: false,
  })

  metadata.set("flowglad_pay_status", {
    displayName: "Flowglad Pay Status",
    source: "third-party",
    serviceName: "Flowglad Pay",
    icon: "wrench",
    readOnly: true,
  })

  return { tools: tools as ToolSet, metadata }
}
