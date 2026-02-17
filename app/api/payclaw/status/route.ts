import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getJob, getJobEvents, PayClawApiError } from '@/lib/payclaw/client'
import { getPayClawConfig } from '@/lib/payclaw/config'

const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export async function GET(request: Request) {
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

    return NextResponse.json({
      job,
      events,
      latestMessage,
      isTerminal,
    })
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
