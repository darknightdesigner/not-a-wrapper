import { z } from 'zod'

// -- Tool Input Schema (what the LLM fills in) ----------------

export const shippingAddressSchema = z.object({
  name: z
    .string()
    .optional()
    .describe('Full name of the recipient. If omitted, defaults to the signed-in user\'s name.'),
  line1: z.string().describe('Street address line 1'),
  line2: z.string().optional().describe('Street address line 2 (apt, suite, floor)'),
  city: z.string().describe('City'),
  state: z.string().describe('State or province code (e.g., NY, CA)'),
  postalCode: z.string().describe('Postal/ZIP code'),
  country: z.string().default('US').describe('ISO country code (default: US)'),
})

export const payClawToolInputSchema = z.object({
  url: z.string().url().describe(
    'The vendor URL. If this is a specific product page, a direct buy is created. ' +
      'If this is a vendor homepage/origin, combine with `product` for an indirect buy.'
  ),
  maxSpend: z.number().int().positive().describe(
    'Maximum spend in cents (e.g., 1500 = $15.00). Flowglad Pay will ensure ' +
      'the agent stays within this budget.'
  ),
  product: z.string().optional().describe(
    'Product search description. When provided with a vendor origin URL, triggers ' +
      'indirect buy mode where the agent searches for the product.'
  ),
  shippingAddress: shippingAddressSchema.optional().describe(
    'Shipping address for physical products. Required when the product needs delivery. ' +
      'Extract all fields from the user message. Use 2-letter state codes and ISO country codes.'
  ),
})

// -- API Response Schemas --------------------------------------

export const createJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal('created'),
})

export const jobStatusValues = [
  'created',
  'retry',
  'active',
  'completed',
  'failed',
  'cancelled',
] as const

export const jobStatusSchema = z.enum(jobStatusValues)

export const jobResultSchema = z
  .object({
    success: z.boolean(),
    credentials: z.string().optional(),
    productObtained: z.string().optional(),
    cardUsed: z.string().optional(),
    error: z.string().optional(),
    skillsUsed: z.array(z.string()),
  })
  .nullable()
  .optional()

export const jobSchema = z.object({
  id: z.string(),
  status: jobStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  vendorUrl: z.string(),
  vendorName: z.string(),
  product: z.string().optional(),
  maxSpend: z.number(),
  result: jobResultSchema,
})

// -- Event Type Enum -------------------------------------------
// Source: PayClaw Events API Reference (engineer-provided, Feb 17 2026)

export const eventTypeValues = [
  'job.started',
  'job.progress',
  'job.completed',
  'job.failed',
  'card.issued',
  'page.navigated',
  'form.submitted',
  'payment.completed',
  'email.received',
  'verification.completed',
  'credentials.extracted',
] as const

export const eventTypeSchema = z.enum(eventTypeValues)

// -- Job Event Schema ------------------------------------------
// Note: `data` is optional - some events (payment.completed,
// email.received, verification.completed) only have type/message/timestamp.
// The `message` field contains well-formatted natural language - display directly.

export const jobEventSchema = z.object({
  type: z.string().min(1),
  message: z.string(),
  timestamp: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
})

// -- Events List Response (GET /api/v1/jobs/:id/events) --------

export const eventsListResponseSchema = z.object({
  events: z.array(jobEventSchema),
})

// -- SSE Stream Done Event (event: done) -----------------------
// Sent when job reaches terminal state (completed, failed, cancelled)

export const sseStreamDoneSchema = z.object({
  status: jobStatusSchema,
  result: jobResultSchema,
})

// -- API Error Schema ------------------------------------------

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
})

// -- Inferred Types --------------------------------------------

export type PayClawToolInput = z.infer<typeof payClawToolInputSchema>
export type ShippingAddress = z.infer<typeof shippingAddressSchema>
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>
export type JobStatus = z.infer<typeof jobStatusSchema>
export type Job = z.infer<typeof jobSchema>
export type EventType = z.infer<typeof eventTypeSchema>
export type JobEvent = z.infer<typeof jobEventSchema>
export type EventsListResponse = z.infer<typeof eventsListResponseSchema>
export type SseStreamDone = z.infer<typeof sseStreamDoneSchema>
export type ApiError = z.infer<typeof apiErrorSchema>
