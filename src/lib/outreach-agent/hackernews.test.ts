import { describe, expect, it } from "vitest"
import { hnSearchTerms, hnText, parseHits } from "./hackernews"

const comment = (over: Record<string, unknown> = {}) => ({ _tags: ["comment", "author_kim", "story_1"], objectID: "42", author: "kim", comment_text: "DocuSign&#x27;s renewal doubled.<p>We left.", story_title: "Ask HN: E-sign tools?", created_at_i: 1_790_000_000, ...over })
const story = (over: Record<string, unknown> = {}) => ({ _tags: ["story", "author_sam", "story_7"], objectID: "7", author: "sam", title: "Ask HN: Leaving PandaDoc", story_text: "Too &quot;pricey&quot;", created_at_i: 1_790_000_000, ...over })

describe("hnText", () => {
  it("turns HN's comment HTML into the text a reader sees", () => {
    expect(hnText('It&#x27;s <i>far</i> too much &amp; <a href="https://x.com">x.com</a><p>Second &#47; para')).toBe("It's far too much & x.com\n\nSecond / para")
  })

  it("leaves unknown entities alone", () => {
    expect(hnText("a &bogus; b")).toBe("a &bogus; b")
  })
})

describe("parseHits", () => {
  it("reads comments and stories, with HN item links", () => {
    expect(parseHits({ hits: [comment(), story()] })).toEqual([
      { kind: "comment", id: "42", title: "Ask HN: E-sign tools?", text: "DocuSign's renewal doubled.\n\nWe left.", author: "kim", url: "https://news.ycombinator.com/item?id=42", createdAt: new Date(1_790_000_000_000) },
      { kind: "post", id: "7", title: "Ask HN: Leaving PandaDoc", text: 'Too "pricey"', author: "sam", url: "https://news.ycombinator.com/item?id=7", createdAt: new Date(1_790_000_000_000) },
    ])
  })

  it("drops hits with no author, no text, a bad id or another type", () => {
    const hits = [comment({ author: null }), comment({ comment_text: "" }), comment({ objectID: "x1" }), story({ title: "" }), { ...story(), _tags: ["poll"] }]
    expect(parseHits({ hits })).toEqual([])
    expect(parseHits(null)).toEqual([])
  })

  it("drops link-only stories and Show HN launches, but not their comments", () => {
    const hits = [story({ story_text: null, title: "OpenSign: a free DocuSign alternative" }), story({ title: "Show HN: Free alternative to DocuSign" }), comment({ story_title: "Show HN: Free alternative to DocuSign" })]
    expect(parseHits({ hits }).map((i) => i.kind)).toEqual(["comment"])
  })
})

describe("hnSearchTerms", () => {
  it("searches Dropbox Sign under its old name too", () => {
    expect(hnSearchTerms()).toEqual(["DocuSign", "PandaDoc", "Dropbox Sign", "HelloSign"])
  })
})
