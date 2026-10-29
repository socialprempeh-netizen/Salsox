import { describe, expect, it } from "vitest"
import { MAX_QUERY, parseSearch, xConfigured, xError, xQueries, xSearchCredentials, xText } from "./x"

const answer = (over: Record<string, unknown> = {}) => ({
  data: [{ id: "1900", author_id: "u1", created_at: "2026-10-27T10:00:00.000Z", text: "DocuSign&amp;co raised our renewal &gt; 40%", ...over }],
  includes: { users: [{ id: "u1", username: "kim_ops", name: "Kim" }] },
})

describe("xQueries", () => {
  it("asks for each tool with a pain word, never a repost or the tool's own account", () => {
    const queries = xQueries()
    expect(queries.map((q) => q.competitor.id)).toEqual(["docusign", "pandadoc", "dropbox-sign"])
    const dropbox = queries[2].query
    expect(dropbox).toMatch(/^\("Dropbox Sign" OR HelloSign OR @DropboxSign OR @HelloSign\) \(/)
    expect(dropbox).toContain('"price increase" OR')
    expect(dropbox).toContain("OR limits OR")
    expect(dropbox).toMatch(/-is:retweet -from:DropboxSign -from:HelloSign lang:en$/)
  })

  it("stays within X's query length", () => {
    for (const { query } of xQueries()) expect(query.length).toBeLessThanOrEqual(MAX_QUERY)
  })
})

describe("settings", () => {
  const keys = { X_API_KEY: "k", X_API_KEY_SECRET: "s" }

  it("runs only when switched on and both app keys are set", () => {
    expect(xConfigured({ ...keys, OUTREACH_X: "on" })).toBe(true)
    expect(xConfigured(keys)).toBe(false)
    expect(xConfigured({ X_API_KEY: "k", OUTREACH_X: "on" })).toBe(false)
    expect(xSearchCredentials({ X_API_KEY: " k ", X_API_KEY_SECRET: " s " })).toEqual({ key: "k", secret: "s" })
  })
})

describe("xText", () => {
  it("undoes X's escaping", () => {
    expect(xText("a &amp; b &lt;3 &gt; c ")).toBe("a & b <3 > c")
  })
})

describe("parseSearch", () => {
  it("reads posts with their author's handle and link", () => {
    expect(parseSearch(answer())).toEqual([
      { kind: "post", id: "1900", title: "", text: "DocuSign&co raised our renewal > 40%", author: "kim_ops", url: "https://x.com/kim_ops/status/1900", createdAt: new Date("2026-10-27T10:00:00.000Z") },
    ])
  })

  it("takes a long post's full text", () => {
    expect(parseSearch(answer({ note_tweet: { text: "The whole long post" } }))[0].text).toBe("The whole long post")
  })

  it("drops posts with no known author, no text or a bad id", () => {
    expect(parseSearch(answer({ author_id: "nobody" }))).toEqual([])
    expect(parseSearch(answer({ text: " " }))).toEqual([])
    expect(parseSearch(answer({ id: "x1" }))).toEqual([])
    expect(parseSearch({ meta: { result_count: 0 } })).toEqual([])
    expect(parseSearch(null)).toEqual([])
  })
})

describe("xError", () => {
  it("explains a refusal in plain words, with no credential in it", () => {
    expect(xError(402, JSON.stringify({ detail: "credits depleted", title: "Payment Required" }), [])).toBe("X search failed (HTTP 402: credits depleted) (the X app has no API credits left)")
    expect(xError(401, JSON.stringify({ detail: "bad token tok-123" }), ["tok-123"])).toBe("X search failed (HTTP 401: bad token <setting>)")
    expect(xError(500, "not json", [])).toBe("X search failed (HTTP 500)")
  })
})
