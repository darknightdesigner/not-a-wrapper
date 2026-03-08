import * as Sentry from "@sentry/nextjs"
import {
  sentryBeforeBreadcrumb,
  sentryBeforeSend,
  sentryBeforeSendSpan,
} from "./lib/observability/sentry-scrubbing"
import { sentryTracesSampler } from "./lib/observability/sentry-tracing"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampler: sentryTracesSampler,
  beforeSend: sentryBeforeSend,
  beforeSendSpan: sentryBeforeSendSpan,
  beforeBreadcrumb: sentryBeforeBreadcrumb,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
