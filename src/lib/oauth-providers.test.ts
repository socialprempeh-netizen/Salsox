/**
 * Tests for oauth-providers.ts: a provider is offered and registered only
 * when both its credentials are set, so a missing secret can no longer turn
 * the sign-in button into an error page.
 */
import { describe, expect, it } from "vitest"
import { configuredOAuthProviders, isOAuthProviderConfigured, socialProvidersConfig } from "./oauth-providers"

const both = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", GITHUB_CLIENT_ID: "hid", GITHUB_CLIENT_SECRET: "hsecret" }

describe("configuredOAuthProviders", () => {
  it("lists a provider only when both its ID and secret are set", () => {
    expect(configuredOAuthProviders(both)).toEqual(["google", "github"])
    expect(configuredOAuthProviders({ GOOGLE_CLIENT_ID: "gid" })).toEqual([])
    expect(configuredOAuthProviders({ GITHUB_CLIENT_ID: "hid", GITHUB_CLIENT_SECRET: "hsecret" })).toEqual(["github"])
  })

  it("is empty with no credentials, as on production in October 2026", () => {
    expect(configuredOAuthProviders({})).toEqual([])
  })

  it("treats a blank value as unset", () => {
    expect(configuredOAuthProviders({ GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "gsecret" })).toEqual([])
  })
})

describe("isOAuthProviderConfigured", () => {
  it("rejects an unconfigured or unknown provider", () => {
    expect(isOAuthProviderConfigured("google", both)).toBe(true)
    expect(isOAuthProviderConfigured("google", {})).toBe(false)
    expect(isOAuthProviderConfigured("facebook", both)).toBe(false)
  })
})

describe("socialProvidersConfig", () => {
  it("registers only the configured providers, with trimmed credentials", () => {
    expect(socialProvidersConfig({ GITHUB_CLIENT_ID: " hid ", GITHUB_CLIENT_SECRET: "hsecret" })).toEqual({
      github: { clientId: "hid", clientSecret: "hsecret" },
    })
    expect(socialProvidersConfig({})).toEqual({})
  })
})
