// DEPRECATED: This HTTP route is superseded by the `pay_status` platform tool
// (lib/tools/platform.ts) which is the canonical status path.
// Kept functional for backward compatibility. Do not add new consumers.
// Planned removal: when no external callers remain.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getJob, getJobEvents, PayClawApiError } from '@/lib/payclaw/client'
import { getPayClawConfig } from '@/lib/payclaw/config'

const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export async function GET(request: Request) {
  console.warn(JSON.stringify({
    _tag: "deprecated_route_hit",
    route: "/api/payclaw/status",
    canonical: "pay_status tool (lib/tools/platform.ts)",
    method: "GET",
  }))

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = getPayClawConfig()
    if (!config) {
      return NextResponse.json({ error: 'PayClaw not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    const [job, events] = await Promise.all([getJob(jobId, config), getJobEvents(jobId, config)])
    const latestMessage = events.length > 0 ? events[events.length - 1].message : 'Waiting for updates...'
    const isTerminal = TERMINAL_JOB_STATUSES.has(job.status)

    const response = NextResponse.json({
      job,
      events,
      latestMessage,
      isTerminal,
    })

    response.headers.set("Deprecation", "true")
    response.headers.set("Link", '</docs/pay_status>; rel="successor-version"')

    return response
  } catch (error) {
    if (error instanceof PayClawApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      )
    }

    console.error('Error in payclaw status GET API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
