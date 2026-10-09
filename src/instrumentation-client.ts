/**
 * Runs in the browser before the app becomes interactive (Next's
 * instrumentation-client convention): starts Sentry there, so an error thrown
 * while hydrating is reported too, not only the ones after a lazy load.
 *
 * Off unless NEXT_PUBLIC_SENTRY_DSN is set (src/lib/sentry.ts). Each variable
 * is read by its full name: Next inlines `process.env.NEXT_PUBLIC_...` into
 * browser code only when it is written out like this, never through
 * `process.env` passed as a whole.
 *
 * Uncaught errors and unhandled rejections are reported by the SDK's own
 * handlers; errors React catches in an error boundary are reported by the
 * boundary (src/components/error-view.tsx), since React does not rethrow them.
 */
import * as Sentry from "@sentry/nextjs"
import { sentryOptions } from "@/lib/sentry"

Sentry.init(
  sentryOptions({
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  })
)
