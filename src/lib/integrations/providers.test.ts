/**
 * Tests for the HubSpot and Salesforce client rules (hubspot.ts,
 * salesforce.ts): configuration, authorize addresses, reading token answers,
 * the org host check, record ids, and what a write-back does.
 */
import { describe, expect, it } from "vitest"
import { HUBSPOT_DEFAULT_SCOPES, hubspotAuthorizeUrl, hubspotConfig, hubspotTokenBody, integrationCallbackUrl, needsRefresh, readHubSpotTokenInfo, readHubSpotTokens } from "./hubspot"
import {
  isSalesforceInstance,
  MAX_JOB_ATTEMPTS,
  nextAttemptAt,
  normalizeRecordId,
  readSalesforceTokens,
  salesforceAuthorizeUrl,
  salesforceConfig,
  salesforceLoginHost,
  signedFileName,
  taskLinkField,
  writeBackSteps,
  writeBackTask,
} from "./salesforce"

const now = new Date("2026-10-26T12:00:00Z")

describe("HubSpot", () => {
  it("is offered only with both credentials, with default or chosen scopes", () => {
    expect(hubspotConfig({})).toBeNull()
    expect(hubspotConfig({ HUBSPOT_CLIENT_ID: "id" })).toBeNull()
    expect(hubspotConfig({ HUBSPOT_CLIENT_ID: "id", HUBSPOT_CLIENT_SECRET: "s" })).toEqual({ clientId: "id", clientSecret: "s", scopes: HUBSPOT_DEFAULT_SCOPES })
    expect(hubspotConfig({ HUBSPOT_CLIENT_ID: "id", HUBSPOT_CLIENT_SECRET: "s", HUBSPOT_SCOPES: "oauth, files" })?.scopes).toEqual(["oauth", "files"])
  })

  it("sends the person to HubSpot with the app, the callback, the scopes and the state", () => {
    const config = hubspotConfig({ HUBSPOT_CLIENT_ID: "id", HUBSPOT_CLIENT_SECRET: "s" })!
    const redirectUri = integrationCallbackUrl("https://app.example.com/", "hubspot")
    expect(redirectUri).toBe("https://app.example.com/api/integrations/hubspot/callback")
    const url = new URL(hubspotAuthorizeUrl({ config, redirectUri, state: "st" }))
    expect(url.origin + url.pathname).toBe("https://app.hubspot.com/oauth/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: "id", redirect_uri: redirectUri, scope: HUBSPOT_DEFAULT_SCOPES.join(" "), state: "st" })
    expect(hubspotTokenBody({ config, redirectUri, code: "c" }).get("grant_type")).toBe("authorization_code")
    expect(hubspotTokenBody({ config, redirectUri, refreshToken: "r" }).get("refresh_token")).toBe("r")
  })

  it("reads token answers and refreshes a minute early", () => {
    const tokens = readHubSpotTokens({ access_token: "a", refresh_token: "r", expires_in: 1800 }, now)!
    expect(tokens.expiresAt.toISOString()).toBe("2026-10-26T12:29:00.000Z")
    expect(needsRefresh(tokens.expiresAt, new Date("2026-10-26T12:28:59Z"))).toBe(false)
    expect(needsRefresh(tokens.expiresAt, new Date("2026-10-26T12:29:00Z"))).toBe(true)
    expect(readHubSpotTokens({ status: "BAD_AUTH_CODE" }, now)).toBeNull()
    expect(readHubSpotTokenInfo({ hub_id: 62515, hub_domain: "demo.hubspot.com", scopes: ["oauth", 3] })).toEqual({ hubId: "62515", hubDomain: "demo.hubspot.com", scopes: ["oauth"] })
    expect(readHubSpotTokenInfo({})).toBeNull()
  })
})

describe("Salesforce", () => {
  const identity = "https://login.salesforce.com/id/00D5g000004XyZaEAK/0055g00000AbCdEAAZ"

  it("is offered only with both credentials, and signs sandboxes in on test.salesforce.com", () => {
    expect(salesforceConfig({ SALESFORCE_CLIENT_ID: "k" })).toBeNull()
    expect(salesforceLoginHost(false)).toBe("https://login.salesforce.com")
    expect(salesforceLoginHost(true)).toBe("https://test.salesforce.com")
    const url = new URL(salesforceAuthorizeUrl({ config: { clientId: "k", clientSecret: "s" }, sandbox: true, redirectUri: "https://x/cb", state: "st", codeChallenge: "ch" }))
    expect(url.origin).toBe("https://test.salesforce.com")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("scope")).toBe("api refresh_token")
  })

  it("trusts only a Salesforce host as the org's instance", () => {
    expect(isSalesforceInstance("https://acme.my.salesforce.com")).toBe(true)
    expect(isSalesforceInstance("https://acme--dev.sandbox.my.salesforce.com")).toBe(true)
    expect(isSalesforceInstance("https://na1.force.com")).toBe(true)
    expect(isSalesforceInstance("https://evilsalesforce.com")).toBe(false)
    expect(isSalesforceInstance("https://salesforce.com.evil.io")).toBe(false)
    expect(isSalesforceInstance("http://acme.my.salesforce.com")).toBe(false)
    expect(isSalesforceInstance("https://acme.my.salesforce.com:8443")).toBe(false)
  })

  it("reads a token answer with its org id, and refuses one from elsewhere", () => {
    expect(readSalesforceTokens({ access_token: "a", refresh_token: "r", instance_url: "https://acme.my.salesforce.com/", id: identity })).toEqual({
      accessToken: "a",
      refreshToken: "r",
      instanceUrl: "https://acme.my.salesforce.com",
      orgId: "00D5g000004XyZaEAK",
      identityUrl: identity,
    })
    expect(readSalesforceTokens({ access_token: "a", instance_url: "https://attacker.example", id: identity })).toBeNull()
    expect(readSalesforceTokens({ error: "invalid_grant" })).toBeNull()
  })

  it("accepts record ids of 15 or 18 characters, and links a task to people or to records", () => {
    expect(normalizeRecordId(" 0065g00000XyZaBAAV ")).toBe("0065g00000XyZaBAAV")
    expect(normalizeRecordId("0065g00000XyZaB")).toBe("0065g00000XyZaB")
    expect(normalizeRecordId("0065g00000XyZaBAA")).toBeNull()
    expect(normalizeRecordId("006'; DROP")).toBeNull()
    expect(taskLinkField("0035g00000AAAAAAAA")).toBe("WhoId")
    expect(taskLinkField("00Q5g00000AAAAAAAA")).toBe("WhoId")
    expect(taskLinkField("0065g00000AAAAAAAA")).toBe("WhatId")
  })

  it("files the PDF and logs a task on completion, only a task on refusal", () => {
    expect(writeBackSteps("document.completed")).toEqual(["file", "task"])
    expect(writeBackSteps("document.declined")).toEqual(["task"])
    const done = writeBackTask({ event: "document.completed", recordId: "0065g00000AAAAAAAA", title: "Lease", siteName: "Acme Sign", at: now })
    expect(done).toMatchObject({ Subject: "Signed: Lease", Status: "Completed", ActivityDate: "2026-10-26", WhatId: "0065g00000AAAAAAAA" })
    const declined = writeBackTask({ event: "document.declined", recordId: "0035g00000AAAAAAAA", title: "Lease", siteName: "Acme Sign", at: now, declinedBy: { name: "Ama", email: "ama@example.com", reason: "Wrong rent" } })
    expect(declined.WhoId).toBe("0035g00000AAAAAAAA")
    expect(declined.Description).toContain("Ama (ama@example.com) declined")
    expect(declined.Description).toContain("Reason: Wrong rent")
    expect(signedFileName('Q3 / "final"')).toBe("Q3 final (signed).pdf")
  })

  it("backs off, then gives up", () => {
    expect(nextAttemptAt(1, now)?.toISOString()).toBe("2026-10-26T12:01:00.000Z")
    expect(nextAttemptAt(3, now)?.toISOString()).toBe("2026-10-26T12:30:00.000Z")
    expect(nextAttemptAt(7, now)?.toISOString()).toBe("2026-10-27T00:00:00.000Z")
    expect(nextAttemptAt(MAX_JOB_ATTEMPTS, now)).toBeNull()
  })
})
