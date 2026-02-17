import type { PayClawConfig } from './config'
import {
  apiErrorSchema,
  createJobResponseSchema,
  eventTypeValues,
  eventsListResponseSchema,
  jobSchema,
} from './schemas'
import type { ApiError, CreateJobResponse, Job, JobEvent, PayClawToolInput } from './schemas'

function makeHeaders(config: PayClawConfig): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
  }
}

export class PayClawApiError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, body: ApiError) {
    super(body.error)
    this.name = 'PayClawApiError'
    this.statusCode = statusCode
    this.code = body.code
    this.details = body.details
  }
}

function createErrorBody(statusCode: number, payload: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(payload)
  if (parsed.success) {
    return parsed.data
  }

  return {
    error: `PayClaw request failed with status ${statusCode}`,
    code: 'UNKNOWN_ERROR',
    details: payload,
  }
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  try {
    const text = await res.text()
    if (!text.trim()) {
      return createErrorBody(res.status, null)
    }

    try {
      return createErrorBody(res.status, JSON.parse(text))
    } catch {
      return createErrorBody(res.status, text)
    }
  } catch {
    return createErrorBody(res.status, null)
  }
}

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) {
    return null
  }

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === '\\') {
      isEscaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

function tryParseCreateJobPayload(raw: string): CreateJobResponse | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  const parseCandidate = (candidate: string): CreateJobResponse | null => {
    try {
      return createJobResponseSchema.parse(JSON.parse(candidate))
    } catch {
      return null
    }
  }

  const direct = parseCandidate(trimmed)
  if (direct) {
    return direct
  }

  for (const line of trimmed.split('\n')) {
    const sseMatch = line.match(/^\s*data:\s*(.+)\s*$/)
    if (sseMatch?.[1]) {
      const parsed = parseCandidate(sseMatch[1])
      if (parsed) {
        return parsed
      }
    }
  }

  const balanced = extractBalancedJsonObject(trimmed)
  if (balanced) {
    return parseCandidate(balanced)
  }

  return null
}

async function parseCreateJobResponse(res: Response): Promise<CreateJobResponse> {
  if (!res.body) {
    return createJobResponseSchema.parse(await res.json())
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })

    const parsed = tryParseCreateJobPayload(buffer)
    if (parsed) {
      await reader.cancel().catch(() => undefined)
      return parsed
    }
  }

  buffer += decoder.decode()
  const parsed = tryParseCreateJobPayload(buffer)
  if (parsed) {
    return parsed
  }

  throw new Error('Invalid create job response payload')
}

export async function createJob(
  input: PayClawToolInput,
  config: PayClawConfig,
): Promise<CreateJobResponse> {
  const body = input.product
    ? {
        vendor: new URL(input.url).origin,
        product: input.product,
        userEmail: config.userEmail,
        cardId: config.cardId,
        maxSpend: input.maxSpend,
        ...(input.shippingAddress && { shippingAddress: input.shippingAddress }),
      }
    : {
        url: input.url,
        userEmail: config.userEmail,
        cardId: config.cardId,
        maxSpend: input.maxSpend,
        ...(input.shippingAddress && { shippingAddress: input.shippingAddress }),
      }

  const res = await fetch(`${config.appBaseUrl}/api/v1/jobs`, {
    method: 'POST',
    headers: makeHeaders(config),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new PayClawApiError(res.status, await parseErrorBody(res))
  }

  return parseCreateJobResponse(res)
}

export async function getJob(
  jobId: string,
  config: PayClawConfig,
): Promise<Job> {
  const res = await fetch(`${config.appBaseUrl}/api/v1/jobs/${jobId}`, {
    headers: makeHeaders(config),
  })

  if (!res.ok) {
    throw new PayClawApiError(res.status, await parseErrorBody(res))
  }

  return jobSchema.parse(await res.json())
}

export async function getJobEvents(
  jobId: string,
  config: PayClawConfig,
): Promise<JobEvent[]> {
  const res = await fetch(`${config.appBaseUrl}/api/v1/jobs/${jobId}/events`, {
    headers: makeHeaders(config),
  })

  if (!res.ok) {
    throw new PayClawApiError(res.status, await parseErrorBody(res))
  }

  const payload: unknown = await res.json()
  const parsed = eventsListResponseSchema.safeParse(payload)

  if (!parsed.success) {
    console.error('[payclaw] Invalid /api/v1/jobs/:id/events response shape', {
      jobId,
      issues: parsed.error.issues.slice(0, 5).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })

    throw parsed.error
  }

  const expectedEventTypes = new Set<string>(eventTypeValues)
  const unknownEventTypeDetails = parsed.data.events
    .map((event, index) => ({ index, type: event.type }))
    .filter((entry) => !expectedEventTypes.has(entry.type))

  if (unknownEventTypeDetails.length > 0) {
    console.warn('[payclaw] Unknown event type(s) from /api/v1/jobs/:id/events', {
      jobId,
      unknownTypeCount: unknownEventTypeDetails.length,
      totalEventCount: parsed.data.events.length,
      unknownTypeIndexes: unknownEventTypeDetails.map((entry) => entry.index),
      unknownTypes: [...new Set(unknownEventTypeDetails.map((entry) => entry.type))],
    })
  }

  return parsed.data.events
}

export function getJobEventStreamUrl(
  jobId: string,
  config: PayClawConfig,
): string {
  return `${config.appBaseUrl}/api/v1/jobs/${jobId}/events/stream`
}
