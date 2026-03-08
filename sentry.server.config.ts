import * as Sentry from "@sentry/nextjs"
import {
  sentryBeforeBreadcrumb,
  sentryBeforeSend,
  sentryBeforeSendSpan,
} from "./lib/observability/sentry-scrubbing"
import { sentryTracesSampler } from "./lib/observability/sentry-tracing"

const isProduction = process.env.NODE_ENV === "production"
const includeLocalVariables =
  !isProduction || process.env.SENTRY_INCLUDE_LOCAL_VARIABLES === "true"

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampler: sentryTracesSampler,
  includeLocalVariables,
  beforeSend: sentryBeforeSend,
  beforeSendSpan: sentryBeforeSendSpan,
  beforeBreadcrumb: sentryBeforeBreadcrumb,
  // force=true avoids occasional production bundling misses for ai SDK patching.
  integrations: [Sentry.vercelAIIntegration({ force: true })],
})
