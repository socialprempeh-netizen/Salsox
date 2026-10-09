/**
 * Runs once when the server starts, before it serves anything.
 *
 * A misconfigured deployment should announce itself here, in the boot logs,
 * rather than three days later when the first customer tries to pay. The check
 * is skipped on the edge runtime, which has no access to the server-only
 * variables in the first place.
 *
 * Sentry starts here too, on both runtimes (Node for pages, actions and route
 * handlers; edge for anything that opts into it), with the options shared
 * with the browser (src/lib/sentry.ts). It is off without
 * NEXT_PUBLIC_SENTRY_DSN. `onRequestError` hands Sentry every error Next
 * catches while rendering or handling a request on the server: server
 * components, server actions, route handlers and the proxy.
 */
import * as Sentry from "@sentry/nextjs"
import { sentryOptions } from "@/lib/sentry"

export async function register() {
  // Started first, so an error in the checks below is reported as well.
  Sentry.init(sentryOptions(process.env))

  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { validateEnv } = await import("@/lib/env")
  validateEnv()
}

export const onRequestError = Sentry.captureRequestError
