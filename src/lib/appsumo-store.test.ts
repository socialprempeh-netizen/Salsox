import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The AppSumo OAuth code exchange (exchangeAppSumoCode in appsumo-store.ts),
 * against a stubbed fetch: the request is exactly what AppSumo's docs show
 * (a JSON POST to /openid/token/ with the client values, the code, the
 * registered redirect URL and the grant type, then a GET of the license with
 * the access token), and every failure logs which step failed without the
 * code, the token or the client values in the line.
 *
 * Written after AppSumo's OAuth test reported "your server never swapped it
 * for a token": the exchange then ran only in the visitor's browser, and its
 * failures returned null without a word.
 */

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/config/site", () => ({ siteConfig: { url: "https://salsox.example", name: "Site" } }))

const { exchangeAppSumoCode } = await import("./appsumo-store")

const original = { ...process.env }
const CODE = "fedcba0987654321fedcba0987654321"
const TOKEN = "82b35f3d810f4cf49dd7a52d4b22a594"
const KEY = "d8bfa201-d8c0-4bc8-a27c-b1c12efa4a5a"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("exchangeAppSumoCode", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let errors: string[]

  beforeEach(() => {
    process.env.APPSUMO_API_KEY = "api-key"
    process.env.APPSUMO_CLIENT_ID = "client-id-value"
    process.env.APPSUMO_CLIENT_SECRET = "client-secret-value"
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    errors = []
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(args.join(" ")))
    vi.spyOn(console, "info").mockImplementation(() => {})
  })
  afterEach(() => {
    process.env = { ...original }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("posts the documented JSON body, then reads the license with the access token", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: TOKEN, token_type: "bearer", expires_in: 3600, refresh_token: "r", id_token: "i", error: "" }))
      .mockResolvedValueOnce(json({ license_key: KEY, status: "active", scopes: ["read_license"] }))

    expect(await exchangeAppSumoCode(CODE)).toBe(KEY)

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe("https://appsumo.com/openid/token/")
    expect(tokenInit.method).toBe("POST")
    expect(tokenInit.headers["content-type"]).toBe("application/json")
    expect(JSON.parse(tokenInit.body)).toEqual({
      client_id: "client-id-value",
      client_secret: "client-secret-value",
      code: CODE,
      redirect_uri: "https://salsox.example/redeem",
      grant_type: "authorization_code",
    })
    expect(fetchMock.mock.calls[1][0]).toBe(`https://appsumo.com/openid/license_key/?access_token=${TOKEN}`)
  })

  it("accepts a code outside the old character set instead of dropping it silently", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: TOKEN })).mockResolvedValueOnce(json({ license_key: KEY, status: "inactive" }))
    expect(await exchangeAppSumoCode("abc+def/ghi=")).toBe(KEY)
  })

  it("logs AppSumo's error code when the exchange is refused, and nothing secret", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400))
    expect(await exchangeAppSumoCode(CODE)).toBeNull()
    expect(errors.join("\n")).toContain("code exchange answered 400, error: invalid_grant")
    for (const secret of [CODE, "client-id-value", "client-secret-value"]) expect(errors.join("\n")).not.toContain(secret)
  })

  it("logs a 200 answer that carries no token, which used to vanish", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "", error: "invalid_client" }))
    expect(await exchangeAppSumoCode(CODE)).toBeNull()
    expect(errors.join("\n")).toContain("without an access token, error: invalid_client")
  })

  it("logs a failed license read without the token", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: TOKEN })).mockResolvedValueOnce(json({ error: "expired" }, 401))
    expect(await exchangeAppSumoCode(CODE)).toBeNull()
    expect(errors.join("\n")).toContain("license read answered 401, error: expired")
    expect(errors.join("\n")).not.toContain(TOKEN)
  })

  it("says so when a code arrives with no OAuth client configured", async () => {
    delete process.env.APPSUMO_CLIENT_SECRET
    expect(await exchangeAppSumoCode(CODE)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(errors.join("\n")).toContain("OAuth client is not configured")
  })
})
