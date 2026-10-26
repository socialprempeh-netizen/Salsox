/**
 * The OAuth server's grants against a real database (store.ts). The unit
 * tests cover the rules; these check what the conditional writes do with
 * real rows: a code works once and a replay revokes what it produced, two
 * simultaneous exchanges of one code produce one token set, a rotated
 * refresh token used again ends the grant, and revoking from the Developers
 * page stops the tokens at once.
 *
 * Run like the engine's database tests, only when asked:
 * `ESIGN_DB_TESTS=1 npx vitest run src/lib/oauth-server/store.db.test.ts`.
 * Every row they make hangs off one user, deleted at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { config } from "dotenv"

const enabled = process.env.ESIGN_DB_TESTS === "1"

describe.skipIf(!enabled)("OAuth server grants (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let store: typeof import("./store")
  let rules: typeof import("./rules")
  let userId: string
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
  const client = { id: "db-test-client", secret: "x".repeat(40), name: "Test", redirectUris: ["https://client.example/cb"] }
  const request = () => ({ client, redirectUri: "https://client.example/cb", scopes: ["documents:read" as const, "templates:read" as const], state: null, codeChallenge: challenge })

  beforeAll(async () => {
    config({ path: ".env.local" })
    config({ path: ".env" })
    prisma = (await import("@/lib/prisma")).prisma
    store = await import("./store")
    rules = await import("./rules")
    const user = await prisma.user.create({ data: { name: "OAuth Test", email: `oauth-${randomUUID()}@example.com` } })
    userId = user.id
  })

  afterAll(async () => {
    const grants = await prisma.oAuthGrant.findMany({ where: { userId }, select: { id: true } })
    await prisma.oAuthCode.deleteMany({ where: { userId } })
    await prisma.oAuthToken.deleteMany({ where: { grantId: { in: grants.map((g) => g.id) } } })
    await prisma.oAuthGrant.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it("exchanges a code once, with its verifier, for tokens that carry the scopes", async () => {
    const code = await store.issueCode(userId, request())
    expect(await store.exchangeCode({ code, client, redirectUri: "https://client.example/cb", verifier: `${verifier}x` })).toMatchObject({ error: "invalid_grant" })
    const tokens = await store.exchangeCode({ code, client, redirectUri: "https://client.example/cb", verifier })
    expect("access_token" in tokens && rules.isToken("access", tokens.access_token)).toBe(true)
    if (!("access_token" in tokens)) return
    expect(tokens.scope).toBe("documents:read templates:read")
    const caller = await store.authenticateOAuthToken(tokens.access_token)
    expect(caller).toMatchObject({ userId, scopes: ["documents:read", "templates:read"] })
    // Nothing is stored in clear.
    expect(await prisma.oAuthToken.count({ where: { hash: tokens.access_token } })).toBe(0)
  })

  it("revokes what a code produced when the code is replayed", async () => {
    const code = await store.issueCode(userId, request())
    const first = await store.exchangeCode({ code, client, redirectUri: "https://client.example/cb", verifier })
    if (!("access_token" in first)) throw new Error("first exchange failed")
    expect(await store.exchangeCode({ code, client, redirectUri: "https://client.example/cb", verifier })).toMatchObject({ error: "invalid_grant" })
    expect(await store.authenticateOAuthToken(first.access_token)).toBeNull()
  })

  it("gives two simultaneous exchanges of one code one token set", async () => {
    const code = await store.issueCode(userId, request())
    const results = await Promise.all([1, 2].map(() => store.exchangeCode({ code, client, redirectUri: "https://client.example/cb", verifier })))
    expect(results.filter((r) => "access_token" in r)).toHaveLength(1)
  })

  it("rotates refresh tokens, and ends the grant when an old one is used again", async () => {
    const code = await store.issueCode(userId, request())
    const first = await store.exchangeCode({ code, client, redirectUri: "https://client.example/cb", verifier })
    if (!("access_token" in first)) throw new Error("exchange failed")
    const second = await store.refreshGrant({ refreshToken: first.refresh_token, client })
    if (!("access_token" in second)) throw new Error("refresh failed")
    expect(second.refresh_token).not.toBe(first.refresh_token)
    // The rotation ends the old access token, and the new one works.
    expect(await store.authenticateOAuthToken(first.access_token)).toBeNull()
    expect(await store.authenticateOAuthToken(second.access_token)).not.toBeNull()
    // The old refresh token again: a copy exists, so everything stops.
    expect(await store.refreshGrant({ refreshToken: first.refresh_token, client })).toMatchObject({ error: "invalid_grant" })
    expect(await store.authenticateOAuthToken(second.access_token)).toBeNull()
    expect(await store.refreshGrant({ refreshToken: second.refresh_token, client })).toMatchObject({ error: "invalid_grant" })
  })

  it("stops a connected app's tokens when the person disconnects it", async () => {
    const code = await store.issueCode(userId, request())
    const tokens = await store.exchangeCode({ code, client, redirectUri: "https://client.example/cb", verifier })
    if (!("access_token" in tokens)) throw new Error("exchange failed")
    const grants = await store.listGrants(userId)
    expect(grants.length).toBeGreaterThan(0)
    const grant = await prisma.oAuthToken.findUnique({ where: { hash: rules.hashToken(tokens.access_token) }, select: { grantId: true } })
    expect(await store.revokeGrant(userId, grant!.grantId)).toBe(true)
    expect(await store.authenticateOAuthToken(tokens.access_token)).toBeNull()
    expect(await store.revokeGrant(userId, grant!.grantId)).toBe(false)
  })
})
