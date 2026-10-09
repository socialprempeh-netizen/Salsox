/**
 * Sentry error tracking, as plain functions: whether it is on, which host the
 * browser reports to, and the options every runtime (browser, Node, edge)
 * starts it with. The init calls live in src/instrumentation-client.ts and
 * src/instrumentation.ts; this file is what they share, and what is tested.
 *
 * Off unless NEXT_PUBLIC_SENTRY_DSN holds a valid DSN, so a clone without a
 * Sentry project sends nothing anywhere.
 *
 * Errors only: no performance tracing and no session replay. Both are billed
 * per event and neither was asked for; turning tracing on is a matter of
 * raising `tracesSampleRate`.
 *
 * Signing links carry their token in the path (/sign/{token}), and the token
 * is the signer's only credential (src/lib/esign/tokens.ts). An error report
 * records the page URL, request URL, breadcrumbs and messages, so every event
 * is scrubbed before it leaves: the token becomes `[token]`. Default PII
 * (IP addresses, cookies, request bodies) is not sent either.
 *
 * No `@sentry/*` import here, so the tests need no SDK.
 */

/** A DSN as Sentry issues it: https://<public key>@<host>/<project id>. */
const DSN = /^https:\/\/[A-Za-z0-9]+@([A-Za-z0-9.-]+)(?::\d+)?\/\d+$/

/** The DSN when it is usable, otherwise undefined (unset, blank, malformed). */
export function sentryDsn(raw: string | undefined): string | undefined {
  const dsn = raw?.trim()
  return dsn && DSN.test(dsn) ? dsn : undefined
}

/**
 * The origin the browser sends events to, for the Content-Security-Policy's
 * connect-src (src/lib/security-headers.ts). Null when Sentry is off, so the
 * policy names no Sentry host at all.
 */
export function sentryIngestOrigin(raw: string | undefined): string | null {
  const dsn = sentryDsn(raw)
  return dsn ? new URL(dsn).origin : null
}

/** Replaces the token in every signing link inside `text`. */
export function scrubSigningTokens(text: string): string {
  return text.replace(/\/sign\/[^/?#\s"'\\]+/g, "/sign/[token]")
}

/**
 * The same, through a whole event or breadcrumb: every string in it, at any
 * depth. Events are plain JSON, so a round trip through JSON is exact; null
 * (a dropped event) passes through.
 */
export function scrubEvent<T>(event: T): T {
  if (event === null || event === undefined) return event
  return JSON.parse(scrubSigningTokens(JSON.stringify(event))) as T
}

/**
 * The deployment an event came from: Vercel's environment (production,
 * preview, development) when there is one, otherwise NODE_ENV.
 */
export function sentryEnvironment(env: Record<string, string | undefined>): string {
  return env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV || env.NODE_ENV || "development"
}

/** The options every runtime's `Sentry.init` receives. */
export function sentryOptions(env: Record<string, string | undefined>) {
  const dsn = sentryDsn(env.NEXT_PUBLIC_SENTRY_DSN)
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: sentryEnvironment(env),
    // Errors only (see the top of this file).
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: <E>(event: E) => scrubEvent(event),
    beforeBreadcrumb: <B>(breadcrumb: B) => scrubEvent(breadcrumb),
  }
}
