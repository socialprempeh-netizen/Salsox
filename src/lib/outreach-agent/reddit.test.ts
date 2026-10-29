import { describe, expect, it } from "vitest"
import { multireddit, parseComments, parseListing, parseThread, redditConfigured } from "./reddit"

const post = (data: Record<string, unknown>) => ({ kind: "t3", data: { id: "abc", title: "Leaving DocuSign", selftext: "Too pricey", author: "sam", permalink: "/r/smallbusiness/comments/abc/x/", created_utc: 1_790_000_000, ...data } })
const comment = (data: Record<string, unknown>) => ({ kind: "t1", data: { id: "c1", body: "DocuSign doubled our renewal", author: "kim", permalink: "/r/smallbusiness/comments/abc/x/c1/", link_title: "E-sign tools?", created_utc: 1_790_000_000, replies: "", ...data } })
const listing = (children: unknown[]) => ({ kind: "Listing", data: { children } })

describe("parseListing", () => {
  it("reads posts into leads-to-be", () => {
    const [p] = parseListing(listing([post({})]))
    expect(p).toEqual({ kind: "post", id: "abc", title: "Leaving DocuSign", text: "Too pricey", author: "sam", url: "https://www.reddit.com/r/smallbusiness/comments/abc/x/", createdAt: new Date(1_790_000_000_000) })
  })

  it("drops deleted authors, removed posts, bots and non-posts", () => {
    const children = [post({ author: "[deleted]" }), post({ selftext: "[removed]" }), post({ author: "AutoModerator" }), { kind: "t1", data: {} }, post({ id: "ok" })]
    expect(parseListing(listing(children)).map((p) => p.id)).toEqual(["ok"])
  })

  it("returns nothing for an unexpected shape", () => {
    expect(parseListing(null)).toEqual([])
    expect(parseListing({ data: {} })).toEqual([])
  })
})

describe("parseComments", () => {
  it("reads a subreddit's comment feed, with each thread's title", () => {
    const [c] = parseComments(listing([comment({})]))
    expect(c).toEqual({ kind: "comment", id: "t1_c1", title: "E-sign tools?", text: "DocuSign doubled our renewal", author: "kim", url: "https://www.reddit.com/r/smallbusiness/comments/abc/x/c1/", createdAt: new Date(1_790_000_000_000) })
  })

  it("walks replies, even under a dropped parent", () => {
    const tree = listing([comment({ id: "gone", body: "[removed]", replies: listing([comment({ id: "reply" })]) })])
    expect(parseComments(tree).map((c) => c.id)).toEqual(["t1_reply"])
  })

  it("drops moderators, bots, deleted and empty comments", () => {
    const children = [comment({ distinguished: "moderator" }), comment({ author: "AutoModerator" }), comment({ body: "[deleted]" }), comment({ body: "  " }), { kind: "more", data: {} }]
    expect(parseComments(listing(children))).toEqual([])
  })
})

describe("parseThread", () => {
  it("reads the comment half of a /comments answer, under the post's title", () => {
    const answer = [listing([post({})]), listing([comment({ link_title: undefined })])]
    expect(parseThread(answer, "Leaving DocuSign").map((c) => c.title)).toEqual(["Leaving DocuSign"])
    expect(parseThread({}, "x")).toEqual([])
  })
})

describe("multireddit", () => {
  it("joins valid community names and drops anything else", () => {
    expect(multireddit(["smallbusiness", "r/freelance", "no spaces", "../x"])).toBe("smallbusiness+freelance")
  })
})

describe("redditConfigured", () => {
  it("needs both the client id and secret", () => {
    expect(redditConfigured({ REDDIT_CLIENT_ID: "a" })).toBe(false)
    expect(redditConfigured({ REDDIT_CLIENT_ID: "a", REDDIT_CLIENT_SECRET: "b" })).toBe(true)
  })
})
