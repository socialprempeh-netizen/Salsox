/**
 * Google helpers: the key is parsed without ever being echoed, the search
 * window ends where final data does, and Search Console is paged until a
 * short page (fetch is stubbed; no network).
 */
import { generateKeyPairSync } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchSearchRows, jwtAssertion, parseServiceAccountKey, searchWindow } from "./google"

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
const encode = (json: object) => Buffer.from(JSON.stringify(json)).toString("base64")

describe("parseServiceAccountKey", () => {
  it("reads a service account key from base64", () => {
    expect(parseServiceAccountKey(encode({ client_email: "bot@p.iam.gserviceaccount.com", private_key: privateKey }))).toEqual({
      clientEmail: "bot@p.iam.gserviceaccount.com",
      privateKey,
      tokenUri: "https://oauth2.googleapis.com/token",
    })
  })

  it("returns null for anything else", () => {
    expect(parseServiceAccountKey(undefined)).toBeNull()
    expect(parseServiceAccountKey("not base64 json")).toBeNull()
    expect(parseServiceAccountKey(encode({ client_email: "nope", private_key: privateKey }))).toBeNull()
  })
})

describe("jwtAssertion", () => {
  it("signs a claim set for the requested scope", () => {
    const key = parseServiceAccountKey(encode({ client_email: "bot@p.iam", private_key: privateKey }))!
    const [, claims] = jwtAssertion(key, "scope-x", Date.UTC(2026, 9, 20)).split(".")
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({ iss: "bot@p.iam", scope: "scope-x", exp: Date.UTC(2026, 9, 20) / 1000 + 3600 })
  })
})

describe("searchWindow", () => {
  it("covers the given days, ending three days ago", () => {
    expect(searchWindow(new Date("2026-10-20T12:00:00Z"), 90)).toEqual({ startDate: "2026-07-20", endDate: "2026-10-17" })
  })
})

describe("fetchSearchRows", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("pages through results and maps keys to query and page", async () => {
    const key = parseServiceAccountKey(encode({ client_email: "pager@p.iam", private_key: privateKey }))!
    const bodies: unknown[] = []
    const full = Array.from({ length: 25_000 }, (_, i) => ({ keys: [`q${i}`, "https://s.test/a"], clicks: 0, impressions: 1, position: 12 }))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 })
        bodies.push(JSON.parse(String(init.body)))
        return Response.json({ rows: bodies.length === 1 ? full : [{ keys: ["last", "https://s.test/b"], clicks: 1, impressions: 5, position: 20 }] })
      })
    )
    const rows = await fetchSearchRows({ key, siteUrl: "https://s.test/", startDate: "2026-07-20", endDate: "2026-10-17" })
    expect(rows).toHaveLength(25_001)
    expect(rows.at(-1)).toEqual({ query: "last", page: "https://s.test/b", clicks: 1, impressions: 5, position: 20 })
    expect(bodies).toMatchObject([
      { dimensions: ["query", "page"], type: "web", dataState: "final", rowLimit: 25_000, startRow: 0 },
      { startRow: 25_000 },
    ])
  })

  it("reports Google's error without the key", async () => {
    const key = parseServiceAccountKey(encode({ client_email: "err@p.iam", private_key: privateKey }))!
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("oauth2") ? Response.json({ access_token: "t" }) : Response.json({ error: { message: "User does not have sufficient permission" } }, { status: 403 })))
    )
    await expect(fetchSearchRows({ key, siteUrl: "https://s.test/", startDate: "a", endDate: "b" })).rejects.toThrow("Search Console answered 403: User does not have sufficient permission")
  })
})
