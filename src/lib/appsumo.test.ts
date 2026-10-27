import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import {
  appSumoConfig,
  appSumoSignature,
  appSumoTier,
  licenseChange,
  normalizeLicenseKey,
  readAppSumoEvent,
  readAppSumoLicense,
  readAppSumoAccessToken,
  redeemProblem,
  tierForLicense,
  verifyAppSumoWebhook,
  webhookSuccess,
  SIGNATURE_TOLERANCE_MS,
  type AppSumoEvent,
  type LicenseRow,
} from "./appsumo"

/**
 * The AppSumo licensing rules (appsumo.ts). Payloads are AppSumo's own
 * documented examples (docs.licensing.appsumo.com, Webhooks: Connect), so a
 * change in how they are read shows up here first.
 *
 * The signature example on AppSumo's security page does not reproduce: its
 * hash matches no ordering of its key, timestamp and body, so it is an
 * illustration rather than a test vector. The message is built the way all
 * four of that page's code samples build it (timestamp, then body, HMAC-SHA256,
 * hex), and checked here against an independent computation.
 */

const API_KEY = "c73455d8-0f64-4354-bd64-1f454a227104"
const TIMESTAMP = "1625165884119"
const BODY = '{"license_key":"3794577c-3dbc-11ec-9bbc-0242ac130002","event":"purchase","status":"active","event_timestamp":1318781876406,"test":false}'
const NOW = Number(TIMESTAMP)

const sign = (key: string, ts: string, body: string) => createHmac("sha256", key).update(ts + body).digest("hex")

describe("appSumoConfig", () => {
  it("needs the API key; OAuth only with both client values", () => {
    expect(appSumoConfig({})).toBeNull()
    expect(appSumoConfig({ APPSUMO_API_KEY: "  " })).toBeNull()
    expect(appSumoConfig({ APPSUMO_API_KEY: "k" })).toEqual({ apiKey: "k", oauth: null })
    expect(appSumoConfig({ APPSUMO_API_KEY: "k", APPSUMO_CLIENT_ID: "id" })?.oauth).toBeNull()
    expect(appSumoConfig({ APPSUMO_API_KEY: "k", APPSUMO_CLIENT_ID: "id", APPSUMO_CLIENT_SECRET: "s" })?.oauth).toEqual({ clientId: "id", clientSecret: "s" })
  })
})

describe("verifyAppSumoWebhook", () => {
  const good = { apiKey: API_KEY, timestamp: TIMESTAMP, signature: sign(API_KEY, TIMESTAMP, BODY), rawBody: BODY, now: NOW }

  it("signs timestamp then body, HMAC-SHA256 in hex", () => {
    expect(appSumoSignature(API_KEY, TIMESTAMP, BODY)).toBe(sign(API_KEY, TIMESTAMP, BODY))
    expect(appSumoSignature(API_KEY, TIMESTAMP, BODY)).not.toBe(sign(API_KEY, "", BODY + TIMESTAMP))
  })

  it("accepts a correctly signed, current request", () => {
    expect(verifyAppSumoWebhook(good)).toBe(true)
    expect(verifyAppSumoWebhook({ ...good, signature: good.signature.toUpperCase() })).toBe(true)
  })

  it("refuses a changed body, a wrong key or a missing header", () => {
    expect(verifyAppSumoWebhook({ ...good, rawBody: BODY.replace("purchase", "activate") })).toBe(false)
    expect(verifyAppSumoWebhook({ ...good, apiKey: "another-key" })).toBe(false)
    expect(verifyAppSumoWebhook({ ...good, signature: null })).toBe(false)
    expect(verifyAppSumoWebhook({ ...good, timestamp: null })).toBe(false)
    expect(verifyAppSumoWebhook({ ...good, signature: "abc" })).toBe(false)
  })

  it("refuses a replay outside the tolerance, either side", () => {
    expect(verifyAppSumoWebhook({ ...good, now: NOW + SIGNATURE_TOLERANCE_MS + 1 })).toBe(false)
    expect(verifyAppSumoWebhook({ ...good, now: NOW - SIGNATURE_TOLERANCE_MS - 1 })).toBe(false)
    expect(verifyAppSumoWebhook({ ...good, now: NOW + SIGNATURE_TOLERANCE_MS - 1 })).toBe(true)
  })

  it("reads a timestamp in seconds as seconds", () => {
    const ts = "1625165884"
    expect(verifyAppSumoWebhook({ apiKey: API_KEY, timestamp: ts, signature: sign(API_KEY, ts, BODY), rawBody: BODY, now: NOW })).toBe(true)
  })
})

describe("normalizeLicenseKey", () => {
  it("accepts a UUID in any case and with spaces around it", () => {
    expect(normalizeLicenseKey(" D8BFA201-D8C0-4BC8-A27C-B1C12EFA4A5A ")).toBe("d8bfa201-d8c0-4bc8-a27c-b1c12efa4a5a")
  })
  it("refuses anything else", () => {
    expect(normalizeLicenseKey("d8bfa201d8c04bc8a27cb1c12efa4a5a")).toBeNull()
    expect(normalizeLicenseKey("")).toBeNull()
    expect(normalizeLicenseKey(42)).toBeNull()
  })
})

describe("readAppSumoEvent", () => {
  it("reads AppSumo's upgrade example", () => {
    expect(
      readAppSumoEvent({
        license_key: "c86ad3d7-3942-4d11-8814-b0bd81971691",
        prev_license_key: "3794577c-3dbc-11ec-9bbc-0242ac130002",
        event: "upgrade",
        event_timestamp: 1671586387628,
        created_at: 1671586387624,
        license_status: "inactive",
        tier: 2,
        test: false,
        extra: { reason: "Upgraded by the customer" },
      })
    ).toEqual({
      event: "upgrade",
      licenseKey: "c86ad3d7-3942-4d11-8814-b0bd81971691",
      prevLicenseKey: "3794577c-3dbc-11ec-9bbc-0242ac130002",
      tier: 2,
      eventTimestamp: 1671586387628,
      test: false,
      reason: "Upgraded by the customer",
      parentLicenseKey: null,
    })
  })

  it("takes tier 1 for a purchase that names none, as AppSumo's first example does", () => {
    const e = readAppSumoEvent({ license_key: "3794577c-3dbc-11ec-9bbc-0242ac130002", event: "purchase", license_status: "inactive", event_timestamp: 1318781876406, created_at: 1318738512, test: false })
    expect(e?.tier).toBe(1)
  })

  it("accepts a test request with placeholder data, and refuses a real one without a key", () => {
    expect(readAppSumoEvent({ event: "activate", test: true })?.test).toBe(true)
    expect(readAppSumoEvent({ event: "activate", test: false, event_timestamp: 1 })).toBeNull()
    expect(readAppSumoEvent({ event: "refund", license_key: "3794577c-3dbc-11ec-9bbc-0242ac130002", event_timestamp: 1 })).toBeNull()
    expect(readAppSumoEvent(null)).toBeNull()
  })

  it("marks add-ons by their parent key", () => {
    const e = readAppSumoEvent({ license_key: "9204570c-7832-47e2-8708-efb67d702995", event: "purchase", event_timestamp: 1, tier: 1, parent_license_key: "9869ba65-cf39-405e-98db-6e2ca29f94fa" })
    expect(e?.parentLicenseKey).toBe("9869ba65-cf39-405e-98db-6e2ca29f94fa")
  })
})

describe("licenseChange", () => {
  const event = (over: Partial<AppSumoEvent>): AppSumoEvent => ({
    event: "purchase", licenseKey: "k", prevLicenseKey: null, tier: 1, eventTimestamp: 100, test: false, reason: null, parentLicenseKey: null, ...over,
  })
  const row = (over: Partial<LicenseRow>): LicenseRow => ({ licenseKey: "k", tier: 1, status: "INACTIVE", userId: null, lastEventAt: 50, ...over })

  it("purchase is inactive, activate is active", () => {
    expect(licenseChange(null, event({}))?.status).toBe("INACTIVE")
    expect(licenseChange(row({}), event({ event: "activate", eventTimestamp: 200 }))?.status).toBe("ACTIVE")
  })

  it("a late purchase does not undo an activation", () => {
    expect(licenseChange(row({ status: "ACTIVE", lastEventAt: 90 }), event({ event: "purchase", eventTimestamp: 95 }))?.status).toBe("ACTIVE")
  })

  it("an upgrade is active at once and inherits the account from the old key", () => {
    expect(licenseChange(null, event({ event: "upgrade", tier: 2, prevLicenseKey: "old" }))).toEqual({ status: "ACTIVE", tier: 2, inheritFrom: "old", deactivatedReason: null })
  })

  it("a refund deactivates and keeps the reason", () => {
    expect(licenseChange(row({ status: "ACTIVE", tier: 2 }), event({ event: "deactivate", reason: "Refunded" }))).toEqual({ status: "DEACTIVATED", tier: 2, inheritFrom: null, deactivatedReason: "Refunded" })
  })

  it("ignores events older than the last one applied, add-ons and migrate", () => {
    expect(licenseChange(row({ status: "DEACTIVATED", lastEventAt: 500 }), event({ event: "activate", eventTimestamp: 400 }))).toBeNull()
    expect(licenseChange(null, event({ parentLicenseKey: "p" }))).toBeNull()
    expect(licenseChange(null, event({ event: "migrate" }))).toBeNull()
  })
})

describe("tiers", () => {
  it("tier 1 is Personal, 2 and above Business", () => {
    expect(tierForLicense(1)).toBe("personal")
    expect(tierForLicense(2)).toBe("business")
    expect(tierForLicense(3)).toBe("business")
  })
  it("an account's tier is its highest active license, deactivated ones count for nothing", () => {
    expect(appSumoTier([])).toBeNull()
    expect(appSumoTier([{ tier: 2, status: "DEACTIVATED" }])).toBeNull()
    expect(appSumoTier([{ tier: 2, status: "DEACTIVATED" }, { tier: 1, status: "ACTIVE" }])).toBe("personal")
    expect(appSumoTier([{ tier: 2, status: "ACTIVE" }])).toBe("business")
  })
})

describe("redeemProblem", () => {
  it("lets an account redeem an active, unclaimed key, or one it already holds", () => {
    expect(redeemProblem({ status: "ACTIVE", userId: null }, "u1", null)).toBeNull()
    expect(redeemProblem({ status: "ACTIVE", userId: "u1" }, "u1", null)).toBeNull()
  })
  it("names each refusal", () => {
    expect(redeemProblem(null, "u1", null)).toBe("notFound")
    expect(redeemProblem({ status: "DEACTIVATED", userId: null }, "u1", null)).toBe("deactivated")
    expect(redeemProblem({ status: "INACTIVE", userId: null }, "u1", null)).toBe("notActivated")
    expect(redeemProblem({ status: "ACTIVE", userId: "u2" }, "u1", null)).toBe("takenByOther")
    expect(redeemProblem({ status: "ACTIVE", userId: null }, "u1", "other-key")).toBe("alreadyRedeemed")
  })
})

describe("API answers", () => {
  it("reads the license answers AppSumo documents", () => {
    expect(readAppSumoLicense({ license_key: "d8bfa201-d8c0-4bc8-a27c-b1c12efa4a5a", status: "active", scopes: ["read_license"] })).toEqual({ licenseKey: "d8bfa201-d8c0-4bc8-a27c-b1c12efa4a5a", status: "ACTIVE", tier: null })
    expect(readAppSumoLicense({ license_key: "2191a2c1-01a9-4060-8067-1b466484f21b", status: "inactive", tier: 2 })?.tier).toBe(2)
    expect(readAppSumoLicense({ license_key: "2191a2c1-01a9-4060-8067-1b466484f21b", status: "expired" })).toBeNull()
    expect(readAppSumoLicense({ error: "nope" })).toBeNull()
  })
  it("reads the access token from a token answer", () => {
    expect(readAppSumoAccessToken({ access_token: "82b35f3d810f4cf49dd7a52d4b22a594", token_type: "bearer", error: "" })).toBe("82b35f3d810f4cf49dd7a52d4b22a594")
    expect(readAppSumoAccessToken({ error: "invalid_grant" })).toBeNull()
  })
  it("answers a webhook the way AppSumo's samples do", () => {
    expect(webhookSuccess("activate")).toEqual({ event: "activate", success: true })
  })
})
