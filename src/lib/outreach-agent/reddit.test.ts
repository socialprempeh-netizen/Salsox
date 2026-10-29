import { describe, expect, it } from "vitest"
import { multireddit, parseComments, parseListing, parseThread, redditCandidates, redditConfigured, type RedditPost } from "./reddit"

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

describe("redditCandidates", () => {
  const item = (over: Partial<RedditPost>): RedditPost => ({ kind: "comment", id: "t1_x", title: "Contract tools?", text: "", author: "a", url: "u", createdAt: new Date(1_000), ...over })

  it("keeps posts naming one tool, and comments with a pain point naming one", () => {
    const items = [
      item({ kind: "post", id: "p1", title: "Leaving PandaDoc", text: "", createdAt: new Date(3_000) }),
      item({ id: "t1_a", text: "Dropbox Sign raised our pricing again", createdAt: new Date(2_000) }),
      item({ id: "t1_b", text: "We love DocuSign" }),
      item({ id: "t1_c", text: "their pricing is absurd", title: "Anyone else leaving DocuSign?" }),
      item({ id: "t1_d", text: "Adobe Sign cancelled on us" }),
    ]
    expect(redditCandidates(items, { max: 10 }).map(({ item, competitor }) => `${item.id}:${competitor.id}`)).toEqual(["p1:pandadoc", "t1_a:dropbox-sign", "t1_c:docusign"])
  })

  it("skips what is known and keeps the newest", () => {
    const items = [item({ id: "t1_old", text: "DocuSign pricing", createdAt: new Date(1) }), item({ id: "t1_new", text: "DocuSign pricing", createdAt: new Date(2) }), item({ id: "t1_seen", text: "DocuSign pricing", createdAt: new Date(3) })]
    expect(redditCandidates(items, { max: 1, known: (_, i) => i.id === "t1_seen" }).map(({ item }) => item.id)).toEqual(["t1_new"])
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
