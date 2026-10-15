/**
 * Tests for posthog-config.ts: PostHog stays off unless it is configured
 * properly, and page addresses reach it without tokens or free text.
 */
import { describe, expect, it } from "vitest"
import { DEFAULT_POSTHOG_HOST, posthogConfig, scrubUrl } from "./posthog-config"

const key = "phc_abcdefghijklmnopqrstuvwxyz0123456789ABCD"

describe("posthogConfig", () => {
  it("is off without a key, or with something that is not a project key", () => {
    expect(posthogConfig({})).toBeNull()
    expect(posthogConfig({ NEXT_PUBLIC_POSTHOG_KEY: "  " })).toBeNull()
    expect(posthogConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phx_personal_api_key_0123456789abcdef" })).toBeNull()
  })

  it("defaults to the US cloud host", () => {
    expect(posthogConfig({ NEXT_PUBLIC_POSTHOG_KEY: key })).toEqual({ key, host: DEFAULT_POSTHOG_HOST })
  })

  it("takes another https origin, such as the EU cloud", () => {
    expect(posthogConfig({ NEXT_PUBLIC_POSTHOG_KEY: key, NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com/" })?.host).toBe("https://eu.i.posthog.com")
  })

  it("refuses a host that is not a plain https origin, rather than opening the CSP to it", () => {
    for (const host of ["http://eu.i.posthog.com", "https://eu.i.posthog.com/ingest", "not a url", "https://u:p@eu.i.posthog.com"]) {
      expect(posthogConfig({ NEXT_PUBLIC_POSTHOG_KEY: key, NEXT_PUBLIC_POSTHOG_HOST: host }), host).toBeNull()
    }
  })
})

describe("scrubUrl", () => {
  it("keeps the campaign tags that measure outreach", () => {
    expect(scrubUrl("https://app.example/?utm_source=reddit&utm_medium=social&utm_campaign=launch")).toBe(
      "https://app.example/?utm_source=reddit&utm_medium=social&utm_campaign=launch"
    )
  })

  it("drops every other query parameter, tokens included", () => {
    expect(scrubUrl("https://app.example/reset-password?token=secret&utm_source=dm")).toBe("https://app.example/reset-password?utm_source=dm")
    expect(scrubUrl("https://app.example/dashboard?q=Kofi%20Mensah")).toBe("https://app.example/dashboard")
  })

  it("replaces a signing token in the path", () => {
    expect(scrubUrl("https://app.example/sign/abc123/download?x=1")).toBe("https://app.example/sign/[token]/download")
  })

  it("drops the fragment, and returns nothing for something that is not a URL", () => {
    expect(scrubUrl("https://app.example/pricing#plans")).toBe("https://app.example/pricing")
    expect(scrubUrl("not a url")).toBe("")
  })
})
