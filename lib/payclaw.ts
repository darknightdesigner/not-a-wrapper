/**
 * PayClaw API client — zero dependencies, pure TypeScript.
 *
 * ```ts
 * import { createPayclawClient } from './payclaw'
 *
 * const payclaw = createPayclawClient({
 *   endpoint: 'https://app.payclaw.com/api',
 *   apiKey: 'pk_...',
 * })
 *
 * const { jobId } = await payclaw.submitJob({
 *   url: 'https://example.com/pricing',
 *   maxSpend: 1500,
 *   paymentMethod: { type: 'brex', cardId: 'card_...' },
 * })
 *
 * for await (const event of payclaw.streamEvents(jobId)) {
 *   console.log(event.type, event.message)
 * }
 * ```
 *
 * @module
 */

import http from 'node:http'
import https from 'node:https'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayclawClientConfig = {
  /** Base URL of the PayClaw API (e.g. `https://app.payclaw.com/api`). */
  endpoint: string
  /** Per-user API key from the PayClaw dashboard. */
  apiKey: string
}

export type ShippingAddress = {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  /** ISO alpha-2 country code (e.g. `US`). */
  country: string
  phone?: string
  email?: string
}

export type PaymentMethod = {
  type: 'brex'
  cardId: string
}

export type SubmitJobOptions = {
  /** Vendor URL to purchase from (direct buy). */
  url?: string
  /** Vendor origin for product search (indirect buy — use with `product`). */
  vendor?: string
  /** Product search description (indirect buy — use with `vendor`). */
  product?: string
  /** Maximum spend in cents (default: 1500 = $15). */
  maxSpend: number
  paymentMethod: PaymentMethod
  shippingAddress?: ShippingAddress
  browserProvider?: 'local' | 'kernel' | 'anchor' | 'self_hosted'
}

export type SubmitJobResult = {
  jobId: string
  status: string
}

export type JobStatus = 'created' | 'retry' | 'active' | 'completed' | 'failed' | 'cancelled'

export type JobResult = {
  success: boolean
  credentials?: string
  productObtained?: string
  error?: string
  cardUsed?: string
  skillsUsed: string[]
}

export type AgentStep = {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'skill_injection'
  content: string
  timestamp: string
}

export type Job = {
  id: string
  status: JobStatus
  createdAt: string
  startedAt?: string
  completedAt?: string
  vendorUrl: string
  vendorName: string
  vendorId?: string
  vendorSlug?: string
  product?: string
  maxSpend: number
  targetUrl?: string
  shippingAddress?: ShippingAddress
  paymentMethod?: PaymentMethod
  browserProvider?: string
  result?: JobResult
  steps: AgentStep[]
}

export type JobEvent = {
  type: string
  timestamp: string
  message: string
  data?: Record<string, unknown>
}

export type JobDonePayload = {
  status: string
  result?: Record<string, unknown>
}

export type Credential = {
  id: string
  userId: string
  jobId?: string
  vendorName: string
  vendorUrl?: string
  label: string
  metadata?: Record<string, unknown>
  createdAt: string
  accessedAt?: string
  expiresAt?: string
  revokedAt?: string
}

export type CredentialWithValue = Credential & {
  value: string
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PayclawApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'PayclawApiError'
    this.status = status
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type PayclawClient = {
  /** Submit a provisioning job. Returns the job ID. */
  submitJob(options: SubmitJobOptions): Promise<SubmitJobResult>

  /** Get a single job by ID. */
  getJob(jobId: string): Promise<Job>

  /** List recent jobs. */
  listJobs(options?: { limit?: number; status?: JobStatus }): Promise<{ jobs: Job[] }>

  /** Get events for a job (non-streaming). */
  getJobEvents(jobId: string): Promise<{ events: JobEvent[] }>

  /**
   * Stream events for a job via SSE.
   *
   * Yields `JobEvent` objects as they arrive. When the job reaches a terminal
   * state, the iterator completes. The final yield is a synthetic event with
   * `type: 'done'` containing the terminal status in `data.status`.
   *
   * Supports `AbortSignal` for cancellation.
   */
  streamEvents(jobId: string, options?: { signal?: AbortSignal }): AsyncIterable<JobEvent>

  /** List stored credentials. */
  listCredentials(options?: { vendor?: string }): Promise<{ credentials: Credential[] }>

  /** Get a credential by ID (includes plaintext value). */
  getCredential(credentialId: string): Promise<CredentialWithValue>
}

export function createPayclawClient(config: PayclawClientConfig): PayclawClient {
  const endpoint = config.endpoint.replace(/\/$/, '')
  const { apiKey } = config

  // ── HTTP helper ──────────────────────────────────────────────────────

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${endpoint}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    }

    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await fetch(url, init)
    } catch (err) {
      throw new PayclawApiError(err instanceof Error ? err.message : 'Network request failed', 0)
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      if (!response.ok) {
        throw new PayclawApiError(`HTTP ${response.status}`, response.status)
      }
      throw new PayclawApiError('Failed to parse response JSON', response.status)
    }

    if (!response.ok) {
      const errData = (data ?? {}) as { error?: unknown; code?: string }
      const message =
        typeof errData.error === 'string'
          ? errData.error
          : typeof errData.error === 'object' &&
              errData.error !== null &&
              'message' in errData.error
            ? String((errData.error as { message: unknown }).message)
            : `HTTP ${response.status}`
      throw new PayclawApiError(message, response.status, errData.code)
    }

    return data as T
  }

  // ── SSE stream (node:http for real-time delivery) ────────────────────

  function streamEvents(
    jobId: string,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<JobEvent> {
    const streamUrl = new URL(`${endpoint}/v1/jobs/${jobId}/events/stream`)
    const transport = streamUrl.protocol === 'https:' ? https : http

    return {
      [Symbol.asyncIterator]() {
        // Buffered events waiting to be yielded
        const queue: Array<JobEvent | Error | null> = []
        // Resolve function for when the consumer is waiting
        let notify: (() => void) | null = null
        let req: http.ClientRequest | null = null
        let res: http.IncomingMessage | null = null
        let started = false

        function push(item: JobEvent | Error | null) {
          queue.push(item)
          if (notify) {
            const n = notify
            notify = null
            n()
          }
        }

        function startConnection() {
          if (started) return
          started = true

          // Short-circuit if the signal is already aborted
          if (options?.signal?.aborted) {
            push(null)
            return
          }

          req = transport.get(streamUrl, { headers: { 'X-API-Key': apiKey } }, (incoming) => {
            res = incoming

            if (incoming.statusCode !== 200) {
              push(
                new PayclawApiError(
                  `SSE stream returned HTTP ${incoming.statusCode}`,
                  incoming.statusCode ?? 0
                )
              )
              incoming.destroy()
              return
            }

            let buffer = ''
            incoming.setEncoding('utf8')

            incoming.on('data', (chunk: string) => {
              buffer += chunk

              const frames = buffer.split(/\r?\n\r?\n/)
              buffer = frames.pop() ?? ''

              for (const frame of frames) {
                if (!frame.trim()) continue

                // Terminal 'done' event
                if (frame.startsWith('event: done')) {
                  const dataLine = frame.split(/\r?\n/).find((l) => l.startsWith('data: '))
                  if (dataLine) {
                    try {
                      const payload = JSON.parse(dataLine.slice(6)) as JobDonePayload
                      // Yield a synthetic 'done' event so consumers can see the final status
                      push({
                        type: 'done',
                        timestamp: new Date().toISOString(),
                        message: `Job ${payload.status}`,
                        data: { status: payload.status, result: payload.result },
                      })
                    } catch {
                      // Malformed done frame — still terminate
                    }
                  }
                  push(null) // end of stream
                  incoming.destroy()
                  return
                }

                // Regular data frame
                if (frame.startsWith('data: ')) {
                  try {
                    push(JSON.parse(frame.slice(6)) as JobEvent)
                  } catch {
                    // Skip malformed frames
                  }
                }
              }
            })

            incoming.on('end', () => push(null))
            incoming.on('error', (err) => push(err))
          })

          req.on('error', (err) => push(err))

          // AbortSignal support
          options?.signal?.addEventListener(
            'abort',
            () => {
              res?.destroy()
              req?.destroy()
              push(null)
            },
            { once: true }
          )
        }

        return {
          async next(): Promise<IteratorResult<JobEvent>> {
            startConnection()

            while (queue.length === 0) {
              await new Promise<void>((resolve) => {
                notify = resolve
              })
            }

            const item = queue.shift() ?? null

            if (item === null) {
              return { done: true, value: undefined }
            }
            if (item instanceof Error) {
              throw item
            }
            return { done: false, value: item }
          },

          async return(): Promise<IteratorResult<JobEvent>> {
            res?.destroy()
            req?.destroy()
            return { done: true, value: undefined }
          },
        }
      },
    }
  }

  // ── Public API ───────────────────────────────────────────────────────

  return {
    async submitJob(options: SubmitJobOptions): Promise<SubmitJobResult> {
      const body: Record<string, unknown> = {
        maxSpend: options.maxSpend,
        paymentMethod: options.paymentMethod,
      }

      if (options.shippingAddress) body.shippingAddress = options.shippingAddress
      if (options.browserProvider) body.browserProvider = options.browserProvider

      if (options.product && options.vendor) {
        body.vendor = options.vendor
        body.product = options.product
      } else if (options.url) {
        body.url = options.url
      } else {
        throw new PayclawApiError(
          'Either `url` (direct buy) or `vendor` + `product` (indirect buy) is required.',
          0
        )
      }

      return request<SubmitJobResult>('POST', '/v1/jobs', body)
    },

    async getJob(jobId: string): Promise<Job> {
      return request<Job>('GET', `/v1/jobs/${jobId}`)
    },

    async listJobs(options?: { limit?: number; status?: JobStatus }): Promise<{ jobs: Job[] }> {
      const params = new URLSearchParams()
      if (options?.limit) params.set('limit', String(options.limit))
      if (options?.status) params.set('status', options.status)
      const qs = params.toString()
      return request<{ jobs: Job[] }>('GET', `/v1/jobs${qs ? `?${qs}` : ''}`)
    },

    async getJobEvents(jobId: string): Promise<{ events: JobEvent[] }> {
      return request<{ events: JobEvent[] }>('GET', `/v1/jobs/${jobId}/events`)
    },

    streamEvents,

    async listCredentials(options?: { vendor?: string }): Promise<{ credentials: Credential[] }> {
      const params = new URLSearchParams()
      if (options?.vendor) params.set('vendor', options.vendor)
      const qs = params.toString()
      return request<{ credentials: Credential[] }>('GET', `/v1/credentials${qs ? `?${qs}` : ''}`)
    },

    async getCredential(credentialId: string): Promise<CredentialWithValue> {
      return request<CredentialWithValue>('GET', `/v1/credentials/${credentialId}`)
    },
  }
}
