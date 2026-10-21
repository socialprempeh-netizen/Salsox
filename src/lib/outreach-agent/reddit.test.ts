import { describe, expect, it } from "vitest"
import { parseListing, redditConfigured } from "./reddit"

const post = (data: Record<string, unknown>) => ({ kind: "t3", data: { id: "abc", title: "Leaving DocuSign", selftext: "Too pricey", author: "sam", permalink: "/r/smallbusiness/comments/abc/x/", created_utc: 1_790_000_000, ...data } })

describe("parseListing", () => {
  it("reads posts into leads-to-be", () => {
    const [p] = parseListing({ data: { children: [post({})] } })
    expect(p).toEqual({ id: "abc", title: "Leaving DocuSign", text: "Too pricey", author: "sam", url: "https://www.reddit.com/r/smallbusiness/comments/abc/x/", createdAt: new Date(1_790_000_000_000) })
  })

  it("drops deleted authors, removed posts and non-posts", () => {
    const listing = { data: { children: [post({ author: "[deleted]" }), post({ selftext: "[removed]" }), { kind: "t1", data: {} }, post({ id: "ok" })] } }
    expect(parseListing(listing).map((p) => p.id)).toEqual(["ok"])
  })

  it("returns nothing for an unexpected shape", () => {
    expect(parseListing(null)).toEqual([])
    expect(parseListing({ data: {} })).toEqual([])
  })
})

describe("redditConfigured", () => {
  it("needs both the client id and secret", () => {
    expect(redditConfigured({ REDDIT_CLIENT_ID: "a" })).toBe(false)
    expect(redditConfigured({ REDDIT_CLIENT_ID: "a", REDDIT_CLIENT_SECRET: "b" })).toBe(true)
  })
})
