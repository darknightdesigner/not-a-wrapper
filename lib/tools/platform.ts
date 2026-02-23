import { tool } from "ai"
import type { ToolSet } from "ai"
import { z } from "zod"
import type { ToolMetadata } from "./types"
import { getPayClawConfig } from "@/lib/payclaw/config"
import { payClawToolInputSchema, type ShippingAddress } from "@/lib/payclaw/schemas"
import { PayClawApiError, createJob, getJob, getJobEvents } from "@/lib/payclaw/client"
import { enrichToolError, extractAbortSignalFromOptions } from "./utils"
import { extractToolErrorData } from "./errors"

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

  // Request-scoped dedupe cache to reduce duplicate purchase side effects when
  // the model emits identical pay_purchase calls in the same generation.
  const purchaseRequestCache = new Map<string, Promise<{ jobId: string; status: string }>>()

  tools.pay_purchase = tool({
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
      "- Do NOT call this tool to check on an existing job — use pay_status instead.\n" +
      "- Do NOT re-create a job for the same URL if a previous pay_purchase result already exists in this conversation, unless the user explicitly asks for a new purchase.",
    inputSchema: payClawToolInputSchema,
    inputExamples: [
      {
        input: {
          url: "https://example-saas.com/pricing",
          maxSpend: 2500,
          product: "Pro monthly subscription",
        },
      },
      {
        input: {
          url: "https://store.example.com/products/ergonomic-mouse",
          maxSpend: 4800,
          shippingAddress: {
            name: "Alex Rivera",
            line1: "123 Main St",
            city: "San Francisco",
            state: "CA",
            postalCode: "94105",
            country: "US",
            phone: "+1-415-555-0123",
            email: "alex@example.com",
          },
        },
      },
    ],
    execute: async (input, toolOptions) => {
      const startMs = Date.now()
      try {
        const resolvedInput = { ...input }
        const abortSignal = toolOptions
          ? extractAbortSignalFromOptions(toolOptions)
          : undefined

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
          throw enrichToolError(
            new Error("No payment method available. Add a default card in settings or configure PAYCLAW_CARD_ID."),
            "pay_purchase"
          )
        }

        const isLikelyPhysical = resolvedInput.shippingAddress !== undefined
        if (isLikelyPhysical) {
          const addr = resolvedInput.shippingAddress!
          if (!addr.phone) {
            throw enrichToolError(
              new Error(
                "Shipping address is missing a phone number, which most vendor checkouts require. " +
                "Ask the user for their phone number and include it in the shippingAddress."
              ),
              "pay_purchase"
            )
          }
          if (!addr.email) {
            console.warn("[tools/platform] Shipping address missing email — some checkouts may require it")
          }
        }

        const dedupeKey = JSON.stringify({
          url: resolvedInput.url,
          maxSpend: resolvedInput.maxSpend,
          product: resolvedInput.product ?? null,
          shippingAddress: resolvedInput.shippingAddress ?? null,
          paymentMethod: resolvedInput.paymentMethod ?? null,
          browserProvider: resolvedInput.browserProvider ?? null,
        })

        let jobPromise = purchaseRequestCache.get(dedupeKey)
        if (!jobPromise) {
          jobPromise = createJob(resolvedInput, config, { signal: abortSignal })
            .then((result) => ({ jobId: result.jobId, status: result.status }))
            .catch((error) => {
              purchaseRequestCache.delete(dedupeKey)
              throw error
            })
          purchaseRequestCache.set(dedupeKey, jobPromise)
        }

        const result = await jobPromise
        console.log(JSON.stringify({
          _tag: "tool_exec",
          tool: "pay_purchase",
          source: "platform",
          durationMs: Date.now() - startMs,
        }))
        return {
          jobId: result.jobId,
          status: result.status,
          message:
            `Provisioning job created for ${input.url}. ` +
            `Job ID: ${result.jobId}. The purchase agent is now working on this ` +
            "and it typically takes 2–8 minutes to complete. " +
            "Report this job ID and status to the user. " +
            "Do NOT poll pay_status repeatedly — ask the user to " +
            "send a follow-up message when they want a status update.",
        }
      } catch (err) {
        console.error(
          `[tools/platform] Flowglad Pay failed after ${Date.now() - startMs}ms:`,
          err instanceof Error ? err.message : String(err)
        )
        throw enrichToolError(err, "pay_purchase")
      }
    },
  })

  tools.pay_status = tool({
    description:
      "Check the status of a Flowglad Pay purchase job. Returns current status, " +
      "latest progress message, and result if completed. Use this instead of creating " +
      "a new job when the user asks to check status." +
      "\n\nIMPORTANT polling rules:\n" +
      "- Call this tool AT MOST ONCE per user message.\n" +
      "- If the job is still active (isTerminal: false), do NOT call again. " +
      "Tell the user the job is in progress and suggest they ask again in 1–2 minutes.\n" +
      "- Only poll again when the user sends a new message asking for a status update.\n" +
      "- Do NOT call pay_purchase to check status — use this tool instead.",
    inputSchema: z.object({
      jobId: z
        .string()
        .describe(
          "The job ID returned by pay_purchase. Use this to check status of an existing purchase job."
        ),
    }),
    inputExamples: [
      { input: { jobId: "job_abc123xyz" } },
      { input: { jobId: "job_2026_02_23_001" } },
    ],
    execute: async (input, toolOptions) => {
      const startMs = Date.now()
      try {
        const abortSignal = toolOptions
          ? extractAbortSignalFromOptions(toolOptions)
          : undefined

        const eventsPromise = getJobEvents(input.jobId, config, { signal: abortSignal })
          .then((events) => ({ events, degraded: false as const }))
          .catch((err) => {
            if (err instanceof PayClawApiError) {
              throw err
            }
            const errorData = extractToolErrorData(err, { toolName: "pay_status" })
            if (errorData.code === "aborted" || errorData.code === "timeout") {
              throw err
            }

            console.warn("[tools/platform] Flowglad Pay events could not be parsed; falling back to job status", {
              jobId: input.jobId,
              errorName: err instanceof Error ? err.name : "UnknownError",
            })

            return { events: [] as Awaited<ReturnType<typeof getJobEvents>>, degraded: true as const }
          })

        const [job, eventsResult] = await Promise.all([
          getJob(input.jobId, config, { signal: abortSignal }),
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

        console.log(JSON.stringify({
          _tag: "tool_exec",
          tool: "pay_status",
          source: "platform",
          durationMs: Date.now() - startMs,
        }))
        return {
          jobId: input.jobId,
          status: job.status,
          latestMessage,
          isTerminal,
          eventCount: events.length,
          result: job.result,
          ...(!isTerminal && {
            hint:
              "Job is still running. Do NOT call pay_status again this turn. " +
              "Tell the user the current status and ask them to check back in 1–2 minutes.",
          }),
        }
      } catch (err) {
        console.error(
          `[tools/platform] Flowglad Pay failed after ${Date.now() - startMs}ms:`,
          err instanceof Error ? err.message : String(err)
        )
        throw enrichToolError(err, "pay_status")
      }
    },
  })

  metadata.set("pay_purchase", {
    displayName: "Purchase",
    source: "platform",
    serviceName: "Flowglad Pay",
    icon: "wrench",
    readOnly: false,
    destructive: false,
    idempotent: false,
  })

  metadata.set("pay_status", {
    displayName: "Purchase Status",
    source: "platform",
    serviceName: "Flowglad Pay",
    icon: "wrench",
    readOnly: true,
    idempotent: true,
  })

  return { tools: tools as ToolSet, metadata }
}
