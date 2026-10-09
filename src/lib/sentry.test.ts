/**
 * Tests for the Sentry options (sentry.ts): off without a valid DSN, the
 * ingest origin the CSP allows, and signing tokens never leaving in an event.
 */
import { describe, expect, it } from "vitest"
import { scrubEvent, scrubSigningTokens, sentryDsn, sentryEnvironment, sentryIngestOrigin, sentryOptions } from "./sentry"

const DSN = "https://abc123def456@o450000.ingest.us.sentry.io/4500000000000000"
const TOKEN = "V1StGXR8_Z5jdHi6B-myTabcdefghijk"

describe("sentryDsn", () => {
  it("accepts a DSN as Sentry issues it", () => {
    expect(sentryDsn(DSN)).toBe(DSN)
    expect(sentryDsn(`  ${DSN}\n`)).toBe(DSN)
  })

  it("is off when unset, blank or malformed", () => {
    expect(sentryDsn(undefined)).toBeUndefined()
    expect(sentryDsn("")).toBeUndefined()
    expect(sentryDsn("not-a-dsn")).toBeUndefined()
    expect(sentryDsn("http://abc@o1.ingest.sentry.io/1")).toBeUndefined()
  })
})

describe("sentryIngestOrigin", () => {
  it("is the DSN's origin, for connect-src", () => {
    expect(sentryIngestOrigin(DSN)).toBe("https://o450000.ingest.us.sentry.io")
  })

  it("is null when Sentry is off, so the policy names no Sentry host", () => {
    expect(sentryIngestOrigin(undefined)).toBeNull()
    expect(sentryIngestOrigin("nope")).toBeNull()
  })
})

describe("scrubSigningTokens", () => {
  it("removes the token from a signing link, wherever it appears", () => {
    expect(scrubSigningTokens(`https://example.com/sign/${TOKEN}`)).toBe("https://example.com/sign/[token]")
    expect(scrubSigningTokens(`/sign/${TOKEN}/file?x=1`)).toBe("/sign/[token]/file?x=1")
    expect(scrubSigningTokens(`GET /sign/${TOKEN} failed`)).toBe("GET /sign/[token] failed")
  })

  it("leaves other paths alone", () => {
    expect(scrubSigningTokens("/sign-pdf and /signup")).toBe("/sign-pdf and /signup")
  })
})

describe("scrubEvent", () => {
  it("scrubs every string in an event, at any depth", () => {
    const event = {
      request: { url: `https://example.com/sign/${TOKEN}` },
      transaction: `/sign/${TOKEN}`,
      breadcrumbs: [{ data: { url: `/sign/${TOKEN}/file` } }],
      exception: { values: [{ value: `Failed to load /sign/${TOKEN}` }] },
    }
    expect(JSON.stringify(scrubEvent(event))).not.toContain(TOKEN)
    expect(scrubEvent(event).request.url).toBe("https://example.com/sign/[token]")
  })

  it("passes a dropped event through", () => {
    expect(scrubEvent(null)).toBeNull()
  })
})

describe("sentryOptions", () => {
  it("is disabled without a DSN", () => {
    expect(sentryOptions({}).enabled).toBe(false)
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: "" }).dsn).toBeUndefined()
  })

  it("is enabled with one, errors only and without default PII", () => {
    const options = sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN })
    expect(options.enabled).toBe(true)
    expect(options.tracesSampleRate).toBe(0)
    expect(options.sendDefaultPii).toBe(false)
    expect(options.beforeSend({ request: { url: `/sign/${TOKEN}` } })).toEqual({ request: { url: "/sign/[token]" } })
  })

  it("names the deployment environment", () => {
    expect(sentryEnvironment({ NEXT_PUBLIC_VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("preview")
    expect(sentryEnvironment({ NODE_ENV: "production" })).toBe("production")
    expect(sentryEnvironment({})).toBe("development")
  })
})
