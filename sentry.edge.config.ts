import * as Sentry from "@sentry/nextjs"
import {
  sentryBeforeBreadcrumb,
  sentryBeforeSend,
  sentryBeforeSendSpan,
} from "./lib/observability/sentry-scrubbing"
import {
  sentryBeforeSendTransaction,
  sentryTracesSampler,
} from "./lib/observability/sentry-tracing"

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampler: sentryTracesSampler,
  beforeSendTransaction: sentryBeforeSendTransaction,
  beforeSend: sentryBeforeSend,
  beforeSendSpan: sentryBeforeSendSpan,
  beforeBreadcrumb: sentryBeforeBreadcrumb,
  integrations: [Sentry.vercelAIIntegration()],
})
