/**
 * Tests for the browser-side signed-in hint (session-hint.ts): it reads the
 * endpoint's answer strictly, asks once per page, and fails closed to
 * "signed out", which is what the static page already shows.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { SESSION_ENDPOINT, fetchSignedIn, isSignedInResponse, resetSessionHint } from "./session-hint"

afterEach(() => resetSessionHint())

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status })

describe("isSignedInResponse", () => {
  it("is true only for a session with a user id", () => {
    expect(isSignedInResponse({ session: { id: "s1" }, user: { id: "u1" } })).toBe(true)
    expect(isSignedInResponse(null)).toBe(false)
    expect(isSignedInResponse({ session: null, user: null })).toBe(false)
    expect(isSignedInResponse({ session: { id: "s1" }, user: { id: "" } })).toBe(false)
    expect(isSignedInResponse("yes")).toBe(false)
  })
})

describe("fetchSignedIn", () => {
  it("asks the session endpoint once and shares the answer", async () => {
    const fetchImpl = vi.fn(json({ session: { id: "s" }, user: { id: "u" } }))
    const [a, b] = await Promise.all([fetchSignedIn(fetchImpl as never), fetchSignedIn(fetchImpl as never)])
    expect([a, b]).toEqual([true, true])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]).toEqual([SESSION_ENDPOINT, expect.objectContaining({ credentials: "same-origin" })])
  })

  it("reads an anonymous visitor as signed out", async () => {
    expect(await fetchSignedIn(json(null) as never)).toBe(false)
  })

  it("fails closed on an error status or a network failure", async () => {
    expect(await fetchSignedIn(json({ error: "x" }, 500) as never)).toBe(false)
    resetSessionHint()
    expect(await fetchSignedIn((async () => { throw new Error("offline") }) as never)).toBe(false)
  })
})
